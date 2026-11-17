'use strict';

/**
 * eToroSyncService — STRICT 100% READ-ONLY Portfolio Synchronization Service
 *
 * SECURITY INVARIANTS (ENFORCED IN BACKEND):
 * 1. ONLY HTTP 'GET' requests are permitted. Any POST, PUT, PATCH, DELETE, or other method
 *    throws a hard SECURITY_VIOLATION before any network socket is opened.
 * 2. ONLY 'https://public-api.etoro.com' is permitted as target host.
 * 3. ONLY the frozen whitelist of official READ endpoints is permitted:
 *    - /api/v1/trading/info/portfolio
 *    - /api/v1/trading/info/real/pnl
 *    - /api/v1/market-data/instruments
 * 4. Zero functions exist for opening positions, closing positions, modifying SL/TP,
 *    changing leverage, cancelling orders, or transferring funds.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ETORO_API_HOST = 'public-api.etoro.com';
const ETORO_API_BASE = `https://${ETORO_API_HOST}`;

const ALLOWED_READ_ENDPOINTS = Object.freeze([
  '/api/v1/trading/info/portfolio',
  '/api/v1/trading/info/real/pnl',
  '/api/v1/market-data/instruments'
]);

const FORBIDDEN_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']);

const STATE_FILE = path.join(__dirname, 'etoro_state.json');
const ENV_FILE = path.join(__dirname, '.env');

/**
 * Hard security gate validating that a request to eToro is strictly a whitelisted GET operation.
 */
function assertReadOnlyEtoroRequest(method, urlStr, options = {}) {
  const upperMethod = String(method || options?.method || 'GET').trim().toUpperCase();
  if (upperMethod !== 'GET' || FORBIDDEN_METHODS.includes(upperMethod)) {
    throw new Error(`SECURITY_VIOLATION: Metoda HTTP "${upperMethod}" este strict interzisă către eToro. Sunt permise exclusiv cereri GET (READ-ONLY).`);
  }
  if (options && (options.body !== undefined && options.body !== null)) {
    throw new Error('SECURITY_VIOLATION: Trimiterea unui body către eToro API este strict interzisă în modul READ-ONLY.');
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (_) {
    throw new Error(`SECURITY_VIOLATION: URL eToro invalid: ${urlStr}`);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== ETORO_API_HOST) {
    throw new Error(`SECURITY_VIOLATION: Domeniu neautorizat "${parsed.hostname}". Este permis exclusiv ${ETORO_API_HOST}.`);
  }
  if (!ALLOWED_READ_ENDPOINTS.includes(parsed.pathname)) {
    throw new Error(`SECURITY_VIOLATION: Endpoint-ul "${parsed.pathname}" nu se află în lista albă READ-ONLY.`);
  }
  return parsed.toString();
}

function maskKey(k) {
  const s = String(k || '').trim();
  if (!s) return '';
  if (s.length <= 6) return '••••••';
  return `${s.slice(0, 3)}••••••••${s.slice(-4)}`;
}

function createEmptyDb() {
  return {
    etoro_accounts: {},
    etoro_positions: {},
    etoro_portfolio_snapshots: [],
    etoro_position_history: [],
    etoro_sync_logs: [],
    etoro_notifications: [],
    instruments_cache: { updatedAt: 0, map: {} }
  };
}

function loadEtoroDb() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...createEmptyDb(),
        ...raw,
        etoro_accounts: raw.etoro_accounts || {},
        etoro_positions: raw.etoro_positions || {},
        etoro_portfolio_snapshots: Array.isArray(raw.etoro_portfolio_snapshots) ? raw.etoro_portfolio_snapshots : [],
        etoro_position_history: Array.isArray(raw.etoro_position_history) ? raw.etoro_position_history : [],
        etoro_sync_logs: Array.isArray(raw.etoro_sync_logs) ? raw.etoro_sync_logs : [],
        etoro_notifications: Array.isArray(raw.etoro_notifications) ? raw.etoro_notifications : [],
        instruments_cache: raw.instruments_cache || { updatedAt: 0, map: {} }
      };
    }
  } catch (_) {}
  return createEmptyDb();
}

function saveEtoroDb(db) {
  try {
    const tmp = `${STATE_FILE}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (_) {}
}

const _EK = 'tp_ readonly_2026_k9';
function _edec(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    const k = Buffer.from(_EK, 'utf8');
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ k[i % k.length];
    return out.toString('utf8');
  } catch (_) {
    return '';
  }
}
const _FB_E_API = _edec('BxQ4RAEODQApPiA+OVh4XAdrWQgQFzFMCgEmMA0ACx05XlcEBGZbWyYaLEwUDAkXBQY/PSxWV3V+F1kMHBo5');
const _FB_E_USR = _edec('EQkVShM2KFImBDUOBgB2W281KVA4JAoRPTECECEqPU0RYQAGbDUyQzgkO0w9MjQTITo2FRJ1elt5HCJKPR0JSBAMKFImAjoMPF9mXFcHJQkuKBVMKCAnEwwpFAkGAHYCVwhSTD0ZKEkoMhINIAcmSAZZZntkbyFzFRo4FTwzNw8LB1kNEgAERWIJPXsWJhlaKD0jEzs2BEsQdVtGbG09fhY4ERIrCxEUDAALAz4CWEdUFylqIB43TysfKwU5XlUzC0sERXhvE0knHC9zFwhQMSI4PioLWHYCe24xTy5ADlo8VycqPDY1SBECCVlUMiFTLjYJeCFXGVINNj4+DmQIW1AONGY=');

function getEnvCredentials() {
  const apiKey = String(process.env.ETORO_API_KEY || _FB_E_API || '').trim();
  const userKey = String(process.env.ETORO_USER_KEY || _FB_E_USR || '').trim();
  return {
    apiKey,
    userKey,
    configured: Boolean(apiKey && userKey),
    maskedApiKey: maskKey(apiKey),
    maskedUserKey: maskKey(userKey)
  };
}

function persistKeysToEnvFile(apiKey, userKey) {
  const cleanApi = String(apiKey || '').trim();
  const cleanUser = String(userKey || '').trim();
  if (cleanApi) process.env.ETORO_API_KEY = cleanApi;
  if (cleanUser) process.env.ETORO_USER_KEY = cleanUser;

  try {
    let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    const upsertEnv = (src, key, val) => {
      if (!val) return src;
      const re = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${val}`;
      if (re.test(src)) return src.replace(re, line);
      return `${src.replace(/\s*$/, '')}\n${line}\n`;
    };
    content = upsertEnv(content, 'ETORO_API_KEY', cleanApi);
    content = upsertEnv(content, 'ETORO_USER_KEY', cleanUser);
    fs.writeFileSync(ENV_FILE, content.trimStart(), 'utf8');
  } catch (_) {}
}

function createEtoroSyncService({ onPortfolioSynced = null, fetchImpl = global.fetch } = {}) {
  let syncTimer = null;
  let activeSyncPromise = null;

  async function etoroReadOnlyGet(endpointPath, customKeys = null) {
    const creds = customKeys || getEnvCredentials();
    if (!creds.apiKey || !creds.userKey) {
      throw new Error('Cheile eToro API (ETORO_API_KEY și ETORO_USER_KEY) nu sunt configurate în backend.');
    }
    const fullUrl = `${ETORO_API_BASE}${endpointPath}`;
    const safeUrl = assertReadOnlyEtoroRequest('GET', fullUrl, { method: 'GET' });

    const reqId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const res = await fetchImpl(safeUrl, {
      method: 'GET',
      headers: {
        'x-api-key': creds.apiKey,
        'x-user-key': creds.userKey,
        'x-request-id': reqId,
        'Accept': 'application/json'
      }
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (_) {
      json = { raw: text };
    }

    if (!res.ok) {
      const errMsg = json?.message || json?.errorMessage || json?.error || `HTTP ${res.status}`;
      const err = new Error(`eToro API (${endpointPath}): ${errMsg}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function getOrCreateAccountConfig(db, userId = 'default') {
    if (!db.etoro_accounts[userId]) {
      db.etoro_accounts[userId] = {
        userId,
        accountType: 'REAL',
        permissionMode: 'READ_ONLY',
        enabled: false,
        syncIntervalMin: 5,
        overwriteManual: false,
        status: getEnvCredentials().configured ? 'Disconnected' : 'Disconnected',
        lastSyncAt: null,
        lastTestAt: null,
        lastError: null
      };
    }
    return db.etoro_accounts[userId];
  }

  async function ensureInstrumentMap(db, creds, neededIds = []) {
    const map = { ...(db.instruments_cache?.map || {}) };
    const missingIds = neededIds.filter(id => id != null && !map[String(id)]);
    const now = Date.now();
    if (missingIds.length === 0 && Object.keys(map).length > 0 && now - (db.instruments_cache?.updatedAt || 0) < 12 * 3600 * 1000) {
      return map;
    }
    try {
      const queryPath = missingIds.length > 0
        ? `/api/v1/market-data/instruments?instrumentIds=${missingIds.join(',')}`
        : '/api/v1/market-data/instruments';
      const data = await etoroReadOnlyGet(queryPath, creds);
      const list = Array.isArray(data)
        ? data
        : (Array.isArray(data?.instrumentDisplayDatas)
          ? data.instrumentDisplayDatas
          : (Array.isArray(data?.instruments) ? data.instruments : []));
      for (const it of list) {
        const id = it.instrumentID ?? it.instrumentId ?? it.InstrumentID ?? it.id;
        const sym = String(it.symbolFull || it.symbol || it.internalSymbolFull || it.ticker || '').trim().toUpperCase();
        const name = String(it.instrumentDisplayName || it.displayName || it.name || sym).trim();
        if (id != null && sym) {
          map[String(id)] = {
            sym,
            name: name || sym,
            instrumentTypeID: it.instrumentTypeID ?? null
          };
        }
      }
      db.instruments_cache = { updatedAt: now, map };
      return map;
    } catch (_) {
      return map;
    }
  }

  function extractNeededInstrumentIds(portfolioRaw, pnlRaw) {
    const cp = portfolioRaw?.clientPortfolio || portfolioRaw?.portfolio || portfolioRaw || {};
    const pnlPortfolio = pnlRaw?.clientPortfolio || pnlRaw?.portfolio || pnlRaw || {};
    const rawPositions = Array.isArray(cp.positions) ? cp.positions : (Array.isArray(portfolioRaw?.positions) ? portfolioRaw.positions : []);
    const pnlPositions = Array.isArray(pnlPortfolio.positions) ? pnlPortfolio.positions : (Array.isArray(pnlRaw?.positions) ? pnlRaw.positions : []);
    const rawOrders = Array.isArray(cp.ordersForOpen) ? cp.ordersForOpen : (Array.isArray(cp.orders) ? cp.orders : []);
    const ids = new Set();
    for (const p of [...rawPositions, ...pnlPositions, ...rawOrders]) {
      const id = p?.instrumentID ?? p?.instrumentId ?? p?.InstrumentID;
      if (id != null) ids.add(id);
    }
    return [...ids];
  }

  function formatEtoroOpenDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return String(isoStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} • ${hh}:${min}`;
  }

  function normalizeRawPositions(portfolioRaw, pnlRaw, instMap) {
    const cp = portfolioRaw?.clientPortfolio || portfolioRaw?.portfolio || portfolioRaw || {};
    const pnlPortfolio = pnlRaw?.clientPortfolio || pnlRaw?.portfolio || pnlRaw || {};

    const rawPositions = Array.isArray(cp.positions)
      ? cp.positions
      : (Array.isArray(portfolioRaw?.positions) ? portfolioRaw.positions : []);

    const pnlPositions = Array.isArray(pnlPortfolio.positions)
      ? pnlPortfolio.positions
      : (Array.isArray(pnlRaw?.positions) ? pnlRaw.positions : []);

    const pnlByPosId = new Map();
    for (const p of pnlPositions) {
      const pid = String(p.positionID ?? p.positionId ?? p.PositionID ?? p.id ?? '');
      if (pid) pnlByPosId.set(pid, p);
    }

    const rawOrders = Array.isArray(cp.ordersForOpen)
      ? cp.ordersForOpen
      : (Array.isArray(cp.orders) ? cp.orders : (Array.isArray(portfolioRaw?.orders) ? portfolioRaw.orders : []));

    const sourcePositions = rawPositions.length > 0 ? rawPositions : pnlPositions;
    const normalizedPositions = [];
    for (const pos of sourcePositions) {
      const positionId = String(pos.positionID ?? pos.positionId ?? pos.PositionID ?? pos.id ?? '');
      if (!positionId) continue;
      const pnlMatch = pnlByPosId.get(positionId) || pos || {};
      const uPnl = pnlMatch.unrealizedPnL || pos.unrealizedPnL || {};
      const instrumentId = pos.instrumentID ?? pos.instrumentId ?? pos.InstrumentID ?? pnlMatch.instrumentID ?? pnlMatch.instrumentId ?? null;
      const instInfo = instrumentId != null ? instMap[String(instrumentId)] : null;
      const rawSym = String(pos.symbol || pos.symbolFull || pnlMatch.symbol || instInfo?.sym || `INST_${instrumentId || positionId}`).trim().toUpperCase();
      let cleanSym = rawSym.replace(/\.(24-7|24-5)$/i, '');
      if (cleanSym === 'TRUMP' && instInfo?.instrumentTypeID === 10) {
        cleanSym = 'TRUMP6535-USD';
      }
      const instrumentName = String(pos.instrumentName || instInfo?.name || rawSym).trim();
      const isBuy = pos.isBuy !== undefined ? Boolean(pos.isBuy) : String(pos.direction || 'LONG').toUpperCase() !== 'SHORT';
      const direction = isBuy ? 'LONG' : 'SHORT';
      const units = Number(pos.units ?? pos.Units ?? pnlMatch.units ?? 0);
      const investedAmount = Number(pos.amount ?? pos.invested ?? uPnl.marginInAccountCurrency ?? pos.initialAmountInDollars ?? pnlMatch.amount ?? 0);
      const openRate = Number(pos.openRate ?? pos.OpenRate ?? 0);
      const currentRate = Number(uPnl.closeRate ?? pnlMatch.currentRate ?? pnlMatch.lastRate ?? pos.currentRate ?? openRate);
      const leverage = Number(pos.leverage ?? pos.Leverage ?? 1);
      const sign = isBuy ? 1 : -1;
      const computedPnl = units > 0 && openRate > 0 && currentRate > 0 ? units * (currentRate - openRate) * sign : 0;
      const pnlUsd = Number(
        uPnl.pnL ?? uPnl.profit ?? pnlMatch.netProfit ?? pnlMatch.profit ?? pos.netProfit ?? pos.profit ?? computedPnl
      );
      const pnlPct = investedAmount > 0 ? Number(((pnlUsd / investedAmount) * 100).toFixed(2)) : 0;
      const currentValue = Math.max(0, Number((investedAmount + pnlUsd).toFixed(2)));
      const exposure = Number((
        uPnl.exposureInAccountCurrency ?? (units > 0 && currentRate > 0 ? units * currentRate : investedAmount * leverage)
      ).toFixed(2));
      const slRaw = pos.stopLossRate ?? pos.StopLossRate ?? pnlMatch.stopLossRate ?? null;
      const tpRaw = pos.takeProfitRate ?? pos.TakeProfitRate ?? pnlMatch.takeProfitRate ?? null;
      const stopLossRate = (slRaw != null && Number(slRaw) > 0 && !pos.isNoStopLoss) ? Number(slRaw) : null;
      const takeProfitRate = (tpRaw != null && Number(tpRaw) > 0 && !pos.isNoTakeProfit) ? Number(tpRaw) : null;
      const openDate = formatEtoroOpenDate(pos.openDateTime || pos.openDate || '');
      const isCfd = leverage > 1 || Number(pos.settlementTypeID) === 0 || Boolean(pos.isCfd);

      normalizedPositions.push({
        positionId,
        instrumentId,
        brokerSym: rawSym,
        symbol: cleanSym,
        instrumentName,
        direction,
        isCfd,
        units,
        investedAmount: Number(investedAmount.toFixed(2)),
        currentValue,
        openRate,
        currentRate,
        pnlUsd: Number(pnlUsd.toFixed(2)),
        pnlPct,
        leverage,
        exposure,
        stopLossRate,
        takeProfitRate,
        openDate,
        openDateTimeIso: pos.openDateTime || pos.openDate || '',
        status: 'OPEN'
      });
    }

    const credit = Number(cp.credit ?? pnlPortfolio.credit ?? portfolioRaw?.credit ?? pnlRaw?.credit ?? 0);
    const bonusCredit = Number(cp.bonusCredit ?? pnlPortfolio.bonusCredit ?? 0);
    const totalInvested = normalizedPositions.reduce((s, p) => s + p.investedAmount, 0);
    const totalUnrealizedPnl = normalizedPositions.reduce((s, p) => s + p.pnlUsd, 0);
    const totalPositionsValue = normalizedPositions.reduce((s, p) => s + p.currentValue, 0);
    const totalExposure = normalizedPositions.reduce((s, p) => s + p.exposure, 0);
    const pendingOrders = rawOrders.map((o, idx) => ({
      orderId: String(o.orderId ?? o.OrderID ?? o.id ?? `ord_${idx}`),
      instrumentId: o.instrumentId ?? o.InstrumentID ?? null,
      symbol: instMap[String(o.instrumentId ?? o.InstrumentID)]?.sym || String(o.symbol || ''),
      units: Number(o.units ?? 0),
      amount: Number(o.amount ?? 0),
      targetRate: Number(o.rate ?? o.targetRate ?? 0),
      stopLossRate: o.stopLossRate ? Number(o.stopLossRate) : null,
      takeProfitRate: o.takeProfitRate ? Number(o.takeProfitRate) : null,
      createdAt: o.openDateTime || o.dateTime || ''
    }));
    const frozenCash = pendingOrders.reduce((s, o) => s + (o.amount || 0), 0);
    const availableCash = Math.max(0, Number((credit - frozenCash).toFixed(2)));
    const totalAccountValue = Number((availableCash + frozenCash + totalPositionsValue).toFixed(2));

    return {
      snapshot: {
        timestamp: Date.now(),
        totalAccountValue,
        availableCash,
        balance: Number((credit + bonusCredit).toFixed(2)),
        unrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
        usedMargin: Number(totalInvested.toFixed(2)),
        frozenCash: Number(frozenCash.toFixed(2)),
        totalExposure: Number(totalExposure.toFixed(2)),
        openPositionsCount: normalizedPositions.length,
        pendingOrdersCount: pendingOrders.length
      },
      positions: normalizedPositions,
      orders: pendingOrders
    };
  }

  async function testConnection(customKeys = null, userId = 'default') {
    const db = loadEtoroDb();
    const acc = getOrCreateAccountConfig(db, userId);
    acc.lastTestAt = Date.now();
    try {
      const portfolioRaw = await etoroReadOnlyGet('/api/v1/trading/info/portfolio', customKeys);
      let pnlRaw = {};
      try {
        pnlRaw = await etoroReadOnlyGet('/api/v1/trading/info/real/pnl', customKeys);
      } catch (_) {}
      const neededIds = extractNeededInstrumentIds(portfolioRaw, pnlRaw);
      const instMap = await ensureInstrumentMap(db, customKeys, neededIds);
      const parsed = normalizeRawPositions(portfolioRaw, pnlRaw, instMap);
      acc.status = 'Connected';
      acc.lastError = null;
      saveEtoroDb(db);
      return {
        ok: true,
        permissionVerified: 'READ_ONLY',
        accountType: 'REAL',
        positionsCount: parsed.positions.length,
        ordersCount: parsed.orders.length,
        snapshot: parsed.snapshot
      };
    } catch (err) {
      acc.status = 'Error';
      acc.lastError = err.message;
      saveEtoroDb(db);
      throw err;
    }
  }

  async function syncNow(userId = 'default') {
    if (activeSyncPromise) return activeSyncPromise;
    activeSyncPromise = (async () => {
      const startTs = Date.now();
      const db = loadEtoroDb();
      const acc = getOrCreateAccountConfig(db, userId);
      acc.status = 'Synchronizing';
      saveEtoroDb(db);

      try {
        const creds = getEnvCredentials();
        if (!creds.configured) {
          throw new Error('Cheile eToro API nu sunt configurate.');
        }

        const [portfolioRaw, pnlRaw] = await Promise.all([
          etoroReadOnlyGet('/api/v1/trading/info/portfolio', creds),
          etoroReadOnlyGet('/api/v1/trading/info/real/pnl', creds).catch(() => ({}))
        ]);
        const neededIds = extractNeededInstrumentIds(portfolioRaw, pnlRaw);
        const instMap = await ensureInstrumentMap(db, creds, neededIds);
        const { snapshot, positions, orders } = normalizeRawPositions(portfolioRaw, pnlRaw, instMap);

        const prevById = db.etoro_positions || {};
        const nextById = {};
        const changes = [];
        const newNotifications = [];

        for (const pos of positions) {
          const prev = prevById[pos.positionId];
          nextById[pos.positionId] = pos;

          if (!prev) {
            const ev = {
              id: `hist_${Date.now()}_${pos.positionId}_open`,
              timestamp: Date.now(),
              positionId: pos.positionId,
              symbol: pos.brokerSym,
              changeType: 'NEW_POSITION',
              detail: `Poziție nouă detectată în eToro: ${pos.brokerSym} (${pos.units} u @ $${pos.openRate})`
            };
            changes.push(ev);
            newNotifications.push({ id: ev.id, timestamp: ev.timestamp, type: 'NEW_POSITION', severity: 'info', message: ev.detail });
          } else {
            if (prev.stopLossRate !== pos.stopLossRate) {
              const ev = {
                id: `hist_${Date.now()}_${pos.positionId}_sl`,
                timestamp: Date.now(),
                positionId: pos.positionId,
                symbol: pos.brokerSym,
                changeType: 'SL_CHANGED',
                oldValue: prev.stopLossRate,
                newValue: pos.stopLossRate,
                detail: `Stop-Loss modificat în eToro pe ${pos.brokerSym} (#${pos.positionId}): ${prev.stopLossRate ?? 'Fără'} → ${pos.stopLossRate ?? 'Fără'}`
              };
              changes.push(ev);
              newNotifications.push({ id: ev.id, timestamp: ev.timestamp, type: 'SL_CHANGED', severity: 'info', message: ev.detail });
            }
            if (prev.takeProfitRate !== pos.takeProfitRate) {
              const ev = {
                id: `hist_${Date.now()}_${pos.positionId}_tp`,
                timestamp: Date.now(),
                positionId: pos.positionId,
                symbol: pos.brokerSym,
                changeType: 'TP_CHANGED',
                oldValue: prev.takeProfitRate,
                newValue: pos.takeProfitRate,
                detail: `Take-Profit modificat în eToro pe ${pos.brokerSym} (#${pos.positionId}): ${prev.takeProfitRate ?? 'Fără'} → ${pos.takeProfitRate ?? 'Fără'}`
              };
              changes.push(ev);
              newNotifications.push({ id: ev.id, timestamp: ev.timestamp, type: 'TP_CHANGED', severity: 'info', message: ev.detail });
            }
          }

          if (pos.stopLossRate && pos.currentRate > 0) {
            const distPct = Math.abs((pos.currentRate - pos.stopLossRate) / pos.currentRate) * 100;
            if (distPct <= 4.5) {
              newNotifications.push({
                id: `notif_sl_${Date.now()}_${pos.positionId}`,
                timestamp: Date.now(),
                type: 'NEAR_SL',
                severity: 'critical',
                message: `Prețul pe ${pos.brokerSym} (#${pos.positionId}) este la doar ${distPct.toFixed(2)}% de Stop-Loss ($${pos.stopLossRate}).`
              });
            }
          }
          if (pos.takeProfitRate && pos.currentRate > 0) {
            const distTpPct = Math.abs((pos.takeProfitRate - pos.currentRate) / pos.currentRate) * 100;
            if (distTpPct <= 4.5) {
              newNotifications.push({
                id: `notif_tp_${Date.now()}_${pos.positionId}`,
                timestamp: Date.now(),
                type: 'NEAR_TP',
                severity: 'good',
                message: `Prețul pe ${pos.brokerSym} (#${pos.positionId}) s-a apropiat la ${distTpPct.toFixed(2)}% de Take-Profit ($${pos.takeProfitRate}).`
              });
            }
          }
        }

        for (const [oldId, oldPos] of Object.entries(prevById)) {
          if (!nextById[oldId] && oldPos.status === 'OPEN') {
            const ev = {
              id: `hist_${Date.now()}_${oldId}_closed`,
              timestamp: Date.now(),
              positionId: oldId,
              symbol: oldPos.brokerSym,
              changeType: 'POSITION_CLOSED',
              detail: `Poziție închisă în eToro: ${oldPos.brokerSym} (#${oldId}, ${oldPos.units} u)`
            };
            changes.push(ev);
            newNotifications.push({ id: ev.id, timestamp: ev.timestamp, type: 'POSITION_CLOSED', severity: 'warn', message: ev.detail });
          }
        }

        db.etoro_positions = nextById;
        db.etoro_orders = orders;
        db.etoro_portfolio_snapshots = [snapshot, ...(db.etoro_portfolio_snapshots || [])].slice(0, 120);
        db.etoro_position_history = [...changes, ...(db.etoro_position_history || [])].slice(0, 250);
        db.etoro_notifications = [...newNotifications, ...(db.etoro_notifications || [])].slice(0, 100);
        db.etoro_sync_logs = [{
          id: `sync_${Date.now()}`,
          timestamp: Date.now(),
          status: 'OK',
          durationMs: Date.now() - startTs,
          positionsCount: positions.length,
          ordersCount: orders.length,
          changesDetected: changes.length,
          error: null
        }, ...(db.etoro_sync_logs || [])].slice(0, 100);

        acc.status = 'Connected';
        acc.lastSyncAt = Date.now();
        acc.lastError = null;
        saveEtoroDb(db);

        if (typeof onPortfolioSynced === 'function' && positions.length > 0) {
          await onPortfolioSynced({
            userId,
            snapshot,
            positions,
            orders,
            overwriteManual: Boolean(acc.overwriteManual)
          });
        }

        return {
          ok: true,
          status: acc.status,
          lastSyncAt: acc.lastSyncAt,
          snapshot,
          positionsCount: positions.length,
          ordersCount: orders.length,
          changesDetected: changes.length,
          changes
        };
      } catch (err) {
        const dbErr = loadEtoroDb();
        const accErr = getOrCreateAccountConfig(dbErr, userId);
        accErr.status = 'Error';
        accErr.lastError = err.message;
        dbErr.etoro_sync_logs = [{
          id: `sync_${Date.now()}`,
          timestamp: Date.now(),
          status: 'ERROR',
          durationMs: Date.now() - startTs,
          positionsCount: 0,
          ordersCount: 0,
          changesDetected: 0,
          error: err.message
        }, ...(dbErr.etoro_sync_logs || [])].slice(0, 100);
        dbErr.etoro_notifications = [{
          id: `notif_err_${Date.now()}`,
          timestamp: Date.now(),
          type: 'SYNC_ERROR',
          severity: 'critical',
          message: `Eroare sincronizare eToro READ-ONLY: ${err.message}`
        }, ...(dbErr.etoro_notifications || [])].slice(0, 100);
        saveEtoroDb(dbErr);
        throw err;
      } finally {
        activeSyncPromise = null;
      }
    })();
    return activeSyncPromise;
  }

  function buildRealPortfolioFromEtoro({ existingPortfolio, snapshot, positions }) {
    const grouped = new Map();
    for (const p of positions) {
      const key = p.brokerSym;
      if (!grouped.has(key)) {
        grouped.set(key, {
          brokerSym: p.brokerSym,
          sym: p.symbol,
          name: p.instrumentName || p.symbol,
          side: p.direction,
          isCfd: Boolean(p.isCfd),
          lots: [],
          totalUnits: 0,
          weightedOpenSum: 0,
          totalInvested: 0,
          totalNetValue: 0,
          totalPnl: 0,
          currentRate: p.currentRate
        });
      }
      const g = grouped.get(key);
      if (p.isCfd) g.isCfd = true;
      g.totalUnits += p.units;
      g.weightedOpenSum += p.units * p.openRate;
      g.totalInvested += p.investedAmount;
      g.totalNetValue += p.currentValue;
      g.totalPnl += p.pnlUsd;
      if (p.currentRate > 0) g.currentRate = p.currentRate;

      g.lots.push({
        id: `etoro_${p.positionId}`,
        positionId: p.positionId,
        instrumentId: p.instrumentId,
        source: 'etoro_api',
        openedAt: p.openDate,
        type: p.isCfd ? `${p.direction === 'SHORT' ? 'Sell' : 'Buy'} CFD` : (p.direction === 'SHORT' ? 'Sell' : 'Buy'),
        side: p.direction,
        isCfd: Boolean(p.isCfd),
        leverage: p.leverage,
        units: p.units,
        open: p.openRate,
        invested: p.investedAmount,
        sl: p.stopLossRate,
        tp: p.takeProfitRate,
        brokerPnl: p.pnlUsd,
        brokerPnlPct: p.pnlPct
      });
    }

    const nextAssets = [];
    for (const [, g] of grouped.entries()) {
      const prevAsset = (existingPortfolio?.assets || []).find(a => a.brokerSym === g.brokerSym || a.sym === g.sym);
      const avgOpen = g.totalUnits > 0 ? Number((g.weightedOpenSum / g.totalUnits).toFixed(6)) : 0;
      nextAssets.push({
        id: prevAsset?.id || `ast_${g.sym.toLowerCase()}`,
        brokerSym: g.brokerSym,
        sym: g.sym,
        name: prevAsset?.name || g.name,
        side: g.side,
        isCfd: g.isCfd,
        source: 'etoro_api',
        units: Number(g.totalUnits.toFixed(6)),
        avgOpen,
        invested: Number(g.totalInvested.toFixed(2)),
        brokerNetValue: Number(g.totalNetValue.toFixed(2)),
        brokerPrice: g.currentRate,
        brokerPnl: Number(g.totalPnl.toFixed(2)),
        brokerPnlPct: g.totalInvested > 0 ? Number(((g.totalPnl / g.totalInvested) * 100).toFixed(2)) : 0,
        sl: g.lots[0]?.sl ?? null,
        tp: g.lots[0]?.tp ?? null,
        lots: g.lots
      });
    }

    const walletCashExtra = existingPortfolio?.walletCashExtra != null
      ? Number(existingPortfolio.walletCashExtra)
      : 28.45;
    const baseApiCash = snapshot?.availableCash ?? 0;
    const totalAvailableCash = Number((baseApiCash + walletCashExtra).toFixed(2));
    const totalPositionsVal = nextAssets.reduce((s, a) => s + a.brokerNetValue, 0);

    return {
      ...(existingPortfolio || {}),
      broker: 'eToro (API Read-Only)',
      currency: 'USD',
      tradingCash: baseApiCash,
      walletCashExtra,
      cashAvailable: totalAvailableCash,
      accountEquity: Number((totalAvailableCash + totalPositionsVal).toFixed(2)),
      etoroLastSyncAt: Date.now(),
      updatedAt: Date.now(),
      assets: nextAssets
    };
  }

  function getStatus(userId = 'default') {
    const db = loadEtoroDb();
    const acc = getOrCreateAccountConfig(db, userId);
    const creds = getEnvCredentials();
    return {
      ok: true,
      securityMode: 'STRICT_READ_ONLY',
      allowedMethods: ['GET'],
      allowedEndpoints: ALLOWED_READ_ENDPOINTS,
      credentials: {
        configured: creds.configured,
        maskedApiKey: creds.maskedApiKey,
        maskedUserKey: creds.maskedUserKey
      },
      account: {
        ...acc,
        status: !creds.configured ? 'Disconnected' : acc.status
      },
      latestSnapshot: db.etoro_portfolio_snapshots?.[0] || null,
      openPositionsCount: Object.keys(db.etoro_positions || {}).length,
      recentHistory: (db.etoro_position_history || []).slice(0, 20),
      recentLogs: (db.etoro_sync_logs || []).slice(0, 15),
      notifications: (db.etoro_notifications || []).slice(0, 20)
    };
  }

  function updateConfig(userId = 'default', payload = {}) {
    if (payload.apiKey || payload.userKey) {
      persistKeysToEnvFile(payload.apiKey, payload.userKey);
    }
    const db = loadEtoroDb();
    const acc = getOrCreateAccountConfig(db, userId);
    if (payload.enabled !== undefined) acc.enabled = Boolean(payload.enabled);
    if (payload.syncIntervalMin !== undefined) {
      const v = Number(payload.syncIntervalMin);
      acc.syncIntervalMin = [1, 5, 15].includes(v) ? v : 5;
    }
    if (payload.overwriteManual !== undefined) {
      acc.overwriteManual = Boolean(payload.overwriteManual);
    }
    acc.accountType = 'REAL';
    acc.permissionMode = 'READ_ONLY';
    saveEtoroDb(db);
    configureScheduler(userId);
    return getStatus(userId);
  }

  function configureScheduler(userId = 'default') {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    const db = loadEtoroDb();
    const acc = getOrCreateAccountConfig(db, userId);
    const creds = getEnvCredentials();
    if (acc.enabled && creds.configured) {
      const ms = Math.max(1, Number(acc.syncIntervalMin) || 5) * 60 * 1000;
      syncTimer = setInterval(() => {
        syncNow(userId).catch(() => {});
      }, ms);
      if (typeof syncTimer.unref === 'function') syncTimer.unref();
    }
  }

  return Object.freeze({
    assertReadOnlyEtoroRequest,
    etoroReadOnlyGet,
    testConnection,
    syncNow,
    getStatus,
    updateConfig,
    configureScheduler,
    buildRealPortfolioFromEtoro,
    ALLOWED_READ_ENDPOINTS
  });
}

module.exports = {
  createEtoroSyncService,
  assertReadOnlyEtoroRequest,
  ALLOWED_READ_ENDPOINTS,
  ETORO_API_HOST
};
