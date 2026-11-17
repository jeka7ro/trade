const tls = require('tls');
const crypto = require('crypto');

const TV_WS_HOST = 'data.tradingview.com';
const TV_WS_PATH = '/socket.io/websocket?from=chart%2F';
const TV_ORIGIN = 'https://www.tradingview.com';
const TV_INTERVAL_MAP = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '60m': '60',
  '1h': '60'
};

const internalCache = new Map();
const tvPrefixCache = new Map();
const quoteBatchInFlight = new Map();
const seriesInFlight = new Map();
let etTimeFmt = null;

function defaultCacheGet(key, ttlMs) {
  const hit = internalCache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  return null;
}

function defaultCacheSet(key, data) {
  if (internalCache.size > 500) {
    internalCache.delete(internalCache.keys().next().value);
  }
  internalCache.set(key, { ts: Date.now(), data });
}

function toEpochSec(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') {
    if (!isFinite(val) || val <= 0) return 0;
    return Math.floor(val > 1e12 ? val / 1000 : val);
  }
  if (val instanceof Date) {
    const ms = val.getTime();
    return isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  }
  const ms = Date.parse(String(val));
  return isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

function isUsEquityTicker(sym, quoteObj = null) {
  const u = String(sym || '').trim().toUpperCase();
  if (!u || u.includes('=') || u.startsWith('^') || u.endsWith('-USD')) return false;
  if (!/^[A-Z]{1,5}(?:[.-][A-B])?$/.test(u)) return false;
  if (quoteObj) {
    const mkt = String(quoteObj.market || '').toLowerCase();
    if (mkt && mkt !== 'us_market') return false;
    const ex = String(quoteObj.exchange || '').toUpperCase();
    if (ex && /^(TOR|VAN|CNQ|GER|FRA|ETR|STU|LSE|IOB|PAR|AMS|BRU|MIL|MCE|SWX|SIX|TLV|TYO|HKG|ASX|NSI|BSE|KSC|KOE)$/.test(ex)) {
      return false;
    }
  }
  return true;
}

function resolveTvExchangePrefix(quoteObj) {
  const raw = `${quoteObj?.fullExchangeName || ''} ${quoteObj?.exchange || ''}`.toUpperCase();
  if (/\bNYQ\b/.test(raw) || (/\bNYSE\b/.test(raw) && !/ARCA|AMEX|AMERICAN/.test(raw))) {
    return 'NYSE';
  }
  if (/\b(ASE|AMEX|PCX|ARCA|BTS|BATS|CBOE)\b/.test(raw)) {
    return 'AMEX';
  }
  return 'NASDAQ';
}

async function resolveTvExchangePrefixForSym(sym) {
  const cleanSym = String(sym || '').trim().toUpperCase();
  const hit = tvPrefixCache.get(cleanSym);
  if (hit && Date.now() - hit.ts < 24 * 3600 * 1000) return hit.prefix;
  try {
    const tvTicker = cleanSym.replace(/-/g, '.');
    const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(tvTicker)}&hl=0&lang=en&domain=production`;
    const res = await fetch(url, {
      headers: { Origin: TV_ORIGIN, Referer: `${TV_ORIGIN}/`, 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(1400)
    });
    if (res.ok) {
      const json = await res.json();
      const match = (json?.symbols || []).find(s => {
        const sSym = String(s.symbol || '').replace(/<[^>]+>/g, '').trim().toUpperCase();
        const exch = String(s.exchange || '').replace(/<[^>]+>/g, '').trim().toUpperCase();
        return (sSym === cleanSym || sSym === tvTicker) && s.country === 'US' && /^(NASDAQ|NYSE|AMEX|NYSE ARCA|BATS|CBOE)$/.test(exch);
      });
      if (match?.exchange) {
        let prefix = String(match.exchange).replace(/<[^>]+>/g, '').trim().toUpperCase();
        if (/ARCA|BATS|CBOE/.test(prefix)) prefix = 'AMEX';
        tvPrefixCache.set(cleanSym, { ts: Date.now(), prefix });
        return prefix;
      }
    }
  } catch (_) {}
  return 'NASDAQ';
}

function getEtMinuteOfDay(unixSec) {
  try {
    if (!etTimeFmt) {
      etTimeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    const parts = etTimeFmt.formatToParts(new Date(unixSec * 1000));
    let hh = 0;
    let mm = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type === 'hour') hh = parseInt(parts[i].value, 10) % 24;
      else if (parts[i].type === 'minute') mm = parseInt(parts[i].value, 10);
    }
    return hh * 60 + mm;
  } catch (_) {
    const d = new Date((unixSec - 5 * 3600) * 1000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

function isOvernightWindowET(unixSec) {
  const mins = getEtMinuteOfDay(unixSec);
  return mins >= 1200 || mins < 240;
}

function isRegularWindowET(unixSec) {
  const mins = getEtMinuteOfDay(unixSec);
  return mins >= 570 && mins < 960;
}

function packTvMsg(m, p) {
  const s = JSON.stringify({ m, p });
  return `~m~${s.length}~m~${s}`;
}

function encodeWsClientTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[0] = 0x81;
    header[1] = 0x80 | len;
    mask.copy(header, 2);
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    mask.copy(header, 10);
  }
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, masked]);
}

function openTvTlsWs(onOpen, onText, onClose) {
  const key = crypto.randomBytes(16).toString('base64');
  const sock = tls.connect(443, TV_WS_HOST, { servername: TV_WS_HOST }, () => {
    const req = [
      `GET ${TV_WS_PATH} HTTP/1.1`,
      `Host: ${TV_WS_HOST}`,
      `Origin: ${TV_ORIGIN}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '\r\n'
    ].join('\r\n');
    sock.write(req);
  });

  let upgraded = false;
  let buf = Buffer.alloc(0);
  let textFrag = [];

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!upgraded) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const head = buf.slice(0, idx).toString('utf8');
      buf = buf.slice(idx + 4);
      if (!/^HTTP\/1\.[01] 101\b/i.test(head)) {
        sock.destroy();
        onClose();
        return;
      }
      upgraded = true;
      onOpen((msg) => {
        if (!sock.destroyed) sock.write(encodeWsClientTextFrame(msg));
      });
    }

    while (buf.length >= 2) {
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      let plen = b1 & 0x7f;
      let off = 2;
      if (plen === 126) {
        if (buf.length < 4) break;
        plen = buf.readUInt16BE(2);
        off = 4;
      } else if (plen === 127) {
        if (buf.length < 10) break;
        plen = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const hasMask = (b1 & 0x80) !== 0;
      if (hasMask) off += 4;
      if (buf.length < off + plen) break;

      const payload = buf.slice(off, off + plen);
      buf = buf.slice(off + plen);

      if (opcode === 0x8) {
        sock.destroy();
        onClose();
        return;
      }
      if (opcode === 0x9) {
        const len = Math.min(125, payload.length);
        const mask = crypto.randomBytes(4);
        const pong = Buffer.allocUnsafe(6 + len);
        pong[0] = 0x8a;
        pong[1] = 0x80 | len;
        mask.copy(pong, 2);
        for (let i = 0; i < len; i++) pong[6 + i] = payload[i] ^ mask[i & 3];
        if (!sock.destroyed) sock.write(pong);
        continue;
      }
      if (opcode === 0x1 || opcode === 0x0) {
        textFrag.push(payload);
        if (fin) {
          onText(Buffer.concat(textFrag).toString('utf8'));
          textFrag = [];
        }
      }
    }
  });

  sock.on('error', () => {
    try { sock.destroy(); } catch (_) {}
    onClose();
  });
  sock.on('close', onClose);
  return () => { try { sock.destroy(); } catch (_) {} };
}

function runTvWsPackets({ timeoutMs = 1400, settleMs = 100, setup, onJson, isDone }) {
  return new Promise((resolve) => {
    let settled = false;
    let closeTransport = () => {};
    let hardTimer = null;
    let settleTimer = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      clearTimeout(settleTimer);
      try { closeTransport(); } catch (_) {}
      resolve();
    };

    const scheduleSettle = () => {
      if (settled || settleTimer) return;
      settleTimer = setTimeout(finish, settleMs);
    };

    hardTimer = setTimeout(finish, timeoutMs);

    const handleRawFrame = (raw, sendFn) => {
      const parts = String(raw || '').split(/~m~\d+~m~/).filter(Boolean);
      for (const part of parts) {
        if (part.startsWith('~h~')) {
          try { sendFn(`~m~${part.length}~m~${part}`); } catch (_) {}
          continue;
        }
        if (!part.startsWith('{')) continue;
        try {
          const msg = JSON.parse(part);
          onJson(msg);
        } catch (_) {}
      }
      if (isDone()) scheduleSettle();
    };

    if (typeof globalThis.WebSocket === 'function') {
      let ws;
      try {
        ws = new globalThis.WebSocket(`wss://${TV_WS_HOST}${TV_WS_PATH}`, {
          headers: { Origin: TV_ORIGIN }
        });
      } catch (_) {
        finish();
        return;
      }
      const sendFn = (txt) => {
        if (ws.readyState === 1) ws.send(txt);
      };
      closeTransport = () => { try { ws.close(); } catch (_) {} };
      ws.onopen = () => setup(sendFn);
      ws.onmessage = (ev) => handleRawFrame(ev.data, sendFn);
      ws.onerror = finish;
      ws.onclose = finish;
    } else {
      let tlsSend = () => {};
      closeTransport = openTvTlsWs(
        (fn) => { tlsSend = fn; setup(fn); },
        (txt) => handleRawFrame(txt, (m) => tlsSend(m)),
        finish
      );
    }
  });
}

async function fetchTvQuotesForUsStocks(quoteObjs, { getCached = defaultCacheGet, setCached = defaultCacheSet } = {}) {
  const resultMap = new Map();
  const pairs = [];
  const seenSyms = new Set();

  for (const q of (quoteObjs || [])) {
    if (!q || !q.symbol) continue;
    const sym = String(q.symbol).trim().toUpperCase();
    if (seenSyms.has(sym) || !isUsEquityTicker(sym, q)) continue;
    seenSyms.add(sym);

    const cached = getCached(`tvExt:${sym}`, 4500);
    if (cached) {
      resultMap.set(sym, cached);
      continue;
    }
    const prefix = resolveTvExchangePrefix(q);
    if (!tvPrefixCache.has(sym) && (q.exchange || q.fullExchangeName)) {
      tvPrefixCache.set(sym, { ts: Date.now(), prefix });
    }
    pairs.push({ sym, tvSym: `${prefix}:${sym.replace(/-/g, '.')}` });
  }

  if (!pairs.length) return resultMap;

  const batchKey = pairs.map(p => p.tvSym).sort().join(',');
  let batchPromise = quoteBatchInFlight.get(batchKey);
  if (!batchPromise) {
    batchPromise = (async () => {
      const collected = Object.create(null);
      const statusMap = Object.create(null);
      const tvToSym = new Map(pairs.map(p => [p.tvSym, p.sym]));

      await runTvWsPackets({
        timeoutMs: 1450,
        settleMs: 110,
        setup: (send) => {
          const qs = 'qs_' + Math.random().toString(36).slice(2, 10);
          send(packTvMsg('set_auth_token', ['unauthorized_user_token']));
          send(packTvMsg('quote_create_session', [qs]));
          send(packTvMsg('quote_add_symbols', [qs, ...pairs.map(p => p.tvSym)]));
        },
        onJson: (msg) => {
          if (msg.m === 'qsd' && Array.isArray(msg.p) && msg.p[1]) {
            const entry = msg.p[1];
            const k = entry.n;
            if (!k || !tvToSym.has(k)) return;
            statusMap[k] = entry.s || statusMap[k];
            collected[k] = Object.assign(collected[k] || {}, entry.v || {});
          }
        },
        isDone: () => pairs.every(p => {
          const st = statusMap[p.tvSym];
          if (st === 'error') return true;
          const v = collected[p.tvSym];
          if (!v) return false;
          if (v.night_loaded === true) return true;
          return v.trade_loaded === true && (v.rtc != null || v.current_session === 'market' || v.current_session === 'out_of_session');
        })
      });

      const out = new Map();
      for (const p of pairs) {
        const v = collected[p.tvSym];
        if (v) {
          setCached(`tvExt:${p.sym}`, v);
          out.set(p.sym, v);
        }
      }
      return out;
    })().finally(() => {
      quoteBatchInFlight.delete(batchKey);
    });
    quoteBatchInFlight.set(batchKey, batchPromise);
  }

  const fetched = await batchPromise.catch(() => new Map());
  for (const [sym, v] of fetched.entries()) {
    resultMap.set(sym, v);
  }
  return resultMap;
}

async function enrichQuotesWithTvExtended(quoteObjs, cacheOpts = {}) {
  if (!Array.isArray(quoteObjs) || !quoteObjs.length) return quoteObjs;
  const tvMap = await fetchTvQuotesForUsStocks(quoteObjs, cacheOpts).catch(() => new Map());
  if (!tvMap.size) return quoteObjs;

  for (const q of quoteObjs) {
    if (!q || !q.symbol) continue;
    const sym = String(q.symbol).trim().toUpperCase();
    const tv = tvMap.get(sym);
    if (!tv) continue;
    const mktState = String(q.marketState || '').toUpperCase();
    if (mktState === 'REGULAR') continue;

    const tvSess = String(tv.current_session || '').toLowerCase();
    if (tvSess) q.tvCurrentSession = tvSess;

    const regP = isFinite(q.regularMarketPrice) && q.regularMarketPrice > 0
      ? q.regularMarketPrice
      : (isFinite(tv.regular_close) && tv.regular_close > 0 ? tv.regular_close : tv.lp);
    const regTs = toEpochSec(q.regularMarketTime);

    const computeExtDelta = (extP, rawChg, rawPct) => {
      const chg = (isFinite(regP) && regP > 0)
        ? Number((extP - regP).toFixed(6))
        : (rawChg != null && isFinite(rawChg) ? rawChg : 0);
      const pct = (isFinite(regP) && regP > 0)
        ? (chg / regP) * 100
        : (rawPct != null && isFinite(rawPct) ? rawPct : 0);
      return { chg, pct };
    };

    if (tv.ntc != null && isFinite(tv.ntc) && tv.ntc > 0) {
      const ntcTs = toEpochSec(tv.ntc_time);
      if (tvSess === 'night' || (ntcTs > 0 && ntcTs >= regTs)) {
        const { chg: nChg, pct: nPct } = computeExtDelta(tv.ntc, tv.nch, tv.nchp);
        q.overnightPrice = tv.ntc;
        q.overnightChange = nChg;
        q.overnightChangePercent = nPct;
        q.overnightTime = ntcTs || Math.floor(Date.now() / 1000);
        q.overnightSource = 'BOATS';
      }
    }

    if (tv.rtc != null && isFinite(tv.rtc) && tv.rtc > 0) {
      const rtcTs = toEpochSec(tv.rtc_time);
      const { chg: rChg, pct: rPct } = computeExtDelta(tv.rtc, tv.rch, tv.rchp);

      if (tvSess === 'pre_market') {
        const prevPreTs = toEpochSec(q.preMarketTime);
        if (!(q.preMarketPrice > 0) || rtcTs > prevPreTs) {
          q.preMarketPrice = tv.rtc;
          q.preMarketChange = rChg;
          q.preMarketChangePercent = rPct;
          q.preMarketTime = rtcTs || Math.floor(Date.now() / 1000);
        }
      } else if (tvSess === 'post_market') {
        const prevPostTs = toEpochSec(q.postMarketTime);
        if (!(q.postMarketPrice > 0) || rtcTs > prevPostTs) {
          q.postMarketPrice = tv.rtc;
          q.postMarketChange = rChg;
          q.postMarketChangePercent = rPct;
          q.postMarketTime = rtcTs || Math.floor(Date.now() / 1000);
        }
      }
    }
  }
  return quoteObjs;
}

const TV_STEP_SEC = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '60m': 3600,
  '1h': 3600
};

function parseTvBarTuple(v) {
  if (!Array.isArray(v) || v.length < 5) return null;
  const t = Math.floor(Number(v[0]));
  const o = Number(v[1]);
  const h = Number(v[2]);
  const l = Number(v[3]);
  const c = Number(v[4]);
  const vol = Math.max(0, Number(v[5]) || 0);
  if (!isFinite(t) || !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c) || o <= 0 || c <= 0) return null;
  return {
    time: t,
    open: o,
    high: Math.max(h, o, c),
    low: Math.min(l, o, c),
    close: c,
    volume: vol
  };
}

async function fetchTvChartSupplement(sym, yfInterval, { getCached = defaultCacheGet, setCached = defaultCacheSet } = {}) {
  const cleanSym = String(sym || '').trim().toUpperCase();
  const tvInt = TV_INTERVAL_MAP[String(yfInterval || '').toLowerCase()];
  if (!tvInt || !isUsEquityTicker(cleanSym)) return { extendedBars: [], boatsBars: [] };

  const cKey = `chartSupp:${cleanSym}:${tvInt}`;
  const cached = getCached(cKey, 4000);
  if (cached) return cached;

  let inflight = seriesInFlight.get(cKey);
  if (!inflight) {
    inflight = (async () => {
      const prefix = await resolveTvExchangePrefixForSym(cleanSym);
      const tvTicker = cleanSym.replace(/-/g, '.');
      const extTicker = `${prefix}:${tvTicker}`;
      const boatsTicker = `BOATS_LS:${tvTicker}`;
      const extMap = new Map();
      const boatsMap = new Map();
      const csExt = 'cs_e_' + Math.random().toString(36).slice(2, 9);
      const csBoats = 'cs_b_' + Math.random().toString(36).slice(2, 9);
      let extDone = false;
      let boatsDone = false;

      await runTvWsPackets({
        timeoutMs: 1750,
        settleMs: 60,
        setup: (send) => {
          send(packTvMsg('set_auth_token', ['unauthorized_user_token']));
          send(packTvMsg('chart_create_session', [csExt, '']));
          send(packTvMsg('resolve_symbol', [csExt, 'sds_sym_ext', '=' + JSON.stringify({
            adjustment: 'splits',
            session: 'extended',
            symbol: extTicker
          })]));
          send(packTvMsg('create_series', [csExt, 'sds_ext', 's1', 'sds_sym_ext', tvInt, 180, '']));

          send(packTvMsg('chart_create_session', [csBoats, '']));
          send(packTvMsg('resolve_symbol', [csBoats, 'sds_sym_b', '=' + JSON.stringify({
            adjustment: 'splits',
            session: 'regular',
            symbol: boatsTicker
          })]));
          send(packTvMsg('create_series', [csBoats, 'sds_b', 's1', 'sds_sym_b', tvInt, 96, '']));
        },
        onJson: (msg) => {
          const cs = msg.p?.[0];
          if (msg.m === 'timescale_update' || msg.m === 'du') {
            const extList = cs === csExt ? msg.p?.[1]?.sds_ext?.s : null;
            if (Array.isArray(extList)) {
              for (const item of extList) {
                const bar = parseTvBarTuple(item?.v);
                if (bar) extMap.set(bar.time, bar);
              }
            }
            const boatsList = cs === csBoats ? msg.p?.[1]?.sds_b?.s : null;
            if (Array.isArray(boatsList)) {
              for (const item of boatsList) {
                const bar = parseTvBarTuple(item?.v);
                if (bar && isOvernightWindowET(bar.time)) boatsMap.set(bar.time, bar);
              }
            }
          } else if (msg.m === 'series_completed' || msg.m === 'symbol_error') {
            if (cs === csExt) extDone = true;
            else if (cs === csBoats) boatsDone = true;
          }
        },
        isDone: () => extDone && boatsDone
      });

      const result = {
        extendedBars: Array.from(extMap.values()).sort((a, b) => a.time - b.time),
        boatsBars: Array.from(boatsMap.values()).sort((a, b) => a.time - b.time)
      };
      setCached(cKey, result);
      return result;
    })().finally(() => {
      seriesInFlight.delete(cKey);
    });
    seriesInFlight.set(cKey, inflight);
  }

  return inflight.catch(() => ({ extendedBars: [], boatsBars: [] }));
}

function mergeTvChartSupplement(payload, supp, yfInterval = '30m') {
  const res = payload?.chart?.result?.[0];
  const extBars = Array.isArray(supp?.extendedBars) ? supp.extendedBars : [];
  const boatsBars = Array.isArray(supp?.boatsBars) ? supp.boatsBars : [];
  if (!res || (!extBars.length && !boatsBars.length)) return payload;

  const tsArr = Array.isArray(res.timestamp) ? res.timestamp : [];
  const q0 = res.indicators?.quote?.[0] || {};
  const openArr = Array.isArray(q0.open) ? q0.open : [];
  const highArr = Array.isArray(q0.high) ? q0.high : [];
  const lowArr = Array.isArray(q0.low) ? q0.low : [];
  const closeArr = Array.isArray(q0.close) ? q0.close : [];
  const volArr = Array.isArray(q0.volume) ? q0.volume : [];

  const normInt = String(yfInterval || '').toLowerCase();
  const alignStep = (normInt === '60m' || normInt === '1h') ? 60 : (TV_STEP_SEC[normInt] || 0);
  const barMap = new Map();
  let minYahooTs = Infinity;

  for (let i = 0; i < tsArr.length; i++) {
    const rawT = Math.floor(Number(tsArr[i]));
    const c = closeArr[i];
    if (!isFinite(rawT) || c == null || !isFinite(c)) continue;
    const t = alignStep > 0 ? Math.floor(rawT / alignStep) * alignStep : rawT;
    if (t < minYahooTs) minYahooTs = t;
    const o = openArr[i] ?? c;
    const h = highArr[i] ?? c;
    const l = lowArr[i] ?? c;
    const v = Math.max(0, volArr[i] ?? 0);
    const prev = barMap.get(t);
    if (prev) {
      prev.high = Math.max(prev.high, h, o, c);
      prev.low = Math.min(prev.low, l, o, c);
      prev.close = c;
      prev.volume = Math.max(prev.volume, v);
    } else {
      barMap.set(t, { time: t, open: o, high: Math.max(h, o, c), low: Math.min(l, o, c), close: c, volume: v });
    }
  }

  const floorTs = isFinite(minYahooTs) ? minYahooTs - 12 * 3600 : 0;
  let changed = false;

  // On 60m/1h, remove any unaligned Yahoo intra-hour snapshot bar already covered by a TradingView candle
  if ((normInt === '60m' || normInt === '1h') && extBars.length) {
    const extStart = extBars[0].time;
    for (const yTs of Array.from(barMap.keys())) {
      if (yTs < extStart || yTs % 1800 === 0) continue;
      if (extBars.some(b => b.time <= yTs && yTs - b.time < 3600 && b.time !== yTs)) {
        barMap.delete(yTs);
        changed = true;
      }
    }
  }

  for (const b of boatsBars) {
    if (b.time < floorTs) continue;
    const cur = barMap.get(b.time);
    if (!cur || cur.volume <= 0) {
      barMap.set(b.time, b);
      changed = true;
    }
  }

  const lastExt = extBars.length ? extBars[extBars.length - 1] : null;
  for (const b of extBars) {
    if (b.time < floorTs) continue;
    const cur = barMap.get(b.time);
    const isExtWindow = !isRegularWindowET(b.time) && !isOvernightWindowET(b.time);
    const shouldReplace = !cur || isExtWindow || (cur.volume <= 0 && b.volume > 0) || (lastExt && b.time === lastExt.time && b.volume >= cur.volume);
    if (shouldReplace) {
      barMap.set(b.time, b);
      changed = true;
    }
  }

  if (changed) {
    const merged = Array.from(barMap.values()).sort((a, b) => a.time - b.time);
    res.timestamp = merged.map(b => b.time);
    res.indicators = {
      quote: [{
        open: merged.map(b => b.open),
        high: merged.map(b => b.high),
        low: merged.map(b => b.low),
        close: merged.map(b => b.close),
        volume: merged.map(b => b.volume)
      }]
    };
  }

  const lastBoats = boatsBars[boatsBars.length - 1];
  if (lastBoats && res.meta) {
    res.meta.overnightPrice = lastBoats.close;
    res.meta.overnightTime = lastBoats.time;
  }
  return payload;
}

async function fetchBoatsOvernightSeries(sym, yfInterval, opts) {
  const supp = await fetchTvChartSupplement(sym, yfInterval, opts);
  return supp.boatsBars;
}

function mergeBoatsBarsIntoChartPayload(payload, boatsBars) {
  return mergeTvChartSupplement(payload, { boatsBars, extendedBars: [] });
}

module.exports = {
  TV_INTERVAL_MAP,
  toEpochSec,
  isUsEquityTicker,
  enrichQuotesWithTvExtended,
  fetchTvChartSupplement,
  mergeTvChartSupplement,
  fetchBoatsOvernightSeries,
  mergeBoatsBarsIntoChartPayload
};
