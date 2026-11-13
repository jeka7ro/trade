/* ═══════════════════════════════════════════════════════════════════════════
   APP CONTROLLER — TRADEPRO ULTRA (TRADINGVIEW SUPERCHARTS CLONE)
   Multi-Chart · Bar Replay · Smart Signals · Live Screener · Paper Trading
═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (window.__tradeProAppInitialized) return;
  window.__tradeProAppInitialized = true;

  const Q = window.QuantEngine;

  // ─── VECTOR SVG ICON SYSTEM (ZERO EMOJIS) ─────────────────────────────────
  const ICO = {
    sun: '<svg class="tv-ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    moon: '<svg class="tv-ico" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    play: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg class="tv-ico sm" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/></svg>',
    close: '<svg class="tv-ico sm" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    check: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    plus: '<svg class="tv-ico sm" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    bolt: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    chart: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>',
    chevUp: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>',
    chevDn: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
    bell: '<svg class="tv-ico sm" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    preSun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2.5M12 19v2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M2.5 12H5M19 12h2.5M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
    postMoon: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.6 14.4A8.5 8.5 0 0 1 9.6 3.4a8.5 8.5 0 1 0 11 11z"/></svg>',
    grip: '<svg viewBox="0 0 8 14" fill="currentColor" stroke="none"><circle cx="2" cy="2.5" r="1.15"/><circle cx="6" cy="2.5" r="1.15"/><circle cx="2" cy="7" r="1.15"/><circle cx="6" cy="7" r="1.15"/><circle cx="2" cy="11.5" r="1.15"/><circle cx="6" cy="11.5" r="1.15"/></svg>',
    trash: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
  };

  // ─── 1. PROXY & ENDPOINT CONFIGURATION ────────────────────────────────────
  const IS_LOCAL = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(window.location.hostname);
  const PROXY_ENDPOINTS = IS_LOCAL
    ? ['/proxy?url=', 'http://localhost:9030/proxy?url=']
    : ['/.netlify/functions/proxy?url='];

  async function fetchViaProxy(targetUrl, timeoutMs = 9500) {
    let lastErr = null;
    for (const base of PROXY_ENDPOINTS) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(base + encodeURIComponent(targetUrl), {
          signal: ctrl.signal,
          cache: 'no-store'
        });
        clearTimeout(tid);
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
        const txt = await res.text();
        if (!txt || txt.trim().startsWith('<')) continue;
        return JSON.parse(txt);
      } catch (e) {
        clearTimeout(tid);
        lastErr = e;
      }
    }
    throw lastErr || new Error('Proxy indisponibil');
  }

  // ─── 2. APPLICATION STATE & CATALOGS ──────────────────────────────────────
  const DEFAULT_WATCHLIST = [
    { sym: 'NQ=F', name: 'NASDAQ 100 Live (US100)' },
    { sym: 'ES=F', name: 'S&P 500 Live (US500)' },
    { sym: 'BTC-USD', name: 'Bitcoin USD' },
    { sym: 'EGLD-USD', name: 'MultiversX (EGLD)' },
    { sym: 'ETH-USD', name: 'Ethereum USD' },
    { sym: 'TSLA', name: 'Tesla, Inc.' },
    { sym: 'APPS', name: 'Digital Turbine, Inc.' },
    { sym: 'ONDS', name: 'Ondas Inc.' },
    { sym: 'NVDA', name: 'NVIDIA Corporation' },
    { sym: 'LULU', name: 'Lululemon Athletica' },
    { sym: 'GME', name: 'GameStop Corp.' },
    { sym: 'MSFT', name: 'Microsoft Corp.' },
    { sym: 'ORCL', name: 'Oracle Corporation' },
    { sym: 'AAPL', name: 'Apple Inc.' },
    { sym: 'EURUSD=X', name: 'EUR / USD' },
    { sym: 'CL=F', name: 'Crude Oil WTI' },
    { sym: 'GC=F', name: 'Gold Futures' },
    { sym: 'NIO', name: 'NIO Inc.' },
    { sym: 'PYPL', name: 'PayPal Holdings, Inc.' },
    { sym: 'TRX-USD', name: 'TRON USD' },
    { sym: 'SPY', name: 'SPDR S&P 500 ETF' },
    { sym: 'QQQ', name: 'Invesco QQQ ETF' },
    { sym: 'TLT', name: 'iShares 20+ Yr Treasury Bond ETF' }
  ];

  const SCREENER_UNIVERSE = [
    'NVDA', 'APPS', 'ONDS', 'TSLA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'AMD',
    'AVGO', 'PLTR', 'CRWD', 'NFLX', 'COIN', 'RKLB', 'SOFI', 'HOOD', 'SMCI', 'ARM',
    'SPY', 'QQQ', 'VOO', 'IWM', 'SMH', 'ARKK', 'GLD',
    'TLT', 'IEF', 'HYG', 'LQD',
    'BTC-USD', 'ETH-USD', 'SOL-USD', 'GC=F', 'CL=F'
  ];

  const SYMBOL_CATALOG = [
    // US Stocks
    { sym: 'NVDA', name: 'NVIDIA Corporation', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'APPS', name: 'Digital Turbine, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'ONDS', name: 'Ondas Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'TSLA', name: 'Tesla, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'AAPL', name: 'Apple Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'MSFT', name: 'Microsoft Corporation', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'META', name: 'Meta Platforms, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'AMZN', name: 'Amazon.com, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'GOOGL', name: 'Alphabet Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'AMD', name: 'Advanced Micro Devices, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'PLTR', name: 'Palantir Technologies Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'AVGO', name: 'Broadcom Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'COIN', name: 'Coinbase Global, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'NFLX', name: 'Netflix, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'CRWD', name: 'CrowdStrike Holdings, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'UBER', name: 'Uber Technologies, Inc.', exch: 'NYSE', cat: 'stocks' },
    { sym: 'SHOP', name: 'Shopify Inc.', exch: 'NYSE', cat: 'stocks' },
    { sym: 'RKLB', name: 'Rocket Lab USA, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'ASTS', name: 'AST SpaceMobile, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'IONQ', name: 'IonQ, Inc.', exch: 'NYSE', cat: 'stocks' },
    { sym: 'SOFI', name: 'SoFi Technologies, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'HOOD', name: 'Robinhood Markets, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'MSTR', name: 'MicroStrategy Incorporated', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'SMCI', name: 'Super Micro Computer, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'ARM', name: 'Arm Holdings plc', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'MU', name: 'Micron Technology, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'PANW', name: 'Palo Alto Networks, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'SNOW', name: 'Snowflake Inc.', exch: 'NYSE', cat: 'stocks' },
    { sym: 'JPM', name: 'JPMorgan Chase & Co.', exch: 'NYSE', cat: 'stocks' },
    { sym: 'LLY', name: 'Eli Lilly and Company', exch: 'NYSE', cat: 'stocks' },
    { sym: 'LULU', name: 'Lululemon Athletica Inc.', exch: 'NASDAQ', cat: 'stocks' },
    { sym: 'GME', name: 'GameStop Corp.', exch: 'NYSE', cat: 'stocks' },
    { sym: 'ORCL', name: 'Oracle Corporation', exch: 'NYSE', cat: 'stocks' },
    { sym: 'NIO', name: 'NIO Inc.', exch: 'NYSE', cat: 'stocks' },
    { sym: 'PYPL', name: 'PayPal Holdings, Inc.', exch: 'NASDAQ', cat: 'stocks' },
    // ETFs
    { sym: 'SPY', name: 'SPDR S&P 500 ETF Trust', exch: 'NYSE ARCA', cat: 'etf' },
    { sym: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq 100)', exch: 'NASDAQ', cat: 'etf' },
    { sym: 'VOO', name: 'Vanguard S&P 500 ETF', exch: 'NYSE ARCA', cat: 'etf' },
    { sym: 'IWM', name: 'iShares Russell 2000 ETF', exch: 'NYSE ARCA', cat: 'etf' },
    { sym: 'SMH', name: 'VanEck Semiconductor ETF', exch: 'NASDAQ', cat: 'etf' },
    { sym: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X', exch: 'NYSE ARCA', cat: 'etf' },
    { sym: 'TQQQ', name: 'ProShares UltraPro QQQ 3X', exch: 'NASDAQ', cat: 'etf' },
    { sym: 'ARKK', name: 'ARK Innovation ETF', exch: 'NYSE ARCA', cat: 'etf' },
    { sym: 'GLD', name: 'SPDR Gold Shares ETF', exch: 'NYSE ARCA', cat: 'etf' },
    { sym: 'IBIT', name: 'iShares Bitcoin Trust ETF', exch: 'NASDAQ', cat: 'etf' },
    // Bonds & Treasury ETFs / Yields
    { sym: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', exch: 'NASDAQ', cat: 'bonds' },
    { sym: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF', exch: 'NASDAQ', cat: 'bonds' },
    { sym: 'SHY', name: 'iShares 1-3 Year Treasury Bond ETF', exch: 'NASDAQ', cat: 'bonds' },
    { sym: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', exch: 'NYSE ARCA', cat: 'bonds' },
    { sym: 'LQD', name: 'iShares iBoxx Investment Grade Corp Bond ETF', exch: 'NYSE ARCA', cat: 'bonds' },
    { sym: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF', exch: 'NYSE ARCA', cat: 'bonds' },
    { sym: '^TNX', name: 'US 10-Year Treasury Note Yield', exch: 'CBOE', cat: 'bonds' },
    // Crypto
    { sym: 'BTC-USD', name: 'Bitcoin / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    { sym: 'ETH-USD', name: 'Ethereum / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    { sym: 'SOL-USD', name: 'Solana / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    { sym: 'XRP-USD', name: 'XRP / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    { sym: 'DOGE-USD', name: 'Dogecoin / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    { sym: 'ADA-USD', name: 'Cardano / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    { sym: 'EGLD-USD', name: 'MultiversX (EGLD) / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    { sym: 'TRX-USD', name: 'TRON / US Dollar', exch: 'CRYPTO', cat: 'crypto' },
    // Commodities / Futures
    { sym: 'NQ=F', name: 'NASDAQ 100 E-Mini Futures (US100 Live)', exch: 'CME', cat: 'futures' },
    { sym: 'ES=F', name: 'S&P 500 E-Mini Futures (US500 Live)', exch: 'CME', cat: 'futures' },
    { sym: 'YM=F', name: 'Dow 30 E-Mini Futures (US30 Live)', exch: 'CBOT', cat: 'futures' },
    { sym: 'GC=F', name: 'Aur Futures (Gold COMEX)', exch: 'COMEX', cat: 'futures' },
    { sym: 'SI=F', name: 'Argint Futures (Silver COMEX)', exch: 'COMEX', cat: 'futures' },
    { sym: 'CL=F', name: 'Petrol WTI Crude Oil Futures', exch: 'NYMEX', cat: 'futures' },
    { sym: 'NG=F', name: 'Gaze Naturale Futures', exch: 'NYMEX', cat: 'futures' },
    { sym: 'HG=F', name: 'Cupru Futures (Copper)', exch: 'COMEX', cat: 'futures' },
    // Forex
    { sym: 'EURUSD=X', name: 'Euro / US Dollar', exch: 'FOREX', cat: 'forex' },
    { sym: 'GBPUSD=X', name: 'British Pound / US Dollar', exch: 'FOREX', cat: 'forex' },
    { sym: 'USDJPY=X', name: 'US Dollar / Japanese Yen', exch: 'FOREX', cat: 'forex' },
    { sym: 'EURRON=X', name: 'Euro / Leu Românesc', exch: 'FOREX', cat: 'forex' },
    // Indices
    { sym: '^NDX', name: 'NASDAQ 100 Index', exch: 'NASDAQ', cat: 'indices' },
    { sym: '^GSPC', name: 'S&P 500 Index', exch: 'INDEX', cat: 'indices' },
    { sym: '^IXIC', name: 'NASDAQ Composite Index', exch: 'INDEX', cat: 'indices' },
    { sym: '^DJI', name: 'Dow Jones Industrial Average', exch: 'INDEX', cat: 'indices' },
    { sym: '^RUT', name: 'Russell 2000 Index', exch: 'INDEX', cat: 'indices' },
    { sym: '^VIX', name: 'CBOE Volatility Index (VIX)', exch: 'CBOE', cat: 'indices' }
  ];

  const INDICATOR_DEFS = [
    { key: 'smartSignals', name: 'Ultra Smart Buy/Sell Signals + R:R Plan', cat: 'Strategie AI', color: '#10b981', desc: 'Semnale instituționale multi-confluență + Stop-Loss & Take-Profit automat + Backtest' },
    { key: 'supertrend', name: 'SuperTrend (ATR 10, 3.0)', cat: 'Trend', color: '#34d399', desc: 'Filtru dinamic de regim Bullish / Bearish și trailing stop instituțional' },
    { key: 'emaRibbon', name: 'EMA Ribbon (9 / 21 / 50 / 200)', cat: 'Trend', color: '#0a84ff', desc: 'Mediile exponențiale cheie folosite de traderii instituționali' },
    { key: 'smc', name: 'SMC: Order Blocks · FVG · BOS / CHoCH', cat: 'Instituțional', color: '#3b82f6', desc: 'Structura pieței Smart Money: blocuri de ordine, goluri de lichiditate și rupturi de structură' },
    { key: 'vpvr', name: 'VPVR Volume Profile (POC + Value Area 70%)', cat: 'Orderflow', color: '#f59e0b', desc: 'Histogramă orizontală de volum OHLCV pe niveluri de preț' },
    { key: 'tpo', name: 'TPO Market Profile (Time Price Opportunity)', cat: 'Orderflow Ultimate', color: '#06b6d4', desc: 'Profilul timpului petrecut pe niveluri de preț + TPO POC & Value Area 70%' },
    { key: 'footprint', name: 'Delta & Absorption [OHLCV Proxy]', cat: 'Orderflow Proxy', color: '#14b8a6', desc: 'Proxy structural estimat exclusiv din lumânări OHLCV (NU este Trade Tape Bid/Ask tick-by-tick)' },
    { key: 'autoPatterns', name: 'Auto Chart Patterns (Canale · Wedges · Triunghiuri)', cat: 'Structură Ultimate', color: '#f43f5e', desc: 'Detecție geometrică automată de canale, pene (wedges), triunghiuri și breakout-uri' },
    { key: 'expectedMove', name: 'Expected Move Statistical Cone (±1σ 68%)', cat: 'Volatilitate Ultimate', color: '#a855f7', desc: 'Conul statistic Expected Move calculat din volatilitatea realizată și ATR' },
    { key: 'vwap', name: 'Session VWAP + Dev Bands (±1σ, ±2σ)', cat: 'Instituțional', color: '#ff5722', desc: 'Prețul mediu ponderat cu volumul + benzi de deviație standard' },
    { key: 'bb', name: 'Bollinger Bands (20, 2) + Squeeze', cat: 'Volatilitate', color: '#8b5cf6', desc: 'Benzi de volatilitate standard și detecție TTM Squeeze' },
    { key: 'ma', name: 'SMA (20 / 50 / 200)', cat: 'Trend', color: '#f59e0b', desc: 'Mediile mobile simple clasice pe termen scurt, mediu și lung' },
    { key: 'ichimoku', name: 'Ichimoku Tenkan (9) & Kijun (26)', cat: 'Trend', color: '#06b6d4', desc: 'Echilibru dinamic de trend și suport pe 9/26 perioade' },
    { key: 'fibAuto', name: 'Auto-Fibonacci Retracement & Extensions', cat: 'Structură', color: '#eab308', desc: 'Detecție automată Swing High/Low + Golden Pocket 61.8% pe grafic' },
    { key: 'candlePatterns', name: 'Candlestick Recognition (Engulfing, Hammer, Star)', cat: 'Ultimate Patterns', color: '#38bdf8', desc: 'Recunoaștere automată a formațiunilor de lumânări japoneze pe grafic' },
    { key: 'forecast', name: 'AI Proiecție Fractală + Regresie Cone', cat: 'AI & Forecast', color: '#c084fc', desc: 'Proiecție viitoare pe grafic combinând regresie liniară și analogii k-NN' },
    { key: 'vol', name: 'Volume Histogram', cat: 'Volum', color: '#64748b', desc: 'Volumul fiecărei lumânări în partea inferioară a graficului' },
    { key: 'rsi', name: 'RSI (14) + RSI-MA (Indicator pe Indicator) + StochRSI', cat: 'Oscilatori', color: '#a855f7', desc: 'RSI(14) cu medie mobilă aplicată direct pe RSI + Stochastic RSI' },
    { key: 'macd', name: 'MACD (12, 26, 9) Sub-Pane', cat: 'Oscilatori', color: '#0a84ff', desc: 'Convergența/divergența mediilor mobile și histograma de impuls' }
  ];

  const state = {
    symbol: localStorage.getItem('tp_ultra_symbol') || 'NVDA',
    tf: localStorage.getItem('tp_ultra_tf') || '30m',
    chartType: localStorage.getItem('tp_ultra_chartType') || 'candles',
    theme: localStorage.getItem('tp_ultra_theme') || 'dark',
    layout: localStorage.getItem('tp_ultra_layout') || '1',
    focusedPaneId: Number(localStorage.getItem('tp_ultra_focused_pane') || 0) || 0,
    rightPage: localStorage.getItem('tp_ultra_rpage') || 'watchlist',
    rightCollapsed: localStorage.getItem('tp_ultra_rp_collapsed') === '1',
    extHours: localStorage.getItem('tp_ultra_eth_v2') !== '0',
    syncMultiTf: localStorage.getItem('tp_ultra_synctf') === '1',
    heatmapMode: false,
    liveTickCount: 0,
    prevChartPrice: null,
    activePortfolio: localStorage.getItem('tp_ultra_active_pf') || 'p1',
    compareSpec: '', // e.g. 'OVR:SPY' or 'SPR:QQQ'
    compareBars: [],
    forecastHorizon: 14,

    rawFetchedBars: [], // Unmodified Yahoo OHLCV bars before Range/Spread transform
    fullBars: [],       // Complete active OHLCV history (or Range/Spread bars)
    bars: [],           // Currently visible bars (sliced during Bar Replay!)
    meta: {},
    quote: null,
    news: [],
    lastSignalOut: null,
    lastTechOut: null,
    lastFibOut: null,
    lastForecastOut: null,
    lastAiIdea: null,
    aiNewsCache: {},
    topOpps: [],
    topOppsDir: 'all',
    topOppsTf: '30m',
    topOppsQuery: '',
    topOppsStyle: 'all',
    topOppsMeta: null,
    topOppsLoading: false,

    // Bar Replay
    replay: {
      active: false,
      playing: false,
      idx: 0,
      speedMs: 650,
      timer: null
    },

    // Indicators default configuration (clean, unobstructed chart on boot!)
    indicators: (() => {
      const defaults = {
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
        expectedMove: false,
        candlePatterns: false,
        fibAuto: false,
        forecast: false,
        vol: true,
        rsi: false,
        macd: false
      };
      try {
        const saved = JSON.parse(localStorage.getItem('tp_ultra_inds_v3') || 'null');
        if (saved && typeof saved === 'object') return { ...defaults, ...saved };
      } catch (_) { }
      return defaults;
    })(),

    watchlist: (() => {
      try {
        const v4 = JSON.parse(localStorage.getItem('tp_ultra_watchlist_v4') || 'null');
        if (Array.isArray(v4) && v4.length > 0) {
          const seen = new Set();
          const norm = [];
          for (const raw of v4) {
            const sym = String(typeof raw === 'string' ? raw : (raw?.sym || raw?.symbol || '')).trim().toUpperCase();
            if (!sym || seen.has(sym)) continue;
            seen.add(sym);
            const catHit = SYMBOL_CATALOG.find(c => c.sym === sym) || DEFAULT_WATCHLIST.find(c => c.sym === sym);
            norm.push({
              sym,
              name: (typeof raw === 'object' && raw?.name && raw.name !== sym) ? raw.name : (catHit?.name || sym)
            });
          }
          if (norm.length > 0) return norm;
        }
        // Migrate any custom user tickers from legacy watchlist on top of the complete live Watchlist
        const legacy = JSON.parse(localStorage.getItem('tp_ultra_watchlist') || localStorage.getItem('tradepro_watchlist_v2') || 'null');
        const merged = DEFAULT_WATCHLIST.map(x => ({ ...x }));
        if (Array.isArray(legacy)) {
          const defSet = new Set(merged.map(x => x.sym));
          for (let i = legacy.length - 1; i >= 0; i--) {
            const raw = legacy[i];
            const sym = String(typeof raw === 'string' ? raw : (raw?.sym || raw?.symbol || '')).trim().toUpperCase();
            if (sym && !defSet.has(sym)) {
              defSet.add(sym);
              const catHit = SYMBOL_CATALOG.find(c => c.sym === sym);
              merged.unshift({ sym, name: (raw?.name && raw.name !== sym) ? raw.name : (catHit?.name || sym) });
            }
          }
        }
        return merged;
      } catch (_) { }
      return DEFAULT_WATCHLIST.map(x => ({ ...x }));
    })(),

    alerts: (() => {
      try {
        const s = JSON.parse(localStorage.getItem('tp_ultra_alerts') || localStorage.getItem('tradepro_alerts_v1') || 'null');
        if (Array.isArray(s)) return s;
      } catch (_) { }
      return [];
    })(),
    alertDir: 'up',
    alertCond: 'price_up',
    autoSignalAlert: true,

    portfolios: (() => {
      const mk = (b = 10000, r = 1.0) => ({ balance: b, riskPct: r, positions: [], closedPnl: 0 });
      const def = { p1: mk(10000, 1.0), p2: mk(25000, 1.0), p3: mk(15000, 0.75), p4: mk(50000, 1.0), p5: mk(30000, 0.5), p6: mk(10000, 1.5), p7: mk(100000, 0.5) };
      try {
        const saved = JSON.parse(localStorage.getItem('tp_ultra_portfolios_v1') || 'null');
        if (saved && typeof saved === 'object') return { ...def, ...saved };
        const legacy = JSON.parse(localStorage.getItem('tp_ultra_paper') || 'null');
        if (legacy && typeof legacy === 'object') def.p1 = { ...def.p1, ...legacy };
      } catch (_) { }
      return def;
    })(),
    paper: { balance: 10000, riskPct: 1.0, positions: [], closedPnl: 0 },

    screenerResults: [],
    screenerFilter: 'all',
    screenerAiQuery: '',
    ctxPrice: 0
  };
  state.paper = state.portfolios[state.activePortfolio] || state.portfolios.p1;

  // Chart & Series references
  let mainChart = null;
  let mainSeries = null;
  let mainSeriesType = null;
  let volSeries = null;
  let futurePadSeries = null;

  const overlaySeries = {};
  let fibPriceLines = [];
  let alertPriceLines = [];
  let hlPriceLines = [];

  let rsiChart = null, rsiLineS = null, rsiMaS = null, stochKS = null, stochDS = null, rsiOB = null, rsiOS = null;
  let macdChart = null, macdHistS = null, macdLineS = null, macdSigS = null;
  let overlayEngine = null;

  // Multi-Chart Secondary Panes (Supports 1 up to 20 Simultaneous Live Supercharts!)
  const secPanes = [
    { id: 1, sym: 'NQ=F', tf: '5m', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 2, sym: 'ES=F', tf: '5m', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 3, sym: 'BTC-USD', tf: '15m', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 4, sym: 'TSLA', tf: '15m', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 5, sym: 'APPS', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 6, sym: 'ONDS', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 7, sym: 'EGLD-USD', tf: '15m', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 8, sym: 'ETH-USD', tf: '15m', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 9, sym: 'LULU', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 10, sym: 'GME', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 11, sym: 'MSFT', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 12, sym: 'ORCL', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 13, sym: 'AAPL', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 14, sym: 'EURUSD=X', tf: '15m', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 15, sym: 'CL=F', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 16, sym: 'GC=F', tf: '1h', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 17, sym: 'NIO', tf: '1d', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 18, sym: 'PYPL', tf: '1d', chart: null, candle: null, ema: null, stBull: null, stBear: null },
    { id: 19, sym: 'TRX-USD', tf: '15m', chart: null, candle: null, ema: null, stBull: null, stBear: null }
  ];

  // Restore saved symbols & timeframes per secondary pane across refreshes
  try {
    const savedPanes = JSON.parse(localStorage.getItem('tp_ultra_secpanes_v1') || 'null');
    if (Array.isArray(savedPanes)) {
      savedPanes.forEach(sp => {
        const hit = secPanes.find(x => x.id === Number(sp?.id));
        if (hit) {
          if (sp.sym) hit.sym = String(sp.sym).trim().toUpperCase();
          if (sp.tf) hit.tf = String(sp.tf).trim();
        }
      });
    }
  } catch (_) { }

  function saveSecondaryPanes() {
    try {
      const serial = secPanes.map(p => ({ id: p.id, sym: p.sym, tf: p.tf }));
      localStorage.setItem('tp_ultra_secpanes_v1', JSON.stringify(serial));
      localStorage.setItem('tp_ultra_focused_pane', String(state.focusedPaneId || 0));
    } catch (_) { }
  }

  // ─── 3. FORMATTING, UNIVERSAL OFFICIAL LOGO ENGINE & SOUND HELPERS ────────
  function fmt(v) {
    if (v == null || !isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs < 1e-9) return '0.00';
    let out;
    if (abs >= 1000) out = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else if (abs >= 1) out = v.toFixed(2);
    else if (abs >= 0.01) out = v.toFixed(4);
    else out = v.toFixed(6);
    return out.replace(/^-0(\.0+)?$/, '0$1');
  }

  function fmtChg(chg, refPrice) {
    if (chg == null || !isFinite(chg)) return '—';
    const absChg = Math.abs(chg);
    if (absChg < 1e-9) return '0.00';
    const refAbs = Math.abs(refPrice ?? chg);
    let out;
    if (refAbs >= 1000) out = chg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else if (refAbs >= 1) out = chg.toFixed(2);
    else if (refAbs >= 0.01) out = chg.toFixed(4);
    else out = chg.toFixed(6);
    return out.replace(/^-0(\.0+)?$/, '0$1');
  }

  // Authentic TradingView Split-Digit Formatter: keeps unchanged prefix neutral & colors changed suffix digits live!
  function formatSplitTickHTML(prevVal, nextVal, fallbackDir = 0) {
    if (nextVal == null || !isFinite(nextVal)) return '—';
    const nextStr = fmt(nextVal);
    if (prevVal != null && isFinite(prevVal) && Math.abs(nextVal - prevVal) > 1e-10) {
      const isUp = nextVal > prevVal;
      const cls = isUp ? 'tick-digit-up' : 'tick-digit-dn';
      const prevStr = fmt(prevVal);
      if (prevStr.length === nextStr.length) {
        let diffIdx = 0;
        while (diffIdx < nextStr.length && prevStr[diffIdx] === nextStr[diffIdx]) diffIdx++;
        if (diffIdx < nextStr.length) {
          return `${nextStr.slice(0, diffIdx)}<span class="${cls}">${nextStr.slice(diffIdx)}</span>`;
        }
      }
      return `<span class="${cls}">${nextStr}</span>`;
    }
    if (fallbackDir !== 0 && nextStr.length >= 2) {
      const cls = fallbackDir > 0 ? 'tick-digit-up' : 'tick-digit-dn';
      const cut = Math.max(1, nextStr.length - 2);
      return `${nextStr.slice(0, cut)}<span class="${cls}">${nextStr.slice(cut)}</span>`;
    }
    return nextStr;
  }

  function fmtVol(v) {
    if (!v || !isFinite(v)) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return Math.round(v).toString();
  }

  function safeId(sym) {
    return String(sym || '').replace(/[^a-zA-Z0-9]/g, '_');
  }

  // Pre-verified Official TradingView S3 Logo Slugs (200 OK SVG Vector Logos)
  const VERIFIED_TV_LOGOIDS = {
    // Stocks (US Primary NASDAQ / NYSE Verified 200 OK)
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
    // ETFs & Bonds
    SPY: 'spdr-sandp500-etf-tr', GLD: 'spdr-sandp500-etf-tr', XLF: 'spdr-sandp500-etf-tr', XLE: 'spdr-sandp500-etf-tr',
    QQQ: 'invesco', VOO: 'vanguard', VTI: 'vanguard',
    IWM: 'ishares', IBIT: 'ishares', SLV: 'ishares',
    TLT: 'ishares', IEF: 'ishares', SHY: 'ishares', HYG: 'ishares', LQD: 'ishares', AGG: 'ishares', TIP: 'ishares',
    ARKK: 'ark-etf-tr', TQQQ: 'proshares', SQQQ: 'proshares', SOXL: 'direxion', SMH: 'vaneck',
    // Commodities / Futures
    'GC=F': 'metal/gold', 'SI=F': 'metal/silver', 'HG=F': 'metal/copper',
    'CL=F': 'crude-oil', 'BZ=F': 'crude-oil', 'NG=F': 'natural-gas',
    'NQ=F': 'indices/nasdaq-100', 'ES=F': 'indices/s-and-p-500', 'YM=F': 'indices/dow-30',
    // Indices & Yields
    '^NDX': 'indices/nasdaq-100', '^IXIC': 'indices/nasdaq-composite', '^GSPC': 'indices/s-and-p-500',
    '^DJI': 'indices/dow-30', '^RUT': 'indices/russell-2000', '^VIX': 'indices/volatility-s-and-p-500', '^TNX': 'country/US',
    // Forex
    'EURUSD=X': 'country/EU', 'GBPUSD=X': 'country/GB', 'USDJPY=X': 'country/JP',
    'USDCHF=X': 'country/CH', 'USDCAD=X': 'country/CA', 'AUDUSD=X': 'country/AU', 'EURRON=X': 'country/RO'
  };

  const US_PRIMARY_EXCH = /^(NASDAQ|NYSE|NYSE ARCA|AMEX|BATS|CBOE|CME|COMEX|NYMEX|CBOT|OTC)$/i;

  const officialIdentityCache = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem('tp_official_logos_v4') || '{}');
      return (raw && typeof raw === 'object') ? raw : {};
    } catch (_) {
      return {};
    }
  })();
  const pendingIdentityLookups = new Set();

  function saveIdentityCache() {
    try { localStorage.setItem('tp_official_logos_v4', JSON.stringify(officialIdentityCache)); } catch (_) { }
  }

  function getServerLogoEndpoints(upperSym) {
    const enc = encodeURIComponent(upperSym);
    if (!IS_LOCAL) {
      return [`/logo?sym=${enc}`, `/.netlify/functions/proxy?logo=${enc}`];
    }
    if (window.location.port === '9030' || window.location.protocol.startsWith('http')) {
      return [`/logo?sym=${enc}`, `http://localhost:9030/logo?sym=${enc}`];
    }
    return [`http://localhost:9030/logo?sym=${enc}`, `/logo?sym=${enc}`];
  }

  function getLogoCandidates(sym) {
    const upper = String(sym || '').trim().toUpperCase();
    if (!upper) return [];
    const urls = [];

    // 1. Exact TradingView Official Vector SVG if known or cached
    const cachedLogoId = VERIFIED_TV_LOGOIDS[upper] || officialIdentityCache[upper]?.logoid;
    if (cachedLogoId) {
      urls.push(`https://s3-symbol-logo.tradingview.com/${cachedLogoId}--big.svg`);
    } else if (upper.endsWith('-USD')) {
      const coin = upper.replace('-USD', '');
      urls.push(`https://s3-symbol-logo.tradingview.com/crypto/XTVC${coin}--big.svg`);
    } else if (upper.endsWith('=X') && upper.length >= 6) {
      const baseCcy = upper.slice(0, 2);
      urls.push(`https://s3-symbol-logo.tradingview.com/country/${baseCcy}--big.svg`);
    }

    // 2. First-Party Server Logo Resolver (dynamically resolves all 150,000+ global stocks via TradingView symbol_search + S3 SVG)
    urls.push(...getServerLogoEndpoints(upper));

    // 3. Multi-CDN Direct Ticker Logos (Stocks, ETFs, Bonds, ADRs)
    const cleanTicker = upper.replace(/=X|=F|\^/g, '').split('-')[0];
    if (cleanTicker && !upper.endsWith('=X') && !upper.endsWith('=F') && !upper.startsWith('^')) {
      urls.push(`https://assets.parqet.com/logos/symbol/${encodeURIComponent(cleanTicker)}?format=png`);
      urls.push(`https://api.elbstream.com/logos/symbol/${encodeURIComponent(cleanTicker)}`);
      urls.push(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(cleanTicker)}.png`);
    }

    return Array.from(new Set(urls));
  }

  function getLogoUrl(sym) {
    const cands = getLogoCandidates(sym);
    return cands[0] || '';
  }

  // Global waterfall fallback handler for <img> elements
  window.__tpLogoErr = function (img) {
    if (!img) return;
    const rawFb = img.getAttribute('data-fb') || '';
    const queue = rawFb ? rawFb.split('|').filter(Boolean) : [];
    if (queue.length > 0) {
      const nextUrl = queue.shift();
      img.setAttribute('data-fb', queue.join('|'));
      img.src = nextUrl;
      return;
    }
    img.style.display = 'none';
    const fbSpan = img.parentElement?.querySelector('.sym-logo-fb');
    if (fbSpan) fbSpan.style.display = 'inline-flex';
  };

  function getMonogram(sym) {
    const clean = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return clean.slice(0, 2) || '?';
  }

  function renderLogoAvatar(sym, sizeCls = '') {
    const upper = String(sym || '').trim().toUpperCase();
    const cands = getLogoCandidates(upper);
    const first = cands[0] || '';
    const rest = cands.slice(1).join('|');
    const mono = getMonogram(upper);

    // Trigger background official TradingView logoid + company/ETF name resolution if unknown
    if (!VERIFIED_TV_LOGOIDS[upper] && !officialIdentityCache[upper] && !upper.endsWith('-USD') && !upper.endsWith('=X')) {
      resolveOfficialIdentity(upper);
    }

    if (!first) {
      return `<span class="sym-logo-wrap ${sizeCls}"><span class="sym-logo-fb" style="display:inline-flex;">${mono}</span></span>`;
    }
    return `<span class="sym-logo-wrap ${sizeCls}"><img class="sym-logo-img" referrerpolicy="no-referrer" data-logosym="${upper}" src="${first}" data-fb="${rest}" alt="" onerror="window.__tpLogoErr(this)"><span class="sym-logo-fb">${mono}</span></span>`;
  }

  function setElementLogoAvatar(elId, sym, sizeCls = '') {
    const el = document.getElementById(elId);
    if (!el) return;
    const upper = String(sym || '').trim().toUpperCase();
    if (!upper) return;
    if (el.getAttribute('data-cursym') === upper && el.children.length > 0) return;
    el.setAttribute('data-cursym', upper);
    el.innerHTML = renderLogoAvatar(upper, sizeCls);
  }

  async function resolveOfficialIdentity(sym) {
    const upper = String(sym || '').trim().toUpperCase();
    if (!upper || pendingIdentityLookups.has(upper) || VERIFIED_TV_LOGOIDS[upper] || officialIdentityCache[upper]) return;
    const cleanQuery = upper.replace(/=X|=F|\^/g, '');
    if (!cleanQuery) return;

    pendingIdentityLookups.add(upper);
    try {
      const tvUrl = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(cleanQuery)}&hl=0&lang=en&domain=production`;
      const data = await fetchViaProxy(tvUrl, 6000);
      const symbols = Array.isArray(data?.symbols) ? data.symbols : [];
      const altDot = cleanQuery.replace(/-/g, '.');
      const exactList = symbols.filter(it => {
        const s = String(it.symbol || '').replace(/<[^>]+>/g, '').trim().toUpperCase();
        return s === cleanQuery || s === altDot;
      });
      const exact =
        exactList.find(it => it.logoid && it.country === 'US' && US_PRIMARY_EXCH.test(String(it.exchange || '').replace(/<[^>]+>/g, '').trim())) ||
        exactList.find(it => it.logoid && it.country === 'US') ||
        exactList.find(it => it.logoid) ||
        exactList[0] ||
        symbols[0];
      if (!exact) return;

      const logoid = exact.logoid || (exact.country ? `country/${exact.country}` : '');
      const desc = String(exact.description || '').replace(/<[^>]+>/g, '').trim();
      const exch = String(exact.exchange || '').replace(/<[^>]+>/g, '').trim();

      officialIdentityCache[upper] = { logoid, desc, exch, ts: Date.now() };
      saveIdentityCache();

      // Upgrade any rendered <img> in DOM immediately to TradingView's official SVG
      if (logoid) {
        const officialSvg = `https://s3-symbol-logo.tradingview.com/${logoid}--big.svg`;
        document.querySelectorAll(`img[data-logosym="${upper}"]`).forEach(img => {
          const curSrc = img.getAttribute('src') || '';
          if (curSrc !== officialSvg && !curSrc.includes('/logo?sym=')) {
            const existingFb = (img.getAttribute('data-fb') || '').split('|').filter(Boolean);
            if (curSrc) existingFb.unshift(curSrc);
            img.setAttribute('data-fb', Array.from(new Set(existingFb)).join('|'));
            img.style.display = 'block';
            const fbSpan = img.parentElement?.querySelector('.sym-logo-fb');
            if (fbSpan) fbSpan.style.display = 'none';
            img.src = officialSvg;
          }
        });
        if (state.symbol === upper) {
          const curLogo = document.getElementById('curLogo');
          const curFb = document.getElementById('curLogoFallback');
          if (curLogo && curLogo.getAttribute('src') !== officialSvg && !(curLogo.getAttribute('src') || '').includes('/logo?sym=')) {
            curLogo.style.display = 'block';
            if (curFb) curFb.style.display = 'none';
            curLogo.src = officialSvg;
          }
        }
      }

      // Upgrade company/ETF name in Watchlist & Chart Header if missing or generic
      if (desc) {
        let wlUpdated = false;
        state.watchlist.forEach(w => {
          if (w.sym === upper && (!w.name || w.name === upper)) {
            w.name = desc;
            wlUpdated = true;
          }
        });
        if (wlUpdated) {
          saveWatchlist();
          renderWatchlist();
        }
        if (state.symbol === upper) {
          const subEl = document.getElementById('curCompanySub');
          if (subEl && (!subEl.textContent || subEl.textContent === upper)) {
            subEl.textContent = desc;
          }
        }
      }
    } catch (_) {
      // Silent fallback to server /logo & multi-CDNs
    } finally {
      pendingIdentityLookups.delete(upper);
    }
  }

  function playChime(isUp = true) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isUp ? 587.33 : 440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isUp ? 880 : 329.63, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.29);
    } catch (_) { }
  }

  function showToast(title, body, type = 'info', symToLoad = null) {
    const wrap = document.getElementById('toastContainer');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `app-toast ${type}`;
    const col = type === 'buy' ? 'var(--tv-green)' : type === 'sell' ? 'var(--tv-red)' : 'var(--tv-blue)';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-weight:800;font-size:12.5px;color:${col};">${title}</span>
        <span style="font-size:10px;color:var(--text-muted);">acum</span>
      </div>
      <div style="font-size:11.5px;color:var(--text);line-height:1.4;">${body}</div>
    `;
    el.onclick = () => {
      el.remove();
      if (symToLoad) loadSymbol(symToLoad);
    };
    wrap.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 9000);
  }

  // ─── 4. THEME & CHART OPTIONS ─────────────────────────────────────────────
  function getThemeColors() {
    const dark = state.theme === 'dark';
    return {
      dark,
      bg: dark ? '#0b0f19' : '#ffffff',
      panel: dark ? '#0f1422' : '#ffffff',
      grid: dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(15, 23, 42, 0.05)',
      text: dark ? '#8e98ad' : '#4b5568',
      border: dark ? 'rgba(255, 255, 255, 0.09)' : '#e2e8f0',
      crosshairBg: '#0a84ff'
    };
  }

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('tp_ultra_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#0b0f19' : '#eaf1fb');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.innerHTML = theme === 'dark' ? ICO.moon : ICO.sun;

    const tc = getThemeColors();
    const chartPatch = {
      layout: { background: { color: tc.bg }, textColor: tc.text },
      grid: { vertLines: { color: tc.grid }, horzLines: { color: tc.grid } },
      timeScale: { borderColor: tc.border },
      rightPriceScale: { borderColor: tc.border }
    };
    [mainChart, rsiChart, macdChart, ...secPanes.map(p => p.chart)].forEach(c => {
      if (c) c.applyOptions(chartPatch);
    });
    if (state.lastTechOut) renderTechDials(state.lastTechOut);
    if (overlayEngine) overlayEngine.requestRender();
  }

  function isMobileViewport() {
    return window.innerWidth <= 820;
  }

  function closeMobileSheetsToChart() {
    if (!isMobileViewport()) return;
    const rp = document.getElementById('rightPanel');
    if (rp) rp.classList.remove('mobile-open');
    const dock = document.getElementById('bottomDock');
    if (dock && dock.classList.contains('expanded')) {
      dock.classList.remove('expanded');
      const iconEl = document.getElementById('bdToggleIcon');
      if (iconEl) iconEl.innerHTML = ICO.chevUp;
    }
    document.getElementById('leftToolbar')?.classList.remove('mob-draw-open');
    document.getElementById('mobDrawToggleBtn')?.classList.remove('active');
    document.querySelectorAll('.tv-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('[data-mnav]').forEach(b => {
      b.classList.toggle('active', b.dataset.mnav === 'chart');
    });
    setTimeout(resizeAllCharts, 40);
  }

  function makeChartConfig(w, h, hideTimeAxis = false) {
    const tc = getThemeColors();
    const isNarrow = window.innerWidth <= 640;
    return {
      width: Math.max(50, Math.floor(w)),
      height: Math.max(50, Math.floor(h)),
      layout: {
        background: { color: tc.bg },
        textColor: tc.text,
        fontSize: isNarrow ? 10 : 11,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif'
      },
      grid: {
        vertLines: { color: tc.grid },
        horzLines: { color: tc.grid }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { labelBackgroundColor: tc.crosshairBg },
        horzLine: { labelBackgroundColor: tc.crosshairBg }
      },
      rightPriceScale: {
        visible: true,
        autoScale: true,
        minimumWidth: isNarrow ? 54 : 70,
        borderColor: tc.border,
        scaleMargins: { top: 0.14, bottom: 0.15 }
      },
      timeScale: {
        borderColor: tc.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: isNarrow ? 5 : 8,
        barSpacing: isNarrow ? 7 : 8,
        minBarSpacing: 1.5,
        visible: !hideTimeAxis
      },
      kineticScroll: { touch: true, mouse: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } }
    };
  }

  function focusLiveEvolution(chartInst, totalBars, visibleBars = 95, rightOff = 8) {
    if (!chartInst || !totalBars || totalBars < 2) return;
    try {
      const isNarrow = window.innerWidth <= 640;
      const effBars = (isNarrow && visibleBars >= 80) ? 54 : visibleBars;
      const effOff = (isNarrow && rightOff >= 7) ? 5 : rightOff;
      chartInst.priceScale('right').applyOptions({ autoScale: true });
      const span = Math.min(effBars, Math.max(24, totalBars));
      const from = Math.max(0, totalBars - span);
      const to = (totalBars - 1) + effOff;
      chartInst.timeScale().setVisibleLogicalRange({ from, to });
    } catch (_) {
      try { chartInst.timeScale().fitContent(); } catch (__) { }
    }
  }

  function isChartNearLiveEdge(chartInst, totalBars) {
    if (!chartInst || !totalBars) return true;
    try {
      const r = chartInst.timeScale().getVisibleLogicalRange();
      if (!r) return true;
      return r.to >= totalBars - 4;
    } catch (_) {
      return true;
    }
  }

  function updateJumpToLiveBtn(range = null) {
    const btn = document.getElementById('jumpToLiveBtn');
    if (!btn || !mainChart || !state.bars.length) return;
    const r = range || mainChart.timeScale().getVisibleLogicalRange();
    const away = r ? (r.to < state.bars.length - 4) : false;
    btn.style.display = away ? 'inline-flex' : 'none';
  }

  // ─── 5. INITIALIZE CHARTS & OVERLAY ENGINE ────────────────────────────────
  function createMainPriceSeries(type) {
    if (mainSeries) {
      try { mainChart.removeSeries(mainSeries); } catch (_) { }
      mainSeries = null;
    }
    mainSeriesType = type;

    if (type === 'area') {
      mainSeries = mainChart.addAreaSeries({
        lineColor: '#2962ff',
        topColor: 'rgba(41, 98, 255, 0.32)',
        bottomColor: 'rgba(41, 98, 255, 0.01)',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true
      });
    } else if (type === 'line') {
      mainSeries = mainChart.addLineSeries({
        color: '#2962ff',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true
      });
    } else if (type === 'baseline') {
      const mid = state.bars.length ? state.bars[Math.floor(state.bars.length / 2)].close : 100;
      mainSeries = mainChart.addBaselineSeries({
        baseValue: { type: 'price', price: mid },
        topLineColor: '#089981',
        topFillColor1: 'rgba(8, 153, 129, 0.28)',
        topFillColor2: 'rgba(8, 153, 129, 0.02)',
        bottomLineColor: '#f23645',
        bottomFillColor1: 'rgba(242, 54, 69, 0.02)',
        bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
        priceLineVisible: true,
        lastValueVisible: true
      });
    } else if (type === 'hollow') {
      mainSeries = mainChart.addCandlestickSeries({
        upColor: 'transparent',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        priceLineVisible: true,
        lastValueVisible: true
      });
    } else {
      // 'candles' or 'heikin'
      mainSeries = mainChart.addCandlestickSeries({
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        priceLineVisible: true,
        lastValueVisible: true
      });
    }
  }

  function initCharts() {
    const ce = document.getElementById('chartCanvas');
    mainChart = LightweightCharts.createChart(ce, makeChartConfig(ce.clientWidth, ce.clientHeight));

    createMainPriceSeries(state.chartType);

    volSeries = mainChart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volScale',
      lastValueVisible: false,
      priceLineVisible: false
    });
    mainChart.priceScale('volScale').applyOptions({ scaleMargins: { top: 0.83, bottom: 0 } });

    futurePadSeries = mainChart.addLineSeries({
      color: 'transparent',
      lineVisible: false,
      pointMarkersVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });

    // Indicator Line Series Pool
    const addLine = (color, width = 1.5, style = LightweightCharts.LineStyle.Solid, lastVal = false) =>
      mainChart.addLineSeries({
        color,
        lineWidth: width,
        lineStyle: style,
        priceLineVisible: false,
        lastValueVisible: lastVal,
        crosshairMarkerVisible: false
      });

    overlaySeries.stBull = addLine('#00e676', 2, LightweightCharts.LineStyle.Solid, true);
    overlaySeries.stBear = addLine('#ff1744', 2, LightweightCharts.LineStyle.Solid, true);

    overlaySeries.ema9 = addLine('#38bdf8', 1);
    overlaySeries.ema21 = addLine('#2962ff', 1.75);
    overlaySeries.ema50 = addLine('#f59e0b', 1.75);
    overlaySeries.ema200 = addLine('#ec4899', 2);

    overlaySeries.sma20 = addLine('#60a5fa', 1, LightweightCharts.LineStyle.Dashed);
    overlaySeries.sma50 = addLine('#fbbf24', 1, LightweightCharts.LineStyle.Dashed);
    overlaySeries.sma200 = addLine('#f43f5e', 1.5, LightweightCharts.LineStyle.Dashed);

    overlaySeries.bbU = addLine('rgba(139, 92, 246, 0.65)', 1);
    overlaySeries.bbM = addLine('rgba(139, 92, 246, 0.35)', 1, LightweightCharts.LineStyle.Dashed);
    overlaySeries.bbL = addLine('rgba(139, 92, 246, 0.65)', 1);

    overlaySeries.vwap = addLine('#ff5722', 2, LightweightCharts.LineStyle.Solid, true);
    overlaySeries.vwapU1 = addLine('rgba(255, 87, 34, 0.45)', 1, LightweightCharts.LineStyle.Dashed);
    overlaySeries.vwapL1 = addLine('rgba(255, 87, 34, 0.45)', 1, LightweightCharts.LineStyle.Dashed);
    overlaySeries.vwapU2 = addLine('rgba(255, 87, 34, 0.22)', 1, LightweightCharts.LineStyle.Dotted);
    overlaySeries.vwapL2 = addLine('rgba(255, 87, 34, 0.22)', 1, LightweightCharts.LineStyle.Dotted);

    overlaySeries.tenkan = addLine('#06b6d4', 1.25);
    overlaySeries.kijun = addLine('#f97316', 1.25);

    overlaySeries.fcLine = addLine('#a855f7', 2, LightweightCharts.LineStyle.Dashed, true);
    overlaySeries.fcUpper = addLine('rgba(168, 85, 247, 0.35)', 1, LightweightCharts.LineStyle.Dotted);
    overlaySeries.fcLower = addLine('rgba(168, 85, 247, 0.35)', 1, LightweightCharts.LineStyle.Dotted);
    overlaySeries.compareLine = addLine('#38bdf8', 2, LightweightCharts.LineStyle.Solid, true);

    // RSI + RSI-MA (Indicator on Indicator) + StochRSI Sub-Pane
    const re = document.getElementById('rsiCanvas');
    rsiChart = LightweightCharts.createChart(re, makeChartConfig(re.clientWidth || 600, 104, true));
    rsiChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
    rsiLineS = rsiChart.addLineSeries({ color: '#a855f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    rsiMaS = rsiChart.addLineSeries({ color: '#facc15', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    stochKS = rsiChart.addLineSeries({ color: 'rgba(41, 98, 255, 0.55)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    stochDS = rsiChart.addLineSeries({ color: 'rgba(245, 158, 11, 0.55)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    rsiOB = rsiChart.addLineSeries({ color: 'rgba(242, 54, 69, 0.4)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
    rsiOS = rsiChart.addLineSeries({ color: 'rgba(8, 153, 129, 0.4)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });

    // MACD Sub-Pane
    const me = document.getElementById('macdCanvas');
    macdChart = LightweightCharts.createChart(me, makeChartConfig(me.clientWidth || 600, 104, true));
    macdHistS = macdChart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    macdLineS = macdChart.addLineSeries({ color: '#2962ff', lineWidth: 1.75, priceLineVisible: false, lastValueVisible: true });
    macdSigS = macdChart.addLineSeries({ color: '#f59e0b', lineWidth: 1.25, priceLineVisible: false, lastValueVisible: false });

    // Canvas 2D Institutional & Drawing Overlay
    overlayEngine = new window.ChartOverlayEngine({
      canvas: document.getElementById('drawingOverlay'),
      getChart: () => mainChart,
      getSeries: () => mainSeries,
      getBars: () => state.bars,
      fmtPrice: fmt,
      onToolReset: (t) => updateDrawToolUI(t)
    });

    // Sync Crosshair, Visible Range & Live Evolution Strip
    let lastEvoRangeMs = 0;
    mainChart.subscribeCrosshairMove(onCrosshairMove);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        if (state.indicators.rsi) rsiChart.timeScale().setVisibleLogicalRange(range);
        if (state.indicators.macd) macdChart.timeScale().setVisibleLogicalRange(range);
        updateJumpToLiveBtn(range);
        const now = performance.now();
        if (now - lastEvoRangeMs > 90) {
          lastEvoRangeMs = now;
          renderLiveEvolutionStrip(range);
        }
      }
      if (overlayEngine) overlayEngine.requestRender();
      positionYAxisCountdownTag();
    });

    const jumpBtn = document.getElementById('jumpToLiveBtn');
    if (jumpBtn) {
      jumpBtn.onclick = (e) => {
        e.stopPropagation();
        focusLiveEvolution(mainChart, state.bars.length, 95, 8);
        updateJumpToLiveBtn();
        renderLiveEvolutionStrip();
      };
    }

    // Shift + Click on main chart activates Measure Ruler instantly!
    ce.addEventListener('mousedown', (e) => {
      if (e.shiftKey && e.button === 0) {
        selectDrawingTool('measure');
      }
    });

    // Right-click & Mobile Long-Press Context Menu
    const stageEl = document.getElementById('mainChartStage');
    stageEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY);
    });
    let lpTimer = null;
    let lpStart = null;
    stageEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || (overlayEngine && overlayEngine.tool !== 'cursor')) {
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
        return;
      }
      if (e.target.closest?.('button, #tvLegendBox')) return;
      const t = e.touches[0];
      lpStart = { x: t.clientX, y: t.clientY };
      if (lpTimer) clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        lpTimer = null;
        if (lpStart && mainSeries) {
          const rect = ce.getBoundingClientRect();
          const localY = lpStart.y - rect.top;
          const p = mainSeries.coordinateToPrice(localY);
          if (p != null && isFinite(p)) state.ctxPrice = p;
          openContextMenu(lpStart.x, lpStart.y);
        }
      }, 500);
    }, { passive: true });
    stageEl.addEventListener('touchmove', (e) => {
      if (!lpTimer || !lpStart || !e.touches.length) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - lpStart.x, t.clientY - lpStart.y) > 9) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
    }, { passive: true });
    stageEl.addEventListener('touchend', () => {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    }, { passive: true });

    // Resize Observer across Workspace, Center Column, Grid & Stage so Y-axis/Time-axis never clip
    let resizeRaf = 0;
    const scheduleResize = () => {
      resizeAllCharts();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        resizeAllCharts();
      });
    };
    const ro = new ResizeObserver(scheduleResize);
    ['workspace', 'centerColumn', 'chartsGrid', 'primaryPane', 'mainChartStage'].forEach(id => {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    });
    window.addEventListener('resize', scheduleResize);

    // Interactive Drag Resizing for RSI & MACD Sub-Panes (Mouse + Touch)
    [
      { splitId: 'rsiSplitter', paneId: 'rsiPane' },
      { splitId: 'macdSplitter', paneId: 'macdPane' }
    ].forEach(({ splitId, paneId }) => {
      const sp = document.getElementById(splitId);
      const pn = document.getElementById(paneId);
      if (!sp || !pn) return;
      sp.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        try { sp.setPointerCapture(ev.pointerId); } catch (_) { }
        const startY = ev.clientY;
        const startH = pn.clientHeight || 104;
        const onMove = (me) => {
          if (me.pointerId !== ev.pointerId) return;
          const nextH = Math.max(64, Math.min(240, startH - (me.clientY - startY)));
          pn.style.height = nextH + 'px';
          resizeAllCharts();
        };
        const onUp = (ue) => {
          if (ue.pointerId !== ev.pointerId) return;
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });
    });
  }

  function resizeAllCharts() {
    const stage = document.getElementById('mainChartStage');
    if (mainChart && stage) {
      const rect = stage.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 20 && h > 20) mainChart.resize(w, h);
    }
    const rsiPane = document.getElementById('rsiPane');
    if (rsiChart && state.indicators.rsi && rsiPane) {
      const rect = rsiPane.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 20 && h > 20) rsiChart.resize(w, h);
    }
    const macdPane = document.getElementById('macdPane');
    if (macdChart && state.indicators.macd && macdPane) {
      const rect = macdPane.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 20 && h > 20) macdChart.resize(w, h);
    }
    secPanes.forEach(p => {
      const el = document.getElementById(`secCanvas${p.id}`);
      if (p.chart && el) {
        const rect = el.getBoundingClientRect();
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        if (w > 20 && h > 20) p.chart.resize(w, h);
      }
    });
    if (overlayEngine) overlayEngine.resize();
    positionYAxisCountdownTag();
  }

  // ─── 6. DATA FETCHING (YAHOO V8 + TICK/SECOND/CUSTOM TF + ETH + QUOTES) ──
  function tfToYahooParams(tf) {
    const clean = String(tf || '1d').toLowerCase();
    const map = {
      '5s': { i: '1m', r: '1d' },
      '15s': { i: '1m', r: '1d' },
      '30s': { i: '1m', r: '1d' },
      '100t': { i: '1m', r: '5d' },
      '500t': { i: '1m', r: '5d' },
      '1m': { i: '1m', r: '2d' },
      '5m': { i: '5m', r: '10d' },
      '15m': { i: '15m', r: '25d' },
      '30m': { i: '30m', r: '45d' },
      '1h': { i: '60m', r: '90d' },
      '4h': { i: '60m', r: '180d' },
      '1d': { i: '1d', r: '2y' },
      '1wk': { i: '1wk', r: '5y' },
      '1mo': { i: '1mo', r: '15y' }
    };
    if (map[clean]) return map[clean];
    if (/^\d+t$/.test(clean)) return { i: '1m', r: '5d' };
    if (/^\d+s$/.test(clean)) return { i: '1m', r: '1d' };
    if (/^\d+m$/.test(clean)) {
      const m = parseInt(clean, 10);
      return m <= 10 ? { i: '1m', r: '5d' } : { i: '5m', r: '30d' };
    }
    if (/^\d+h$/.test(clean)) return { i: '60m', r: '180d' };
    return map['1d'];
  }

  function aggregateBucketSeconds(bars, bucketSec) {
    const map = new Map();
    for (const b of bars) {
      const bucket = Math.floor(b.time / bucketSec) * bucketSec;
      const cur = map.get(bucket);
      if (!cur) {
        map.set(bucket, { ...b, time: bucket });
      } else {
        cur.high = Math.max(cur.high, b.high);
        cur.low = Math.min(cur.low, b.low);
        cur.close = b.close;
        cur.volume += b.volume;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  }

  function synthesizeSecondBars(bars1m, stepSec = 15) {
    const parts = Math.max(2, Math.floor(60 / stepSec));
    const src = bars1m.slice(-Math.min(bars1m.length, stepSec === 5 ? 28 : 55));
    const out = [];
    for (const b of src) {
      const bull = b.close >= b.open;
      const p1 = bull ? b.low : b.high;
      const p2 = bull ? b.high : b.low;
      const anchors = [b.open, p1, p2, b.close];
      let prevC = b.open;
      for (let k = 0; k < parts; k++) {
        const frac = (k + 1) / parts;
        const seg = frac * (anchors.length - 1);
        const idx = Math.min(anchors.length - 2, Math.floor(seg));
        const loc = seg - idx;
        const closeK = k === parts - 1 ? b.close : (anchors[idx] + (anchors[idx + 1] - anchors[idx]) * loc);
        const openK = prevC;
        const wig = (b.high - b.low) * 0.08;
        const highK = Math.min(b.high, Math.max(openK, closeK) + wig);
        const lowK = Math.max(b.low, Math.min(openK, closeK) - wig);
        out.push({
          time: b.time + k * stepSec,
          open: openK,
          high: highK,
          low: lowK,
          close: closeK,
          volume: Math.round((b.volume || 0) / parts)
        });
        prevC = closeK;
      }
    }
    return Q.sanitizeBars(out);
  }

  function aggregate4h(bars) {
    const map = new Map();
    for (const b of bars) {
      const bucket = Math.floor(b.time / 14400) * 14400;
      const cur = map.get(bucket);
      if (!cur) {
        map.set(bucket, { ...b, time: bucket });
      } else {
        cur.high = Math.max(cur.high, b.high);
        cur.low = Math.min(cur.low, b.low);
        cur.close = b.close;
        cur.volume += b.volume;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  }

  function fnv1aHash(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function generateFallbackBars(sym, tf) {
    const hash = fnv1aHash(sym);
    const step = { '5s': 5, '15s': 15, '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1wk': 604800, '1mo': 2592000 }[tf] || 86400;
    const count = 240;
    const now = Math.floor(Date.now() / 1000);
    let price = 18 + (hash % 380);
    let rng = hash || 1337;
    const nextRand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 0xffffffff; };
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = now - (count - i) * step;
      const wave = Math.sin((i + (hash % 29)) / 16) * 0.004;
      const delta = (nextRand() - 0.49 + wave) * price * 0.022;
      const open = price;
      const close = Math.max(0.5, open + delta);
      const high = Math.max(open, close) * (1 + nextRand() * 0.008);
      const low = Math.min(open, close) * (1 - nextRand() * 0.008);
      const volume = Math.round(1_200_000 * (0.4 + nextRand() * 1.4));
      out.push({ time: t, open, high, low, close, volume });
      price = close;
    }
    return out;
  }

  async function fetchOHLCV(symbol, tf) {
    const cleanTf = String(tf || '1d').toLowerCase();
    const { i, r } = tfToYahooParams(cleanTf);
    const enc = encodeURIComponent(symbol);
    const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h'].includes(i);
    const ethParam = (state.extHours && isIntraday) ? '&includePrePost=true' : '';
    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=${i}&range=${r}&includeAdjustedClose=true${ethParam}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=${i}&range=${r}&includeAdjustedClose=true${ethParam}`
    ];

    for (const u of urls) {
      try {
        const json = await fetchViaProxy(u, 9000);
        const res = json?.chart?.result?.[0];
        if (!res || !Array.isArray(res.timestamp)) continue;
        const ts = res.timestamp;
        const q = res.indicators?.quote?.[0] || {};
        let bars = ts.map((t, idx) => ({
          time: t,
          open: q.open?.[idx],
          high: q.high?.[idx],
          low: q.low?.[idx],
          close: q.close?.[idx],
          volume: q.volume?.[idx] || 0
        }));
        bars = Q.sanitizeBars(bars);
        if (cleanTf === '4h') {
          bars = aggregate4h(bars);
        } else if (/^\d+t$/.test(cleanTf) && typeof Q.toTickBars === 'function') {
          bars = Q.toTickBars(bars, Math.max(10, parseInt(cleanTf, 10)));
        } else if (/^\d+s$/.test(cleanTf)) {
          bars = synthesizeSecondBars(bars, Math.max(1, Math.min(30, parseInt(cleanTf, 10))));
        } else if (/^\d+m$/.test(cleanTf) && !['1m', '5m', '15m', '30m'].includes(cleanTf)) {
          bars = aggregateBucketSeconds(bars, Math.max(1, parseInt(cleanTf, 10)) * 60);
        } else if (/^\d+h$/.test(cleanTf) && cleanTf !== '1h') {
          bars = aggregateBucketSeconds(bars, Math.max(1, parseInt(cleanTf, 10)) * 3600);
        }
        if (bars.length >= 5) {
          return { bars, meta: res.meta || {}, demo: false };
        }
      } catch (_) { }
    }

    return { bars: generateFallbackBars(symbol, cleanTf), meta: { symbol, demo: true }, demo: true };
  }

  function buildEffectiveFullBars() {
    let base = state.rawFetchedBars || [];
    if (!base.length) return [];

    // 1. Spread Ratio Transform (SIMBOL / BENCHMARK) if active
    if (state.compareSpec.startsWith('SPR:') && state.compareBars.length >= 5) {
      const bMap = new Map(state.compareBars.map(x => [x.time, x]));
      let lastRef = state.compareBars[0];
      const spr = [];
      for (const a of base) {
        const ref = bMap.get(a.time) || lastRef;
        if (bMap.has(a.time)) lastRef = ref;
        if (!ref || !ref.close) continue;
        const o = a.open / (ref.open || ref.close);
        const c = a.close / ref.close;
        const h = Math.max(o, c, a.high / (ref.low || ref.close));
        const l = Math.min(o, c, a.low / (ref.high || ref.close));
        spr.push({ time: a.time, open: o, high: h, low: l, close: c, volume: a.volume });
      }
      if (spr.length >= 10) base = spr;
    }

    // 2. Ultimate Price-Based Chart Transforms (Range Bars, Renko, Three-Line Break, Kagi)
    if (state.chartType === 'range' && typeof Q.toRangeBars === 'function') {
      return Q.toRangeBars(base, 0.65);
    }
    if (state.chartType === 'renko' && typeof Q.toRenkoBars === 'function') {
      return Q.toRenkoBars(base, 0.85);
    }
    if (state.chartType === 'linebreak' && typeof Q.toLineBreakBars === 'function') {
      return Q.toLineBreakBars(base, 3);
    }
    if (state.chartType === 'kagi' && typeof Q.toKagiBars === 'function') {
      return Q.toKagiBars(base, 0.90);
    }
    return [...base];
  }

  function extractQuoteSessionInfo(q) {
    if (!q) return null;
    const sym = String(q.symbol || '').toUpperCase();
    const is24h = sym.endsWith('-USD') || sym.endsWith('=X');
    const mktState = String(q.marketState || '').toUpperCase();
    const regPrice = q.regularMarketPrice;
    const prevClose = q.regularMarketPreviousClose ?? (isFinite(regPrice) && isFinite(q.regularMarketChange) ? regPrice - q.regularMarketChange : null);
    const regChg = q.regularMarketChange ?? (isFinite(regPrice) && isFinite(prevClose) ? regPrice - prevClose : 0);
    const regChgPct = q.regularMarketChangePercent ?? (isFinite(prevClose) && prevClose ? (regChg / prevClose) * 100 : 0);

    let extType = '';
    let extPrice = null;
    let extChg = null;
    let extChgPct = null;
    let extTime = null;

    if (!is24h && mktState !== 'REGULAR') {
      const hasPre = q.preMarketPrice != null && isFinite(q.preMarketPrice) && q.preMarketPrice > 0;
      const hasPost = q.postMarketPrice != null && isFinite(q.postMarketPrice) && q.postMarketPrice > 0;
      if ((mktState === 'PRE' || mktState === 'PREPRE') && hasPre) {
        extType = 'PRE';
      } else if ((mktState === 'POST' || mktState === 'POSTPOST') && hasPost) {
        extType = 'POST';
      } else if (hasPre || hasPost) {
        extType = (hasPre && (!hasPost || (q.preMarketTime || 0) >= (q.postMarketTime || 0))) ? 'PRE' : 'POST';
      }

      if (extType === 'PRE') {
        extPrice = q.preMarketPrice;
        extChg = q.preMarketChange ?? (isFinite(regPrice) ? extPrice - regPrice : 0);
        extChgPct = q.preMarketChangePercent ?? (isFinite(regPrice) && regPrice ? (extChg / regPrice) * 100 : 0);
        extTime = q.preMarketTime || null;
      } else if (extType === 'POST') {
        extPrice = q.postMarketPrice;
        extChg = q.postMarketChange ?? (isFinite(regPrice) ? extPrice - regPrice : 0);
        extChgPct = q.postMarketChangePercent ?? (isFinite(regPrice) && regPrice ? (extChg / regPrice) * 100 : 0);
        extTime = q.postMarketTime || null;
      }
    }

    return {
      mktState,
      is24h,
      regPrice,
      prevClose,
      regChg,
      regChgPct,
      regTime: q.regularMarketTime || null,
      extType,
      extPrice,
      extChg,
      extChgPct,
      extTime
    };
  }

  async function fetchBatchQuotes(symbols) {
    if (!symbols.length) return {};
    const fields = [
      'symbol', 'shortName', 'longName', 'currency', 'exchange', 'fullExchangeName',
      'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
      'regularMarketPreviousClose', 'regularMarketTime',
      'regularMarketDayLow', 'regularMarketDayHigh',
      'fiftyTwoWeekLow', 'fiftyTwoWeekHigh', 'regularMarketVolume', 'averageDailyVolume3Month',
      'preMarketPrice', 'preMarketChange', 'preMarketChangePercent', 'preMarketTime',
      'postMarketPrice', 'postMarketChange', 'postMarketChangePercent', 'postMarketTime',
      'marketState', 'earningsTimestamp', 'bid', 'ask', 'bidSize', 'askSize'
    ].join(',');

    const out = {};
    const chunkSize = 8;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const sl = symbols.slice(i, i + chunkSize);
      const u = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sl.join(','))}&fields=${fields}`;
      try {
        const json = await fetchViaProxy(u, 7500);
        const arr = json?.quoteResponse?.result || [];
        arr.forEach(q => {
          if (q && q.symbol) out[String(q.symbol).toUpperCase()] = q;
        });
      } catch (_) { }
    }

    // Automatic v8 chart fallback (with Pre/Post-Market support!) for any ticker missing from v7 quote response
    const missing = symbols.filter(s => !out[String(s).toUpperCase()]);
    if (missing.length > 0) {
      await Promise.all(missing.slice(0, 12).map(async (sym) => {
        try {
          const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=2d&includePrePost=true`;
          const json = await fetchViaProxy(u, 6500);
          const res = json?.chart?.result?.[0];
          const meta = res?.meta;
          if (!meta) return;
          const q = res.indicators?.quote?.[0] || {};
          const ts = res.timestamp || [];
          const closes = (q.close || []).filter(v => v != null && isFinite(v));
          const regP = meta.regularMarketPrice ?? closes[closes.length - 1];
          if (regP == null || !isFinite(regP)) return;
          const prev = meta.chartPreviousClose ?? meta.previousClose ?? regP;
          const chg = regP - prev;
          const chgPct = prev ? (chg / prev) * 100 : 0;

          // Detect extended-hours last bar from intraday v8 response if outside regular session
          let preMarketPrice = meta.preMarketPrice;
          let preMarketChange = meta.preMarketChange;
          let preMarketChangePercent = meta.preMarketChangePercent;
          let postMarketPrice = meta.postMarketPrice;
          let postMarketChange = meta.postMarketChange;
          let postMarketChangePercent = meta.postMarketChangePercent;
          let marketState = meta.marketState || '';

          const lastClose = closes[closes.length - 1];
          const lastTs = ts[ts.length - 1];
          if (isFinite(lastClose) && lastTs && Math.abs(lastClose - regP) > 1e-5 && (!meta.regularMarketTime || lastTs > meta.regularMarketTime + 60)) {
            const dEt = new Date((lastTs - 5 * 3600) * 1000);
            const mins = dEt.getUTCHours() * 60 + dEt.getUTCMinutes();
            if (mins >= 240 && mins < 570) {
              marketState = marketState || 'PRE';
              preMarketPrice = lastClose;
              preMarketChange = lastClose - regP;
              preMarketChangePercent = regP ? (preMarketChange / regP) * 100 : 0;
            } else {
              marketState = marketState || 'POST';
              postMarketPrice = lastClose;
              postMarketChange = lastClose - regP;
              postMarketChangePercent = regP ? (postMarketChange / regP) * 100 : 0;
            }
          }

          out[String(sym).toUpperCase()] = {
            symbol: String(meta.symbol || sym).toUpperCase(),
            shortName: meta.shortName || meta.longName || sym,
            currency: meta.currency || 'USD',
            fullExchangeName: meta.fullExchangeName || meta.exchangeName || '',
            marketState,
            regularMarketPrice: regP,
            regularMarketPreviousClose: prev,
            regularMarketTime: meta.regularMarketTime,
            regularMarketChange: chg,
            regularMarketChangePercent: chgPct,
            regularMarketDayHigh: meta.regularMarketDayHigh ?? Math.max(...(q.high || [regP]).filter(isFinite)),
            regularMarketDayLow: meta.regularMarketDayLow ?? Math.min(...(q.low || [regP]).filter(isFinite)),
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
            regularMarketVolume: meta.regularMarketVolume,
            preMarketPrice,
            preMarketChange,
            preMarketChangePercent,
            postMarketPrice,
            postMarketChange,
            postMarketChangePercent
          };
        } catch (_) { }
      }));
    }
    return out;
  }

  async function fetchSymbolNews(symbol) {
    try {
      const u = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=6`;
      const json = await fetchViaProxy(u, 6500);
      return Array.isArray(json?.news) ? json.news : [];
    } catch (_) {
      return [];
    }
  }

  // ─── 7. MASTER RENDER & QUANT ANALYSIS PIPELINE ───────────────────────────
  function renderChartAndQuant(fitView = false) {
    const bars = state.bars;
    if (!bars || bars.length < 5) return;

    const neededSeriesKind = ['area', 'line', 'baseline', 'hollow'].includes(state.chartType)
      ? state.chartType
      : 'candles';
    if (mainSeriesType !== neededSeriesKind) {
      createMainPriceSeries(neededSeriesKind);
    }

    if (mainChart) {
      const tfLow = String(state.tf || '').toLowerCase();
      mainChart.timeScale().applyOptions({
        secondsVisible: /^\d+(s|t)$/.test(tfLow) || ['range', 'renko', 'linebreak', 'kagi'].includes(state.chartType)
      });
    }

    // 1. Main Price Data (Standard, Hollow, Heikin Ashi, Volume Candles, Range, Area, Line, Baseline)
    if (state.chartType === 'area' || state.chartType === 'line' || state.chartType === 'baseline') {
      if (state.chartType === 'baseline') {
        const baseVal = bars[Math.max(0, bars.length - 40)].close;
        mainSeries.applyOptions({ baseValue: { type: 'price', price: baseVal } });
      }
      mainSeries.setData(bars.map(b => ({ time: b.time, value: b.close })));
    } else if (state.chartType === 'heikin') {
      mainSeries.setData(Q.toHeikinAshi(bars));
    } else if (state.chartType === 'volcandles') {
      const vAvg = Q.calcSMAArray(bars.map(b => b.volume || 0), 20);
      mainSeries.setData(bars.map((b, i) => {
        const rv = (vAvg[i] && vAvg[i] > 0) ? (b.volume || 0) / vAvg[i] : 1;
        const up = b.close >= b.open;
        const col = rv >= 1.55
          ? (up ? '#00f59b' : '#ff2e54')
          : rv < 0.72
            ? (up ? 'rgba(8, 153, 129, 0.40)' : 'rgba(242, 54, 69, 0.40)')
            : (up ? '#089981' : '#f23645');
        return {
          time: b.time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          color: col,
          borderColor: col,
          wickColor: col
        };
      }));
    } else {
      mainSeries.setData(bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    }

    // Add invisible future whitespace padding so right-side Trade Plan & Forecast project smoothly
    const barSec = bars.length > 1 ? Math.max(1, bars[bars.length - 1].time - bars[bars.length - 2].time) : 86400;
    const padArr = [{ time: bars[bars.length - 1].time, value: bars[bars.length - 1].close }];
    for (let k = 1; k <= 8; k++) {
      padArr.push({ time: bars[bars.length - 1].time + k * barSec });
    }
    futurePadSeries.setData(padArr);

    // Compare Overlay Series (Indexed to active symbol's starting price when OVR:SYM is active)
    if (overlaySeries.compareLine) {
      if (state.compareSpec.startsWith('OVR:') && state.compareBars.length >= 5) {
        const cMap = new Map(state.compareBars.map(x => [x.time, x.close]));
        const anchorIdx = Math.max(0, bars.length - Math.min(bars.length, 120));
        const baseA = bars[anchorIdx].close;
        let baseB = null;
        let lastB = null;
        const ovrPts = [];
        for (let i = 0; i < bars.length; i++) {
          const t = bars[i].time;
          if (cMap.has(t)) lastB = cMap.get(t);
          if (lastB != null && i >= anchorIdx && baseB == null) baseB = lastB;
          if (lastB != null && baseB) {
            ovrPts.push({ time: t, value: baseA * (lastB / baseB) });
          }
        }
        overlaySeries.compareLine.setData(ovrPts);
      } else {
        overlaySeries.compareLine.setData([]);
      }
    }

    // 2. Volume Histogram (subtle institutional bottom profile)
    volSeries.setData(state.indicators.vol
      ? bars.map(b => ({
        time: b.time,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(8, 153, 129, 0.20)' : 'rgba(242, 54, 69, 0.20)'
      }))
      : []);

    // 3. Overlay Indicators
    const closes = bars.map(b => b.close);

    // SuperTrend
    if (state.indicators.supertrend) {
      const st = Q.calcSuperTrend(bars, 10, 3.0);
      const lastDir = st.dir[st.dir.length - 1];
      overlaySeries.stBull.applyOptions({ lastValueVisible: lastDir === 1 });
      overlaySeries.stBear.applyOptions({ lastValueVisible: lastDir === -1 });
      overlaySeries.stBull.setData(st.bullSeries);
      overlaySeries.stBear.setData(st.bearSeries);
    } else {
      overlaySeries.stBull.applyOptions({ lastValueVisible: false });
      overlaySeries.stBear.applyOptions({ lastValueVisible: false });
      overlaySeries.stBull.setData([]);
      overlaySeries.stBear.setData([]);
    }

    // EMA Ribbon
    if (state.indicators.emaRibbon) {
      overlaySeries.ema9.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 9)));
      overlaySeries.ema21.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 21)));
      overlaySeries.ema50.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 50)));
      overlaySeries.ema200.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 200)));
    } else {
      overlaySeries.ema9.setData([]);
      overlaySeries.ema21.setData([]);
      overlaySeries.ema50.setData([]);
      overlaySeries.ema200.setData([]);
    }

    // SMA 20/50/200
    if (state.indicators.ma) {
      overlaySeries.sma20.setData(Q.toSeries(bars, Q.calcSMAArray(closes, 20)));
      overlaySeries.sma50.setData(Q.toSeries(bars, Q.calcSMAArray(closes, 50)));
      overlaySeries.sma200.setData(Q.toSeries(bars, Q.calcSMAArray(closes, 200)));
    } else {
      overlaySeries.sma20.setData([]);
      overlaySeries.sma50.setData([]);
      overlaySeries.sma200.setData([]);
    }

    // Bollinger
    if (state.indicators.bb) {
      const bb = Q.calcBollinger(bars, 20, 2.0);
      overlaySeries.bbU.setData(bb.upperS);
      overlaySeries.bbM.setData(bb.midS);
      overlaySeries.bbL.setData(bb.lowerS);
    } else {
      overlaySeries.bbU.setData([]);
      overlaySeries.bbM.setData([]);
      overlaySeries.bbL.setData([]);
    }

    // VWAP
    if (state.indicators.vwap) {
      const vw = Q.calcVWAP(bars);
      overlaySeries.vwap.setData(vw.vwapS);
      overlaySeries.vwapU1.setData(vw.u1S);
      overlaySeries.vwapL1.setData(vw.l1S);
      overlaySeries.vwapU2.setData(vw.u2S);
      overlaySeries.vwapL2.setData(vw.l2S);
    } else {
      overlaySeries.vwap.setData([]);
      overlaySeries.vwapU1.setData([]);
      overlaySeries.vwapL1.setData([]);
      overlaySeries.vwapU2.setData([]);
      overlaySeries.vwapL2.setData([]);
    }

    // Ichimoku
    if (state.indicators.ichimoku) {
      const ich = Q.calcIchimoku(bars);
      overlaySeries.tenkan.setData(ich.tenkanS);
      overlaySeries.kijun.setData(ich.kijunS);
    } else {
      overlaySeries.tenkan.setData([]);
      overlaySeries.kijun.setData([]);
    }

    // 4. Smart Signal Engine + Candlestick Pattern Recognition + Strategy Backtest
    const sigOut = Q.runSmartSignalEngine(bars);
    state.lastSignalOut = sigOut;

    if (typeof mainSeries.setMarkers === 'function') {
      const mList = [];
      if (state.indicators.smartSignals && sigOut.markers) mList.push(...sigOut.markers);
      if (state.indicators.candlePatterns && typeof Q.detectCandlestickPatterns === 'function') {
        mList.push(...Q.detectCandlestickPatterns(bars));
      }
      mList.sort((a, b) => a.time - b.time);
      mainSeries.setMarkers(mList);
    }

    // 5. SMC, VPVR, TPO, Footprint, Auto-Patterns, Expected Move & Forecast
    const atrArr = Q.calcATRArray(bars, 14);
    const smcData = state.indicators.smc ? Q.calcSMC(bars, atrArr) : null;
    const vpvrFull = Q.calcVPVR(bars.slice(-140), 42);
    const vpvrData = state.indicators.vpvr ? vpvrFull : null;
    const tpoData = state.indicators.tpo ? Q.calcTPO(bars, 32) : null;
    const fpFull = Q.calcOrderflowFootprint(bars);
    const footprintData = state.indicators.footprint ? fpFull : null;
    const patternData = state.indicators.autoPatterns ? Q.calcAutoPatterns(bars) : null;
    const expectedMoveData = state.indicators.expectedMove ? Q.calcExpectedMove(bars, 10) : null;

    const fcOut = Q.computeForecast(bars, state.forecastHorizon);
    state.lastForecastOut = fcOut;
    if (state.indicators.forecast && fcOut) {
      overlaySeries.fcLine.setData(fcOut.lineS);
      overlaySeries.fcUpper.setData(fcOut.upperS);
      overlaySeries.fcLower.setData(fcOut.lowerS);
    } else {
      overlaySeries.fcLine.setData([]);
      overlaySeries.fcUpper.setData([]);
      overlaySeries.fcLower.setData([]);
    }

    // Sub-Panes (RSI + RSI-MA Indicator-on-Indicator & MACD)
    const rsiPane = document.getElementById('rsiPane');
    const rsiSplit = document.getElementById('rsiSplitter');
    if (state.indicators.rsi) {
      rsiPane.style.display = 'block';
      rsiSplit.style.display = 'block';
      const rsiArr = Q.calcRSIArray(closes, 14);
      const rsiS = Q.toSeries(bars, rsiArr);
      const rsiMaArr = Q.calcEMAArray(rsiArr.map(v => v ?? 50), 14);
      const srsi = Q.calcStochRSI(bars);
      rsiLineS.setData(rsiS);
      if (rsiMaS) rsiMaS.setData(Q.toSeries(bars, rsiMaArr));
      stochKS.setData(srsi.kS);
      stochDS.setData(srsi.dS);
      rsiOB.setData(rsiS.map(x => ({ time: x.time, value: 70 })));
      rsiOS.setData(rsiS.map(x => ({ time: x.time, value: 30 })));
      const lastR = rsiArr[rsiArr.length - 1];
      document.getElementById('rsiLiveVal').textContent = lastR != null ? lastR.toFixed(1) : '—';
    } else {
      rsiPane.style.display = 'none';
      rsiSplit.style.display = 'none';
    }

    const macdPane = document.getElementById('macdPane');
    const macdSplit = document.getElementById('macdSplitter');
    if (state.indicators.macd) {
      macdPane.style.display = 'block';
      macdSplit.style.display = 'block';
      const md = Q.calcMACD(bars);
      macdHistS.setData(md.histS);
      macdLineS.setData(md.lineS);
      macdSigS.setData(md.sigS);
      const lastM = md.hist[md.hist.length - 1];
      document.getElementById('macdLiveVal').textContent = lastM != null ? lastM.toFixed(3) : '—';
    } else {
      macdPane.style.display = 'none';
      macdSplit.style.display = 'none';
    }

    // Price Lines: Period High/Low, Auto-Fib, Active Alerts
    drawAxisPriceLines(bars);

    // Update Canvas 2D Institutional & Ultimate Overlay
    if (overlayEngine) {
      overlayEngine.setLayers({
        vpvrData,
        smcData,
        tradePlan: sigOut.currentPlan,
        tpoData,
        footprintData,
        patternData,
        expectedMoveData,
        showVPVR: !!state.indicators.vpvr,
        showSMC: !!state.indicators.smc,
        showTradePlan: !!state.indicators.smartSignals,
        showTPO: !!state.indicators.tpo,
        showFootprint: !!state.indicators.footprint,
        showAutoPatterns: !!state.indicators.autoPatterns,
        showExpectedMove: !!state.indicators.expectedMove,
        showExtSessions: !!state.extHours
      });
    }

    // Update All Panels & HUDs
    updateHeaderAndLegend(bars[bars.length - 1], bars[bars.length - 2]);
    renderSmartPlanPanel(sigOut);
    if (typeof updateActiveAiStrategist === 'function') {
      updateActiveAiStrategist();
    }
    if (!fitView) {
      maybeNotifyLiveSignalTelegram(sigOut);
    }
    renderOrderFlowSummary(bars, vpvrFull, fpFull, sigOut.currentPlan);
    const techOut = Q.computeTVTechnicals(bars);
    state.lastTechOut = techOut;
    renderTechDials(techOut);
    renderFibonacciPanel(bars);
    renderForecastPanel(fcOut);
    renderBacktestDock(sigOut);
    updatePositionCalculator();
    renderAlertsList();

    resizeAllCharts();
    if (fitView && mainChart) {
      focusLiveEvolution(mainChart, bars.length, 95, 8);
    }
    updateJumpToLiveBtn();
    renderLiveEvolutionStrip();
  }

  function drawAxisPriceLines(bars) {
    // Clear previous price lines cleanly
    [...fibPriceLines, ...alertPriceLines, ...hlPriceLines].forEach(obj => {
      try { obj.series.removePriceLine(obj.line); } catch (_) { }
    });
    fibPriceLines = [];
    alertPriceLines = [];
    hlPriceLines = [];
    if (!mainSeries || !bars.length) return;

    // 1. Visible Recent 95-bar High/Low dotted tags
    const recent = bars.slice(-95);
    const hi = Math.max(...recent.map(b => b.high));
    const lo = Math.min(...recent.map(b => b.low));
    hlPriceLines.push({
      series: mainSeries,
      line: mainSeries.createPriceLine({ price: hi, color: 'rgba(8,153,129,0.55)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: 'Max' })
    });
    hlPriceLines.push({
      series: mainSeries,
      line: mainSeries.createPriceLine({ price: lo, color: 'rgba(242,54,69,0.55)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true, title: 'Min' })
    });

    // 1b. Pre-Market / Post-Market Reference Price Line (Regular Close on Intraday ETH, or Live Pre/Post on Daily/RTH)
    if (!state.compareSpec.startsWith('SPR:')) {
      const lqRef = liveQuoteCache[state.symbol];
      const qRef = state.quote ? extractQuoteSessionInfo(state.quote) : null;
      const eType = lqRef?.extType || qRef?.extType || '';
      const ePrice = lqRef?.extPrice ?? qRef?.extPrice;
      const rPrice = lqRef?.regPrice ?? qRef?.regPrice ?? state.quote?.regularMarketPrice;
      if (eType && isFinite(ePrice) && isFinite(rPrice) && Math.abs(ePrice - rPrice) > 1e-4) {
        const tfLow = String(state.tf || '').toLowerCase();
        const isSubDay = /^\d+(t|s|m|h)$/.test(tfLow);
        if (isSubDay && state.extHours) {
          hlPriceLines.push({
            series: mainSeries,
            line: mainSeries.createPriceLine({
              price: rPrice,
              color: 'rgba(148, 163, 184, 0.65)',
              lineWidth: 1,
              lineStyle: LightweightCharts.LineStyle.Dotted,
              axisLabelVisible: true,
              title: 'Înch. Reg.'
            })
          });
        } else {
          hlPriceLines.push({
            series: mainSeries,
            line: mainSeries.createPriceLine({
              price: ePrice,
              color: eType === 'PRE' ? '#f59e0b' : '#2962ff',
              lineWidth: 1,
              lineStyle: LightweightCharts.LineStyle.Dashed,
              axisLabelVisible: true,
              title: eType === 'PRE' ? 'Pre-Mkt' : 'Post-Mkt'
            })
          });
        }
      }
    }

    // 2. Auto-Fibonacci lines if enabled (keep Y-axis uncluttered so numeric price ticks stay 100% readable)
    const lookback = parseInt(document.getElementById('fibLookbackSelect')?.value || '60', 10);
    const fib = Q.calcAutoFib(bars, lookback);
    state.lastFibOut = fib;
    if (state.indicators.fibAuto && fib) {
      const cols = { '0.0': '#787b86', '23.6': '#f23645', '38.2': '#f59e0b', '50.0': '#10b981', '61.8': '#2962ff', '78.6': '#06b6d4', '100.0': '#787b86' };
      fib.levels.forEach(lv => {
        const isKey = lv.label === '61.8' || lv.label === '50.0';
        fibPriceLines.push({
          series: mainSeries,
          line: mainSeries.createPriceLine({
            price: lv.price,
            color: cols[lv.label] || '#787b86',
            lineWidth: lv.label === '61.8' ? 2 : 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: isKey,
            title: isKey ? `F ${lv.label}%` : ''
          })
        });
      });
    }

    // 3. Active Price Alerts for current symbol
    state.alerts.filter(a => !a.triggered && a.sym === state.symbol && (!a.cond || a.cond === 'price_up' || a.cond === 'price_dn') && isFinite(a.price)).forEach(a => {
      alertPriceLines.push({
        series: mainSeries,
        line: mainSeries.createPriceLine({
          price: a.price,
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: `ALERT ${a.dir === 'up' ? '>' : '<'} ${fmt(a.price)}`
        })
      });
    });
  }

  // ─── 8. TOP LEGEND, LIVE EVOLUTION STRIP, FLOATING SMART HUD & CROSSHAIR ──
  function renderLiveEvolutionStrip(rangeOverride = null) {
    const strip = document.getElementById('liveEvolutionStrip');
    if (!strip || !state.bars.length) return;
    const bars = state.bars;
    const lastB = bars[bars.length - 1];
    const liveP = lastB.close;

    // 1. Session Evolution (from live quote cache or state.quote or previous bar)
    const lq = liveQuoteCache[state.symbol];
    const sessChg = (!state.compareSpec.startsWith('SPR:') && lq && isFinite(lq.chg))
      ? lq.chg
      : (state.quote && isFinite(state.quote.regularMarketChange) ? state.quote.regularMarketChange : (liveP - (bars[bars.length - 2]?.close || lastB.open)));
    const sessPct = (!state.compareSpec.startsWith('SPR:') && lq && isFinite(lq.chgPct))
      ? lq.chgPct
      : (state.quote && isFinite(state.quote.regularMarketChangePercent) ? state.quote.regularMarketChangePercent : ((liveP - (bars[bars.length - 2]?.close || lastB.open)) / Math.max(1e-9, bars[bars.length - 2]?.close || lastB.open)) * 100);

    // 2. Visible Chart Evolution (from first visible bar on screen to latest bar)
    let visStartIdx = Math.max(0, bars.length - 95);
    let visEndIdx = bars.length - 1;
    try {
      const r = rangeOverride || (mainChart ? mainChart.timeScale().getVisibleLogicalRange() : null);
      if (r) {
        visStartIdx = Math.max(0, Math.min(bars.length - 1, Math.floor(r.from)));
        visEndIdx = Math.max(visStartIdx, Math.min(bars.length - 1, Math.ceil(r.to)));
      }
    } catch (_) { }
    const visBase = bars[visStartIdx]?.open || bars[visStartIdx]?.close || liveP;
    const visEnd = bars[visEndIdx]?.close || liveP;
    const visChg = visEnd - visBase;
    const visPct = visBase ? (visChg / visBase) * 100 : 0;

    // 3. Recent 20-bar Momentum Evolution
    const momIdx = Math.max(0, bars.length - 21);
    const momBase = bars[momIdx]?.close || liveP;
    const momPct = momBase ? ((liveP - momBase) / momBase) * 100 : 0;

    // 4. Full Loaded Period Evolution
    const fullBase = bars[0]?.open || bars[0]?.close || liveP;
    const fullPct = fullBase ? ((liveP - fullBase) / fullBase) * 100 : 0;

    const fmtPct = (p) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
    const colOf = (v) => v >= 0 ? 'var(--tv-green)' : 'var(--tv-red)';

    strip.innerHTML = `
      <span class="evo-chip" title="Evoluția pe zona vizibilă acum pe grafic (${visEndIdx - visStartIdx + 1} lumânări)">
        <span>Vizibil</span>
        <b style="color:${colOf(visPct)}">${fmtPct(visPct)}</b>
      </span>
      <span class="evo-chip" title="Impuls pe ultimele 20 de lumânări">
        <span>20 Bare</span>
        <b style="color:${colOf(momPct)}">${fmtPct(momPct)}</b>
      </span>
      <span class="evo-chip" title="Evoluție totală pe istoricul încărcat (${bars.length} lumânări)">
        <span>Perioadă</span>
        <b style="color:${colOf(fullPct)}">${fmtPct(fullPct)}</b>
      </span>
      <button type="button" id="evoFocusLiveBtn" class="evo-chip evo-btn" title="Centrează graficul pe evoluția live și reactivează auto-scalarea">
        <b>Auto</b>
      </button>
    `;

    const focusBtn = document.getElementById('evoFocusLiveBtn');
    if (focusBtn) {
      focusBtn.onclick = (e) => {
        e.stopPropagation();
        focusLiveEvolution(mainChart, state.bars.length, 95, 8);
        updateJumpToLiveBtn();
        renderLiveEvolutionStrip();
      };
    }
  }

  function updateHeaderAndLegend(lastBar, prevBar) {
    if (!lastBar) return;
    const prevClose = prevBar ? prevBar.close : lastBar.open;
    const barChg = lastBar.close - prevClose;
    const barChgPct = prevClose ? (barChg / prevClose) * 100 : 0;

    const lq = liveQuoteCache[state.symbol];
    const sessChg = (!state.compareSpec.startsWith('SPR:') && lq && isFinite(lq.chg))
      ? lq.chg
      : (state.quote && isFinite(state.quote.regularMarketChange) ? state.quote.regularMarketChange : barChg);
    const sessPct = (!state.compareSpec.startsWith('SPR:') && lq && isFinite(lq.chgPct))
      ? lq.chgPct
      : (state.quote && isFinite(state.quote.regularMarketChangePercent) ? state.quote.regularMarketChangePercent : barChgPct);
    const isUp = sessPct >= 0;

    const dispTitle = state.compareSpec.startsWith('SPR:')
      ? `${state.symbol} / ${state.compareSpec.slice(4)}`
      : state.symbol;
    document.getElementById('curSymbolTitle').textContent = dispTitle;
    syncChartWatchlistBtn(state.symbol);
    const ctTagMap = { range: 'RANGE', renko: 'RENKO', linebreak: '3LB', kagi: 'KAGI', volcandles: 'VOL' };
    const ctExtra = ctTagMap[state.chartType] ? ` · ${ctTagMap[state.chartType]}` : '';
    document.getElementById('curTfBadge').textContent = `${state.tf.toUpperCase()}${ctExtra}`;

    // Hero Live Price + Session Evolution Badge on Top-Left Header
    const prevP = state.prevChartPrice;
    const heroPriceEl = document.getElementById('curLivePriceHero');
    if (heroPriceEl) {
      heroPriceEl.innerHTML = (!state.compareSpec.startsWith('SPR:') && lq?.html && Math.abs((lq.price || 0) - lastBar.close) < 1e-4)
        ? lq.html
        : formatSplitTickHTML(prevP, lastBar.close, isUp ? 1 : -1);
    }
    const sessBadge = document.getElementById('curSessionChgBadge');
    if (sessBadge) {
      const cleanSChg = Math.abs(sessChg) < 1e-6 ? 0 : sessChg;
      const cleanSPct = Math.abs(sessPct) < 0.005 ? 0 : sessPct;
      const sPctStr = cleanSPct.toFixed(2).replace(/^-0(\.0+)?$/, '0$1');
      sessBadge.textContent = `${cleanSChg >= 0 ? '+' : ''}${fmtChg(cleanSChg, lastBar.close)} (${cleanSPct >= 0 ? '+' : ''}${sPctStr}%)`;
      sessBadge.className = `pill ${cleanSPct >= 0 ? 'pill-buy' : 'pill-sell'} tabular`;
    }

    const extBadge = document.getElementById('curExtSessionBadge');
    if (extBadge) {
      const qExt = (!lq?.extType && state.quote) ? extractQuoteSessionInfo(state.quote) : null;
      const eType = lq?.extType || qExt?.extType || '';
      const ePrice = lq?.extPrice ?? qExt?.extPrice;
      const ePct = lq?.extChgPct ?? qExt?.extChgPct ?? 0;
      if (!state.compareSpec.startsWith('SPR:') && eType && isFinite(ePrice)) {
        const isPre = eType === 'PRE';
        extBadge.className = `ext-sess-pill tabular ${isPre ? 'pre' : 'post'}`;
        extBadge.innerHTML = `${isPre ? ICO.preSun : ICO.postMoon}<span>${isPre ? 'Pre' : 'Post'} ${fmt(ePrice)} (${ePct >= 0 ? '+' : ''}${ePct.toFixed(2)}%)</span>`;
        extBadge.style.display = 'inline-flex';
      } else {
        extBadge.style.display = 'none';
      }
    }

    const cachedDesc = officialIdentityCache[state.symbol]?.desc;
    const catDesc = SYMBOL_CATALOG.find(c => c.sym === state.symbol)?.name;
    const compName = state.quote?.longName || state.quote?.shortName || cachedDesc || catDesc || state.meta?.shortName || '';
    const subTxt = state.compareSpec.startsWith('OVR:')
      ? `${compName} · vs ${state.compareSpec.slice(4)}`
      : (compName && compName !== state.symbol ? compName : '');
    document.getElementById('curCompanySub').textContent = subTxt;

    // Authentic Brand Logo with Multi-CDN Waterfall + Official TradingView SVG Upgrade (Zero Flicker on Live Ticks)
    const logoImg = document.getElementById('curLogo');
    const logoFb = document.getElementById('curLogoFallback');
    logoFb.textContent = getMonogram(state.symbol);
    resolveOfficialIdentity(state.symbol);
    if (logoImg.getAttribute('data-logosym') !== state.symbol || !logoImg.getAttribute('src')) {
      const cands = getLogoCandidates(state.symbol);
      if (cands.length > 0) {
        logoImg.setAttribute('data-logosym', state.symbol);
        logoImg.setAttribute('data-fb', cands.slice(1).join('|'));
        logoImg.onload = () => { logoImg.style.display = 'block'; logoFb.style.display = 'none'; };
        logoImg.onerror = () => window.__tpLogoErr(logoImg);
        logoImg.src = cands[0];
      } else {
        logoImg.style.display = 'none';
        logoFb.style.display = 'inline-flex';
      }
    }

    // OHLCV Strip (current or hovered candle) + Live Multi-Horizon Evolution Strip
    setOHLCStrip(lastBar, barChg, barChgPct, false);
    renderLiveEvolutionStrip();

    // Bid / Ask One-Click Pill (Split-Digit Live Update)
    const spread = lastBar.close > 100 ? lastBar.close * 0.0002 : lastBar.close * 0.0008;
    const bid = state.quote?.bid || (lastBar.close - spread / 2);
    const ask = state.quote?.ask || (lastBar.close + spread / 2);
    document.getElementById('baSellPrice').innerHTML = formatSplitTickHTML(prevP != null ? prevP - spread / 2 : null, bid, isUp ? 1 : -1);
    document.getElementById('baBuyPrice').innerHTML = formatSplitTickHTML(prevP != null ? prevP + spread / 2 : null, ask, isUp ? 1 : -1);
    document.getElementById('baSpreadVal').textContent = fmtChg(Math.max(0.01, ask - bid), bid);
    state.prevChartPrice = lastBar.close;

    // Browser Tab Title
    document.title = `${state.symbol} ${fmt(lastBar.close)} (${isUp ? '+' : ''}${sessPct.toFixed(2)}%)`;

    // Active Indicator Pills + Badge Count + Quick Toggle Sync
    const activeDefs = INDICATOR_DEFS.filter(d => state.indicators[d.key]);
    document.getElementById('activeIndCount').textContent = activeDefs.length;
    document.querySelectorAll('[data-qind]').forEach(qb => {
      qb.classList.toggle('active', !!state.indicators[qb.dataset.qind]);
    });
    const legEl = document.getElementById('activeIndLegend');
    legEl.innerHTML = activeDefs.slice(0, 5).map(d => `
      <div class="ind-leg-row">
        <span class="ind-leg-dot" style="background:${d.color}"></span>
        <span>${d.name.split(' (')[0]}</span>
        <span class="ind-leg-x" data-remove-ind="${d.key}" title="Ascunde indicator">${ICO.close}</span>
      </div>
    `).join('');
    legEl.querySelectorAll('[data-remove-ind]').forEach(btn => {
      btn.onclick = () => toggleIndicator(btn.dataset.removeInd);
    });
  }

  function setOHLCStrip(bar, chg, chgPct, showChg = true) {
    const cleanChg = (chg == null || !isFinite(chg) || Math.abs(chg) < 1e-6) ? 0 : chg;
    const cleanPct = (chgPct == null || !isFinite(chgPct) || Math.abs(chgPct) < 0.005) ? 0 : chgPct;
    const fmtStr = fmtChg(cleanChg, bar.close);
    const pctStr = cleanPct.toFixed(2).replace(/^-0(\.0+)?$/, '0$1');
    const col = cleanChg >= 0 ? 'var(--tv-green)' : 'var(--tv-red)';
    const chgSpan = showChg
      ? `<span style="color:${col};font-weight:800;">${cleanChg >= 0 ? '+' : ''}${fmtStr} (${cleanPct >= 0 ? '+' : ''}${pctStr}%)</span>`
      : '';
    document.getElementById('ohlcStrip').innerHTML = `
      <span class="ohlc-item">O <b>${fmt(bar.open)}</b></span>
      <span class="ohlc-item">H <b style="color:var(--tv-green)">${fmt(bar.high)}</b></span>
      <span class="ohlc-item">L <b style="color:var(--tv-red)">${fmt(bar.low)}</b></span>
      <span class="ohlc-item">C <b style="color:${col}">${fmt(bar.close)}</b></span>
      <span class="ohlc-item">V <b>${fmtVol(bar.volume)}</b></span>
      ${chgSpan}
    `;
  }

  function onCrosshairMove(param) {
    if (!param || !param.point || !param.time || !state.bars.length) {
      if (state.bars.length >= 2) {
        const l = state.bars[state.bars.length - 1];
        const p = state.bars[state.bars.length - 2];
        setOHLCStrip(l, l.close - p.close, ((l.close - p.close) / p.close) * 100, false);
      }
      return;
    }
    const priceAtCursor = mainSeries ? mainSeries.coordinateToPrice(param.point.y) : null;
    if (priceAtCursor != null && isFinite(priceAtCursor)) state.ctxPrice = priceAtCursor;

    const idx = state.bars.findIndex(b => b.time === param.time);
    if (idx !== -1) {
      const b = state.bars[idx];
      const p = idx > 0 ? state.bars[idx - 1] : b;
      const chg = b.close - p.close;
      setOHLCStrip(b, chg, p.close ? (chg / p.close) * 100 : 0, idx < state.bars.length - 1);
    }
  }

  // ─── 9. RIGHT SIDEBAR PANELS (SMART PLAN · TECHNICALS · FIB · FORECAST) ──
  function renderSmartPlanPanel(sigOut) {
    const cp = sigOut?.currentPlan;
    const hud = document.getElementById('smartHudCard');
    const panel = document.getElementById('smartTicketWrap');
    if (!cp) return;

    // 1. Compact Status Chip on Chart
    const shortVerdict = cp.status === 'BUY_NOW' ? `Long ${cp.grade}`
      : cp.status === 'SETUP_BUY' ? `Long ${cp.grade}`
        : cp.status === 'HOLD_LONG' ? `Long ${cp.grade}`
          : cp.status === 'SELL_NOW' ? `Short ${cp.grade}`
            : cp.status === 'SETUP_SELL' ? `Short ${cp.grade}`
              : cp.status === 'HOLD_SHORT' ? `Short ${cp.grade}`
                : `Neutru`;
    const dotCol = cp.badgeClass === 'buy' ? 'buy' : cp.badgeClass === 'sell' ? 'sell' : 'wait';
    const txtCol = cp.badgeClass === 'buy' ? 'var(--tv-green)' : cp.badgeClass === 'sell' ? 'var(--tv-red)' : 'var(--tv-amber)';

    hud.innerHTML = `
      <span class="sig-dot ${dotCol}"></span>
      <span style="font-weight:700;color:${txtCol};">${shortVerdict}</span>
      <span style="color:var(--border-strong);">|</span>
      <span class="tabular" style="color:var(--text-muted);">Scor <b style="color:var(--text-bright)">${cp.score}</b></span>
      <span style="color:var(--border-strong);">|</span>
      <span class="tabular" style="color:var(--text-muted);">WR <b style="color:var(--text-bright)">${sigOut.stats.winRate}%</b></span>
    `;
    hud.onclick = () => {
      if (isMobileViewport()) {
        const dock = document.getElementById('bottomDock');
        if (dock && dock.classList.contains('expanded')) {
          dock.classList.remove('expanded');
          const iconEl = document.getElementById('bdToggleIcon');
          if (iconEl) iconEl.innerHTML = ICO.chevUp;
        }
        document.getElementById('leftToolbar')?.classList.remove('mob-draw-open');
        document.getElementById('mobDrawToggleBtn')?.classList.remove('active');
        document.getElementById('rightPanel')?.classList.add('mobile-open');
        document.querySelectorAll('[data-mnav]').forEach(b => {
          b.classList.toggle('active', b.dataset.mnav === 'smart');
        });
      }
      applyRightSidebarState('smart', false);
      if (!state.topOpps.length && !state.topOppsLoading) fetchTopMarketOpportunities(false);
      setTimeout(resizeAllCharts, 40);
    };

    // 2. Institutional Right-Panel Trade Setup Sheet (Zero Overflow)
    const slPct = (((cp.sl - cp.entry) / cp.entry) * 100).toFixed(2);
    const tp1Pct = (((cp.tp1 - cp.entry) / cp.entry) * 100).toFixed(2);
    const tp2Pct = (((cp.tp2 - cp.entry) / cp.entry) * 100).toFixed(2);
    const rCls = cp.badgeClass === 'buy' ? 'bull' : cp.badgeClass === 'sell' ? 'bear' : 'warn';

    panel.innerHTML = `
      <div class="signal-ticket ${cp.badgeClass}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;min-width:0;">
          <div style="min-width:0;flex:1;">
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cp.setupArchetype}</div>
            <div style="font-size:12px;font-weight:700;color:var(--text-bright);margin-top:2px;display:flex;align-items:center;gap:6px;line-height:1.3;">
              <span class="sig-dot ${dotCol}"></span>
              <span style="min-width:0;overflow-wrap:break-word;">${cp.actionTitle}</span>
            </div>
          </div>
          <span class="pill ${cp.badgeClass === 'buy' ? 'pill-buy' : cp.badgeClass === 'sell' ? 'pill-sell' : 'pill-warn'}">${cp.grade} · ${cp.score}</span>
        </div>

        <div class="ticket-plan-grid">
          <div class="ticket-box">
            <div class="lbl">${cp.projected ? 'Preț Ref.' : 'Intrare'}</div>
            <div class="val" style="color:var(--tv-blue)">${fmt(cp.entry)}</div>
          </div>
          <div class="ticket-box">
            <div class="lbl">Stop (${slPct}%)</div>
            <div class="val" style="color:var(--tv-red)">${fmt(cp.sl)}</div>
          </div>
          <div class="ticket-box">
            <div class="lbl">TP1 1.5R (${tp1Pct >= 0 ? '+' : ''}${tp1Pct}%)</div>
            <div class="val" style="color:var(--tv-green)">${fmt(cp.tp1)}</div>
          </div>
          <div class="ticket-box">
            <div class="lbl">TP2 3.0R (${tp2Pct >= 0 ? '+' : ''}${tp2Pct}%)</div>
            <div class="val" style="color:var(--tv-green)">${fmt(cp.tp2)}</div>
          </div>
        </div>

        <div class="reason-list">
          ${cp.reasons.map(r => `<div class="reason-chip ${rCls}">${r}</div>`).join('')}
        </div>

        <div class="ticket-actions">
          <button class="ticket-btn-exec ${cp.isBuy ? 'buy' : 'sell'}" id="btnExecPlanPaper">
            <span>Ordin ${cp.isBuy ? 'Long' : 'Short'}</span>
          </button>
          <button class="ticket-btn-sec" id="btnOpenBacktestTab" title="Deschide Strategy Tester">
            <span>Backtest ${sigOut.stats.winRate}%</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnExecPlanPaper').onclick = () => executePaperFromPlan(cp);
    document.getElementById('btnOpenBacktestTab').onclick = () => openBottomDockTab('backtest');
  }

  let aiNewsFetchSeq = 0;
  function buildActiveAiIdea() {
    if (!state.bars || state.bars.length < 30 || typeof Q.generateAITradeIdea !== 'function') return null;
    const sym = state.symbol;
    const cachedNews = (state.aiNewsCache && state.aiNewsCache[sym]) || state.news || [];
    const idea = Q.generateAITradeIdea(sym, state.bars, {
      name: state.quote?.name || state.symbolMeta?.name || sym,
      price: isFinite(state.quote?.price) ? state.quote.price : undefined,
      chgPct: isFinite(state.quote?.chgPct) ? state.quote.chgPct : undefined,
      tf: state.tf || '30m',
      extType: state.quote?.extType || '',
      extPrice: state.quote?.extPrice ?? null,
      extChgPct: state.quote?.extChgPct ?? null,
      news: cachedNews
    });
    state.lastAiIdea = idea;
    return idea;
  }

  async function hydrateActiveAiNews(sym, tf) {
    if (!sym || (state.aiNewsCache && state.aiNewsCache[sym])) return;
    const seq = ++aiNewsFetchSeq;
    try {
      const r = await fetch(`/api/ai-idea?sym=${encodeURIComponent(sym)}&tf=${encodeURIComponent(tf || '30m')}`);
      const d = await r.json();
      if (seq !== aiNewsFetchSeq || state.symbol !== sym) return;
      if (d && d.ok && d.idea) {
        state.aiNewsCache = state.aiNewsCache || {};
        state.aiNewsCache[sym] = Array.isArray(d.idea.news) ? d.idea.news : [];
        const rebuilt = buildActiveAiIdea();
        if (rebuilt) renderAiBriefPanel(rebuilt);
      }
    } catch (_) { /* optional news enrichment */ }
  }

  function renderAiBriefPanel(idea) {
    const wrap = document.getElementById('aiBriefCardWrap');
    const hdrPill = document.getElementById('aiProbHeaderPill');
    if (hdrPill) {
      if (idea) {
        hdrPill.textContent = `${idea.probPct}% Prob · ${idea.grade}`;
        hdrPill.className = `pill ${idea.isActionable ? (idea.isBuy ? 'pill-buy' : 'pill-sell') : 'pill-neut'}`;
      } else {
        hdrPill.textContent = 'SMC + k-NN';
        hdrPill.className = 'pill pill-neut';
      }
    }
    if (!wrap) return;
    if (!idea) {
      wrap.innerHTML = `<div class="top-opp-empty">Date insuficiente pentru teza AI Trade Strategist pe ${escTg(state.symbol)}.</div>`;
      return;
    }

    const dirCls = !idea.isActionable ? 'wait' : (idea.isBuy ? 'buy' : 'sell');
    const probCls = idea.probPct >= 62 ? 'high' : (idea.probPct >= 50 ? 'mid' : '');
    const fillColor = !idea.isActionable ? 'var(--tv-amber)' : (idea.isBuy ? 'var(--tv-green)' : 'var(--tv-red)');
    const kl = idea.keyLevels || {};
    const fcStr = kl.forecastPct != null ? `${kl.forecastPct >= 0 ? '+' : ''}${Number(kl.forecastPct).toFixed(1)}%` : '—';
    const newsHtml = (idea.news || []).slice(0, 2).map(n => `
      <a class="ai-news-item" href="${escTg(n.link || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="ai-news-title">${escTg(n.title || '')}</span>
        <span class="ai-news-src">${escTg(n.publisher || 'Știri')}</span>
      </a>
    `).join('');

    wrap.innerHTML = `
      <div class="ai-brief-card ${dirCls}">
        <div class="ai-brief-top">
          <span class="ai-brief-verdict">${escTg(idea.verdictLabel)}</span>
          <span class="ai-prob-badge ${probCls}">Prob ${idea.probPct}%</span>
        </div>
        <div class="ai-prob-bar">
          <div class="ai-prob-fill" style="width:${idea.probPct}%;background:${fillColor};"></div>
        </div>
        <div class="ai-brief-meta">
          <span>${escTg(idea.regime)}</span>
          <span class="ai-cat-tag">${escTg(idea.catalystBadge || idea.setupArchetype)}</span>
        </div>
        <p class="ai-brief-thesis">${escTg(idea.aiThesis)}</p>
        <div class="ai-zone-strip">
          <div class="ai-zone-box">
            <div class="lbl">Zonă Intrare Optimă</div>
            <div class="val" style="color:var(--tv-blue)">${fmt(idea.entryZoneLow)} – ${fmt(idea.entryZoneHigh)}</div>
          </div>
          <div class="ai-zone-box">
            <div class="lbl">POC / Proiecție k-NN</div>
            <div class="val">${kl.poc != null ? fmt(kl.poc) : '—'} · ${fcStr}</div>
          </div>
        </div>
        <div class="ai-inval-box"><strong>Invalidare:</strong> ${escTg(idea.invalidationText)}</div>
        ${(idea.risks || []).length ? `<div class="ai-risks-list">${idea.risks.slice(0, 2).map(r => `<div class="ai-risk-item">${escTg(r)}</div>`).join('')}</div>` : ''}
        ${newsHtml ? `<div class="ai-news-list">${newsHtml}</div>` : ''}
      </div>
    `;
  }

  function updateActiveAiStrategist() {
    const idea = buildActiveAiIdea();
    renderAiBriefPanel(idea);
    if (idea && !(state.aiNewsCache && state.aiNewsCache[state.symbol])) {
      hydrateActiveAiNews(state.symbol, state.tf || '30m');
    }
  }

  let topOppsFetchSeq = 0;
  async function fetchTopMarketOpportunities(forceRefresh = false) {
    const mySeq = ++topOppsFetchSeq;
    state.topOppsLoading = true;
    renderTopOppsRadar();
    try {
      const qs = new URLSearchParams({
        tf: state.topOppsTf || '30m',
        dir: state.topOppsDir || 'all',
        limit: '10',
        refresh: forceRefresh ? '1' : '0'
      });
      const r = await fetch(`/api/top-opportunities?${qs.toString()}`);
      const data = await r.json();
      if (mySeq !== topOppsFetchSeq) return null;
      if (data && data.ok && Array.isArray(data.opportunities)) {
        state.topOpps = data.opportunities;
        state.topOppsMeta = {
          tf: data.tf,
          dir: data.dir,
          generatedAt: data.generatedAt,
          scannedCount: data.scannedCount,
          evaluatedCount: data.evaluatedCount,
          buyCount: data.buyCount,
          sellCount: data.sellCount,
          actionableCount: data.actionableCount
        };
      }
      return data;
    } catch (e) {
      if (mySeq === topOppsFetchSeq) {
        showToast('Top 10 Piață', 'Eroare la scanarea oportunităților live.', 'sell');
      }
      return null;
    } finally {
      if (mySeq === topOppsFetchSeq) {
        state.topOppsLoading = false;
        renderTopOppsRadar();
        if (state.screenerFilter === 'top10') renderScreenerTable();
      }
    }
  }

  function renderTopOppsRadar() {
    const listEl = document.getElementById('topOppsRightList');
    const metaEl = document.getElementById('topOppsMetaLbl');
    const refBtn = document.getElementById('topOppsRefreshBtn');
    if (refBtn) refBtn.classList.toggle('spinning', !!state.topOppsLoading);

    if (metaEl) {
      if (state.topOppsLoading && !state.topOpps.length) {
        metaEl.textContent = 'Scanez piața...';
      } else if (state.topOppsMeta) {
        metaEl.textContent = `${state.topOppsMeta.evaluatedCount} lichide · ${state.topOppsMeta.buyCount}B / ${state.topOppsMeta.sellCount}S`;
      } else {
        metaEl.textContent = 'Live Scan';
      }
    }
    if (!listEl) return;

    const rawList = state.topOpps || [];
    if (!rawList.length) {
      listEl.innerHTML = `<div class="top-opp-empty">${state.topOppsLoading
          ? 'Scanez piața în timp real (Active Lichide Institutional + TradingView + Yahoo + Crypto)...'
          : 'Apasă refresh pentru a descoperi Top 10 AI Idei BUY & SELL live.'
        }</div>`;
      return;
    }

    const qStr = String(state.topOppsQuery || '').trim().toLowerCase();
    const styleF = state.topOppsStyle || 'all';
    const list = rawList.filter(o => {
      if (qStr) {
        const hay = `${o.sym} ${o.name || ''} ${o.catalystBadge || ''} ${o.setupArchetype || ''} ${o.aiThesis || ''} ${o.regime || ''}`.toLowerCase();
        if (!hay.includes(qStr)) return false;
      }
      if (styleF === 'momentum') {
        return /Momentum|Breakout|Volum|RVOL|Impuls|Trend/i.test(`${o.catalystBadge || ''} ${o.setupArchetype || ''} ${o.regime || ''}`);
      }
      if (styleF === 'reversal') {
        return /SMC|Order Block|Pullback|Triunghi|Canal|Wedge|Dublu|RSI/i.test(`${o.catalystBadge || ''} ${o.setupArchetype || ''} ${o.keyLevels?.chartPattern || ''}`);
      }
      if (styleF === 'highprob') {
        return Number(o.probPct || 0) >= 65;
      }
      return true;
    });

    if (!list.length) {
      listEl.innerHTML = `<div class="top-opp-empty">Nicio idee AI nu corespunde filtrului curent (${escTg(qStr || styleF)}). Resetează filtrul sau apasă Refresh.</div>`;
      return;
    }

    listEl.innerHTML = list.map(o => {
      const isBuy = !!o.isBuy;
      const pillCls = isBuy ? 'pill-buy' : 'pill-sell';
      const dotCls = isBuy ? 'buy' : 'sell';
      const sgn = (o.chgPct || 0) >= 0 ? '+' : '';
      const chgCls = (o.chgPct || 0) >= 0 ? 'up' : 'dn';
      const badgeTxt = `${isBuy ? 'BUY' : 'SELL'} ${o.grade}${o.isFreshTrigger ? ' ACUM' : ''}`;
      const probTxt = o.probPct != null ? `Prob ${o.probPct}%` : `Scor ${o.oppScore}`;
      const pocVal = o.keyLevels?.poc != null ? fmt(o.keyLevels.poc) : fmt(o.price);

      return `
        <div class="top-opp-card ${isBuy ? 'buy' : 'sell'}">
          <div class="top-opp-head">
            <div class="top-opp-id">
              <span class="top-opp-rank">#${o.rank}</span>
              ${renderLogoAvatar(o.sym, 'sm')}
              <div class="top-opp-symwrap">
                <div class="top-opp-symrow">
                  <span class="top-opp-sym">${escTg(o.sym)}</span>
                  <span class="pill ${pillCls}"><span class="sig-dot ${dotCls}"></span>${badgeTxt}</span>
                </div>
                <div class="top-opp-name">${escTg(o.name || o.sym)}</div>
              </div>
            </div>
            <div class="top-opp-pricecol">
              <div class="top-opp-px">${fmt(o.price)}</div>
              <div class="top-opp-chg ${chgCls}">${sgn}${Number(o.chgPct || 0).toFixed(2)}%</div>
            </div>
          </div>

          <div class="top-opp-sub">
            <span class="top-opp-arch">${escTg(o.catalystBadge || o.setupArchetype || o.actionTitle)}</span>
            <span class="top-opp-score">${probTxt} · WR ${o.winRate}% · ${Number(o.rvol || 1).toFixed(1)}x</span>
          </div>

          ${o.aiThesis ? `<div class="top-opp-thesis">${escTg(o.aiThesis)}</div>` : ''}
          ${(o.entryZoneLow != null && o.entryZoneHigh != null) ? `
            <div class="top-opp-zone-line">
              <span>Zonă: <strong>${fmt(o.entryZoneLow)} – ${fmt(o.entryZoneHigh)}</strong></span>
              <span>POC ${pocVal} · PF ${o.profitFactor ?? '—'}</span>
            </div>
          ` : ''}

          <div class="top-opp-grid">
            <div class="top-opp-cell"><div class="lbl">Intrare</div><div class="val" style="color:var(--tv-blue)">${fmt(o.entry)}</div></div>
            <div class="top-opp-cell"><div class="lbl">Stop</div><div class="val" style="color:var(--tv-red)">${fmt(o.sl)}</div></div>
            <div class="top-opp-cell"><div class="lbl">TP1</div><div class="val" style="color:var(--tv-green)">${fmt(o.tp1)}</div></div>
            <div class="top-opp-cell"><div class="lbl">TP2</div><div class="val" style="color:var(--tv-green)">${fmt(o.tp2)}</div></div>
          </div>

          <div class="top-opp-actions">
            <button class="top-opp-btn" data-oppchart="${escTg(o.sym)}">
              <span>Grafic &amp; Teză AI</span>
            </button>
            <button class="top-opp-btn ${isBuy ? 'exec-buy' : 'exec-sell'}" data-oppexec="${escTg(o.sym)}">
              <span>Paper ${isBuy ? 'Long' : 'Short'}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-oppchart]').forEach(btn => {
      btn.onclick = () => {
        const sym = btn.dataset.oppchart;
        if (typeof isMobileViewport === 'function' && isMobileViewport() && typeof closeMobileSheetsToChart === 'function') {
          closeMobileSheetsToChart();
        }
        assignSymbolToFocusedPane(sym);
      };
    });

    listEl.querySelectorAll('[data-oppexec]').forEach(btn => {
      btn.onclick = () => {
        const o = (state.topOpps || []).find(x => x.sym === btn.dataset.oppexec);
        if (!o) return;
        executePaperOrder(o.isBuy ? 'buy' : 'sell', o.price, o.sl, o.tp2, { sym: o.sym });
      };
    });
  }

  async function sendTop10ToTelegram() {
    if (!state.topOpps || !state.topOpps.length) {
      await fetchTopMarketOpportunities(false);
    }
    const list = state.topOpps || [];
    if (!list.length) {
      showToast('Telegram Top 10', 'Nu există oportunități scanate de trimis.', 'sell');
      return;
    }
    const dirLabel = state.topOppsDir === 'buy' ? 'DOAR BUY' : state.topOppsDir === 'sell' ? 'DOAR SELL' : 'TOP BUY & SELL';
    const tfLbl = String(state.topOppsTf || '30m').toUpperCase();
    const lines = list.map(o => {
      const sgn = (o.chgPct || 0) >= 0 ? '+' : '';
      const zoneTxt = (o.entryZoneLow != null && o.entryZoneHigh != null) ? `${fmt(o.entryZoneLow)}–${fmt(o.entryZoneHigh)}` : fmt(o.entry);
      return (
        `<b>#${o.rank} ${escTg(o.sym)}</b> · <code>${o.isBuy ? 'BUY' : 'SELL'} ${o.grade}</code> · Prob <b>${o.probPct ?? o.oppScore}%</b> · <i>${escTg(o.catalystBadge || o.setupArchetype || '')}</i>\n` +
        `Preț: <b>${fmt(o.price)}</b> (${sgn}${Number(o.chgPct || 0).toFixed(2)}%) · WR <code>${o.winRate}%</code> · PF <code>${o.profitFactor ?? '—'}</code>\n` +
        `Zonă: <code>${zoneTxt}</code> · SL: <code>${fmt(o.sl)}</code> · TP1: <code>${fmt(o.tp1)}</code> · TP2: <code>${fmt(o.tp2)}</code>`
      );
    });
    const html = `<b>TradePro · Top ${list.length} Oportunități (${dirLabel}) · ${tfLbl}</b>\n\n${lines.join('\n\n')}`;
    try {
      const res = await fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'manual',
          summary: `Top ${list.length} Oportunități (${dirLabel}) ${tfLbl}`,
          html
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Trimis pe Telegram', `Top ${list.length} oportunități (${tfLbl}) livrate în chat.`, 'buy');
      } else {
        showToast('Telegram Eroare', data.error || 'Verifică configurarea botului în tab-ul Telegram.', 'sell');
      }
    } catch (e) {
      showToast('Telegram Eroare', e.message || 'Eroare rețea.', 'sell');
    }
  }

  // Order Flow Summary (Volume Profile POC/VAH/VAL · Bid x Ask Delta)
  function renderOrderFlowSummary(bars, vpvr, fp, cp) {
    const box = document.getElementById('orderflowSummaryBox');
    if (!box || !bars || bars.length < 10) return;

    const recentFp = (fp?.items || []).slice(-20);
    let totBuy = 0, totSell = 0, absorbCnt = 0, imbCnt = 0;
    for (const it of recentFp) {
      totBuy += it.buyVol || 0;
      totSell += it.sellVol || 0;
      if (it.absorption) absorbCnt++;
      if (it.imbalanceUp || it.imbalanceDn) imbCnt++;
    }
    const totVol = Math.max(1, totBuy + totSell);
    const buyPct = (totBuy / totVol) * 100;
    const sellPct = 100 - buyPct;
    const netDelta = totBuy - totSell;
    const rvol = cp?.rvol || 1.0;

    let regime = 'Echilibru Volum';
    let regCls = 'pill-neut';
    if (buyPct >= 54.5 && rvol >= 1.05) {
      regime = 'Acumulare';
      regCls = 'pill-buy';
    } else if (sellPct >= 54.5 && rvol >= 1.05) {
      regime = 'Distribuție';
      regCls = 'pill-sell';
    } else if (buyPct >= 52) {
      regime = 'Bias Ask';
      regCls = 'pill-buy';
    } else if (sellPct >= 52) {
      regime = 'Bias Bid';
      regCls = 'pill-sell';
    }

    const pocTxt = vpvr ? fmt(vpvr.poc) : '—';
    const vahTxt = vpvr ? fmt(vpvr.vah) : '—';
    const valTxt = vpvr ? fmt(vpvr.val) : '—';
    const dSign = netDelta >= 0 ? '+' : '-';

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:7px;min-width:0;">
        <span class="pill ${regCls}">${regime}</span>
        <span class="tabular" style="font-size:10.5px;font-weight:600;color:${netDelta >= 0 ? 'var(--tv-green)' : 'var(--tv-red)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          Proxy Δ ${dSign}${fmtVol(Math.abs(netDelta))} · RVOL ${rvol.toFixed(2)}x
        </span>
      </div>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:600;margin-bottom:3px;">
          <span class="up">Presiune Up [OHLCV] ${buyPct.toFixed(1)}%</span>
          <span class="dn">Down ${sellPct.toFixed(1)}%</span>
        </div>
        <div style="height:5px;border-radius:999px;background:rgba(255,69,58,0.28);overflow:hidden;display:flex;">
          <div style="width:${buyPct.toFixed(1)}%;background:var(--tv-green);"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--r-ctrl);overflow:hidden;margin-bottom:8px;">
        <div class="ticket-box" style="padding:5px 6px;">
          <div class="lbl">POC</div>
          <div class="val amber" style="font-size:11.5px;">${pocTxt}</div>
        </div>
        <div class="ticket-box" style="padding:5px 6px;">
          <div class="lbl">VAH (70%)</div>
          <div class="val" style="font-size:11.5px;color:var(--tv-blue);">${vahTxt}</div>
        </div>
        <div class="ticket-box" style="padding:5px 6px;">
          <div class="lbl">VAL (70%)</div>
          <div class="val" style="font-size:11.5px;color:var(--tv-blue);">${valTxt}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-bottom:5px;">
        <button class="sym-cat-btn ${state.indicators.vpvr ? 'active' : ''}" style="width:100%;padding:0 4px;" data-of-toggle="vpvr">VPVR</button>
        <button class="sym-cat-btn ${state.indicators.tpo ? 'active' : ''}" style="width:100%;padding:0 4px;" data-of-toggle="tpo">TPO</button>
        <button class="sym-cat-btn ${state.indicators.footprint ? 'active' : ''}" style="width:100%;padding:0 4px;" data-of-toggle="footprint">Proxy Δ (${imbCnt})</button>
      </div>
      <button id="openOrderFlowDockBtn" type="button" class="sym-cat-btn" style="width:100%;justify-content:center;font-size:10px;">
        Panou Order Flow L1 + Volume Profile →
      </button>
    `;
    box.querySelectorAll('[data-of-toggle]').forEach(b => {
      b.onclick = () => toggleIndicator(b.dataset.ofToggle);
    });
    box.querySelector('#openOrderFlowDockBtn')?.addEventListener('click', () => {
      openBottomDockTab('orderflow');
    });
  }

  // Crisp TradingView Semi-Circular Gauge
  function drawMiniDial(canvasId, score) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 82, H = 46;
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = W + 'px';
    c.style.height = H + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const tc = getThemeColors();
    const cx = W / 2, cy = H - 5, r = 32;

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = tc.dark ? '#2a2e39' : '#e0e3eb';
    ctx.lineCap = 'butt';
    ctx.stroke();

    const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    grad.addColorStop(0, '#f23645');
    grad.addColorStop(0.5, '#787b86');
    grad.addColorStop(1, '#2962ff');

    const clamped = Math.max(-1, Math.min(1, score || 0));
    const ang = Math.PI + ((clamped + 1) / 2) * Math.PI;

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, ang);
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = grad;
    ctx.lineCap = 'butt';
    ctx.stroke();

    const nx = cx + (r - 5) * Math.cos(ang);
    const ny = cy + (r - 5) * Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = tc.dark ? '#d1d4dc' : '#131722';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = tc.dark ? '#d1d4dc' : '#131722';
    ctx.fill();
  }

  function renderTechDials(tech) {
    drawMiniDial('dialOscCanvas', tech.osc.score);
    drawMiniDial('dialSumCanvas', tech.summary.score);
    drawMiniDial('dialMaCanvas', tech.ma.score);

    const col = (s) => s >= 0.15 ? 'var(--tv-blue)' : s <= -0.15 ? 'var(--tv-red)' : 'var(--text-muted)';
    const setLbl = (id, obj) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = obj.label;
      el.style.color = col(obj.score);
    };
    setLbl('dialOscVerdict', tech.osc);
    setLbl('dialSumVerdict', tech.summary);
    setLbl('dialMaVerdict', tech.ma);

    document.getElementById('dialCountsRow').innerHTML = `
      <span class="pill pill-sell" style="width:100%;">Sell: ${tech.summary.sell}</span>
      <span class="pill pill-neut" style="width:100%;">Neutru: ${tech.summary.neutral}</span>
      <span class="pill pill-buy" style="width:100%;">Buy: ${tech.summary.buy}</span>
    `;

    const tbl = document.getElementById('techBreakdownBody');
    if (tbl) {
      tbl.innerHTML = tech.details.slice(0, 14).map(d => {
        const cls = d.action === 'CUMPĂRĂ' ? 'up' : d.action === 'VINDE' ? 'dn' : '';
        return `<tr>
          <td>${d.name}</td>
          <td class="tabular" style="text-align:right;">${fmt(d.val)}</td>
          <td class="${cls}" style="text-align:right;font-weight:700;">${d.action}</td>
        </tr>`;
      }).join('');
    }
  }

  // Multi-Timeframe Confluence Matrix (5m · 15m · 1h · 4h · 1d)
  let mtfToken = 0;
  async function refreshMTFMatrix(symbol) {
    const myToken = ++mtfToken;
    const grid = document.getElementById('mtfMatrixGrid');
    if (!grid) return;
    const tfs = ['5m', '15m', '1h', '4h', '1d'];
    grid.innerHTML = tfs.map(t => `
      <div class="mtf-cell">
        <div style="font-size:9.5px;font-weight:600;color:var(--text-muted);">${t.toUpperCase()}</div>
        <div style="font-size:10px;margin-top:2px;color:var(--text-muted);">...</div>
      </div>
    `).join('');

    const results = await Promise.all(tfs.map(async (tf) => {
      try {
        if (tf === state.tf && state.fullBars.length > 35) {
          const s = Q.runSmartSignalEngine(state.fullBars);
          return { tf, cp: s.currentPlan };
        }
        const { bars } = await fetchOHLCV(symbol, tf);
        const s = Q.runSmartSignalEngine(bars);
        return { tf, cp: s.currentPlan };
      } catch (_) {
        return { tf, cp: null };
      }
    }));

    if (myToken !== mtfToken) return;
    grid.innerHTML = results.map(({ tf, cp }) => {
      if (!cp) {
        return `<div class="mtf-cell">
          <div style="font-size:9.5px;font-weight:600;color:var(--text-muted);">${tf.toUpperCase()}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">N/A</div>
        </div>`;
      }
      const bull = cp.stBull;
      const col = bull ? 'var(--tv-green)' : 'var(--tv-red)';
      const lbl = (cp.status === 'BUY_NOW' || cp.status === 'SETUP_BUY') ? 'BUY'
        : (cp.status === 'SELL_NOW' || cp.status === 'SETUP_SELL') ? 'SELL'
          : (bull ? 'BULL' : 'BEAR');
      return `<div class="mtf-cell ${bull ? 'bull' : 'bear'}" data-mtf="${tf}" title="Schimbă graficul pe ${tf}">
        <div style="font-size:9.5px;font-weight:600;color:var(--text-muted);">${tf.toUpperCase()}</div>
        <div style="font-size:10.5px;font-weight:700;color:${col};margin-top:2px;">${lbl}</div>
        <div class="tabular" style="font-size:9px;color:var(--text-muted);">RSI ${cp.rsi.toFixed(0)}</div>
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-mtf]').forEach(el => {
      el.onclick = () => switchTimeframe(el.dataset.mtf);
    });
  }

  function renderFibonacciPanel(bars) {
    const fib = state.lastFibOut || Q.calcAutoFib(bars, 60);
    if (!fib) return;
    const cur = bars[bars.length - 1].close;

    document.getElementById('fibSwingHighVal').textContent = fmt(fib.swingHigh);
    document.getElementById('fibSwingLowVal').textContent = fmt(fib.swingLow);
    document.getElementById('fibGoldenZoneVal').textContent = `${fmt(Math.min(fib.gpBot, fib.gpTop))} – ${fmt(Math.max(fib.gpBot, fib.gpTop))}`;

    document.getElementById('fibLevelsBody').innerHTML = fib.levels.map(l => {
      const dist = ((l.price / cur) - 1) * 100;
      const near = Math.abs(dist) < 0.65;
      return `<tr style="${near ? 'background:rgba(245,158,11,0.12);font-weight:700;' : ''}">
        <td>${l.label}% ${l.label === '61.8' ? '<span class="pill pill-warn" style="padding:0 4px;font-size:8.5px;">GP</span>' : ''}</td>
        <td style="text-align:right;">${fmt(l.price)}</td>
        <td class="${dist >= 0 ? 'up' : 'dn'}" style="text-align:right;">${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%</td>
      </tr>`;
    }).join('');

    document.getElementById('fibExtTableBody').innerHTML = fib.extensions.map(l => {
      const dist = ((l.price / cur) - 1) * 100;
      return `<tr>
        <td>Ext ${l.label}%</td>
        <td style="text-align:right;">${fmt(l.price)}</td>
        <td class="${dist >= 0 ? 'up' : 'dn'}" style="text-align:right;">${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%</td>
      </tr>`;
    }).join('');

    const piv = Q.calcPivotPoints(bars);
    if (piv) {
      document.getElementById('pivotsTableBody').innerHTML = [
        ['R3', piv.R3, 'dn'], ['R2', piv.R2, 'dn'], ['R1', piv.R1, 'dn'],
        ['PIVOT', piv.P, 'amber'],
        ['S1', piv.S1, 'up'], ['S2', piv.S2, 'up'], ['S3', piv.S3, 'up']
      ].map(([k, v, c]) => `<tr><td class="${c}" style="font-weight:800;">${k}</td><td style="text-align:right;">${fmt(v)}</td></tr>`).join('');
    }
  }

  function renderForecastPanel(fc) {
    if (!fc) return;
    document.getElementById('fcBullVal').textContent = fmt(fc.bullTarget);
    document.getElementById('fcBullPct').textContent = `${fc.bullPct >= 0 ? '+' : ''}${fc.bullPct.toFixed(2)}%`;
    document.getElementById('fcBaseVal').textContent = fmt(fc.baseTarget);
    document.getElementById('fcBasePct').textContent = `${fc.basePct >= 0 ? '+' : ''}${fc.basePct.toFixed(2)}%`;
    document.getElementById('fcBearVal').textContent = fmt(fc.bearTarget);
    document.getElementById('fcBearPct').textContent = `${fc.bearPct >= 0 ? '+' : ''}${fc.bearPct.toFixed(2)}%`;
    document.getElementById('fcConfVal').textContent = `${fc.confidence}%`;
    document.getElementById('fcConfBarFill').style.width = `${fc.confidence}%`;

    const matchesEl = document.getElementById('fcAnalogList');
    if (matchesEl) {
      matchesEl.innerHTML = fc.topMatches.length
        ? fc.topMatches.map((m, idx) => `
          <div class="reason-chip ${m.movePct >= 0 ? 'bull' : 'bear'}">
            <div style="display:flex;justify-content:space-between;font-weight:800;">
              <span>Analog #${idx + 1} · ${m.dateStr}</span>
              <span class="${m.movePct >= 0 ? 'up' : 'dn'}">${m.movePct >= 0 ? '+' : ''}${m.movePct.toFixed(2)}%</span>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
              Max Runup: +${m.maxUpPct.toFixed(1)}% · Max Drawdown: ${m.maxDnPct.toFixed(1)}%
            </div>
          </div>
        `).join('')
        : '<div style="color:var(--text-muted);font-size:11px;">Date istorice insuficiente pentru analogii k-NN.</div>';
    }
  }

  // ─── 10. BOTTOM DOCK: STRATEGY TESTER · SCREENER · PAPER TRADING ──────────
  function openBottomDockTab(tabName) {
    const dock = document.getElementById('bottomDock');
    dock.classList.add('expanded');
    document.getElementById('bdToggleIcon').innerHTML = ICO.chevDn;

    if (isMobileViewport()) {
      document.getElementById('rightPanel')?.classList.remove('mobile-open');
      document.getElementById('leftToolbar')?.classList.remove('mob-draw-open');
      document.getElementById('mobDrawToggleBtn')?.classList.remove('active');
      const mnavKey = tabName === 'screener' ? 'screener' : 'paper';
      document.querySelectorAll('[data-mnav]').forEach(b => {
        b.classList.toggle('active', b.dataset.mnav === mnavKey);
      });
    }

    document.querySelectorAll('.bd-tab').forEach(b => b.classList.toggle('active', b.dataset.bdtab === tabName));
    document.querySelectorAll('.bd-body').forEach(p => p.classList.toggle('active', p.id === `bd-${tabName}`));
    setTimeout(resizeAllCharts, 190);

    if (tabName === 'screener' && state.screenerResults.length === 0) {
      runGlobalScreener();
    }
    window.dispatchEvent(new CustomEvent('tp:bottomTabOpened', { detail: { tab: tabName, sym: getActiveFocusedSymbol(), tf: state.tf } }));
  }

  function renderBacktestDock(sigOut) {
    const st = sigOut.stats;
    document.getElementById('btNetRet').textContent = `${st.netReturnPct >= 0 ? '+' : ''}${st.netReturnPct}%`;
    document.getElementById('btNetRet').className = `bt-kpi-val ${st.netReturnPct >= 0 ? 'up' : 'dn'}`;
    document.getElementById('btWinRate').textContent = `${st.winRate}%`;
    document.getElementById('btWinRate').className = `bt-kpi-val ${st.winRate >= 50 ? 'up' : 'amber'}`;
    document.getElementById('btPF').textContent = st.profitFactor.toFixed(2);
    document.getElementById('btTradesCnt').textContent = `${st.totalTrades} (${st.wins}W / ${st.losses}L)`;
    document.getElementById('btAvgR').textContent = `${st.avgR >= 0 ? '+' : ''}${st.avgR}R`;
    document.getElementById('btMaxDD').textContent = `-${st.maxDrawdownPct}%`;

    // Draw Equity Curve Sparkline
    const c = document.getElementById('btEquityCanvas');
    if (c && st.equityCurve.length > 1) {
      const dpr = window.devicePixelRatio || 1;
      const W = 175, H = 44;
      c.width = W * dpr; c.height = H * dpr;
      c.style.width = W + 'px'; c.style.height = H + 'px';
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      const eq = st.equityCurve;
      const mn = Math.min(...eq) * 0.998;
      const mx = Math.max(...eq) * 1.002;
      const span = Math.max(0.01, mx - mn);
      ctx.beginPath();
      eq.forEach((v, i) => {
        const x = 3 + (i / (eq.length - 1)) * (W - 6);
        const y = H - 4 - ((v - mn) / span) * (H - 8);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = eq[eq.length - 1] >= 100 ? '#089981' : '#f23645';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Trade Log Table
    const tbody = document.getElementById('btTradesBody');
    tbody.innerHTML = sigOut.trades.map(t => {
      const dt = new Date(t.entryTime * 1000).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: '2-digit' });
      const rVal = t.rMultiple != null ? `${t.rMultiple >= 0 ? '+' : ''}${t.rMultiple}R` : 'În curs';
      const cls = t.rMultiple > 0 ? 'up' : t.rMultiple < 0 ? 'dn' : 'amber';
      return `<tr data-jump-idx="${t.entryIdx}">
        <td>${dt}</td>
        <td><span class="pill ${t.isBuy ? 'pill-buy' : 'pill-sell'}">${t.isBuy ? 'BUY' : 'SELL'} ${t.grade}</span></td>
        <td class="mob-hide-col">${t.archetype}</td>
        <td>${fmt(t.entry)}</td>
        <td class="dn">${fmt(t.sl)}</td>
        <td class="up mob-hide-col">${fmt(t.tp1)} / ${fmt(t.tp2)}</td>
        <td class="mob-hide-col">${t.exitPrice ? fmt(t.exitPrice) : '—'}</td>
        <td class="${cls}" style="font-weight:800;">${t.outcome} (${rVal})</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-jump-idx]').forEach(row => {
      row.onclick = () => {
        const idx = parseInt(row.dataset.jumpIdx, 10);
        closeMobileSheetsToChart();
        if (mainChart && !isNaN(idx)) {
          mainChart.timeScale().setVisibleLogicalRange({ from: Math.max(0, idx - 25), to: Math.min(state.bars.length + 8, idx + 35) });
        }
      };
    });
  }

  // Parallel Batched Global Smart Screener (Stocks · ETFs · Bonds · Crypto · AI Filter)
  function getAssetCategory(sym) {
    const upper = String(sym || '').toUpperCase();
    const hit = SYMBOL_CATALOG.find(c => c.sym === upper);
    if (hit?.cat) return hit.cat;
    if (upper.endsWith('-USD')) return 'crypto';
    if (upper.endsWith('=F')) return 'commodities';
    if (upper === '^TNX') return 'bonds';
    if (upper.startsWith('^')) return 'indices';
    if (upper.endsWith('=X')) return 'forex';
    return 'stocks';
  }

  function parseScreenerInput(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) return { customSyms: [], aiQuery: '' };
    const clauses = raw.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    const customSyms = [];
    const aiParts = [];
    const aiRegex = /[<>]=?|=|\b(rsi|rvol|score|scor|winrate|chg|vwap|macd|ema21|buy|sell|long|short|bull|bear|oversold|overbought)\b|a\+/i;

    for (const cl of clauses) {
      if (aiRegex.test(cl)) {
        aiParts.push(cl);
      } else {
        cl.split(/\s+/).forEach(tok => {
          const norm = normalizeSymbol(tok);
          if (norm && /^[A-Z0-9.^=\-]+$/.test(norm) && !/^\d+(\.\d+)?$/.test(norm)) {
            customSyms.push(norm);
          }
        });
      }
    }
    return { customSyms, aiQuery: aiParts.join(' ') };
  }

  function matchesScreenerAiQuery(r, aiStr) {
    const q = String(aiStr || '').trim().toLowerCase();
    if (!q) return true;

    const cmpMatches = [...q.matchAll(/\b(rsi|rvol|score|scor|winrate|chg)\s*(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)/g)];
    for (const m of cmpMatches) {
      const field = m[1];
      const op = m[2];
      const target = parseFloat(m[3]);
      const actual = field === 'rsi' ? r.rsi
        : field === 'rvol' ? r.cp.rvol
          : field === 'winrate' ? r.winRate
            : field === 'chg' ? r.chgPct
              : r.cp.score;
      if (op === '<' && !(actual < target)) return false;
      if (op === '<=' && !(actual <= target)) return false;
      if (op === '>' && !(actual > target)) return false;
      if (op === '>=' && !(actual >= target)) return false;
      if (op === '=' && Math.abs(actual - target) > 0.5) return false;
    }

    if (q.includes('a+') && r.cp.grade !== 'A+') return false;
    if (/\bvwap\b/.test(q) && !r.aboveVwap) return false;
    if (/\bmacd\b/.test(q) && !r.macdBull) return false;
    if (/\bema21\b/.test(q) && !r.aboveEma21) return false;
    if (/\b(buy|long|bull)\b/.test(q) && !(r.cp.status === 'BUY_NOW' || r.cp.status === 'HOLD_LONG')) return false;
    if (/\b(sell|short|bear)\b/.test(q) && !(r.cp.status === 'SELL_NOW' || r.cp.status === 'HOLD_SHORT')) return false;
    if (/\boversold\b/.test(q) && !(r.rsi < 35)) return false;
    if (/\boverbought\b/.test(q) && !(r.rsi > 68)) return false;

    return true;
  }

  function mapOppToScreenerRow(o) {
    const catMap = { 'Acțiuni': 'stocks', 'ETF': 'etf', 'Crypto': 'crypto', 'Futures': 'commodities', 'Indici': 'stocks', 'Forex': 'commodities' };
    return {
      sym: o.sym,
      cat: catMap[o.cat] || getAssetCategory(o.sym),
      price: o.price,
      chgPct: o.chgPct,
      rsi: o.rsi,
      aboveVwap: o.aboveVwap,
      aboveEma21: o.aboveEma21,
      macdBull: o.macdBull,
      cp: {
        status: o.status,
        grade: o.grade,
        score: o.oppScore,
        rvol: o.rvol,
        entry: o.entry,
        sl: o.sl,
        tp1: o.tp1,
        tp2: o.tp2,
        setupArchetype: o.setupArchetype,
        badgeClass: o.badgeClass || (o.isBuy ? 'buy' : 'sell')
      },
      winRate: o.winRate,
      pf: o.profitFactor
    };
  }

  async function runTop10InScreener(forceRefresh = true) {
    const statusEl = document.getElementById('screenerStatusText');
    const tbody = document.getElementById('screenerTableBody');
    state.screenerFilter = 'top10';
    document.querySelectorAll('[data-scrfilter]').forEach(x => x.classList.toggle('active', x.dataset.scrfilter === 'top10'));
    if (statusEl) statusEl.textContent = 'Scanez piața globală (Top 10 BUY / SELL)...';
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">Descoperă oportunitățile live din toată piața (TV Movers + Yahoo Gainers/Losers + Crypto)...</td></tr>`;
    }
    const pack = await fetchTopMarketOpportunities(forceRefresh);
    if (pack && Array.isArray(pack.opportunities)) {
      state.screenerTop10Results = pack.opportunities.map(mapOppToScreenerRow);
      if (statusEl) {
        statusEl.textContent = `Top 10 Piață (${String(pack.tf || '30m').toUpperCase()}) · ${pack.evaluatedCount} active scanate (${pack.buyCount} BUY / ${pack.sellCount} SELL)`;
      }
    } else if (statusEl) {
      statusEl.textContent = 'Eroare la scanarea Top 10 piață';
    }
    renderScreenerTable();
  }

  let screenerBusy = false;
  async function runGlobalScreener() {
    if (state.screenerFilter === 'top10') {
      return runTop10InScreener(true);
    }
    if (screenerBusy) return;
    screenerBusy = true;
    const statusEl = document.getElementById('screenerStatusText');
    const tbody = document.getElementById('screenerTableBody');
    const customRaw = document.getElementById('screenerCustomInput')?.value || '';
    const { customSyms, aiQuery } = parseScreenerInput(customRaw);
    state.screenerAiQuery = aiQuery;

    const topMoverSyms = (state.topOpps || []).map(x => x.sym);
    const pool = Array.from(new Set([
      ...customSyms,
      ...state.watchlist.map(w => w.sym),
      ...topMoverSyms,
      ...SCREENER_UNIVERSE
    ]));

    statusEl.textContent = `Scanez ${pool.length} simboluri în paralel...`;
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);">Analizez confluența instituțională + Order Flow + Backtest pe ${pool.length} piețe...</td></tr>`;

    const results = [];
    const batchSize = 6;
    for (let i = 0; i < pool.length; i += batchSize) {
      const batch = pool.slice(i, i + batchSize);
      statusEl.textContent = `Progres scanare: ${Math.min(pool.length, i + batchSize)} / ${pool.length}`;
      const chunkOut = await Promise.all(batch.map(async (sym) => {
        try {
          const { bars, demo } = await fetchOHLCV(sym, '1d');
          if (demo || bars.length < 25) return null;
          const sig = Q.runSmartSignalEngine(bars);
          const cp = sig.currentPlan;
          if (!cp) return null;
          const last = bars[bars.length - 1];
          const prev = bars[bars.length - 2];
          const chgPct = ((last.close - prev.close) / prev.close) * 100;
          const closes = bars.map(x => x.close);
          const rsiArr = Q.calcRSIArray(closes, 14);
          const rsi = rsiArr[rsiArr.length - 1] ?? 50;
          const vwapObj = Q.calcVWAP(bars);
          const vwapNow = vwapObj.vwap[vwapObj.vwap.length - 1] || last.close;
          const ema21Arr = Q.calcEMAArray(closes, 21);
          const md = Q.calcMACD(bars);
          return {
            sym,
            cat: getAssetCategory(sym),
            price: last.close,
            chgPct,
            rsi,
            aboveVwap: last.close >= vwapNow,
            aboveEma21: last.close >= (ema21Arr[ema21Arr.length - 1] || last.close),
            macdBull: (md.hist[md.hist.length - 1] || 0) > 0,
            cp,
            winRate: sig.stats.winRate,
            pf: sig.stats.profitFactor
          };
        } catch (_) {
          return null;
        }
      }));
      chunkOut.forEach(item => { if (item) results.push(item); });
    }

    const rankOrder = { BUY_NOW: 6, SELL_NOW: 5, SETUP_BUY: 4, SETUP_SELL: 3, HOLD_LONG: 2, HOLD_SHORT: 1, WAIT_SETUP: 0 };
    results.sort((a, b) => {
      const ra = rankOrder[a.cp.status] || 0;
      const rb = rankOrder[b.cp.status] || 0;
      if (rb !== ra) return rb - ra;
      return b.cp.score - a.cp.score;
    });

    state.screenerResults = results;
    statusEl.textContent = `Actualizat ${new Date().toLocaleTimeString('ro-RO')} · ${results.length} active analizate`;
    renderScreenerTable();
    screenerBusy = false;
  }

  function getFilteredScreenerList() {
    const f = state.screenerFilter;
    let list = f === 'top10'
      ? (state.screenerTop10Results || (state.topOpps || []).map(mapOppToScreenerRow))
      : state.screenerResults;
    if (f === 'buy') list = list.filter(x => x.cp.status === 'BUY_NOW' || x.cp.status === 'SETUP_BUY' || (x.cp.status === 'HOLD_LONG' && x.cp.score >= 68));
    else if (f === 'sell') list = list.filter(x => x.cp.status === 'SELL_NOW' || x.cp.status === 'SETUP_SELL' || x.cp.status === 'HOLD_SHORT');
    else if (f === 'stocks') list = list.filter(x => x.cat === 'stocks');
    else if (f === 'etf') list = list.filter(x => x.cat === 'etf');
    else if (f === 'bonds') list = list.filter(x => x.cat === 'bonds');
    else if (f === 'crypto') list = list.filter(x => x.cat === 'crypto' || x.cat === 'commodities');
    else if (f === 'rvol') list = list.filter(x => x.cp.rvol >= 1.25);

    if (state.screenerAiQuery) {
      list = list.filter(x => matchesScreenerAiQuery(x, state.screenerAiQuery));
    }
    const rawScrTxt = document.getElementById('screenerCustomInput')?.value.trim() || '';
    if (rawScrTxt && !/[<>=\s]|vwap|rsi|rvol|macd|bull|bear|buy|sell|ema|score/i.test(rawScrTxt)) {
      const tok = rawScrTxt.toUpperCase();
      const matched = list.filter(x => {
        const catName = (SYMBOL_CATALOG.find(c => c.sym === x.sym)?.name || officialIdentityCache[x.sym]?.desc || '').toUpperCase();
        return x.sym.includes(tok) || catName.includes(tok);
      });
      if (matched.length > 0) list = matched;
    }
    return list;
  }

  function renderScreenerTable() {
    const tbody = document.getElementById('screenerTableBody');
    const hmWrap = document.getElementById('screenerHeatmapWrap');
    const tblWrap = document.getElementById('screenerTableWrap');
    const list = getFilteredScreenerList();

    if (hmWrap && tblWrap) {
      hmWrap.style.display = state.heatmapMode ? 'grid' : 'none';
      tblWrap.style.display = state.heatmapMode ? 'none' : 'block';
    }

    if (state.heatmapMode && hmWrap) {
      if (!list.length) {
        hmWrap.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:22px;color:var(--text-muted);">Niciun activ găsit. Apasă Scanează Piața.</div>`;
        return;
      }
      hmWrap.innerHTML = list.map(r => {
        const pct = r.chgPct || 0;
        const intensity = Math.min(0.94, 0.68 + Math.abs(pct) * 0.06);
        const bg = pct >= 0
          ? `rgba(16, 185, 129, ${intensity.toFixed(2)})`
          : `rgba(239, 68, 68, ${intensity.toFixed(2)})`;
        const sigLbl = r.cp.status === 'BUY_NOW' ? `BUY ${r.cp.grade}`
          : r.cp.status === 'SETUP_BUY' ? `SETUP BUY`
            : r.cp.status === 'SELL_NOW' ? `SELL ${r.cp.grade}`
              : r.cp.status === 'SETUP_SELL' ? `SETUP SELL`
                : `Scor ${r.cp.score}`;
        return `
          <div class="hm-tile" data-scr-sym="${r.sym}" style="background:${bg};">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
              <div style="display:flex;align-items:center;gap:6px;">
                ${renderLogoAvatar(r.sym, 'sm')}
                <span style="font-weight:800;font-size:12px;color:#fff;">${r.sym}</span>
              </div>
              <span style="font-size:9.5px;font-weight:700;color:rgba(255,255,255,0.92);background:rgba(0,0,0,0.26);padding:2px 7px;border-radius:999px;">${sigLbl}</span>
            </div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:baseline;">
              <span class="tabular" style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.92);">${fmt(r.price)}</span>
              <span class="tabular" style="font-size:12.5px;font-weight:800;color:#fff;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
            </div>
            <div style="font-size:9.5px;color:rgba(255,255,255,0.78);margin-top:2px;">RVOL ${r.cp.rvol.toFixed(1)}x · RSI ${Math.round(r.rsi)}</div>
          </div>
        `;
      }).join('');
      hmWrap.querySelectorAll('[data-scr-sym]').forEach(el => {
        el.onclick = () => assignSymbolToFocusedPane(el.dataset.scrSym);
      });
      return;
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:22px;color:var(--text-muted);">Niciun simbol nu corespunde filtrului curent. Selectează "Toate" sau apasă Scanează Piața.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(r => {
      const cp = r.cp;
      const pillCls = cp.badgeClass === 'buy' ? 'pill-buy' : cp.badgeClass === 'sell' ? 'pill-sell' : 'pill-warn';
      const dotCls = cp.badgeClass === 'buy' ? 'buy' : cp.badgeClass === 'sell' ? 'sell' : 'wait';
      const tag = cp.status === 'BUY_NOW' ? `BUY ACTIV ${cp.grade}`
        : cp.status === 'SETUP_BUY' ? `SETUP BUY ${cp.grade}`
          : cp.status === 'HOLD_LONG' ? `LONG ${cp.grade}`
            : cp.status === 'SELL_NOW' ? `SELL ACTIV ${cp.grade}`
              : cp.status === 'SETUP_SELL' ? `SETUP SELL ${cp.grade}`
                : cp.status === 'HOLD_SHORT' ? `BEARISH ${cp.grade}`
                  : `WAIT`;
      return `<tr data-scr-sym="${r.sym}">
        <td>
          <div style="display:flex;align-items:center;gap:7px;">
            ${renderLogoAvatar(r.sym, 'sm')}
            <span style="font-weight:800;color:var(--text-bright);">${r.sym}</span>
          </div>
        </td>
        <td>${fmt(r.price)}</td>
        <td class="${r.chgPct >= 0 ? 'up' : 'dn'}" style="font-weight:700;">${r.chgPct >= 0 ? '+' : ''}${r.chgPct.toFixed(2)}%</td>
        <td><span class="pill ${pillCls}"><span class="sig-dot ${dotCls}"></span>${tag}</span></td>
        <td style="font-weight:700;">${cp.score}/100 · RSI ${Math.round(r.rsi)}</td>
        <td class="mob-hide-col" style="color:var(--text-muted);">${cp.setupArchetype}</td>
        <td>${fmt(cp.entry)}</td>
        <td class="dn">${fmt(cp.sl)}</td>
        <td class="up mob-hide-col">${fmt(cp.tp1)} / ${fmt(cp.tp2)}</td>
        <td class="mob-hide-col">${r.winRate}% · RVOL ${cp.rvol.toFixed(1)}x</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-scr-sym]').forEach(tr => {
      tr.onclick = () => assignSymbolToFocusedPane(tr.dataset.scrSym);
    });
  }

  function downloadBlobCsv(filename, rows) {
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportBacktestCSV() {
    const trades = state.lastSignalOut?.trades || [];
    if (!trades.length) {
      showToast('Nicio Tranzacție', 'Nu există tranzacții istorice pe acest interval.', 'sell');
      return;
    }
    const rows = ['Date,Symbol,Direction,Grade,Archetype,Entry,StopLoss,TP1,TP2,ExitPrice,Outcome,R_Multiple'];
    trades.forEach(t => {
      const iso = new Date(t.entryTime * 1000).toISOString().slice(0, 10);
      rows.push(`${iso},${state.symbol},${t.isBuy ? 'BUY' : 'SELL'},${t.grade},"${t.archetype}",${t.entry},${t.sl},${t.tp1},${t.tp2},${t.exitPrice || ''},${t.outcome},${t.rMultiple ?? ''}`);
    });
    downloadBlobCsv(`Backtest_${state.symbol}_${state.tf}.csv`, rows);
    showToast('Export Backtest CSV', `${trades.length} tranzacții exportate pentru ${state.symbol}.`, 'buy', state.symbol);
  }

  function exportScreenerCSV() {
    const list = getFilteredScreenerList();
    if (!list.length) {
      showToast('Scanner Gol', 'Rulează mai întâi Scanează Piața pentru a exporta rezultatele.', 'sell');
      return;
    }
    const rows = ['Symbol,Category,Price,Change24hPct,Status,Grade,Score,RSI14,RVOL,Entry,StopLoss,TP1,TP2,WinRatePct'];
    list.forEach(r => {
      rows.push(`${r.sym},${r.cat},${r.price},${r.chgPct.toFixed(2)},${r.cp.status},${r.cp.grade},${r.cp.score},${r.rsi.toFixed(1)},${r.cp.rvol.toFixed(2)},${r.cp.entry},${r.cp.sl},${r.cp.tp1},${r.cp.tp2},${r.winRate}`);
    });
    downloadBlobCsv(`Screener_Market_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    showToast('Export Screener CSV', `${list.length} active exportate în CSV.`, 'buy');
  }

  // ─── 11. MULTI-PORTFOLIO (7 PORTOFOLII ULTIMATE) & RISK CALCULATOR ────────
  function savePaper() {
    try {
      state.portfolios[state.activePortfolio] = state.paper;
      localStorage.setItem('tp_ultra_portfolios_v1', JSON.stringify(state.portfolios));
      localStorage.setItem('tp_ultra_active_pf', state.activePortfolio);
      localStorage.setItem('tp_ultra_paper', JSON.stringify(state.paper));
    } catch (_) { }
  }

  function switchPortfolio(pfKey) {
    if (!state.portfolios[pfKey]) return;
    state.activePortfolio = pfKey;
    state.paper = state.portfolios[pfKey];
    localStorage.setItem('tp_ultra_active_pf', pfKey);
    const balInp = document.getElementById('calcBalanceInput');
    const rskInp = document.getElementById('calcRiskPctInput');
    if (balInp) balInp.value = state.paper.balance;
    if (rskInp) rskInp.value = state.paper.riskPct;
    updatePositionCalculator();
  }

  function exportPaperCSV() {
    const pos = state.paper.positions || [];
    const rows = ['Portfolio,Symbol,Side,Quantity,EntryPrice,LastPrice,StopLoss,TakeProfit,OpenPnL_USD'];
    pos.forEach(p => {
      const pnl = ((p.isBuy ? (p.lastPrice - p.entry) : (p.entry - p.lastPrice)) * p.qty).toFixed(2);
      rows.push(`${state.activePortfolio},${p.sym},${p.isBuy ? 'LONG' : 'SHORT'},${p.qty},${p.entry},${p.lastPrice},${p.sl},${p.tp},${pnl}`);
    });
    downloadBlobCsv(`Portofoliu_${state.activePortfolio.toUpperCase()}.csv`, rows);
    showToast('Portofoliu Exportat CSV', `${pos.length} poziții salvate din ${state.activePortfolio.toUpperCase()}.`, 'buy');
  }

  function updatePositionCalculator() {
    const bal = parseFloat(document.getElementById('calcBalanceInput')?.value || state.paper.balance) || 10000;
    const riskPct = parseFloat(document.getElementById('calcRiskPctInput')?.value || state.paper.riskPct) || 1.0;
    state.paper.balance = bal;
    state.paper.riskPct = riskPct;
    savePaper();

    const cp = state.lastSignalOut?.currentPlan;
    const outEl = document.getElementById('calcResultStrip');
    if (!cp || !outEl) return;

    const maxLossUsd = bal * (riskPct / 100);
    const perUnitRisk = Math.max(0.0001, Math.abs(cp.entry - cp.sl));
    const units = maxLossUsd / perUnitRisk;
    const posValue = units * cp.entry;
    const tp2Gain = units * Math.abs(cp.tp2 - cp.entry);

    outEl.innerHTML = `
      <span>Risc Max: <b class="dn">-$${maxLossUsd.toFixed(2)}</b></span>
      <span>Mărime Optimă: <b style="color:var(--tv-blue)">${units >= 10 ? Math.floor(units) : units.toFixed(3)} unități</b> ($${posValue.toFixed(0)})</span>
      <span>Profit Estimat TP2 (3R): <b class="up">+$${tp2Gain.toFixed(2)}</b></span>
    `;
    renderPaperPositions();
  }

  function executePaperOrder(side, price, customSL = null, customTP = null, opts = {}) {
    const targetSym = opts.sym ? normalizeSymbol(opts.sym) : state.symbol;
    const entry = price || (targetSym === state.symbol && state.bars.length ? state.bars[state.bars.length - 1].close : (liveQuoteCache[targetSym]?.price || 0));
    if (!entry) return;
    const cp = targetSym === state.symbol ? state.lastSignalOut?.currentPlan : null;
    const atr = cp?.atr || entry * 0.015;
    const isBuy = side === 'buy';
    const sl = customSL || (isBuy ? entry - 1.5 * atr : entry + 1.5 * atr);
    const tp = customTP || (isBuy ? entry + 3.0 * atr : entry - 3.0 * atr);

    const riskUsd = state.paper.balance * (state.paper.riskPct / 100);
    const qty = opts.qty && isFinite(opts.qty)
      ? +Number(opts.qty).toFixed(3)
      : Math.max(0.01, +(riskUsd / Math.max(0.0001, Math.abs(entry - sl))).toFixed(3));

    state.paper.positions.unshift({
      id: Date.now() + Math.floor(Math.random() * 1000),
      sym: targetSym,
      isBuy,
      qty,
      entry,
      sl,
      tp,
      lastPrice: entry,
      openedAt: Date.now()
    });
    savePaper();
    renderPaperPositions();
    playChime(isBuy);
    showToast(
      opts.fromTelegram ? `Ordin Telegram ${isBuy ? 'LONG' : 'SHORT'}` : `Ordin Paper ${isBuy ? 'BUY' : 'SHORT'} Executat`,
      `${qty} ${targetSym} @ ${fmt(entry)} | SL ${fmt(sl)} | TP ${fmt(tp)}`,
      isBuy ? 'buy' : 'sell',
      targetSym
    );
    openBottomDockTab('paper');

    if (!opts.fromTelegram) {
      notifyTelegramEvent('trades', {
        sym: targetSym,
        tf: state.tf,
        includeActions: true,
        summary: `Ordin Paper ${isBuy ? 'LONG' : 'SHORT'} ${qty} ${targetSym} @ ${fmt(entry)}`,
        html:
          `<b>Ordin Paper ${isBuy ? 'LONG' : 'SHORT'} · ${escTg(targetSym)}</b>\n` +
          `Cantitate: <code>${qty}</code> @ <b>${fmt(entry)}</b>\n` +
          `Stop-Loss: <code>${fmt(sl)}</code> · Take-Profit: <code>${fmt(tp)}</code>`
      });
    }
  }

  function executePaperFromPlan(cp) {
    if (!cp) return;
    const cur = state.bars.length ? state.bars[state.bars.length - 1].close : cp.entry;
    executePaperOrder(cp.isBuy ? 'buy' : 'sell', cur, cp.sl, cp.tp2);
  }

  function closePaperPosition(id, fromTelegram = false) {
    const idx = state.paper.positions.findIndex(p => p.id === id);
    if (idx === -1) return;
    const p = state.paper.positions[idx];
    const cur = p.sym === state.symbol && state.bars.length
      ? state.bars[state.bars.length - 1].close
      : (liveQuoteCache[p.sym]?.price ?? p.lastPrice ?? p.entry);
    const pnl = (p.isBuy ? (cur - p.entry) : (p.entry - cur)) * p.qty;
    state.paper.balance = +(state.paper.balance + pnl).toFixed(2);
    state.paper.closedPnl = +((state.paper.closedPnl || 0) + pnl).toFixed(2);
    state.paper.positions.splice(idx, 1);
    try {
      const j = JSON.parse(localStorage.getItem('tp_ultra_journal') || '[]');
      const riskPerUnit = Math.max(0.0001, Math.abs(p.entry - (p.sl || p.entry)));
      const rMult = (p.isBuy ? (cur - p.entry) : (p.entry - cur)) / riskPerUnit;
      j.unshift({
        id: Date.now(),
        sym: p.sym,
        side: p.isBuy ? 'LONG' : 'SHORT',
        qty: p.qty,
        entry: p.entry,
        exit: cur,
        pnl: Number(pnl.toFixed(2)),
        rMultiple: Number(rMult.toFixed(2)),
        portfolio: state.activePortfolio,
        closedAt: new Date().toLocaleString('ro-RO', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      });
      localStorage.setItem('tp_ultra_journal', JSON.stringify(j.slice(0, 80)));
    } catch (_) { }
    savePaper();
    const balInp = document.getElementById('calcBalanceInput');
    if (balInp) balInp.value = state.paper.balance;
    renderPaperPositions();

    if (!fromTelegram) {
      notifyTelegramEvent('trades', {
        sym: p.sym,
        tf: state.tf,
        includeActions: false,
        summary: `Poziție închisă ${p.sym}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
        html:
          `<b>Poziție Paper Închisă · ${escTg(p.sym)}</b>\n` +
          `Direcție: <code>${p.isBuy ? 'LONG' : 'SHORT'}</code> · Ieșire: <b>${fmt(cur)}</b>\n` +
          `Rezultat P&amp;L: <b>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</b> · Sold: <code>$${state.paper.balance.toFixed(2)}</code>`
      });
    }
  }

  function renderPaperPositions() {
    const tbody = document.getElementById('paperPositionsBody');
    const summaryEl = document.getElementById('paperEquitySummary');
    if (!tbody) return;

    let openPnl = 0;
    state.paper.positions.forEach(p => {
      if (p.sym === state.symbol && state.bars.length) {
        p.lastPrice = state.bars[state.bars.length - 1].close;
      }
      openPnl += (p.isBuy ? (p.lastPrice - p.entry) : (p.entry - p.lastPrice)) * p.qty;
    });

    if (summaryEl) {
      const eq = state.paper.balance + openPnl;
      summaryEl.innerHTML = `Echitate Live: <b>$${eq.toFixed(2)}</b> · P&L Deschis: <b class="${openPnl >= 0 ? 'up' : 'dn'}">${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)}</b> · P&L Realizat: <b class="${state.paper.closedPnl >= 0 ? 'up' : 'dn'}">${state.paper.closedPnl >= 0 ? '+' : ''}$${(state.paper.closedPnl || 0).toFixed(2)}</b>`;
    }

    if (!state.paper.positions.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-muted);">Nicio poziție Paper activă. Apasă butoanele SELL / BUY din colțul graficului sau "Simulează în Paper".</td></tr>`;
      return;
    }

    tbody.innerHTML = state.paper.positions.map(p => {
      const pnl = (p.isBuy ? (p.lastPrice - p.entry) : (p.entry - p.lastPrice)) * p.qty;
      const pct = ((p.isBuy ? (p.lastPrice - p.entry) : (p.entry - p.lastPrice)) / p.entry) * 100;
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:7px;">
            ${renderLogoAvatar(p.sym, 'sm')}
            <span style="font-weight:800;">${p.sym}</span>
          </div>
        </td>
        <td><span class="pill ${p.isBuy ? 'pill-buy' : 'pill-sell'}">${p.isBuy ? 'LONG' : 'SHORT'}</span></td>
        <td class="mob-hide-col">${p.qty}</td>
        <td>${fmt(p.entry)}</td>
        <td>${fmt(p.lastPrice)}</td>
        <td class="dn mob-hide-col">${fmt(p.sl)}</td>
        <td class="${pnl >= 0 ? 'up' : 'dn'}" style="font-weight:700;">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</td>
        <td><button class="pill pill-sell" data-close-pos="${p.id}">Închide ${ICO.close}</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-close-pos]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        closePaperPosition(Number(btn.dataset.closePos));
      };
    });
    window.dispatchEvent(new CustomEvent('tp:paperUpdated', { detail: { positions: state.paper.positions, balance: state.paper.balance, closedPnl: state.paper.closedPnl || 0, portfolio: state.activePortfolio } }));
  }

  // ─── 12. REAL-TIME STREAMING ENGINE, SPLIT-DIGIT WATCHLIST & LIVE INDICES ─
  const LIVE_INDICES = [
    { sym: 'NQ=F', label: 'NAS 100' },
    { sym: 'ES=F', label: 'S&P 500' },
    { sym: 'YM=F', label: 'DOW 30' },
    { sym: '^VIX', label: 'VIX' },
    { sym: 'BTC-USD', label: 'BTC' },
    { sym: 'EGLD-USD', label: 'EGLD' },
    { sym: 'ETH-USD', label: 'ETH' },
    { sym: 'GC=F', label: 'GOLD' },
    { sym: 'CL=F', label: 'OIL WTI' },
    { sym: 'EURUSD=X', label: 'EUR/USD' }
  ];
  const liveQuoteCache = {};
  const fullQuoteCache = {};
  let yahooWs = null;
  let yahooWsReady = false;
  let yahooReconnectTimer = null;
  let binanceWs = null;
  let binanceReconnectTimer = null;
  let liveQuoteBusy = false;
  let lastOverlayTickDraw = 0;
  const cryptoTickThrottle = {};

  function getActiveFocusedSymbol() {
    if (state.layout !== '1' && state.focusedPaneId > 0) {
      const p = secPanes.find(x => x.id === state.focusedPaneId);
      if (p) return p.sym;
    }
    return state.symbol;
  }

  function renderLiveIndicesStrip() {
    const strip = document.getElementById('liveIndicesStrip');
    if (!strip) return;
    const activeSym = getActiveFocusedSymbol();
    strip.innerHTML = LIVE_INDICES.map(it => {
      const sid = safeId(it.sym);
      const q = liveQuoteCache[it.sym];
      const chgPct = q?.chgPct ?? 0;
      const cls = chgPct >= 0 ? 'up' : 'dn';
      const pHtml = q?.html || (q?.price != null ? formatSplitTickHTML(null, q.price, chgPct >= 0 ? 1 : -1) : '—');
      const cTxt = q?.chgPct != null ? `${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%` : '—';
      return `
        <button class="idx-live-pill ${activeSym === it.sym ? 'active-idx' : ''}" data-idxsym="${it.sym}" title="Click pentru a încărca ${it.label} (${it.sym}) pe ecranul selectat">
          ${renderLogoAvatar(it.sym, 'sm')}
          <span class="idx-name">${it.label}</span>
          <span id="idxp_${sid}" class="idx-price tabular">${pHtml}</span>
          <span id="idxc_${sid}" class="idx-chg tabular ${cls}">${cTxt}</span>
        </button>
      `;
    }).join('');

    strip.querySelectorAll('[data-idxsym]').forEach(btn => {
      btn.onclick = () => assignSymbolToFocusedPane(btn.dataset.idxsym);
    });
  }

  function saveWatchlist() {
    try {
      const clean = state.watchlist.map(w => ({ sym: w.sym, name: w.name }));
      localStorage.setItem('tp_ultra_watchlist_v4', JSON.stringify(clean));
      localStorage.setItem('tp_ultra_watchlist', JSON.stringify(clean));
    } catch (_) { }
  }

  function buildWatchlistExtSubHtml(extType, extPrice, extChg, extChgPct) {
    if (!extType || extPrice == null || !isFinite(extPrice)) return '';
    const isPre = extType === 'PRE';
    const ico = isPre ? ICO.preSun : ICO.postMoon;
    const lbl = isPre ? 'Pre-Market' : 'Post-Market';
    const c = Number(extChg) || 0;
    const p = Number(extChgPct) || 0;
    const cls = p >= 0 ? 'up' : 'dn';
    const sign = p >= 0 ? '+' : '';
    return `
      <span class="wl-ext-tag ${isPre ? 'pre' : 'post'}">${ico}<span>${lbl}</span></span>
      <span class="wl-ext-vals tabular">
        <b style="color:var(--text-bright);">${fmt(extPrice)}</b>
        <span class="${cls}">${c >= 0 ? '+' : ''}${fmtChg(c, extPrice)} (${sign}${p.toFixed(2)}%)</span>
      </span>
    `;
  }

  const WL_SWIPE_SNAP_PX = 88;
  const WL_SWIPE_OPEN_THRESH = 44;

  const wlDragState = {
    wired: false,
    pointerId: null,
    isTouch: false,
    startedOnGrip: false,
    fromSym: '',
    fromIdx: -1,
    startX: 0,
    startY: 0,
    lastY: 0,
    gestureMode: '', // '' | 'swipe' | 'reorder'
    dragging: false,
    swiping: false,
    deleting: false,
    swipeStartOffset: 0,
    swipeCurrentOffset: 0,
    swipeRowWidth: 260,
    openSwipeSym: '',
    openSwipeOffset: 0,
    hadOpenBeforeDown: false,
    wheelSym: '',
    wheelOffset: 0,
    wheelTimer: null,
    pendingRender: false,
    dropSym: '',
    dropAfter: false,
    ghostEl: null,
    scrollRaf: null,
    suppressClickUntil: 0
  };

  function findWlWrap(container, sym) {
    if (!container || !sym) return null;
    const wraps = container.querySelectorAll('.wl-item-wrap');
    for (let i = 0; i < wraps.length; i++) {
      if (wraps[i].dataset.wlwrap === sym) return wraps[i];
    }
    return null;
  }

  function findWlRow(container, sym) {
    if (!container || !sym) return null;
    const rows = container.querySelectorAll('.wl-row');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].dataset.wlsym === sym) return rows[i];
    }
    return null;
  }

  function getFullSwipeThreshold(rowWidth) {
    return Math.min(152, Math.max(122, Math.round((rowWidth || 260) * 0.54)));
  }

  function applySwipeVisualToWrap(wrapEl, offsetPx, animate) {
    if (!wrapEl) return;
    const rowEl = wrapEl.querySelector('.wl-row');
    if (!rowEl) return;
    const leftBtn = wrapEl.querySelector('.wl-swipe-del-btn.left');
    const rightBtn = wrapEl.querySelector('.wl-swipe-del-btn.right');
    const rowWidth = rowEl.offsetWidth || 260;
    const fullThresh = getFullSwipeThreshold(rowWidth);

    if (animate) rowEl.classList.add('wl-snap-anim');
    else rowEl.classList.remove('wl-snap-anim');

    const rounded = Math.abs(offsetPx) < 0.5 ? 0 : Math.round(offsetPx);
    if (rounded > 0) {
      wrapEl.classList.add('swiping-right');
      wrapEl.classList.remove('swiping-left');
      rowEl.style.transform = `translate3d(${rounded}px, 0, 0)`;
      if (leftBtn) {
        leftBtn.style.width = `${Math.max(WL_SWIPE_SNAP_PX, rounded)}px`;
        leftBtn.classList.toggle('full-armed', rounded >= fullThresh);
      }
      if (rightBtn) rightBtn.classList.remove('full-armed');
    } else if (rounded < 0) {
      wrapEl.classList.add('swiping-left');
      wrapEl.classList.remove('swiping-right');
      rowEl.style.transform = `translate3d(${rounded}px, 0, 0)`;
      if (rightBtn) {
        rightBtn.style.width = `${Math.max(WL_SWIPE_SNAP_PX, Math.abs(rounded))}px`;
        rightBtn.classList.toggle('full-armed', Math.abs(rounded) >= fullThresh);
      }
      if (leftBtn) leftBtn.classList.remove('full-armed');
    } else {
      rowEl.style.transform = '';
      if (leftBtn) { leftBtn.style.width = ''; leftBtn.classList.remove('full-armed'); }
      if (rightBtn) { rightBtn.style.width = ''; rightBtn.classList.remove('full-armed'); }
      if (animate) {
        setTimeout(() => {
          if (!rowEl.style.transform) {
            wrapEl.classList.remove('swiping-right', 'swiping-left');
          }
        }, 205);
      } else {
        wrapEl.classList.remove('swiping-right', 'swiping-left');
      }
    }
  }

  function closeOpenWatchlistSwipe(animate = true) {
    const container = document.getElementById('watchlistContainer');
    if (!wlDragState.openSwipeSym) return;
    const wrapEl = findWlWrap(container, wlDragState.openSwipeSym);
    wlDragState.openSwipeSym = '';
    wlDragState.openSwipeOffset = 0;
    if (wrapEl) applySwipeVisualToWrap(wrapEl, 0, animate);
  }

  function deleteWatchlistSymbolAnimated(sym, dirSign = 1) {
    if (!sym || wlDragState.deleting) return;
    const container = document.getElementById('watchlistContainer');
    const wrapEl = findWlWrap(container, sym);
    const rowEl = wrapEl ? wrapEl.querySelector('.wl-row') : null;

    const finalizeRemoval = () => {
      wlDragState.deleting = false;
      wlDragState.swiping = false;
      if (wlDragState.openSwipeSym === sym) {
        wlDragState.openSwipeSym = '';
        wlDragState.openSwipeOffset = 0;
      }
      state.watchlist = state.watchlist.filter(x => x.sym !== sym);
      saveWatchlist();
      wlDragState.pendingRender = false;
      renderWatchlist();
      syncTelegramBridge();
      showToast('Watchlist', `${sym} a fost șters din listă`);
    };

    if (!wrapEl || !rowEl) {
      finalizeRemoval();
      return;
    }

    wlDragState.deleting = true;
    wlDragState.suppressClickUntil = performance.now() + 300;
    const sign = dirSign >= 0 ? 1 : -1;
    const outPx = sign * Math.max(300, (rowEl.offsetWidth || 260) + 24);

    wrapEl.classList.toggle('swiping-right', sign > 0);
    wrapEl.classList.toggle('swiping-left', sign < 0);
    const activeBtn = wrapEl.querySelector(sign > 0 ? '.wl-swipe-del-btn.left' : '.wl-swipe-del-btn.right');
    if (activeBtn) {
      activeBtn.style.width = '100%';
      activeBtn.classList.add('full-armed');
    }

    rowEl.classList.add('wl-snap-anim');
    rowEl.style.transform = `translate3d(${outPx}px, 0, 0)`;

    const startH = wrapEl.offsetHeight || 42;
    wrapEl.style.maxHeight = `${startH}px`;
    void wrapEl.offsetHeight;
    wrapEl.classList.add('wl-removing');
    wrapEl.style.maxHeight = '0px';
    wrapEl.style.opacity = '0';

    setTimeout(finalizeRemoval, 195);
  }

  function wireWatchlistDragReorder() {
    const container = document.getElementById('watchlistContainer');
    if (!container || wlDragState.wired) return;
    wlDragState.wired = true;

    container.addEventListener('dragstart', (e) => e.preventDefault());

    // Close open swipe row when clicking anywhere outside the exposed delete button or pressing Escape
    document.addEventListener('pointerdown', (e) => {
      if (!wlDragState.openSwipeSym) return;
      if (e.target.closest?.('.wl-swipe-del-btn')) return;
      if (!container.contains(e.target)) {
        closeOpenWatchlistSwipe(true);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wlDragState.openSwipeSym) {
        closeOpenWatchlistSwipe(true);
      }
    });

    // MacBook two-finger horizontal trackpad swipe support
    container.addEventListener('wheel', (e) => {
      if (wlDragState.dragging || wlDragState.swiping || wlDragState.deleting) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.35 || Math.abs(e.deltaX) < 2) return;
      const wrapEl = e.target.closest?.('.wl-item-wrap[data-wlwrap]');
      if (!wrapEl) return;
      const sym = wrapEl.dataset.wlwrap;
      if (!sym) return;

      e.preventDefault();
      if (wlDragState.openSwipeSym && wlDragState.openSwipeSym !== sym) {
        closeOpenWatchlistSwipe(true);
      }
      if (wlDragState.wheelSym !== sym) {
        wlDragState.wheelSym = sym;
        wlDragState.wheelOffset = (wlDragState.openSwipeSym === sym) ? wlDragState.openSwipeOffset : 0;
      }
      // Natural trackpad scrolling: fingers moving left->right yields negative deltaX => +moveDx
      const moveDx = -e.deltaX;
      wlDragState.wheelOffset = Math.max(-124, Math.min(124, wlDragState.wheelOffset + moveDx));
      applySwipeVisualToWrap(wrapEl, wlDragState.wheelOffset, false);

      if (wlDragState.wheelTimer) clearTimeout(wlDragState.wheelTimer);
      wlDragState.wheelTimer = setTimeout(() => {
        wlDragState.wheelTimer = null;
        const curWrap = findWlWrap(container, sym);
        const off = wlDragState.wheelOffset;
        wlDragState.wheelSym = '';
        wlDragState.wheelOffset = 0;
        if (!curWrap) return;
        if (Math.abs(off) >= WL_SWIPE_OPEN_THRESH) {
          const snapOff = off > 0 ? WL_SWIPE_SNAP_PX : -WL_SWIPE_SNAP_PX;
          wlDragState.openSwipeSym = sym;
          wlDragState.openSwipeOffset = snapOff;
          applySwipeVisualToWrap(curWrap, snapOff, true);
        } else {
          if (wlDragState.openSwipeSym === sym) {
            wlDragState.openSwipeSym = '';
            wlDragState.openSwipeOffset = 0;
          }
          applySwipeVisualToWrap(curWrap, 0, true);
        }
      }, 135);
    }, { passive: false });

    const clearDropIndicators = () => {
      container.querySelectorAll('.wl-drop-before, .wl-drop-after').forEach(el => {
        el.classList.remove('wl-drop-before', 'wl-drop-after');
      });
    };

    const updateDropTargetAtY = (clientY) => {
      clearDropIndicators();
      const rows = Array.from(container.querySelectorAll('.wl-row'));
      if (!rows.length) return;

      let targetRow = null;
      let placeAfter = false;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rect = r.getBoundingClientRect();
        const midY = rect.top + rect.height * 0.5;
        if (clientY < midY) {
          targetRow = r;
          placeAfter = false;
          break;
        }
        targetRow = r;
        placeAfter = true;
      }

      if (targetRow) {
        wlDragState.dropSym = targetRow.dataset.wlsym || '';
        wlDragState.dropAfter = placeAfter;
        if (wlDragState.dropSym !== wlDragState.fromSym) {
          targetRow.classList.add(placeAfter ? 'wl-drop-after' : 'wl-drop-before');
        }
      }
    };

    const stepAutoScroll = () => {
      if (!wlDragState.dragging) {
        wlDragState.scrollRaf = null;
        return;
      }
      const scrollEl = container.scrollHeight > container.clientHeight + 2
        ? container
        : (container.closest('.rpage') || container);
      const cRect = scrollEl.getBoundingClientRect();
      const edgePx = 34;
      let delta = 0;
      if (wlDragState.lastY < cRect.top + edgePx) {
        delta = -Math.ceil(((cRect.top + edgePx - wlDragState.lastY) / edgePx) * 8);
      } else if (wlDragState.lastY > cRect.bottom - edgePx) {
        delta = Math.ceil(((wlDragState.lastY - (cRect.bottom - edgePx)) / edgePx) * 8);
      }
      if (delta !== 0) {
        scrollEl.scrollTop += delta;
        updateDropTargetAtY(wlDragState.lastY);
      }
      wlDragState.scrollRaf = requestAnimationFrame(stepAutoScroll);
    };

    const finishGesture = (commit) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);

      if (wlDragState.scrollRaf) {
        cancelAnimationFrame(wlDragState.scrollRaf);
        wlDragState.scrollRaf = null;
      }
      if (wlDragState.ghostEl) {
        wlDragState.ghostEl.remove();
        wlDragState.ghostEl = null;
      }
      document.body.classList.remove('wl-reordering', 'wl-swiping');
      container.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
      clearDropIndicators();

      const mode = wlDragState.gestureMode;
      const wasDragging = wlDragState.dragging;
      const wasSwiping = wlDragState.swiping;
      const fromSym = wlDragState.fromSym;
      const dropSym = wlDragState.dropSym;
      const dropAfter = wlDragState.dropAfter;
      const swipeOff = wlDragState.swipeCurrentOffset;
      const rowWidth = wlDragState.swipeRowWidth;
      const hadOpen = wlDragState.hadOpenBeforeDown;
      const needRender = wlDragState.pendingRender;

      wlDragState.pointerId = null;
      wlDragState.isTouch = false;
      wlDragState.startedOnGrip = false;
      wlDragState.gestureMode = '';
      wlDragState.dragging = false;
      wlDragState.swiping = false;
      wlDragState.pendingRender = false;
      wlDragState.fromSym = '';
      wlDragState.fromIdx = -1;
      wlDragState.dropSym = '';
      wlDragState.swipeStartOffset = 0;
      wlDragState.swipeCurrentOffset = 0;
      wlDragState.hadOpenBeforeDown = false;

      if (mode === 'swipe' && wasSwiping) {
        wlDragState.suppressClickUntil = performance.now() + 260;
        const wrapEl = findWlWrap(container, fromSym);
        const fullThresh = getFullSwipeThreshold(rowWidth);

        if (commit && Math.abs(swipeOff) >= fullThresh) {
          deleteWatchlistSymbolAnimated(fromSym, swipeOff > 0 ? 1 : -1);
          return;
        }
        if (commit && Math.abs(swipeOff) >= WL_SWIPE_OPEN_THRESH) {
          const snapOff = swipeOff > 0 ? WL_SWIPE_SNAP_PX : -WL_SWIPE_SNAP_PX;
          wlDragState.openSwipeSym = fromSym;
          wlDragState.openSwipeOffset = snapOff;
          if (wrapEl) applySwipeVisualToWrap(wrapEl, snapOff, true);
        } else {
          if (wlDragState.openSwipeSym === fromSym) {
            wlDragState.openSwipeSym = '';
            wlDragState.openSwipeOffset = 0;
          }
          if (wrapEl) applySwipeVisualToWrap(wrapEl, 0, true);
        }
        if (needRender && !wlDragState.deleting) renderWatchlist();
        return;
      }

      if (mode === 'reorder' && wasDragging) {
        wlDragState.suppressClickUntil = performance.now() + 240;
        if (commit && fromSym && dropSym && fromSym !== dropSym) {
          const oldIdx = state.watchlist.findIndex(x => x.sym === fromSym);
          if (oldIdx !== -1) {
            const [movedItem] = state.watchlist.splice(oldIdx, 1);
            let targetIdx = state.watchlist.findIndex(x => x.sym === dropSym);
            if (targetIdx === -1) {
              state.watchlist.push(movedItem);
            } else {
              if (dropAfter) targetIdx += 1;
              state.watchlist.splice(targetIdx, 0, movedItem);
            }
            saveWatchlist();
            renderWatchlist();
            syncTelegramBridge();
            return;
          }
        }
        if (needRender) renderWatchlist();
        return;
      }

      // Simple tap without dragging: if a swipe action was open, dismiss it cleanly first (iOS behavior)
      if (hadOpen) {
        closeOpenWatchlistSwipe(true);
        wlDragState.suppressClickUntil = performance.now() + 220;
      }
    };

    const startReorderVisual = () => {
      wlDragState.gestureMode = 'reorder';
      wlDragState.dragging = true;
      closeOpenWatchlistSwipe(false);
      document.body.classList.add('wl-reordering');

      const srcRow = findWlRow(container, wlDragState.fromSym);
      const srcRect = srcRow ? srcRow.getBoundingClientRect() : container.getBoundingClientRect();
      if (srcRow) srcRow.classList.add('is-dragging');

      const lq = liveQuoteCache[wlDragState.fromSym];
      const wlIt = state.watchlist.find(x => x.sym === wlDragState.fromSym);
      const pVal = wlIt?.regPrice ?? lq?.regPrice ?? wlIt?.price ?? lq?.price;
      const ghost = document.createElement('div');
      ghost.id = 'wlDragGhost';
      ghost.style.width = `${Math.max(180, Math.round(srcRect.width - 8))}px`;
      ghost.style.left = `${Math.round(srcRect.left + 4)}px`;
      ghost.innerHTML = `
        <div style="display:flex;align-items:center;gap:7px;min-width:0;">
          ${renderLogoAvatar(wlDragState.fromSym, 'sm')}
          <span>${escTg(wlDragState.fromSym)}</span>
        </div>
        <span class="tabular" style="color:var(--text-muted);font-weight:600;">${pVal != null && isFinite(pVal) ? fmt(pVal) : ''}</span>
      `;
      document.body.appendChild(ghost);
      wlDragState.ghostEl = ghost;

      if (!wlDragState.scrollRaf) {
        wlDragState.scrollRaf = requestAnimationFrame(stepAutoScroll);
      }
    };

    const onPointerMove = (e) => {
      if (e.pointerId !== wlDragState.pointerId) return;
      const dy = e.clientY - wlDragState.startY;
      const dx = e.clientX - wlDragState.startX;
      wlDragState.lastY = e.clientY;

      if (!wlDragState.gestureMode) {
        if (Math.hypot(dx, dy) < 6) return;

        // Touch ergonomics: vertical swipe on row body must NEVER block native Watchlist scroll;
        // touch reordering uses the dedicated left drag grip, while horizontal swipe opens Delete!
        if (wlDragState.isTouch && wlDragState.startedOnGrip && state.watchlist.length >= 2) {
          startReorderVisual();
        } else {
          const isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.18
            || (!wlDragState.isTouch && state.watchlist.length < 2)
            || (wlDragState.swipeStartOffset !== 0 && Math.abs(dx) >= Math.abs(dy));

          if (isHorizontal) {
            wlDragState.gestureMode = 'swipe';
            wlDragState.swiping = true;
            document.body.classList.add('wl-swiping');
            if (wlDragState.openSwipeSym && wlDragState.openSwipeSym !== wlDragState.fromSym) {
              closeOpenWatchlistSwipe(true);
            }
            const wrapEl = findWlWrap(container, wlDragState.fromSym);
            const rowEl = wrapEl ? wrapEl.querySelector('.wl-row') : null;
            wlDragState.swipeRowWidth = rowEl ? (rowEl.offsetWidth || 260) : 260;
          } else if (wlDragState.isTouch) {
            // Release pointer immediately so native browser vertical touch scroll runs at 60fps
            finishGesture(false);
            return;
          } else {
            startReorderVisual();
          }
        }
      }

      if (wlDragState.gestureMode === 'swipe') {
        e.preventDefault();
        const maxPull = wlDragState.swipeRowWidth;
        const nextOff = Math.max(-maxPull, Math.min(maxPull, wlDragState.swipeStartOffset + dx));
        wlDragState.swipeCurrentOffset = nextOff;
        const wrapEl = findWlWrap(container, wlDragState.fromSym);
        if (wrapEl) applySwipeVisualToWrap(wrapEl, nextOff, false);
        return;
      }

      if (wlDragState.gestureMode === 'reorder' && wlDragState.dragging) {
        e.preventDefault();
        if (wlDragState.ghostEl) {
          wlDragState.ghostEl.style.top = `${Math.round(e.clientY - 16)}px`;
        }
        updateDropTargetAtY(e.clientY);
      }
    };

    const onPointerUp = (e) => {
      if (e.pointerId !== wlDragState.pointerId) return;
      finishGesture(true);
    };

    const onPointerCancel = (e) => {
      if (e.pointerId !== wlDragState.pointerId) return;
      finishGesture(false);
    };

    container.addEventListener('pointerdown', (e) => {
      if (wlDragState.deleting) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest?.('.wl-swipe-del-btn')) return;

      const row = e.target.closest?.('.wl-row[data-wlsym]');
      if (!row) return;

      const sym = row.dataset.wlsym;
      const idx = state.watchlist.findIndex(x => x.sym === sym);
      if (!sym || idx === -1) return;

      const isTouch = e.pointerType === 'touch';
      const onGrip = !!e.target.closest?.('.wl-drag-grip');
      if (isTouch && onGrip) {
        e.preventDefault();
      }

      const hadOpen = !!wlDragState.openSwipeSym;
      const sameOpen = wlDragState.openSwipeSym === sym;
      if (hadOpen && !sameOpen) {
        closeOpenWatchlistSwipe(true);
      }

      wlDragState.pointerId = e.pointerId;
      wlDragState.isTouch = isTouch;
      wlDragState.startedOnGrip = onGrip;
      wlDragState.fromSym = sym;
      wlDragState.fromIdx = idx;
      wlDragState.startX = e.clientX;
      wlDragState.startY = e.clientY;
      wlDragState.lastY = e.clientY;
      wlDragState.gestureMode = '';
      wlDragState.dragging = false;
      wlDragState.swiping = false;
      wlDragState.hadOpenBeforeDown = hadOpen;
      wlDragState.swipeStartOffset = sameOpen ? wlDragState.openSwipeOffset : 0;
      wlDragState.swipeCurrentOffset = wlDragState.swipeStartOffset;
      wlDragState.swipeRowWidth = row.offsetWidth || 260;
      wlDragState.dropSym = sym;
      wlDragState.dropAfter = false;

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    });
  }

  function renderWatchlist() {
    const container = document.getElementById('watchlistContainer');
    if (!container) return;
    if (wlDragState.dragging || wlDragState.swiping || wlDragState.deleting) {
      wlDragState.pendingRender = true;
      return;
    }
    wireWatchlistDragReorder();
    const activeSym = getActiveFocusedSymbol();
    syncChartWatchlistBtn(activeSym);
    const prevOpenSym = wlDragState.openSwipeSym;
    const prevOpenOff = wlDragState.openSwipeOffset;

    container.innerHTML = state.watchlist.map((w) => {
      const sid = safeId(w.sym);
      const lq = liveQuoteCache[w.sym];
      const regP = w.regPrice ?? lq?.regPrice ?? w.price;
      const regC = w.regChg ?? lq?.regChg ?? w.chg;
      const regPct = w.regChgPct ?? lq?.regChgPct ?? w.chgPct ?? 0;
      const cls = regPct >= 0 ? 'up' : 'dn';
      const cachedDesc = officialIdentityCache[w.sym]?.desc;
      const catDesc = SYMBOL_CATALOG.find(c => c.sym === w.sym)?.name || DEFAULT_WATCHLIST.find(c => c.sym === w.sym)?.name;
      const dispName = (w.name && w.name !== w.sym) ? w.name : (cachedDesc || catDesc || w.sym);
      const priceHtml = w.livePriceHtml || lq?.regHtml || (regP != null ? formatSplitTickHTML(null, regP, regPct >= 0 ? 1 : -1) : '—');

      const extType = w.extType || lq?.extType || '';
      const extPrice = w.extPrice ?? lq?.extPrice;
      const extChg = w.extChg ?? lq?.extChg;
      const extChgPct = w.extChgPct ?? lq?.extChgPct;
      const hasExt = !!(extType && extPrice != null && isFinite(extPrice));
      const sessCls = extType === 'PRE' ? 'pre' : extType === 'POST' ? 'post' : '';
      const sessTitle = extType === 'PRE' ? 'Pre-Market activ' : extType === 'POST' ? 'Post-Market activ' : '';
      const sessSvg = extType === 'PRE' ? ICO.preSun : extType === 'POST' ? ICO.postMoon : '';

      return `
        <div class="wl-item-wrap" data-wlwrap="${w.sym}">
          <div class="wl-swipe-bg" aria-hidden="true">
            <button type="button" class="wl-swipe-del-btn left" data-swipedel="${w.sym}" data-swipedir="1" tabindex="-1">
              ${ICO.trash}
              <span>Șterge</span>
            </button>
            <button type="button" class="wl-swipe-del-btn right" data-swipedel="${w.sym}" data-swipedir="-1" tabindex="-1">
              <span>Șterge</span>
              ${ICO.trash}
            </button>
          </div>
          <div class="wl-row ${w.sym === activeSym ? 'active' : ''}" data-wlsym="${w.sym}" title="Click pentru grafic · Swipe stânga→dreapta pentru ștergere · Trage sus/jos pentru reordonare">
            <span class="wl-drag-grip">${ICO.grip}</span>
            <div style="display:flex;align-items:center;gap:7px;min-width:0;">
              ${renderLogoAvatar(w.sym, '')}
              <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:4px;">
                  <span style="font-weight:700;color:var(--text-bright);font-size:11.5px;">${w.sym}</span>
                  <span id="wlsess_${sid}" class="wl-sess-ico ${sessCls}" style="display:${hasExt ? 'inline-flex' : 'none'};" title="${sessTitle}">${sessSvg}</span>
                </div>
                <div id="wln_${sid}" style="font-size:9.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dispName}</div>
              </div>
            </div>
            <div id="wlp_${sid}" class="tabular" style="text-align:right;font-weight:700;">${priceHtml}</div>
            <div id="wld_${sid}" class="tabular ${cls}" style="text-align:right;font-size:11px;">${regC != null ? (regC >= 0 ? '+' : '') + fmtChg(regC, regP) : '—'}</div>
            <div id="wlc_${sid}" class="tabular ${cls}" style="text-align:right;font-weight:700;">${w.chgPct != null || lq?.regChgPct != null ? (regPct >= 0 ? '+' : '') + regPct.toFixed(2) + '%' : '—'}</div>
            <div id="wlext_${sid}" class="wl-ext-line" style="display:${hasExt ? 'flex' : 'none'};">${hasExt ? buildWatchlistExtSubHtml(extType, extPrice, extChg, extChgPct) : ''}</div>
          </div>
        </div>
      `;
    }).join('');

    if (prevOpenSym && prevOpenOff) {
      const restoredWrap = findWlWrap(container, prevOpenSym);
      if (restoredWrap) {
        applySwipeVisualToWrap(restoredWrap, prevOpenOff, false);
      } else {
        wlDragState.openSwipeSym = '';
        wlDragState.openSwipeOffset = 0;
      }
    }

    container.querySelectorAll('[data-wlsym]').forEach(row => {
      row.onclick = () => {
        if (performance.now() < wlDragState.suppressClickUntil) return;
        if (wlDragState.openSwipeSym) {
          closeOpenWatchlistSwipe(true);
          return;
        }
        assignSymbolToFocusedPane(row.dataset.wlsym);
      };
    });
    container.querySelectorAll('[data-swipedel]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dir = Number(btn.dataset.swipedir) || 1;
        deleteWatchlistSymbolAnimated(btn.dataset.swipedel, dir);
      };
    });
  }

  function getTfStepSeconds(tf) {
    const t = String(tf || '').toLowerCase();
    const m = t.match(/^(\d+)(s|m|h)$/);
    if (m) {
      const n = Math.max(1, parseInt(m[1], 10));
      if (m[2] === 's') return n;
      if (m[2] === 'm') return n * 60;
      if (m[2] === 'h') return n * 3600;
    }
    if (t === '1d') return 86400;
    if (t === '1wk') return 7 * 86400;
    if (t === '1mo') return 30 * 86400;
    return 0;
  }

  function positionYAxisCountdownTag(cdText) {
    const tag = document.getElementById('yAxisCountdownTag');
    if (!tag) return;
    if (!mainSeries || !state.bars.length || state.replay.active) {
      tag.style.display = 'none';
      return;
    }
    const last = state.bars[state.bars.length - 1];
    const y = mainSeries.priceToCoordinate(last.close);
    if (y == null || !isFinite(y) || y < 10) {
      tag.style.display = 'none';
      return;
    }
    if (cdText) tag.textContent = cdText;
    tag.classList.toggle('bear', last.close < last.open);
    tag.style.top = `${Math.round(y + 11)}px`;
    tag.style.display = 'block';
  }

  function updateBarCountdown() {
    const badge = document.getElementById('barCountdownBadge');
    const tf = String(state.tf || '').toLowerCase();
    let txt = 'LIVE';
    const tickMatch = tf.match(/^(\d+)t$/);
    if (tickMatch) {
      const target = Math.max(10, parseInt(tickMatch[1], 10));
      txt = `${state.liveTickCount % target}/${target}T`;
    } else {
      const step = getTfStepSeconds(tf);
      if (step > 0 && step <= 86400) {
        const nowSec = Math.floor(Date.now() / 1000);
        const rem = step - (nowSec % step);
        const hrs = Math.floor(rem / 3600);
        const mins = Math.floor((rem % 3600) / 60);
        const secs = rem % 60;
        const pad = n => String(n).padStart(2, '0');
        txt = hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
      }
    }
    if (badge) badge.textContent = txt;
    positionYAxisCountdownTag(txt);
  }

  // Unified Real-Time Tick Processor (called by Yahoo WS, Binance WS, and 1.2s Quote Stream)
  function applyLiveTick(rawSym, liveP, meta = {}) {
    if (!rawSym || liveP == null || !isFinite(liveP) || liveP <= 0) return;
    const sym = String(rawSym).toUpperCase();

    const dot = document.getElementById('mktSessionDot');
    if (dot && !dot.classList.contains('ping')) {
      dot.classList.add('ping');
      setTimeout(() => dot.classList.remove('ping'), 240);
    }

    const prevEntry = liveQuoteCache[sym];
    const is24h = sym.endsWith('-USD') || sym.endsWith('=X') || sym.endsWith('=F');
    const mktState = meta.mktState || prevEntry?.mktState || '';

    // Separate Regular Session vs Pre-Market / Post-Market Extended Session cleanly
    let regPrice = meta.regPrice ?? prevEntry?.regPrice ?? liveP;
    const prevClose = meta.prevClose ?? prevEntry?.prevClose ?? (meta.regChg != null ? regPrice - meta.regChg : (meta.chg != null ? liveP - meta.chg : null));
    let regChg = meta.regChg != null ? meta.regChg : (prevEntry?.regChg != null && meta.extType === undefined && prevEntry?.extType ? prevEntry.regChg : (meta.chg != null ? meta.chg : (prevClose ? regPrice - prevClose : (prevEntry?.chg ?? 0))));
    let regChgPct = meta.regChgPct != null ? meta.regChgPct : (prevEntry?.regChgPct != null && meta.extType === undefined && prevEntry?.extType ? prevEntry.regChgPct : (meta.chgPct != null ? meta.chgPct : (prevClose ? ((regPrice - prevClose) / prevClose) * 100 : (prevEntry?.chgPct ?? 0))));

    let extType = meta.extType !== undefined ? meta.extType : (prevEntry?.extType || '');
    let extPrice = meta.extPrice !== undefined ? meta.extPrice : (prevEntry?.extPrice ?? null);
    let extChg = meta.extChg !== undefined ? meta.extChg : (prevEntry?.extChg ?? null);
    let extChgPct = meta.extChgPct !== undefined ? meta.extChgPct : (prevEntry?.extChgPct ?? null);
    let extTime = meta.extTime !== undefined ? meta.extTime : (prevEntry?.extTime ?? null);

    // If a sub-second WebSocket tick arrives during Pre-Market or Post-Market, route it to Extended Price!
    if (meta.extType === undefined && extType && !is24h && mktState !== 'REGULAR') {
      extPrice = liveP;
      extChg = isFinite(regPrice) ? liveP - regPrice : 0;
      extChgPct = (isFinite(regPrice) && regPrice) ? (extChg / regPrice) * 100 : 0;
      extTime = Math.floor(Date.now() / 1000);
    } else if (mktState === 'REGULAR' || is24h) {
      regPrice = liveP;
      regChg = meta.chg != null ? meta.chg : (prevClose ? liveP - prevClose : regChg);
      regChgPct = meta.chgPct != null ? meta.chgPct : (prevClose ? ((liveP - prevClose) / prevClose) * 100 : regChgPct);
    }

    const prevPrice = prevEntry?.price;
    const prevRegPrice = prevEntry?.regPrice ?? prevPrice;
    const prevExtPrice = prevEntry?.extPrice;
    const hasTickDiff = prevPrice != null && Math.abs(liveP - prevPrice) > 1e-9;
    const hasRegDiff = prevRegPrice != null && Math.abs(regPrice - prevRegPrice) > 1e-9;
    const hasExtDiff = extPrice != null && prevExtPrice != null && Math.abs(extPrice - prevExtPrice) > 1e-9;

    const splitHtml = hasTickDiff
      ? formatSplitTickHTML(prevPrice, liveP)
      : (prevEntry?.html && prevPrice === liveP ? prevEntry.html : formatSplitTickHTML(null, liveP, (extType && isFinite(extChgPct) ? extChgPct : regChgPct) >= 0 ? 1 : -1));
    const regHtml = hasRegDiff
      ? formatSplitTickHTML(prevRegPrice, regPrice)
      : (prevEntry?.regHtml && prevRegPrice === regPrice ? prevEntry.regHtml : formatSplitTickHTML(null, regPrice, regChgPct >= 0 ? 1 : -1));

    liveQuoteCache[sym] = {
      price: liveP,
      prevClose: prevClose || prevEntry?.prevClose,
      chg: regChg,
      chgPct: regChgPct,
      html: splitHtml,
      regPrice,
      regChg,
      regChgPct,
      regHtml,
      mktState,
      extType,
      extPrice,
      extChg,
      extChgPct,
      extTime,
      dayVol: meta.dayVol ?? prevEntry?.dayVol,
      bid: meta.bid ?? prevEntry?.bid,
      ask: meta.ask ?? prevEntry?.ask
    };

    // 1. Update Live Top Indices Strip if present
    const sid = safeId(sym);
    const idxP = document.getElementById(`idxp_${sid}`);
    const idxC = document.getElementById(`idxc_${sid}`);
    if (idxP) {
      idxP.innerHTML = splitHtml;
      if (hasTickDiff) {
        idxP.classList.remove('flash-up', 'flash-dn');
        void idxP.offsetWidth;
        idxP.classList.add(liveP > prevPrice ? 'flash-up' : 'flash-dn');
      }
    }
    if (idxC) {
      idxC.textContent = `${regChgPct >= 0 ? '+' : ''}${regChgPct.toFixed(2)}%`;
      idxC.className = `idx-chg tabular ${regChgPct >= 0 ? 'up' : 'dn'}`;
    }

    // 2. Update Watchlist Row (Regular Columns + Pre/Post-Market Icon & Live Sub-Row)
    const wlItem = state.watchlist.find(w => w.sym === sym);
    if (wlItem) {
      wlItem.price = regPrice;
      wlItem.chg = regChg;
      wlItem.chgPct = regChgPct;
      wlItem.regPrice = regPrice;
      wlItem.regChg = regChg;
      wlItem.regChgPct = regChgPct;
      wlItem.livePriceHtml = regHtml;
      wlItem.extType = extType;
      wlItem.extPrice = extPrice;
      wlItem.extChg = extChg;
      wlItem.extChgPct = extChgPct;
      if (meta.name && meta.name !== sym && wlItem.name === sym) {
        wlItem.name = meta.name;
      }
      const pe = document.getElementById(`wlp_${sid}`);
      const de = document.getElementById(`wld_${sid}`);
      const ce = document.getElementById(`wlc_${sid}`);
      const ne = document.getElementById(`wln_${sid}`);
      const se = document.getElementById(`wlsess_${sid}`);
      const ee = document.getElementById(`wlext_${sid}`);
      if (ne && wlItem.name && wlItem.name !== sym) ne.textContent = wlItem.name;
      if (pe) {
        pe.innerHTML = regHtml;
        if (hasRegDiff) {
          pe.classList.remove('flash-up', 'flash-dn');
          void pe.offsetWidth;
          pe.classList.add(regPrice > prevRegPrice ? 'flash-up' : 'flash-dn');
        }
      }
      if (de) {
        de.textContent = (regChg >= 0 ? '+' : '') + fmtChg(regChg, regPrice);
        de.className = `tabular ${regChg >= 0 ? 'up' : 'dn'}`;
      }
      if (ce) {
        ce.textContent = (regChgPct >= 0 ? '+' : '') + regChgPct.toFixed(2) + '%';
        ce.className = `tabular ${regChgPct >= 0 ? 'up' : 'dn'}`;
      }
      const hasExt = !!(extType && extPrice != null && isFinite(extPrice));
      if (se) {
        se.style.display = hasExt ? 'inline-flex' : 'none';
        se.className = `wl-sess-ico ${extType === 'PRE' ? 'pre' : extType === 'POST' ? 'post' : ''}`;
        se.title = extType === 'PRE' ? 'Pre-Market activ' : extType === 'POST' ? 'Post-Market activ' : '';
        se.innerHTML = extType === 'PRE' ? ICO.preSun : extType === 'POST' ? ICO.postMoon : '';
      }
      if (ee) {
        if (hasExt) {
          ee.style.display = 'flex';
          ee.innerHTML = buildWatchlistExtSubHtml(extType, extPrice, extChg, extChgPct);
          if (hasExtDiff) {
            ee.classList.remove('flash-up', 'flash-dn');
            void ee.offsetWidth;
            ee.classList.add(extPrice > prevExtPrice ? 'flash-up' : 'flash-dn');
          }
        } else {
          ee.style.display = 'none';
        }
      }
    }

    // Determine whether this tick is actively trading for chart candles
    const canStreamCandle = is24h
      || mktState === 'REGULAR'
      || (state.extHours && (mktState === 'PRE' || mktState === 'POST'));
    const candleLiveP = (state.extHours && extType && isFinite(extPrice) && (mktState === 'PRE' || mktState === 'POST'))
      ? extPrice
      : regPrice;

    // 3. Update any active Secondary Multi-Chart Panes showing this symbol
    if (state.layout !== '1') {
      secPanes.forEach(p => {
        if (p.sym === sym && p.candle && p.bars && p.bars.length > 0) {
          const pStep = getTfStepSeconds(p.tf);
          const pSubDay = pStep > 0 && pStep < 86400;
          if (canStreamCandle && (pSubDay || mktState === 'REGULAR' || is24h)) {
            const nearEdge = isChartNearLiveEdge(p.chart, p.bars.length);
            const lb = p.bars[p.bars.length - 1];
            const nowSec = Math.floor(Date.now() / 1000);
            const pBucket = pSubDay ? Math.floor(nowSec / pStep) * stepSecSafe(pStep) : lb.time;
            if (pSubDay && pBucket > lb.time && hasTickDiff) {
              const nb = { time: pBucket, open: lb.close, high: Math.max(lb.close, candleLiveP), low: Math.min(lb.close, candleLiveP), close: candleLiveP };
              p.bars.push(nb);
              try { p.candle.update(nb); } catch (_) { }
              if (nearEdge && p.chart) {
                try {
                  const r = p.chart.timeScale().getVisibleLogicalRange();
                  if (r) p.chart.timeScale().setVisibleLogicalRange({ from: r.from + 1, to: r.to + 1 });
                } catch (_) { }
              }
            } else if (Math.abs(candleLiveP - lb.close) > 1e-9) {
              lb.close = candleLiveP;
              if (candleLiveP > lb.high) lb.high = candleLiveP;
              if (candleLiveP < lb.low) lb.low = candleLiveP;
              try { p.candle.update({ time: lb.time, open: lb.open, high: lb.high, low: lb.low, close: lb.close }); } catch (_) { }
            }
          }
          const spEl = document.getElementById(`secLivePrice${p.id}`);
          if (spEl) spEl.innerHTML = splitHtml;
          const scEl = document.getElementById(`secLiveChg${p.id}`);
          if (scEl && isFinite(regChgPct)) {
            scEl.textContent = `${regChgPct >= 0 ? '+' : ''}${regChgPct.toFixed(2)}%`;
            scEl.className = `tabular ${regChgPct >= 0 ? 'up' : 'dn'}`;
          }
        }
      });
    }

    // 4. Update Right Details Widget if this is the focused symbol
    if (sym === getActiveFocusedSymbol()) {
      if (fullQuoteCache[sym]) {
        if (extType === 'PRE' && isFinite(extPrice)) {
          fullQuoteCache[sym].preMarketPrice = extPrice;
          fullQuoteCache[sym].preMarketChange = extChg;
          fullQuoteCache[sym].preMarketChangePercent = extChgPct;
        } else if (extType === 'POST' && isFinite(extPrice)) {
          fullQuoteCache[sym].postMarketPrice = extPrice;
          fullQuoteCache[sym].postMarketChange = extChg;
          fullQuoteCache[sym].postMarketChangePercent = extChgPct;
        }
        updateDetailsWidget(fullQuoteCache[sym], sym);
      } else {
        const dwTitle = document.getElementById('dwSymTitle');
        const dwBig = document.getElementById('dwPriceBig');
        const dwChg = document.getElementById('dwChgBadge');
        if (dwTitle) dwTitle.textContent = sym;
        setElementLogoAvatar('dwLogoBox', sym, '');
        if (dwBig) dwBig.innerHTML = regHtml;
        if (dwChg) {
          dwChg.textContent = `${regChgPct >= 0 ? '+' : ''}${regChgPct.toFixed(2)}%`;
          dwChg.className = `pill ${regChgPct >= 0 ? 'pill-buy' : 'pill-sell'} tabular`;
        }
      }
    }

    // 5. Update Primary Superchart Candle, Volume Bar, Bid/Ask & Y-Axis Countdown Live
    if (sym === state.symbol && !state.replay.active && state.bars.length > 0 && !state.compareSpec.startsWith('SPR:')) {
      if (meta.bid) state.quote = { ...(state.quote || {}), bid: meta.bid, ask: meta.ask || state.quote?.ask };
      const nonTimeChart = ['range', 'renko', 'linebreak', 'kagi'].includes(state.chartType);
      const last = state.bars[state.bars.length - 1];
      const nowSec = Math.floor(Date.now() / 1000);
      const tickMatch = String(state.tf).toLowerCase().match(/^(\d+)t$/);
      const stepSec = getTfStepSeconds(state.tf);
      const isSubDay = !!tickMatch || (stepSec > 0 && stepSec < 86400);

      if (canStreamCandle && (isSubDay || mktState === 'REGULAR' || is24h)) {
        const wasNearEdge = isChartNearLiveEdge(mainChart, state.bars.length);
        state.liveTickCount = (state.liveTickCount || 0) + 1;

        let spawnNewBar = false;
        let nextTime = last.time;
        if (tickMatch && !nonTimeChart) {
          const tickTarget = Math.max(10, parseInt(tickMatch[1], 10));
          if (state.liveTickCount >= tickTarget) {
            spawnNewBar = true;
            state.liveTickCount = 0;
            nextTime = Math.max(nowSec, last.time + 1);
          }
        } else if (stepSec > 0 && stepSec < 86400 && !nonTimeChart && hasTickDiff) {
          const bucketSec = Math.floor(nowSec / stepSec) * stepSec;
          if (bucketSec > last.time) {
            spawnNewBar = true;
            nextTime = bucketSec;
          }
        }

        const volDelta = meta.tradeVol > 0 ? meta.tradeVol : Math.max(1, Math.round((last.volume || 500) * 0.004));

        if (spawnNewBar) {
          const nextBar = {
            time: nextTime,
            open: last.close,
            high: Math.max(last.close, candleLiveP),
            low: Math.min(last.close, candleLiveP),
            close: candleLiveP,
            volume: volDelta
          };
          state.rawFetchedBars.push(nextBar);
          state.fullBars.push(nextBar);
          state.bars.push(nextBar);
          try {
            if (state.chartType === 'area' || state.chartType === 'line' || state.chartType === 'baseline') {
              mainSeries.update({ time: nextBar.time, value: nextBar.close });
            } else {
              mainSeries.update({ time: nextBar.time, open: nextBar.open, high: nextBar.high, low: nextBar.low, close: nextBar.close });
            }
            if (state.indicators.vol && volSeries) {
              volSeries.update({ time: nextBar.time, value: nextBar.volume, color: nextBar.close >= nextBar.open ? 'rgba(8,153,129,0.38)' : 'rgba(242,54,69,0.38)' });
            }
            if (wasNearEdge && mainChart) {
              const curR = mainChart.timeScale().getVisibleLogicalRange();
              if (curR) mainChart.timeScale().setVisibleLogicalRange({ from: curR.from + 1, to: curR.to + 1 });
            }
          } catch (_) { }
          updateHeaderAndLegend(nextBar, last);
        } else if (!nonTimeChart) {
          last.close = candleLiveP;
          if (candleLiveP > last.high) last.high = candleLiveP;
          if (candleLiveP < last.low) last.low = candleLiveP;
          if (hasTickDiff) last.volume = (last.volume || 0) + volDelta;
          try {
            if (state.chartType === 'candles' || state.chartType === 'hollow' || state.chartType === 'volcandles') {
              mainSeries.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
            } else if (state.chartType === 'area' || state.chartType === 'line' || state.chartType === 'baseline') {
              mainSeries.update({ time: last.time, value: last.close });
            }
            if (state.indicators.vol && volSeries) {
              volSeries.update({ time: last.time, value: last.volume || 0, color: last.close >= last.open ? 'rgba(8,153,129,0.38)' : 'rgba(242,54,69,0.38)' });
            }
          } catch (_) { }
          updateHeaderAndLegend(last, state.bars[state.bars.length - 2]);
        }
      } else {
        // Even on 1D/closed session, keep Top-Left Header & Pre/Post-Market Strip live!
        updateHeaderAndLegend(last, state.bars[state.bars.length - 2]);
      }

      positionYAxisCountdownTag();
      updateJumpToLiveBtn();
      renderPaperPositions();
      const nowMs = performance.now();
      if (overlayEngine && nowMs - lastOverlayTickDraw > 250) {
        lastOverlayTickDraw = nowMs;
        overlayEngine.requestRender();
      }
      evaluateAlerts(liveP);
    }
  }

  function stepSecSafe(s) { return s > 0 ? s : 60; }

  // Pure JS Protobuf Decoder for Yahoo Finance Real-Time WebSocket (yaticker PricingData)
  function decodeYahooProtobufTick(rawData) {
    try {
      let b64 = rawData;
      if (typeof rawData === 'string' && rawData.startsWith('{')) {
        const parsed = JSON.parse(rawData);
        b64 = parsed.message || '';
      }
      if (!b64 || typeof b64 !== 'string') return null;
      const bin = atob(b64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      const view = new DataView(bytes.buffer);
      const dec = new TextDecoder();

      const readVarintBig = (p) => {
        let res = 0n, shift = 0n;
        while (p < len) {
          const b = bytes[p++];
          res |= BigInt(b & 0x7f) << shift;
          if ((b & 0x80) === 0) break;
          shift += 7n;
        }
        return [res, p];
      };
      const zigzag = (v) => Number((v >> 1n) ^ -(v & 1n));

      const out = {};
      let pos = 0;
      while (pos < len) {
        let tagBig;
        [tagBig, pos] = readVarintBig(pos);
        const tag = Number(tagBig);
        const field = tag >>> 3;
        const wire = tag & 7;
        if (wire === 0) {
          let valBig;
          [valBig, pos] = readVarintBig(pos);
          if (field === 3) out.time = zigzag(valBig);
          else if (field === 9) out.dayVol = zigzag(valBig);
        } else if (wire === 1) {
          pos += 8;
        } else if (wire === 2) {
          let sLenBig;
          [sLenBig, pos] = readVarintBig(pos);
          const sLen = Number(sLenBig);
          if (pos + sLen > len) break;
          if (field === 1) out.id = dec.decode(bytes.subarray(pos, pos + sLen));
          else if (field === 13) out.name = dec.decode(bytes.subarray(pos, pos + sLen));
          pos += sLen;
        } else if (wire === 5) {
          if (pos + 4 > len) break;
          const fVal = view.getFloat32(pos, true);
          pos += 4;
          if (field === 2) out.price = fVal;
          else if (field === 8) out.chgPct = fVal;
          else if (field === 12) out.chg = fVal;
          else if (field === 16) out.prevClose = fVal;
          else if (field === 23) out.bid = fVal;
          else if (field === 25) out.ask = fVal;
        } else {
          break;
        }
      }
      if (out.id && isFinite(out.price) && out.price > 0) return out;
    } catch (_) { }
    return null;
  }

  function getSubscribedSymbolsList() {
    const activePanesSyms = secPanes.map(p => p.sym);
    return Array.from(new Set([
      state.symbol,
      ...LIVE_INDICES.map(i => i.sym),
      ...state.watchlist.map(w => w.sym),
      ...activePanesSyms
    ])).filter(Boolean);
  }

  function syncLiveStreamSubscriptions() {
    if (yahooWs && yahooWsReady && yahooWs.readyState === WebSocket.OPEN) {
      try {
        yahooWs.send(JSON.stringify({ subscribe: getSubscribedSymbolsList() }));
      } catch (_) { }
    }
  }

  function connectYahooLiveStream() {
    if (typeof WebSocket === 'undefined') return;
    try {
      if (yahooWs) { try { yahooWs.close(); } catch (_) { } }
      yahooWs = new WebSocket('wss://streamer.finance.yahoo.com/?version=2');
      yahooWs.onopen = () => {
        yahooWsReady = true;
        syncLiveStreamSubscriptions();
      };
      yahooWs.onmessage = (ev) => {
        const tick = decodeYahooProtobufTick(ev.data);
        if (tick) {
          applyLiveTick(tick.id, tick.price, tick);
        }
      };
      yahooWs.onclose = () => {
        yahooWsReady = false;
        clearTimeout(yahooReconnectTimer);
        yahooReconnectTimer = setTimeout(connectYahooLiveStream, 4000);
      };
      yahooWs.onerror = () => {
        try { yahooWs.close(); } catch (_) { }
      };
    } catch (_) { }
  }

  // Real-Time 24/7 Sub-Second Crypto Stream via Binance Public WebSocket
  function connectBinanceLiveStream() {
    if (typeof WebSocket === 'undefined') return;
    const cryptoMap = {
      btcusdt: 'BTC-USD', ethusdt: 'ETH-USD', egldusdt: 'EGLD-USD',
      trxusdt: 'TRX-USD', solusdt: 'SOL-USD', xrpusdt: 'XRP-USD',
      dogeusdt: 'DOGE-USD', adausdt: 'ADA-USD', bnbusdt: 'BNB-USD', avaxusdt: 'AVAX-USD'
    };
    const streams = Object.keys(cryptoMap).map(k => `${k}@ticker`).join('/');
    try {
      if (binanceWs) { try { binanceWs.close(); } catch (_) { } }
      binanceWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      binanceWs.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const d = msg?.data;
          if (!d || !d.s) return;
          const mappedSym = cryptoMap[String(d.s).toLowerCase()];
          if (!mappedSym) return;
          const now = performance.now();
          if (cryptoTickThrottle[mappedSym] && now - cryptoTickThrottle[mappedSym] < 140) return;
          cryptoTickThrottle[mappedSym] = now;
          const liveP = parseFloat(d.c);
          const chg = parseFloat(d.p);
          const chgPct = parseFloat(d.P);
          const bid = parseFloat(d.b);
          const ask = parseFloat(d.a);
          if (isFinite(liveP) && liveP > 0) {
            applyLiveTick(mappedSym, liveP, {
              chg: isFinite(chg) ? chg : undefined,
              chgPct: isFinite(chgPct) ? chgPct : undefined,
              bid: isFinite(bid) ? bid : undefined,
              ask: isFinite(ask) ? ask : undefined
            });
          }
        } catch (_) { }
      };
      binanceWs.onclose = () => {
        clearTimeout(binanceReconnectTimer);
        binanceReconnectTimer = setTimeout(connectBinanceLiveStream, 5000);
      };
      binanceWs.onerror = () => {
        try { binanceWs.close(); } catch (_) { }
      };
    } catch (_) { }
  }

  function formatQuoteClock(tsVal) {
    if (!tsVal) return '';
    try {
      const d = typeof tsVal === 'number'
        ? new Date(tsVal < 1e12 ? tsVal * 1000 : tsVal)
        : new Date(tsVal);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  async function refreshLiveQuotes() {
    if (liveQuoteBusy) return;
    liveQuoteBusy = true;
    try {
      const syms = getSubscribedSymbolsList();
      const map = await fetchBatchQuotes(syms);
      let namesEnriched = false;
      const prevPrimaryExt = liveQuoteCache[state.symbol]?.extPrice;

      Object.keys(map).forEach(k => {
        const q = map[k];
        if (!q) return;
        fullQuoteCache[k] = q;
        const sInfo = extractQuoteSessionInfo(q);
        if (!sInfo || sInfo.regPrice == null || !isFinite(sInfo.regPrice)) return;

        const activePrice = (sInfo.extType && isFinite(sInfo.extPrice))
          ? sInfo.extPrice
          : sInfo.regPrice;

        const realName = q.longName || q.shortName;
        const wlItem = state.watchlist.find(w => w.sym === k);
        if (wlItem && realName && String(realName).toUpperCase() !== k && wlItem.name === k) {
          wlItem.name = realName;
          namesEnriched = true;
        }

        applyLiveTick(k, activePrice, {
          mktState: sInfo.mktState,
          regPrice: sInfo.regPrice,
          regChg: sInfo.regChg,
          regChgPct: sInfo.regChgPct,
          prevClose: sInfo.prevClose,
          extType: sInfo.extType,
          extPrice: sInfo.extPrice,
          extChg: sInfo.extChg,
          extChgPct: sInfo.extChgPct,
          extTime: sInfo.extTime,
          bid: q.bid,
          ask: q.ask,
          dayVol: q.regularMarketVolume,
          name: realName
        });
      });

      if (namesEnriched) saveWatchlist();

      const focusSym = getActiveFocusedSymbol();
      const focusQ = map[focusSym] || fullQuoteCache[focusSym] || map[state.symbol];
      if (focusQ) {
        if (map[state.symbol]) state.quote = map[state.symbol];
        updateDetailsWidget(focusQ, focusSym);
      }

      // Refresh Y-axis Pre/Post reference line when extended price updates
      const newPrimaryExt = liveQuoteCache[state.symbol]?.extPrice;
      if (newPrimaryExt !== prevPrimaryExt && state.bars.length > 0) {
        drawAxisPriceLines(state.bars);
      }

      const evalPrice = liveQuoteCache[state.symbol]?.price ?? map[state.symbol]?.regularMarketPrice ?? (state.bars.length ? state.bars[state.bars.length - 1].close : NaN);
      evaluateAlerts(evalPrice, map);
    } finally {
      liveQuoteBusy = false;
    }
  }

  function updateDetailsWidget(q, symOverride = null) {
    if (!q) return;
    const dispSym = String(symOverride || q.symbol || state.symbol).toUpperCase();
    const sInfo = extractQuoteSessionInfo(q);
    const lq = liveQuoteCache[dispSym];

    const titleEl = document.getElementById('dwSymTitle');
    if (titleEl) titleEl.textContent = dispSym;
    setElementLogoAvatar('dwLogoBox', dispSym, '');

    const cachedId = officialIdentityCache[dispSym];
    const catHit = SYMBOL_CATALOG.find(c => c.sym === dispSym);
    const rawExch = String(q.fullExchangeName || q.exchange || cachedId?.exch || catHit?.exch || 'US').toUpperCase();
    const cleanExch = rawExch.includes('NASDAQ') ? 'NASDAQ'
      : rawExch.includes('NYSE') ? 'NYSE'
        : rawExch.includes('AMEX') || rawExch.includes('ARCA') ? 'NYSE ARCA'
          : rawExch.includes('CCC') || dispSym.endsWith('-USD') ? 'CRYPTO'
            : rawExch.slice(0, 12);
    const exchEl = document.getElementById('dwExchBadge');
    if (exchEl) exchEl.textContent = cleanExch;

    const compSubEl = document.getElementById('dwCompanySub');
    if (compSubEl) {
      const nm = q.longName || q.shortName || cachedId?.desc || catHit?.name || dispSym;
      compSubEl.textContent = `${nm} · ${cleanExch}`;
    }

    const regPrice = sInfo?.regPrice ?? lq?.regPrice ?? q.regularMarketPrice;
    const regChg = sInfo?.regChg ?? lq?.regChg ?? (q.regularMarketChange || 0);
    const regPct = sInfo?.regChgPct ?? lq?.regChgPct ?? (q.regularMarketChangePercent || 0);

    const priceBigEl = document.getElementById('dwPriceBig');
    if (priceBigEl) {
      priceBigEl.innerHTML = lq?.regHtml || (regPrice != null ? fmt(regPrice) : '—');
    }
    const ccyEl = document.getElementById('dwCcyLbl');
    if (ccyEl) ccyEl.textContent = q.currency || 'USD';

    const regChgEl = document.getElementById('dwRegChgVal');
    if (regChgEl) {
      regChgEl.textContent = isFinite(regChg) ? `${regChg >= 0 ? '+' : ''}${fmtChg(regChg, regPrice)}` : '—';
      regChgEl.className = `tabular dw-chg-val ${regChg >= 0 ? 'up' : 'dn'}`;
    }

    const chgEl = document.getElementById('dwChgBadge');
    if (chgEl) {
      chgEl.textContent = `${regPct >= 0 ? '+' : ''}${regPct.toFixed(2)}%`;
      chgEl.className = `pill ${regPct >= 0 ? 'pill-buy' : 'pill-sell'} tabular`;
    }

    const regTimeEl = document.getElementById('dwRegTimeSub');
    if (regTimeEl) {
      const regClk = formatQuoteClock(sInfo?.regTime || q.regularMarketTime);
      if (sInfo?.is24h) {
        regTimeEl.textContent = 'Piață deschisă 24/7 · Live';
      } else if (sInfo?.mktState === 'REGULAR') {
        regTimeEl.textContent = regClk ? `Sesiune deschisă · Actualizat ${regClk}` : 'Sesiune bursieră deschisă · Live';
      } else {
        regTimeEl.textContent = regClk ? `Închidere sesiune regulară la ${regClk}` : 'Închidere sesiune regulară';
      }
    }

    // Pre-Market / Post-Market Live Card Block (Authentic TradingView Layout)
    const extEl = document.getElementById('dwExtInfo');
    const extType = lq?.extType || sInfo?.extType || '';
    const extPrice = lq?.extPrice ?? sInfo?.extPrice;
    const extChg = lq?.extChg ?? sInfo?.extChg ?? 0;
    const extPct = lq?.extChgPct ?? sInfo?.extChgPct ?? 0;
    const extTime = lq?.extTime || sInfo?.extTime;

    if (extEl) {
      if (extType && extPrice != null && isFinite(extPrice)) {
        const isPre = extType === 'PRE';
        const cCls = extPct >= 0 ? 'up' : 'dn';
        const sign = extPct >= 0 ? '+' : '';
        const extClk = formatQuoteClock(extTime);
        extEl.style.display = 'block';
        extEl.innerHTML = `
          <div class="dw-price-row">
            <span class="dw-ext-price tabular">${fmt(extPrice)}</span>
            <span class="dw-ccy">${escTg(q.currency || 'USD')}</span>
            <span class="tabular dw-chg-val ${cCls}">${extChg >= 0 ? '+' : ''}${fmtChg(extChg, extPrice)}</span>
            <span class="tabular dw-chg-val ${cCls}">${sign}${extPct.toFixed(2)}%</span>
          </div>
          <div class="dw-ext-status ${isPre ? 'pre' : 'post'}">
            ${isPre ? ICO.preSun : ICO.postMoon}
            <span>${isPre ? 'Pre-Market' : 'Post-Market'}</span>
            ${extClk ? `<span style="color:var(--text-muted);font-weight:400;">· Actualizat ${extClk}</span>` : ''}
          </div>
        `;
      } else {
        extEl.style.display = 'none';
      }
    }

    // Live Bid x Size & Ask x Size Pills
    const baRow = document.getElementById('dwBidAskRow');
    const bidPill = document.getElementById('dwBidPill');
    const askPill = document.getElementById('dwAskPill');
    const bidVal = lq?.bid ?? q.bid;
    const askVal = lq?.ask ?? q.ask;
    if (baRow && bidPill && askPill) {
      if (bidVal > 0 && askVal > 0 && isFinite(bidVal) && isFinite(askVal)) {
        const bSz = q.bidSize > 0 ? ` × ${q.bidSize < 50 ? q.bidSize * 100 : q.bidSize}` : '';
        const aSz = q.askSize > 0 ? ` × ${q.askSize < 50 ? q.askSize * 100 : q.askSize}` : '';
        bidPill.textContent = `${fmt(bidVal)}${bSz}`;
        askPill.textContent = `${fmt(askVal)}${aSz}`;
        baRow.style.display = 'flex';
      } else {
        baRow.style.display = 'none';
      }
    }

    // Volume & 3M Average Volume
    const volEl = document.getElementById('dwVolVal');
    const avgVolEl = document.getElementById('dwAvgVolVal');
    if (volEl) volEl.textContent = q.regularMarketVolume > 0 ? fmtVol(q.regularMarketVolume) : '—';
    if (avgVolEl) avgVolEl.textContent = q.averageDailyVolume3Month > 0 ? fmtVol(q.averageDailyVolume3Month) : '—';

    if (q.regularMarketDayLow && q.regularMarketDayHigh && q.regularMarketDayHigh > q.regularMarketDayLow) {
      document.getElementById('dwDayRangeLbl').textContent = `${fmt(q.regularMarketDayLow)} – ${fmt(q.regularMarketDayHigh)}`;
      const pct = Math.max(0, Math.min(100, (((regPrice || q.regularMarketPrice) - q.regularMarketDayLow) / (q.regularMarketDayHigh - q.regularMarketDayLow)) * 100));
      document.getElementById('dwDayRangeFill').style.width = `${pct}%`;
    }
    if (q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh && q.fiftyTwoWeekHigh > q.fiftyTwoWeekLow) {
      document.getElementById('dw52wRangeLbl').textContent = `${fmt(q.fiftyTwoWeekLow)} – ${fmt(q.fiftyTwoWeekHigh)}`;
      const pct52 = Math.max(0, Math.min(100, (((regPrice || q.regularMarketPrice) - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100));
      document.getElementById('dw52wRangeFill').style.width = `${pct52}%`;
    }
  }

  function renderNewsList(news) {
    const el = document.getElementById('symbolNewsList');
    if (!el) return;
    if (!news || !news.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:11px;">Nicio știre recentă disponibilă.</div>`;
      return;
    }
    el.innerHTML = news.slice(0, 5).map(n => `
      <a href="${n.link || '#'}" target="_blank" rel="noopener" style="display:block;text-decoration:none;padding:7px 0;border-bottom:1px solid var(--border);color:var(--text);">
        <div style="font-size:11.5px;font-weight:700;color:var(--text-bright);line-height:1.35;">${n.title || 'Știre piață'}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${n.publisher || 'Yahoo Finance'}</div>
      </a>
    `).join('');
  }

  // ─── 13. ULTIMATE MULTI-CONDITION, WATCHLIST & WEBHOOK ALERTS ENGINE ───────
  const ALERT_COND_META = {
    price_up: { label: 'Preț ≥ Prag', isBull: true, needsVal: true },
    price_dn: { label: 'Preț ≤ Prag', isBull: false, needsVal: true },
    sig_buy: { label: 'Semnal Smart BUY (A/A+)', isBull: true, needsVal: false },
    sig_sell: { label: 'Semnal Smart SELL', isBull: false, needsVal: false },
    vwap_up: { label: 'Preț Peste VWAP', isBull: true, needsVal: false },
    macd_bull: { label: 'MACD Cross Bullish', isBull: true, needsVal: false },
    rvol_spike: { label: 'Volum RVOL ≥ Prag', isBull: true, needsVal: true, defVal: 1.8 },
    vol_spike_3x: { label: 'Explozie Volum Bară ≥ 3x', isBull: true, needsVal: false },
    vol_spike_5x: { label: 'Explozie Volum Extrem ≥ 5x', isBull: true, needsVal: false },
    pm_high_break: { label: 'Breakout Maxim Sesiune / PM', isBull: true, needsVal: false },
    cvd_bull: { label: 'Presiune Intraday ≥ 65%', isBull: true, needsVal: false },
    multi_bull: { label: 'Multi: BUY + VWAP + RVOL', isBull: true, needsVal: false },
    rsi_lt: { label: 'RSI(14) Sub Prag', isBull: true, needsVal: true, defVal: 30 },
    rsi_gt: { label: 'RSI(14) Peste Prag', isBull: false, needsVal: true, defVal: 70 },
    st_bull: { label: 'SuperTrend Bullish Flip', isBull: true, needsVal: false }
  };

  function saveAlerts() {
    try { localStorage.setItem('tp_ultra_alerts', JSON.stringify(state.alerts)); } catch (_) { }
  }

  function addAlert(priceVal, dir = state.alertDir, condOverride = null) {
    const cond = condOverride || document.getElementById('alertCondSelect')?.value || (dir === 'dn' ? 'price_dn' : 'price_up');
    const scope = condOverride ? 'symbol' : (document.getElementById('alertScopeSelect')?.value || 'symbol');
    const webhook = condOverride ? '' : (document.getElementById('alertWebhookInput')?.value.trim() || '');
    const sendTg = condOverride ? true : (document.getElementById('alertSendTgChk')?.checked !== false);
    const meta = ALERT_COND_META[cond] || ALERT_COND_META.price_up;
    let p = parseFloat(priceVal);
    if (meta.needsVal) {
      if (!isFinite(p) || p <= 0) p = meta.defVal ?? (state.bars.length ? state.bars[state.bars.length - 1].close : 0);
      if (!isFinite(p) || p <= 0) return;
    } else {
      p = 0;
    }

    const targetSym = scope === 'watchlist' ? 'WATCHLIST' : getActiveFocusedSymbol();
    const effDir = cond === 'price_dn' || cond === 'sig_sell' || cond === 'rsi_gt' ? 'dn' : 'up';
    state.alerts.unshift({
      id: Date.now(),
      sym: targetSym,
      cond,
      price: p,
      dir: effDir,
      webhook,
      telegram: sendTg,
      permanent: true,
      triggered: false
    });
    saveAlerts();
    renderAlertsList();
    drawAxisPriceLines(state.bars);
    const desc = meta.needsVal ? `${targetSym} · ${meta.label} ${fmt(p)}` : `${targetSym} · ${meta.label}`;
    showToast('Alertă Permanentă Activată', desc, 'info', targetSym === 'WATCHLIST' ? state.symbol : targetSym);
    syncTelegramBridge();
  }

  function evaluateAlerts(curPrice, quoteMap = null) {
    let changed = false;
    const cp = state.lastSignalOut?.currentPlan;
    const rsiVal = cp?.rsi;
    const rvolVal = cp?.rvol ?? 1;
    const vwapSeries = state.bars.length >= 5 ? Q.calcVWAP(state.bars) : null;
    const lastVwap = vwapSeries?.vwap?.length ? vwapSeries.vwap[vwapSeries.vwap.length - 1]?.value : NaN;
    const macdData = state.bars.length >= 26 ? Q.calcMACD(state.bars) : null;
    const lastMacdHist = macdData?.histSeries?.length ? macdData.histSeries[macdData.histSeries.length - 1]?.value : NaN;
    const prevMacdHist = macdData?.histSeries?.length >= 2 ? macdData.histSeries[macdData.histSeries.length - 2]?.value : NaN;

    for (const a of state.alerts) {
      if (a.triggered) continue;
      const cond = a.cond || (a.dir === 'dn' ? 'price_dn' : 'price_up');
      const meta = ALERT_COND_META[cond] || ALERT_COND_META.price_up;
      let hit = false;
      let hitMsg = '';
      let hitSym = a.sym;
      let hitPrice = curPrice;

      if (a.sym === 'WATCHLIST') {
        for (const w of state.watchlist) {
          const wp = quoteMap?.[w.sym]?.regularMarketPrice ?? liveQuoteCache[w.sym]?.price ?? w.price;
          if (!isFinite(wp)) continue;
          if (cond === 'price_up' && wp >= a.price) {
            hit = true; hitSym = w.sym; hitPrice = wp;
            hitMsg = `${w.sym} a depășit ${fmt(a.price)} (live: ${fmt(wp)})`;
            break;
          } else if (cond === 'price_dn' && wp <= a.price) {
            hit = true; hitSym = w.sym; hitPrice = wp;
            hitMsg = `${w.sym} a coborât sub ${fmt(a.price)} (live: ${fmt(wp)})`;
            break;
          }
        }
      } else if (a.sym === state.symbol && isFinite(curPrice)) {
        if (cond === 'price_up' && curPrice >= a.price) {
          hit = true; hitMsg = `Prețul a depășit ${fmt(a.price)} (live: ${fmt(curPrice)})`;
        } else if (cond === 'price_dn' && curPrice <= a.price) {
          hit = true; hitMsg = `Prețul a coborât sub ${fmt(a.price)} (live: ${fmt(curPrice)})`;
        } else if (cond === 'sig_buy' && cp && cp.status === 'BUY_NOW') {
          hit = true; hitMsg = `Semnal Smart BUY ${cp.grade} confirmat @ ${fmt(curPrice)}`;
        } else if (cond === 'sig_sell' && cp && cp.status === 'SELL_NOW') {
          hit = true; hitMsg = `Semnal Smart SELL ${cp.grade} confirmat @ ${fmt(curPrice)}`;
        } else if (cond === 'vwap_up' && isFinite(lastVwap) && curPrice >= lastVwap) {
          hit = true; hitMsg = `Prețul ${fmt(curPrice)} a trecut peste VWAP (${fmt(lastVwap)})`;
        } else if (cond === 'macd_bull' && isFinite(lastMacdHist) && lastMacdHist > 0 && (!isFinite(prevMacdHist) || prevMacdHist <= 0)) {
          hit = true; hitMsg = `MACD Cross Bullish confirmat pe ${a.sym} @ ${fmt(curPrice)}`;
        } else if (cond === 'rvol_spike' && isFinite(rvolVal) && rvolVal >= a.price) {
          hit = true; hitMsg = `Volum RVOL ${rvolVal.toFixed(2)}x peste pragul ${a.price}x`;
        } else if ((cond === 'vol_spike_3x' || cond === 'vol_spike_5x') && state.bars.length >= 22) {
          const histV = state.bars.slice(-21, -1).map(b => b.volume || 0).filter(v => v > 0);
          const avgV = histV.length ? histV.reduce((s, v) => s + v, 0) / histV.length : 0;
          const lastV = state.bars[state.bars.length - 1]?.volume || 0;
          const ratio = avgV > 0 ? lastV / avgV : 0;
          const minR = cond === 'vol_spike_5x' ? 5 : 3;
          if (ratio >= minR) {
            hit = true; hitMsg = `Explozie volum bară ${ratio.toFixed(1)}x media 20 (${a.sym} @ ${fmt(curPrice)})`;
          }
        } else if (cond === 'pm_high_break') {
          const pmH = state.quote?.preMarketHigh || state.quote?.regularMarketDayHigh;
          if (isFinite(pmH) && pmH > 0 && curPrice >= pmH) {
            hit = true; hitMsg = `Breakout Maxim ${fmt(pmH)} confirmat (${a.sym} @ ${fmt(curPrice)})`;
          }
        } else if (cond === 'cvd_bull' && state.bars.length >= 12) {
          const rec = state.bars.slice(-12);
          let bVol = 0, tVol = 0;
          for (const b of rec) {
            const v = Math.max(1, b.volume || 1);
            const r = b.high - b.low;
            bVol += v * (r > 0 ? Math.max(0, Math.min(1, (b.close - b.low) / r)) : 0.5);
            tVol += v;
          }
          const bp = tVol > 0 ? (bVol / tVol) * 100 : 50;
          if (bp >= 65) {
            hit = true; hitMsg = `Presiune cumpărare intraday ${bp.toFixed(0)}% (${a.sym} @ ${fmt(curPrice)})`;
          }
        } else if (cond === 'multi_bull' && cp && (cp.status === 'BUY_NOW' || cp.score >= 68) && (!isFinite(lastVwap) || curPrice >= lastVwap) && rvolVal >= 1.2) {
          hit = true; hitMsg = `Multi-Condiție (BUY ${cp.grade} + VWAP + RVOL ${rvolVal.toFixed(1)}x) @ ${fmt(curPrice)}`;
        } else if (cond === 'rsi_lt' && isFinite(rsiVal) && rsiVal <= a.price) {
          hit = true; hitMsg = `RSI(14) a coborât la ${rsiVal.toFixed(1)} (prag ${a.price})`;
        } else if (cond === 'rsi_gt' && isFinite(rsiVal) && rsiVal >= a.price) {
          hit = true; hitMsg = `RSI(14) a urcat la ${rsiVal.toFixed(1)} (prag ${a.price})`;
        } else if (cond === 'st_bull' && cp && cp.stBull) {
          hit = true; hitMsg = `SuperTrend este Bullish pe ${a.sym} @ ${fmt(curPrice)}`;
        }
      } else if (a.sym !== state.symbol) {
        const extP = quoteMap?.[a.sym]?.regularMarketPrice ?? liveQuoteCache[a.sym]?.price;
        if (isFinite(extP)) {
          if (cond === 'price_up' && extP >= a.price) {
            hit = true; hitPrice = extP; hitMsg = `${a.sym} a depășit ${fmt(a.price)} (live: ${fmt(extP)})`;
          } else if (cond === 'price_dn' && extP <= a.price) {
            hit = true; hitPrice = extP; hitMsg = `${a.sym} a coborât sub ${fmt(a.price)} (live: ${fmt(extP)})`;
          }
        }
      }

      if (hit) {
        a.triggered = true;
        a.triggeredAt = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        changed = true;
        const isBull = a.dir !== 'dn';
        playChime(isBull);
        showToast(`Alertă Declanșată: ${hitSym}`, hitMsg, isBull ? 'buy' : 'sell', hitSym);

        if (a.telegram !== false) {
          notifyTelegramEvent('alerts', {
            dedupKey: `alert:${a.id}:${a.triggeredAt}`,
            sym: hitSym,
            tf: state.tf,
            includeActions: true,
            summary: `Alertă ${hitSym}: ${hitMsg}`,
            html:
              `<b>Alertă Declanșată · ${escTg(hitSym)}</b>\n` +
              `Condiție: <code>${escTg(meta.label)}</code>\n` +
              `Detalii: ${escTg(hitMsg)}`
          });
        }

        if (a.webhook && /^https?:\/\//i.test(a.webhook)) {
          fetch(a.webhook, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: 'TradePro Ultimate',
              symbol: hitSym,
              condition: cond,
              label: meta.label,
              price: hitPrice,
              message: hitMsg,
              timestamp: new Date().toISOString()
            })
          }).catch(() => { });
        }
      }
    }
    if (changed) {
      saveAlerts();
      renderAlertsList();
      drawAxisPriceLines(state.bars);
    }
  }

  function checkPriceAlerts(curPrice) {
    evaluateAlerts(curPrice);
  }

  function renderAlertsList() {
    const list = document.getElementById('alertsListContainer');
    const badge = document.getElementById('alertsRailBadge');
    const activeCnt = state.alerts.filter(a => !a.triggered).length;
    if (badge) {
      badge.textContent = activeCnt;
      badge.style.display = activeCnt > 0 ? 'inline-flex' : 'none';
    }
    if (!list) return;
    if (!state.alerts.length) {
      list.innerHTML = `<div style="padding:24px 12px;text-align:center;color:var(--text-muted);font-size:11px;">Nicio alertă activă. Alege o condiție tehnică, multi-condiție sau Watchlist mai sus ori dă click-dreapta pe grafic.</div>`;
      return;
    }
    list.innerHTML = state.alerts.map(a => {
      const cond = a.cond || (a.dir === 'dn' ? 'price_dn' : 'price_up');
      const meta = ALERT_COND_META[cond] || ALERT_COND_META.price_up;
      const isBull = a.dir !== 'dn';
      const tgTag = a.telegram !== false ? ' · TG' : '';
      const webTag = a.webhook ? ' · Webhook' : '';
      const titleTxt = meta.needsVal ? `${a.sym} · ${fmt(a.price)}` : `${a.sym} · Tehnic`;
      const stateTxt = a.triggered ? `Declanșată ${a.triggeredAt || ''} · Re-armează` : `Activă${tgTag}${webTag}`;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;cursor:${a.triggered ? 'pointer' : 'default'};" data-rearm-alert="${a.triggered ? a.id : ''}">
            ${renderLogoAvatar(a.sym === 'WATCHLIST' ? state.symbol : a.sym, 'sm')}
            <div style="min-width:0;">
              <div style="font-weight:700;color:var(--text-bright);font-size:11.5px;">${titleTxt}</div>
              <div style="font-size:10px;color:${isBull ? 'var(--tv-green)' : 'var(--tv-red)'};display:flex;align-items:center;gap:5px;margin-top:2px;">
                <span class="sig-dot ${isBull ? 'buy' : 'sell'}"></span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${meta.label} · ${stateTxt}</span>
              </div>
            </div>
          </div>
          <button class="tb-btn icon-only" data-del-alert="${a.id}" title="Șterge">${ICO.close}</button>
        </div>
      `;
    }).join('');
    list.querySelectorAll('[data-rearm-alert]').forEach(el => {
      const id = Number(el.dataset.rearmAlert);
      if (id) {
        el.onclick = () => {
          const item = state.alerts.find(x => x.id === id);
          if (item) {
            item.triggered = false;
            saveAlerts();
            renderAlertsList();
            drawAxisPriceLines(state.bars);
          }
        };
      }
    });
    list.querySelectorAll('[data-del-alert]').forEach(b => {
      b.onclick = () => {
        state.alerts = state.alerts.filter(x => x.id !== Number(b.dataset.delAlert));
        saveAlerts();
        renderAlertsList();
        drawAxisPriceLines(state.bars);
        syncTelegramBridge();
      };
    });
  }

  // ─── 13B. TWO-WAY TELEGRAM BRIDGE (SELECTIVE PUSH & REMOTE COMMANDS) ──────
  const tgClient = {
    configured: false,
    botOk: false,
    botUsername: 'jeka7ro_bot',
    chatId: '',
    pollingActive: false,
    prefs: {
      enabled: true,
      alerts: true,
      signals: true,
      trades: true,
      scanner: false,
      minScore: 72
    },
    logs: [],
    baselineSigKey: '',
    sentSigKeys: new Set(),
    syncBusy: false
  };

  function escTg(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function notifyTelegramEvent(category, payload = {}) {
    if (category !== 'manual' && category !== 'test') {
      if (!tgClient.prefs.enabled) return null;
      if (category === 'alerts' && !tgClient.prefs.alerts) return null;
      if (category === 'signals' && !tgClient.prefs.signals) return null;
      if (category === 'trades' && !tgClient.prefs.trades) return null;
    }
    try {
      const res = await fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          dedupKey: payload.dedupKey || '',
          sym: payload.sym || state.symbol,
          tf: payload.tf || state.tf,
          summary: payload.summary || '',
          html: payload.html || '',
          includeActions: !!payload.includeActions
        })
      });
      const json = await res.json();
      if (Array.isArray(json?.logs)) {
        tgClient.logs = json.logs;
        renderTelegramPanelUI();
      }
      return json;
    } catch (_) {
      return null;
    }
  }

  function maybeNotifyLiveSignalTelegram(sigOut) {
    const cp = sigOut?.currentPlan;
    if (!cp || state.replay.active) return;
    const lastSigTime = sigOut?.signals?.length
      ? sigOut.signals[sigOut.signals.length - 1].time
      : (state.bars[state.bars.length - 1]?.time || 0);
    const sigKey = `${state.symbol}:${state.tf}:${cp.status}:${lastSigTime}`;

    if (!tgClient.baselineSigKey) {
      tgClient.baselineSigKey = sigKey;
      return;
    }
    if (sigKey === tgClient.baselineSigKey || tgClient.sentSigKeys.has(sigKey)) return;

    tgClient.baselineSigKey = sigKey;
    const isEntrySignal = cp.status === 'BUY_NOW' || cp.status === 'SELL_NOW';
    if (!isEntrySignal || cp.score < (tgClient.prefs.minScore || 72)) return;

    tgClient.sentSigKeys.add(sigKey);
    const dirLabel = cp.status === 'BUY_NOW' ? 'LONG' : 'SHORT';
    const reasonsTxt = (cp.reasons || []).slice(0, 2).map(r => `- ${escTg(r)}`).join('\n');
    notifyTelegramEvent('signals', {
      dedupKey: `sig:${sigKey}`,
      sym: state.symbol,
      tf: state.tf,
      includeActions: true,
      summary: `Semnal ${dirLabel} ${cp.grade} (${cp.score}) pe ${state.symbol} (${state.tf.toUpperCase()})`,
      html:
        `<b>Semnal Confirmat ${dirLabel} ${escTg(cp.grade)} · ${escTg(state.symbol)} (${escTg(state.tf.toUpperCase())})</b>\n` +
        `Scor Confluență: <b>${cp.score}/100</b> · Preț: <b>${fmt(cp.entry)}</b>\n` +
        `Stop-Loss: <code>${fmt(cp.sl)}</code> · TP1 (1.5R): <code>${fmt(cp.tp1)}</code> · TP2 (3R): <code>${fmt(cp.tp2)}</code>` +
        (reasonsTxt ? `\n\n${reasonsTxt}` : '')
    });
  }

  async function sendCurrentPlanToTelegram(isTest = false) {
    if (isTest) {
      const res = await notifyTelegramEvent('test', {
        sym: state.symbol,
        tf: state.tf,
        includeActions: false,
        summary: `Test conexiune Telegram (${state.symbol})`,
        html:
          `<b>Conexiune TradePro Supercharts Activă</b>\n` +
          `Simbol activ: <b>${escTg(getActiveFocusedSymbol())}</b> (${escTg(state.tf.toUpperCase())})\n` +
          `Notificări selective: <code>${tgClient.prefs.enabled ? 'ACTIVE' : 'OPRITE'}</code> · Prag scor: <code>${tgClient.prefs.minScore}+</code>\n` +
          `Scrie <code>/help</code> sau <code>/pret ${escTg(getActiveFocusedSymbol())}</code> pentru control de la distanță.`
      });
      if (res?.ok) {
        showToast('Telegram Conectat', `Mesaj de test trimis pe chat ${tgClient.chatId || 'configurat'}.`, 'buy');
      } else {
        showToast('Eroare Telegram', res?.error || 'Verifică Chat ID și conexiunea serverului.', 'sell');
      }
      return;
    }

    const cp = state.lastSignalOut?.currentPlan;
    const lastClose = state.bars.length ? state.bars[state.bars.length - 1].close : (cp?.entry || 0);
    if (!cp || !lastClose) return;
    const reasonsTxt = (cp.reasons || []).slice(0, 3).map(r => `- ${escTg(r)}`).join('\n');
    const res = await notifyTelegramEvent('manual', {
      sym: state.symbol,
      tf: state.tf,
      includeActions: true,
      summary: `Setup transmis manual: ${state.symbol} (${state.tf.toUpperCase()})`,
      html:
        `<b>Setup Terminal · ${escTg(state.symbol)} (${escTg(state.tf.toUpperCase())})</b>\n` +
        `Stare: <b>${escTg(cp.actionTitle)}</b> (<code>${escTg(cp.grade)} · ${cp.score}/100</code>)\n` +
        `Preț curent: <b>${fmt(lastClose)}</b>\n` +
        `Ref/Intrare: <code>${fmt(cp.entry)}</code> · Stop-Loss: <code>${fmt(cp.sl)}</code>\n` +
        `TP1 (1.5R): <code>${fmt(cp.tp1)}</code> · TP2 (3.0R): <code>${fmt(cp.tp2)}</code>` +
        (reasonsTxt ? `\n\n${reasonsTxt}` : '')
    });
    if (res?.ok) {
      showToast('Setup Trimis pe Telegram', `${state.symbol} (${state.tf.toUpperCase()}) a fost transmis cu butoane rapide.`, 'info', state.symbol);
    } else {
      showToast('Eroare Trimitere Telegram', res?.error || 'Conexiune indisponibilă.', 'sell');
    }
  }

  function applyRemoteTelegramActions(actions) {
    if (!Array.isArray(actions) || !actions.length) return;
    for (const act of actions) {
      if (!act || !act.type) continue;

      if (act.type === 'OPEN_CHART' && act.sym) {
        const cleanSym = normalizeSymbol(act.sym);
        const targetTf = act.tf ? String(act.tf).toLowerCase() : state.tf;
        const needed = getNeededSecPanesCount(state.layout);
        if (state.layout !== '1' && state.focusedPaneId > 0 && state.focusedPaneId <= needed) {
          const p = secPanes.find(x => x.id === state.focusedPaneId);
          if (p && act.tf) {
            p.tf = targetTf;
            const sel = document.getElementById(`secTfSelect${p.id}`);
            if (sel) sel.value = targetTf;
          }
          assignSymbolToFocusedPane(cleanSym);
        } else {
          state.tf = targetTf;
          try { localStorage.setItem('tp_ultra_tf', targetTf); } catch (_) { }
          document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === targetTf));
          loadSymbol(cleanSym, targetTf);
        }
        showToast('Comandă Telegram', `Grafic deschis: ${cleanSym} (${targetTf.toUpperCase()})`, 'info', cleanSym);
      } else if (act.type === 'WL_ADD' && act.sym) {
        addSymbolToWatchlist(act.sym, { loadOnChart: false });
      } else if (act.type === 'WL_DEL' && act.sym) {
        const cleanSym = normalizeSymbol(act.sym);
        state.watchlist = state.watchlist.filter(w => w.sym !== cleanSym);
        saveWatchlist();
        renderWatchlist();
        showToast('Comandă Telegram', `${cleanSym} a fost eliminat din Watchlist.`, 'info');
      } else if (act.type === 'ALERT_ADD' && act.alert) {
        if (!state.alerts.some(a => a.id === act.alert.id)) {
          state.alerts.unshift(act.alert);
          saveAlerts();
          renderAlertsList();
          drawAxisPriceLines(state.bars);
          showToast('Alertă din Telegram', `${act.alert.sym} @ ${fmt(act.alert.price)}`, 'info', act.alert.sym);
        }
      } else if (act.type === 'ALERT_DEL' && act.id != null) {
        state.alerts = state.alerts.filter(a => a.id !== Number(act.id));
        saveAlerts();
        renderAlertsList();
        drawAxisPriceLines(state.bars);
      } else if (act.type === 'ALERT_CLEAR') {
        state.alerts = [];
        saveAlerts();
        renderAlertsList();
        drawAxisPriceLines(state.bars);
        showToast('Comandă Telegram', 'Toate alertele active au fost șterse.');
      } else if (act.type === 'PAPER_ORDER' && act.sym) {
        executePaperOrder(act.side === 'sell' ? 'sell' : 'buy', act.price, act.sl, act.tp, {
          sym: act.sym,
          qty: act.qty,
          fromTelegram: true
        });
      } else if (act.type === 'PAPER_CLOSE' && act.sym) {
        const target = String(act.sym).toUpperCase();
        const toClose = state.paper.positions
          .filter(p => target === 'ALL' || p.sym === target)
          .map(p => p.id);
        toClose.forEach(id => closePaperPosition(id, true));
        if (toClose.length) {
          showToast(
            'Comandă Telegram',
            target === 'ALL' ? 'Toate pozițiile Paper au fost închise.' : `Pozițiile Paper pe ${target} au fost închise.`
          );
        }
      } else if (act.type === 'PREFS_UPDATED' && act.prefs) {
        tgClient.prefs = { ...tgClient.prefs, ...act.prefs };
        renderTelegramPanelUI();
      }
    }
  }

  function renderTelegramPanelUI() {
    const badge = document.getElementById('tgConnBadge');
    const railDot = document.getElementById('tgRailDot');
    const handleEl = document.getElementById('tgBotHandleLbl');
    const chatInp = document.getElementById('tgChatIdInput');
    const pollEl = document.getElementById('tgPollStatusLbl');
    const minSel = document.getElementById('tgMinScoreSelect');
    const logBox = document.getElementById('tgActivityLog');

    if (badge) {
      if (tgClient.botOk && tgClient.chatId) {
        badge.textContent = tgClient.prefs.enabled ? 'Activ · Live' : 'Pauză (Mute)';
        badge.className = `pill ${tgClient.prefs.enabled ? 'pill-buy' : 'pill-warn'}`;
      } else {
        badge.textContent = 'Deconectat';
        badge.className = 'pill pill-neut';
      }
    }
    if (railDot) {
      railDot.classList.toggle('online', !!(tgClient.botOk && tgClient.chatId && tgClient.prefs.enabled));
    }
    if (handleEl && tgClient.botUsername) {
      handleEl.textContent = `@${tgClient.botUsername}`;
    }
    if (chatInp && document.activeElement !== chatInp && tgClient.chatId) {
      chatInp.value = tgClient.chatId;
    }
    if (pollEl) {
      pollEl.textContent = tgClient.pollingActive ? 'Polling Activ' : 'Standby';
      pollEl.style.color = tgClient.pollingActive ? 'var(--tv-green)' : 'var(--text-muted)';
    }

    ['enabled', 'alerts', 'signals', 'trades', 'scanner'].forEach(k => {
      const sw = document.getElementById(`tgSw_${k}`);
      if (sw) sw.classList.toggle('on', !!tgClient.prefs[k]);
    });

    if (minSel && String(tgClient.prefs.minScore)) {
      const valStr = String(tgClient.prefs.minScore);
      if ([...minSel.options].some(o => o.value === valStr)) {
        minSel.value = valStr;
      }
    }

    if (logBox) {
      if (!tgClient.logs.length) {
        logBox.innerHTML = `<div style="padding:16px 10px;text-align:center;color:var(--text-muted);font-size:10.5px;">Nicio comandă sau notificare recentă. Trimite <code>/pret NVDA</code> pe Telegram.</div>`;
      } else {
        logBox.innerHTML = tgClient.logs.slice(0, 20).map(item => {
          const isIn = item.dir === 'in';
          return `
            <div class="tg-log-row">
              <span class="tg-log-tag ${isIn ? 'in' : 'out'}">${isIn ? 'CMD' : 'OUT'}</span>
              <div style="min-width:0;flex:1;">
                <div style="color:var(--text-bright);line-height:1.3;overflow-wrap:break-word;">${escTg(item.summary || '')}</div>
                <div class="tabular" style="font-size:9.5px;color:var(--text-muted);margin-top:1px;">${escTg(item.time || '')} · ${escTg(item.category || '')}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  async function saveTelegramConfig(partialPrefs = null, customChatId = null) {
    if (partialPrefs) {
      tgClient.prefs = { ...tgClient.prefs, ...partialPrefs };
      renderTelegramPanelUI();
    }
    try {
      const body = { prefs: tgClient.prefs };
      if (customChatId !== null) body.chatId = customChatId;
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json?.ok) {
        if (json.chatId) tgClient.chatId = json.chatId;
        if (json.botUsername) tgClient.botUsername = json.botUsername;
        if (json.prefs) tgClient.prefs = { ...tgClient.prefs, ...json.prefs };
        if (Array.isArray(json.logs)) tgClient.logs = json.logs;
        renderTelegramPanelUI();
        if (customChatId !== null) {
          showToast('Configurare Telegram Salvată', `Chat ID activ: ${tgClient.chatId}`, 'buy');
        }
      }
    } catch (_) { }
  }

  async function syncTelegramBridge() {
    if (tgClient.syncBusy) return;
    tgClient.syncBusy = true;
    try {
      const lastPrice = state.bars.length ? state.bars[state.bars.length - 1].close : null;
      const res = await fetch('/api/telegram/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeSymbol: getActiveFocusedSymbol(),
          activeTf: state.tf,
          lastPrice,
          watchlist: state.watchlist.map(w => w.sym),
          alerts: state.alerts,
          paper: state.paper,
          currentPlan: state.lastSignalOut?.currentPlan || null
        })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.ok) return;

      tgClient.botOk = !!data.botOk;
      if (data.botUsername) tgClient.botUsername = data.botUsername;
      tgClient.pollingActive = !!data.pollingActive;
      if (data.chatId) tgClient.chatId = data.chatId;
      if (data.prefs) tgClient.prefs = { ...tgClient.prefs, ...data.prefs };
      if (Array.isArray(data.logs)) tgClient.logs = data.logs;

      if (Array.isArray(data.uiActions) && data.uiActions.length > 0) {
        applyRemoteTelegramActions(data.uiActions);
      }
      renderTelegramPanelUI();
    } catch (_) {
    } finally {
      tgClient.syncBusy = false;
    }
  }

  function wireTelegramUI() {
    document.querySelectorAll('.tg-toggle-row[data-tgpref]').forEach(row => {
      row.onclick = () => {
        const key = row.dataset.tgpref;
        if (!key) return;
        saveTelegramConfig({ [key]: !tgClient.prefs[key] });
      };
    });

    const minSel = document.getElementById('tgMinScoreSelect');
    if (minSel) {
      minSel.onchange = () => {
        saveTelegramConfig({ minScore: Number(minSel.value) || 72 });
      };
    }

    const saveBtn = document.getElementById('tgSaveCfgBtn');
    const chatInp = document.getElementById('tgChatIdInput');
    if (saveBtn && chatInp) {
      saveBtn.onclick = () => {
        const val = chatInp.value.trim();
        if (val) saveTelegramConfig(null, val);
      };
      chatInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveBtn.click();
        }
      });
    }

    const sendPlanBtn = document.getElementById('tgSendPlanBtn');
    if (sendPlanBtn) sendPlanBtn.onclick = () => sendCurrentPlanToTelegram(false);

    const testBtn = document.getElementById('tgTestBtn');
    if (testBtn) testBtn.onclick = () => sendCurrentPlanToTelegram(true);
  }

  function initTelegramBridge() {
    fetch('/api/telegram/status')
      .then(r => r.ok ? r.json() : null)
      .then(st => {
        if (!st?.ok) return;
        tgClient.configured = !!st.configured;
        tgClient.botOk = !!st.botOk;
        if (st.botUsername) tgClient.botUsername = st.botUsername;
        if (st.chatId) tgClient.chatId = st.chatId;
        tgClient.pollingActive = !!st.pollingActive;
        if (st.prefs) tgClient.prefs = { ...tgClient.prefs, ...st.prefs };
        if (Array.isArray(st.logs)) tgClient.logs = st.logs;
        renderTelegramPanelUI();
        syncTelegramBridge();
      })
      .catch(() => { });

    setInterval(() => {
      syncTelegramBridge();
    }, 2200);
  }

  // ─── 14. BAR REPLAY ENGINE (TRADINGVIEW PRO FEATURE) ──────────────────────
  function toggleReplayMode() {
    const bar = document.getElementById('replayControls');
    const btn = document.getElementById('replayToggleBtn');
    if (!state.replay.active) {
      if (state.fullBars.length < 50) return;
      state.replay.active = true;
      state.replay.playing = false;
      state.replay.idx = Math.max(40, state.fullBars.length - 30);
      state.bars = state.fullBars.slice(0, state.replay.idx);
      bar.classList.add('visible');
      btn.classList.add('active');
      updateReplayCounter();
      renderChartAndQuant(false);
    } else {
      stopReplayTimer();
      state.replay.active = false;
      state.bars = [...state.fullBars];
      bar.classList.remove('visible');
      btn.classList.remove('active');
      renderChartAndQuant(false);
    }
  }

  function stepReplayBar() {
    if (!state.replay.active) return;
    if (state.replay.idx < state.fullBars.length) {
      state.replay.idx++;
      state.bars = state.fullBars.slice(0, state.replay.idx);
      updateReplayCounter();
      renderChartAndQuant(false);
    } else {
      stopReplayTimer();
    }
  }

  function toggleReplayPlay() {
    if (!state.replay.active) return;
    if (state.replay.playing) {
      stopReplayTimer();
    } else {
      state.replay.playing = true;
      document.getElementById('rpPlayBtn').innerHTML = `${ICO.pause}<span>Pauză</span>`;
      state.replay.timer = setInterval(stepReplayBar, state.replay.speedMs);
    }
  }

  function stopReplayTimer() {
    state.replay.playing = false;
    if (state.replay.timer) { clearInterval(state.replay.timer); state.replay.timer = null; }
    const b = document.getElementById('rpPlayBtn');
    if (b) b.innerHTML = `${ICO.play}<span>Redă</span>`;
  }

  function updateReplayCounter() {
    const el = document.getElementById('rpCounter');
    if (el) el.textContent = `Bara ${state.replay.idx}/${state.fullBars.length}`;
  }

  // ─── 15. MULTI-CHART LAYOUT ENGINE (1 UP TO 20 LIVE SCREENS + FOCUS) ───────
  function getNeededSecPanesCount(layoutCode) {
    if (layoutCode === '1') return 0;
    if (layoutCode === '2v' || layoutCode === '2h') return 1;
    if (layoutCode === '3v') return 2;
    if (layoutCode === '4') return 3;
    if (layoutCode === '6') return 5;
    if (layoutCode === '8') return 7;
    if (layoutCode === '9') return 8;
    if (layoutCode === '10') return 9;
    if (layoutCode === '12') return 11;
    if (layoutCode === '16') return 15;
    if (layoutCode === '20') return 19;
    return 0;
  }

  function focusChartPane(paneId) {
    const needed = getNeededSecPanesCount(state.layout);
    const cleanId = (state.layout === '1' || paneId < 0 || paneId > needed) ? 0 : Number(paneId) || 0;
    state.focusedPaneId = cleanId;
    saveSecondaryPanes();

    const priEl = document.getElementById('primaryPane');
    if (priEl) priEl.classList.toggle('focused-pane', cleanId === 0);

    secPanes.forEach(p => {
      const el = document.getElementById(`secPane${p.id}`);
      if (el) el.classList.toggle('focused-pane', cleanId === p.id);
    });

    const activeSym = getActiveFocusedSymbol();
    const activeTf = cleanId === 0 ? state.tf : (secPanes.find(x => x.id === cleanId)?.tf || state.tf);

    document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === activeTf));
    const cTfLbl = document.getElementById('customTfLbl');
    if (cTfLbl) {
      const isStd = ['5m', '15m', '30m', '1h', '4h', '1d'].includes(String(activeTf).toLowerCase());
      cTfLbl.textContent = isStd ? '+TF' : String(activeTf).replace('1wk', '1W').replace('1mo', '1M').toUpperCase();
      document.getElementById('customTfBtn')?.classList.toggle('active', !isStd);
    }

    renderWatchlist();
    renderLiveIndicesStrip();

    // Sync Right-Sidebar Details & News to the newly focused screen's symbol
    const dwTitle = document.getElementById('dwSymTitle');
    if (dwTitle) dwTitle.textContent = activeSym;
    setElementLogoAvatar('dwLogoBox', activeSym, '');
    if (fullQuoteCache[activeSym]) {
      updateDetailsWidget(fullQuoteCache[activeSym], activeSym);
    } else {
      const cachedQ = liveQuoteCache[activeSym];
      if (cachedQ) {
        const dwBig = document.getElementById('dwPriceBig');
        const dwChg = document.getElementById('dwChgBadge');
        if (dwBig && cachedQ.regHtml) dwBig.innerHTML = cachedQ.regHtml;
        if (dwChg && isFinite(cachedQ.regChgPct)) {
          dwChg.textContent = `${cachedQ.regChgPct >= 0 ? '+' : ''}${cachedQ.regChgPct.toFixed(2)}%`;
          dwChg.className = `pill ${cachedQ.regChgPct >= 0 ? 'pill-buy' : 'pill-sell'} tabular`;
        }
      } else if (cleanId === 0 && state.quote) {
        updateDetailsWidget(state.quote, activeSym);
      }
    }
    fetchSymbolNews(activeSym).then(news => {
      if (getActiveFocusedSymbol() === activeSym) {
        state.news = news;
        renderNewsList(news);
      }
    });
  }

  function assignSymbolToFocusedPane(rawSym) {
    const clean = normalizeSymbol(rawSym);
    if (!clean) return;
    resolveOfficialIdentity(clean);

    const needed = getNeededSecPanesCount(state.layout);
    if (state.layout !== '1' && state.focusedPaneId > 0 && state.focusedPaneId <= needed) {
      const p = secPanes.find(x => x.id === state.focusedPaneId);
      if (p) {
        p.sym = clean;
        const inp = document.getElementById(`secSymInput${p.id}`);
        if (inp) inp.value = clean;
        const logoBox = document.getElementById(`secLogoBox${p.id}`);
        if (logoBox) logoBox.innerHTML = renderLogoAvatar(clean, 'sm');
        const dwTitle = document.getElementById('dwSymTitle');
        if (dwTitle) dwTitle.textContent = clean;
        setElementLogoAvatar('dwLogoBox', clean, '');

        saveSecondaryPanes();
        syncLiveStreamSubscriptions();
        loadSecondaryPaneData(p);
        renderWatchlist();
        renderLiveIndicesStrip();
        refreshLiveQuotes();
        fetchSymbolNews(clean).then(news => {
          if (getActiveFocusedSymbol() === clean) {
            state.news = news;
            renderNewsList(news);
          }
        });
        closeMobileSheetsToChart();
        return;
      }
    }

    closeMobileSheetsToChart();
    loadSymbol(clean, state.tf);
  }

  function ensureSecondaryPaneDOM(p) {
    const grid = document.getElementById('chartsGrid');
    if (!grid) return null;
    let paneEl = document.getElementById(`secPane${p.id}`);
    if (!paneEl) {
      paneEl = document.createElement('div');
      paneEl.id = `secPane${p.id}`;
      paneEl.className = 'chart-pane secondary-pane';
      paneEl.innerHTML = `<div class="sec-pane-bar"></div><div id="secCanvas${p.id}" class="sec-canvas"></div>`;
      grid.appendChild(paneEl);
    }

    if (paneEl.dataset.wired !== '1') {
      paneEl.dataset.wired = '1';
      const bar = paneEl.querySelector('.sec-pane-bar');
      const tfOpts = [
        ['100t', '100T'], ['5s', '5s'], ['15s', '15s'], ['1m', '1m'], ['5m', '5m'],
        ['15m', '15m'], ['30m', '30m'], ['1h', '1h'], ['4h', '4h'], ['1d', '1D'], ['1wk', '1W']
      ];
      if (!tfOpts.some(([v]) => v === p.tf)) tfOpts.push([p.tf, String(p.tf).toUpperCase()]);

      if (bar) {
        bar.innerHTML = `
          <div style="display:flex;align-items:center;gap:5px;min-width:0;">
            <span id="secLogoBox${p.id}" style="display:inline-flex;align-items:center;">${renderLogoAvatar(p.sym, 'sm')}</span>
            <input id="secSymInput${p.id}" class="sec-pane-sym" value="${p.sym}" size="7" spellcheck="false" autocomplete="off" title="Scrie simbol + Enter (sau click pe ecran și alege din Watchlist)">
            <button id="secSearchBtn${p.id}" class="tb-btn icon-only" style="width:20px;height:20px;" title="Caută simbol pentru Ecranul #${p.id + 1}">
              <svg class="tv-ico sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7.5"/><line x1="20" y1="20" x2="16.35" y2="16.35"/></svg>
            </button>
            <select id="secTfSelect${p.id}" class="sec-pane-tf" title="Interval de timp Ecran #${p.id + 1}">
              ${tfOpts.map(([val, lbl]) => `<option value="${val}" ${val === p.tf ? 'selected' : ''}>${lbl}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:5px;min-width:0;">
            <span id="secLivePrice${p.id}" class="tabular" style="font-size:11px;font-weight:700;">—</span>
            <span id="secLiveChg${p.id}" class="tabular" style="font-size:10px;font-weight:700;">—</span>
            <span id="secSigBadge${p.id}" class="pill pill-neut">—</span>
            <button id="secMaxBtn${p.id}" class="tb-btn icon-only" style="width:20px;height:20px;" title="Maximizează pe tot ecranul">
              <svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="13" y2="11"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>
            </button>
          </div>
        `;
      }

      paneEl.addEventListener('pointerdown', () => {
        if (state.focusedPaneId !== p.id) focusChartPane(p.id);
      });

      const inp = document.getElementById(`secSymInput${p.id}`);
      const sel = document.getElementById(`secTfSelect${p.id}`);
      const sBtn = document.getElementById(`secSearchBtn${p.id}`);
      const maxBtn = document.getElementById(`secMaxBtn${p.id}`);

      if (inp) {
        const applyInpSym = () => {
          const nextSym = normalizeSymbol(inp.value);
          if (nextSym && nextSym !== p.sym) {
            p.sym = nextSym;
            inp.value = nextSym;
            saveSecondaryPanes();
            syncLiveStreamSubscriptions();
            loadSecondaryPaneData(p);
            focusChartPane(p.id);
            refreshLiveQuotes();
          } else {
            inp.value = p.sym;
          }
        };
        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('autocorrect', 'off');
        inp.setAttribute('spellcheck', 'false');
        inp.setAttribute('data-lpignore', 'true');
        inp.setAttribute('data-form-type', 'other');
        attachFloatingSymbolAutocomplete(inp, (pickedSym) => {
          hideFloatingSymbolAutocomplete();
          p.sym = pickedSym;
          inp.value = pickedSym;
          const logoBox = document.getElementById(`secLogoBox${p.id}`);
          if (logoBox) logoBox.innerHTML = renderLogoAvatar(pickedSym, 'sm');
          saveSecondaryPanes();
          syncLiveStreamSubscriptions();
          loadSecondaryPaneData(p);
          focusChartPane(p.id);
          refreshLiveQuotes();
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            if (isFloatingSuggestOpenFor(inp) && pickActiveFloatingSuggestion()) {
              e.preventDefault();
              inp.blur();
              return;
            }
            e.preventDefault();
            applyInpSym();
            inp.blur();
          }
        });
        inp.addEventListener('change', applyInpSym);
      }

      if (sBtn) {
        sBtn.onclick = (e) => {
          e.stopPropagation();
          focusChartPane(p.id);
          openSymbolModal('');
        };
      }

      if (sel) {
        sel.onchange = () => {
          p.tf = sel.value;
          saveSecondaryPanes();
          loadSecondaryPaneData(p);
          focusChartPane(p.id);
        };
      }

      if (maxBtn) {
        maxBtn.onclick = (e) => {
          e.stopPropagation();
          const symToMax = p.sym;
          const tfToMax = p.tf;
          setMultiChartLayout('1');
          loadSymbol(symToMax, tfToMax);
        };
      }
    } else {
      const inp = document.getElementById(`secSymInput${p.id}`);
      const sel = document.getElementById(`secTfSelect${p.id}`);
      if (inp && document.activeElement !== inp) inp.value = p.sym;
      if (sel) {
        if (!Array.from(sel.options).some(o => o.value === p.tf)) {
          const opt = document.createElement('option');
          opt.value = p.tf;
          opt.textContent = String(p.tf).toUpperCase();
          sel.appendChild(opt);
        }
        sel.value = p.tf;
      }
    }

    return paneEl;
  }

  async function setMultiChartLayout(layoutCode) {
    const validLayouts = ['1', '2v', '2h', '3v', '4', '6', '8', '9', '10', '12', '16', '20'];
    const cleanLayout = validLayouts.includes(layoutCode) ? layoutCode : '1';
    state.layout = cleanLayout;
    localStorage.setItem('tp_ultra_layout', cleanLayout);

    const grid = document.getElementById('chartsGrid');
    if (grid) grid.className = `layout-${cleanLayout}`;
    document.querySelectorAll('[data-layout]').forEach(i => i.classList.toggle('active', i.dataset.layout === cleanLayout));

    const needed = getNeededSecPanesCount(cleanLayout);
    const activeLayoutLbl = document.getElementById('activeLayoutLbl');
    if (activeLayoutLbl) activeLayoutLbl.textContent = String(needed + 1);

    if (state.focusedPaneId > needed) state.focusedPaneId = 0;

    const toLoad = [];
    for (let i = 0; i < secPanes.length; i++) {
      const p = secPanes[i];
      const active = i < needed;
      if (active && state.syncMultiTf) p.tf = state.tf;
      const paneEl = active ? ensureSecondaryPaneDOM(p) : document.getElementById(`secPane${p.id}`);
      if (!paneEl) continue;
      paneEl.classList.toggle('pane-enabled', active);
      if (active) {
        if (!p.chart) initSecondaryPaneChart(p);
        toLoad.push(p);
      }
    }

    saveSecondaryPanes();
    focusChartPane(state.focusedPaneId);
    syncLiveStreamSubscriptions();
    setTimeout(resizeAllCharts, 50);

    // Load active secondary panes in smooth parallel batches of 5 (handles up to 20 live charts effortlessly)
    for (let k = 0; k < toLoad.length; k += 5) {
      const batch = toLoad.slice(k, k + 5);
      await Promise.all(batch.map(p => loadSecondaryPaneData(p)));
      resizeAllCharts();
    }
  }

  function initSecondaryPaneChart(p) {
    const el = document.getElementById(`secCanvas${p.id}`);
    if (!el) return;
    p.chart = LightweightCharts.createChart(el, makeChartConfig(el.clientWidth || 360, el.clientHeight || 220));
    p.candle = p.chart.addCandlestickSeries({
      upColor: '#089981', downColor: '#f23645',
      borderUpColor: '#089981', borderDownColor: '#f23645',
      wickUpColor: '#089981', wickDownColor: '#f23645',
      priceLineVisible: true,
      lastValueVisible: true
    });
    p.ema = p.chart.addLineSeries({ color: '#2962ff', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    p.stBull = p.chart.addLineSeries({ color: '#089981', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
    p.stBear = p.chart.addLineSeries({ color: '#f23645', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false });
  }

  async function loadSecondaryPaneData(p) {
    if (!p.chart) return;
    resolveOfficialIdentity(p.sym);
    const logoBox = document.getElementById(`secLogoBox${p.id}`);
    if (logoBox) logoBox.innerHTML = renderLogoAvatar(p.sym, 'sm');
    const inp = document.getElementById(`secSymInput${p.id}`);
    if (inp && document.activeElement !== inp) inp.value = p.sym;
    const sel = document.getElementById(`secTfSelect${p.id}`);
    if (sel) {
      if (!Array.from(sel.options).some(o => o.value === p.tf)) {
        const opt = document.createElement('option');
        opt.value = p.tf;
        opt.textContent = String(p.tf).toUpperCase();
        sel.appendChild(opt);
      }
      sel.value = p.tf;
    }

    try {
      const tfLow = String(p.tf || '').toLowerCase();
      p.chart.timeScale().applyOptions({ secondsVisible: /^\d+(s|t)$/.test(tfLow) });
      const { bars, meta } = await fetchOHLCV(p.sym, p.tf);
      p.bars = bars;
      p.candle.setData(bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      p.ema.setData(Q.toSeries(bars, Q.calcEMAArray(bars.map(x => x.close), 21)));
      const st = Q.calcSuperTrend(bars, 10, 3.0);
      p.stBull.setData(st.bullSeries);
      p.stBear.setData(st.bearSeries);
      const sig = Q.runSmartSignalEngine(bars);
      p.candle.setMarkers(sig.markers);
      resizeAllCharts();
      focusLiveEvolution(p.chart, bars.length, 72, 5);

      const liveEl = document.getElementById(`secLivePrice${p.id}`);
      const chgEl = document.getElementById(`secLiveChg${p.id}`);
      if (bars.length) {
        const cached = liveQuoteCache[p.sym];
        const lastB = bars[bars.length - 1];
        const prevB = bars[bars.length - 2] || lastB;
        const refPrev = meta?.chartPreviousClose ?? cached?.prevClose ?? prevB.close;
        const pct = cached && isFinite(cached.chgPct)
          ? cached.chgPct
          : (refPrev ? ((lastB.close - refPrev) / refPrev) * 100 : 0);
        if (liveEl) {
          liveEl.innerHTML = cached?.html || formatSplitTickHTML(prevB.close, lastB.close, pct >= 0 ? 1 : -1);
        }
        if (chgEl) {
          chgEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
          chgEl.className = `tabular ${pct >= 0 ? 'up' : 'dn'}`;
        }
      }

      const badge = document.getElementById(`secSigBadge${p.id}`);
      if (badge && sig.currentPlan) {
        const cp = sig.currentPlan;
        badge.textContent = `${cp.status === 'BUY_NOW' ? 'BUY' : cp.status === 'SELL_NOW' ? 'SELL' : (cp.stBull ? 'BULL' : 'BEAR')} ${cp.score}`;
        badge.className = `pill ${cp.stBull ? 'pill-buy' : 'pill-sell'}`;
      }
    } catch (_) { }
  }

  // ─── 16. MAIN SYMBOL, COMPARE/SPREAD & CSV EXPORT ENGINE ──────────────────
  const SYMBOL_ALIASES = {
    NAS: 'NQ=F', NAS100: '^NDX', NDX: '^NDX', US100: 'NQ=F', NASDAQ: '^IXIC',
    SP: 'ES=F', SPX: '^GSPC', SP500: '^GSPC', US500: 'ES=F', DOW: 'YM=F', US30: 'YM=F', VIX: '^VIX',
    GOLD: 'GC=F', XAUUSD: 'GC=F', OIL: 'CL=F', CL: 'CL=F', WTI: 'CL=F', SILVER: 'SI=F',
    BITCOIN: 'BTC-USD', BTC: 'BTC-USD', ETH: 'ETH-USD', ETHEREUM: 'ETH-USD',
    EGLD: 'EGLD-USD', TRX: 'TRX-USD', SOL: 'SOL-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD', ADA: 'ADA-USD',
    EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X', EURRON: 'EURRON=X'
  };

  function normalizeSymbol(raw) {
    let s = String(raw || '').trim().toUpperCase();
    if (!s) return '';
    return SYMBOL_ALIASES[s] || s;
  }

  async function setCompareSpec(spec) {
    const cleanSpec = String(spec || '').trim().toUpperCase();
    state.compareSpec = cleanSpec;

    const btn = document.getElementById('compareTopBtn');
    const lbl = document.getElementById('compareTopLbl');
    if (btn) btn.classList.toggle('active', !!cleanSpec);
    if (lbl) {
      lbl.textContent = !cleanSpec
        ? 'Spread'
        : cleanSpec.startsWith('SPR:')
          ? `/ ${cleanSpec.slice(4)}`
          : `vs ${cleanSpec.slice(4)}`;
    }
    document.querySelectorAll('[data-compare]').forEach(el => {
      el.classList.toggle('active', el.dataset.compare === cleanSpec);
    });

    if (cleanSpec && cleanSpec.length > 4) {
      const refSym = normalizeSymbol(cleanSpec.slice(4));
      try {
        const { bars } = await fetchOHLCV(refSym, state.tf);
        state.compareBars = bars;
      } catch (_) {
        state.compareBars = [];
      }
    } else {
      state.compareBars = [];
    }

    state.fullBars = buildEffectiveFullBars();
    state.bars = state.replay.active
      ? state.fullBars.slice(0, Math.min(state.replay.idx, state.fullBars.length))
      : [...state.fullBars];
    renderChartAndQuant(true);
  }

  function exportChartCSV() {
    const bars = state.bars;
    if (!bars || !bars.length) return;
    const closes = bars.map(b => b.close);
    const ema21 = Q.calcEMAArray(closes, 21);
    const ema50 = Q.calcEMAArray(closes, 50);
    const rsi14 = Q.calcRSIArray(closes, 14);
    const sigMap = new Map();
    (state.lastSignalOut?.trades || []).forEach(t => {
      sigMap.set(t.entryTime, `${t.isBuy ? 'BUY' : 'SELL'}_${t.grade}`);
    });

    const rows = ['ISO_Date,Timestamp,Open,High,Low,Close,Volume,EMA21,EMA50,RSI14,SmartSignal'];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const iso = new Date(b.time * 1000).toISOString();
      const e21 = ema21[i] != null ? ema21[i].toFixed(4) : '';
      const e50 = ema50[i] != null ? ema50[i].toFixed(4) : '';
      const r14 = rsi14[i] != null ? rsi14[i].toFixed(2) : '';
      const sig = sigMap.get(b.time) || '';
      rows.push(`${iso},${b.time},${b.open},${b.high},${b.low},${b.close},${b.volume || 0},${e21},${e50},${r14},${sig}`);
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TradePro_${state.symbol.replace(/[^A-Z0-9_-]/gi, '_')}_${state.tf}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('Export CSV Finalizat', `${bars.length} bare salvate pentru ${state.symbol} (${state.tf}).`, 'buy', state.symbol);
  }

  function addSymbolToWatchlist(rawInput, { loadOnChart = true, knownName = '' } = {}) {
    const tokens = String(rawInput || '')
      .split(/[\s,;]+/)
      .map(normalizeSymbol)
      .filter(s => s && /^[A-Z0-9.^=\-]+$/.test(s));

    if (!tokens.length) {
      showToast('Simbol Invalid', 'Introdu un ticker valid (ex: APPS, ONDS, NVDA, SPY, BTC-USD).', 'sell');
      return;
    }

    let firstSym = tokens[0];
    let addedCount = 0;

    for (let i = tokens.length - 1; i >= 0; i--) {
      const sym = tokens[i];
      const existingIdx = state.watchlist.findIndex(x => String(x.sym).toUpperCase() === sym);
      const catHit = SYMBOL_CATALOG.find(c => c.sym === sym);
      const cachedDesc = officialIdentityCache[sym]?.desc;
      const bestName = (i === 0 && knownName) ? knownName : (catHit?.name || cachedDesc || sym);

      if (existingIdx !== -1) {
        const [existing] = state.watchlist.splice(existingIdx, 1);
        if (bestName && (!existing.name || existing.name === sym)) existing.name = bestName;
        state.watchlist.unshift(existing);
      } else {
        state.watchlist.unshift({ sym, name: bestName });
        addedCount++;
      }
      resolveOfficialIdentity(sym);
    }

    saveWatchlist();
    renderWatchlist();
    syncLiveStreamSubscriptions();
    const wlCont = document.getElementById('watchlistContainer');
    if (wlCont) wlCont.scrollTop = 0;

    if (loadOnChart) {
      assignSymbolToFocusedPane(firstSym);
    } else {
      refreshLiveQuotes();
    }

    const msgTitle = addedCount > 0 ? `${firstSym} adăugat în Watchlist` : `${firstSym} selectat în Watchlist`;
    const msgBody = tokens.length > 1
      ? `${tokens.length} simboluri actualizate și încărcate live.`
      : `Cotația live și graficul pentru ${firstSym} au fost încărcate.`;
    syncChartWatchlistBtn(firstSym);
    showToast(msgTitle, msgBody, 'buy', firstSym);
  }

  function isSymbolInWatchlist(sym) {
    const clean = String(sym || '').toUpperCase().trim();
    return Boolean(clean && state.watchlist.some(w => String(w.sym).toUpperCase() === clean));
  }

  function syncChartWatchlistBtn(sym = getActiveFocusedSymbol()) {
    const btn = document.getElementById('chartWlToggleBtn');
    const txt = document.getElementById('chartWlToggleTxt');
    if (!btn || !txt) return;
    const clean = String(sym || state.symbol || '').toUpperCase().trim();
    const inWl = isSymbolInWatchlist(clean);
    btn.classList.toggle('in-wl', inWl);
    btn.setAttribute('aria-pressed', inWl ? 'true' : 'false');
    txt.textContent = inWl ? `În Watchlist` : `+ Adaugă Watchlist`;
    btn.title = inWl
      ? `${clean} este în Watchlist (Click pentru a elimina)`
      : `Adaugă ${clean} în Watchlist`;
  }

  function toggleSymbolInWatchlist(rawSym = getActiveFocusedSymbol()) {
    const sym = normalizeSymbol(rawSym || state.symbol);
    if (!sym) return false;
    if (isSymbolInWatchlist(sym)) {
      state.watchlist = state.watchlist.filter(x => String(x.sym).toUpperCase() !== sym);
      saveWatchlist();
      renderWatchlist();
      syncLiveStreamSubscriptions();
      syncChartWatchlistBtn(sym);
      showToast('Watchlist', `${sym} a fost eliminat din Watchlist`, 'sell', sym);
      return false;
    } else {
      addSymbolToWatchlist(sym, { loadOnChart: false });
      syncChartWatchlistBtn(sym);
      return true;
    }
  }

  let loadSymbolSeq = 0;
  async function loadSymbol(symbol, tf = state.tf) {
    const cleanSym = normalizeSymbol(symbol || state.symbol);
    if (!cleanSym) return;
    const mySeq = ++loadSymbolSeq;

    stopReplayTimer();
    state.replay.active = false;
    state.liveTickCount = 0;
    state.prevChartPrice = null;
    document.getElementById('replayControls')?.classList.remove('visible');
    document.getElementById('replayToggleBtn')?.classList.remove('active');

    state.symbol = cleanSym;
    state.tf = tf;
    localStorage.setItem('tp_ultra_symbol', cleanSym);
    localStorage.setItem('tp_ultra_tf', tf);

    const primaryFocused = state.layout === '1' || state.focusedPaneId === 0;
    if (primaryFocused) {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === tf));
      const cTfLbl = document.getElementById('customTfLbl');
      if (cTfLbl) {
        const isStd = ['5m', '15m', '30m', '1h', '4h', '1d'].includes(String(tf).toLowerCase());
        cTfLbl.textContent = isStd ? '+TF' : String(tf).replace('1wk', '1W').replace('1mo', '1M').toUpperCase();
        document.getElementById('customTfBtn')?.classList.toggle('active', !isStd);
      }
      const dwTitle = document.getElementById('dwSymTitle');
      if (dwTitle) dwTitle.textContent = cleanSym;
      setElementLogoAvatar('dwLogoBox', cleanSym, '');
    }

    if (overlayEngine) overlayEngine.setSymbol(cleanSym);
    resolveOfficialIdentity(cleanSym);
    syncLiveStreamSubscriptions();

    const loader = document.getElementById('loadOverlay');
    loader.style.display = 'inline-flex';
    document.getElementById('loadText').textContent = `Încarc ${cleanSym} (${tf})...`;

    try {
      const cmpSym = state.compareSpec && state.compareSpec.length > 4
        ? normalizeSymbol(state.compareSpec.slice(4))
        : '';
      const [{ bars, meta, demo }, cmpRes] = await Promise.all([
        fetchOHLCV(cleanSym, tf),
        cmpSym ? fetchOHLCV(cmpSym, tf).catch(() => null) : Promise.resolve(null)
      ]);
      if (mySeq !== loadSymbolSeq || state.symbol !== cleanSym) return;

      state.rawFetchedBars = bars;
      state.compareBars = cmpRes?.bars || [];
      state.fullBars = buildEffectiveFullBars();
      state.bars = [...state.fullBars];
      state.meta = meta;

      // Populate instant quote metrics from cached full quote or raw bars + meta on frame 1
      if (bars.length >= 2) {
        const lastB = bars[bars.length - 1];
        const prevB = bars[bars.length - 2];
        const regRef = meta?.regularMarketPrice ?? lastB.close;
        const pClose = meta?.chartPreviousClose ?? prevB.close;
        const chg = regRef - pClose;
        const chgPct = pClose ? (chg / pClose) * 100 : 0;
        const cachedDesc = officialIdentityCache[cleanSym]?.desc;
        const catDesc = SYMBOL_CATALOG.find(c => c.sym === cleanSym)?.name;
        const resolvedName = meta?.longName || meta?.shortName || cachedDesc || catDesc || cleanSym;
        const instantQ = fullQuoteCache[cleanSym] || {
          symbol: cleanSym,
          shortName: resolvedName,
          longName: meta?.longName || resolvedName,
          fullExchangeName: meta?.fullExchangeName || meta?.exchangeName || '',
          currency: meta?.currency || 'USD',
          regularMarketPrice: regRef,
          regularMarketPreviousClose: pClose,
          regularMarketChange: chg,
          regularMarketChangePercent: chgPct,
          regularMarketDayLow: meta?.regularMarketDayLow ?? lastB.low,
          regularMarketDayHigh: meta?.regularMarketDayHigh ?? lastB.high,
          fiftyTwoWeekLow: meta?.fiftyTwoWeekLow,
          fiftyTwoWeekHigh: meta?.fiftyTwoWeekHigh,
          regularMarketVolume: meta?.regularMarketVolume
        };
        state.quote = instantQ;
        if (state.layout === '1' || state.focusedPaneId === 0) {
          updateDetailsWidget(instantQ, cleanSym);
        }

        const wlItem = state.watchlist.find(w => w.sym === cleanSym);
        if (wlItem && !demo && !fullQuoteCache[cleanSym]) {
          wlItem.price = regRef;
          wlItem.regPrice = regRef;
          wlItem.chg = chg;
          wlItem.regChg = chg;
          wlItem.chgPct = chgPct;
          wlItem.regChgPct = chgPct;
          wlItem.livePriceHtml = formatSplitTickHTML(pClose, regRef, chg >= 0 ? 1 : -1);
          if (resolvedName && resolvedName !== cleanSym) {
            wlItem.name = resolvedName;
            saveWatchlist();
          }
        }
      }

      renderChartAndQuant(true);
      const cpInit = state.lastSignalOut?.currentPlan;
      const lastSigInit = state.lastSignalOut?.signals?.length
        ? state.lastSignalOut.signals[state.lastSignalOut.signals.length - 1].time
        : (state.bars[state.bars.length - 1]?.time || 0);
      tgClient.baselineSigKey = cpInit ? `${state.symbol}:${state.tf}:${cpInit.status}:${lastSigInit}` : 'init';
      syncTelegramBridge();
      renderWatchlist();
      renderLiveIndicesStrip();
      updateBarCountdown();
      window.dispatchEvent(new CustomEvent('tp:symbolLoaded', { detail: { sym: cleanSym, tf, barsCount: state.bars.length } }));

      // Demo warning pill if offline
      const oldDemo = document.getElementById('demoWarnBadge');
      if (oldDemo) oldDemo.remove();
      if (demo) {
        const b = document.createElement('div');
        b.id = 'demoWarnBadge';
        b.style.cssText = 'position:absolute;bottom:10px;right:72px;z-index:20;background:var(--bg-popover);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid var(--border-strong);color:var(--tv-amber);padding:5px 11px;border-radius:999px;font-size:10.5px;font-weight:600;box-shadow:var(--glass-rim),var(--shadow-md);';
        b.textContent = `Feed indisponibil pentru ${cleanSym}`;
        document.getElementById('mainChartStage').appendChild(b);
      }

      // Async enrichments (Quotes, News, Multi-Timeframe Matrix)
      refreshLiveQuotes();
      if (state.layout === '1' || state.focusedPaneId === 0) {
        fetchSymbolNews(cleanSym).then(news => { state.news = news; renderNewsList(news); });
      }
      refreshMTFMatrix(cleanSym);
    } finally {
      loader.style.display = 'none';
    }
  }

  function switchTimeframe(rawTf) {
    const tf = String(rawTf || '').trim().toLowerCase();
    if (!tf) return;
    const needed = getNeededSecPanesCount(state.layout);

    if (state.syncMultiTf && state.layout !== '1') {
      loadSymbol(state.symbol, tf);
      for (let i = 0; i < needed; i++) {
        const p = secPanes[i];
        p.tf = tf;
        const sel = document.getElementById(`secTfSelect${p.id}`);
        if (sel) {
          if (!Array.from(sel.options).some(o => o.value === tf)) {
            const opt = document.createElement('option');
            opt.value = tf;
            opt.textContent = tf.toUpperCase();
            sel.appendChild(opt);
          }
          sel.value = tf;
        }
        loadSecondaryPaneData(p);
      }
      saveSecondaryPanes();
      focusChartPane(state.focusedPaneId);
      return;
    }

    if (state.layout !== '1' && state.focusedPaneId > 0 && state.focusedPaneId <= needed) {
      const p = secPanes.find(x => x.id === state.focusedPaneId);
      if (p) {
        p.tf = tf;
        saveSecondaryPanes();
        loadSecondaryPaneData(p);
        focusChartPane(p.id);
        return;
      }
    }

    loadSymbol(state.symbol, tf);
  }

  function toggleIndicator(key) {
    state.indicators[key] = !state.indicators[key];
    localStorage.setItem('tp_ultra_inds_v3', JSON.stringify(state.indicators));
    document.getElementById('smartSigTopBtn')?.classList.toggle('active', !!state.indicators.smartSignals);
    renderIndicatorsModalList();
    renderChartAndQuant(false);
  }

  // ─── 17. LIVE VERIFIED SYMBOL SEARCH, AUTOCOMPLETE & MODALS ───────────────
  const globalSearchCache = new Map();
  let symSearchDebounce = null;
  let symModalReqSeq = 0;
  let lastModalItems = [];
  let modalSugIdx = 0;

  let wlSuggestTimer = null;
  let wlSuggestReqSeq = 0;
  let wlSugItems = [];
  let wlSugIdx = 0;

  let floatSuggestTimer = null;
  let floatSuggestReqSeq = 0;
  let floatSugItems = [];
  let floatSugIdx = 0;
  let floatAnchorInput = null;
  let floatPickCallback = null;

  function escAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function highlightMatchHtml(text, rawQuery) {
    const src = String(text ?? '');
    const qClean = String(rawQuery || '').trim();
    if (!qClean) return escTg(src);
    const tokens = qClean
      .split(/\s+/)
      .filter(Boolean)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!tokens.length) return escTg(src);
    const rx = new RegExp(`(${tokens.join('|')})`, 'gi');
    return src.split(rx).map((part, idx) =>
      idx % 2 === 1 ? `<mark class="sym-hl">${escTg(part)}</mark>` : escTg(part)
    ).join('');
  }

  function enrichWithCachedLiveQuote(item) {
    const q = liveQuoteCache[item.sym];
    const wl = state.watchlist.find(w => w.sym === item.sym);
    const cachedId = officialIdentityCache[item.sym];
    return {
      ...item,
      name: (item.name && item.name !== item.sym) ? item.name : (cachedId?.desc || wl?.name || item.sym),
      exch: item.exch || cachedId?.exch || 'MARKET',
      price: item.price != null ? item.price : (q?.regPrice ?? q?.price ?? wl?.price ?? null),
      chgPct: item.chgPct != null ? item.chgPct : (q?.regChgPct ?? q?.chgPct ?? wl?.chgPct ?? null),
      extType: item.extType || q?.extType || wl?.extType || '',
      extPrice: item.extPrice != null ? item.extPrice : (q?.extPrice ?? wl?.extPrice ?? null),
      extChgPct: item.extChgPct != null ? item.extChgPct : (q?.extChgPct ?? wl?.extChgPct ?? null)
    };
  }

  function getLocalVerifiedMatches(rawQuery, cat = 'all', limit = 10) {
    const qClean = String(rawQuery || '').trim().toUpperCase();
    const tokens = qClean ? qClean.split(/\s+/).filter(Boolean) : [];
    const normSym = qClean ? normalizeSymbol(qClean) : '';

    const poolMap = new Map();
    for (const c of SYMBOL_CATALOG) {
      poolMap.set(c.sym, { ...c });
    }
    for (const w of state.watchlist) {
      if (!poolMap.has(w.sym)) {
        poolMap.set(w.sym, {
          sym: w.sym,
          name: w.name || officialIdentityCache[w.sym]?.desc || w.sym,
          exch: officialIdentityCache[w.sym]?.exch || 'WATCHLIST',
          cat: getAssetCategory(w.sym)
        });
      }
    }

    let arr = Array.from(poolMap.values()).filter(it => cat === 'all' || it.cat === cat);

    if (tokens.length > 0) {
      arr = arr.filter(it => {
        const hay = `${it.sym} ${it.name || ''}`.toUpperCase();
        if (normSym && it.sym === normSym) return true;
        return tokens.every(tok => hay.includes(tok));
      });

      const scoreFn = (it) => {
        let sc = 0;
        const nm = String(it.name || '').toUpperCase();
        if (it.sym === qClean || (normSym && it.sym === normSym)) sc += 1000;
        else if (it.sym.startsWith(qClean)) sc += 520;
        else if (it.sym.includes(qClean)) sc += 260;
        if (nm === qClean) sc += 450;
        else if (nm.startsWith(qClean)) sc += 320;
        else if (nm.includes(` ${qClean}`) || nm.includes(qClean)) sc += 180;
        return sc;
      };
      arr.sort((a, b) => scoreFn(b) - scoreFn(a));
    }

    return arr.slice(0, limit).map(enrichWithCachedLiveQuote);
  }

  async function queryGlobalVerifiedSymbols(rawQuery, cat = 'all') {
    const qClean = String(rawQuery || '').trim().replace(/\s+/g, ' ');
    if (!qClean) return getLocalVerifiedMatches('', cat, 14);

    const cacheKey = `${qClean.toUpperCase()}::${cat}`;
    const cached = globalSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 15000) {
      return cached.items.map(enrichWithCachedLiveQuote);
    }

    const endpoints = IS_LOCAL
      ? [
        `/api/search?q=${encodeURIComponent(qClean)}&cat=${encodeURIComponent(cat)}`,
        `http://localhost:9030/api/search?q=${encodeURIComponent(qClean)}&cat=${encodeURIComponent(cat)}`
      ]
      : [`/api/search?q=${encodeURIComponent(qClean)}&cat=${encodeURIComponent(cat)}`];

    let remoteResults = null;
    for (const ep of endpoints) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(ep, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(tid);
        if (!res.ok) continue;
        const json = await res.json();
        if (json && Array.isArray(json.results)) {
          remoteResults = json.results;
          break;
        }
      } catch (_) {
        clearTimeout(tid);
      }
    }

    if (!remoteResults) {
      try {
        const u = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(qClean)}&quotesCount=10&newsCount=0`;
        const yJson = await fetchViaProxy(u, 4500);
        remoteResults = (yJson?.quotes || [])
          .filter(x => x?.symbol && String(x.quoteType || '').toLowerCase() !== 'option')
          .map(x => ({
            sym: String(x.symbol).toUpperCase(),
            name: x.longname || x.shortname || x.symbol,
            exch: String(x.exchDisp || x.exchange || 'MARKET').toUpperCase(),
            cat: getAssetCategory(x.symbol),
            logoid: '',
            price: null,
            chgPct: null
          }));
      } catch (_) {
        remoteResults = [];
      }
    }

    let idChanged = false;
    for (const r of remoteResults) {
      if (!r?.sym) continue;
      if (r.logoid || (r.name && r.name !== r.sym)) {
        const curId = officialIdentityCache[r.sym];
        if (!curId || (!curId.logoid && r.logoid) || (!curId.desc && r.name)) {
          officialIdentityCache[r.sym] = {
            logoid: r.logoid || curId?.logoid || '',
            desc: (r.name && r.name !== r.sym) ? r.name : (curId?.desc || ''),
            exch: r.exch || curId?.exch || '',
            ts: Date.now()
          };
          idChanged = true;
        }
      }
      if (r.price != null && isFinite(r.price) && !liveQuoteCache[r.sym]) {
        liveQuoteCache[r.sym] = {
          price: r.price,
          chg: 0,
          chgPct: r.chgPct ?? 0,
          html: formatSplitTickHTML(null, r.price, (r.chgPct ?? 0) >= 0 ? 1 : -1)
        };
      }
    }
    if (idChanged) saveIdentityCache();

    const localHits = getLocalVerifiedMatches(qClean, cat, 8);
    const mergedMap = new Map();

    for (const it of remoteResults) {
      if (!it?.sym) continue;
      mergedMap.set(it.sym, enrichWithCachedLiveQuote(it));
    }
    for (const loc of localHits) {
      if (!mergedMap.has(loc.sym)) {
        mergedMap.set(loc.sym, enrichWithCachedLiveQuote(loc));
      } else {
        const cur = mergedMap.get(loc.sym);
        if ((!cur.name || cur.name === cur.sym) && loc.name) cur.name = loc.name;
        if (cur.price == null && loc.price != null) {
          cur.price = loc.price;
          cur.chgPct = loc.chgPct;
        }
      }
    }

    const qUpper = qClean.toUpperCase();
    const normSym = normalizeSymbol(qClean);
    const merged = Array.from(mergedMap.values());
    merged.sort((a, b) => {
      const aExact = (a.sym === qUpper || a.sym === normSym) ? 1 : 0;
      const bExact = (b.sym === qUpper || b.sym === normSym) ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      const aPre = a.sym.startsWith(qUpper) ? 1 : 0;
      const bPre = b.sym.startsWith(qUpper) ? 1 : 0;
      if (bPre !== aPre) return bPre - aPre;
      return 0;
    });

    globalSearchCache.set(cacheKey, { ts: Date.now(), items: merged });
    return merged;
  }

  function formatSearchPriceHtml(it) {
    const lq = liveQuoteCache[it.sym];
    const p = it.price ?? lq?.regPrice ?? lq?.price;
    const pct = it.chgPct ?? lq?.regChgPct ?? lq?.chgPct;
    if (p == null || !isFinite(p)) return '';
    const pctStr = (pct != null && isFinite(pct))
      ? `<span class="${pct >= 0 ? 'up' : 'dn'}" style="font-size:9.5px;font-weight:700;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>`
      : '';
    const eType = it.extType || lq?.extType || '';
    const ePrice = it.extPrice ?? lq?.extPrice;
    const ePct = it.extChgPct ?? lq?.extChgPct ?? 0;
    const extStr = (eType && ePrice != null && isFinite(ePrice))
      ? `<div class="wl-ext-tag ${eType === 'PRE' ? 'pre' : 'post'}" style="font-size:9px;margin-top:1px;">${eType === 'PRE' ? 'Pre' : 'Post'} ${fmt(ePrice)} (${ePct >= 0 ? '+' : ''}${ePct.toFixed(2)}%)</div>`
      : '';
    return `
      <div class="tabular" style="text-align:right;line-height:1.2;flex-shrink:0;">
        <div style="font-size:11px;font-weight:700;color:var(--text-bright);">${fmt(p)}</div>
        ${pctStr}
        ${extStr}
      </div>
    `;
  }

  function openSymbolModal(initialQuery = '') {
    const modal = document.getElementById('symbolModal');
    const inp = document.getElementById('symSearchModalInput');
    const clr = document.getElementById('clearModalSearchBtn');
    modal.classList.add('open');
    inp.value = initialQuery;
    if (clr) clr.style.display = initialQuery ? 'inline-flex' : 'none';
    inp.focus();
    const activeCat = document.querySelector('[data-symcat].active')?.dataset.symcat || 'all';
    renderSymbolCatalog(initialQuery, activeCat);
  }

  function updateModalRowHighlight() {
    const rows = document.querySelectorAll('#symSearchResults .sym-result-row');
    rows.forEach((r, idx) => {
      const active = idx === modalSugIdx;
      r.classList.toggle('active-sug', active);
      if (active) r.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderSymbolCatalog(query = '', cat = 'all') {
    const box = document.getElementById('symSearchResults');
    const statusEl = document.getElementById('symSearchStatusBar');
    const clr = document.getElementById('clearModalSearchBtn');
    const q = String(query || '').trim();
    if (clr) clr.style.display = q ? 'inline-flex' : 'none';

    const mySeq = ++symModalReqSeq;
    const local = getLocalVerifiedMatches(q, cat, q ? 10 : 28);

    const renderRows = (items, isSearchingRemote = false) => {
      lastModalItems = items;
      modalSugIdx = 0;

      if (statusEl) {
        if (!q) {
          statusEl.textContent = `Catalog verificat (${items.length} instrumente) · Scrie ticker sau companie pentru căutare globală live`;
        } else if (isSearchingRemote) {
          statusEl.textContent = `Caut «${q}» live pe NASDAQ, NYSE, Crypto, Forex...`;
        } else if (items.length > 0) {
          statusEl.textContent = `${items.length} simboluri verificate pentru «${q}» · Navigare taste Sus/Jos · Enter deschide`;
        } else {
          statusEl.textContent = `0 rezultate pentru «${q}» · Verifică ortografia simbolului`;
        }
      }

      if (!items.length && !isSearchingRemote) {
        box.innerHTML = `
          <div class="sym-sug-empty" style="padding:28px 18px;">
            <div><b>Niciun simbol bursier găsit pentru «${escTg(q)}»</b></div>
            <div style="margin-top:5px;">Verifică dacă ai scris corect tickerul sau caută direct după numele companiei (ex: <code>Ondas</code>, <code>ONDS</code>, <code>Digital Turbine</code>, <code>Tesla</code>, <code>Bitcoin</code>).</div>
          </div>
        `;
        return;
      }

      if (!items.length && isSearchingRemote) {
        box.innerHTML = `<div class="sym-sug-empty" style="padding:24px 18px;">Se verifică «${escTg(q)}» pe bursele globale...</div>`;
        return;
      }

      box.innerHTML = items.map((it, idx) => {
        const inWl = state.watchlist.some(w => String(w.sym).toUpperCase() === String(it.sym).toUpperCase());
        return `
          <div class="sym-result-row ${idx === modalSugIdx ? 'active-sug' : ''}" data-picksym="${escAttr(it.sym)}" data-pickname="${escAttr(it.name || '')}">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
              ${renderLogoAvatar(it.sym, 'lg')}
              <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-weight:800;color:var(--text-bright);font-size:13px;">${highlightMatchHtml(it.sym, q)}</span>
                  ${it.badge ? `<span style="font-size:9px;color:var(--text-muted);font-weight:600;">${escTg(it.badge)}</span>` : ''}
                </div>
                <div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${highlightMatchHtml(it.name || it.sym, q)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              ${formatSearchPriceHtml(it)}
              <span class="pill pill-neut">${escTg(it.exch || 'MARKET')}</span>
              <button class="sym-wl-add-mini" data-wladd="${escAttr(it.sym)}" data-wlname="${escAttr(it.name || '')}" title="Adaugă în Watchlist">
                ${inWl ? `${ICO.check}<span>În listă</span>` : `${ICO.plus}<span>Watchlist</span>`}
              </button>
            </div>
          </div>
        `;
      }).join('');

      box.querySelectorAll('[data-picksym]').forEach((r, idx) => {
        r.onmouseenter = () => {
          modalSugIdx = idx;
          updateModalRowHighlight();
        };
        r.onclick = () => {
          document.getElementById('symbolModal').classList.remove('open');
          assignSymbolToFocusedPane(r.dataset.picksym);
        };
      });
      box.querySelectorAll('[data-wladd]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const sym = btn.dataset.wladd;
          const nm = btn.dataset.wlname || '';
          addSymbolToWatchlist(sym, { loadOnChart: false, knownName: nm });
          btn.innerHTML = `${ICO.check}<span>În listă</span>`;
        };
      });
    };

    clearTimeout(symSearchDebounce);
    if (!q) {
      renderRows(local, false);
      return;
    }

    renderRows(local, true);
    symSearchDebounce = setTimeout(async () => {
      const merged = await queryGlobalVerifiedSymbols(q, cat);
      if (mySeq !== symModalReqSeq) return;
      renderRows(merged, false);
    }, 120);
  }

  function updateWlRowHighlight() {
    const rows = document.querySelectorAll('#wlSuggestBox .wl-sug-item');
    rows.forEach((r, idx) => {
      const active = idx === wlSugIdx;
      r.classList.toggle('active-sug', active);
      if (active) r.scrollIntoView({ block: 'nearest' });
    });
  }

  function updateWatchlistSuggestions(rawVal, showPopularWhenEmpty = false) {
    const box = document.getElementById('wlSuggestBox');
    const clr = document.getElementById('clearWlInputBtn');
    if (!box) return;

    const fullStr = String(rawVal || '');
    if (clr) clr.style.display = fullStr.length > 0 ? 'inline-flex' : 'none';

    const parts = fullStr.split(',');
    const activeToken = parts[parts.length - 1].trim();

    if (!activeToken) {
      clearTimeout(wlSuggestTimer);
      if (!showPopularWhenEmpty) {
        box.classList.remove('open');
        box.innerHTML = '';
        wlSugItems = [];
        return;
      }
      const quickList = getLocalVerifiedMatches('', 'all', 7);
      wlSugItems = quickList;
      wlSugIdx = 0;
      box.innerHTML = `
        <div class="sym-sug-hdr"><span>Sugestii rapide</span><span>Scrie ticker sau companie</span></div>
        ${quickList.map((it, idx) => renderWlSuggestionRowHtml(it, '', idx === 0)).join('')}
      `;
      box.classList.add('open');
      bindWlSuggestionClicks(box, parts);
      return;
    }

    const mySeq = ++wlSuggestReqSeq;
    const localHits = getLocalVerifiedMatches(activeToken, 'all', 6);

    const drawWlBox = (items, searchingRemote) => {
      wlSugItems = items.slice(0, 8);
      wlSugIdx = 0;

      if (!wlSugItems.length && searchingRemote) {
        box.innerHTML = `
          <div class="sym-sug-hdr"><span>Căutare live</span><span>NASDAQ · NYSE · Crypto</span></div>
          <div class="sym-sug-empty">Se caută simbolul «${escTg(activeToken)}»...</div>
        `;
        box.classList.add('open');
        return;
      }

      if (!wlSugItems.length && !searchingRemote) {
        box.innerHTML = `
          <div class="sym-sug-hdr"><span>0 rezultate</span><span>Verifică ortografia</span></div>
          <div class="sym-sug-empty">
            <div><b>Niciun simbol găsit pentru «${escTg(activeToken)}»</b></div>
            <div style="margin-top:3px;">Scrie tickerul corect sau numele companiei (ex: ONDS, Ondas, APPS, Tesla, BTC).</div>
          </div>
        `;
        box.classList.add('open');
        return;
      }

      const hdrRight = searchingRemote ? 'Verificare live...' : `${wlSugItems.length} găsite · Enter`;
      box.innerHTML = `
        <div class="sym-sug-hdr"><span>Simboluri verificate</span><span>${hdrRight}</span></div>
        ${wlSugItems.map((it, idx) => renderWlSuggestionRowHtml(it, activeToken, idx === 0)).join('')}
      `;
      box.classList.add('open');
      bindWlSuggestionClicks(box, parts);
    };

    drawWlBox(localHits, true);

    clearTimeout(wlSuggestTimer);
    wlSuggestTimer = setTimeout(async () => {
      const merged = await queryGlobalVerifiedSymbols(activeToken, 'all');
      if (mySeq !== wlSuggestReqSeq) return;
      const curInp = document.getElementById('addWlInput');
      if (!curInp || document.activeElement !== curInp && !box.classList.contains('open')) return;
      drawWlBox(merged, false);
    }, 120);
  }

  function renderWlSuggestionRowHtml(it, queryToken, isActive) {
    const inWl = state.watchlist.some(w => w.sym === it.sym);
    return `
      <div class="wl-sug-item ${isActive ? 'active-sug' : ''}" data-wlsug="${escAttr(it.sym)}" data-wlsugname="${escAttr(it.name || '')}">
        <div style="display:flex;align-items:center;gap:7px;min-width:0;flex:1;">
          ${renderLogoAvatar(it.sym, 'sm')}
          <div style="min-width:0;flex:1;">
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="font-weight:800;font-size:11.5px;color:var(--text-bright);">${highlightMatchHtml(it.sym, queryToken)}</span>
              ${inWl ? `<span style="font-size:8.5px;font-weight:700;color:var(--tv-blue-lt);background:var(--tv-blue-bg);padding:1px 6px;border-radius:999px;">ÎN LISTĂ</span>` : ''}
            </div>
            <div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${highlightMatchHtml(it.name || it.sym, queryToken)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${formatSearchPriceHtml(it)}
          <span class="pill pill-neut">${escTg(it.exch || 'US')}</span>
        </div>
      </div>
    `;
  }

  function bindWlSuggestionClicks(box, commaParts) {
    box.querySelectorAll('[data-wlsug]').forEach((el, idx) => {
      el.onmouseenter = () => {
        wlSugIdx = idx;
        updateWlRowHighlight();
      };
      el.onclick = (ev) => {
        ev.stopPropagation();
        const sym = el.dataset.wlsug;
        const nm = el.dataset.wlsugname || '';
        const inp = document.getElementById('addWlInput');
        const clr = document.getElementById('clearWlInputBtn');
        if (commaParts && commaParts.length > 1 && inp) {
          const prefix = commaParts.slice(0, -1).map(s => s.trim()).filter(Boolean).join(', ');
          inp.value = '';
          if (clr) clr.style.display = 'none';
          box.classList.remove('open');
          addSymbolToWatchlist(`${prefix}, ${sym}`, { loadOnChart: true, knownName: nm });
          return;
        }
        if (inp) inp.value = '';
        if (clr) clr.style.display = 'none';
        box.classList.remove('open');
        addSymbolToWatchlist(sym, { loadOnChart: true, knownName: nm });
      };
    });
  }

  async function submitWatchlistSearch() {
    const inp = document.getElementById('addWlInput');
    const clr = document.getElementById('clearWlInputBtn');
    const box = document.getElementById('wlSuggestBox');
    if (!inp) return;
    const raw = inp.value.trim();
    if (!raw) {
      inp.focus();
      updateWatchlistSuggestions('', true);
      return;
    }

    if (!raw.includes(',') && box?.classList.contains('open') && wlSugItems.length > 0 && wlSugItems[wlSugIdx]) {
      const picked = wlSugItems[wlSugIdx];
      inp.value = '';
      if (clr) clr.style.display = 'none';
      box.classList.remove('open');
      addSymbolToWatchlist(picked.sym, { loadOnChart: true, knownName: picked.name || '' });
      return;
    }

    if (raw.includes(',')) {
      const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
      const verifiedSyms = [];
      let firstName = '';
      for (const tok of tokens) {
        const hits = await queryGlobalVerifiedSymbols(tok, 'all');
        if (hits.length > 0) {
          verifiedSyms.push(hits[0].sym);
          if (!firstName) firstName = hits[0].name || '';
        }
      }
      if (!verifiedSyms.length) {
        showToast('Simboluri Inexistente', `Nu s-a găsit niciun simbol bursier valid pentru «${raw}».`, 'sell');
        return;
      }
      inp.value = '';
      if (clr) clr.style.display = 'none';
      box?.classList.remove('open');
      addSymbolToWatchlist(verifiedSyms.join(','), { loadOnChart: true, knownName: firstName });
      return;
    }

    const hits = await queryGlobalVerifiedSymbols(raw, 'all');
    if (!hits.length) {
      updateWatchlistSuggestions(raw, false);
      showToast('Simbol Inexistent', `«${raw}» nu există pe bursă. Verifică ortografia sau alege din rezultate.`, 'sell');
      inp.focus();
      return;
    }

    const best = hits[0];
    inp.value = '';
    if (clr) clr.style.display = 'none';
    box?.classList.remove('open');
    addSymbolToWatchlist(best.sym, { loadOnChart: true, knownName: best.name || '' });
  }

  function isFloatingSuggestOpenFor(inputEl) {
    const box = document.getElementById('floatingSymSuggest');
    return !!(box && box.classList.contains('open') && floatAnchorInput === inputEl && floatSugItems.length > 0);
  }

  function hideFloatingSymbolAutocomplete() {
    const box = document.getElementById('floatingSymSuggest');
    if (box) box.classList.remove('open');
    floatAnchorInput = null;
    floatPickCallback = null;
    floatSugItems = [];
  }

  function pickActiveFloatingSuggestion() {
    if (!floatSugItems.length || !floatSugItems[floatSugIdx] || !floatPickCallback) return false;
    const picked = floatSugItems[floatSugIdx];
    const cb = floatPickCallback;
    hideFloatingSymbolAutocomplete();
    cb(picked.sym, picked);
    return true;
  }

  function attachFloatingSymbolAutocomplete(inputEl, onPick) {
    if (!inputEl || inputEl.dataset.tpAutocompWired === '1') return;
    inputEl.dataset.tpAutocompWired = '1';

    const positionBox = () => {
      const box = document.getElementById('floatingSymSuggest');
      if (!box) return;
      const rect = inputEl.getBoundingClientRect();
      const width = Math.min(320, Math.max(220, window.innerWidth - 16));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const spaceBelow = window.innerHeight - rect.bottom - 10;
      box.style.width = `${width}px`;
      box.style.left = `${left}px`;
      if (spaceBelow < 200 && rect.top > 220) {
        box.style.top = 'auto';
        box.style.bottom = `${window.innerHeight - rect.top + 3}px`;
      } else {
        box.style.bottom = 'auto';
        box.style.top = `${rect.bottom + 3}px`;
      }
    };

    const renderFloat = (q, items, searching) => {
      const box = document.getElementById('floatingSymSuggest');
      if (!box || document.activeElement !== inputEl) return;
      floatAnchorInput = inputEl;
      floatPickCallback = onPick;
      floatSugItems = items.slice(0, 7);
      floatSugIdx = 0;
      positionBox();

      if (!floatSugItems.length && searching) {
        box.innerHTML = `<div class="sym-sug-empty">Se caută «${escTg(q)}»...</div>`;
        box.classList.add('open');
        return;
      }
      if (!floatSugItems.length) {
        box.innerHTML = `<div class="sym-sug-empty"><b>Niciun simbol găsit pentru «${escTg(q)}»</b></div>`;
        box.classList.add('open');
        return;
      }

      box.innerHTML = floatSugItems.map((it, idx) => renderWlSuggestionRowHtml(it, q, idx === 0)).join('');
      box.classList.add('open');
      box.querySelectorAll('[data-wlsug]').forEach((el, idx) => {
        el.onmouseenter = () => {
          floatSugIdx = idx;
          box.querySelectorAll('.wl-sug-item').forEach((r, k) => r.classList.toggle('active-sug', k === idx));
        };
        el.onmousedown = (ev) => {
          ev.preventDefault();
        };
        el.onclick = (ev) => {
          ev.stopPropagation();
          const picked = floatSugItems[idx];
          hideFloatingSymbolAutocomplete();
          if (picked && onPick) onPick(picked.sym, picked);
        };
      });
    };

    inputEl.addEventListener('input', () => {
      const raw = inputEl.value.trim();
      if (!raw || /[<>]|vwap|rsi|rvol|macd|score/i.test(raw)) {
        hideFloatingSymbolAutocomplete();
        return;
      }
      const mySeq = ++floatSuggestReqSeq;
      const loc = getLocalVerifiedMatches(raw, 'all', 6);
      renderFloat(raw, loc, true);
      clearTimeout(floatSuggestTimer);
      floatSuggestTimer = setTimeout(async () => {
        const merged = await queryGlobalVerifiedSymbols(raw, 'all');
        if (mySeq !== floatSuggestReqSeq) return;
        renderFloat(raw, merged, false);
      }, 120);
    });

    inputEl.addEventListener('keydown', (e) => {
      if (!isFloatingSuggestOpenFor(inputEl)) return;
      const box = document.getElementById('floatingSymSuggest');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        floatSugIdx = (floatSugIdx + 1) % floatSugItems.length;
        box?.querySelectorAll('.wl-sug-item').forEach((r, k) => r.classList.toggle('active-sug', k === floatSugIdx));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        floatSugIdx = (floatSugIdx - 1 + floatSugItems.length) % floatSugItems.length;
        box?.querySelectorAll('.wl-sug-item').forEach((r, k) => r.classList.toggle('active-sug', k === floatSugIdx));
      } else if (e.key === 'Escape') {
        hideFloatingSymbolAutocomplete();
      }
    });
  }

  function renderIndicatorsModalList(filterTxt = '') {
    const box = document.getElementById('indModalList');
    if (!box) return;
    const f = filterTxt.trim().toLowerCase();
    const items = INDICATOR_DEFS.filter(d => !f || d.name.toLowerCase().includes(f) || d.cat.toLowerCase().includes(f));
    box.innerHTML = items.map(d => {
      const on = !!state.indicators[d.key];
      return `
        <div class="ind-lib-row ${on ? 'active' : ''}" data-indkey="${d.key}">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:9px;height:9px;border-radius:50%;background:${d.color};display:inline-block;"></span>
              <span style="font-weight:800;color:var(--text-bright);font-size:12.5px;">${d.name}</span>
              <span class="pill pill-neut">${d.cat}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">${d.desc}</div>
          </div>
          <span class="pill ${on ? 'pill-buy' : 'pill-neut'}">${on ? `${ICO.check} ACTIV` : `${ICO.plus} Adaugă`}</span>
        </div>
      `;
    }).join('');
    box.querySelectorAll('[data-indkey]').forEach(row => {
      row.onclick = () => toggleIndicator(row.dataset.indkey);
    });
  }

  function openDeepForecastModal() {
    const modal = document.getElementById('deepForecastModal');
    const body = document.getElementById('deepForecastBody');
    modal.classList.add('open');

    const fc = state.lastForecastOut || Q.computeForecast(state.bars, 14);
    const sig = state.lastSignalOut;
    const idea = state.lastAiIdea || (typeof buildActiveAiIdea === 'function' ? buildActiveAiIdea() : null);
    if (!fc || !sig) {
      body.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);">Date insuficiente pentru analiza AI completă.</div>`;
      return;
    }
    const cp = sig.currentPlan;
    const isBull = fc.basePct >= 0;
    const kl = idea?.keyLevels || {};
    const bullOB = kl.bullOB ? `${fmt(kl.bullOB.bottom)} – ${fmt(kl.bullOB.top)}` : '—';
    const bearOB = kl.bearOB ? `${fmt(kl.bearOB.bottom)} – ${fmt(kl.bearOB.top)}` : '—';

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:10px;margin-bottom:14px;">
        <div class="bt-kpi"><div class="bt-kpi-lbl">Simbol &amp; Preț</div><div class="bt-kpi-val">${escTg(state.symbol)} · ${fmt(fc.lastClose)}</div></div>
        <div class="bt-kpi"><div class="bt-kpi-lbl">Probabilitate AI</div><div class="bt-kpi-val ${idea?.isBuy ? 'up' : 'dn'}">${idea ? `${idea.probPct}% · ${idea.grade}` : `${cp.grade} (${cp.score}/100)`}</div></div>
        <div class="bt-kpi"><div class="bt-kpi-lbl">Target k-NN (${fc.horizon} bare)</div><div class="bt-kpi-val ${isBull ? 'up' : 'dn'}">${fmt(fc.baseTarget)} (${fc.basePct >= 0 ? '+' : ''}${fc.basePct.toFixed(2)}%)</div></div>
        <div class="bt-kpi"><div class="bt-kpi-lbl">Edge Istoric Backtest</div><div class="bt-kpi-val up">${sig.stats.winRate}% WR · PF ${sig.stats.profitFactor}</div></div>
      </div>
      ${idea ? `
        <div class="ai-modal-grid">
          <div class="ai-brief-card ${!idea.isActionable ? 'wait' : (idea.isBuy ? 'buy' : 'sell')}">
            <div class="ai-brief-top">
              <span class="ai-brief-verdict">${escTg(idea.verdictLabel)}</span>
              <span class="ai-cat-tag">${escTg(idea.catalystBadge || idea.setupArchetype)}</span>
            </div>
            <p class="ai-brief-thesis" style="margin-top:6px;">${escTg(idea.aiThesis)}</p>
            <div class="ai-zone-strip">
              <div class="ai-zone-box"><div class="lbl">Zonă Intrare AI</div><div class="val" style="color:var(--tv-blue)">${fmt(idea.entryZoneLow)} – ${fmt(idea.entryZoneHigh)}</div></div>
              <div class="ai-zone-box"><div class="lbl">Stop Structural / TP2</div><div class="val">${fmt(idea.sl)} / ${fmt(idea.tp2)}</div></div>
            </div>
            <div class="ai-inval-box"><strong>Invalidare:</strong> ${escTg(idea.invalidationText)}</div>
            <div class="ai-risks-list">${(idea.risks || []).map(r => `<div class="ai-risk-item">${escTg(r)}</div>`).join('')}</div>
          </div>
          <div class="ai-brief-card">
            <div class="ai-brief-top" style="margin-bottom:6px;">
              <span class="ai-brief-verdict">Niveluri SMC · VPVR · Volatilitate</span>
              <span class="pill pill-neut">RVOL ${Number(idea.rvol || 1).toFixed(1)}x</span>
            </div>
            <div class="ai-zone-strip">
              <div class="ai-zone-box"><div class="lbl">VPVR POC</div><div class="val">${kl.poc != null ? fmt(kl.poc) : '—'}</div></div>
              <div class="ai-zone-box"><div class="lbl">VAH / VAL</div><div class="val">${kl.val != null ? fmt(kl.val) : '—'} / ${kl.vah != null ? fmt(kl.vah) : '—'}</div></div>
              <div class="ai-zone-box"><div class="lbl">Bullish Order Block</div><div class="val" style="color:var(--tv-green)">${bullOB}</div></div>
              <div class="ai-zone-box"><div class="lbl">Bearish Order Block</div><div class="val" style="color:var(--tv-red)">${bearOB}</div></div>
              <div class="ai-zone-box"><div class="lbl">Mișcare Așteptată (1σ)</div><div class="val">${kl.expectedMovePct != null ? `±${kl.expectedMovePct}%` : '—'}</div></div>
              <div class="ai-zone-box"><div class="lbl">Flux CVD [Proxy]</div><div class="val" style="color:${kl.cvdRising ? 'var(--tv-green)' : 'var(--tv-red)'}">${kl.cvdRising ? 'Acumulare (+)' : 'Distribuție (-)'}</div></div>
            </div>
            ${(idea.news || []).length ? `
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin:4px 0;">Catalizatori &amp; Știri Live</div>
              <div class="ai-news-list">${idea.news.map(n => `
                <a class="ai-news-item" href="${escTg(n.link || '#')}" target="_blank" rel="noopener noreferrer">
                  <span class="ai-news-title">${escTg(n.title || '')}</span>
                  <span class="ai-news-src">${escTg(n.publisher || 'Știri')}</span>
                </a>
              `).join('')}</div>
            ` : `<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;">Se încarcă știrile și catalizatorii fundamentali...</div>`}
          </div>
        </div>
      ` : ''}
      <div style="background:var(--bg-chart);border:1px solid var(--border);border-radius:var(--r-card);padding:12px;margin-bottom:14px;">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Suprapunere Grafică: Preț Curent + Scenarii Istorice k-NN + Niveluri TP/SL</div>
        <canvas id="deepFcCanvas" style="width:100%;height:230px;display:block;"></canvas>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${fc.topMatches.map((m, i) => `
          <div class="bt-kpi" style="border:1px solid var(--border);border-radius:var(--r-ctrl);">
            <div style="display:flex;justify-content:space-between;font-weight:700;">
              <span>Analog Istoric #${i + 1}: ${m.dateStr}</span>
              <span class="${m.movePct >= 0 ? 'up' : 'dn'}">${m.movePct >= 0 ? '+' : ''}${m.movePct.toFixed(2)}%</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Max Spike: +${m.maxUpPct.toFixed(1)}% · Max Drawdown: ${m.maxDnPct.toFixed(1)}%</div>
          </div>
        `).join('')}
      </div>
    `;

    setTimeout(() => drawDeepForecastCanvas(fc, cp), 40);
  }

  function drawDeepForecastCanvas(fc, cp) {
    const c = document.getElementById('deepFcCanvas');
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth || 760, H = 230;
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = getThemeColors().bg;
    ctx.fillRect(0, 0, W, H);

    const hist = fc.curWin.map(b => b.close);
    const paths = fc.topMatches.slice(0, 3).map(m => m.pathRatio.map(r => fc.lastClose * r));
    const consensus = fc.lineS.slice(1).map(p => p.value);
    const allVals = [...hist, ...consensus, cp.sl, cp.tp2];
    paths.forEach(p => allVals.push(...p));

    const minV = Math.min(...allVals) * 0.992;
    const maxV = Math.max(...allVals) * 1.008;
    const totalN = hist.length + fc.horizon;
    const padL = 14, padR = 66, padT = 18, padB = 22;
    const gX = i => padL + (i / (totalN - 1)) * (W - padL - padR);
    const gY = v => padT + (1 - (v - minV) / Math.max(1e-9, maxV - minV)) * (H - padT - padB);

    const nowX = gX(hist.length - 1);
    ctx.fillStyle = 'rgba(41, 98, 255, 0.05)';
    ctx.fillRect(nowX, padT, W - padR - nowX, H - padT - padB);

    // Historical line
    ctx.beginPath();
    hist.forEach((v, i) => { if (i === 0) ctx.moveTo(gX(i), gY(v)); else ctx.lineTo(gX(i), gY(v)); });
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Analog ghost paths
    const cols = ['rgba(245,158,11,0.55)', 'rgba(56,189,248,0.55)', 'rgba(236,72,153,0.55)'];
    paths.forEach((p, idx) => {
      ctx.beginPath();
      ctx.moveTo(nowX, gY(fc.lastClose));
      p.forEach((v, k) => ctx.lineTo(gX(hist.length + k), gY(v)));
      ctx.strokeStyle = cols[idx % cols.length];
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });

    // Consensus path
    ctx.beginPath();
    ctx.moveTo(nowX, gY(fc.lastClose));
    consensus.forEach((v, k) => ctx.lineTo(gX(hist.length + k), gY(v)));
    ctx.strokeStyle = fc.basePct >= 0 ? '#00e676' : '#ff1744';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Price Scale Labels on right
    [minV, (minV + maxV) / 2, maxV].forEach(v => {
      ctx.fillStyle = '#787b86';
      ctx.font = '10px monospace';
      ctx.fillText(fmt(v), W - padR + 6, gY(v) + 3);
    });
  }

  // Drawing Toolbar UI
  function selectDrawingTool(tool) {
    if (overlayEngine) overlayEngine.setTool(tool);
    updateDrawToolUI(tool);
  }

  function updateDrawToolUI(tool) {
    document.querySelectorAll('[data-drawtool]').forEach(b => {
      b.classList.toggle('active', b.dataset.drawtool === tool);
    });
  }

  // Context Menu
  function openContextMenu(x, y) {
    const menu = document.getElementById('chartCtxMenu');
    const p = state.ctxPrice || (state.bars.length ? state.bars[state.bars.length - 1].close : 0);
    state.ctxPrice = p;
    document.getElementById('ctxPriceSpan').textContent = fmt(p);
    document.getElementById('ctxAlertSpan').textContent = fmt(p);
    document.getElementById('ctxBuySpan').textContent = `${state.symbol} @ ${fmt(p)}`;
    document.getElementById('ctxSellSpan').textContent = `${state.symbol} @ ${fmt(p)}`;
    const ctxWlSpan = document.getElementById('ctxWatchlistSpan');
    if (ctxWlSpan) {
      const inWl = isSymbolInWatchlist(state.symbol);
      ctxWlSpan.textContent = inWl
        ? `Elimină ${state.symbol} din Watchlist`
        : `Adaugă ${state.symbol} în Watchlist`;
    }

    const safeX = Math.max(8, Math.min(x, window.innerWidth - 242));
    const safeY = Math.max(44, Math.min(y, window.innerHeight - 310));
    menu.style.left = safeX + 'px';
    menu.style.top = safeY + 'px';
    menu.style.display = 'block';
  }

  // Market Session Status Clock
  function updateMarketClock() {
    const now = new Date();
    const yr = now.getUTCFullYear();
    const dstStart = new Date(Date.UTC(yr, 2, 8 + (7 - new Date(Date.UTC(yr, 2, 8)).getUTCDay()) % 7, 7));
    const dstEnd = new Date(Date.UTC(yr, 10, 1 + (7 - new Date(Date.UTC(yr, 10, 1)).getUTCDay()) % 7, 6));
    const etOffset = (now >= dstStart && now < dstEnd) ? -4 : -5;
    const et = new Date(now.getTime() + etOffset * 3600000);
    const mins = et.getUTCHours() * 60 + et.getUTCMinutes();
    const dow = et.getUTCDay();

    let lbl = 'ÎNCHIS', dot = 'red';
    if (dow >= 1 && dow <= 5) {
      if (mins >= 570 && mins < 960) { lbl = 'LIVE'; dot = 'green'; }
      else if (mins >= 240 && mins < 570) { lbl = 'PRE-MARKET'; dot = 'amber'; }
      else if (mins >= 960 && mins < 1200) { lbl = 'AFTER-HOURS'; dot = 'amber'; }
    } else {
      lbl = 'WEEKEND (CRYPTO 24/7)';
    }

    const dotEl = document.getElementById('mktSessionDot');
    const txtEl = document.getElementById('mktSessionText');
    const clkEl = document.getElementById('liveClockText');
    if (dotEl) dotEl.className = `status-dot ${dot}`;
    if (txtEl) txtEl.textContent = lbl;
    if (clkEl) clkEl.textContent = now.toLocaleTimeString('ro-RO');
  }

  // ─── 18. WIRE DOM EVENTS & BOOT ───────────────────────────────────────────
  function applyRightSidebarState(page, collapsed = false) {
    const validPages = ['watchlist', 'smart', 'fib', 'forecast', 'alerts', 'telegram'];
    const cleanPage = validPages.includes(page) ? page : 'watchlist';
    const isCol = !!collapsed && window.innerWidth > 820;

    state.rightPage = cleanPage;
    state.rightCollapsed = isCol;
    try {
      localStorage.setItem('tp_ultra_rpage', cleanPage);
      localStorage.setItem('tp_ultra_rp_collapsed', isCol ? '1' : '0');
    } catch (_) { }

    const rp = document.getElementById('rightPanel');
    if (rp) rp.classList.toggle('collapsed', isCol);

    document.querySelectorAll('[data-rpage]').forEach(b => {
      b.classList.toggle('active', !isCol && b.dataset.rpage === cleanPage);
      if (b.classList.contains('active') && b.closest('#mobileDrawerTabs')) {
        try { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { }
      }
    });
    document.querySelectorAll('.rpage').forEach(p => {
      p.classList.toggle('active', p.id === `rpage-${cleanPage}`);
    });

    if (isMobileViewport() && rp?.classList.contains('mobile-open')) {
      const mnavMap = { watchlist: 'watchlist', smart: 'smart', fib: 'smart', forecast: 'smart', alerts: 'alerts', telegram: 'alerts' };
      const mapped = mnavMap[cleanPage] || 'watchlist';
      document.querySelectorAll('[data-mnav]').forEach(b => {
        b.classList.toggle('active', b.dataset.mnav === mapped);
      });
    }
  }

  function wireUIEvents() {
    // Primary Pane Focus Selection & Y-Axis Live Countdown Repositioning
    document.getElementById('primaryPane')?.addEventListener('pointerdown', () => {
      if (state.layout !== '1' && state.focusedPaneId !== 0) {
        focusChartPane(0);
      }
    });
    if (mainChart) {
      mainChart.timeScale().subscribeVisibleTimeRangeChange(() => positionYAxisCountdownTag());
    }

    // Symbol Search Modal (Updates whichever Multi-Chart Screen is currently selected!)
    document.getElementById('curSymbolTitle').onclick = () => {
      if (state.layout !== '1' && state.focusedPaneId !== 0) focusChartPane(0);
      openSymbolModal('');
    };
    const symModalInp = document.getElementById('symSearchModalInput');
    const clrModalBtn = document.getElementById('clearModalSearchBtn');
    if (clrModalBtn) {
      clrModalBtn.onclick = () => {
        symModalInp.value = '';
        clrModalBtn.style.display = 'none';
        const activeCat = document.querySelector('[data-symcat].active')?.dataset.symcat || 'all';
        renderSymbolCatalog('', activeCat);
        symModalInp.focus();
      };
    }
    symModalInp.oninput = (e) => {
      const activeCat = document.querySelector('[data-symcat].active')?.dataset.symcat || 'all';
      renderSymbolCatalog(e.target.value, activeCat);
    };
    symModalInp.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowDown' && lastModalItems.length > 0) {
        e.preventDefault();
        modalSugIdx = (modalSugIdx + 1) % lastModalItems.length;
        updateModalRowHighlight();
        return;
      }
      if (e.key === 'ArrowUp' && lastModalItems.length > 0) {
        e.preventDefault();
        modalSugIdx = (modalSugIdx - 1 + lastModalItems.length) % lastModalItems.length;
        updateModalRowHighlight();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (lastModalItems.length > 0 && lastModalItems[modalSugIdx]?.sym) {
          const picked = lastModalItems[modalSugIdx];
          document.getElementById('symbolModal').classList.remove('open');
          assignSymbolToFocusedPane(picked.sym);
          return;
        }
        const raw = symModalInp.value.trim();
        if (!raw) return;
        const verified = await queryGlobalVerifiedSymbols(raw, 'all');
        if (verified.length > 0) {
          document.getElementById('symbolModal').classList.remove('open');
          assignSymbolToFocusedPane(verified[0].sym);
        } else {
          showToast('Simbol Inexistent', `«${raw}» nu a fost găsit pe bursă. Verifică ortografia.`, 'sell');
        }
      }
    });
    document.querySelectorAll('[data-symcat]').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('[data-symcat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderSymbolCatalog(symModalInp.value, btn.dataset.symcat);
      };
    });

    // Global Keyboard Shortcut: Cmd/Ctrl+K or typing a letter on chart opens Symbol Search
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSymbolModal('');
        return;
      }
      if (e.key === 'Escape') {
        document.querySelectorAll('.tv-modal-backdrop').forEach(m => m.classList.remove('open'));
        document.querySelectorAll('.tv-menu').forEach(m => m.classList.remove('open'));
        document.getElementById('wlSuggestBox')?.classList.remove('open');
        hideFloatingSymbolAutocomplete();
        document.getElementById('chartCtxMenu').style.display = 'none';
      }
      const activeEl = document.activeElement;
      const targetEl = e.target;
      const inEditable = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
      if (!inEditable(activeEl) && !inEditable(targetEl)) {
        if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[a-zA-Z]$/.test(e.key)) {
          const anyOpen = document.querySelector('.tv-modal-backdrop.open');
          if (!anyOpen) {
            e.preventDefault();
            openSymbolModal(e.key.toUpperCase());
          }
        }
      }
    });

    // Close modals on backdrop or X button
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.onclick = () => document.getElementById(btn.dataset.closeModal).classList.remove('open');
    });
    document.querySelectorAll('.tv-modal-backdrop').forEach(bd => {
      bd.onclick = (e) => { if (e.target === bd) bd.classList.remove('open'); };
    });

    // Timeframe Buttons & Custom Timeframe Menu
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.onclick = () => switchTimeframe(btn.dataset.tf);
    });
    document.querySelectorAll('[data-customtf]').forEach(item => {
      item.onclick = () => switchTimeframe(item.dataset.customtf);
    });
    const customTfInp = document.getElementById('customTfInput');
    if (customTfInp) {
      customTfInp.addEventListener('click', e => e.stopPropagation());
      customTfInp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = customTfInp.value.trim().toLowerCase();
          if (/^\d+(t|s|m|h|d|wk|mo)$/.test(v)) {
            customTfInp.value = '';
            document.getElementById('customTfMenu')?.classList.remove('open');
            switchTimeframe(v);
          } else {
            showToast('Interval Invalid', 'Folosește formatul 3m, 7m, 45m, 2h, 30s sau 500t.', 'sell');
          }
        }
      });
    }

    // Compare & Spread Charts Menu
    document.querySelectorAll('[data-compare]').forEach(item => {
      item.onclick = () => setCompareSpec(item.dataset.compare);
    });
    const cmpInp = document.getElementById('compareCustomInput');
    if (cmpInp) {
      cmpInp.setAttribute('autocomplete', 'off');
      cmpInp.setAttribute('spellcheck', 'false');
      cmpInp.setAttribute('data-lpignore', 'true');
      cmpInp.setAttribute('data-form-type', 'other');
      attachFloatingSymbolAutocomplete(cmpInp, (pickedSym) => {
        const raw = cmpInp.value.trim();
        if (raw.startsWith('/')) setCompareSpec(`SPR:${pickedSym}`);
        else setCompareSpec(`OVR:${pickedSym}`);
        cmpInp.value = '';
        document.getElementById('compareMenu')?.classList.remove('open');
      });
      cmpInp.addEventListener('click', e => e.stopPropagation());
      cmpInp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          if (isFloatingSuggestOpenFor(cmpInp) && pickActiveFloatingSuggestion()) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          const raw = cmpInp.value.trim().toUpperCase();
          if (!raw) {
            setCompareSpec('');
          } else if (raw.startsWith('/')) {
            setCompareSpec(`SPR:${normalizeSymbol(raw.slice(1))}`);
          } else if (raw.includes('/')) {
            const parts = raw.split('/').map(s => normalizeSymbol(s)).filter(Boolean);
            if (parts.length >= 2) setCompareSpec(`SPR:${parts[1]}`);
          } else {
            setCompareSpec(`OVR:${normalizeSymbol(raw)}`);
          }
          cmpInp.value = '';
          document.getElementById('compareMenu')?.classList.remove('open');
        }
      });
    }

    // Extended Trading Hours (ETH: Pre-Market & After-Hours)
    const ethBtn = document.getElementById('extHoursBtn');
    if (ethBtn) {
      ethBtn.onclick = () => {
        state.extHours = !state.extHours;
        localStorage.setItem('tp_ultra_eth_v2', state.extHours ? '1' : '0');
        ethBtn.classList.toggle('active', state.extHours);
        if (overlayEngine) overlayEngine.setLayers({ showExtSessions: !!state.extHours });
        loadSymbol(state.symbol, state.tf);
        const needed = getNeededSecPanesCount(state.layout);
        for (let i = 0; i < needed; i++) loadSecondaryPaneData(secPanes[i]);
        showToast(
          state.extHours ? 'Extended Hours (ETH) Activat' : 'Sesiune Regulară (RTH)',
          state.extHours ? 'Pre-Market (04:00–09:30 ET) și Post-Market (16:00–20:00 ET) sunt incluse pe grafic.' : 'Graficele intraday afișează doar sesiunea bursieră regulară (09:30–16:00 ET).',
          'info',
          state.symbol
        );
      };
    }

    // Dropdown Menus (Chart Type, Spread, Custom TF & Multi-Chart Layout)
    document.querySelectorAll('[data-dropdown-btn]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const menuId = btn.dataset.dropdownBtn;
        const menu = document.getElementById(menuId);
        const wasOpen = menu.classList.contains('open');
        document.querySelectorAll('.tv-menu').forEach(m => m.classList.remove('open'));
        if (!wasOpen) menu.classList.add('open');
      };
    });
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.tv-menu').forEach(m => m.classList.remove('open'));
      document.getElementById('chartCtxMenu').style.display = 'none';
      if (!e.target.closest?.('.wl-add-wrap')) {
        document.getElementById('wlSuggestBox')?.classList.remove('open');
      }
      if (!e.target.closest?.('#floatingSymSuggest') && e.target !== floatAnchorInput) {
        hideFloatingSymbolAutocomplete();
      }
    });

    // Chart Type Selector (Including Range, Renko, Kagi, Three-Line Break, Volume Candles)
    document.querySelectorAll('[data-charttype]').forEach(item => {
      item.onclick = () => {
        state.chartType = item.dataset.charttype;
        localStorage.setItem('tp_ultra_chartType', state.chartType);
        document.querySelectorAll('[data-charttype]').forEach(i => i.classList.toggle('active', i === item));
        state.fullBars = buildEffectiveFullBars();
        state.bars = state.replay.active
          ? state.fullBars.slice(0, Math.min(state.replay.idx, state.fullBars.length))
          : [...state.fullBars];
        renderChartAndQuant(true);
      };
    });

    // Multi-Chart Layout & Interval Sync
    document.querySelectorAll('[data-layout]').forEach(item => {
      item.onclick = () => {
        document.querySelectorAll('[data-layout]').forEach(i => i.classList.toggle('active', i === item));
        setMultiChartLayout(item.dataset.layout);
      };
    });
    const syncToggle = document.getElementById('syncChartsToggle');
    if (syncToggle) {
      syncToggle.onclick = (e) => {
        e.stopPropagation();
        state.syncMultiTf = !state.syncMultiTf;
        localStorage.setItem('tp_ultra_synctf', state.syncMultiTf ? '1' : '0');
        syncToggle.classList.toggle('active', state.syncMultiTf);
        if (state.syncMultiTf && state.layout !== '1') {
          switchTimeframe(getActiveFocusedSymbol() === state.symbol ? state.tf : (secPanes.find(x => x.id === state.focusedPaneId)?.tf || state.tf));
        }
      };
    }

    // Indicators Modal
    document.getElementById('openIndModalBtn').onclick = () => {
      renderIndicatorsModalList('');
      document.getElementById('indicatorsModal').classList.add('open');
      document.getElementById('indModalSearch').focus();
    };
    document.getElementById('indModalSearch').oninput = (e) => renderIndicatorsModalList(e.target.value);

    // Topbar Action & Export Buttons
    document.getElementById('smartSigTopBtn').onclick = () => toggleIndicator('smartSignals');
    document.getElementById('replayToggleBtn').onclick = toggleReplayMode;
    document.getElementById('rpPlayBtn').onclick = toggleReplayPlay;
    document.getElementById('rpStepBtn').onclick = stepReplayBar;
    document.getElementById('rpSpeedSelect').onchange = (e) => {
      state.replay.speedMs = Number(e.target.value);
      if (state.replay.playing) { stopReplayTimer(); toggleReplayPlay(); }
    };
    document.getElementById('rpExitBtn').onclick = toggleReplayMode;

    document.getElementById('openTop10Btn')?.addEventListener('click', () => {
      if (typeof isMobileViewport === 'function' && isMobileViewport()) {
        const dock = document.getElementById('bottomDock');
        if (dock && dock.classList.contains('expanded')) {
          dock.classList.remove('expanded');
          const iconEl = document.getElementById('bdToggleIcon');
          if (iconEl) iconEl.innerHTML = ICO.chevUp;
        }
        document.getElementById('leftToolbar')?.classList.remove('mob-draw-open');
        document.getElementById('mobDrawToggleBtn')?.classList.remove('active');
        document.getElementById('rightPanel')?.classList.add('mobile-open');
        document.querySelectorAll('[data-mnav]').forEach(b => b.classList.toggle('active', b.dataset.mnav === 'smart'));
      }
      applyRightSidebarState('smart', false);
      setTimeout(() => {
        resizeAllCharts();
        document.getElementById('topOppsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      if (!state.topOpps.length) fetchTopMarketOpportunities(false);
    });

    document.querySelectorAll('[data-oppdir]').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('[data-oppdir]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.topOppsDir = b.dataset.oppdir || 'all';
        fetchTopMarketOpportunities(false);
      };
    });
    const oppTfSel = document.getElementById('topOppsTfSelect');
    if (oppTfSel) {
      oppTfSel.onchange = (e) => {
        state.topOppsTf = e.target.value || '30m';
        fetchTopMarketOpportunities(false);
      };
    }
    document.getElementById('topOppsRefreshBtn')?.addEventListener('click', () => fetchTopMarketOpportunities(true));
    document.getElementById('topOppsTelegramBtn')?.addEventListener('click', () => sendTop10ToTelegram());
    document.getElementById('scanTop10MarketBtn')?.addEventListener('click', () => runTop10InScreener(true));
    document.getElementById('openAiDeepBriefBtn')?.addEventListener('click', openDeepForecastModal);
    document.getElementById('topOppsQueryInput')?.addEventListener('input', (e) => {
      state.topOppsQuery = e.target.value || '';
      renderTopOppsRadar();
    });
    document.querySelectorAll('[data-oppstyle]').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('[data-oppstyle]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.topOppsStyle = b.dataset.oppstyle || 'all';
        renderTopOppsRadar();
      };
    });

    document.getElementById('openScreenerTopBtn').onclick = () => openBottomDockTab('screener');
    document.getElementById('openDeepFcTopBtn').onclick = openDeepForecastModal;

    // Interactive Watchlist <-> Symbol Details Splitter & Quick "Teză AI" Jump
    const wlContEl = document.getElementById('watchlistContainer');
    const wlSplitEl = document.getElementById('wlDetailsSplitter');
    try {
      const savedWlH = parseInt(localStorage.getItem('tp_wl_panel_h') || '', 10);
      if (wlContEl && isFinite(savedWlH) && savedWlH >= 110 && !isMobileViewport()) {
        wlContEl.style.height = `${savedWlH}px`;
      }
    } catch (_) { }
    if (wlSplitEl && wlContEl) {
      let splitDrag = null;
      wlSplitEl.addEventListener('pointerdown', (e) => {
        if (isMobileViewport() || e.button !== 0) return;
        e.preventDefault();
        const rpage = document.getElementById('rpage-watchlist');
        const maxH = rpage ? Math.max(180, rpage.clientHeight - 210) : 520;
        splitDrag = { startY: e.clientY, startH: wlContEl.getBoundingClientRect().height, maxH };
        wlSplitEl.classList.add('dragging');
        wlSplitEl.setPointerCapture?.(e.pointerId);
      });
      wlSplitEl.addEventListener('pointermove', (e) => {
        if (!splitDrag) return;
        const nextH = Math.max(110, Math.min(splitDrag.maxH, Math.round(splitDrag.startH + (e.clientY - splitDrag.startY))));
        wlContEl.style.height = `${nextH}px`;
      });
      const endSplitDrag = () => {
        if (!splitDrag) return;
        wlSplitEl.classList.remove('dragging');
        const finalH = Math.round(wlContEl.getBoundingClientRect().height);
        splitDrag = null;
        try { localStorage.setItem('tp_wl_panel_h', String(finalH)); } catch (_) { }
      };
      wlSplitEl.addEventListener('pointerup', endSplitDrag);
      wlSplitEl.addEventListener('pointercancel', endSplitDrag);
      wlSplitEl.addEventListener('dblclick', () => {
        wlContEl.style.height = '';
        try { localStorage.removeItem('tp_wl_panel_h'); } catch (_) { }
      });
    }
    document.getElementById('dwGoAiIdeaBtn')?.addEventListener('click', () => {
      if (isMobileViewport()) {
        document.getElementById('rightPanel')?.classList.add('mobile-open');
        document.querySelectorAll('[data-mnav]').forEach(b => b.classList.toggle('active', b.dataset.mnav === 'smart'));
      }
      applyRightSidebarState('smart', false);
      if (!state.topOpps.length && !state.topOppsLoading) fetchTopMarketOpportunities(false);
      setTimeout(() => {
        resizeAllCharts();
        document.getElementById('aiBriefCardWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    });
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportChartCSV);
    document.getElementById('exportBtCsvBtn')?.addEventListener('click', exportBacktestCSV);
    document.getElementById('exportScrCsvBtn')?.addEventListener('click', exportScreenerCSV);
    document.getElementById('exportPaperCsvBtn')?.addEventListener('click', exportPaperCSV);

    document.getElementById('themeBtn').onclick = () => applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    document.getElementById('fullscreenBtn').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    };

    // Quick Bid / Ask Paper Execution
    document.getElementById('baSellBtn').onclick = () => executePaperOrder('sell');
    document.getElementById('baBuyBtn').onclick = () => executePaperOrder('buy');

    // Left Drawing Toolbar
    document.querySelectorAll('[data-drawtool]').forEach(btn => {
      btn.onclick = () => selectDrawingTool(btn.dataset.drawtool);
    });
    document.getElementById('magnetBtn').onclick = (e) => {
      const on = overlayEngine.toggleMagnet();
      e.currentTarget.classList.toggle('toggle-on', on);
    };
    document.getElementById('hideDrawBtn').onclick = (e) => {
      const hidden = overlayEngine.toggleHideDrawings();
      e.currentTarget.classList.toggle('toggle-on', hidden);
    };
    document.getElementById('undoDrawBtn').onclick = () => overlayEngine.undo();
    document.getElementById('clearDrawBtn').onclick = () => overlayEngine.clearAll();

    // Right Icon Rail Navigation (Persists selected tab & collapsed state across refresh!)
    document.querySelectorAll('[data-rpage]').forEach(btn => {
      btn.onclick = () => {
        const page = btn.dataset.rpage;
        const rp = document.getElementById('rightPanel');
        const already = btn.classList.contains('active') && !rp.classList.contains('collapsed');
        if (already && window.innerWidth > 820) {
          applyRightSidebarState(page, true);
        } else {
          applyRightSidebarState(page, false);
        }
        setTimeout(resizeAllCharts, 40);
      };
    });

    // Watchlist Add + Live Verified Autocomplete + Keyboard Navigation + Clear + Reset
    const addWlInp = document.getElementById('addWlInput');
    const clearWlBtn = document.getElementById('clearWlInputBtn');
    if (clearWlBtn) {
      clearWlBtn.onclick = (e) => {
        e.stopPropagation();
        addWlInp.value = '';
        clearWlBtn.style.display = 'none';
        updateWatchlistSuggestions('', true);
        addWlInp.focus();
      };
    }
    document.getElementById('addWlBtn').onclick = () => {
      submitWatchlistSearch();
    };
    addWlInp.addEventListener('input', (e) => {
      updateWatchlistSuggestions(e.target.value, false);
    });
    addWlInp.addEventListener('focus', (e) => {
      updateWatchlistSuggestions(e.target.value, true);
    });
    addWlInp.addEventListener('keydown', (e) => {
      const box = document.getElementById('wlSuggestBox');
      if (e.key === 'ArrowDown' && box?.classList.contains('open') && wlSugItems.length > 0) {
        e.preventDefault();
        wlSugIdx = (wlSugIdx + 1) % wlSugItems.length;
        updateWlRowHighlight();
        return;
      }
      if (e.key === 'ArrowUp' && box?.classList.contains('open') && wlSugItems.length > 0) {
        e.preventDefault();
        wlSugIdx = (wlSugIdx - 1 + wlSugItems.length) % wlSugItems.length;
        updateWlRowHighlight();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        submitWatchlistSearch();
      } else if (e.key === 'Escape') {
        box?.classList.remove('open');
      }
    });
    document.getElementById('resetWlBtn').onclick = () => {
      state.watchlist = DEFAULT_WATCHLIST.map(x => ({ ...x }));
      saveWatchlist();
      renderWatchlist();
      syncLiveStreamSubscriptions();
      refreshLiveQuotes();
      showToast('Watchlist Resetat', 'Lista implicită de simboluri live a fost restaurată.');
    };

    // Fib Controls
    document.getElementById('fibToggleChartBtn').onclick = () => toggleIndicator('fibAuto');
    document.getElementById('fibLookbackSelect').onchange = () => renderChartAndQuant(false);

    // Forecast Horizon Buttons
    document.querySelectorAll('[data-fchorizon]').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('[data-fchorizon]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.forecastHorizon = Number(b.dataset.fchorizon);
        renderChartAndQuant(false);
      };
    });

    // Ultimate Multi-Condition, Watchlist & Webhook Alerts Form
    const alertCondSel = document.getElementById('alertCondSelect');
    const alertPriceInp = document.getElementById('alertPriceInput');
    const syncAlertFormUI = () => {
      const cond = alertCondSel?.value || 'price_up';
      const meta = ALERT_COND_META[cond] || ALERT_COND_META.price_up;
      state.alertCond = cond;
      state.alertDir = meta.isBull ? 'up' : 'dn';
      document.getElementById('alertDirUpBtn')?.classList.toggle('active', meta.isBull);
      document.getElementById('alertDirDnBtn')?.classList.toggle('active', !meta.isBull);
      if (alertPriceInp) {
        alertPriceInp.disabled = !meta.needsVal;
        if (!meta.needsVal) {
          alertPriceInp.value = '';
          alertPriceInp.placeholder = 'Automată (Condiție Tehnică)';
        } else if (meta.defVal != null) {
          alertPriceInp.value = String(meta.defVal);
          alertPriceInp.placeholder = `Prag (${meta.defVal})...`;
        } else {
          alertPriceInp.placeholder = 'Valoare prag (ex: 50.00)...';
        }
      }
    };
    if (alertCondSel) alertCondSel.onchange = syncAlertFormUI;

    document.getElementById('alertDirUpBtn').onclick = () => {
      state.alertDir = 'up';
      if (alertCondSel && alertCondSel.value === 'price_dn') alertCondSel.value = 'price_up';
      document.getElementById('alertDirUpBtn').classList.add('active');
      document.getElementById('alertDirDnBtn').classList.remove('active');
    };
    document.getElementById('alertDirDnBtn').onclick = () => {
      state.alertDir = 'dn';
      if (alertCondSel && alertCondSel.value === 'price_up') alertCondSel.value = 'price_dn';
      document.getElementById('alertDirDnBtn').classList.add('active');
      document.getElementById('alertDirUpBtn').classList.remove('active');
    };
    document.getElementById('addAlertBtn').onclick = () => {
      const val = alertPriceInp.value || (state.bars.length ? state.bars[state.bars.length - 1].close : '');
      addAlert(val, state.alertDir);
      if (ALERT_COND_META[alertCondSel?.value]?.defVal == null) alertPriceInp.value = '';
    };
    alertPriceInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('addAlertBtn').click();
      }
    });
    alertPriceInp.onfocus = (e) => {
      const cond = alertCondSel?.value || 'price_up';
      if (!e.target.value && (cond === 'price_up' || cond === 'price_dn') && state.bars.length) {
        e.target.value = state.bars[state.bars.length - 1].close.toFixed(2);
      }
    };

    // Bottom Dock Tabs & Collapse Toggle
    document.querySelectorAll('.bd-tab').forEach(btn => {
      btn.onclick = () => openBottomDockTab(btn.dataset.bdtab);
    });
    document.getElementById('bdCollapseBtn').onclick = () => {
      const dock = document.getElementById('bottomDock');
      const exp = dock.classList.toggle('expanded');
      document.getElementById('bdToggleIcon').innerHTML = exp ? ICO.chevDn : ICO.chevUp;
      setTimeout(resizeAllCharts, 190);
    };

    // Quick Indicator 1-Click Toggles
    document.querySelectorAll('[data-qind]').forEach(btn => {
      btn.onclick = () => toggleIndicator(btn.dataset.qind);
    });

    // Screener Filter Pills, Pine/AI Live Query, Heatmap Toggle & Run Button
    document.getElementById('runScreenerBtn').onclick = runGlobalScreener;
    const scrInp = document.getElementById('screenerCustomInput');
    if (scrInp) {
      attachFloatingSymbolAutocomplete(scrInp, (pickedSym) => {
        scrInp.value = pickedSym;
        if (state.screenerResults.length > 0) {
          renderScreenerTable();
        }
        runGlobalScreener();
      });
      scrInp.addEventListener('input', () => {
        const raw = scrInp.value.trim();
        const isQuery = !raw || /[<>=\s]|vwap|rsi|rvol|macd|bull|bear|buy|sell|ema|score/i.test(raw);
        if (state.screenerResults.length > 0) {
          state.screenerAiQuery = isQuery ? raw : '';
          renderScreenerTable();
        }
      });
      scrInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (isFloatingSuggestOpenFor(scrInp) && pickActiveFloatingSuggestion()) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          state.screenerFilter = 'all';
          document.querySelectorAll('[data-scrfilter]').forEach(x => x.classList.toggle('active', x.dataset.scrfilter === 'all'));
          runGlobalScreener();
        }
      });
    }
    const hmBtn = document.getElementById('toggleHeatmapBtn');
    if (hmBtn) {
      hmBtn.onclick = () => {
        state.heatmapMode = !state.heatmapMode;
        hmBtn.classList.toggle('active', state.heatmapMode);
        if (!state.screenerResults.length) runGlobalScreener();
        else renderScreenerTable();
      };
    }
    document.querySelectorAll('[data-scrfilter]').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('[data-scrfilter]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.screenerFilter = b.dataset.scrfilter;
        if (state.screenerFilter === 'top10' && !(state.screenerTop10Results || []).length && !(state.topOpps || []).length) {
          runTop10InScreener(false);
        } else {
          renderScreenerTable();
        }
      };
    });

    // Multi-Portfolio Selector & Position Risk Calculator Inputs
    const pfSel = document.getElementById('portfolioSelect');
    if (pfSel) {
      pfSel.onchange = (e) => switchPortfolio(e.target.value);
    }
    document.getElementById('calcBalanceInput').oninput = updatePositionCalculator;
    document.getElementById('calcRiskPctInput').oninput = updatePositionCalculator;
    document.getElementById('execCalcOrderBtn').onclick = () => {
      if (state.lastSignalOut?.currentPlan) executePaperFromPlan(state.lastSignalOut.currentPlan);
    };

    // Context Menu Actions
    document.getElementById('ctxActReset').onclick = () => {
      if (mainChart) {
        focusLiveEvolution(mainChart, state.bars.length, 95, 8);
        updateJumpToLiveBtn();
        renderLiveEvolutionStrip();
      }
    };
    document.getElementById('ctxActCopy').onclick = () => {
      navigator.clipboard?.writeText(String(state.ctxPrice.toFixed(2)));
      showToast('Preț Copiat', fmt(state.ctxPrice));
    };
    document.getElementById('ctxActAlert').onclick = () => {
      const cur = state.bars.length ? state.bars[state.bars.length - 1].close : state.ctxPrice;
      addAlert(state.ctxPrice, state.ctxPrice >= cur ? 'up' : 'dn');
    };
    document.getElementById('ctxActBuy').onclick = () => executePaperOrder('buy', state.ctxPrice);
    document.getElementById('ctxActSell').onclick = () => executePaperOrder('sell', state.ctxPrice);
    document.getElementById('ctxActWatchlist')?.addEventListener('click', () => toggleSymbolInWatchlist(getActiveFocusedSymbol()));
    document.getElementById('chartWlToggleBtn')?.addEventListener('click', () => toggleSymbolInWatchlist(getActiveFocusedSymbol()));
    document.getElementById('ctxActClearDraw').onclick = () => overlayEngine.clearAll();

    // Mobile Chart Controls, Sheet Close Buttons & 6-Tab Thumb Navigation
    const mobDrawBtn = document.getElementById('mobDrawToggleBtn');
    if (mobDrawBtn) {
      mobDrawBtn.onclick = (e) => {
        e.stopPropagation();
        const lt = document.getElementById('leftToolbar');
        if (!lt) return;
        const open = lt.classList.toggle('mob-draw-open');
        mobDrawBtn.classList.toggle('active', open);
        if (!open && overlayEngine && overlayEngine.tool !== 'cursor') {
          selectDrawingTool('cursor');
        }
      };
    }

    const mobLegBtn = document.getElementById('mobLegendToggleBtn');
    if (mobLegBtn) {
      mobLegBtn.onclick = (e) => {
        e.stopPropagation();
        const leg = document.getElementById('tvLegendBox');
        if (!leg) return;
        const exp = leg.classList.toggle('mob-expanded');
        mobLegBtn.classList.toggle('active', exp);
      };
    }

    document.getElementById('mobDrawerCloseBtn')?.addEventListener('click', () => closeMobileSheetsToChart());
    document.getElementById('bdMobCloseBtn')?.addEventListener('click', () => closeMobileSheetsToChart());

    document.querySelectorAll('[data-mnav]').forEach(btn => {
      btn.onclick = () => {
        const target = btn.dataset.mnav;
        const rp = document.getElementById('rightPanel');
        const dock = document.getElementById('bottomDock');

        if (target === 'chart') {
          closeMobileSheetsToChart();
          return;
        }

        if (target === 'screener' || target === 'paper') {
          const activeBdTab = document.querySelector('.bd-tab.active')?.dataset.bdtab || '';
          const alreadyOpen = dock?.classList.contains('expanded')
            && ((target === 'screener' && activeBdTab === 'screener') || (target === 'paper' && activeBdTab !== 'screener'));
          if (alreadyOpen) {
            closeMobileSheetsToChart();
          } else {
            openBottomDockTab(target);
          }
          return;
        }

        // Right-panel pages: watchlist, smart, alerts
        const alreadyRpOpen = rp?.classList.contains('mobile-open') && state.rightPage === target;
        if (alreadyRpOpen) {
          closeMobileSheetsToChart();
          return;
        }

        if (dock && dock.classList.contains('expanded')) {
          dock.classList.remove('expanded');
          const iconEl = document.getElementById('bdToggleIcon');
          if (iconEl) iconEl.innerHTML = ICO.chevUp;
        }
        document.getElementById('leftToolbar')?.classList.remove('mob-draw-open');
        document.getElementById('mobDrawToggleBtn')?.classList.remove('active');
        rp?.classList.add('mobile-open');
        document.querySelectorAll('[data-mnav]').forEach(b => b.classList.toggle('active', b === btn));
        applyRightSidebarState(target, false);
        if (target === 'smart' && !state.topOpps.length && !state.topOppsLoading) {
          fetchTopMarketOpportunities(false);
        }
        setTimeout(resizeAllCharts, 40);
      };
    });
  }

  // ─── BOOTSTRAP ────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const urlSym = new URLSearchParams(window.location.search).get('sym');
    if (urlSym) state.symbol = normalizeSymbol(urlSym);

    applyTheme(state.theme);
    applyRightSidebarState(state.rightPage, state.rightCollapsed);
    initCharts();
    wireUIEvents();
    wireTelegramUI();
    initTelegramBridge();

    const pfSel = document.getElementById('portfolioSelect');
    if (pfSel) pfSel.value = state.activePortfolio;
    document.getElementById('calcBalanceInput').value = state.paper.balance;
    document.getElementById('calcRiskPctInput').value = state.paper.riskPct;
    document.getElementById('smartSigTopBtn').classList.toggle('active', !!state.indicators.smartSignals);
    document.getElementById('extHoursBtn')?.classList.toggle('active', !!state.extHours);
    document.getElementById('syncChartsToggle')?.classList.toggle('active', !!state.syncMultiTf);
    document.querySelectorAll('[data-charttype]').forEach(i => {
      i.classList.toggle('active', i.dataset.charttype === state.chartType);
    });

    renderLiveIndicesStrip();
    renderWatchlist();
    renderAlertsList();
    renderPaperPositions();

    updateMarketClock();
    updateBarCountdown();
    setInterval(() => {
      updateMarketClock();
      updateBarCountdown();
    }, 1000);

    setMultiChartLayout(state.layout);
    loadSymbol(state.symbol, state.tf);

    // Real-time 3-Layer Streaming: Yahoo WebSocket + Binance Crypto Stream + 1.5s Live Quote Heartbeat
    connectYahooLiveStream();
    connectBinanceLiveStream();
    setInterval(() => {
      if (!document.hidden) refreshLiveQuotes();
    }, 1500);

    // Live Market-Wide Top 10 BUY / SELL Radar (non-blocking initial scan + 90s refresh)
    renderTopOppsRadar();
    setTimeout(() => fetchTopMarketOpportunities(false), 1200);
    setInterval(() => {
      if (!document.hidden && !state.topOppsLoading) fetchTopMarketOpportunities(false);
    }, 90000);

    // Expose safe bridge for AI Trading Intelligence UI (intel-ui.js)
    window.TradeProBridge = {
      getContext: () => ({
        sym: getActiveFocusedSymbol(),
        tf: state.tf,
        bars: state.fullBars && state.fullBars.length ? state.fullBars : state.bars,
        quote: state.quote,
        watchlist: (state.watchlist || []).map(w => w.sym),
        paper: state.paper,
        activePortfolio: state.activePortfolio
      }),
      loadSymbol: (s, t) => loadSymbol(s, t || state.tf),
      assignFocusedSymbol: (s) => assignSymbolToFocusedPane(s),
      addAlert: (priceVal, dir, cond) => addAlert(priceVal, dir, cond),
      openRightPage: (page) => switchRightPage(page),
      addToWatchlist: (s) => addSymbolToWatchlist(s, { loadOnChart: true }),
      toggleWatchlist: (s) => toggleSymbolInWatchlist(s),
      isInWatchlist: (s) => isSymbolInWatchlist(s),
      renderLogoAvatar: (s, sizeCls) => renderLogoAvatar(s, sizeCls),
      openBottomTab: (t) => openBottomDockTab(t)
    };
  });
})();
