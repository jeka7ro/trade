// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
let currentSymbol = '';

// MOBILE TAB SWITCHER
function switchMobileTab(tab) {
  if (window.innerWidth > 768) return;
  const chartArea = document.getElementById('chartArea');
  const sidebar = document.getElementById('sidebar');
  const rightPanel = document.getElementById('rightPanel');
  const signalsPanel = document.getElementById('signalsPanel');

  // Reset all tabs
  chartArea.style.display = 'none';
  sidebar.style.display = 'none';
  rightPanel.style.display = 'none';
  signalsPanel.style.display = 'none';
  
  document.getElementById('mbarChart').classList.remove('active');
  document.getElementById('mbarWatchlist').classList.remove('active');
  document.getElementById('mbarSignals').classList.remove('active');

  if (tab === 'chart') {
    chartArea.style.display = 'flex';
    sidebar.style.display = 'flex';
    document.getElementById('mbarChart').classList.add('active');
    // Forțează resize grafic după ce devine vizibil
    setTimeout(() => {
      if (mainChart) {
        mainChart.applyOptions({ width: chartArea.clientWidth });
        mainChart.timeScale().fitContent();
      }
      window.dispatchEvent(new Event('resize'));
    }, 50);
  } else if (tab === 'signals') {
    signalsPanel.style.display = 'flex';
    document.getElementById('mbarSignals').classList.add('active');
    if (typeof loadCachedSignals === 'function') loadCachedSignals();
  } else {
    rightPanel.style.display = 'flex';
    document.getElementById('mbarWatchlist').classList.add('active');
  }
}

function getFallbackIconHTML(sym, size, id='') {
  let svg = '';
  const c = 'var(--text)';
  if (sym.includes('=F')) {
    if (sym.includes('CL') || sym.includes('BZ') || sym.includes('HO')) {
      // Oil drop
      svg = `<svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    } else if (sym.includes('GC') || sym.includes('SI') || sym.includes('HG')) {
      // Gold/Silver coins
      svg = `<svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/></svg>`;
    } else {
      // Index chart
      svg = `<svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
    }
  } else if (sym.includes('=X')) {
    // Forex
    svg = `<svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  } else if (sym.includes('-USD')) {
    // Crypto
    svg = `<svg width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 20h-7v-16h7a4 4 0 0 1 0 8 4 4 0 0 1 0 8z"/><line x1="10" y1="20" x2="10" y2="4"/><line x1="14" y1="12" x2="7" y2="12"/></svg>`;
  } else {
    // Generic Stock
    svg = `<span style="font-size:${size>30?16:10}px;font-weight:bold;color:${c}">${sym.charAt(0)}</span>`;
  }
  return `<div ${id ? `id="${id}"` : ''} style="width:${size}px;height:${size}px;border-radius:50%;background:var(--card-bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${svg}</div>`;
}

function cleanCompanyName(name, sym) {
  if (!name) return sym;
  if (sym === 'NQ=F') return 'Nasdaq 100';
  if (sym === 'ES=F') return 'S&P 500';
  if (sym === 'YM=F') return 'Dow Jones';
  if (sym === 'RTY=F') return 'Russell 2000';
  if (sym === 'CL=F') return 'Crude Oil';
  if (sym === 'BZ=F') return 'Brent Oil';
  if (sym === 'GC=F') return 'Gold';
  if (sym === 'SI=F') return 'Silver';
  if (sym === 'EURUSD=X') return 'EUR/USD';
  if (sym.includes('-USD')) return name.replace(' USD', '');
  return name.replace(/,?\s+(Inc\.|Inc|Corporation|Corp\.|Corp|Company|Co\.|Ltd\.|Ltd|plc|LLC)\b/ig, '').trim();
}

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const PROXY_BASE = IS_LOCAL ? 'http://localhost:3457/proxy' : '/.netlify/functions/proxy';

let currentTF = localStorage.getItem('tradeProTF') || '1d';
let allData = [];
// Nu mai incarcam din localStorage ca sa nu aglomeram graficul utilizatorului vechi
let indicators = { ma:false, bb:false, vol:true, rsi:false, macd:false, ema:false, vwap:false, forecast:false, smc:false, vpvr:false };
let activeTool = 'cursor';
let forecastHorizon = 7;
let lastForecast = null;

// Charts
let mainChart, candleSeries, volumeSeries;
let ma20S, ma50S, ma200S, bbU, bbM, bbL, emaS, vwapS;
let wolfe135S, wolfe24S, wolfeEPAS;
let vwapU1, vwapL1, vwapU2, vwapL2, vwapU3, vwapL3;
let pocLine = null;
let sigMarkers = [];
let fcLineS, fcBandU, fcBandL;
let rsiChart, rsiS, rsiOB, rsiOS;
let macdChart, macdHistS, macdLineS, macdSigS;

// Multiple CORS proxies — tried in order until one works
const PROXIES = [
  url => `${PROXY_BASE}?url=${encodeURIComponent(url)}`
];

async function fetchJSON(url, timeoutMs = 8000) {
  for (let pi = 0; pi < PROXIES.length; pi++) {
    const proxyUrl = PROXIES[pi](url);
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) continue; // HTML error page
      return JSON.parse(text);
    } catch(e) {
      clearTimeout(tid);
      console.warn(`Proxy ${pi+1} failed:`, e.message);
    }
  }
  throw new Error('Toate proxy-urile au eșuat. Verificați conexiunea.');
}

// Simbolurile DEFAULT — MEREU prezente, nu pot fi șterse accidental
const watchlistDefault = [
  {sym:'AAPL',     name:'Apple Inc.'},
  {sym:'TSLA',     name:'Tesla Inc.'},
  {sym:'NVDA',     name:'NVIDIA Corp.'},
  {sym:'AMZN',     name:'Amazon'},
  {sym:'MSFT',     name:'Microsoft'},
  {sym:'BTC-USD',  name:'Bitcoin'},
  {sym:'ETH-USD',  name:'Ethereum'},
  {sym:'GC=F',     name:'Aur (Gold)'},
  {sym:'CL=F',     name:'Petrol Brut (Oil)'},
  {sym:'EURUSD=X', name:'EUR/USD'},
  {sym:'SPY',      name:'S&P 500 ETF'},
  {sym:'QQQ',      name:'NASDAQ ETF'},
];

const WL_KEY = 'tradepro_watchlist_v2';
const WL_KEY_OLD = 'tradepro_watchlist_v1';

function loadWatchlist() {
  try {
    // Citeste din v2
    const saved = localStorage.getItem(WL_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Fallback la v1 daca exista (migrare)
    const oldSaved = localStorage.getItem(WL_KEY_OLD);
    if (oldSaved) {
      const oldParsed = JSON.parse(oldSaved);
      if (Array.isArray(oldParsed) && oldParsed.length > 0) {
        // Migrează automat
        localStorage.setItem(WL_KEY, JSON.stringify(oldParsed));
        return oldParsed;
      }
    }
    // Daca nu exista nimic salvat, sterge cheia v3 gresita si returneaza default
    localStorage.removeItem('tradepro_watchlist_v3');
  } catch(e) {}
  return [...watchlistDefault];
}

function saveWatchlist() {
  try { localStorage.setItem(WL_KEY, JSON.stringify(watchlistData)); } catch(e) {}
}

function resetWatchlist() {
  if (!confirm('Resetezi watchlist-ul la simbolurile implicite? Orice modificare va fi pierdută.')) return;
  try { localStorage.removeItem(WL_KEY); } catch(e) {}
  watchlistData = loadWatchlist();
  saveWatchlist();
  renderWatchlist();
}

let watchlistData = loadWatchlist();

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════════════
const savedTheme = localStorage.getItem('tradeProTheme') || 'light';
let isDark = savedTheme === 'dark';

// Aplica tema la start
document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
document.getElementById('themeBtn').textContent = isDark ? '🌙' : '☀️';

document.getElementById('themeBtn').addEventListener('click', () => {
  isDark = !isDark;
  const newTheme = isDark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  document.getElementById('themeBtn').textContent = isDark ? '🌙' : '☀️';
  
  // Salveaza preferinta
  localStorage.setItem('tradeProTheme', newTheme);
  
  if (mainChart) {
    const bg = isDark ? '#020617' : '#ffffff';
    const grid = isDark ? '#1e293b' : '#f1f5f9';
    const tc = isDark ? '#ffffff' : '#0f172a';
    const bc = isDark ? '#334155' : '#e2e8f0';
    [mainChart, rsiChart, macdChart].forEach(c => {
      if (!c) return;
      c.applyOptions({ layout:{background:{color:bg},textColor:tc}, grid:{vertLines:{color:grid},horzLines:{color:grid}}, timeScale:{borderColor:bc}, rightPriceScale:{borderColor:bc} });
    });
  }
});

// ════════════════════════════════════════════════════════════
//  PANEL TABS
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.ptab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.page).classList.add('active');
  });
});

// Forecast horizon buttons
document.querySelectorAll('.fc-h-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fc-h-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    forecastHorizon = parseInt(btn.dataset.h);
    if (allData.length) buildForecast(allData);
  });
});

// ════════════════════════════════════════════════════════════
//  INIT CHARTS
// ════════════════════════════════════════════════════════════
function chartOpts(w, h) {
  const bg = isDark ? '#020617' : '#ffffff';
  const grid = isDark ? '#1e293b' : '#f1f5f9';
  const tc = isDark ? '#ffffff' : '#0f172a';
  const bc = isDark ? '#334155' : '#e2e8f0';

  return {
    width: w, height: h,
    layout: { background:{color:bg}, textColor:tc },
    grid: { vertLines:{color:grid}, horzLines:{color:grid} },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    timeScale: { borderColor:bc, timeVisible:true, secondsVisible:false },
    rightPriceScale: { borderColor:bc },
    handleScroll: { mouseWheel:true, pressedMouseMove:true },
    handleScale: { mouseWheel:true, pinch:true },
  };
}

function initCharts() {
  const ce = document.getElementById('chartCanvas');
  const re = document.getElementById('rsiCanvas');
  const me = document.getElementById('macdCanvas');

  mainChart = LightweightCharts.createChart(ce, chartOpts(ce.offsetWidth, ce.offsetHeight));

  candleSeries = mainChart.addCandlestickSeries({
    upColor:'#089981', downColor:'#f23645',
    borderUpColor:'#089981', borderDownColor:'#f23645',
    wickUpColor:'#089981', wickDownColor:'#f23645',
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineColor: '#2962ff',
    priceLineWidth: 1,
    priceLineStyle: LightweightCharts.LineStyle.Dashed,
  });

  volumeSeries = mainChart.addHistogramSeries({ priceFormat:{type:'volume'}, priceScaleId:'volume' });
  mainChart.priceScale('volume').applyOptions({ scaleMargins:{top:0.82, bottom:0} });

  ma20S  = mainChart.addLineSeries({ color:'#2962ff', lineWidth:1, priceLineVisible:false, lastValueVisible:false });
  ma50S  = mainChart.addLineSeries({ color:'#ff9800', lineWidth:1, priceLineVisible:false, lastValueVisible:false });
  ma200S = mainChart.addLineSeries({ color:'#e91e63', lineWidth:1, priceLineVisible:false, lastValueVisible:false });
  bbU    = mainChart.addLineSeries({ color:'rgba(124,58,237,0.5)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dashed });
  bbM    = mainChart.addLineSeries({ color:'rgba(124,58,237,0.25)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dashed });
  bbL    = mainChart.addLineSeries({ color:'rgba(124,58,237,0.5)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dashed });
  emaS   = mainChart.addLineSeries({ color:'#00bcd4', lineWidth:1, priceLineVisible:false, lastValueVisible:false });
  
  vwapS  = mainChart.addLineSeries({ color:'#ff5722', lineWidth:2, priceLineVisible:false, lastValueVisible:false });
  vwapU1 = mainChart.addLineSeries({ color:'rgba(255,87,34,0.4)', lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dashed, priceLineVisible:false, lastValueVisible:false });
  vwapL1 = mainChart.addLineSeries({ color:'rgba(255,87,34,0.4)', lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dashed, priceLineVisible:false, lastValueVisible:false });
  vwapU2 = mainChart.addLineSeries({ color:'rgba(255,87,34,0.2)', lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dotted, priceLineVisible:false, lastValueVisible:false });
  vwapL2 = mainChart.addLineSeries({ color:'rgba(255,87,34,0.2)', lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dotted, priceLineVisible:false, lastValueVisible:false });
  vwapU3 = mainChart.addLineSeries({ color:'rgba(255,87,34,0.1)', lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dotted, priceLineVisible:false, lastValueVisible:false });
  vwapL3 = mainChart.addLineSeries({ color:'rgba(255,87,34,0.1)', lineWidth:1, lineStyle:LightweightCharts.LineStyle.Dotted, priceLineVisible:false, lastValueVisible:false });

  wolfe135S = mainChart.addLineSeries({ color:'#00bcd4', lineWidth:2, priceLineVisible:false, lastValueVisible:false });
  wolfe24S = mainChart.addLineSeries({ color:'#00bcd4', lineWidth:2, priceLineVisible:false, lastValueVisible:false });
  wolfeEPAS = mainChart.addLineSeries({ color:'#ff5722', lineWidth:2, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dashed });

  // Forecast series
  fcLineS = mainChart.addLineSeries({ color:'rgba(124,58,237,0.9)', lineWidth:2, priceLineVisible:false, lastValueVisible:true, lineStyle:LightweightCharts.LineStyle.Dashed });
  fcBandU = mainChart.addLineSeries({ color:'rgba(124,58,237,0.25)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dotted });
  fcBandL = mainChart.addLineSeries({ color:'rgba(124,58,237,0.25)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dotted });

  // RSI
  rsiChart = LightweightCharts.createChart(re, { ...chartOpts(re.offsetWidth, 115), timeScale:{ ...chartOpts(0,0).timeScale, visible:false } });
  rsiS  = rsiChart.addLineSeries({ color:'#7c3aed', lineWidth:2, priceLineVisible:false, lastValueVisible:true });
  rsiOB = rsiChart.addLineSeries({ color:'rgba(242,54,69,0.4)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dashed });
  rsiOS = rsiChart.addLineSeries({ color:'rgba(8,153,129,0.4)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, lineStyle:LightweightCharts.LineStyle.Dashed });

  // MACD
  macdChart    = LightweightCharts.createChart(me, { ...chartOpts(me.offsetWidth, 105), timeScale:{ ...chartOpts(0,0).timeScale, visible:false } });
  macdHistS    = macdChart.addHistogramSeries({ priceLineVisible:false, lastValueVisible:false });
  macdLineS    = macdChart.addLineSeries({ color:'#2962ff', lineWidth:2, priceLineVisible:false, lastValueVisible:false });
  macdSigS     = macdChart.addLineSeries({ color:'#ff9800', lineWidth:1, priceLineVisible:false, lastValueVisible:false });

  mainChart.subscribeCrosshairMove(updateCrosshairInfo);
  mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (!range) return;
    if (indicators.rsi)  rsiChart.timeScale().setVisibleLogicalRange(range);
    if (indicators.macd) macdChart.timeScale().setVisibleLogicalRange(range);
  });

  // Context menu pe clic dreapta
  document.getElementById('chartCanvas').addEventListener('contextmenu', e => {
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY);
  });

  window.addEventListener('resize', handleResize);
  handleResize();
}

// ════════════════════════════════════════════════════════════
//  CONTEXT MENU (clic dreapta grafic)
// ════════════════════════════════════════════════════════════
let ctxMenuPrice = 0; // pretul curent la pozitia crosshair-ului

function showCtxMenu(x, y) {
  const menu = document.getElementById('chartCtxMenu');
  const price = ctxMenuPrice || (allData.length ? allData[allData.length-1].close : 0);
  const priceStr = fmt(price);
  const sym = currentSymbol || '---';

  document.getElementById('ctxPriceLabel').textContent  = priceStr;
  document.getElementById('ctxAlertLabel').textContent  = priceStr;
  document.getElementById('ctxSymBuy').textContent       = sym;
  document.getElementById('ctxBuyPrice').textContent    = priceStr;
  document.getElementById('ctxSymSell').textContent      = sym;
  document.getElementById('ctxSellPrice').textContent   = priceStr;

  // Pozitionare - nu iesi din ecran
  const mw = 230, mh = 280;
  const left = Math.min(x, window.innerWidth  - mw - 8);
  const top  = Math.min(y, window.innerHeight - mh - 8);
  menu.style.left    = left + 'px';
  menu.style.top     = top  + 'px';
  menu.style.display = 'block';

  // Inchide la clic oriunde
  setTimeout(() => document.addEventListener('click', closeCtxMenuOnce, {once:true}), 0);
}

function closeCtxMenuOnce() {
  document.getElementById('chartCtxMenu').style.display = 'none';
}
function closeCtxMenu() {
  document.getElementById('chartCtxMenu').style.display = 'none';
}

function ctxResetChart() {
  closeCtxMenu();
  if (mainChart) mainChart.timeScale().fitContent();
}
function ctxCopyPrice() {
  closeCtxMenu();
  const p = ctxMenuPrice || (allData.length ? allData[allData.length-1].close : 0);
  navigator.clipboard.writeText(fmt(p)).catch(()=>{});
  showToast(`Pret copiat: ${fmt(p)}`);
}
function ctxAddAlert() {
  closeCtxMenu();
  const p = ctxMenuPrice || (allData.length ? allData[allData.length-1].close : 0);
  // Adauga o linie de alerta pe grafic
  if (candleSeries) {
    candleSeries.createPriceLine({
      price: p,
      color: '#e0a800',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: `Alerta ${fmt(p)}`,
    });
  }
  showToast(`Alerta setata la ${fmt(p)}`);
}
function ctxBuy(type) {
  closeCtxMenu();
  const p = ctxMenuPrice || (allData.length ? allData[allData.length-1].close : 0);
  const sym = currentSymbol || '---';
  if (candleSeries) {
    candleSeries.createPriceLine({
      price: p,
      color: '#089981',
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Solid,
      axisLabelVisible: true,
      title: `BUY ${sym} ${type.toUpperCase()} ${fmt(p)}`,
    });
  }
  showToast(`Ordin BUY ${type}: ${sym} @ ${fmt(p)}`);
}
function ctxSell(type) {
  closeCtxMenu();
  const p = ctxMenuPrice || (allData.length ? allData[allData.length-1].close : 0);
  const sym = currentSymbol || '---';
  if (candleSeries) {
    candleSeries.createPriceLine({
      price: p,
      color: '#f23645',
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Solid,
      axisLabelVisible: true,
      title: `SELL ${sym} ${type.toUpperCase()} ${fmt(p)}`,
    });
  }
  showToast(`Ordin SELL ${type}: ${sym} @ ${fmt(p)}`);
}

// Shortcut Ctrl+R pentru reset chart
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    if (mainChart) mainChart.timeScale().fitContent();
  }
});

function handleResize() {
  const ce = document.getElementById('chartCanvas');
  const re = document.getElementById('rsiCanvas');
  const me = document.getElementById('macdCanvas');
  if (mainChart) mainChart.resize(ce.offsetWidth, ce.offsetHeight);
  if (rsiChart && re.offsetHeight > 0)  rsiChart.resize(re.offsetWidth, re.offsetHeight);
  if (macdChart && me.offsetHeight > 0) macdChart.resize(me.offsetWidth, me.offsetHeight);
}

// ════════════════════════════════════════════════════════════
//  FETCH
// ════════════════════════════════════════════════════════════
function tfToYahoo(tf) {
  const m = {'5m':{i:'5m',r:'5d'},'15m':{i:'15m',r:'10d'},'30m':{i:'30m',r:'30d'},'1h':{i:'60m',r:'60d'},'4h':{i:'60m',r:'120d'},'1d':{i:'1d',r:'1y'},'1wk':{i:'1wk',r:'5y'},'1mo':{i:'1mo',r:'20y'}};
  return m[tf] || m['1d'];
}

// Try Yahoo Finance v8 — FARA includePrePost pentru a evita spike-urile ciudate pe grafic
function yahooUrls(symbol, interval, range) {
  const sym = encodeURIComponent(symbol);
  return [
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}&includeAdjustedClose=true`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}&includeAdjustedClose=true`,
    `https://query1.finance.yahoo.com/v7/finance/chart/${sym}?interval=${interval}&range=${range}`,
  ];
}

async function fetchData(symbol, tf, silent = false) {
  const {i, r} = tfToYahoo(tf);
  const urls = yahooUrls(symbol, i, r);

  let lastErr = null;
  for (const url of urls) {
    try {
      if (!silent) setLoadText(`Conectare la date (${symbol})…`);
      const json = await fetchJSON(url);
      const result = json?.chart?.result?.[0];
      if (!result || !result.timestamp) { lastErr = 'Simbol invalid sau lipsă date'; continue; }
      const ts = result.timestamp;
      const q  = result.indicators.quote[0];
      let raw = ts.map((t, idx) => ({
        time:   t,
        open:   q.open[idx],
        high:   q.high[idx],
        low:    q.low[idx],
        close:  q.close[idx],
        volume: q.volume[idx] || 0,
      })).filter(d => d.open != null && d.high != null && d.low != null && d.close != null
                   && !isNaN(d.open) && !isNaN(d.close));
      if (!raw.length) { lastErr = 'Date goale returnate'; continue; }
      if (tf === '4h') raw = aggregate4h(raw);
      const news = await fetchNews(symbol);
      const meta = result.meta || {};
      meta.news = news;
      
      // Obține prețul LIVE (inclusiv pre-market / post-market)
      try {
        const quoteUrl = PROXIES[0](`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
        const quoteRes = await fetch(quoteUrl);
        const quoteJson = await quoteRes.json();
        const qData = quoteJson?.quoteResponse?.result?.[0];
        if (qData) {
          const livePrice = qData.postMarketPrice || qData.preMarketPrice || qData.regularMarketPrice;
          const lastCandle = raw[raw.length - 1];
          if (livePrice && livePrice !== lastCandle.close) {
             // Dacă e pre/post market, data (timestamp) poate fi diferită. Adăugăm / updatăm o lumânare.
             const isSameDay = new Date(lastCandle.time * 1000).toDateString() === new Date().toDateString();
             if (isSameDay) {
                lastCandle.close = livePrice;
                lastCandle.high = Math.max(lastCandle.high, livePrice);
                lastCandle.low = Math.min(lastCandle.low, livePrice);
             } else {
                raw.push({
                   time: Math.floor(Date.now() / 1000),
                   open: livePrice,
                   high: livePrice,
                   low: livePrice,
                   close: livePrice,
                   volume: 0
                });
             }
          }
        }
      } catch(e) {}

      return { raw: raw.map(d => ({...d, time: Math.floor(d.time)})), meta };
    } catch(e) {
      lastErr = e.message;
      if (!silent) console.warn('fetchData attempt failed:', e.message);
    }
  }

  // All real data sources failed — fall back to demo data
  if (!silent) console.warn('All data sources failed, using demo data. Error:', lastErr);
  if (!silent) setLoadText('Date live indisponibile — afișez date DEMO…');
  if (!silent) await new Promise(r => setTimeout(r, 600));
  return { raw: generateDemoData(symbol, tf), meta: { demo: true, err: lastErr } };
}

// Background auto-refresh for current symbol
let liveTickTimer = null;

async function liveTick() {
  if (!currentSymbol || typeof allData === 'undefined' || !allData || allData.length === 0) return;
  try {
    const quoteUrl = PROXIES[0](`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${currentSymbol}`);
    const quoteRes = await fetch(quoteUrl);
    const quoteJson = await quoteRes.json();
    const qData = quoteJson?.quoteResponse?.result?.[0];
    if (qData) {
      const livePrice = qData.postMarketPrice || qData.preMarketPrice || qData.regularMarketPrice;
      const lastCandle = allData[allData.length - 1];
      
      if (livePrice && livePrice !== lastCandle.close) {
         const isSameDay = new Date(lastCandle.time * 1000).toDateString() === new Date().toDateString();
         if (isSameDay) {
            lastCandle.close = livePrice;
            lastCandle.high = Math.max(lastCandle.high, livePrice);
            lastCandle.low = Math.min(lastCandle.low, livePrice);
         } else {
            allData.push({
               time: Math.floor(Date.now() / 1000),
               open: livePrice,
               high: livePrice,
               low: livePrice,
               close: livePrice,
               volume: 0
            });
         }
         
         const newLastCandle = allData[allData.length - 1];
         candleSeries.update({ time: newLastCandle.time, open: newLastCandle.open, high: newLastCandle.high, low: newLastCandle.low, close: newLastCandle.close });
         
         if (indicators.rsi) {
            const rsiData = calcRSI(allData);
            rsiSeries.update(rsiData[rsiData.length-1]);
         }
         if (indicators.macd) {
            const macdData = calcMACD(allData);
            if (macdData.line.length) macdLine.update(macdData.line[macdData.line.length-1]);
            if (macdData.signal.length) macdSignal.update(macdData.signal[macdData.signal.length-1]);
            if (macdData.hist.length) macdHist.update(macdData.hist[macdData.hist.length-1]);
         }
         
         // Update AI logic silently
         runAnalysis(allData, latestSignalData ? { news: latestSignalData.reasons } : {});
      }
    }
  } catch(e) {}
}

setInterval(liveTick, 1800);

function setLoadText(txt) {
  const el = document.getElementById('loadText');
  if (el) el.textContent = txt;
}

async function fetchNews(symbol) {
  try {
    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=5`;
    const proxyUrl = PROXIES[0](searchUrl);
    const res = await fetch(proxyUrl);
    if (!res.ok) return [];
    const data = await res.json();
    return data.news || [];
  } catch (e) {
    console.warn('News fetch failed:', e);
    return [];
  }
}

// Generates realistic-looking OHLCV demo data
function generateDemoData(symbol, tf) {
  // Seed price based on symbol name to be consistent
  const seed = symbol.split('').reduce((s,c) => s + c.charCodeAt(0), 0);
  const basePrice = 50 + (seed % 450);
  const barSeconds = {'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1wk':604800,'1mo':2592000}[tf] || 86400;
  const nBars = {'5m':200,'15m':200,'30m':200,'1h':200,'4h':200,'1d':365,'1wk':260,'1mo':120}[tf] || 300;
  const vol = basePrice * 0.015; // daily volatility ~1.5%

  const now = Math.floor(Date.now() / 1000);
  const startTime = now - nBars * barSeconds;

  let price = basePrice;
  const trend = seed % 3 === 0 ? 0.0002 : seed % 3 === 1 ? -0.0001 : 0.00005;
  const data = [];

  let rng = seed;
  const rand = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };

  for (let i = 0; i < nBars; i++) {
    const t = startTime + i * barSeconds;
    const change = (rand() - 0.49 + trend) * vol;
    const open  = price;
    const close = Math.max(0.01, price + change);
    const hi    = Math.max(open, close) * (1 + rand() * 0.005);
    const lo    = Math.min(open, close) * (1 - rand() * 0.005);
    const vol2  = Math.round(basePrice * 1000 * (0.5 + rand()));
    data.push({ time:t, open:+open.toFixed(4), high:+hi.toFixed(4), low:+lo.toFixed(4), close:+close.toFixed(4), volume:vol2 });
    price = close;
  }
  return data;
}

function aggregate4h(data) {
  const buckets = {};
  data.forEach(d => {
    const b = Math.floor(d.time / 14400) * 14400;
    if (!buckets[b]) buckets[b] = { time:b, open:d.open, high:d.high, low:d.low, close:d.close, volume:d.volume };
    else { buckets[b].high = Math.max(buckets[b].high, d.high); buckets[b].low = Math.min(buckets[b].low, d.low); buckets[b].close = d.close; buckets[b].volume += d.volume; }
  });
  return Object.values(buckets).sort((a,b) => a.time - b.time);
}

// ════════════════════════════════════════════════════════════
//  INDICATORS
// ════════════════════════════════════════════════════════════
function sma(data, n) {
  return data.map((d,i) => {
    if (i < n-1) return null;
    return { time:d.time, value: data.slice(i-n+1,i+1).reduce((s,x)=>s+x.close,0)/n };
  }).filter(Boolean);
}

function ema(data, n) {
  const k = 2/(n+1); let e = null;
  return data.map((d,i) => {
    if (i < n-1) return null;
    e = i===n-1 ? data.slice(0,n).reduce((s,x)=>s+x.close,0)/n : d.close*k + e*(1-k);
    return { time:d.time, value:e };
  }).filter(Boolean);
}

function calcBB(data, n=20, m=2) {
  return data.map((d,i) => {
    if (i < n-1) return null;
    const sl = data.slice(i-n+1,i+1).map(x=>x.close);
    const mean = sl.reduce((s,v)=>s+v,0)/n;
    const std  = Math.sqrt(sl.reduce((s,v)=>s+(v-mean)**2,0)/n);
    return { time:d.time, upper:mean+m*std, middle:mean, lower:mean-m*std };
  }).filter(Boolean);
}

function calcRSI(data, n=14) {
  let g=0, l=0; const res=[];
  for (let i=1;i<data.length;i++) {
    const d = data[i].close - data[i-1].close;
    if (i < n) { g += Math.max(d,0); l += Math.max(-d,0); continue; }
    if (i===n) { g=(g+Math.max(d,0))/n; l=(l+Math.max(-d,0))/n; }
    else { g=(g*(n-1)+Math.max(d,0))/n; l=(l*(n-1)+Math.max(-d,0))/n; }
    const rs = l===0 ? 100 : g/l;
    res.push({ time:data[i].time, value: 100-100/(1+rs) });
  }
  return res;
}

function calcMACD(data, f=12, sl=26, sg=9) {
  const ef = ema(data,f), es = ema(data,sl);
  const ml = [];
  const mn = Math.min(ef.length, es.length);
  for (let i=0;i<mn;i++) {
    ml.push({ time:es[es.length-mn+i].time, close:ef[ef.length-mn+i].value - es[es.length-mn+i].value });
  }
  const sig = ema(ml, sg);
  const hist = sig.map((s,i) => {
    const v = ml[ml.length-sig.length+i].close - s.value;
    return { time:s.time, value:v, color: v>=0 ? 'rgba(8,153,129,0.7)' : 'rgba(242,54,69,0.7)' };
  });
  return { line:ml.map(d=>({time:d.time,value:d.close})), signal:sig.map(d=>({time:d.time,value:d.value})), hist };
}

function calcVWAPBands(data) {
  let pv=0, v=0;
  let squaredDevSum = 0;
  return data.map(d => { 
    const tp=(d.high+d.low+d.close)/3; 
    pv+=tp*d.volume; 
    v+=d.volume; 
    const vwap = v>0?pv/v:d.close; 
    
    squaredDevSum += d.volume * Math.pow(tp - vwap, 2);
    const variance = v > 0 ? squaredDevSum / v : 0;
    const stdDev = Math.sqrt(variance);

    return {
      time: d.time,
      vwap: vwap,
      u1: vwap + stdDev, l1: vwap - stdDev,
      u2: vwap + (stdDev * 2), l2: vwap - (stdDev * 2),
      u3: vwap + (stdDev * 3), l3: vwap - (stdDev * 3)
    }; 
  });
}

function findPivots(data, depth=5) {
  let pivots = [];
  for (let i = depth; i < data.length - depth; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - depth; j <= i + depth; j++) {
      if (i === j) continue;
      if (data[j].high > data[i].high) isHigh = false;
      if (data[j].low < data[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ idx: i, time: data[i].time, val: data[i].high, type: 'H' });
    if (isLow)  pivots.push({ idx: i, time: data[i].time, val: data[i].low, type: 'L' });
  }
  let clean = [];
  for (let p of pivots) {
    if (clean.length === 0) { clean.push(p); continue; }
    let last = clean[clean.length - 1];
    if (last.type === p.type) {
      if (p.type === 'H' && p.val > last.val) clean[clean.length - 1] = p;
      if (p.type === 'L' && p.val < last.val) clean[clean.length - 1] = p;
    } else {
      clean.push(p);
    }
  }
  return clean;
}

function calcWolfeWaves(data) {
  let res = { line135: [], line24: [], lineEPA: [] };
  const pivots = findPivots(data, 5);
  if (pivots.length < 5) return res;

  for (let i = pivots.length - 5; i >= Math.max(0, pivots.length - 15); i--) {
    const p1 = pivots[i], p2 = pivots[i+1], p3 = pivots[i+2], p4 = pivots[i+3], p5 = pivots[i+4];
    
    // Bullish
    if (p1.type === 'L' && p2.type === 'H' && p3.type === 'L' && p4.type === 'H' && p5.type === 'L') {
      if (p3.val < p1.val && p4.val < p2.val && p4.val > p1.val && p5.val <= p3.val) {
        let slope13 = (p3.val - p1.val) / (p3.idx - p1.idx);
        let proj5 = p1.val + slope13 * (p5.idx - p1.idx);
        if (Math.abs(p5.val - proj5) / proj5 < 0.05) {
          res.line135 = [ {time: p1.time, value: p1.val}, {time: p3.time, value: p3.val}, {time: p5.time, value: p5.val} ];
          res.line24 = [ {time: p2.time, value: p2.val}, {time: p4.time, value: p4.val} ];
          let slope14 = (p4.val - p1.val) / (p4.idx - p1.idx);
          let targetIdx = Math.floor(p5.idx + (p4.idx - p2.idx) * 2.5);
          if (targetIdx >= data.length) targetIdx = data.length - 1;
          let targetVal = p1.val + slope14 * (targetIdx - p1.idx);
          res.lineEPA = [ {time: p1.time, value: p1.val}, {time: p4.time, value: p4.val}, {time: data[targetIdx].time, value: targetVal} ];
          return res;
        }
      }
    }
    // Bearish
    if (p1.type === 'H' && p2.type === 'L' && p3.type === 'H' && p4.type === 'L' && p5.type === 'H') {
      if (p3.val > p1.val && p4.val > p2.val && p4.val < p1.val && p5.val >= p3.val) {
        let slope13 = (p3.val - p1.val) / (p3.idx - p1.idx);
        let proj5 = p1.val + slope13 * (p5.idx - p1.idx);
        if (Math.abs(p5.val - proj5) / proj5 < 0.05) {
          res.line135 = [ {time: p1.time, value: p1.val}, {time: p3.time, value: p3.val}, {time: p5.time, value: p5.val} ];
          res.line24 = [ {time: p2.time, value: p2.val}, {time: p4.time, value: p4.val} ];
          let slope14 = (p4.val - p1.val) / (p4.idx - p1.idx);
          let targetIdx = Math.floor(p5.idx + (p4.idx - p2.idx) * 2.5);
          if (targetIdx >= data.length) targetIdx = data.length - 1;
          let targetVal = p1.val + slope14 * (targetIdx - p1.idx);
          res.lineEPA = [ {time: p1.time, value: p1.val}, {time: p4.time, value: p4.val}, {time: data[targetIdx].time, value: targetVal} ];
          return res;
        }
      }
    }
  }
  return res;
}

function calcFVG(data) {
  let unmitigatedBulls = [];
  let unmitigatedBears = [];
  
  for (let i = 2; i < data.length; i++) {
    const c1 = data[i-2], c2 = data[i-1], c3 = data[i];
    
    // Filtrare FVG-uri acoperite (mitigated)
    unmitigatedBulls = unmitigatedBulls.filter(fvg => c3.low > fvg.top);
    unmitigatedBears = unmitigatedBears.filter(fvg => c3.high < fvg.bottom);
    
    // Bullish FVG
    if (c1.high < c3.low && c2.close > c2.open) {
      const gap = (c3.low - c1.high) / c1.high * 100;
      if (gap > 0.05) unmitigatedBulls.push({ top: c1.high, bottom: c3.low, time: c3.time });
    }
    // Bearish FVG
    if (c1.low > c3.high && c2.close < c2.open) {
      const gap = (c1.low - c3.high) / c3.high * 100;
      if (gap > 0.05) unmitigatedBears.push({ top: c1.low, bottom: c3.high, time: c3.time });
    }
  }
  
  let markers = [];
  // Păstrăm doar ultimele 5 FVG-uri neacoperite (SMC instituțional curat)
  unmitigatedBulls.slice(-5).forEach(fvg => {
    markers.push({ time: fvg.time, position: 'belowBar', color: 'rgba(52,211,153,1)', shape: 'circle' });
  });
  unmitigatedBears.slice(-5).forEach(fvg => {
    markers.push({ time: fvg.time, position: 'aboveBar', color: 'rgba(248,113,113,1)', shape: 'circle' });
  });
  
  markers.sort((a, b) => a.time - b.time);
  return markers;
}

function updateVPVR(data) {
  if (pocLine) { candleSeries.removePriceLine(pocLine); pocLine = null; }
  if (!indicators.vpvr || data.length === 0) return;
  
  let minP = Infinity, maxP = -Infinity;
  data.forEach(d => { minP = Math.min(minP, d.low); maxP = Math.max(maxP, d.high); });
  const bins = 50;
  const binSize = (maxP - minP) / bins;
  if(binSize === 0) return;
  let profile = new Array(bins).fill(0);
  
  data.forEach(d => {
    const tp = (d.high + d.low + d.close) / 3;
    const binIdx = Math.floor((tp - minP) / binSize);
    if(binIdx >= 0 && binIdx < bins) profile[binIdx] += d.volume;
  });
  
  let maxVol = 0, pocIdx = 0;
  for(let i=0; i<bins; i++) {
    if(profile[i] > maxVol) { maxVol = profile[i]; pocIdx = i; }
  }
  const pocPrice = minP + (pocIdx * binSize) + (binSize/2);
  
  pocLine = candleSeries.createPriceLine({
    price: pocPrice,
    color: '#ef4444',
    lineWidth: 2,
    lineStyle: LightweightCharts.LineStyle.Solid,
    axisLabelVisible: true,
    title: 'POC',
  });
}

// ════════════════════════════════════════════════════════════
//  RENDER ALL
// ════════════════════════════════════════════════════════════
function renderAll(data) {
  allData = data;

  candleSeries.setData(data.map(d => ({time:d.time,open:d.open,high:d.high,low:d.low,close:d.close})));

  volumeSeries.setData(indicators.vol
    ? data.map(d => ({time:d.time,value:d.volume,color:d.close>=d.open?'rgba(8,153,129,0.35)':'rgba(242,54,69,0.35)'}))
    : []);

  ma20S.setData(indicators.ma ? sma(data,20) : []);
  ma50S.setData(indicators.ma ? sma(data,50) : []);
  ma200S.setData(indicators.ma ? sma(data,200) : []);

  if (indicators.bb) {
    const bb = calcBB(data);
    bbU.setData(bb.map(d=>({time:d.time,value:d.upper})));
    bbM.setData(bb.map(d=>({time:d.time,value:d.middle})));
    bbL.setData(bb.map(d=>({time:d.time,value:d.lower})));
  } else { bbU.setData([]); bbM.setData([]); bbL.setData([]); }

  emaS.setData(indicators.ema ? ema(data,21) : []);
  
  if (indicators.vwap) {
    const vBands = calcVWAPBands(data);
    vwapS.setData(vBands.map(d=>({time:d.time, value:d.vwap})));
    vwapU1.setData(vBands.map(d=>({time:d.time, value:d.u1})));
    vwapL1.setData(vBands.map(d=>({time:d.time, value:d.l1})));
    vwapU2.setData(vBands.map(d=>({time:d.time, value:d.u2})));
    vwapL2.setData(vBands.map(d=>({time:d.time, value:d.l2})));
    vwapU3.setData(vBands.map(d=>({time:d.time, value:d.u3})));
    vwapL3.setData(vBands.map(d=>({time:d.time, value:d.l3})));
  } else {
    vwapS.setData([]); vwapU1.setData([]); vwapL1.setData([]);
    vwapU2.setData([]); vwapL2.setData([]); vwapU3.setData([]); vwapL3.setData([]);
  }

  updateVPVR(data);

  // Markers merge (Signals + FVG)
  let allChartMarkers = [...sigMarkers];
  if (indicators.smc) {
    allChartMarkers = allChartMarkers.concat(calcFVG(data));
  }
  allChartMarkers.sort((a,b) => a.time - b.time);
  candleSeries.setMarkers(allChartMarkers);

  // RSI
  const showRSI = indicators.rsi;
  document.getElementById('chartRSI').style.display = showRSI ? 'block' : 'none';
  document.getElementById('rsiHandle').style.display = showRSI ? 'block' : 'none';
  if (showRSI) {
    const rsiData = calcRSI(data);
    rsiS.setData(rsiData);
    const t = rsiData.map(d=>d.time);
    rsiOB.setData(t.map(t=>({time:t,value:70})));
    rsiOS.setData(t.map(t=>({time:t,value:30})));
    if (rsiData.length) document.getElementById('rsiVal').textContent = rsiData[rsiData.length-1].value.toFixed(1);
  }

  // MACD
  const showMACD = indicators.macd;
  document.getElementById('chartMACD').style.display = showMACD ? 'block' : 'none';
  document.getElementById('macdHandle').style.display = showMACD ? 'block' : 'none';
  if (showMACD) {
    const md = calcMACD(data);
    macdHistS.setData(md.hist);
    macdLineS.setData(md.line);
    macdSigS.setData(md.signal);
    if (md.hist.length) document.getElementById('macdVal').textContent = md.hist[md.hist.length-1].value.toFixed(4);
  }

  // Forecast on chart
  if (indicators.forecast) buildForecastChart(data);
  else { fcLineS.setData([]); fcBandU.setData([]); fcBandL.setData([]); }

  // Wolfe Waves
  if (indicators.wolfe) {
    let wolfe = calcWolfeWaves(data);
    wolfe135S.setData(wolfe.line135);
    wolfe24S.setData(wolfe.line24);
    wolfeEPAS.setData(wolfe.lineEPA);
  } else {
    wolfe135S.setData([]);
    wolfe24S.setData([]);
    wolfeEPAS.setData([]);
  }

  // Fibonacci auto
  renderFibonacci(data);

  // High / Low markers (TradingView style)
  updateHighLowLines(data);

  handleResize();
  setTimeout(handleResize, 100);
}

// Globale pentru price lines High/Low
let hlHighLine = null;
let hlLowLine  = null;

function updateHighLowLines(data) {
  if (!candleSeries || !data.length) return;
  
  // Sterge liniile anterioare
  if (hlHighLine) { try { candleSeries.removePriceLine(hlHighLine); } catch(e){} }
  if (hlLowLine)  { try { candleSeries.removePriceLine(hlLowLine);  } catch(e){} }

  // Calculeaza High/Low pe tot range-ul vizibil
  const periodHigh = Math.max(...data.map(d => d.high));
  const periodLow  = Math.min(...data.map(d => d.low));

  hlHighLine = candleSeries.createPriceLine({
    price: periodHigh,
    color: '#089981',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `H ${fmt(periodHigh)}`,
  });

  hlLowLine = candleSeries.createPriceLine({
    price: periodLow,
    color: '#f23645',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: true,
    title: `L ${fmt(periodLow)}`,
  });
}

// ════════════════════════════════════════════════════════════
//  FORECAST ENGINE
// ════════════════════════════════════════════════════════════
function linearRegression(values) {
  const n = values.length;
  const xs = Array.from({length:n},(_,i)=>i);
  const mx = (n-1)/2;
  const my = values.reduce((s,v)=>s+v,0)/n;
  const num = xs.reduce((s,x,i)=>s+(x-mx)*(values[i]-my),0);
  const den = xs.reduce((s,x)=>s+(x-mx)**2,0);
  const slope = den !== 0 ? num/den : 0;
  const intercept = my - slope*mx;
  return { slope, intercept, predict: x => intercept + slope*x };
}

function stdDev(values) {
  const m = values.reduce((s,v)=>s+v,0)/values.length;
  return Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/values.length);
}

function buildForecastChart(data) {
  if (data.length < 20) { fcLineS.setData([]); fcBandU.setData([]); fcBandL.setData([]); return; }

  // Determine bar interval in seconds
  const barInterval = data.length > 1 ? (data[data.length-1].time - data[data.length-2].time) : 86400;

  const lookback = Math.min(60, data.length);
  const recentData = data.slice(-lookback);
  const closes = recentData.map(d => d.close);
  const reg = linearRegression(closes);

  // Residuals
  const residuals = closes.map((c,i) => c - reg.predict(i));
  const std = stdDev(residuals);

  // Last point on chart (last candle)
  const lastTime = data[data.length-1].time;
  const lastClose = data[data.length-1].close;

  // Bridge: start line from the last real data point
  const fcLine = [{ time: lastTime, value: lastClose }];
  const fcUpper = [{ time: lastTime, value: lastClose + std }];
  const fcLower = [{ time: lastTime, value: lastClose - std }];

  const nProject = Math.max(forecastHorizon, 15);
  for (let i = 1; i <= nProject; i++) {
    const projected = lastClose + reg.slope * i;
    const t = lastTime + i * barInterval;
    const band = std * (1 + i * 0.04);
    fcLine.push({ time: t, value: projected });
    fcUpper.push({ time: t, value: projected + band });
    fcLower.push({ time: t, value: projected - band });
  }

  fcLineS.setData(fcLine);
  fcBandU.setData(fcUpper);
  fcBandL.setData(fcLower);

  lastForecast = { reg, std, lookback, barInterval, lastClose };
}

function buildForecast(data) {
  if (data.length < 20) return;

  const lookback = Math.min(30, data.length); // Redus de la 80 la 30 pentru a reacționa mai rapid la schimbările recente de trend
  const recentData = data.slice(-lookback);
  const closes = recentData.map(d => d.close);
  const reg = linearRegression(closes);
  const residuals = closes.map((c,i) => c - reg.predict(i));
  const std = stdDev(residuals);

  const lastClose = data[data.length-1].close;
  const n = forecastHorizon;

  // Base: linear regression extrapolation from the last close!
  const basePrice = lastClose + reg.slope * n;

  // Volatility-adjusted
  const vol = std / lastClose; // % volatility
  const momentum = (closes[closes.length-1] - closes[0]) / closes[0]; // total return over lookback

  // Bull: base + 1.5σ + momentum boost (weighted by n)
  const bullPrice = basePrice + 1.5 * std * Math.sqrt(n) + (momentum > 0 ? (lastClose * momentum * (n/lookback)) : 0);
  // Bear: base - 1.5σ + momentum drag
  const bearPrice = basePrice - 1.5 * std * Math.sqrt(n) + (momentum < 0 ? (lastClose * momentum * (n/lookback)) : 0);

  const bullPct = (bullPrice/lastClose-1)*100;
  const basePct = (basePrice/lastClose-1)*100;
  const bearPct = (bearPrice/lastClose-1)*100;

  document.getElementById('fcBull').textContent = fmt(bullPrice);
  document.getElementById('fcBullPct').textContent = (bullPct>=0?'+':'')+bullPct.toFixed(2)+'%';
  document.getElementById('fcBase').textContent = fmt(basePrice);
  document.getElementById('fcBasePct').textContent = (basePct>=0?'+':'')+basePct.toFixed(2)+'%';
  document.getElementById('fcBear').textContent = fmt(bearPrice);
  document.getElementById('fcBearPct').textContent = (bearPct>=0?'+':'')+bearPct.toFixed(2)+'%';

  // Confidence: based on R² of regression
  const ssTot = residuals.reduce((s,v) => s + (v)**2, 0);
  const predResiduals = closes.map((c,i) => c - reg.predict(i));
  const ssRes = predResiduals.reduce((s,v) => s + v**2, 0);
  const r2 = Math.max(0, Math.min(1, 1 - ssRes/ssTot));
  // Reduce confidence for longer horizons
  const horizonPenalty = Math.max(0, 1 - (n-7)*0.015);
  const confidence = Math.round(r2 * 100 * horizonPenalty);

  document.getElementById('fcConfPct').textContent = confidence + '%';
  document.getElementById('fcConfFill').style.width = confidence + '%';

  // Direction & summary
  const bullish = basePct > 0.5;
  const bearish = basePct < -0.5;
  document.getElementById('fcDirection').textContent = bullish ? ' Direcție: BULLISH' : bearish ? ' Direcție: BEARISH' : ' Direcție: LATERAL';
  document.getElementById('fcSummary').textContent =
    `Regresia liniară pe ${lookback} bare proiectează prețul la ${fmt(basePrice)} (${basePct>=0?'+':''}${basePct.toFixed(1)}%) în ${n} zile. Volatilitate: ${(vol*100).toFixed(1)}%/perioadă.`;

  // Ring
  const ringScore = Math.max(0, Math.min(100, Math.round(50 + basePct * 3)));
  drawRing(ringScore);
  document.getElementById('ringPct').textContent = ringScore + '%';

  // Horizon table
  const horizons = [7, 14, 30, 90];
  const tbody = document.getElementById('fcTableBody');
  tbody.innerHTML = horizons.map(h => {
    const p = lastClose + reg.slope * h;
    const pct = (p/lastClose-1)*100;
    const sig = pct > 1 ? 'bull' : pct < -1 ? 'bear' : 'neut';
    return `<tr>
      <td>${h} zile</td>
      <td class="${sig}">${fmt(p)}</td>
      <td class="${sig}">${pct>=0?'+':''}${pct.toFixed(2)}%</td>
      <td class="${sig}">${sig==='bull'?' Optimist':sig==='bear'?' Pesimist':'➡️ Neutru'}</td>
    </tr>`;
  }).join('');

  // Mini chart
  drawMiniChart(data, reg, std, lookback, n);

  // Patterns
  detectPatterns(data);

  // Sentiment pills
  buildSentimentPills(data);

  buildForecastChart(data);
}

// ════════════════════════════════════════════════════════════
//  MINI FORECAST CHART
// ════════════════════════════════════════════════════════════
function drawMiniChart(data, reg, std, lookback, horizon) {
  const canvas = document.getElementById('fcMiniChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const theme = document.documentElement.getAttribute('data-theme');
  const bg = theme==='dark' ? '#2a2e39' : '#f0f3fa';
  const lineC = theme==='dark' ? '#d1d4dc' : '#131722';

  ctx.fillStyle = bg;
  ctx.roundRect ? ctx.roundRect(0,0,W,H,8) : ctx.rect(0,0,W,H);
  ctx.fill();

  const showN = Math.min(40, data.length);
  const hist = data.slice(-showN);
  const projected = [];
  for (let i=1; i<=horizon; i++) {
    projected.push({ value: reg.predict(lookback + i - 1), upper: reg.predict(lookback+i-1)+std*(1+i*0.04), lower: reg.predict(lookback+i-1)-std*(1+i*0.04) });
  }
  const allValues = [...hist.map(d=>d.close), ...projected.map(d=>d.upper), ...projected.map(d=>d.lower)];
  const minV = Math.min(...allValues) * 0.998;
  const maxV = Math.max(...allValues) * 1.002;
  const range = maxV - minV;

  const toX = (i, total) => 8 + (i / (total-1)) * (W - 16);
  const toY = v => H - 8 - ((v - minV) / range) * (H - 16);

  const totalN = showN + horizon;

  // Confidence band fill
  ctx.beginPath();
  projected.forEach((p, i) => { const x = toX(showN+i, totalN); i===0 ? ctx.moveTo(x, toY(p.upper)) : ctx.lineTo(x, toY(p.upper)); });
  [...projected].reverse().forEach((p, i) => ctx.lineTo(toX(showN+projected.length-1-i, totalN), toY(p.lower)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(124,58,237,0.1)';
  ctx.fill();

  // Divider
  const divX = toX(showN-1, totalN);
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(divX, 4); ctx.lineTo(divX, H-4);
  ctx.strokeStyle = 'rgba(120,123,134,0.5)'; ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]);

  // Historical line
  ctx.beginPath();
  hist.forEach((d,i) => { const x=toX(i,totalN), y=toY(d.close); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.strokeStyle = lineC; ctx.lineWidth=1.5; ctx.stroke();

  // Projection line
  ctx.beginPath();
  ctx.moveTo(toX(showN-1, totalN), toY(hist[hist.length-1].close));
  projected.forEach((p,i) => ctx.lineTo(toX(showN+i, totalN), toY(p.value)));
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth=2; ctx.setLineDash([5,3]); ctx.stroke(); ctx.setLineDash([]);

  // Labels
  ctx.font = '9px sans-serif'; ctx.fillStyle = 'rgba(120,123,134,0.9)';
  ctx.fillText('Históric', 10, H-2);
  ctx.fillText('Forecast →', divX+4, H-2);
}

// ════════════════════════════════════════════════════════════
//  PATTERN RECOGNITION
// ════════════════════════════════════════════════════════════
function detectPatterns(data) {
  const patterns = [];
  const n = data.length;
  if (n < 30) return;

  const closes = data.slice(-30).map(d=>d.close);
  const highs  = data.slice(-30).map(d=>d.high);
  const lows   = data.slice(-30).map(d=>d.low);
  const last   = closes[closes.length-1];

  // Higher Highs + Higher Lows → Uptrend
  const hh = highs[highs.length-1] > highs[Math.floor(highs.length*0.5)];
  const hl = lows[lows.length-1] > lows[Math.floor(lows.length*0.5)];
  if (hh && hl) patterns.push({icon:'', name:'Trend Ascendent', desc:'Maxime și minime mai ridicate în ultimele 30 de bare. Structura bullish confirmată.', signal:'bull'});

  // Lower Highs + Lower Lows → Downtrend
  const lh = highs[highs.length-1] < highs[Math.floor(highs.length*0.5)];
  const ll2 = lows[lows.length-1] < lows[Math.floor(lows.length*0.5)];
  if (lh && ll2) patterns.push({icon:'', name:'Trend Descendent', desc:'Maxime și minime mai joase în ultimele 30 de bare. Structura bearish confirmată.', signal:'bear'});

  // Double Top detection (simplified)
  const maxIdx1 = highs.indexOf(Math.max(...highs.slice(0, 15)));
  const maxIdx2 = highs.slice(15).indexOf(Math.max(...highs.slice(15))) + 15;
  const maxH1 = highs[maxIdx1], maxH2 = highs[maxIdx2];
  if (Math.abs(maxH1 - maxH2) / maxH1 < 0.02 && Math.abs(maxIdx1 - maxIdx2) > 5 && last < maxH1 * 0.98)
    patterns.push({icon:'', name:'Double Top', desc:`Două maxime apropiate la ~${fmt(maxH1)}. Semnal de inversare bearish la nivelul ${fmt(last)}.`, signal:'bear'});

  // Double Bottom
  const minIdx1 = lows.indexOf(Math.min(...lows.slice(0,15)));
  const minIdx2 = lows.slice(15).indexOf(Math.min(...lows.slice(15))) + 15;
  const minL1 = lows[minIdx1], minL2 = lows[minIdx2];
  if (Math.abs(minL1 - minL2) / minL1 < 0.02 && Math.abs(minIdx1 - minIdx2) > 5 && last > minL1 * 1.02)
    patterns.push({icon:'', name:'Double Bottom', desc:`Două minime la ~${fmt(minL1)}. Semnal de inversare bullish. Target: ${fmt(last * 1.05)}.`, signal:'bull'});

  // Consolidation (narrow range)
  const rangeRatio = (Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10))) / last;
  if (rangeRatio < 0.04) patterns.push({icon:'', name:'Consolidare / Flag', desc:`Prețul oscilează în interval îngust (±${(rangeRatio*50).toFixed(1)}%). Urmează un breakout.`, signal:'neut'});

  // RSI divergence (simplified)
  const rsiData = calcRSI(data);
  if (rsiData.length > 10) {
    const lastRSI = rsiData[rsiData.length-1].value;
    const prevRSI = rsiData[rsiData.length-10].value;
    const priceUp = last > data[data.length-10].close;
    const rsiDown = lastRSI < prevRSI;
    if (priceUp && rsiDown && lastRSI > 55) patterns.push({icon:'', name:'Divergență Bearish RSI', desc:`Prețul a urcat dar RSI a scăzut (${prevRSI.toFixed(0)} → ${lastRSI.toFixed(0)}). Posibilă slăbire a trendului.`, signal:'bear'});
    const priceDown = last < data[data.length-10].close;
    const rsiUp = lastRSI > prevRSI;
    if (priceDown && rsiUp && lastRSI < 45) patterns.push({icon:'', name:'Divergență Bullish RSI', desc:`Prețul a scăzut dar RSI a crescut (${prevRSI.toFixed(0)} → ${lastRSI.toFixed(0)}). Posibil rebound.`, signal:'bull'});
  }

  // Breakout above MA200
  const ma200data = sma(data, 200);
  if (ma200data.length) {
    const ma200last = ma200data[ma200data.length-1].value;
    if (last > ma200last * 1.01 && data[data.length-5].close < ma200last)
      patterns.push({icon:'', name:'Breakout MA200', desc:`Prețul a depășit MA200 (${fmt(ma200last)}) — semnal major bullish pe termen lung.`, signal:'bull'});
  }

  if (patterns.length === 0)
    patterns.push({icon:'', name:'Fără pattern clar', desc:'Nu s-au detectat pattern-uri semnificative pe datele curente. Monitorizați consolidarea.', signal:'neut'});

  document.getElementById('patternCards').innerHTML = patterns.map(p => `
    <div class="pattern-card" style="border-left-color:${p.signal==='bull'?'var(--green)':p.signal==='bear'?'var(--red)':'var(--accent)'}">
      <div class="pattern-icon">${p.icon}</div>
      <div class="pattern-info">
        <div class="pattern-name">${p.name}</div>
        <div class="pattern-desc">${p.desc}</div>
      </div>
      <div class="pattern-signal ${p.signal}">${p.signal==='bull'?'BULL':p.signal==='bear'?'BEAR':'NEUT'}</div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════
//  SENTIMENT PILLS
// ════════════════════════════════════════════════════════════
function buildSentimentPills(data) {
  const rsiData = calcRSI(data);
  const macdData = calcMACD(data);
  const ma20data = sma(data, 20);
  const ma50data = sma(data, 50);
  const last = data[data.length-1];
  const rsi = rsiData.length ? rsiData[rsiData.length-1].value : 50;
  const macdH = macdData.hist.length ? macdData.hist[macdData.hist.length-1].value : 0;
  const m20 = ma20data.length ? ma20data[ma20data.length-1].value : last.close;
  const m50 = ma50data.length ? ma50data[ma50data.length-1].value : last.close;

  const pills = [
    { label: rsi > 70 ? 'RSI Overbought' : rsi < 30 ? 'RSI Oversold' : 'RSI Neutru', cls: rsi > 70 ? 'neg' : rsi < 30 ? 'pos' : 'neu' },
    { label: macdH > 0 ? 'MACD Bullish' : 'MACD Bearish', cls: macdH > 0 ? 'pos' : 'neg' },
    { label: last.close > m20 ? 'Deasupra MA20' : 'Sub MA20', cls: last.close > m20 ? 'pos' : 'neg' },
    { label: last.close > m50 ? 'Deasupra MA50' : 'Sub MA50', cls: last.close > m50 ? 'pos' : 'neg' },
    { label: last.volume > data.slice(-20).reduce((s,d)=>s+d.volume,0)/20*1.3 ? 'Volum Mare' : 'Volum Normal', cls: last.volume > data.slice(-20).reduce((s,d)=>s+d.volume,0)/20*1.3 ? 'pos' : 'neu' },
    { label: last.close > last.open ? 'Candle Verde' : 'Candle Roșu', cls: last.close > last.open ? 'pos' : 'neg' },
    { label: (last.high-last.low)/last.close > 0.03 ? 'Volatil' : 'Stabil', cls: (last.high-last.low)/last.close > 0.03 ? 'neg' : 'neu' },
  ];

  document.getElementById('sentPills').innerHTML = pills.map(p => `<span class="sent-pill ${p.cls}">${p.label}</span>`).join('');
}

// ════════════════════════════════════════════════════════════
//  ANALYSIS
// ════════════════════════════════════════════════════════════
function runAnalysis(data, meta) {
  if (!data || data.length < 2) return;
  const last = data[data.length-1];
  const prev = data[data.length-2];
  const chg = (last.close - prev.close) / prev.close * 100;
  document.getElementById('curSymbol').textContent = currentSymbol;
  
  // (Logo update logic has been moved to applyQuoteToDOM to prevent duplicate fallback circle generation)
  
  // Afiseaza numele companiei daca e disponibil in meta
  const companyNameEl = document.getElementById('curCompanyName');
  if (companyNameEl) {
    const name = (meta && (meta.shortName || meta.longName || meta.symbol)) || currentSymbol;
    companyNameEl.textContent = name;
    companyNameEl.title = name;
  }
  
  animatePrice(last.close);
  document.getElementById('curPrice').textContent = fmt(last.close);
  const ce = document.getElementById('curChange');
  const chgVal = last.close - prev.close;
  ce.textContent = `${chg>=0?'+':''}${chgVal.toFixed(last.close < 1 ? 6 : 2)} (${chg>=0?'+':''}${chg.toFixed(2)}%)`;
  ce.className = chg>=0 ? 'up' : 'dn';
  
  // Actualizeaza titlul tabului de browser
  document.title = `${currentSymbol} ${fmt(last.close)} (${chg>=0?'+':''}${chg.toFixed(2)}%) — TradePro AI`;

  document.getElementById('statO').textContent = fmt(last.open);
  document.getElementById('statH').textContent = fmt(last.high);
  document.getElementById('statL').textContent = fmt(last.low);
  document.getElementById('statC').textContent = fmt(last.close);
  document.getElementById('statV').textContent = fmtVol(last.volume);
  const s24 = document.getElementById('stat24h');
  s24.textContent = `${chg>=0?'+':''}${chg.toFixed(2)}%`;
  s24.className = `stat-val ${chg>=0?'green':'red'}`;

  // Key levels
  const highs = data.slice(-60).map(d=>d.high).sort((a,b)=>b-a);
  const lows  = data.slice(-60).map(d=>d.low).sort((a,b)=>a-b);
  document.getElementById('keyLevels').innerHTML = [
    { type:'res', label:'Rezistență 1', price: highs[0] },
    { type:'res', label:'Rezistență 2', price: highs[Math.floor(highs.length*.08)] },
    { type:'sup', label:'Suport 1',     price: lows[0] },
    { type:'sup', label:'Suport 2',     price: lows[Math.floor(lows.length*.08)] },
  ].map(l => `
    <div class="level-item">
      <span class="level-badge ${l.type}">${l.label}</span>
      <span class="level-price">${fmt(l.price)}</span>
      <span class="level-dist">${((l.price/last.close-1)*100).toFixed(2)}%</span>
    </div>`).join('');

  // Signals
  const ma20d  = sma(data,20);
  const ma50d  = sma(data,50);
  const rsiD   = calcRSI(data);
  const macdD  = calcMACD(data);
  const bbD    = calcBB(data);

  const rsi    = rsiD.length  ? rsiD[rsiD.length-1].value      : 50;
  const lma20  = ma20d.length ? ma20d[ma20d.length-1].value    : last.close;
  const lma50  = ma50d.length ? ma50d[ma50d.length-1].value    : last.close;
  const lmacd  = macdD.hist.length ? macdD.hist[macdD.hist.length-1].value : 0;
  const lbb    = bbD.length   ? bbD[bbD.length-1]              : null;
  const avgVol = data.slice(-20).reduce((s,d)=>s+d.volume,0)/20;
  const volR   = last.volume / (avgVol||1);

  const tBull = last.close > lma50 && lma20 > lma50;
  const sig = {
    trend: tBull ? 'bull' : last.close < lma50 ? 'bear' : 'neut',
    rsi:   rsi > 70 ? 'bear' : rsi < 30 ? 'bull' : 'neut',
    macd:  lmacd > 0 ? 'bull' : 'bear',
    bb:    lbb ? (last.close >= lbb.upper ? 'bear' : last.close <= lbb.lower ? 'bull' : 'neut') : 'neut',
    vol:   volR > 1.5 ? (chg > 0 ? 'bull' : 'bear') : 'neut',
  };

  const desc = {
    trend: tBull ? `Preț deasupra MA50 (${fmt(lma50)}) și MA20 > MA50. Trend bullish puternic.` : last.close < lma50 ? `Prețul sub MA50 (${fmt(lma50)}). Presiune bearish.` : 'Prețul oscilează în jurul mediilor. Direcție neclară.',
    rsi:   rsi > 70 ? `RSI=${rsi.toFixed(1)} — Supracumpărat . Risc de corecție.` : rsi < 30 ? `RSI=${rsi.toFixed(1)} — Supravândut . Posibil rebound.` : `RSI=${rsi.toFixed(1)} — Zona neutră (30–70).`,
    macd:  lmacd > 0 ? `Histogramă pozitivă (+${lmacd.toFixed(4)}). Momentum bullish activ.` : `Histogramă negativă (${lmacd.toFixed(4)}). Momentum bearish.`,
    bb:    lbb ? (last.close >= lbb.upper ? `La banda superioară (${fmt(lbb.upper)}). Posibilă răsturnare.` : last.close <= lbb.lower ? `La banda inferioară (${fmt(lbb.lower)}). Posibil rebound.` : `În interiorul benzilor (${fmt(lbb.lower)}–${fmt(lbb.upper)}).`) : '—',
    vol:   volR > 1.5 ? `Volum ${fmtVol(last.volume)} = ${volR.toFixed(1)}× media. Confirmare ${chg>0?'cumpărare':'vânzare'}.` : `Volum normal (${(volR*100).toFixed(0)}% din medie).`,
  };

  document.getElementById('aiSignals').innerHTML = [
    ['Trend & MA', sig.trend, desc.trend],
    ['RSI (14)', sig.rsi, desc.rsi],
    ['MACD (12,26,9)', sig.macd, desc.macd],
    ['Benzile Bollinger', sig.bb, desc.bb],
    ['Volum', sig.vol, desc.vol],
  ].map(([name, s, d]) => `
    <div class="ai-signal">
      <div class="signal-header">
        <span class="signal-name">${name}</span>
        <span class="signal-badge ${s}">${s==='bull'?'BULLISH':s==='bear'?'BEARISH':'NEUTRU'}</span>
      </div>
      <div class="signal-desc">${d}</div>
    </div>`).join('');

  // Gauge & Sentiment
  const sigs = Object.values(sig);
  let bulls = sigs.filter(s=>s==='bull').length;
  let bears = sigs.filter(s=>s==='bear').length;
  let totalSigs = sigs.length;

  const reasons = [];
  if (tBull) reasons.push(` Prețul a urcat peste MA50 (${fmt(lma50)})`);
  else if (last.close < lma50) reasons.push(` Prețul este sub MA50 (${fmt(lma50)})`);
  if (rsi < 30) reasons.push(` RSI indică Supravânzare severă (${rsi.toFixed(1)})`);
  else if (rsi > 70) reasons.push(` RSI indică Supracumpărare severă (${rsi.toFixed(1)})`);
  if (lmacd > 0) reasons.push(` MACD arată un momentum crescător (+${lmacd.toFixed(4)})`);
  else reasons.push(` MACD arată un momentum descrescător (${lmacd.toFixed(4)})`);

  let newsSentiment = 0;
  if (meta && meta.news && meta.news.length > 0) {
    const newsText = meta.news.map(n => (n.title || '').toLowerCase()).join(' ');
    const posWords = ['up', 'rise', 'soar', 'jump', 'upgrade', 'buy', 'growth', 'beat', 'positive', 'win', 'high', 'surge', 'record'];
    const negWords = ['down', 'fall', 'drop', 'plunge', 'downgrade', 'sell', 'miss', 'negative', 'loss', 'low', 'crash', 'lawsuit'];
    let posCount = posWords.reduce((c, w) => c + (newsText.split(w).length - 1), 0);
    let negCount = negWords.reduce((c, w) => c + (newsText.split(w).length - 1), 0);
    
    if (posCount > negCount + 1) { newsSentiment = 1; bulls++; totalSigs++; reasons.push(` Știri Recente: Pozitive (${posCount} semnale)`); }
    else if (negCount > posCount + 1) { newsSentiment = -1; bears++; totalSigs++; reasons.push(` Știri Recente: Negative (${negCount} semnale)`); }
    else { reasons.push(` Știri Recente: Neutre / Mixte`); }
  }

  // Wolfe Waves check
  let ww = calcWolfeWaves(data);
  if (ww.lineEPA.length > 0) {
    let type = ww.line135[0].value < ww.line135[1].value ? "Bearish" : "Bullish";
    if (type === "Bullish") { bulls += 2; totalSigs += 2; reasons.push(` Tipar Wolfe Waves Bullish Detectat: Oportunitate Cumpărare (Target EPA: ${fmt(ww.lineEPA[2].value)})`); }
    else { bears += 2; totalSigs += 2; reasons.push(` Tipar Wolfe Waves Bearish Detectat: Oportunitate Vânzare (Target EPA: ${fmt(ww.lineEPA[2].value)})`); }
  }

  const score = (bulls - bears) / totalSigs;
  drawGauge(score);
  const lbl = score > 0.4 ? ' CUMPĂRARE PUTERNICĂ' : score > 0.1 ? ' CUMPĂRARE' : score < -0.4 ? ' VÂNZARE PUTERNICĂ' : score < -0.1 ? ' VÂNZARE' : ' NEUTRU';
  document.getElementById('gaugeLabel').textContent = lbl;
  document.getElementById('gaugeSub').textContent = `${bulls}/${totalSigs} indicatori bullish`;

  // Score bars
  document.getElementById('scoreBars').innerHTML = sigs.map(s => `<div class="score-bar ${s}"></div>`).join('');

  // Forecast tab
  buildForecast(data);

  // ── Aftermarket / Premarket info (topbar)
  showMarketStatus();

  // Salvează datele pentru a putea declanșa popup-ul manual
  latestSignalData = { score, lbl, price: last.close, reasons, bulls, totalSigs };
  triggerSignalNotification(score, lbl, last.close, reasons, bulls, totalSigs);
}

// ==========================================
// CLIENT-SIDE AI SCREENER (Replaces Telegram Bot)
// ==========================================
const FAVORITES = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'BTC-USD', 'ETH-USD', 'APPS', 'CL=F'];

function toggleSignalsPanel() {
  const panel = document.getElementById('signalsPanel');
  if (window.innerWidth <= 768) {
    switchMobileTab('signals');
  } else {
    // Desktop modal behavior
    if (panel.style.display === 'flex') {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'flex';
      panel.style.position = 'fixed';
      panel.style.top = '50%';
      panel.style.left = '50%';
      panel.style.transform = 'translate(-50%, -50%)';
      panel.style.width = '800px';
      panel.style.height = '80vh';
      panel.style.zIndex = '99999';
      panel.style.boxShadow = '0 10px 50px rgba(0,0,0,0.8)';
      panel.style.borderRadius = '12px';
      panel.style.border = '1px solid var(--border)';
      
      if (!document.getElementById('sigCloseBtn')) {
        const closeBtn = document.createElement('button');
        closeBtn.id = 'sigCloseBtn';
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'position:absolute; top:16px; right:16px; background:rgba(255,255,255,0.1); border:none; color:#fff; border-radius:50%; width:32px; height:32px; cursor:pointer;';
        closeBtn.onclick = () => panel.style.display = 'none';
        panel.appendChild(closeBtn);
      }
      
      if (typeof loadCachedSignals === 'function') loadCachedSignals();
    }
  }
}

function calcRSI14_local(data) {
    if (data.length < 15) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - 14; i < data.length; i++) {
        let diff = data[i].close - data[i - 1].close;
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;
    if (avgLoss === 0) return 100;
    let rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function getReason_local(rsi, isUp) {
    let reason = "";
    if (isUp) {
        if (rsi < 35) reason += "📊 RSI arată o zonă de <b>supravânzare (Oversold)</b> extremă. Istoricul prețului confirmă un tipar de revenire în formă de V (Reversal). Balenele acumulează la reducere.";
        else if (rsi > 65) reason += "🔥 Momentum uriaș. Indicatorii arată un <b>trend ascendent agresiv</b> care abia s-a validat (Breakout). Tiparele similare din trecut au continuat să explodeze.";
        else reason += "📈 Prețul a creat o <b>bază solidă de acumulare</b> neutră. Geometria actuală a prețului a coincis în trecut cu o izbucnire bruscă în sus (Pump iminent).";
    } else {
        if (rsi > 65) reason += "⚠️ RSI indică o zonă de <b>supracumpărare (Overbought)</b>. Euforia a atins vârful, iar cumpărătorii sunt epuizați. Tiparele istorice arată o cădere bruscă de aici.";
        else if (rsi < 35) reason += "🩸 Presiune masivă de vânzare. Algoritmul detectează ruperea unor <b>suporturi critice</b>, ceea ce în trecut a dus la panică și capitulare continuă (Dump).";
        else reason += "📉 Graficul a format un <b>tipar periculos de distribuție</b>. Instituțiile își descarcă tăcut pozițiile. Istoricul arată că după o astfel de structură urmează o prăbușire.";
    }
    return reason;
}

function loadCachedSignals() {
  let history = [];
  try {
    const cached = localStorage.getItem('tradeProSignalsHistory');
    if (cached) history = JSON.parse(cached);
  } catch(e) {}
  
  if (history.length > 0) {
    const latest = history[0];
    if (Date.now() - latest.timestamp < 12 * 60 * 60 * 1000) { // Keep valid for 12 hours
      renderSignals(latest.signals, new Date(latest.timestamp), history);
      return;
    }
  }
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
        const res = await fetchJSON(u);
        const quotes = res.finance.result[0].quotes;
        quotes.forEach(q => dynamic.push(q.symbol));
      } catch(e){}
    }
    return dynamic;
  } catch(e) {
    return [];
  }
}

async function scanMarket() {
  const statusEl = document.getElementById('signalsStatus');
  const listEl = document.getElementById('signalsList');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Preluare listă simboluri dinamice...';
  listEl.innerHTML = '<div style="text-align:center; padding:40px;"><div class="spinner" style="margin:0 auto 16px;"></div>Se scanează piața... Așteaptă 10-20 secunde.</div>';

  const FRACTAL_LEN = 14;
  const FORECAST_LEN = 10;
  let allSignals = [];
  
  const dynamicSymbols = await fetchDynamicSymbols();
  const ALL_SYMBOLS = Array.from(new Set([...FAVORITES, ...dynamicSymbols])).filter(s => !!s);

  for (let idx = 0; idx < ALL_SYMBOLS.length; idx++) {
    const sym = ALL_SYMBOLS[idx];
    statusEl.textContent = `Analizez ${sym} (${idx + 1}/${ALL_SYMBOLS.length})...`;
    try {
      const { raw } = await fetchData(sym, '1d');
      if (!raw || raw.length < 50) continue;
      
      const currentSlice = raw.slice(-FRACTAL_LEN);
      const currentBase = currentSlice[0].close;
      const currentNorm = currentSlice.map(d => d.close / currentBase);
      const currentMom = (currentSlice[FRACTAL_LEN-1].close / currentBase) - 1;
      
      let matches = [];
      for (let i = 0; i < raw.length - FRACTAL_LEN - FORECAST_LEN - Math.max(10, FRACTAL_LEN); i++) {
        const histSlice = raw.slice(i, i + FRACTAL_LEN);
        const histBase = histSlice[0].close;
        const histNorm = histSlice.map(d => d.close / histBase);
        const histMom = (histSlice[FRACTAL_LEN-1].close / histBase) - 1;
        
        if (Math.sign(currentMom) !== Math.sign(histMom)) continue;
        if (Math.abs(currentMom) > 0.03 && Math.abs(histMom) < Math.abs(currentMom) * 0.3) continue;
        
        let error = 0;
        for (let j = 0; j < FRACTAL_LEN; j++) {
            error += Math.abs(currentNorm[j] - histNorm[j]);
        }
        
        const afterSlice = raw.slice(i + FRACTAL_LEN, i + FRACTAL_LEN + FORECAST_LEN);
        const resultBase = histSlice[FRACTAL_LEN-1].close;
        const resultFinal = afterSlice[afterSlice.length-1].close;
        const resultPct = ((resultFinal / resultBase) - 1) * 100;
        
        matches.push({ error, resultPct });
      }
      
      if (matches.length > 0) {
        matches.sort((a,b) => a.error - b.error);
        const topMatches = matches.slice(0, 3);
        const avgPct = topMatches.reduce((sum, m) => sum + m.resultPct, 0) / topMatches.length;
        
        if (Math.abs(avgPct) >= 5) { // Threshold coborat la 5% pentru a include si miscari moderate
          const rsi = calcRSI14_local(raw);
          allSignals.push({
            sym,
            avgPct,
            price: raw[raw.length - 1].close,
            reason: getReason_local(rsi, avgPct > 0)
          });
        }
      }
    } catch (e) {
      console.warn('Scan error on', sym, e);
    }
  }

  // Update history array
  let history = [];
  try {
    const cached = localStorage.getItem('tradeProSignalsHistory');
    if (cached) history = JSON.parse(cached);
  } catch(e) {}
  
  history.unshift({
    timestamp: Date.now(),
    signals: allSignals
  });
  
  // Keep last 10 scans
  if (history.length > 10) history = history.slice(0, 10);
  
  localStorage.setItem('tradeProSignalsHistory', JSON.stringify(history));

  renderSignals(allSignals, new Date(), history);
  statusEl.textContent = 'Scanare completă!';
  setTimeout(() => statusEl.style.display = 'none', 3000);
}

function viewHistoryScan(timestamp) {
  try {
    const cached = localStorage.getItem('tradeProSignalsHistory');
    if (cached) {
      const history = JSON.parse(cached);
      const scan = history.find(h => h.timestamp === parseInt(timestamp));
      if (scan) {
        renderSignals(scan.signals, new Date(scan.timestamp), history);
      }
    }
  } catch(e){}
}

function renderSignals(signals, dateObj, fullHistory = []) {
  const listEl = document.getElementById('signalsList');
  if (signals.length === 0) {
    listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text2);">Nu s-au găsit semnale majore (>5%) în acest moment.</div>';
  } else {
    // Imparte pe categorii >20%, >15%, >10%, >5%
    const cat20 = signals.filter(s => Math.abs(s.avgPct) >= 20).sort((a,b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));
    const cat15 = signals.filter(s => Math.abs(s.avgPct) >= 15 && Math.abs(s.avgPct) < 20).sort((a,b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));
    const cat10 = signals.filter(s => Math.abs(s.avgPct) >= 10 && Math.abs(s.avgPct) < 15).sort((a,b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));
    const cat5  = signals.filter(s => Math.abs(s.avgPct) >= 5  && Math.abs(s.avgPct) < 10).sort((a,b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));

    listEl.innerHTML = `<div style="font-size:11px; color:var(--text2); text-align:right; margin-bottom:8px;">Scanare din: ${dateObj.toLocaleString()}</div>`;
    
    const renderCat = (title, items, emoji) => {
      if(items.length === 0) return '';
      let html = `<div style="margin-top:16px; margin-bottom:8px; font-weight:800; font-size:15px; color:var(--text); display:flex; align-items:center; gap:6px;">${emoji} ${title}</div>`;
      items.forEach(sig => {
        const isUp = sig.avgPct > 0;
        const color = isUp ? 'var(--green)' : 'var(--red)';
        const dirTxt = isUp ? '📈 CREȘTERE' : '📉 SCĂDERE';
        const logoHtml = getFallbackIconHTML(sig.sym, 40);
        
        html += `
          <div style="background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:16px; position:relative; overflow:hidden; margin-bottom:12px;" onclick="toggleSignalsPanel(); loadSymbol('${sig.sym}')">
            <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:${color};"></div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-left:8px;">
              <div style="display:flex; align-items:center; gap:12px;">
                ${logoHtml}
                <div>
                  <div style="font-weight:900; font-size:18px;">${sig.sym}</div>
                  <div style="font-size:12px; color:var(--text2);">Preț: $${sig.price.toFixed(2)}</div>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:12px; font-weight:800; color:${color}; margin-bottom:2px;">${dirTxt}</div>
                <div style="font-size:20px; font-weight:900; color:${color};">${sig.avgPct > 0 ? '+' : ''}${sig.avgPct.toFixed(2)}%</div>
              </div>
            </div>
            <div style="font-size:13px; color:var(--text); line-height:1.5; background:var(--bg3); padding:12px; border-radius:8px; margin-left:8px;">
              ${sig.reason}
            </div>
          </div>
        `;
      });
      return html;
    };

    listEl.innerHTML += renderCat('Dinamica Extremă (>20%)', cat20, '🔥');
    listEl.innerHTML += renderCat('Dinamica Puternică (>15%)', cat15, '🚀');
    listEl.innerHTML += renderCat('Dinamica Rapidă (>10%)', cat10, '⚡');
    listEl.innerHTML += renderCat('Dinamica Moderată (>5%)', cat5, '📈');
  }

  // Render History Dropdown at the bottom
  if (fullHistory && fullHistory.length > 1) {
    let histHtml = `<div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border);">
      <div style="font-weight:800; font-size:14px; margin-bottom:12px; color:var(--text2);">🕒 Istoric Scanări</div>
      <div style="display:flex; flex-direction:column; gap:8px;">`;
    
    fullHistory.forEach((h, i) => {
      const d = new Date(h.timestamp);
      histHtml += `
        <button onclick="viewHistoryScan(${h.timestamp})" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:10px; text-align:left; cursor:pointer; font-size:13px; display:flex; justify-content:space-between;">
          <span>Scanare ${i === 0 ? '(Ultima)' : ''}</span>
          <span style="color:var(--text2);">${d.toLocaleString()}</span>
        </button>`;
    });
    
    histHtml += `</div></div>`;
    listEl.innerHTML += histHtml;
  }
}


// ════════════════════════════════════════════════════════════
//  MARKET STATUS (aftermarket / premarket)
// ════════════════════════════════════════════════════════════
function getMarketSession() {
  const now = new Date();
  const yr = now.getUTCFullYear();
  const dstStart = new Date(Date.UTC(yr, 2, 8  + (7 - new Date(Date.UTC(yr,2,8)).getUTCDay())  % 7, 7));
  const dstEnd   = new Date(Date.UTC(yr,10, 1  + (7 - new Date(Date.UTC(yr,10,1)).getUTCDay()) % 7, 6));
  const etOffset = (now >= dstStart && now < dstEnd) ? -4 : -5;
  const etDate   = new Date(now.getTime() + etOffset * 3600000);
  const etMin    = etDate.getUTCHours() * 60 + etDate.getUTCMinutes();
  const dow      = etDate.getUTCDay();
  const etStr    = etDate.getUTCHours().toString().padStart(2,'0') + ':' + etDate.getUTCMinutes().toString().padStart(2,'0');

  if (dow === 0 || dow === 6)
    return { label:'WEEKEND', sub:'Piața redeschide luni 04:00 ET', color:'var(--red)', dot:'red', etStr };
  if (etMin >= 570 && etMin < 960) {
    const left = 960 - etMin;
    return { label:'DESCHIS', sub:`NYSE/NASDAQ · ${etStr} ET · închide în ${Math.floor(left/60)}h${left%60 < 10?'0':''}${left%60}m`, color:'var(--green)', dot:'green', etStr };
  }
  if (etMin >= 240 && etMin < 570) {
    const left = 570 - etMin;
    return { label:'PRE-MARKET', sub:`04:00–09:30 ET · ${etStr} ET · deschide în ${Math.floor(left/60)}h${left%60 < 10?'0':''}${left%60}m`, color:'var(--yellow)', dot:'yellow', etStr };
  }
  if (etMin >= 960 && etMin < 1200) {
    const left = 1200 - etMin;
    return { label:'AFTER-HOURS', sub:`16:00–20:00 ET · ${etStr} ET · se închide în ${Math.floor(left/60)}h${left%60 < 10?'0':''}${left%60}m`, color:'var(--yellow)', dot:'yellow', etStr };
  }
  const toPreMkt = etMin < 240 ? 240 - etMin : 1440 - etMin + 240;
  return { label:'ÎNCHIS', sub:`Pre-market deschide în ${Math.floor(toPreMkt/60)}h${toPreMkt%60 < 10?'0':''}${toPreMkt%60}m`, color:'var(--red)', dot:'red', etStr };
}

function showMarketStatus() {
  const el = document.getElementById('marketStatusBar');
  if (!el) return;
  const s = getMarketSession();
  const dotColor = s.dot === 'green' ? '#089981' : s.dot === 'yellow' ? '#e0a800' : '#f23645';
  const anim = s.dot === 'green' ? 'pulse-green' : s.dot === 'yellow' ? 'pulse-yellow' : '';
  el.innerHTML = `
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-right:5px;vertical-align:middle;${anim ? `animation:${anim} 1.5s ease-in-out infinite;` : ''}"></span>
    <span style="font-weight:800;color:${s.color};vertical-align:middle;">${s.label}</span>
    <span style="color:var(--text2);font-size:10px;margin-left:6px;vertical-align:middle;">${s.sub}</span>`;
}
// Tick live — actualizează statusul la fiecare 30s
setInterval(showMarketStatus, 30000);

// ════════════════════════════════════════════════════════════
//  SIGNAL NOTIFICATION POP-UP
// ════════════════════════════════════════════════════════════
let lastNotifScore = null;
let latestSignalData = null;

function forceShowSignal() {
  const inputSym = document.getElementById('symbolInput').value.trim().toUpperCase();
  if (inputSym && inputSym !== currentSymbol) {
    loadSymbol(inputSym).then(() => {
      forceShowSignal();
    });
    return;
  }
  
  if (!latestSignalData) {
    alert('Nicio analiză disponibilă încă. Se încarcă datele...');
    return;
  }
  const { score, lbl, price, reasons, bulls, totalSigs } = latestSignalData;
  triggerSignalNotification(score, lbl, price, reasons, bulls, totalSigs, true);
}

function triggerSignalNotification(score, labelText, price, reasons = [], bulls = 0, totalSigs = 5, force = false) {
  // Only notify automatically on strong signals and if changed
  const strong = Math.abs(score) >= 0.4;
  if (!force && !strong) return;
  if (!force && lastNotifScore !== null && Math.sign(score) === Math.sign(lastNotifScore)) return;
  lastNotifScore = score;

  const isBuy  = score > 0;
  const emoji  = '';
  const action = isBuy ? 'CUMPĂRARE' : 'VÂNZARE';
  const color  = isBuy ? 'var(--green)' : 'var(--red)';
  const bg     = isBuy ? 'rgba(8,153,129,.12)' : 'rgba(242,54,69,.12)';
  const border = isBuy ? 'var(--green)' : 'var(--red)';
  const conf   = Math.round(Math.abs(score) * 100);

  const reasonsHtml = reasons.map(r => `<div style="margin-top:4px;">${r}</div>`).join('');

  // Remove existing
  document.getElementById('signalPopup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'signalPopup';
  popup.style.cssText = `
    position:fixed;top:66px;right:310px;z-index:9999;
    background:var(--bg2);border:2px solid ${border};border-radius:12px;
    padding:14px 18px;min-width:260px;box-shadow:0 8px 32px rgba(0,0,0,.25);
    animation:slideIn .3s ease;
  `;
  popup.innerHTML = `
    <style>@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}</style>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:13px;font-weight:800;color:${color};">${emoji} SEMNAL AI: ${action}</span>
      <span onclick="this.parentElement.parentElement.remove()" style="cursor:pointer;color:var(--text2);font-size:16px;line-height:1;">×</span>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">
      <b style="color:var(--text)">${currentSymbol}</b> @ <b style="color:var(--text)">${fmt(price)}</b>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);">
      Încredere: <b style="color:${color}">${conf}%</b> (${bulls}/${totalSigs} indicatori)
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:12px;line-height:1.4;">
      <b style="color:var(--text);font-size:10px;text-transform:uppercase;">Justificare Algoritm:</b>
      ${reasonsHtml}
    </div>
    <div style="display:flex;gap:6px;">
      <button onclick="document.getElementById('signalPopup').remove()" style="flex:1;background:${bg};border:1px solid ${border};color:${color};border-radius:6px;padding:6px;font-size:11px;font-weight:700;cursor:pointer;">
        ${isBuy ? '✅ Am înțeles, cumpăr' : '✅ Am înțeles, vând'}
      </button>
      <button onclick="document.getElementById('signalPopup').remove()" style="flex:1;background:var(--bg3);border:1px solid var(--border);color:var(--text2);border-radius:6px;padding:6px;font-size:11px;cursor:pointer;">
        Ignoră
      </button>
    </div>
    <div style="font-size:9px;color:var(--text2);margin-top:8px;opacity:.7;"> Nu constituie sfat financiar. Decizii pe propria răspundere.</div>
  `;
  document.body.appendChild(popup);

  // Browser notification (dacă e permisă)
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`TradePro AI — ${action} ${currentSymbol}`, {
      body: `${currentSymbol} @ ${fmt(price)} | Încredere: ${conf}%`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="28" font-size="28"></text></svg>'
    });
  }

  // Auto-close after 12 seconds
  setTimeout(() => document.getElementById('signalPopup')?.remove(), 12000);
}

// Request browser notification permission (silently)
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ════════════════════════════════════════════════════════════
//  GAUGE
// ════════════════════════════════════════════════════════════
function drawGauge(score) {
  const canvas = document.getElementById('gaugeCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  const cx=W/2, cy=H-8, r=66;

  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0); ctx.lineWidth=13; ctx.strokeStyle='var(--bg3)'; ctx.stroke();

  const grad = ctx.createLinearGradient(cx-r,0,cx+r,0);
  grad.addColorStop(0,'#f23645'); grad.addColorStop(0.5,'#e0a800'); grad.addColorStop(1,'#089981');
  const ang = Math.PI + (1+score)*Math.PI/2;
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,ang); ctx.lineWidth=13; ctx.strokeStyle=grad; ctx.lineCap='round'; ctx.stroke();

  const nx=cx+(r-6)*Math.cos(ang), ny=cy+(r-6)*Math.sin(ang);
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(nx,ny); ctx.lineWidth=2; ctx.strokeStyle='var(--text)'; ctx.lineCap='round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fillStyle='var(--text)'; ctx.fill();

  ctx.font='9px sans-serif'; ctx.fillStyle='var(--red)'; ctx.fillText('SELL',cx-r-2,cy+2);
  ctx.fillStyle='var(--green)'; ctx.fillText('BUY',cx+r-22,cy+2);
}

// ════════════════════════════════════════════════════════════
//  RING CHART
// ════════════════════════════════════════════════════════════
function drawRing(pct) {
  const canvas = document.getElementById('ringCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,60,60);
  const cx=30, cy=30, r=24;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.lineWidth=7; ctx.strokeStyle='var(--bg4)'; ctx.stroke();
  const end = -Math.PI/2 + (pct/100)*Math.PI*2;
  const color = pct > 60 ? '#089981' : pct < 40 ? '#f23645' : '#e0a800';
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2,end); ctx.lineWidth=7; ctx.strokeStyle=color; ctx.lineCap='round'; ctx.stroke();
}

// ════════════════════════════════════════════════════════════
//  CROSSHAIR
// ════════════════════════════════════════════════════════════
function updateCrosshairInfo(param) {
  const el = document.getElementById('crosshairInfo');
  if (!param.point || !param.seriesData?.size) { el.style.display='none'; return; }
  const d = param.seriesData.get(candleSeries);
  if (!d) return;
  
  // Actualizeaza pretul pentru context menu
  ctxMenuPrice = d.close;
  
  const chg = allData.length >= 2 ? ((d.close - allData[allData.length-2].close) / allData[allData.length-2].close * 100) : 0;
  const chgColor = chg >= 0 ? 'var(--green)' : 'var(--red)';
  el.style.display='flex';
  el.innerHTML = `
    <span style="font-weight:800;color:var(--text);margin-right:8px;">${currentSymbol}</span>
    <span class="chi">O: <span>${fmt(d.open)}</span></span>
    <span class="chi">H: <span style="color:var(--green)">${fmt(d.high)}</span></span>
    <span class="chi">L: <span style="color:var(--red)">${fmt(d.low)}</span></span>
    <span class="chi">C: <span style="font-weight:800">${fmt(d.close)}</span></span>
    <span class="chi" style="color:${chgColor}">${chg>=0?'+':''}${chg.toFixed(2)}%</span>`;
}

// ════════════════════════════════════════════════════════════
//  DRAWING TOOLS
// ════════════════════════════════════════════════════════════
function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const id = 'tool' + tool[0].toUpperCase() + tool.slice(1);
  const btn = document.getElementById(id);
  if (btn) btn.classList.add('active');
}

function openFibPanel() {
  // Switch to Fibonacci tab
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel-page').forEach(p => p.classList.remove('active'));
  const fibTab  = document.querySelector('.ptab[data-page="fibonacci"]');
  const fibPage = document.getElementById('page-fibonacci');
  if (fibTab)  fibTab.classList.add('active');
  if (fibPage) fibPage.classList.add('active');
  // Toggle lines visibility
  const toggle = document.getElementById('fibToggle');
  if (toggle) { toggle.checked = !toggle.checked; onFibToggle(); }
}

function undoDrawing() { /* placeholder */ }
function clearDrawings() {
  candleSeries.setMarkers([]);
  // Also clear Fibonacci lines
  fibPriceLines.forEach(pl => { try { candleSeries.removePriceLine(pl); } catch(e){} });
  fibPriceLines = [];
}
function toggleFS() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }

// ════════════════════════════════════════════════════════════
//  WATCHLIST
// ════════════════════════════════════════════════════════════
// Drag & Drop state
let draggedWlItemIndex = null;

function handleWlDragStart(e, idx) {
  draggedWlItemIndex = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.target.innerHTML);
  e.target.style.opacity = '0.4';
}

function handleWlDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleWlDrop(e, dropIdx) {
  e.stopPropagation();
  if (draggedWlItemIndex !== null && draggedWlItemIndex !== dropIdx) {
    const draggedItem = watchlistData.splice(draggedWlItemIndex, 1)[0];
    watchlistData.splice(dropIdx, 0, draggedItem);
    saveWatchlist();
    renderWatchlist();
  }
  return false;
}

function handleWlDragEnd(e) {
  e.target.style.opacity = '1';
  draggedWlItemIndex = null;
}

// ── LOGOS MAPPING ──
function getBestLogoUrl(sym) {
  const s = sym.toUpperCase().replace(/=X|-USD|=F/g, '');
  const map = {
    'TSLA': 'https://logo.clearbit.com/tesla.com',
    'MSFT': 'https://logo.clearbit.com/microsoft.com',
    'NVDA': 'https://logo.clearbit.com/nvidia.com',
    'AAPL': 'https://logo.clearbit.com/apple.com',
    'AMZN': 'https://logo.clearbit.com/amazon.com',
    'META': 'https://logo.clearbit.com/meta.com',
    'GOOGL': 'https://logo.clearbit.com/abc.xyz',
    'GOOG': 'https://logo.clearbit.com/abc.xyz',
    'NFLX': 'https://logo.clearbit.com/netflix.com',
    'LULU': 'https://logo.clearbit.com/lululemon.com',
    'APPS': 'https://logo.clearbit.com/digitalturbine.com',
    'NQ': 'https://logo.clearbit.com/nasdaq.com', // Nasdaq
    'ES': 'https://logo.clearbit.com/spglobal.com', // S&P 500
    'SPY': 'https://logo.clearbit.com/spglobal.com',
    'QQQ': 'https://logo.clearbit.com/nasdaq.com',
    'CL': 'https://cdn-icons-png.flaticon.com/512/1154/1154378.png', // Oil Drop
    'BZ': 'https://cdn-icons-png.flaticon.com/512/1154/1154378.png', // Brent Oil
    'GC': 'https://cdn-icons-png.flaticon.com/512/1487/1487777.png', // Gold
    'SI': 'https://cdn-icons-png.flaticon.com/512/4627/4627341.png', // Silver
    'BTC': 'https://cryptologos.cc/logos/bitcoin-btc-logo.png',
    'ETH': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    'SOL': 'https://cryptologos.cc/logos/solana-sol-logo.png'
  };
  return map[s] || `https://logo.clearbit.com/${s.toLowerCase()}.com`; // Fallback la clearbit generic
}

function wlItemHTML(w, idx) {
  const delBtn = `<button onclick="event.stopPropagation();removeFromWatchlist('${w.sym}')"
       style="background:none;border:none;color:var(--text2);font-size:11px;cursor:pointer;padding:0;opacity:.5;line-height:1;"
       title="Șterge din watchlist">✕</button>`;
  
  const symClean = safe(w.sym).replace('-USD','');
  const logoUrl = getBestLogoUrl(w.sym);
  const logoHtml = `
    <img src="${logoUrl}" 
         onerror="this.src='https://eodhd.com/img/logos/US/${symClean}.png'; this.onerror=function(){this.src='https://financialmodelingprep.com/image-stock/${symClean}.png'; this.onerror=function(){this.style.display='none';};};" 
         style="width:24px;height:24px;border-radius:50%;margin-right:6px;background:#fff;object-fit:contain;flex-shrink:0;padding:2px;" />
  `;

  return `
    <div class="wl-item ${w.sym===currentSymbol?'active':''}" 
         draggable="true" 
         ondragstart="handleWlDragStart(event, ${idx})" 
         ondragover="handleWlDragOver(event)" 
         ondrop="handleWlDrop(event, ${idx})" 
         ondragend="handleWlDragEnd(event)"
         onclick="loadSymbol('${w.sym}')"
         style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 4px; align-items: center; padding: 8px 12px;">
      
      <div style="display: flex; align-items: center; gap: 4px; min-width: 0;">
        ${logoHtml}
        <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <div class="wl-sym" style="font-size:12px; font-weight:800; overflow:hidden; text-overflow:ellipsis;">${w.sym}</div>
            ${delBtn}
          </div>
          <div class="wl-name" id="wln-${safe(w.sym)}" style="font-size:9px; color:var(--text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cleanCompanyName(w.name, w.sym)}</div>
        </div>
      </div>
      
      <div class="wl-p" id="wlp-${safe(w.sym)}" style="text-align: right; transition:color .3s; font-size:12px; font-weight:700;">${w.price!=null?fmt(w.price):'—'}</div>
      
      <div class="wl-chg-abs" id="wlca-${safe(w.sym)}" style="text-align: right; font-size:12px; font-weight:700; color:${(w.chg||0)>=0?'var(--green)':'var(--red)'}">${w.chgVal!=null?(w.chgVal>=0?'+':'')+w.chgVal.toFixed(2):'—'}</div>
      
      <div class="wl-chg ${(w.chg||0)>=0?'up':'dn'}" id="wlc-${safe(w.sym)}" style="text-align: right; font-size:12px; font-weight:700;">${w.chg!=null?(w.chg>=0?'+':'')+w.chg.toFixed(2)+'%':''}</div>
    </div>`;
}

function renderWatchlist() {
  const userEl = document.getElementById('watchlistUser');
  if (userEl) {
    userEl.innerHTML = watchlistData.map((w, idx) => wlItemHTML(w, idx)).join('');
  }
}

// ════════════════════════════════════════════════════════════
//  LIVE BATCH QUOTES — un singur request pentru toate simbolurile
// ════════════════════════════════════════════════════════════
let liveQuotes = {};   // cache cu ultimele quote-uri
let liveUpdateRunning = false;

async function fetchBatchQuotes(symbols) {
  const fields = [
    'symbol','shortName','regularMarketPrice','regularMarketChange',
    'regularMarketChangePercent','regularMarketPreviousClose',
    'preMarketPrice','preMarketChange','preMarketChangePercent',
    'postMarketPrice','postMarketChange','postMarketChangePercent',
    'marketState'
  ].join(',');
  const syms = symbols.join(',');
  const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}&fields=${fields}&lang=en&region=US`;
  const json = await fetchJSON(url, 8000);
  const results = json?.quoteResponse?.result || [];
  const map = {};
  results.forEach(q => { map[q.symbol] = q; });
  return map;
}

function applyQuoteToDOM(sym, q) {
  // Alege prețul în funcție de sesiunea curentă
  const state = q.marketState || 'REGULAR'; // PRE, REGULAR, POST, CLOSED
  let livePrice, liveChg, liveChgPct, sessionLabel;

  // Fix: Main price is ALWAYS regularMarketPrice.
  livePrice  = q.regularMarketPrice;
  liveChg    = q.regularMarketChange;
  liveChgPct = q.regularMarketChangePercent;
  
  if (state === 'PRE') sessionLabel = 'pre';
  else if (state === 'POST' || state === 'POSTPOST') sessionLabel = 'post';
  else sessionLabel = 'reg';

  if (livePrice == null || isNaN(livePrice)) return;

  const id   = safe(sym);
  const pe   = document.getElementById('wlp-' + id);
  const ce   = document.getElementById('wlc-' + id);
  const se   = document.getElementById('wls-' + id); // session badge

  if (pe) {
    const newTxt = fmt(livePrice);
    if (pe.dataset.last && pe.dataset.last !== newTxt) {
      const up = liveChg >= 0;
      pe.classList.remove('flash-up','flash-dn');
      void pe.offsetWidth;
      pe.classList.add(up ? 'flash-up' : 'flash-dn');
    }
    pe.dataset.last = newTxt;
    pe.textContent  = newTxt;
    pe.style.color  = liveChg >= 0 ? 'var(--green)' : 'var(--red)';
  }

  if (ce && liveChgPct != null) {
    const pct = liveChgPct.toFixed(2);
    ce.textContent = (liveChg >= 0 ? '+' : '') + pct + '%';
    ce.className   = `wl-chg ${liveChg >= 0 ? 'up' : 'dn'}`;
  }

  const cae = document.getElementById('wlca-' + id);
  if (cae && liveChg != null) {
    cae.textContent = (liveChg >= 0 ? '+' : '') + liveChg.toFixed(2);
    cae.style.color = liveChg >= 0 ? 'var(--green)' : 'var(--red)';
  }

  if (se) {
    se.textContent  = sessionLabel === 'pre' ? 'PRE' : sessionLabel === 'post' ? 'POST' : '';
    se.style.display = sessionLabel !== 'reg' ? 'inline' : 'none';
  }

  // Update watchlist name
  const wlNameEl = document.getElementById(`wln-${safe(sym)}`);
  if (wlNameEl && (q.shortName || q.longName)) {
    wlNameEl.textContent = cleanCompanyName(q.shortName || q.longName, sym);
  }

  // Actualizează topbar + extended hours dacă e simbolul curent
  if (sym === currentSymbol && livePrice != null) {
    animatePrice(livePrice);
    document.getElementById('curPrice').textContent = fmt(livePrice);
    
    // Update floating order panel on chart
    const fPanel = document.getElementById('floatingOrderPanel');
    const fSell = document.getElementById('floatSellPrice');
    const fBuy = document.getElementById('floatBuyPrice');
    const fSpread = document.getElementById('floatSpread');
    if (fPanel && livePrice != null) {
      fPanel.style.display = 'flex';
      // Simulate Bid/Ask based on a small spread if real bid/ask not provided
      const spreadPct = livePrice > 100 ? 0.0001 : 0.001; 
      const bid = q.bid || (livePrice * (1 - spreadPct));
      const ask = q.ask || (livePrice * (1 + spreadPct));
      fSell.textContent = fmt(bid);
      fBuy.textContent = fmt(ask);
      fSpread.textContent = fmt(ask - bid);
    }

    // Afiseaza numele companiei din quote si logo-ul corect
    const nameEl = document.getElementById('curCompanyName');
    const compName = cleanCompanyName(q.shortName || q.longName, sym);
    if (nameEl && (q.shortName || q.longName)) {
      nameEl.textContent = compName;
      nameEl.title = q.shortName || q.longName;
    }
    const logoEl = document.getElementById('curLogo');
    const logoUrl = getBestLogoUrl(sym);
    if (logoEl) {
      logoEl.src = logoUrl;
      logoEl.style.display = 'block';
    }
    
    // Populeaza Details Widget (Sidebar)
    document.getElementById('dwSym').textContent = sym;
    document.getElementById('dwName').textContent = compName;
    const dwLogo = document.getElementById('dwLogo');
    if (dwLogo) { dwLogo.src = logoUrl; dwLogo.style.display = 'block'; }
    const dwPrice = document.getElementById('dwPrice');
    const dwChg = document.getElementById('dwChg');
    if (dwPrice && livePrice != null) {
      dwPrice.textContent = fmt(livePrice);
      dwPrice.style.color = liveChg >= 0 ? 'var(--green)' : 'var(--red)';
      dwChg.textContent = `${liveChg>=0?'+':''}${fmt(liveChg)} (${liveChgPct.toFixed(2)}%)`;
      dwChg.style.color = liveChg >= 0 ? 'var(--green)' : 'var(--red)';
    }
    // Update Day's Range in Details Widget
    const dwRangeText = document.getElementById('dwRangeText');
    const dwRangeBar = document.getElementById('dwRangeBar');
    const dwRangeDot = document.getElementById('dwRangeDot');
    if (dwRangeText && q.regularMarketDayLow && q.regularMarketDayHigh) {
      const low = q.regularMarketDayLow;
      const high = q.regularMarketDayHigh;
      dwRangeText.textContent = `${fmt(low)} - ${fmt(high)}`;
      if (high > low) {
        const pct = Math.max(0, Math.min(100, ((livePrice - low) / (high - low)) * 100));
        dwRangeBar.style.width = pct + '%';
        dwRangeDot.style.left = pct + '%';
      }
    }
    
    if (liveChg != null) {
      const ce2 = document.getElementById('curChange');
      ce2.textContent = `${liveChg>=0?'+':''}${fmt(liveChg)} (${liveChg>=0?'+':''}${liveChgPct.toFixed(2)}%)`;
      ce2.className   = liveChg >= 0 ? 'up' : 'dn';
      // Titlul tabului de browser se actualizeaza live
      document.title = `${sym} ${fmt(livePrice)} (${liveChg>=0?'+':''}${liveChgPct.toFixed(2)}%) — TradePro AI`;
    }
    // Stats panel — regular
    document.getElementById('statC').textContent = fmt(livePrice);
    const s24 = document.getElementById('stat24h');
    if (s24 && q.regularMarketChangePercent != null) {
      const rPct = q.regularMarketChangePercent;
      s24.textContent = `${rPct>=0?'+':''}${rPct.toFixed(2)}%`;
      s24.className   = `stat-val ${rPct>=0?'green':'red'}`;
    }

    // ── Extended Hours Card în topbar ─────────────────────
    const extCard    = document.getElementById('extHoursCard');
    const extLabel   = document.getElementById('extHoursLabel');
    const extPrice   = document.getElementById('extHoursPrice');
    const extChange  = document.getElementById('extHoursChange');

    // ── Stats panel extended hours rows ──────────────────
    const preRow     = document.getElementById('statPreRow');
    const postRow    = document.getElementById('statPostRow');
    const extChgRow  = document.getElementById('statExtChgRow');
    const statPre    = document.getElementById('statPre');
    const statPost   = document.getElementById('statPost');
    const statExtChg = document.getElementById('statExtChg');
    const statExtChgLabel = document.getElementById('statExtChgLabel');

    const hasPre  = q.preMarketPrice != null;
    const hasPost = q.postMarketPrice != null;

    // Pre-market rows in stats
    if (preRow)  preRow.style.display  = hasPre  ? 'flex' : 'none';
    if (postRow) postRow.style.display = hasPost ? 'flex' : 'none';

    if (hasPre && statPre) {
      const preChgPct = q.preMarketChangePercent || 0;
      statPre.textContent = `${fmt(q.preMarketPrice)}  ${preChgPct>=0?'+':''}${preChgPct.toFixed(2)}%`;
      statPre.className   = `stat-val ${preChgPct>=0?'yellow':'red'}`;
    }
    if (hasPost && statPost) {
      const postChgPct = q.postMarketChangePercent || 0;
      statPost.textContent = `${fmt(q.postMarketPrice)}  ${postChgPct>=0?'+':''}${postChgPct.toFixed(2)}%`;
      statPost.className   = `stat-val ${postChgPct>=0?'yellow':'red'}`;
    }

    // Cardul vizibil din topbar — arată prețul sesiunii active extended
    // Show Extended Hours Card if there is any pre/post market data
    // Daca suntem in PRE, aratam pre-market. Altfel, daca exista post-market, il aratam pe ala.
    const showPre = q.preMarketPrice != null && (state === 'PRE' || state === 'PREPRE');
    const showPost = q.postMarketPrice != null && !showPre;

    if ((showPre || showPost) && extCard) {
      const ehPrice = showPre  ? q.preMarketPrice  : q.postMarketPrice;
      const ehChg   = showPre  ? q.preMarketChange : q.postMarketChange;
      const ehChgPct= showPre  ? q.preMarketChangePercent : q.postMarketChangePercent;
      const ehLabel = showPre  ? ' PRE-MARKET' : ' AFTER-HOURS';

      extCard.style.display   = 'block';
      extLabel.textContent    = ehLabel;
      extPrice.textContent    = fmt(ehPrice);
      extPrice.style.color    = ehChg >= 0 ? 'var(--green)' : 'var(--red)';
      extChange.textContent   = `${ehChg>=0?'+':''}${fmt(ehChg)} (${ehChg>=0?'+':''}${ehChgPct.toFixed(2)}%)`;
      extChange.style.color   = ehChg >= 0 ? 'var(--green)' : 'var(--red)';

      // Și în extChgRow din stats panel
      if (extChgRow && statExtChg) {
        extChgRow.style.display    = 'flex';
        statExtChgLabel.textContent= showPre ? ' Var. pre-mkt' : ' Var. after-hrs';
        statExtChg.textContent     = `${ehChgPct>=0?'+':''}${ehChgPct.toFixed(2)}%`;
        statExtChg.className       = `stat-val ${ehChgPct>=0?'yellow':'red'}`;
      }
    } else {
      if (extCard) extCard.style.display = 'none';
      if (extChgRow) extChgRow.style.display = 'none';
    }
  }
}

async function updateWatchlistPrices() {
  if (liveUpdateRunning) return;
  liveUpdateRunning = true;
  try {
    const syms  = watchlistData.map(w => w.sym);
    const quotes = await fetchBatchQuotes(syms);
    liveQuotes  = { ...liveQuotes, ...quotes };
    syms.forEach(sym => { if (quotes[sym]) applyQuoteToDOM(sym, quotes[sym]); });
    // Actualizează și simbolul curent dacă nu e în watchlist
    if (!syms.includes(currentSymbol) && currentSymbol) {
      const singleQuotes = await fetchBatchQuotes([currentSymbol]);
      if (singleQuotes[currentSymbol]) applyQuoteToDOM(currentSymbol, singleQuotes[currentSymbol]);
    }
    // Update indicator live în status bar
    const dotEl = document.getElementById('liveUpdateDot');
    if (dotEl) { dotEl.style.opacity='1'; setTimeout(()=>{ dotEl.style.opacity='.3'; }, 400); }
  } catch(e) {
    console.warn('Batch quote fail:', e.message);
  } finally {
    liveUpdateRunning = false;
  }
}

function addToWatchlistCustom() {
  const input = document.getElementById('addWlInput');
  const sym = input ? input.value : null;
  if (!sym) return;
  const symUp = sym.trim().toUpperCase();
  if (watchlistData.find(w => w.sym === symUp)) { alert(`${symUp} există deja în watchlist!`); return; }
  watchlistData.push({sym: symUp, name: symUp});
  saveWatchlist();
  renderWatchlist();
  updateWatchlistPrices();
  if (input) input.value = '';
}

function removeFromWatchlist(sym) {
  watchlistData = watchlistData.filter(w => w.sym !== sym);
  saveWatchlist();
  renderWatchlist();
}

// ════════════════════════════════════════════════════════════
//  MAIN LOAD
// ════════════════════════════════════════════════════════════
async function loadSymbol(symbol, tf) {
  let val = (symbol || document.getElementById('symbolInput').value.trim()).toUpperCase();
  const aliases = {
    'OIL': 'CL=F', 'GOLD': 'GC=F', 'SILVER': 'SI=F', 'NATURAL GAS': 'NG=F',
    'SP500': '^GSPC', 'NASDAQ': '^IXIC', 'DOW': '^DJI',
    'BITCOIN': 'BTC-USD', 'ETHEREUM': 'ETH-USD'
  };
  if (aliases[val]) val = aliases[val];
  currentSymbol = val;
  if (!currentSymbol) return;
  currentTF = tf || currentTF;
  document.getElementById('symbolInput').value = currentSymbol;

  // Pe mobil: trece automat la grafic când selectezi un simbol
  if (window.innerWidth <= 768) {
    switchMobileTab('chart');
  }

  document.getElementById('loadOverlay').style.display = 'flex';
  setLoadText(`Se încarcă ${currentSymbol}…`);

  // Clear DEMO badge if present
  const demoBadge = document.getElementById('demoBadge');
  if (demoBadge) demoBadge.remove();

  try {
    const { raw, meta } = await fetchData(currentSymbol, currentTF);
    
    // Salvează ultimul simbol căutat dacă fetch-ul a avut succes
    localStorage.setItem('tradepro_last_symbol', currentSymbol);
    
    renderAll(raw);
    runAnalysis(raw, meta);
    renderWatchlist();
    document.getElementById('loadOverlay').style.display = 'none';

    // Show DEMO badge if no live data
    if (meta && meta.demo) {
      const badge = document.createElement('div');
      badge.id = 'demoBadge';
      badge.innerHTML = ` DATE DEMO — Proxy Error: ${meta.err || 'Unknown'}`;
      badge.style.cssText = 'position:absolute;top:8px;right:8px;z-index:30;background:rgba(224,168,0,.15);border:1px solid var(--yellow);color:var(--yellow);padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;pointer-events:none;';
      document.getElementById('chartMain').appendChild(badge);
    }
  } catch(e) {
    setLoadText(`❌ ${e.message}`);
    setTimeout(() => document.getElementById('loadOverlay').style.display='none', 4000);
  }
}

// ════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════
function fmt(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1000) return v.toLocaleString('ro-RO', {minimumFractionDigits:2, maximumFractionDigits:2});
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(6);
}
function fmtVol(v) {
  if (!v) return '—';
  if (v>=1e9) return (v/1e9).toFixed(2)+'B';
  if (v>=1e6) return (v/1e6).toFixed(2)+'M';
  if (v>=1e3) return (v/1e3).toFixed(1)+'K';
  return v.toString();
}
function safe(s) { return s.replace(/[^a-z0-9]/gi,''); }

// ════════════════════════════════════════════════════════════
//  TOGGLES
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.ind-btn').forEach(btn => btn.addEventListener('click', () => {
  const ind = btn.dataset.ind;
  indicators[ind] = !indicators[ind];
  btn.classList.toggle('active', indicators[ind]);
  localStorage.setItem('tradeProInds', JSON.stringify(indicators));
  updateChartLegend();
  if (typeof allData !== 'undefined' && allData.length) renderAll(allData);
}));

function updateChartLegend() {
  const leg = document.getElementById('onChartLegend');
  if (!leg) return;
  leg.innerHTML = '';
  
  const colors = {
    'ma': 'var(--yellow)', 'bb': 'var(--purple)', 'vol': 'var(--text2)', 
    'rsi': 'var(--purple)', 'macd': 'var(--accent)', 'ema': 'var(--cyan)',
    'vwap': 'var(--green)', 'smc': 'var(--accent)', 'vpvr': 'var(--text)',
    'forecast': 'var(--orange)', 'wolfe': 'var(--cyan)'
  };
  const labels = {
    'ma': 'MA 50', 'bb': 'Bollinger Bands 20,2', 'vol': 'Volume', 
    'rsi': 'RSI 14', 'macd': 'MACD 12,26,9', 'ema': 'EMA 21',
    'vwap': 'VWAP', 'smc': 'SMC (FVG & BOS)', 'vpvr': 'VPVR Profile',
    'forecast': 'AI Deep Forecast', 'wolfe': 'Wolfe Waves'
  };

  document.querySelectorAll('.ind-btn.active').forEach(btn => {
    const ind = btn.dataset.ind;
    const div = document.createElement('div');
    div.style.cssText = 'pointer-events:auto; font-size:11px; color:var(--text); background:transparent; display:flex; align-items:center; gap:6px;';
    div.innerHTML = `
      <span style="color:${colors[ind]}; font-weight:700;">${labels[ind]}</span>
      <span style="cursor:pointer; opacity:0.6; padding:0 2px;" onclick="document.querySelector('[data-ind=\\'${ind}\\']').click()" title="Hide">✕</span>
    `;
    leg.appendChild(div);
  });
}

// ════════════════════════════════════════════════════════════
//  BIND BUTTONS
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.tf-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tf-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const tf = btn.dataset.tf;
  localStorage.setItem('tradeProTF', tf);
  loadSymbol(currentSymbol, tf);
}));

// Cautare prin Enter pe input (butonul Analizeaza a fost inlocuit cu Enter)
document.getElementById('symbolInput').addEventListener('keydown', e => { if (e.key==='Enter') { closeAllLists(); loadSymbol(); } });

// ════════════════════════════════════════════════════════════
//  FIBONACCI AUTO — ENGINE COMPLET
// ════════════════════════════════════════════════════════════

// Culori per nivel
const FIB_COLORS = {
  '0.0':   '#ef5350',
  '23.6':  '#ff9800',
  '38.2':  '#f0b90b',
  '50.0':  '#9c27b0',
  '61.8':  '#2962ff',   // Golden ratio — cel mai important
  '78.6':  '#00bcd4',
  '100.0': '#089981',
  '127.2': '#e91e63',
  '161.8': '#ff5722',
  '200.0': '#795548',
  '261.8': '#607d8b',
};

const FIB_RATIOS    = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
const FIB_EXT_RATIOS= [1.272, 1.618, 2.0, 2.618];

let fibPriceLines  = [];   // price line references pe candleSeries
let fibVisible     = true;
let fibLookback    = 60;

// ── Detecție automată swing high / swing low ──────────────
function detectSwings(data, lookback) {
  const recent = data.slice(-lookback);
  let hiIdx = 0, loIdx = 0;
  let hi = recent[0].high, lo = recent[0].low;

  // Zigzag simplu: caută pivotul semnificativ, nu doar extremul global
  // Pasul 1: extremele brute
  recent.forEach((d, i) => {
    if (d.high > hi) { hi = d.high; hiIdx = i; }
    if (d.low  < lo) { lo = d.low;  loIdx = i; }
  });

  // Pasul 2: direcția mișcării (highIdx vs lowIdx în timp)
  // Dacă highIdx < lowIdx → prețul a coborât după maxim → retracement descendent
  // Dacă highIdx > lowIdx → prețul a urcat după minim  → retracement ascendent
  const trendUp = hiIdx > loIdx; // high apare DUPĂ low → trend up recent

  return {
    swingHigh: hi,
    swingLow: lo,
    hiIdx, loIdx,
    trendUp,
    range: hi - lo,
  };
}

// ── Calculează niveluri Fibonacci ────────────────────────
function calcFibLevels(swingHigh, swingLow, trendUp) {
  const range = swingHigh - swingLow;
  // Retracement: de la extremul recent spre cel opus
  const levels = FIB_RATIOS.map(r => ({
    ratio: r,
    label: (r * 100).toFixed(1),
    // dacă trend up → retracement coboară de la high spre low
    price: trendUp
      ? swingHigh - r * range
      : swingLow  + r * range,
  }));
  const extensions = FIB_EXT_RATIOS.map(r => ({
    ratio: r,
    label: (r * 100).toFixed(1),
    price: trendUp
      ? swingLow  - (r - 1) * range   // extensie sub low
      : swingHigh + (r - 1) * range,  // extensie deasupra high
  }));
  return { levels, extensions };
}

// ── Desenează price lines pe grafic ──────────────────────
function drawFibLines(levels, extensions, visible) {
  // Șterge liniile vechi
  fibPriceLines.forEach(pl => { try { candleSeries.removePriceLine(pl); } catch(e){} });
  fibPriceLines = [];
  if (!visible) return;

  const allLevels = [
    ...levels.map(l => ({...l, isExt: false})),
    ...extensions.map(l => ({...l, isExt: true})),
  ];

  allLevels.forEach(l => {
    const key    = l.label;
    const color  = FIB_COLORS[key] || (l.isExt ? 'rgba(150,150,150,0.5)' : '#787b86');
    const width  = (l.label === '61.8' || l.label === '38.2') ? 2 : 1;
    try {
      const pl = candleSeries.createPriceLine({
        price:              l.price,
        color:              color,
        lineWidth:          width,
        lineStyle:          l.isExt
                              ? LightweightCharts.LineStyle.Dotted
                              : LightweightCharts.LineStyle.Dashed,
        axisLabelVisible:   true,
        title:              `Fib ${l.label}%${l.isExt ? ' ext' : ''}`,
      });
      fibPriceLines.push(pl);
    } catch(e) { console.warn('PriceLine error:', e.message); }
  });
}

// ── Analiză AI Fibonacci ──────────────────────────────────
function analyzeFibonacci(currentPrice, levels, swingHigh, swingLow, trendUp) {
  const range  = swingHigh - swingLow;
  // Găsește nivelul imediat superior și inferior față de preț curent
  const sorted = [...levels].sort((a,b) => a.price - b.price);
  const below  = sorted.filter(l => l.price <= currentPrice);
  const above  = sorted.filter(l => l.price >  currentPrice);

  const nearBelow = below.length ? below[below.length - 1] : null;
  const nearAbove = above.length ? above[0] : null;

  // Câtă % din range s-a retras
  const retracePct = trendUp
    ? ((swingHigh - currentPrice) / range * 100)
    : ((currentPrice - swingLow)  / range * 100);

  const closestLevel = levels.reduce((best, l) => {
    const d = Math.abs(l.price - currentPrice);
    return d < Math.abs(best.price - currentPrice) ? l : best;
  }, levels[0]);

  const atKey = Math.abs(closestLevel.price - currentPrice) / currentPrice < 0.005; // în ±0.5%

  // Generează recomandare
  let signal = 'neut', icon = '⚖️', title, text, targetBuy, targetSell, stop;

  if (closestLevel.label === '61.8' && atKey) {
    if (trendUp) {
      signal = 'bull'; icon = '';
      title  = 'La Golden Ratio (61.8%) — Suport Major';
      text   = `Prețul testează nivelul Fibonacci 61.8% (${fmt(closestLevel.price)}) — cel mai important suport de retracement. Istoricul arată că trendurile ascendente reiau creșterea de la acest nivel. Probabilitate ridicată de bounce.`;
      targetBuy  = nearAbove ? nearAbove.price : swingHigh;
      stop       = levels.find(l=>l.label==='78.6')?.price || closestLevel.price * 0.99;
      targetSell = swingHigh;
    } else {
      signal = 'bear'; icon = '';
      title  = 'La Golden Ratio (61.8%) — Rezistență Majoră';
      text   = `Prețul testează rezistența Fibonacci 61.8% (${fmt(closestLevel.price)}). Nivel extrem de important. Dacă nu îl depășește, poate urma o corecție.`;
      stop       = closestLevel.price * 1.005;
      targetSell = nearBelow ? nearBelow.price : swingLow;
    }
  } else if (closestLevel.label === '38.2' && atKey) {
    signal = trendUp ? 'bull' : 'bear'; icon = trendUp ? '' : '';
    title  = `La 38.2% — ${trendUp ? 'Suport' : 'Rezistență'} Moderat`;
    text   = `Nivelul 38.2% (${fmt(closestLevel.price)}) este un suport/rezistență moderat în teoria Fibonacci. Retrasul clasic se oprește adesea aici.`;
    targetBuy  = trendUp ? (nearAbove?.price || swingHigh) : undefined;
    targetSell = !trendUp ? (nearBelow?.price || swingLow) : undefined;
    stop       = trendUp ? levels.find(l=>l.label==='50.0')?.price : levels.find(l=>l.label==='23.6')?.price;
  } else if (closestLevel.label === '50.0' && atKey) {
    signal = 'neut'; icon = '';
    title  = 'La 50% — Nivel Pivot Psihologic';
    text   = `Prețul la exact 50% (${fmt(closestLevel.price)}) din mișcarea anterioară. Nivel important psihologic. Fii atent la confirmarea direcției cu volum.`;
  } else if (retracePct < 23.6) {
    signal = trendUp ? 'bull' : 'bear'; icon = trendUp ? '' : '';
    title  = trendUp ? 'Retracement Superficial — Trend Puternic' : 'Extensie Agresivă Bearish';
    text   = `Retrasul de ${retracePct.toFixed(1)}% sub 23.6% indică un trend ${trendUp?'bullish extrem de puternic':'bearish agresiv'}. Piața nu vrea să se corecteze — continuare probabilă.`;
  } else if (retracePct > 78.6) {
    signal = trendUp ? 'bear' : 'bull'; icon = '';
    title  = 'Retracement Adânc (>78.6%) — Pericol Inversare';
    text   = `Retrasul depășește 78.6% (${retracePct.toFixed(1)}%). Un retracement > 100% invalidează structura. Trendurile sănătoase nu retrasează atât de adânc. Risc de inversare.`;
  } else {
    const nearLabel = closestLevel.label;
    title = `Între niveluri Fibonacci (retras ${retracePct.toFixed(1)}%)`;
    text  = `Prețul se află ${nearBelow ? `deasupra Fib ${nearBelow.label}% (${fmt(nearBelow.price)})` : 'sub toate nivelurile'} și ${nearAbove ? `sub Fib ${nearAbove.label}% (${fmt(nearAbove.price)})` : 'deasupra tuturor nivelurilor'}. Urmărește breakout/bounce la nivelul ${nearLabel}%.`;
  }

  return { signal, icon, title, text, targetBuy, targetSell, stop, nearBelow, nearAbove, retracePct, closestLevel, atKey };
}

// ── Randare completă Fibonacci ────────────────────────────
function renderFibonacci(data) {
  if (!data || data.length < 10) return;
  const lb = parseInt(document.getElementById('fibLookback')?.value || 60);
  fibLookback = lb;

  const { swingHigh, swingLow, trendUp, range } = detectSwings(data, lb);
  const { levels, extensions } = calcFibLevels(swingHigh, swingLow, trendUp);
  const currentPrice = data[data.length - 1].close;
  const visible = document.getElementById('fibToggle')?.checked ?? true;

  // Desenează pe grafic
  drawFibLines(levels, extensions, visible);

  // Update swing info
  document.getElementById('fibSwingHigh').textContent = fmt(swingHigh);
  document.getElementById('fibSwingLow').textContent  = fmt(swingLow);
  const ampPct = (range / swingLow * 100).toFixed(2);
  document.getElementById('fibAmplitude').textContent = `${fmt(range)} (${ampPct}%)`;

  // Analiză AI
  const analysis = analyzeFibonacci(currentPrice, levels, swingHigh, swingLow, trendUp);

  // Recommendation box
  const recColor = analysis.signal === 'bull' ? 'var(--green)' : analysis.signal === 'bear' ? 'var(--red)' : 'var(--yellow)';
  const recBorder = analysis.signal === 'bull' ? 'rgba(8,153,129,.3)' : analysis.signal === 'bear' ? 'rgba(242,54,69,.3)' : 'rgba(224,168,0,.3)';
  document.getElementById('fibRecommendation').innerHTML = `
    <div class="fib-rec-header">
      <span class="fib-rec-icon">${analysis.icon}</span>
      <span class="fib-rec-title">${analysis.title}</span>
      <span class="fib-rec-badge ${analysis.signal}">${analysis.signal==='bull'?'BULLISH':analysis.signal==='bear'?'BEARISH':'NEUTRU'}</span>
    </div>
    <div class="fib-rec-text">${analysis.text}</div>
    ${(analysis.targetBuy || analysis.targetSell || analysis.stop) ? `
    <div class="fib-rec-targets" style="margin-top:10px;">
      ${analysis.targetBuy  ? `<div class="fib-rec-target"><div class="label"> Target</div><div class="val" style="color:var(--green)">${fmt(analysis.targetBuy)}</div></div>` : ''}
      ${analysis.stop       ? `<div class="fib-rec-target"><div class="label"> Stop</div><div class="val" style="color:var(--red)">${fmt(analysis.stop)}</div></div>` : ''}
      ${analysis.targetSell ? `<div class="fib-rec-target"><div class="label"> Ieșire</div><div class="val" style="color:var(--red)">${fmt(analysis.targetSell)}</div></div>` : ''}
      <div class="fib-rec-target"><div class="label">Retras</div><div class="val" style="color:var(--yellow)">${analysis.retracePct.toFixed(1)}%</div></div>
    </div>` : ''}
  `;
  document.getElementById('fibRecommendation').style.borderColor = recBorder;

  // Tabel niveluri retracement
  document.getElementById('fibTableBody').innerHTML = levels.map(l => {
    const color   = FIB_COLORS[l.label] || '#787b86';
    const dist    = ((l.price / currentPrice - 1) * 100);
    const isBelow = l.price <= currentPrice;
    const isCur   = Math.abs(l.price - currentPrice) / currentPrice < 0.008;
    const typeLabel = isCur ? 'CUR' : isBelow ? 'SUP' : 'REZ';
    const typeCls   = isCur ? 'cur' : isBelow ? 'sup' : 'res';
    const rowCls    = isCur ? 'current-zone' : '';
    const special   = l.label === '61.8' ? ' ★' : l.label === '38.2' ? ' •' : '';
    return `<tr class="fib-level-row ${rowCls}">
      <td><span class="fib-dot" style="background:${color}"></span><span class="fib-ratio">${l.label}%${special}</span></td>
      <td class="fib-price">${fmt(l.price)}</td>
      <td class="fib-dist" style="color:${dist>=0?'var(--green)':'var(--red)'}">${dist>=0?'+':''}${dist.toFixed(2)}%</td>
      <td><span class="fib-type ${typeCls}">${typeLabel}</span></td>
    </tr>`;
  }).join('');

  // Tabel extensii
  document.getElementById('fibExtBody').innerHTML = extensions.map(l => {
    const color = FIB_COLORS[l.label] || 'rgba(150,150,150,0.8)';
    const dist  = ((l.price / currentPrice - 1) * 100);
    return `<tr>
      <td><span class="fib-dot" style="background:${color}"></span><span class="fib-ratio">${l.label}%</span></td>
      <td class="fib-price">${fmt(l.price)}</td>
      <td class="fib-dist" style="color:${dist>=0?'var(--green)':'var(--red)'}">${dist>=0?'+':''}${dist.toFixed(2)}%</td>
      <td><span style="font-size:10px;color:var(--text2);">EXT</span></td>
    </tr>`;
  }).join('');
}

function onFibToggle() {
  fibVisible = document.getElementById('fibToggle').checked;
  localStorage.setItem('tradeProFib', fibVisible);
  if (allData.length) {
    const lb = parseInt(document.getElementById('fibLookback').value);
    const { swingHigh, swingLow, trendUp } = detectSwings(allData, lb);
    const { levels, extensions } = calcFibLevels(swingHigh, swingLow, trendUp);
    drawFibLines(levels, extensions, fibVisible);
  }
}

function onFibLookbackChange() {
  if (allData.length) renderFibonacci(allData);
}

// ════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════
// ── Live clock ────────────────────────────────────────────
function tickClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const now = new Date();
  const s = getMarketSession();
  el.textContent = `${now.toLocaleTimeString('ro-RO')}  ·  ${s.etStr} ET`;
}
setInterval(tickClock, 1000);

// ── Animație preț la schimbare ────────────────────────────
let lastDisplayedPrice = null;
function animatePrice(newPrice) {
  const el = document.getElementById('curPrice');
  if (!el) return;
  if (lastDisplayedPrice !== null && newPrice !== lastDisplayedPrice) {
    el.classList.remove('price-up','price-dn','countup');
    void el.offsetWidth; // reflow
    el.classList.add(newPrice > lastDisplayedPrice ? 'price-up' : 'price-dn', 'countup');
    setTimeout(() => el.classList.remove('price-up','price-dn'), 1200);
  }
  lastDisplayedPrice = newPrice;
}

function openDeepForecastModal() {
  const inputSym = document.getElementById('symbolInput').value.trim().toUpperCase();
  if (inputSym && inputSym !== currentSymbol) {
    loadSymbol(inputSym).then(() => {
      showDeepForecastPopup();
    });
  } else {
    showDeepForecastPopup();
  }
}

function showDeepForecastPopup() {
  document.getElementById('dfModalTitle').textContent = `Deep Forecast: ${currentSymbol}`;
  document.getElementById('dfModal').style.display = 'flex';
  document.getElementById('dfModalBody').innerHTML = `<div style="text-align:center;padding:60px;color:var(--text2);"><div class="spinner" style="margin:0 auto 20px;"></div><div style="font-size:16px;font-weight:700;">Extrag date instituționale și tipare istorice...</div></div>`;
  
  setTimeout(() => {
    runDeepForecast();
  }, 100);
}

async function runDeepForecast() {
  if (!allData || allData.length < 50) {
     document.getElementById('dfModalBody').innerHTML = `<div style="color:var(--red);text-align:center;font-weight:700;">Date insuficiente pentru o analiză Deep Forecast (minim 50 bare necesare).</div>`;
     return;
  }
  
  const last = allData[allData.length - 1];
  const closes = allData.map(d => d.close);
  
  // Fetch Quote for Earnings + analiza reactiei
  let earningsHtml = `<div style="font-size:11px;color:var(--text2);margin-top:4px;">Date raportare indisponibile</div>`;
  let isEarningsDanger = false;
  try {
     const quoteUrl = PROXIES[0](`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${currentSymbol}`);
     const quoteRes = await fetch(quoteUrl);
     const quoteJson = await quoteRes.json();
     const qData = quoteJson?.quoteResponse?.result?.[0];
     if (qData && qData.earningsTimestamp) {
         const eDate = new Date(qData.earningsTimestamp * 1000);
         const now   = new Date();
         // Fix timezone: compara doar datele calendaristice
         const eDateDay = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());
         const nowDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
         const daysToEarn = Math.round((eDateDay - nowDay) / (1000 * 60 * 60 * 24));

         if (daysToEarn > 0 && daysToEarn <= 14) {
             isEarningsDanger = true;
             earningsHtml = `<div style="font-size:11px;color:var(--red);margin-top:4px;font-weight:800;">[!] Urmeaza EARNINGS in ${daysToEarn} ${daysToEarn === 1 ? 'zi' : 'zile'}! (${eDate.toLocaleDateString('ro-RO')}) - Volatilitate extrema garantata. Nu intra fara stop!</div>`;
         } else if (daysToEarn <= 0 && daysToEarn >= -10) {
             // Earnings tocmai a trecut - analizeaza reactia pretului din datele istorice
             const absDay = Math.abs(daysToEarn);
             let reactionHtml = '';
             const dayLabel = daysToEarn === 0 ? 'AZI' : daysToEarn === -1 ? 'IERI' : `acum ${absDay} zile`;
             
             // Cauta bara din ziua earnings si ziua anterioara din datele noastre
             const eTs = Math.floor(eDate.getTime() / 1000);
             // Gaseste cea mai apropiata bara din allData
             let closestIdx = -1, minDiff = Infinity;
             for (let i = 0; i < allData.length; i++) {
                 const diff = Math.abs(allData[i].time - eTs);
                 if (diff < minDiff) { minDiff = diff; closestIdx = i; }
             }
             
             if (closestIdx > 0 && minDiff < 86400 * 3) {
                 const earningsBar  = allData[closestIdx];
                 const prevBar      = allData[closestIdx - 1];
                 const nextBar      = allData[Math.min(closestIdx + 1, allData.length - 1)];
                 const gapPct       = ((earningsBar.open - prevBar.close) / prevBar.close * 100).toFixed(2);
                 const dayMovePct   = ((earningsBar.close - earningsBar.open) / earningsBar.open * 100).toFixed(2);
                 const afterMovePct = closestIdx + 1 < allData.length ? ((nextBar.close - earningsBar.close) / earningsBar.close * 100).toFixed(2) : null;
                 const gapColor  = parseFloat(gapPct)  >= 0 ? '#00e676' : '#ff1744';
                 const dayColor  = parseFloat(dayMovePct) >= 0 ? '#00e676' : '#ff1744';
                 const aftrColor = afterMovePct && parseFloat(afterMovePct) >= 0 ? '#00e676' : '#ff1744';
                 
                 reactionHtml = `
                   <div style="margin-top:6px;padding:8px;background:rgba(255,255,255,0.04);border-radius:5px;border-left:3px solid var(--yellow);">
                     <div style="font-size:11px;font-weight:800;color:var(--yellow);margin-bottom:6px;">REACTIA PRETULUI LA EARNINGS (${dayLabel}):</div>
                     <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:11px;">
                       <div><span style="color:var(--text2);">Gap dupa raportare:</span><br><span style="font-weight:800;color:${gapColor};">${parseFloat(gapPct)>=0?'+':''}${gapPct}%</span></div>
                       <div><span style="color:var(--text2);">Miscare in ziua raportarii:</span><br><span style="font-weight:800;color:${dayColor};">${parseFloat(dayMovePct)>=0?'+':''}${dayMovePct}%</span></div>
                       ${afterMovePct ? `<div><span style="color:var(--text2);">Ziua urmatoare:</span><br><span style="font-weight:800;color:${aftrColor};">${parseFloat(afterMovePct)>=0?'+':''}${afterMovePct}%</span></div>` : ''}
                     </div>
                     <div style="margin-top:5px;font-size:10px;color:var(--text2);">Pretul inainte: <b>$${prevBar.close.toFixed(2)}</b> | Deschidere dupa: <b>$${earningsBar.open.toFixed(2)}</b> | Inchidere: <b>$${earningsBar.close.toFixed(2)}</b></div>
                   </div>`;
             } else {
                 reactionHtml = `<div style="font-size:10px;color:var(--text2);margin-top:4px;">Datele zilnice pentru aceasta data nu sunt inca disponibile in istoricul incarcat.</div>`;
             }
             earningsHtml = `<div style="font-size:11px;color:var(--yellow);margin-top:4px;font-weight:800;">[!] EARNINGS A TRECUT ${dayLabel} (${eDate.toLocaleDateString('ro-RO')}) - Piata inca proceseaza reactia!</div>${reactionHtml}`;
         } else {
             const nextEarnDate = qData.earningsTimestampStart 
                 ? new Date(qData.earningsTimestampStart * 1000).toLocaleDateString('ro-RO')
                 : eDate.toLocaleDateString('ro-RO');
             earningsHtml = `<div style="font-size:11px;color:var(--text2);margin-top:4px;">Ultimul raport: ${eDate.toLocaleDateString('ro-RO')} | Urmatorul estimat: cca ${nextEarnDate}</div>`;
         }
     }
  } catch(e) { console.error('Earnings fetch err:', e); }
  
  // 1. Market Regime (ATR)
  const lookback = 14;
  let trSum = 0;
  for (let i = allData.length - lookback; i < allData.length; i++) {
     const high = allData[i].high;
     const low = allData[i].low;
     const prevClose = allData[i-1] ? allData[i-1].close : low;
     const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
     trSum += tr;
  }
  const atr = trSum / lookback;
  const atrPct = (atr / last.close) * 100;
  
  let regime = "Normal";
  let regimeColor = "var(--text)";
  if (atrPct > 4) { regime = "Volatilitate Extremă"; regimeColor = "var(--red)"; }
  else if (atrPct < 1) { regime = "Consolidare (Range)"; regimeColor = "var(--yellow)"; }
  else { regime = "Trend Sănătos"; regimeColor = "var(--green)"; }
  
  // 2. Volume Profile
  let volUp = 0, volDn = 0;
  const volLookback = 20;
  for (let i = allData.length - volLookback; i < allData.length; i++) {
     const d = allData[i];
     if (d.close > d.open) volUp += d.volume;
     else volDn += d.volume;
  }
  const volRatio = volUp / (volDn || 1);
  const volAnalysis = volRatio > 1.2 ? "Acumulare Instituțională" : volRatio < 0.8 ? "Distribuție Masivă" : "Flux Neutru";
  const volColor = volRatio > 1.2 ? "var(--green)" : volRatio < 0.8 ? "var(--red)" : "var(--yellow)";
  
  // 3. Multi-Timeframe Confluence (Simulated via SMA50 vs SMA200)
  const sma50Data = sma(allData, 50);
  const sma200Data = sma(allData, 200);
  const sma50 = sma50Data.length ? sma50Data[sma50Data.length-1].value : last.close;
  const sma200 = sma200Data.length ? sma200Data[sma200Data.length-1].value : last.close;
  const confluence = last.close > sma50 && sma50 > sma200 ? "BULLISH PUTERNIC (Breakout)" : last.close < sma50 && sma50 < sma200 ? "BEARISH PUTERNIC (Downtrend)" : "PULLBACK / HAOS";
  const confColor = confluence.includes("BULLISH") ? "var(--green)" : confluence.includes("BEARISH") ? "var(--red)" : "var(--yellow)";
  
  // 4. Mathematical Targets (ATR + Momentum based)
  const isBull = confluence.includes("BULLISH") || volRatio > 1;
  const stopLoss = isBull ? last.close - (atr * 1.5) : last.close + (atr * 1.5);
  const target1 = isBull ? last.close + (atr * 2) : last.close - (atr * 2);
  const target2 = isBull ? last.close + (atr * 4) : last.close - (atr * 4);
  const winRate = Math.max(10, Math.min(95, Math.round(50 + (volRatio > 1 ? 15 : -15) + (last.close > sma50 ? 10 : -10) + (atrPct < 2 ? 10 : -5))));
  
  const newsSc = (latestSignalData && latestSignalData.reasons && latestSignalData.reasons.some(r => r.toLowerCase().includes('știri'))) ? "Știri Active Detectate" : "Nu sunt știri de impact";

  // --- SWING HIGHS / LOWS (MARKET STRUCTURE ZONES) ---
  const { swingHigh, swingLow } = detectSwings(allData, 30);
  const sh = typeof swingHigh === 'number' ? swingHigh : last.close * 1.1;
  const sl = typeof swingLow === 'number' ? swingLow : last.close * 0.9;
  const distToRes = ((sh / last.close) - 1) * 100;
  const distToSup = ((sl / last.close) - 1) * 100;

  // --- FRACTAL PATTERN MATCHER ---
  const FRACTAL_LEN = 14;
  const FORECAST_LEN = 10;
  let matchesHtml = `<div style="color:var(--text2);font-size:12px;">Nu s-au putut extrage tipare istorice...</div>`;
  let topMatches = [];
  let currentSlice = [];
  
  if (allData.length > FRACTAL_LEN + FORECAST_LEN * 2) {
      currentSlice = allData.slice(-FRACTAL_LEN);
      const currentBase = currentSlice[0].close;
      const currentNorm = currentSlice.map(d => d.close / currentBase);
      const currentMom = (currentSlice[FRACTAL_LEN-1].close / currentBase) - 1;
      
      let matches = [];
      // Nu verificăm chiar ultimele zile (pentru a evita să ne matchuim cu noi înșine)
      for (let i = 0; i < allData.length - FRACTAL_LEN - FORECAST_LEN - Math.max(10, FRACTAL_LEN); i++) {
         const histSlice = allData.slice(i, i + FRACTAL_LEN);
         const histBase = histSlice[0].close;
         const histNorm = histSlice.map(d => d.close / histBase);
         const histMom = (histSlice[FRACTAL_LEN-1].close / histBase) - 1;
         
         if (Math.sign(currentMom) !== Math.sign(histMom)) continue;
         if (Math.abs(currentMom) > 0.03 && Math.abs(histMom) < Math.abs(currentMom) * 0.3) continue;
         
         let error = 0;
         for (let j = 0; j < FRACTAL_LEN; j++) {
            error += Math.abs(currentNorm[j] - histNorm[j]);
         }
         
         const afterSlice = allData.slice(i + FRACTAL_LEN, i + FRACTAL_LEN + FORECAST_LEN);
         const resultBase = histSlice[FRACTAL_LEN-1].close;
         const resultFinal = afterSlice[afterSlice.length-1].close;
         const resultPct = ((resultFinal / resultBase) - 1) * 100;
         const resultMaxDrawdown = Math.min(...afterSlice.map(d => d.low)) / resultBase - 1;
         const resultMaxRunup = Math.max(...afterSlice.map(d => d.high)) / resultBase - 1;
         
         matches.push({
             dateStr: new Date(histSlice[0].time * 1000).toLocaleDateString('ro-RO', {month:'short', year:'numeric'}),
             error, resultPct, resultMaxRunup: resultMaxRunup * 100, resultMaxDrawdown: resultMaxDrawdown * 100,
             afterSlice, basePrice: resultBase
         });
      }
      
      matches.sort((a,b) => a.error - b.error);
      topMatches = matches.slice(0, 3);
      
      if (topMatches.length > 0) {
          matchesHtml = topMatches.map((m, idx) => `
             <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:6px;margin-bottom:8px;">
               <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                 <span style="font-weight:700;font-size:13px;color:var(--text);">[Match #${idx+1}]: <span style="color:var(--accent);">${m.dateStr}</span></span>
                 <span style="font-size:12px;color:${m.resultPct > 0 ? 'var(--green)' : 'var(--red)'};font-weight:800;">${m.resultPct > 0 ? 'A urcat cu' : 'A picat cu'} ${Math.abs(m.resultPct).toFixed(1)}%</span>
               </div>
               <div style="font-size:11px;color:var(--text2);">
                 În următoarele ${FORECAST_LEN} perioade, piața s-a comportat astfel: <br>
                 <span style="color:var(--green)">Max Spike: +${m.resultMaxRunup.toFixed(1)}%</span> | 
                 <span style="color:var(--red)">Max Cădere: ${m.resultMaxDrawdown.toFixed(1)}%</span>
               </div>
             </div>
          `).join('');
      } else {
          matchesHtml = `<div style="color:var(--text2);font-size:12px;">Prețul actual face mișcări neexplorate. Nu există tipare similare recente.</div>`;
      }
  }

  let html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <div style="background:var(--bg3);padding:16px;border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;">Regim Piață (ATR)</div>
        <div style="font-size:18px;font-weight:800;color:${regimeColor};margin-top:4px;">${regime}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px;">Volatilitate zilnică: ${atrPct.toFixed(2)}%</div>
      </div>
      <div style="background:var(--bg3);padding:16px;border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;">Ziduri / Structură (Support/Resistance)</div>
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-top:4px;">Rezistență: <span style="color:var(--red)">${fmt(sh)} (${distToRes.toFixed(1)}%)</span></div>
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-top:2px;">Suport: <span style="color:var(--green)">${fmt(sl)} (${distToSup.toFixed(1)}%)</span></div>
      </div>
      <div style="background:var(--bg3);padding:16px;border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;">Trend Strategic</div>
        <div style="font-size:18px;font-weight:800;color:${confColor};margin-top:4px;">${confluence}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px;">SMA50: ${fmt(sma50)} | SMA200: ${fmt(sma200)}</div>
      </div>
      <div style="background:var(--bg3);padding:16px;border-radius:8px;border:1px solid var(--border);position:relative;">
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;">Evenimente (Raportări / Știri)</div>
        <div style="font-size:15px;font-weight:800;color:${newsSc.includes('Active')?'var(--accent)':'var(--text)'};margin-top:4px;">${newsSc}</div>
        ${earningsHtml}
      </div>
    </div>
    
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.1);padding:16px;border-radius:8px;margin-bottom:24px;">
      <h3 style="margin:0 0 12px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text);">[ISTORIC] Dovezi Istorice (Fractal Pattern Match)</h3>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Algoritmul a scanat mii de bare și a găsit dățile trecute când graficul arăta exact ca acum:</div>
      ${matchesHtml}
      
      <div style="margin-top:16px;">
         <div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">PROIECTIE VIZUALA - Scenarii din Trecut suprapuse pe Pretul Actual</div>
         <canvas id="dfCanvas" style="display:block;border-radius:6px;"></canvas>
      </div>
      
      <div style="margin-top:16px;">
         <div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">DISTRIBUTIA REZULTATELOR ISTORICE (%)</div>
         <canvas id="dfBarCanvas" style="display:block;border-radius:6px;"></canvas>
      </div>
    </div>
    
    <div style="background:linear-gradient(to right, ${isBull ? 'rgba(8,153,129,0.1)' : 'rgba(242,54,69,0.1)'}, rgba(0,0,0,0));border-left:4px solid ${isBull ? 'var(--green)' : 'var(--red)'};padding:16px;border-radius:4px;margin-bottom:20px;">
      <h3 style="margin:0 0 12px 0;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--text);">[PLAN] Foaie de Parcurs (${isBull ? 'CUMPĂRĂ' : 'VINDE'})</h3>
      <div style="display:flex;justify-content:space-between;align-items:center;">
         <div style="text-align:center;">
           <div style="color:var(--text2);font-size:11px;">Intrare / Preț Curent</div>
           <div style="font-size:20px;font-weight:800;">${fmt(last.close)}</div>
         </div>
         <div style="text-align:center;">
           <div style="color:var(--red);font-size:11px;">Stop-Loss (Protecție)</div>
           <div style="font-size:20px;font-weight:800;color:var(--red);">${fmt(stopLoss)}</div>
         </div>
         <div style="text-align:center;">
           <div style="color:var(--green);font-size:11px;">Take-Profit 1 (Zid)</div>
           <div style="font-size:20px;font-weight:800;color:var(--green);">${fmt(isBull ? sh : sl)}</div>
         </div>
         <div style="text-align:center;">
           <div style="color:var(--green);font-size:11px;">Take-Profit 2 (Extensie)</div>
           <div style="font-size:20px;font-weight:800;color:var(--green);">${fmt(target2)}</div>
         </div>
      </div>
      <div style="margin-top:16px;border-top:1px dashed rgba(255,255,255,0.1);padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:var(--text2);">Șanse matematice de succes (Piață${isEarningsDanger?' - Penalizare Earnings!':''}):</span>
        <span style="font-size:18px;font-weight:900;color:${isEarningsDanger ? 'var(--red)' : winRate > 60 ? 'var(--green)' : winRate < 40 ? 'var(--red)' : 'var(--yellow)'};">${isEarningsDanger ? 'NECALCULABIL (HAOS)' : winRate + '%'}</span>
      </div>
    </div>
  `;
  document.getElementById('dfModalBody').innerHTML = html;
  
  if (topMatches.length > 0) {
      setTimeout(() => {
          drawForecastChart(currentSlice, topMatches, target1, stopLoss, isBull);
          drawBarChart(topMatches, isBull);
      }, 150);
  }
}

function drawBarChart(topMatches, isBull) {
  const canvas = document.getElementById('dfBarCanvas');
  if (!canvas || !topMatches.length) return;

  const W = 660, H = 100;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, W, H);

  const barH   = 22;
  const gap    = 10;
  const labelW = 90;
  const maxVal = Math.max(...topMatches.map(m => Math.abs(m.resultPct || 0)), 1);

  topMatches.forEach((m, i) => {
    const pct   = m.resultPct || 0;
    const y     = 10 + i * (barH + gap);
    const barW  = Math.abs(pct) / maxVal * (W - labelW - 60);
    const color = pct >= 0 ? '#00e676' : '#ff1744';

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Match #${i+1}`, labelW - 6, y + barH - 7);

    // Bar
    ctx.fillStyle = color + '99';
    ctx.fillRect(labelW, y, barW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(labelW, y, 3, barH);

    // Valoare
    ctx.fillStyle = color;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, labelW + barW + 6, y + barH - 7);
  });

  // Linie verticala la 0
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(labelW, 5);
  ctx.lineTo(labelW, H - 5);
  ctx.stroke();
}

function drawForecastChart(currentSlice, topMatches, target1, stopLoss, isBull) {
  const canvas = document.getElementById('dfCanvas');
  if (!canvas || !topMatches[0]?.afterSlice?.length) return;

  // Reset
  document.querySelectorAll('.ind-btn').forEach(b => {
    const ind = b.dataset.ind;
    // Turn off most by default so chart isn't cluttered
    if (['vol'].includes(ind)) {
      b.classList.add('active'); indicators[ind] = true;
    } else {
      b.classList.remove('active'); indicators[ind] = false;
    }
  });
  localStorage.setItem('tradeProInds', JSON.stringify(indicators));
  updateChartLegend();

  // Dimensiuni fixe - nu depinde de layout
  const W = 660, H = 240;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const PAD = { top: 28, right: 58, bottom: 28, left: 8 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const FRACTAL_LEN  = currentSlice.length;
  const FORECAST_LEN = topMatches[0].afterSlice.length;
  const totalLen     = FRACTAL_LEN + FORECAST_LEN;
  const currentPrice = currentSlice[currentSlice.length - 1].close;

  const projectedPaths = topMatches.map(m => {
    const base = m.basePrice || m.afterSlice[0].close;
    return m.afterSlice.map(d => currentPrice * (d.close / base));
  });

  let allPrices = currentSlice.map(d => d.close);
  projectedPaths.forEach(p => allPrices.push(...p));
  allPrices.push(target1, stopLoss);

  const minP  = Math.min(...allPrices);
  const maxP  = Math.max(...allPrices);
  const range = maxP - minP || 1;
  const yMin  = minP - range * 0.1;
  const yMax  = maxP + range * 0.1;

  const gX = i     => PAD.left + (i / (totalLen - 1)) * cw;
  const gY = price => PAD.top  + (1 - (price - yMin) / (yMax - yMin)) * ch;

  // --- BG ---
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(0, 0, W, H);

  // --- GRID ---
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    const price = yMax - ((yMax - yMin) / 4) * i;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(price.toFixed(2), W - PAD.right + 4, y + 3);
  }

  // --- Linie ACUM ---
  const nowX = gX(FRACTAL_LEN - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(nowX, PAD.top); ctx.lineTo(nowX, PAD.top + ch); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = 'bold 9px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ACUM', nowX, PAD.top - 10);

  // --- Zona viitor ---
  ctx.fillStyle = 'rgba(41,98,255,0.04)';
  ctx.fillRect(nowX, PAD.top, (W - PAD.right) - nowX, ch);

  // --- SL & TP ---
  const slY = gY(stopLoss);
  ctx.strokeStyle = 'rgba(242,54,69,0.6)';
  ctx.setLineDash([5, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD.left, slY); ctx.lineTo(W - PAD.right, slY); ctx.stroke();
  ctx.fillStyle = '#f23645'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'left';
  ctx.fillText('SL', W - PAD.right + 3, slY + 3);

  const tpY = gY(target1);
  ctx.strokeStyle = 'rgba(8,153,129,0.6)';
  ctx.beginPath(); ctx.moveTo(PAD.left, tpY); ctx.lineTo(W - PAD.right, tpY); ctx.stroke();
  ctx.fillStyle = '#089981';
  ctx.fillText('TP1', W - PAD.right + 3, tpY + 3);
  ctx.setLineDash([]);

  // --- Ghost Lines ---
  const ghostCols = ['rgba(255,200,50,0.6)', 'rgba(80,180,255,0.6)', 'rgba(255,110,180,0.6)'];
  projectedPaths.forEach((path, gi) => {
    ctx.beginPath();
    ctx.strokeStyle = ghostCols[gi % ghostCols.length];
    ctx.lineWidth = 1.5;
    ctx.moveTo(nowX, gY(currentPrice));
    path.forEach((p, i) => ctx.lineTo(gX(FRACTAL_LEN + i), gY(p)));
    ctx.stroke();
    // dot final
    const lp = path[path.length - 1];
    ctx.beginPath();
    ctx.arc(gX(totalLen - 1), gY(lp), 3, 0, Math.PI * 2);
    ctx.fillStyle = ghostCols[gi % ghostCols.length];
    ctx.fill();
  });

  // --- Consens ---
  ctx.beginPath();
  ctx.strokeStyle = isBull ? '#00e676' : '#ff1744';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 8;
  ctx.shadowColor = isBull ? '#00e676' : '#ff1744';
  ctx.moveTo(nowX, gY(currentPrice));
  for (let i = 0; i < FORECAST_LEN; i++) {
    const avg = projectedPaths.reduce((s, p) => s + (p[i] || 0), 0) / projectedPaths.length;
    ctx.lineTo(gX(FRACTAL_LEN + i), gY(avg));
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // --- Linia curenta (albastra) ---
  ctx.beginPath();
  ctx.strokeStyle = '#2962ff';
  ctx.lineWidth = 2;
  currentSlice.forEach((d, i) => {
    if (i === 0) ctx.moveTo(gX(i), gY(d.close));
    else ctx.lineTo(gX(i), gY(d.close));
  });
  ctx.stroke();

  // Dot ACUM
  ctx.beginPath();
  ctx.arc(nowX, gY(currentPrice), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#2962ff'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

  // Label pret curent
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'left';
  ctx.fillText(currentPrice.toFixed(2), W - PAD.right + 3, gY(currentPrice) + 4);

  // Legenda
  const L = PAD.left;
  const LY = H - 10;
  const drawLegend = (x, color, label) => {
    ctx.fillStyle = color; ctx.fillRect(x, LY - 2, 16, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '9px Arial'; ctx.textAlign = 'left';
    ctx.fillText(label, x + 20, LY + 1);
  };
  drawLegend(L,       '#2962ff',   'Pret curent');
  drawLegend(L + 88,  ghostCols[0],'Scenarii istorice');
  drawLegend(L + 198, isBull ? '#00e676' : '#ff1744', 'Consens');
}

// ── AUTOCOMPLETE ENGINE ─────────────────────────────────
function setupAutocomplete(inputId, onSelectCallback) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let debounceTimer;

  input.addEventListener("input", function(e) {
    const val = this.value;
    closeAllLists();
    if (!val) return false;
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const url = PROXIES[0](`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(val)}&quotesCount=5&newsCount=0`);
        const res = await fetch(url);
        const data = await res.json();
        const quotes = data.quotes || [];
        
        if (quotes.length === 0) return;
        
        const a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);
        
        quotes.forEach(q => {
          const b = document.createElement("DIV");
          b.innerHTML = `<span class="autocomplete-symbol">${q.symbol}</span>`;
          b.innerHTML += `<span class="autocomplete-name">${q.shortname || q.longname || q.exchange || ''}</span>`;
          b.innerHTML += `<input type="hidden" value="${q.symbol}">`;
          b.addEventListener("click", function(e) {
              input.value = this.getElementsByTagName("input")[0].value;
              closeAllLists();
              if (onSelectCallback) onSelectCallback();
          });
          a.appendChild(b);
        });
      } catch(e) { console.error("Autocomplete err:", e); }
    }, 300);
  });

  input.addEventListener("keydown", function(e) {
      if (e.key === 'Enter') {
          e.preventDefault();
          closeAllLists();
          if (onSelectCallback) onSelectCallback();
      }
  });

  function closeAllLists(elmnt) {
    var x = document.getElementsByClassName("autocomplete-items");
    for (var i = x.length - 1; i >= 0; i--) {
      if (elmnt != x[i] && elmnt != input) {
        x[i].parentNode.removeChild(x[i]);
      }
    }
  }

  document.addEventListener("click", function (e) {
      closeAllLists(e.target);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  updateChartLegend();
  showMarketStatus();
  tickClock();
  renderWatchlist();
  
  // Curăță orice simbol implicit greșit din sesiunile vechi
  if (localStorage.getItem('tradepro_last_symbol') === 'AAPL') {
    localStorage.removeItem('tradepro_last_symbol');
  }
  
  // Inițializare Autocomplete
  setupAutocomplete('symbolInput', () => loadSymbol());
  setupAutocomplete('addWlInput', () => addToWatchlistCustom());
  
  let lastSym = localStorage.getItem('tradepro_last_symbol');
  if (!lastSym) {
      const wl = loadWatchlist();
      // Ia primul simbol din watchlist-ul UTILIZATORULUI, nu default
      const userSyms = wl.filter(s => !['AAPL','TSLA','NVDA','AMZN','MSFT','BTC-USD','ETH-USD','GC=F','CL=F','EURUSD=X','SPY','QQQ'].includes(s.sym));
      lastSym = userSyms.length > 0 ? userSyms[0].sym : wl[0]?.sym || 'TSLA';
  }
  
  // Seteaza UI-ul conform starii salvate
  document.querySelectorAll('.tf-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tf === currentTF);
  });
  document.querySelectorAll('.ind-btn').forEach(b => {
    b.classList.toggle('active', !!indicators[b.dataset.ind]);
  });
  const fibSaved = localStorage.getItem('tradeProFib');
  if (fibSaved !== null) {
    const isFib = fibSaved === 'true';
    fibVisible = isFib;
    const fibToggleEl = document.getElementById('fibToggle');
    if(fibToggleEl) fibToggleEl.checked = isFib;
  }
  
  loadSymbol(lastSym, currentTF);

  // Prima actualizare la 2s după load
  setTimeout(updateWatchlistPrices, 2000);

  // ── LIVE: batch update la fiecare 10 secunde ──────────
  setInterval(updateWatchlistPrices, 10000);

  // ── Status piată la fiecare 30s ───────────────────────
  // (deja setat via setInterval mai sus)
});
