const https = require('https');
const { getStore } = require('@netlify/blobs');

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

// ─── HELPERS ──────────────────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        ...headers
      },
      timeout: 10000
    }, (res) => {
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
  const isBuy = avgPct > 0;

  return { sym, avgPct, price, rsi, macd, isBuy };
}

// ─── TELEGRAM ─────────────────────────────────────────────────
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
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

  for (const sym of allSymbols) {
    try {
      console.log(`[SCANNER] Analyzing ${sym}...`);
      const raw = await fetchCandles(sym);
      if (!raw) { errors.push(sym); continue; }
      const sig = analyzeSymbol(sym, raw);
      if (sig) {
        signals.push(sig);
        console.log(`[SCANNER] Signal found: ${sym} ${sig.avgPct.toFixed(1)}%`);
      }
    } catch(e) {
      console.warn(`[SCANNER] Error on ${sym}:`, e.message);
      errors.push(sym);
    }
  }

  if (signals.length === 0) {
    console.log('[SCANNER] No strong signals found.');
    // Send a brief status update anyway
    await sendTelegram(
      `🤖 <b>TradePro AI — Scanare ${new Date().toLocaleTimeString('ro-RO', {timeZone:'Europe/Bucharest'})}</b>\n` +
      `📭 Niciun semnal puternic detectat (prag: ±${SIGNAL_THRESHOLD}%)\n` +
      `🔍 Scanate: ${SYMBOLS_TO_SCAN.length} simboluri`
    );
    return { statusCode: 200, body: 'No signals' };
  }

  // Check Netlify Blob Store for deduplication
  let lastSignals = { ...GLOBAL_LAST_SIGNALS };
  let store = null;
  try {
    store = getStore('tradepro-telegram-state');
    const data = await store.get('lastSignals', { type: 'json' });
    if (data) {
      lastSignals = { ...lastSignals, ...data };
      console.log('[SCANNER] Successfully loaded previous signal state from Blob');
    }
  } catch (e) {
    console.warn('[SCANNER] Could not initialize/load Blob store (using in-memory fallback):', e.message);
  }

  // Sort: strongest signals first
  signals.sort((a, b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));
  
  // Deduplicate and check for deviation
  const newSignalsToSend = [];
  const now = Date.now();
  
  for (const sig of signals) {
    const prev = lastSignals[sig.sym];
    if (prev) {
      const hoursSinceLast = (now - prev.time) / (1000 * 60 * 60);
      if (hoursSinceLast < 24) {
        // We already sent this symbol within the last 24 hours. Check deviation.
        const deviation = Math.abs(prev.avgPct - sig.avgPct);
        if (deviation < 2.0) {
          // Deviation is too small to resend, skip it to avoid spam.
          console.log(`[SCANNER] Skipping ${sig.sym}: Already sent ${hoursSinceLast.toFixed(1)}h ago and deviation is only ${deviation.toFixed(2)}%`);
          continue;
        } else {
          console.log(`[SCANNER] Deviation detected for ${sig.sym}: was ${prev.avgPct.toFixed(2)}%, now ${sig.avgPct.toFixed(2)}%. Re-alerting.`);
        }
      }
    }
    
    // Add to send list and update state
    newSignalsToSend.push(sig);
    lastSignals[sig.sym] = { time: now, avgPct: sig.avgPct };
  }
  
  // Update the global fallback state
  GLOBAL_LAST_SIGNALS = lastSignals;
  
  if (newSignalsToSend.length === 0) {
    console.log('[SCANNER] No NEW or DEVIATED signals to send. Ending quietly to prevent spam.');
    return { statusCode: 200, body: 'Signals found but all were duplicates.' };
  }

  // Header message
  const buys  = newSignalsToSend.filter(s => s.isBuy).length;
  const sells = newSignalsToSend.filter(s => !s.isBuy).length;
  await sendTelegram(
    `🚀 <b>TradePro AI — Semnale Noi!</b>\n` +
    `🕐 ${new Date().toLocaleTimeString('ro-RO', {timeZone:'Europe/Bucharest'})}\n\n` +
    `🟢 Cumpărare: ${buys}   🔴 Vânzare: ${sells}\n` +
    `📊 Total scanate: ${SYMBOLS_TO_SCAN.length} simboluri\n` +
    `─────────────────────`
  );

  // Send each signal as separate message (max 5 strongest)
  for (const sig of newSignalsToSend.slice(0, 5)) {
    try {
      await sendTelegram(formatSignalMessage(sig));
      await new Promise(r => setTimeout(r, 500)); // avoid Telegram rate limit
    } catch(e) {
      console.warn('[SCANNER] Telegram send failed:', e.message);
    }
  }
  
  // Save state back to Blob
  if (store) {
    try {
      await store.setJSON('lastSignals', lastSignals);
      console.log('[SCANNER] Successfully saved state to Blob store');
    } catch(e) {
      console.warn('[SCANNER] Failed to save state to Blob store:', e.message);
    }
  }

  console.log(`[SCANNER] Done. ${signals.length} signals sent.`);
  return {
    statusCode: 200,
    body: JSON.stringify({ signals: signals.length, symbols: allSymbols.length })
  };
};
