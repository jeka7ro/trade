require('dotenv').config({ quiet: true });
const http = require('http');
const https = require('https');
const dns = require('dns');
const fs = require('fs');
const path = require('path');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Initialize yahoo-finance2 with schema validation noise disabled
const YahooFinancePkg = require('yahoo-finance2');
const YFClass = YahooFinancePkg.default || YahooFinancePkg;
const yf = typeof YFClass === 'function'
  ? new YFClass({ suppressNotices: ['yahooSurvey', 'ripHistorical'], validation: { logErrors: false } })
  : YFClass;
const QuantEngine = require('./quant-engine.js');
const discoveredMetaMap = new Map();

// Short-TTL in-memory cache so parallel UI panels never hit rate limits
const memCache = new Map();
function getCached(key, ttlMs) {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  return null;
}
function setCached(key, data) {
  if (memCache.size > 400) {
    const oldest = memCache.keys().next().value;
    memCache.delete(oldest);
  }
  memCache.set(key, { ts: Date.now(), data });
}

// Pre-verified Official TradingView S3 Vector Logo Slugs (200 OK SVG)
const SERVER_VERIFIED_LOGOIDS = {
  NVDA: 'nvidia', APPS: 'digital-turbine', ONDS: 'ondas', TSLA: 'tesla',
  AAPL: 'apple', MSFT: 'microsoft', AMZN: 'amazon', META: 'meta-platforms',
  GOOGL: 'alphabet', GOOG: 'alphabet', NFLX: 'netflix', AMD: 'advanced-micro-devices',
  AVGO: 'broadcom', PLTR: 'palantir', CRWD: 'crowdstrike', COIN: 'coinbase',
  UBER: 'uber', SHOP: 'shopify', JPM: 'jpmorgan-chase', LLY: 'eli-lilly',
  RKLB: 'rocket-lab', ASTS: 'ast-spacemobile', IONQ: 'ionq', SOFI: 'sofi',
  HOOD: 'robinhood', MSTR: 'strategy-cad-hedged-cibc-cdr', SMCI: 'super-micro-computer',
  ARM: 'arm', MU: 'micron-technology', PANW: 'palo-alto-networks', SNOW: 'snowflake',
  INTC: 'intel', BA: 'boeing', DIS: 'walt-disney', V: 'visa', MA: 'mastercard',
  WMT: 'walmart', COST: 'costco-wholesale', XOM: 'exxon', CVX: 'chevron',
  LULU: 'lululemon-athletica', GME: 'gamestop', ORCL: 'oracle', NIO: 'nio', PYPL: 'paypal',
  TSM: 'taiwan-semiconductor', ASML: 'asml', BABA: 'alibaba', QCOM: 'qualcomm',
  UNH: 'unitedhealth', KO: 'coca-cola', MCD: 'mcdonalds', NKE: 'nike',
  RIVN: 'rivian', MARA: 'marathon-digital-holdings', DKNG: 'draftkings',
  NET: 'cloudflare-inc', DDOG: 'datadog', DELL: 'dell', OKLO: 'altc',
  RGTI: 'rigetti-computing-redeemable', LUNR: 'intuitive-machines', ACHR: 'archer-aviation',
  HIMS: 'hims-and-hers-health', RDDT: 'reddit', APP: 'applovin-cdr-cad-hedged',
  CVNA: 'carvana', SPOT: 'spotify-technology', ABNB: 'airbnb',
  'BRK-B': 'berkshire-hathaway', 'BRK.B': 'berkshire-hathaway',
  SPY: 'spdr-sandp500-etf-tr', GLD: 'spdr-sandp500-etf-tr', XLF: 'spdr-sandp500-etf-tr', XLE: 'spdr-sandp500-etf-tr',
  QQQ: 'invesco', VOO: 'vanguard', VTI: 'vanguard',
  IWM: 'ishares', IBIT: 'ishares', SLV: 'ishares', TLT: 'ishares', IEF: 'ishares', SHY: 'ishares', HYG: 'ishares', LQD: 'ishares', AGG: 'ishares', TIP: 'ishares',
  ARKK: 'ark-etf-tr', TQQQ: 'proshares', SQQQ: 'proshares', SOXL: 'direxion', SMH: 'vaneck',
  'GC=F': 'metal/gold', 'SI=F': 'metal/silver', 'HG=F': 'metal/copper',
  'CL=F': 'crude-oil', 'BZ=F': 'crude-oil', 'NG=F': 'natural-gas',
  'NQ=F': 'indices/nasdaq-100', 'ES=F': 'indices/s-and-p-500', 'YM=F': 'indices/dow-30',
  '^NDX': 'indices/nasdaq-100', '^IXIC': 'indices/nasdaq-composite', '^GSPC': 'indices/s-and-p-500',
  '^DJI': 'indices/dow-30', '^RUT': 'indices/russell-2000', '^VIX': 'indices/volatility-s-and-p-500', '^TNX': 'country/US',
  'EURUSD=X': 'country/EU', 'GBPUSD=X': 'country/GB', 'USDJPY=X': 'country/JP',
  'USDCHF=X': 'country/CH', 'USDCAD=X': 'country/CA', 'AUDUSD=X': 'country/AU', 'EURRON=X': 'country/RO'
};

const logoBinCache = new Map();
const US_PRIMARY_EXCH = /^(NASDAQ|NYSE|NYSE ARCA|AMEX|BATS|CBOE|CME|COMEX|NYMEX|CBOT|OTC)$/i;

function buildFallbackMonogramSvg(sym) {
  const clean = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'TP';
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = ((hash << 5) - hash) + clean.charCodeAt(i);
  const palette = ['#1E53E5', '#089981', '#7B1FA2', '#E65100', '#00838F', '#C62828', '#283593'];
  const bg = palette[Math.abs(hash) % palette.length];
  const fontSize = clean.length >= 3 ? 17 : 21;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="${bg}"/><text x="28" y="35" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-0.5">${clean}</text></svg>`;
}

async function resolveOfficialLogoAsset(rawSym) {
  const upper = String(rawSym || '').trim().toUpperCase();
  const hit = logoBinCache.get(upper);
  if (hit && Date.now() - hit.ts < 12 * 3600 * 1000) return hit;

  let logoid = SERVER_VERIFIED_LOGOIDS[upper] || '';
  if (!logoid && upper.endsWith('-USD')) {
    logoid = `crypto/XTVC${upper.replace('-USD', '')}`;
  } else if (!logoid && upper.endsWith('=X') && upper.length >= 6) {
    logoid = `country/${upper.slice(0, 2)}`;
  }

  const cleanQuery = upper.replace(/=X|=F|\^/g, '');
  if (!logoid && cleanQuery) {
    try {
      const tvSearchUrl = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(cleanQuery)}&hl=0&lang=en&domain=production`;
      const data = await handleYahooProxyTarget(tvSearchUrl);
      const list = Array.isArray(data?.symbols) ? data.symbols : [];
      const altDot = cleanQuery.replace(/-/g, '.');
      const exactList = list.filter(it => {
        const s = String(it.symbol || '').replace(/<[^>]+>/g, '').trim().toUpperCase();
        return s === cleanQuery || s === altDot;
      });
      const best =
        exactList.find(it => it.logoid && it.country === 'US' && US_PRIMARY_EXCH.test(String(it.exchange || '').replace(/<[^>]+>/g, '').trim())) ||
        exactList.find(it => it.logoid && it.country === 'US') ||
        exactList.find(it => it.logoid) ||
        list.find(it => it.logoid);
      if (best) {
        logoid = best.logoid || (best.country ? `country/${best.country}` : '');
      }
    } catch (_) {}
  }

  const candidateUrls = [];
  if (logoid) {
    candidateUrls.push(`https://s3-symbol-logo.tradingview.com/${logoid}--big.svg`);
  }
  const cleanTicker = cleanQuery.split('-')[0];
  if (cleanTicker && !upper.endsWith('=X') && !upper.endsWith('=F') && !upper.startsWith('^')) {
    candidateUrls.push(`https://assets.parqet.com/logos/symbol/${encodeURIComponent(cleanTicker)}?format=png`);
    candidateUrls.push(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(cleanTicker)}.png`);
  }

  for (const imgUrl of candidateUrls) {
    try {
      const r = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'image/svg+xml,image/png,image/*,*/*;q=0.8'
        }
      });
      if (r.ok) {
        const ct = r.headers.get('content-type') || (imgUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 64 && !ct.includes('text/html')) {
          const entry = { ts: Date.now(), contentType: ct, buf };
          if (logoBinCache.size > 600) logoBinCache.delete(logoBinCache.keys().next().value);
          logoBinCache.set(upper, entry);
          return entry;
        }
      }
    } catch (_) {}
  }

  const svgBuf = Buffer.from(buildFallbackMonogramSvg(upper), 'utf8');
  return { ts: Date.now(), contentType: 'image/svg+xml; charset=utf-8', buf: svgBuf };
}

function rangeToPeriod1(rangeStr, intervalStr) {
  const daysMap = {
    '1d': 2, '2d': 5, '5d': 7, '10d': 14, '25d': 30, '1mo': 32,
    '45d': 52, '3mo': 92, '90d': 95, '6mo': 184, '180d': 185,
    '1y': 366, '2y': 730, '5y': 1825, '10y': 3650, '15y': 5475
  };
  let days = daysMap[rangeStr] || 365;
  if (intervalStr === '1m') days = Math.min(days, 6);
  else if (['2m', '5m', '15m', '30m', '90m'].includes(intervalStr)) days = Math.min(days, 56);
  else if (['60m', '1h'].includes(intervalStr)) days = Math.min(days, 710);
  return new Date(Date.now() - days * 86400 * 1000);
}

async function handleYahooProxyTarget(targetUrlRaw) {
  const parsed = new URL(targetUrlRaw);
  const p = parsed.pathname;

  // 1. OHLCV Chart Endpoint: /v8/finance/chart/{SYMBOL}
  if (p.includes('/v8/finance/chart/')) {
    const rawSym = decodeURIComponent(p.split('/v8/finance/chart/')[1].split('/')[0]);
    const interval = parsed.searchParams.get('interval') || '1d';
    const range = parsed.searchParams.get('range') || '1y';
    const includePrePost = parsed.searchParams.get('includePrePost') === 'true';
    const cacheKey = `chart:${rawSym}:${interval}:${range}:${includePrePost ? 1 : 0}`;
    const isIntraday = ['1m', '2m', '5m', '15m', '30m'].includes(interval);
    const cached = getCached(cacheKey, isIntraday ? 1800 : 5000);
    if (cached) return cached;

    const validIntervals = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);
    const yfInterval = validIntervals.has(interval) ? interval : '1d';
    const period1 = rangeToPeriod1(range, yfInterval);

    const ch = await yf.chart(rawSym, { period1, interval: yfInterval, includePrePost }, { validateResult: false });
    const quotes = (ch?.quotes || []).filter(q => q && q.date && q.close != null);
    const payload = {
      chart: {
        result: [{
          meta: ch?.meta || { symbol: rawSym },
          timestamp: quotes.map(q => Math.floor(new Date(q.date).getTime() / 1000)),
          indicators: {
            quote: [{
              open: quotes.map(q => q.open ?? q.close),
              high: quotes.map(q => q.high ?? q.close),
              low: quotes.map(q => q.low ?? q.close),
              close: quotes.map(q => q.close),
              volume: quotes.map(q => q.volume ?? 0)
            }]
          }
        }],
        error: null
      }
    };
    setCached(cacheKey, payload);
    return payload;
  }

  // 2. Batch Live Quotes Endpoint: /v7/finance/quote?symbols=...
  if (p.includes('/v7/finance/quote')) {
    const symsRaw = parsed.searchParams.get('symbols') || '';
    const syms = symsRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (!syms.length) return { quoteResponse: { result: [], error: null } };

    const missing = [];
    const results = [];
    for (const s of syms) {
      const hit = getCached(`quote:${s.toUpperCase()}`, 850);
      if (hit) results.push(hit);
      else missing.push(s);
    }

    if (missing.length > 0) {
      try {
        const fetched = await yf.quote(missing, {}, { validateResult: false });
        const arr = Array.isArray(fetched) ? fetched : (fetched ? [fetched] : []);
        for (const q of arr) {
          if (q && q.symbol) {
            setCached(`quote:${String(q.symbol).toUpperCase()}`, q);
            results.push(q);
          }
        }
      } catch (_) {
        await Promise.all(missing.map(async (s) => {
          try {
            const single = await yf.quote(s, {}, { validateResult: false });
            if (single && single.symbol) {
              setCached(`quote:${String(single.symbol).toUpperCase()}`, single);
              results.push(single);
            }
          } catch (__) {}
        }));
      }
    }

    return { quoteResponse: { result: results, error: null } };
  }

  // 3. Global Symbol Search & News Endpoint: /v1/finance/search?q=...
  if (p.includes('/v1/finance/search')) {
    const q = parsed.searchParams.get('q') || '';
    const quotesCount = Number(parsed.searchParams.get('quotesCount') ?? 8);
    const newsCount = Number(parsed.searchParams.get('newsCount') ?? 5);
    const cacheKey = `search:${q.toUpperCase()}:${quotesCount}:${newsCount}`;
    const cached = getCached(cacheKey, 25000);
    if (cached) return cached;

    const sr = await yf.search(q, { quotesCount, newsCount }, { validateResult: false });
    const normNews = (sr?.news || []).map(n => ({
      ...n,
      title: n.title || 'Market Update',
      publisher: n.publisher || 'Yahoo Finance',
      link: n.link || n.canonicalUrl?.url || `https://finance.yahoo.com/quote/${encodeURIComponent(q)}`
    }));
    const payload = { quotes: sr?.quotes || [], news: normNews };
    setCached(cacheKey, payload);
    return payload;
  }

  // 3b. Official TradingView Symbol & LogoID Directory
  if (parsed.hostname.includes('tradingview.com')) {
    const cacheKey = `tvsym:${targetUrlRaw}`;
    const cached = getCached(cacheKey, 3600 * 1000);
    if (cached) return cached;

    const res = await fetch(targetUrlRaw, {
      headers: {
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`TradingView search HTTP ${res.status}`);
    const payload = await res.json();
    setCached(cacheKey, payload);
    return payload;
  }

  // 4. Generic HTTPS fallback
  return new Promise((resolve, reject) => {
    https.get(targetUrlRaw, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    }, (r) => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (_) { reject(new Error(`Upstream HTTP ${r.statusCode}`)); }
      });
    }).on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TWO-WAY TELEGRAM BRIDGE (SELECTIVE NOTIFICATIONS + INTERACTIVE COMMANDS)
// ═══════════════════════════════════════════════════════════════════════════
const TG_STATE_FILE = path.join(__dirname, 'telegram_state.json');

const DEFAULT_TG_PREFS = {
  enabled: true,
  alerts: true,
  signals: true,
  trades: true,
  scanner: false,
  minScore: 72
};

const tgRuntime = {
  runtimeToken: process.env.TELEGRAM_TOKEN || '',
  chatId: String(process.env.CHAT_ID || '').trim(),
  botUsername: '',
  botFirstName: '',
  botOk: false,
  pollingActive: false,
  updateOffset: 0,
  prefs: { ...DEFAULT_TG_PREFS },
  sentKeys: {},
  logs: [],
  uiActions: [],
  lastBrowserSyncTs: 0,
  terminal: {
    activeSymbol: 'NVDA',
    activeTf: '15m',
    lastPrice: null,
    watchlist: ['ONDS', 'APPS', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMZN', 'BTC-USD', 'SPY'],
    alerts: [],
    paper: { balance: 10000, closedPnl: 0, positions: [] },
    currentPlan: null
  }
};

function loadTgState() {
  try {
    if (fs.existsSync(TG_STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TG_STATE_FILE, 'utf8'));
      if (raw.chatIdOverride) tgRuntime.chatId = String(raw.chatIdOverride).trim();
      if (raw.prefs && typeof raw.prefs === 'object') {
        tgRuntime.prefs = {
          enabled: raw.prefs.enabled !== false,
          alerts: raw.prefs.alerts !== false,
          signals: raw.prefs.signals !== false,
          trades: raw.prefs.trades !== false,
          scanner: !!raw.prefs.scanner,
          minScore: Math.max(55, Math.min(95, Number(raw.prefs.minScore) || 72))
        };
      }
      if (Array.isArray(raw.watchlist) && raw.watchlist.length) {
        tgRuntime.terminal.watchlist = raw.watchlist;
      }
      if (Array.isArray(raw.alerts)) {
        tgRuntime.terminal.alerts = raw.alerts;
      }
      if (raw.sentKeys && typeof raw.sentKeys === 'object') {
        tgRuntime.sentKeys = raw.sentKeys;
      }
      if (Array.isArray(raw.logs)) {
        tgRuntime.logs = raw.logs.slice(0, 40);
      }
    }
  } catch (_) {}
}

function saveTgState() {
  try {
    const now = Date.now();
    for (const k of Object.keys(tgRuntime.sentKeys)) {
      if (now - (tgRuntime.sentKeys[k] || 0) > 48 * 3600 * 1000) {
        delete tgRuntime.sentKeys[k];
      }
    }
    const payload = {
      chatIdOverride: tgRuntime.chatId !== String(process.env.CHAT_ID || '').trim() ? tgRuntime.chatId : '',
      prefs: tgRuntime.prefs,
      watchlist: tgRuntime.terminal.watchlist.slice(0, 80),
      alerts: (tgRuntime.terminal.alerts || []).slice(0, 120),
      sentKeys: tgRuntime.sentKeys,
      logs: tgRuntime.logs.slice(0, 40)
    };
    fs.writeFileSync(TG_STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) {}
}

loadTgState();

function escHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtNum(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1000) return n.toFixed(2);
  if (a >= 1) return n.toFixed(2);
  if (a >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function normalizeSymServer(raw) {
  let s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9.^=\-]/g, '');
  const aliases = {
    BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD', EGLD: 'EGLD-USD',
    GOLD: 'GC=F', XAUUSD: 'GC=F', OIL: 'CL=F', USOIL: 'CL=F', NAS100: 'NQ=F', NASDAQ: 'NQ=F',
    SPX: '^GSPC', SP500: 'ES=F', EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X', EURRON: 'EURRON=X'
  };
  return aliases[s] || s;
}

function pushTgLog(dir, category, summary) {
  const timeStr = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  tgRuntime.logs.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    time: timeStr,
    dir,
    category,
    summary: String(summary || '').slice(0, 140)
  });
  if (tgRuntime.logs.length > 40) tgRuntime.logs.length = 40;
}

function enqueueUiAction(action) {
  tgRuntime.uiActions.push({ id: Date.now() + Math.random(), ...action });
  if (tgRuntime.uiActions.length > 50) tgRuntime.uiActions.shift();
}

function maskBotToken(tok) {
  if (!tok || tok.length < 12) return '';
  return `${tok.slice(0, 6)}...${tok.slice(-4)}`;
}

async function tgApi(method, body = {}, timeoutMs = 12000) {
  const tok = tgRuntime.runtimeToken;
  if (!tok) throw new Error('TELEGRAM_TOKEN lipsă');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${tok}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const json = await res.json();
    if (!json.ok) {
      const err = new Error(json.description || `Telegram HTTP ${res.status}`);
      err.code = json.error_code || res.status;
      throw err;
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

function buildSymbolInlineKeyboard(sym, tf = '15m') {
  const cleanTf = String(tf || '15m').toLowerCase();
  const altTf = cleanTf === '15m' ? '1h' : '15m';
  return [
    [
      { text: `Grafic ${sym} (${cleanTf.toUpperCase()})`, callback_data: `g:${sym}:${cleanTf}` },
      { text: `Grafic ${altTf.toUpperCase()}`, callback_data: `g:${sym}:${altTf}` }
    ],
    [
      { text: `Ordin Long`, callback_data: `ord:${sym}:buy` },
      { text: `Ordin Short`, callback_data: `ord:${sym}:sell` }
    ],
    [
      { text: `Alertă +3%`, callback_data: `alpct:${sym}:3` },
      { text: `Alertă -3%`, callback_data: `alpct:${sym}:-3` },
      { text: `+ Watchlist`, callback_data: `wla:${sym}` }
    ]
  ];
}

function buildPrefsInlineKeyboard() {
  const p = tgRuntime.prefs;
  const st = (b) => b ? 'ACTIV' : 'OPRIT';
  return [
    [
      { text: `Master: ${st(p.enabled)}`, callback_data: 'tog:enabled' },
      { text: `Prag Scor: ${p.minScore}+`, callback_data: 'tog:score' }
    ],
    [
      { text: `Alerte Preț: ${st(p.alerts)}`, callback_data: 'tog:alerts' },
      { text: `Semnale A/A+: ${st(p.signals)}`, callback_data: 'tog:signals' }
    ],
    [
      { text: `Ordine Paper: ${st(p.trades)}`, callback_data: 'tog:trades' },
      { text: `Auto-Scan 15m: ${st(p.scanner)}`, callback_data: 'tog:scanner' }
    ]
  ];
}

function formatPrefsMessageHtml() {
  const p = tgRuntime.prefs;
  const onOff = (b) => b ? '<b>ACTIV</b>' : '<code>OPRIT</code>';
  return (
    `<b>TradePro · Filtru Notificări Telegram</b>\n` +
    `Chat ID: <code>${escHtml(tgRuntime.chatId || 'nesetat')}</code> · Bot: <code>@${escHtml(tgRuntime.botUsername || 'activ')}</code>\n\n` +
    `Flux general notificări: ${onOff(p.enabled)}\n` +
    `1. Alerte Preț &amp; Tehnice: ${onOff(p.alerts)}\n` +
    `2. Semnale Confirmate (Scor &ge; ${p.minScore}): ${onOff(p.signals)}\n` +
    `3. Execuții &amp; Închideri Paper: ${onOff(p.trades)}\n` +
    `4. Scanare Automată Watchlist (15m): ${onOff(p.scanner)}\n\n` +
    `Apasă pe butoanele de mai jos pentru a activa sau opri instant orice categorie.`
  );
}

async function sendTelegramNotification({ chatId, html, replyMarkup = null, category = 'system', dedupKey = '', summary = '' }) {
  const targetChat = String(chatId || tgRuntime.chatId || '').trim();
  if (!tgRuntime.runtimeToken || !targetChat) {
    return { ok: false, error: 'Token sau Chat ID lipsă' };
  }

  const bypassFilter = category === 'reply' || category === 'test' || category === 'manual';
  if (!bypassFilter) {
    if (!tgRuntime.prefs.enabled) return { ok: true, skipped: 'muted' };
    if (category === 'alerts' && !tgRuntime.prefs.alerts) return { ok: true, skipped: 'alerts_off' };
    if (category === 'signals' && !tgRuntime.prefs.signals) return { ok: true, skipped: 'signals_off' };
    if (category === 'trades' && !tgRuntime.prefs.trades) return { ok: true, skipped: 'trades_off' };
    if (category === 'scanner' && !tgRuntime.prefs.scanner) return { ok: true, skipped: 'scanner_off' };
  }

  if (dedupKey) {
    const prevTs = tgRuntime.sentKeys[dedupKey];
    if (prevTs && Date.now() - prevTs < 6 * 3600 * 1000) {
      return { ok: true, skipped: 'dedup' };
    }
    tgRuntime.sentKeys[dedupKey] = Date.now();
  }

  const payload = {
    chat_id: targetChat,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const sent = await tgApi('sendMessage', payload, 12000);
  if (category !== 'reply') {
    pushTgLog('out', category, summary || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    saveTgState();
  }
  return { ok: true, messageId: sent.message_id };
}

// Server-side technical calculation for /pret, /scan, and background alerts
function calcEmaArr(vals, period) {
  const out = new Array(vals.length).fill(0);
  if (!vals.length) return out;
  const k = 2 / (period + 1);
  let e = vals[0];
  out[0] = e;
  for (let i = 1; i < vals.length; i++) {
    e = vals[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function calcRsiLast(closes, period = 14) {
  if (closes.length <= period) return 50;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= period;
  avgL /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - (100 / (1 + avgG / avgL));
}

function calcAtrLast(bars, period = 14) {
  if (!bars.length) return 0;
  let atr = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    atr = i < period ? ((atr * i + tr) / (i + 1)) : ((atr * (period - 1) + tr) / period);
  }
  return atr;
}

async function analyzeSymbolServer(rawSym, rawTf = '15m') {
  const sym = normalizeSymServer(rawSym);
  const tfMap = {
    '1m': { interval: '1m', range: '5d' },
    '5m': { interval: '5m', range: '10d' },
    '15m': { interval: '15m', range: '25d' },
    '30m': { interval: '30m', range: '45d' },
    '1h': { interval: '60m', range: '90d' },
    '4h': { interval: '60m', range: '180d' },
    '1d': { interval: '1d', range: '1y' }
  };
  const normTf = String(rawTf || '15m').toLowerCase();
  const cfg = tfMap[normTf] || tfMap['15m'];
  const incEth = ['1m', '5m', '15m', '30m', '60m'].includes(cfg.interval) ? '&includePrePost=true' : '';

  const [chartRes, quoteRes] = await Promise.all([
    handleYahooProxyTarget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${cfg.interval}&range=${cfg.range}${incEth}`),
    handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`).catch(() => null)
  ]);

  const r0 = chartRes?.chart?.result?.[0];
  const ts = r0?.timestamp || [];
  const q0 = r0?.indicators?.quote?.[0] || {};
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    if (q0.close?.[i] != null && isFinite(q0.close[i])) {
      bars.push({
        time: ts[i],
        open: q0.open?.[i] ?? q0.close[i],
        high: q0.high?.[i] ?? q0.close[i],
        low: q0.low?.[i] ?? q0.close[i],
        close: q0.close[i],
        volume: q0.volume?.[i] ?? 0
      });
    }
  }
  if (bars.length < 20) throw new Error(`Date insuficiente pentru ${sym}`);

  const liveQ = quoteRes?.quoteResponse?.result?.[0] || {};
  const lastBar = bars[bars.length - 1];
  const price = liveQ.regularMarketPrice ?? lastBar.close;
  const prevClose = liveQ.regularMarketPreviousClose ?? bars[bars.length - 2].close;
  const chg = liveQ.regularMarketChange ?? (price - prevClose);
  const chgPct = liveQ.regularMarketChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);
  const name = liveQ.shortName || liveQ.longName || r0?.meta?.shortName || sym;
  const dayLow = liveQ.regularMarketDayLow ?? lastBar.low;
  const dayHigh = liveQ.regularMarketDayHigh ?? lastBar.high;

  const mktState = String(liveQ.marketState || '').toUpperCase();
  let extLabel = '';
  let extPrice = null;
  let extChgPct = null;
  if (mktState !== 'REGULAR') {
    const hasPre = liveQ.preMarketPrice != null && isFinite(liveQ.preMarketPrice);
    const hasPost = liveQ.postMarketPrice != null && isFinite(liveQ.postMarketPrice);
    if ((mktState === 'PRE' || mktState === 'PREPRE') && hasPre) {
      extLabel = 'Pre-Market';
      extPrice = liveQ.preMarketPrice;
      extChgPct = liveQ.preMarketChangePercent ?? (price ? ((extPrice - price) / price) * 100 : 0);
    } else if ((mktState === 'POST' || mktState === 'POSTPOST') && hasPost) {
      extLabel = 'Post-Market';
      extPrice = liveQ.postMarketPrice;
      extChgPct = liveQ.postMarketChangePercent ?? (price ? ((extPrice - price) / price) * 100 : 0);
    } else if (hasPre || hasPost) {
      const usePre = hasPre && (!hasPost || (liveQ.preMarketTime || 0) >= (liveQ.postMarketTime || 0));
      extLabel = usePre ? 'Pre-Market' : 'Post-Market';
      extPrice = usePre ? liveQ.preMarketPrice : liveQ.postMarketPrice;
      extChgPct = usePre
        ? (liveQ.preMarketChangePercent ?? (price ? ((extPrice - price) / price) * 100 : 0))
        : (liveQ.postMarketChangePercent ?? (price ? ((extPrice - price) / price) * 100 : 0));
    }
  }

  const closes = bars.map(b => b.close);
  const ema21Arr = calcEmaArr(closes, 21);
  const ema50Arr = calcEmaArr(closes, 50);
  const ema21 = ema21Arr[ema21Arr.length - 1];
  const ema50 = ema50Arr[ema50Arr.length - 1];
  const rsi = calcRsiLast(closes, 14);
  const atr = Math.max(price * 0.004, calcAtrLast(bars, 14));

  const recentVols = bars.slice(-21, -1).map(b => b.volume || 0).filter(v => v > 0);
  const avgVol = recentVols.length ? recentVols.reduce((s, v) => s + v, 0) / recentVols.length : 1;
  const rvol = avgVol > 0 ? Math.max(0.2, (lastBar.volume || avgVol) / avgVol) : 1.0;

  let bull = 40, bear = 40;
  if (price > ema21) bull += 14; else bear += 14;
  if (ema21 > ema50) bull += 14; else bear += 14;
  if (rsi >= 45 && rsi <= 68) bull += 12;
  else if (rsi < 34) bull += 10;
  if (rsi <= 55 && rsi >= 32) bear += 12;
  else if (rsi > 70) bear += 10;
  if (rvol >= 1.2) {
    if (lastBar.close >= lastBar.open) bull += 10;
    else bear += 10;
  }
  bull = Math.min(96, Math.round(bull));
  bear = Math.min(96, Math.round(bear));

  const isBuy = bull >= bear;
  const score = Math.max(bull, bear);
  const bias = score < 58 ? 'NEUTRU' : (isBuy ? 'LONG' : 'SHORT');
  const risk = 1.5 * atr;
  const sl = isBuy ? price - risk : price + risk;
  const tp1 = isBuy ? price + 1.5 * risk : price - 1.5 * risk;
  const tp2 = isBuy ? price + 3.0 * risk : price - 3.0 * risk;

  return {
    sym, tf: normTf, name, price, chg, chgPct, dayLow, dayHigh,
    extLabel, extPrice, extChgPct,
    rsi, ema21, ema50, atr, rvol, isBuy, bias, score, sl, tp1, tp2
  };
}

function formatAnalysisHtml(a) {
  const sign = a.chg >= 0 ? '+' : '';
  const slPct = (((a.sl - a.price) / a.price) * 100).toFixed(2);
  const tp1Pct = (((a.tp1 - a.price) / a.price) * 100).toFixed(2);
  const tp2Pct = (((a.tp2 - a.price) / a.price) * 100).toFixed(2);
  const extLine = (a.extLabel && a.extPrice != null && isFinite(a.extPrice))
    ? `${a.extLabel}: <b>${fmtNum(a.extPrice)}</b> (${(a.extChgPct || 0) >= 0 ? '+' : ''}${(a.extChgPct || 0).toFixed(2)}%)\n`
    : '';

  return (
    `<b>${escHtml(a.sym)} · ${escHtml(a.name)}</b>  <code>${escHtml(a.tf.toUpperCase())}</code>\n` +
    `Preț Sesiune: <b>${fmtNum(a.price)}</b> (${sign}${a.chgPct.toFixed(2)}% | ${sign}${fmtNum(a.chg)})\n` +
    extLine +
    `Interval Zi: <code>${fmtNum(a.dayLow)} – ${fmtNum(a.dayHigh)}</code> · RVOL: <code>${a.rvol.toFixed(2)}x</code>\n\n` +
    `<b>Confluență Tehnică</b>\n` +
    `Regim: <b>${a.bias} · Scor ${a.score}/100</b>\n` +
    `RSI(14): <code>${a.rsi.toFixed(1)}</code> · EMA21: <code>${fmtNum(a.ema21)}</code> · EMA50: <code>${fmtNum(a.ema50)}</code>\n\n` +
    `<b>Plan R:R (ATR)</b>\n` +
    `Referință: <code>${fmtNum(a.price)}</code>\n` +
    `Stop-Loss: <code>${fmtNum(a.sl)}</code> (${slPct}%)\n` +
    `TP1 (1.5R): <code>${fmtNum(a.tp1)}</code> (${tp1Pct >= 0 ? '+' : ''}${tp1Pct}%)\n` +
    `TP2 (3.0R): <code>${fmtNum(a.tp2)}</code> (${tp2Pct >= 0 ? '+' : ''}${tp2Pct}%)`
  );
}

function inferCatFromQuote(sym, q, fallbackCat = 'Acțiuni') {
  const qt = String(q?.quoteType || '').toUpperCase();
  if (sym.endsWith('-USD') || qt === 'CRYPTOCURRENCY') return 'Crypto';
  if (sym.endsWith('=F') || qt === 'FUTURE') return 'Futures';
  if (sym.endsWith('=X') || qt === 'CURRENCY') return 'Forex';
  if (sym.startsWith('^') || qt === 'INDEX') return 'Indici';
  if (qt === 'ETF') return 'ETF';
  return fallbackCat;
}

async function fetchTvScannerMovers(sortBy, sortOrder, rangeMax, filters) {
  try {
    const res = await fetch('https://scanner.tradingview.com/america/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/'
      },
      body: JSON.stringify({
        filter: filters,
        options: { lang: 'en' },
        markets: ['america'],
        symbols: { query: { types: [] }, tickers: [] },
        columns: ['name', 'description', 'logoid', 'close', 'change', 'volume', 'relative_volume_10d_calc', 'Recommend.All', 'exchange'],
        sort: { sortBy, sortOrder },
        range: [0, rangeMax]
      }),
      signal: AbortSignal.timeout(5500)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    for (const row of (data?.data || [])) {
      const d = row?.d || [];
      const rawName = String(d[0] || '').trim().toUpperCase();
      if (!rawName || rawName.includes('/') || rawName.length > 6) continue;
      const sym = rawName.replace(/\./g, '-');
      const meta = {
        sym,
        name: String(d[1] || sym),
        logoid: String(d[2] || ''),
        close: Number(d[3]) || 0,
        chgPct: Number(d[4]) || 0,
        volume: Number(d[5]) || 0,
        rvol: Number(d[6]) || 1,
        tvRec: Number.isFinite(d[7]) ? Number(d[7]) : null,
        exch: String(d[8] || 'US'),
        cat: 'Acțiuni'
      };
      if (meta.logoid && !SERVER_VERIFIED_LOGOIDS[sym]) {
        SERVER_VERIFIED_LOGOIDS[sym] = meta.logoid;
      }
      discoveredMetaMap.set(sym, meta);
      out.push(meta);
    }
    return out;
  } catch (_) {
    return [];
  }
}

async function discoverLiveMarketUniverse() {
  const cached = getCached('mkt:universe:v2', 120000);
  if (cached) return cached;

  const baseFilters = [
    { left: 'close', operation: 'greater', right: 5.0 },
    { left: 'Value.Traded', operation: 'greater', right: 25000000 },
    { left: 'market_cap_basic', operation: 'greater', right: 700000000 },
    { left: 'volume', operation: 'greater', right: 800000 },
    { left: 'type', operation: 'in_range', right: ['stock', 'dr'] }
  ];

  const [tvRvolRes, tvVolRes, gainRes, loseRes, actRes, trendRes] = await Promise.allSettled([
    fetchTvScannerMovers('relative_volume_10d_calc', 'desc', 20, baseFilters),
    fetchTvScannerMovers('volume', 'desc', 18, [
      ...baseFilters,
      { left: 'relative_volume_10d_calc', operation: 'greater', right: 1.05 }
    ]),
    yf.screener('day_gainers', { count: 14 }, { validateResult: false }),
    yf.screener('day_losers', { count: 14 }, { validateResult: false }),
    yf.screener('most_actives', { count: 16 }, { validateResult: false }),
    yf.trendingSymbols('US', { count: 14 }, { validateResult: false })
  ]);

  const tvRvol = tvRvolRes.status === 'fulfilled' ? tvRvolRes.value : [];
  const tvVol = tvVolRes.status === 'fulfilled' ? tvVolRes.value : [];

  const isLiquidYahooQuote = (q) => {
    if (!q || !q.symbol) return false;
    const px = Number(q.regularMarketPrice) || 0;
    const vol = Number(q.regularMarketVolume) || 0;
    const mcap = Number(q.marketCap) || 0;
    if (px < 5.0) return false;
    if (mcap > 0 && mcap < 500000000) return false;
    if (vol > 0 && px * vol < 15000000) return false;
    return true;
  };

  const gainers = (gainRes.status === 'fulfilled' ? (gainRes.value?.quotes || []) : []).filter(isLiquidYahooQuote).map(q => q.symbol);
  const losers = (loseRes.status === 'fulfilled' ? (loseRes.value?.quotes || []) : []).filter(isLiquidYahooQuote).map(q => q.symbol);
  const actives = (actRes.status === 'fulfilled' ? (actRes.value?.quotes || []) : []).filter(isLiquidYahooQuote).map(q => q.symbol);
  const trending = (trendRes.status === 'fulfilled' ? (trendRes.value?.quotes || []) : []).map(q => q.symbol).filter(Boolean);

  const wlSyms = (tgRuntime?.terminal?.watchlist || []).slice(0, 12);
  const coreBenchmarks = [
    'NVDA', 'TSLA', 'AMD', 'META', 'AAPL', 'MSFT', 'AMZN', 'PLTR', 'SMCI',
    'COIN', 'MSTR', 'AVGO', 'NFLX', 'ORCL', 'ARM', 'MU', 'CRWD', 'PANW',
    'SHOP', 'UBER', 'HOOD', 'SOFI', 'HIMS', 'APPS', 'ONDS', 'APP', 'LLY',
    'SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'BTC-USD', 'ETH-USD', 'SOL-USD', 'GC=F', 'CL=F', 'NQ=F'
  ];
  const wlSet = new Set(wlSyms.map(normalizeSymServer));
  const coreSet = new Set(coreBenchmarks.map(normalizeSymServer));

  const ordered = [];
  const seen = new Set();
  function pushSym(raw) {
    const s = normalizeSymServer(raw);
    if (!s || seen.has(s)) return;
    if (s.includes('/') || s.length > 10) return;
    // Skip exotic OTC foreign ADRs ending in Y/F or SPAC/Warrants unless explicitly core/watchlist
    if (!wlSet.has(s) && !coreSet.has(s)) {
      if (s.length >= 5 && (s.endsWith('Y') || s.endsWith('F') || s.endsWith('W') || s.endsWith('R') || s.endsWith('U'))) return;
    }
    seen.add(s);
    ordered.push(s);
  }

  wlSyms.slice(0, 10).forEach(pushSym);
  const maxMoverLen = Math.max(tvRvol.length, tvVol.length, gainers.length, losers.length, actives.length, trending.length);
  for (let i = 0; i < maxMoverLen; i++) {
    if (tvRvol[i]) pushSym(tvRvol[i].sym);
    if (tvVol[i]) pushSym(tvVol[i].sym);
    if (gainers[i]) pushSym(gainers[i]);
    if (losers[i]) pushSym(losers[i]);
    if (actives[i]) pushSym(actives[i]);
    if (trending[i]) pushSym(trending[i]);
  }
  coreBenchmarks.forEach(pushSym);

  const payload = {
    candidates: ordered.slice(0, 44),
    wlSet,
    coreSet,
    sourceCounts: {
      tvScanner: new Set([...tvRvol.map(x => x.sym), ...tvVol.map(x => x.sym)]).size,
      yahooGainers: gainers.length,
      yahooLosers: losers.length,
      yahooActives: actives.length,
      yahooTrending: trending.length
    }
  };
  setCached('mkt:universe:v2', payload);
  return payload;
}

const OPPS_TF_MAP = {
  '15m': { interval: '15m', range: '25d', eth: true },
  '30m': { interval: '30m', range: '45d', eth: true },
  '1h':  { interval: '60m', range: '90d', eth: true },
  '1d':  { interval: '1d',  range: '1y',  eth: false }
};

function selectTopOppsFromPool(pool, dir = 'all', limit = 10) {
  const normDir = ['buy', 'sell'].includes(String(dir).toLowerCase()) ? String(dir).toLowerCase() : 'all';
  const cap = Math.max(1, Math.min(20, Number(limit) || 10));
  const rankWeight = x => {
    let w = (x.isFreshTrigger ? 34 : x.isActionable ? 18 : -15) + x.oppScore;
    if (x.totalTrades >= 5) {
      if (x.winRate >= 52 && x.profitFactor >= 1.15) w += 12;
      else if (x.winRate < 44 || x.profitFactor < 0.95) w -= 18;
    }
    return w;
  };

  let picked = [];
  if (normDir === 'buy') {
    const buys = pool.filter(x => x.direction === 'BUY').sort((a, b) => rankWeight(b) - rankWeight(a));
    picked = buys.slice(0, cap);
  } else if (normDir === 'sell') {
    const sells = pool.filter(x => x.direction === 'SELL').sort((a, b) => rankWeight(b) - rankWeight(a));
    picked = sells.slice(0, cap);
  } else {
    const buys = pool.filter(x => x.direction === 'BUY').sort((a, b) => rankWeight(b) - rankWeight(a));
    const sells = pool.filter(x => x.direction === 'SELL').sort((a, b) => rankWeight(b) - rankWeight(a));
    const half = Math.ceil(cap / 2);
    const chosen = new Map();
    for (const b of buys.slice(0, half)) chosen.set(b.sym, b);
    for (const s of sells.slice(0, half)) if (chosen.size < cap) chosen.set(s.sym, s);
    const rest = [...pool].sort((a, b) => rankWeight(b) - rankWeight(a));
    for (const r of rest) {
      if (chosen.size >= cap) break;
      if (!chosen.has(r.sym)) chosen.set(r.sym, r);
    }
    picked = Array.from(chosen.values()).sort((a, b) => rankWeight(b) - rankWeight(a)).slice(0, cap);
  }

  return picked.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function extractQuoteExtFields(q) {
  if (!q) return {};
  const price = q.regularMarketPrice;
  const chgPct = q.regularMarketChangePercent;
  const mktState = String(q.marketState || '').toUpperCase();
  let extType = '', extPrice = null, extChgPct = null;
  if (mktState !== 'REGULAR') {
    const hasPre = q.preMarketPrice != null && isFinite(q.preMarketPrice);
    const hasPost = q.postMarketPrice != null && isFinite(q.postMarketPrice);
    if ((mktState === 'PRE' || mktState === 'PREPRE') && hasPre) {
      extType = 'Pre-Market'; extPrice = q.preMarketPrice; extChgPct = q.preMarketChangePercent ?? null;
    } else if ((mktState === 'POST' || mktState === 'POSTPOST') && hasPost) {
      extType = 'Post-Market'; extPrice = q.postMarketPrice; extChgPct = q.postMarketChangePercent ?? null;
    } else if (hasPre || hasPost) {
      const usePre = hasPre && (!hasPost || (q.preMarketTime || 0) >= (q.postMarketTime || 0));
      extType = usePre ? 'Pre-Market' : 'Post-Market';
      extPrice = usePre ? q.preMarketPrice : q.postMarketPrice;
      extChgPct = usePre ? (q.preMarketChangePercent ?? null) : (q.postMarketChangePercent ?? null);
    }
  }
  return { price, chgPct, extType, extPrice, extChgPct };
}

async function computeTopMarketOpportunities({ tf = '30m', dir = 'all', limit = 10, forceRefresh = false } = {}) {
  const normTf = OPPS_TF_MAP[String(tf || '30m').toLowerCase()] ? String(tf || '30m').toLowerCase() : '30m';
  const cfg = OPPS_TF_MAP[normTf];
  const normDir = ['buy', 'sell'].includes(String(dir).toLowerCase()) ? String(dir).toLowerCase() : 'all';
  const cap = Math.max(1, Math.min(20, Number(limit) || 10));

  const cacheKey = `topOpps:v2:${normTf}`;
  let cachedPack = !forceRefresh ? getCached(cacheKey, 60000) : null;

  if (!cachedPack) {
    const universe = await discoverLiveMarketUniverse();
    const candidates = universe.candidates;

    // Fetch live quotes batch
    const quoteMap = new Map();
    try {
      const qRes = await handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(candidates.join(','))}`);
      for (const q of (qRes?.quoteResponse?.result || [])) {
        if (q?.symbol) quoteMap.set(String(q.symbol).toUpperCase(), q);
      }
    } catch (_) {}

    // Evaluate OHLCV + Institutional Quant & AI Strategist in bounded chunks of 8
    const evaluated = [];
    const chunkSize = 8;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const batch = candidates.slice(i, i + chunkSize);
      const batchRes = await Promise.allSettled(batch.map(async (sym) => {
        const q = quoteMap.get(sym);
        const pxHint = q?.regularMarketPrice;
        const inUserWl = universe.wlSet?.has(sym);
        const isCryptoOrFut = sym.endsWith('-USD') || sym.endsWith('=F');
        if (!inUserWl && !isCryptoOrFut && pxHint != null) {
          if (pxHint < 4.5) return null;
          if (q?.marketCap && q.marketCap < 500000000) return null;
        }

        const ethQ = cfg.eth ? '&includePrePost=true' : '';
        const ch = await handleYahooProxyTarget(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${cfg.interval}&range=${cfg.range}${ethQ}`
        );
        const r0 = ch?.chart?.result?.[0];
        const ts = r0?.timestamp || [];
        const q0 = r0?.indicators?.quote?.[0] || {};
        const bars = [];
        for (let k = 0; k < ts.length; k++) {
          const c = q0.close?.[k];
          if (c != null && isFinite(c) && c > 0) {
            bars.push({
              time: ts[k],
              open: q0.open?.[k] ?? c,
              high: q0.high?.[k] ?? c,
              low: q0.low?.[k] ?? c,
              close: c,
              volume: q0.volume?.[k] ?? 0
            });
          }
        }
        if (bars.length < 45) return null;

        const tvMeta = discoveredMetaMap.get(sym);
        const extFields = extractQuoteExtFields(q);
        const opp = QuantEngine.evaluateMarketOpportunity(sym, bars, {
          tf: normTf,
          quote: q,
          meta: r0?.meta,
          name: tvMeta?.name || q?.shortName || q?.longName || r0?.meta?.shortName || sym,
          cat: inferCatFromQuote(sym, q, tvMeta?.cat || 'Acțiuni'),
          exch: tvMeta?.exch || q?.exchange || r0?.meta?.exchangeName || 'US',
          tvRec: tvMeta?.tvRec ?? null,
          tvRvol: tvMeta?.rvol ?? null,
          ...extFields
        });
        return opp;
      }));

      for (const r of batchRes) {
        if (r.status === 'fulfilled' && r.value) evaluated.push(r.value);
      }
    }

    evaluated.sort((a, b) => ((b.isActionable ? 18 : 0) + b.oppScore) - ((a.isActionable ? 18 : 0) + a.oppScore));
    cachedPack = {
      generatedAt: Date.now(),
      scannedCount: candidates.length,
      sources: universe.sourceCounts,
      pool: evaluated
    };
    setCached(cacheKey, cachedPack);
  }

  const pool = cachedPack.pool || [];
  const opportunities = selectTopOppsFromPool(pool, normDir, cap);

  return {
    ok: true,
    tf: normTf,
    dir: normDir,
    generatedAt: cachedPack.generatedAt,
    scannedCount: cachedPack.scannedCount,
    evaluatedCount: pool.length,
    buyCount: pool.filter(x => x.direction === 'BUY').length,
    sellCount: pool.filter(x => x.direction === 'SELL').length,
    actionableCount: pool.filter(x => x.isActionable).length,
    sources: cachedPack.sources,
    opportunities
  };
}

async function generateSingleAITradeIdeaServer(rawSym, rawTf = '30m') {
  const sym = normalizeSymServer(rawSym || 'NVDA');
  const normTf = OPPS_TF_MAP[String(rawTf || '30m').toLowerCase()] ? String(rawTf || '30m').toLowerCase() : '30m';
  const cfg = OPPS_TF_MAP[normTf];
  const cacheKey = `aiIdea:${sym}:${normTf}`;
  const hit = getCached(cacheKey, 25000);
  if (hit) return hit;

  const ethQ = cfg.eth ? '&includePrePost=true' : '';
  const [chartRes, quoteRes, newsRes] = await Promise.all([
    handleYahooProxyTarget(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${cfg.interval}&range=${cfg.range}${ethQ}`),
    handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`).catch(() => null),
    yf.search(sym, { quotesCount: 0, newsCount: 4 }, { validateResult: false }).catch(() => null)
  ]);

  const r0 = chartRes?.chart?.result?.[0];
  const ts = r0?.timestamp || [];
  const q0 = r0?.indicators?.quote?.[0] || {};
  const bars = [];
  for (let k = 0; k < ts.length; k++) {
    const c = q0.close?.[k];
    if (c != null && isFinite(c) && c > 0) {
      bars.push({
        time: ts[k],
        open: q0.open?.[k] ?? c,
        high: q0.high?.[k] ?? c,
        low: q0.low?.[k] ?? c,
        close: c,
        volume: q0.volume?.[k] ?? 0
      });
    }
  }
  if (bars.length < 30) throw new Error(`Date insuficiente pentru ${sym}`);

  const q = quoteRes?.quoteResponse?.result?.[0] || {};
  const tvMeta = discoveredMetaMap.get(sym);
  const extFields = extractQuoteExtFields(q);
  const news = (newsRes?.news || []).slice(0, 4).map(n => ({
    title: n.title || '',
    publisher: n.publisher || 'Yahoo Finance',
    link: n.link || n.canonicalUrl?.url || '',
    publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : ''
  })).filter(x => x.title);

  const idea = QuantEngine.generateAITradeIdea(sym, bars, {
    tf: normTf,
    quote: q,
    meta: r0?.meta,
    name: tvMeta?.name || q?.shortName || q?.longName || r0?.meta?.shortName || sym,
    cat: inferCatFromQuote(sym, q, tvMeta?.cat || 'Acțiuni'),
    exch: tvMeta?.exch || q?.exchange || r0?.meta?.exchangeName || 'US',
    tvRvol: tvMeta?.rvol ?? null,
    news,
    ...extFields
  });
  setCached(cacheKey, idea);
  return idea;
}

function formatTopOppsTelegramHtml(pack) {
  const dirLabel = pack.dir === 'buy' ? 'DOAR BUY' : (pack.dir === 'sell' ? 'DOAR SELL' : 'TOP BUY & SELL');
  const lines = (pack.opportunities || []).map(o => {
    const chgSgn = o.chgPct >= 0 ? '+' : '';
    const actTag = o.direction === 'BUY' ? 'BUY' : 'SELL';
    const liveTag = o.isFreshTrigger ? 'ACUM' : (o.isActionable ? 'SETUP' : 'BIAS');
    return (
      `<b>#${o.rank} ${escHtml(o.sym)}</b> · <code>${actTag} ${o.grade} (${liveTag})</code> · Prob AI <b>${o.probPct || 55}%</b> · Scor <b>${o.oppScore}</b>\n` +
      `Preț: <b>${fmtNum(o.price)}</b> (${chgSgn}${o.chgPct.toFixed(2)}%) · WR <code>${o.winRate}%</code> · RVOL <code>${o.rvol}x</code>\n` +
      `Zonă Intrare: <code>${fmtNum(o.entryZoneLow ?? o.entry)}–${fmtNum(o.entryZoneHigh ?? o.entry)}</code> · SL: <code>${fmtNum(o.sl)}</code> · TP1: <code>${fmtNum(o.tp1)}</code> · TP2: <code>${fmtNum(o.tp2)}</code>\n` +
      `<i>${escHtml(o.aiThesis || o.setupArchetype)}</i>`
    );
  });

  return (
    `<b>TradePro AI · Top ${pack.opportunities.length} Idei (${dirLabel})</b>\n` +
    `TF: <code>${escHtml(pack.tf.toUpperCase())}</code> · Scanate: <b>${pack.evaluatedCount}</b> active lichide (${pack.buyCount} BUY / ${pack.sellCount} SELL)\n\n` +
    (lines.length ? lines.join('\n\n') : `Nicio oportunitate găsită momentan.`)
  );
}

const BOT_COMMANDS_SPEC = [
  { command: 'top10', description: 'Top 10 oportunitati BUY/SELL din piata (/top10 buy|sell)' },
  { command: 'pret', description: 'Cotatie live + analiza R:R (ex: /pret NVDA 15m)' },
  { command: 'grafic', description: 'Deschide simbol pe terminal (ex: /grafic TSLA 5m)' },
  { command: 'wl', description: 'Watchlist live sau modificare (/wl, /wl add APPS)' },
  { command: 'alerta', description: 'Seteaza alerta (ex: /alerta ONDS > 6.00)' },
  { command: 'alerte', description: 'Lista alerte active (/alerte sau /alerte clear)' },
  { command: 'scan', description: 'Scaneaza Watchlist pentru semnale Long/Short' },
  { command: 'portofoliu', description: 'Echitate si pozitii Paper Trading active' },
  { command: 'buy', description: 'Ordin Long Paper (ex: /buy NVDA)' },
  { command: 'short', description: 'Ordin Short Paper (ex: /short TSLA)' },
  { command: 'inchide', description: 'Inchide pozitie Paper (/inchide NVDA sau tot)' },
  { command: 'notificari', description: 'Selecteaza ce notificari primesti pe Telegram' },
  { command: 'help', description: 'Ghid complet de comenzi TradePro' }
];

function formatHelpHtml() {
  const t = tgRuntime.terminal;
  return (
    `<b>TradePro · Control Terminal &amp; Alerte Telegram</b>\n` +
    `Activ pe ecran: <code>${escHtml(t.activeSymbol)}</code> (${escHtml(String(t.activeTf || '15m').toUpperCase())})` +
    `${t.lastPrice ? ` · Preț: <b>${fmtNum(t.lastPrice)}</b>` : ''}\n\n` +
    `<b>Comenzi disponibile din Telegram:</b>\n` +
    `<code>/top10 [buy|sell] [tf]</code> — Top 10 oportunități BUY/SELL din toată piața\n` +
    `<code>/pret SIMBOL [TF]</code> — Cotație live, RSI, EMA și niveluri R:R\n` +
    `<code>/grafic SIMBOL [TF]</code> — Schimbă graficul activ în browser\n` +
    `<code>/wl</code> — Cotații live pentru tot Watchlist-ul\n` +
    `<code>/wl add SIMBOL</code> | <code>/wl del SIMBOL</code> — Modifică Watchlist\n` +
    `<code>/alerta SIMBOL &gt; PRET</code> sau <code>&lt; PRET</code> — Setează alertă\n` +
    `<code>/alerte</code> | <code>/alerte clear</code> — Vezi sau șterge alertele\n` +
    `<code>/scan</code> — Scanează Watchlist-ul după scor de confluență\n` +
    `<code>/portofoliu</code> — Sold, P&amp;L și poziții Paper deschise\n` +
    `<code>/buy SIMBOL</code> | <code>/short SIMBOL</code> — Ordin Paper cu SL/TP\n` +
    `<code>/inchide SIMBOL</code> | <code>/inchide tot</code> — Închide poziții\n` +
    `<code>/notificari</code> | <code>/mute</code> | <code>/unmute</code> — Filtru notificări`
  );
}

async function handleTelegramCommand(chatId, rawText, fromUser = '') {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return;

  const parts = trimmed.split(/\s+/);
  let cmdToken = parts[0].toLowerCase();
  if (cmdToken.startsWith('/')) cmdToken = cmdToken.slice(1);
  cmdToken = cmdToken.replace(/@[a-z0-9_]+$/i, '');
  const args = parts.slice(1);

  pushTgLog('in', 'cmd', `/${cmdToken}${args.length ? ' ' + args.join(' ') : ''}`);
  saveTgState();

  if (cmdToken === 'start' || cmdToken === 'help' || cmdToken === 'comenzi') {
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: formatHelpHtml(),
      replyMarkup: { inline_keyboard: buildPrefsInlineKeyboard() }
    });
    return;
  }

  if (cmdToken === 'notificari' || cmdToken === 'setari' || cmdToken === 'status') {
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: formatPrefsMessageHtml(),
      replyMarkup: { inline_keyboard: buildPrefsInlineKeyboard() }
    });
    return;
  }

  if (cmdToken === 'mute' || cmdToken === 'stop') {
    tgRuntime.prefs.enabled = false;
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>Notificările automate au fost oprite.</b>\nFolosește <code>/unmute</code> sau <code>/notificari</code> pentru reactivare.`
    });
    return;
  }

  if (cmdToken === 'unmute' || cmdToken === 'on') {
    tgRuntime.prefs.enabled = true;
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>Notificările selective au fost reactivate.</b>\nPrag semnale: <code>${tgRuntime.prefs.minScore}+</code>.`,
      replyMarkup: { inline_keyboard: buildPrefsInlineKeyboard() }
    });
    return;
  }

  if (cmdToken === 'prag') {
    const val = parseInt(args[0], 10);
    if (!isFinite(val) || val < 55 || val > 95) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Utilizare: <code>/prag 72</code> (valoare între 55 și 95).` });
      return;
    }
    tgRuntime.prefs.minScore = val;
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    await sendTelegramNotification({ chatId, category: 'reply', html: `Pragul minim pentru semnale automate a fost setat la <b>${val}/100</b>.` });
    return;
  }

  if (['pret', 'p', 'quote', 'analiza', 'semnal'].includes(cmdToken)) {
    const sym = normalizeSymServer(args[0] || tgRuntime.terminal.activeSymbol || 'NVDA');
    const tf = args[1] || tgRuntime.terminal.activeTf || '15m';
    try {
      const analysis = await analyzeSymbolServer(sym, tf);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatAnalysisHtml(analysis),
        replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(analysis.sym, analysis.tf) }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare la citirea simbolului <code>${escHtml(sym)}</code>: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['grafic', 'chart', 'open'].includes(cmdToken)) {
    const sym = normalizeSymServer(args[0] || '');
    if (!sym) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Utilizare: <code>/grafic TSLA 15m</code> sau <code>/grafic ONDS 5m</code>` });
      return;
    }
    const tf = String(args[1] || tgRuntime.terminal.activeTf || '15m').toLowerCase();
    tgRuntime.terminal.activeSymbol = sym;
    tgRuntime.terminal.activeTf = tf;
    enqueueUiAction({ type: 'OPEN_CHART', sym, tf });
    try {
      const a = await analyzeSymbolServer(sym, tf);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: `<b>Grafic trimis în terminal: ${escHtml(a.sym)} (${escHtml(tf.toUpperCase())})</b>\nPreț live: <b>${fmtNum(a.price)}</b> (${a.chgPct >= 0 ? '+' : ''}${a.chgPct.toFixed(2)}%) · Bias: <b>${a.bias} (${a.score})</b>`,
        replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(a.sym, tf) }
      });
    } catch (_) {
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: `<b>Grafic trimis în terminal: ${escHtml(sym)} (${escHtml(tf.toUpperCase())})</b>`
      });
    }
    return;
  }

  if (cmdToken === 'wl' || cmdToken === 'watchlist' || cmdToken === 'add' || cmdToken === 'del') {
    const sub = cmdToken === 'add' ? 'add' : cmdToken === 'del' ? 'del' : String(args[0] || '').toLowerCase();
    const symArg = (cmdToken === 'add' || cmdToken === 'del') ? args[0] : args[1];

    if (sub === 'add' && symArg) {
      const sym = normalizeSymServer(symArg);
      if (!tgRuntime.terminal.watchlist.includes(sym)) {
        tgRuntime.terminal.watchlist.unshift(sym);
      }
      saveTgState();
      enqueueUiAction({ type: 'WL_ADD', sym });
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: `Simbolul <b>${escHtml(sym)}</b> a fost adăugat în Watchlist.`,
        replyMarkup: { inline_keyboard: [[{ text: `Deschide ${sym}`, callback_data: `g:${sym}:15m` }, { text: `Analiză ${sym}`, callback_data: `an:${sym}` }]] }
      });
      return;
    }

    if ((sub === 'del' || sub === 'remove' || sub === 'rm') && symArg) {
      const sym = normalizeSymServer(symArg);
      tgRuntime.terminal.watchlist = tgRuntime.terminal.watchlist.filter(x => x !== sym);
      saveTgState();
      enqueueUiAction({ type: 'WL_DEL', sym });
      await sendTelegramNotification({ chatId, category: 'reply', html: `Simbolul <b>${escHtml(sym)}</b> a fost eliminat din Watchlist.` });
      return;
    }

    const syms = (tgRuntime.terminal.watchlist || []).slice(0, 18);
    if (!syms.length) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Watchlist gol. Adaugă cu <code>/wl add NVDA</code>.` });
      return;
    }
    const qRes = await handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms.join(','))}`).catch(() => null);
    const map = {};
    (qRes?.quoteResponse?.result || []).forEach(q => { if (q?.symbol) map[String(q.symbol).toUpperCase()] = q; });

    const lines = syms.map(s => {
      const q = map[s];
      const p = q?.regularMarketPrice != null ? fmtNum(q.regularMarketPrice) : '—';
      const pct = q?.regularMarketChangePercent != null ? `${q.regularMarketChangePercent >= 0 ? '+' : ''}${q.regularMarketChangePercent.toFixed(2)}%` : '—';
      return `<code>${s.padEnd(8, ' ')}</code> <b>${p}</b>  (${pct})`;
    });

    const quickRow = syms.slice(0, 4).map(s => ({ text: s, callback_data: `an:${s}` }));
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>Watchlist Live (${syms.length} simboluri)</b>\n\n${lines.join('\n')}\n\nApasă pe un simbol pentru analiză sau folosește <code>/wl add TICKER</code>.`,
      replyMarkup: quickRow.length ? { inline_keyboard: [quickRow] } : null
    });
    return;
  }

  if (cmdToken === 'alerta' || cmdToken === 'alert') {
    if (args.length < 2) {
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: `Utilizare:\n<code>/alerta ONDS &gt; 6.00</code>\n<code>/alerta APPS &lt; 7.10</code>\n<code>/alerta NVDA rsi&lt;30</code>`
      });
      return;
    }
    const sym = normalizeSymServer(args[0]);
    const rest = args.slice(1).join('').toLowerCase();
    let cond = 'price_up', dir = 'up', val = NaN;

    const rsiMatch = rest.match(/^rsi\s*([<>])\s*([0-9.]+)$/);
    const priceMatch = rest.match(/^([<>]=?)?\s*([0-9.]+)$/);

    if (rsiMatch) {
      cond = rsiMatch[1] === '<' ? 'rsi_lt' : 'rsi_gt';
      dir = rsiMatch[1] === '<' ? 'up' : 'dn';
      val = parseFloat(rsiMatch[2]);
    } else if (priceMatch) {
      val = parseFloat(priceMatch[2]);
      if (priceMatch[1] && priceMatch[1].startsWith('<')) {
        cond = 'price_dn';
        dir = 'dn';
      } else if (priceMatch[1] && priceMatch[1].startsWith('>')) {
        cond = 'price_up';
        dir = 'up';
      } else {
        try {
          const qRes = await handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`);
          const curP = qRes?.quoteResponse?.result?.[0]?.regularMarketPrice;
          if (isFinite(curP) && val < curP) { cond = 'price_dn'; dir = 'dn'; }
        } catch (_) {}
      }
    }

    if (!isFinite(val) || val <= 0) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Format invalid. Exemplu: <code>/alerta ${escHtml(sym)} &gt; 50.00</code>` });
      return;
    }

    const newAlert = {
      id: Date.now(),
      sym,
      cond,
      price: val,
      dir,
      telegram: true,
      permanent: true,
      triggered: false
    };
    tgRuntime.terminal.alerts = [newAlert, ...(tgRuntime.terminal.alerts || [])];
    saveTgState();
    enqueueUiAction({ type: 'ALERT_ADD', alert: newAlert });

    const condTxt = cond === 'price_up' ? `&ge; ${fmtNum(val)}`
                  : cond === 'price_dn' ? `&le; ${fmtNum(val)}`
                  : cond === 'rsi_lt' ? `RSI &lt; ${val}`
                  : `RSI &gt; ${val}`;
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>Alertă activată și sincronizată în terminal</b>\nSimbol: <b>${escHtml(sym)}</b> · Condiție: <code>${condTxt}</code>`
    });
    return;
  }

  if (cmdToken === 'alerte' || cmdToken === 'alerts') {
    if (String(args[0] || '').toLowerCase() === 'clear') {
      tgRuntime.terminal.alerts = [];
      saveTgState();
      enqueueUiAction({ type: 'ALERT_CLEAR' });
      await sendTelegramNotification({ chatId, category: 'reply', html: `Toate alertele active au fost șterse.` });
      return;
    }
    const active = (tgRuntime.terminal.alerts || []).filter(a => !a.triggered);
    if (!active.length) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Nicio alertă activă. Setează una cu <code>/alerta NVDA &gt; 170</code>.` });
      return;
    }
    const rows = active.slice(0, 12).map((a, idx) => {
      const op = a.cond === 'price_dn' ? '<=' : a.cond === 'rsi_lt' ? 'RSI <' : a.cond === 'rsi_gt' ? 'RSI >' : '>=';
      return `${idx + 1}. <b>${escHtml(a.sym)}</b> <code>${op} ${fmtNum(a.price)}</code>`;
    });
    const delButtons = active.slice(0, 4).map(a => ({ text: `Șterge ${a.sym}`, callback_data: `aldel:${a.id}` }));
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>Alerte Active (${active.length})</b>\n\n${rows.join('\n')}\n\nPentru ștergere completă: <code>/alerte clear</code>`,
      replyMarkup: delButtons.length ? { inline_keyboard: [delButtons] } : null
    });
    return;
  }

  if (['top10', 'top', 'oportunitati', 'opps', 'semnale'].includes(cmdToken)) {
    let dir = 'all';
    let tf = '30m';
    for (const rawArg of args) {
      const a = String(rawArg || '').toLowerCase();
      if (['buy', 'long'].includes(a)) dir = 'buy';
      else if (['sell', 'short'].includes(a)) dir = 'sell';
      else if (['15m', '30m', '1h', '1d'].includes(a)) tf = a;
    }
    try {
      const pack = await computeTopMarketOpportunities({ tf, dir, limit: 10, forceRefresh: false });
      const topRows = [];
      const row1 = (pack.opportunities || []).slice(0, 5).map(o => ({ text: `${o.sym} (${o.direction})`, callback_data: `an:${o.sym}` }));
      const row2 = [
        { text: 'Top 10 Mix', callback_data: `top10:${pack.tf}:all` },
        { text: 'Doar BUY', callback_data: `top10:${pack.tf}:buy` },
        { text: 'Doar SELL', callback_data: `top10:${pack.tf}:sell` }
      ];
      if (row1.length) topRows.push(row1);
      topRows.push(row2);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatTopOppsTelegramHtml(pack),
        replyMarkup: { inline_keyboard: topRows }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare la scanarea Top 10 piață: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['scan', 'screener'].includes(cmdToken)) {
    const baseList = Array.from(new Set([
      ...(tgRuntime.terminal.watchlist || []).slice(0, 10),
      'NVDA', 'TSLA', 'APPS', 'ONDS', 'AAPL', 'AMD', 'PLTR', 'META', 'BTC-USD', 'SPY'
    ])).slice(0, 12);

    const tf = String(args[0] || '15m').toLowerCase();
    const results = (await Promise.all(baseList.map(s => analyzeSymbolServer(s, tf).catch(() => null)))).filter(Boolean);
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, 7);

    if (!top.length) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Nu s-au putut prelua date pentru scanare.` });
      return;
    }

    const lines = top.map(r => {
      const sgn = r.chgPct >= 0 ? '+' : '';
      return `<b>${escHtml(r.sym)}</b> · <code>${r.bias} ${r.score}</code> · <b>${fmtNum(r.price)}</b> (${sgn}${r.chgPct.toFixed(2)}%) · RSI ${r.rsi.toFixed(0)}`;
    });
    const btns = top.slice(0, 4).map(r => ({ text: `${r.sym} (${r.bias})`, callback_data: `an:${r.sym}` }));
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>Rezultat Scanare Live (${escHtml(tf.toUpperCase())})</b>\n\n${lines.join('\n')}`,
      replyMarkup: { inline_keyboard: [btns] }
    });
    return;
  }

  if (['portofoliu', 'pozitii', 'balanta', 'paper'].includes(cmdToken)) {
    const p = tgRuntime.terminal.paper || { balance: 10000, closedPnl: 0, positions: [] };
    const pos = p.positions || [];
    let openPnl = 0;
    const lines = pos.map(it => {
      const cur = it.lastPrice ?? it.entry;
      const pnl = (it.isBuy ? (cur - it.entry) : (it.entry - cur)) * it.qty;
      openPnl += pnl;
      return `<b>${escHtml(it.sym)}</b> <code>${it.isBuy ? 'LONG' : 'SHORT'}</code> · ${it.qty} @ ${fmtNum(it.entry)} -> <b>${fmtNum(cur)}</b> (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`;
    });
    const eq = (Number(p.balance) || 10000) + openPnl;
    const closeBtns = pos.slice(0, 3).map(it => ({ text: `Închide ${it.sym}`, callback_data: `pclose:${it.sym}` }));

    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html:
        `<b>Portofoliu Paper Trading</b>\n` +
        `Echitate: <b>$${eq.toFixed(2)}</b> · Sold: <code>$${Number(p.balance || 10000).toFixed(2)}</code>\n` +
        `P&amp;L Deschis: <b>${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)}</b> · Realizat: <code>${(p.closedPnl || 0) >= 0 ? '+' : ''}$${Number(p.closedPnl || 0).toFixed(2)}</code>\n\n` +
        (lines.length ? lines.join('\n') : `Nicio poziție deschisă. Folosește <code>/buy NVDA</code> sau <code>/short TSLA</code>.`),
      replyMarkup: closeBtns.length ? { inline_keyboard: [closeBtns] } : null
    });
    return;
  }

  if (['buy', 'long', 'short', 'sell'].includes(cmdToken)) {
    const sym = normalizeSymServer(args[0] || tgRuntime.terminal.activeSymbol || '');
    if (!sym) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Utilizare: <code>/buy NVDA</code> sau <code>/short TSLA</code>` });
      return;
    }
    const side = (cmdToken === 'buy' || cmdToken === 'long') ? 'buy' : 'sell';
    try {
      const a = await analyzeSymbolServer(sym, tgRuntime.terminal.activeTf || '15m');
      const riskUsd = ((tgRuntime.terminal.paper?.balance || 10000) * 0.01);
      const sl = side === 'buy' ? a.price - 1.5 * a.atr : a.price + 1.5 * a.atr;
      const tp = side === 'buy' ? a.price + 3.0 * a.atr : a.price - 3.0 * a.atr;
      const qty = Math.max(0.01, +(riskUsd / Math.max(0.0001, Math.abs(a.price - sl))).toFixed(3));

      enqueueUiAction({ type: 'PAPER_ORDER', sym: a.sym, side, price: a.price, sl, tp, qty });
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html:
          `<b>Ordin Paper ${side === 'buy' ? 'LONG' : 'SHORT'} transmis</b>\n` +
          `Simbol: <b>${escHtml(a.sym)}</b> · Cantitate: <code>${qty}</code> @ <b>${fmtNum(a.price)}</b>\n` +
          `Stop-Loss: <code>${fmtNum(sl)}</code> · Take-Profit (3R): <code>${fmtNum(tp)}</code>`
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare la execuția ordinului pe ${escHtml(sym)}: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['inchide', 'close'].includes(cmdToken)) {
    const target = String(args[0] || '').trim().toUpperCase();
    if (!target) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Utilizare: <code>/inchide NVDA</code> sau <code>/inchide tot</code>` });
      return;
    }
    const sym = (target === 'TOT' || target === 'ALL') ? 'ALL' : normalizeSymServer(target);
    enqueueUiAction({ type: 'PAPER_CLOSE', sym });
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: sym === 'ALL'
        ? `Comandă transmisă: <b>Închidere toate pozițiile Paper</b>.`
        : `Comandă transmisă: <b>Închidere poziții Paper pe ${escHtml(sym)}</b>.`
    });
    return;
  }

  await sendTelegramNotification({
    chatId,
    category: 'reply',
    html: `Comandă necunoscută: <code>/${escHtml(cmdToken)}</code>. Scrie <code>/help</code> pentru lista de comenzi.`
  });
}

async function handleTelegramCallbackQuery(cb) {
  const data = String(cb.data || '');
  const chatId = cb.message?.chat?.id;
  const msgId = cb.message?.message_id;
  if (!chatId || !data) return;

  const [act, p1, p2] = data.split(':');
  pushTgLog('in', 'btn', `Buton Telegram: ${data}`);

  if (act === 'tog') {
    if (p1 === 'enabled') tgRuntime.prefs.enabled = !tgRuntime.prefs.enabled;
    else if (p1 === 'alerts') tgRuntime.prefs.alerts = !tgRuntime.prefs.alerts;
    else if (p1 === 'signals') tgRuntime.prefs.signals = !tgRuntime.prefs.signals;
    else if (p1 === 'trades') tgRuntime.prefs.trades = !tgRuntime.prefs.trades;
    else if (p1 === 'scanner') tgRuntime.prefs.scanner = !tgRuntime.prefs.scanner;
    else if (p1 === 'score') {
      const cycle = [65, 72, 80, 86];
      const idx = cycle.indexOf(tgRuntime.prefs.minScore);
      tgRuntime.prefs.minScore = cycle[(idx + 1) % cycle.length];
    }
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: 'Preferințe actualizate' }).catch(() => {});
    if (msgId) {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: formatPrefsMessageHtml(),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buildPrefsInlineKeyboard() }
      }).catch(() => {});
    }
    return;
  }

  if (act === 'top10') {
    const tf = p1 || '30m';
    const dir = p2 || 'all';
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Actualizez Top 10 (${dir.toUpperCase()})...` }).catch(() => {});
    try {
      const pack = await computeTopMarketOpportunities({ tf, dir, limit: 10, forceRefresh: false });
      const row1 = (pack.opportunities || []).slice(0, 5).map(o => ({ text: `${o.sym} (${o.direction})`, callback_data: `an:${o.sym}` }));
      const row2 = [
        { text: 'Top 10 Mix', callback_data: `top10:${pack.tf}:all` },
        { text: 'Doar BUY', callback_data: `top10:${pack.tf}:buy` },
        { text: 'Doar SELL', callback_data: `top10:${pack.tf}:sell` }
      ];
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatTopOppsTelegramHtml(pack),
        replyMarkup: { inline_keyboard: row1.length ? [row1, row2] : [row2] }
      });
    } catch (_) {}
    return;
  }

  if (act === 'g' && p1) {
    const tf = p2 || '15m';
    tgRuntime.terminal.activeSymbol = p1;
    tgRuntime.terminal.activeTf = tf;
    enqueueUiAction({ type: 'OPEN_CHART', sym: p1, tf });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Grafic deschis: ${p1} (${tf.toUpperCase()})` }).catch(() => {});
    return;
  }

  if (act === 'an' && p1) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Analizez ${p1}...` }).catch(() => {});
    try {
      const a = await analyzeSymbolServer(p1, tgRuntime.terminal.activeTf || '15m');
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatAnalysisHtml(a),
        replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(a.sym, a.tf) }
      });
    } catch (_) {}
    return;
  }

  if (act === 'wla' && p1) {
    if (!tgRuntime.terminal.watchlist.includes(p1)) tgRuntime.terminal.watchlist.unshift(p1);
    saveTgState();
    enqueueUiAction({ type: 'WL_ADD', sym: p1 });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `${p1} adăugat în Watchlist` }).catch(() => {});
    return;
  }

  if (act === 'alpct' && p1 && p2) {
    const pct = parseFloat(p2);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Setez alertă ${p1}...` }).catch(() => {});
    try {
      const qRes = await handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(p1)}`);
      const curP = qRes?.quoteResponse?.result?.[0]?.regularMarketPrice;
      if (isFinite(curP)) {
        const target = +(curP * (1 + pct / 100)).toFixed(curP >= 10 ? 2 : 4);
        const newAlert = {
          id: Date.now(),
          sym: p1,
          cond: pct >= 0 ? 'price_up' : 'price_dn',
          price: target,
          dir: pct >= 0 ? 'up' : 'dn',
          telegram: true,
          permanent: true,
          triggered: false
        };
        tgRuntime.terminal.alerts = [newAlert, ...(tgRuntime.terminal.alerts || [])];
        saveTgState();
        enqueueUiAction({ type: 'ALERT_ADD', alert: newAlert });
        await sendTelegramNotification({
          chatId,
          category: 'reply',
          html: `Alertă setată: <b>${escHtml(p1)}</b> ${pct >= 0 ? '&ge;' : '&le;'} <code>${fmtNum(target)}</code> (${pct >= 0 ? '+' : ''}${pct}% față de ${fmtNum(curP)})`
        });
      }
    } catch (_) {}
    return;
  }

  if (act === 'aldel' && p1) {
    const id = Number(p1);
    tgRuntime.terminal.alerts = (tgRuntime.terminal.alerts || []).filter(a => a.id !== id);
    saveTgState();
    enqueueUiAction({ type: 'ALERT_DEL', id });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: 'Alertă ștearsă' }).catch(() => {});
    return;
  }

  if (act === 'ord' && p1 && p2) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Execut ordin ${p2.toUpperCase()} pe ${p1}...` }).catch(() => {});
    await handleTelegramCommand(chatId, `/${p2 === 'buy' ? 'buy' : 'short'} ${p1}`);
    return;
  }

  if (act === 'pclose' && p1) {
    enqueueUiAction({ type: 'PAPER_CLOSE', sym: p1 });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Poziție ${p1} închisă` }).catch(() => {});
    return;
  }

  await tgApi('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
}

async function processTelegramUpdate(upd) {
  if (!upd) return;
  if (upd.callback_query) {
    await handleTelegramCallbackQuery(upd.callback_query);
    return;
  }
  const msg = upd.message || upd.edited_message;
  if (!msg || !msg.text) return;
  const txt = msg.text.trim();
  const isPrivate = msg.chat?.type === 'private';
  if (txt.startsWith('/') || isPrivate) {
    await handleTelegramCommand(msg.chat.id, txt, msg.from?.username || msg.from?.first_name || '');
  }
}

let pollLoopStarted = false;
async function startTelegramBridge() {
  if (pollLoopStarted || !tgRuntime.runtimeToken) return;
  pollLoopStarted = true;

  try {
    const me = await tgApi('getMe', {}, 8000);
    tgRuntime.botUsername = me.username || '';
    tgRuntime.botFirstName = me.first_name || '';
    tgRuntime.botOk = true;
    await tgApi('setMyCommands', { commands: BOT_COMMANDS_SPEC }, 8000).catch(() => {});
    console.log(`[Telegram] Connected @${tgRuntime.botUsername} (chat ${tgRuntime.chatId || 'dynamic'})`);
  } catch (e) {
    console.warn('[Telegram] Bot init warning:', e.message);
  }

  // Long-Polling Loop for incoming Telegram Commands & Inline Buttons
  (async function pollLoop() {
    while (true) {
      if (!tgRuntime.runtimeToken) {
        tgRuntime.pollingActive = false;
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      try {
        tgRuntime.pollingActive = true;
        const updates = await tgApi('getUpdates', {
          offset: tgRuntime.updateOffset,
          timeout: 18,
          allowed_updates: ['message', 'callback_query']
        }, 24000);

        if (Array.isArray(updates) && updates.length > 0) {
          for (const u of updates) {
            tgRuntime.updateOffset = Math.max(tgRuntime.updateOffset, u.update_id + 1);
            await processTelegramUpdate(u).catch(err => console.warn('[Telegram] Update err:', err.message));
          }
        }
      } catch (e) {
        tgRuntime.pollingActive = false;
        const waitMs = e.code === 409 ? 12000 : 4000;
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  })();

  // Server-Side Fallback Alert Evaluator (fires price alerts even when browser is closed)
  setInterval(async () => {
    if (!tgRuntime.prefs.enabled || !tgRuntime.prefs.alerts || !tgRuntime.chatId) return;
    if (Date.now() - tgRuntime.lastBrowserSyncTs < 12000) return; // Browser is actively evaluating all 11 alert types live
    const activePriceAlerts = (tgRuntime.terminal.alerts || []).filter(a => !a.triggered && (a.cond === 'price_up' || a.cond === 'price_dn') && a.sym !== 'WATCHLIST' && isFinite(a.price));
    if (!activePriceAlerts.length) return;

    const syms = Array.from(new Set(activePriceAlerts.map(a => a.sym))).slice(0, 25);
    try {
      const qRes = await handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms.join(','))}`);
      const map = {};
      (qRes?.quoteResponse?.result || []).forEach(q => { if (q?.symbol) map[String(q.symbol).toUpperCase()] = q.regularMarketPrice; });

      let changed = false;
      for (const a of activePriceAlerts) {
        const curP = map[a.sym];
        if (!isFinite(curP)) continue;
        const hit = (a.cond === 'price_up' && curP >= a.price) || (a.cond === 'price_dn' && curP <= a.price);
        if (hit) {
          a.triggered = true;
          a.triggeredAt = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
          changed = true;
          await sendTelegramNotification({
            category: 'alerts',
            dedupKey: `alert:${a.id}`,
            summary: `Alertă ${a.sym} @ ${fmtNum(curP)}`,
            html:
              `<b>Alertă Preț Declanșată · ${escHtml(a.sym)}</b>\n` +
              `Condiție: <code>Preț ${a.cond === 'price_up' ? '&ge;' : '&le;'} ${fmtNum(a.price)}</code>\n` +
              `Preț live: <b>${fmtNum(curP)}</b>`,
            replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(a.sym, '15m') }
          }).catch(() => {});
        }
      }
      if (changed) saveTgState();
    } catch (_) {}
  }, 18000);

  // Optional 15-Minute Background Watchlist Scanner (when prefs.scanner is enabled)
  setInterval(async () => {
    if (!tgRuntime.prefs.enabled || !tgRuntime.prefs.scanner || !tgRuntime.chatId) return;
    const list = (tgRuntime.terminal.watchlist || []).slice(0, 12);
    for (const sym of list) {
      try {
        const a = await analyzeSymbolServer(sym, '15m');
        if (a.bias !== 'NEUTRU' && a.score >= tgRuntime.prefs.minScore) {
          const dayKey = new Date().toISOString().slice(0, 13);
          await sendTelegramNotification({
            category: 'scanner',
            dedupKey: `scan:${a.sym}:${a.bias}:${dayKey}`,
            summary: `Auto-Scan ${a.sym} · ${a.bias} (${a.score})`,
            html: `<b>Auto-Scan Watchlist · ${escHtml(a.sym)}</b>\n\n` + formatAnalysisHtml(a),
            replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(a.sym, '15m') }
          });
        }
      } catch (_) {}
    }
  }, 15 * 60 * 1000);
}

function stripTags(str) {
  return String(str || '').replace(/<[^>]+>/g, '').trim();
}

function classifyInstrumentType(rawType, sym, exch) {
  const t = String(rawType || '').toLowerCase();
  const s = String(sym || '').toUpperCase();
  if (s.endsWith('-USD') || t.includes('crypto') || t === 'spot' || t === 'cryptocurrency') {
    return { cat: 'crypto', badge: 'CRYPTO' };
  }
  if (s.endsWith('=X') || t === 'forex' || t === 'currency') {
    return { cat: 'forex', badge: 'FOREX' };
  }
  if (s.endsWith('=F') || t.includes('future')) {
    return { cat: 'futures', badge: 'FUTURES' };
  }
  if (s.startsWith('^') || t === 'index') {
    return { cat: 'indices', badge: 'INDICE' };
  }
  if (t.includes('bond') || /^(TLT|IEF|SHY|HYG|LQD|AGG|BND|BIL|SGOV)$/.test(s)) {
    return { cat: 'bonds', badge: 'OBLIGAȚIUNI' };
  }
  if (t === 'etf' || t === 'fund' || t === 'mutualfund' || String(exch || '').toUpperCase().includes('ARCA')) {
    return { cat: 'etf', badge: 'ETF' };
  }
  return { cat: 'stocks', badge: 'ACȚIUNE' };
}

async function searchGlobalSymbols(rawQuery, catFilter = 'all') {
  const qClean = String(rawQuery || '').trim().replace(/\s+/g, ' ');
  if (!qClean) return [];
  const qUpper = qClean.toUpperCase();
  const cacheKey = `gsearch:${qUpper}:${catFilter}`;
  const cached = getCached(cacheKey, 20000);
  if (cached) return cached;

  const tvPromise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3200);
    try {
      const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(qClean)}&hl=0&lang=en&domain=production`;
      const r = await fetch(url, {
        headers: {
          'Origin': 'https://www.tradingview.com',
          'Referer': 'https://www.tradingview.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        signal: ctrl.signal
      });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j?.symbols) ? j.symbols : [];
    } catch (_) {
      return [];
    } finally {
      clearTimeout(timer);
    }
  })();

  const yfPromise = (async () => {
    try {
      const sr = await Promise.race([
        yf.search(qClean, { quotesCount: 12, newsCount: 0 }, { validateResult: false }),
        new Promise(resolve => setTimeout(() => resolve(null), 3200))
      ]);
      return Array.isArray(sr?.quotes) ? sr.quotes : [];
    } catch (_) {
      return [];
    }
  })();

  const [tvSymbols, yfQuotes] = await Promise.all([tvPromise, yfPromise]);

  const bySym = new Map();
  const tvLogoByTicker = new Map();

  for (const it of tvSymbols) {
    const rawSym = stripTags(it.symbol).toUpperCase();
    const desc = stripTags(it.description);
    const exch = stripTags(it.exchange).toUpperCase();
    const type = String(it.type || '').toLowerCase();
    const country = String(it.country || '').toUpperCase();
    const logoid = it.logoid || (country ? `country/${country}` : '');
    if (!rawSym) continue;

    if (logoid && !tvLogoByTicker.has(rawSym)) {
      tvLogoByTicker.set(rawSym, { logoid, desc, exch });
    }

    let yhSym = '';
    if (country === 'US' && (type === 'stock' || type === 'fund' || type === 'dr') && US_PRIMARY_EXCH.test(exch)) {
      if (/^[A-Z0-9.\-]+$/.test(rawSym)) yhSym = rawSym.replace(/\./g, '-');
    } else if ((type === 'crypto' || type === 'spot') && /USDT?$/.test(rawSym)) {
      const coin = rawSym.replace(/USDT?$/, '');
      if (/^[A-Z0-9]{2,10}$/.test(coin)) yhSym = `${coin}-USD`;
    } else if (type === 'forex' && /^[A-Z]{6}$/.test(rawSym)) {
      yhSym = `${rawSym}=X`;
    }

    if (!yhSym) continue;
    const cls = classifyInstrumentType(type, yhSym, exch);
    if (!bySym.has(yhSym)) {
      bySym.set(yhSym, {
        sym: yhSym,
        name: desc || yhSym,
        exch: type === 'crypto' || type === 'spot' ? 'CRYPTO' : (type === 'forex' ? 'FOREX' : (exch || 'US')),
        cat: cls.cat,
        badge: cls.badge,
        logoid: logoid || '',
        fromTv: true,
        fromYf: false
      });
    }
  }

  for (const yq of yfQuotes) {
    const yhSym = String(yq?.symbol || '').trim().toUpperCase();
    if (!yhSym || !/^[A-Z0-9.^=\-]+$/.test(yhSym)) continue;
    const rawQuoteType = String(yq.quoteType || yq.typeDisp || '').toLowerCase();
    if (rawQuoteType === 'option') continue;

    const exch = String(yq.exchDisp || yq.exchange || 'MARKET').toUpperCase();
    const cls = classifyInstrumentType(rawQuoteType, yhSym, exch);
    const baseTicker = yhSym.replace(/=X|=F|\^/g, '').split('-')[0].split('.')[0];
    const tvMeta = tvLogoByTicker.get(yhSym) || tvLogoByTicker.get(baseTicker);
    const name = yq.longname || yq.shortname || tvMeta?.desc || yhSym;

    if (bySym.has(yhSym)) {
      const cur = bySym.get(yhSym);
      cur.fromYf = true;
      if ((!cur.name || cur.name === yhSym) && name) cur.name = name;
      if (!cur.logoid && tvMeta?.logoid) cur.logoid = tvMeta.logoid;
    } else {
      bySym.set(yhSym, {
        sym: yhSym,
        name,
        exch,
        cat: cls.cat,
        badge: cls.badge,
        logoid: tvMeta?.logoid || '',
        fromTv: false,
        fromYf: true
      });
    }
  }

  let list = Array.from(bySym.values());
  if (catFilter && catFilter !== 'all') {
    list = list.filter(item => item.cat === catFilter);
  }

  const normQuerySym = normalizeSymServer(qClean);
  const scoreItem = (it) => {
    let sc = 0;
    const s = it.sym;
    const nm = String(it.name || '').toUpperCase();
    if (s === qUpper || s === normQuerySym) sc += 1000;
    else if (s.startsWith(qUpper) || (normQuerySym && s.startsWith(normQuerySym))) sc += 520 - Math.min(80, s.length * 4);
    else if (s.includes(qUpper)) sc += 240;

    if (nm === qUpper) sc += 480;
    else if (nm.startsWith(qUpper)) sc += 320;
    else if (nm.includes(` ${qUpper}`) || nm.includes(qUpper)) sc += 180;

    if (US_PRIMARY_EXCH.test(it.exch) || it.exch === 'CRYPTO' || it.exch === 'FOREX') sc += 90;
    if (it.fromTv && it.fromYf) sc += 75;
    if (it.logoid) sc += 25;
    return sc;
  };

  list.sort((a, b) => scoreItem(b) - scoreItem(a));
  const topCandidates = list.slice(0, 10);

  if (topCandidates.length > 0) {
    const symsToQuote = topCandidates.map(x => x.sym);
    try {
      const qData = await Promise.race([
        handleYahooProxyTarget(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symsToQuote.join(','))}`),
        new Promise(resolve => setTimeout(() => resolve(null), 1500))
      ]);
      const qMap = new Map();
      for (const qr of (qData?.quoteResponse?.result || [])) {
        if (qr?.symbol) qMap.set(String(qr.symbol).toUpperCase(), qr);
      }
      for (const item of topCandidates) {
        const qHit = qMap.get(item.sym);
        if (qHit && qHit.regularMarketPrice != null) {
          item.price = qHit.regularMarketPrice;
          item.chgPct = qHit.regularMarketChangePercent ?? 0;
          item.verifiedQuote = true;
          const ms = String(qHit.marketState || '').toUpperCase();
          if (ms !== 'REGULAR') {
            const hasPre = qHit.preMarketPrice != null && isFinite(qHit.preMarketPrice);
            const hasPost = qHit.postMarketPrice != null && isFinite(qHit.postMarketPrice);
            if ((ms === 'PRE' || ms === 'PREPRE') && hasPre) {
              item.extType = 'PRE';
              item.extPrice = qHit.preMarketPrice;
              item.extChgPct = qHit.preMarketChangePercent ?? (item.price ? ((item.extPrice - item.price) / item.price) * 100 : 0);
            } else if ((ms === 'POST' || ms === 'POSTPOST') && hasPost) {
              item.extType = 'POST';
              item.extPrice = qHit.postMarketPrice;
              item.extChgPct = qHit.postMarketChangePercent ?? (item.price ? ((item.extPrice - item.price) / item.price) * 100 : 0);
            } else if (hasPre || hasPost) {
              const usePre = hasPre && (!hasPost || (qHit.preMarketTime || 0) >= (qHit.postMarketTime || 0));
              item.extType = usePre ? 'PRE' : 'POST';
              item.extPrice = usePre ? qHit.preMarketPrice : qHit.postMarketPrice;
              item.extChgPct = usePre
                ? (qHit.preMarketChangePercent ?? (item.price ? ((item.extPrice - item.price) / item.price) * 100 : 0))
                : (qHit.postMarketChangePercent ?? (item.price ? ((item.extPrice - item.price) / item.price) * 100 : 0));
            }
          }
          if ((!item.name || item.name === item.sym) && (qHit.longName || qHit.shortName)) {
            item.name = qHit.longName || qHit.shortName;
          }
        }
      }
    } catch (_) {}
  }

  const finalOut = topCandidates
    .filter(it => it.verifiedQuote || it.fromYf || (it.fromTv && it.price != null))
    .slice(0, 8)
    .map(it => ({
      sym: it.sym,
      name: it.name,
      exch: it.exch,
      cat: it.cat,
      badge: it.badge,
      logoid: it.logoid || '',
      price: it.price ?? null,
      chgPct: it.chgPct ?? null,
      extType: it.extType || '',
      extPrice: it.extPrice ?? null,
      extChgPct: it.extChgPct ?? null
    }));

  setCached(cacheKey, finalOut);
  return finalOut;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 512 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('JSON invalid')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

const requestHandler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname;

  // Lazy singleton for TradePro AI Trading Intelligence Engine
  if (!global.__tradeProIntelEngine) {
    const { createIntelEngine } = require('./intel-backend.js');
    global.__tradeProIntelEngine = createIntelEngine({
      yf,
      handleYahooProxyTarget,
      getCached,
      setCached,
      QuantEngine,
      generateSingleAITradeIdeaServer,
      defaultWatchlist: tgRuntime?.watchlist || ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'APPS', 'ONDS']
    });
  }
  const intel = global.__tradeProIntelEngine;

  // ─── TRADEPRO AI INTELLIGENCE ENDPOINTS (12 MODULES) ───────────────────────
  if (pathname === '/api/intel/market-overview' && req.method === 'GET') {
    const force = parsedUrl.searchParams.get('refresh') === '1';
    try {
      const data = await intel.fetchMarketOverview(force);
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/intel/early-radar' && req.method === 'GET') {
    const mode = parsedUrl.searchParams.get('mode') || 'all';
    const force = parsedUrl.searchParams.get('refresh') === '1';
    const wlParam = parsedUrl.searchParams.get('wl') || '';
    const customSyms = wlParam ? wlParam.split(',').map(s => s.trim()).filter(Boolean) : [];
    const filters = {
      chgMin: parsedUrl.searchParams.get('chgMin'),
      chgMax: parsedUrl.searchParams.get('chgMax'),
      minRvolTod: parsedUrl.searchParams.get('minRvolTod'),
      minVolAccel5m: parsedUrl.searchParams.get('minVolAccel5m'),
      maxFloatM: parsedUrl.searchParams.get('maxFloatM'),
      maxSpreadPct: parsedUrl.searchParams.get('maxSpreadPct'),
      nearVwapOrRes: parsedUrl.searchParams.get('nearVwapOrRes') === '1',
      requirePosAccel: parsedUrl.searchParams.get('requirePosAccel') === '1',
      requireCatalyst: parsedUrl.searchParams.get('requireCatalyst') === '1'
    };
    try {
      const data = await intel.computeEarlyRadar({ mode, customSyms, forceRefresh: force, filters });
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { ok: false, candidates: [], error: e.message });
    }
  }

  if (pathname === '/api/intel/order-flow' && req.method === 'GET') {
    const sym = parsedUrl.searchParams.get('sym') || 'ONDS';
    const interval = parsedUrl.searchParams.get('tf') || '5m';
    try {
      const data = await intel.fetchOrderFlowIntel(sym, interval);
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/intel/symbol-deep' && req.method === 'GET') {
    const sym = parsedUrl.searchParams.get('sym') || 'ONDS';
    const tf = parsedUrl.searchParams.get('tf') || '30m';
    try {
      const data = await intel.fetchSymbolDeepIntel(sym, tf);
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/intel/copilot' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const wl = Array.isArray(body.watchlist) ? body.watchlist : [];
      const data = await intel.answerCopilotQuery({
        query: body.query || '',
        sym: body.sym || 'ONDS',
        tf: body.tf || '30m',
        watchlist: wl
      });
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/intel/scanner-cockpit' && req.method === 'GET') {
    const force = parsedUrl.searchParams.get('refresh') === '1';
    const wlParam = parsedUrl.searchParams.get('wl') || '';
    const customSyms = wlParam ? wlParam.split(',').map(s => s.trim()).filter(Boolean) : [];
    try {
      const data = await intel.fetchScannerCockpit(customSyms, force);
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/intel/signal-validation' && req.method === 'GET') {
    const force = parsedUrl.searchParams.get('refresh') === '1';
    try {
      const data = await intel.getSignalValidationReport(force);
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  // ─── LIVE MARKET-WIDE TOP 10 BUY / SELL OPPORTUNITIES API ──────────────────
  if (pathname === '/api/top-opportunities' && req.method === 'GET') {
    const tf = parsedUrl.searchParams.get('tf') || '30m';
    const dir = parsedUrl.searchParams.get('dir') || 'all';
    const limit = Number(parsedUrl.searchParams.get('limit') || 10);
    const forceRefresh = parsedUrl.searchParams.get('refresh') === '1';
    try {
      const pack = await computeTopMarketOpportunities({ tf, dir, limit, forceRefresh });
      return sendJson(res, 200, pack);
    } catch (e) {
      return sendJson(res, 500, { ok: false, opportunities: [], error: e.message });
    }
  }

  // ─── INSTITUTIONAL AI TRADE IDEA BRIEF API (CONFLUENCE + SMC + NEWS) ──────
  if (pathname === '/api/ai-idea' && req.method === 'GET') {
    const sym = parsedUrl.searchParams.get('sym') || 'NVDA';
    const tf = parsedUrl.searchParams.get('tf') || '30m';
    try {
      const idea = await generateSingleAITradeIdeaServer(sym, tf);
      return sendJson(res, 200, { ok: true, idea });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  // ─── LIVE GLOBAL VERIFIED SYMBOL SEARCH API ────────────────────────────────
  if (pathname === '/api/search' && req.method === 'GET') {
    const q = parsedUrl.searchParams.get('q') || '';
    const cat = parsedUrl.searchParams.get('cat') || 'all';
    try {
      const results = await searchGlobalSymbols(q, cat);
      return sendJson(res, 200, { ok: true, query: q, results });
    } catch (e) {
      return sendJson(res, 200, { ok: false, query: q, results: [], error: e.message });
    }
  }

  // ─── TELEGRAM BRIDGE REST API ──────────────────────────────────────────────
  if (pathname === '/api/telegram/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      configured: !!(tgRuntime.runtimeToken && tgRuntime.chatId),
      botOk: tgRuntime.botOk,
      botUsername: tgRuntime.botUsername,
      botFirstName: tgRuntime.botFirstName,
      maskedToken: maskBotToken(tgRuntime.runtimeToken),
      chatId: tgRuntime.chatId,
      pollingActive: tgRuntime.pollingActive,
      prefs: tgRuntime.prefs,
      logs: tgRuntime.logs.slice(0, 25)
    });
  }

  if (pathname === '/api/telegram/config' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      if (typeof body.chatId === 'string' && body.chatId.trim()) {
        tgRuntime.chatId = body.chatId.trim();
      }
      if (typeof body.botToken === 'string' && body.botToken.trim() && !body.botToken.includes('...')) {
        tgRuntime.runtimeToken = body.botToken.trim();
        tgApi('getMe', {}, 6000).then(me => {
          tgRuntime.botUsername = me.username || '';
          tgRuntime.botFirstName = me.first_name || '';
          tgRuntime.botOk = true;
        }).catch(() => {});
      }
      if (body.prefs && typeof body.prefs === 'object') {
        tgRuntime.prefs = {
          enabled: body.prefs.enabled !== undefined ? !!body.prefs.enabled : tgRuntime.prefs.enabled,
          alerts: body.prefs.alerts !== undefined ? !!body.prefs.alerts : tgRuntime.prefs.alerts,
          signals: body.prefs.signals !== undefined ? !!body.prefs.signals : tgRuntime.prefs.signals,
          trades: body.prefs.trades !== undefined ? !!body.prefs.trades : tgRuntime.prefs.trades,
          scanner: body.prefs.scanner !== undefined ? !!body.prefs.scanner : tgRuntime.prefs.scanner,
          minScore: body.prefs.minScore !== undefined
            ? Math.max(55, Math.min(95, Number(body.prefs.minScore) || 72))
            : tgRuntime.prefs.minScore
        };
      }
      saveTgState();
      return sendJson(res, 200, {
        ok: true,
        configured: !!(tgRuntime.runtimeToken && tgRuntime.chatId),
        botUsername: tgRuntime.botUsername,
        chatId: tgRuntime.chatId,
        prefs: tgRuntime.prefs,
        logs: tgRuntime.logs.slice(0, 25)
      });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/telegram/sync' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      tgRuntime.lastBrowserSyncTs = Date.now();
      if (body.activeSymbol) tgRuntime.terminal.activeSymbol = String(body.activeSymbol).toUpperCase();
      if (body.activeTf) tgRuntime.terminal.activeTf = String(body.activeTf);
      if (isFinite(body.lastPrice)) tgRuntime.terminal.lastPrice = Number(body.lastPrice);
      if (Array.isArray(body.watchlist) && body.watchlist.length) {
        tgRuntime.terminal.watchlist = body.watchlist.map(x => typeof x === 'string' ? x : x.sym).filter(Boolean);
      }
      if (Array.isArray(body.alerts)) {
        tgRuntime.terminal.alerts = body.alerts;
      }
      if (body.paper && typeof body.paper === 'object') {
        tgRuntime.terminal.paper = body.paper;
      }
      if (body.currentPlan) {
        tgRuntime.terminal.currentPlan = body.currentPlan;
      }
      const pendingActions = tgRuntime.uiActions.splice(0, tgRuntime.uiActions.length);
      return sendJson(res, 200, {
        ok: true,
        botOk: tgRuntime.botOk,
        botUsername: tgRuntime.botUsername,
        pollingActive: tgRuntime.pollingActive,
        chatId: tgRuntime.chatId,
        prefs: tgRuntime.prefs,
        logs: tgRuntime.logs.slice(0, 20),
        uiActions: pendingActions
      });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/telegram/notify' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const sym = body.sym ? normalizeSymServer(body.sym) : '';
      const tf = body.tf || tgRuntime.terminal.activeTf || '15m';
      const replyMarkup = (body.includeActions && sym)
        ? { inline_keyboard: buildSymbolInlineKeyboard(sym, tf) }
        : null;
      const result = await sendTelegramNotification({
        category: body.category || 'manual',
        dedupKey: body.dedupKey || '',
        summary: body.summary || '',
        html: String(body.html || ''),
        replyMarkup
      });
      return sendJson(res, 200, { ...result, logs: tgRuntime.logs.slice(0, 20) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/telegram/webhook' && req.method === 'POST') {
    try {
      const upd = await readJsonBody(req);
      await processTelegramUpdate(upd);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  // First-Party Authentic Brand Logo Endpoint (/logo?sym=APPS or /proxy?logo=APPS)
  if (pathname === '/logo' || (pathname === '/proxy' && parsedUrl.searchParams.get('logo'))) {
    const sym = parsedUrl.searchParams.get('sym') || parsedUrl.searchParams.get('logo') || '';
    if (!sym) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing sym parameter');
      return;
    }
    try {
      const asset = await resolveOfficialLogoAsset(sym);
      res.writeHead(200, {
        'Content-Type': asset.contentType,
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(asset.buf);
    } catch (_) {
      const svgBuf = Buffer.from(buildFallbackMonogramSvg(sym), 'utf8');
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
      res.end(svgBuf);
    }
    return;
  }

  if (pathname === '/api/meta') {
    const sym = parsedUrl.searchParams.get('symbol');
    if (!sym) return sendJson(res, 400, { error: 'Missing symbol parameter' });
    try {
      const quoteData = await yf.quoteSummary(sym, { modules: ['summaryProfile', 'price'] }, { validateResult: false });
      const searchData = await yf.search(sym, { newsCount: 4, quotesCount: 0 }, { validateResult: false });
      let logoUrl = null;
      if (quoteData?.summaryProfile?.website) {
        try {
          const host = new URL(quoteData.summaryProfile.website).hostname;
          logoUrl = `https://logo.clearbit.com/${host}`;
        } catch (_) {}
      }
      return sendJson(res, 200, {
        name: quoteData?.price?.shortName || sym,
        logoUrl,
        news: searchData?.news || []
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (pathname === '/proxy') {
    const targetUrlRaw = parsedUrl.searchParams.get('url');
    if (!targetUrlRaw) return sendJson(res, 400, { error: 'Missing url parameter' });
    try {
      const data = await handleYahooProxyTarget(targetUrlRaw);
      return sendJson(res, 200, data);
    } catch (e) {
      console.error('[PROXY ERROR]', targetUrlRaw, e.message);
      return sendJson(res, 502, { error: e.message });
    }
  }

  // Static Frontend Server (Zero-Cache so edits appear immediately on refresh)
  const relPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.resolve(__dirname, '.' + relPath);
  if (safePath.startsWith(__dirname) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    const ext = path.extname(safePath).toLowerCase();
    const mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon'
    };
    res.writeHead(200, {
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(safePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
};

const server = http.createServer((req, res) => {
  Promise.resolve(requestHandler(req, res)).catch((err) => {
    console.error('[HTTP HANDLER ERROR]', req.url, err?.stack || err?.message || err);
    if (!res.headersSent) {
      try {
        return sendJson(res, 500, { ok: false, error: err?.message || 'Internal Server Error' });
      } catch (_) {}
    }
    try { res.end(); } catch (_) {}
  });
});
// Prevent Node 5s keep-alive timeout race with Chrome HTTP/1.1 connection reuse (Failed to fetch)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 120000;

const PORT = Number(process.env.PORT) || 9030;
server.on('error', (err) => {
  console.error(`[TradePro] Server bind error on port ${PORT}:`, err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[TradePro UnhandledRejection]', err?.stack || err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[TradePro UncaughtException]', err?.stack || err?.message || err);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[TradePro] Server & Live Market Proxy active on http://localhost:${PORT}`);
    startTelegramBridge();
  });
}

module.exports = { computeTopMarketOpportunities, discoverLiveMarketUniverse, generateSingleAITradeIdeaServer };
