const https = require('https');
const dns = require('dns');
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
const YahooFinancePkg = require('yahoo-finance2');
const YFClass = YahooFinancePkg.default || YahooFinancePkg;
const yf = typeof YFClass === 'function'
  ? new YFClass({ suppressNotices: ['yahooSurvey', 'ripHistorical'], validation: { logErrors: false } })
  : YFClass;
const {
  TV_INTERVAL_MAP,
  isUsEquityTicker,
  enrichQuotesWithTvExtended,
  fetchTvChartSupplement,
  mergeTvChartSupplement
} = require('./tv-overnight.js');
const { handleAuthApiRequest } = require('./auth-store.js');
const { createIntelEngine } = require('../../intel-backend.js');
const { createEtoroSyncService } = require('../../etoro-sync-service.js');
const serverlessEtoroService = createEtoroSyncService();
const serverlessIntelCache = new Map();
const serverlessIntelEngine = createIntelEngine({
  getCached: (k, ttl) => {
    const v = serverlessIntelCache.get(k);
    return (v && Date.now() - v.ts < ttl) ? v.val : null;
  },
  setCached: (k, val) => {
    serverlessIntelCache.set(k, { ts: Date.now(), val });
    if (serverlessIntelCache.size > 200) {
      serverlessIntelCache.delete(serverlessIntelCache.keys().next().value);
    }
  }
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
  'Cache-Control': 'no-store'
};

let serverlessTgPrefs = { enabled: true, alerts: true, signals: true, trades: true, scanner: false, radarIntel: true, onlyMarketOpen: true, minScore: 78, maxPerHour: 3, cooldownMin: 180 };
let serverlessUiActions = [];
let serverlessLogs = [];
const serverlessDedup = new Map();
const serverlessCooldown = new Map();
let serverlessSentTimestamps = [];

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const qs = event.queryStringParameters || {};
  const evPath = String(event.path || '');

  // Shared User Auth, Google OAuth & Personal/General Settings API
  if (evPath.includes('/api/auth/')) {
    const bodyObj = event.body ? (() => { try { return JSON.parse(event.body); } catch (_) { return {}; } })() : {};
    const out = await handleAuthApiRequest({
      method: event.httpMethod,
      pathname: evPath,
      headers: event.headers || {},
      body: bodyObj,
      query: qs
    });
    if (out.redirect) {
      return {
        statusCode: 302,
        headers: { ...CORS_HEADERS, Location: out.redirect },
        body: ''
      };
    }
    return {
      statusCode: out.status || 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(out.body)
    };
  }

  // eToro Read-Only Sync API on Netlify
  if (evPath.includes('/api/etoro/')) {
    try {
      const bodyObj = event.body ? JSON.parse(event.body) : {};
      if (evPath.endsWith('/status') && event.httpMethod === 'GET') {
        return { statusCode: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(serverlessEtoroService.getStatus('default')) };
      }
      if (evPath.endsWith('/config') && event.httpMethod === 'POST') {
        return { statusCode: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(serverlessEtoroService.updateConfig('default', bodyObj)) };
      }
      if (evPath.endsWith('/test') && event.httpMethod === 'POST') {
        const customKeys = (bodyObj?.apiKey && bodyObj?.userKey)
          ? { apiKey: String(bodyObj.apiKey).trim(), userKey: String(bodyObj.userKey).trim() }
          : null;
        const resTest = await serverlessEtoroService.testConnection(customKeys, 'default');
        return { statusCode: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(resTest) };
      }
      if (evPath.endsWith('/sync') && event.httpMethod === 'POST') {
        const resSync = await serverlessEtoroService.syncNow('default');
        return { statusCode: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(resSync) };
      }
    } catch (e) {
      return { statusCode: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: e.message }) };
    }
  }

  // Real Portfolio Live Risk & Technical Evaluator on Netlify
  if (evPath.includes('/api/intel/portfolio-evaluate') && event.httpMethod === 'POST') {
    try {
      const bodyObj = event.body ? JSON.parse(event.body) : {};
      const pf = bodyObj?.realPortfolio || bodyObj?.portfolio || bodyObj || {};
      const data = await serverlessIntelEngine.evaluateRealPortfolio(pf);
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data)
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ok: false, error: e.message })
      };
    }
  }

  // Serverless Global Symbol Search on Netlify (/api/search?q=...)
  if (evPath.endsWith('/api/search')) {
    const qClean = String(qs.q || '').trim();
    if (!qClean) {
      return { statusCode: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: true, results: [] }) };
    }
    try {
      const [tvRes, yfRes] = await Promise.all([
        fetch(`https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(qClean)}&hl=0&lang=en&domain=production`, {
          headers: { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/', 'User-Agent': 'Mozilla/5.0' }
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        yf.search(qClean, { quotesCount: 10, newsCount: 0 }, { validateResult: false }).catch(() => null)
      ]);
      const tvLogos = new Map();
      for (const s of (tvRes?.symbols || [])) {
        const sym = String(s.symbol || '').replace(/<[^>]+>/g, '').trim().toUpperCase();
        if (sym && s.logoid && !tvLogos.has(sym)) tvLogos.set(sym, { logoid: s.logoid, desc: String(s.description || '').replace(/<[^>]+>/g, '').trim() });
      }
      const out = [];
      for (const yq of (yfRes?.quotes || [])) {
        const sym = String(yq?.symbol || '').trim().toUpperCase();
        if (!sym || String(yq.quoteType || '').toLowerCase() === 'option') continue;
        const base = sym.replace(/=X|=F|\^/g, '').split('-')[0].split('.')[0];
        const tv = tvLogos.get(sym) || tvLogos.get(base);
        out.push({
          sym,
          name: yq.longname || yq.shortname || tv?.desc || sym,
          exch: String(yq.exchDisp || yq.exchange || 'MARKET').toUpperCase(),
          cat: 'stocks',
          badge: String(yq.typeDisp || 'MARKET').toUpperCase(),
          logoid: tv?.logoid || '',
          price: null,
          chgPct: null
        });
      }
      const syms = out.slice(0, 8).map(x => x.sym);
      if (syms.length) {
        try {
          const qArr = await yf.quote(syms, {}, { validateResult: false });
          const arr = Array.isArray(qArr) ? qArr : (qArr ? [qArr] : []);
          const qm = new Map(arr.filter(Boolean).map(q => [String(q.symbol).toUpperCase(), q]));
          out.forEach(it => {
            const h = qm.get(it.sym);
            if (h && h.regularMarketPrice != null) {
              it.price = h.regularMarketPrice;
              it.chgPct = h.regularMarketChangePercent ?? 0;
            }
          });
        } catch (_) { }
      }
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ok: true, query: qClean, results: out.slice(0, 8) })
      };
    } catch (e) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ok: false, results: [], error: e.message })
      };
    }
  }

  // Serverless Telegram Bridge support on Netlify
  if (evPath.includes('/api/telegram/')) {
    const tok = process.env.TELEGRAM_TOKEN || '';
    const chat = process.env.CHAT_ID || '';
    const jsonResp = (code, obj) => ({ statusCode: code, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(obj) });
    const bodyObj = event.body ? (() => { try { return JSON.parse(event.body); } catch (_) { return {}; } })() : {};

    if (evPath.endsWith('/status')) {
      return jsonResp(200, { ok: true, configured: !!(tok && chat), botOk: !!tok, botUsername: '', chatId: chat, pollingActive: false, prefs: serverlessTgPrefs, logs: serverlessLogs });
    }
    if (evPath.endsWith('/config')) {
      if (bodyObj.prefs) serverlessTgPrefs = { ...serverlessTgPrefs, ...bodyObj.prefs };
      return jsonResp(200, { ok: true, configured: !!(tok && chat), chatId: chat, prefs: serverlessTgPrefs, logs: serverlessLogs });
    }
    if (evPath.endsWith('/sync')) {
      const acts = serverlessUiActions.splice(0, serverlessUiActions.length);
      return jsonResp(200, { ok: true, botOk: !!tok, chatId: chat, prefs: serverlessTgPrefs, logs: serverlessLogs, uiActions: acts });
    }
    if (evPath.endsWith('/notify')) {
      if (!tok || !chat) return jsonResp(200, { ok: false, error: 'TELEGRAM_TOKEN sau CHAT_ID lipsă în Netlify Env' });
      const summaryStr = String(bodyObj.summary || '');
      const htmlStr = String(bodyObj.html || '');
      const isPortfolioSmartAlert = summaryStr.includes('Alerte Smart Portofoliu') || htmlStr.includes('Radar Smart Portofoliu');
      if (isPortfolioSmartAlert && bodyObj.explicitUserClick !== true) {
        return jsonResp(200, { ok: true, skipped: 'auto_portfolio_push_disabled', logs: serverlessLogs });
      }
      const cat = bodyObj.category || 'manual';
      const bypass = cat === 'reply' || cat === 'test' || cat === 'manual';
      const sym = String(bodyObj.sym || '').trim().toUpperCase();
      const bias = String(bodyObj.bias || '').trim().toUpperCase();
      const dedupKey = String(bodyObj.dedupKey || '').trim();
      const now = Date.now();
      if (!bypass) {
        if (!serverlessTgPrefs.enabled || (serverlessTgPrefs[cat] === false)) {
          return jsonResp(200, { ok: true, skipped: cat });
        }
        if (dedupKey && serverlessDedup.has(dedupKey) && now - serverlessDedup.get(dedupKey) < 6 * 3600 * 1000) {
          return jsonResp(200, { ok: true, skipped: 'dedup' });
        }
        if (sym && serverlessCooldown.has(sym)) {
          const prev = serverlessCooldown.get(sym);
          const cdMs = (serverlessTgPrefs.cooldownMin || 180) * 60 * 1000;
          if (now - prev.ts < cdMs && (!bias || prev.bias === bias)) {
            return jsonResp(200, { ok: true, skipped: 'cooldown' });
          }
        }
        serverlessSentTimestamps = serverlessSentTimestamps.filter(ts => now - ts < 3600 * 1000);
        if ((serverlessTgPrefs.maxPerHour || 3) > 0 && serverlessSentTimestamps.length >= (serverlessTgPrefs.maxPerHour || 3)) {
          return jsonResp(200, { ok: true, skipped: 'rate_limit' });
        }
      }
      const tgRes = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: String(bodyObj.html || '').slice(0, 3850), parse_mode: 'HTML', disable_web_page_preview: true })
      }).then(r => r.json()).catch(e => ({ ok: false, description: e.message }));
      if (!tgRes.ok) return jsonResp(500, { ok: false, error: tgRes.description || 'Telegram error' });
      if (dedupKey) {
        serverlessDedup.set(dedupKey, now);
        if (serverlessDedup.size > 400) serverlessDedup.delete(serverlessDedup.keys().next().value);
      }
      if (!bypass) {
        serverlessSentTimestamps.push(now);
        if (sym) serverlessCooldown.set(sym, { ts: now, bias });
      }
      serverlessLogs.unshift({ id: now, time: new Date().toLocaleTimeString('ro-RO'), dir: 'out', category: cat, summary: bodyObj.summary || 'Notificare trimisă' });
      serverlessLogs = serverlessLogs.slice(0, 20);
      return jsonResp(200, { ok: true, logs: serverlessLogs });
    }
  }

  const logoSym = qs.logo || (evPath.endsWith('/logo') ? qs.sym : '');
  if (logoSym) {
    const upper = String(logoSym).trim().toUpperCase();
    const US_PRIMARY_EXCH = /^(NASDAQ|NYSE|NYSE ARCA|AMEX|BATS|CBOE|CME|COMEX|NYMEX|CBOT|OTC)$/i;
    const KNOWN = {
      NVDA: 'nvidia', APPS: 'digital-turbine', ONDS: 'ondas', TSLA: 'tesla',
      AAPL: 'apple', MSFT: 'microsoft', AMZN: 'amazon', META: 'meta-platforms',
      ETORO: 'etoro', SPCX: 'spacex', 'SPCX.24-7': 'spacex',
      MSTR: 'strategy-cad-hedged-cibc-cdr', 'NQ=F': 'indices/nasdaq-100', '^NDX': 'indices/nasdaq-100',
      '^IXIC': 'indices/nasdaq-composite', 'ES=F': 'indices/s-and-p-500', '^GSPC': 'indices/s-and-p-500',
      'YM=F': 'indices/dow-30', '^DJI': 'indices/dow-30', 'GC=F': 'metal/gold', 'SI=F': 'metal/silver',
      'CL=F': 'crude-oil', 'NG=F': 'natural-gas'
    };
    let logoid = KNOWN[upper] || '';
    if (!logoid && upper.endsWith('-USD')) logoid = `crypto/XTVC${upper.replace('-USD', '')}`;
    else if (!logoid && upper.endsWith('=X') && upper.length >= 6) logoid = `country/${upper.slice(0, 2)}`;
    const cleanQ = upper.replace(/=X|=F|\^/g, '');
    if (!logoid && cleanQ) {
      try {
        const tvRes = await fetch(`https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(cleanQ)}&hl=0&lang=en&domain=production`, {
          headers: { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/', 'User-Agent': 'Mozilla/5.0' }
        });
        if (tvRes.ok) {
          const tvJson = await tvRes.json();
          const list = Array.isArray(tvJson?.symbols) ? tvJson.symbols : [];
          const altDot = cleanQ.replace(/-/g, '.');
          const exactList = list.filter(it => {
            const s = String(it.symbol || '').replace(/<[^>]+>/g, '').trim().toUpperCase();
            return s === cleanQ || s === altDot;
          });
          const best =
            exactList.find(it => it.logoid && it.country === 'US' && US_PRIMARY_EXCH.test(String(it.exchange || '').replace(/<[^>]+>/g, '').trim())) ||
            exactList.find(it => it.logoid && it.country === 'US') ||
            exactList.find(it => it.logoid) ||
            list.find(it => it.logoid);
          if (best?.logoid) logoid = best.logoid;
        }
      } catch (_) { }
    }
    const cands = [];
    if (logoid) cands.push(`https://s3-symbol-logo.tradingview.com/${logoid}--big.svg`);
    const cleanTicker = cleanQ.split('-')[0];
    if (cleanTicker) cands.push(`https://assets.parqet.com/logos/symbol/${encodeURIComponent(cleanTicker)}?format=png`);
    for (const u of cands) {
      try {
        const imgRes = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (imgRes.ok) {
          const ct = imgRes.headers.get('content-type') || (u.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.length > 64 && !ct.includes('text/html')) {
            return {
              statusCode: 200,
              headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
              body: buf.toString('base64'),
              isBase64Encoded: true
            };
          }
        }
      } catch (_) { }
    }
    const mono = upper.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'TP';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="#1E53E5"/><text x="28" y="35" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="18" font-weight="800">${mono}</text></svg>`;
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body: svg
    };
  }

  const targetUrl = qs.url;
  if (!targetUrl) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing ?url= parameter' }) };
  }

  try {
    const parsed = new URL(targetUrl);
    const p = parsed.pathname;

    if (p.includes('/v8/finance/chart/')) {
      const rawSym = decodeURIComponent(p.split('/v8/finance/chart/')[1].split('/')[0]);
      const interval = parsed.searchParams.get('interval') || '1d';
      const range = parsed.searchParams.get('range') || '1y';
      const validIntervals = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']);
      const yfInterval = validIntervals.has(interval) ? interval : '1d';
      const includePrePost = parsed.searchParams.get('includePrePost') === 'true';
      const period1 = rangeToPeriod1(range, yfInterval);

      const wantExt = includePrePost && TV_INTERVAL_MAP[yfInterval] && isUsEquityTicker(rawSym);
      const [ch, tvSupp] = await Promise.all([
        yf.chart(rawSym, { period1, interval: yfInterval, includePrePost }, { validateResult: false }),
        wantExt ? fetchTvChartSupplement(rawSym, yfInterval).catch(() => null) : Promise.resolve(null)
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
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      };
    }

    if (p.includes('/v7/finance/quote')) {
      const syms = (parsed.searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      if (syms.length) {
        try {
          const fetched = await yf.quote(syms, {}, { validateResult: false });
          const arr = Array.isArray(fetched) ? fetched : (fetched ? [fetched] : []);
          results.push(...arr.filter(Boolean));
        } catch (_) {
          await Promise.all(syms.map(async (s) => {
            try {
              const single = await yf.quote(s, {}, { validateResult: false });
              if (single) results.push(single);
            } catch (_) { }
          }));
        }
      }
      await enrichQuotesWithTvExtended(results).catch(() => { });
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ quoteResponse: { result: results, error: null } })
      };
    }

    if (p.includes('/v1/finance/search')) {
      const q = parsed.searchParams.get('q') || '';
      const quotesCount = Number(parsed.searchParams.get('quotesCount') ?? 8);
      const newsCount = Number(parsed.searchParams.get('newsCount') ?? 5);
      const sr = await yf.search(q, { quotesCount, newsCount }, { validateResult: false });
      const normNews = (sr?.news || []).map(n => ({
        ...n,
        title: n.title || 'Market Update',
        publisher: n.publisher || 'Yahoo Finance',
        link: n.link || n.canonicalUrl?.url || `https://finance.yahoo.com/quote/${encodeURIComponent(q)}`
      }));
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ quotes: sr?.quotes || [], news: normNews })
      };
    }

    if (parsed.hostname.includes('tradingview.com')) {
      const tvRes = await fetch(targetUrl, {
        headers: {
          'Origin': 'https://www.tradingview.com',
          'Referer': 'https://www.tradingview.com/',
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
      });
      const tvText = await tvRes.text();
      return {
        statusCode: tvRes.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
        body: tvText
      };
    }

    // Fallback generic HTTPS request
    const rawBody = await new Promise((resolve, reject) => {
      https.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      }, (r) => {
        let b = ''; r.on('data', c => b += c); r.on('end', () => resolve(b));
      }).on('error', reject);
    });
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      body: rawBody
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
