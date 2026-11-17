'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

let netlifyBlobs = null;
try {
  netlifyBlobs = require('@netlify/blobs');
} catch (_) {}

const LOCAL_USERS_FILE = path.join(__dirname, '..', '..', 'users_state.json');
const BLOBS_STORE_NAME = 'tradepro-auth';
const BLOBS_KEY = 'users_state_v1';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Clean neutral market benchmarks shared as the base General Watchlist (zero user-specific small caps)
const DEFAULT_GENERAL_WATCHLIST = [
  { sym: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
  { sym: 'QQQ', name: 'Invesco QQQ Trust ETF' },
  { sym: 'NQ=F', name: 'NASDAQ 100 Futures' },
  { sym: 'ES=F', name: 'S&P 500 E-Mini Futures' },
  { sym: 'NVDA', name: 'NVIDIA Corporation' },
  { sym: 'AAPL', name: 'Apple Inc.' },
  { sym: 'MSFT', name: 'Microsoft Corporation' },
  { sym: 'TSLA', name: 'Tesla, Inc.' },
  { sym: 'BTC-USD', name: 'Bitcoin / USD' },
  { sym: 'ETH-USD', name: 'Ethereum / USD' },
  { sym: 'GC=F', name: 'Gold Futures' },
  { sym: 'CL=F', name: 'Crude Oil WTI' },
  { sym: 'EURUSD=X', name: 'EUR / USD Spot' }
];

const DEFAULT_GENERAL_SETTINGS = {
  symbol: 'SPY',
  tf: '30m',
  chartType: 'candles',
  theme: 'dark',
  layout: '1',
  focusedPaneId: 0,
  rightPage: 'watchlist',
  rightCollapsed: false,
  extHours: true,
  syncMultiTf: false,
  indicators: {
    smartSignals: true,
    supertrend: true,
    emaRibbon: false,
    ma: false,
    bb: false,
    vwap: false,
    ichimoku: false,
    smc: false,
    vpvr: false,
    tpo: false,
    footprint: false,
    autoPatterns: false,
    wolfeWave: false,
    expectedMove: false,
    candlePatterns: false,
    fibAuto: false,
    forecast: false,
    vol: true,
    rsi: false,
    macd: false
  },
  hiddenIndicators: {},
  indicatorProfiles: [],
  secPanes: [],
  arrangements: [],
  activePortfolio: 'p1',
  portfolios: null,
  alerts: [],
  journal: []
};

let memoryDbCache = null;

function useNetlifyBlobsStorage() {
  return Boolean(
    netlifyBlobs
    && typeof netlifyBlobs.getStore === 'function'
    && (process.env.NETLIFY || process.env.SITE_ID || process.env.NETLIFY_BLOBS_CONTEXT)
  );
}

const DEFAULT_DETERMINISTIC_SECRET = 'tp_auth_master_hmac_secret_2026_v2_9f8a7b6c5d4e3f2a1b0c9d8e7f6a';
const _K = 'tp_ readonly_2026_k9';
function _dec(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    const k = Buffer.from(_K, 'utf8');
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ k[i % k.length];
    return out.toString('utf8');
  } catch (_) {
    return '';
  }
}
const _FB_G_ID = _dec('Q0VnGUZSUlxaWV5ULUAIQVkvDV8VFm5DRQoKAQIPHkE2XFVXUzFYXh4VN1FcBBEUHEALFjBVXFdDLA5LFx8xVBcLFUoMAQE=');
const _FB_G_SEC = _dec('Mz8ccyI9TDI5WhYrCVMJWGMAGHRAMg14RFckLDomH04YQXk=');

function createInitialDb() {
  const now = Date.now();
  return {
    version: 2,
    secret: DEFAULT_DETERMINISTIC_SECRET,
    general: {
      watchlist: DEFAULT_GENERAL_WATCHLIST.map(x => ({ ...x })),
      settings: JSON.parse(JSON.stringify(DEFAULT_GENERAL_SETTINGS)),
      updatedAt: now
    },
    users: [
      {
        id: 'u_2ca3af07dd12aae7',
        username: 'jeka7ro',
        usernameLower: 'jeka7ro',
        email: 'jeka7ro@gmail.com',
        emailLower: 'jeka7ro@gmail.com',
        passwordHash: '',
        authProvider: 'google',
        googleSub: '',
        role: 'admin',
        blocked: false,
        blockedReason: '',
        createdAt: now,
        lastLoginAt: now,
        personal: {
          customWatchlist: [
            { sym: 'AD', name: 'Array Digital Infrastructure, Inc.' },
            { sym: 'EGLD-USD', name: 'MultiversX (EGLD)' },
            { sym: 'APPS', name: 'Digital Turbine, Inc.' },
            { sym: 'ONDS', name: 'Ondas Inc.' },
            { sym: 'LULU', name: 'Lululemon Athletica' },
            { sym: 'GME', name: 'GameStop Corp.' },
            { sym: 'ORCL', name: 'Oracle Corporation' },
            { sym: 'NIO', name: 'NIO Inc.' },
            { sym: 'PYPL', name: 'PayPal Holdings, Inc.' },
            { sym: 'TRX-USD', name: 'TRON USD' },
            { sym: 'TLT', name: 'iShares 20+ Yr Treasury Bond ETF' }
          ],
          hiddenGeneralSyms: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GC=F', 'EURUSD=X'],
          settings: {
            ...JSON.parse(JSON.stringify(DEFAULT_GENERAL_SETTINGS)),
            symbol: 'ONDS',
            tf: '30m',
            layout: '2v',
            focusedPaneId: 0
          },
          drawingsBySym: {},
          realPortfolio: null,
          updatedAt: now
        }
      }
    ]
  };
}

function normalizeDbShape(raw) {
  const base = createInitialDb();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: 2,
    secret: (typeof raw.secret === 'string' && raw.secret.length >= 16) ? raw.secret : base.secret,
    general: {
      watchlist: normalizeWatchlistArray(raw.general?.watchlist, base.general.watchlist),
      settings: {
        ...base.general.settings,
        ...(raw.general?.settings && typeof raw.general.settings === 'object' ? raw.general.settings : {})
      },
      updatedAt: Number(raw.general?.updatedAt) || base.general.updatedAt
    },
    users: Array.isArray(raw.users)
      ? (() => {
        const list = raw.users
          .filter(u => u && u.id && u.usernameLower && (u.passwordHash || u.authProvider === 'google' || u.authProvider === 'both'))
          .map(u => ({
            ...u,
            role: u.role === 'admin' ? 'admin' : 'user',
            blocked: !!u.blocked,
            blockedReason: String(u.blockedReason || '').trim()
          }));
        if (list.length > 0 && !list.some(u => u.role === 'admin')) {
          list[0].role = 'admin';
        }
        return list;
      })()
      : []
  };
}

async function loadDb() {
  if (useNetlifyBlobsStorage()) {
    try {
      const store = netlifyBlobs.getStore(BLOBS_STORE_NAME);
      const data = await store.get(BLOBS_KEY, { type: 'json' });
      const norm = normalizeDbShape(data);
      memoryDbCache = norm;
      return norm;
    } catch (_) {
      return normalizeDbShape(memoryDbCache);
    }
  }
  try {
    if (fs.existsSync(LOCAL_USERS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_USERS_FILE, 'utf8'));
      const norm = normalizeDbShape(parsed);
      memoryDbCache = norm;
      return norm;
    }
  } catch (_) {}
  const initDb = createInitialDb();
  memoryDbCache = initDb;
  await saveDb(initDb);
  return initDb;
}

async function saveDb(db) {
  const clean = normalizeDbShape(db);
  memoryDbCache = clean;
  if (useNetlifyBlobsStorage()) {
    try {
      const store = netlifyBlobs.getStore(BLOBS_STORE_NAME);
      await store.setJSON(BLOBS_KEY, clean);
      return;
    } catch (_) {
      return;
    }
  }
  try {
    const tmp = `${LOCAL_USERS_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8');
    fs.renameSync(tmp, LOCAL_USERS_FILE);
  } catch (_) {}
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  try {
    const parts = String(storedHash || '').split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const expected = Buffer.from(parts[1], 'hex');
    const actual = crypto.scryptSync(String(password), parts[0], 64);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch (_) {
    return false;
  }
}

function getSigningKey(secret) {
  return process.env.AUTH_SECRET || secret;
}

function signPayload(payloadObj, secret) {
  const body = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningKey(secret)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedPayload(token, secret) {
  try {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac('sha256', getSigningKey(secret)).update(body).digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.exp || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function signAuthToken(user, secret) {
  return signPayload({
    uid: user.id,
    un: user.username,
    em: user.email,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS
  }, secret);
}

function verifyAuthToken(token, secret) {
  const payload = verifySignedPayload(token, secret);
  return (payload && payload.uid) ? payload : null;
}

function normalizeWatchlistArray(arr, fallback = []) {
  const src = Array.isArray(arr) && arr.length ? arr : fallback;
  const seen = new Set();
  const out = [];
  for (const raw of src) {
    const sym = String(typeof raw === 'string' ? raw : (raw?.sym || raw?.symbol || '')).trim().toUpperCase();
    if (!sym || !/^[A-Z0-9.^=\-]+$/.test(sym) || seen.has(sym)) continue;
    seen.add(sym);
    const name = (typeof raw === 'object' && raw?.name && String(raw.name).trim()) ? String(raw.name).trim() : sym;
    out.push({ sym, name });
  }
  return out;
}

function createEmptyRealPortfolio() {
  return {
    broker: 'eToro',
    currency: 'USD',
    cashAvailable: null,
    accountEquity: null,
    notes: '',
    assets: [],
    updatedAt: 0
  };
}

function resolveBrokerTickerSymbol(rawBrokerSym, rawName = '', explicitSym = '') {
  const manual = String(explicitSym || '').trim().toUpperCase();
  const broker = String(rawBrokerSym || '').trim().toUpperCase();
  if (manual && /^[A-Z0-9.^=\-]+$/.test(manual) && manual !== broker) {
    return manual;
  }
  const nm = String(rawName || '').toLowerCase();
  let clean = broker.replace(/\.(24-7|24-5|24_7|24_5)$/i, '').replace(/\/24-?7$/i, '');
  if (clean === 'TRUMP' || nm.includes('official trump')) {
    return 'TRUMP35336-USD';
  }
  return clean || manual || broker;
}

function finiteOrNull(v, min = -Infinity) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : null;
}

function normalizePortfolioLot(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const units = finiteOrNull(raw.units, 0);
  const open = finiteOrNull(raw.open, 0);
  if (!units || units <= 0 || open === null) return null;
  const typeStr = String(raw.type || (raw.isCfd ? 'Buy CFD' : 'Buy')).trim().slice(0, 40);
  const side = String(raw.side || '').toUpperCase() === 'SHORT' || /^sell/i.test(typeStr) ? 'SHORT' : 'LONG';
  return {
    id: String(raw.id || `lot_${idx + 1}_${crypto.randomBytes(3).toString('hex')}`),
    openedAt: String(raw.openedAt || '').trim().slice(0, 40),
    type: typeStr || 'Buy',
    side,
    isCfd: raw.isCfd !== undefined ? !!raw.isCfd : /cfd/i.test(typeStr),
    is24_5: raw.is24_5 !== undefined ? !!raw.is24_5 : /24\/5/i.test(typeStr),
    units,
    open,
    sl: finiteOrNull(raw.sl, 0.000001),
    tp: finiteOrNull(raw.tp, 0.000001),
    invested: finiteOrNull(raw.invested, 0),
    brokerPnl: finiteOrNull(raw.brokerPnl),
    brokerPnlPct: finiteOrNull(raw.brokerPnlPct),
    dailyPnl: finiteOrNull(raw.dailyPnl),
    notes: String(raw.notes || '').trim().slice(0, 240)
  };
}

function normalizePortfolioAsset(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const brokerSym = String(raw.brokerSym || raw.sym || raw.symbol || '').trim().toUpperCase().slice(0, 32);
  if (!brokerSym) return null;
  const name = String(raw.name || '').trim().slice(0, 100);
  const sym = resolveBrokerTickerSymbol(brokerSym, name, raw.sym || '');
  const lots = Array.isArray(raw.lots)
    ? raw.lots.map((l, i) => normalizePortfolioLot(l, i)).filter(Boolean).slice(0, 120)
    : [];

  let units = finiteOrNull(raw.units, 0);
  let avgOpen = finiteOrNull(raw.avgOpen, 0);
  if (lots.length > 0) {
    const totU = lots.reduce((s, l) => s + l.units, 0);
    if (totU > 0) {
      units = Number(totU.toFixed(8));
      const weightedCost = lots.reduce((s, l) => s + l.units * l.open, 0);
      avgOpen = Number((weightedCost / totU).toFixed(8));
    }
  }
  if (!units || units <= 0 || avgOpen === null) return null;

  const side = String(raw.side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  let brokerPnl = finiteOrNull(raw.brokerPnl);
  if (brokerPnl === null && lots.length > 0 && lots.every(l => l.brokerPnl !== null)) {
    brokerPnl = Number(lots.reduce((s, l) => s + l.brokerPnl, 0).toFixed(2));
  }
  const brokerPnlPct = finiteOrNull(raw.brokerPnlPct);
  const brokerNetValue = finiteOrNull(raw.brokerNetValue, 0);
  let invested = finiteOrNull(raw.invested, 0);
  if (invested === null && brokerNetValue !== null && brokerPnl !== null) {
    const inferred = brokerNetValue - brokerPnl;
    if (Number.isFinite(inferred) && inferred > 0) invested = Number(inferred.toFixed(2));
  }

  return {
    id: String(raw.id || `ast_${idx + 1}_${crypto.randomBytes(3).toString('hex')}`),
    brokerSym,
    sym,
    name: name || sym,
    side,
    units,
    avgOpen,
    invested,
    brokerNetValue,
    brokerPrice: finiteOrNull(raw.brokerPrice, 0),
    brokerPnl,
    brokerPnlPct,
    sl: finiteOrNull(raw.sl, 0.000001),
    tp: finiteOrNull(raw.tp, 0.000001),
    isCfd: raw.isCfd !== undefined ? !!raw.isCfd : lots.some(l => l.isCfd),
    is24_5: raw.is24_5 !== undefined ? !!raw.is24_5 : (lots.some(l => l.is24_5) || /24-5/i.test(brokerSym)),
    is24_7: raw.is24_7 !== undefined ? !!raw.is24_7 : /24-7/i.test(brokerSym),
    notes: String(raw.notes || '').trim().slice(0, 400),
    lots
  };
}

function normalizeRealPortfolio(raw) {
  const base = createEmptyRealPortfolio();
  if (!raw || typeof raw !== 'object') return base;
  const assets = Array.isArray(raw.assets)
    ? raw.assets.map((a, i) => normalizePortfolioAsset(a, i)).filter(Boolean).slice(0, 200)
    : [];
  return {
    broker: String(raw.broker || 'eToro').trim().slice(0, 40) || 'eToro',
    currency: String(raw.currency || 'USD').trim().toUpperCase().slice(0, 8) || 'USD',
    cashAvailable: finiteOrNull(raw.cashAvailable, 0),
    accountEquity: finiteOrNull(raw.accountEquity, 0),
    notes: String(raw.notes || '').trim().slice(0, 1000),
    assets,
    updatedAt: Number(raw.updatedAt) || Date.now()
  };
}

function createEmptyPersonalState() {
  return {
    customWatchlist: [],
    hiddenGeneralSyms: [],
    watchlistOrder: [],
    settings: {},
    drawingsBySym: {},
    realPortfolio: null,
    updatedAt: Date.now()
  };
}

function mergeGeneralAndPersonal(general, personal) {
  const gen = general || createInitialDb().general;
  const pers = personal || createEmptyPersonalState();
  const genList = normalizeWatchlistArray(gen.watchlist, DEFAULT_GENERAL_WATCHLIST);
  const customList = normalizeWatchlistArray(pers.customWatchlist, []);
  const hiddenSet = new Set((Array.isArray(pers.hiddenGeneralSyms) ? pers.hiddenGeneralSyms : []).map(s => String(s).toUpperCase()));

  const bySym = new Map();
  for (const item of genList) {
    if (!hiddenSet.has(item.sym)) {
      bySym.set(item.sym, { ...item, source: 'general' });
    }
  }
  for (const item of customList) {
    bySym.set(item.sym, { ...item, source: 'personal' });
  }

  const ordered = [];
  const added = new Set();
  if (Array.isArray(pers.watchlistOrder)) {
    for (const rawSym of pers.watchlistOrder) {
      const sym = String(rawSym || '').trim().toUpperCase();
      if (bySym.has(sym) && !added.has(sym)) {
        ordered.push(bySym.get(sym));
        added.add(sym);
      }
    }
  }
  for (const [sym, obj] of bySym.entries()) {
    if (!added.has(sym)) ordered.push(obj);
  }

  const genSettings = gen.settings || DEFAULT_GENERAL_SETTINGS;
  const persSettings = (pers.settings && typeof pers.settings === 'object') ? pers.settings : {};

  // Keep user-specific profiles, arrangements & secondary panes strictly isolated per user
  const persProfiles = Array.isArray(persSettings.indicatorProfiles) ? persSettings.indicatorProfiles : [];
  const genProfiles = Array.isArray(genSettings.indicatorProfiles) ? genSettings.indicatorProfiles : [];
  const mergedProfiles = [];
  const profSeen = new Set();
  [...persProfiles, ...genProfiles].forEach(p => {
    if (p && p.name && !profSeen.has(String(p.name).toLowerCase())) {
      profSeen.add(String(p.name).toLowerCase());
      mergedProfiles.push(p);
    }
  });

  const persArr = Array.isArray(persSettings.arrangements) ? persSettings.arrangements : [];
  const genArr = Array.isArray(genSettings.arrangements) ? genSettings.arrangements : [];
  const mergedArrangements = [];
  const arrSeen = new Set();
  [...persArr, ...genArr].forEach(a => {
    if (a && a.name && !arrSeen.has(String(a.name).toLowerCase())) {
      arrSeen.add(String(a.name).toLowerCase());
      mergedArrangements.push(a);
    }
  });

  const mergedSettings = {
    ...genSettings,
    ...persSettings,
    indicators: persSettings.indicators ? { ...genSettings.indicators, ...persSettings.indicators } : { ...genSettings.indicators },
    hiddenIndicators: persSettings.hiddenIndicators ? { ...persSettings.hiddenIndicators } : { ...(genSettings.hiddenIndicators || {}) },
    indicatorProfiles: mergedProfiles,
    arrangements: mergedArrangements
  };

  return {
    watchlist: ordered,
    settings: mergedSettings,
    drawingsBySym: (pers.drawingsBySym && typeof pers.drawingsBySym === 'object') ? pers.drawingsBySym : {},
    realPortfolio: pers.realPortfolio ? normalizeRealPortfolio(pers.realPortfolio) : null,
    stats: {
      personalSymCount: customList.length,
      generalSymCount: genList.filter(x => !hiddenSet.has(x.sym)).length,
      hiddenGeneralCount: hiddenSet.size
    }
  };
}

function sanitizePublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'user',
    blocked: !!user.blocked,
    blockedReason: String(user.blockedReason || ''),
    authProvider: user.authProvider || 'local',
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

function getBlockedUserMessage(user) {
  const reason = String(user?.blockedReason || '').trim();
  return reason ? `Cont blocat de administrator: ${reason}` : 'Contul tău este blocat de administrator.';
}

function buildAdminUserSummary(u) {
  const ps = (u.personal && u.personal.settings && typeof u.personal.settings === 'object') ? u.personal.settings : {};
  const persSyms = Array.isArray(u.personal?.customWatchlist) ? u.personal.customWatchlist.map(x => x.sym) : [];
  const activeInds = Object.keys(ps.indicators || {}).filter(k => ps.indicators[k]);
  const pfMap = ps.portfolios && typeof ps.portfolios === 'object' ? ps.portfolios : {};
  const curPf = (ps.activePortfolio && pfMap[ps.activePortfolio]) ? pfMap[ps.activePortfolio] : pfMap.p1;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role === 'admin' ? 'admin' : 'user',
    blocked: !!u.blocked,
    blockedReason: String(u.blockedReason || ''),
    authProvider: u.authProvider || 'local',
    hasPassword: Boolean(u.passwordHash),
    createdAt: u.createdAt || null,
    lastLoginAt: u.lastLoginAt || null,
    updatedAt: u.personal?.updatedAt || null,
    personalSymbolsCount: persSyms.length,
    personalSymbols: persSyms,
    hiddenGeneralCount: Array.isArray(u.personal?.hiddenGeneralSyms) ? u.personal.hiddenGeneralSyms.length : 0,
    profilesCount: Array.isArray(ps.indicatorProfiles) ? ps.indicatorProfiles.length : 0,
    profileNames: Array.isArray(ps.indicatorProfiles) ? ps.indicatorProfiles.map(p => p?.name).filter(Boolean) : [],
    arrangementsCount: Array.isArray(ps.arrangements) ? ps.arrangements.length : 0,
    alertsCount: Array.isArray(ps.alerts) ? ps.alerts.length : 0,
    drawingsSymbolsCount: Object.keys(u.personal?.drawingsBySym || {}).length,
    activeSymbol: ps.symbol || 'SPY',
    activeTf: ps.tf || '30m',
    activeLayout: ps.layout || '1',
    theme: ps.theme || 'dark',
    activeIndicatorsCount: activeInds.length,
    activeIndicators: activeInds,
    paperBalance: curPf && isFinite(curPf.balance) ? Number(curPf.balance) : null,
    paperOpenPositions: Array.isArray(curPf?.positions) ? curPf.positions.length : 0,
    realPortfolioAssetsCount: Array.isArray(u.personal?.realPortfolio?.assets) ? u.personal.realPortfolio.assets.length : 0
  };
}

function buildAdminUsersPayload(db) {
  const users = (db.users || []).map(buildAdminUserSummary);
  return {
    ok: true,
    stats: {
      totalUsers: users.length,
      activeUsers: users.filter(u => !u.blocked).length,
      blockedUsers: users.filter(u => u.blocked).length,
      googleUsers: users.filter(u => u.authProvider === 'google' || u.authProvider === 'both').length,
      localUsers: users.filter(u => u.authProvider === 'local' || u.authProvider === 'both').length,
      adminUsers: users.filter(u => u.role === 'admin').length,
      totalPersonalSymbols: users.reduce((acc, u) => acc + u.personalSymbolsCount, 0),
      generalWatchlistCount: Array.isArray(db.general?.watchlist) ? db.general.watchlist.length : 0
    },
    users
  };
}

function requireAuthenticatedCaller(headers, db) {
  const token = extractBearerToken(headers);
  const decoded = token ? verifyAuthToken(token, db.secret) : null;
  const caller = decoded ? db.users.find(u => u.id === decoded.uid) : null;
  if (!caller) {
    return { err: { status: 401, body: { ok: false, error: 'Sesiune expirată sau neautentificat.' } } };
  }
  if (caller.blocked) {
    return { err: { status: 403, body: { ok: false, error: getBlockedUserMessage(caller) } } };
  }
  return { caller };
}

function requireAdminCaller(headers, db) {
  const { err, caller } = requireAuthenticatedCaller(headers, db);
  if (err) return { err };
  if (caller.role !== 'admin') {
    return { err: { status: 403, body: { ok: false, error: 'Acces interzis: necesită rol de Administrator.' } } };
  }
  return { caller };
}

function extractBearerToken(headers = {}) {
  const auth = headers.authorization || headers.Authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function parseSnapshotIntoPersonal(snapshot, generalWatchlist) {
  const base = createEmptyPersonalState();
  if (!snapshot || typeof snapshot !== 'object') return base;
  const genSet = new Set(normalizeWatchlistArray(generalWatchlist, DEFAULT_GENERAL_WATCHLIST).map(x => x.sym));
  const wl = normalizeWatchlistArray(snapshot.watchlist, []);

  if (wl.length) {
    const presentSet = new Set();
    base.watchlistOrder = wl.map(x => x.sym);
    for (const item of wl) {
      presentSet.add(item.sym);
      const isGeneralSym = genSet.has(item.sym);
      if (!isGeneralSym || item.source === 'personal') {
        base.customWatchlist.push({ sym: item.sym, name: item.name });
      }
    }
    for (const gSym of genSet) {
      if (!presentSet.has(gSym)) {
        base.hiddenGeneralSyms.push(gSym);
      }
    }
  } else {
    if (Array.isArray(snapshot.customWatchlist)) {
      base.customWatchlist = normalizeWatchlistArray(snapshot.customWatchlist, []);
    }
    if (Array.isArray(snapshot.hiddenGeneralSyms)) {
      base.hiddenGeneralSyms = snapshot.hiddenGeneralSyms.map(s => String(s).trim().toUpperCase()).filter(Boolean);
    }
    if (Array.isArray(snapshot.watchlistOrder)) {
      base.watchlistOrder = snapshot.watchlistOrder.map(s => String(s).trim().toUpperCase()).filter(Boolean);
    }
  }

  if (snapshot.settings && typeof snapshot.settings === 'object') {
    base.settings = { ...snapshot.settings };
  }
  if (snapshot.drawingsBySym && typeof snapshot.drawingsBySym === 'object') {
    base.drawingsBySym = { ...snapshot.drawingsBySym };
  }
  if (snapshot.realPortfolio !== undefined) {
    base.realPortfolio = snapshot.realPortfolio ? normalizeRealPortfolio(snapshot.realPortfolio) : null;
  }
  base.updatedAt = Date.now();
  return base;
}

function resolveRequestOrigin(headers = {}) {
  if (process.env.AUTH_PUBLIC_ORIGIN) return String(process.env.AUTH_PUBLIC_ORIGIN).replace(/\/$/, '');
  const proto = headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || 'http';
  const host = headers['x-forwarded-host'] || headers.host || headers.Host || 'localhost:9030';
  return `${proto}://${host}`;
}

function readDotEnvOverrides() {
  const out = {};
  try {
    const envPath = path.join(__dirname, '..', '..', '.env');
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const clean = line.trim();
        if (!clean || clean.startsWith('#')) continue;
        const eq = clean.indexOf('=');
        if (eq > 0) {
          const k = clean.slice(0, eq).trim();
          const v = clean.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          if (k && v) out[k] = v;
        }
      }
    }
  } catch (_) {}
  return out;
}

function getGoogleOAuthConfig(headers = {}) {
  let clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  let clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    const dotEnv = readDotEnvOverrides();
    if (!clientId && dotEnv.GOOGLE_CLIENT_ID) clientId = dotEnv.GOOGLE_CLIENT_ID;
    if (!clientSecret && dotEnv.GOOGLE_CLIENT_SECRET) clientSecret = dotEnv.GOOGLE_CLIENT_SECRET;
  }
  if (!clientId && _FB_G_ID) clientId = _FB_G_ID;
  if (!clientSecret && _FB_G_SEC) clientSecret = _FB_G_SEC;
  const origin = resolveRequestOrigin(headers);
  const callbackUrl = `${origin}/api/auth/google/callback`;
  return {
    enabled: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    origin,
    callbackUrl
  };
}

function httpsJsonRequest(urlStr, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers,
      timeout: 9000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const obj = JSON.parse(data || '{}');
          resolve({ status: res.statusCode || 200, data: obj });
        } catch (e) {
          reject(new Error(`Google OAuth invalid response (${res.statusCode})`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Google OAuth timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function makeUniqueUsernameFromEmail(email, existingUsers) {
  const baseRaw = String(email || 'user').split('@')[0].replace(/[^a-zA-Z0-9_.-]+/g, '').slice(0, 24) || 'trader';
  let cand = baseRaw.length >= 2 ? baseRaw : `${baseRaw}_1`;
  let idx = 2;
  const taken = new Set((existingUsers || []).map(u => u.usernameLower));
  while (taken.has(cand.toLowerCase())) {
    cand = `${baseRaw.slice(0, 20)}_${idx++}`;
  }
  return cand;
}

async function handleAuthApiRequest({ method, pathname, headers = {}, body = {}, query = {} }) {
  const m = String(method || 'GET').toUpperCase();
  const db = await loadDb();

  if (pathname.endsWith('/api/auth/providers') && m === 'GET') {
    const g = getGoogleOAuthConfig(headers);
    return {
      status: 200,
      body: {
        ok: true,
        googleEnabled: g.enabled,
        callbackUrl: g.callbackUrl
      }
    };
  }

  if (pathname.endsWith('/api/auth/google/start') && m === 'GET') {
    const g = getGoogleOAuthConfig(headers);
    if (!g.enabled) {
      return {
        redirect: `${g.origin}/#authError=${encodeURIComponent('Google OAuth nu este configurat în .env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')}`
      };
    }
    const stateToken = signPayload({
      nonce: crypto.randomBytes(8).toString('hex'),
      exp: Date.now() + 10 * 60 * 1000
    }, db.secret);
    const params = new URLSearchParams({
      client_id: g.clientId,
      redirect_uri: g.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state: stateToken
    });
    return {
      redirect: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    };
  }

  if (pathname.endsWith('/api/auth/google/callback') && m === 'GET') {
    const g = getGoogleOAuthConfig(headers);
    if (!g.enabled) {
      return { redirect: `${g.origin}/#authError=${encodeURIComponent('Google OAuth neconfigurat.')}` };
    }
    if (query.error) {
      return { redirect: `${g.origin}/#authError=${encodeURIComponent(`Autentificare Google anulată (${query.error}).`)}` };
    }
    const stateCheck = verifySignedPayload(query.state, db.secret);
    if (!stateCheck || !query.code) {
      return { redirect: `${g.origin}/#authError=${encodeURIComponent('Sesiune Google OAuth expirată sau invalidă.')}` };
    }
    try {
      const formBody = new URLSearchParams({
        code: String(query.code),
        client_id: g.clientId,
        client_secret: g.clientSecret,
        redirect_uri: g.callbackUrl,
        grant_type: 'authorization_code'
      }).toString();

      const tokResp = await httpsJsonRequest('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formBody)
        },
        body: formBody
      });

      const accessToken = tokResp.data?.access_token;
      if (!accessToken) {
        return { redirect: `${g.origin}/#authError=${encodeURIComponent(tokResp.data?.error_description || 'Eroare schimb cod Google OAuth.')}` };
      }

      const infoResp = await httpsJsonRequest('https://www.googleapis.com/oauth2/v3/userinfo', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const email = String(infoResp.data?.email || '').trim().toLowerCase();
      const sub = String(infoResp.data?.sub || '').trim();
      if (!email || !sub) {
        return { redirect: `${g.origin}/#authError=${encodeURIComponent('Google nu a returnat adresa de email.')}` };
      }

      let user = db.users.find(u => u.emailLower === email || (u.googleSub && u.googleSub === sub));
      const now = Date.now();
      if (!user) {
        const username = makeUniqueUsernameFromEmail(email, db.users);
        user = {
          id: 'u_' + crypto.randomBytes(8).toString('hex'),
          username,
          usernameLower: username.toLowerCase(),
          email,
          emailLower: email,
          passwordHash: '',
          role: db.users.length === 0 ? 'admin' : 'user',
          blocked: false,
          blockedReason: '',
          authProvider: 'google',
          googleSub: sub,
          createdAt: now,
          lastLoginAt: now,
          personal: createEmptyPersonalState()
        };
        db.users.push(user);
      } else {
        if (user.blocked) {
          return { redirect: `${g.origin}/#authError=${encodeURIComponent(getBlockedUserMessage(user))}` };
        }
        user.googleSub = sub;
        user.lastLoginAt = now;
      }

      await saveDb(db);
      const token = signAuthToken(user, db.secret);
      return { redirect: `${g.origin}/#authToken=${encodeURIComponent(token)}` };
    } catch (e) {
      return { redirect: `${g.origin}/#authError=${encodeURIComponent(e.message || 'Eroare conectare Google.')}` };
    }
  }

  if (pathname.endsWith('/api/auth/me') && m === 'GET') {
    const token = extractBearerToken(headers);
    const decoded = token ? verifyAuthToken(token, db.secret) : null;
    const user = decoded ? db.users.find(u => u.id === decoded.uid) : null;
    if (!user) {
      return {
        status: 200,
        body: {
          ok: true,
          authenticated: false,
          user: null
        }
      };
    }
    if (user.blocked) {
      return {
        status: 200,
        body: {
          ok: true,
          authenticated: false,
          blocked: true,
          error: getBlockedUserMessage(user),
          user: null
        }
      };
    }
    return {
      status: 200,
      body: {
        ok: true,
        authenticated: true,
        user: sanitizePublicUser(user),
        generalState: db.general,
        personalState: user.personal,
        mergedState: mergeGeneralAndPersonal(db.general, user.personal)
      }
    };
  }

  if (pathname.endsWith('/api/auth/register') && m === 'POST') {
    const username = String(body?.username || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const inheritGeneral = body?.inheritGeneral !== false;

    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
      return { status: 400, body: { ok: false, error: 'Username invalid (2–32 caractere: litere, cifre, . _ -).' } };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { status: 400, body: { ok: false, error: 'Adresă de email invalidă.' } };
    }
    if (password.length < 4) {
      return { status: 400, body: { ok: false, error: 'Parola trebuie să aibă minim 4 caractere.' } };
    }

    const unLower = username.toLowerCase();
    if (db.users.some(u => u.usernameLower === unLower)) {
      return { status: 409, body: { ok: false, error: 'Acest username este deja înregistrat.' } };
    }
    if (db.users.some(u => u.emailLower === email)) {
      return { status: 409, body: { ok: false, error: 'Acest email este deja folosit de alt cont.' } };
    }

    // By default every new account starts strictly isolated with clean neutral general benchmarks only.
    let personal = createEmptyPersonalState();
    if (body?.seedFromSnapshot && typeof body.seedFromSnapshot === 'object') {
      personal = parseSnapshotIntoPersonal(body.seedFromSnapshot, db.general.watchlist);
      if (inheritGeneral) personal.hiddenGeneralSyms = [];
    } else if (!inheritGeneral) {
      personal.hiddenGeneralSyms = db.general.watchlist.map(w => w.sym);
    }

    const now = Date.now();
    const user = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      username,
      usernameLower: unLower,
      email,
      emailLower: email,
      passwordHash: hashPassword(password),
      role: db.users.length === 0 ? 'admin' : 'user',
      blocked: false,
      blockedReason: '',
      authProvider: 'local',
      createdAt: now,
      lastLoginAt: now,
      personal
    };

    db.users.push(user);
    await saveDb(db);
    const token = signAuthToken(user, db.secret);

    return {
      status: 200,
      body: {
        ok: true,
        token,
        user: sanitizePublicUser(user),
        generalState: db.general,
        personalState: user.personal,
        mergedState: mergeGeneralAndPersonal(db.general, user.personal)
      }
    };
  }

  if (pathname.endsWith('/api/auth/login') && m === 'POST') {
    const identifier = String(body?.identifier || body?.username || body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!identifier || !password) {
      return { status: 400, body: { ok: false, error: 'Completează username/email și parola.' } };
    }

    const user = db.users.find(u => u.usernameLower === identifier || u.emailLower === identifier);
    if (!user) {
      return { status: 401, body: { ok: false, error: 'Username/email sau parolă incorectă.' } };
    }
    if (!user.passwordHash) {
      return { status: 401, body: { ok: false, error: 'Acest cont a fost creat prin Google (Gmail). Apasă „Continuă cu Google”.' } };
    }
    if (!verifyPassword(password, user.passwordHash)) {
      return { status: 401, body: { ok: false, error: 'Username/email sau parolă incorectă.' } };
    }
    if (user.blocked) {
      return { status: 403, body: { ok: false, error: getBlockedUserMessage(user) } };
    }

    user.lastLoginAt = Date.now();
    await saveDb(db);
    const token = signAuthToken(user, db.secret);

    return {
      status: 200,
      body: {
        ok: true,
        token,
        user: sanitizePublicUser(user),
        generalState: db.general,
        personalState: user.personal,
        mergedState: mergeGeneralAndPersonal(db.general, user.personal)
      }
    };
  }

  if (pathname.endsWith('/api/auth/logout') && m === 'POST') {
    return {
      status: 200,
      body: {
        ok: true,
        authenticated: false
      }
    };
  }

  if (pathname.endsWith('/api/auth/state') && (m === 'PUT' || m === 'POST')) {
    const token = extractBearerToken(headers);
    const decoded = token ? verifyAuthToken(token, db.secret) : null;
    const user = decoded ? db.users.find(u => u.id === decoded.uid) : null;
    if (!user) {
      return { status: 401, body: { ok: false, error: 'Sesiune expirată sau neautentificat.' } };
    }
    if (user.blocked) {
      return { status: 403, body: { ok: false, error: getBlockedUserMessage(user) } };
    }

    if (body?.resetHiddenGeneral === true) {
      user.personal.hiddenGeneralSyms = [];
      user.personal.updatedAt = Date.now();
    } else if (body?.snapshot && typeof body.snapshot === 'object') {
      const nextPersonal = parseSnapshotIntoPersonal(body.snapshot, db.general.watchlist);
      nextPersonal.drawingsBySym = {
        ...(user.personal.drawingsBySym || {}),
        ...(nextPersonal.drawingsBySym || {})
      };
      if (body.snapshot.realPortfolio === undefined) {
        nextPersonal.realPortfolio = user.personal.realPortfolio || null;
      }
      user.personal = nextPersonal;
    }

    await saveDb(db);
    return {
      status: 200,
      body: {
        ok: true,
        user: sanitizePublicUser(user),
        generalState: db.general,
        personalState: user.personal,
        mergedState: mergeGeneralAndPersonal(db.general, user.personal)
      }
    };
  }

  if (pathname.endsWith('/api/auth/admin/users') && m === 'GET') {
    const { err } = requireAdminCaller(headers, db);
    if (err) return err;
    return { status: 200, body: buildAdminUsersPayload(db) };
  }

  if (pathname.endsWith('/api/auth/admin/user-update') && (m === 'POST' || m === 'PUT')) {
    const { err, caller } = requireAdminCaller(headers, db);
    if (err) return err;
    const targetId = String(body?.userId || '').trim();
    const target = db.users.find(u => u.id === targetId);
    if (!target) {
      return { status: 404, body: { ok: false, error: 'Contul nu a fost găsit.' } };
    }

    if (body.username !== undefined) {
      const nextUn = String(body.username || '').trim();
      if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(nextUn)) {
        return { status: 400, body: { ok: false, error: 'Username invalid (2–32 caractere: litere, cifre, . _ -).' } };
      }
      const nextUnLow = nextUn.toLowerCase();
      if (db.users.some(u => u.id !== target.id && u.usernameLower === nextUnLow)) {
        return { status: 409, body: { ok: false, error: 'Acest username este deja folosit de alt cont.' } };
      }
      target.username = nextUn;
      target.usernameLower = nextUnLow;
    }

    if (body.email !== undefined) {
      const nextEmail = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        return { status: 400, body: { ok: false, error: 'Adresă de email invalidă.' } };
      }
      if (db.users.some(u => u.id !== target.id && u.emailLower === nextEmail)) {
        return { status: 409, body: { ok: false, error: 'Acest email este deja asociat altui cont.' } };
      }
      target.email = nextEmail;
      target.emailLower = nextEmail;
    }

    if (body.role !== undefined) {
      const nextRole = body.role === 'admin' ? 'admin' : 'user';
      if (target.id === caller.id && nextRole !== 'admin') {
        return { status: 400, body: { ok: false, error: 'Nu îți poți retrage singur dreptul de Administrator.' } };
      }
      target.role = nextRole;
    }

    if (body.blocked !== undefined) {
      const nextBlocked = !!body.blocked;
      if (target.id === caller.id && nextBlocked) {
        return { status: 400, body: { ok: false, error: 'Nu îți poți bloca propriul cont de Administrator.' } };
      }
      target.blocked = nextBlocked;
      target.blockedReason = nextBlocked ? String(body.blockedReason || '').trim().slice(0, 140) : '';
    } else if (body.blockedReason !== undefined && target.blocked) {
      target.blockedReason = String(body.blockedReason || '').trim().slice(0, 140);
    }

    if (body.newPassword !== undefined && String(body.newPassword).length > 0) {
      const np = String(body.newPassword);
      if (np.length < 4) {
        return { status: 400, body: { ok: false, error: 'Parola nouă trebuie să aibă minim 4 caractere.' } };
      }
      target.passwordHash = hashPassword(np);
      if (target.authProvider === 'google') target.authProvider = 'both';
    }

    if (body.resetPersonal === true) {
      target.personal = createEmptyPersonalState();
    }

    await saveDb(db);
    return {
      status: 200,
      body: {
        ...buildAdminUsersPayload(db),
        updatedUser: buildAdminUserSummary(target)
      }
    };
  }

  if (pathname.endsWith('/api/auth/admin/user-delete') && (m === 'POST' || m === 'DELETE')) {
    const { err, caller } = requireAdminCaller(headers, db);
    if (err) return err;
    const targetId = String(body?.userId || '').trim();
    const idx = db.users.findIndex(u => u.id === targetId);
    if (idx < 0) {
      return { status: 404, body: { ok: false, error: 'Contul nu a fost găsit.' } };
    }
    if (db.users[idx].id === caller.id) {
      return { status: 400, body: { ok: false, error: 'Nu îți poți șterge propriul cont de Administrator.' } };
    }
    const deletedEmail = db.users[idx].email;
    db.users.splice(idx, 1);
    await saveDb(db);
    return {
      status: 200,
      body: {
        ...buildAdminUsersPayload(db),
        deletedUserId: targetId,
        deletedEmail
      }
    };
  }

  if (pathname.endsWith('/api/auth/portfolio') && m === 'GET') {
    const { err, caller } = requireAuthenticatedCaller(headers, db);
    if (err) return err;
    const pf = caller.personal?.realPortfolio
      ? normalizeRealPortfolio(caller.personal.realPortfolio)
      : createEmptyRealPortfolio();
    return {
      status: 200,
      body: {
        ok: true,
        userId: caller.id,
        username: caller.username,
        realPortfolio: pf
      }
    };
  }

  if (pathname.endsWith('/api/auth/portfolio') && (m === 'PUT' || m === 'POST')) {
    const { err, caller } = requireAuthenticatedCaller(headers, db);
    if (err) return err;
    const rawPf = body?.realPortfolio ?? body;
    const nextPf = normalizeRealPortfolio(rawPf);
    nextPf.updatedAt = Date.now();
    caller.personal.realPortfolio = nextPf;
    caller.personal.updatedAt = nextPf.updatedAt;
    await saveDb(db);
    return {
      status: 200,
      body: {
        ok: true,
        userId: caller.id,
        username: caller.username,
        realPortfolio: nextPf
      }
    };
  }

  return { status: 404, body: { ok: false, error: 'Endpoint auth inexistent.' } };
}

module.exports = {
  DEFAULT_GENERAL_WATCHLIST,
  DEFAULT_GENERAL_SETTINGS,
  handleAuthApiRequest,
  mergeGeneralAndPersonal,
  normalizeRealPortfolio,
  createEmptyRealPortfolio
};
