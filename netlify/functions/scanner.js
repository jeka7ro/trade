const https = require('https');

// ─── CONFIG ───────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const SYMBOLS_TO_SCAN = [
  'TSLA','NVDA','AAPL','MSFT','META','AMZN','GOOGL',
  'CRWD','PLTR','AMD','INTC','COIN','UBER','SQ','PYPL',
  'NFLX','DIS','SHOP','SNAP','BABA','BIDU','AVGO','JPM',
  'BAC','SPY','QQQ','APPS','ONDS','FLNC',
  'BTC-USD','ETH-USD','SOL-USD',
  'GC=F','CL=F','SI=F'
];

const SIGNAL_THRESHOLD = 10; // min % move predicted to alert (crescut de la 5% la 10% pentru siguranta)
const FRACTAL_LEN = 14;
const FORECAST_LEN = 10;
const MIN_CANDLES = 50;

// IN-MEMORY FALLBACK (Supravietuieste intre rularile cron-ului cat timp Lambda e "warm")
let GLOBAL_LAST_SIGNALS = {};

// httpsGet with redirect following (critical for external DB)
function httpsGet(url, headers = {}, _redirects = 0) {
  return new Promise((resolve, reject) => {
    if (_redirects > 5) return reject(new Error('Too many redirects'));
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? require('https') : require('http');
    const req = lib.get({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...headers
      },
      timeout: 10000
    }, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
        return resolve(httpsGet(res.headers.location, headers, _redirects + 1));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse fail: ${data.slice(0,100)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchCandles(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`;
  const json = await httpsGet(url);
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp) return null;
  const ts = result.timestamp;
  const q = result.indicators.quote[0];
  const raw = ts.map((t, i) => ({
    time: t,
    open:   q.open[i],
    high:   q.high[i],
    low:    q.low[i],
    close:  q.close[i],
    volume: q.volume[i] || 0
  })).filter(d => d.close != null && !isNaN(d.close));
  return raw;
}

async function fetchDynamicSymbols() {
  try {
    const urls = [
      'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=most_actives&count=25',
      'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=day_gainers&count=25',
      'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=day_losers&count=25'
    ];
    let dynamic = [];
    for (const u of urls) {
      try {
        const res = await httpsGet(u);
        const quotes = res?.finance?.result?.[0]?.quotes || [];
        quotes.forEach(q => { if(q.symbol) dynamic.push(q.symbol); });
      } catch(e){}
    }
    return dynamic;
  } catch(e) {
    return [];
  }
}

function calcRSI(data, period = 14) {
  if (data.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const diff = data[i].close - data[i-1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  return 100 - (100 / (1 + avgG / avgL));
}

function calcMACD(data) {
  if (data.length < 26) return 0;
  const prices = data.map(d => d.close);
  const ema = (arr, period) => {
    const k = 2 / (period + 1);
    let e = arr[0];
    for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
    return e;
  };
  return ema(prices.slice(-12), 12) - ema(prices.slice(-26), 26);
}

function analyzeSymbol(sym, raw) {
  if (raw.length < MIN_CANDLES) return null;

  const currentSlice = raw.slice(-FRACTAL_LEN);
  const currentBase  = currentSlice[0].close;
  const currentNorm  = currentSlice.map(d => d.close / currentBase);
  const currentMom   = (currentSlice[FRACTAL_LEN-1].close / currentBase) - 1;

  let matches = [];
  for (let i = 0; i < raw.length - FRACTAL_LEN - FORECAST_LEN - FRACTAL_LEN; i++) {
    const histSlice = raw.slice(i, i + FRACTAL_LEN);
    const histBase  = histSlice[0].close;
    const histNorm  = histSlice.map(d => d.close / histBase);
    const histMom   = (histSlice[FRACTAL_LEN-1].close / histBase) - 1;

    if (Math.sign(currentMom) !== Math.sign(histMom)) continue;
    if (Math.abs(currentMom) > 0.03 && Math.abs(histMom) < Math.abs(currentMom) * 0.3) continue;

    let error = 0;
    for (let j = 0; j < FRACTAL_LEN; j++) error += Math.abs(currentNorm[j] - histNorm[j]);

    const afterSlice = raw.slice(i + FRACTAL_LEN, i + FRACTAL_LEN + FORECAST_LEN);
    if (afterSlice.length < FORECAST_LEN) continue;
    const resultFinal = afterSlice[afterSlice.length-1].close;
    const resultPct   = ((resultFinal / histSlice[FRACTAL_LEN-1].close) - 1) * 100;

    matches.push({ error, resultPct });
  }

  if (matches.length === 0) return null;
  matches.sort((a,b) => a.error - b.error);
  const top = matches.slice(0, 5);
  const avgPct = top.reduce((s, m) => s + m.resultPct, 0) / top.length;

  if (Math.abs(avgPct) < SIGNAL_THRESHOLD) return null;

  const rsi  = calcRSI(raw);
  const macd = calcMACD(raw);
  const price = raw[raw.length-1].close;
  if (price < 2) return null; // Stop chaotic penny stock signals
  const isBuy = avgPct > 0;

  return { sym, avgPct, price, rsi, macd, isBuy };
}

// ─── TELEGRAM ─────────────────────────────────────────────────
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ chat_id: CHAT_ID, text: text, parse_mode: 'HTML', disable_web_page_preview: true });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = require('https').request(options, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => resolve(resData));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function formatSignalMessage(sig) {
  const dir = sig.isBuy ? '🟢 CUMPĂRARE' : '🔴 VÂNZARE';
  const arrow = sig.isBuy ? '📈' : '📉';
  const pctStr = sig.avgPct > 0 ? `+${sig.avgPct.toFixed(2)}%` : `${sig.avgPct.toFixed(2)}%`;
  const rsiLabel = sig.rsi > 70 ? '⚠️ Supracumpărat' : sig.rsi < 30 ? '⚡ Supravândut' : '🔵 Neutru';

  return `${arrow} <b>${sig.sym}</b> — ${dir}\n` +
    `💰 Preț curent: <b>$${sig.price.toFixed(2)}</b>\n` +
    `🎯 Predicție: <b>${pctStr}</b> în 10 zile\n` +
    `📊 RSI(14): ${sig.rsi.toFixed(1)} ${rsiLabel}\n` +
    `📉 MACD: ${sig.macd > 0 ? '▲ Bullish' : '▼ Bearish'} (${sig.macd.toFixed(4)})\n` +
    `🔗 <a href="https://traders7ro.netlify.app/?sym=${sig.sym}">Deschide grafic →</a>`;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────
exports.handler = async function(event, context) {
  console.log('[SCANNER] Starting market scan at', new Date().toISOString());

  const today = new Date();
  // Transform to US Eastern Time approximation to correctly detect weekend
  const etTime = today.getTime() - (4 * 60 * 60 * 1000);
  const etDate = new Date(etTime);
  const day = etDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) {
    console.log('[SCANNER] Weekend detected (ET Time). Market is closed. Skipping scan.');
    return { statusCode: 200, body: 'Weekend skip - Market closed' };
  }

  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error('[SCANNER] Missing TELEGRAM_TOKEN or CHAT_ID');
    return { statusCode: 500, body: 'Missing Telegram config' };
  }

  const signals = [];
  const errors  = [];

  // Fetch dynamic symbols (gainers, losers, active) to match frontend behavior
  console.log('[SCANNER] Fetching dynamic market symbols...');
  const dynamicSyms = await fetchDynamicSymbols();
  const allSymbols = Array.from(new Set([...SYMBOLS_TO_SCAN, ...dynamicSyms]));

  // Process in batches of 15 to prevent Netlify 10s timeout
  const batchSize = 15;
  for (let i = 0; i < allSymbols.length; i += batchSize) {
    const batch = allSymbols.slice(i, i + batchSize);
    console.log(`[SCANNER] Analyzing batch ${Math.floor(i/batchSize) + 1} (${batch.length} symbols)...`);
    
    await Promise.all(batch.map(async (sym) => {
      try {
        const raw = await fetchCandles(sym);
        if (!raw) { errors.push(sym); return; }
        const sig = analyzeSymbol(sym, raw);
        if (sig) {
          signals.push(sig);
          console.log(`[SCANNER] Signal found: ${sym} ${sig.avgPct.toFixed(1)}%`);
        }
      } catch(e) {
        console.warn(`[SCANNER] Error on ${sym}:`, e.message);
        errors.push(sym);
      }
    }));
  }

  if (signals.length === 0) {
    console.log('[SCANNER] No strong signals found. Silent exit.');
    return { statusCode: 200, body: 'No signals' };
  }

  // Check external JSON Store for deduplication (100% reliable across cold starts)
  let lastSignals = { ...GLOBAL_LAST_SIGNALS };
  const STATE_URL = 'https://api.restful-api.dev/objects/ff8081819d82fab6019e8c67a28c3248';
  
  try {
    const data = await httpsGet(STATE_URL);
    if (data && data.data && data.data.lastSignals) {
      lastSignals = { ...lastSignals, ...data.data.lastSignals };
      console.log('[SCANNER] Successfully loaded previous signal state from external DB');
    }
  } catch (e) {
    console.warn('[SCANNER] Could not load external DB (using in-memory fallback):', e.message);
  }

  // Sort: strongest signals first
  signals.sort((a, b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));
  
  // ─── SMART DEDUPLICATION ───────────────────────────────────────
  // Rules:
  //   1. Never resend same symbol within 24h if direction is the same.
  //   2. ALWAYS resend if direction flipped (BUY→SELL or SELL→BUY)
  // ───────────────────────────────────────────────────────────────
  const newSignalsToSend = [];
  const now = Date.now();
  
  for (const sig of signals) {
    const key = sig.sym;
    const prev = lastSignals[key];
    
    if (prev && typeof prev === 'object') {
      const directionChanged = (prev.isBuy !== sig.isBuy);
      
      if (!directionChanged) {
        // ACEEAȘI DIRECȚIE -> BLOCARE COMPLETĂ pentru a nu repeta alerta (nici măcar după 24h)
        console.log(`[SCANNER] SKIP ${sig.sym}: Deja am trimis ${sig.isBuy ? 'CUMPĂRARE' : 'VÂNZARE'}. Nu repetăm.`);
        continue;
      } else {
        // Direcția s-a schimbat (FLIP) -> Trimitem!
        console.log(`[SCANNER] DIRECTION FLIP for ${sig.sym}: was ${prev.isBuy?'BUY':'SELL'}, now ${sig.isBuy?'BUY':'SELL'}. Re-alerting.`);
      }
    }
    
    // This signal is genuinely new or flipped — add to send list
    newSignalsToSend.push(sig);
    lastSignals[key] = { time: now, avgPct: sig.avgPct, isBuy: sig.isBuy, price: sig.price };
  }
  
  // Update the global fallback state
  GLOBAL_LAST_SIGNALS = lastSignals;
  
  if (newSignalsToSend.length === 0) {
    console.log('[SCANNER] No NEW or DEVIATED signals to send. Ending quietly to prevent spam.');
    return { statusCode: 200, body: 'Signals found but all were duplicates.' };
  }

  // Clean up old signals (older than 30 days) to prevent JSON bloat
  for (const k in lastSignals) {
    if (now - (lastSignals[k].time || 0) > 30 * 24 * 60 * 60 * 1000) {
      delete lastSignals[k];
    }
  }

  // Save state back to external DB FIRST (before sending telegram, so if it times out sending, we don't spam later)
  try {
    const body = JSON.stringify({ name: "tradepro-state", data: { lastSignals } });
    await new Promise((resolve, reject) => {
      const req = https.request(STATE_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          if (res.statusCode >= 400) console.warn('[SCANNER] API DB error HTTP', res.statusCode, d);
          resolve(d);
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    console.log('[SCANNER] Successfully saved state to external DB');
  } catch(e) {
    console.warn('[SCANNER] Failed to save state to external DB:', e.message);
  }

  // Acum trimitem telegram
  let combinedMessage = `🚀 <b>TradePro AI — Semnale Noi!</b>\n` +
    `🕐 ${new Date().toLocaleTimeString('ro-RO', {timeZone:'Europe/Bucharest'})}\n` +
    `📊 Scanate: ${allSymbols.length} | 🟢 Cumpărare: ${buys} | 🔴 Vânzare: ${sells}\n` +
    `─────────────────────\n\n`;

  for (const sig of newSignalsToSend.slice(0, 5)) {
    combinedMessage += formatSignalMessage(sig) + `\n\n`;
  }
  
  try {
    await sendTelegram(combinedMessage.trim());
  } catch(e) {
    console.warn('[SCANNER] Telegram send failed:', e.message);
  }

  console.log(`[SCANNER] Done. ${signals.length} signals sent.`);
  return {
    statusCode: 200,
    body: JSON.stringify({ signals: signals.length, symbols: allSymbols.length })
  };
};
