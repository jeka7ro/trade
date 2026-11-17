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
const { handleAuthApiRequest } = require('./netlify/functions/auth-store.js');
const {
  TV_INTERVAL_MAP,
  toEpochSec,
  isUsEquityTicker,
  enrichQuotesWithTvExtended,
  fetchTvChartSupplement,
  mergeTvChartSupplement
} = require('./netlify/functions/tv-overnight.js');
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
    } catch (_) { }
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
    } catch (_) { }
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
    const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '1h'].includes(interval);
    const cached = getCached(cacheKey, isIntraday ? 1800 : 5000);
    if (cached) return cached;

    const validIntervals = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);
    const yfInterval = validIntervals.has(interval) ? interval : '1d';
    const period1 = rangeToPeriod1(range, yfInterval);
    const wantExt = includePrePost && TV_INTERVAL_MAP[yfInterval] && isUsEquityTicker(rawSym);

    const [ch, tvSupp] = await Promise.all([
      yf.chart(rawSym, { period1, interval: yfInterval, includePrePost }, { validateResult: false }),
      wantExt ? fetchTvChartSupplement(rawSym, yfInterval, { getCached, setCached }).catch(() => null) : Promise.resolve(null)
    ]);
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
    if (tvSupp && (tvSupp.extendedBars?.length || tvSupp.boatsBars?.length)) {
      mergeTvChartSupplement(payload, tvSupp, yfInterval);
    }
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
      if (hit) results.push({ ...hit });
      else missing.push(s);
    }

    if (missing.length > 0) {
      try {
        const fetched = await yf.quote(missing, {}, { validateResult: false });
        const arr = Array.isArray(fetched) ? fetched : (fetched ? [fetched] : []);
        for (const q of arr) {
          if (q && q.symbol) {
            setCached(`quote:${String(q.symbol).toUpperCase()}`, q);
            results.push({ ...q });
          }
        }
      } catch (_) {
        await Promise.all(missing.map(async (s) => {
          try {
            const single = await yf.quote(s, {}, { validateResult: false });
            if (single && single.symbol) {
              setCached(`quote:${String(single.symbol).toUpperCase()}`, single);
              results.push({ ...single });
            }
          } catch (__) { }
        }));
      }
    }

    await enrichQuotesWithTvExtended(results, { getCached, setCached }).catch(() => { });
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
  radarIntel: true,
  onlyMarketOpen: true,
  requirePreBuyPass: true,
  minScore: 78,
  maxPerHour: 3,
  cooldownMin: 180
};

function normalizeTgPrefs(raw, base = DEFAULT_TG_PREFS) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const minSc = Number(src.minScore !== undefined ? src.minScore : base.minScore);
  const maxHr = src.maxPerHour !== undefined ? Number(src.maxPerHour) : Number(base.maxPerHour);
  const cdMin = Number(src.cooldownMin !== undefined ? src.cooldownMin : base.cooldownMin);
  return {
    enabled: src.enabled !== undefined ? !!src.enabled : !!base.enabled,
    alerts: src.alerts !== undefined ? !!src.alerts : !!base.alerts,
    signals: src.signals !== undefined ? !!src.signals : !!base.signals,
    trades: src.trades !== undefined ? !!src.trades : !!base.trades,
    scanner: src.scanner !== undefined ? !!src.scanner : !!base.scanner,
    radarIntel: src.radarIntel !== undefined ? !!src.radarIntel : (src.scanner !== undefined ? !!src.scanner : !!base.radarIntel),
    onlyMarketOpen: src.onlyMarketOpen !== undefined ? !!src.onlyMarketOpen : !!base.onlyMarketOpen,
    requirePreBuyPass: src.requirePreBuyPass !== undefined ? !!src.requirePreBuyPass : !!base.requirePreBuyPass,
    minScore: Math.max(55, Math.min(95, Number.isFinite(minSc) ? Math.round(minSc) : 78)),
    maxPerHour: Math.max(0, Math.min(20, Number.isFinite(maxHr) ? Math.round(maxHr) : 3)),
    cooldownMin: Math.max(15, Math.min(720, Number.isFinite(cdMin) ? Math.round(cdMin) : 180))
  };
}

const tgRuntime = {
  runtimeToken: process.env.TELEGRAM_TOKEN || '',
  chatId: String(process.env.CHAT_ID || '').trim(),
  botUsername: '',
  botFirstName: '',
  botId: 0,
  botOk: false,
  pollingActive: false,
  updateOffset: 0,
  prefs: { ...DEFAULT_TG_PREFS },
  sentKeys: {},
  symbolCooldowns: {},
  autoSentTimestamps: [],
  lastRadarScanTs: 0,
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
        tgRuntime.prefs = normalizeTgPrefs(raw.prefs, DEFAULT_TG_PREFS);
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
      if (raw.symbolCooldowns && typeof raw.symbolCooldowns === 'object') {
        tgRuntime.symbolCooldowns = raw.symbolCooldowns;
      }
      if (Array.isArray(raw.autoSentTimestamps)) {
        const hourAgo = Date.now() - 3600 * 1000;
        tgRuntime.autoSentTimestamps = raw.autoSentTimestamps.filter(ts => Number.isFinite(ts) && ts >= hourAgo);
      }
      if (Array.isArray(raw.logs)) {
        tgRuntime.logs = raw.logs.slice(0, 40);
      }
    }
  } catch (_) { }
}

function saveTgState() {
  try {
    const now = Date.now();
    for (const k of Object.keys(tgRuntime.sentKeys)) {
      if (now - (tgRuntime.sentKeys[k] || 0) > 48 * 3600 * 1000) {
        delete tgRuntime.sentKeys[k];
      }
    }
    for (const k of Object.keys(tgRuntime.symbolCooldowns || {})) {
      const val = tgRuntime.symbolCooldowns[k];
      const ts = typeof val === 'number' ? val : (val?.ts || 0);
      if (now - ts > 48 * 3600 * 1000) {
        delete tgRuntime.symbolCooldowns[k];
      }
    }
    tgRuntime.autoSentTimestamps = (tgRuntime.autoSentTimestamps || []).filter(ts => now - ts < 3600 * 1000);
    const payload = {
      chatIdOverride: tgRuntime.chatId !== String(process.env.CHAT_ID || '').trim() ? tgRuntime.chatId : '',
      prefs: tgRuntime.prefs,
      watchlist: tgRuntime.terminal.watchlist.slice(0, 80),
      alerts: (tgRuntime.terminal.alerts || []).slice(0, 120),
      sentKeys: tgRuntime.sentKeys,
      symbolCooldowns: tgRuntime.symbolCooldowns,
      autoSentTimestamps: tgRuntime.autoSentTimestamps,
      logs: tgRuntime.logs.slice(0, 40)
    };
    fs.writeFileSync(TG_STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) { }
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

function getIntelEngine() {
  if (!global.__tradeProIntelEngine) {
    const { createIntelEngine } = require('./intel-backend.js');
    global.__tradeProIntelEngine = createIntelEngine({
      yf,
      handleYahooProxyTarget,
      getCached,
      setCached,
      QuantEngine,
      generateSingleAITradeIdeaServer,
      defaultWatchlist: tgRuntime?.terminal?.watchlist || ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'APPS', 'ONDS']
    });
  }
  return global.__tradeProIntelEngine;
}

function isAlwaysOpenAsset(sym) {
  return /(?:-USD|=F|=X)$/i.test(String(sym || '').trim());
}

function getTgRateStats() {
  const now = Date.now();
  const hourAgo = now - 3600 * 1000;
  tgRuntime.autoSentTimestamps = (tgRuntime.autoSentTimestamps || []).filter(ts => Number.isFinite(ts) && ts >= hourAgo);
  const intel = getIntelEngine();
  const sessionCtx = intel.getMarketSessionContext(now);
  const marketOpen = Boolean(sessionCtx.isRegular || sessionCtx.isExtendedHours);
  const maxPerHour = tgRuntime.prefs.maxPerHour || 0;
  const sentLastHour = tgRuntime.autoSentTimestamps.length;
  return {
    sentLastHour,
    maxPerHour,
    remainingHour: maxPerHour > 0 ? Math.max(0, maxPerHour - sentLastHour) : 999,
    cooldownMin: tgRuntime.prefs.cooldownMin || 180,
    sessionCode: sessionCtx.sessionCode,
    sessionLabel: sessionCtx.label,
    timeEt: sessionCtx.timeEt,
    marketOpen
  };
}

function buildSymbolInlineKeyboard(sym, tf = '15m', opts = {}) {
  const cleanTf = String(tf || '15m').toLowerCase();
  const altTf = cleanTf === '15m' ? '1h' : '15m';
  const rows = [
    [
      { text: `Grafic ${sym} (${cleanTf.toUpperCase()})`, callback_data: `g:${sym}:${cleanTf}` },
      { text: `Grafic ${altTf.toUpperCase()}`, callback_data: `g:${sym}:${altTf}` },
      { text: `Intel SEC/Opt`, callback_data: `an_deep:${sym}` }
    ],
    [
      { text: `Ordin Long`, callback_data: `ord:${sym}:buy` },
      { text: `Ordin Short`, callback_data: `ord:${sym}:sell` }
    ],
    [
      { text: `Alertă +3%`, callback_data: `alpct:${sym}:3` },
      { text: `+ Watchlist`, callback_data: `wla:${sym}` }
    ]
  ];
  if (opts.includeMuteBtn) {
    rows[2].push({ text: `Oprește Mesaje`, callback_data: `mute:quick` });
  } else {
    rows[2].splice(1, 0, { text: `Alertă -3%`, callback_data: `alpct:${sym}:-3` });
  }
  return rows;
}

function buildPrefsInlineKeyboard() {
  const p = tgRuntime.prefs;
  const st = (b) => b ? 'ACTIV' : 'OPRIT';
  return [
    [
      { text: `Master: ${st(p.enabled)}`, callback_data: 'tog:enabled' },
      { text: `Early Radar AI: ${st(p.radarIntel)}`, callback_data: 'tog:radarIntel' }
    ],
    [
      { text: `Doar Piață Deschisă: ${st(p.onlyMarketOpen)}`, callback_data: 'tog:onlyMarketOpen' },
      { text: `Scut Pre-BUY/SEC: ${st(p.requirePreBuyPass)}`, callback_data: 'tog:prebuy' }
    ],
    [
      { text: `Prag Scor: ${p.minScore}+`, callback_data: 'tog:score' },
      { text: `Max/Oră: ${p.maxPerHour > 0 ? p.maxPerHour : 'Nelim.'}`, callback_data: 'tog:maxhour' }
    ],
    [
      { text: `Alerte Preț: ${st(p.alerts)}`, callback_data: 'tog:alerts' },
      { text: `Semnale Grafic: ${st(p.signals)}`, callback_data: 'tog:signals' },
      { text: `Paper: ${st(p.trades)}`, callback_data: 'tog:trades' }
    ],
    [
      { text: 'Panou Control Complet', callback_data: 'cmd:menu' },
      { text: 'Tastatură Jos', callback_data: 'hub:kb' }
    ]
  ];
}

function buildMainReplyKeyboard() {
  const p = tgRuntime.prefs;
  const sigBtn = p.enabled ? '/togglesem Semnale: ACTIV' : '/togglesem Semnale: OPRIT';
  const radBtn = p.radarIntel ? '/toggleradar Radar Auto: ON' : '/toggleradar Radar Auto: OFF';
  return {
    keyboard: [
      [{ text: '/radar Radar AI' }, { text: '/gainers Top Gainers' }, { text: '/cockpit Cockpit' }],
      [{ text: '/squeeze Squeeze' }, { text: '/top10 Top 10 BUY/SELL' }, { text: '/piata Puls Piata' }],
      [{ text: sigBtn }, { text: radBtn }, { text: '/menu Panou Control' }],
      [{ text: '/intel Intel Activ' }, { text: '/portofoliu Portofoliu' }, { text: '/alerte Alerte' }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Scrie /intel SYM, /ai întrebare, sau apasă o tastă...'
  };
}

function formatControlHubHtml() {
  const p = tgRuntime.prefs;
  const t = tgRuntime.terminal;
  const stats = getTgRateStats();
  const activeAlerts = (t.alerts || []).filter(a => !a.triggered).length;
  return (
    `<b>TradePro · Panou Central de Comandă Telegram</b>\n` +
    `Simbol Activ: <b>${escHtml(t.activeSymbol)}</b> (<code>${escHtml(String(t.activeTf || '15m').toUpperCase())}</code>) · Watchlist: <b>${(t.watchlist || []).length}</b> · Alerte: <b>${activeAlerts}</b>\n` +
    `Semnale Automate: <b>${p.enabled ? 'ACTIVE' : 'OPRITE (MUTE)'}</b> · Radar AI Auto: <b>${p.radarIntel ? 'ON' : 'OFF'}</b>\n` +
    `Piață SUA: <code>${escHtml(stats.sessionLabel)}</code> · Flux 1h: <code>${stats.sentLastHour}/${p.maxPerHour > 0 ? p.maxPerHour : 'Nelim.'}</code> · Prag: <code>${p.minScore}+</code>\n\n` +
    `<i>Apasă orice buton pentru scanare live sau comutare instant ON/OFF:</i>`
  );
}

function buildControlHubInlineKeyboard() {
  const p = tgRuntime.prefs;
  const activeSym = tgRuntime.terminal?.activeSymbol || 'NVDA';
  const st = (b) => b ? 'ACTIV' : 'OPRIT';
  return [
    [
      { text: 'Early Radar AI', callback_data: 'hub:radar' },
      { text: 'Top Gainers', callback_data: 'hub:gainers' },
      { text: 'Cockpit Live', callback_data: 'hub:cockpit' }
    ],
    [
      { text: 'Low Float <25M', callback_data: 'hub:lowfloat' },
      { text: '5 Pillars', callback_data: 'hub:pillars' },
      { text: 'Short Squeeze', callback_data: 'hub:squeeze' }
    ],
    [
      { text: 'Top 10 Mix', callback_data: 'top10:15m:all' },
      { text: 'Top 10 BUY', callback_data: 'top10:15m:buy' },
      { text: 'Top 10 SELL', callback_data: 'top10:15m:sell' }
    ],
    [
      { text: 'Halts LULD', callback_data: 'hub:halts' },
      { text: 'Catalizatori', callback_data: 'hub:stiri' },
      { text: 'WinRate Radar', callback_data: 'hub:acuratete' }
    ],
    [
      { text: 'Puls Piață', callback_data: 'hub:piata' },
      { text: 'Watchlist', callback_data: 'hub:wl' },
      { text: 'Portofoliu', callback_data: 'hub:portofoliu' },
      { text: 'Alerte', callback_data: 'hub:alerte' }
    ],
    [
      { text: `Semnale: ${st(p.enabled)}`, callback_data: 'hubtog:enabled' },
      { text: `Radar Auto: ${st(p.radarIntel)}`, callback_data: 'hubtog:radarIntel' }
    ],
    [
      { text: `Piață Deschisă: ${st(p.onlyMarketOpen)}`, callback_data: 'hubtog:onlyMarketOpen' },
      { text: `Scut SEC/PreBUY: ${st(p.requirePreBuyPass)}`, callback_data: 'hubtog:prebuy' }
    ],
    [
      { text: 'Setări & Limite', callback_data: 'hub:notificari' },
      { text: `Intel ${activeSym}`, callback_data: `an_deep:${activeSym}` },
      { text: 'Tastatură Jos', callback_data: 'hub:kb' }
    ]
  ];
}

function formatPrefsMessageHtml() {
  const p = tgRuntime.prefs;
  const stats = getTgRateStats();
  const onOff = (b) => b ? '<b>ACTIV</b>' : '<code>OPRIT</code>';
  return (
    `<b>TradePro · Control Inteligent Notificări Telegram</b>\n` +
    `Chat ID: <code>${escHtml(tgRuntime.chatId || 'nesetat')}</code> · Piață SUA: <code>${escHtml(stats.sessionLabel)}</code>\n` +
    `Flux ultimă oră: <code>${stats.sentLastHour}/${p.maxPerHour > 0 ? p.maxPerHour : '∞'}</code> · Cooldown simbol: <code>${p.cooldownMin}m</code>\n\n` +
    `Flux general (Master): ${onOff(p.enabled)}\n` +
    `1. Early Radar &amp; Cockpit AI: ${onOff(p.radarIntel)}\n` +
    `2. Doar când Piața SUA e deschisă: ${onOff(p.onlyMarketOpen)}\n` +
    `3. Scut Pre-BUY &amp; SEC EDGAR: ${onOff(p.requirePreBuyPass)}\n` +
    `4. Semnale Noi pe Grafic (&ge; ${p.minScore}): ${onOff(p.signals)}\n` +
    `5. Alerte Preț &amp; Tehnice: ${onOff(p.alerts)}\n` +
    `6. Execuții Paper Trading: ${onOff(p.trades)}\n\n` +
    `Apasă pe butoanele de mai jos sau trimite <code>/mute</code> / <code>/unmute</code>.`
  );
}

async function sendTelegramNotification({ chatId, html, replyMarkup = null, category = 'system', dedupKey = '', summary = '', sym = '', bias = '', allowClosedMarket = false }) {
  const targetChat = String(chatId || tgRuntime.chatId || '').trim();
  if (!tgRuntime.runtimeToken || !targetChat) {
    return { ok: false, error: 'Token sau Chat ID lipsă' };
  }

  const now = Date.now();
  const cleanSym = sym ? normalizeSymServer(sym) : '';
  const cleanBias = String(bias || '').toUpperCase();
  const bypassFilter = category === 'reply' || category === 'test' || category === 'manual';
  const rateCappedCategory = category === 'signals' || category === 'radar' || category === 'scanner';

  if (!bypassFilter) {
    if (!tgRuntime.prefs.enabled) return { ok: true, skipped: 'muted' };
    if (category === 'alerts' && !tgRuntime.prefs.alerts) return { ok: true, skipped: 'alerts_off' };
    if (category === 'signals' && !tgRuntime.prefs.signals) return { ok: true, skipped: 'signals_off' };
    if (category === 'trades' && !tgRuntime.prefs.trades) return { ok: true, skipped: 'trades_off' };
    if (category === 'radar' && !tgRuntime.prefs.radarIntel) return { ok: true, skipped: 'radar_off' };
    if (category === 'scanner' && !tgRuntime.prefs.scanner && !tgRuntime.prefs.radarIntel) return { ok: true, skipped: 'scanner_off' };

    if (rateCappedCategory) {
      if (tgRuntime.prefs.onlyMarketOpen && !allowClosedMarket && cleanSym && !isAlwaysOpenAsset(cleanSym)) {
        const stats = getTgRateStats();
        if (!stats.marketOpen) return { ok: true, skipped: 'market_closed' };
      }

      const cooldownMs = (tgRuntime.prefs.cooldownMin || 180) * 60 * 1000;
      if (cleanSym) {
        const prevEntry = tgRuntime.symbolCooldowns?.[cleanSym];
        if (prevEntry && now - (prevEntry.ts || 0) < cooldownMs) {
          const flippedBias = cleanBias && prevEntry.bias && cleanBias !== prevEntry.bias;
          if (!flippedBias) return { ok: true, skipped: 'cooldown' };
        }
      }

      const maxHr = tgRuntime.prefs.maxPerHour || 0;
      if (maxHr > 0) {
        const hourAgo = now - 3600 * 1000;
        const recentCount = (tgRuntime.autoSentTimestamps || []).filter(ts => ts >= hourAgo).length;
        if (recentCount >= maxHr) return { ok: true, skipped: 'rate_limit' };
      }
    }
  }

  if (dedupKey) {
    const prevTs = tgRuntime.sentKeys[dedupKey];
    if (prevTs && now - prevTs < 6 * 3600 * 1000) {
      return { ok: true, skipped: 'dedup' };
    }
  }

  const safeHtml = clampTelegramHtml(html, 3850);
  const payload = {
    chat_id: targetChat,
    text: safeHtml,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  let sent;
  try {
    sent = await tgApi('sendMessage', payload, 12000);
  } catch (err) {
    const em = String(err?.message || '').toLowerCase();
    if (em.includes('parse entities') || em.includes('end of the entity') || em.includes('unsupported start tag')) {
      const plainPayload = { chat_id: targetChat, text: stripTags(safeHtml).slice(0, 3850), disable_web_page_preview: true };
      if (replyMarkup) plainPayload.reply_markup = replyMarkup;
      sent = await tgApi('sendMessage', plainPayload, 12000);
    } else {
      console.warn(`[Telegram] sendMessage err (${category} -> ${targetChat}):`, err.message);
      throw err;
    }
  }
  if (dedupKey) tgRuntime.sentKeys[dedupKey] = now;
  if (!bypassFilter && rateCappedCategory) {
    tgRuntime.autoSentTimestamps = (tgRuntime.autoSentTimestamps || []).filter(ts => now - ts < 3600 * 1000);
    tgRuntime.autoSentTimestamps.push(now);
    if (cleanSym) tgRuntime.symbolCooldowns[cleanSym] = { ts: now, bias: cleanBias };
  }
  const plainSummary = summary || stripTags(safeHtml).replace(/\s+/g, ' ').trim();
  pushTgLog('out', category, plainSummary);
  saveTgState();
  return { ok: true, messageId: sent.message_id };
}

function clampTelegramHtml(html, maxLen = 3850) {
  const s = String(html || '');
  if (s.length <= maxLen) return s;
  const lines = s.split('\n');
  const kept = [];
  let len = 0;
  const suffix = '\n...';
  for (const line of lines) {
    const add = (kept.length ? 1 : 0) + line.length;
    if (len + add + suffix.length > maxLen) break;
    kept.push(line);
    len += add;
  }
  if (kept.length) return kept.join('\n') + suffix;
  return stripTags(s).slice(0, maxLen - 3) + '...';
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

  const { extLabel, extPrice, extChgPct } = extractServerExtSession(liveQ, price);

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
  '1h': { interval: '60m', range: '90d', eth: true },
  '1d': { interval: '1d', range: '1y', eth: false }
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

function extractServerExtSession(q, fallbackPrice = null) {
  const regP = q?.regularMarketPrice ?? fallbackPrice;
  const mktState = String(q?.marketState || '').toUpperCase();
  if (!q || mktState === 'REGULAR') {
    return { extCode: '', extLabel: '', extPrice: null, extChgPct: null };
  }
  const hasOvn = q.overnightPrice != null && isFinite(q.overnightPrice) && q.overnightPrice > 0;
  const hasPre = q.preMarketPrice != null && isFinite(q.preMarketPrice) && q.preMarketPrice > 0;
  const hasPost = q.postMarketPrice != null && isFinite(q.postMarketPrice) && q.postMarketPrice > 0;
  const ovnTs = hasOvn ? toEpochSec(q.overnightTime) : 0;
  const preTs = hasPre ? toEpochSec(q.preMarketTime) : 0;
  const postTs = hasPost ? toEpochSec(q.postMarketTime) : 0;
  const tvSess = String(q.tvCurrentSession || '').toLowerCase();

  let extCode = '';
  if (mktState === 'PRE' && hasPre && preTs >= ovnTs) extCode = 'PRE';
  else if ((mktState === 'POST' || mktState === 'POSTPOST') && hasPost && postTs >= ovnTs) extCode = 'POST';
  else if (tvSess === 'night' && hasOvn) extCode = 'OVN';
  else if (hasPre || hasOvn || hasPost) {
    if (hasPre && preTs >= Math.max(ovnTs, postTs)) extCode = 'PRE';
    else if (hasOvn && ovnTs >= postTs) extCode = 'OVN';
    else if (hasPost) extCode = 'POST';
    else extCode = hasPre ? 'PRE' : (hasOvn ? 'OVN' : 'POST');
  }
  if (!extCode) return { extCode: '', extLabel: '', extPrice: null, extChgPct: null };
  const extPrice = extCode === 'PRE' ? q.preMarketPrice : (extCode === 'OVN' ? q.overnightPrice : q.postMarketPrice);
  const rawPct = extCode === 'PRE' ? q.preMarketChangePercent : (extCode === 'OVN' ? q.overnightChangePercent : q.postMarketChangePercent);
  const extChgPct = rawPct ?? (regP ? ((extPrice - regP) / regP) * 100 : 0);
  const extLabel = extCode === 'PRE' ? 'Pre-Market' : (extCode === 'OVN' ? 'Overnight' : 'Post-Market');
  return { extCode, extLabel, extPrice, extChgPct };
}

function extractQuoteExtFields(q) {
  if (!q) return {};
  const price = q.regularMarketPrice;
  const chgPct = q.regularMarketChangePercent;
  const ext = extractServerExtSession(q, price);
  return { price, chgPct, extType: ext.extLabel, extPrice: ext.extPrice, extChgPct: ext.extChgPct };
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
    } catch (_) { }

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
  const news = (newsRes?.news || []).slice(0, 4).map(n => {
    const rawPt = n.providerPublishTime;
    const normPt = (typeof rawPt === 'number' && rawPt < 1e12) ? rawPt * 1000 : rawPt;
    let publishedAt = '';
    if (normPt) {
      const d = new Date(normPt);
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }
    return {
      title: n.title || '',
      publisher: n.publisher || 'Yahoo Finance',
      link: n.link || n.canonicalUrl?.url || '',
      publishedAt
    };
  }).filter(x => x.title);

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
  const lines = (pack.opportunities || []).slice(0, 10).map(o => {
    const chgSgn = o.chgPct >= 0 ? '+' : '';
    const actTag = o.direction === 'BUY' ? 'BUY' : 'SELL';
    const liveTag = o.isFreshTrigger ? 'ACUM' : (o.isActionable ? 'SETUP' : 'BIAS');
    const thesis = String(o.aiThesis || o.setupArchetype || '').slice(0, 95);
    return (
      `<b>#${o.rank} ${escHtml(o.sym)}</b> · <code>${actTag} ${o.grade} (${liveTag})</code> · Prob <b>${o.probPct || 55}%</b> · Scor <b>${o.oppScore}</b>\n` +
      `Preț: <b>${fmtNum(o.price)}</b> (${chgSgn}${o.chgPct.toFixed(2)}%) · WR <code>${o.winRate}%</code> · RVOL <code>${o.rvol}x</code>\n` +
      `Zonă: <code>${fmtNum(o.entryZoneLow ?? o.entry)}–${fmtNum(o.entryZoneHigh ?? o.entry)}</code> · SL <code>${fmtNum(o.sl)}</code> · TP <code>${fmtNum(o.tp1)}/${fmtNum(o.tp2)}</code>` +
      (thesis ? `\n<i>${escHtml(thesis)}</i>` : '')
    );
  });

  const out = (
    `<b>TradePro AI · Top ${pack.opportunities.length} Idei (${dirLabel})</b>\n` +
    `TF: <code>${escHtml(pack.tf.toUpperCase())}</code> · Scanate: <b>${pack.evaluatedCount}</b> active (${pack.buyCount} BUY / ${pack.sellCount} SELL)\n\n` +
    (lines.length ? lines.join('\n\n') : `Nicio oportunitate găsită momentan.`)
  );
  return clampTelegramHtml(out, 3850);
}

function evaluateSmartRadarCandidate(cand, cockpitMatch, prefs = DEFAULT_TG_PREFS, mktRegime = null) {
  if (!cand || !cand.sym) return { eligible: false, reason: 'missing' };
  const minScore = Number(prefs.minScore || 78);
  const requireSafety = prefs.requirePreBuyPass !== false;
  const action = String(cand.verdict?.action || 'WAIT').toUpperCase();
  const riskScore = Number(cand.fiveScores?.risk?.score ?? 50);
  const isBearRegime = (mktRegime?.score ?? 50) <= 34;

  if (requireSafety) {
    if (cand.halt) return { eligible: false, reason: 'halt' };
    if (cand.dataQuality && !cand.dataQuality.rvol5mReliable) return { eligible: false, reason: 'rvol_anomaly' };
    if (cand.preBuyCheck?.hasCriticalFailure || cand.preBuyCheck?.isOverExtended) return { eligible: false, reason: 'safety_fail' };
    if (cand.spreadPct != null && cand.spreadPct > 2.5) return { eligible: false, reason: 'wide_spread' };
    if ((cand.dataQuality?.dollarVolume ?? (cand.price * cand.volume)) < 400000) return { eligible: false, reason: 'low_liq' };
  }

  const isBuyVerdict = action === 'BUY' || action === 'STRONG BUY';
  const isSellVerdict = action === 'SELL' || action === 'STRONG SELL';
  const isEarlyCoil = action === 'WAIT'
    && !cand.isExtended
    && cand.earlyScore >= Math.max(82, minScore + 4)
    && cand.aboveVwap === true
    && (cand.volAccel5m || 0) >= 1.8
    && (cand.distFromHodPct ?? -10) >= -2.8
    && (cand.buyPressurePct ?? 50) >= 58
    && (!requireSafety || (cand.preBuyCheck?.allowBuy && riskScore <= 58));

  if (!isBuyVerdict && !isSellVerdict && !isEarlyCoil) {
    return { eligible: false, reason: 'timing_wait' };
  }

  const bias = isSellVerdict ? 'SHORT' : 'LONG';
  if (bias === 'LONG' && requireSafety && cand.preBuyCheck && !cand.preBuyCheck.allowBuy) {
    return { eligible: false, reason: 'prebuy_blocked' };
  }
  if (bias === 'LONG' && requireSafety && riskScore > 64) {
    return { eligible: false, reason: 'high_risk' };
  }

  const effectiveMin = (bias === 'LONG' && isBearRegime) ? Math.min(94, minScore + 6) : minScore;
  if ((cand.earlyScore || 0) < effectiveMin) {
    return { eligible: false, reason: 'below_min_score' };
  }

  const boostVerdict = action.startsWith('STRONG') ? 8 : (isBuyVerdict || isSellVerdict ? 4 : 1);
  const boostCockpit = cockpitMatch ? (cockpitMatch.setupType === 'SHORT_SQUEEZE' ? 6 : 4) : 0;
  const boostBreakout = (cand.fiveScores?.breakoutConfirm?.score ?? 0) >= 70 ? 4 : 0;
  const riskPenalty = Math.max(0, riskScore - 45) * 0.25;
  const rankScore = Number(((cand.earlyScore || 0) + boostVerdict + boostCockpit + boostBreakout - riskPenalty).toFixed(2));

  return {
    eligible: true,
    bias,
    setupKind: isSellVerdict ? 'SELL_MOMENTUM' : (isEarlyCoil ? 'EARLY_COIL' : action),
    rankScore,
    cockpitMatch: cockpitMatch || null
  };
}

function formatSmartRadarAlertHtml(cand, deep, mktRegime, sessionCtx, cockpitMatch) {
  const act = String(cand.verdict?.action || 'EARLY COIL');
  const chgSgn = (cand.chgPct || 0) >= 0 ? '+' : '';
  const vwSgn = (cand.distVwapPct || 0) >= 0 ? '+' : '';
  const sc5 = cand.fiveScores || {};
  const pb = cand.preBuyCheck;
  const sec = deep?.sec;
  const opt = deep?.options;

  let planLine = '';
  if (cand.verdict?.entryPx != null && cand.verdict?.slPx != null) {
    planLine = `Plan <b>${escHtml(act)}</b>: Intrare <code>${fmtNum(cand.verdict.entryPx)}</code> · SL <code>${fmtNum(cand.verdict.slPx)}</code> · Țintă <code>${fmtNum(cand.verdict.tpPx)}</code>`;
  } else {
    planLine = `Praguri: Buy &gt; <code>${fmtNum(cand.verdict?.triggerBuyPx || cand.price)}</code> · Sell &lt; <code>${fmtNum(cand.verdict?.triggerSellPx || cand.price)}</code>`;
  }

  const lines = [
    `<b>TradePro Intel · ${escHtml(cand.sym)} (${escHtml(act)})</b>`,
    `${cand.name ? `<i>${escHtml(cand.name)}</i> · ` : ''}Sesiune: <code>${escHtml(sessionCtx?.label || 'LIVE')}</code> · Early Score: <b>${cand.earlyScore}/100</b>`,
    ``,
    `Preț: <b>$${fmtNum(cand.price)}</b> (<code>${chgSgn}${Number(cand.chgPct || 0).toFixed(2)}%</code>) · VWAP: <code>${vwSgn}${Number(cand.distVwapPct || 0).toFixed(2)}%</code>`,
    `Volum: RVOL TOD <code>${cand.rvolTod != null ? cand.rvolTod.toFixed(2) + 'x' : (cand.rvol10d || 1).toFixed(2) + 'x'}</code> · Accel 5m <code>${Number(cand.volAccel5m || 0).toFixed(1)}x</code> · Flux OHLCV <code>${cand.buyPressurePct ?? 50}%</code> (${escHtml(cand.cvdTrend || 'NEUTRU')})`,
    `5 Scoruri: Opp <code>${sc5.earlyOpportunity?.score ?? '—'}</code> | Mom <code>${sc5.momentum?.score ?? '—'}</code> | Brk <code>${sc5.breakoutConfirm?.score ?? '—'}</code> | Risc <code>${sc5.risk?.score ?? '—'}</code> | Știri <code>${sc5.newsCatalyst?.score ?? '—'}</code>`
  ];

  if (pb) {
    const gateStatus = pb.allowBuy ? `PASS (${pb.passedCount}/${pb.totalChecks})` : `ATENȚIE (${pb.blockers?.slice(0, 2).join(', ')})`;
    lines.push(`Scut Pre-BUY: <code>${escHtml(gateStatus)}</code> · Spread: <code>${cand.spreadPct != null ? cand.spreadPct.toFixed(2) + '%' : 'N/A'}</code>`);
  }
  if (sec?.available) {
    lines.push(`SEC EDGAR: Risc diluție <b>${escHtml(sec.dilutionRisk || 'SCĂZUT')}</b>${sec.latest8K ? ` · 8-K ${escHtml(sec.latest8K.date)}` : ''}`);
  }
  if (cand.shortPctFloat != null || cand.floatShares != null) {
    const fltTxt = cand.floatShares != null ? `${(cand.floatShares / 1e6).toFixed(1)}M` : 'N/A';
    lines.push(`Structură: Float <code>${fltTxt}</code> · Short Float <code>${cand.shortPctFloat != null ? cand.shortPctFloat + '%' : 'N/A'}</code>`);
  }
  if (cockpitMatch?.strategy) {
    lines.push(`Cockpit: <code>${escHtml(cockpitMatch.strategy)}</code>${cockpitMatch.fivePillarsDetail ? ` (5 Pillars: ${cockpitMatch.fivePillarsDetail.score}/100)` : ''}`);
  }
  if (opt?.available) {
    lines.push(`Opțiuni CBOE: IV30 <code>${opt.iv30 ?? '—'}%</code> · Max Pain <code>${opt.maxPain != null ? fmtNum(opt.maxPain) : '—'}</code> · P/C <code>${opt.pcVolRatio ?? '—'}</code> · Call Wall <code>${opt.callWall?.strike ?? '—'}</code>`);
  }
  lines.push(``);
  lines.push(planLine);
  if (cand.newsMeta?.title) {
    lines.push(`Catalizator (${Math.round(cand.newsMeta.ageHours || 0)}h): <i>${escHtml(cand.newsMeta.title.slice(0, 120))}</i>`);
  }
  if (mktRegime?.label) {
    lines.push(`Regim Piață SUA: <code>${escHtml(mktRegime.label)} (${mktRegime.score}/100)</code>`);
  }
  if (planLine) lines.push(planLine);
  return lines.join('\n');
}

function formatDeepIntelTelegramHtml(deep) {
  if (!deep || !deep.ok) return 'Date indisponibile pentru analiza deep.';
  const q = deep.quote || {};
  const f = deep.flow5m || {};
  const chgSgn = (q.chgPct || 0) >= 0 ? '+' : '';
  const obs = (deep.aiMarketAnalysis?.observations || []).slice(0, 4).map(o => `- ${escHtml(o)}`).join('\n');
  const watches = (deep.aiMarketAnalysis?.watchItems || []).slice(0, 2).map(w => `- ${escHtml(w)}`).join('\n');
  return (
    `<b>Deep Intel · ${escHtml(deep.sym)}</b> (${escHtml(q.name || deep.sym)})\n` +
    `Preț: <b>$${fmtNum(q.price)}</b> (${chgSgn}${Number(q.chgPct || 0).toFixed(2)}%) · Sesiune: <code>${escHtml(deep.sessionCtx?.label || '—')}</code>\n` +
    (f.vwap ? `VWAP: <code>$${fmtNum(f.vwap)}</code> (${f.aboveVwap ? 'PESTE' : 'SUB'}) · Accel 5m: <code>${Number(f.volAccel5m || 0).toFixed(1)}x</code> · Flux CLV: <code>${Math.round(f.buyPressurePct || 50)}%</code>\n` : '') +
    `Evaluare: <i>${escHtml(deep.pricedInVerdict || '')}</i>\n\n` +
    (obs ? `<b>Date Verificate (5m + SEC + CBOE):</b>\n${obs}\n\n` : '') +
    (watches ? `<b>De urmărit:</b>\n${watches}` : '')
  );
}

function formatEarlyRadarScanHtml(pack) {
  const list = (pack?.candidates || []).slice(0, 6);
  const rows = list.map((c, idx) => {
    const chgSgn = (c.chgPct || 0) >= 0 ? '+' : '';
    const act = c.verdict?.shortBadge || c.verdict?.action || 'WAIT';
    const rv = c.rvolTod != null ? `${c.rvolTod.toFixed(1)}x` : `${(c.rvol10d || 1).toFixed(1)}x`;
    const gate = c.preBuyCheck?.allowBuy ? 'PASS' : 'BLOCAT';
    return (
      `<b>${idx + 1}. ${escHtml(c.sym)}</b> · <code>${escHtml(act)}</code> · Early <b>${c.earlyScore}</b> · Gate <code>${gate}</code>\n` +
      `Preț <b>$${fmtNum(c.price)}</b> (${chgSgn}${Number(c.chgPct || 0).toFixed(2)}%) · RVOL ${rv} · 5m ${Number(c.volAccel5m || 0).toFixed(1)}x · ${escHtml(c.setupTag || '')}`
    );
  });
  return (
    `<b>TradePro · Early Signal Radar (${escHtml(String(pack?.mode || 'all').toUpperCase())})</b>\n` +
    `Sesiune: <code>${escHtml(pack?.sessionCtx?.label || 'LIVE')}</code> · Regim: <code>${escHtml(pack?.marketRegime?.label || 'Neutru')} (${pack?.marketRegime?.score ?? 50})</code>\n` +
    `Scanate: <b>${pack?.totalScanned || 0}</b> · Acționabile: <b>${(pack?.buySignalsCount || 0) + (pack?.sellSignalsCount || 0)}</b> · Prioritate 85+: <b>${pack?.highPriorityCount || 0}</b>\n\n` +
    (rows.length ? rows.join('\n\n') : `Nicio candidatură nu a trecut filtrele curente.`)
  );
}

function formatCockpitTelegramHtml(pack) {
  const groups = [
    { label: 'Early Movers', items: (pack?.earlyMovers || []).slice(0, 3) },
    { label: '5 Pillars', items: (pack?.fivePillars || []).slice(0, 3) },
    { label: 'Squeeze Reale (SI confirmat)', items: (pack?.squeezeAlerts || []).slice(0, 3) }
  ];
  const sections = groups.map(g => {
    if (!g.items.length) return `<b>${escHtml(g.label)}:</b> Niciun candidat`;
    const lines = g.items.map(it => {
      const sgn = (it.chgPct || 0) >= 0 ? '+' : '';
      const act = it.verdict?.shortBadge || it.verdict?.action || 'WAIT';
      return `- <b>${escHtml(it.sym)}</b> $${fmtNum(it.price)} (${sgn}${Number(it.chgPct || 0).toFixed(2)}%) · <code>${escHtml(act)}</code> · ${escHtml(it.strategy || '')}`;
    });
    return `<b>${escHtml(g.label)}:</b>\n${lines.join('\n')}`;
  });
  return (
    `<b>TradePro · Scanner Cockpit Live</b>\n` +
    `Sesiune: <code>${escHtml(pack?.sessionCtx?.label || '—')}</code> · Regim: <code>${escHtml(pack?.marketRegime?.label || '—')}</code> · Halts LULD: <b>${pack?.halts?.length || 0}</b>\n\n` +
    sections.join('\n\n')
  );
}

function formatMarketOverviewTelegramHtml(mkt) {
  const macroLines = (mkt?.macro || []).slice(0, 6).map(m => {
    const sgn = (m.chgPct || 0) >= 0 ? '+' : '';
    return `- <b>${escHtml(m.label)}</b>: ${fmtNum(m.price)} (<code>${sgn}${Number(m.chgPct || 0).toFixed(2)}%</code>)`;
  });
  const topSec = (mkt?.sectors || []).slice(0, 3).map(s => `${s.sym} ${s.chgPct >= 0 ? '+' : ''}${Number(s.chgPct || 0).toFixed(2)}%`).join(' · ');
  const botSec = (mkt?.sectors || []).slice(-2).map(s => `${s.sym} ${s.chgPct >= 0 ? '+' : ''}${Number(s.chgPct || 0).toFixed(2)}%`).join(' · ');
  return (
    `<b>TradePro · Puls Piață SUA &amp; Regim</b>\n` +
    `Regim: <b>${escHtml(mkt?.regime?.label || 'Neutru')} (${mkt?.regime?.score ?? 50}/100)</b>\n` +
    `Breadth (250 lichide): Up <b>${mkt?.breadth?.pctUp ?? '—'}%</b> · Peste SMA50: <code>${mkt?.breadth?.pctAboveSma50 ?? '—'}%</code>\n\n` +
    `${macroLines.join('\n')}\n\n` +
    `Sectoare Top: <code>${escHtml(topSec)}</code>\n` +
    `Sectoare Slabe: <code>${escHtml(botSec)}</code>`
  );
}

const COCKPIT_SECTIONS = {
  topGainers: { key: 'topGainers', title: 'Top Gainers SUA Live', shortLbl: 'Gainers', empty: 'Niciun Top Gainer calificat momentan.' },
  lowFloat: { key: 'lowFloat', title: 'Low Float (&lt; 25M Acțiuni)', shortLbl: 'LowFloat', empty: 'Niciun mover Low Float momentan.' },
  fivePillars: { key: 'fivePillars', title: '5 Pillars Momentum', shortLbl: '5 Pillars', empty: 'Nicio potrivire 5 Pillars momentan.' },
  squeezeAlerts: { key: 'squeezeAlerts', title: 'Short Squeeze &amp; Spike 5m', shortLbl: 'Squeeze', empty: 'Nicio alertă Short Squeeze momentan.' },
  earlyMovers: { key: 'earlyMovers', title: 'Early Movers (-2%..+8% Volum)', shortLbl: 'Early', empty: 'Niciun Early Mover momentan.' }
};

function formatCockpitSectionTelegramHtml(pack, section = 'topGainers') {
  const cfg = COCKPIT_SECTIONS[section] || COCKPIT_SECTIONS.topGainers;
  const rows = (pack?.[cfg.key] || []).slice(0, 7);
  const lines = rows.map((r, idx) => {
    const chgSgn = (r.chgPct || 0) >= 0 ? '+' : '';
    const vwSgn = (r.distVwapPct || 0) >= 0 ? '+' : '';
    const act = r.verdict?.shortBadge || r.verdict?.action || 'WAIT';
    const fltTxt = r.floatShares != null ? `${(r.floatShares / 1e6).toFixed(1)}M` : 'N/A';
    const siTxt = r.shortPctFloat != null ? ` · SI ${Number(r.shortPctFloat).toFixed(1)}%` : '';
    const preTxt = r.preChgPct != null && Math.abs(r.preChgPct) >= 0.5 ? ` · PM ${r.preChgPct >= 0 ? '+' : ''}${Number(r.preChgPct).toFixed(1)}%` : '';
    return (
      `<b>${idx + 1}. ${escHtml(r.sym)}</b> · <b>$${fmtNum(r.price)}</b> (<code>${chgSgn}${Number(r.chgPct || 0).toFixed(2)}%</code>) · <code>${escHtml(act)}</code>\n` +
      `RVOL <code>${Number(r.rvolDaily || 1).toFixed(1)}x</code> · 5m <code>${escHtml(r.rvol5mDisplay || '—')}</code> · Float <code>${fltTxt}</code> · VWAP <code>${vwSgn}${Number(r.distVwapPct || 0).toFixed(1)}%</code>${siTxt}${preTxt}`
    );
  });
  return (
    `<b>TradePro · ${cfg.title}</b>\n` +
    `Sesiune: <code>${escHtml(pack?.sessionCtx?.label || 'LIVE')}</code> · Regim: <code>${escHtml(pack?.marketRegime?.label || 'Neutru')} (${pack?.marketRegime?.score ?? 50})</code> · Halts: <b>${pack?.halts?.length || 0}</b>\n\n` +
    (lines.length ? lines.join('\n\n') : cfg.empty)
  );
}

function buildCockpitSectionKeyboard(items = [], activeSection = 'topGainers') {
  const symRow = (items || []).slice(0, 4).map(r => ({ text: `Intel ${r.sym}`, callback_data: `an_deep:${r.sym}` }));
  const tabKeys = ['topGainers', 'lowFloat', 'fivePillars', 'squeezeAlerts'];
  const tabRow = tabKeys.map(k => ({
    text: (k === activeSection ? '* ' : '') + COCKPIT_SECTIONS[k].shortLbl,
    callback_data: `cockpitsec:${k}`
  }));
  const rows = [];
  if (symRow.length) rows.push(symRow);
  rows.push(tabRow);
  rows.push([
    { text: (activeSection === 'earlyMovers' ? '* ' : '') + 'Early Movers', callback_data: 'cockpitsec:earlyMovers' },
    { text: 'Halts LULD', callback_data: 'hub:halts' },
    { text: 'Early Radar', callback_data: 'cmd:radar' },
    { text: 'Panou', callback_data: 'cmd:menu' }
  ]);
  return { inline_keyboard: rows };
}

function buildRadarInlineKeyboard(candidates = [], activeMode = 'all') {
  const symBtns = (candidates || []).slice(0, 4).map(c => ({ text: `Intel ${c.sym}`, callback_data: `an_deep:${c.sym}` }));
  const modes = [
    { id: 'all', lbl: 'Toate' },
    { id: 'actionable', lbl: 'BUY/SELL' },
    { id: 'breakout_confirmed', lbl: 'Breakout' },
    { id: 'volume_explosion', lbl: 'Volum' }
  ];
  const modeRow = modes.map(m => ({
    text: (m.id === activeMode ? '* ' : '') + m.lbl,
    callback_data: `radarmode:${m.id}`
  }));
  const rows = [];
  if (symBtns.length) rows.push(symBtns);
  rows.push(modeRow);
  rows.push([
    { text: (activeMode === 'smallcap' ? '* ' : '') + 'SmallCap', callback_data: 'radarmode:smallcap' },
    { text: (activeMode === 'watchlist' ? '* ' : '') + 'Watchlist', callback_data: 'radarmode:watchlist' },
    { text: 'Top Gainers', callback_data: 'hub:gainers' },
    { text: 'Panou', callback_data: 'cmd:menu' }
  ]);
  return { inline_keyboard: rows };
}

function formatHaltsTelegramHtml(pack) {
  const halts = (pack?.halts || []).slice(0, 10);
  if (!halts.length) {
    return `<b>NASDAQ LULD Trade Halts Live</b>\nSesiune: <code>${escHtml(pack?.sessionCtx?.label || '—')}</code>\n\nNicio pauză LULD raportată recent.`;
  }
  const lines = halts.map((h, i) => {
    const res = h.resumptionTime ? ` · Reluare <code>${escHtml(h.resumptionTime)}</code>` : ' · <b>ÎN PAUZĂ</b>';
    return `${i + 1}. <b>${escHtml(h.sym)}</b> · <code>${escHtml(h.code || 'LULD')}</code> (${escHtml(h.explanation || 'Pauză volatilitate')})\nOra: <code>${escHtml(h.haltTime || '—')}</code>${res}`;
  });
  return `<b>TradePro · NASDAQ LULD Trade Halts (${halts.length})</b>\n\n${lines.join('\n\n')}`;
}

function formatCatalystsNewsHtml(pack) {
  const feed = (pack?.newsfeed || []).slice(0, 7);
  if (!feed.length) {
    return `<b>TradePro · Catalizatori &amp; Știri Moveri</b>\n\nNicio știre proaspătă detectată momentan pe simbolurile active.`;
  }
  const lines = feed.map((n, i) => {
    const age = n.ageHours != null ? `${Math.round(n.ageHours)}h` : 'nou';
    const cat = n.catalystType || n.category || 'Știre';
    return `${i + 1}. <b>${escHtml(n.sym)}</b> · <code>${escHtml(cat)}</code> (<code>${escHtml(n.bias || 'NEUTRU')}</code> · ${age})\n<i>${escHtml(String(n.title || '').slice(0, 105))}</i>`;
  });
  return `<b>TradePro · Catalizatori &amp; Știri Moveri</b>\nSesiune: <code>${escHtml(pack?.sessionCtx?.label || 'LIVE')}</code>\n\n${lines.join('\n\n')}`;
}

function formatValidationReportHtml(rep) {
  if (!rep || !rep.totalSignals) {
    return `<b>TradePro · Audit Acuratețe Early Radar</b>\n\nÎncă nu există semnale istorice evaluate. Rulează <code>/radar</code> în timpul sesiunilor active pentru colectare automată.`;
  }
  const fmtPct = (v) => v != null ? `${v}%` : '—';
  const fmtRet = (v) => v != null ? `${v >= 0 ? '+' : ''}${v}%` : '—';
  const recent = (rep.recentSignals || []).slice(0, 5).map(s =>
    `- <b>${escHtml(s.sym)}</b> <code>${escHtml(s.direction || 'LONG')}</code> (Scor ${s.entryScore}) · MFE <code>+${Number(s.mfePct || 0).toFixed(1)}%</code> · Status <code>${escHtml(s.status || 'TRACKING')}</code>`
  ).join('\n');
  return (
    `<b>TradePro · Acuratețe &amp; Validare Early Radar</b>\n` +
    `Total semnale: <b>${rep.totalSignals}</b> (Evaluate: <b>${rep.evaluatedCount}</b> · Prioritate 85+: <b>${rep.highPriorityCount}</b>)\n` +
    `WinRate: <b>${fmtPct(rep.winRatePct)}</b> · Profit Factor: <b>${rep.profitFactor ?? '—'}</b> · Expectancy: <code>${fmtRet(rep.expectancyPct)}</code>\n` +
    `Hit +3%: <code>${fmtPct(rep.hit3Pct)}</code> · Hit +5%: <code>${fmtPct(rep.hit5Pct)}</code> · Avg MFE: <code>${fmtRet(rep.avgMfePct)}</code> · MAE: <code>${fmtRet(rep.avgMaePct)}</code>\n` +
    `Medii orizont: 15m <code>${fmtRet(rep.avgRet15m)}</code> · 30m <code>${fmtRet(rep.avgRet30m)}</code> · 60m <code>${fmtRet(rep.avgRet60m)}</code>\n\n` +
    (recent ? `<b>Ultimele Semnale Monitorizate:</b>\n${recent}` : '')
  );
}

function formatCopilotTelegramHtml(ans) {
  if (!ans || !ans.ok) return 'Nu am putut genera analiza AI Copilot.';
  const header = `<b>TradePro AI Copilot · ${escHtml(ans.sym || 'PIAȚĂ')}</b> (<code>${escHtml(ans.sessionCtx?.label || 'LIVE')}</code>)\n`;
  const parts = (ans.sections || []).slice(0, 4).map(sec => {
    const bullets = (sec.bullets || []).slice(0, 3).map(b => `- ${escHtml(String(b).slice(0, 210))}`).join('\n');
    return `<b>${escHtml(sec.heading || 'Analiză')}</b>\n${bullets}`;
  });
  return clampTelegramHtml(`${header}\n${parts.join('\n\n')}`, 3850);
}

async function editOrSendTelegramReply({ chatId, messageId = null, html, replyMarkup = null }) {
  const safeHtml = clampTelegramHtml(html, 3850);
  if (messageId) {
    try {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: safeHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup || undefined
      });
      return;
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('not modified')) return;
      console.warn('[Telegram] editMessageText fallback:', e.message);
    }
  }
  await sendTelegramNotification({ chatId, category: 'reply', html: safeHtml, replyMarkup });
}

async function sendEarlyRadarView(chatId, mode = 'all', { messageId = null, force = false } = {}) {
  const validModes = ['all', 'actionable', 'early_momentum', 'breakout_confirmed', 'volume_explosion', 'reversal_accum', 'smallcap', 'watchlist', 'prebreakout', 'recovery'];
  const cleanMode = validModes.includes(mode) ? mode : 'all';
  const intel = getIntelEngine();
  const wl = (tgRuntime.terminal.watchlist || []).slice(0, 14);
  const pack = await intel.computeEarlyRadar({ mode: cleanMode, customSyms: wl, forceRefresh: force });
  await editOrSendTelegramReply({
    chatId,
    messageId,
    html: formatEarlyRadarScanHtml(pack),
    replyMarkup: buildRadarInlineKeyboard(pack?.candidates || [], cleanMode)
  });
}

async function sendCockpitSectionView(chatId, section = 'topGainers', { messageId = null, force = false } = {}) {
  const secKey = COCKPIT_SECTIONS[section] ? section : 'topGainers';
  const intel = getIntelEngine();
  const wl = (tgRuntime.terminal.watchlist || []).slice(0, 14);
  const pack = await intel.fetchScannerCockpit(wl, force);
  const items = pack?.[COCKPIT_SECTIONS[secKey].key] || [];
  await editOrSendTelegramReply({
    chatId,
    messageId,
    html: formatCockpitSectionTelegramHtml(pack, secKey),
    replyMarkup: buildCockpitSectionKeyboard(items, secKey)
  });
}

let smartRadarCycleBusy = false;
async function runSmartRadarMonitorCycle({ forceRun = false } = {}) {
  if (smartRadarCycleBusy) return { ok: true, skipped: 'busy' };
  if (!tgRuntime.prefs.enabled || !tgRuntime.prefs.radarIntel || !tgRuntime.chatId || !tgRuntime.runtimeToken) {
    return { ok: true, skipped: 'disabled' };
  }
  const rate = getTgRateStats();
  if (!forceRun && tgRuntime.prefs.onlyMarketOpen && !rate.marketOpen) {
    return { ok: true, skipped: 'market_closed' };
  }
  if (rate.maxPerHour > 0 && rate.sentLastHour >= rate.maxPerHour) {
    return { ok: true, skipped: 'rate_limit' };
  }

  smartRadarCycleBusy = true;
  tgRuntime.lastRadarScanTs = Date.now();
  try {
    const intel = getIntelEngine();
    const watchlist = (tgRuntime.terminal.watchlist || []).slice(0, 14);
    const [radarPack, cockpitPack] = await Promise.all([
      intel.computeEarlyRadar({ mode: 'all', customSyms: watchlist, forceRefresh: forceRun }),
      intel.fetchScannerCockpit(watchlist, false).catch(() => null)
    ]);

    const cockpitMap = new Map();
    if (cockpitPack) {
      for (const arr of [cockpitPack.squeezeAlerts, cockpitPack.fivePillars, cockpitPack.earlyMovers, cockpitPack.lowFloat]) {
        for (const r of (arr || [])) {
          if (r?.sym && !cockpitMap.has(r.sym)) cockpitMap.set(r.sym, r);
        }
      }
    }

    const candidates = radarPack?.candidates || [];
    const now = Date.now();
    const cooldownMs = (tgRuntime.prefs.cooldownMin || 180) * 60 * 1000;
    const eligible = [];

    for (const c of candidates) {
      const evalRes = evaluateSmartRadarCandidate(c, cockpitMap.get(c.sym), tgRuntime.prefs, radarPack?.marketRegime);
      if (!evalRes.eligible) continue;
      const prevCd = tgRuntime.symbolCooldowns?.[c.sym];
      if (prevCd && now - (prevCd.ts || 0) < cooldownMs && prevCd.bias === evalRes.bias) continue;
      eligible.push({ cand: c, ...evalRes });
    }

    eligible.sort((a, b) => b.rankScore - a.rankScore);
    if (!eligible.length) {
      return { ok: true, scanned: candidates.length, sentCount: 0, reason: 'no_qualified_moment' };
    }

    let sentCount = 0;
    for (const pick of eligible.slice(0, 2)) {
      if (tgRuntime.prefs.requirePreBuyPass && pick.bias === 'LONG') {
        const deep = await intel.fetchSymbolDeepIntel(pick.cand.sym, '15m').catch(() => null);
        if (deep?.sec?.dilutionRisk === 'RIDICAT') continue;
        pick.deep = deep;
      } else {
        pick.deep = await intel.fetchSymbolDeepIntel(pick.cand.sym, '15m').catch(() => null);
      }

      const dayBucket = new Date().toISOString().slice(0, 13);
      const res = await sendTelegramNotification({
        category: 'radar',
        sym: pick.cand.sym,
        bias: pick.bias,
        allowClosedMarket: forceRun,
        dedupKey: `intel_radar:${pick.cand.sym}:${pick.setupKind}:${dayBucket}`,
        summary: `Radar AI ${pick.cand.sym} (${pick.cand.verdict?.action || pick.setupKind}) · Scor ${pick.cand.earlyScore}`,
        html: formatSmartRadarAlertHtml(pick.cand, pick.deep, radarPack?.marketRegime, radarPack?.sessionCtx, pick.cockpitMatch),
        replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(pick.cand.sym, '15m', { includeMuteBtn: true }) }
      });
      if (res?.ok && !res.skipped) {
        sentCount++;
        break; // Max 1 top high-conviction briefing per 4-minute cycle to prevent spam bursts
      }
    }
    return { ok: true, scanned: candidates.length, qualified: eligible.length, sentCount };
  } finally {
    smartRadarCycleBusy = false;
  }
}

const BOT_COMMANDS_SPEC = [
  { command: 'menu', description: 'Panou Central cu taste inline (Gainers, Radar, ON/OFF)' },
  { command: 'tastatura', description: 'Activeaza/ascunde tastele rapide fixe de jos (/tastatura off)' },
  { command: 'gainers', description: 'Top Gainers SUA cu Pre-BUY Gate, RVOL si Float' },
  { command: 'radar', description: 'Early Signal Radar AI (Pre-Breakout, RVOL TOD, Pre-BUY Gate)' },
  { command: 'cockpit', description: 'Scanner Cockpit (Early Movers, 5 Pillars, Short Squeeze)' },
  { command: 'squeeze', description: 'Short Squeeze & Spike 5m cu Short Interest' },
  { command: 'lowfloat', description: 'Actiuni Low Float sub 25M cu volum accelerat' },
  { command: 'pillars', description: '5 Pillars Momentum Scanner' },
  { command: 'halts', description: 'Pauze de volatilitate NASDAQ LULD live' },
  { command: 'stiri', description: 'Catalizatori & Stiri relevante pe moveri' },
  { command: 'intel', description: 'Deep Intel simbol: SEC EDGAR + CBOE Options + Flux 5m' },
  { command: 'ai', description: 'Intreaba AI Trading Copilot direct din Telegram' },
  { command: 'acuratete', description: 'WinRate si validare istorica semnale Early Radar' },
  { command: 'piata', description: 'Puls Piata SUA, VIX, Breadth si Regim' },
  { command: 'top10', description: 'Top 10 oportunitati BUY/SELL din piata (/top10 buy|sell)' },
  { command: 'pret', description: 'Cotatie live + analiza R:R (ex: /pret NVDA 15m)' },
  { command: 'grafic', description: 'Deschide simbol pe terminal (ex: /grafic TSLA 5m)' },
  { command: 'wl', description: 'Watchlist live sau modificare (/wl, /wl add APPS)' },
  { command: 'alerta', description: 'Seteaza alerta (ex: /alerta ONDS > 6.00)' },
  { command: 'alerte', description: 'Lista alerte active (/alerte sau /alerte clear)' },
  { command: 'scan', description: 'Scanare rapida Early Radar + Watchlist' },
  { command: 'portofoliu', description: 'Echitate si pozitii Paper Trading active' },
  { command: 'buy', description: 'Ordin Long Paper (ex: /buy NVDA)' },
  { command: 'short', description: 'Ordin Short Paper (ex: /short TSLA)' },
  { command: 'inchide', description: 'Inchide pozitie Paper (/inchide NVDA sau tot)' },
  { command: 'togglesem', description: 'Comuta instant ON/OFF semnalele automate Telegram' },
  { command: 'toggleradar', description: 'Comuta ON/OFF scannerul Early Radar AI' },
  { command: 'notificari', description: 'Filtru inteligent, limita/ora, prag scor, ON/OFF' },
  { command: 'mute', description: 'Opreste imediat mesajele automate Telegram' },
  { command: 'unmute', description: 'Porneste mesajele inteligente Telegram' },
  { command: 'help', description: 'Ghid complet de comenzi TradePro' }
];

const KEYPAD_CMD_REWRITES = {
  '/radar radar ai': '/radar',
  '/gainers top gainers': '/gainers',
  '/cockpit cockpit': '/cockpit',
  '/squeeze squeeze': '/squeeze',
  '/top10 top 10 buy/sell': '/top10',
  '/piata puls piata': '/piata',
  '/togglesem semnale: activ': '/togglesem',
  '/togglesem semnale: oprit': '/togglesem',
  '/toggleradar radar auto: on': '/toggleradar',
  '/toggleradar radar auto: off': '/toggleradar',
  '/menu panou control': '/menu',
  '/intel intel activ': '/intel',
  '/portofoliu portofoliu': '/portofoliu',
  '/alerte alerte': '/alerte'
};

const PLAIN_TEXT_TO_CMD = {
  'radar': '/radar',
  'radar ai': '/radar',
  'scanner': '/radar',
  'scan': '/scan',
  'top gainers': '/gainers',
  'gainers': '/gainers',
  'top gainer': '/gainers',
  'cockpit': '/cockpit',
  'squeeze': '/squeeze',
  'short squeeze': '/squeeze',
  'low float': '/lowfloat',
  '5 pillars': '/pillars',
  'halts': '/halts',
  'luld': '/halts',
  'stiri': '/stiri',
  'catalizatori': '/stiri',
  'acuratete': '/acuratete',
  'winrate': '/acuratete',
  'top 10': '/top10',
  'top10': '/top10',
  'puls piata': '/piata',
  'piata': '/piata',
  'semnale on': '/unmute',
  'semnale off': '/mute',
  'semnale on/off': '/togglesem',
  'on': '/unmute',
  'off': '/mute',
  'mute': '/mute',
  'unmute': '/unmute',
  'meniu': '/menu',
  'menu': '/menu',
  'panou': '/menu',
  'tastatura': '/tastatura',
  'setari': '/notificari',
  'notificari': '/notificari',
  'watchlist': '/wl',
  'portofoliu': '/portofoliu',
  'alerte': '/alerte'
};

function formatHelpHtml() {
  const t = tgRuntime.terminal;
  const stTxt = tgRuntime.prefs.enabled ? 'ACTIV' : 'OPRIT (MUTE)';
  return (
    `<b>TradePro · Control Terminal &amp; Taste Telegram</b>\n` +
    `Activ pe ecran: <code>${escHtml(t.activeSymbol)}</code> (${escHtml(String(t.activeTf || '15m').toUpperCase())}) · Bot: <b>${stTxt}</b>\n\n` +
    `<b>Panou &amp; Taste Rapide:</b>\n` +
    `<code>/menu</code> — Panou Interactiv (Gainers, Radar, ON/OFF)\n` +
    `<code>/tastatura</code> — Activează tastele fixe jos (<code>/tastatura off</code> ascunde)\n\n` +
    `<b>Scanere AI, Gainers &amp; Riscuri:</b>\n` +
    `<code>/gainers</code> · <code>/lowfloat</code> · <code>/pillars</code> · <code>/squeeze</code>\n` +
    `<code>/radar [mod]</code> — Early Signal Radar (5 scoruri + Pre-BUY Gate)\n` +
    `<code>/cockpit</code> · <code>/halts</code> · <code>/stiri</code> · <code>/acuratete</code>\n` +
    `<code>/intel SIMBOL</code> — SEC EDGAR + CBOE Options + Flux 5m\n` +
    `<code>/ai ÎNTREBARE</code> — Întreabă AI Trading Copilot direct aici\n` +
    `<code>/piata</code> · <code>/top10 [buy|sell] [tf]</code>\n\n` +
    `<b>Control Rapid Semnale:</b>\n` +
    `<code>/togglesem</code> · <code>/mute</code> · <code>/unmute</code> · <code>/notificari</code> · <code>/prag 78</code> · <code>/limita 3</code>\n\n` +
    `<b>Terminal, Alerte &amp; Paper:</b>\n` +
    `<code>/pret SIMBOL</code> · <code>/grafic SIMBOL 5m</code> · <code>/wl [add|del]</code>\n` +
    `<code>/alerta SIMBOL &gt; PRET</code> · <code>/alerte</code> · <code>/buy</code> / <code>/short</code> / <code>/inchide</code>`
  );
}

async function handleTelegramCommand(chatId, rawText, fromUser = '') {
  let rawTrimmed = String(rawText || '').trim();
  if (!rawTrimmed) return;
  if (tgRuntime.botUsername) {
    const botMentionRx = new RegExp(`^@${tgRuntime.botUsername}\\b[:,]?\\s*`, 'i');
    rawTrimmed = rawTrimmed.replace(botMentionRx, '').trim();
  }
  const cleanLeadingMention = rawTrimmed.replace(/^(\/[a-z0-9_]+)@[a-z0-9_]+/i, '$1');
  const lowerTrimmed = cleanLeadingMention.toLowerCase();
  const normalizedInput = KEYPAD_CMD_REWRITES[lowerTrimmed] || PLAIN_TEXT_TO_CMD[lowerTrimmed] || cleanLeadingMention;

  const parts = normalizedInput.split(/\s+/);
  let cmdToken = parts[0].toLowerCase();
  const hadSlash = cmdToken.startsWith('/');
  if (hadSlash) cmdToken = cmdToken.slice(1);
  cmdToken = cmdToken.replace(/@[a-z0-9_]+$/i, '');
  const args = parts.slice(1);

  pushTgLog('in', 'cmd', `${hadSlash ? '/' : ''}${cmdToken}${args.length ? ' ' + args.join(' ') : ''}`);
  saveTgState();

  const slowCmds = new Set([
    'radar', 'early', 'gainers', 'topgainers', 'movers', 'lowfloat', 'pillars', '5pillars',
    'squeeze', 'shortsqueeze', 'earlymovers', 'cockpit', 'halts', 'luld', 'stiri', 'news',
    'catalizatori', 'catalysts', 'intel', 'deep', 'sec', 'piata', 'market', 'puls', 'macro',
    'top10', 'top', 'oportunitati', 'opps', 'semnale', 'scan', 'screener', 'ai', 'copilot',
    'intreaba', 'pret', 'p', 'quote', 'analiza', 'semnal', 'acuratete', 'validare', 'winrate', 'stats'
  ]);
  if (slowCmds.has(cmdToken) || !hadSlash) {
    tgApi('sendChatAction', { chat_id: chatId, action: 'typing' }, 4000).catch(() => { });
  }

  if (cmdToken === 'start') {
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>TradePro · Tastatura Rapidă de Comandă activată jos.</b>\nAlege o tastă din bara de jos sau folosește Panoul Interactiv de mai jos:`,
      replyMarkup: buildMainReplyKeyboard()
    });
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: formatControlHubHtml(),
      replyMarkup: { inline_keyboard: buildControlHubInlineKeyboard() }
    });
    return;
  }

  if (cmdToken === 'help' || cmdToken === 'comenzi') {
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: formatHelpHtml(),
      replyMarkup: { inline_keyboard: buildControlHubInlineKeyboard() }
    });
    return;
  }

  if (cmdToken === 'menu' || cmdToken === 'panou' || cmdToken === 'hub') {
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: formatControlHubHtml(),
      replyMarkup: { inline_keyboard: buildControlHubInlineKeyboard() }
    });
    return;
  }

  if (cmdToken === 'tastatura' || cmdToken === 'keyboard' || cmdToken === 'taste') {
    if (String(args[0] || '').toLowerCase() === 'off') {
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: `<b>Tastatura fixă a fost ascunsă.</b>\nScrie <code>/tastatura</code> oricând pentru reactivare sau folosește <code>/menu</code>.`,
        replyMarkup: { remove_keyboard: true }
      });
    } else {
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: `<b>Tastele rapide TradePro sunt active în partea de jos a chatului.</b>\nPoți da click pe <code>/radar</code>, <code>/gainers</code>, <code>Semnale: ACTIV/OPRIT</code> etc. chiar și în grup.`,
        replyMarkup: buildMainReplyKeyboard()
      });
    }
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

  if (cmdToken === 'togglesem') {
    tgRuntime.prefs.enabled = !tgRuntime.prefs.enabled;
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    const st = tgRuntime.prefs.enabled;
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: st
        ? `<b>Semnalele automate Telegram au fost PORNITE (ON).</b>\nFiltru Intel activ: scor minim <code>${tgRuntime.prefs.minScore}+</code> · max <code>${tgRuntime.prefs.maxPerHour || '∞'}/oră</code>.`
        : `<b>Semnalele automate Telegram au fost OPRITE (OFF / MUTE).</b>\nComenzile manuale și tastele din meniu rămân active.`,
      replyMarkup: buildMainReplyKeyboard()
    });
    return;
  }

  if (cmdToken === 'toggleradar') {
    tgRuntime.prefs.radarIntel = !tgRuntime.prefs.radarIntel;
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    const rd = tgRuntime.prefs.radarIntel;
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: rd
        ? `<b>Auto-Scanner Early Radar AI: PORNIT (ON).</b>\nScanează la 4 min doar momente validate Pre-BUY &amp; SEC.`
        : `<b>Auto-Scanner Early Radar AI: OPRIT (OFF).</b>\nPoți rula manual oricând cu tasta <code>/radar</code>.`,
      replyMarkup: buildMainReplyKeyboard()
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
      html: `<b>Notificările automate au fost OPRITE.</b>\nApasă tasta <code>Semnale: OPRIT</code> sau scrie <code>/unmute</code> pentru reactivare.`,
      replyMarkup: buildMainReplyKeyboard()
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
      html: `<b>Notificările selective au fost PORNITE.</b>\nPrag semnale: <code>${tgRuntime.prefs.minScore}+</code> · Max/oră: <code>${tgRuntime.prefs.maxPerHour || 'Nelim.'}</code>.`,
      replyMarkup: buildMainReplyKeyboard()
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

  if (cmdToken === 'limita' || cmdToken === 'cooldown') {
    const raw = args[0];
    if (cmdToken === 'cooldown') {
      const cd = parseInt(raw, 10);
      if (!isFinite(cd) || cd < 15 || cd > 1440) {
        await sendTelegramNotification({ chatId, category: 'reply', html: `Utilizare: <code>/cooldown 180</code> (minute între 15 și 1440 per simbol).` });
        return;
      }
      tgRuntime.prefs.cooldownMin = cd;
      saveTgState();
      enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
      await sendTelegramNotification({ chatId, category: 'reply', html: `Cooldown pe simbol setat la <b>${cd} minute</b>.` });
      return;
    }
    const maxHr = parseInt(raw, 10);
    if (!isFinite(maxHr) || maxHr < 0 || maxHr > 20) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Utilizare: <code>/limita 3</code> (max mesaje automate/oră, 0 = nelimitat).` });
      return;
    }
    tgRuntime.prefs.maxPerHour = maxHr;
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `Limita automată pe oră a fost setată la <b>${maxHr > 0 ? maxHr + ' mesaje/oră' : 'Nelimitat'}</b>.`
    });
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
        } catch (_) { }
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

  if (['radar', 'early'].includes(cmdToken)) {
    const modeArg = String(args[0] || 'all').toLowerCase();
    try {
      await sendEarlyRadarView(chatId, modeArg, { force: args.includes('live') || args.includes('fresh') });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Early Radar AI: ${escHtml(e.message)}` });
    }
    return;
  }

  const COCKPIT_CMD_MAP = {
    gainers: 'topGainers',
    topgainers: 'topGainers',
    movers: 'topGainers',
    lowfloat: 'lowFloat',
    pillars: 'fivePillars',
    '5pillars': 'fivePillars',
    squeeze: 'squeezeAlerts',
    shortsqueeze: 'squeezeAlerts',
    earlymovers: 'earlyMovers'
  };
  if (COCKPIT_CMD_MAP[cmdToken]) {
    try {
      await sendCockpitSectionView(chatId, COCKPIT_CMD_MAP[cmdToken], { force: args.includes('live') || args.includes('fresh') });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Scanner ${escHtml(cmdToken)}: ${escHtml(e.message)}` });
    }
    return;
  }

  if (cmdToken === 'cockpit') {
    try {
      const intel = getIntelEngine();
      const wl = (tgRuntime.terminal.watchlist || []).slice(0, 14);
      const pack = await intel.fetchScannerCockpit(wl, args.includes('fresh'));
      const firstSyms = []
        .concat(pack?.earlyMovers || [], pack?.fivePillars || [], pack?.squeezeAlerts || [])
        .map(x => x?.sym)
        .filter((s, idx, arr) => s && arr.indexOf(s) === idx)
        .slice(0, 4);
      const rows = [];
      if (firstSyms.length) rows.push(firstSyms.map(s => ({ text: `Intel ${s}`, callback_data: `an_deep:${s}` })));
      rows.push([
        { text: 'Top Gainers', callback_data: 'cockpitsec:topGainers' },
        { text: 'Low Float', callback_data: 'cockpitsec:lowFloat' },
        { text: '5 Pillars', callback_data: 'cockpitsec:fivePillars' },
        { text: 'Squeeze', callback_data: 'cockpitsec:squeezeAlerts' }
      ]);
      rows.push([
        { text: 'Halts LULD', callback_data: 'hub:halts' },
        { text: 'Early Radar AI', callback_data: 'cmd:radar' },
        { text: 'Panou Control', callback_data: 'cmd:menu' }
      ]);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatCockpitTelegramHtml(pack),
        replyMarkup: { inline_keyboard: rows }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Scanner Cockpit: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['halts', 'luld'].includes(cmdToken)) {
    try {
      const intel = getIntelEngine();
      const pack = await intel.fetchScannerCockpit((tgRuntime.terminal.watchlist || []).slice(0, 8), true);
      const btns = (pack?.halts || []).slice(0, 4).map(h => ({ text: `Intel ${h.sym}`, callback_data: `an_deep:${h.sym}` }));
      const rows = btns.length ? [btns] : [];
      rows.push([{ text: 'Top Gainers', callback_data: 'hub:gainers' }, { text: 'Panou Control', callback_data: 'cmd:menu' }]);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatHaltsTelegramHtml(pack),
        replyMarkup: { inline_keyboard: rows }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Halts LULD: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['stiri', 'news', 'catalizatori', 'catalysts'].includes(cmdToken)) {
    try {
      const intel = getIntelEngine();
      const pack = await intel.fetchScannerCockpit((tgRuntime.terminal.watchlist || []).slice(0, 12), false);
      const uniqSyms = Array.from(new Set((pack?.newsfeed || []).map(n => n.sym))).slice(0, 4);
      const rows = uniqSyms.length ? [uniqSyms.map(s => ({ text: `Intel ${s}`, callback_data: `an_deep:${s}` }))] : [];
      rows.push([{ text: 'Early Radar AI', callback_data: 'cmd:radar' }, { text: 'Top Gainers', callback_data: 'hub:gainers' }, { text: 'Panou', callback_data: 'cmd:menu' }]);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatCatalystsNewsHtml(pack),
        replyMarkup: { inline_keyboard: rows }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Știri &amp; Catalizatori: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['acuratete', 'validare', 'winrate', 'stats'].includes(cmdToken)) {
    try {
      const intel = getIntelEngine();
      const rep = await intel.getSignalValidationReport(args.includes('fresh'));
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatValidationReportHtml(rep),
        replyMarkup: { inline_keyboard: [[{ text: 'Rulează Early Radar', callback_data: 'cmd:radar' }, { text: 'Panou Control', callback_data: 'cmd:menu' }]] }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Acuratețe Radar: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['ai', 'copilot', 'intreaba'].includes(cmdToken)) {
    const query = args.join(' ').trim() || `Analizează simbolul activ ${tgRuntime.terminal.activeSymbol} și cele mai bune oportunități Early Radar acum`;
    try {
      const intel = getIntelEngine();
      const ans = await intel.answerCopilotQuery({
        query,
        sym: tgRuntime.terminal.activeSymbol || 'NVDA',
        tf: tgRuntime.terminal.activeTf || '15m',
        watchlist: tgRuntime.terminal.watchlist || []
      });
      const symBtns = (ans?.syms || []).slice(0, 3).map(s => ({ text: `Intel ${s}`, callback_data: `an_deep:${s}` }));
      const rows = symBtns.length ? [symBtns] : [];
      rows.push([{ text: 'Early Radar AI', callback_data: 'cmd:radar' }, { text: 'Panou Control', callback_data: 'cmd:menu' }]);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatCopilotTelegramHtml(ans),
        replyMarkup: { inline_keyboard: rows }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare AI Copilot: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['intel', 'deep', 'sec'].includes(cmdToken)) {
    const sym = normalizeSymServer(args[0] || tgRuntime.terminal.activeSymbol || 'NVDA');
    const tf = String(args[1] || tgRuntime.terminal.activeTf || '15m').toLowerCase();
    try {
      const intel = getIntelEngine();
      const deep = await intel.fetchSymbolDeepIntel(sym, tf);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatDeepIntelTelegramHtml(deep),
        replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(sym, tf) }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Deep Intel ${escHtml(sym)}: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['piata', 'market', 'puls', 'macro'].includes(cmdToken)) {
    try {
      const intel = getIntelEngine();
      const mkt = await intel.fetchMarketOverview(args.includes('fresh'));
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatMarketOverviewTelegramHtml(mkt),
        replyMarkup: { inline_keyboard: [[{ text: 'Vezi Early Radar', callback_data: 'cmd:radar' }, { text: 'Top 10 BUY/SELL', callback_data: 'top10:15m:all' }]] }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Puls Piață: ${escHtml(e.message)}` });
    }
    return;
  }

  if (['scan', 'screener'].includes(cmdToken)) {
    const tfArg = String(args[0] || '15m').toLowerCase();
    if (!args[0] || tfArg === 'radar') {
      try {
        const intel = getIntelEngine();
        const wl = (tgRuntime.terminal.watchlist || []).slice(0, 14);
        const pack = await intel.computeEarlyRadar({ mode: 'all', customSyms: wl, forceRefresh: false });
        if ((pack?.candidates || []).length) {
          const topBtns = pack.candidates.slice(0, 4).map(c => ({ text: `Intel ${c.sym}`, callback_data: `an_deep:${c.sym}` }));
          await sendTelegramNotification({
            chatId,
            category: 'reply',
            html: formatEarlyRadarScanHtml(pack),
            replyMarkup: { inline_keyboard: [topBtns] }
          });
          return;
        }
      } catch (_) { }
    }

    const baseList = Array.from(new Set([
      ...(tgRuntime.terminal.watchlist || []).slice(0, 10),
      'NVDA', 'TSLA', 'APPS', 'ONDS', 'AAPL', 'AMD', 'PLTR', 'META', 'BTC-USD', 'SPY'
    ])).slice(0, 12);

    const tf = tfArg;
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

  // Smart fallback: greetings, single tickers (NVDA /BTC), or natural-language questions via AI Copilot
  if (['salut', 'buna', 'bună', 'hello', 'hi', 'hey'].includes(cmdToken)) {
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: formatControlHubHtml(),
      replyMarkup: { inline_keyboard: buildControlHubInlineKeyboard() }
    });
    return;
  }

  const singleTickerLike = !args.length && /^[a-z0-9.^=\-]{1,10}$/i.test(cmdToken) && !['comanda', 'ce', 'cum', 'de', 'nu', 'da'].includes(cmdToken);
  if (singleTickerLike) {
    const symGuess = normalizeSymServer(cmdToken);
    if (symGuess) {
      try {
        const analysis = await analyzeSymbolServer(symGuess, tgRuntime.terminal.activeTf || '15m');
        await sendTelegramNotification({
          chatId,
          category: 'reply',
          html: formatAnalysisHtml(analysis),
          replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(analysis.sym, analysis.tf) }
        });
        return;
      } catch (_) { }
    }
  }

  if (!hadSlash && rawTrimmed.length >= 3) {
    try {
      const intel = getIntelEngine();
      const ans = await intel.answerCopilotQuery({
        query: rawTrimmed,
        sym: tgRuntime.terminal.activeSymbol || 'NVDA',
        tf: tgRuntime.terminal.activeTf || '15m',
        watchlist: tgRuntime.terminal.watchlist || []
      });
      const symBtns = (ans?.syms || []).slice(0, 3).map(s => ({ text: `Intel ${s}`, callback_data: `an_deep:${s}` }));
      const rows = symBtns.length ? [symBtns] : [];
      rows.push([{ text: 'Panou Control', callback_data: 'cmd:menu' }]);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatCopilotTelegramHtml(ans),
        replyMarkup: { inline_keyboard: rows }
      });
      return;
    } catch (_) { }
  }

  await sendTelegramNotification({
    chatId,
    category: 'reply',
    html: `Comandă necunoscută: <code>/${escHtml(cmdToken)}</code>.\nApasă <code>/menu</code> pentru Panoul de Comandă sau scrie <code>/help</code>.`
  });
}

function applyPrefToggleKey(p1) {
  const boolKeys = {
    enabled: 'enabled',
    alerts: 'alerts',
    signals: 'signals',
    trades: 'trades',
    scanner: 'scanner',
    radarIntel: 'radarIntel',
    onlyMarketOpen: 'onlyMarketOpen',
    prebuy: 'requirePreBuyPass'
  };
  if (boolKeys[p1]) {
    const field = boolKeys[p1];
    tgRuntime.prefs[field] = !tgRuntime.prefs[field];
  } else if (p1 === 'score') {
    const cycle = [72, 78, 82, 88];
    const idx = cycle.indexOf(tgRuntime.prefs.minScore);
    tgRuntime.prefs.minScore = cycle[(idx + 1) % cycle.length];
  } else if (p1 === 'maxhour') {
    const cycle = [2, 3, 5, 0];
    const idx = cycle.indexOf(tgRuntime.prefs.maxPerHour);
    tgRuntime.prefs.maxPerHour = cycle[(idx + 1) % cycle.length];
  }
  saveTgState();
  enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
}

async function handleTelegramCallbackQuery(cb) {
  const data = String(cb.data || '');
  const chatId = cb.message?.chat?.id;
  const msgId = cb.message?.message_id;
  if (!chatId || !data) return;

  const [act, p1, p2] = data.split(':');
  pushTgLog('in', 'btn', `Buton Telegram: ${data}`);

  if (act === 'tog' || act === 'hubtog') {
    applyPrefToggleKey(p1);
    const toastTxt = p1 === 'enabled'
      ? (tgRuntime.prefs.enabled ? 'Semnale Telegram: ACTIVE' : 'Semnale Telegram: OPRITE')
      : p1 === 'radarIntel'
        ? (tgRuntime.prefs.radarIntel ? 'Radar Auto: PORNIT' : 'Radar Auto: OPRIT')
        : 'Preferințe actualizate';
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: toastTxt }).catch(() => { });
    if (msgId) {
      const isHub = act === 'hubtog';
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: isHub ? formatControlHubHtml() : formatPrefsMessageHtml(),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: isHub ? buildControlHubInlineKeyboard() : buildPrefsInlineKeyboard() }
      }).catch(() => { });
    }
    return;
  }

  if (act === 'hub' && p1) {
    if (p1 === 'kb') {
      await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: 'Actualizez tastatura de jos...' }).catch(() => { });
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: `<b>Tastele rapide TradePro sunt active în partea de jos.</b>`,
        replyMarkup: buildMainReplyKeyboard()
      });
      return;
    }
    const hubCmdMap = {
      gainers: '/gainers',
      lowfloat: '/lowfloat',
      pillars: '/pillars',
      squeeze: '/squeeze',
      early: '/earlymovers',
      radar: '/radar',
      cockpit: '/cockpit',
      halts: '/halts',
      stiri: '/stiri',
      acuratete: '/acuratete',
      piata: '/piata',
      wl: '/wl',
      portofoliu: '/portofoliu',
      alerte: '/alerte',
      notificari: '/notificari'
    };
    const targetCmd = hubCmdMap[p1] || `/${p1}`;
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Încarc ${p1}...` }).catch(() => { });
    await handleTelegramCommand(chatId, targetCmd, cb.from?.first_name || 'Trader');
    return;
  }

  if (act === 'cockpitsec' && p1) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Încarc ${p1}...` }).catch(() => { });
    try {
      await sendCockpitSectionView(chatId, p1, { messageId: msgId });
    } catch (e) {
      console.warn('[Telegram] cockpitsec err:', e.message);
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare ${escHtml(p1)}: ${escHtml(e.message)}` }).catch(() => { });
    }
    return;
  }

  if (act === 'radarmode' && p1) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Radar: ${p1}...` }).catch(() => { });
    try {
      await sendEarlyRadarView(chatId, p1, { messageId: msgId });
    } catch (e) {
      console.warn('[Telegram] radarmode err:', e.message);
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Radar (${escHtml(p1)}): ${escHtml(e.message)}` }).catch(() => { });
    }
    return;
  }

  if (act === 'mute') {
    tgRuntime.prefs.enabled = false;
    saveTgState();
    enqueueUiAction({ type: 'PREFS_UPDATED', prefs: tgRuntime.prefs });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: 'Notificările Telegram au fost OPRITE' }).catch(() => { });
    await sendTelegramNotification({
      chatId,
      category: 'reply',
      html: `<b>Mesajele automate Telegram au fost OPRITE.</b>\nApasă <code>/unmute</code> sau butonul de mai jos când vrei să le pornești din nou.`,
      replyMarkup: { inline_keyboard: [[{ text: 'Pornește Mesajele (ON)', callback_data: 'tog:enabled' }, { text: 'Panou Control', callback_data: 'cmd:menu' }]] }
    });
    return;
  }

  if (act === 'cmd' && p1) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Rulez /${p1}...` }).catch(() => { });
    await handleTelegramCommand(chatId, `/${p1}`, cb.from?.first_name || 'Trader');
    return;
  }

  if (act === 'top10') {
    const tf = p1 || '30m';
    const dir = p2 || 'all';
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Actualizez Top 10 (${dir.toUpperCase()})...` }).catch(() => { });
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
    } catch (_) { }
    return;
  }

  if (act === 'g' && p1) {
    const tf = p2 || '15m';
    tgRuntime.terminal.activeSymbol = p1;
    tgRuntime.terminal.activeTf = tf;
    enqueueUiAction({ type: 'OPEN_CHART', sym: p1, tf });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Grafic deschis: ${p1} (${tf.toUpperCase()})` }).catch(() => { });
    return;
  }

  if (act === 'an' && p1) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Analizez ${p1}...` }).catch(() => { });
    try {
      const a = await analyzeSymbolServer(p1, tgRuntime.terminal.activeTf || '15m');
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatAnalysisHtml(a),
        replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(a.sym, a.tf) }
      });
    } catch (_) { }
    return;
  }

  if (act === 'an_deep' && p1) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Intel SEC/Opt ${p1}...` }).catch(() => { });
    try {
      const intel = getIntelEngine();
      const tf = tgRuntime.terminal.activeTf || '15m';
      const deep = await intel.fetchSymbolDeepIntel(p1, tf);
      await sendTelegramNotification({
        chatId,
        category: 'reply',
        html: formatDeepIntelTelegramHtml(deep),
        replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(p1, tf) }
      });
    } catch (e) {
      await sendTelegramNotification({ chatId, category: 'reply', html: `Eroare Deep Intel ${escHtml(p1)}: ${escHtml(e.message)}` }).catch(() => { });
    }
    return;
  }

  if (act === 'wla' && p1) {
    if (!tgRuntime.terminal.watchlist.includes(p1)) tgRuntime.terminal.watchlist.unshift(p1);
    saveTgState();
    enqueueUiAction({ type: 'WL_ADD', sym: p1 });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `${p1} adăugat în Watchlist` }).catch(() => { });
    return;
  }

  if (act === 'alpct' && p1 && p2) {
    const pct = parseFloat(p2);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Setez alertă ${p1}...` }).catch(() => { });
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
    } catch (_) { }
    return;
  }

  if (act === 'aldel' && p1) {
    const id = Number(p1);
    tgRuntime.terminal.alerts = (tgRuntime.terminal.alerts || []).filter(a => a.id !== id);
    saveTgState();
    enqueueUiAction({ type: 'ALERT_DEL', id });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: 'Alertă ștearsă' }).catch(() => { });
    return;
  }

  if (act === 'ord' && p1 && p2) {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Execut ordin ${p2.toUpperCase()} pe ${p1}...` }).catch(() => { });
    await handleTelegramCommand(chatId, `/${p2 === 'buy' ? 'buy' : 'short'} ${p1}`);
    return;
  }

  if (act === 'pclose' && p1) {
    enqueueUiAction({ type: 'PAPER_CLOSE', sym: p1 });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id, text: `Poziție ${p1} închisă` }).catch(() => { });
    return;
  }

  await tgApi('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => { });
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
  const botTag = tgRuntime.botUsername ? `@${tgRuntime.botUsername.toLowerCase()}` : '';
  const mentionedBot = botTag ? txt.toLowerCase().includes(botTag) : false;
  const isReplyToBot = Boolean(tgRuntime.botId && msg.reply_to_message?.from?.id === tgRuntime.botId);
  const isKnownAlias = !!PLAIN_TEXT_TO_CMD[txt.toLowerCase()];
  if (txt.startsWith('/') || isPrivate || mentionedBot || isReplyToBot || isKnownAlias) {
    await handleTelegramCommand(msg.chat.id, txt, msg.from?.username || msg.from?.first_name || '');
  }
}

let pollLoopStarted = false;
async function startTelegramBridge() {
  if (pollLoopStarted || !tgRuntime.runtimeToken) return;
  pollLoopStarted = true;

  try {
    const me = await tgApi('getMe', {}, 8000);
    tgRuntime.botId = me.id || 0;
    tgRuntime.botUsername = me.username || '';
    tgRuntime.botFirstName = me.first_name || '';
    tgRuntime.botOk = true;
    await tgApi('deleteWebhook', { drop_pending_updates: false }, 6000).catch(() => { });
    await tgApi('setMyCommands', { commands: BOT_COMMANDS_SPEC }, 8000).catch(() => { });
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
            void processTelegramUpdate(u).catch(err => console.warn('[Telegram] Update err:', err.message));
          }
        }
      } catch (e) {
        tgRuntime.pollingActive = false;
        console.warn('[Telegram] Poll err:', e.code || '', e.message);
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
            sym: a.sym,
            allowClosedMarket: isAlwaysOpenAsset(a.sym),
            dedupKey: `alert:${a.id}`,
            summary: `Alertă ${a.sym} @ ${fmtNum(curP)}`,
            html:
              `<b>Alertă Preț Declanșată · ${escHtml(a.sym)}</b>\n` +
              `Condiție: <code>Preț ${a.cond === 'price_up' ? '&ge;' : '&le;'} ${fmtNum(a.price)}</code>\n` +
              `Preț live: <b>${fmtNum(curP)}</b>`,
            replyMarkup: { inline_keyboard: buildSymbolInlineKeyboard(a.sym, '15m', { includeMuteBtn: true }) }
          }).catch(() => { });
        }
      }
      if (changed) saveTgState();
    } catch (_) { }
  }, 18000);

  // Smart Early Signal Radar AI Monitor (every 4 minutes — respects Market Hours, Pre-BUY Gate, Cooldown & Hourly Cap)
  setTimeout(() => {
    runSmartRadarMonitorCycle({ forceRun: false }).catch(() => { });
  }, 22000);
  setInterval(() => {
    runSmartRadarMonitorCycle({ forceRun: false }).catch(() => { });
  }, 4 * 60 * 1000);
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
          const ext = extractServerExtSession(qHit, item.price);
          if (ext.extCode) {
            item.extType = ext.extCode;
            item.extPrice = ext.extPrice;
            item.extChgPct = ext.extChgPct;
          }
          if ((!item.name || item.name === item.sym) && (qHit.longName || qHit.shortName)) {
            item.name = qHit.longName || qHit.shortName;
          }
        }
      }
    } catch (_) { }
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/api/auth/')) {
    try {
      const body = (req.method === 'POST' || req.method === 'PUT') ? await readJsonBody(req) : {};
      const query = Object.fromEntries(parsedUrl.searchParams.entries());
      const out = await handleAuthApiRequest({
        method: req.method,
        pathname,
        headers: req.headers,
        body,
        query
      });
      if (out.redirect) {
        res.writeHead(302, { Location: out.redirect, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      return sendJson(res, out.status || 200, out.body);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  // ─── ETORO READ-ONLY PORTFOLIO SYNC ENDPOINTS ──────────────────────────────
  if (pathname.startsWith('/api/etoro/')) {
    try {
      const { createEtoroSyncService } = require('./etoro-sync-service');
      if (!global.__tpEtoroService) {
        global.__tpEtoroService = createEtoroSyncService({
          onPortfolioSynced: async ({ userId, snapshot, positions }) => {
            try {
              const stPath = path.join(__dirname, 'users_state.json');
              if (!fs.existsSync(stPath)) return;
              const rawDb = JSON.parse(fs.readFileSync(stPath, 'utf8'));
              const usersObj = rawDb.users || {};
              const targetUser = usersObj[userId] || Object.values(usersObj).find(u => u.role === 'admin') || Object.values(usersObj)[0];
              if (!targetUser) return;
              targetUser.personal = targetUser.personal || {};
              targetUser.personal.realPortfolio = global.__tpEtoroService.buildRealPortfolioFromEtoro({
                existingPortfolio: targetUser.personal.realPortfolio,
                snapshot,
                positions
              });
              fs.writeFileSync(stPath, JSON.stringify(rawDb, null, 2), 'utf8');
            } catch (_) {}
          }
        });
        global.__tpEtoroService.configureScheduler('default');
      }
      const etoroSvc = global.__tpEtoroService;

      if (pathname === '/api/etoro/status' && req.method === 'GET') {
        return sendJson(res, 200, etoroSvc.getStatus('default'));
      }
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      if (pathname === '/api/etoro/config' && req.method === 'POST') {
        const st = etoroSvc.updateConfig('default', body || {});
        return sendJson(res, 200, st);
      }
      if (pathname === '/api/etoro/test' && req.method === 'POST') {
        const customKeys = (body?.apiKey && body?.userKey)
          ? { apiKey: String(body.apiKey).trim(), userKey: String(body.userKey).trim() }
          : null;
        const result = await etoroSvc.testConnection(customKeys, 'default');
        return sendJson(res, 200, result);
      }
      if (pathname === '/api/etoro/sync' && req.method === 'POST') {
        const result = await etoroSvc.syncNow('default');
        return sendJson(res, 200, result);
      }
      return sendJson(res, 404, { ok: false, error: 'Ruta eToro necunoscută.' });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  const intel = getIntelEngine();

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

  if (pathname === '/api/intel/portfolio-evaluate' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const pf = body?.realPortfolio || body || {};
      const data = await intel.evaluateRealPortfolio(pf);
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
      rateStats: getTgRateStats(),
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
        }).catch(() => { });
      }
      if (body.prefs && typeof body.prefs === 'object') {
        tgRuntime.prefs = normalizeTgPrefs(body.prefs, tgRuntime.prefs);
      }
      saveTgState();
      return sendJson(res, 200, {
        ok: true,
        configured: !!(tgRuntime.runtimeToken && tgRuntime.chatId),
        botUsername: tgRuntime.botUsername,
        chatId: tgRuntime.chatId,
        prefs: tgRuntime.prefs,
        rateStats: getTgRateStats(),
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
        rateStats: getTgRateStats(),
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
      const summaryStr = String(body.summary || '');
      const htmlStr = String(body.html || '');
      const isPortfolioSmartAlert = summaryStr.includes('Alerte Smart Portofoliu') || htmlStr.includes('Radar Smart Portofoliu');
      if (isPortfolioSmartAlert && body.explicitUserClick !== true) {
        return sendJson(res, 200, { ok: true, skipped: 'auto_portfolio_push_disabled', rateStats: getTgRateStats(), logs: tgRuntime.logs.slice(0, 20) });
      }
      const sym = body.sym ? normalizeSymServer(body.sym) : '';
      const tf = body.tf || tgRuntime.terminal.activeTf || '15m';
      const replyMarkup = (body.includeActions && sym)
        ? { inline_keyboard: buildSymbolInlineKeyboard(sym, tf, { includeMuteBtn: true }) }
        : null;
      const result = await sendTelegramNotification({
        category: body.category || 'manual',
        sym,
        bias: body.bias || '',
        allowClosedMarket: !!body.allowClosedMarket,
        dedupKey: body.dedupKey || (isPortfolioSmartAlert ? `pf_manual_${Math.floor(Date.now() / 30000)}` : ''),
        summary: summaryStr,
        html: htmlStr,
        replyMarkup
      });
      return sendJson(res, 200, { ...result, rateStats: getTgRateStats(), logs: tgRuntime.logs.slice(0, 20) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/telegram/radar-scan' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const scanRes = await runSmartRadarMonitorCycle({ forceRun: body?.force !== false });
      return sendJson(res, 200, { ...scanRes, rateStats: getTgRateStats(), logs: tgRuntime.logs.slice(0, 20) });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/telegram/send-controls' && req.method === 'POST') {
    try {
      const targetChat = tgRuntime.chatId;
      if (!tgRuntime.runtimeToken || !targetChat) {
        return sendJson(res, 400, { ok: false, error: 'Token sau Chat ID Telegram neconfigurat.' });
      }
      await sendTelegramNotification({
        chatId: targetChat,
        category: 'reply',
        html: `<b>TradePro · Tastatură Rapidă activată jos.</b>`,
        replyMarkup: buildMainReplyKeyboard()
      });
      const resHub = await sendTelegramNotification({
        chatId: targetChat,
        category: 'manual',
        summary: 'Panou Control & Taste trimis pe Telegram',
        html: formatControlHubHtml(),
        replyMarkup: { inline_keyboard: buildControlHubInlineKeyboard() }
      });
      return sendJson(res, 200, { ...resHub, rateStats: getTgRateStats(), logs: tgRuntime.logs.slice(0, 20) });
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
        } catch (_) { }
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
      '.webmanifest': 'application/manifest+json; charset=utf-8',
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
      } catch (_) { }
    }
    try { res.end(); } catch (_) { }
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

module.exports = {
  computeTopMarketOpportunities,
  discoverLiveMarketUniverse,
  generateSingleAITradeIdeaServer,
  normalizeTgPrefs,
  evaluateSmartRadarCandidate,
  sendTelegramNotification,
  getTgRateStats,
  isAlwaysOpenAsset,
  runSmartRadarMonitorCycle,
  buildMainReplyKeyboard,
  buildControlHubInlineKeyboard,
  formatControlHubHtml,
  formatCockpitSectionTelegramHtml,
  handleTelegramCommand,
  handleTelegramCallbackQuery,
  processTelegramUpdate,
  BOT_COMMANDS_SPEC,
  tgRuntime
};
