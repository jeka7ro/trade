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
    trash: '<svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    copy: '<svg class="tv-ico sm" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    paste: '<svg class="tv-ico sm" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>'
  };

  // ─── 0b. USER AUTH SCOPE & GENERAL + PERSONAL STORAGE ─────────────────────
  const AUTH_TOKEN_KEY = 'tp_auth_token_v1';
  const AUTH_USER_CACHE_KEY = 'tp_auth_user_v1';
  const authState = {
    token: (() => { try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch (_) { return ''; } })(),
    user: (() => { try { return JSON.parse(localStorage.getItem(AUTH_USER_CACHE_KEY) || 'null'); } catch (_) { return null; } })(),
    generalState: null,
    personalState: null,
    realPortfolio: null,
    mergedStats: null,
    syncTimer: null,
    suppressSync: false
  };

  function scopedKey(baseKey) {
    const uid = authState.user?.id;
    return uid ? `tp_u_${uid}_${baseKey}` : baseKey;
  }

  function getScopedItem(baseKey, legacyFallbackKey = null) {
    try {
      const uid = authState.user?.id;
      // Logged-in users are strictly isolated to their own tp_u_<uid>_* keys (never inherit guest keys)
      if (uid) {
        return localStorage.getItem(`tp_u_${uid}_${baseKey}`);
      }
      const cur = localStorage.getItem(baseKey);
      if (cur !== null) return cur;
      if (legacyFallbackKey) return localStorage.getItem(legacyFallbackKey);
    } catch (_) { }
    return null;
  }

  function setScopedItem(baseKey, value) {
    try {
      localStorage.setItem(scopedKey(baseKey), value);
      if (!authState.suppressSync && authState.token && authState.user && typeof scheduleAuthServerSync === 'function') {
        scheduleAuthServerSync();
      }
    } catch (_) { }
  }

  // ─── 1. PROXY & ENDPOINT CONFIGURATION ────────────────────────────────────
  const IS_LOCAL = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || /\.trycloudflare\.com$/i.test(window.location.hostname)
    || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(window.location.hostname);
  const PROXY_ENDPOINTS = IS_LOCAL
    ? ['/proxy?url=', '/.netlify/functions/proxy?url=']
    : ['/.netlify/functions/proxy?url=', '/proxy?url='];

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
  function createDefaultPortfolios() {
    const mk = (b = 10000, r = 1.0) => ({ balance: b, riskPct: r, positions: [], closedPnl: 0 });
    return { p1: mk(10000, 1.0), p2: mk(25000, 1.0), p3: mk(15000, 0.75), p4: mk(50000, 1.0), p5: mk(30000, 0.5), p6: mk(10000, 1.5), p7: mk(100000, 0.5) };
  }

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
    { key: 'wolfeWave', name: 'Wolfe Wave (Triunghi / Valurile Wolfe 1-2-3-4-5 + EPA)', cat: 'Structură Armonică', color: '#f59e0b', desc: 'Pattern geometric de întoarcere (Wolf / Woolf Wave) cu puncte 1–5, Sweet Zone și țintă matematică pe linia 1→4 (EPA)' },
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
    symbol: getScopedItem('tp_ultra_symbol') || 'NVDA',
    tf: getScopedItem('tp_ultra_tf') || '30m',
    chartType: getScopedItem('tp_ultra_chartType') || 'candles',
    theme: getScopedItem('tp_ultra_theme') || 'dark',
    layout: getScopedItem('tp_ultra_layout') || '1',
    focusedPaneId: Number(getScopedItem('tp_ultra_focused_pane') || 0) || 0,
    rightPage: getScopedItem('tp_ultra_rpage') || 'watchlist',
    rightCollapsed: getScopedItem('tp_ultra_rp_collapsed') === '1',
    extHours: (() => {
      try { localStorage.removeItem('tp_ultra_eth_v2'); } catch (_) { }
      return getScopedItem('tp_ultra_eth_v3') !== '0';
    })(),
    syncMultiTf: getScopedItem('tp_ultra_synctf') === '1',
    heatmapMode: false,
    liveTickCount: 0,
    prevChartPrice: null,
    activePortfolio: getScopedItem('tp_ultra_active_pf') || 'p1',
    compareSpec: '', // e.g. 'OVR:SPY' or 'SPR:QQQ'
    compareBars: [],
    forecastHorizon: 14,

    rawFetchedBars: [], // Unmodified Yahoo OHLCV bars before Range/Spread transform
    fullBars: [],       // Complete active OHLCV history (or Range/Spread bars)
    bars: [],           // Currently visible bars (sliced during Bar Replay!)
    meta: {},
    renderedSymbol: '',
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
        wolfeWave: false,
        expectedMove: false,
        candlePatterns: false,
        fibAuto: false,
        forecast: false,
        vol: true,
        rsi: false,
        macd: false
      };
      try {
        const saved = JSON.parse(getScopedItem('tp_ultra_inds_v3') || 'null');
        if (saved && typeof saved === 'object') return { ...defaults, ...saved };
      } catch (_) { }
      return defaults;
    })(),
    hiddenIndicators: (() => {
      try {
        const saved = JSON.parse(getScopedItem('tp_ultra_hidden_inds_v1') || 'null');
        if (saved && typeof saved === 'object') return saved;
      } catch (_) { }
      return {};
    })(),

    watchlist: (() => {
      try {
        const v4 = JSON.parse(getScopedItem('tp_ultra_watchlist_v4') || 'null');
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
              name: (typeof raw === 'object' && raw?.name && raw.name !== sym) ? raw.name : (catHit?.name || sym),
              source: (typeof raw === 'object' && raw?.source) ? raw.source : undefined
            });
          }
          if (norm.length > 0) return norm;
        }
        // Migrate any custom user tickers from legacy watchlist on top of the complete live Watchlist
        const legacy = JSON.parse(getScopedItem('tp_ultra_watchlist', 'tradepro_watchlist_v2') || 'null');
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
        const s = JSON.parse(getScopedItem('tp_ultra_alerts', 'tradepro_alerts_v1') || 'null');
        if (Array.isArray(s)) return s;
      } catch (_) { }
      return [];
    })(),
    alertDir: 'up',
    alertCond: 'price_up',
    autoSignalAlert: true,

    portfolios: (() => {
      try {
        const saved = JSON.parse(getScopedItem('tp_ultra_portfolios_v1') || 'null');
        if (saved && typeof saved === 'object') return { ...createDefaultPortfolios(), ...saved };
        const legacy = JSON.parse(getScopedItem('tp_ultra_paper') || 'null');
        const def = createDefaultPortfolios();
        if (legacy && typeof legacy === 'object') def.p1 = { ...def.p1, ...legacy };
        return def;
      } catch (_) { }
      return createDefaultPortfolios();
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
  function createDefaultSecondaryIndicators() {
    const out = {};
    const baseKeys = state && state.indicators ? Object.keys(state.indicators) : [];
    baseKeys.forEach(k => { out[k] = false; });
    out.emaRibbon = true;
    out.supertrend = true;
    out.smartSignals = true;
    out.vol = true;
    return out;
  }

  function makeSecPaneObj(id, sym, tf) {
    return {
      id, sym, tf,
      chart: null, candle: null, volSeries: null, lines: null, fibPriceLines: [], overlay: null, bars: [],
      indicators: createDefaultSecondaryIndicators(),
      hiddenIndicators: {}
    };
  }

  const secPanes = [
    makeSecPaneObj(1, 'NQ=F', '5m'),
    makeSecPaneObj(2, 'ES=F', '5m'),
    makeSecPaneObj(3, 'BTC-USD', '15m'),
    makeSecPaneObj(4, 'TSLA', '15m'),
    makeSecPaneObj(5, 'APPS', '1h'),
    makeSecPaneObj(6, 'ONDS', '1h'),
    makeSecPaneObj(7, 'EGLD-USD', '15m'),
    makeSecPaneObj(8, 'ETH-USD', '15m'),
    makeSecPaneObj(9, 'LULU', '1h'),
    makeSecPaneObj(10, 'GME', '1h'),
    makeSecPaneObj(11, 'MSFT', '1h'),
    makeSecPaneObj(12, 'ORCL', '1h'),
    makeSecPaneObj(13, 'AAPL', '1h'),
    makeSecPaneObj(14, 'EURUSD=X', '15m'),
    makeSecPaneObj(15, 'CL=F', '1h'),
    makeSecPaneObj(16, 'GC=F', '1h'),
    makeSecPaneObj(17, 'NIO', '1d'),
    makeSecPaneObj(18, 'PYPL', '1d'),
    makeSecPaneObj(19, 'TRX-USD', '15m')
  ];

  const SEC_PANE_DEFAULTS = [
    { id: 1, sym: 'NQ=F', tf: '5m' }, { id: 2, sym: 'ES=F', tf: '5m' }, { id: 3, sym: 'BTC-USD', tf: '15m' },
    { id: 4, sym: 'TSLA', tf: '15m' }, { id: 5, sym: 'NVDA', tf: '1h' }, { id: 6, sym: 'AAPL', tf: '1h' },
    { id: 7, sym: 'ETH-USD', tf: '15m' }, { id: 8, sym: 'MSFT', tf: '1h' }, { id: 9, sym: 'AMZN', tf: '1h' },
    { id: 10, sym: 'GOOGL', tf: '1h' }, { id: 11, sym: 'META', tf: '1h' }, { id: 12, sym: 'AMD', tf: '1h' },
    { id: 13, sym: 'SPY', tf: '1h' }, { id: 14, sym: 'QQQ', tf: '1h' }, { id: 15, sym: 'EURUSD=X', tf: '15m' },
    { id: 16, sym: 'CL=F', tf: '1h' }, { id: 17, sym: 'GC=F', tf: '1h' }, { id: 18, sym: 'SOL-USD', tf: '15m' },
    { id: 19, sym: 'XRP-USD', tf: '15m' }
  ];

  // Restore saved symbols, timeframes, indicators & visibility per secondary pane across refreshes
  try {
    const savedPanes = JSON.parse(getScopedItem('tp_ultra_secpanes_v1') || 'null');
    if (Array.isArray(savedPanes)) {
      savedPanes.forEach(sp => {
        const hit = secPanes.find(x => x.id === Number(sp?.id));
        if (hit) {
          if (sp.sym) hit.sym = String(sp.sym).trim().toUpperCase();
          if (sp.tf) hit.tf = String(sp.tf).trim();
          if (sp.indicators && typeof sp.indicators === 'object') {
            hit.indicators = { ...createDefaultSecondaryIndicators(), ...sp.indicators };
          }
          if (sp.hiddenIndicators && typeof sp.hiddenIndicators === 'object') {
            hit.hiddenIndicators = { ...sp.hiddenIndicators };
          }
        }
      });
    }
  } catch (_) { }

  function saveSecondaryPanes() {
    try {
      const serial = secPanes.map(p => ({
        id: p.id,
        sym: p.sym,
        tf: p.tf,
        indicators: p.indicators,
        hiddenIndicators: p.hiddenIndicators
      }));
      setScopedItem('tp_ultra_secpanes_v1', JSON.stringify(serial));
      setScopedItem('tp_ultra_focused_pane', String(state.focusedPaneId || 0));
    } catch (_) { }
  }

  function getFocusedPaneObj() {
    const fid = Number(state.focusedPaneId || 0);
    return fid > 0 ? (secPanes.find(p => p.id === fid) || null) : null;
  }

  function getPaneIndBucket(paneObj = getFocusedPaneObj()) {
    const p = paneObj && Number(paneObj.id) > 0 ? paneObj : null;
    if (p) {
      if (!p.indicators || typeof p.indicators !== 'object') p.indicators = createDefaultSecondaryIndicators();
      if (!p.hiddenIndicators || typeof p.hiddenIndicators !== 'object') p.hiddenIndicators = {};
      return { pane: p, indicators: p.indicators, hiddenIndicators: p.hiddenIndicators, isPrimary: false };
    }
    if (!state.hiddenIndicators || typeof state.hiddenIndicators !== 'object') state.hiddenIndicators = {};
    return { pane: null, indicators: state.indicators, hiddenIndicators: state.hiddenIndicators, isPrimary: true };
  }

  function isBucketIndVisible(indicators, hiddenIndicators, key) {
    return Boolean(indicators && indicators[key] && !(hiddenIndicators && hiddenIndicators[key]));
  }

  function isPaneIndVisible(paneObj, key) {
    const b = getPaneIndBucket(paneObj);
    return isBucketIndVisible(b.indicators, b.hiddenIndicators, key);
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
    setScopedItem('tp_ultra_theme', theme);
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
    secPanes.forEach(p => { if (p.overlay) p.overlay.requestRender(); });
  }

  function isMobileViewport() {
    return window.innerWidth <= 820;
  }

  function closeCopilotOverlay() {
    const copDrawer = document.getElementById('aiCopilotDrawer');
    if (copDrawer && copDrawer.classList.contains('open')) {
      copDrawer.classList.remove('open');
      copDrawer.setAttribute('aria-hidden', 'true');
      document.getElementById('aiCopilotTopBtn')?.classList.remove('active');
      document.getElementById('railCopilotBtn')?.classList.remove('active');
      document.getElementById('mobCopilotChipBtn')?.classList.remove('active');
    }
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
    closeCopilotOverlay();
    document.querySelectorAll('.tv-menu.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('[data-mnav]').forEach(b => {
      b.classList.toggle('active', b.dataset.mnav === 'chart');
    });
    setTimeout(resizeAllCharts, 40);
  }

  const CHART_TZ_RO = 'Europe/Bucharest';
  const CHART_CROSSHAIR_FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: CHART_TZ_RO, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const CHART_YEAR_FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: CHART_TZ_RO, year: 'numeric' });
  const CHART_MONTH_FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: CHART_TZ_RO, month: 'short', year: '2-digit' });
  const CHART_DAY_FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: CHART_TZ_RO, day: '2-digit', month: 'short' });
  const CHART_TIME_FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: CHART_TZ_RO, hour: '2-digit', minute: '2-digit', hour12: false });
  const CHART_SEC_FMT = new Intl.DateTimeFormat('ro-RO', { timeZone: CHART_TZ_RO, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  function chartTimeToDate(time) {
    if (typeof time === 'number') return new Date(time * 1000);
    if (time && typeof time === 'object' && time.year) {
      return new Date(Date.UTC(time.year, (time.month || 1) - 1, time.day || 1));
    }
    return null;
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
      localization: {
        timeFormatter: (time) => {
          const d = chartTimeToDate(time);
          if (!d) return '';
          if (typeof time === 'number') return CHART_CROSSHAIR_FMT.format(d);
          return `${CHART_DAY_FMT.format(d)} ${CHART_YEAR_FMT.format(d)}`;
        }
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
        tickMarkFormatter: (time, tickMarkType) => {
          const d = chartTimeToDate(time);
          if (!d) return '';
          if (tickMarkType === 0) return CHART_YEAR_FMT.format(d);
          if (tickMarkType === 1) return CHART_MONTH_FMT.format(d);
          if (tickMarkType === 2) return CHART_DAY_FMT.format(d);
          if (tickMarkType === 4) return CHART_SEC_FMT.format(d);
          return typeof time === 'number' ? CHART_TIME_FMT.format(d) : CHART_DAY_FMT.format(d);
        },
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

  const SHORT_IND_LABELS = {
    smartSignals: 'Signals',
    supertrend: 'SuperTrend',
    emaRibbon: 'EMA Ribbon',
    smc: 'SMC',
    vpvr: 'VPVR',
    tpo: 'TPO',
    footprint: 'Delta',
    autoPatterns: 'Patterns',
    wolfeWave: 'Wolfe 1-5',
    expectedMove: 'Exp Move',
    vwap: 'VWAP',
    bb: 'Bollinger',
    ma: 'SMA',
    ichimoku: 'Ichimoku',
    fibAuto: 'Fib Auto',
    candlePatterns: 'Candles',
    forecast: 'AI Cone',
    vol: 'Volum',
    rsi: 'RSI',
    macd: 'MACD'
  };

  function createChartOverlaySeriesPool(chartInst, includeCompare = false) {
    const addLine = (color, width = 1.5, style = LightweightCharts.LineStyle.Solid, lastVal = false) =>
      chartInst.addLineSeries({
        color,
        lineWidth: width,
        lineStyle: style,
        priceLineVisible: false,
        lastValueVisible: lastVal,
        crosshairMarkerVisible: false
      });

    const pool = {
      stBull: addLine('#00e676', 2, LightweightCharts.LineStyle.Solid, true),
      stBear: addLine('#ff1744', 2, LightweightCharts.LineStyle.Solid, true),

      ema9: addLine('#38bdf8', 1),
      ema21: addLine('#2962ff', 1.75),
      ema50: addLine('#f59e0b', 1.75),
      ema200: addLine('#ec4899', 2),

      sma20: addLine('#60a5fa', 1, LightweightCharts.LineStyle.Dashed),
      sma50: addLine('#fbbf24', 1, LightweightCharts.LineStyle.Dashed),
      sma200: addLine('#f43f5e', 1.5, LightweightCharts.LineStyle.Dashed),

      bbU: addLine('rgba(139, 92, 246, 0.65)', 1),
      bbM: addLine('rgba(139, 92, 246, 0.35)', 1, LightweightCharts.LineStyle.Dashed),
      bbL: addLine('rgba(139, 92, 246, 0.65)', 1),

      vwap: addLine('#ff5722', 2, LightweightCharts.LineStyle.Solid, true),
      vwapU1: addLine('rgba(255, 87, 34, 0.45)', 1, LightweightCharts.LineStyle.Dashed),
      vwapL1: addLine('rgba(255, 87, 34, 0.45)', 1, LightweightCharts.LineStyle.Dashed),
      vwapU2: addLine('rgba(255, 87, 34, 0.22)', 1, LightweightCharts.LineStyle.Dotted),
      vwapL2: addLine('rgba(255, 87, 34, 0.22)', 1, LightweightCharts.LineStyle.Dotted),

      tenkan: addLine('#06b6d4', 1.25),
      kijun: addLine('#f97316', 1.25),

      fcLine: addLine('#a855f7', 2, LightweightCharts.LineStyle.Dashed, true),
      fcUpper: addLine('rgba(168, 85, 247, 0.35)', 1, LightweightCharts.LineStyle.Dotted),
      fcLower: addLine('rgba(168, 85, 247, 0.35)', 1, LightweightCharts.LineStyle.Dotted)
    };
    if (includeCompare) {
      pool.compareLine = addLine('#38bdf8', 2, LightweightCharts.LineStyle.Solid, true);
    }
    return pool;
  }

  function drawFibPriceLinesOnSeries(bars, series, targetArr, lookback = 60, storeInState = false, showFib = true) {
    targetArr.forEach(obj => {
      try { obj.series.removePriceLine(obj.line); } catch (_) { }
    });
    targetArr.length = 0;
    if (!series || !bars || !bars.length) return null;
    const fib = Q.calcAutoFib(bars, lookback);
    if (storeInState) state.lastFibOut = fib;
    if (showFib && fib) {
      const cols = { '0.0': '#787b86', '23.6': '#f23645', '38.2': '#f59e0b', '50.0': '#10b981', '61.8': '#2962ff', '78.6': '#06b6d4', '100.0': '#787b86' };
      fib.levels.forEach(lv => {
        const isKey = lv.label === '38.2' || lv.label === '50.0' || lv.label === '61.8';
        targetArr.push({
          series,
          line: series.createPriceLine({
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
    return fib;
  }

  function applySharedChartOverlays({
    bars,
    candleSeries,
    volSeries = null,
    linePool,
    fibTargetArr = null,
    overlayEng = null,
    isVisFn,
    lookback = 60,
    forecastHorizon = 14,
    needFullAnalytics = false,
    manageFib = true
  }) {
    if (!bars || !bars.length || !linePool) {
      return { sigOut: null, vpvrFull: null, fpFull: null, fcOut: null };
    }

    if (volSeries) {
      volSeries.setData(isVisFn('vol')
        ? bars.map(b => ({
          time: b.time,
          value: b.volume,
          color: b.close >= b.open ? 'rgba(8, 153, 129, 0.20)' : 'rgba(242, 54, 69, 0.20)'
        }))
        : []);
    }

    const closes = bars.map(b => b.close);

    if (isVisFn('supertrend')) {
      const st = Q.calcSuperTrend(bars, 10, 3.0);
      const lastDir = st.dir[st.dir.length - 1];
      linePool.stBull.applyOptions({ lastValueVisible: lastDir === 1 });
      linePool.stBear.applyOptions({ lastValueVisible: lastDir === -1 });
      linePool.stBull.setData(st.bullSeries);
      linePool.stBear.setData(st.bearSeries);
    } else {
      linePool.stBull.applyOptions({ lastValueVisible: false });
      linePool.stBear.applyOptions({ lastValueVisible: false });
      linePool.stBull.setData([]);
      linePool.stBear.setData([]);
    }

    if (isVisFn('emaRibbon')) {
      linePool.ema9.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 9)));
      linePool.ema21.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 21)));
      linePool.ema50.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 50)));
      linePool.ema200.setData(Q.toSeries(bars, Q.calcEMAArray(closes, 200)));
    } else {
      linePool.ema9.setData([]);
      linePool.ema21.setData([]);
      linePool.ema50.setData([]);
      linePool.ema200.setData([]);
    }

    if (isVisFn('ma')) {
      linePool.sma20.setData(Q.toSeries(bars, Q.calcSMAArray(closes, 20)));
      linePool.sma50.setData(Q.toSeries(bars, Q.calcSMAArray(closes, 50)));
      linePool.sma200.setData(Q.toSeries(bars, Q.calcSMAArray(closes, 200)));
    } else {
      linePool.sma20.setData([]);
      linePool.sma50.setData([]);
      linePool.sma200.setData([]);
    }

    if (isVisFn('bb')) {
      const bb = Q.calcBollinger(bars, 20, 2.0);
      linePool.bbU.setData(bb.upperS);
      linePool.bbM.setData(bb.midS);
      linePool.bbL.setData(bb.lowerS);
    } else {
      linePool.bbU.setData([]);
      linePool.bbM.setData([]);
      linePool.bbL.setData([]);
    }

    if (isVisFn('vwap')) {
      const vw = Q.calcVWAP(bars);
      linePool.vwap.setData(vw.vwapS);
      linePool.vwapU1.setData(vw.u1S);
      linePool.vwapL1.setData(vw.l1S);
      linePool.vwapU2.setData(vw.u2S);
      linePool.vwapL2.setData(vw.l2S);
    } else {
      linePool.vwap.setData([]);
      linePool.vwapU1.setData([]);
      linePool.vwapL1.setData([]);
      linePool.vwapU2.setData([]);
      linePool.vwapL2.setData([]);
    }

    if (isVisFn('ichimoku')) {
      const ich = Q.calcIchimoku(bars);
      linePool.tenkan.setData(ich.tenkanS);
      linePool.kijun.setData(ich.kijunS);
    } else {
      linePool.tenkan.setData([]);
      linePool.kijun.setData([]);
    }

    const sigOut = Q.runSmartSignalEngine(bars);
    if (candleSeries && typeof candleSeries.setMarkers === 'function') {
      const mList = [];
      if (isVisFn('smartSignals') && sigOut.markers) mList.push(...sigOut.markers);
      if (isVisFn('candlePatterns') && typeof Q.detectCandlestickPatterns === 'function') {
        mList.push(...Q.detectCandlestickPatterns(bars));
      }
      mList.sort((a, b) => a.time - b.time);
      candleSeries.setMarkers(mList);
    }

    const showSmc = isVisFn('smc');
    const showVpvr = isVisFn('vpvr');
    const showTpo = isVisFn('tpo');
    const showFp = isVisFn('footprint');
    const showPat = isVisFn('autoPatterns');
    const showWolfe = isVisFn('wolfeWave');
    const showExpMove = isVisFn('expectedMove');
    const showFc = isVisFn('forecast');

    const atrArr = showSmc ? Q.calcATRArray(bars, 14) : null;
    const smcData = showSmc ? Q.calcSMC(bars, atrArr) : null;
    const vpvrFull = (showVpvr || needFullAnalytics) ? Q.calcVPVR(bars.slice(-140), 42) : null;
    const vpvrData = showVpvr ? vpvrFull : null;
    const tpoData = showTpo ? Q.calcTPO(bars, 32) : null;
    const fpFull = (showFp || needFullAnalytics) ? Q.calcOrderflowFootprint(bars) : null;
    const footprintData = showFp ? fpFull : null;
    const patternData = showPat ? Q.calcAutoPatterns(bars) : null;
    const wolfeData = (showWolfe && typeof Q.calcWolfeWave === 'function') ? Q.calcWolfeWave(bars) : null;
    const expectedMoveData = showExpMove ? Q.calcExpectedMove(bars, 10) : null;
    const fcOut = (showFc || needFullAnalytics) ? Q.computeForecast(bars, forecastHorizon) : null;

    if (showFc && fcOut) {
      linePool.fcLine.setData(fcOut.lineS);
      linePool.fcUpper.setData(fcOut.upperS);
      linePool.fcLower.setData(fcOut.lowerS);
    } else {
      linePool.fcLine.setData([]);
      linePool.fcUpper.setData([]);
      linePool.fcLower.setData([]);
    }

    if (manageFib && fibTargetArr && candleSeries) {
      drawFibPriceLinesOnSeries(bars, candleSeries, fibTargetArr, lookback, false, isVisFn('fibAuto'));
    }

    if (overlayEng) {
      overlayEng.setLayers({
        vpvrData,
        smcData,
        tradePlan: sigOut.currentPlan,
        tpoData,
        footprintData,
        patternData,
        wolfeData,
        expectedMoveData,
        showVPVR: showVpvr,
        showSMC: showSmc,
        showTradePlan: isVisFn('smartSignals'),
        showTPO: showTpo,
        showFootprint: showFp,
        showAutoPatterns: showPat,
        showWolfeWave: showWolfe,
        showExpectedMove: showExpMove,
        showExtSessions: !!state.extHours
      });
    }

    return { sigOut, vpvrFull, fpFull, fcOut };
  }

  function renderChartIndicatorStackUI(legEl, indicators, hiddenIndicators, targetPane = null) {
    if (!legEl) return;
    const activeDefs = INDICATOR_DEFS.filter(d => indicators?.[d.key]);
    legEl.innerHTML = activeDefs.map(d => {
      const shortLbl = SHORT_IND_LABELS[d.key] || d.name.split(' (')[0];
      const vis = isBucketIndVisible(indicators, hiddenIndicators, d.key);
      const toggleTip = vis
        ? `${shortLbl}: ACTIV — click pe bulină/nume pentru ascundere temporară (OFF)`
        : `${shortLbl}: OPRIT (OFF) — click pe bulină/nume pentru reactivare (ON)`;
      return `
        <div class="ind-leg-row${vis ? '' : ' is-hidden'}">
          <button type="button" class="ind-leg-toggle" data-toggle-ind-vis="${d.key}" title="${toggleTip}">
            <span class="ind-leg-dot" style="background:${d.color}"></span>
            <span class="ind-leg-lbl">${shortLbl}</span>
          </button>
          <button type="button" class="ind-leg-x" data-remove-ind="${d.key}" title="Șterge definitiv ${shortLbl} din listă" aria-label="Șterge ${shortLbl}">${ICO.close}</button>
        </div>
      `;
    }).join('');
    legEl.querySelectorAll('[data-toggle-ind-vis]').forEach(btn => {
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.onclick = (e) => {
        e.stopPropagation();
        if (targetPane) focusChartPane(targetPane.id);
        else focusChartPane(0);
        toggleIndicatorVisibility(btn.dataset.toggleIndVis, targetPane);
      };
    });
    legEl.querySelectorAll('[data-remove-ind]').forEach(btn => {
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.onclick = (e) => {
        e.stopPropagation();
        if (targetPane) focusChartPane(targetPane.id);
        else focusChartPane(0);
        removeIndicatorFromChart(btn.dataset.removeInd, targetPane);
      };
    });
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

    Object.assign(overlaySeries, createChartOverlaySeriesPool(mainChart, true));

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
      storagePrefix: authState.user ? `tp_u_${authState.user.id}_drawings_` : 'tp_ultra_drawings_',
      onDrawingsChange: () => {
        if (!authState.suppressSync && authState.token && authState.user) scheduleAuthServerSync();
      },
      onToolReset: (t) => updateDrawToolUI(t)
    });

    // Sync Crosshair, Visible Range & Live Evolution Strip
    let lastEvoRangeMs = 0;
    mainChart.subscribeCrosshairMove(onCrosshairMove);
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        if (isIndVisible('rsi')) rsiChart.timeScale().setVisibleLogicalRange(range);
        if (isIndVisible('macd')) macdChart.timeScale().setVisibleLogicalRange(range);
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

    // Interactive Annotation & Pattern Educational Popover (Click on BOS, CHoCH, OB, FVG, Patterns, VPVR, Sessions)
    const stageEl = document.getElementById('mainChartStage');
    const explainEl = document.getElementById('chartExplainPopover');
    const hideChartExplainPopover = () => {
      if (explainEl) explainEl.style.display = 'none';
    };
    const showChartExplainPopover = (hit, localX, localY) => {
      if (!explainEl || !hit) return;
      const toneCls = hit.tone === 'up' ? 'up' : (hit.tone === 'dn' ? 'dn' : (hit.tone === 'warn' ? 'warn' : ''));
      explainEl.innerHTML = `
        <div class="cep-hdr">
          <div class="cep-cat-row">
            <span class="cep-cat">${escTg(hit.category || 'Indicator Grafic')}</span>
            ${hit.badge ? `<span class="cep-badge ${toneCls}">${escTg(hit.badge)}</span>` : ''}
          </div>
          <button type="button" class="cep-close" aria-label="Închide explicația">${ICO.close}</button>
        </div>
        <div class="cep-title">${escTg(hit.title || '')}</div>
        ${hit.meaning ? `<div class="cep-sec"><b>Ce înseamnă:</b> ${escTg(hit.meaning)}</div>` : ''}
        ${hit.action ? `<div class="cep-sec"><b>Cum se interpretează:</b> ${escTg(hit.action)}</div>` : ''}
      `;
      explainEl.style.display = 'block';
      const sw = stageEl.clientWidth || 600;
      const sh = stageEl.clientHeight || 400;
      const pw = explainEl.offsetWidth || 295;
      const ph = explainEl.offsetHeight || 150;
      let left = localX + 12;
      if (left + pw > sw - 12) left = localX - pw - 12;
      left = Math.max(10, Math.min(sw - pw - 10, left));
      let top = localY + 12;
      if (top + ph > sh - 12) top = localY - ph - 12;
      top = Math.max(10, Math.min(sh - ph - 10, top));
      explainEl.style.left = `${Math.round(left)}px`;
      explainEl.style.top = `${Math.round(top)}px`;
      explainEl.querySelector('.cep-close')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        hideChartExplainPopover();
      });
    };

    stageEl.addEventListener('mousemove', (e) => {
      if (!overlayEngine || overlayEngine.tool !== 'cursor' || e.target.closest?.('button, #tvLegendBox, #activeIndLegend, #chartExplainPopover')) {
        stageEl.classList.remove('hit-hover');
        return;
      }
      const rect = stageEl.getBoundingClientRect();
      const hit = overlayEngine.hitTestAnnotation(e.clientX - rect.left, e.clientY - rect.top);
      stageEl.classList.toggle('hit-hover', !!hit);
    });

    let expDown = null;
    stageEl.addEventListener('pointerdown', (e) => {
      if (e.button && e.button !== 0) return;
      if (!overlayEngine || overlayEngine.tool !== 'cursor' || e.target.closest?.('button, #tvLegendBox, #activeIndLegend, #chartExplainPopover')) {
        expDown = null;
        return;
      }
      const rect = stageEl.getBoundingClientRect();
      expDown = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, { capture: true });

    stageEl.addEventListener('pointerup', (e) => {
      if (!expDown) return;
      const down = expDown;
      expDown = null;
      if (!overlayEngine || overlayEngine.tool !== 'cursor') return;
      const rect = stageEl.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (Math.hypot(lx - down.x, ly - down.y) > 6) return;
      const hit = overlayEngine.hitTestAnnotation(lx, ly);
      if (hit) showChartExplainPopover(hit, lx, ly);
      else hideChartExplainPopover();
    }, { capture: true });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideChartExplainPopover();
    });

    // Right-click & Mobile Long-Press Context Menu
    stageEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      hideChartExplainPopover();
      openContextMenu(e.clientX, e.clientY);
    });
    let lpTimer = null;
    let lpStart = null;
    stageEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || (overlayEngine && overlayEngine.tool !== 'cursor')) {
        if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
        return;
      }
      if (e.target.closest?.('button, #tvLegendBox, #activeIndLegend, #chartExplainPopover')) return;
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
    if (rsiChart && isIndVisible('rsi') && rsiPane) {
      const rect = rsiPane.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 20 && h > 20) rsiChart.resize(w, h);
    }
    const macdPane = document.getElementById('macdPane');
    if (macdChart && isIndVisible('macd') && macdPane) {
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
        if (w > 20 && h > 20) {
          const wasHidden = !p._lastW || !p._lastH;
          p._lastW = w;
          p._lastH = h;
          p.chart.resize(w, h);
          if (wasHidden && p.bars && p.bars.length > 0) {
            try {
              renderSecondaryPaneIndicators(p, true);
            } catch (_) { }
          }
        } else {
          p._lastW = 0;
          p._lastH = 0;
        }
      }
      if (p.overlay) p.overlay.resize();
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
        } else if (/^\d+m$/.test(cleanTf)) {
          bars = aggregateBucketSeconds(bars, Math.max(1, parseInt(cleanTf, 10)) * 60);
        } else if (/^\d+h$/.test(cleanTf)) {
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

  function toEpochSec(val) {
    if (val == null || val === '') return 0;
    if (typeof val === 'number') {
      if (!isFinite(val) || val <= 0) return 0;
      return Math.floor(val > 1e12 ? val / 1000 : val);
    }
    const ms = Date.parse(String(val));
    return isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  }

  const EXT_SESS_META = {
    PRE: { cls: 'pre', title: 'Pre-Market activ', label: 'Pre-Market', short: 'Pre', lineTitle: 'Pre-Mkt', color: '#f59e0b', icoKey: 'preSun' },
    OVN: { cls: 'ovn', title: 'Overnight (BOATS) activ', label: 'Overnight (BOATS)', short: 'Overnight', lineTitle: 'Overnight', color: '#a855f7', icoKey: 'postMoon' },
    POST: { cls: 'post', title: 'Post-Market activ', label: 'Post-Market', short: 'Post', lineTitle: 'Post-Mkt', color: '#2962ff', icoKey: 'postMoon' }
  };

  function getExtSessionUiMeta(extType) {
    const k = String(extType || '').toUpperCase();
    const base = EXT_SESS_META[k] || EXT_SESS_META.POST;
    return { ...base, ico: ICO[base.icoKey] || ICO.postMoon };
  }

  function extractQuoteSessionInfo(q) {
    if (!q) return null;
    const sym = String(q.symbol || '').toUpperCase();
    const is24h = sym.endsWith('-USD') || sym.endsWith('=X');
    const mktState = String(q.marketState || '').toUpperCase();
    const tvCurrentSession = String(q.tvCurrentSession || '').toLowerCase();
    const regPrice = q.regularMarketPrice;
    const prevClose = q.regularMarketPreviousClose ?? (isFinite(regPrice) && isFinite(q.regularMarketChange) ? regPrice - q.regularMarketChange : null);
    const regChg = q.regularMarketChange ?? (isFinite(regPrice) && isFinite(prevClose) ? regPrice - prevClose : 0);
    const regChgPct = q.regularMarketChangePercent ?? (isFinite(prevClose) && prevClose ? (regChg / prevClose) * 100 : 0);

    let extType = '';
    let extPrice = null;
    let extChg = null;
    let extChgPct = null;
    let extTime = null;

    const isUsRegularOpen = !is24h && !sym.includes('.') && isUsRegularMarketOpenNowET();
    if (!is24h && mktState !== 'REGULAR' && !(mktState === '' && !tvCurrentSession && isUsRegularOpen)) {
      const hasOvn = q.overnightPrice != null && isFinite(q.overnightPrice) && q.overnightPrice > 0;
      const hasPre = q.preMarketPrice != null && isFinite(q.preMarketPrice) && q.preMarketPrice > 0;
      const hasPost = q.postMarketPrice != null && isFinite(q.postMarketPrice) && q.postMarketPrice > 0;
      const ovnTs = hasOvn ? toEpochSec(q.overnightTime) : 0;
      const preTs = hasPre ? toEpochSec(q.preMarketTime) : 0;
      const postTs = hasPost ? toEpochSec(q.postMarketTime) : 0;

      if (mktState === 'PRE' && hasPre && preTs >= ovnTs) {
        extType = 'PRE';
      } else if ((mktState === 'POST' || mktState === 'POSTPOST') && hasPost && postTs >= ovnTs) {
        extType = 'POST';
      } else if (tvCurrentSession === 'night' && hasOvn) {
        extType = 'OVN';
      } else if (hasPre || hasOvn || hasPost) {
        if (hasPre && preTs >= Math.max(ovnTs, postTs)) extType = 'PRE';
        else if (hasOvn && ovnTs >= postTs) extType = 'OVN';
        else if (hasPost) extType = 'POST';
        else extType = hasPre ? 'PRE' : (hasOvn ? 'OVN' : 'POST');
      }

      if (extType === 'PRE') {
        extPrice = q.preMarketPrice;
        extChg = q.preMarketChange ?? (isFinite(regPrice) ? extPrice - regPrice : 0);
        extChgPct = q.preMarketChangePercent ?? (isFinite(regPrice) && regPrice ? (extChg / regPrice) * 100 : 0);
        extTime = q.preMarketTime || null;
      } else if (extType === 'OVN') {
        extPrice = q.overnightPrice;
        extChg = q.overnightChange ?? (isFinite(regPrice) ? extPrice - regPrice : 0);
        extChgPct = q.overnightChangePercent ?? (isFinite(regPrice) && regPrice ? (extChg / regPrice) * 100 : 0);
        extTime = q.overnightTime || null;
      } else if (extType === 'POST') {
        extPrice = q.postMarketPrice;
        extChg = q.postMarketChange ?? (isFinite(regPrice) ? extPrice - regPrice : 0);
        extChgPct = q.postMarketChangePercent ?? (isFinite(regPrice) && regPrice ? (extChg / regPrice) * 100 : 0);
        extTime = q.postMarketTime || null;
      }
    }

    return {
      mktState,
      tvCurrentSession,
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
    const uniqueSyms = Array.from(new Set(symbols.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)));
    const chunkSize = 18;
    const chunks = [];
    for (let i = 0; i < uniqueSyms.length; i += chunkSize) {
      chunks.push(uniqueSyms.slice(i, i + chunkSize));
    }
    await Promise.all(chunks.map(async (sl) => {
      const u = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sl.join(','))}&fields=${fields}`;
      try {
        const json = await fetchViaProxy(u, 15000);
        const arr = json?.quoteResponse?.result || [];
        arr.forEach(q => {
          if (q && q.symbol) out[String(q.symbol).toUpperCase()] = q;
        });
      } catch (_) { }
    }));

    // Automatic v8 chart fallback (with Pre/Post-Market support!) for any ticker missing from v7 quote response
    const missing = uniqueSyms.filter(s => !out[s]);
    if (missing.length > 0) {
      await Promise.all(missing.slice(0, 24).map(async (sym) => {
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
          let overnightPrice = meta.overnightPrice;
          let overnightChange = overnightPrice != null ? overnightPrice - regP : undefined;
          let overnightChangePercent = (overnightPrice != null && regP) ? ((overnightPrice - regP) / regP) * 100 : undefined;
          let overnightTime = meta.overnightTime;
          let marketState = meta.marketState || '';

          const lastClose = closes[closes.length - 1];
          const lastTs = ts[ts.length - 1];
          const regSec = toEpochSec(meta.regularMarketTime);
          if (isFinite(lastClose) && lastTs && Math.abs(lastClose - regP) > 1e-5 && (!regSec || lastTs > regSec + 60)) {
            const dEt = new Date((lastTs - 5 * 3600) * 1000);
            const mins = dEt.getUTCHours() * 60 + dEt.getUTCMinutes();
            if (mins >= 240 && mins < 570) {
              marketState = marketState || 'PRE';
              preMarketPrice = lastClose;
              preMarketChange = lastClose - regP;
              preMarketChangePercent = regP ? (preMarketChange / regP) * 100 : 0;
            } else if (mins >= 1200 || mins < 240) {
              marketState = marketState || 'PREPRE';
              overnightPrice = lastClose;
              overnightChange = lastClose - regP;
              overnightChangePercent = regP ? (overnightChange / regP) * 100 : 0;
              overnightTime = lastTs;
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
            postMarketChangePercent,
            overnightPrice,
            overnightChange,
            overnightChangePercent,
            overnightTime
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
  function clearSeriesPool(pool) {
    if (!pool || typeof pool !== 'object') return;
    Object.values(pool).forEach(s => {
      try { s?.setData([]); } catch (_) { }
    });
  }

  function clearPrimaryChartForSymbolSwitch() {
    [...fibPriceLines, ...alertPriceLines, ...hlPriceLines].forEach(obj => {
      try { obj.series.removePriceLine(obj.line); } catch (_) { }
    });
    fibPriceLines = [];
    alertPriceLines = [];
    hlPriceLines = [];
    try { mainSeries?.setData([]); } catch (_) { }
    try { if (typeof mainSeries?.setMarkers === 'function') mainSeries.setMarkers([]); } catch (_) { }
    try { volSeries?.setData([]); } catch (_) { }
    try { futurePadSeries?.setData([]); } catch (_) { }
    clearSeriesPool(overlaySeries);
    [rsiLineS, rsiMaS, stochKS, stochDS, rsiOB, rsiOS, macdHistS, macdLineS, macdSigS].forEach(s => {
      try { s?.setData([]); } catch (_) { }
    });
    const rsiVal = document.getElementById('rsiLiveVal');
    if (rsiVal) rsiVal.textContent = '—';
    const macdVal = document.getElementById('macdLiveVal');
    if (macdVal) macdVal.textContent = '—';
    const hud = document.getElementById('smartHudCard');
    if (hud) hud.innerHTML = '';
    const ohlc = document.getElementById('ohlcStrip');
    if (ohlc) ohlc.innerHTML = '';
    const yTag = document.getElementById('yAxisCountdownTag');
    if (yTag) yTag.style.display = 'none';
    const jumpBtn = document.getElementById('jumpToLiveBtn');
    if (jumpBtn) jumpBtn.style.display = 'none';
  }

  function renderChartAndQuant(fitView = false) {
    const bars = state.bars;
    if (!bars || bars.length < 5) return;
    const savedRange = (!fitView && mainChart) ? mainChart.timeScale().getVisibleLogicalRange() : null;

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
    const tfStepFallback = getTfStepSeconds(state.tf);
    const rawDiffSec = bars.length > 1 ? Math.max(1, bars[bars.length - 1].time - bars[bars.length - 2].time) : 86400;
    const barSec = (tfStepFallback > 0 && tfStepFallback < 86400) ? tfStepFallback : Math.min(rawDiffSec, 86400);
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

    // 2-5. Unified Volume, Line Overlays, Signals, Patterns, Institutional SMC/VPVR/TPO/Wolfe & AI Forecast
    const closes = bars.map(b => b.close);
    const { sigOut, vpvrFull, fpFull, fcOut } = applySharedChartOverlays({
      bars,
      candleSeries: mainSeries,
      volSeries,
      linePool: overlaySeries,
      fibTargetArr: fibPriceLines,
      overlayEng: overlayEngine,
      isVisFn: isIndVisible,
      lookback: parseInt(document.getElementById('fibLookbackSelect')?.value || '60', 10),
      forecastHorizon: state.forecastHorizon,
      needFullAnalytics: true,
      manageFib: false
    });
    state.lastSignalOut = sigOut;
    state.lastForecastOut = fcOut;

    // Sub-Panes (RSI + RSI-MA Indicator-on-Indicator & MACD)
    const rsiPane = document.getElementById('rsiPane');
    const rsiSplit = document.getElementById('rsiSplitter');
    if (isIndVisible('rsi')) {
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
    if (isIndVisible('macd')) {
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

    // Update All Panels & HUDs
    updateHeaderAndLegend(bars[bars.length - 1], bars[bars.length - 2]);
    renderSmartPlanPanel(sigOut);
    if (typeof updateActiveAiStrategist === 'function') {
      updateActiveAiStrategist();
    }
    maybeNotifyLiveSignalTelegram(sigOut, { seedOnly: fitView });
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
    } else if (!fitView && savedRange && mainChart) {
      try { mainChart.timeScale().setVisibleLogicalRange(savedRange); } catch (_) { }
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
    if (!state.compareSpec.startsWith('SPR:') && state.renderedSymbol === state.symbol) {
      const lqRef = liveQuoteCache[state.symbol];
      const matchedQ = (state.quote && (!state.quote.symbol || normalizeSymbol(state.quote.symbol) === state.symbol))
        ? state.quote
        : null;
      const qRef = matchedQ ? extractQuoteSessionInfo(matchedQ) : null;
      const eType = lqRef?.extType || qRef?.extType || '';
      const ePrice = lqRef?.extPrice ?? qRef?.extPrice;
      const rPrice = lqRef?.regPrice ?? qRef?.regPrice ?? matchedQ?.regularMarketPrice;
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
          const extMeta = getExtSessionUiMeta(eType);
          hlPriceLines.push({
            series: mainSeries,
            line: mainSeries.createPriceLine({
              price: ePrice,
              color: extMeta.color,
              lineWidth: 1,
              lineStyle: LightweightCharts.LineStyle.Dashed,
              axisLabelVisible: true,
              title: extMeta.lineTitle
            })
          });
        }
      }
    }

    // 2. Auto-Fibonacci lines if enabled (keep Y-axis uncluttered so numeric price ticks stay 100% readable)
    const lookback = parseInt(document.getElementById('fibLookbackSelect')?.value || '60', 10);
    drawFibPriceLinesOnSeries(bars, mainSeries, fibPriceLines, lookback, true, isIndVisible('fibAuto'));

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

  // ─── 8. TOP LEGEND, FLOATING SMART HUD & CROSSHAIR ────────────────────────
  function renderLiveEvolutionStrip() {
    const strip = document.getElementById('liveEvolutionStrip');
    if (strip) strip.innerHTML = '';
  }

  function updateExtendedSessionBadgeEl(el, opts) {
    const { extType, extPrice, extChg, extPct, showPriceAlways = false, sameAsHero = false } = opts || {};
    if (!el) return;
    if (!extType || !isFinite(extPrice)) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    const extMeta = getExtSessionUiMeta(extType);
    const pctTxt = isFinite(extPct) ? `${extPct >= 0 ? '+' : ''}${extPct.toFixed(2)}%` : '';
    const chgTxt = isFinite(extChg) ? `${extChg >= 0 ? '+' : ''}${fmtChg(extChg, extPrice)}` : '';
    const showPx = showPriceAlways || !sameAsHero;
    const extraCls = el.id?.startsWith('secExtBadge') ? ' sec-ext-pill' : '';
    el.className = `ext-sess-pill tabular ${extMeta.cls}${extraCls}`;
    el.innerHTML = showPx
      ? `${extMeta.ico}<span>${extMeta.short} ${fmt(extPrice)}</span>`
      : `${extMeta.ico}<span>${extMeta.short}</span>`;
    el.title = `${extMeta.title}: ${fmt(extPrice)}${chgTxt || pctTxt ? ` (${[chgTxt, pctTxt].filter(Boolean).join(' / ')})` : ''}`;
    el.style.display = 'inline-flex';
  }

  function formatTabTitlePart(symStr, priceVal, pctVal, compact = false) {
    if (!symStr) return '';
    if (isFinite(priceVal) && priceVal > 0) {
      if (!compact && isFinite(pctVal)) {
        return `${symStr} ${fmt(priceVal)} (${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%)`;
      }
      return `${symStr} ${fmt(priceVal)}`;
    }
    return symStr;
  }

  function updateBrowserTabTitle() {
    const primarySym = normalizeSymbol(state.symbol);
    if (!primarySym) return;
    const needed = getNeededSecPanesCount(state.layout);
    const activeSyms = [primarySym];
    const activePaneBySym = new Map();
    if (needed > 0 && Array.isArray(secPanes)) {
      for (let i = 0; i < Math.min(needed, secPanes.length); i++) {
        const p = secPanes[i];
        const s = normalizeSymbol(p?.sym);
        if (s && !activeSyms.includes(s)) {
          activeSyms.push(s);
          activePaneBySym.set(s, p);
        }
      }
    }

    const isMulti = activeSyms.length > 1;
    const parts = activeSyms.map((s, idx) => {
      if (idx === 0) {
        const px = state._lastTitlePrice;
        const pct = state._lastTitlePct;
        if (isFinite(px) && px > 0) return formatTabTitlePart(s, px, pct, isMulti);
      }
      const p = activePaneBySym.get(s);
      const lq = liveQuoteCache[s];
      const fq = fullQuoteCache[s];
      const wl = state.watchlist.find(w => w.sym === s);
      const lastB = (p?.bars && p.bars.length) ? p.bars[p.bars.length - 1] : null;
      const px = (isFinite(p?._liveTitlePrice) && p._liveTitlePrice > 0)
        ? p._liveTitlePrice
        : ((lq?.extType && isFinite(lq?.extPrice)) ? lq.extPrice : (lq?.price ?? fq?.regularMarketPrice ?? wl?.price ?? lastB?.close));
      const pct = isFinite(p?._liveTitlePct)
        ? p._liveTitlePct
        : ((lq?.extType && isFinite(lq?.extChgPct)) ? lq.extChgPct : (lq?.chgPct ?? fq?.regularMarketChangePercent ?? wl?.chgPct));
      return formatTabTitlePart(s, px, pct, isMulti);
    }).filter(Boolean);

    if (parts.length === 1 && (!isFinite(state._lastTitlePrice) || state._lastTitlePrice <= 0)) {
      document.title = `${primarySym} · TradePro`;
    } else if (parts.length > 0) {
      document.title = parts.join(' · ');
    }
  }

  function buildPaneEtoroStripHtml(sym, livePx) {
    const pf = authState.realPortfolio;
    const assets = Array.isArray(pf?.assets) ? pf.assets : [];
    if (!assets.length || !sym) return '';
    const upper = String(sym || '').toUpperCase().replace(/\.(24-7|24-5)$/i, '');
    const hit = assets.find(a => {
      const aSym = String(a.sym || '').toUpperCase();
      const bSym = String(a.brokerSym || '').toUpperCase().replace(/\.(24-7|24-5)$/i, '');
      return aSym === upper || bSym === upper || String(a.brokerSym || '').toUpperCase() === String(sym || '').toUpperCase();
    });
    if (!hit) return '';
    const units = Number(hit.units || 0);
    const avgOpen = Number(hit.avgOpen || 0);
    const curPx = Number.isFinite(Number(livePx)) && Number(livePx) > 0 ? Number(livePx) : Number(hit.brokerPrice || avgOpen || 0);
    const sign = hit.side === 'SHORT' ? -1 : 1;
    const inv = Number(hit.invested ?? (units * avgOpen));
    const pnl = (hit.source === 'etoro_api' && hit.brokerPnl != null && Math.abs(curPx - Number(hit.brokerPrice || curPx)) < 1e-3)
      ? Number(hit.brokerPnl)
      : (units * (curPx - avgOpen) * sign);
    const netVal = Math.max(0, inv + pnl);
    const lots = Array.isArray(hit.lots) ? hit.lots : [];
    const validSls = lots.map(l => Number(l.sl)).filter(v => Number.isFinite(v) && v > 0);
    const minSl = validSls.length ? Math.min(...validSls) : (Number(hit.sl) > 0 ? Number(hit.sl) : null);
    const maxSl = validSls.length ? Math.max(...validSls) : minSl;
    const slTxt = minSl
      ? (maxSl && Math.abs(maxSl - minSl) > 1e-4 ? `$${fmt(minSl)}–$${fmt(maxSl)}` : `$${fmt(minSl)}`)
      : 'Fără SL';
    const refSl = minSl ? (sign > 0 ? maxSl : minSl) : null;
    const slDistPct = (refSl && curPx > 0) ? Math.abs(((curPx - refSl) / curPx) * 100) : null;
    const slDanger = slDistPct != null && slDistPct <= 5.5 ? 'dn' : '';
    const fmtCompactUsd = (v, sgn = false) => {
      const n = Number(v || 0);
      const prefix = sgn ? (n >= 0 ? '+$' : '-$') : (n < 0 ? '-$' : '$');
      return `${prefix}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 })}`;
    };
    return `
      <span class="pes-etoro-ico" title="Poziție live eToro" aria-label="eToro"><svg viewBox="0 0 24 24" width="15" height="15"><rect width="24" height="24" rx="5" fill="#13c636"/><path d="M16.6 13.6c-.5 1.8-2.2 3-4.3 3-2.6 0-4.6-2-4.6-4.6s2-4.6 4.6-4.6c2.5 0 4.4 1.8 4.4 4.4 0 .4 0 .7-.1 1H9.9c.2 1.3 1.2 2.1 2.5 2.1 1 0 1.8-.5 2.2-1.3h2zm-6.7-2.4h4.6c-.2-1.2-1-2-2.2-2-1.3 0-2.1.8-2.4 2z" fill="#ffffff"/><path d="M7.2 7.2c.6-1 1.6-1.7 2.8-1.9l.4 1.4c-.8.2-1.4.6-1.8 1.3L7.2 7.2zm9.6 0-1.4.8c-.4-.7-1-1.1-1.8-1.3l.4-1.4c1.2.2 2.2.9 2.8 1.9z" fill="#ffffff"/></svg></span>
      <span class="pes-val-pill" title="Valoare curentă netă în eToro">Val <b>${fmtCompactUsd(netVal)}</b></span>
      <span class="pes-item ${pnl >= 0 ? 'up' : 'dn'}" title="Profit / Pierdere curentă eToro">P&amp;L <b>${fmtCompactUsd(pnl, true)}</b></span>
      <span class="pes-sep">·</span>
      <span class="pes-item ${slDanger}" title="Stop-Loss eToro">SL <b>${slTxt}</b>${slDistPct != null ? ` <small>(−${slDistPct.toFixed(1)}%)</small>` : ''}</span>
    `;
  }

  function updatePaneEtoroStrip(el, sym, livePx) {
    if (!el) return;
    const html = buildPaneEtoroStripHtml(sym, livePx);
    if (html) {
      el.innerHTML = html;
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  }

  function refreshAllPaneEtoroStrips() {
    const priPx = state._lastTitlePrice || liveQuoteCache[state.symbol]?.price || state.bars?.[state.bars.length - 1]?.close;
    updatePaneEtoroStrip(document.getElementById('primaryPfStrip'), state.symbol, priPx);
    if (Array.isArray(secPanes)) {
      secPanes.forEach(p => {
        const el = document.getElementById(`secPfStrip${p.id}`);
        if (!el) return;
        const px = p._liveTitlePrice || liveQuoteCache[p.sym]?.price || p.bars?.[p.bars.length - 1]?.close;
        updatePaneEtoroStrip(el, p.sym, px);
      });
    }
  }

  function applySecondaryPaneQuoteUI(p, opts) {
    const { sym, priceHtml, regHtml, regPrice, regChg, regChgPct, extType, extPrice, extChg, extChgPct } = opts || {};
    if (!p) return;
    const spEl = document.getElementById(`secLivePrice${p.id}`);
    const scEl = document.getElementById(`secLiveChg${p.id}`);
    const extEl = document.getElementById(`secExtBadge${p.id}`);
    const hasExt = Boolean(extType && isFinite(extPrice));
    const hasSepReg = hasExt && isFinite(regPrice) && Math.abs(extPrice - regPrice) > Math.max(0.015, regPrice * 0.002);
    if (spEl) {
      spEl.innerHTML = (hasSepReg && regHtml) ? regHtml : (priceHtml || '—');
    }
    if (scEl) {
      if (isFinite(regChg)) {
        const refP = isFinite(regPrice) ? regPrice : extPrice;
        scEl.textContent = `${regChg >= 0 ? '+' : ''}${fmtChg(regChg, refP)}`;
        scEl.title = isFinite(regChgPct)
          ? `${regChg >= 0 ? '+' : ''}${fmtChg(regChg, refP)} (${regChgPct >= 0 ? '+' : ''}${regChgPct.toFixed(2)}%)`
          : '';
        scEl.className = `sec-live-chg tabular ${regChg >= 0 ? 'up' : 'dn'}`;
      } else {
        scEl.textContent = '—';
        scEl.title = '';
        scEl.className = 'sec-live-chg tabular';
      }
    }
    updateExtendedSessionBadgeEl(extEl, {
      extType,
      extPrice,
      extChg,
      extPct: extChgPct,
      showPriceAlways: true
    });
    const effPx = hasExt ? extPrice : regPrice;
    const effPct = (hasExt && isFinite(extChgPct)) ? extChgPct : regChgPct;
    if (isFinite(effPx) && effPx > 0) p._liveTitlePrice = effPx;
    if (isFinite(effPct)) p._liveTitlePct = effPct;
    updatePaneEtoroStrip(document.getElementById(`secPfStrip${p.id}`), sym || p.sym, effPx);
    updateBrowserTabTitle();
  }

  function updateHeaderAndLegend(lastBar, prevBar, { allowPending = false } = {}) {
    renderChartIndicatorStackUI(document.getElementById('activeIndLegend'), state.indicators, state.hiddenIndicators, null);
    syncQuickTopbarIndBtns();
    syncAllPaneProfileTabs();

    const sym = state.symbol;
    const hasRenderedBars = !!(lastBar && state.renderedSymbol === sym);
    if (!hasRenderedBars && !allowPending) return;

    const prevClose = (hasRenderedBars && prevBar) ? prevBar.close : (hasRenderedBars ? lastBar.open : NaN);
    const barChg = hasRenderedBars ? (lastBar.close - prevClose) : NaN;
    const barChgPct = (hasRenderedBars && prevClose) ? (barChg / prevClose) * 100 : NaN;

    const lq = liveQuoteCache[sym];
    const fq = (fullQuoteCache[sym] && String(fullQuoteCache[sym].symbol || sym).toUpperCase() === sym)
      ? fullQuoteCache[sym]
      : null;
    const matchedQuote = (state.quote && (!state.quote.symbol || normalizeSymbol(state.quote.symbol) === sym))
      ? state.quote
      : fq;
    const matchedMeta = (state.meta && (!state.meta.symbol || normalizeSymbol(state.meta.symbol) === sym))
      ? state.meta
      : null;
    const wlMatch = state.watchlist.find(w => w.sym === sym);

    const lqMatchesBar = !!(hasRenderedBars && lq && isFinite(lq.price) && Math.abs(lq.price - lastBar.close) <= Math.max(0.01, lastBar.close * 0.0015));
    const mqMatchesBar = !!(hasRenderedBars && matchedQuote && isFinite(matchedQuote.regularMarketPrice) && Math.abs(matchedQuote.regularMarketPrice - lastBar.close) <= Math.max(0.01, lastBar.close * 0.0015));
    const refPrevClose = matchedQuote?.regularMarketPreviousClose ?? lq?.prevClose ?? matchedMeta?.chartPreviousClose ?? matchedMeta?.previousClose ?? null;

    let sessChg;
    let sessPct;
    if (state.compareSpec.startsWith('SPR:')) {
      sessChg = barChg;
      sessPct = barChgPct;
    } else if (!hasRenderedBars) {
      sessChg = (lq && isFinite(lq.chg))
        ? lq.chg
        : (matchedQuote && isFinite(matchedQuote.regularMarketChange) ? matchedQuote.regularMarketChange : (wlMatch && isFinite(wlMatch.regChg) ? wlMatch.regChg : NaN));
      sessPct = (lq && isFinite(lq.chgPct))
        ? lq.chgPct
        : (matchedQuote && isFinite(matchedQuote.regularMarketChangePercent) ? matchedQuote.regularMarketChangePercent : (wlMatch && isFinite(wlMatch.regChgPct) ? wlMatch.regChgPct : NaN));
    } else if (lqMatchesBar && isFinite(lq.chg)) {
      sessChg = lq.chg;
      sessPct = isFinite(lq.chgPct) ? lq.chgPct : (isFinite(refPrevClose) && refPrevClose > 0 ? ((lastBar.close - refPrevClose) / refPrevClose) * 100 : barChgPct);
    } else if (mqMatchesBar && isFinite(matchedQuote.regularMarketChange)) {
      sessChg = matchedQuote.regularMarketChange;
      sessPct = isFinite(matchedQuote.regularMarketChangePercent) ? matchedQuote.regularMarketChangePercent : (isFinite(refPrevClose) && refPrevClose > 0 ? ((lastBar.close - refPrevClose) / refPrevClose) * 100 : barChgPct);
    } else if (isFinite(refPrevClose) && refPrevClose > 0) {
      sessChg = lastBar.close - refPrevClose;
      sessPct = (sessChg / refPrevClose) * 100;
    } else {
      sessChg = (lq && isFinite(lq.chg))
        ? lq.chg
        : (matchedQuote && isFinite(matchedQuote.regularMarketChange) ? matchedQuote.regularMarketChange : barChg);
      sessPct = (lq && isFinite(lq.chgPct))
        ? lq.chgPct
        : (matchedQuote && isFinite(matchedQuote.regularMarketChangePercent) ? matchedQuote.regularMarketChangePercent : barChgPct);
    }
    const isUp = isFinite(sessPct) ? sessPct >= 0 : true;

    const dispTitle = state.compareSpec.startsWith('SPR:')
      ? `${sym} / ${state.compareSpec.slice(4)}`
      : sym;
    document.getElementById('curSymbolTitle').textContent = dispTitle;
    syncChartWatchlistBtn(sym);
    const ctTagMap = { range: 'RANGE', renko: 'RENKO', linebreak: '3LB', kagi: 'KAGI', volcandles: 'VOL' };
    const ctExtra = ctTagMap[state.chartType] ? ` · ${ctTagMap[state.chartType]}` : '';
    document.getElementById('curTfBadge').textContent = `${state.tf.toUpperCase()}${ctExtra}`;

    // Hero Live Price + Session Evolution Badge on Top-Left Header
    const pendingPrice = lq?.price ?? matchedQuote?.regularMarketPrice ?? wlMatch?.regPrice ?? wlMatch?.price;
    const activeHeroPrice = hasRenderedBars ? lastBar.close : pendingPrice;
    const prevP = hasRenderedBars ? state.prevChartPrice : null;
    const heroPriceEl = document.getElementById('curLivePriceHero');
    if (heroPriceEl) {
      if (hasRenderedBars) {
        heroPriceEl.innerHTML = (!state.compareSpec.startsWith('SPR:') && lq?.html && Math.abs((lq.price || 0) - lastBar.close) < 1e-4)
          ? lq.html
          : formatSplitTickHTML(prevP, lastBar.close, isUp ? 1 : -1);
      } else if (!state.compareSpec.startsWith('SPR:') && lq?.html) {
        heroPriceEl.innerHTML = lq.html;
      } else if (isFinite(pendingPrice) && pendingPrice > 0) {
        heroPriceEl.innerHTML = formatSplitTickHTML(null, pendingPrice, isUp ? 1 : -1);
      } else {
        heroPriceEl.textContent = '—';
      }
    }
    const extBadge = document.getElementById('curExtSessionBadge');
    let extCoversHero = false;
    let extChgVal = NaN;
    let extPctVal = NaN;
    if (extBadge) {
      const qExt = (!lq?.extType && matchedQuote) ? extractQuoteSessionInfo(matchedQuote) : null;
      const eType = lq?.extType || qExt?.extType || '';
      const ePrice = lq?.extPrice ?? qExt?.extPrice;
      const ePct = lq?.extChgPct ?? qExt?.extChgPct ?? 0;
      const eChg = lq?.extChg ?? qExt?.extChg;
      if (!state.compareSpec.startsWith('SPR:') && eType && isFinite(ePrice)) {
        const cmpClose = isFinite(activeHeroPrice) ? activeHeroPrice : ePrice;
        const sameAsHero = isFinite(activeHeroPrice) && Math.abs(ePrice - cmpClose) <= Math.max(0.015, cmpClose * 0.002);
        extCoversHero = sameAsHero;
        extChgVal = isFinite(eChg) ? eChg : (isFinite(prevClose) && prevClose > 0 && sameAsHero ? ePrice - prevClose : sessChg);
        extPctVal = ePct;
        updateExtendedSessionBadgeEl(extBadge, {
          extType: eType,
          extPrice: ePrice,
          extChg: extChgVal,
          extPct: ePct,
          sameAsHero
        });
      } else {
        updateExtendedSessionBadgeEl(extBadge, {});
      }
    }
    const sessBadge = document.getElementById('curSessionChgBadge');
    if (sessBadge) {
      const activeChg = extCoversHero ? extChgVal : sessChg;
      const activePct = extCoversHero ? extPctVal : sessPct;
      const refForFmt = isFinite(activeHeroPrice) ? activeHeroPrice : 10;
      if (!isFinite(activeChg)) {
        sessBadge.style.display = 'none';
      } else {
        const cleanSChg = Math.abs(activeChg) < 1e-6 ? 0 : activeChg;
        const cleanSPct = isFinite(activePct) ? (Math.abs(activePct) < 0.005 ? 0 : activePct) : 0;
        const sPctStr = cleanSPct.toFixed(2).replace(/^-0(\.0+)?$/, '0$1');
        sessBadge.textContent = `${cleanSChg >= 0 ? '+' : ''}${fmtChg(cleanSChg, refForFmt)}`;
        sessBadge.title = `Variație sesiune: ${cleanSChg >= 0 ? '+' : ''}${fmtChg(cleanSChg, refForFmt)} (${cleanSPct >= 0 ? '+' : ''}${sPctStr}%)`;
        sessBadge.className = `pill ${cleanSChg >= 0 ? 'pill-buy' : 'pill-sell'} tabular`;
        sessBadge.style.display = 'inline-flex';
      }
    }

    const cachedDesc = officialIdentityCache[sym]?.desc;
    const catDesc = SYMBOL_CATALOG.find(c => c.sym === sym)?.name;
    const wlDesc = (wlMatch?.name && wlMatch.name !== sym) ? wlMatch.name : '';
    const compName = matchedQuote?.longName || matchedQuote?.shortName || cachedDesc || catDesc || wlDesc || matchedMeta?.shortName || '';
    const subTxt = state.compareSpec.startsWith('OVR:')
      ? `${compName} · vs ${state.compareSpec.slice(4)}`
      : (compName && compName !== sym ? compName : '');
    document.getElementById('curCompanySub').textContent = subTxt;

    // Authentic Brand Logo with Multi-CDN Waterfall + Official TradingView SVG Upgrade (Zero Flicker on Live Ticks)
    const logoImg = document.getElementById('curLogo');
    const logoFb = document.getElementById('curLogoFallback');
    logoFb.textContent = getMonogram(sym);
    resolveOfficialIdentity(sym);
    if (logoImg.getAttribute('data-logosym') !== sym || !logoImg.getAttribute('src')) {
      const cands = getLogoCandidates(sym);
      if (cands.length > 0) {
        logoImg.style.display = 'none';
        logoFb.style.display = 'inline-flex';
        logoImg.setAttribute('data-logosym', sym);
        logoImg.setAttribute('data-fb', cands.slice(1).join('|'));
        logoImg.onload = () => { logoImg.style.display = 'block'; logoFb.style.display = 'none'; };
        logoImg.onerror = () => window.__tpLogoErr(logoImg);
        logoImg.src = cands[0];
      } else {
        logoImg.style.display = 'none';
        logoFb.style.display = 'inline-flex';
      }
    }

    // OHLCV Strip (full O/H/L/C on candle hover; compact Volume only when idle to avoid duplicating live price)
    if (hasRenderedBars) {
      setOHLCStrip(lastBar, barChg, barChgPct, false, false);
    } else {
      const strip = document.getElementById('ohlcStrip');
      if (strip) strip.innerHTML = '';
    }
    renderLiveEvolutionStrip();

    // Bid / Ask state sync (guarded if inline BUY/SELL buttons are hidden from chart overlay)
    const refPx = (lq?.extType && isFinite(lq?.extPrice)) ? lq.extPrice : activeHeroPrice;
    const baSellBtn = document.getElementById('baSellBtn');
    const baBuyBtn = document.getElementById('baBuyBtn');
    const baSellPrice = document.getElementById('baSellPrice');
    const baBuyPrice = document.getElementById('baBuyPrice');
    const baSpreadVal = document.getElementById('baSpreadVal');
    if (isFinite(refPx) && refPx > 0) {
      const spread = refPx > 100 ? refPx * 0.0002 : refPx * 0.0008;
      const rawBid = matchedQuote?.bid;
      const rawAsk = matchedQuote?.ask;
      const validL1Book = isFinite(rawBid) && isFinite(rawAsk) && rawBid > 0 && rawAsk >= rawBid && ((rawAsk - rawBid) / rawBid) <= 0.04;
      const bid = validL1Book ? rawBid : (refPx - spread / 2);
      const ask = validL1Book ? rawAsk : (refPx + spread / 2);
      const spreadTxt = fmtChg(Math.max(0.01, ask - bid), bid);
      if (baSellBtn) baSellBtn.title = `Ordin SHORT rapid @ ${fmt(bid)} (Spread ${spreadTxt})`;
      if (baBuyBtn) baBuyBtn.title = `Ordin BUY rapid @ ${fmt(ask)} (Spread ${spreadTxt})`;
      if (baSellPrice) baSellPrice.textContent = fmt(bid);
      if (baBuyPrice) baBuyPrice.textContent = fmt(ask);
      if (baSpreadVal) baSpreadVal.textContent = spreadTxt;
      const titlePrice = isFinite(activeHeroPrice) ? activeHeroPrice : refPx;
      const titlePct = (extCoversHero && isFinite(extPctVal)) ? extPctVal : sessPct;
      state._lastTitlePrice = titlePrice;
      state._lastTitlePct = titlePct;
      updatePaneEtoroStrip(document.getElementById('primaryPfStrip'), sym, titlePrice);
      updateBrowserTabTitle();
    } else {
      if (baSellPrice) baSellPrice.textContent = '—';
      if (baBuyPrice) baBuyPrice.textContent = '—';
      if (baSpreadVal) baSpreadVal.textContent = '—';
      state._lastTitlePrice = NaN;
      state._lastTitlePct = NaN;
      updatePaneEtoroStrip(document.getElementById('primaryPfStrip'), sym, NaN);
      updateBrowserTabTitle();
    }
    if (hasRenderedBars) {
      state.prevChartPrice = lastBar.close;
    }
  }

  function setOHLCStrip(bar, chg, chgPct, showChg = true, isHover = true) {
    const strip = document.getElementById('ohlcStrip');
    if (!strip || !bar) return;
    if (!isHover) {
      strip.innerHTML = bar.volume ? `<span class="ohlc-item">V <b>${fmtVol(bar.volume)}</b></span>` : '';
      return;
    }
    const cleanChg = (chg == null || !isFinite(chg) || Math.abs(chg) < 1e-6) ? 0 : chg;
    const cleanPct = (chgPct == null || !isFinite(chgPct) || Math.abs(chgPct) < 0.005) ? 0 : chgPct;
    const fmtStr = fmtChg(cleanChg, bar.close);
    const pctStr = cleanPct.toFixed(2).replace(/^-0(\.0+)?$/, '0$1');
    const col = cleanChg >= 0 ? 'var(--tv-green)' : 'var(--tv-red)';
    const chgSpan = showChg
      ? `<span style="color:${col};font-weight:800;">${cleanChg >= 0 ? '+' : ''}${fmtStr} (${cleanPct >= 0 ? '+' : ''}${pctStr}%)</span>`
      : '';
    strip.innerHTML = `
      <span class="ohlc-item">O <b>${fmt(bar.open)}</b></span>
      <span class="ohlc-item">H <b style="color:var(--tv-green)">${fmt(bar.high)}</b></span>
      <span class="ohlc-item">L <b style="color:var(--tv-red)">${fmt(bar.low)}</b></span>
      <span class="ohlc-item">C <b style="color:${col}">${fmt(bar.close)}</b></span>
      <span class="ohlc-item">V <b>${fmtVol(bar.volume)}</b></span>
      ${chgSpan}
    `;
  }

  function onCrosshairMove(param) {
    if (state.renderedSymbol !== state.symbol || !state.bars.length) return;
    if (!param || !param.point || !param.time) {
      if (state.bars.length >= 2) {
        const l = state.bars[state.bars.length - 1];
        const p = state.bars[state.bars.length - 2];
        setOHLCStrip(l, l.close - p.close, ((l.close - p.close) / p.close) * 100, false, false);
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
      setOHLCStrip(b, chg, p.close ? (chg / p.close) * 100 : 0, idx < state.bars.length - 1, true);
    }
  }

  // ─── 9. RIGHT SIDEBAR PANELS (SMART PLAN · TECHNICALS · FIB · FORECAST) ──
  function renderSmartPlanPanel(sigOut) {
    const cp = sigOut?.currentPlan;
    const hud = document.getElementById('smartHudCard');
    const panel = document.getElementById('smartTicketWrap');
    if (!cp) {
      if (hud) hud.innerHTML = '';
      return;
    }

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
      <span style="color:var(--border-strong);">·</span>
      <span class="tabular" style="color:var(--text-bright);font-weight:700;">${cp.score}</span>
    `;
    hud.title = `${shortVerdict} · Scor ${cp.score}/100 · Win Rate ${sigOut.stats.winRate}% (Click pentru detalii plan)`;
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
    const newsHtml = (idea.news || []).slice(0, 2).map(n => {
      const dtStr = formatNewsDateBadge(n, { compact: true });
      const pubTxt = dtStr ? `${n.publisher || 'Știri'} · ${dtStr}` : (n.publisher || 'Știri');
      return `
      <a class="ai-news-item" href="${escTg(n.link || '#')}" target="_blank" rel="noopener noreferrer" title="${escTg(pubTxt)}">
        <span class="ai-news-title">${escTg(n.title || '')}</span>
        <span class="ai-news-src">${escTg(pubTxt)}</span>
      </a>
    `;
    }).join('');

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
        <button class="sym-cat-btn ${isIndVisible('vpvr') ? 'active' : ''}" style="width:100%;padding:0 4px;" data-of-toggle="vpvr">VPVR</button>
        <button class="sym-cat-btn ${isIndVisible('tpo') ? 'active' : ''}" style="width:100%;padding:0 4px;" data-of-toggle="tpo">TPO</button>
        <button class="sym-cat-btn ${isIndVisible('footprint') ? 'active' : ''}" style="width:100%;padding:0 4px;" data-of-toggle="footprint">Proxy Δ (${imbCnt})</button>
      </div>
      <button id="openOrderFlowDockBtn" type="button" class="sym-cat-btn" style="width:100%;justify-content:center;font-size:10px;">
        Panou Order Flow L1 + Volume Profile →
      </button>
    `;
    box.querySelectorAll('[data-of-toggle]').forEach(b => {
      b.onclick = () => toggleIndicator(b.dataset.ofToggle, null);
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
      closeCopilotOverlay();
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
      setScopedItem('tp_ultra_portfolios_v1', JSON.stringify(state.portfolios));
      setScopedItem('tp_ultra_active_pf', state.activePortfolio);
      setScopedItem('tp_ultra_paper', JSON.stringify(state.paper));
    } catch (_) { }
  }

  function switchPortfolio(pfKey) {
    if (!state.portfolios[pfKey]) return;
    state.activePortfolio = pfKey;
    state.paper = state.portfolios[pfKey];
    setScopedItem('tp_ultra_active_pf', pfKey);
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
      setScopedItem('tp_ultra_journal', JSON.stringify(j.slice(0, 80)));
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
      if (p.sym === state.symbol && state.renderedSymbol === state.symbol && state.bars.length) {
        p.lastPrice = state.bars[state.bars.length - 1].close;
      }
      openPnl += (p.isBuy ? (p.lastPrice - p.entry) : (p.entry - p.lastPrice)) * p.qty;
    });

    if (summaryEl) {
      const eq = state.paper.balance + openPnl;
      summaryEl.innerHTML = `Echitate Live: <b>$${eq.toFixed(2)}</b> · P&L Deschis: <b class="${openPnl >= 0 ? 'up' : 'dn'}">${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)}</b> · P&L Realizat: <b class="${state.paper.closedPnl >= 0 ? 'up' : 'dn'}">${state.paper.closedPnl >= 0 ? '+' : ''}$${(state.paper.closedPnl || 0).toFixed(2)}</b>`;
    }

    if (!state.paper.positions.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-muted);">Nicio poziție Paper activă. Click-dreapta pe grafic -> "Simulează BUY" sau folosește butonul "Simulează în Paper".</td></tr>`;
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
      const clean = state.watchlist.map(w => ({ sym: w.sym, name: w.name, source: w.source }));
      setScopedItem('tp_ultra_watchlist_v4', JSON.stringify(clean));
      setScopedItem('tp_ultra_watchlist', JSON.stringify(clean));
      if (authState.user) updateAuthAccountUI();
    } catch (_) { }
  }

  function buildWatchlistExtSubHtml(extType, extPrice, extChg, extChgPct) {
    if (!extType || extPrice == null || !isFinite(extPrice)) return '';
    const extMeta = getExtSessionUiMeta(extType);
    const lbl = extMeta.short === 'Pre' ? 'Pre-Market' : (extMeta.short === 'Post' ? 'Post-Market' : 'Overnight');
    const c = Number(extChg) || 0;
    const p = Number(extChgPct) || 0;
    const cls = p >= 0 ? 'up' : 'dn';
    const sign = p >= 0 ? '+' : '';
    return `
      <span class="wl-ext-vals tabular" title="${lbl}: ${fmt(extPrice)} (${sign}${p.toFixed(2)}%)">
        <span class="wl-sess-ico ${extMeta.cls}">${extMeta.ico}</span>
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
      const extMeta = extType ? getExtSessionUiMeta(extType) : null;
      const sessCls = extMeta ? extMeta.cls : '';
      const sessTitle = extMeta ? extMeta.title : '';
      const sessSvg = extMeta ? extMeta.ico : '';

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
                  ${(authState.user && w.source === 'personal') ? '<span class="wl-src-badge" title="Simbol personal al contului">P</span>' : ''}
                  <span id="wlsess_${sid}" class="wl-sess-ico ${sessCls}" style="display:none;" title="${sessTitle}"></span>
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

  let etNowFmt = null;
  function isUsRegularMarketOpenNowET() {
    try {
      if (!etNowFmt) {
        etNowFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          weekday: 'short',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      const parts = etNowFmt.formatToParts(new Date());
      let wd = '', hh = 0, mm = 0;
      for (const p of parts) {
        if (p.type === 'weekday') wd = p.value;
        else if (p.type === 'hour') hh = parseInt(p.value, 10) % 24;
        else if (p.type === 'minute') mm = parseInt(p.value, 10);
      }
      if (wd === 'Sat' || wd === 'Sun') return false;
      const mins = hh * 60 + mm;
      return mins >= 570 && mins < 960;
    } catch (_) {
      return false;
    }
  }

  // Unified Real-Time Tick Processor (called by Yahoo WS, Binance WS, and 1.2s Quote Stream)
  function applyLiveTick(rawSym, liveP, meta = {}) {
    if (!rawSym || liveP == null || !isFinite(liveP) || liveP <= 0) return;
    const sym = String(rawSym).toUpperCase();

    const prevEntry = liveQuoteCache[sym];
    const is24h = sym.endsWith('-USD') || sym.endsWith('=X') || sym.endsWith('=F');
    const inferredRegular = meta.marketHours === 1 && !is24h && !sym.includes('.') && isUsRegularMarketOpenNowET();
    let mktState = inferredRegular ? 'REGULAR' : (meta.mktState || prevEntry?.mktState || '');

    // Guard against Yahoo WebSocket replaying stale closing / regular-hours prints during Pre-Market, Post-Market or Overnight
    const isYahooWsTick = meta.extType === undefined && !is24h;
    const wsNowSec = Math.floor(Date.now() / 1000);
    const wsTimeSec = isYahooWsTick ? toEpochSec(meta.time) : 0;
    const wsStaleAge = wsTimeSec > 0 ? Math.abs(wsNowSec - wsTimeSec) : 0;
    if (isYahooWsTick) {
      if (wsTimeSec > 0 && wsStaleAge > 180) return;
      const regularMismatch = meta.marketHours === 1 && !inferredRegular && (mktState ? mktState !== 'REGULAR' : (!sym.includes('.') && !isUsRegularMarketOpenNowET()));
      if (regularMismatch) return;
      if (!mktState && meta.marketHours === 1) mktState = 'REGULAR';
    }

    const dot = document.getElementById('mktSessionDot');
    if (dot && !dot.classList.contains('ping')) {
      dot.classList.add('ping');
      setTimeout(() => dot.classList.remove('ping'), 240);
    }

    // Separate Regular Session vs Pre-Market / Post-Market Extended Session cleanly
    let regPrice = meta.regPrice ?? prevEntry?.regPrice ?? liveP;
    const prevClose = meta.prevClose ?? prevEntry?.prevClose ?? (meta.regChg != null ? regPrice - meta.regChg : (meta.chg != null ? liveP - meta.chg : null));
    let regChg = meta.regChg != null ? meta.regChg : (prevEntry?.regChg != null && meta.extType === undefined && prevEntry?.extType ? prevEntry.regChg : (meta.chg != null ? meta.chg : (prevClose ? regPrice - prevClose : (prevEntry?.chg ?? 0))));
    let regChgPct = meta.regChgPct != null ? meta.regChgPct : (prevEntry?.regChgPct != null && meta.extType === undefined && prevEntry?.extType ? prevEntry.regChgPct : (meta.chgPct != null ? meta.chgPct : (prevClose ? ((regPrice - prevClose) / prevClose) * 100 : (prevEntry?.chgPct ?? 0))));

    const tvSess = meta.tvCurrentSession !== undefined ? meta.tvCurrentSession : (prevEntry?.tvCurrentSession || '');
    let extType = meta.extType !== undefined ? meta.extType : (prevEntry?.extType || '');
    let extPrice = meta.extPrice !== undefined ? meta.extPrice : (prevEntry?.extPrice ?? null);
    let extChg = meta.extChg !== undefined ? meta.extChg : (prevEntry?.extChg ?? null);
    let extChgPct = meta.extChgPct !== undefined ? meta.extChgPct : (prevEntry?.extChgPct ?? null);
    let extTime = meta.extTime !== undefined ? meta.extTime : (prevEntry?.extTime ?? null);
    let wsExtTs = prevEntry?.wsExtTs || 0;

    // Route verified fresh extended-hours WebSocket prints (marketHours !== 1 & fresh <= 180s) to Extended Price
    if (isYahooWsTick && extType && mktState !== 'REGULAR' && tvSess !== 'night' && meta.marketHours !== 1 && wsTimeSec > 0 && wsStaleAge <= 180) {
      extPrice = liveP;
      extChg = isFinite(regPrice) ? liveP - regPrice : 0;
      extChgPct = (isFinite(regPrice) && regPrice) ? (extChg / regPrice) * 100 : 0;
      extTime = wsNowSec;
      wsExtTs = wsNowSec;
    } else if (meta.extType !== undefined && wsExtTs > 0 && !is24h && mktState !== 'REGULAR' && tvSess !== 'night' && extType === prevEntry?.extType && prevEntry?.extPrice != null) {
      const httpExtTs = toEpochSec(meta.extTime);
      if (httpExtTs + 12 < wsExtTs) {
        extPrice = prevEntry.extPrice;
        extChg = prevEntry.extChg;
        extChgPct = prevEntry.extChgPct;
        extTime = prevEntry.extTime;
      } else {
        wsExtTs = 0;
      }
    } else if (mktState === 'REGULAR' || is24h) {
      regPrice = liveP;
      regChg = meta.chg != null ? meta.chg : (prevClose ? liveP - prevClose : regChg);
      regChgPct = meta.chgPct != null ? meta.chgPct : (prevClose ? ((liveP - prevClose) / prevClose) * 100 : regChgPct);
      extType = '';
      extPrice = null;
      extChg = null;
      extChgPct = null;
      extTime = null;
      wsExtTs = 0;
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
      tvCurrentSession: tvSess,
      extType,
      extPrice,
      extChg,
      extChgPct,
      extTime,
      wsExtTs,
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
        se.style.display = 'none';
        se.innerHTML = '';
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

    // Determine whether this tick is actively trading for chart candles (includes Pre/Post & Overnight BOATS)
    const isExtActive = !is24h && mktState !== 'REGULAR' && !!extType && isFinite(extPrice) && (
      mktState === 'PRE' || mktState === 'POST' || tvSess === 'night' || tvSess === 'pre_market' || tvSess === 'post_market'
    );
    const canStreamCandle = is24h
      || mktState === 'REGULAR'
      || (state.extHours && isExtActive);
    const candleLiveP = (state.extHours && isExtActive)
      ? extPrice
      : regPrice;

    // 3. Update any active Secondary Multi-Chart Panes showing this symbol
    if (state.layout !== '1') {
      secPanes.forEach(p => {
        if (p.sym === sym) {
          if (p._renderedSym === sym && p.candle && p.bars && p.bars.length > 0) {
            const pStep = getTfStepSeconds(p.tf);
            const pSubDay = pStep > 0 && pStep < 86400;
            if (canStreamCandle && (pSubDay || mktState === 'REGULAR' || is24h)) {
              const nearEdge = isChartNearLiveEdge(p.chart, p.bars.length);
              const lb = p.bars[p.bars.length - 1];
              const nowSec = Math.floor(Date.now() / 1000);
              const pBucket = pSubDay ? Math.floor(nowSec / pStep) * stepSecSafe(pStep) : lb.time;
              if (pSubDay && pBucket > lb.time && hasTickDiff) {
                const nb = { time: pBucket, open: lb.close, high: Math.max(lb.close, candleLiveP), low: Math.min(lb.close, candleLiveP), close: candleLiveP, volume: 0 };
                p.bars.push(nb);
                try { p.candle.update(nb); } catch (_) { }
                if (isPaneIndVisible(p, 'vol') && p.volSeries) {
                  try {
                    p.volSeries.update({
                      time: pBucket,
                      value: 0,
                      color: nb.close >= nb.open ? 'rgba(8, 153, 129, 0.20)' : 'rgba(242, 54, 69, 0.20)'
                    });
                  } catch (_) { }
                }
                if (nearEdge && p.chart) {
                  try {
                    const r = p.chart.timeScale().getVisibleLogicalRange();
                    if (r) p.chart.timeScale().setVisibleLogicalRange({ from: r.from + 1, to: r.to + 1 });
                  } catch (_) { }
                }
                if (p.overlay) p.overlay.requestRender();
              } else if (Math.abs(candleLiveP - lb.close) > 1e-9) {
                lb.close = candleLiveP;
                if (candleLiveP > lb.high) lb.high = candleLiveP;
                if (candleLiveP < lb.low) lb.low = candleLiveP;
                try { p.candle.update({ time: lb.time, open: lb.open, high: lb.high, low: lb.low, close: lb.close }); } catch (_) { }
                if (isPaneIndVisible(p, 'vol') && p.volSeries) {
                  try {
                    p.volSeries.update({
                      time: lb.time,
                      value: lb.volume || 0,
                      color: lb.close >= lb.open ? 'rgba(8, 153, 129, 0.20)' : 'rgba(242, 54, 69, 0.20)'
                    });
                  } catch (_) { }
                }
                if (p.overlay) p.overlay.requestRender();
              }
            }
          }
          applySecondaryPaneQuoteUI(p, {
            sym,
            priceHtml: splitHtml,
            regHtml,
            regPrice,
            regChg,
            regChgPct,
            extType,
            extPrice,
            extChg,
            extChgPct
          });
        }
      });
    }

    // 4. Update Right Details Widget if this is the focused symbol
    if (sym === getActiveFocusedSymbol()) {
      const cachedFull = fullQuoteCache[sym];
      if (cachedFull && String(cachedFull.symbol || sym).toUpperCase() === sym) {
        if (tvSess) cachedFull.tvCurrentSession = tvSess;
        if (extType === 'PRE' && isFinite(extPrice)) {
          cachedFull.preMarketPrice = extPrice;
          cachedFull.preMarketChange = extChg;
          cachedFull.preMarketChangePercent = extChgPct;
        } else if (extType === 'OVN' && isFinite(extPrice)) {
          cachedFull.overnightPrice = extPrice;
          cachedFull.overnightChange = extChg;
          cachedFull.overnightChangePercent = extChgPct;
          if (extTime) cachedFull.overnightTime = extTime;
        } else if (extType === 'POST' && isFinite(extPrice)) {
          cachedFull.postMarketPrice = extPrice;
          cachedFull.postMarketChange = extChg;
          cachedFull.postMarketChangePercent = extChgPct;
        }
        updateDetailsWidget(cachedFull, sym);
      } else {
        const paneMatch = getPaneStateIfRendered(sym);
        syncDetailsWidgetForSymbol(sym, paneMatch);
      }
    }

    // 5. Update Primary Superchart Candle, Volume Bar, Bid/Ask & Y-Axis Countdown Live
    if (sym === state.symbol && sym === state.renderedSymbol && !state.replay.active && state.bars.length > 0 && !state.compareSpec.startsWith('SPR:')) {
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
        } else if (stepSec > 0 && stepSec < 86400 && !nonTimeChart && (hasTickDiff || isExtActive || mktState === 'REGULAR' || is24h)) {
          const tickSec = (!is24h && mktState !== 'REGULAR' && extTime) ? toEpochSec(extTime) : nowSec;
          const freshTick = is24h || mktState === 'REGULAR' || !tickSec || Math.abs(nowSec - tickSec) < 3600;
          const bucketSec = Math.floor((tickSec || nowSec) / stepSec) * stepSec;
          if (freshTick && bucketSec > last.time) {
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
            if (isIndVisible('vol') && volSeries) {
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
            if (isIndVisible('vol') && volSeries) {
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
    } else if (sym === state.symbol && state.renderedSymbol !== sym) {
      updateHeaderAndLegend(null, null, { allowPending: true });
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
          else if (field === 7) out.marketHours = Number(valBig);
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

  let bgChartSyncBusy = false;

  async function syncActiveChartBarsBackground() {
    if (bgChartSyncBusy || document.hidden || state.replay.active) return;
    const sym = state.symbol;
    const tf = String(state.tf || '1d');
    const step = getTfStepSeconds(tf);
    const isIntraday = (step > 0 && step < 86400) || /^\d+[st]$/.test(tf.toLowerCase());
    if (!sym || state.renderedSymbol !== sym || !isIntraday || !state.rawFetchedBars?.length) return;

    bgChartSyncBusy = true;
    try {
      const { bars, meta, demo } = await fetchOHLCV(sym, tf);
      if (demo || !bars || bars.length < 5) return;
      if (state.symbol !== sym || state.renderedSymbol !== sym || String(state.tf) !== tf || state.replay.active) return;

      const prevRaw = state.rawFetchedBars;
      const prevLast = prevRaw[prevRaw.length - 1];
      const newLast = bars[bars.length - 1];
      if (!prevLast || !newLast) return;

      const isDerived = state.compareSpec.startsWith('SPR:')
        || ['range', 'renko', 'linebreak', 'kagi', 'volcandles', 'heikin'].includes(state.chartType);

      // Fast path inside active candle: update OHLCV in-place without setData() or resetting user zoom
      if (bars.length === prevRaw.length && newLast.time === prevLast.time && !isDerived) {
        const mergedVol = Math.max(prevLast.volume || 0, newLast.volume || 0);
        const mergedHi = Math.max(prevLast.high, newLast.high);
        const mergedLo = Math.min(prevLast.low, newLast.low);
        const volChanged = mergedVol !== (prevLast.volume || 0);
        const rangeExpanded = mergedHi > prevLast.high || mergedLo < prevLast.low;
        if (volChanged || rangeExpanded) {
          prevLast.high = mergedHi;
          prevLast.low = mergedLo;
          prevLast.volume = mergedVol;
          const dispLast = state.bars[state.bars.length - 1];
          if (dispLast && dispLast.time === prevLast.time) {
            dispLast.high = mergedHi;
            dispLast.low = mergedLo;
            dispLast.volume = mergedVol;
            try {
              if (state.chartType === 'area' || state.chartType === 'line' || state.chartType === 'baseline') {
                mainSeries.update({ time: dispLast.time, value: dispLast.close });
              } else {
                mainSeries.update({ time: dispLast.time, open: dispLast.open, high: dispLast.high, low: dispLast.low, close: dispLast.close });
              }
              if (isIndVisible('vol') && volSeries) {
                volSeries.update({ time: dispLast.time, value: dispLast.volume || 0, color: dispLast.close >= dispLast.open ? 'rgba(8, 153, 129, 0.20)' : 'rgba(242, 54, 69, 0.20)' });
              }
            } catch (_) { }
          }
        }
        return;
      }

      // Never shrink/drop a locally streamed bar if a cached HTTP poll lags behind
      if (bars.length < prevRaw.length && newLast.time < prevLast.time) return;
      if (bars.length === prevRaw.length && newLast.time === prevLast.time && (newLast.volume || 0) === (prevLast.volume || 0) && Math.abs(prevLast.close - newLast.close) < 1e-6) {
        return;
      }

      const prevDisplayLen = state.bars.length;
      const prevRange = mainChart ? mainChart.timeScale().getVisibleLogicalRange() : null;
      const wasNearEdge = isChartNearLiveEdge(mainChart, prevDisplayLen);

      state.rawFetchedBars = bars;
      state.meta = meta;
      state.fullBars = buildEffectiveFullBars();
      state.bars = [...state.fullBars];
      renderChartAndQuant(false);

      if (mainChart && state.bars.length > 0 && prevRange) {
        try {
          const delta = state.bars.length - prevDisplayLen;
          if (wasNearEdge && delta !== 0) {
            mainChart.timeScale().setVisibleLogicalRange({
              from: prevRange.from + delta,
              to: prevRange.to + delta
            });
          } else {
            mainChart.timeScale().setVisibleLogicalRange(prevRange);
          }
        } catch (_) { }
      }
    } catch (_) {
    } finally {
      bgChartSyncBusy = false;
    }
  }

  const liveQuoteQueue = new Set();

  async function refreshLiveQuotes({ prioritySyms = [] } = {}) {
    (Array.isArray(prioritySyms) ? prioritySyms : [prioritySyms]).forEach(s => {
      const clean = normalizeSymbol(s);
      if (clean) liveQuoteQueue.add(clean);
    });
    if (liveQuoteBusy) return;
    liveQuoteBusy = true;
    try {
      const queuedPriority = Array.from(liveQuoteQueue);
      liveQuoteQueue.clear();
      const focusStartSym = getActiveFocusedSymbol();
      const syms = Array.from(new Set([
        focusStartSym,
        ...queuedPriority,
        state.symbol,
        ...getSubscribedSymbolsList()
      ])).filter(Boolean);
      const map = await fetchBatchQuotes(syms);
      let namesEnriched = false;
      const prevPrimaryExt = liveQuoteCache[state.symbol]?.extPrice;
      const prevPrimaryExtType = liveQuoteCache[state.symbol]?.extType;
      const prevSessionKey = `${liveQuoteCache[state.symbol]?.mktState || ''}:${liveQuoteCache[state.symbol]?.extType || ''}:${liveQuoteCache[state.symbol]?.tvCurrentSession || ''}`;

      Object.keys(map).forEach(k => {
        const q = map[k];
        if (!q) return;
        const normKey = String(q.symbol || k).toUpperCase();
        fullQuoteCache[normKey] = q;
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

        try {
          applyLiveTick(k, activePrice, {
            mktState: sInfo.mktState,
            tvCurrentSession: sInfo.tvCurrentSession,
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
        } catch (tickErr) {
          console.warn('[Quote] Tick err for', k, tickErr?.message || tickErr);
        }
      });

      if (namesEnriched) saveWatchlist();

      const focusSym = getActiveFocusedSymbol();
      const rawFocusQ = map[focusSym] || fullQuoteCache[focusSym];
      const focusQ = (rawFocusQ && String(rawFocusQ.symbol || focusSym).toUpperCase() === focusSym) ? rawFocusQ : null;
      if (map[state.symbol] && String(map[state.symbol].symbol || state.symbol).toUpperCase() === state.symbol) {
        state.quote = map[state.symbol];
      }
      if (focusQ) {
        updateDetailsWidget(focusQ, focusSym);
      } else {
        const paneMatch = getPaneStateIfRendered(focusSym);
        syncDetailsWidgetForSymbol(focusSym, paneMatch);
      }

      // Refresh Y-axis Pre/Overnight/Post reference line when extended price updates
      const newPrimaryExt = liveQuoteCache[state.symbol]?.extPrice;
      const newPrimaryExtType = liveQuoteCache[state.symbol]?.extType;
      if ((newPrimaryExt !== prevPrimaryExt || newPrimaryExtType !== prevPrimaryExtType) && state.renderedSymbol === state.symbol && state.bars.length > 0) {
        drawAxisPriceLines(state.bars);
      }

      const newSessionKey = `${liveQuoteCache[state.symbol]?.mktState || ''}:${liveQuoteCache[state.symbol]?.extType || ''}:${liveQuoteCache[state.symbol]?.tvCurrentSession || ''}`;
      if (prevSessionKey !== '::' && newSessionKey !== prevSessionKey && state.renderedSymbol === state.symbol) {
        syncActiveChartBarsBackground();
      }

      const evalPrice = liveQuoteCache[state.symbol]?.price ?? map[state.symbol]?.regularMarketPrice ?? (state.renderedSymbol === state.symbol && state.bars.length ? state.bars[state.bars.length - 1].close : NaN);
      evaluateAlerts(evalPrice, map);
    } finally {
      liveQuoteBusy = false;
      if (liveQuoteQueue.size > 0) {
        setTimeout(() => refreshLiveQuotes(), 40);
      }
    }
  }

  function buildInstantQuoteFromBars(sym, meta, bars) {
    const cleanSym = String(sym || '').toUpperCase();
    if (!cleanSym || !Array.isArray(bars) || !bars.length) return null;
    const lastB = bars[bars.length - 1];
    const prevB = bars[bars.length - 2] || lastB;
    const regRef = meta?.regularMarketPrice ?? lastB.close;
    const pClose = meta?.chartPreviousClose ?? prevB.close;
    const chg = regRef - pClose;
    const chgPct = pClose ? (chg / pClose) * 100 : 0;
    const cachedDesc = officialIdentityCache[cleanSym]?.desc;
    const catDesc = SYMBOL_CATALOG.find(c => c.sym === cleanSym)?.name;
    const resolvedName = meta?.longName || meta?.shortName || cachedDesc || catDesc || cleanSym;
    return {
      symbol: cleanSym,
      shortName: resolvedName,
      longName: meta?.longName || resolvedName,
      fullExchangeName: meta?.fullExchangeName || meta?.exchangeName || '',
      currency: meta?.currency || 'USD',
      marketState: meta?.marketState || '',
      regularMarketPrice: regRef,
      regularMarketPreviousClose: pClose,
      regularMarketTime: meta?.regularMarketTime,
      regularMarketChange: chg,
      regularMarketChangePercent: chgPct,
      regularMarketDayLow: meta?.regularMarketDayLow ?? Math.min(lastB.low, lastB.close),
      regularMarketDayHigh: meta?.regularMarketDayHigh ?? Math.max(lastB.high, lastB.close),
      fiftyTwoWeekLow: meta?.fiftyTwoWeekLow,
      fiftyTwoWeekHigh: meta?.fiftyTwoWeekHigh,
      regularMarketVolume: meta?.regularMarketVolume ?? lastB.volume,
      preMarketPrice: meta?.preMarketPrice,
      postMarketPrice: meta?.postMarketPrice,
      overnightPrice: meta?.overnightPrice
    };
  }

  function getPaneStateIfRendered(targetSym) {
    const clean = String(targetSym || '').toUpperCase();
    if (!clean) return {};
    if (state.symbol === clean && state.renderedSymbol === clean && state.bars?.length) {
      return { bars: state.bars, meta: state.meta };
    }
    const secHit = secPanes.find(p => p.sym === clean && p._renderedSym === clean && p.bars?.length);
    if (secHit) {
      return { bars: secHit.bars, meta: secHit.meta };
    }
    return {};
  }

  function syncDetailsWidgetForSymbol(rawSym, { bars = null, meta = null } = {}) {
    const dispSym = normalizeSymbol(rawSym);
    if (!dispSym) return;
    const fq = fullQuoteCache[dispSym];
    if (fq && String(fq.symbol || dispSym).toUpperCase() === dispSym) {
      updateDetailsWidget(fq, dispSym);
      return;
    }
    if (Array.isArray(bars) && bars.length > 0 && (!meta?.symbol || normalizeSymbol(meta.symbol) === dispSym)) {
      const iq = buildInstantQuoteFromBars(dispSym, meta, bars);
      if (iq) {
        updateDetailsWidget(iq, dispSym);
        return;
      }
    }

    // Clear stale DOM fields from the previous symbol immediately while loading
    const lq = liveQuoteCache[dispSym];
    const cachedId = officialIdentityCache[dispSym];
    const catHit = SYMBOL_CATALOG.find(c => c.sym === dispSym);
    const wlHit = state.watchlist.find(w => w.sym === dispSym);
    const cleanExch = cachedId?.exch || catHit?.exch || (dispSym.endsWith('-USD') ? 'CRYPTO' : 'US');
    const nm = cachedId?.desc || catHit?.name || (wlHit?.name && wlHit.name !== dispSym ? wlHit.name : dispSym);

    const titleEl = document.getElementById('dwSymTitle');
    if (titleEl) titleEl.textContent = dispSym;
    setElementLogoAvatar('dwLogoBox', dispSym, '');
    const exchEl = document.getElementById('dwExchBadge');
    if (exchEl) exchEl.textContent = cleanExch;
    const compSubEl = document.getElementById('dwCompanySub');
    if (compSubEl) compSubEl.textContent = `${nm} · ${cleanExch}`;

    const regPrice = lq?.regPrice;
    const regChg = lq?.regChg;
    const regPct = lq?.regChgPct;
    const priceBigEl = document.getElementById('dwPriceBig');
    if (priceBigEl) priceBigEl.innerHTML = lq?.regHtml || (regPrice != null ? fmt(regPrice) : '—');
    const ccyEl = document.getElementById('dwCcyLbl');
    if (ccyEl) ccyEl.textContent = 'USD';
    const regChgEl = document.getElementById('dwRegChgVal');
    if (regChgEl) {
      regChgEl.textContent = isFinite(regChg) ? `${regChg >= 0 ? '+' : ''}${fmtChg(regChg, regPrice)}` : '—';
      regChgEl.className = `tabular dw-chg-val ${isFinite(regChg) ? (regChg >= 0 ? 'up' : 'dn') : ''}`;
    }
    const chgEl = document.getElementById('dwChgBadge');
    if (chgEl) {
      if (isFinite(regPct)) {
        chgEl.textContent = `${regPct >= 0 ? '+' : ''}${regPct.toFixed(2)}%`;
        chgEl.className = `pill ${regPct >= 0 ? 'pill-buy' : 'pill-sell'} tabular`;
      } else {
        chgEl.textContent = '—';
        chgEl.className = 'pill tabular';
      }
    }
    const regTimeEl = document.getElementById('dwRegTimeSub');
    if (regTimeEl) regTimeEl.textContent = 'Actualizare cotație live...';
    const extEl = document.getElementById('dwExtInfo');
    if (extEl) extEl.style.display = 'none';
    const baRow = document.getElementById('dwBidAskRow');
    if (baRow) baRow.style.display = 'none';
    const volEl = document.getElementById('dwVolVal');
    if (volEl) volEl.textContent = lq?.dayVol > 0 ? fmtVol(lq.dayVol) : '—';
    const avgVolEl = document.getElementById('dwAvgVolVal');
    if (avgVolEl) avgVolEl.textContent = '—';
    const dayLbl = document.getElementById('dwDayRangeLbl');
    if (dayLbl) dayLbl.textContent = '—';
    const dayFill = document.getElementById('dwDayRangeFill');
    if (dayFill) dayFill.style.width = '0%';
    const w52Lbl = document.getElementById('dw52wRangeLbl');
    if (w52Lbl) w52Lbl.textContent = '—';
    const w52Fill = document.getElementById('dw52wRangeFill');
    if (w52Fill) w52Fill.style.width = '0%';
    renderDetailsPortfolioBox(dispSym, regPrice, lq?.regChg);
  }

  function renderDetailsPortfolioBox(sym, livePx, dayChgPerShare) {
    const box = document.getElementById('dwPortfolioBox');
    if (!box) return;
    const pf = authState.realPortfolio;
    const assets = Array.isArray(pf?.assets) ? pf.assets : [];
    const upper = String(sym || '').toUpperCase().replace(/\.(24-7|24-5)$/i, '');
    const hit = assets.find(a => {
      const aSym = String(a.sym || '').toUpperCase();
      const bSym = String(a.brokerSym || '').toUpperCase().replace(/\.(24-7|24-5)$/i, '');
      return aSym === upper || bSym === upper || String(a.brokerSym || '').toUpperCase() === String(sym || '').toUpperCase();
    });
    if (!hit) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    const units = Number(hit.units || 0);
    const avgOpen = Number(hit.avgOpen || 0);
    const curPx = Number.isFinite(Number(livePx)) && Number(livePx) > 0 ? Number(livePx) : Number(hit.brokerPrice || avgOpen || 0);
    const sign = hit.side === 'SHORT' ? -1 : 1;
    const inv = Number(hit.invested ?? (units * avgOpen));
    const pnl = (hit.source === 'etoro_api' && hit.brokerPnl != null && Math.abs(curPx - Number(hit.brokerPrice || curPx)) < 1e-3)
      ? Number(hit.brokerPnl)
      : (units * (curPx - avgOpen) * sign);
    const netVal = Math.max(0, inv + pnl);
    const pnlPct = inv > 0 ? (pnl / inv) * 100 : 0;
    const dChg = Number.isFinite(Number(dayChgPerShare)) ? Number(dayChgPerShare) : 0;
    const dailyPnl = units * dChg * sign;
    const lots = Array.isArray(hit.lots) ? hit.lots : [];
    const firstSl = lots.find(l => l.sl != null && Number(l.sl) > 0)?.sl ?? hit.sl ?? null;
    const firstTp = lots.find(l => l.tp != null && Number(l.tp) > 0)?.tp ?? hit.tp ?? null;
    const slDistPct = (firstSl && curPx > 0) ? Math.abs(((curPx - Number(firstSl)) / curPx) * 100) : null;
    const fmtUsd = (v, sgn = false) => {
      const n = Number(v || 0);
      const prefix = sgn ? (n >= 0 ? '+$' : '-$') : (n < 0 ? '-$' : '$');
      return `${prefix}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    box.style.display = 'block';
    box.innerHTML = `
      <div class="dw-pf-hdr">
        <span>Poziție Portofoliu (${lots.length || 1} loturi · ${hit.isCfd ? 'CFD' : 'SPOT'})</span>
        <span class="tabular">${units.toLocaleString('en-US', { maximumFractionDigits: 2 })} u @ $${fmt(avgOpen)}</span>
      </div>
      <div class="dw-pf-grid">
        <div class="dw-pf-cell">
          <div class="k">Valoare Totală (Net)</div>
          <div class="v tabular">${fmtUsd(netVal)} <small>/ ${fmtUsd(inv)}</small></div>
        </div>
        <div class="dw-pf-cell r">
          <div class="k">P/L Total</div>
          <div class="v tabular ${pnl >= 0 ? 'up' : 'dn'}">${fmtUsd(pnl, true)} <small>(${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</small></div>
        </div>
        <div class="dw-pf-cell">
          <div class="k">Daily P/L (Azi)</div>
          <div class="v tabular ${dailyPnl >= 0 ? 'up' : 'dn'}">${fmtUsd(dailyPnl, true)}</div>
        </div>
        <div class="dw-pf-cell r">
          <div class="k">Stop-Loss / TP</div>
          <div class="v tabular ${slDistPct != null && slDistPct <= 5.5 ? 'dn' : ''}">
            ${firstSl ? `SL $${fmt(Number(firstSl))}${slDistPct != null ? ` (−${slDistPct.toFixed(1)}%)` : ''}` : 'Fără SL'}${firstTp ? ` <small>· TP $${fmt(Number(firstTp))}</small>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function updateDetailsWidget(q, symOverride = null) {
    if (!q) return;
    const dispSym = String(symOverride || q.symbol || state.symbol).toUpperCase();
    if (q.symbol && String(q.symbol).toUpperCase() !== dispSym) {
      syncDetailsWidgetForSymbol(dispSym);
      return;
    }
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
      } else if (sInfo?.mktState === 'PREPRE') {
        if (sInfo?.extType === 'OVN') {
          regTimeEl.textContent = regClk ? `Închis (${regClk}) · Overnight BOATS activ (Pre-Market 11:00 RO)` : 'Overnight BOATS activ · Pre-Market 11:00 RO';
        } else {
          regTimeEl.textContent = regClk ? `Închis (${regClk}) · Pre-Market SUA începe la 11:00 RO` : 'Pre-Market SUA începe la 11:00 RO';
        }
      } else {
        regTimeEl.textContent = regClk ? `Închidere sesiune regulară la ${regClk}` : 'Închidere sesiune regulară';
      }
    }

    // Pre-Market / Overnight BOATS / Post-Market Live Card Block (Authentic TradingView Layout)
    const extEl = document.getElementById('dwExtInfo');
    const extType = lq?.extType || sInfo?.extType || '';
    const extPrice = lq?.extPrice ?? sInfo?.extPrice;
    const extChg = lq?.extChg ?? sInfo?.extChg ?? 0;
    const extPct = lq?.extChgPct ?? sInfo?.extChgPct ?? 0;
    const extTime = lq?.extTime || sInfo?.extTime;

    if (extEl) {
      if (extType && extPrice != null && isFinite(extPrice)) {
        const extMeta = getExtSessionUiMeta(extType);
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
          <div class="dw-ext-status ${extMeta.cls}">
            ${extMeta.ico}
            <span>${extMeta.label}</span>
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
      const validBook = bidVal > 0 && askVal > 0 && isFinite(bidVal) && isFinite(askVal) && ((askVal - bidVal) / bidVal) <= 0.06;
      if (validBook) {
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

    const dayLbl = document.getElementById('dwDayRangeLbl');
    const dayFill = document.getElementById('dwDayRangeFill');
    if (q.regularMarketDayLow && q.regularMarketDayHigh && q.regularMarketDayHigh > q.regularMarketDayLow) {
      if (dayLbl) dayLbl.textContent = `${fmt(q.regularMarketDayLow)} – ${fmt(q.regularMarketDayHigh)}`;
      const pct = Math.max(0, Math.min(100, (((regPrice || q.regularMarketPrice) - q.regularMarketDayLow) / (q.regularMarketDayHigh - q.regularMarketDayLow)) * 100));
      if (dayFill) dayFill.style.width = `${pct}%`;
    } else {
      if (dayLbl) dayLbl.textContent = '—';
      if (dayFill) dayFill.style.width = '0%';
    }
    const w52Lbl = document.getElementById('dw52wRangeLbl');
    const w52Fill = document.getElementById('dw52wRangeFill');
    if (q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh && q.fiftyTwoWeekHigh > q.fiftyTwoWeekLow) {
      if (w52Lbl) w52Lbl.textContent = `${fmt(q.fiftyTwoWeekLow)} – ${fmt(q.fiftyTwoWeekHigh)}`;
      const pct52 = Math.max(0, Math.min(100, (((regPrice || q.regularMarketPrice) - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100));
      if (w52Fill) w52Fill.style.width = `${pct52}%`;
    } else {
      if (w52Lbl) w52Lbl.textContent = '—';
      if (w52Fill) w52Fill.style.width = '0%';
    }
    renderDetailsPortfolioBox(dispSym, regPrice || q.regularMarketPrice, regChg ?? q.regularMarketChange);
  }

  function formatNewsDateBadge(n, { compact = false } = {}) {
    if (!n || typeof n !== 'object') return '';
    const raw = n.providerPublishTime ?? n.publishedAt ?? n.publishedTs ?? n.pubDate ?? n.datetime;
    if (!raw && n.publishedDate) return String(n.publishedDate);
    let ms = NaN;
    if (typeof raw === 'number') {
      ms = raw < 1e12 ? raw * 1000 : raw;
    } else if (typeof raw === 'string' && raw.trim()) {
      const clean = raw.trim();
      ms = /^\d+$/.test(clean)
        ? (Number(clean) < 1e12 ? Number(clean) * 1000 : Number(clean))
        : Date.parse(clean);
    }
    if (!isFinite(ms) || ms <= 0) return '';
    try {
      const d = new Date(ms);
      if (isNaN(d.getTime())) return '';
      if (compact) {
        const dShort = d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
        const tShort = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
        return `${dShort} ${tShort}`;
      }
      const dateTxt = d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeTxt = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
      const diffH = (Date.now() - ms) / 3600000;
      let rel = '';
      if (diffH >= 0 && diffH < 1) {
        rel = ` · acum ${Math.max(1, Math.round(diffH * 60))}m`;
      } else if (diffH >= 1 && diffH < 24) {
        rel = ` · acum ${Math.round(diffH)}h`;
      } else if (diffH >= 24 && diffH < 24 * 14) {
        rel = ` · acum ${Math.round(diffH / 24)}z`;
      }
      return `${dateTxt}, ${timeTxt}${rel}`;
    } catch (_) {
      return '';
    }
  }

  function renderNewsList(news) {
    const el = document.getElementById('symbolNewsList');
    if (!el) return;
    if (!news || !news.length) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:11px;">Nicio știre recentă disponibilă.</div>`;
      return;
    }
    el.innerHTML = news.slice(0, 5).map(n => {
      const dtStr = formatNewsDateBadge(n);
      const isToday = dtStr && dtStr.includes('acum ') && !dtStr.includes('z');
      return `
      <a href="${escTg(n.link || '#')}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;padding:7px 0;border-bottom:1px solid var(--border);color:var(--text);">
        <div style="font-size:11.5px;font-weight:700;color:var(--text-bright);line-height:1.35;">${escTg(n.title || 'Știre piață')}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;font-size:10px;color:var(--text-muted);margin-top:3px;">
          <span>${escTg(n.publisher || 'Yahoo Finance')}</span>
          ${dtStr ? `<span style="color:${isToday ? 'var(--tv-blue-lt)' : 'var(--text-dim)'};font-weight:600;white-space:nowrap;">${escTg(dtStr)}</span>` : ''}
        </div>
      </a>
    `;
    }).join('');
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
    try { setScopedItem('tp_ultra_alerts', JSON.stringify(state.alerts)); } catch (_) { }
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
    botUsername: '',
    chatId: '',
    pollingActive: false,
    prefs: {
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
    },
    rateStats: null,
    logs: [],
    baselineByChart: new Map(),
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
      if (category === 'radar' && !tgClient.prefs.radarIntel) return null;
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
          bias: payload.bias || '',
          allowClosedMarket: !!payload.allowClosedMarket,
          summary: payload.summary || '',
          html: payload.html || '',
          includeActions: !!payload.includeActions
        })
      });
      const json = await res.json();
      if (json?.rateStats) tgClient.rateStats = json.rateStats;
      if (Array.isArray(json?.logs)) {
        tgClient.logs = json.logs;
        renderTelegramPanelUI();
      }
      return json;
    } catch (_) {
      return null;
    }
  }

  function maybeNotifyLiveSignalTelegram(sigOut, { seedOnly = false } = {}) {
    const cp = sigOut?.currentPlan;
    if (!cp || state.replay.active || !state.bars?.length) return;
    const lastBar = state.bars[state.bars.length - 1];
    const prevBar = state.bars[Math.max(0, state.bars.length - 2)];
    const lastSigTime = sigOut?.signals?.length
      ? sigOut.signals[sigOut.signals.length - 1].time
      : (lastBar?.time || 0);
    const chartKey = `${state.symbol}:${state.tf}`;
    const sigKey = `${chartKey}:${cp.status}:${lastSigTime}`;

    if (seedOnly || !tgClient.baselineByChart.has(chartKey)) {
      tgClient.baselineByChart.set(chartKey, sigKey);
      return;
    }
    const prevKey = tgClient.baselineByChart.get(chartKey);
    if (sigKey === prevKey || tgClient.sentSigKeys.has(sigKey)) return;

    tgClient.baselineByChart.set(chartKey, sigKey);
    const minFreshTime = prevBar?.time ?? lastBar?.time ?? 0;
    if (Number(lastSigTime) < Number(minFreshTime)) return;

    const isEntrySignal = cp.status === 'BUY_NOW' || cp.status === 'SELL_NOW';
    const tfLower = String(state.tf || '').toLowerCase();
    const isConfirmedTf = ['15m', '30m', '1h', '4h', '1d'].includes(tfLower);
    const hasHealthyRr = cp.rr1 == null || Number(cp.rr1) >= 1.4;
    if (!isEntrySignal || !isConfirmedTf || !hasHealthyRr || cp.score < (tgClient.prefs.minScore || 78)) return;

    tgClient.sentSigKeys.add(sigKey);
    const dirLabel = cp.status === 'BUY_NOW' ? 'LONG' : 'SHORT';
    const reasonsTxt = (cp.reasons || []).slice(0, 2).map(r => `- ${escTg(r)}`).join('\n');
    notifyTelegramEvent('signals', {
      dedupKey: `sig:${sigKey}`,
      sym: state.symbol,
      tf: state.tf,
      bias: dirLabel,
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

  function syncSelectVal(id, val) {
    const sel = document.getElementById(id);
    if (!sel || val === undefined || val === null) return;
    const valStr = String(val);
    if ([...sel.options].some(o => o.value === valStr)) sel.value = valStr;
  }

  function renderTelegramPanelUI() {
    const badge = document.getElementById('tgConnBadge');
    const railDot = document.getElementById('tgRailDot');
    const handleEl = document.getElementById('tgBotHandleLbl');
    const chatInp = document.getElementById('tgChatIdInput');
    const pollEl = document.getElementById('tgPollStatusLbl');
    const logBox = document.getElementById('tgActivityLog');
    const isEnabled = !!tgClient.prefs.enabled;

    if (badge) {
      if (tgClient.botOk && tgClient.chatId) {
        badge.textContent = isEnabled ? 'Activ · Live' : 'Pauză (Mute)';
        badge.className = `pill ${isEnabled ? 'pill-buy' : 'pill-warn'}`;
      } else {
        badge.textContent = isEnabled ? 'Deconectat' : 'Oprit (Mute)';
        badge.className = `pill ${isEnabled ? 'pill-neut' : 'pill-warn'}`;
      }
    }
    if (railDot) {
      railDot.classList.toggle('online', !!(tgClient.botOk && tgClient.chatId && isEnabled));
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

    const topBtn = document.getElementById('tgQuickToggleBtn');
    const topLbl = document.getElementById('tgQuickToggleLbl');
    if (topBtn) {
      topBtn.classList.toggle('is-on', isEnabled);
      topBtn.classList.toggle('is-off', !isEnabled);
      topBtn.setAttribute('aria-pressed', String(isEnabled));
    }
    if (topLbl) topLbl.textContent = isEnabled ? 'TG ON' : 'TG OPRIT';

    const mobBtn = document.getElementById('mobTgChipBtn');
    if (mobBtn) {
      mobBtn.classList.toggle('is-on', isEnabled);
      mobBtn.classList.toggle('is-off', !isEnabled);
      mobBtn.setAttribute('aria-pressed', String(isEnabled));
      mobBtn.textContent = isEnabled ? 'TG ON' : 'TG OPRIT';
    }

    const masterBtn = document.getElementById('tgMasterBannerBtn');
    const masterTxt = document.getElementById('tgMasterBannerTxt');
    if (masterBtn) {
      masterBtn.classList.toggle('is-on', isEnabled);
      masterBtn.classList.toggle('is-off', !isEnabled);
      masterBtn.setAttribute('aria-pressed', String(isEnabled));
    }
    if (masterTxt) {
      masterTxt.textContent = isEnabled
        ? 'MESAJE TELEGRAM: ACTIVE (APASĂ PT. OPRIRE)'
        : 'MESAJE TELEGRAM: OPRITE (APASĂ PT. PORNIRE)';
    }

    const alertsPill = document.getElementById('alertsTgPill');
    const alertsTogBtn = document.getElementById('alertsTgToggleBtn');
    if (alertsPill) {
      alertsPill.textContent = isEnabled ? 'Telegram: Activ' : 'Telegram: Oprit (Mute)';
      alertsPill.className = `pill ${isEnabled ? 'pill-buy' : 'pill-warn'}`;
    }
    if (alertsTogBtn) {
      alertsTogBtn.textContent = isEnabled ? 'Oprește TG' : 'Pornește TG';
      alertsTogBtn.classList.toggle('is-off', !isEnabled);
    }

    const quotaEl = document.getElementById('tgQuotaStatsLbl');
    if (quotaEl) {
      const rs = tgClient.rateStats;
      const maxHr = tgClient.prefs.maxPerHour || 0;
      const maxTxt = maxHr > 0 ? String(maxHr) : '∞';
      const sentTxt = rs ? `${rs.sentLastHour}/${maxTxt}` : `0/${maxTxt}`;
      const cdTxt = `${tgClient.prefs.cooldownMin || 180}m`;
      const sessTxt = rs?.sessionLabel || 'Standby';
      quotaEl.textContent = `${sentTxt} trimise/oră · Cooldown ${cdTxt} · Piață SUA: ${sessTxt}`;
    }

    ['enabled', 'radarIntel', 'onlyMarketOpen', 'requirePreBuyPass', 'signals', 'alerts', 'trades'].forEach(k => {
      const active = !!tgClient.prefs[k];
      const sw = document.getElementById(`tgSw_${k}`);
      if (sw) sw.classList.toggle('on', active);
      const row = document.querySelector(`.tg-toggle-row[data-tgpref="${k}"]`);
      if (row) row.setAttribute('aria-checked', String(active));
    });

    syncSelectVal('tgMinScoreSelect', tgClient.prefs.minScore ?? 78);
    syncSelectVal('tgMaxPerHourSelect', tgClient.prefs.maxPerHour ?? 3);
    syncSelectVal('tgCooldownSelect', tgClient.prefs.cooldownMin ?? 180);

    if (logBox) {
      if (!tgClient.logs.length) {
        logBox.innerHTML = `<div style="padding:16px 10px;text-align:center;color:var(--text-muted);font-size:10.5px;">Nicio comandă sau notificare recentă. Trimite <code>/radar</code> sau <code>/mute</code> pe Telegram.</div>`;
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
        if (json.rateStats) tgClient.rateStats = json.rateStats;
        if (Array.isArray(json.logs)) tgClient.logs = json.logs;
        renderTelegramPanelUI();
        if (customChatId !== null) {
          showToast('Configurare Telegram Salvată', `Chat ID activ: ${tgClient.chatId}`, 'buy');
        }
      }
    } catch (_) { }
  }

  function toggleTelegramMasterMute() {
    const next = !tgClient.prefs.enabled;
    saveTelegramConfig({ enabled: next });
    showToast(
      next ? 'Mesaje Telegram Pornite' : 'Mesaje Telegram Oprite',
      next
        ? 'Notificările inteligente (Early Radar AI + Pre-BUY Gate) sunt active.'
        : 'Botul nu va mai trimite mesaje automate până la reactivare.',
      next ? 'buy' : 'sell'
    );
  }

  async function triggerSmartRadarScanFromUI() {
    const btn = document.getElementById('tgRunRadarNowBtn');
    const prevHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Analizez Early Radar + SEC EDGAR...</span>';
    }
    try {
      const res = await fetch('/api/telegram/radar-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const json = await res.json();
      if (json?.rateStats) tgClient.rateStats = json.rateStats;
      if (Array.isArray(json?.logs)) tgClient.logs = json.logs;
      renderTelegramPanelUI();

      if (json?.sentCount > 0) {
        showToast('Briefing Radar Livrat', 'Cel mai bun setup calificat a fost trimis pe Telegram.', 'buy');
      } else if (json?.skipped === 'disabled') {
        showToast('Telegram Oprit / Dezactivat', 'Pornește Telegram ON și Early Radar AI pentru a primi alerte.', 'sell');
      } else if (json?.skipped === 'rate_limit') {
        showToast('Limită Orară Atinsă', 'Limita anti-spam pe oră a blocat trimiterea suplimentară.', 'info');
      } else {
        showToast('Niciun Moment Calificat', `Scanate ${json?.scanned || 0} simboluri — niciunul nu a trecut complet filtrele Intel & Pre-BUY.`, 'info');
      }
    } catch (e) {
      showToast('Eroare Radar Telegram', e?.message || 'Eroare de conexiune.', 'sell');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prevHtml;
      }
    }
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
      if (data.rateStats) tgClient.rateStats = data.rateStats;
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
      const toggleRow = () => {
        const key = row.dataset.tgpref;
        if (!key) return;
        saveTelegramConfig({ [key]: !tgClient.prefs[key] });
      };
      row.onclick = toggleRow;
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleRow();
        }
      });
    });

    ['tgMasterBannerBtn', 'tgQuickToggleBtn', 'mobTgChipBtn', 'alertsTgToggleBtn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onclick = toggleTelegramMasterMute;
    });

    const openCfgBtn = document.getElementById('alertsTgOpenCfgBtn');
    if (openCfgBtn) openCfgBtn.onclick = () => applyRightSidebarState('telegram', false);

    const bindSelectPref = (id, key, fallback) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.onchange = () => {
        const val = parseInt(sel.value, 10);
        saveTelegramConfig({ [key]: Number.isFinite(val) ? val : fallback });
      };
    };
    bindSelectPref('tgMinScoreSelect', 'minScore', 78);
    bindSelectPref('tgMaxPerHourSelect', 'maxPerHour', 3);
    bindSelectPref('tgCooldownSelect', 'cooldownMin', 180);

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

    const radarBtn = document.getElementById('tgRunRadarNowBtn');
    if (radarBtn) radarBtn.onclick = triggerSmartRadarScanFromUI;

    const sendHubBtn = document.getElementById('tgSendHubBtn');
    if (sendHubBtn) {
      sendHubBtn.onclick = async () => {
        const prev = sendHubBtn.innerHTML;
        sendHubBtn.disabled = true;
        sendHubBtn.innerHTML = '<span>Trimit Taste &amp; Panou pe Telegram...</span>';
        try {
          const res = await fetch('/api/telegram/send-controls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          const json = await res.json();
          if (json?.ok) {
            if (Array.isArray(json.logs)) tgClient.logs = json.logs;
            renderTelegramPanelUI();
            showToast('Panou & Taste Trimise', 'Tastele rapide jos și Panoul Interactiv au fost livrate în Telegram.', 'buy');
          } else {
            showToast('Eroare Telegram', json?.error || 'Nu s-au putut trimite controalele.', 'sell');
          }
        } catch (e) {
          showToast('Eroare Telegram', e?.message || 'Eroare de conexiune.', 'sell');
        } finally {
          sendHubBtn.disabled = false;
          sendHubBtn.innerHTML = prev;
        }
      };
    }
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
        if (st.rateStats) tgClient.rateStats = st.rateStats;
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
    scheduleTopbarFit();
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
    syncDetailsWidgetForSymbol(activeSym, getPaneStateIfRendered(activeSym));
    fetchSymbolNews(activeSym).then(news => {
      if (getActiveFocusedSymbol() === activeSym) {
        state.news = news;
        renderNewsList(news);
      }
    });
    syncQuickTopbarIndBtns();
    if (document.getElementById('indicatorsModal')?.classList.contains('open')) {
      renderIndicatorsModalList(document.getElementById('indModalSearch')?.value || '');
    }
  }

  function assignSymbolToSecondaryPane(p, rawSym, { closeMobile = false } = {}) {
    const clean = normalizeSymbol(rawSym);
    if (!p || !clean) return;
    p.sym = clean;
    const inp = document.getElementById(`secSymInput${p.id}`);
    if (inp) inp.value = clean;
    const logoBox = document.getElementById(`secLogoBox${p.id}`);
    if (logoBox) logoBox.innerHTML = renderLogoAvatar(clean, 'sm');
    resolveOfficialIdentity(clean);
    saveSecondaryPanes();
    syncLiveStreamSubscriptions();
    focusChartPane(p.id);
    loadSecondaryPaneData(p);
    refreshLiveQuotes({ prioritySyms: [clean] });
    if (closeMobile) closeMobileSheetsToChart();
  }

  function assignSymbolToFocusedPane(rawSym) {
    const clean = normalizeSymbol(rawSym);
    if (!clean) return;
    resolveOfficialIdentity(clean);

    const needed = getNeededSecPanesCount(state.layout);
    if (state.layout !== '1' && state.focusedPaneId > 0 && state.focusedPaneId <= needed) {
      const p = secPanes.find(x => x.id === state.focusedPaneId);
      if (p) {
        assignSymbolToSecondaryPane(p, clean, { closeMobile: true });
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
      paneEl.innerHTML = `<div class="sec-pane-bar"></div><div id="secPfStrip${p.id}" class="pane-etoro-strip" style="display:none;"></div><div id="secCanvas${p.id}" class="sec-canvas"></div>`;
      grid.appendChild(paneEl);
    } else if (!document.getElementById(`secPfStrip${p.id}`)) {
      const barEl = paneEl.querySelector('.sec-pane-bar');
      if (barEl) {
        const pfDiv = document.createElement('div');
        pfDiv.id = `secPfStrip${p.id}`;
        pfDiv.className = 'pane-etoro-strip';
        pfDiv.style.display = 'none';
        barEl.insertAdjacentElement('afterend', pfDiv);
      }
    }

    const canvasEl = document.getElementById(`secCanvas${p.id}`);
    if (canvasEl) {
      if (!document.getElementById(`secOverlay${p.id}`)) {
        const cv = document.createElement('canvas');
        cv.id = `secOverlay${p.id}`;
        cv.className = 'sec-overlay-canvas';
        canvasEl.appendChild(cv);
      }
      if (!document.getElementById(`secIndStack${p.id}`)) {
        const stDiv = document.createElement('div');
        stDiv.id = `secIndStack${p.id}`;
        stDiv.className = 'sec-ind-stack';
        canvasEl.appendChild(stDiv);
      }
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
          <div class="sec-pane-left">
            <span id="secLogoBox${p.id}" style="display:inline-flex;align-items:center;flex-shrink:0;">${renderLogoAvatar(p.sym, 'sm')}</span>
            <input id="secSymInput${p.id}" class="sec-pane-sym" value="${p.sym}" size="6" spellcheck="false" autocomplete="off" title="Scrie simbol + Enter (sau click pe ecran și alege din Watchlist)">
            <button id="secSearchBtn${p.id}" class="tb-btn icon-only" style="width:24px;height:24px;" title="Caută simbol pentru Ecranul #${p.id + 1}">
              <svg class="tv-ico sm" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7.5"/><line x1="20" y1="20" x2="16.35" y2="16.35"/></svg>
            </button>
            <select id="secTfSelect${p.id}" class="sec-pane-tf" title="Interval de timp Ecran #${p.id + 1}">
              ${tfOpts.map(([val, lbl]) => `<option value="${val}" ${val === p.tf ? 'selected' : ''}>${lbl}</option>`).join('')}
            </select>
          </div>
          <div class="sec-pane-right">
            <span id="secLivePrice${p.id}" class="sec-live-price tabular">—</span>
            <span id="secLiveChg${p.id}" class="sec-live-chg tabular">—</span>
            <span id="secExtBadge${p.id}" class="ext-sess-pill sec-ext-pill tabular" style="display:none;" title="Pre-Market / Post-Market / Overnight"></span>
            <div class="sec-pane-tools">
              <span id="secSigBadge${p.id}" class="pill pill-neut">—</span>
              <div class="pane-prof-tab">
                <button type="button" id="secIndBtn${p.id}" class="pane-prof-btn" title="Profil / Skin &amp; Indicatori pentru Ecran #${p.id + 1}">
                  <span class="pane-prof-dot"></span>
                  <span id="secIndLbl${p.id}">Ind</span>
                </button>
                <button type="button" id="secCopyBtn${p.id}" class="pane-prof-copy" title="Copiază profilul / indicatorii acestui grafic" aria-label="Copiază profilul">${ICO.copy}</button>
                <button type="button" id="secPasteBtn${p.id}" class="pane-prof-paste" style="display:none;" title="Preia profilul copiat">${ICO.paste}<span id="secPasteLbl${p.id}">Preia</span></button>
              </div>
              <button id="secMaxBtn${p.id}" class="tb-btn icon-only" style="width:24px;height:24px;" title="Maximizează pe tot ecranul">
                <svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="13" y2="11"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>
              </button>
            </div>
          </div>
        `;
      }

      const focusThisPane = () => {
        if (state.focusedPaneId !== p.id) focusChartPane(p.id);
      };
      paneEl.addEventListener('pointerdown', focusThisPane, { capture: true });
      paneEl.addEventListener('mousedown', focusThisPane, { capture: true });
      if (canvasEl) {
        canvasEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          focusThisPane();
          const expPop = document.getElementById('chartExplainPopover');
          if (expPop) expPop.style.display = 'none';
          if (p.candle) {
            const rect = canvasEl.getBoundingClientRect();
            const localY = e.clientY - rect.top;
            const coordP = p.candle.coordinateToPrice(localY);
            if (coordP != null && isFinite(coordP)) state.ctxPrice = coordP;
          }
          openContextMenu(e.clientX, e.clientY, p);
        });
      }

      const inp = document.getElementById(`secSymInput${p.id}`);
      const sel = document.getElementById(`secTfSelect${p.id}`);
      const sBtn = document.getElementById(`secSearchBtn${p.id}`);
      const indBtn = document.getElementById(`secIndBtn${p.id}`);
      const copyBtn = document.getElementById(`secCopyBtn${p.id}`);
      const pasteBtn = document.getElementById(`secPasteBtn${p.id}`);
      const maxBtn = document.getElementById(`secMaxBtn${p.id}`);

      if (inp) {
        const applyInpSym = () => {
          const nextSym = normalizeSymbol(inp.value);
          if (nextSym && nextSym !== p.sym) {
            assignSymbolToSecondaryPane(p, nextSym);
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
          assignSymbolToSecondaryPane(p, pickedSym);
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

      if (indBtn) {
        indBtn.addEventListener('pointerdown', e => e.stopPropagation());
        indBtn.onclick = (e) => {
          e.stopPropagation();
          openIndicatorsModalForCurrentPane(p.id);
        };
      }

      if (copyBtn) {
        copyBtn.addEventListener('pointerdown', e => e.stopPropagation());
        copyBtn.onclick = (e) => {
          e.stopPropagation();
          focusChartPane(p.id);
          copyPaneIndicatorProfile(p);
        };
      }

      if (pasteBtn) {
        pasteBtn.addEventListener('pointerdown', e => e.stopPropagation());
        pasteBtn.onclick = (e) => {
          e.stopPropagation();
          pasteCopiedProfileToPane(p);
        };
      }

      updateSecondaryIndBtnLabel(p);

      if (sel) {
        sel.onchange = () => {
          p.tf = sel.value;
          saveSecondaryPanes();
          loadSecondaryPaneData(p);
          focusChartPane(p.id);
        };
      }

      wirePaneBarDoubleClick(bar, p.id);
      wirePaneBarDoubleClick(document.getElementById(`secPfStrip${p.id}`), p.id);

      if (maxBtn) {
        maxBtn.title = 'Maximizează / Revino la layout (sau dublu-click pe bară)';
        maxBtn.onclick = (e) => {
          e.stopPropagation();
          togglePaneFullscreen(p.id);
        };
      }
    } else {
      const inp = document.getElementById(`secSymInput${p.id}`);
      const sel = document.getElementById(`secTfSelect${p.id}`);
      const logoBox = document.getElementById(`secLogoBox${p.id}`);
      if (logoBox) logoBox.innerHTML = renderLogoAvatar(p.sym, 'sm');
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
      updateSecondaryIndBtnLabel(p);
    }

    return paneEl;
  }

  let zoomedPaneId = null;

  function clearPaneFullscreen() {
    zoomedPaneId = null;
    const grid = document.getElementById('chartsGrid');
    if (grid) grid.classList.remove('has-zoomed-pane');
    document.querySelectorAll('#chartsGrid .chart-pane.pane-zoomed').forEach(el => el.classList.remove('pane-zoomed'));
  }

  function togglePaneFullscreen(paneId) {
    if (state.layout === '1') return;
    const grid = document.getElementById('chartsGrid');
    if (!grid) return;
    const targetId = Number(paneId) || 0;
    if (zoomedPaneId === targetId) {
      clearPaneFullscreen();
    } else {
      clearPaneFullscreen();
      const targetEl = targetId === 0
        ? document.getElementById('primaryPane')
        : document.getElementById(`secPane${targetId}`);
      if (!targetEl) return;
      zoomedPaneId = targetId;
      grid.classList.add('has-zoomed-pane');
      targetEl.classList.add('pane-zoomed');
      focusChartPane(targetId);
    }
    resizeAllCharts();
    requestAnimationFrame(resizeAllCharts);
    setTimeout(resizeAllCharts, 70);
  }

  function wirePaneBarDoubleClick(el, paneId) {
    if (!el || el.dataset.dblZoomWired === '1') return;
    el.dataset.dblZoomWired = '1';
    el.addEventListener('dblclick', (e) => {
      if (state.layout === '1') return;
      if (e.target && e.target.closest('input, select, button, a')) return;
      e.preventDefault();
      e.stopPropagation();
      togglePaneFullscreen(paneId);
    });
  }

  async function setMultiChartLayout(layoutCode) {
    clearPaneFullscreen();
    const validLayouts = ['1', '2v', '2h', '3v', '4', '6', '8', '9', '10', '12', '16', '20'];
    const cleanLayout = validLayouts.includes(layoutCode) ? layoutCode : '1';
    state.layout = cleanLayout;
    setScopedItem('tp_ultra_layout', cleanLayout);

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
    updateBrowserTabTitle();
    setTimeout(resizeAllCharts, 50);

    // Load active secondary panes in smooth parallel batches of 5 (handles up to 20 live charts effortlessly)
    for (let k = 0; k < toLoad.length; k += 5) {
      const batch = toLoad.slice(k, k + 5);
      await Promise.all(batch.map(p => loadSecondaryPaneData(p)));
      resizeAllCharts();
    }
  }

  let copiedPaneProfile = null; // { sourcePaneId, sourceSym, label, indicators, hiddenIndicators, copiedAt }

  function getPaneProfileMeta(paneObj = null) {
    const b = getPaneIndBucket(paneObj);
    const visCnt = INDICATOR_DEFS.filter(d => isBucketIndVisible(b.indicators, b.hiddenIndicators, d.key)).length;
    const totalCnt = INDICATOR_DEFS.filter(d => !!b.indicators?.[d.key]).length;
    const skinLbl = typeof getActiveSkinShortLabel === 'function'
      ? getActiveSkinShortLabel(b.indicators, b.hiddenIndicators)
      : null;
    const sym = b.isPrimary ? state.symbol : b.pane.sym;
    const label = skinLbl || (totalCnt ? `Custom (${visCnt})` : 'Curat');
    return { bucket: b, sym, paneId: b.isPrimary ? 0 : b.pane.id, label, skinLbl, visCnt, totalCnt };
  }

  function syncPaneProfileTabUI(lblEl, btnEl, copyBtnEl, pasteBtnEl, pasteLblEl, paneObj) {
    const meta = getPaneProfileMeta(paneObj);
    if (lblEl) lblEl.textContent = meta.label;
    if (btnEl) {
      btnEl.title = `Profil activ pe Ecran #${meta.paneId + 1} (${meta.sym}): ${meta.label} (${meta.visCnt} activi) — click pentru editare`;
    }
    const isSource = !!(copiedPaneProfile && copiedPaneProfile.sourcePaneId === meta.paneId);
    if (copyBtnEl) {
      copyBtnEl.classList.toggle('is-copied', isSource);
      copyBtnEl.innerHTML = isSource ? ICO.check : ICO.copy;
      copyBtnEl.title = isSource
        ? `Profil „${copiedPaneProfile.label}” copiat! Click pe „Preia” pe orice alt grafic.`
        : `Copiază profilul și indicatorii de pe ${meta.sym}`;
    }
    if (pasteBtnEl) {
      const canPaste = !!(copiedPaneProfile && copiedPaneProfile.sourcePaneId !== meta.paneId);
      pasteBtnEl.style.display = canPaste ? 'inline-flex' : 'none';
      if (canPaste) {
        const shortCopied = copiedPaneProfile.label.length > 9
          ? copiedPaneProfile.label.slice(0, 8) + '…'
          : copiedPaneProfile.label;
        if (pasteLblEl) pasteLblEl.textContent = `Preia: ${shortCopied}`;
        pasteBtnEl.title = `Preia profilul copiat de pe ${copiedPaneProfile.sourceSym} („${copiedPaneProfile.label}”) pe ${meta.sym}`;
      }
    }
  }

  function syncAllPaneProfileTabs() {
    syncPaneProfileTabUI(
      document.getElementById('priProfLbl'),
      document.getElementById('priProfBtn'),
      document.getElementById('priProfCopyBtn'),
      document.getElementById('priProfPasteBtn'),
      document.getElementById('priProfPasteLbl'),
      null
    );
    secPanes.forEach(p => {
      syncPaneProfileTabUI(
        document.getElementById(`secIndLbl${p.id}`),
        document.getElementById(`secIndBtn${p.id}`),
        document.getElementById(`secCopyBtn${p.id}`),
        document.getElementById(`secPasteBtn${p.id}`),
        document.getElementById(`secPasteLbl${p.id}`),
        p
      );
    });
  }

  function copyPaneIndicatorProfile(paneObj = getFocusedPaneObj()) {
    const meta = getPaneProfileMeta(paneObj);
    copiedPaneProfile = {
      sourcePaneId: meta.paneId,
      sourceSym: meta.sym,
      label: meta.label,
      indicators: { ...meta.bucket.indicators },
      hiddenIndicators: { ...(meta.bucket.hiddenIndicators || {}) },
      copiedAt: Date.now()
    };
    syncAllPaneProfileTabs();
    if (document.getElementById('indicatorsModal')?.classList.contains('open')) {
      renderIndicatorSkinsBar();
    }
    showToast(
      `Profil „${meta.label}” Copiat (${meta.sym})`,
      'Selectează orice alt grafic și apasă „Preia” din tab-ul lui pentru a-i aplica aceiași indicatori.'
    );
  }

  function pasteCopiedProfileToPane(paneObj = getFocusedPaneObj()) {
    if (!copiedPaneProfile) return;
    focusChartPane(paneObj ? paneObj.id : 0);
    applyIndicatorSkinOrProfile({
      name: copiedPaneProfile.label,
      indicators: { ...copiedPaneProfile.indicators },
      hiddenIndicators: { ...(copiedPaneProfile.hiddenIndicators || {}) },
      desc: `Profil preluat de pe ${copiedPaneProfile.sourceSym} (${copiedPaneProfile.sourcePaneId === 0 ? 'Ecran #1' : `Ecran #${copiedPaneProfile.sourcePaneId + 1}`}).`
    }, paneObj);
  }

  function updateSecondaryIndBtnLabel(p) {
    syncPaneProfileTabUI(
      document.getElementById(`secIndLbl${p.id}`),
      document.getElementById(`secIndBtn${p.id}`),
      document.getElementById(`secCopyBtn${p.id}`),
      document.getElementById(`secPasteBtn${p.id}`),
      document.getElementById(`secPasteLbl${p.id}`),
      p
    );
  }

  function renderSecondaryPaneIndicators(p, fitView = false) {
    if (!p || !p.chart || !p.candle || !p.bars || !p.bars.length) return;
    let savedR = null;
    if (!fitView) {
      try { savedR = p.chart.timeScale().getVisibleLogicalRange(); } catch (_) { }
    }

    const isVis = (k) => isPaneIndVisible(p, k);
    const lookback = parseInt(document.getElementById('fibLookbackSelect')?.value || '60', 10);
    if (p.overlay) p.overlay.symbol = p.sym;
    const { sigOut } = applySharedChartOverlays({
      bars: p.bars,
      candleSeries: p.candle,
      volSeries: p.volSeries,
      linePool: p.lines,
      fibTargetArr: p.fibPriceLines,
      overlayEng: p.overlay,
      isVisFn: isVis,
      lookback,
      forecastHorizon: state.forecastHorizon,
      needFullAnalytics: false,
      manageFib: true
    });

    const b = getPaneIndBucket(p);
    renderChartIndicatorStackUI(document.getElementById(`secIndStack${p.id}`), b.indicators, b.hiddenIndicators, p);
    updateSecondaryIndBtnLabel(p);

    const badge = document.getElementById(`secSigBadge${p.id}`);
    if (badge && sigOut?.currentPlan) {
      const cp = sigOut.currentPlan;
      let txt = `${cp.status === 'BUY_NOW' ? 'BUY' : cp.status === 'SELL_NOW' ? 'SELL' : (cp.stBull ? 'BULL' : 'BEAR')} ${cp.score}`;
      if (isVis('rsi')) {
        const rArr = Q.calcRSIArray(p.bars.map(x => x.close), 14);
        const rLast = rArr[rArr.length - 1];
        if (rLast != null && isFinite(rLast)) txt += ` · RSI ${Math.round(rLast)}`;
      }
      badge.textContent = txt;
      badge.className = `pill ${cp.stBull ? 'pill-buy' : 'pill-sell'}`;
    }

    if (fitView) {
      focusLiveEvolution(p.chart, p.bars.length, 72, 5);
    } else if (savedR) {
      try { p.chart.timeScale().setVisibleLogicalRange(savedR); } catch (_) { }
    }
    if (p.overlay) p.overlay.resize();
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
    p.volSeries = p.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volScale',
      lastValueVisible: false,
      priceLineVisible: false
    });
    p.chart.priceScale('volScale').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    p.lines = createChartOverlaySeriesPool(p.chart, false);
    p.fibPriceLines = [];

    const ovCanvas = document.getElementById(`secOverlay${p.id}`);
    if (ovCanvas && typeof window.ChartOverlayEngine === 'function') {
      p.overlay = new window.ChartOverlayEngine({
        canvas: ovCanvas,
        getChart: () => p.chart,
        getSeries: () => p.candle,
        getBars: () => p.bars || [],
        fmtPrice: fmt
      });
    }
    p.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (p.overlay) p.overlay.requestRender();
    });
  }

  async function loadSecondaryPaneData(p) {
    if (!p.chart) return;
    const targetSym = normalizeSymbol(p.sym);
    if (!targetSym) return;
    const targetTf = p.tf;
    const mySeq = (p._loadSeq = (p._loadSeq || 0) + 1);

    resolveOfficialIdentity(targetSym);
    const logoBox = document.getElementById(`secLogoBox${p.id}`);
    if (logoBox) logoBox.innerHTML = renderLogoAvatar(targetSym, 'sm');
    const inp = document.getElementById(`secSymInput${p.id}`);
    if (inp && document.activeElement !== inp) inp.value = targetSym;
    const sel = document.getElementById(`secTfSelect${p.id}`);
    if (sel) {
      if (!Array.from(sel.options).some(o => o.value === targetTf)) {
        const opt = document.createElement('option');
        opt.value = targetTf;
        opt.textContent = String(targetTf).toUpperCase();
        sel.appendChild(opt);
      }
      sel.value = targetTf;
    }

    const sigEl = document.getElementById(`secSigBadge${p.id}`);
    if (p._renderedSym !== targetSym) {
      p._renderedSym = '';
      p.bars = [];
      p.meta = {};
      (p.fibPriceLines || []).forEach(obj => {
        try { obj.series.removePriceLine(obj.line); } catch (_) { }
      });
      p.fibPriceLines = [];
      try { p.candle?.setData([]); } catch (_) { }
      try { if (typeof p.candle?.setMarkers === 'function') p.candle.setMarkers([]); } catch (_) { }
      try { p.volSeries?.setData([]); } catch (_) { }
      clearSeriesPool(p.lines);
      if (p.overlay) p.overlay.setSymbol(targetSym);

      const cachedPre = liveQuoteCache[targetSym];
      if (cachedPre) {
        applySecondaryPaneQuoteUI(p, {
          sym: targetSym,
          priceHtml: cachedPre.html,
          regHtml: cachedPre.regHtml,
          regPrice: cachedPre.regPrice ?? cachedPre.price,
          regChg: cachedPre.regChg ?? cachedPre.chg,
          regChgPct: cachedPre.regChgPct ?? cachedPre.chgPct,
          extType: cachedPre.extType,
          extPrice: cachedPre.extPrice,
          extChg: cachedPre.extChg,
          extChgPct: cachedPre.extChgPct
        });
      } else {
        applySecondaryPaneQuoteUI(p, { sym: targetSym });
      }
      if (sigEl) {
        sigEl.textContent = '—';
        sigEl.className = 'pill pill-neut';
      }
    }

    try {
      const tfLow = String(targetTf || '').toLowerCase();
      p.chart.timeScale().applyOptions({ secondsVisible: /^\d+(s|t)$/.test(tfLow) });
      const { bars, meta, demo } = await fetchOHLCV(targetSym, targetTf);
      if (mySeq !== p._loadSeq || normalizeSymbol(p.sym) !== targetSym) return;

      p.bars = bars;
      p.meta = { ...(meta || {}), symbol: targetSym };
      p._renderedSym = targetSym;
      p.candle.setData((bars || []).map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      resizeAllCharts();
      try {
        renderSecondaryPaneIndicators(p, true);
      } catch (indErr) {
        console.warn('[SecPane] Indicator render err:', indErr);
        focusLiveEvolution(p.chart, (bars || []).length, 72, 5);
      }

      if (bars.length) {
        try {
          const cached = liveQuoteCache[targetSym];
          const fq = (fullQuoteCache[targetSym] && (!fullQuoteCache[targetSym].symbol || String(fullQuoteCache[targetSym].symbol).toUpperCase() === targetSym))
            ? fullQuoteCache[targetSym]
            : null;
          const mExt = extractQuoteSessionInfo(fq || meta || {});
          const extType = cached?.extType || mExt?.extType || '';
          const extPrice = cached?.extPrice ?? mExt?.extPrice;
          const extChg = cached?.extChg ?? mExt?.extChg;
          const extChgPct = cached?.extChgPct ?? mExt?.extChgPct;
          const lastB = bars[bars.length - 1];
          const prevB = bars[bars.length - 2] || lastB;
          const refPrev = meta?.chartPreviousClose ?? cached?.prevClose ?? prevB.close;
          const regRef = cached?.regPrice ?? meta?.regularMarketPrice ?? fq?.regularMarketPrice ?? lastB.close;
          const pct = cached && isFinite(cached.chgPct)
            ? cached.chgPct
            : (isFinite(fq?.regularMarketChangePercent) ? fq.regularMarketChangePercent : (refPrev ? ((regRef - refPrev) / refPrev) * 100 : 0));
          const chgVal = cached && isFinite(cached.chg)
            ? cached.chg
            : (isFinite(fq?.regularMarketChange) ? fq.regularMarketChange : (refPrev ? (regRef - refPrev) : 0));
          applySecondaryPaneQuoteUI(p, {
            sym: targetSym,
            priceHtml: cached?.html || formatSplitTickHTML(prevB.close, lastB.close, chgVal >= 0 ? 1 : -1),
            regHtml: cached?.regHtml || formatSplitTickHTML(refPrev, regRef, chgVal >= 0 ? 1 : -1),
            regPrice: regRef,
            regChg: chgVal,
            regChgPct: pct,
            extType,
            extPrice,
            extChg,
            extChgPct
          });

          const wlItem = state.watchlist.find(w => w.sym === targetSym);
          if (wlItem && !demo && wlItem.regPrice == null && bars.length >= 2) {
            const chg = regRef - refPrev;
            wlItem.price = regRef;
            wlItem.regPrice = regRef;
            wlItem.chg = chg;
            wlItem.regChg = chg;
            wlItem.chgPct = pct;
            wlItem.regChgPct = pct;
            wlItem.livePriceHtml = formatSplitTickHTML(refPrev, regRef, chg >= 0 ? 1 : -1);
            renderWatchlist();
          }
        } catch (_) { }
      }

      try {
        if (state.layout !== '1' && state.focusedPaneId === p.id && getActiveFocusedSymbol() === targetSym) {
          syncDetailsWidgetForSymbol(targetSym, { bars, meta });
        }
        if (!fullQuoteCache[targetSym]) {
          refreshLiveQuotes({ prioritySyms: [targetSym] });
        }
      } catch (_) { }
    } catch (_) {
      if (mySeq === p._loadSeq) {
        p.bars = [];
        p.meta = null;
        try { p.candle.setData([]); } catch (_) { }
        try { renderSecondaryPaneIndicators(p, true); } catch (__) { }
      }
    }
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
        const isGen = authState.generalState?.watchlist?.some(g => String(g.sym).toUpperCase() === sym);
        state.watchlist.unshift({ sym, name: bestName, source: isGen ? 'general' : 'personal' });
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
    if (!btn) return;
    const clean = String(sym || state.symbol || '').toUpperCase().trim();
    const inWl = isSymbolInWatchlist(clean);
    btn.classList.toggle('in-wl', inWl);
    btn.setAttribute('aria-pressed', inWl ? 'true' : 'false');
    if (txt) txt.textContent = inWl ? `În Watchlist` : `+ Adaugă Watchlist`;
    const tip = inWl
      ? `${clean} este în Watchlist (Click pentru a elimina)`
      : `Adaugă ${clean} în Watchlist`;
    btn.title = tip;
    btn.setAttribute('aria-label', tip);
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
    const expPop = document.getElementById('chartExplainPopover');
    if (expPop) expPop.style.display = 'none';

    const isSymbolSwitch = state.renderedSymbol !== cleanSym;
    state.symbol = cleanSym;
    state.tf = tf;
    const cachedFull = fullQuoteCache[cleanSym];
    state.quote = (cachedFull && String(cachedFull.symbol || cleanSym).toUpperCase() === cleanSym) ? cachedFull : null;
    setScopedItem('tp_ultra_symbol', cleanSym);
    setScopedItem('tp_ultra_tf', tf);
    document.getElementById('demoWarnBadge')?.remove();

    if (isSymbolSwitch) {
      state.renderedSymbol = '';
      state.rawFetchedBars = [];
      state.fullBars = [];
      state.bars = [];
      state.compareBars = [];
      state.meta = null;
      state.lastSignalOut = null;
      state.lastForecastOut = null;
      state.lastTechOut = null;
      state.lastFibOut = null;
      clearPrimaryChartForSymbolSwitch();
    }

    const primaryFocused = state.layout === '1' || state.focusedPaneId === 0;
    if (primaryFocused) {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === tf));
      const cTfLbl = document.getElementById('customTfLbl');
      if (cTfLbl) {
        const isStd = ['5m', '15m', '30m', '1h', '4h', '1d'].includes(String(tf).toLowerCase());
        cTfLbl.textContent = isStd ? '+TF' : String(tf).replace('1wk', '1W').replace('1mo', '1M').toUpperCase();
        document.getElementById('customTfBtn')?.classList.toggle('active', !isStd);
      }
      syncDetailsWidgetForSymbol(cleanSym, getPaneStateIfRendered(cleanSym));
    }
    renderWatchlist();

    if (overlayEngine) overlayEngine.setSymbol(cleanSym);
    if (isSymbolSwitch) {
      updateHeaderAndLegend(null, null, { allowPending: true });
    }
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

      state.renderedSymbol = cleanSym;
      state.rawFetchedBars = bars;
      state.compareBars = cmpRes?.bars || [];
      state.fullBars = buildEffectiveFullBars();
      state.bars = [...state.fullBars];
      state.meta = { ...(meta || {}), symbol: cleanSym };

      // Populate instant quote metrics from cached full quote or raw bars + meta on frame 1
      if (bars.length >= 2) {
        const instantQ = (fullQuoteCache[cleanSym] && String(fullQuoteCache[cleanSym].symbol || cleanSym).toUpperCase() === cleanSym)
          ? fullQuoteCache[cleanSym]
          : buildInstantQuoteFromBars(cleanSym, meta, bars);
        if (instantQ) {
          state.quote = instantQ;
          if (state.layout === '1' || state.focusedPaneId === 0) {
            updateDetailsWidget(instantQ, cleanSym);
          }

          const regRef = instantQ.regularMarketPrice;
          const pClose = instantQ.regularMarketPreviousClose;
          const chg = instantQ.regularMarketChange;
          const chgPct = instantQ.regularMarketChangePercent;
          const resolvedName = instantQ.shortName;
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
      } else if (state.layout === '1' || state.focusedPaneId === 0) {
        syncDetailsWidgetForSymbol(cleanSym);
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
      refreshLiveQuotes({ prioritySyms: [cleanSym] });
      if (state.layout === '1' || state.focusedPaneId === 0) {
        fetchSymbolNews(cleanSym).then(news => {
          if (mySeq === loadSymbolSeq && getActiveFocusedSymbol() === cleanSym) {
            state.news = news;
            renderNewsList(news);
          }
        });
      }
      refreshMTFMatrix(cleanSym);
    } finally {
      if (mySeq === loadSymbolSeq) {
        loader.style.display = 'none';
      }
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

  function isIndVisible(key) {
    return isBucketIndVisible(state.indicators, state.hiddenIndicators, key);
  }

  function isFocusedIndVisible(key) {
    const b = getPaneIndBucket();
    return isBucketIndVisible(b.indicators, b.hiddenIndicators, key);
  }

  function saveIndicatorsState() {
    setScopedItem('tp_ultra_inds_v3', JSON.stringify(state.indicators));
    setScopedItem('tp_ultra_hidden_inds_v1', JSON.stringify(state.hiddenIndicators || {}));
  }

  function syncQuickTopbarIndBtns() {
    const b = getPaneIndBucket();
    const visCnt = INDICATOR_DEFS.filter(d => isBucketIndVisible(b.indicators, b.hiddenIndicators, d.key)).length;
    const cntEl = document.getElementById('activeIndCount');
    if (cntEl) cntEl.textContent = visCnt;
    document.querySelectorAll('[data-qind]').forEach(qb => {
      qb.classList.toggle('active', isBucketIndVisible(b.indicators, b.hiddenIndicators, qb.dataset.qind));
    });
    document.getElementById('smartSigTopBtn')?.classList.toggle('active', isBucketIndVisible(b.indicators, b.hiddenIndicators, 'smartSignals'));
    document.getElementById('fibTopBtn')?.classList.toggle('active', isBucketIndVisible(b.indicators, b.hiddenIndicators, 'fibAuto'));
    const fibPanelBtn = document.getElementById('fibToggleChartBtn');
    if (fibPanelBtn) {
      const fibOn = isIndVisible('fibAuto');
      fibPanelBtn.classList.toggle('active', fibOn);
      fibPanelBtn.textContent = fibOn ? 'Pe Grafic: ON' : 'Pe Grafic: OFF';
    }
  }

  function commitPaneIndicatorChange(bucket) {
    if (bucket.isPrimary) {
      saveIndicatorsState();
      renderChartAndQuant(false);
    } else if (bucket.pane) {
      saveSecondaryPanes();
      renderSecondaryPaneIndicators(bucket.pane, false);
    }
    syncQuickTopbarIndBtns();
    syncAllPaneProfileTabs();
    renderIndicatorsModalList(document.getElementById('indModalSearch')?.value || '');
  }

  function toggleIndicatorVisibility(key, targetPane = getFocusedPaneObj()) {
    const b = getPaneIndBucket(targetPane);
    if (!b.indicators[key]) return;
    if (b.hiddenIndicators[key]) delete b.hiddenIndicators[key];
    else b.hiddenIndicators[key] = true;
    commitPaneIndicatorChange(b);
  }

  function removeIndicatorFromChart(key, targetPane = getFocusedPaneObj()) {
    const b = getPaneIndBucket(targetPane);
    b.indicators[key] = false;
    delete b.hiddenIndicators[key];
    commitPaneIndicatorChange(b);
  }

  function toggleIndicator(key, targetPane = getFocusedPaneObj()) {
    const b = getPaneIndBucket(targetPane);
    if (b.indicators[key] && b.hiddenIndicators?.[key]) {
      delete b.hiddenIndicators[key];
    } else {
      b.indicators[key] = !b.indicators[key];
      delete b.hiddenIndicators[key];
    }
    commitPaneIndicatorChange(b);
  }

  function openIndicatorsModalForCurrentPane(explicitPaneId = null) {
    if (explicitPaneId !== null && explicitPaneId !== undefined) {
      focusChartPane(Number(explicitPaneId) || 0);
    }
    indModalTab = 'top10';
    const searchEl = document.getElementById('indModalSearch');
    if (searchEl) searchEl.value = '';
    renderIndicatorsModalList('');
    document.getElementById('indicatorsModal')?.classList.add('open');
    searchEl?.focus();
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
    let extStr = '';
    if (eType && ePrice != null && isFinite(ePrice)) {
      const extMeta = getExtSessionUiMeta(eType);
      extStr = `<div class="wl-ext-tag ${extMeta.cls}" style="font-size:9px;margin-top:1px;">${extMeta.short} ${fmt(ePrice)} (${ePct >= 0 ? '+' : ''}${ePct.toFixed(2)}%)</div>`;
    }
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

  const PRO_TOP10_META = [
    { key: 'vwap', rank: 1, role: 'Benchmark Instituțional', edge: 'Ancora nr. 1 pentru execuție intraday și mean-reversion pe benzile ±1σ / ±2σ.' },
    { key: 'vpvr', rank: 2, role: 'Volume Profile', edge: 'Identifică prețul de echilibru (POC) și zonele de lichiditate instituțională (VAH/VAL).' },
    { key: 'smc', rank: 3, role: 'Structură Smart Money', edge: 'Detectează obiectiv BOS, CHoCH, Order Blocks instituționale și golurile FVG.' },
    { key: 'emaRibbon', rank: 4, role: 'Trend Multi-Orizont', edge: 'Separă impulsul pe termen scurt (9/21) de trendul instituțional (50/200).' },
    { key: 'supertrend', rank: 5, role: 'Trailing ATR', edge: 'Adaptează automat pragul de trend și trailing stop-ul la volatilitatea reală ATR.' },
    { key: 'fibAuto', rank: 6, role: 'Golden Pocket 61.8%', edge: 'Niveluri automate de pullback (38.2%–61.8%) cu confluență puternică peste OB/VWAP.' },
    { key: 'rsi', rank: 7, role: 'Momentum & Divergențe', edge: 'Detectează epuizarea (>70 / <30), divergențele ascunse și schimbările de regim peste 50.' },
    { key: 'macd', rank: 8, role: 'Accelerație Impuls', edge: 'Confirmă creșterea sau scăderea momentum-ului pe valuri intraday și swing.' },
    { key: 'vol', rank: 9, role: 'Efort vs. Rezultat', edge: 'Validează breakout-urile reale cu volum în expansiune și filtrează mișcările false.' },
    { key: 'smartSignals', rank: 10, role: 'Motor Quant R:R', edge: 'Combină structura, momentumul și volatilitatea într-un plan concret cu SL/TP backtestat.' }
  ];
  const PRO_TOP10_MAP = new Map(PRO_TOP10_META.map(x => [x.key, x]));
  const PRO_OPTIMAL_PRESET_KEYS = ['vwap', 'vpvr', 'smc', 'emaRibbon', 'rsi', 'vol'];
  const BUILTIN_INDICATOR_SKINS = [
    { id: 'simple', name: 'Simplu (Începător)', keys: ['supertrend', 'vwap', 'vol', 'smartSignals'], desc: 'Doar 4 repere clare: SuperTrend (direcție), VWAP (preț mediu), Volum și Semnale BUY/SELL.' },
    { id: 'pro', name: 'Pro Instituțional', keys: PRO_OPTIMAL_PRESET_KEYS, desc: 'VWAP + Volume Profile + SMC + EMA Ribbon + RSI + Volum.' },
    { id: 'smc_pa', name: 'SMC & Patterns', keys: ['smc', 'fibAuto', 'autoPatterns', 'wolfeWave', 'vol'], desc: 'Structură OB/FVG/BOS/CHoCH + Fib Golden Pocket + Patterns + Wolfe 1-5.' },
    { id: 'scalp', name: 'Momentum & Scalp', keys: ['vwap', 'emaRibbon', 'macd', 'rsi', 'vol', 'smartSignals'], desc: 'VWAP + EMA 9/21/50/200 + MACD + RSI + Volum + Semnale R:R.' },
    { id: 'clean', name: 'Curat (0)', keys: [], desc: 'Fără indicatori — doar lumânările curate.' }
  ];
  const IND_PROFILES_STORAGE_KEY = 'tp_ultra_ind_profiles_v1';
  let indModalTab = 'top10';

  function loadCustomIndicatorProfiles() {
    try {
      const arr = JSON.parse(getScopedItem(IND_PROFILES_STORAGE_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(p => p && p.name && p.indicators) : [];
    } catch (_) {
      return [];
    }
  }

  function writeCustomIndicatorProfiles(arr) {
    setScopedItem(IND_PROFILES_STORAGE_KEY, JSON.stringify(arr || []));
  }

  function matchesIndicatorSnapshotForBucket(targetInds, targetHidden = {}, bucket = getPaneIndBucket()) {
    return INDICATOR_DEFS.every(d => {
      const k = d.key;
      const curAdded = !!bucket.indicators?.[k];
      const tgtAdded = !!targetInds?.[k];
      if (curAdded !== tgtAdded) return false;
      if (curAdded && !!bucket.hiddenIndicators?.[k] !== !!targetHidden?.[k]) return false;
      return true;
    });
  }

  function getActiveSkinShortLabel(indicators, hiddenIndicators) {
    const bucket = { indicators, hiddenIndicators: hiddenIndicators || {} };
    const customProfiles = loadCustomIndicatorProfiles();
    const prof = customProfiles.find(p => matchesIndicatorSnapshotForBucket(p.indicators, p.hiddenIndicators || {}, bucket));
    if (prof) return prof.name.length > 10 ? prof.name.slice(0, 9) + '…' : prof.name;
    const SHORT_SKIN_NAMES = {
      simple: 'Simplu',
      pro: 'Pro',
      smc_pa: 'SMC',
      scalp: 'Momentum',
      clean: 'Curat'
    };
    const skin = BUILTIN_INDICATOR_SKINS.find(s => {
      const m = {};
      s.keys.forEach(k => { m[k] = true; });
      return matchesIndicatorSnapshotForBucket(m, {}, bucket);
    });
    return skin ? (SHORT_SKIN_NAMES[skin.id] || skin.name.split(' ')[0]) : null;
  }

  function applyIndicatorSkinOrProfile(spec, targetPane = getFocusedPaneObj()) {
    if (!spec) return;
    const b = getPaneIndBucket(targetPane);
    const nextInds = {};
    let nextHidden = {};
    if (Array.isArray(spec.keys)) {
      const keySet = new Set(spec.keys);
      INDICATOR_DEFS.forEach(d => { nextInds[d.key] = keySet.has(d.key); });
    } else if (spec.indicators) {
      INDICATOR_DEFS.forEach(d => { nextInds[d.key] = !!spec.indicators[d.key]; });
      nextHidden = { ...(spec.hiddenIndicators || {}) };
    }
    if (b.isPrimary) {
      state.indicators = nextInds;
      state.hiddenIndicators = nextHidden;
    } else if (b.pane) {
      b.pane.indicators = nextInds;
      b.pane.hiddenIndicators = nextHidden;
    }
    commitPaneIndicatorChange(getPaneIndBucket(targetPane));
    const paneLbl = b.isPrimary ? `Ecran #1 (${state.symbol})` : `Ecran #${b.pane.id + 1} (${b.pane.sym})`;
    showToast(`Skin „${spec.name}” · ${paneLbl}`, spec.desc || 'Indicatorii de pe acest grafic au fost înlocuiți conform profilului selectat.');
  }

  function saveCurrentAsIndicatorProfile(rawName, targetPane = getFocusedPaneObj()) {
    const cleanName = String(rawName || '').trim() || 'Profil Nou';
    const b = getPaneIndBucket(targetPane);
    const profiles = loadCustomIndicatorProfiles();
    const entry = {
      id: 'prof_' + cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: cleanName,
      indicators: { ...b.indicators },
      hiddenIndicators: { ...(b.hiddenIndicators || {}) },
      savedAt: Date.now()
    };
    const existIdx = profiles.findIndex(p => String(p.name).toLowerCase() === cleanName.toLowerCase());
    if (existIdx >= 0) profiles[existIdx] = entry;
    else profiles.unshift(entry);
    writeCustomIndicatorProfiles(profiles);
    renderIndicatorSkinsBar();
    renderIndicatorsModalList(document.getElementById('indModalSearch')?.value || '');
    syncAllPaneProfileTabs();
    const activeCnt = INDICATOR_DEFS.filter(d => b.indicators[d.key]).length;
    showToast(`Profil „${cleanName}” Salvat`, `Configurația curentă (${activeCnt} indicatori) este salvată pentru orice grafic.`);
  }

  function deleteCustomIndicatorProfile(id) {
    const profiles = loadCustomIndicatorProfiles().filter(p => p.id !== id);
    writeCustomIndicatorProfiles(profiles);
    renderIndicatorSkinsBar();
    syncAllPaneProfileTabs();
  }

  function renderIndicatorSkinsBar() {
    const box = document.getElementById('indSkinsChips');
    if (!box) return;
    const customProfiles = loadCustomIndicatorProfiles();
    const curBucket = getPaneIndBucket();
    const focusedId = curBucket.isPrimary ? 0 : curBucket.pane.id;

    const pasteHtml = (copiedPaneProfile && copiedPaneProfile.sourcePaneId !== focusedId)
      ? `<button type="button" class="ind-skin-chip active" id="indModalPasteChip" style="border-color:rgba(245,158,11,0.55);background:rgba(245,158,11,0.16);color:#fbbf24;" title="Preia profilul copiat de pe ${escTg(copiedPaneProfile.sourceSym)}">${ICO.paste}<span>Preia copiat: ${escTg(copiedPaneProfile.label)}</span></button>`
      : '';

    const customHtml = customProfiles.map(p => {
      const isAct = matchesIndicatorSnapshotForBucket(p.indicators, p.hiddenIndicators || {}, curBucket);
      const cnt = INDICATOR_DEFS.filter(d => p.indicators[d.key]).length;
      return `
        <div class="ind-skin-chip custom${isAct ? ' active' : ''}" title="Profil salvat „${escTg(p.name)}” (${cnt} indicatori)">
          <button type="button" class="ind-skin-use" data-apply-prof="${escTg(p.id)}"><span style="width:6px;height:6px;border-radius:50%;background:#fbbf24;display:inline-block;flex-shrink:0;"></span><span>${escTg(p.name)} (${cnt})</span></button>
          <button type="button" class="ind-skin-del" data-del-prof="${escTg(p.id)}" title="Șterge profilul ${escTg(p.name)}" aria-label="Șterge profil">${ICO.close}</button>
        </div>
      `;
    }).join('');

    const builtinHtml = BUILTIN_INDICATOR_SKINS.map(s => {
      const indMap = {};
      s.keys.forEach(k => { indMap[k] = true; });
      const isAct = matchesIndicatorSnapshotForBucket(indMap, {}, curBucket);
      return `
        <button type="button" class="ind-skin-chip${isAct ? ' active' : ''}" data-apply-skin="${s.id}" title="${escTg(s.desc)}">
          <span>${escTg(s.name)}${s.keys.length ? ` (${s.keys.length})` : ''}</span>
        </button>
      `;
    }).join('');

    box.innerHTML = pasteHtml + customHtml + builtinHtml;
    box.querySelector('#indModalPasteChip')?.addEventListener('click', () => {
      pasteCopiedProfileToPane(getFocusedPaneObj());
    });
    box.querySelectorAll('[data-apply-prof]').forEach(btn => {
      btn.onclick = () => {
        const hit = customProfiles.find(p => p.id === btn.dataset.applyProf);
        if (hit) applyIndicatorSkinOrProfile(hit);
      };
    });
    box.querySelectorAll('[data-del-prof]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        deleteCustomIndicatorProfile(btn.dataset.delProf);
      };
    });
    box.querySelectorAll('[data-apply-skin]').forEach(btn => {
      btn.onclick = () => {
        const hit = BUILTIN_INDICATOR_SKINS.find(s => s.id === btn.dataset.applySkin);
        if (hit) applyIndicatorSkinOrProfile(hit);
      };
    });
  }

  function renderIndModalPaneBar() {
    const bar = document.getElementById('indTargetPaneBar');
    if (!bar) return;
    const needed = getNeededSecPanesCount(state.layout);
    if (state.layout === '1' || needed <= 0) {
      bar.style.display = 'none';
      bar.innerHTML = '';
      return;
    }
    const curFocusId = Number(state.focusedPaneId || 0);
    const panes = [{ paneObj: null, id: 0 }];
    for (let i = 0; i < needed; i++) {
      panes.push({ paneObj: secPanes[i], id: secPanes[i].id });
    }
    bar.style.display = 'flex';
    bar.innerHTML = `<span class="ind-pane-bar-lbl">Ecran activ:</span>` + panes.map(item => {
      const meta = getPaneProfileMeta(item.paneObj);
      const actCls = curFocusId === meta.paneId ? ' active' : '';
      return `<button type="button" class="ind-pane-pill${actCls}" data-ind-target-pane="${meta.paneId}" title="Editează skin &amp; indicatori pentru Ecran #${meta.paneId + 1} (${escTg(meta.sym)})">#${meta.paneId + 1} ${escTg(meta.sym)} · ${escTg(meta.label)}</button>`;
    }).join('');
    bar.querySelectorAll('[data-ind-target-pane]').forEach(btn => {
      btn.onclick = () => {
        const pid = Number(btn.dataset.indTargetPane || 0);
        focusChartPane(pid);
        renderIndicatorsModalList(document.getElementById('indModalSearch')?.value || '');
      };
    });
  }

  function renderIndicatorsModalList(filterTxt = '') {
    const box = document.getElementById('indModalList');
    if (!box) return;
    const b = getPaneIndBucket();
    const paneBadge = document.getElementById('indTargetPaneBadge');
    if (paneBadge) {
      const skinLbl = getActiveSkinShortLabel(b.indicators, b.hiddenIndicators);
      paneBadge.textContent = b.isPrimary
        ? `Ecran #1 · ${state.symbol}${skinLbl ? ` · ${skinLbl}` : ''}`
        : `Ecran #${b.pane.id + 1} · ${b.pane.sym}${skinLbl ? ` · ${skinLbl}` : ''}`;
    }
    renderIndModalPaneBar();
    renderIndicatorSkinsBar();
    document.getElementById('indTabTop10Btn')?.classList.toggle('active', indModalTab === 'top10');
    document.getElementById('indTabAllBtn')?.classList.toggle('active', indModalTab === 'all');

    const f = filterTxt.trim().toLowerCase();
    const defByKey = new Map(INDICATOR_DEFS.map(d => [d.key, d]));
    let list;
    if (f) {
      list = INDICATOR_DEFS.filter(d => {
        const pm = PRO_TOP10_MAP.get(d.key);
        return d.name.toLowerCase().includes(f)
          || d.cat.toLowerCase().includes(f)
          || d.desc.toLowerCase().includes(f)
          || (pm && (pm.role.toLowerCase().includes(f) || pm.edge.toLowerCase().includes(f)));
      });
    } else if (indModalTab === 'top10') {
      list = PRO_TOP10_META.map(pm => defByKey.get(pm.key)).filter(Boolean);
    } else {
      const topSet = new Set(PRO_TOP10_META.map(pm => pm.key));
      const topPart = PRO_TOP10_META.map(pm => defByKey.get(pm.key)).filter(Boolean);
      const restPart = INDICATOR_DEFS.filter(d => !topSet.has(d.key));
      list = [...topPart, ...restPart];
    }

    const hdrBanner = (!f && indModalTab === 'top10')
      ? `<div style="padding:8px 14px 4px;font-size:10.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.02em;">TOP 10 INDICATORI SMART · BEST PRACTICES TRADING PROFESIONIST</div>`
      : '';

    box.innerHTML = hdrBanner + (list.map(d => {
      const added = !!b.indicators[d.key];
      const vis = isBucketIndVisible(b.indicators, b.hiddenIndicators, d.key);
      const pm = PRO_TOP10_MAP.get(d.key);
      const statusCls = vis ? 'pill-buy' : (added ? 'pill-warn' : 'pill-neut');
      const statusTxt = vis ? `${ICO.check} ACTIV` : (added ? 'OFF (pe listă)' : `${ICO.plus} Adaugă`);
      return `
        <div class="ind-lib-row ${vis ? 'active' : ''}" data-indkey="${d.key}">
          <div style="min-width:0;padding-right:10px;">
            <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
              ${pm ? `<span class="ind-rank-pill tabular">#${pm.rank}</span>` : ''}
              <span style="width:9px;height:9px;border-radius:50%;background:${d.color};display:inline-block;flex-shrink:0;"></span>
              <span style="font-weight:800;color:var(--text-bright);font-size:12.5px;">${d.name}</span>
              <span class="pill pill-neut">${pm ? pm.role : d.cat}</span>
            </div>
            <div class="ind-pro-tip">${pm ? pm.edge : d.desc}</div>
          </div>
          <span class="pill ${statusCls}" style="flex-shrink:0;">${statusTxt}</span>
        </div>
      `;
    }).join('') || `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">Niciun indicator găsit pentru „${escTg(filterTxt)}”.</div>`);

    box.querySelectorAll('[data-indkey]').forEach(row => {
      row.onclick = () => toggleIndicator(row.dataset.indkey);
    });
  }

  // ─── SAVED WORKSPACE ARRANGEMENTS (LAYOUT + SYMBOLS + INDIVIDUAL SKINS) ──
  const WORKSPACE_ARR_STORAGE_KEY = 'tp_ultra_arrangements_v1';

  function loadWorkspaceArrangements() {
    try {
      const arr = JSON.parse(getScopedItem(WORKSPACE_ARR_STORAGE_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(a => a && a.name && a.layout) : [];
    } catch (_) {
      return [];
    }
  }

  function writeWorkspaceArrangements(arr) {
    setScopedItem(WORKSPACE_ARR_STORAGE_KEY, JSON.stringify(arr || []));
  }

  function matchesWorkspaceArrangement(arr) {
    if (!arr || arr.layout !== state.layout) return false;
    if (arr.primary?.sym && normalizeSymbol(arr.primary.sym) !== state.symbol) return false;
    const needed = getNeededSecPanesCount(arr.layout);
    const savedPanes = Array.isArray(arr.panes) ? arr.panes : [];
    for (let i = 0; i < needed; i++) {
      const cur = secPanes[i];
      const sp = savedPanes.find(x => Number(x.id) === cur.id);
      if (sp?.sym && normalizeSymbol(sp.sym) !== cur.sym) return false;
    }
    return true;
  }

  function renderWorkspaceArrangementsUI() {
    const box = document.getElementById('layoutArrChips');
    if (!box) return;
    const list = loadWorkspaceArrangements();
    if (!list.length) {
      box.innerHTML = `<div class="layout-arr-empty">Salvează configurația curentă (ecrane + simboluri + skin-uri) cu un nume mai sus.</div>`;
      return;
    }
    box.innerHTML = list.map(a => {
      const totalPanes = getNeededSecPanesCount(a.layout) + 1;
      const isAct = matchesWorkspaceArrangement(a);
      const previewSyms = [a.primary?.sym || state.symbol, ...(a.panes || []).slice(0, 3).map(x => x.sym)].filter(Boolean).join(', ');
      return `
        <div class="layout-arr-chip${isAct ? ' active' : ''}" title="${escTg(a.name)} (${totalPanes} ecrane: ${escTg(previewSyms)})">
          <button type="button" class="layout-arr-use" data-apply-arr="${escTg(a.id)}">
            <span class="ind-leg-dot" style="background:${isAct ? '#34d399' : '#3b82f6'}"></span>
            <span>${escTg(a.name)} · ${totalPanes}E</span>
          </button>
          <button type="button" class="ind-skin-del" data-del-arr="${escTg(a.id)}" title="Șterge aranjamentul ${escTg(a.name)}" aria-label="Șterge aranjament">${ICO.close}</button>
        </div>
      `;
    }).join('');
    box.querySelectorAll('[data-apply-arr]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const hit = list.find(x => x.id === btn.dataset.applyArr);
        if (hit) applyWorkspaceArrangement(hit);
      };
    });
    box.querySelectorAll('[data-del-arr]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        deleteWorkspaceArrangement(btn.dataset.delArr);
      };
    });
  }

  function saveCurrentWorkspaceArrangement(rawName) {
    const needed = getNeededSecPanesCount(state.layout);
    const cleanName = String(rawName || '').trim() || `Setup ${needed + 1} Ecrane`;
    const list = loadWorkspaceArrangements();
    const entry = {
      id: 'arr_' + cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: cleanName,
      layout: state.layout,
      syncMultiTf: !!state.syncMultiTf,
      focusedPaneId: Number(state.focusedPaneId || 0),
      primary: {
        sym: state.symbol,
        tf: state.tf,
        chartType: state.chartType,
        indicators: { ...state.indicators },
        hiddenIndicators: { ...(state.hiddenIndicators || {}) }
      },
      panes: secPanes.slice(0, needed).map(p => ({
        id: p.id,
        sym: p.sym,
        tf: p.tf,
        indicators: { ...p.indicators },
        hiddenIndicators: { ...(p.hiddenIndicators || {}) }
      })),
      savedAt: Date.now()
    };
    const existIdx = list.findIndex(a => String(a.name).toLowerCase() === cleanName.toLowerCase());
    if (existIdx >= 0) list[existIdx] = entry;
    else list.unshift(entry);
    writeWorkspaceArrangements(list);
    wirePaneBarDoubleClick(document.getElementById('tvLegendBox'), 0);
    wirePaneBarDoubleClick(document.getElementById('primaryPfStrip'), 0);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && zoomedPaneId !== null) {
        clearPaneFullscreen();
        resizeAllCharts();
        requestAnimationFrame(resizeAllCharts);
      }
    });
    renderWorkspaceArrangementsUI();
    showToast(`Aranjament „${cleanName}” Salvat`, `${needed + 1} ecrane cu simbolurile, intervalele și skin-urile lor individuale sunt salvate.`);
  }

  async function applyWorkspaceArrangement(arr) {
    if (!arr) return;
    document.getElementById('layoutMenu')?.classList.remove('open');

    state.syncMultiTf = !!arr.syncMultiTf;
    localStorage.setItem('tp_ultra_synctf', state.syncMultiTf ? '1' : '0');
    document.getElementById('syncChartsToggle')?.classList.toggle('active', state.syncMultiTf);

    if (arr.primary?.indicators) {
      const nextPri = {};
      INDICATOR_DEFS.forEach(d => { nextPri[d.key] = !!arr.primary.indicators[d.key]; });
      state.indicators = nextPri;
      state.hiddenIndicators = { ...(arr.primary.hiddenIndicators || {}) };
      saveIndicatorsState();
    }

    if (Array.isArray(arr.panes)) {
      arr.panes.forEach(sp => {
        const hit = secPanes.find(x => x.id === Number(sp.id));
        if (!hit) return;
        if (sp.sym) hit.sym = normalizeSymbol(sp.sym);
        if (sp.tf) hit.tf = String(sp.tf).trim();
        if (sp.indicators) hit.indicators = { ...createDefaultSecondaryIndicators(), ...sp.indicators };
        hit.hiddenIndicators = { ...(sp.hiddenIndicators || {}) };
      });
    }

    state.focusedPaneId = Number(arr.focusedPaneId || 0);
    saveSecondaryPanes();

    if (arr.primary?.chartType && arr.primary.chartType !== state.chartType) {
      state.chartType = arr.primary.chartType;
      localStorage.setItem('tp_ultra_chartType', state.chartType);
      document.querySelectorAll('[data-charttype]').forEach(i => i.classList.toggle('active', i.dataset.charttype === state.chartType));
    }

    const tgtSym = arr.primary?.sym ? normalizeSymbol(arr.primary.sym) : state.symbol;
    const tgtTf = arr.primary?.tf || state.tf;
    const priChanged = tgtSym !== state.symbol || tgtTf !== state.tf;

    await setMultiChartLayout(arr.layout || '1');
    if (priChanged) {
      await loadSymbol(tgtSym, tgtTf);
    } else {
      renderChartAndQuant(false);
    }
    renderWorkspaceArrangementsUI();
    syncAllPaneProfileTabs();
    showToast(`Aranjament „${arr.name}” Activat`, `${getNeededSecPanesCount(state.layout) + 1} ecrane și skin-urile individuale au fost încărcate.`);
  }

  function deleteWorkspaceArrangement(id) {
    writeWorkspaceArrangements(loadWorkspaceArrangements().filter(a => a.id !== id));
    renderWorkspaceArrangementsUI();
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
      <div class="ai-fc-kpi-grid">
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
              <div class="ai-news-list">${idea.news.map(n => {
      const dtStr = formatNewsDateBadge(n, { compact: false });
      const pubTxt = dtStr ? `${n.publisher || 'Știri'} · ${dtStr}` : (n.publisher || 'Știri');
      return `
                <a class="ai-news-item" href="${escTg(n.link || '#')}" target="_blank" rel="noopener noreferrer" title="${escTg(pubTxt)}">
                  <span class="ai-news-title">${escTg(n.title || '')}</span>
                  <span class="ai-news-src">${escTg(pubTxt)}</span>
                </a>
              `;
    }).join('')}</div>
            ` : `<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px;">Se încarcă știrile și catalizatorii fundamentali...</div>`}
          </div>
        </div>
      ` : ''}
      <div style="background:var(--bg-chart);border:1px solid var(--border);border-radius:var(--r-card);padding:12px;margin-bottom:14px;">
        <div style="font-size:10.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Suprapunere Grafică: Preț Curent + Scenarii Istorice k-NN + Niveluri TP/SL</div>
        <canvas id="deepFcCanvas" style="width:100%;height:230px;display:block;"></canvas>
      </div>
      <div class="ai-fc-analogs-grid">
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
    if (tool !== 'cursor') {
      const expPop = document.getElementById('chartExplainPopover');
      if (expPop) expPop.style.display = 'none';
      document.getElementById('mainChartStage')?.classList.remove('hit-hover');
    }
    updateDrawToolUI(tool);
  }

  function updateDrawToolUI(tool) {
    document.querySelectorAll('[data-drawtool]').forEach(b => {
      b.classList.toggle('active', b.dataset.drawtool === tool);
    });
  }

  // Context Menu
  function openContextMenu(x, y, secPane = null) {
    const menu = document.getElementById('chartCtxMenu');
    state.ctxPaneId = secPane ? secPane.id : 0;
    const targetSym = secPane ? secPane.sym : state.symbol;
    const targetBars = secPane ? (secPane.bars || []) : state.bars;
    const p = state.ctxPrice || (targetBars.length ? targetBars[targetBars.length - 1].close : 0);
    state.ctxPrice = p;
    document.getElementById('ctxPriceSpan').textContent = fmt(p);
    document.getElementById('ctxAlertSpan').textContent = fmt(p);
    document.getElementById('ctxBuySpan').textContent = `${targetSym} @ ${fmt(p)}`;
    document.getElementById('ctxSellSpan').textContent = `${targetSym} @ ${fmt(p)}`;
    const ctxWlSpan = document.getElementById('ctxWatchlistSpan');
    if (ctxWlSpan) {
      const inWl = isSymbolInWatchlist(targetSym);
      ctxWlSpan.textContent = inWl
        ? `Elimină ${targetSym} din Watchlist`
        : `Adaugă ${targetSym} în Watchlist`;
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
      else if (mins < 240 || (dow <= 4 && mins >= 1200)) { lbl = 'OVERNIGHT'; dot = 'amber'; }
    } else if (dow === 0 && mins >= 1200) {
      lbl = 'OVERNIGHT'; dot = 'amber';
    } else {
      lbl = 'WEEKEND (CRYPTO 24/7)';
    }

    const dotEl = document.getElementById('mktSessionDot');
    const txtEl = document.getElementById('mktSessionText');
    if (dotEl) dotEl.className = `status-dot ${dot}`;
    if (txtEl && txtEl.textContent !== lbl) {
      txtEl.textContent = lbl;
      scheduleTopbarFit();
    }
  }

  // ─── 18. AUTHENTICATION, PERSONAL+GENERAL SYNC & WIRE DOM EVENTS ──────────
  async function authApiRequest(urlPath, { method = 'GET', body = null, token = authState.token } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== null) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(urlPath, {
      method,
      headers,
      cache: 'no-store',
      body: body !== null ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'Răspuns invalid de la server.' }));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Eroare HTTP ${res.status}`);
    }
    return data;
  }

  function getDrawingPrefixForUser(uid = authState.user?.id) {
    return uid ? `tp_u_${uid}_drawings_` : 'tp_ultra_drawings_';
  }

  function collectCurrentDrawingsMap(uid = authState.user?.id) {
    const prefix = getDrawingPrefixForUser(uid);
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const sym = k.slice(prefix.length);
        if (!sym) continue;
        const parsed = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(parsed) && parsed.length) out[sym] = parsed;
      }
    } catch (_) { }
    return out;
  }

  function collectCurrentWorkspaceSnapshot() {
    let journalArr = [];
    try { journalArr = JSON.parse(getScopedItem('tp_ultra_journal') || '[]'); } catch (_) { }
    return {
      watchlist: (state.watchlist || []).map(w => ({ sym: w.sym, name: w.name, source: w.source })),
      settings: {
        symbol: state.symbol,
        tf: state.tf,
        chartType: state.chartType,
        theme: state.theme,
        layout: state.layout,
        focusedPaneId: Number(state.focusedPaneId || 0),
        rightPage: state.rightPage,
        rightCollapsed: !!state.rightCollapsed,
        extHours: !!state.extHours,
        syncMultiTf: !!state.syncMultiTf,
        indicators: { ...state.indicators },
        hiddenIndicators: { ...(state.hiddenIndicators || {}) },
        indicatorProfiles: loadCustomIndicatorProfiles(),
        secPanes: secPanes.map(p => ({
          id: p.id,
          sym: p.sym,
          tf: p.tf,
          indicators: { ...p.indicators },
          hiddenIndicators: { ...(p.hiddenIndicators || {}) }
        })),
        arrangements: loadWorkspaceArrangements(),
        activePortfolio: state.activePortfolio,
        portfolios: state.portfolios,
        alerts: state.alerts,
        journal: journalArr
      },
      drawingsBySym: collectCurrentDrawingsMap()
    };
  }

  const GUEST_RESET_KEYS = [
    'tp_ultra_symbol', 'tp_ultra_tf', 'tp_ultra_chartType', 'tp_ultra_theme',
    'tp_ultra_layout', 'tp_ultra_focused_pane', 'tp_ultra_rpage', 'tp_ultra_rp_collapsed',
    'tp_ultra_eth_v3', 'tp_ultra_synctf', 'tp_ultra_active_pf',
    'tp_ultra_inds_v3', 'tp_ultra_hidden_inds_v1', IND_PROFILES_STORAGE_KEY,
    'tp_ultra_secpanes_v1', WORKSPACE_ARR_STORAGE_KEY,
    'tp_ultra_watchlist_v4', 'tp_ultra_watchlist', 'tradepro_watchlist_v2',
    'tp_ultra_alerts', 'tradepro_alerts_v1',
    'tp_ultra_portfolios_v1', 'tp_ultra_paper', 'tp_ultra_journal', 'tp_wl_panel_h'
  ];

  function readGuestJson(key, fallbackVal = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackVal;
    } catch (_) {
      return fallbackVal;
    }
  }

  function collectGuestBrowserSnapshot(generalWatchlist = []) {
    const genSet = new Set((generalWatchlist || []).map(x => String(x.sym || '').toUpperCase()));
    const rawWl = readGuestJson('tp_ultra_watchlist_v4', null)
      || readGuestJson('tp_ultra_watchlist', null)
      || DEFAULT_WATCHLIST;
    const watchlist = (Array.isArray(rawWl) ? rawWl : []).map(w => {
      const sym = String(typeof w === 'string' ? w : (w?.sym || '')).trim().toUpperCase();
      return {
        sym,
        name: (typeof w === 'object' && w?.name) ? w.name : sym,
        source: genSet.size ? (genSet.has(sym) ? 'general' : 'personal') : 'personal'
      };
    }).filter(x => x.sym);

    return {
      watchlist,
      settings: {
        symbol: localStorage.getItem('tp_ultra_symbol') || state.symbol || 'SPY',
        tf: localStorage.getItem('tp_ultra_tf') || state.tf || '30m',
        chartType: localStorage.getItem('tp_ultra_chartType') || 'candles',
        theme: localStorage.getItem('tp_ultra_theme') || 'dark',
        layout: localStorage.getItem('tp_ultra_layout') || '1',
        focusedPaneId: Number(localStorage.getItem('tp_ultra_focused_pane') || 0) || 0,
        rightPage: localStorage.getItem('tp_ultra_rpage') || 'watchlist',
        rightCollapsed: localStorage.getItem('tp_ultra_rp_collapsed') === '1',
        extHours: localStorage.getItem('tp_ultra_eth_v3') !== '0',
        syncMultiTf: localStorage.getItem('tp_ultra_synctf') === '1',
        indicators: readGuestJson('tp_ultra_inds_v3', state.indicators),
        hiddenIndicators: readGuestJson('tp_ultra_hidden_inds_v1', {}),
        indicatorProfiles: readGuestJson(IND_PROFILES_STORAGE_KEY, []),
        secPanes: readGuestJson('tp_ultra_secpanes_v1', []),
        arrangements: readGuestJson(WORKSPACE_ARR_STORAGE_KEY, []),
        activePortfolio: localStorage.getItem('tp_ultra_active_pf') || 'p1',
        portfolios: readGuestJson('tp_ultra_portfolios_v1', null),
        alerts: readGuestJson('tp_ultra_alerts', []),
        journal: readGuestJson('tp_ultra_journal', [])
      },
      drawingsBySym: collectCurrentDrawingsMap(null)
    };
  }

  function hasCustomGuestSetup(generalWatchlist = []) {
    try {
      const profs = readGuestJson(IND_PROFILES_STORAGE_KEY, []);
      const arrs = readGuestJson(WORKSPACE_ARR_STORAGE_KEY, []);
      if ((Array.isArray(profs) && profs.length > 0) || (Array.isArray(arrs) && arrs.length > 0)) return true;
      const gWl = readGuestJson('tp_ultra_watchlist_v4', []);
      if (Array.isArray(gWl) && gWl.length > 0) {
        const genSet = new Set((generalWatchlist || []).map(x => String(x.sym || '').toUpperCase()));
        if (gWl.some(w => w && w.sym && !genSet.has(String(w.sym).toUpperCase()))) return true;
      }
      if ((localStorage.getItem('tp_ultra_layout') || '1') !== '1') return true;
      if (Object.keys(collectCurrentDrawingsMap(null)).length > 0) return true;
    } catch (_) { }
    return false;
  }

  function resetGuestBrowserStorageToGeneral(generalState) {
    try {
      GUEST_RESET_KEYS.forEach(k => localStorage.removeItem(k));
      const toDel = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('tp_ultra_drawings_')) toDel.push(k);
      }
      toDel.forEach(k => localStorage.removeItem(k));

      if (generalState && Array.isArray(generalState.watchlist) && generalState.watchlist.length) {
        const gWl = generalState.watchlist.map(w => ({ sym: w.sym, name: w.name, source: 'general' }));
        localStorage.setItem('tp_ultra_watchlist_v4', JSON.stringify(gWl));
      }
      const gs = generalState?.settings || {};
      if (gs.symbol) localStorage.setItem('tp_ultra_symbol', gs.symbol);
      if (gs.tf) localStorage.setItem('tp_ultra_tf', gs.tf);
      if (gs.layout) localStorage.setItem('tp_ultra_layout', gs.layout);
      if (gs.indicators) localStorage.setItem('tp_ultra_inds_v3', JSON.stringify(gs.indicators));
    } catch (_) { }
  }

  function updateAuthAccountUI() {
    const u = authState.user;
    const isAdmin = u?.role === 'admin';
    const pill = document.getElementById('authAccountBtn');
    const av = document.getElementById('authAvatarBadge');
    const lbl = document.getElementById('authBtnLbl');
    if (pill) {
      pill.classList.toggle('is-authed', !!u);
      pill.title = u
        ? `Cont activ: @${u.username} (${u.email})${isAdmin ? ' · ADMIN' : ''}`
        : 'Autentificare · Conectează-te cu username/email și parolă sau Google (Gmail)';
    }
    if (av) {
      if (u && String(u.username || '').toLowerCase() === 'jeka7ro') {
        av.innerHTML = `<img src="/avatar-jeka7ro.jpg" alt="@jeka7ro" class="auth-avatar-img" />`;
      } else {
        av.textContent = u ? String(u.username || 'U').charAt(0).toUpperCase() : 'G';
      }
    }
    if (lbl) lbl.textContent = u ? `@${u.username}` : 'Conectare';

    const guestView = document.getElementById('authGuestView');
    const modalTitle = document.getElementById('authModalTitle');
    if (guestView) guestView.style.display = 'flex';
    if (modalTitle) modalTitle.textContent = 'Conectează-te la contul tău';
    if (!u) document.getElementById('authAccountMenu')?.classList.remove('open');

    document.querySelectorAll('[data-admin-only="1"]').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
    const roleBadge = document.getElementById('authUserRoleBadge');
    if (roleBadge) {
      roleBadge.textContent = isAdmin ? 'ADMIN' : 'Sincronizat';
      roleBadge.className = `pill ${isAdmin ? 'pill-admin' : 'pill-buy'}`;
    }

    if (u) {
      const genSet = new Set((authState.generalState?.watchlist || DEFAULT_WATCHLIST).map(x => String(x.sym).toUpperCase()));
      const personalCnt = (state.watchlist || []).filter(w => w.source === 'personal' || !genSet.has(String(w.sym).toUpperCase())).length;
      const generalCnt = Math.max(0, (state.watchlist || []).length - personalCnt);
      const uAv = document.getElementById('authUserAvatar');
      const uName = document.getElementById('authUserName');
      const uMail = document.getElementById('authUserEmail');
      if (uAv) {
        if (String(u.username || '').toLowerCase() === 'jeka7ro') {
          uAv.innerHTML = `<img src="/avatar-jeka7ro.jpg" alt="@jeka7ro" class="auth-avatar-img" />`;
        } else {
          uAv.textContent = String(u.username || 'U').charAt(0).toUpperCase();
        }
      }
      if (uName) uName.textContent = `@${u.username}`;
      if (uMail) uMail.textContent = u.email || '—';
      const stP = document.getElementById('authStatPersonal');
      const stG = document.getElementById('authStatGeneral');
      const stPr = document.getElementById('authStatProfiles');
      const stAr = document.getElementById('authStatLayouts');
      if (stP) stP.textContent = String(personalCnt);
      if (stG) stG.textContent = String(generalCnt);
      if (stPr) stPr.textContent = String(loadCustomIndicatorProfiles().length);
      if (stAr) stAr.textContent = String(loadWorkspaceArrangements().length);

      const claimBtn = document.getElementById('authClaimGuestBtn');
      if (claimBtn) {
        const showClaim = hasCustomGuestSetup(authState.generalState?.watchlist || []);
        claimBtn.style.display = showClaim ? 'flex' : 'none';
      }
    }
    scheduleTopbarFit();
  }

  let _liveEnginesStarted = false;
  function startLiveDataAndEnginesOnce() {
    if (_liveEnginesStarted || !authState.user) return;
    _liveEnginesStarted = true;
    try {
      const cachedWlQ = JSON.parse(localStorage.getItem('tp_watchlist_quotes_cache_v1') || '{}');
      Object.entries(cachedWlQ).forEach(([k, v]) => {
        if (v && isFinite(v.price) && !liveQuoteCache[k]) {
          applyLiveTick(k, v.price, v);
        }
      });
    } catch (_) { }
    connectYahooLiveStream();
    connectBinanceLiveStream();
    refreshLiveQuotes();
    setInterval(() => {
      if (!document.hidden && authState.user) refreshLiveQuotes();
    }, 1500);
    setInterval(() => {
      try {
        const snap = {};
        (state.watchlist || []).forEach(w => {
          const lq = liveQuoteCache[w.sym];
          if (lq && isFinite(lq.price)) {
            snap[w.sym] = {
              price: lq.price,
              regPrice: lq.regPrice ?? lq.price,
              regChg: lq.regChg ?? 0,
              regChgPct: lq.regChgPct ?? 0,
              prevClose: lq.prevClose ?? lq.price
            };
          }
        });
        if (Object.keys(snap).length > 0) {
          localStorage.setItem('tp_watchlist_quotes_cache_v1', JSON.stringify(snap));
        }
      } catch (_) { }
    }, 6000);
    setInterval(() => {
      if (!document.hidden && authState.user) syncActiveChartBarsBackground();
    }, 15000);
    renderTopOppsRadar();
    setTimeout(() => { if (authState.user) fetchTopMarketOpportunities(false); }, 900);
    setInterval(() => {
      if (!document.hidden && authState.user && !state.topOppsLoading) fetchTopMarketOpportunities(false);
    }, 90000);
  }

  function setAuthGateLocked(locked, message = '', isInfo = false) {
    document.documentElement.classList.remove('auth-locked-boot');
    document.body.classList.toggle('auth-required', !!locked);
    const modal = document.getElementById('authModal');
    const errEl = document.getElementById('authFormErr');
    if (locked) {
      document.querySelectorAll('.tv-modal-backdrop').forEach(m => {
        if (m.id !== 'authModal') m.classList.remove('open');
      });
      if (modal) {
        modal.classList.add('open', 'is-locked');
      }
      if (errEl) {
        errEl.textContent = message || '';
        errEl.classList.toggle('info', !!isInfo);
        errEl.style.display = message ? 'block' : 'none';
      }
      setTimeout(() => {
        if (!authState.user) {
          document.getElementById('authLoginId')?.focus();
        }
      }, 60);
    } else {
      if (modal) {
        modal.classList.remove('is-locked');
      }
    }
  }

  function scheduleAuthServerSync() {
    if (!authState.token || !authState.user || authState.suppressSync) return;
    clearTimeout(authState.syncTimer);
    authState.syncTimer = setTimeout(() => {
      flushAuthServerSync(false);
    }, 650);
  }

  async function flushAuthServerSync(showToastOk = false) {
    if (!authState.token || !authState.user) return;
    clearTimeout(authState.syncTimer);
    try {
      const res = await authApiRequest('/api/auth/state', {
        method: 'PUT',
        body: { snapshot: collectCurrentWorkspaceSnapshot() }
      });
      authState.generalState = res.generalState || authState.generalState;
      authState.personalState = res.personalState || authState.personalState;
      try { localStorage.setItem(scopedKey('tp_ultra_last_sync_ts'), String(res.personalState?.updatedAt || Date.now())); } catch (_) { }
      updateAuthAccountUI();
      if (showToastOk) {
        showToast('Cont Sincronizat', `Simbolurile și setările pentru @${authState.user.username} au fost salvate.`, 'buy');
      }
    } catch (e) {
      if (showToastOk) showToast('Eroare Sincronizare', e.message, 'sell');
    }
  }

  async function applyAccountBundleToWorkspace(bundle, { reloadCharts = true } = {}) {
    authState.suppressSync = true;
    try {
      if (bundle?.token !== undefined) {
        authState.token = bundle.token || '';
        if (authState.token) localStorage.setItem(AUTH_TOKEN_KEY, authState.token);
        else localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      authState.user = bundle?.user || null;
      if (authState.user) localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(authState.user));
      else localStorage.removeItem(AUTH_USER_CACHE_KEY);

      if (bundle?.generalState) authState.generalState = bundle.generalState;
      authState.personalState = bundle?.personalState || null;
      authState.realPortfolio = authState.user
        ? (bundle?.mergedState?.realPortfolio || bundle?.personalState?.realPortfolio || null)
        : null;
      window.dispatchEvent(new CustomEvent('tp:realPortfolioUpdated', {
        detail: { userId: authState.user?.id || null, realPortfolio: authState.realPortfolio }
      }));

      const merged = bundle?.mergedState || {};
      const genSettings = authState.generalState?.settings || {};
      let srcSettings = merged.settings || genSettings;
      let srcWatchlist = merged.watchlist || authState.generalState?.watchlist || DEFAULT_WATCHLIST;

      if (!authState.user) {
        // Restore guest/general workspace from local general keys when logged out
        try {
          const gw = JSON.parse(localStorage.getItem('tp_ultra_watchlist_v4') || 'null');
          if (Array.isArray(gw) && gw.length) srcWatchlist = gw;
        } catch (_) { }
        const gRead = (k, defVal) => {
          const v = localStorage.getItem(k);
          return v !== null ? v : defVal;
        };
        const safeJson = (k, defObj) => {
          try { const p = JSON.parse(localStorage.getItem(k) || 'null'); return p ?? defObj; } catch (_) { return defObj; }
        };
        srcSettings = {
          ...genSettings,
          symbol: gRead('tp_ultra_symbol', genSettings.symbol || 'NVDA'),
          tf: gRead('tp_ultra_tf', genSettings.tf || '30m'),
          chartType: gRead('tp_ultra_chartType', genSettings.chartType || 'candles'),
          theme: gRead('tp_ultra_theme', genSettings.theme || 'dark'),
          layout: gRead('tp_ultra_layout', genSettings.layout || '1'),
          focusedPaneId: Number(gRead('tp_ultra_focused_pane', '0')) || 0,
          rightPage: gRead('tp_ultra_rpage', genSettings.rightPage || 'watchlist'),
          rightCollapsed: gRead('tp_ultra_rp_collapsed', '0') === '1',
          extHours: gRead('tp_ultra_eth_v3', '1') !== '0',
          syncMultiTf: gRead('tp_ultra_synctf', '0') === '1',
          indicators: safeJson('tp_ultra_inds_v3', genSettings.indicators || state.indicators),
          hiddenIndicators: safeJson('tp_ultra_hidden_inds_v1', {}),
          indicatorProfiles: safeJson(IND_PROFILES_STORAGE_KEY, []),
          secPanes: safeJson('tp_ultra_secpanes_v1', []),
          arrangements: safeJson(WORKSPACE_ARR_STORAGE_KEY, []),
          activePortfolio: gRead('tp_ultra_active_pf', 'p1'),
          portfolios: safeJson('tp_ultra_portfolios_v1', null),
          alerts: safeJson('tp_ultra_alerts', [])
        };
      }

      if (Array.isArray(srcWatchlist) && srcWatchlist.length) {
        state.watchlist = srcWatchlist.map(w => ({ sym: String(w.sym).toUpperCase(), name: w.name || w.sym, source: w.source }));
        setScopedItem('tp_ultra_watchlist_v4', JSON.stringify(state.watchlist));
        setScopedItem('tp_ultra_watchlist', JSON.stringify(state.watchlist));
      }

      state.symbol = normalizeSymbol(srcSettings.symbol || 'NVDA') || 'NVDA';
      state.tf = String(srcSettings.tf || '30m');
      state.chartType = String(srcSettings.chartType || 'candles');
      state.theme = srcSettings.theme === 'light' ? 'light' : 'dark';
      state.layout = String(srcSettings.layout || '1');
      state.focusedPaneId = Number(srcSettings.focusedPaneId || 0) || 0;
      state.rightPage = String(srcSettings.rightPage || 'watchlist');
      state.rightCollapsed = !!srcSettings.rightCollapsed;
      state.extHours = srcSettings.extHours !== false;
      state.syncMultiTf = !!srcSettings.syncMultiTf;

      if (srcSettings.indicators && typeof srcSettings.indicators === 'object') {
        INDICATOR_DEFS.forEach(d => { state.indicators[d.key] = !!srcSettings.indicators[d.key]; });
      }
      state.hiddenIndicators = { ...(srcSettings.hiddenIndicators || {}) };
      setScopedItem('tp_ultra_symbol', state.symbol);
      setScopedItem('tp_ultra_tf', state.tf);
      setScopedItem('tp_ultra_chartType', state.chartType);
      setScopedItem('tp_ultra_layout', state.layout);
      setScopedItem('tp_ultra_eth_v3', state.extHours ? '1' : '0');
      setScopedItem('tp_ultra_synctf', state.syncMultiTf ? '1' : '0');
      saveIndicatorsState();

      writeCustomIndicatorProfiles(Array.isArray(srcSettings.indicatorProfiles) ? srcSettings.indicatorProfiles : []);
      writeWorkspaceArrangements(Array.isArray(srcSettings.arrangements) ? srcSettings.arrangements : []);
      state.alerts = Array.isArray(srcSettings.alerts) ? srcSettings.alerts : [];
      saveAlerts();
      if (Array.isArray(srcSettings.journal)) {
        setScopedItem('tp_ultra_journal', JSON.stringify(srcSettings.journal.slice(0, 80)));
      }
      const defPfs = createDefaultPortfolios();
      state.portfolios = (srcSettings.portfolios && typeof srcSettings.portfolios === 'object')
        ? { ...defPfs, ...srcSettings.portfolios }
        : defPfs;
      state.activePortfolio = srcSettings.activePortfolio && state.portfolios[srcSettings.activePortfolio] ? srcSettings.activePortfolio : 'p1';
      state.paper = state.portfolios[state.activePortfolio] || state.portfolios.p1;
      savePaper();

      const savedPanes = Array.isArray(srcSettings.secPanes) ? srcSettings.secPanes : [];
      secPanes.forEach(p => {
        const sp = savedPanes.find(x => Number(x?.id) === p.id);
        const defPane = SEC_PANE_DEFAULTS.find(x => x.id === p.id);
        if (sp) {
          if (sp.sym) p.sym = String(sp.sym).trim().toUpperCase();
          if (sp.tf) p.tf = String(sp.tf).trim();
          p.indicators = (sp.indicators && typeof sp.indicators === 'object')
            ? { ...createDefaultSecondaryIndicators(), ...sp.indicators }
            : createDefaultSecondaryIndicators();
          p.hiddenIndicators = { ...(sp.hiddenIndicators || {}) };
        } else {
          if (defPane) { p.sym = defPane.sym; p.tf = defPane.tf; }
          p.indicators = createDefaultSecondaryIndicators();
          p.hiddenIndicators = {};
        }
      });
      saveSecondaryPanes();

      if (authState.user && merged.drawingsBySym && typeof merged.drawingsBySym === 'object') {
        const pref = getDrawingPrefixForUser(authState.user.id);
        Object.entries(merged.drawingsBySym).forEach(([symKey, arr]) => {
          if (Array.isArray(arr)) {
            try { localStorage.setItem(`${pref}${symKey}`, JSON.stringify(arr.slice(-50))); } catch (_) { }
          }
        });
      }
      if (overlayEngine && typeof overlayEngine.setStorageScope === 'function') {
        overlayEngine.setStorageScope(getDrawingPrefixForUser(authState.user?.id));
      }

      if (authState.user) {
        try { localStorage.setItem(scopedKey('tp_ultra_last_sync_ts'), String(authState.personalState?.updatedAt || Date.now())); } catch (_) { }
      }

      // Refresh live UI elements immediately
      applyTheme(state.theme);
      applyRightSidebarState(state.rightPage, state.rightCollapsed);
      const pfSel = document.getElementById('portfolioSelect');
      if (pfSel) pfSel.value = state.activePortfolio;
      const balInp = document.getElementById('calcBalanceInput');
      const rskInp = document.getElementById('calcRiskPctInput');
      if (balInp) balInp.value = state.paper.balance;
      if (rskInp) rskInp.value = state.paper.riskPct;
      document.getElementById('extHoursBtn')?.classList.toggle('active', !!state.extHours);
      document.getElementById('extHoursMenuToggle')?.classList.toggle('active', !!state.extHours);
      document.getElementById('syncChartsToggle')?.classList.toggle('active', !!state.syncMultiTf);
      document.querySelectorAll('[data-charttype]').forEach(i => i.classList.toggle('active', i.dataset.charttype === state.chartType));

      renderWatchlist();
      renderLiveIndicesStrip();
      renderAlertsList();
      renderPaperPositions();
      renderWorkspaceArrangementsUI();
      syncQuickTopbarIndBtns();
      syncAllPaneProfileTabs();
      syncLiveStreamSubscriptions();
      updateAuthAccountUI();

      if (reloadCharts) {
        await setMultiChartLayout(state.layout);
        await loadSymbol(state.symbol, state.tf);
      }
    } finally {
      authState.suppressSync = false;
    }
  }

  async function hydrateAuthSessionOnBoot(pendingErr = '', { justOAuthLogin = false } = {}) {
    if (!authState.token) {
      updateAuthAccountUI();
      setAuthGateLocked(true, pendingErr || '');
      return;
    }
    try {
      let res = await authApiRequest('/api/auth/me', { method: 'GET' });
      authState.generalState = res.generalState || null;
      if (res.authenticated && res.user) {
        // Auto-migrate previous guest browser setup if logging into a brand-new empty Google account
        const pWl = res.personalState?.customWatchlist || [];
        const pProfs = res.personalState?.settings?.indicatorProfiles || [];
        const pArrs = res.personalState?.settings?.arrangements || [];
        const isEmptyPersonal = !pWl.length && !pProfs.length && !pArrs.length;
        if (isEmptyPersonal && hasCustomGuestSetup(res.generalState?.watchlist || [])) {
          try {
            const guestSnap = collectGuestBrowserSnapshot(res.generalState?.watchlist || []);
            const migRes = await authApiRequest('/api/auth/state', {
              method: 'PUT',
              body: { snapshot: guestSnap }
            });
            resetGuestBrowserStorageToGeneral(migRes.generalState);
            res = { ...migRes, authenticated: true };
            if (justOAuthLogin) {
              setTimeout(() => showToast(`Setări migrate pe @${res.user.username}`, 'Simbolurile și profilele tale anterioare au fost importate în cont.', 'buy'), 300);
            }
          } catch (_) { }
        }

        const localSyncTs = Number(getScopedItem('tp_ultra_last_sync_ts') || '0');
        const serverTs = Number(res.personalState?.updatedAt || 0);
        const sameUser = authState.user?.id === res.user.id;
        authState.user = res.user;
        authState.personalState = res.personalState;
        authState.realPortfolio = res.personalState?.realPortfolio || res.mergedState?.realPortfolio || authState.realPortfolio;
        setAuthGateLocked(false);
        document.getElementById('authModal')?.classList.remove('open');
        startLiveDataAndEnginesOnce();
        if (!sameUser || serverTs > localSyncTs || !getScopedItem('tp_ultra_watchlist_v4')) {
          await applyAccountBundleToWorkspace(res, { reloadCharts: true });
        } else {
          authState.user = res.user;
          authState.personalState = res.personalState;
          localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(res.user));
          const curSet = new Set(state.watchlist.map(w => w.sym));
          const hiddenSet = new Set((res.personalState?.hiddenGeneralSyms || []).map(s => String(s).toUpperCase()));
          let addedGen = false;
          (res.generalState?.watchlist || []).forEach(gw => {
            if (!curSet.has(gw.sym) && !hiddenSet.has(gw.sym)) {
              state.watchlist.push({ sym: gw.sym, name: gw.name, source: 'general' });
              addedGen = true;
            }
          });
          if (addedGen) {
            authState.suppressSync = true;
            saveWatchlist();
            authState.suppressSync = false;
            renderWatchlist();
            syncLiveStreamSubscriptions();
          }
          updateAuthAccountUI();
          await setMultiChartLayout(state.layout);
          await loadSymbol(state.symbol, state.tf);
        }
        setAuthGateLocked(false);
        document.getElementById('authModal')?.classList.remove('open');
        startLiveDataAndEnginesOnce();
      } else {
        // Token invalid, expired, or account blocked by Admin -> force lock
        authState.token = '';
        authState.user = null;
        try {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_CACHE_KEY);
        } catch (_) { }
        updateAuthAccountUI();
        setAuthGateLocked(true, res.error || pendingErr || '');
      }
    } catch (err) {
      updateAuthAccountUI();
      if (!authState.user) {
        setAuthGateLocked(true, pendingErr || 'Autentifică-te pentru a accesa terminalul.');
      }
    }
  }

  function wireAuthUI() {
    const modal = document.getElementById('authModal');
    const errEl = document.getElementById('authFormErr');
    const loginTab = document.getElementById('authTabLoginBtn');
    const regTab = document.getElementById('authTabRegBtn');
    const loginForm = document.getElementById('authLoginForm');
    const regForm = document.getElementById('authRegForm');
    const googleSection = document.getElementById('authGoogleSection');
    const googleBtn = document.getElementById('authGoogleBtn');
    let googleProviderCfg = { googleEnabled: false, callbackUrl: `${window.location.origin}/api/auth/google/callback` };

    const refreshAuthProviders = async () => {
      try {
        const p = await authApiRequest('/api/auth/providers', { method: 'GET', token: '' });
        googleProviderCfg = { googleEnabled: !!p.googleEnabled, callbackUrl: p.callbackUrl || googleProviderCfg.callbackUrl };
        if (googleSection) googleSection.style.display = 'flex';
      } catch (_) {
        if (googleSection) googleSection.style.display = 'flex';
      }
    };
    refreshAuthProviders();

    const setErr = (msg = '', isInfo = false) => {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.classList.toggle('info', !!isInfo);
      errEl.style.display = msg ? 'block' : 'none';
    };

    const setAuthMode = (mode) => {
      const isReg = mode === 'register';
      loginTab?.classList.toggle('active', !isReg);
      regTab?.classList.toggle('active', isReg);
      if (loginForm) loginForm.style.display = isReg ? 'none' : 'flex';
      if (regForm) regForm.style.display = isReg ? 'flex' : 'none';
      setErr('');
    };

    googleBtn?.addEventListener('click', async () => {
      setErr('');
      await refreshAuthProviders();
      window.location.href = '/api/auth/google/start';
    });

    const closeAccountMenu = () => document.getElementById('authAccountMenu')?.classList.remove('open');

    document.getElementById('authAccountMenu')?.addEventListener('click', (e) => {
      if (!e.target.closest?.('button, .tv-menu-item')) e.stopPropagation();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAccountMenu();
    });

    document.getElementById('authAccountBtn')?.addEventListener('click', (e) => {
      updateAuthAccountUI();
      if (authState.user) {
        e.stopPropagation();
        const dd = document.getElementById('authAccountMenu');
        const willOpen = dd ? !dd.classList.contains('open') : false;
        document.querySelectorAll('.tv-menu').forEach(m => m.classList.remove('open'));
        if (dd && willOpen) dd.classList.add('open');
        return;
      }
      refreshAuthProviders();
      setErr('');
      modal?.classList.add('open');
      const inp = (regForm && regForm.style.display !== 'none')
        ? document.getElementById('authRegUser')
        : document.getElementById('authLoginId');
      inp?.focus();
    });

    loginTab?.addEventListener('click', () => setAuthMode('login'));
    regTab?.addEventListener('click', () => setAuthMode('register'));

    document.querySelectorAll('[data-toggle-pass]').forEach(btn => {
      btn.onclick = () => {
        const inp = document.getElementById(btn.dataset.togglePass);
        if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      };
    });

    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setErr('');
      const submitBtn = document.getElementById('authLoginSubmitBtn');
      const identifier = document.getElementById('authLoginId')?.value.trim() || '';
      const password = document.getElementById('authLoginPass')?.value || '';
      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await authApiRequest('/api/auth/login', {
          method: 'POST',
          token: '',
          body: { identifier, password }
        });
        await applyAccountBundleToWorkspace(res, { reloadCharts: true });
        document.getElementById('authLoginPass').value = '';
        setAuthGateLocked(false);
        modal?.classList.remove('open');
        startLiveDataAndEnginesOnce();
        showToast(`Bun venit, @${res.user.username}!`, 'Simbolurile și setările tale personale (+ baza generală) au fost încărcate.', 'buy');
      } catch (err) {
        setErr(err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    regForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setErr('');
      const submitBtn = document.getElementById('authRegSubmitBtn');
      const username = document.getElementById('authRegUser')?.value.trim() || '';
      const email = document.getElementById('authRegEmail')?.value.trim() || '';
      const password = document.getElementById('authRegPass')?.value || '';
      const claimCurrent = document.getElementById('authRegClaimCurrent')?.checked === true;
      if (submitBtn) submitBtn.disabled = true;
      try {
        const seedSnap = claimCurrent ? collectGuestBrowserSnapshot(authState.generalState?.watchlist || []) : null;
        const res = await authApiRequest('/api/auth/register', {
          method: 'POST',
          token: '',
          body: {
            username,
            email,
            password,
            inheritGeneral: true,
            seedFromSnapshot: seedSnap
          }
        });
        if (claimCurrent) resetGuestBrowserStorageToGeneral(res.generalState);
        await applyAccountBundleToWorkspace(res, { reloadCharts: true });
        document.getElementById('authRegPass').value = '';
        const claimChk = document.getElementById('authRegClaimCurrent');
        if (claimChk) claimChk.checked = false;
        setAuthGateLocked(false);
        modal?.classList.remove('open');
        startLiveDataAndEnginesOnce();
        showToast(
          `Cont creat: @${res.user.username}`,
          claimCurrent
            ? 'Configurația ta anterioară a fost mutată pe acest cont, iar baza generală a fost curățată pentru conturile noi.'
            : 'Cont nou curat creat (doar baza generală de piață — izolat de ceilalți utilizatori).',
          'buy'
        );
      } catch (err) {
        setErr(err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    document.getElementById('authClaimGuestBtn')?.addEventListener('click', async () => {
      closeAccountMenu();
      if (!authState.token || !authState.user) return;
      try {
        const guestSnap = collectGuestBrowserSnapshot(authState.generalState?.watchlist || []);
        const res = await authApiRequest('/api/auth/state', {
          method: 'PUT',
          body: { snapshot: guestSnap }
        });
        resetGuestBrowserStorageToGeneral(res.generalState);
        await applyAccountBundleToWorkspace(res, { reloadCharts: true });
        modal?.classList.remove('open');
        showToast(
          `Configurație Mutată pe @${authState.user.username}`,
          'Toate simbolurile, profilele și setările tale sunt acum în contul tău, iar baza generală a fost resetată curat.',
          'buy'
        );
      } catch (err) {
        showToast('Eroare Migrare', err.message, 'sell');
      }
    });

    document.getElementById('authSyncNowBtn')?.addEventListener('click', () => {
      closeAccountMenu();
      flushAuthServerSync(true);
    });

    document.getElementById('authRestoreGenBtn')?.addEventListener('click', async () => {
      closeAccountMenu();
      if (!authState.token) return;
      try {
        await flushAuthServerSync(false);
        const res = await authApiRequest('/api/auth/state', {
          method: 'PUT',
          body: { resetHiddenGeneral: true }
        });
        await applyAccountBundleToWorkspace(res, { reloadCharts: false });
        showToast('Simboluri Generale Restabilite', 'Reperele generale ale pieței sunt din nou incluse lângă cele personale.', 'buy');
      } catch (err) {
        showToast('Eroare', err.message, 'sell');
      }
    });

    document.getElementById('authOpenPortfolioBtn')?.addEventListener('click', () => {
      closeAccountMenu();
      modal?.classList.remove('open');
      window.dispatchEvent(new CustomEvent('tp:switchWorkspaceView', { detail: { view: 'portfolio' } }));
    });

    document.getElementById('authOpenAdminBtn')?.addEventListener('click', () => {
      closeAccountMenu();
      if (authState.user?.role !== 'admin') return;
      modal?.classList.remove('open');
      window.dispatchEvent(new CustomEvent('tp:switchWorkspaceView', { detail: { view: 'admin' } }));
    });

    document.getElementById('authLogoutBtn')?.addEventListener('click', async () => {
      closeAccountMenu();
      if (authState.token) await flushAuthServerSync(false);
      try {
        await authApiRequest('/api/auth/logout', { method: 'POST' });
      } catch (_) { }
      authState.token = '';
      authState.user = null;
      authState.personalState = null;
      authState.realPortfolio = null;
      window.dispatchEvent(new CustomEvent('tp:realPortfolioUpdated', { detail: { userId: null, realPortfolio: null } }));
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_CACHE_KEY);
      } catch (_) { }
      window.dispatchEvent(new CustomEvent('tp:switchWorkspaceView', { detail: { view: 'chart' } }));
      updateAuthAccountUI();
      setAuthGateLocked(true, 'Te-ai deconectat. Autentifică-te din nou pentru a continua.', true);
    });
  }

  // ─── 18b. WIRE DOM EVENTS ────────────────────────────────────────────────
  function applyRightSidebarState(page, collapsed = false) {
    const validPages = ['watchlist', 'smart', 'fib', 'forecast', 'alerts', 'telegram'];
    const cleanPage = validPages.includes(page) ? page : 'watchlist';
    const isCol = !!collapsed && window.innerWidth > 820;

    state.rightPage = cleanPage;
    state.rightCollapsed = isCol;
    try {
      setScopedItem('tp_ultra_rpage', cleanPage);
      setScopedItem('tp_ultra_rp_collapsed', isCol ? '1' : '0');
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
    const focusPrimaryPane = () => {
      if (state.layout !== '1' && state.focusedPaneId !== 0) {
        focusChartPane(0);
      }
    };
    const priPaneEl = document.getElementById('primaryPane');
    priPaneEl?.addEventListener('pointerdown', focusPrimaryPane, { capture: true });
    priPaneEl?.addEventListener('mousedown', focusPrimaryPane, { capture: true });
    if (mainChart) {
      mainChart.timeScale().subscribeVisibleTimeRangeChange(() => positionYAxisCountdownTag());
    }

    // Symbol Search Modal (Updates whichever Multi-Chart Screen is currently selected!)
    const triggerMainSymbolSearch = () => {
      if (state.layout !== '1' && state.focusedPaneId !== 0) focusChartPane(0);
      openSymbolModal('');
    };
    document.getElementById('curSymbolTitle').onclick = triggerMainSymbolSearch;
    document.getElementById('mobSymSearchBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerMainSymbolSearch();
    });
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
      if (!authState.user) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSymbolModal('');
        return;
      }
      if (e.key === 'Escape') {
        const hadOpenUi = !!(document.querySelector('.tv-modal-backdrop.open, .tv-menu.open, #wlSuggestBox.open'));
        document.querySelectorAll('.tv-modal-backdrop').forEach(m => {
          if (m.id === 'authModal' && !authState.user) return;
          m.classList.remove('open');
        });
        document.querySelectorAll('.tv-menu').forEach(m => m.classList.remove('open'));
        document.getElementById('wlSuggestBox')?.classList.remove('open');
        hideFloatingSymbolAutocomplete();
        document.getElementById('chartCtxMenu').style.display = 'none';
        if (!hadOpenUi && copiedPaneProfile) {
          copiedPaneProfile = null;
          syncAllPaneProfileTabs();
        }
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
      btn.onclick = () => {
        if (btn.dataset.closeModal === 'authModal' && !authState.user) return;
        document.getElementById(btn.dataset.closeModal).classList.remove('open');
      };
    });
    document.querySelectorAll('.tv-modal-backdrop').forEach(bd => {
      bd.onclick = (e) => {
        if (bd.id === 'authModal' && !authState.user) return;
        if (e.target === bd) bd.classList.remove('open');
      };
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
    const ethMenuBtn = document.getElementById('extHoursMenuToggle');
    const toggleExtendedHours = () => {
      state.extHours = !state.extHours;
      setScopedItem('tp_ultra_eth_v3', state.extHours ? '1' : '0');
      ethBtn?.classList.toggle('active', state.extHours);
      ethMenuBtn?.classList.toggle('active', state.extHours);
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
    if (ethBtn) ethBtn.onclick = toggleExtendedHours;
    if (ethMenuBtn) ethMenuBtn.onclick = toggleExtendedHours;

    // Dropdown Menus (Chart Type, Spread, Custom TF & Multi-Chart Layout)
    document.querySelectorAll('[data-dropdown-btn]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const menuId = btn.dataset.dropdownBtn;
        const menu = document.getElementById(menuId);
        const wasOpen = menu.classList.contains('open');
        document.querySelectorAll('.tv-menu').forEach(m => m.classList.remove('open'));
        if (!wasOpen) {
          menu.classList.add('open');
          if (menuId === 'layoutMenu') renderWorkspaceArrangementsUI();
        }
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
        setScopedItem('tp_ultra_chartType', state.chartType);
        document.querySelectorAll('[data-charttype]').forEach(i => i.classList.toggle('active', i === item));
        state.fullBars = buildEffectiveFullBars();
        state.bars = state.replay.active
          ? state.fullBars.slice(0, Math.min(state.replay.idx, state.fullBars.length))
          : [...state.fullBars];
        renderChartAndQuant(true);
      };
    });

    // Multi-Chart Layout, Saved Arrangements & Interval Sync
    document.getElementById('layoutSavedWrap')?.addEventListener('click', e => e.stopPropagation());
    document.getElementById('arrSaveBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const inp = document.getElementById('arrNameInp');
      const v = inp ? inp.value.trim() : '';
      saveCurrentWorkspaceArrangement(v);
      if (inp && v) inp.value = '';
    });
    document.getElementById('arrNameInp')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const inp = e.currentTarget;
        const v = inp.value.trim();
        saveCurrentWorkspaceArrangement(v);
        if (v) inp.value = '';
      }
    });
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
        setScopedItem('tp_ultra_synctf', state.syncMultiTf ? '1' : '0');
        syncToggle.classList.toggle('active', state.syncMultiTf);
        if (state.syncMultiTf && state.layout !== '1') {
          switchTimeframe(getActiveFocusedSymbol() === state.symbol ? state.tf : (secPanes.find(x => x.id === state.focusedPaneId)?.tf || state.tf));
        }
      };
    }

    // Indicators Modal & Primary Pane Profile Tab (Label + Copy + Paste)
    document.getElementById('openIndModalBtn').onclick = () => openIndicatorsModalForCurrentPane();
    document.getElementById('priProfBtn')?.addEventListener('pointerdown', e => e.stopPropagation());
    document.getElementById('priProfBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openIndicatorsModalForCurrentPane(0);
    });
    document.getElementById('priProfCopyBtn')?.addEventListener('pointerdown', e => e.stopPropagation());
    document.getElementById('priProfCopyBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      focusChartPane(0);
      copyPaneIndicatorProfile(null);
    });
    document.getElementById('priProfPasteBtn')?.addEventListener('pointerdown', e => e.stopPropagation());
    document.getElementById('priProfPasteBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      pasteCopiedProfileToPane(null);
    });
    document.getElementById('indModalSearch').oninput = (e) => renderIndicatorsModalList(e.target.value);
    document.getElementById('indTabTop10Btn')?.addEventListener('click', () => {
      indModalTab = 'top10';
      renderIndicatorsModalList(document.getElementById('indModalSearch')?.value || '');
    });
    document.getElementById('indTabAllBtn')?.addEventListener('click', () => {
      indModalTab = 'all';
      renderIndicatorsModalList(document.getElementById('indModalSearch')?.value || '');
    });
    document.getElementById('indSaveProfileBtn')?.addEventListener('click', () => {
      const inp = document.getElementById('indProfileNameInp');
      const nameVal = inp ? inp.value.trim() : '';
      saveCurrentAsIndicatorProfile(nameVal || 'Profil Nou');
      if (inp && !nameVal) inp.value = '';
    });
    document.getElementById('indProfileNameInp')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const inp = e.currentTarget;
        const nameVal = inp.value.trim();
        saveCurrentAsIndicatorProfile(nameVal || 'Profil Nou');
      }
    });

    // Topbar Action & Export Buttons
    document.getElementById('smartSigTopBtn').onclick = () => toggleIndicator('smartSignals');
    document.getElementById('fibTopBtn')?.addEventListener('click', () => toggleIndicator('fibAuto'));
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

    // Quick Bid / Ask Paper Execution (if present)
    const baSellBtn = document.getElementById('baSellBtn');
    const baBuyBtn = document.getElementById('baBuyBtn');
    if (baSellBtn) baSellBtn.onclick = () => executePaperOrder('sell');
    if (baBuyBtn) baBuyBtn.onclick = () => executePaperOrder('buy');

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
      if (authState.user) {
        const genBase = (authState.generalState?.watchlist || DEFAULT_WATCHLIST).map(x => ({ sym: x.sym, name: x.name, source: 'general' }));
        const genSet = new Set(genBase.map(g => g.sym));
        const personalOnly = (state.watchlist || [])
          .filter(w => w.source === 'personal' || !genSet.has(w.sym))
          .map(w => ({ sym: w.sym, name: w.name, source: 'personal' }));
        state.watchlist = [...personalOnly, ...genBase];
      } else {
        state.watchlist = DEFAULT_WATCHLIST.map(x => ({ ...x, source: 'general' }));
      }
      saveWatchlist();
      renderWatchlist();
      syncLiveStreamSubscriptions();
      refreshLiveQuotes();
      showToast('Watchlist Resetat', authState.user ? 'Simbolurile generale au fost restabilite lângă cele personale.' : 'Lista implicită de simboluri live a fost restaurată.');
    };

    // Fib Controls
    document.getElementById('fibToggleChartBtn').onclick = () => toggleIndicator('fibAuto', null);
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
      const secP = state.ctxPaneId > 0 ? secPanes.find(x => x.id === state.ctxPaneId) : null;
      if (secP && secP.chart) {
        focusLiveEvolution(secP.chart, (secP.bars || []).length, 72, 5);
      } else if (mainChart) {
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
      const secP = state.ctxPaneId > 0 ? secPanes.find(x => x.id === state.ctxPaneId) : null;
      const barsArr = secP ? (secP.bars || []) : state.bars;
      const cur = barsArr.length ? barsArr[barsArr.length - 1].close : state.ctxPrice;
      addAlert(state.ctxPrice, state.ctxPrice >= cur ? 'up' : 'dn');
    };
    document.getElementById('ctxActBuy').onclick = () => executePaperOrder('buy', state.ctxPrice);
    document.getElementById('ctxActSell').onclick = () => executePaperOrder('sell', state.ctxPrice);
    document.getElementById('ctxActWatchlist')?.addEventListener('click', () => toggleSymbolInWatchlist(getActiveFocusedSymbol()));
    document.getElementById('chartWlToggleBtn')?.addEventListener('click', () => toggleSymbolInWatchlist(getActiveFocusedSymbol()));
    document.getElementById('ctxActClearDraw').onclick = () => {
      const secP = state.ctxPaneId > 0 ? secPanes.find(x => x.id === state.ctxPaneId) : null;
      if (secP && secP.overlay) secP.overlay.clearAll();
      else if (overlayEngine) overlayEngine.clearAll();
    };

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
          if (document.getElementById('centerColumn')?.classList.contains('intel-mode')) {
            window.dispatchEvent(new CustomEvent('tp:switchWorkspaceView', { detail: { view: 'chart' } }));
          }
          return;
        }

        closeCopilotOverlay();

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

  // ─── AUTO-FIT TOPBAR BUTTONS (ZERO RIGHT-EDGE CLIPPING AT ANY WIDTH/ZOOM) ─
  let _tbFitRaf = 0;
  function syncTopbarFit() {
    const tb = document.getElementById('topbar');
    if (!tb) return;
    if (window.innerWidth <= 820) {
      tb.removeAttribute('data-tb-fit');
      return;
    }
    tb.removeAttribute('data-tb-fit');
    if (!tb.clientWidth) return;
    const fits = () => {
      const tbRect = tb.getBoundingClientRect();
      const maxRight = Math.min(tbRect.right, document.documentElement.clientWidth - 4);
      const rightEl = tb.querySelector('.tb-right');
      const rRect = rightEl ? rightEl.getBoundingClientRect() : tbRect;
      return tb.scrollWidth <= tb.clientWidth + 1 && rRect.right <= maxRight + 1;
    };
    if (fits()) return;
    const steps = [];
    for (const lvl of ['1', '2', '3', '4', '5']) {
      steps.push(lvl);
      tb.setAttribute('data-tb-fit', steps.join(' '));
      if (fits()) return;
    }
  }

  function scheduleTopbarFit() {
    if (_tbFitRaf) cancelAnimationFrame(_tbFitRaf);
    _tbFitRaf = requestAnimationFrame(() => {
      _tbFitRaf = 0;
      syncTopbarFit();
    });
  }

  // ─── BOOTSTRAP ────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Handle Google OAuth redirect token/error hash cleanly if returning from /api/auth/google/callback
    let pendingAuthErr = '';
    let didSetHashToken = false;
    try {
      const h = String(window.location.hash || '');
      if (h.includes('authToken=')) {
        const hp = new URLSearchParams(h.slice(1));
        const tok = hp.get('authToken');
        if (tok) {
          authState.token = tok;
          didSetHashToken = true;
          localStorage.setItem(AUTH_TOKEN_KEY, tok);
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else if (h.includes('authError=')) {
        const hp = new URLSearchParams(h.slice(1));
        pendingAuthErr = hp.get('authError') || '';
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch (_) { }

    const urlSym = new URLSearchParams(window.location.search).get('sym');
    if (urlSym) state.symbol = normalizeSymbol(urlSym);

    applyTheme(state.theme);
    applyRightSidebarState(state.rightPage, state.rightCollapsed);
    initCharts();
    wireUIEvents();
    wireAuthUI();
    updateAuthAccountUI();
    wireTelegramUI();
    initTelegramBridge();

    const pfSel = document.getElementById('portfolioSelect');
    if (pfSel) pfSel.value = state.activePortfolio;
    document.getElementById('calcBalanceInput').value = state.paper.balance;
    document.getElementById('calcRiskPctInput').value = state.paper.riskPct;
    syncQuickTopbarIndBtns();
    document.getElementById('extHoursBtn')?.classList.toggle('active', !!state.extHours);
    document.getElementById('extHoursMenuToggle')?.classList.toggle('active', !!state.extHours);
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

    // Expose safe bridge for AI Trading Intelligence & Admin UI (intel-ui.js)
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
      getAuthToken: () => authState.token,
      getUser: () => authState.user,
      getRealPortfolio: () => authState.realPortfolio,
      ingestPortfolioQuotes: (evaluatedAssets = []) => {
        try {
          for (const row of evaluatedAssets) {
            const sym = String(row.sym || row.brokerSym || '').toUpperCase().replace(/\.(24-7|24-5)$/i, '');
            const px = Number(row.livePrice || 0);
            if (!sym || !(px > 0)) continue;
            const pct = Number(row.dayChgPct || 0);
            const prevClose = pct !== -100 ? px / (1 + pct / 100) : px;
            const chg = px - prevClose;
            applyLiveTick(sym, px, {
              regPrice: px,
              regChg: chg,
              regChgPct: pct,
              prevClose,
              name: row.name
            });
          }
          const focusSym = getActiveFocusedSymbol();
          const lq = liveQuoteCache[focusSym];
          if (lq && isFinite(lq.regPrice)) {
            syncDetailsWidgetForSymbol(focusSym, getPaneStateIfRendered(focusSym));
          }
        } catch (_) { }
      },
      fetchRealPortfolio: async () => {
        if (!authState.token || !authState.user) return null;
        const res = await authApiRequest('/api/auth/portfolio', { method: 'GET' });
        authState.realPortfolio = res.realPortfolio || null;
        try {
          const s = getActiveFocusedSymbol();
          const lq = liveQuoteCache[s];
          renderDetailsPortfolioBox(s, lq?.regPrice, lq?.regChg);
          refreshAllPaneEtoroStrips();
        } catch (_) { }
        return authState.realPortfolio;
      },
      saveRealPortfolio: async (nextPf) => {
        if (!authState.token || !authState.user) throw new Error('Autentifică-te pentru a salva portofoliul personal.');
        const res = await authApiRequest('/api/auth/portfolio', {
          method: 'PUT',
          body: { realPortfolio: nextPf }
        });
        authState.realPortfolio = res.realPortfolio || null;
        if (authState.personalState) authState.personalState.realPortfolio = authState.realPortfolio;
        refreshAllPaneEtoroStrips();
        window.dispatchEvent(new CustomEvent('tp:realPortfolioUpdated', {
          detail: { userId: authState.user?.id || null, realPortfolio: authState.realPortfolio }
        }));
        return authState.realPortfolio;
      },
      refreshAuthAccountUI: () => updateAuthAccountUI(),
      forceAuthLock: (msg) => {
        authState.token = '';
        authState.user = null;
        authState.personalState = null;
        authState.realPortfolio = null;
        refreshAllPaneEtoroStrips();
        window.dispatchEvent(new CustomEvent('tp:realPortfolioUpdated', { detail: { userId: null, realPortfolio: null } }));
        try {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_CACHE_KEY);
        } catch (_) { }
        updateAuthAccountUI();
        setAuthGateLocked(true, msg || 'Sesiune expirată.');
      },
      loadSymbol: (s, t) => loadSymbol(s, t || state.tf),
      assignFocusedSymbol: (s) => assignSymbolToFocusedPane(s),
      addAlert: (priceVal, dir, cond) => addAlert(priceVal, dir, cond),
      openRightPage: (page) => switchRightPage(page),
      addToWatchlist: (s) => addSymbolToWatchlist(s, { loadOnChart: true }),
      toggleWatchlist: (s) => toggleSymbolInWatchlist(s),
      isInWatchlist: (s) => isSymbolInWatchlist(s),
      renderLogoAvatar: (s, sizeCls) => renderLogoAvatar(s, sizeCls),
      openBottomTab: (t) => openBottomDockTab(t),
      refreshChartsAfterShow: () => {
        resizeAllCharts();
        const needed = getNeededSecPanesCount(state.layout);
        for (let i = 0; i < needed; i++) {
          const p = secPanes[i];
          if (!p) continue;
          if (!p.chart) initSecondaryPaneChart(p);
          if (!p.bars || !p.bars.length) {
            loadSecondaryPaneData(p);
          } else {
            try { renderSecondaryPaneIndicators(p, true); } catch (_) { }
          }
        }
      }
    };

    renderWorkspaceArrangementsUI();
    hydrateAuthSessionOnBoot(pendingAuthErr, { justOAuthLogin: didSetHashToken });
    syncTopbarFit();
    requestAnimationFrame(syncTopbarFit);
    setTimeout(syncTopbarFit, 180);
    window.addEventListener('resize', scheduleTopbarFit);
    const _tbEl = document.getElementById('topbar');
    if (_tbEl && typeof ResizeObserver === 'function') {
      let _lastTbW = 0;
      new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect?.width || 0;
        if (Math.abs(w - _lastTbW) >= 1) {
          _lastTbW = w;
          scheduleTopbarFit();
        }
      }).observe(_tbEl);
    }
  });
})();
