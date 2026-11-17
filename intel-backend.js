'use strict';

/**
 * TradePro Ultimate — AI Trading Intelligence Backend Engine
 * Covers:
 *  1. Market Overview, Macro (10Y, DXY, VIX, Crypto), 11 Sectors, Breadth & Sector Heatmap
 *  2. Early Opportunity Radar & 5m Volume Explosion Detector (Pre-Breakout Small Caps & Watchlist)
 *  3. SEC EDGAR Live Filings + Dilution Risk Detector + Insider Form 4 / Yahoo Holders
 *  4. Real Options Chain (CBOE Delayed Quotes: IV30, Max Pain, Put/Call, Strike GEX & Walls)
 *  5. News Catalyst Scoring + Priced-In Assessment + Truthful ONDS-style AI Market Analysis
 *  6. Grounded AI Trading Copilot (Intent-routed live query synthesis)
 */

const fs = require('fs');
const path = require('path');
const { toEpochSec, isUsEquityTicker } = require('./netlify/functions/tv-overnight.js');

const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_SEC = 'TradeProTerminal/2.0 research@tradepro.local';
const SIGNAL_LOG_PATH = path.join(__dirname, 'early-signal-log.json');

const NY_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const NY_HM_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});
const NY_HMS_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});
const NY_WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short'
});
const RO_HMS_FMT = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});
const RO_DATE_FMT = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

function getNyDayAndMinute(epochSec) {
  const d = new Date(epochSec * 1000);
  const day = NY_DATE_FMT.format(d);
  const hm = NY_HM_FMT.format(d);
  const [hhStr, mmStr] = hm.split(':');
  const hh = Number(hhStr) % 24;
  const mm = Number(mmStr) || 0;
  return { day, minuteOfDay: hh * 60 + mm };
}

function formatDualTime(epochSec) {
  if (!epochSec || epochSec <= 0) {
    return { timeEt: '', timeRo: '', dateEt: '', dateRo: '', hhmmEt: '' };
  }
  const d = new Date(epochSec * 1000);
  const timeEt = `${NY_HMS_FMT.format(d)} ET`;
  const timeRo = `${RO_HMS_FMT.format(d)} RO`;
  const dateEt = NY_DATE_FMT.format(d);
  const dateRo = RO_DATE_FMT.format(d);
  const hhmmEt = `${NY_HM_FMT.format(d)} ET`;
  return { timeEt, timeRo, dateEt, dateRo, hhmmEt };
}

function getMarketSessionContext(nowMs = Date.now()) {
  const sec = Math.floor(nowMs / 1000);
  const d = new Date(nowMs);
  const ny = getNyDayAndMinute(sec);
  const weekday = NY_WEEKDAY_FMT.format(d);
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const timeEt = `${NY_HMS_FMT.format(d)} ET`;
  const timeRo = `${RO_HMS_FMT.format(d)} RO`;

  let sessionCode = 'CLOSED';
  let label = 'ÎNCHIS (OVN)';
  let tone = 'muted';
  let isRegular = false;
  let isPreMarket = false;
  let isAfterHours = false;
  let isOvernight = false;

  if (weekday === 'Sun' && ny.minuteOfDay >= 1200) {
    sessionCode = 'OVERNIGHT';
    label = 'OVERNIGHT (BOATS)';
    tone = 'purple';
    isOvernight = true;
  } else if (isWeekend) {
    sessionCode = 'WEEKEND';
    label = 'ÎNCHIS (WEEKEND)';
  } else if (ny.minuteOfDay >= 240 && ny.minuteOfDay < 570) {
    sessionCode = 'PRE_MARKET';
    label = 'PRE-MARKET ET';
    tone = 'amber';
    isPreMarket = true;
  } else if (ny.minuteOfDay >= 570 && ny.minuteOfDay < 960) {
    sessionCode = 'REGULAR';
    label = 'REGULAR ET';
    tone = 'green';
    isRegular = true;
  } else if (ny.minuteOfDay >= 960 && ny.minuteOfDay < 1200) {
    sessionCode = 'AFTER_HOURS';
    label = 'AFTER-HOURS ET';
    tone = 'cyan';
    isAfterHours = true;
  } else if (ny.minuteOfDay < 240 || (weekday !== 'Fri' && ny.minuteOfDay >= 1200)) {
    sessionCode = 'OVERNIGHT';
    label = 'OVERNIGHT (BOATS)';
    tone = 'purple';
    isOvernight = true;
  }

  return {
    sessionCode,
    label,
    tone,
    isRegular,
    isPreMarket,
    isAfterHours,
    isOvernight,
    isExtendedHours: isPreMarket || isAfterHours,
    dayEt: ny.day,
    minuteOfDayEt: ny.minuteOfDay,
    timeEt,
    timeRo
  };
}

const MACRO_SYMBOLS = [
  { sym: '^IXIC',    label: 'NASDAQ',     group: 'index' },
  { sym: '^GSPC',    label: 'S&P 500',    group: 'index' },
  { sym: '^DJI',     label: 'DOW 30',     group: 'index' },
  { sym: '^RUT',     label: 'Russell 2K', group: 'index' },
  { sym: '^VIX',     label: 'VIX',        group: 'vol' },
  { sym: '^TNX',     label: 'US 10Y',     group: 'macro' },
  { sym: 'DX-Y.NYB', label: 'DXY USD',    group: 'macro' },
  { sym: 'BTC-USD',  label: 'Bitcoin',    group: 'crypto' },
  { sym: 'ETH-USD',  label: 'Ethereum',   group: 'crypto' }
];

const SECTOR_ETFS = [
  { sym: 'XLK',  name: 'Technology' },
  { sym: 'XLF',  name: 'Financials' },
  { sym: 'XLV',  name: 'Healthcare' },
  { sym: 'XLE',  name: 'Energy' },
  { sym: 'XLI',  name: 'Industrials' },
  { sym: 'XLY',  name: 'Cons. Discr.' },
  { sym: 'XLP',  name: 'Cons. Staples' },
  { sym: 'XLC',  name: 'Comm. Services' },
  { sym: 'XLB',  name: 'Materials' },
  { sym: 'XLU',  name: 'Utilities' },
  { sym: 'XLRE', name: 'Real Estate' }
];

const SEC_ITEM_DESC = {
  '1.01': 'Contract Material Nou',
  '1.02': 'Încetare Contract Material',
  '2.01': 'Achiziție / Cedare Active',
  '2.02': 'Rezultate Financiare (Earnings)',
  '3.01': 'Notificare Delistare / Conformitate',
  '3.02': 'Emisiune Acțiuni Neînregistrată (Diluție)',
  '4.01': 'Schimbare Auditor',
  '5.02': 'Schimbări Conducere / Board',
  '5.03': 'Modificare Statut / Reverse Split',
  '5.07': 'Vot Acționari',
  '7.01': 'Reg FD Disclosure / Prezentare',
  '8.01': 'Eveniment Corporativ Important',
  '9.01': 'Anexe Financiare / Exhibituri'
};

const DILUTION_FORMS = new Set([
  'S-3', 'S-3ASR', 'S-3/A', 'S-1', 'S-1/A', 'F-3', 'F-1',
  '424B1', '424B2', '424B3', '424B4', '424B5', '424B7', '424B8',
  'EFFECT', 'POS AM'
]);

const TV_SECTOR_TO_ETF = {
  'Electronic Technology': 'XLK',
  'Technology Services': 'XLK',
  'Finance': 'XLF',
  'Health Technology': 'XLV',
  'Health Services': 'XLV',
  'Energy Minerals': 'XLE',
  'Industrial Services': 'XLI',
  'Producer Manufacturing': 'XLI',
  'Retail Trade': 'XLY',
  'Consumer Durables': 'XLY',
  'Consumer Services': 'XLY',
  'Consumer Non-Durables': 'XLP',
  'Communications': 'XLC',
  'Process Industries': 'XLB',
  'Non-Energy Minerals': 'XLB',
  'Utilities': 'XLU',
  'Real Estate': 'XLRE',
  'Transportation': 'XLI'
};

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function finiteNum(v, fallback = null) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function nowTimeRo() {
  return new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isUsEquitySymbol(sym) {
  const s = String(sym || '').toUpperCase().trim();
  if (!s) return false;
  if (s.startsWith('^') || s.includes('=') || s.includes('-USD') || s.includes('/')) return false;
  return /^[A-Z][A-Z0-9.-]{0,5}$/.test(s);
}

function createIntelEngine(deps) {
  const {
    yf,
    handleYahooProxyTarget,
    getCached,
    setCached,
    QuantEngine,
    generateSingleAITradeIdeaServer,
    defaultWatchlist = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMD', 'META', 'APPS', 'ONDS']
  } = deps;

  // ─── HTTP HELPERS ────────────────────────────────────────────────────────
  async function tvScan(columns, filters, sortBy, sortOrder, rangeMax) {
    try {
      const res = await fetch('https://scanner.tradingview.com/america/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA_BROWSER,
          'Origin': 'https://www.tradingview.com',
          'Referer': 'https://www.tradingview.com/'
        },
        body: JSON.stringify({
          filter: filters || [],
          options: { lang: 'en' },
          markets: ['america'],
          symbols: { query: { types: [] }, tickers: [] },
          columns,
          sort: { sortBy, sortOrder },
          range: [0, rangeMax]
        }),
        signal: AbortSignal.timeout(7000)
      });
      if (!res.ok) return [];
      const json = await res.json();
      const rows = [];
      for (const item of (json?.data || [])) {
        const d = item?.d || [];
        const rawSym = String(d[0] || '').trim().toUpperCase();
        if (!rawSym || rawSym.includes('/') || rawSym.length > 7) continue;
        const obj = { rawSym, sym: rawSym.replace(/\./g, '-') };
        columns.forEach((c, idx) => { obj[c] = d[idx]; });
        rows.push(obj);
      }
      return rows;
    } catch (_) {
      return [];
    }
  }

  async function fetchYahooQuoteBatch(symbols) {
    const clean = Array.from(new Set(symbols.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)));
    const map = new Map();
    if (!clean.length) return map;
    const slices = [];
    for (let i = 0; i < clean.length; i += 40) {
      slices.push(clean.slice(i, i + 40));
    }
    await Promise.all(slices.map(async (slice) => {
      try {
        const data = await handleYahooProxyTarget(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(slice.join(','))}`
        );
        for (const q of (data?.quoteResponse?.result || [])) {
          if (q?.symbol) map.set(String(q.symbol).toUpperCase(), q);
        }
      } catch (_) {}
    }));
    return map;
  }

  async function fetchYahooBars(sym, interval = '5m', range = '5d', includePrePost = true) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}${includePrePost ? '&includePrePost=true' : ''}`;
      const ch = await handleYahooProxyTarget(url);
      const r0 = ch?.chart?.result?.[0];
      if (!r0) return { bars: [], meta: null };
      const ts = r0.timestamp || [];
      const q0 = r0.indicators?.quote?.[0] || {};
      const bars = [];
      for (let i = 0; i < ts.length; i++) {
        const c = q0.close?.[i];
        if (c != null && Number.isFinite(c) && c > 0) {
          bars.push({
            time: ts[i],
            open: q0.open?.[i] ?? c,
            high: q0.high?.[i] ?? c,
            low: q0.low?.[i] ?? c,
            close: c,
            volume: q0.volume?.[i] ?? 0
          });
        }
      }
      return { bars, meta: r0.meta || null };
    } catch (_) {
      return { bars: [], meta: null };
    }
  }

  // ─── 1. MARKET OVERVIEW, MACRO, 11 SECTORS, BREADTH & HEATMAP ───────────
  async function fetchMarketOverview(forceRefresh = false) {
    const cacheKey = 'intel:mkt_overview:v1';
    if (!forceRefresh) {
      const hit = getCached(cacheKey, 55000);
      if (hit) return hit;
    }

    const macroSyms = MACRO_SYMBOLS.map(m => m.sym);
    const sectorSyms = SECTOR_ETFS.map(s => s.sym);
    const allSyms = [...macroSyms, ...sectorSyms];

    const heatmapCols = [
      'name', 'description', 'close', 'change', 'volume',
      'relative_volume_10d_calc', 'market_cap_basic', 'sector', 'RSI', 'Perf.W', 'SMA50'
    ];

    const [quoteMap, topCapRows, breadthRows] = await Promise.all([
      fetchYahooQuoteBatch(allSyms),
      tvScan(
        heatmapCols,
        [
          { left: 'type', operation: 'in_range', right: ['stock', 'dr'] },
          { left: 'market_cap_basic', operation: 'greater', right: 8000000000 },
          { left: 'close', operation: 'greater', right: 2 }
        ],
        'market_cap_basic',
        'desc',
        84
      ),
      tvScan(
        ['name', 'close', 'change', 'SMA50', 'SMA200'],
        [
          { left: 'type', operation: 'in_range', right: ['stock'] },
          { left: 'market_cap_basic', operation: 'greater', right: 300000000 },
          { left: 'volume', operation: 'greater', right: 250000 },
          { left: 'close', operation: 'greater', right: 2 }
        ],
        'Value.Traded',
        'desc',
        250
      )
    ]);

    const macro = MACRO_SYMBOLS.map(m => {
      const q = quoteMap.get(m.sym) || {};
      const px = safeNum(q.regularMarketPrice, null);
      const chg = safeNum(q.regularMarketChange, 0);
      const chgPct = safeNum(q.regularMarketChangePercent, 0);
      const extPx = q.marketState && q.marketState !== 'REGULAR'
        ? (safeNum(q.preMarketPrice, safeNum(q.postMarketPrice, null)))
        : null;
      return {
        sym: m.sym,
        label: m.label,
        group: m.group,
        price: px,
        chg,
        chgPct,
        extPrice: extPx,
        marketState: q.marketState || ''
      };
    });

    const sectors = SECTOR_ETFS.map(s => {
      const q = quoteMap.get(s.sym) || {};
      return {
        sym: s.sym,
        name: s.name,
        price: safeNum(q.regularMarketPrice, null),
        chgPct: safeNum(q.regularMarketChangePercent, 0),
        volume: safeNum(q.regularMarketVolume, 0),
        avgVol: safeNum(q.averageDailyVolume10Day, 0)
      };
    }).sort((a, b) => (b.chgPct ?? 0) - (a.chgPct ?? 0));

    // Real Breadth calculation from top 250 liquid US stocks
    let advancers = 0, decliners = 0, flat = 0, aboveSma50 = 0, sma50Valid = 0, aboveSma200 = 0, sma200Valid = 0;
    for (const r of breadthRows) {
      const ch = safeNum(r.change, 0);
      if (ch > 0.05) advancers++;
      else if (ch < -0.05) decliners++;
      else flat++;
      const px = safeNum(r.close, null);
      const s50 = safeNum(r.SMA50, null);
      const s200 = safeNum(r.SMA200, null);
      if (px != null && s50 != null && s50 > 0) {
        sma50Valid++;
        if (px > s50) aboveSma50++;
      }
      if (px != null && s200 != null && s200 > 0) {
        sma200Valid++;
        if (px > s200) aboveSma200++;
      }
    }

    const totalBreadth = Math.max(1, advancers + decliners + flat);
    const breadthPctUp = (advancers / totalBreadth) * 100;
    const pctAboveSma50 = sma50Valid > 0 ? (aboveSma50 / sma50Valid) * 100 : null;
    const pctAboveSma200 = sma200Valid > 0 ? (aboveSma200 / sma200Valid) * 100 : null;

    // Heatmap tiles
    const heatmap = topCapRows.map(r => ({
      sym: r.sym,
      name: String(r.description || r.sym),
      price: safeNum(r.close, 0),
      chgPct: safeNum(r.change, 0),
      rvol: safeNum(r.relative_volume_10d_calc, 1),
      mcap: safeNum(r.market_cap_basic, 0),
      sector: String(r.sector || 'Other'),
      rsi: safeNum(r.RSI, null),
      perfW: safeNum(r['Perf.W'], null)
    }));

    // Market Tailwind Regime (strictly data-driven)
    const nasdaq = macro.find(x => x.sym === '^IXIC')?.chgPct ?? 0;
    const spx = macro.find(x => x.sym === '^GSPC')?.chgPct ?? 0;
    const rut = macro.find(x => x.sym === '^RUT')?.chgPct ?? 0;
    const vix = macro.find(x => x.sym === '^VIX')?.price ?? 18;
    const tnxChg = macro.find(x => x.sym === '^TNX')?.chgPct ?? 0;

    let regimeScore = 50;
    regimeScore += clamp((spx + nasdaq) * 5, -20, 20);
    if (vix < 16) regimeScore += 10;
    else if (vix > 24) regimeScore -= 14;
    if (breadthPctUp >= 60) regimeScore += 12;
    else if (breadthPctUp <= 38) regimeScore -= 12;
    if (pctAboveSma50 != null) {
      if (pctAboveSma50 >= 55) regimeScore += 8;
      else if (pctAboveSma50 <= 38) regimeScore -= 8;
    }
    if (tnxChg > 2.2) regimeScore -= 6;
    regimeScore = Math.round(clamp(regimeScore, 5, 95));

    let regimeLabel = 'SELECTIV / MIXT';
    let regimeTone = 'amber';
    if (regimeScore >= 64) { regimeLabel = 'RISK-ON BULLISH'; regimeTone = 'up'; }
    else if (regimeScore <= 38) { regimeLabel = 'RISK-OFF DEFENSIV'; regimeTone = 'dn'; }

    const smallCapBias = rut >= 0.4 && vix < 22
      ? 'Favorabil small-caps / momentum'
      : (rut <= -0.8 || vix >= 24 ? 'Presiune pe small-caps (beta ridicat)' : 'Neutru pe small-caps');

    const pack = {
      ok: true,
      updatedAt: new Date().toISOString(),
      updatedTimeRo: nowTimeRo(),
      source: 'Yahoo Finance Batch Quote + TradingView US Scanner (top 250 lichide)',
      regime: {
        score: regimeScore,
        label: regimeLabel,
        tone: regimeTone,
        smallCapBias,
        summary: `S&P ${spx >= 0 ? '+' : ''}${spx.toFixed(2)}% · NASDAQ ${nasdaq >= 0 ? '+' : ''}${nasdaq.toFixed(2)}% · RUT ${rut >= 0 ? '+' : ''}${rut.toFixed(2)}% · VIX ${vix != null ? vix.toFixed(2) : '—'} · Breadth ${breadthPctUp.toFixed(0)}% verzi`
      },
      macro,
      sectors,
      breadth: {
        sampleSize: breadthRows.length,
        advancers,
        decliners,
        flat,
        pctUp: Number(breadthPctUp.toFixed(1)),
        pctAboveSma50: pctAboveSma50 != null ? Number(pctAboveSma50.toFixed(1)) : null,
        pctAboveSma200: pctAboveSma200 != null ? Number(pctAboveSma200.toFixed(1)) : null
      },
      heatmap
    };

    setCached(cacheKey, pack);
    return pack;
  }

  // ─── 2. VOLUME EXPLOSION & INTRADAY BAR FLOW ANALYZER (5m / 10D TOD) ──────
  function analyze5mBars(bars, quote = {}, tv = {}) {
    if (!Array.isArray(bars) || bars.length < 15) return null;
    const last = bars[bars.length - 1];
    const prev1 = bars[bars.length - 2] || last;
    const recent = bars.slice(-26);

    // Enrich each bar with NY Eastern Time date & minute-of-day for accurate TOD comparison
    const annotated = bars.map(b => {
      const ny = getNyDayAndMinute(b.time);
      return { ...b, nyDay: ny.day, nyMin: ny.minuteOfDay };
    });
    const lastAnn = annotated[annotated.length - 1];
    const todayDay = lastAnn.nyDay;
    const latestMinute = lastAnn.nyMin;

    const byDay = new Map();
    for (const b of annotated) {
      if (!byDay.has(b.nyDay)) byDay.set(b.nyDay, []);
      byDay.get(b.nyDay).push(b);
    }
    const todayBarsRaw = byDay.get(todayDay) || [];
    const sessionBars = todayBarsRaw.length >= 4 ? todayBarsRaw : annotated.slice(-45);

    // Relative Volume by Time of Day (RVOL TOD) comparing cumulative volume up to latestMinute NY ET
    let todayCumVolTod = 0;
    for (const b of todayBarsRaw) {
      if (b.nyMin <= latestMinute) todayCumVolTod += Math.max(0, b.volume || 0);
    }
    const priorDayCumVols = [];
    for (const [dKey, dBars] of byDay.entries()) {
      if (dKey === todayDay) continue;
      let dVol = 0;
      for (const b of dBars) {
        if (b.nyMin <= latestMinute) {
          dVol += Math.max(0, b.volume || 0);
        }
      }
      priorDayCumVols.push(dVol);
    }
    const rvolTodDays = priorDayCumVols.length;
    const avgPriorCumVolTod = rvolTodDays > 0
      ? priorDayCumVols.reduce((s, v) => s + v, 0) / rvolTodDays
      : 0;
    const rvolTodExact = rvolTodDays >= 2 && avgPriorCumVolTod >= 5000;
    const rvolTod = rvolTodDays >= 2 && (todayCumVolTod > 0 || avgPriorCumVolTod > 0)
      ? clamp(todayCumVolTod / Math.max(15000, avgPriorCumVolTod), 0.05, 50)
      : null;

    // Running VWAP, HOD, LOD and true Pre-Market High (< 09:30 ET = 570m) on current session
    let pv = 0, vv = 0;
    let dayHigh = -Infinity, dayLow = Infinity;
    let calcPmHigh = -Infinity;
    for (const b of sessionBars) {
      const typ = (b.high + b.low + b.close) / 3;
      const v = Math.max(0, b.volume || 0);
      pv += typ * v;
      vv += v;
      if (b.high > dayHigh) dayHigh = b.high;
      if (b.low < dayLow) dayLow = b.low;
      if (b.nyMin < 570 && b.high > calcPmHigh) calcPmHigh = b.high;
    }
    const vwap = vv > 0 ? pv / vv : last.close;

    // 5m Volume Explosion (latest active 5m bar vs prior 20 active bars) + Volume Acceleration Slope (last 3 vs prev 6)
    const bLast = bars[bars.length - 1];
    const bPrev = bars[bars.length - 2];
    const activeVolBars = bars.filter(b => (b.volume || 0) > 0);
    const tailActive = activeVolBars.length ? activeVolBars[activeVolBars.length - 1] : last;
    const prevActive = activeVolBars.length >= 2 ? activeVolBars[activeVolBars.length - 2] : tailActive;
    const recentVol5m = Math.max(bLast?.volume || 0, bPrev?.volume || 0) || (tailActive?.volume || 0);
    const activeHistory = activeVolBars.slice(-22, -2);
    const rawAvg = activeHistory.length
      ? activeHistory.reduce((a, b) => a + b.volume, 0) / activeHistory.length
      : (prevActive?.volume || last.volume || 0);
    const avgVol5m20 = Math.max(1500, rawAvg);
    const volAccel5m = rawAvg >= 1500 && recentVol5m >= 3000
      ? clamp(recentVol5m / avgVol5m20, 0.05, 50)
      : (recentVol5m >= 250 ? clamp(recentVol5m / avgVol5m20, 0.05, 2.5) : 0);

    const last3Vols = activeVolBars.slice(-3);
    const prev6Vols = activeVolBars.slice(-9, -3);
    const avgLast3Vol = last3Vols.length ? last3Vols.reduce((s, b) => s + b.volume, 0) / last3Vols.length : 0;
    const avgPrev6Vol = prev6Vols.length ? prev6Vols.reduce((s, b) => s + b.volume, 0) / prev6Vols.length : 0;
    const volAccelSlopePct = avgPrev6Vol >= 1000
      ? clamp(((avgLast3Vol - avgPrev6Vol) / avgPrev6Vol) * 100, -90, 400)
      : 0;
    const isVolAccelerating = volAccelSlopePct > 12 && (bLast?.volume || 0) >= avgPrev6Vol;

    // Intraday OHLCV Close-Location Flow Proxy & CVD 5m Proxy (strictly bar-derived, NOT raw L1/L2 tick prints)
    const flowSlice = recent.slice(-12);
    let buyVolEst = 0, totFlowVol = 0;
    for (const b of flowSlice) {
      const v = Math.max(1, b.volume || 1);
      const rng = b.high - b.low;
      const clv = rng > 0 ? clamp((b.close - b.low) / rng, 0, 1) : (b.close >= b.open ? 0.65 : 0.35);
      buyVolEst += v * clv;
      totFlowVol += v;
    }
    const buyPressurePct = totFlowVol > 0 ? (buyVolEst / totFlowVol) * 100 : 50;

    let cvdToday = 0, cvdLast6 = 0, cvdPrior6 = 0;
    const cvdSeries = sessionBars.map(b => {
      const v = Math.max(0, b.volume || 0);
      const rng = b.high - b.low;
      const clvSigned = rng > 0 ? clamp(2 * ((b.close - b.low) / rng) - 1, -1, 1) : (b.close >= b.open ? 0.35 : -0.35);
      return v * clvSigned;
    });
    cvdToday = cvdSeries.reduce((s, d) => s + d, 0);
    cvdLast6 = cvdSeries.slice(-6).reduce((s, d) => s + d, 0);
    cvdPrior6 = cvdSeries.slice(-12, -6).reduce((s, d) => s + d, 0);
    let cvdTrend = 'NEUTRU';
    if (cvdLast6 > 0 && cvdPrior6 <= 0) cvdTrend = 'REBOUND';
    else if (cvdLast6 > 0 && cvdLast6 >= cvdPrior6) cvdTrend = 'ACCUM';
    else if (cvdLast6 < 0 && cvdLast6 <= cvdPrior6) cvdTrend = 'DISTRIB';

    // 5m RSI(14) & 5m ATR%
    const closes = bars.map(b => b.close);
    let gains = 0, losses = 0;
    const startR = Math.max(1, closes.length - 14);
    for (let i = startR; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff; else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? (gains > 0 ? 100 : 1) : (gains / losses);
    const rsi5m = 100 - (100 / (1 + rs));

    let trSum = 0, trCnt = 0;
    for (let i = Math.max(1, bars.length - 14); i < bars.length; i++) {
      const b = bars[i], pb = bars[i - 1];
      const tr = Math.max(b.high - b.low, Math.abs(b.high - pb.close), Math.abs(b.low - pb.close));
      trSum += tr;
      trCnt++;
    }
    const atr5m = trCnt > 0 ? trSum / trCnt : 0;

    // Key levels & distances + multi-horizon price acceleration
    const pmHigh = safeNum(quote.preMarketHigh, null)
      ?? safeNum(tv.premarket_high, null)
      ?? (calcPmHigh > 0 ? calcPmHigh : (sessionBars.length ? sessionBars[0].high : null));
    const spot = safeNum(quote.preMarketPrice && quote.marketState !== 'REGULAR' ? quote.preMarketPrice : quote.regularMarketPrice, last.close) || last.close;
    const pctFromDayLow = dayLow > 0 ? ((spot - dayLow) / dayLow) * 100 : 0;
    const pctFromDayHigh = dayHigh > 0 ? ((dayHigh - spot) / dayHigh) * 100 : 0;
    const distFromHodPct = dayHigh > 0 ? ((spot - dayHigh) / dayHigh) * 100 : 0;
    const distFromPmHighPct = pmHigh && pmHigh > 0 ? ((spot - pmHigh) / pmHigh) * 100 : null;
    const distVwapPct = vwap > 0 ? ((spot - vwap) / vwap) * 100 : 0;
    const atr5mPct = spot > 0 ? (atr5m / spot) * 100 : 0;

    // Bid/Ask quote spread strictly from live quote feed (ignore wide pre-market stub quotes > 6% when market is not REGULAR)
    const bidPx = safeNum(quote.bid, safeNum(tv.bid, null));
    const askPx = safeNum(quote.ask, safeNum(tv.ask, null));
    const rawSpreadPct = (bidPx > 0 && askPx >= bidPx)
      ? ((askPx - bidPx) / ((askPx + bidPx) / 2)) * 100
      : null;
    const isRegularMarket = quote.marketState === 'REGULAR';
    const spreadPct = rawSpreadPct != null && (isRegularMarket || rawSpreadPct <= 6.0)
      ? clamp(rawSpreadPct, 0, 25)
      : null;

    // Price acceleration: last 15m vs preceding 15m
    const chg5mPct = prev1 && prev1.close > 0 ? ((last.close - prev1.close) / prev1.close) * 100 : 0;
    const bar3Ago = bars[Math.max(0, bars.length - 4)];
    const bar6Ago = bars[Math.max(0, bars.length - 7)];
    const bar1hAgo = bars[Math.max(0, bars.length - 13)];
    const chg15mPct = bar3Ago && bar3Ago.close > 0 ? ((spot - bar3Ago.close) / bar3Ago.close) * 100 : 0;
    const prev15mPct = bar6Ago && bar3Ago && bar6Ago.close > 0 ? ((bar3Ago.close - bar6Ago.close) / bar6Ago.close) * 100 : 0;
    const priceAccelPct = chg15mPct - prev15mPct;
    const chg1hPct = bar1hAgo && bar1hAgo.close > 0 ? ((spot - bar1hAgo.close) / bar1hAgo.close) * 100 : 0;

    // Compression coil check before breakout (last 6 bars tight range + rising volume + near HOD)
    const last6 = bars.slice(-6);
    const hi6 = Math.max(...last6.map(b => b.high));
    const lo6 = Math.min(...last6.map(b => b.low));
    const range6Pct = lo6 > 0 ? ((hi6 - lo6) / lo6) * 100 : 0;
    const isTightCoil = range6Pct > 0 && range6Pct <= 2.4 && volAccelSlopePct > 10 && distFromHodPct >= -2.5;

    return {
      spot,
      todayDay,
      latestMinute,
      vwap,
      distVwapPct,
      aboveVwap: spot >= vwap,
      dayHigh,
      dayLow,
      pmHigh,
      pctFromDayLow,
      pctFromDayHigh,
      distFromHodPct,
      distFromPmHighPct,
      chg5mPct,
      chg15mPct,
      chg1hPct,
      priceAccelPct,
      vol5m: recentVol5m,
      avgVol5m20: Math.round(avgVol5m20),
      volAccel5m,
      volAccelSlopePct,
      isVolAccelerating,
      rvolTod,
      rvolTodDays,
      rvolTodExact,
      todayCumVolTod,
      buyPressurePct,
      cvdToday: Math.round(cvdToday),
      cvdLast6: Math.round(cvdLast6),
      cvdPrior6: Math.round(cvdPrior6),
      cvdTrend,
      rsi5m,
      atr5mPct,
      spreadPct,
      isTightCoil,
      breakoutPreMarketHigh: pmHigh != null && spot >= pmHigh * 0.994 && spot <= pmHigh * 1.045,
      breakoutDayHigh: dayHigh > 0 && distFromHodPct >= -0.8,
      recoveryBounce: pctFromDayLow >= 1.2 && (spot >= vwap * 0.992 || (distVwapPct > -1.5 && cvdLast6 > 0 && cvdPrior6 <= 0))
    };
  }

  // ─── 2B. EARLY SIGNAL ENGINE: 9-COMPONENT SCORING & OUTCOME VALIDATION ─────
  function loadSignalLog() {
    try {
      if (!fs.existsSync(SIGNAL_LOG_PATH)) return [];
      const raw = JSON.parse(fs.readFileSync(SIGNAL_LOG_PATH, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function saveSignalLog(list) {
    try {
      const trimmed = (Array.isArray(list) ? list : []).slice(-250);
      fs.writeFileSync(SIGNAL_LOG_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch (_) {}
  }

  function computeWeightedEarlyScore({
    f5m, rvol10d, chgPct, volume, floatShares, mcap,
    newsMeta, marketRegimeScore = 50
  }) {
    const hasRealVol5m = f5m.vol5m >= 4000;
    const effectiveRvol = f5m.rvolTod != null ? (0.65 * f5m.rvolTod + 0.35 * (rvol10d || 1)) : (rvol10d || 1);

    // 1. Volume Acceleration (20%)
    let cVolAccel = 0;
    if (hasRealVol5m) {
      let baseV = 0;
      if (f5m.volAccel5m >= 8) baseV = 14;
      else if (f5m.volAccel5m >= 4.5) baseV = 12;
      else if (f5m.volAccel5m >= 2.8) baseV = 9;
      else if (f5m.volAccel5m >= 1.8) baseV = 6;
      else if (f5m.volAccel5m >= 1.2) baseV = 3;

      let slopeBonus = 0;
      if (f5m.volAccelSlopePct >= 35) slopeBonus = 6;
      else if (f5m.volAccelSlopePct >= 12) slopeBonus = 4;
      else if (f5m.volAccelSlopePct >= 0) slopeBonus = 2;
      else if (f5m.volAccelSlopePct <= -25) slopeBonus = -3;
      cVolAccel = Math.round(clamp(baseV + slopeBonus, 0, 20));
    } else {
      cVolAccel = f5m.vol5m >= 1000 ? 2 : 0;
    }

    // 2. Relative Volume TOD + 10D (15%)
    let cRelVol = 0;
    if (effectiveRvol >= 5.0) cRelVol = 15;
    else if (effectiveRvol >= 3.2) cRelVol = 13;
    else if (effectiveRvol >= 2.2) cRelVol = 10;
    else if (effectiveRvol >= 1.5) cRelVol = 7;
    else if (effectiveRvol >= 1.1) cRelVol = 4;
    else if (effectiveRvol >= 0.75) cRelVol = 2;
    else cRelVol = 0;

    // 3. Buying Pressure / OHLCV Flow Delta Proxy (15%)
    let cFlow = 0;
    if (!hasRealVol5m) {
      cFlow = f5m.buyPressurePct >= 60 ? 3 : 1;
    } else {
      if (f5m.buyPressurePct >= 82) cFlow = 12;
      else if (f5m.buyPressurePct >= 70) cFlow = 10;
      else if (f5m.buyPressurePct >= 60) cFlow = 7;
      else if (f5m.buyPressurePct >= 52) cFlow = 4;
      else if (f5m.buyPressurePct >= 44) cFlow = 2;
      else cFlow = 0;

      if (f5m.cvdTrend === 'ACCUM' || f5m.cvdTrend === 'REBOUND') cFlow += 3;
      else if (f5m.cvdTrend === 'DISTRIB') cFlow = Math.max(0, cFlow - 3);
      cFlow = Math.round(clamp(cFlow, 0, 15));
    }

    // 4. Price Momentum & Acceleration (15%)
    let cPriceMom = 0;
    if (chgPct >= 1.2 && chgPct <= 11.0) {
      cPriceMom = 8;
      if (f5m.priceAccelPct >= 0.8 && f5m.chg15mPct > 0.5) cPriceMom += 5;
      else if (f5m.priceAccelPct > 0.15) cPriceMom += 3;
      if (f5m.chg5mPct >= 0.4) cPriceMom += 2;
    } else if (chgPct > 11.0 && chgPct <= 18.0) {
      cPriceMom = f5m.priceAccelPct > 0.5 ? 7 : 4; // partial extension discount
    } else if (chgPct > 18.0) {
      cPriceMom = f5m.chg5mPct > 0 ? 4 : 1; // chased move penalty
    } else if (chgPct >= -0.5 && chgPct < 1.2) {
      cPriceMom = 3;
      if (f5m.chg15mPct >= 0.6 && f5m.priceAccelPct > 0.2) cPriceMom += 5; // pre-breakout coil awakening
    } else {
      // Negative day % only gets momentum points if confirmed intraday reversal bounce
      cPriceMom = (f5m.recoveryBounce && f5m.priceAccelPct > 0.4 && f5m.cvdLast6 > 0) ? 7 : 1;
    }
    cPriceMom = Math.round(clamp(cPriceMom, 0, 15));

    // 5. VWAP Positioning (10%)
    let cVwap = 0;
    if (f5m.distVwapPct >= 0 && f5m.distVwapPct <= 3.5) cVwap = 10;
    else if (f5m.distVwapPct > 3.5 && f5m.distVwapPct <= 8.0) cVwap = 7;
    else if (f5m.distVwapPct > 8.0) cVwap = 4; // stretched too far from VWAP
    else if (f5m.distVwapPct >= -1.0 && (f5m.cvdTrend === 'REBOUND' || f5m.cvdTrend === 'ACCUM')) cVwap = 5;
    else cVwap = 1;

    // 6. Breakout Structure (10%)
    let cStruct = 0;
    if (f5m.breakoutPreMarketHigh && f5m.aboveVwap && volume >= 150000) cStruct += 4;
    if (f5m.distFromHodPct >= -1.2 && volume >= 150000) cStruct += 4;
    if (f5m.isTightCoil) cStruct += 3;
    else if (f5m.recoveryBounce) cStruct += 3;
    if (cStruct === 0 && f5m.distFromHodPct >= -3.0 && f5m.aboveVwap) cStruct = 2;
    cStruct = Math.round(clamp(cStruct, 0, 10));

    // 7. Float / Liquidity & Spread (5%)
    let cLiq = 1;
    if (volume >= 400000) {
      if (floatShares != null && floatShares < 25000000) cLiq = 5;
      else if (floatShares != null && floatShares < 80000000) cLiq = 4;
      else if (mcap != null && mcap < 5000000000) cLiq = 4;
      else if (mcap != null && mcap < 50000000000) cLiq = 3;
      else cLiq = 2;
    }
    if (f5m.spreadPct != null) {
      if (f5m.spreadPct > 1.5) cLiq = Math.max(0, cLiq - 2);
      else if (f5m.spreadPct > 0.7) cLiq = Math.max(0, cLiq - 1);
    }

    // 8. News Catalyst (5%)
    let cNews = 0;
    if (newsMeta) {
      if (newsMeta.ageHours <= 6) cNews = newsMeta.bias === 'BEARISH' && chgPct < 0 ? 3 : 5;
      else if (newsMeta.ageHours <= 24) cNews = 4;
      else if (newsMeta.ageHours <= 48) cNews = 2;
      else cNews = 1;
    }

    // 9. Market Conditions / Tailwind (5%)
    let cMarket = 2;
    if (marketRegimeScore >= 65) cMarket = 5;
    else if (marketRegimeScore >= 52) cMarket = 4;
    else if (marketRegimeScore >= 40) cMarket = 3;
    else cMarket = 1;

    // Hard liquidity gate prevents dead 5m tickers from creeping into top scores
    let total = cVolAccel + cRelVol + cFlow + cPriceMom + cVwap + cStruct + cLiq + cNews + cMarket;
    if (!hasRealVol5m) total = Math.min(total, 52);
    total = Math.round(clamp(total, 5, 98));

    const breakdown = [
      { key: 'volAccel', label: 'Volume Acceleration', score: cVolAccel, max: 20, weightPct: 20, detail: `${f5m.volAccel5m.toFixed(1)}x vs 20 · Panta ${f5m.volAccelSlopePct >= 0 ? '+' : ''}${Math.round(f5m.volAccelSlopePct)}%` },
      { key: 'relVol', label: 'Relative Volume (TOD+10D)', score: cRelVol, max: 15, weightPct: 15, detail: `TOD ${f5m.rvolTod != null ? f5m.rvolTod.toFixed(2) + 'x' : 'N/A'} · 10D ${(rvol10d || 1).toFixed(2)}x` },
      { key: 'flowDelta', label: 'Flux Bară 5m (Proxy OHLCV)', score: cFlow, max: 15, weightPct: 15, detail: `${Math.round(f5m.buyPressurePct)}% Buy Proxy · CVD ${f5m.cvdTrend}` },
      { key: 'priceMom', label: 'Price Momentum & Accel', score: cPriceMom, max: 15, weightPct: 15, detail: `Zi ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% · Accel 15m ${f5m.priceAccelPct >= 0 ? '+' : ''}${f5m.priceAccelPct.toFixed(2)}%` },
      { key: 'vwapPos', label: 'Poziție vs VWAP', score: cVwap, max: 10, weightPct: 10, detail: `${f5m.distVwapPct >= 0 ? '+' : ''}${f5m.distVwapPct.toFixed(2)}% vs VWAP` },
      { key: 'structure', label: 'Structură Breakout / Coil', score: cStruct, max: 10, weightPct: 10, detail: `Dist HOD ${f5m.distFromHodPct.toFixed(1)}%${f5m.isTightCoil ? ' · Compresie' : ''}` },
      { key: 'liquidity', label: 'Float / Lichiditate & Spread', score: cLiq, max: 5, weightPct: 5, detail: `Float ${floatShares ? (floatShares / 1e6).toFixed(1) + 'M' : 'N/A'} · Spread ${f5m.spreadPct != null ? f5m.spreadPct.toFixed(2) + '%' : 'N/A'}` },
      { key: 'catalyst', label: 'Catalizator Știri', score: cNews, max: 5, weightPct: 5, detail: newsMeta ? `${newsMeta.category} (${Math.round(newsMeta.ageHours)}h)` : 'Fără știre recentă <48h' },
      { key: 'marketCond', label: 'Market Tailwind', score: cMarket, max: 5, weightPct: 5, detail: `Regim piață ${Math.round(marketRegimeScore)}/100` }
    ];

    return { total, breakdown, components: { cVolAccel, cRelVol, cFlow, cPriceMom, cVwap, cStruct, cLiq, cNews, cMarket } };
  }

  function auditDataQuality({
    sym = '',
    chgPct = 0,
    sessionCtx = getMarketSessionContext(),
    volume = 0,
    price = 0,
    vol5m = 0,
    avgVol5m20 = 0,
    rvolDaily = null,
    rvol5m = null,
    rvolTod = null,
    floatShares = null,
    yfFloatShares = null,
    tvFloatShares = null,
    spreadPct = null,
    rawSpreadPct = null
  }) {
    const flags = [];
    const rv5 = Number(rvol5m);
    const rvTod = rvolTod != null ? Number(rvolTod) : null;
    const isTinyBase = avgVol5m20 > 0 && avgVol5m20 < 800;
    const extremeRvol5m = Number.isFinite(rv5) && (
      rv5 > 250
      || (rv5 > 80 && !sessionCtx.isRegular)
      || (isTinyBase && rv5 > 40)
    );

    if (extremeRvol5m) {
      flags.push({
        code: 'RVOL5M_ANOMALY',
        severity: 'ANOMALIE',
        message: `RVOL 5m (${rv5.toFixed(1)}x) este extrem: probabil numitor aproape zero sau sesiune ${sessionCtx.label}; nu trata cifra ca lichiditate normală.`
      });
    }

    if (!sessionCtx.isRegular) {
      flags.push({
        code: 'EXTENDED_SESSION',
        severity: 'ATENȚIE',
        message: `Sesiune activă ${sessionCtx.label} (${sessionCtx.timeEt}): volumul și spread-ul trebuie evaluate vs sesiuni ${sessionCtx.isPreMarket ? 'pre-market' : 'extinse'} istorice (TOD), nu direct cu media zilnică.`
      });
    }

    if (spreadPct == null) {
      flags.push({
        code: 'SPREAD_UNAVAILABLE',
        severity: 'ATENȚIE',
        message: rawSpreadPct != null
          ? `Spread brut Bid/Ask foarte larg (${rawSpreadPct.toFixed(2)}%) sau quote pre-market instabil.`
          : 'Spread Bid/Ask L1 indisponibil în acest moment (piață închisă/extinsă sau quote incomplet).'
      });
    } else if (spreadPct > 2.5) {
      flags.push({
        code: 'SPREAD_WIDE',
        severity: 'ANOMALIE',
        message: `Spread Bid/Ask ridicat (${spreadPct.toFixed(2)}%) — risc de slippage mare la intrare/ieșire.`
      });
    }

    const effFloat = yfFloatShares || floatShares || tvFloatShares;
    if (!effFloat || effFloat <= 0) {
      flags.push({
        code: 'FLOAT_MISSING',
        severity: 'ATENȚIE',
        message: 'Float-ul public lipsește din fluxul curent — verifică SEC EDGAR.'
      });
    } else if (yfFloatShares > 0 && tvFloatShares > 0) {
      const diffRatio = Math.abs(yfFloatShares - tvFloatShares) / Math.max(yfFloatShares, tvFloatShares);
      if (diffRatio > 0.30) {
        flags.push({
          code: 'FLOAT_MISMATCH',
          severity: 'ANOMALIE',
          message: `Discrepanță Float: Yahoo ${(yfFloatShares / 1e6).toFixed(2)}M vs TradingView ${(tvFloatShares / 1e6).toFixed(2)}M (diferență ${(diffRatio * 100).toFixed(0)}%).`
        });
      }
    }

    const dollarVol = (Number(price) || 0) * (Number(volume) || 0);
    if (volume > 0 && dollarVol < 500000) {
      flags.push({
        code: 'LOW_DOLLAR_LIQUIDITY',
        severity: 'ATENȚIE',
        message: `Lichiditate dolar redusă ($${Math.round(dollarVol / 1000)}K) — execuție dificilă.`
      });
    }

    const hasAnomaly = flags.some(f => f.severity === 'ANOMALIE');
    const hasWarn = flags.length > 0;
    const status = hasAnomaly ? 'ANOMALIE' : (hasWarn ? 'ATENȚIE' : 'VERIFICAT');

    return {
      status,
      sessionLabel: sessionCtx.label,
      timeEt: sessionCtx.timeEt,
      timeRo: sessionCtx.timeRo,
      rvol5mReliable: !extremeRvol5m,
      rvol5mDisplayFlag: extremeRvol5m ? 'Anomalie Bază / Extins' : null,
      dollarVolume: Math.round(dollarVol),
      flags,
      sources: {
        price: sessionCtx.isRegular ? 'Yahoo/TV Regular Quote' : 'Yahoo/TV Extended Quote',
        rvolTod: rvTod != null ? 'Yahoo 5m 10D Time-of-Day' : 'Indisponibil',
        float: yfFloatShares && tvFloatShares ? 'Cross-check Yahoo + TV' : (tvFloatShares ? 'TradingView' : (yfFloatShares ? 'Yahoo Stats' : 'Indisponibil')),
        spread: spreadPct != null ? 'L1 Quote Bid/Ask' : 'Indisponibil'
      }
    };
  }

  function evaluatePreBuySafetyChecks({
    sym = '',
    price = 0,
    chgPct = 0,
    distVwapPct = 0,
    volume = 0,
    rvol5m = 0,
    floatShares = null,
    yfFloatShares = null,
    tvFloatShares = null,
    spreadPct = null,
    newsMeta = null,
    secPack = null,
    halt = null,
    sessionCtx = getMarketSessionContext(),
    dataQuality = null
  }) {
    const dq = dataQuality || auditDataQuality({ sym, chgPct, sessionCtx, volume, price, rvol5m, floatShares, yfFloatShares, tvFloatShares, spreadPct });
    const checks = [];

    // 1. Float independent cross-check
    let floatSt = 'WARN';
    let floatDetail = 'Doar o sursă Float — recomandat cross-check SEC';
    if (!floatShares && !yfFloatShares && !tvFloatShares) {
      floatSt = 'WARN';
      floatDetail = 'Float nedisponibil din ambele surse';
    } else if (yfFloatShares > 0 && tvFloatShares > 0) {
      const diffRatio = Math.abs(yfFloatShares - tvFloatShares) / Math.max(yfFloatShares, tvFloatShares);
      if (diffRatio <= 0.30) {
        floatSt = 'PASS';
        floatDetail = `Confirmat (${(yfFloatShares / 1e6).toFixed(2)}M YF / ${(tvFloatShares / 1e6).toFixed(2)}M TV)`;
      } else {
        floatSt = 'FAIL';
        floatDetail = `Discrepanță mare: ${(yfFloatShares / 1e6).toFixed(2)}M YF vs ${(tvFloatShares / 1e6).toFixed(2)}M TV`;
      }
    } else {
      const fVal = yfFloatShares || floatShares || tvFloatShares;
      floatDetail = `Sursă unică (${(fVal / 1e6).toFixed(2)}M) — fără verificare secundară`;
    }
    checks.push({ id: 'float', label: '1. Verificare Float independentă', status: floatSt, detail: floatDetail });

    // 2. New shares / Dilution / ATM / S-3 / Reverse split
    let dilSt = 'WARN';
    let dilDetail = 'SEC EDGAR neverificat live în acest scan';
    const hasNewsDilution = !!(newsMeta && (newsMeta.isDilutionRisk || /dilu|offering|shelf|s-3|424b|atm|reverse split/i.test(String(newsMeta.category || '') + ' ' + String(newsMeta.title || ''))));
    if (hasNewsDilution) {
      dilSt = 'FAIL';
      dilDetail = `Catalizator diluție/ofertă/reverse-split detectat în știri (${newsMeta.category})`;
    } else if (secPack?.available) {
      if (secPack.dilutionRisk === 'RIDICAT') {
        dilSt = 'FAIL';
        const forms = (secPack.dilutionHits180 || []).slice(0, 2).map(h => h.form).join(', ');
        dilDetail = `Risc diluție RIDICAT în SEC EDGAR (${forms || 'S-3/424B/3.02'})`;
      } else if (secPack.dilutionRisk === 'MODERAT') {
        dilSt = 'WARN';
        dilDetail = 'Risc diluție MODERAT în SEC (verifică 424B/S-3)';
      } else {
        dilSt = 'PASS';
        dilDetail = 'SEC EDGAR curat (fără S-3 / 424B / Item 3.02 recent)';
      }
    }
    checks.push({ id: 'dilution', label: '2. Acțiuni noi / Diluție SEC', status: dilSt, detail: dilDetail });

    // 3. LULD Halts
    let haltSt = 'PASS';
    let haltDetail = 'Fără halt LULD activ';
    if (halt) {
      haltSt = 'FAIL';
      haltDetail = `HALT LULD (${halt.code || 'ACTIVE'}): ${halt.explanation || halt.haltTime || 'suspendat'}`;
    }
    checks.push({ id: 'halt', label: '3. Verificare Halts LULD', status: haltSt, detail: haltDetail });

    // 4. Bid/Ask Spread %
    let sprSt = 'WARN';
    let sprDetail = `Spread indisponibil (${sessionCtx.label})`;
    if (spreadPct != null) {
      if (spreadPct <= 1.2) {
        sprSt = 'PASS';
        sprDetail = `Spread strâns ${spreadPct.toFixed(2)}%`;
      } else if (spreadPct <= 2.5) {
        sprSt = 'WARN';
        sprDetail = `Spread moderat ${spreadPct.toFixed(2)}%`;
      } else {
        sprSt = 'FAIL';
        sprDetail = `Spread excesiv ${spreadPct.toFixed(2)}% (> 2.5%)`;
      }
    }
    checks.push({ id: 'spread', label: '4. Verificare Spread Bid/Ask', status: sprSt, detail: sprDetail });

    // 5. Effective Dollar Liquidity
    const dollarVol = dq.dollarVolume || ((Number(price) || 0) * (Number(volume) || 0));
    let liqSt = 'WARN';
    let liqDetail = `Lichiditate ~$${(dollarVol / 1e6).toFixed(2)}M`;
    if (dollarVol >= 2000000 && volume >= 150000) {
      liqSt = 'PASS';
      liqDetail = `Lichiditate solidă $${(dollarVol / 1e6).toFixed(2)}M (${(volume / 1e6).toFixed(2)}M acț.)`;
    } else if (dollarVol < 500000 || volume < 50000) {
      liqSt = 'FAIL';
      liqDetail = `Lichiditate slabă $${Math.round(dollarVol / 1000)}K — risc slippage`;
    } else {
      liqSt = 'WARN';
      liqDetail = `Lichiditate moderată $${(dollarVol / 1e6).toFixed(2)}M`;
    }
    checks.push({ id: 'liquidity', label: '5. Lichiditate efectivă ($)', status: liqSt, detail: liqDetail });

    // 6. Catalyst Verification + Extension Guard
    let catSt = 'WARN';
    let catDetail = 'Fără știre catalizator <24h confirmată';
    if (newsMeta) {
      if (newsMeta.bias === 'BEARISH') {
        catSt = 'FAIL';
        catDetail = `Știre bearish (${newsMeta.category})`;
      } else if (newsMeta.isFresh || (newsMeta.ageHours != null && newsMeta.ageHours <= 24)) {
        catSt = 'PASS';
        catDetail = `${newsMeta.category} (${Math.round(newsMeta.ageHours || 1)}h)`;
      } else {
        catSt = 'WARN';
        catDetail = `Știre mai veche (${Math.round(newsMeta.ageHours || 48)}h): ${newsMeta.category}`;
      }
    }
    checks.push({ id: 'catalyst', label: '6. Catalizator Știre reală', status: catSt, detail: catDetail });

    const isOverExtended = chgPct >= 25 || (chgPct >= 16 && distVwapPct >= 10);
    const hasCriticalFailure = checks.some(c => c.status === 'FAIL');
    const anomalyBlocked = !dq.rvol5mReliable && (spreadPct == null || !sessionCtx.isRegular);
    const allowBuy = !isOverExtended && !hasCriticalFailure && !anomalyBlocked;

    const failedLabels = checks.filter(c => c.status === 'FAIL').map(c => c.label.replace(/^\d+\.\s*/, ''));
    if (isOverExtended) failedLabels.unshift(`Supra-extins (+${chgPct.toFixed(1)}%)`);
    if (anomalyBlocked) failedLabels.push(`Anomalie RVOL 5m (${Number(rvol5m).toFixed(1)}x)`);

    return {
      allowBuy,
      isOverExtended,
      hasCriticalFailure,
      anomalyBlocked,
      passedCount: checks.filter(c => c.status === 'PASS').length,
      warnCount: checks.filter(c => c.status === 'WARN').length,
      failCount: checks.filter(c => c.status === 'FAIL').length,
      totalChecks: checks.length,
      blockers: failedLabels,
      checks
    };
  }

  function compute5InterpretableScores({ f5m, rvol10d, chgPct, volume, floatShares, mcap, newsMeta, marketRegimeScore = 50, earlyRes, preBuy, dataQuality }) {
    const baseEarly = earlyRes?.total ?? 50;

    // 1. Early Opportunity Score (prefers < +10% move before extension + coil + VWAP + rising TOD)
    const earlyOppScore = Math.round(clamp(
      chgPct > 18 ? Math.min(baseEarly, 48) : baseEarly,
      5, 98
    ));

    // 2. Momentum Score (price velocity + HOD proximity + volume thrust)
    let momScore = 20;
    if (chgPct >= 10) momScore += 28;
    else if (chgPct >= 4) momScore += 22;
    else if (chgPct >= 1) momScore += 14;
    else if (chgPct <= -4) momScore += 18; // downside momentum clarity
    if (f5m.chg15mPct >= 1.2 || f5m.chg5mPct >= 0.6) momScore += 18;
    else if (f5m.chg15mPct >= 0.4) momScore += 10;
    if (f5m.volAccel5m >= 3) momScore += 18;
    else if (f5m.volAccel5m >= 1.6) momScore += 11;
    if (f5m.distFromHodPct >= -1.5) momScore += 14;
    momScore = Math.round(clamp(momScore, 5, 99));

    // 3. Breakout Confirmation Score
    let brkScore = 15;
    if (f5m.breakoutDayHigh) brkScore += 28;
    if (f5m.breakoutPreMarketHigh) brkScore += 22;
    if (f5m.aboveVwap) brkScore += 18;
    if (f5m.volAccel5m >= 1.6 && f5m.vol5m >= 4000) brkScore += 15;
    if (f5m.spreadPct != null && f5m.spreadPct <= 1.0) brkScore += 8;
    if (f5m.isTightCoil) brkScore += 8;
    if (chgPct > 22) brkScore = Math.min(brkScore, 62); // extended breakout is riskier
    brkScore = Math.round(clamp(brkScore, 5, 98));

    // 4. Risk Score (0 = low risk, 100 = extreme risk)
    let rskScore = 15;
    const riskFactors = [];
    if (chgPct >= 25) { rskScore += 30; riskFactors.push(`Extins extrem (+${chgPct.toFixed(1)}%)`); }
    else if (chgPct >= 14) { rskScore += 16; riskFactors.push(`Mișcare deja întinsă (+${chgPct.toFixed(1)}%)`); }
    if (f5m.distVwapPct >= 10) { rskScore += 14; riskFactors.push(`Departe de VWAP (+${f5m.distVwapPct.toFixed(1)}%)`); }
    if (dataQuality && !dataQuality.rvol5mReliable) { rskScore += 18; riskFactors.push('Anomalie bază RVOL 5m'); }
    if (f5m.spreadPct != null && f5m.spreadPct > 2.0) { rskScore += 16; riskFactors.push(`Spread larg ${f5m.spreadPct.toFixed(2)}%`); }
    else if (f5m.spreadPct == null) { rskScore += 8; riskFactors.push('Spread Bid/Ask neverificat'); }
    if (preBuy?.checks?.find(c => c.id === 'dilution')?.status === 'FAIL') { rskScore += 26; riskFactors.push('Risc Diluție / SEC S-3 / ATM'); }
    if (preBuy?.checks?.find(c => c.id === 'halt')?.status === 'FAIL') { rskScore += 28; riskFactors.push('HALT LULD activ'); }
    if (volume < 150000 || (price => price * volume)(f5m.spot || 1) < 500000) { rskScore += 15; riskFactors.push('Lichiditate redusă'); }
    rskScore = Math.round(clamp(rskScore, 8, 99));

    // 5. News Catalyst Score
    let newsScore = 10;
    const newsFactors = [];
    if (newsMeta) {
      newsScore = newsMeta.impact || 60;
      newsFactors.push(`${newsMeta.category} (${newsMeta.bias})`);
      if (newsMeta.isFresh) newsFactors.push(`Știre proaspătă (${Math.round(newsMeta.ageHours)}h)`);
      else newsFactors.push(`Vechime ${Math.round(newsMeta.ageHours)}h`);
    } else {
      newsFactors.push('Fără catalizator știre <48h în feed');
    }
    newsScore = Math.round(clamp(newsScore, 5, 98));

    return {
      earlyOpportunity: {
        score: earlyOppScore,
        label: 'Early Opportunity Score',
        factors: [
          `TOD RVOL: ${f5m.rvolTod != null ? f5m.rvolTod.toFixed(2) + 'x' : 'N/A'} · 10D: ${(rvol10d || 1).toFixed(2)}x`,
          `Volum 5m Accel: ${f5m.volAccel5m.toFixed(1)}x (panta ${f5m.volAccelSlopePct >= 0 ? '+' : ''}${Math.round(f5m.volAccelSlopePct)}%)`,
          `Poziție VWAP: ${f5m.distVwapPct >= 0 ? '+' : ''}${f5m.distVwapPct.toFixed(2)}% · HOD ${f5m.distFromHodPct.toFixed(1)}%`
        ]
      },
      momentum: {
        score: momScore,
        label: 'Momentum Score',
        factors: [
          `Mișcare Zi: ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% · 15m: ${f5m.chg15mPct >= 0 ? '+' : ''}${f5m.chg15mPct.toFixed(2)}%`,
          `5m: ${f5m.chg5mPct >= 0 ? '+' : ''}${f5m.chg5mPct.toFixed(2)}% · Accel 15m: ${f5m.priceAccelPct >= 0 ? '+' : ''}${f5m.priceAccelPct.toFixed(2)}%`,
          `Flux Bară [Proxy OHLCV]: ${Math.round(f5m.buyPressurePct)}% · CVD ${f5m.cvdTrend}`
        ]
      },
      breakoutConfirm: {
        score: brkScore,
        label: 'Breakout Confirmation',
        factors: [
          f5m.breakoutDayHigh ? 'Breakout HOD confirmat' : `Dist HOD: ${f5m.distFromHodPct.toFixed(1)}%`,
          f5m.breakoutPreMarketHigh ? 'Peste Pre-Market High' : (f5m.distFromPmHighPct != null ? `vs PM High: ${f5m.distFromPmHighPct.toFixed(1)}%` : 'PM High indisponibil'),
          f5m.aboveVwap ? 'Preț peste VWAP' : 'Sub VWAP (necesită reclaim)'
        ]
      },
      risk: {
        score: rskScore,
        label: 'Risk Score',
        tone: rskScore >= 65 ? 'dn' : (rskScore >= 40 ? 'amber' : 'up'),
        factors: riskFactors.length ? riskFactors : ['Fără riscuri critice imediate detectate']
      },
      newsCatalyst: {
        score: newsScore,
        label: 'News Catalyst Score',
        factors: newsFactors
      }
    };
  }

  function computeFivePillarsBreakdown({ rvolDaily = 1, chgPct = 0, floatShares = null, shortPctFloat = null, shortRatio = null, rvol5m = 0, newsMeta = null }) {
    const rvD = Number(rvolDaily) || 0;
    const cPct = Number(chgPct) || 0;
    const flt = floatShares != null ? Number(floatShares) : null;
    const rv5 = Number(rvol5m) || 0;

    const p1 = rvD >= 3 ? 20 : (rvD >= 2 ? 15 : (rvD >= 1.3 ? 8 : 2));
    const p2 = (cPct >= 5 && cPct <= 35) ? 20 : (cPct >= 2 ? 14 : (cPct > 35 ? 12 : 3));
    let p3 = flt != null ? (flt < 10e6 ? 16 : (flt < 25e6 ? 13 : (flt < 60e6 ? 7 : 3))) : 4;
    if (shortPctFloat != null && shortPctFloat >= 12) p3 = Math.min(20, p3 + 4);
    const p4 = (rv5 >= 2 && rv5 <= 250) ? (rv5 >= 5 ? 20 : 14) : (rv5 > 250 ? 6 : 3);
    const p5 = newsMeta ? (newsMeta.bias === 'BEARISH' ? 4 : (newsMeta.isFresh ? 20 : 12)) : 3;

    const score = Math.round(clamp(p1 + p2 + p3 + p4 + p5, 0, 100));
    return {
      score,
      disclaimer: 'Scorul reflectă doar bifarea criteriilor de moment (5 Pillars) și NU reprezintă probabilitatea istorică de câștig.',
      pillars: [
        { name: '1. Relative Volume (Zi)', score: p1, max: 20, status: rvD >= 2 ? 'PASS' : 'FAIL', detail: `${rvD.toFixed(2)}x (țintă >= 2.0x)` },
        { name: '2. Price Momentum', score: p2, max: 20, status: cPct >= 4 ? 'PASS' : 'WARN', detail: `${cPct >= 0 ? '+' : ''}${cPct.toFixed(2)}% azi` },
        { name: '3. Float & Short Interest', score: p3, max: 20, status: (flt != null && flt < 25e6) ? 'PASS' : 'WARN', detail: `Float ${flt != null ? (flt / 1e6).toFixed(1) + 'M' : 'N/A'} · SI ${shortPctFloat != null ? shortPctFloat + '%' : 'N/A'}` },
        { name: '4. Volume Acceleration (5m)', score: p4, max: 20, status: (rv5 >= 2 && rv5 <= 250) ? 'PASS' : (rv5 > 250 ? 'ANOMALIE' : 'WARN'), detail: rv5 > 250 ? `${rv5.toFixed(1)}x (Anomalie Bază)` : `${rv5.toFixed(1)}x` },
        { name: '5. Catalizatori & Știri', score: p5, max: 20, status: newsMeta && newsMeta.bias !== 'BEARISH' ? 'PASS' : (newsMeta?.bias === 'BEARISH' ? 'RISK' : 'WARN'), detail: newsMeta ? `${newsMeta.category} (${Math.round(newsMeta.ageHours)}h)` : 'Fără știre <48h' }
      ]
    };
  }

  function classifySetupCategory({ f5m, rvol10d, chgPct, rsiDaily, volume }) {
    const rvolRef = f5m.rvolTod != null ? Math.max(f5m.rvolTod, rvol10d || 1) : (rvol10d || 1);
    const hasVol = f5m.vol5m >= 4000 && volume >= 150000;

    // 4. Reversal / Accumulation: negative/dip with improving CVD or VWAP reclaim
    const isReversal = (chgPct < -0.4 && (f5m.cvdTrend === 'REBOUND' || f5m.cvdTrend === 'ACCUM') && f5m.recoveryBounce)
      || (f5m.recoveryBounce && chgPct < 2.0)
      || (rsiDaily != null && rsiDaily <= 40 && f5m.volAccel5m >= 1.4 && f5m.cvdLast6 > 0);

    // 3. Breakout Confirmed: above HOD or PM High + above VWAP + positive price & volume
    const isBreakout = hasVol && (f5m.breakoutDayHigh || f5m.breakoutPreMarketHigh) && f5m.aboveVwap && chgPct >= 0.8 && f5m.volAccel5m >= 1.3;

    // 2. Volume Explosion: >= 3x 5m spike & RVOL >= 1.8 & real price response
    const isVolExp = hasVol && f5m.volAccel5m >= 3.0 && rvolRef >= 1.8 && Math.abs(chgPct) >= 0.8
      && (f5m.spreadPct == null || f5m.spreadPct <= 3.0);

    // 1. Early Momentum (Priority 1 - before extension): moderate change, rising volume, close to resistance/VWAP
    const isEarlyMom = hasVol && chgPct >= -1.0 && chgPct <= 9.5
      && (f5m.volAccelSlopePct > 5 || f5m.volAccel5m >= 1.4)
      && (f5m.distFromHodPct >= -3.5 || f5m.aboveVwap || f5m.isTightCoil);

    let primaryCategory = 'early_momentum';
    let primaryLabel = '1. Early Momentum';
    let setupTag = 'Consolidare Timpurie';

    if (isBreakout && chgPct < 14 && f5m.volAccel5m >= 1.6) {
      primaryCategory = 'breakout_confirmed';
      primaryLabel = '3. Breakout Confirmat';
      setupTag = f5m.breakoutPreMarketHigh ? 'Breakout Pre-Market High' : 'Breakout HOD Confirmat';
    } else if (isVolExp && chgPct < 15) {
      primaryCategory = 'volume_explosion';
      primaryLabel = '2. Volume Explosion';
      setupTag = `Explozie Volum 5m (${f5m.volAccel5m.toFixed(1)}x)`;
    } else if (isReversal) {
      primaryCategory = 'reversal_accum';
      primaryLabel = '4. Reversal / Accum.';
      setupTag = f5m.aboveVwap ? 'Reclaim VWAP + Îmbunătățire Delta' : 'Absorbție / Divergență CVD';
    } else if (isEarlyMom) {
      primaryCategory = 'early_momentum';
      primaryLabel = '1. Early Momentum';
      setupTag = f5m.isTightCoil ? 'Compresie Strânsă Lângă HOD' : 'Accelerare Volum Pre-Breakout';
    } else if (chgPct >= 14) {
      primaryCategory = 'volume_explosion';
      primaryLabel = '2. Extins / Post-Run';
      setupTag = `Extins +${chgPct.toFixed(1)}% (Risc Urmărire)`;
    }

    return {
      primaryCategory,
      primaryLabel,
      setupTag,
      flags: {
        early_momentum: isEarlyMom,
        volume_explosion: isVolExp,
        breakout_confirmed: isBreakout,
        reversal_accum: isReversal
      }
    };
  }

  function computeDirectionalVerdict({ price, chgPct, f5m, rvol10d, earlyScore, preBuy = null, dataQuality = null }) {
    const px = Number(price) || 0;
    const step = Math.max(
      px * 0.015,
      f5m.atr5mPct > 0 ? px * (f5m.atr5mPct / 100) * 2.4 : px * 0.025
    );
    const fmt = (n) => (n >= 100 ? n.toFixed(2) : (n >= 1 ? n.toFixed(2) : n.toFixed(4)));
    const rvolRef = f5m.rvolTod != null ? Math.max(f5m.rvolTod, rvol10d || 1) : (rvol10d || 1);
    const volOk = f5m.vol5m >= 4000 && (f5m.volAccel5m >= 1.4 || rvolRef >= 1.4);
    const extended = chgPct >= 25 || (chgPct > 16 && f5m.distVwapPct > 10);

    let bullPts = 0;
    let bearPts = 0;

    if (f5m.aboveVwap) bullPts += 2;
    else if (f5m.distVwapPct <= -0.35) bearPts += 2;

    if (f5m.buyPressurePct >= 60) bullPts += 2;
    if (f5m.buyPressurePct >= 72) bullPts += 1;
    if (f5m.buyPressurePct <= 42) bearPts += 2;
    if (f5m.buyPressurePct <= 34) bearPts += 1;

    if (f5m.cvdTrend === 'ACCUM' || f5m.cvdTrend === 'REBOUND') bullPts += 2;
    else if (f5m.cvdTrend === 'DISTRIB') bearPts += 2;

    if (chgPct >= 0.8 && chgPct <= 14) bullPts += 2;
    if (f5m.chg15mPct >= 0.5 || f5m.chg5mPct >= 0.3) bullPts += 1;
    if (chgPct <= -1.2 && !f5m.recoveryBounce) bearPts += 2;
    if (f5m.chg15mPct <= -0.5) bearPts += 1;

    if ((f5m.breakoutDayHigh || f5m.breakoutPreMarketHigh) && f5m.aboveVwap) bullPts += 2;
    if (!f5m.aboveVwap && f5m.distFromHodPct <= -3.5) bearPts += 1;

    const triggerBuyPx = f5m.dayHigh > 0 ? Math.max(f5m.dayHigh, f5m.vwap || px) : px * 1.015;
    const triggerSellPx = f5m.vwap > 0 ? f5m.vwap * 0.995 : px * 0.985;
    const preBuyBlocked = preBuy ? !preBuy.allowBuy : false;

    const wantsStrongBuy = volOk && !extended && bullPts >= 7 && bearPts <= 1 && f5m.aboveVwap && earlyScore >= 72;
    const wantsBuy = volOk && !extended && bullPts >= 5 && bullPts - bearPts >= 3 && f5m.aboveVwap && (chgPct >= 0.4 || f5m.chg15mPct >= 0.6);

    if (wantsStrongBuy || wantsBuy) {
      if (preBuyBlocked) {
        const blockTxt = preBuy.blockers?.slice(0, 2).join(' · ') || 'Verificări Pre-BUY incomplete';
        return {
          action: 'WAIT',
          shortBadge: preBuy.isOverExtended ? 'SUPRA-EXTINS' : 'BLOCAT PRE-BUY',
          tone: 'wait',
          direction: 'LONG',
          blockedBySafety: true,
          triggerBuyPx: Number(triggerBuyPx.toFixed(4)),
          triggerSellPx: Number(triggerSellPx.toFixed(4)),
          summary: `BUY blocat de Pre-BUY Gate: ${blockTxt}`
        };
      }
      const sl = wantsStrongBuy
        ? Math.max(0.01, Math.min(px - step, (f5m.vwap || px) * 0.988))
        : Math.max(0.01, px - step);
      const tp = wantsStrongBuy
        ? px + Math.max(step * 2.2, (px - sl) * 2.2)
        : px + step * 2.2;
      const act = wantsStrongBuy ? 'STRONG BUY' : 'BUY';
      return {
        action: act,
        shortBadge: act,
        tone: wantsStrongBuy ? 'strong-buy' : 'buy',
        direction: 'LONG',
        entryPx: Number(px.toFixed(4)),
        slPx: Number(sl.toFixed(4)),
        tpPx: Number(tp.toFixed(4)),
        summary: `${wantsStrongBuy ? 'Cumpără' : 'Buy'} ~$${fmt(px)} · SL $${fmt(sl)} · Țintă $${fmt(tp)}`
      };
    }

    if (volOk && bearPts >= 6 && bullPts <= 1 && !f5m.aboveVwap && chgPct <= -1.8) {
      const sl = Math.max(px + step, (f5m.vwap || px) * 1.012);
      const tp = Math.max(0.01, px - Math.max(step * 2.0, (sl - px) * 2.0));
      return {
        action: 'STRONG SELL',
        shortBadge: 'STRONG SELL',
        tone: 'strong-sell',
        direction: 'SHORT',
        entryPx: Number(px.toFixed(4)),
        slPx: Number(sl.toFixed(4)),
        tpPx: Number(tp.toFixed(4)),
        summary: `Vinde/Short ~$${fmt(px)} · SL $${fmt(sl)} · Țintă $${fmt(tp)}`
      };
    }

    if (volOk && bearPts >= 4 && bearPts - bullPts >= 2 && (!f5m.aboveVwap || (chgPct <= -2.0 && f5m.buyPressurePct <= 45))) {
      const sl = px + step;
      const tp = Math.max(0.01, px - step * 2.0);
      return {
        action: 'SELL',
        shortBadge: 'SELL',
        tone: 'sell',
        direction: 'SHORT',
        entryPx: Number(px.toFixed(4)),
        slPx: Number(sl.toFixed(4)),
        tpPx: Number(tp.toFixed(4)),
        summary: `Sell/Short ~$${fmt(px)} · SL $${fmt(sl)} · Țintă $${fmt(tp)}`
      };
    }

    let reason = `Buy > $${fmt(triggerBuyPx)} · Sell < $${fmt(triggerSellPx)}`;
    if (preBuy && preBuy.hasCriticalFailure) {
      reason = `Blocaj siguranță: ${preBuy.blockers.slice(0, 2).join(' · ')}`;
    } else if (extended) {
      reason = `Extins +${chgPct.toFixed(1)}% · Nu urmări; așteaptă retragere la VWAP ($${fmt(f5m.vwap || px)})`;
    } else if (dataQuality && !dataQuality.rvol5mReliable) {
      reason = 'Anomalie volum 5m detectată · Așteaptă confirmare de lichiditate';
    } else if (!volOk) {
      reason = 'Volum 5m prea slab acum · Așteaptă confirmare';
    } else if (!f5m.aboveVwap) {
      reason = `Sub VWAP ($${fmt(f5m.vwap || px)}) · Buy doar peste VWAP`;
    }

    return {
      action: 'WAIT',
      shortBadge: extended ? 'SUPRA-EXTINS' : (preBuy?.hasCriticalFailure ? 'RISC ACTIV' : 'AȘTEAPTĂ'),
      tone: 'wait',
      direction: bullPts >= bearPts ? 'LONG' : 'SHORT',
      blockedBySafety: !!(preBuy && preBuy.hasCriticalFailure),
      triggerBuyPx: Number(triggerBuyPx.toFixed(4)),
      triggerSellPx: Number(triggerSellPx.toFixed(4)),
      summary: reason
    };
  }

  function evaluateSignalAgainstBars(sig, bars) {
    if (!bars || !bars.length || !sig.entryPrice || sig.entryPrice <= 0) return sig;
    const entrySec = Math.floor(sig.createdAtMs / 1000);
    const postBars = bars.filter(b => b.time > entrySec && b.time <= entrySec + 36 * 3600);
    if (!postBars.length) return sig;

    const dirSign = sig.direction === 'SHORT' ? -1 : 1;
    const calcRet = (px) => Number((((px - sig.entryPrice) / sig.entryPrice) * 100 * dirSign).toFixed(2));

    const horizons = [
      { key: 'm5', offsetSec: 300 },
      { key: 'm15', offsetSec: 900 },
      { key: 'm30', offsetSec: 1800 },
      { key: 'm60', offsetSec: 3600 }
    ];
    const outcomes = { ...(sig.outcomes || { m5: null, m15: null, m30: null, m60: null, eod: null }) };

    for (const h of horizons) {
      const targetBar = postBars.find(b => b.time >= entrySec + h.offsetSec);
      if (targetBar) {
        outcomes[h.key] = calcRet(targetBar.close);
      }
    }

    // EOD evaluation: once same NY session reaches >= 16:00 ET (960m) or next day arrives
    const nowNy = getNyDayAndMinute(Math.floor(Date.now() / 1000));
    const entryDayPassed = nowNy.day > sig.entryNyDay || (nowNy.day === sig.entryNyDay && nowNy.minuteOfDay >= 965);
    let sameDayPost = postBars.filter(b => {
      const ny = getNyDayAndMinute(b.time);
      return ny.day === sig.entryNyDay && ny.minuteOfDay <= 965;
    });
    if (!sameDayPost.length) sameDayPost = postBars.slice(0, 78);

    if (entryDayPassed && sameDayPost.length) {
      const eodBar = sameDayPost[sameDayPost.length - 1];
      outcomes.eod = calcRet(eodBar.close);
    }

    let maxFav = 0, maxAdv = 0;
    for (const b of sameDayPost) {
      if (dirSign > 0) {
        const fav = ((b.high - sig.entryPrice) / sig.entryPrice) * 100;
        const adv = ((b.low - sig.entryPrice) / sig.entryPrice) * 100;
        if (fav > maxFav) maxFav = fav;
        if (adv < maxAdv) maxAdv = adv;
      } else {
        const fav = ((sig.entryPrice - b.low) / sig.entryPrice) * 100;
        const adv = ((sig.entryPrice - b.high) / sig.entryPrice) * 100;
        if (fav > maxFav) maxFav = fav;
        if (adv < maxAdv) maxAdv = adv;
      }
    }
    const mfePct = Number(maxFav.toFixed(2));
    const maePct = Number(maxAdv.toFixed(2));
    const latestClose = sameDayPost[sameDayPost.length - 1]?.close || sig.entryPrice;
    const latestRetPct = calcRet(latestClose);
    const elapsedMin = Math.round((Date.now() - sig.createdAtMs) / 60000);
    const closed = outcomes.eod != null || elapsedMin >= 18 * 60;

    return {
      ...sig,
      outcomes,
      mfePct: Math.max(sig.mfePct || 0, mfePct),
      maePct: Math.min(sig.maePct || 0, maePct),
      latestRetPct,
      status: closed ? 'EVALUATED' : 'TRACKING',
      lastEvalMs: Date.now()
    };
  }

  function summarizeSignalValidation(signals) {
    const list = Array.isArray(signals) ? [...signals] : [];
    list.sort((a, b) => b.createdAtMs - a.createdAtMs);
    const evaluated = list.filter(s =>
      s.outcomes?.m5 != null || s.outcomes?.m15 != null || s.outcomes?.m30 != null || s.outcomes?.m60 != null || s.outcomes?.eod != null
      || (Date.now() - s.createdAtMs >= 10 * 60 * 1000 && s.latestRetPct != null)
    );
    const nEval = evaluated.length;
    const pct = (cnt) => (nEval > 0 ? Math.round((cnt / nEval) * 100) : null);
    const avgOf = (getter) => {
      const vals = evaluated.map(getter).filter(v => v != null && Number.isFinite(v));
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
    };

    const hit3Cnt = evaluated.filter(s => (s.mfePct || 0) >= 3).length;
    const hit5Cnt = evaluated.filter(s => (s.mfePct || 0) >= 5).length;
    const hit10Cnt = evaluated.filter(s => (s.mfePct || 0) >= 10).length;
    const fpCnt = evaluated.filter(s => (s.mfePct || 0) < 1.5 && ((s.outcomes?.m30 ?? s.outcomes?.m60 ?? s.latestRetPct ?? 0) < -1.5)).length;

    // Realized return per signal (best completed horizon: EOD -> 60m -> 30m -> 15m -> 5m -> latest)
    const realizedReturns = evaluated
      .map(s => s.outcomes?.eod ?? s.outcomes?.m60 ?? s.outcomes?.m30 ?? s.outcomes?.m15 ?? s.outcomes?.m5 ?? s.latestRetPct)
      .filter(v => v != null && Number.isFinite(v));

    const wins = realizedReturns.filter(r => r > 0);
    const losses = realizedReturns.filter(r => r < 0);
    const winRatePct = realizedReturns.length ? Math.round((wins.length / realizedReturns.length) * 100) : null;
    const grossWin = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = realizedReturns.length
      ? (grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : (grossWin > 0 ? 9.99 : null))
      : null;
    const expectancyPct = realizedReturns.length
      ? Number((realizedReturns.reduce((a, b) => a + b, 0) / realizedReturns.length).toFixed(2))
      : null;

    return {
      totalSignals: list.length,
      evaluatedCount: nEval,
      highPriorityCount: list.filter(s => s.tier === 'HIGH_PRIORITY').length,
      hit3Pct: pct(hit3Cnt),
      hit5Pct: pct(hit5Cnt),
      hit10Pct: pct(hit10Cnt),
      falsePositivePct: pct(fpCnt),
      winRatePct,
      profitFactor,
      expectancyPct,
      avgRet5m: avgOf(s => s.outcomes?.m5),
      avgRet15m: avgOf(s => s.outcomes?.m15),
      avgRet30m: avgOf(s => s.outcomes?.m30),
      avgRet60m: avgOf(s => s.outcomes?.m60),
      avgRetEod: avgOf(s => s.outcomes?.eod),
      avgMfePct: avgOf(s => s.mfePct),
      avgMaePct: avgOf(s => s.maePct),
      recentSignals: list.slice(0, 30)
    };
  }

  async function recordAndValidateEarlySignals(candidates, barsBySym) {
    const nowMs = Date.now();
    const nyNow = getNyDayAndMinute(Math.floor(nowMs / 1000));
    const log = loadSignalLog();

    // 1. Update open tracking signals using already-fetched bars + bounded fetch for up to 5 stale syms
    const staleOpenSyms = [];
    for (const sig of log) {
      if (sig.status === 'EVALUATED') continue;
      if (!barsBySym.has(sig.sym) && nowMs - sig.createdAtMs >= 5 * 60 * 1000 && !staleOpenSyms.includes(sig.sym)) {
        staleOpenSyms.push(sig.sym);
      }
    }
    if (staleOpenSyms.length) {
      const extraFetch = await Promise.allSettled(staleOpenSyms.slice(0, 5).map(async (sym) => {
        const { bars } = await fetchYahooBars(sym, '5m', '5d', true);
        return { sym, bars };
      }));
      for (const r of extraFetch) {
        if (r.status === 'fulfilled' && r.value?.bars?.length) {
          barsBySym.set(r.value.sym, r.value.bars);
        }
      }
    }

    const updatedLog = log.map(sig => {
      if (sig.status === 'EVALUATED') return sig;
      const b = barsBySym.get(sig.sym);
      return b ? evaluateSignalAgainstBars(sig, b) : sig;
    });

    // 2. Record new signals (score >= 70 Radar, >= 85 High Priority) with 2h per-symbol+category dedup cooldown
    const twoHoursMs = 2 * 3600 * 1000;
    for (const c of candidates) {
      if (c.earlyScore < 70 || c.price <= 0) continue;
      const existing = updatedLog.find(s =>
        s.sym === c.sym && s.setupCategory === c.setupCategory && (nowMs - s.createdAtMs) < twoHoursMs
      );
      if (existing) {
        // Only upgrade tier if score jumped >= 8 pts into HIGH_PRIORITY
        if (c.earlyScore >= 85 && existing.tier !== 'HIGH_PRIORITY' && c.earlyScore - existing.entryScore >= 8) {
          existing.tier = 'HIGH_PRIORITY';
          existing.entryScore = c.earlyScore;
        }
        continue;
      }

      updatedLog.push({
        id: `${c.sym}_${nowMs}`,
        sym: c.sym,
        createdAtMs: nowMs,
        createdIso: new Date(nowMs).toISOString(),
        createdTimeRo: nowTimeRo(),
        createdTimeEt: formatDualTime(Math.floor(nowMs / 1000)).timeEt,
        entryNyDay: nyNow.day,
        direction: (c.verdict?.action === 'SELL' || c.verdict?.action === 'STRONG SELL') ? 'SHORT' : 'LONG',
        tier: c.earlyScore >= 85 ? 'HIGH_PRIORITY' : 'OPPORTUNITY_RADAR',
        setupCategory: c.setupCategory,
        setupTag: c.setupTag,
        entryScore: c.earlyScore,
        entryPrice: Number(c.price.toFixed(4)),
        volAccel5m: c.volAccel5m,
        rvolTod: c.rvolTod,
        rvol10d: c.rvol10d,
        distVwapPct: c.distVwapPct,
        floatShares: c.floatShares,
        chgAtSignal: Number(c.chgPct.toFixed(2)),
        outcomes: { m5: null, m15: null, m30: null, m60: null, eod: null },
        mfePct: 0,
        maePct: 0,
        latestRetPct: 0,
        status: 'TRACKING',
        lastEvalMs: nowMs
      });
    }

    saveSignalLog(updatedLog);
    return summarizeSignalValidation(updatedLog);
  }

  async function getSignalValidationReport(forceRefresh = false) {
    const log = loadSignalLog();
    if (forceRefresh) {
      const openSyms = Array.from(new Set(log.filter(s => s.status !== 'EVALUATED').map(s => s.sym))).slice(0, 10);
      const barsMap = new Map();
      await Promise.allSettled(openSyms.map(async (sym) => {
        const { bars } = await fetchYahooBars(sym, '5m', '5d', true);
        if (bars.length) barsMap.set(sym, bars);
      }));
      const refreshed = log.map(s => (s.status !== 'EVALUATED' && barsMap.has(s.sym)) ? evaluateSignalAgainstBars(s, barsMap.get(s.sym)) : s);
      saveSignalLog(refreshed);
      return { ok: true, updatedTimeRo: nowTimeRo(), ...summarizeSignalValidation(refreshed) };
    }
    return { ok: true, updatedTimeRo: nowTimeRo(), ...summarizeSignalValidation(log) };
  }

  // ─── 3. EARLY SIGNAL ENGINE (WEIGHTED 9-COMPONENT RADAR + 4 SCANNERS) ─────
  async function computeEarlyRadar({ mode = 'all', customSyms = [], forceRefresh = false, filters = {} } = {}) {
    const cleanMode = String(mode || 'all').toLowerCase();
    const wlClean = (Array.isArray(customSyms) && customSyms.length ? customSyms : defaultWatchlist)
      .map(s => String(s || '').trim().toUpperCase())
      .filter(s => isUsEquitySymbol(s));

    const fCfg = {
      chgMin: filters.chgMin != null && filters.chgMin !== '' ? Number(filters.chgMin) : null,
      chgMax: filters.chgMax != null && filters.chgMax !== '' ? Number(filters.chgMax) : null,
      minRvolTod: filters.minRvolTod != null && filters.minRvolTod !== '' ? Number(filters.minRvolTod) : null,
      minVolAccel5m: filters.minVolAccel5m != null && filters.minVolAccel5m !== '' ? Number(filters.minVolAccel5m) : null,
      maxFloatM: filters.maxFloatM != null && filters.maxFloatM !== '' ? Number(filters.maxFloatM) : null,
      maxSpreadPct: filters.maxSpreadPct != null && filters.maxSpreadPct !== '' ? Number(filters.maxSpreadPct) : null,
      nearVwapOrRes: Boolean(filters.nearVwapOrRes),
      requirePosAccel: Boolean(filters.requirePosAccel),
      requireCatalyst: Boolean(filters.requireCatalyst)
    };
    const filterKey = JSON.stringify(fCfg);
    const cacheKey = `intel:early:v3:${cleanMode}:${wlClean.slice(0, 6).join(',')}:${filterKey}`;
    if (!forceRefresh) {
      const hit = getCached(cacheKey, 35000);
      if (hit) return hit;
    }

    const sessionCtx = getMarketSessionContext();
    const cols = [
      'name', 'description', 'close', 'change', 'volume', 'relative_volume_10d_calc',
      'market_cap_basic', 'float_shares_outstanding', 'sector', 'RSI', 'gap',
      'premarket_change', 'premarket_high', 'ATR', 'Perf.W', 'Perf.1M',
      'earnings_release_next_date', 'bid', 'ask', 'relative_volume_intraday|5'
    ];

    const [mktOverview, smallCapRows, earlyMomRows, reversalRows, halts] = await Promise.all([
      fetchMarketOverview(false).catch(() => ({ regime: { score: 50, label: 'Neutru', tone: 'amber' } })),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1.5, 45] },
        { left: 'market_cap_basic', operation: 'in_range', right: [80000000, 8000000000] },
        { left: 'volume', operation: 'greater', right: 350000 },
        { left: 'relative_volume_10d_calc', operation: 'greater', right: 1.25 },
        { left: 'change', operation: 'in_range', right: [-4.5, 11.5] }
      ], 'relative_volume_10d_calc', 'desc', 28),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock', 'dr'] },
        { left: 'close', operation: 'in_range', right: [2, 350] },
        { left: 'Value.Traded', operation: 'greater', right: 12000000 },
        { left: 'relative_volume_10d_calc', operation: 'greater', right: 1.35 },
        { left: 'change', operation: 'in_range', right: [-2.0, 9.5] }
      ], 'relative_volume_10d_calc', 'desc', 24),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [2, 120] },
        { left: 'volume', operation: 'greater', right: 600000 },
        { left: 'RSI', operation: 'in_range', right: [26, 46] },
        { left: 'relative_volume_10d_calc', operation: 'greater', right: 1.15 }
      ], 'relative_volume_10d_calc', 'desc', 18),
      fetchNasdaqHalts().catch(() => [])
    ]);

    const haltMap = new Map((halts || []).map(h => [h.sym, h]));
    const tvMap = new Map();
    for (const r of [...smallCapRows, ...earlyMomRows, ...reversalRows]) {
      if (!tvMap.has(r.sym)) tvMap.set(r.sym, r);
    }

    const prioritizedSyms = [];
    const seen = new Set();
    const pushSym = (s) => {
      if (s && !seen.has(s) && isUsEquitySymbol(s)) {
        seen.add(s);
        prioritizedSyms.push(s);
      }
    };
    ['ONDS', 'APPS', ...wlClean].forEach(pushSym);
    smallCapRows.forEach(r => pushSym(r.sym));
    earlyMomRows.forEach(r => pushSym(r.sym));
    reversalRows.forEach(r => pushSym(r.sym));

    const scanList = prioritizedSyms.slice(0, 28);
    const quoteMap = await fetchYahooQuoteBatch(scanList);

    // Fetch 10 days of 5m bars (700+ bars across ~10 sessions) + cached news in bounded parallel batches
    const barsBySym = new Map();
    const newsBySym = new Map();
    const marketRegimeScore = safeNum(mktOverview?.regime?.score, 50);

    for (let i = 0; i < scanList.length; i += 8) {
      const batch = scanList.slice(i, i + 8);
      await Promise.allSettled(batch.map(async (sym) => {
        const [{ bars }, newsList] = await Promise.all([
          fetchYahooBars(sym, '5m', '10d', true),
          (async () => {
            const cKey = `yf:news_top:${sym}`;
            const cachedN = getCached(cKey, 4 * 60 * 1000);
            if (cachedN) return cachedN;
            const fetchedN = await fetchNewsForSymbol(sym);
            setCached(cKey, fetchedN.slice(0, 3));
            return fetchedN.slice(0, 3);
          })()
        ]);
        if (bars.length) barsBySym.set(sym, bars);
        if (newsList.length) newsBySym.set(sym, newsList[0]);
      }));
    }

    const rawCtxMap = new Map();
    const enriched = [];
    for (const sym of scanList) {
      const q = quoteMap.get(sym) || {};
      const tv = tvMap.get(sym) || {};
      const bars = barsBySym.get(sym) || [];
      const f5m = analyze5mBars(bars, q, tv);
      if (!f5m) continue;

      const mcap = safeNum(q.marketCap, safeNum(tv.market_cap_basic, null));
      const price = f5m.spot || safeNum(q.regularMarketPrice, safeNum(tv.close, 0));
      const chgPct = safeNum(q.regularMarketChangePercent, safeNum(tv.change, 0));
      const preChgPct = safeNum(q.preMarketChangePercent, safeNum(tv.premarket_change, null));
      const rvol10d = safeNum(tv.relative_volume_10d_calc, null)
        ?? (q.averageDailyVolume10Day > 0 ? (q.regularMarketVolume || 0) / q.averageDailyVolume10Day : 1);
      const tvRvol5m = safeNum(tv['relative_volume_intraday|5'], f5m.volAccel5m);
      const volume = safeNum(q.regularMarketVolume, safeNum(tv.volume, 0));
      const tvFloatShares = safeNum(tv.float_shares_outstanding, null);
      const floatShares = tvFloatShares;
      const sector = String(tv.sector || 'N/A');
      const rsiDaily = safeNum(tv.RSI, f5m.rsi5m);
      const gapPct = safeNum(tv.gap, 0);
      const atrDailyPct = safeNum(tv.ATR, null) && price > 0 ? (tv.ATR / price) * 100 : null;
      const inWatch = wlClean.includes(sym);
      const topNews = newsBySym.get(sym) || null;
      const newsMeta = topNews ? {
        title: topNews.title,
        category: topNews.category,
        catalystType: topNews.catalystType,
        bias: topNews.bias,
        impact: topNews.impact,
        isDilutionRisk: topNews.isDilutionRisk,
        ageHours: topNews.ageHours,
        isFresh: topNews.isFresh,
        publishedTimeEt: topNews.publishedTimeEt,
        publishedTimeRo: topNews.publishedTimeRo,
        link: topNews.link
      } : null;

      const scoreRes = computeWeightedEarlyScore({
        f5m,
        rvol10d,
        chgPct,
        volume,
        floatShares,
        mcap,
        newsMeta,
        marketRegimeScore
      });

      const dataQuality = auditDataQuality({
        sym,
        chgPct,
        sessionCtx,
        volume,
        price,
        vol5m: f5m.vol5m,
        avgVol5m20: f5m.avgVol5m20,
        rvolDaily: rvol10d,
        rvol5m: tvRvol5m,
        rvolTod: f5m.rvolTod,
        floatShares,
        tvFloatShares,
        spreadPct: f5m.spreadPct
      });
      const halt = haltMap.get(sym) || null;
      const preBuyCheck = evaluatePreBuySafetyChecks({
        sym,
        price,
        chgPct,
        distVwapPct: f5m.distVwapPct,
        volume,
        rvol5m: tvRvol5m,
        floatShares,
        tvFloatShares,
        spreadPct: f5m.spreadPct,
        newsMeta,
        halt,
        sessionCtx,
        dataQuality
      });
      const fiveScores = compute5InterpretableScores({
        f5m,
        rvol10d,
        chgPct,
        volume,
        floatShares,
        mcap,
        newsMeta,
        marketRegimeScore,
        earlyRes: scoreRes,
        preBuy: preBuyCheck,
        dataQuality
      });
      const verdict = computeDirectionalVerdict({
        price,
        chgPct,
        f5m,
        rvol10d,
        earlyScore: scoreRes.total,
        preBuy: preBuyCheck,
        dataQuality
      });

      const catRes = classifySetupCategory({ f5m, rvol10d, chgPct, rsiDaily, volume });
      const tier = scoreRes.total >= 85 ? 'HIGH_PRIORITY' : (scoreRes.total >= 70 ? 'OPPORTUNITY_RADAR' : 'MONITOR');
      const isExtended = Math.abs(chgPct) >= 14;
      const riskSide = f5m.aboveVwap && f5m.buyPressurePct >= 48 ? 'LONG' : (chgPct < -2 && !f5m.aboveVwap ? 'WATCH / REVERSAL' : 'WATCH');
      const earnEpochSec = toEpochSec(q.earningsTimestampStart) || toEpochSec(tv.earnings_release_next_date);

      rawCtxMap.set(sym, { f5m, rvol10d, chgPct, volume, mcap, newsMeta, scoreRes, halt, tvRvol5m, tvFloatShares });
      enriched.push({
        sym,
        name: String(q.shortName || q.longName || tv.description || sym),
        inWatchlist: inWatch,
        isSmallCap: mcap != null && mcap < 5000000000,
        sector,
        mcap,
        floatShares,
        shortPctFloat: null,
        shortRatio: null,
        price,
        chgPct,
        preChgPct,
        gapPct,
        volume,
        rvol10d: Number((rvol10d || 1).toFixed(2)),
        rvolTod: f5m.rvolTod != null ? Number(f5m.rvolTod.toFixed(2)) : null,
        rvolTodDays: f5m.rvolTodDays,
        rvolTodExact: f5m.rvolTodExact,
        vol5m: f5m.vol5m,
        avgVol5m20: f5m.avgVol5m20,
        volAccel5m: Number(f5m.volAccel5m.toFixed(2)),
        volAccelSlopePct: Math.round(f5m.volAccelSlopePct),
        isVolAccelerating: f5m.isVolAccelerating,
        vwap: f5m.vwap,
        distVwapPct: Number(f5m.distVwapPct.toFixed(2)),
        aboveVwap: f5m.aboveVwap,
        buyPressurePct: Math.round(f5m.buyPressurePct),
        flowProxyLabel: 'OHLCV 5m Proxy (CLV — NU Tick Bid/Ask)',
        cvdToday: f5m.cvdToday,
        cvdLast6: f5m.cvdLast6,
        cvdTrend: f5m.cvdTrend,
        rsi5m: Number(f5m.rsi5m.toFixed(1)),
        rsiDaily: rsiDaily != null ? Number(rsiDaily.toFixed(1)) : null,
        chg5mPct: Number(f5m.chg5mPct.toFixed(2)),
        chg15mPct: Number(f5m.chg15mPct.toFixed(2)),
        chg1hPct: Number(f5m.chg1hPct.toFixed(2)),
        priceAccelPct: Number(f5m.priceAccelPct.toFixed(2)),
        pctFromDayLow: Number(f5m.pctFromDayLow.toFixed(2)),
        pctFromDayHigh: Number(f5m.pctFromDayHigh.toFixed(2)),
        distFromHodPct: Number(f5m.distFromHodPct.toFixed(2)),
        distFromPmHighPct: f5m.distFromPmHighPct != null ? Number(f5m.distFromPmHighPct.toFixed(2)) : null,
        atrPct: atrDailyPct != null ? Number(atrDailyPct.toFixed(2)) : Number((f5m.atr5mPct * 3).toFixed(2)),
        atr5mPct: Number(f5m.atr5mPct.toFixed(2)),
        spreadPct: f5m.spreadPct != null ? Number(f5m.spreadPct.toFixed(2)) : null,
        bid: safeNum(q.bid, null),
        ask: safeNum(q.ask, null),
        bidSize: safeNum(q.bidSize, null),
        askSize: safeNum(q.askSize, null),
        isTightCoil: f5m.isTightCoil,
        breakoutPreMarketHigh: f5m.breakoutPreMarketHigh,
        breakoutDayHigh: f5m.breakoutDayHigh,
        recoveryBounce: f5m.recoveryBounce,
        isExtended,
        earlyScore: scoreRes.total,
        scoreBreakdown: scoreRes.breakdown,
        fiveScores,
        dataQuality,
        preBuyCheck,
        halt,
        tier,
        setupCategory: catRes.primaryCategory,
        setupCategoryLabel: catRes.primaryLabel,
        categoryFlags: catRes.flags,
        setupTag: catRes.setupTag,
        riskSide,
        verdict,
        newsMeta,
        nextEarningsIso: earnEpochSec ? new Date(earnEpochSec * 1000).toISOString().slice(0, 10) : null
      });
    }

    // Sort globally first, then enrich top 10 with Yahoo Short Interest & top 6 with SEC EDGAR dilution verification
    enriched.sort((a, b) => b.earlyScore - a.earlyScore || (b.rvolTod || b.rvol10d) - (a.rvolTod || a.rvol10d));
    await Promise.allSettled(enriched.slice(0, 10).map(async (item, idx) => {
      const [st, secPack] = await Promise.all([
        fetchYahooStructureSummary(item.sym),
        idx < 6 ? fetchSecFilings(item.sym) : Promise.resolve(null)
      ]);
      const ctx = rawCtxMap.get(item.sym);
      const yfFloat = st?.available ? st.floatShares : null;
      if (st?.available) {
        item.shortPctFloat = st.shortPctFloat;
        item.shortRatio = st.shortRatio;
        if (item.floatShares == null && yfFloat != null) item.floatShares = yfFloat;
      }
      if (ctx) {
        item.dataQuality = auditDataQuality({
          sym: item.sym,
          chgPct: ctx.chgPct,
          sessionCtx,
          volume: ctx.volume,
          price: item.price,
          vol5m: ctx.f5m.vol5m,
          avgVol5m20: ctx.f5m.avgVol5m20,
          rvolDaily: ctx.rvol10d,
          rvol5m: ctx.tvRvol5m,
          rvolTod: ctx.f5m.rvolTod,
          floatShares: item.floatShares,
          yfFloatShares: yfFloat,
          tvFloatShares: ctx.tvFloatShares,
          spreadPct: ctx.f5m.spreadPct
        });
        item.preBuyCheck = evaluatePreBuySafetyChecks({
          sym: item.sym,
          price: item.price,
          chgPct: ctx.chgPct,
          distVwapPct: ctx.f5m.distVwapPct,
          volume: ctx.volume,
          rvol5m: ctx.tvRvol5m,
          floatShares: item.floatShares,
          yfFloatShares: yfFloat,
          tvFloatShares: ctx.tvFloatShares,
          spreadPct: ctx.f5m.spreadPct,
          newsMeta: ctx.newsMeta,
          secPack,
          halt: ctx.halt,
          sessionCtx,
          dataQuality: item.dataQuality
        });
        item.fiveScores = compute5InterpretableScores({
          f5m: ctx.f5m,
          rvol10d: ctx.rvol10d,
          chgPct: ctx.chgPct,
          volume: ctx.volume,
          floatShares: item.floatShares,
          mcap: ctx.mcap,
          newsMeta: ctx.newsMeta,
          marketRegimeScore,
          earlyRes: ctx.scoreRes,
          preBuy: item.preBuyCheck,
          dataQuality: item.dataQuality
        });
        item.verdict = computeDirectionalVerdict({
          price: item.price,
          chgPct: ctx.chgPct,
          f5m: ctx.f5m,
          rvol10d: ctx.rvol10d,
          earlyScore: ctx.scoreRes.total,
          preBuy: item.preBuyCheck,
          dataQuality: item.dataQuality
        });
      }
    }));

    // Track & validate signals >= 70 with forward 5m/15m/30m/60m/EOD check
    const validationStats = await recordAndValidateEarlySignals(enriched, barsBySym);

    // Filter strictly according to selected scanner category first
    let filtered = enriched;
    if (cleanMode === 'actionable') {
      filtered = enriched.filter(x => x.verdict?.action && x.verdict.action !== 'WAIT');
    } else if (cleanMode === 'early_momentum') {
      filtered = enriched.filter(x => x.setupCategory === 'early_momentum' || x.categoryFlags?.early_momentum);
    } else if (cleanMode === 'volume_explosion') {
      filtered = enriched.filter(x => x.setupCategory === 'volume_explosion' || x.categoryFlags?.volume_explosion);
    } else if (cleanMode === 'breakout_confirmed') {
      filtered = enriched.filter(x => x.setupCategory === 'breakout_confirmed' || x.categoryFlags?.breakout_confirmed);
    } else if (cleanMode === 'reversal_accum') {
      filtered = enriched.filter(x => x.setupCategory === 'reversal_accum' || x.categoryFlags?.reversal_accum);
    } else if (cleanMode === 'smallcap') {
      // Strict Small Cap enforcement (< $5B only; never leak TSLA/MSFT/LULU)
      filtered = enriched.filter(x => x.isSmallCap);
    } else if (cleanMode === 'watchlist') {
      filtered = enriched.filter(x => x.inWatchlist);
    } else if (cleanMode === 'volexp') {
      filtered = enriched.filter(x => x.volAccel5m >= 2.0 || (x.rvolTod || x.rvol10d) >= 1.8);
    } else if (cleanMode === 'prebreakout') {
      filtered = enriched.filter(x => !x.isExtended && x.chgPct >= -2.5 && x.chgPct <= 9.0);
    } else if (cleanMode === 'recovery') {
      filtered = enriched.filter(x => x.setupCategory === 'reversal_accum' || x.recoveryBounce || (x.rsiDaily != null && x.rsiDaily <= 42));
    }

    const preFilterCount = filtered.length;
    // Apply configurable Early Radar numerical / boolean filters
    filtered = filtered.filter(x => {
      if (fCfg.chgMin != null && Number.isFinite(fCfg.chgMin) && x.chgPct < fCfg.chgMin) return false;
      if (fCfg.chgMax != null && Number.isFinite(fCfg.chgMax) && x.chgPct > fCfg.chgMax) return false;
      if (fCfg.minRvolTod != null && Number.isFinite(fCfg.minRvolTod) && (x.rvolTod ?? 0) < fCfg.minRvolTod) return false;
      if (fCfg.minVolAccel5m != null && Number.isFinite(fCfg.minVolAccel5m) && x.volAccel5m < fCfg.minVolAccel5m) return false;
      if (fCfg.maxFloatM != null && Number.isFinite(fCfg.maxFloatM) && fCfg.maxFloatM > 0) {
        if (x.floatShares == null || (x.floatShares / 1e6) > fCfg.maxFloatM) return false;
      }
      if (fCfg.maxSpreadPct != null && Number.isFinite(fCfg.maxSpreadPct) && fCfg.maxSpreadPct > 0) {
        if (x.spreadPct != null && x.spreadPct > fCfg.maxSpreadPct) return false;
      }
      if (fCfg.nearVwapOrRes) {
        const nearVwap = x.distVwapPct >= -1.5 && x.distVwapPct <= 4.0;
        const nearRes = x.distFromHodPct >= -3.5 || (x.distFromPmHighPct != null && x.distFromPmHighPct >= -3.0);
        if (!nearVwap && !nearRes) return false;
      }
      if (fCfg.requirePosAccel && x.priceAccelPct <= 0) return false;
      if (fCfg.requireCatalyst && !x.newsMeta) return false;
      return true;
    });

    const buySignalsCount = enriched.filter(x => x.verdict?.action === 'BUY' || x.verdict?.action === 'STRONG BUY').length;
    const sellSignalsCount = enriched.filter(x => x.verdict?.action === 'SELL' || x.verdict?.action === 'STRONG SELL').length;

    const categoryCounts = {
      all: enriched.length,
      actionable: buySignalsCount + sellSignalsCount,
      early_momentum: enriched.filter(x => x.setupCategory === 'early_momentum' || x.categoryFlags?.early_momentum).length,
      volume_explosion: enriched.filter(x => x.setupCategory === 'volume_explosion' || x.categoryFlags?.volume_explosion).length,
      breakout_confirmed: enriched.filter(x => x.setupCategory === 'breakout_confirmed' || x.categoryFlags?.breakout_confirmed).length,
      reversal_accum: enriched.filter(x => x.setupCategory === 'reversal_accum' || x.categoryFlags?.reversal_accum).length,
      smallcap: enriched.filter(x => x.isSmallCap).length,
      watchlist: enriched.filter(x => x.inWatchlist).length
    };

    const out = {
      ok: true,
      mode: cleanMode,
      sessionCtx,
      appliedFilters: fCfg,
      preFilterCount,
      postFilterCount: filtered.length,
      updatedAt: new Date().toISOString(),
      updatedTimeRo: nowTimeRo(),
      updatedTimeEt: sessionCtx.timeEt,
      source: 'OHLCV 5m/10D (Yahoo) + Screener (TradingView) + Quote L1 (Bid/Ask) + SEC EDGAR + NASDAQ Halts + Știri',
      marketRegime: mktOverview.regime || { score: 50, label: 'Neutru', tone: 'amber' },
      totalScanned: enriched.length,
      buySignalsCount,
      sellSignalsCount,
      highPriorityCount: enriched.filter(x => x.earlyScore >= 85).length,
      radarReadyCount: enriched.filter(x => x.earlyScore >= 70).length,
      volumeSpikesCount: enriched.filter(x => x.volAccel5m >= 2.5).length,
      smallCapsCount: enriched.filter(x => x.isSmallCap).length,
      categoryCounts,
      validationStats,
      candidates: filtered
    };

    setCached(cacheKey, out);
    return out;
  }

  // ─── 4. SEC EDGAR LIVE FILINGS + DILUTION RISK DETECTOR ──────────────────
  async function getSecTickerMap() {
    const cacheKey = 'sec:tickers_map:v1';
    const cached = getCached(cacheKey, 12 * 3600 * 1000);
    if (cached) return cached;

    try {
      const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
        headers: { 'User-Agent': UA_SEC, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      for (const k of Object.keys(data || {})) {
        const row = data[k];
        if (!row?.ticker || row.cik_str == null) continue;
        const sym = String(row.ticker).toUpperCase().replace(/\./g, '-');
        map[sym] = {
          cik: String(row.cik_str).padStart(10, '0'),
          cikNum: Number(row.cik_str),
          title: String(row.title || sym)
        };
      }
      setCached(cacheKey, map);
      return map;
    } catch (_) {
      return {};
    }
  }

  async function fetchSecFilings(rawSym) {
    const sym = String(rawSym || '').toUpperCase().trim();
    if (!isUsEquitySymbol(sym)) {
      return { available: false, reason: 'Activ non-US sau non-equity (fără raportare SEC EDGAR).' };
    }

    const cacheKey = `sec:sub:${sym}`;
    const cached = getCached(cacheKey, 5 * 60 * 1000);
    if (cached) return cached;

    const tickerMap = await getSecTickerMap();
    const entry = tickerMap[sym] || tickerMap[sym.replace('-', '.')];
    if (!entry) {
      return { available: false, reason: `Nu am găsit CIK SEC EDGAR pentru ${sym} (posibil ADR fără 10-Q/K direct sau ETF).` };
    }

    try {
      const res = await fetch(`https://data.sec.gov/submissions/CIK${entry.cik}.json`, {
        headers: { 'User-Agent': UA_SEC, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return { available: false, reason: `SEC EDGAR HTTP ${res.status}` };
      const sub = await res.json();
      const rec = sub?.filings?.recent || {};
      const forms = rec.form || [];
      const dates = rec.filingDate || [];
      const docs = rec.primaryDocument || [];
      const accs = rec.accessionNumber || [];
      const items = rec.items || [];
      const descs = rec.primaryDocDescription || [];

      const filings = [];
      const cutoff180 = Date.now() - 180 * 86400 * 1000;
      let dilutionHits180 = [];
      let form4Count90 = 0;
      let latest8K = null;
      let latest10QOrK = null;

      for (let i = 0; i < Math.min(forms.length, 65); i++) {
        const form = String(forms[i] || '');
        const fDate = String(dates[i] || '');
        const acc = String(accs[i] || '');
        const doc = String(docs[i] || '');
        const itemArr = Array.isArray(items[i]) ? items[i] : String(items[i] || '').split(/[,\s]+/).filter(Boolean);
        const itemLabels = itemArr.map(code => SEC_ITEM_DESC[code] ? `${code}: ${SEC_ITEM_DESC[code]}` : code);
        const url = acc && doc
          ? `https://www.sec.gov/Archives/edgar/data/${entry.cikNum}/${acc.replace(/-/g, '')}/${doc}`
          : `https://www.sec.gov/edgar/browse/?CIK=${entry.cik}`;

        const ts = Date.parse(fDate) || 0;
        const isDilution = DILUTION_FORMS.has(form) || (form.startsWith('8-K') && itemArr.includes('3.02'));
        if (isDilution && ts >= cutoff180) {
          dilutionHits180.push({ form, date: fDate, items: itemLabels, url });
        }
        if (form === '4' && ts >= Date.now() - 90 * 86400 * 1000) form4Count90++;

        const row = {
          form,
          date: fDate,
          description: String(descs[i] || ''),
          items: itemLabels,
          isDilution,
          url
        };
        if (form.startsWith('8-K') && !latest8K) latest8K = row;
        if ((form === '10-Q' || form === '10-K') && !latest10QOrK) latest10QOrK = row;
        filings.push(row);
      }

      const dilutionRisk = dilutionHits180.length >= 2
        ? 'RIDICAT'
        : (dilutionHits180.length === 1 ? 'MODERAT' : 'SCĂZUT');

      const out = {
        available: true,
        cik: entry.cik,
        entityName: String(sub.name || entry.title),
        sicDescription: String(sub.sicDescription || ''),
        stateOfIncorp: String(sub.stateOfIncorporation || ''),
        edgarUrl: `https://www.sec.gov/edgar/browse/?CIK=${entry.cik}`,
        dilutionRisk,
        dilutionHits180,
        form4Count90,
        latest8K,
        latest10QOrK,
        filings: filings.slice(0, 24)
      };

      setCached(cacheKey, out);
      return out;
    } catch (e) {
      return { available: false, reason: `Eroare SEC EDGAR: ${e.message}` };
    }
  }

  // ─── 5. REAL OPTIONS CHAIN (CBOE DELAYED QUOTES: IV30, MAX PAIN, GEX) ────
  function parseCboeOptionSymbol(raw) {
    const m = /^([A-Z.\-]+)(\d{6})([CP])(\d{8})$/.exec(String(raw || '').trim());
    if (!m) return null;
    const yy = '20' + m[2].slice(0, 2);
    const mm = m[2].slice(2, 4);
    const dd = m[2].slice(4, 6);
    return {
      expiry: `${yy}-${mm}-${dd}`,
      type: m[3], // C or P
      strike: Number(m[4]) / 1000
    };
  }

  async function fetchCboeOptionsIntel(rawSym, spotHint = null) {
    const sym = String(rawSym || '').toUpperCase().trim();
    if (!isUsEquitySymbol(sym)) {
      return { available: false, reason: 'Acest simbol nu are lanț de opțiuni US pe CBOE.' };
    }

    const cacheKey = `cboe:opt:${sym}`;
    const cached = getCached(cacheKey, 60000);
    if (cached) return cached;

    try {
      const cboeSym = sym.replace(/-/g, '.');
      const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(cboeSym)}.json`, {
        headers: { 'User-Agent': UA_BROWSER, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(7000)
      });
      if (!res.ok) {
        return { available: false, reason: `Fără contracte opțiuni CBOE disponibile pentru ${sym} (HTTP ${res.status}).` };
      }
      const json = await res.json();
      const d = json?.data || {};
      const optsRaw = Array.isArray(d.options) ? d.options : [];
      if (!optsRaw.length) {
        return { available: false, reason: `Lanț de opțiuni gol pe CBOE pentru ${sym}.` };
      }

      const spot = safeNum(d.current_price, safeNum(d.close, spotHint || 0)) || 0;
      const iv30 = safeNum(d.iv30, null);

      let totalCallVol = 0, totalPutVol = 0, totalCallOI = 0, totalPutOI = 0;
      const expiriesSet = new Set();
      const parsed = [];

      for (const o of optsRaw) {
        const meta = parseCboeOptionSymbol(o.option);
        if (!meta || meta.strike <= 0) continue;
        const vol = safeNum(o.volume, 0);
        const oi = safeNum(o.open_interest, 0);
        const iv = safeNum(o.iv, 0);
        const gamma = safeNum(o.gamma, 0);
        const delta = safeNum(o.delta, 0);
        const bid = safeNum(o.bid, 0);
        const ask = safeNum(o.ask, 0);
        const lastPx = safeNum(o.last_trade_price, 0);

        expiriesSet.add(meta.expiry);
        if (meta.type === 'C') {
          totalCallVol += vol;
          totalCallOI += oi;
        } else {
          totalPutVol += vol;
          totalPutOI += oi;
        }

        // Standard GEX estimate per strike per 1% spot move: gamma * OI * 100 * spot^2 * 0.01
        const sign = meta.type === 'C' ? 1 : -1;
        const gex = spot > 0 ? sign * gamma * oi * 100 * spot * spot * 0.01 : 0;

        parsed.push({
          contract: o.option,
          expiry: meta.expiry,
          type: meta.type,
          strike: meta.strike,
          vol,
          oi,
          iv: iv > 0 ? Number((iv * 100).toFixed(1)) : null,
          delta: Number(delta.toFixed(3)),
          gamma: Number(gamma.toFixed(4)),
          bid,
          ask,
          lastPx,
          gex,
          volOiRatio: oi > 0 ? Number((vol / oi).toFixed(2)) : (vol > 0 ? vol : 0)
        });
      }

      const expiries = Array.from(expiriesSet).sort();
      const frontExpiry = expiries[0] || '';

      // Aggregate by strike near spot (+/- 40% or nearest expiries)
      const byStrike = new Map();
      const nearOpts = spot > 0
        ? parsed.filter(p => p.strike >= spot * 0.55 && p.strike <= spot * 1.65)
        : parsed;

      for (const p of (nearOpts.length ? nearOpts : parsed)) {
        const cur = byStrike.get(p.strike) || {
          strike: p.strike, callOI: 0, putOI: 0, callVol: 0, putVol: 0, netGex: 0
        };
        if (p.type === 'C') {
          cur.callOI += p.oi;
          cur.callVol += p.vol;
        } else {
          cur.putOI += p.oi;
          cur.putVol += p.vol;
        }
        cur.netGex += p.gex;
        byStrike.set(p.strike, cur);
      }

      const strikeList = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);

      // Call Wall = max Call OI strike >= spot * 0.9; Put Wall = max Put OI strike <= spot * 1.1
      let callWall = null, putWall = null;
      const upStrikes = strikeList.filter(s => spot <= 0 || s.strike >= spot * 0.92);
      const dnStrikes = strikeList.filter(s => spot <= 0 || s.strike <= spot * 1.08);
      if (upStrikes.length) {
        callWall = upStrikes.reduce((best, s) => s.callOI > best.callOI ? s : best, upStrikes[0]);
      }
      if (dnStrikes.length) {
        putWall = dnStrikes.reduce((best, s) => s.putOI > best.putOI ? s : best, dnStrikes[0]);
      }

      // Max Pain on nearest front expiry (with meaningful OI, else next expiry)
      let maxPainExpiry = frontExpiry;
      let frontContracts = parsed.filter(p => p.expiry === frontExpiry);
      if (frontContracts.reduce((a, b) => a + b.oi, 0) < 50 && expiries.length > 1) {
        maxPainExpiry = expiries[1];
        frontContracts = parsed.filter(p => p.expiry === maxPainExpiry);
      }
      const mpStrikes = Array.from(new Set(frontContracts.map(p => p.strike))).sort((a, b) => a - b);
      let maxPain = null;
      if (mpStrikes.length) {
        let minPainDollar = Infinity;
        for (const testStrike of mpStrikes) {
          let pain = 0;
          for (const c of frontContracts) {
            if (c.oi <= 0) continue;
            if (c.type === 'C' && testStrike > c.strike) pain += (testStrike - c.strike) * c.oi * 100;
            if (c.type === 'P' && testStrike < c.strike) pain += (c.strike - testStrike) * c.oi * 100;
          }
          if (pain < minPainDollar) {
            minPainDollar = pain;
            maxPain = testStrike;
          }
        }
      }

      const totalNetGex = strikeList.reduce((acc, s) => acc + s.netGex, 0);
      const gexRegime = totalNetGex >= 0 ? 'GEX Pozitiv (Mean-Reverting / Pinning)' : 'GEX Negativ (Volatil / Trending)';

      const pcVolRatio = totalCallVol > 0 ? Number((totalPutVol / totalCallVol).toFixed(2)) : null;
      const pcOiRatio = totalCallOI > 0 ? Number((totalPutOI / totalCallOI).toFixed(2)) : null;

      // Top 10 active/unusual contracts
      const unusualContracts = parsed
        .filter(p => p.vol >= 25)
        .sort((a, b) => b.vol - a.vol)
        .slice(0, 12);

      // Top 14 strikes around spot sorted by total OI
      const keyStrikes = strikeList
        .map(s => ({ ...s, totalOI: s.callOI + s.putOI }))
        .sort((a, b) => b.totalOI - a.totalOI)
        .slice(0, 14)
        .sort((a, b) => a.strike - b.strike);

      const out = {
        available: true,
        timestamp: json.timestamp || new Date().toISOString(),
        spot,
        iv30: iv30 != null ? Number(iv30.toFixed(1)) : null,
        totalContracts: parsed.length,
        expiriesCount: expiries.length,
        frontExpiry: maxPainExpiry || frontExpiry,
        totalCallVol,
        totalPutVol,
        totalCallOI,
        totalPutOI,
        pcVolRatio,
        pcOiRatio,
        maxPain,
        callWall: callWall ? { strike: callWall.strike, oi: callWall.callOI } : null,
        putWall: putWall ? { strike: putWall.strike, oi: putWall.putOI } : null,
        totalNetGex: Math.round(totalNetGex),
        gexRegime,
        keyStrikes,
        unusualContracts
      };

      setCached(cacheKey, out);
      return out;
    } catch (e) {
      return { available: false, reason: `Eroare CBOE Options: ${e.message}` };
    }
  }

  // ─── 6. NEWS CATALYST SCORER & SHORT / INSIDERS / OWNERSHIP ──────────────
  function scoreNewsCatalyst(title, pubTimeSec = 0) {
    const t = String(title || '').toLowerCase();
    let category = 'General';
    let catalystType = 'GENERAL';
    let bias = 'NEUTRU';
    let impact = 45;
    let isDilutionRisk = false;

    if (/reverse\s+split|reverse\s+stock\s+split/.test(t)) {
      category = 'Reverse Split';
      catalystType = 'REVERSE_SPLIT';
      bias = 'BEARISH';
      impact = 90;
      isDilutionRisk = true;
    } else if (/shelf\s+registration|form\s+s-3|\bs-3\b|universal\s+shelf|resale\s+registration/.test(t)) {
      category = 'Shelf Registration (S-3)';
      catalystType = 'SHELF_REG';
      bias = 'BEARISH';
      impact = 88;
      isDilutionRisk = true;
    } else if (/public\s+offering|underwritten\s+offering|pricing\s+of.*offering|proposed\s+public|\b424b|follow-on\s+offering|share\s+offering/.test(t) && !/\batm\b|at-the-market/.test(t)) {
      category = 'Public Offering (424B)';
      catalystType = 'PUBLIC_OFFERING';
      bias = 'BEARISH';
      impact = 88;
      isDilutionRisk = true;
    } else if (/\batm\b|at-the-market|equity\s+line|eloc|warrant\s+exercise|inducement|private\s+placement|registered\s+direct|dilut/.test(t)) {
      category = 'Dilution / ATM Offering';
      catalystType = 'DILUTION_ATM';
      bias = 'BEARISH';
      impact = 90;
      isDilutionRisk = true;
    } else if (/pentagon|department\s+of\s+defense|\bdod\b|u\.s\.\s+(army|navy|air\s+force|gov)|federal\s+contract|government\s+contract|defense\s+contract|nasa|municipality/.test(t)) {
      category = 'Contract Guvernamental';
      catalystType = 'GOV_CONTRACT';
      bias = 'BULLISH';
      impact = 86;
    } else if (/\bfda\b.*(approv|clear|grant|orphan|fast\s+track|breakthrough)|nda\s+approv|510\(k\)|\beua\b/.test(t)) {
      category = 'FDA Approval';
      catalystType = 'FDA_APPROVAL';
      bias = 'BULLISH';
      impact = 88;
    } else if (/contract\s+award|new\s+contract|awarded\s+a|multi-year\s+contract|supply\s+contract|commercial\s+contract|purchase\s+order|supply\s+agreement|\border\s+worth|backlog/.test(t)) {
      category = 'Contract Nou';
      catalystType = 'NEW_CONTRACT';
      bias = 'BULLISH';
      impact = 84;
    } else if (/partnership|strategic\s+alliance|collaboration|joint\s+venture|teamed\s+up|distribution\s+agreement|licensing\s+deal/.test(t)) {
      category = 'Parteneriat';
      catalystType = 'PARTNERSHIP';
      bias = 'BULLISH';
      impact = 80;
    } else if (/insider\s+buy|ceo\s+buys|director\s+buys|form\s+4|purchases\s+[\d,]+\s+shares|insider\s+purchas/.test(t)) {
      category = 'Insider Buying';
      catalystType = 'INSIDER_BUYING';
      bias = 'BULLISH';
      impact = 78;
    } else if (/earnings|q[1-4]\s+20\d\d|quarter\s+results|financial\s+results|10-q|10-k|revenue|eps\s+(beat|miss)|guidance/.test(t)) {
      category = 'Rezultate Financiare';
      catalystType = 'EARNINGS';
      impact = 74;
      if (/surge|jump|beat|growth|profit|raises\s+guidance|record\s+revenue/.test(t)) bias = 'BULLISH';
      else if (/drop|fall|loss|plunge|slide|decline|miss|guidance\s+cut/.test(t)) bias = 'BEARISH';
    } else if (/sec\s+investigation|lawsuit|downgrade/.test(t)) {
      category = 'Risc / Legal';
      catalystType = 'RISK_LEGAL';
      bias = 'BEARISH';
      impact = 80;
    } else if (/price\s+target|maintains\s+buy|maintains\s+sell|outperform|underperform|overweight|underweight|initiates|reiterates|analyst|upgrade/.test(t)) {
      category = 'Analiști / Rating';
      catalystType = 'ANALYST';
      impact = 66;
      if (/raises|buy|outperform|overweight|upgrade/.test(t) && !/cut|lowers|downgrade/.test(t)) bias = 'BULLISH';
      else if (/cut|lowers|sell|underperform|downgrade/.test(t) && !/maintains\s+buy/.test(t)) bias = 'BEARISH';
    } else if (/short\s+squeeze|short\s+interest|13g|blackrock|vanguard|institution/.test(t)) {
      category = 'Short / Instituționali';
      catalystType = 'INSTITUTIONAL';
      impact = 64;
    }

    const ageHours = pubTimeSec > 0 ? Math.max(0.1, (Date.now() / 1000 - pubTimeSec) / 3600) : 48;
    const isFresh = ageHours <= 24;
    if (isFresh) impact = Math.min(96, impact + 10);

    return { category, catalystType, bias, impact, isDilutionRisk, ageHours: Number(ageHours.toFixed(1)), isFresh };
  }

  async function fetchNewsForSymbol(sym) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=0&newsCount=12`;
      const data = await handleYahooProxyTarget(url);
      const rawNews = Array.isArray(data?.news) ? data.news : [];
      return rawNews.map(n => {
        const pubSec = toEpochSec(n.providerPublishTime);
        const scored = scoreNewsCatalyst(n.title, pubSec);
        const dt = formatDualTime(pubSec);
        return {
          title: String(n.title || ''),
          publisher: String(n.publisher || 'News'),
          link: String(n.link || ''),
          publishedTs: pubSec,
          publishedDate: dt.dateRo,
          publishedTimeEt: dt.timeEt,
          publishedTimeRo: dt.timeRo,
          publishedDateEt: dt.dateEt,
          ...scored
        };
      });
    } catch (_) {
      return [];
    }
  }

  async function fetchYahooStructureSummary(sym) {
    if (!isUsEquitySymbol(sym)) {
      return { available: false };
    }
    const cacheKey = `yf:struct:${sym}`;
    const cached = getCached(cacheKey, 5 * 60 * 1000);
    if (cached) return cached;

    try {
      const qs = await yf.quoteSummary(sym, {
        modules: ['defaultKeyStatistics', 'majorHoldersBreakdown', 'insiderTransactions', 'calendarEvents', 'summaryProfile']
      }, { validateResult: false });

      const ks = qs?.defaultKeyStatistics || {};
      const mh = qs?.majorHoldersBreakdown || {};
      const ins = Array.isArray(qs?.insiderTransactions?.transactions) ? qs.insiderTransactions.transactions : [];
      const cal = qs?.calendarEvents || {};
      const prof = qs?.summaryProfile || {};

      const shortPctFloat = ks.shortPercentOfFloat != null ? Number((ks.shortPercentOfFloat * 100).toFixed(2)) : null;
      const shortRatio = safeNum(ks.shortRatio, null);
      const sharesShort = safeNum(ks.sharesShort, null);
      const floatShares = safeNum(ks.floatShares, null);
      const sharesOut = safeNum(ks.sharesOutstanding, null);
      const heldInsiders = mh.insidersPercentHeld != null ? Number((mh.insidersPercentHeld * 100).toFixed(2)) : null;
      const heldInstitutions = mh.institutionsPercentHeld != null ? Number((mh.institutionsPercentHeld * 100).toFixed(2)) : null;

      let squeezeRisk = 'SCĂZUT';
      if (shortPctFloat != null) {
        if (shortPctFloat >= 18 || (shortPctFloat >= 12 && (shortRatio || 0) >= 3.5)) squeezeRisk = 'RIDICAT';
        else if (shortPctFloat >= 8) squeezeRisk = 'MODERAT';
      }

      const earnArr = cal?.earnings?.earningsDate || [];
      const nextEarnings = earnArr.length ? String(earnArr[0]).slice(0, 10) : null;

      const insiderTxns = ins.slice(0, 10).map(tx => ({
        name: String(tx.filerName || ''),
        relation: String(tx.filerRelation || ''),
        text: String(tx.transactionText || ''),
        shares: safeNum(tx.shares, 0),
        date: tx.startDate ? String(tx.startDate).slice(0, 10) : ''
      }));

      const out = {
        available: true,
        sector: String(prof.sector || ''),
        industry: String(prof.industry || ''),
        country: String(prof.country || ''),
        employees: safeNum(prof.fullTimeEmployees, null),
        shortPctFloat,
        shortRatio: shortRatio != null ? Number(shortRatio.toFixed(2)) : null,
        sharesShort,
        floatShares,
        sharesOut,
        heldInsiders,
        heldInstitutions,
        squeezeRisk,
        nextEarnings,
        insiderTxns
      };

      setCached(cacheKey, out);
      return out;
    } catch (_) {
      return { available: false };
    }
  }

  // ─── 7. SYMBOL DEEP INTEL + PDF PAGE 6 AI MARKET ANALYSIS ────────────────
  async function fetchSymbolDeepIntel(rawSym, rawTf = '30m') {
    const sym = String(rawSym || 'ONDS').toUpperCase().trim();
    const tf = String(rawTf || '30m').toLowerCase();
    const cacheKey = `intel:deep:${sym}:${tf}`;
    const cached = getCached(cacheKey, 45000);
    if (cached) return cached;

    const [quoteMap, bars5mPack, secPack, optPack, newsList, structPack, mktOverview] = await Promise.all([
      fetchYahooQuoteBatch([sym]),
      fetchYahooBars(sym, '5m', '5d', true),
      fetchSecFilings(sym),
      fetchCboeOptionsIntel(sym),
      fetchNewsForSymbol(sym),
      fetchYahooStructureSummary(sym),
      fetchMarketOverview(false)
    ]);

    const quote = quoteMap.get(sym) || {};
    const f5m = analyze5mBars(bars5mPack.bars, quote);
    const spot = safeNum(quote.regularMarketPrice, f5m?.spot || 0) || 0;
    const chgPct = safeNum(quote.regularMarketChangePercent, 0);
    const prePrice = quote.marketState && quote.marketState !== 'REGULAR'
      ? safeNum(quote.preMarketPrice, safeNum(quote.postMarketPrice, null))
      : null;
    const preChgPct = quote.marketState && quote.marketState !== 'REGULAR'
      ? safeNum(quote.preMarketChangePercent, safeNum(quote.postMarketChangePercent, null))
      : null;

    // Priced-in evaluation from real % move + 5m vol behavior + news timing
    let pricedInVerdict = 'Neutru / Fără mișcare extremă azi';
    const freshNews = newsList.filter(n => n.isFresh);
    if (Math.abs(chgPct) >= 14) {
      pricedInVerdict = `Extindere mare (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%): risc ca știrea să fie parțial/total priced-in; evită FOMO pe maxim.`;
    } else if (f5m && f5m.volAccel5m >= 2.2 && Math.abs(chgPct) < 8) {
      pricedInVerdict = `Acumulare / Volum activ 5m (${f5m.volAccel5m.toFixed(1)}x) cu mișcare încă sub ±8% — setup timpurie neepuizată.`;
    } else if (freshNews.length) {
      pricedInVerdict = `${freshNews.length} știri noi (<24h); prețul (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%) reacționează moderat.`;
    }

    // Match Symbol's Sector ETF inside Market Overview
    const sectorEtfSym = TV_SECTOR_TO_ETF[structPack.sector] || 'XLK';
    const sectorEtf = mktOverview.sectors.find(s => s.sym === sectorEtfSym) || mktOverview.sectors[0];

    // Build honest, 100%-data-grounded AI Market Analysis (PDF Page 6 style)
    const observations = [];
    const watchItems = [];

    if (f5m) {
      const volDirTxt = f5m.aboveVwap ? 'peste VWAP' : 'sub VWAP';
      observations.push(
        `Preț sesiune ${spot.toFixed(spot < 10 ? 2 : 2)} USD (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%${prePrice != null ? `, Ext ${prePrice.toFixed(2)} / ${preChgPct >= 0 ? '+' : ''}${(preChgPct || 0).toFixed(2)}%` : ''}). Pe bare 5m: volum ${f5m.volAccel5m.toFixed(2)}x media 20 bare și presiune cumpărare ${Math.round(f5m.buyPressurePct)}%, preț ${volDirTxt} (${f5m.vwap.toFixed(2)}).`
      );
      if (f5m.aboveVwap) {
        watchItems.push(`Menținerea peste VWAP (${f5m.vwap.toFixed(2)}) și depășirea cu volum a maximului zilei ${f5m.dayHigh.toFixed(2)} pentru continuare Long.`);
      } else {
        watchItems.push(`Recâștigarea VWAP (${f5m.vwap.toFixed(2)}) pe volum 5m > 2x pentru reversal, altfel suportul intraday rămâne ${f5m.dayLow.toFixed(2)}.`);
      }
    }

    if (structPack.available && structPack.shortPctFloat != null) {
      observations.push(
        `Structură Short & Dețineri: ${structPack.shortPctFloat}% din Float este Short (${structPack.shortRatio ?? '—'} zile acoperire, risc squeeze: ${structPack.squeezeRisk}), Instituționali ${structPack.heldInstitutions ?? '—'}%, Insideri ${structPack.heldInsiders ?? '—'}%.`
      );
      if (structPack.shortPctFloat >= 18) {
        watchItems.push(`Short Float ridicat (${structPack.shortPctFloat}%): orice breakout peste rezistențe sau Call Wall poate amplifica acoperiri rapide (short covering).`);
      }
    }

    if (secPack.available) {
      const dilTxt = secPack.dilutionHits180.length
        ? `${secPack.dilutionHits180.length} raportări cu potențial de diluție în ultimele 180 zile (${secPack.dilutionHits180.map(h => `${h.form} ${h.date}`).slice(0, 2).join(', ')})`
        : 'fără S-3 / 424B / Item 3.02 în ultimele 180 zile';
      const latTxt = secPack.latest8K ? `Ultim 8-K: ${secPack.latest8K.date} (${secPack.latest8K.items.slice(0, 2).join(', ') || 'General'}).` : '';
      observations.push(`SEC EDGAR: Risc diluție ${secPack.dilutionRisk} (${dilTxt}). ${latTxt}`);
      if (secPack.dilutionRisk === 'RIDICAT') {
        watchItems.push('Atenție la ofertele active / shelf (S-3/424B): spike-urile fără susținere VWAP pot fi vândute rapid în ofertă.');
      }
    }

    if (optPack.available) {
      observations.push(
        `Opțiuni CBOE (${optPack.totalContracts} contracte): IV30 ${optPack.iv30 ?? '—'}%, Put/Call Vol ${optPack.pcVolRatio ?? '—'}, Max Pain ${optPack.maxPain != null ? optPack.maxPain.toFixed(2) : '—'} (exp ${optPack.frontExpiry}), Call Wall ${optPack.callWall?.strike ?? '—'}, Put Wall ${optPack.putWall?.strike ?? '—'}, ${optPack.gexRegime}.`
      );
      if (optPack.callWall || optPack.putWall) {
        watchItems.push(`Zone cheie opțiuni: Put Wall la ${optPack.putWall?.strike ?? '—'} (suport dealer) și Call Wall la ${optPack.callWall?.strike ?? '—'} (magnet/rezistență).`);
      }
    }

    if (mktOverview?.regime) {
      observations.push(
        `Tailwind Macro & Sector: Piața SUA este ${mktOverview.regime.label} (Scor ${mktOverview.regime.score}/100, VIX ${mktOverview.macro.find(m => m.sym === '^VIX')?.price?.toFixed(2) ?? '—'}), iar sectorul asociat (${sectorEtf?.sym || '—'}) are ${sectorEtf?.chgPct >= 0 ? '+' : ''}${(sectorEtf?.chgPct || 0).toFixed(2)}% azi.`
      );
    }

    if (structPack.nextEarnings) {
      watchItems.push(`Următorul raport Earnings estimat: ${structPack.nextEarnings} (risc ridicat de gap / IV crush în jurul datei).`);
    }

    const sessionCtx = getMarketSessionContext();
    const bidPx = safeNum(quote.bid, null);
    const askPx = safeNum(quote.ask, null);
    const bidSz = safeNum(quote.bidSize, null);
    const askSz = safeNum(quote.askSize, null);
    const l1TotSz = (bidSz || 0) + (askSz || 0);
    const l1ImbalancePct = l1TotSz > 0 ? Number((((bidSz || 0) / l1TotSz) * 100).toFixed(1)) : null;

    const dqDeep = auditDataQuality({
      sym,
      chgPct,
      sessionCtx,
      volume: safeNum(quote.regularMarketVolume, 0),
      price: spot,
      vol5m: f5m?.vol5m || 0,
      avgVol5m20: f5m?.avgVol5m20 || 0,
      rvolDaily: quote.averageDailyVolume10Day > 0 ? (quote.regularMarketVolume || 0) / quote.averageDailyVolume10Day : 1,
      rvol5m: f5m?.volAccel5m || 0,
      rvolTod: f5m?.rvolTod ?? null,
      floatShares: structPack.floatShares ?? null,
      yfFloatShares: structPack.floatShares ?? null,
      spreadPct: f5m?.spreadPct ?? null
    });

    const out = {
      ok: true,
      sym,
      tf,
      sessionCtx,
      updatedAt: new Date().toISOString(),
      updatedTimeRo: nowTimeRo(),
      updatedTimeEt: sessionCtx.timeEt,
      quote: {
        name: String(quote.shortName || quote.longName || secPack.entityName || sym),
        exchange: String(quote.fullExchangeName || quote.exchange || 'US'),
        price: spot,
        chgPct,
        extPrice: prePrice,
        extChgPct: preChgPct,
        marketState: quote.marketState || '',
        dayLow: safeNum(quote.regularMarketDayLow, f5m?.dayLow || null),
        dayHigh: safeNum(quote.regularMarketDayHigh, f5m?.dayHigh || null),
        volume: safeNum(quote.regularMarketVolume, 0),
        avgVol10d: safeNum(quote.averageDailyVolume10Day, 0),
        marketCap: safeNum(quote.marketCap, null),
        bid: bidPx,
        ask: askPx,
        bidSize: bidSz,
        askSize: askSz,
        spreadPct: f5m?.spreadPct ?? null,
        l1ImbalancePct
      },
      flow5m: f5m,
      dataQuality: dqDeep,
      pricedInVerdict,
      sec: secPack,
      options: optPack,
      structure: structPack,
      news: newsList,
      sectorTailwind: sectorEtf || null,
      marketRegime: mktOverview.regime,
      aiMarketAnalysis: {
        title: `AI Market Analysis · ${sym}`,
        subtitle: `Verificat pe date live ${nowTimeRo()} (${sessionCtx.timeEt}) · Interval 5m + Zilnic + SEC EDGAR + CBOE`,
        observations,
        watchItems,
        disclaimer: 'Observații generate exclusiv din fluxul live Yahoo 5m/Quote, SEC EDGAR, CBOE Options și TradingView Scanner.'
      }
    };

    setCached(cacheKey, out);
    return out;
  }

  // ─── 7B. HONEST ORDER FLOW INTELLIGENCE (REAL L1 + OHLCV VPVR, ZERO FAKE TICK TAPE) ─
  async function fetchOrderFlowIntel(rawSym, rawInterval = '5m') {
    const sym = String(rawSym || 'ONDS').toUpperCase().trim();
    const interval = ['1m', '5m', '15m', '30m', '1h'].includes(String(rawInterval).toLowerCase())
      ? String(rawInterval).toLowerCase()
      : '5m';
    const range = interval === '1m' ? '1d' : (interval === '1h' ? '1mo' : '5d');
    const cacheKey = `intel:orderflow:v1:${sym}:${interval}`;
    const cached = getCached(cacheKey, 15000);
    if (cached) return cached;

    const sessionCtx = getMarketSessionContext();
    const [quoteMap, barsPack] = await Promise.all([
      fetchYahooQuoteBatch([sym]),
      fetchYahooBars(sym, interval, range, true)
    ]);

    const q = quoteMap.get(sym) || {};
    const bars = Array.isArray(barsPack?.bars) ? barsPack.bars : [];
    const bid = safeNum(q.bid, null);
    const ask = safeNum(q.ask, null);
    const bidSize = safeNum(q.bidSize, null);
    const askSize = safeNum(q.askSize, null);
    const spread = (bid > 0 && ask >= bid) ? Number((ask - bid).toFixed(4)) : null;
    const spreadPct = (spread != null && ask > 0) ? Number(((spread / ((ask + bid) / 2)) * 100).toFixed(2)) : null;
    const totSz = (bidSize || 0) + (askSize || 0);
    const l1ImbalancePct = totSz > 0 ? Number((((bidSize || 0) / totSz) * 100).toFixed(1)) : null;
    const l1Available = bid != null && ask != null && bid > 0 && ask > 0;

    // Build real OHLCV Volume Profile from recent intraday bars (no fake tick Bid/Ask splits)
    const sliceBars = bars.slice(-96);
    let minP = Infinity, maxP = -Infinity;
    for (const b of sliceBars) {
      if (b.low < minP) minP = b.low;
      if (b.high > maxP) maxP = b.high;
    }
    const numBins = 24;
    let volumeProfile = null;
    if (sliceBars.length >= 5 && Number.isFinite(minP) && Number.isFinite(maxP) && maxP > minP) {
      const step = (maxP - minP) / numBins;
      const bins = Array.from({ length: numBins }, (_, i) => ({
        priceLow: Number((minP + i * step).toFixed(4)),
        priceHigh: Number((minP + (i + 1) * step).toFixed(4)),
        priceMid: Number((minP + (i + 0.5) * step).toFixed(4)),
        totalVol: 0
      }));
      let grandTotal = 0;
      for (const b of sliceBars) {
        const vol = b.volume || 0;
        const bStart = Math.max(0, Math.min(numBins - 1, Math.floor((b.low - minP) / step)));
        const bEnd = Math.max(0, Math.min(numBins - 1, Math.floor((b.high - minP) / step)));
        const vPer = vol / (bEnd - bStart + 1);
        for (let k = bStart; k <= bEnd; k++) bins[k].totalVol += vPer;
        grandTotal += vol;
      }
      let pocIdx = 0, maxV = 0;
      bins.forEach((bn, idx) => {
        if (bn.totalVol > maxV) { maxV = bn.totalVol; pocIdx = idx; }
      });
      const targetVA = grandTotal * 0.70;
      let accV = bins[pocIdx].totalVol, loIdx = pocIdx, hiIdx = pocIdx;
      while (accV < targetVA && (loIdx > 0 || hiIdx < numBins - 1)) {
        const nUp = hiIdx < numBins - 1 ? bins[hiIdx + 1].totalVol : -1;
        const nDn = loIdx > 0 ? bins[loIdx - 1].totalVol : -1;
        if (nUp >= nDn) { hiIdx++; accV += bins[hiIdx].totalVol; }
        else { loIdx--; accV += bins[loIdx].totalVol; }
      }
      const enrichedBins = bins.map((bn, idx) => ({
        ...bn,
        totalVol: Math.round(bn.totalVol),
        pctOfMax: maxV > 0 ? Math.round((bn.totalVol / maxV) * 100) : 0,
        isPoc: idx === pocIdx,
        inValueArea: idx >= loIdx && idx <= hiIdx
      }));
      const hvn = [...enrichedBins].sort((a, b) => b.totalVol - a.totalVol).slice(0, 3).map(b => b.priceMid);
      const lvn = [...enrichedBins].filter(b => b.totalVol > 0).sort((a, b) => a.totalVol - b.totalVol).slice(0, 2).map(b => b.priceMid);
      volumeProfile = {
        poc: bins[pocIdx].priceMid,
        vah: bins[hiIdx].priceHigh,
        val: bins[loIdx].priceLow,
        totalVol: Math.round(grandTotal),
        barsCount: sliceBars.length,
        hvn,
        lvn,
        bins: enrichedBins.reverse()
      };
    }

    // Structural OHLCV Effort vs Result / Absorption (explicitly marked as Proxy OHLCV)
    const last20VolAvg = sliceBars.slice(-21, -1).reduce((s, b) => s + (b.volume || 0), 0) / Math.max(1, Math.min(20, sliceBars.length - 1));
    const structuralBars = sliceBars.slice(-14).map(b => {
      const rng = Math.max(1e-9, b.high - b.low);
      const clvPct = Math.round(((b.close - b.low) / rng) * 100);
      const bodyRatio = Math.abs(b.close - b.open) / rng;
      const rvol = last20VolAvg > 0 ? Number(((b.volume || 0) / last20VolAvg).toFixed(2)) : 1;
      const isAbsorption = rvol >= 1.5 && bodyRatio <= 0.30;
      const absorptionType = isAbsorption
        ? (clvPct >= 55 ? 'Absorbție Cerere [OHLCV]' : (clvPct <= 45 ? 'Absorbție Ofertă [OHLCV]' : 'Efort fără Deplasare [OHLCV]'))
        : 'Flux Normal';
      const dt = formatDualTime(b.time);
      return {
        timeEt: dt.timeEt || '',
        timeRo: dt.timeRo || '',
        close: Number(b.close.toFixed(4)),
        volume: Math.round(b.volume || 0),
        rvol,
        rangePct: Number(((rng / Math.max(1e-6, b.close)) * 100).toFixed(2)),
        clvBuyProxyPct: clvPct,
        isAbsorption,
        absorptionType
      };
    }).reverse();

    const out = {
      ok: true,
      sym,
      interval,
      sessionCtx,
      updatedTimeRo: nowTimeRo(),
      updatedTimeEt: sessionCtx.timeEt,
      l1Quote: {
        available: l1Available,
        bid,
        ask,
        bidSize,
        askSize,
        spread,
        spreadPct,
        l1ImbalancePct,
        imbalanceSide: l1ImbalancePct == null ? 'N/A' : (l1ImbalancePct >= 58 ? 'Bid Dominant (Cumpărători L1)' : (l1ImbalancePct <= 42 ? 'Ask Dominant (Vânzători L1)' : 'L1 Echilibrat')),
        source: 'Yahoo L1 Top-of-Book Quote'
      },
      volumeProfile,
      ohlcvProxyFlow: {
        methodLabel: 'Proxy Structural OHLCV (NU este Trade Tape Bid/Ask)',
        absorptionCount: structuralBars.filter(x => x.isAbsorption).length,
        recentBars: structuralBars
      },
      tickTape: {
        available: false,
        statusLabel: 'INDISPONIBIL',
        missingMetrics: [
          'Bid Volume (Tick-by-Tick)',
          'Ask Volume (Tick-by-Tick)',
          'True Volume Delta',
          'True Cumulative Volume Delta (CVD)',
          'Diagonal Bid×Ask Footprint'
        ],
        reason: 'INDISPONIBIL — Fluxul gratuit Yahoo Finance / TradingView livrează doar lumânări OHLCV + cotație L1 Top-of-Book (Bid/Ask), fără Time & Sales tick-by-tick sau Level 2 Order Book. Bid/Ask Volume și Footprint-ul real NU sunt simulate din OHLCV.'
      }
    };

    setCached(cacheKey, out);
    return out;
  }

  // ─── 8. GROUNDED AI TRADING COPILOT (5-ZONE SYNTHESIS) ───────────────────
  const KNOWN_MARKET_ETFS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS',
    'SPXL', 'SPXS', 'UVXY', 'VIXY', 'SVXY', 'TLT', 'HYG', 'LQD', 'GLD', 'SLV',
    'USO', 'UNG', 'SMH', 'ARKK', 'XBI', 'IBB', 'KRE', 'GDX', 'EEM', 'FXI',
    ...SECTOR_ETFS.map(s => s.sym)
  ]);

  const CRYPTO_SHORTHAND_MAP = {
    BTC: 'BTC-USD',
    ETH: 'ETH-USD',
    SOL: 'SOL-USD',
    EGLD: 'EGLD-USD',
    XRP: 'XRP-USD',
    DOGE: 'DOGE-USD',
    ADA: 'ADA-USD',
    AVAX: 'AVAX-USD'
  };

  // Romanian/English prose words and trading acronyms ignored unless marked with `$TICKER`.
  const COPILOT_ALWAYS_STOPWORDS = new Set([
    'DE', 'CE', 'NU', 'SI', 'CU', 'IN', 'LA', 'PE', 'AI', 'AM', 'AR', 'AS', 'AT', 'AU',
    'CA', 'DA', 'EA', 'EL', 'EU', 'FI', 'IA', 'II', 'IL', 'IM', 'IS', 'IT', 'LE', 'LI',
    'MA', 'MI', 'NE', 'NI', 'NO', 'OL', 'OM', 'OR', 'PE', 'PT', 'SA', 'SE', 'TI', 'TU',
    'UN', 'VA', 'VS',
    'ACEST', 'ACUM', 'AICI', 'AL', 'ALE', 'ALT', 'ALTA', 'ALTE', 'ALTI', 'ANI', 'ARE',
    'ASA', 'ASTA', 'AVEM', 'AVEA', 'AVUT', 'AZI', 'BINE', 'BUN', 'BUNA', 'CAM', 'CAND',
    'CARE', 'CATE', 'CATI', 'CAZ', 'CEA', 'CEI', 'CEL', 'CELE', 'CEVA', 'CHIAR',
    'CINE', 'CRED', 'CUM', 'DACA', 'DAR', 'DAT', 'DATA', 'DAU', 'DECI', 'DEJA', 'DESI',
    'DIN', 'DOAR', 'DOI', 'DOUA', 'DUPA', 'ELE', 'ERA', 'ESTE', 'ESTI', 'FAC', 'FACE',
    'FARA', 'FATA', 'FEL', 'FIE', 'FOST', 'GATA', 'GEN', 'GREU', 'HAI', 'IAR', 'IATA',
    'IDEE', 'IDEI', 'IERI', 'IES', 'IMI', 'INS', 'INTRE', 'ISI', 'ITI', 'JOS', 'JOC',
    'LANGA', 'LASA', 'LOR', 'LUAT', 'LUI', 'LUNA', 'LUNI', 'MAI', 'MARE', 'MARI', 'MEA',
    'MEI', 'MEU', 'MIC', 'MICA', 'MICI', 'MIE', 'MII', 'MISC', 'MOD', 'MODUL', 'MULT',
    'MULTE', 'MULTI', 'NICI', 'NISTE', 'NOI', 'NOU', 'NOUA', 'NUMAI', 'OARE', 'OK',
    'OPT', 'ORA', 'ORE', 'ORI', 'ORICE', 'PANA', 'PARE', 'PARI', 'PARTE', 'PAS', 'PESTE',
    'PIAT', 'PIATA', 'POATE', 'POT', 'POTI', 'PREA', 'PRET', 'PRIN', 'PUN', 'PUNE',
    'PUS', 'PUTIN', 'RAU', 'RISC', 'ROG', 'ROSU', 'SAU', 'SCAD', 'SCADE', 'SCIRU',
    'SCRI', 'SCRIS', 'SCRIU', 'SIMB', 'SUNT', 'SPRE', 'SPUN', 'SPUNE', 'STAI', 'STAU',
    'STII', 'STIRI', 'STIRE', 'STIU', 'SUB', 'SUS', 'TA', 'TAI', 'TALE', 'TARE', 'TAU',
    'TE', 'TIMP', 'TINE', 'TIP', 'TOAT', 'TOATE', 'TOT', 'TOTI', 'TREB', 'TREI', 'UI',
    'UITA', 'UITE', 'UNA', 'UNDE', 'UNII', 'UNU', 'UNUL', 'URMA', 'USOR', 'VAD', 'VAR',
    'VECH', 'VEDE', 'VERDE', 'VEZI', 'VIN', 'VINE', 'VOI', 'VOM', 'VOR', 'VREA', 'VREAU',
    'VREI', 'VREO', 'ZIC', 'ZICE', 'ZICI', 'ZI', 'ZILE', 'ZILEI', 'ZIUA', 'ZONA',
    'ACTIV', 'ACTI', 'ANAL', 'CHECK', 'MACRO', 'RADAR', 'SCAN', 'SEC', 'RSI', 'MACD',
    'VWAP', 'SL', 'TP', 'TP1', 'TP2', 'BUY', 'SELL', 'LONG', 'SHORT', 'US', 'USA', 'USD',
    'IV', 'IV30', 'GEX', 'MAX', 'ET', 'RO', 'LULD', 'POC', 'VAH', 'VAL', 'VPVR', 'ATM',
    'HOD', 'LOD', 'PM', 'AH', 'OVN', 'RVOL', 'TOD', 'CVD', 'OB', 'FVG', 'SMC', 'EMA',
    'SMA', 'ATR', 'ORB', 'MCAP', 'FLT', 'VOL', 'CHG', 'PRE', 'POST', 'WAIT', 'PASS',
    'FAIL', 'WARN', 'MFE', 'RR', 'IPO', 'FDA', 'CEO', 'CFO', 'EPS', 'PE', 'PR', 'ETF',
    'FOMO', 'NEWS', 'HALT', 'HALTS', 'PLAN', 'ENTRY', 'EXIT', 'ORDER', 'FLOW', 'DELTA',
    'FLOAT', 'SQUEE', 'SHRT', 'OPT', 'OPTS', 'PREM', 'GAIN', 'SETUP', 'SCORE', 'SCOR',
    'ABOUT', 'ABOVE', 'AFTER', 'AGAIN', 'ALSO', 'AND', 'ANY', 'BAD', 'BAR', 'BARS',
    'BE', 'BEEN', 'BID', 'BOTH', 'BULL', 'BEAR', 'CALL', 'CAP', 'CAPS', 'COME', 'DAY',
    'DAYS', 'DID', 'DO', 'DOES', 'DONE', 'DOWN', 'DROP', 'END', 'EVEN', 'EVER', 'FAR',
    'FEW', 'FIND', 'FROM', 'FULL', 'GAME', 'GAP', 'GATE', 'GET', 'GIVE', 'GO', 'HAD',
    'HAS', 'HAVE', 'HELP', 'HELLO', 'HEY', 'HI', 'HER', 'HERE', 'HIM', 'HIS', 'HIT',
    'HOLD', 'HOT', 'HOW', 'HUGE', 'INTO', 'ITS', 'JUMP', 'JUST', 'KEEP', 'KEY', 'KNOW',
    'LAST', 'LATE', 'LESS', 'LET', 'LIKE', 'LINE', 'LIST', 'LOOK', 'LOSS', 'LOT', 'LOTS',
    'MADE', 'MAIN', 'MAKE', 'MANY', 'MAY', 'MEAN', 'MEET', 'MIN', 'MODE', 'MORE', 'MOST',
    'MOVE', 'MUCH', 'MUST', 'MY', 'NAME', 'NEAR', 'NEED', 'NEW', 'NICE', 'NONE', 'NOT',
    'NOTE', 'OF', 'OFF', 'OHLCV', 'OLD', 'ON', 'ONCE', 'ONLY', 'OUR', 'OUT', 'OVER',
    'OWN', 'PAGE', 'PAIN', 'PART', 'PAST', 'PAY', 'PCT', 'PICK', 'PUMP', 'PUT', 'PUTS',
    'QTY', 'QUICK', 'QUOTE', 'RANGE', 'RATE', 'RATIO', 'READ', 'RED', 'REV', 'SAID',
    'SALE', 'SAME', 'SAVE', 'SAY', 'SAYS', 'SEE', 'SEEM', 'SEEN', 'SEND', 'SET', 'SEVEN',
    'SHARE', 'SHE', 'SHOW', 'SIDE', 'SIGN', 'SIZE', 'SLOW', 'SMALL', 'SO', 'SOLD',
    'SOME', 'SOON', 'SORT', 'START', 'STAT', 'STAY', 'STEP', 'STOCK', 'STOP', 'SUCH',
    'SURE', 'SWING', 'TAKE', 'TAPE', 'TAX', 'TECH', 'TELL', 'TEN', 'TERM', 'THAN',
    'THAT', 'THE', 'THEM', 'THEN', 'THEY', 'THIS', 'THREE', 'TIME', 'TO', 'TODAY',
    'TOO', 'TOP', 'TRADE', 'TREND', 'TRY', 'TURN', 'TV', 'TYPE', 'UP', 'USE', 'USED',
    'USER', 'VERY', 'VIEW', 'WAS', 'WAY', 'WE', 'WEEK', 'WELL', 'WENT', 'WERE', 'WHAT',
    'WHEN', 'WHO', 'WHY', 'WILL', 'WIN', 'WITH', 'WORTH', 'WOULD', 'YES', 'YET', 'YOU',
    'YOUR', 'ZERO', 'ZONE', 'SALUT', 'TEST'
  ]);

  // Valid US tickers that collide with everyday English/Romanian words when written lowercase inside sentences.
  const COPILOT_AMBIGUOUS_WORDS = new Set([
    'ALL', 'BEST', 'BILL', 'BLUE', 'CASH', 'CAT', 'COST', 'DATA', 'DOCS', 'FAST',
    'FIVE', 'FOR', 'FOUR', 'FREE', 'GOLD', 'GOOD', 'HIGH', 'LIVE', 'LOW', 'NET',
    'NEXT', 'NINE', 'NOW', 'ONE', 'OPEN', 'PATH', 'PLAY', 'PLUS', 'REAL', 'RISK',
    'RUN', 'SPOT', 'TEAM', 'TRUE', 'TWO', 'UNIT', 'WORK', 'YEAR'
  ]);

  const COPILOT_LABEL_NOISE = new Set([
    'ACTIV', 'ACTIVA', 'ACTIVE', 'AZI', 'MEU', 'NOI', 'NOU', 'ASTAZI', 'CURENT'
  ]);

  /**
   * Resolves 1-2 valid ticker symbols mentioned in a Copilot prompt regardless of casing,
   * while preventing false matches on ordinary Romanian/English prose or trading terms.
   */
  async function resolveCopilotSymbols(queryText, fallbackSym = 'ONDS', watchlist = []) {
    const cleanQ = String(queryText || '').trim();
    const fallback = String(fallbackSym || 'ONDS').toUpperCase().trim() || 'ONDS';
    const watchlistSet = new Set((watchlist || []).map(s => String(s || '').toUpperCase().trim()).filter(Boolean));
    const singleTokenRaw = cleanQ.replace(/^[\s"'`([<{]+|[\s?!.,;:"'`)\]}>]+$/g, '');
    const isSingleWordPrompt = /^[A-Za-z][A-Za-z0-9.\-=]{0,11}$/.test(singleTokenRaw);

    const candidates = [];
    const seenCand = new Set();
    const pushCand = (sym, priority = 0) => {
      const clean = String(sym || '').toUpperCase().trim();
      if (!clean || seenCand.has(clean)) return;
      seenCand.add(clean);
      candidates.push({ sym: clean, priority });
    };

    // 1. Explicit $TICKER markers (override stopwords, including $CAT, $AI, $DE, $btc)
    for (const m of cleanQ.matchAll(/\$([A-Za-z][A-Za-z0-9.\-=]{0,11})\b/g)) {
      const up = m[1].toUpperCase();
      pushCand(CRYPTO_SHORTHAND_MAP[up] && (watchlistSet.has(CRYPTO_SHORTHAND_MAP[up]) || isSingleWordPrompt)
        ? CRYPTO_SHORTHAND_MAP[up] : up, 3);
    }

    // 2. Unambiguous suffixed tickers (e.g., btc-usd, es=f, brk.b)
    for (const m of cleanQ.matchAll(/\b([A-Za-z]{2,6}-USD|[A-Za-z]{1,4}=F|[A-Za-z]{2,4}\.[A-B])\b/gi)) {
      const up = m[1].toUpperCase();
      pushCand(up.includes('.') && !up.includes('=') ? up.replace('.', '-') : up, 3);
    }

    // 3. Keyword-led ticker ("ticker apps", "simbol poas", "actiune nvda")
    for (const m of cleanQ.matchAll(/\b(?:ticker|simbol(?:ul)?|symbol|actiun(?:e|ea)|acțiun(?:e|ea)|stock)\s*[:=]?\s*([A-Za-z][A-Za-z0-9.\-=]{0,11})\b/gi)) {
      const up = m[1].toUpperCase();
      if (!COPILOT_ALWAYS_STOPWORDS.has(up) && !COPILOT_LABEL_NOISE.has(up)) {
        pushCand(CRYPTO_SHORTHAND_MAP[up] && watchlistSet.has(CRYPTO_SHORTHAND_MAP[up]) ? CRYPTO_SHORTHAND_MAP[up] : up, 2);
      }
    }

    // 4. Bare word scan (Unicode-aware boundaries so accented Romanian words like "către" never split at diacritics)
    const wordMatches = Array.from(cleanQ.matchAll(/(?<![\p{L}\p{N}_])([\p{L}]{1,10})(?![\p{L}\p{N}_])/gu));
    const asciiWordMatches = wordMatches.filter(w => /^[A-Za-z]{1,5}$/.test(w[1]));
    const allUpperSentence = asciiWordMatches.length >= 3 && asciiWordMatches.every(w => w[1] === w[1].toUpperCase());

    for (const m of asciiWordMatches) {
      const raw = m[1];
      const up = raw.toUpperCase();
      const isAllCaps = !allUpperSentence && raw === up && raw.length >= 2;

      if (COPILOT_ALWAYS_STOPWORDS.has(up)) continue;

      if (raw.length === 1) {
        if ((isSingleWordPrompt && raw === up) || watchlistSet.has(up)) pushCand(up, 1);
        continue;
      }

      if (CRYPTO_SHORTHAND_MAP[up] && (watchlistSet.has(CRYPTO_SHORTHAND_MAP[up]) || isSingleWordPrompt)) {
        pushCand(CRYPTO_SHORTHAND_MAP[up], 2);
        continue;
      }

      if (COPILOT_AMBIGUOUS_WORDS.has(up)) {
        if (isAllCaps || (isSingleWordPrompt && (raw === up || watchlistSet.has(up)))) {
          pushCand(up, 1);
        }
        continue;
      }

      pushCand(up, isAllCaps ? 2 : (watchlistSet.has(up) ? 2 : 1));
    }

    if (!candidates.length) {
      return { syms: [fallback], primarySym: fallback, mentionedInQuery: false };
    }

    const secMap = await getSecTickerMap().catch(() => ({}));
    const verified = [];
    const needQuoteVerify = [];

    for (const c of candidates) {
      const sym = c.sym;
      if (watchlistSet.has(sym) || KNOWN_MARKET_ETFS.has(sym) || secMap[sym] || secMap[sym.replace('-', '.')] || sym.includes('=F') || sym.endsWith('-USD')) {
        verified.push(sym);
      } else {
        needQuoteVerify.push(sym);
      }
    }

    if (needQuoteVerify.length) {
      const quoteMap = await fetchYahooQuoteBatch(needQuoteVerify.slice(0, 4)).catch(() => new Map());
      for (const sym of needQuoteVerify) {
        const q = quoteMap.get(sym);
        if (q && (q.regularMarketPrice != null || q.shortName || q.longName)) {
          verified.push(sym);
        }
      }
    }

    // Preserve first-mentioned query order and cap to 2 symbols for focused multi-symbol comparisons.
    const verifiedSet = new Set(verified);
    const ordered = candidates.map(c => c.sym).filter(sym => verifiedSet.has(sym));
    const unique = Array.from(new Set(ordered)).slice(0, 2);

    if (!unique.length) {
      return { syms: [fallback], primarySym: fallback, mentionedInQuery: false };
    }
    return { syms: unique, primarySym: unique[0], mentionedInQuery: true };
  }

  function appendSymbolCopilotSections(sections, { deep, orderFlow, aiIdea, sessionCtx, low, wantsRadar }) {
    if (deep) {
      const preCheck = evaluatePreBuySafetyChecks({
        sym: deep.sym,
        price: deep.quote.price,
        chgPct: deep.quote.chgPct,
        distVwapPct: deep.flow5m?.distVwapPct ?? 0,
        volume: deep.quote.volume,
        rvol5m: deep.flow5m?.volAccel5m ?? 0,
        floatShares: deep.structure?.floatShares ?? null,
        yfFloatShares: deep.structure?.floatShares ?? null,
        spreadPct: deep.quote.spreadPct ?? null,
        newsMeta: deep.news?.[0] || null,
        secPack: deep.sec,
        sessionCtx,
        dataQuality: deep.dataQuality
      });
      sections.push({
        heading: `Zona 04 · Intelligence ${deep.sym} (${deep.quote.name}) — ${deep.quote.price.toFixed(2)} USD (${deep.quote.chgPct >= 0 ? '+' : ''}${deep.quote.chgPct.toFixed(2)}%)`,
        bullets: [
          ...deep.aiMarketAnalysis.observations,
          `Pre-BUY Gate (${preCheck.passedCount}/${preCheck.totalChecks} PASS): ${preCheck.allowBuy ? 'ELIGIBIL' : `BLOCAT (${preCheck.blockers.join(' · ')})`}`,
          `Calitate Date (${deep.dataQuality?.status || 'VERIFICAT'}): ${deep.dataQuality?.flags?.map(f => f.message).join(' | ') || 'Fără anomalii detectate'}`,
          `Evaluare Priced-In: ${deep.pricedInVerdict}`
        ]
      });

      if (deep.news?.length && (/de ce|stiri|știri|catalist|mișc|misc|news/.test(low) || !wantsRadar)) {
        sections.push({
          heading: `Știri Recente & Catalizatori ${deep.sym}`,
          bullets: deep.news.slice(0, 4).map(n => `[${n.bias} · ${n.category}] ${n.title} (${n.publisher}, ${n.publishedTimeEt || n.publishedDate})`)
        });
      }

      if (deep.aiMarketAnalysis.watchItems?.length) {
        sections.push({
          heading: `Niveluri & Scenarii de Urmărit ${deep.sym}`,
          bullets: deep.aiMarketAnalysis.watchItems
        });
      }
    }

    if (orderFlow?.ok) {
      const l1 = orderFlow.l1Quote;
      const vp = orderFlow.volumeProfile;
      sections.push({
        heading: `Zona 05 · Execuție & Order Flow Onest (${orderFlow.sym})`,
        bullets: [
          l1.available
            ? `L1 Quote Real: Bid $${l1.bid} × ${l1.bidSize ?? '—'} | Ask $${l1.ask} × ${l1.askSize ?? '—'} | Spread ${l1.spreadPct ?? '—'}% | Imbalance: ${l1.imbalanceSide}`
            : 'L1 Quote: Bid/Ask indisponibil în sesiunea curentă.',
          vp ? `Volume Profile OHLCV real (${vp.barsCount} bare 5m): POC $${vp.poc} · VAH $${vp.vah} · VAL $${vp.val}.` : 'Volume Profile OHLCV: date insuficiente.',
          `Flux tick-by-tick Bid/Ask Volume / Footprint real: ${orderFlow.tickTape.statusLabel} (fără Time & Sales tick — nu se simulează din OHLCV).`
        ]
      });
    }

    if (aiIdea) {
      sections.push({
        heading: `Plan Quant R:R · ${aiIdea.sym} (${aiIdea.actionTitle})`,
        bullets: [
          `Confluență: Scor ${aiIdea.oppScore}/100 · Probabilitate estimată ${aiIdea.probPct}% · Arhetip: ${aiIdea.setupArchetype}.`,
          `Zonă Entry: ${aiIdea.entryZoneLow?.toFixed(2) ?? '—'} – ${aiIdea.entryZoneHigh?.toFixed(2) ?? '—'} · Stop-Loss: ${aiIdea.sl?.toFixed(2) ?? '—'} · TP1: ${aiIdea.tp1?.toFixed(2) ?? '—'} · TP2: ${aiIdea.tp2?.toFixed(2) ?? '—'}.`,
          aiIdea.aiThesis || ''
        ].filter(Boolean)
      });
    }
  }

  async function answerCopilotQuery({ query, sym = 'ONDS', tf = '30m', watchlist = [] }) {
    const cleanQ = String(query || '').trim();
    const low = cleanQ.toLowerCase();
    const targetSym = String(sym || 'ONDS').toUpperCase().trim();
    const sessionCtx = getMarketSessionContext();

    // Detect intents across all 5 Cockpit Zones (01 Market · 02 Early Radar · 03 Momentum · 04 Intel · 05 Execuție)
    const wantsRadar = /g[aă]se|small\s*cap|înainte|inainte|volum\s*exploziv|breakout|scan|oportunit|azi pe pia|early|radar/i.test(low);
    const wantsMacro = /pia[țt][aă]|macro|nasdaq|s&p|vix|sector|rotatie|rotație|regim/i.test(low);
    const wantsCockpit = /cockpit|halt|luld|gainer|squeeze|5 pillars|low float|running up/i.test(low);
    const wantsOrderFlow = /order\s*flow|bid|ask|spread|vpvr|poc|vah|val|delta|cvd|lichiditate/i.test(low);
    const wantsPlan = /plan|entry|\bsl\b|\btp\b|intrare|setup|strateg|buy|sell/i.test(low);
    const wantsActiveFocus = /simbol(?:ul)?\s*activ|de\s+ce\s+se\s+mi[șs]c|stiri|știri|dilut|diluți|\bsec\b|opțiun|optiun|squeeze|riscuri/i.test(low);

    const { syms: resolvedSyms, primarySym: detectedSym, mentionedInQuery } = await resolveCopilotSymbols(cleanQ, targetSym, watchlist);
    const includeRadar = wantsRadar || (!mentionedInQuery && !wantsMacro && !wantsCockpit && !wantsOrderFlow && !wantsActiveFocus && !wantsPlan);

    const [symBundles, radar, overview, cockpit] = await Promise.all([
      Promise.all(resolvedSyms.map(async (s) => {
        const [deep, orderFlow, aiIdea] = await Promise.all([
          fetchSymbolDeepIntel(s, tf),
          fetchOrderFlowIntel(s, '5m').catch(() => null),
          (wantsPlan && generateSingleAITradeIdeaServer) ? generateSingleAITradeIdeaServer(s, tf).catch(() => null) : Promise.resolve(null)
        ]);
        return { sym: s, deep, orderFlow, aiIdea };
      })),
      includeRadar ? computeEarlyRadar({ mode: /small/.test(low) ? 'smallcap' : 'prebreakout', customSyms: watchlist }) : Promise.resolve(null),
      wantsMacro || includeRadar ? fetchMarketOverview(false) : Promise.resolve(null),
      wantsCockpit ? fetchScannerCockpit(watchlist, false) : Promise.resolve(null)
    ]);

    const sections = [];

    if (overview) {
      const topSec = overview.sectors.slice(0, 3).map(s => `${s.sym} (${s.chgPct >= 0 ? '+' : ''}${s.chgPct.toFixed(2)}%)`).join(', ');
      const weakSec = overview.sectors.slice(-2).map(s => `${s.sym} (${s.chgPct >= 0 ? '+' : ''}${s.chgPct.toFixed(2)}%)`).join(', ');
      sections.push({
        heading: `Zona 01 · Market Environment (${overview.regime.label} · ${overview.regime.score}/100 · ${sessionCtx.label})`,
        bullets: [
          overview.regime.summary,
          `Breadth US (top ${overview.breadth.sampleSize}): ${overview.breadth.advancers} verzi / ${overview.breadth.decliners} roșii (${overview.breadth.pctUp}% verzi, ${overview.breadth.pctAboveSma50 ?? '—'}% peste SMA50).`,
          `Sectoare lider: ${topSec} · Sectoare slabe: ${weakSec}.`
        ]
      });
    }

    if (radar && radar.candidates?.length) {
      const top5 = radar.candidates.slice(0, 6).map(c =>
        `${c.sym} (${c.chgPct >= 0 ? '+' : ''}${c.chgPct.toFixed(2)}%) — Early ${c.fiveScores?.earlyOpportunity?.score ?? c.earlyScore}/100, Mom ${c.fiveScores?.momentum?.score ?? '—'}/100, Risk ${c.fiveScores?.risk?.score ?? '—'}/100 · RVOL TOD ${c.rvolTod != null ? c.rvolTod + 'x' : 'N/A'} · Verdict: ${c.verdict?.shortBadge || c.verdict?.action} · ${c.setupTag}`
      );
      sections.push({
        heading: `Zona 02 · Early Opportunity Radar (${radar.candidates.length} candidați · ${sessionCtx.timeEt})`,
        bullets: top5,
        quickSymbols: radar.candidates.slice(0, 5).map(c => c.sym)
      });
    }

    if (cockpit) {
      const eTop = (cockpit.earlyMovers || []).slice(0, 3).map(r => `${r.sym} (${r.chgPct >= 0 ? '+' : ''}${r.chgPct.toFixed(2)}%, 5m ${r.rvol5mDisplay || r.rvol5m + 'x'})`).join(' · ');
      const lfTop = (cockpit.lowFloat || []).slice(0, 3).map(r => `${r.sym} (${r.chgPct >= 0 ? '+' : ''}${r.chgPct.toFixed(2)}%, Gate: ${r.verdict?.shortBadge || 'WAIT'})`).join(' · ');
      sections.push({
        heading: `Zona 03 · Momentum Cockpit & Halts (${(cockpit.halts || []).length} LULD Halts active)`,
        bullets: [
          `Early Movers (-2%..+8% vol ascendent): ${eTop || 'niciun candidat momentan'}`,
          `Low Float Top Movers: ${lfTop || '—'}`,
          `LULD Halts live: ${(cockpit.halts || []).slice(0, 4).map(h => `${h.sym} (${h.code || 'HALT'} @ ${h.haltTime || '—'})`).join(', ') || 'niciun halt activ'}`
        ]
      });
    }

    for (const bundle of symBundles) {
      appendSymbolCopilotSections(sections, {
        deep: bundle.deep,
        orderFlow: bundle.orderFlow,
        aiIdea: bundle.aiIdea,
        sessionCtx,
        low,
        wantsRadar: includeRadar
      });
    }

    return {
      ok: true,
      sym: detectedSym,
      syms: resolvedSyms,
      mentionedInQuery,
      query: cleanQ,
      sessionCtx,
      answeredAt: nowTimeRo(),
      sections,
      sources: 'Yahoo Finance 5m/L1 Quote/News · SEC EDGAR · CBOE Delayed Options · TradingView Scanner · NASDAQ Halts'
    };
  }

  // ─── 9. MULTI-PANE SCANNER COCKPIT & LIVE NASDAQ LULD HALTS ─────────────
  const HALT_REASON_MAP = {
    LUDP: 'LULD Pauză Volatilitate (Up/Down)',
    LUDS: 'LULD Straddle Volatilitate',
    M: 'Pauză Volatilitate Piață',
    T1: 'Oprit — Știre Importantă în Așteptare',
    T2: 'Oprit — Știre Publicată',
    T3: 'Reluare Tranzacționare După Știre',
    T5: 'Circuit Breaker / Drop 10%',
    T12: 'Cerere Informații Aditionale NASDAQ',
    H4: 'Neconformitate Listing',
    H9: 'Întârziere Raportare Financiară',
    H10: 'Suspendare SEC',
    H11: 'Suspendare Regulatorie',
    D: 'Știre / Eveniment Corporativ'
  };

  async function fetchNasdaqHalts() {
    const cacheKey = 'nasdaq:halts:v1';
    const cached = getCached(cacheKey, 20000);
    if (cached) return cached;

    try {
      const res = await fetch('https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts', {
        headers: { 'User-Agent': UA_BROWSER },
        signal: AbortSignal.timeout(5500)
      });
      if (!res.ok) return [];
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      const getTag = (block, tag) => {
        const rx = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const m = rx.exec(block);
        return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      };

      const parsed = items.slice(0, 28).map(block => {
        const sym = getTag(block, 'ndaq:IssueSymbol') || getTag(block, 'title');
        const name = getTag(block, 'ndaq:IssueName');
        const market = getTag(block, 'ndaq:Market') || 'US';
        const haltDate = getTag(block, 'ndaq:HaltDate');
        const haltTime = getTag(block, 'ndaq:HaltTime').slice(0, 8);
        const code = getTag(block, 'ndaq:ReasonCode') || 'M';
        const resTime = getTag(block, 'ndaq:ResumptionTradeTime');
        const explanation = HALT_REASON_MAP[code] || `Cod ${code}`;
        return { sym, name, market, haltDate, haltTime, code, explanation, resumptionTime: resTime };
      }).filter(h => h.sym);

      setCached(cacheKey, parsed);
      return parsed;
    } catch (_) {
      return [];
    }
  }

  function resolveCockpitExtendedFields(q, r, sessionCtx) {
    const regPrice = safeNum(q.regularMarketPrice, safeNum(r.close, 0));
    const regChgPct = safeNum(q.regularMarketChangePercent, safeNum(r.change, 0));
    const regTs = toEpochSec(q.regularMarketTime);
    const tvRegOpenTs = toEpochSec(r.time);

    const tvPreTsRaw = toEpochSec(r.premarket_time);
    const tvPreValid = tvPreTsRaw > tvRegOpenTs && safeNum(r.premarket_close, 0) > 0;
    const hasYfPre = q.preMarketPrice != null && Number.isFinite(q.preMarketPrice) && q.preMarketPrice > 0;
    const prePrice = hasYfPre ? q.preMarketPrice : (tvPreValid ? safeNum(r.premarket_close, null) : null);
    const prePct = hasYfPre
      ? safeNum(q.preMarketChangePercent, regPrice > 0 ? ((prePrice - regPrice) / regPrice) * 100 : null)
      : (tvPreValid ? safeNum(r.premarket_change, null) : null);
    const preTs = hasYfPre ? (toEpochSec(q.preMarketTime) || regTs) : (tvPreValid ? tvPreTsRaw : 0);

    const hasOvn = q.overnightPrice != null && Number.isFinite(q.overnightPrice) && q.overnightPrice > 0;
    const ovnPrice = hasOvn ? q.overnightPrice : null;
    const ovnPct = hasOvn
      ? safeNum(q.overnightChangePercent, regPrice > 0 ? ((ovnPrice - regPrice) / regPrice) * 100 : 0)
      : null;
    const ovnTs = hasOvn ? toEpochSec(q.overnightTime) : 0;

    const tvPostTsRaw = toEpochSec(r.postmarket_time);
    const tvPostValid = tvPostTsRaw >= tvRegOpenTs && safeNum(r.postmarket_close, 0) > 0;
    const hasYfPost = q.postMarketPrice != null && Number.isFinite(q.postMarketPrice) && q.postMarketPrice > 0;
    const postPrice = hasYfPost ? q.postMarketPrice : (tvPostValid ? safeNum(r.postmarket_close, null) : null);
    const postPct = hasYfPost
      ? safeNum(q.postMarketChangePercent, regPrice > 0 ? ((postPrice - regPrice) / regPrice) * 100 : null)
      : (tvPostValid ? safeNum(r.postmarket_change, null) : null);
    const postTs = hasYfPost ? (toEpochSec(q.postMarketTime) || regTs) : (tvPostValid ? tvPostTsRaw : 0);

    const mktState = String(q.marketState || '').toUpperCase();
    const tvSess = String(q.tvCurrentSession || '').toLowerCase();
    let extType = '';
    let extLabel = '';
    let extPrice = null;
    let extChgPct = null;
    let extTime = 0;

    if (!sessionCtx.isRegular && mktState !== 'REGULAR') {
      if ((mktState === 'PRE' || tvSess === 'pre_market') && prePrice > 0 && preTs >= ovnTs) {
        extType = 'PRE';
      } else if (tvSess === 'night' && ovnPrice > 0) {
        extType = 'OVN';
      } else if ((mktState === 'POST' || mktState === 'POSTPOST' || tvSess === 'post_market') && postPrice > 0 && postTs >= ovnTs) {
        extType = 'POST';
      } else if (prePrice > 0 && preTs >= Math.max(ovnTs, postTs)) {
        extType = 'PRE';
      } else if (ovnPrice > 0 && ovnTs >= postTs) {
        extType = 'OVN';
      } else if (postPrice > 0) {
        extType = 'POST';
      }

      if (extType === 'PRE') {
        extLabel = 'Pre-Mkt';
        extPrice = prePrice;
        extChgPct = prePct;
        extTime = preTs;
      } else if (extType === 'OVN') {
        extLabel = 'Overnight';
        extPrice = ovnPrice;
        extChgPct = ovnPct;
        extTime = ovnTs;
      } else if (extType === 'POST') {
        extLabel = 'Post-Mkt';
        extPrice = postPrice;
        extChgPct = postPct;
        extTime = postTs;
      }
    }

    const livePrice = (!sessionCtx.isRegular && extPrice > 0) ? extPrice : regPrice;
    const chgPct = (sessionCtx.isPreMarket && extType === 'PRE' && extChgPct != null)
      ? extChgPct
      : regChgPct;
    const liveMovePct = (!sessionCtx.isRegular && extChgPct != null) ? extChgPct : chgPct;
    const pmHigh = (hasYfPre || tvPreValid) ? safeNum(q.preMarketDayHigh, safeNum(r.premarket_high, null)) : null;

    return {
      regPrice,
      regChgPct,
      extType,
      extLabel,
      extPrice,
      extChgPct,
      extTime,
      preChgPct: prePct,
      pmHigh,
      preVolume: tvPreValid ? safeNum(r.premarket_volume, 0) : 0,
      livePrice,
      chgPct,
      liveMovePct
    };
  }

  function computeProposalTradeLevels(side, price, vwap) {
    const p = Number(price) || 0;
    if (p <= 0) return { entry: 0, sl: 0, tp1: 0, tp2: 0, rr: 2.0 };
    const dec = p < 2 ? 3 : 2;
    const rawRisk = Math.min(p * 0.06, Math.max(p * 0.025, Math.abs((vwap || p) - p) * 0.85));
    if (side === 'BUY') {
      const sl = Math.max(0.01, p - rawRisk);
      const risk = Math.max(0.005, p - sl);
      return {
        entry: Number(p.toFixed(dec)),
        sl: Number(sl.toFixed(dec)),
        tp1: Number((p + risk * 2.0).toFixed(dec)),
        tp2: Number((p + risk * 3.2).toFixed(dec)),
        rr: 2.0
      };
    }
    const sl = p + rawRisk;
    const risk = Math.max(0.005, sl - p);
    return {
      entry: Number(p.toFixed(dec)),
      sl: Number(sl.toFixed(dec)),
      tp1: Number(Math.max(0.01, p - risk * 2.0).toFixed(dec)),
      tp2: Number(Math.max(0.01, p - risk * 3.2).toFixed(dec)),
      rr: 2.0
    };
  }

  function buildTop10CockpitProposals(poolRows, sessionCtx) {
    const unique = new Map();
    for (const r of poolRows) {
      if (r && r.sym && !unique.has(r.sym)) unique.set(r.sym, r);
    }

    const buyCandidates = [];
    const sellCandidates = [];

    for (const row of unique.values()) {
      if (row.halt || !(row.price >= 0.85)) continue;
      if ((row.volume || 0) < 50000 && (row.preVolume || 0) < 15000) continue;

      const extPct = row.extChgPct;
      const movePct = (!sessionCtx.isRegular && extPct != null) ? extPct : row.chgPct;
      const postSpikeDump = row.regChgPct >= 10 && extPct != null && extPct <= -2.5;
      const activeSelloff = movePct <= -1.8 && (row.chg5m <= 0.15 || !sessionCtx.isRegular);
      const dilutionFail = row.newsMeta?.isDilutionRisk || row.preBuyCheck?.checks?.some(c => c.id === 'dilution' && c.status === 'FAIL');
      const overboughtFade = (row.rsi >= 75 && row.chg5m <= -0.35) || (dilutionFail && movePct <= 2);

      const moveLabel = (row.extType && extPct != null)
        ? `${row.extLabel} ${extPct >= 0 ? '+' : ''}${extPct.toFixed(2)}%`
        : `${sessionCtx.isRegular ? 'RTH' : 'Reg'} ${row.chgPct >= 0 ? '+' : ''}${row.chgPct.toFixed(2)}%`;
      const regRefLabel = (row.extType && row.regPrice > 0 && Math.abs(row.price - row.regPrice) > 1e-4)
        ? `Reg $${row.regPrice.toFixed(row.regPrice < 2 ? 3 : 2)} (${row.regChgPct >= 0 ? '+' : ''}${row.regChgPct.toFixed(1)}%)`
        : '';

      const fmtRvolTag = (rv) => (rv >= 50 ? 'RVOL 50x+' : `RVOL ${rv.toFixed(1)}x`);

      if (postSpikeDump || activeSelloff || overboughtFade) {
        let score = 48;
        score += Math.min(24, Math.abs(movePct) * 1.4);
        score += postSpikeDump ? 14 : 0;
        score += Math.min(10, Math.max(0, (row.rvolDaily - 1) * 2.5));
        score += (row.vwap > 0 && row.price < row.vwap) ? 7 : 0;
        score += dilutionFail ? 9 : 0;
        score += (row.dollarVolume >= 2e6) ? 6 : 0;
        score = Math.round(clamp(score, 52, 98));

        const badge = score >= 76 && (movePct <= -4 || postSpikeDump) ? 'STRONG SELL' : 'SELL';
        const levels = computeProposalTradeLevels('SELL', row.price, row.vwap);
        const reasons = [];
        if (postSpikeDump) reasons.push(`Fade ${row.extLabel} ${extPct.toFixed(1)}% după +${row.regChgPct.toFixed(0)}%`);
        else if (movePct <= -1.8) reasons.push(`${row.extType ? row.extLabel : 'Cădere'} ${movePct.toFixed(2)}%`);
        if (row.vwap > 0 && row.price < row.vwap) reasons.push('Sub VWAP');
        if (dilutionFail) reasons.push('Risc diluție SEC/Știri');
        else if (row.rvolDaily >= 2) reasons.push(fmtRvolTag(row.rvolDaily));

        sellCandidates.push({
          sym: row.sym,
          name: row.name,
          side: 'SELL',
          badge,
          score,
          price: row.price,
          regPrice: row.regPrice,
          regChgPct: row.regChgPct,
          extType: row.extType,
          extLabel: row.extLabel,
          extChgPct: row.extChgPct,
          movePct,
          moveLabel,
          regRefLabel,
          rvolDaily: row.rvolDaily,
          preBuyAllow: false,
          levels,
          reason: reasons.slice(0, 3).join(' · ') || 'Presiune de vânzare activă'
        });
        continue;
      }

      const extHoldOk = extPct == null || extPct >= -0.2;
      const notOverExtended = !row.preBuyCheck?.isOverExtended && movePct < 24 && row.regChgPct < 35;
      const liqOk = (row.dollarVolume || 0) >= 250000 || (row.preVolume || 0) >= 20000;
      const hasBullTraction = movePct >= 0.4 && (movePct >= 1.2 || (row.preChgPct != null && row.preChgPct >= 1.5) || row.chg5m >= 0.7 || (row.rvolDaily >= 2.0 && row.chgPct >= 0.5));

      if (extHoldOk && !dilutionFail && notOverExtended && liqOk && hasBullTraction && row.rsi < 81) {
        let score = 42;
        score += (row.preBuyCheck?.passedCount || 0) * 5;
        const sweetMom = movePct <= 14 ? movePct * 1.45 : Math.max(4, 20 - (movePct - 14) * 0.9);
        score += clamp(sweetMom, 2, 22);
        score += Math.min(12, Math.max(0, (row.rvolDaily - 1) * 3));
        score += (row.floatShares > 0 && row.floatShares < 25e6) ? 7 : 0;
        score += (row.newsMeta?.bias === 'BULLISH' || row.newsMeta?.isHot) ? 10 : 0;
        score += (row.nearHod || (row.vwap > 0 && row.price >= row.vwap)) ? 7 : 0;
        score = Math.round(clamp(score, 50, 98));

        const prePass = Boolean(row.preBuyCheck?.allowBuy);
        const badge = prePass && score >= 76 ? 'STRONG BUY' : ((prePass || score >= 66) ? 'BUY' : 'BUY SETUP');
        const levels = computeProposalTradeLevels('BUY', row.price, row.vwap);
        const reasons = [];
        if (row.extType && extPct != null && extPct >= 1) {
          reasons.push(`${row.regChgPct <= -10 ? 'Revenire ' : ''}${row.extLabel} +${extPct.toFixed(1)}%`);
        } else {
          reasons.push(`Impuls ${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}%`);
        }
        if (row.rvolDaily >= 1.8) reasons.push(fmtRvolTag(row.rvolDaily));
        if (row.floatShares > 0 && row.floatShares < 25e6) reasons.push(`Float ${(row.floatShares / 1e6).toFixed(1)}M`);
        if (row.newsMeta?.isHot) reasons.push('Catalizator recent');
        else if (row.vwap > 0 && row.price >= row.vwap) reasons.push('Peste VWAP');

        buyCandidates.push({
          sym: row.sym,
          name: row.name,
          side: 'BUY',
          badge,
          score,
          price: row.price,
          regPrice: row.regPrice,
          regChgPct: row.regChgPct,
          extType: row.extType,
          extLabel: row.extLabel,
          extChgPct: row.extChgPct,
          movePct,
          moveLabel,
          regRefLabel,
          rvolDaily: row.rvolDaily,
          preBuyAllow: prePass,
          levels,
          reason: reasons.slice(0, 3).join(' · ') || 'Momentum pozitiv peste VWAP'
        });
      }
    }

    buyCandidates.sort((a, b) => b.score - a.score);
    sellCandidates.sort((a, b) => b.score - a.score);

    const topBuys = buyCandidates.slice(0, 5);
    const topSells = sellCandidates.slice(0, 5);
    const mixed = [];
    const seenMix = new Set();
    const maxLen = Math.max(topBuys.length, topSells.length);
    for (let i = 0; i < maxLen && mixed.length < 10; i++) {
      if (topBuys[i] && !seenMix.has(topBuys[i].sym)) {
        seenMix.add(topBuys[i].sym);
        mixed.push(topBuys[i]);
      }
      if (mixed.length < 10 && topSells[i] && !seenMix.has(topSells[i].sym)) {
        seenMix.add(topSells[i].sym);
        mixed.push(topSells[i]);
      }
    }
    for (const extra of [...buyCandidates.slice(5), ...sellCandidates.slice(5)]) {
      if (mixed.length >= 10) break;
      if (!seenMix.has(extra.sym)) {
        seenMix.add(extra.sym);
        mixed.push(extra);
      }
    }

    return {
      topProposals: mixed,
      buyProposals: buyCandidates.slice(0, 10),
      sellProposals: sellCandidates.slice(0, 10)
    };
  }

  async function fetchScannerCockpit(customSyms = [], forceRefresh = false) {
    const cacheKey = 'intel:cockpit:v3';
    if (!forceRefresh) {
      const hit = getCached(cacheKey, 10000);
      if (hit) return hit;
    }

    const sessionCtx = getMarketSessionContext();
    const cols = [
      'name', 'description', 'close', 'change', 'volume',
      'float_shares_outstanding', 'relative_volume_10d_calc',
      'relative_volume_intraday|5', 'change|5', 'high', 'VWAP',
      'premarket_close', 'premarket_change', 'premarket_high', 'premarket_volume', 'premarket_time',
      'postmarket_close', 'postmarket_change', 'postmarket_time',
      'total_shares_outstanding', 'market_cap_basic', 'RSI', 'bid', 'ask', 'time'
    ];

    const [lowFloatRows, topGainerRows, earlyMoverRows, squeeze5mRows, pillars5Rows, preMarketRows, sellLoserRows, extFadeRows, halts, mktOverview] = await Promise.all([
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1, 40] },
        { left: 'float_shares_outstanding', operation: 'less', right: 25000000 },
        { left: 'volume', operation: 'greater', right: 250000 },
        { left: 'change', operation: 'greater', right: 1 }
      ], 'change', 'desc', 20),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock', 'dr'] },
        { left: 'close', operation: 'in_range', right: [1, 300] },
        { left: 'volume', operation: 'greater', right: 350000 },
        { left: 'change', operation: 'greater', right: 2 }
      ], 'change', 'desc', 20),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1, 80] },
        { left: 'volume', operation: 'greater', right: 200000 },
        { left: 'relative_volume_10d_calc', operation: 'greater', right: 1.2 },
        { left: 'change', operation: 'in_range', right: [-2, 8] }
      ], 'relative_volume_intraday|5', 'desc', 18),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1, 100] },
        { left: 'volume', operation: 'greater', right: 200000 },
        { left: 'change|5', operation: 'greater', right: 1.2 }
      ], 'change|5', 'desc', 18),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1.5, 35] },
        { left: 'float_shares_outstanding', operation: 'less', right: 25000000 },
        { left: 'relative_volume_10d_calc', operation: 'greater', right: 2.5 },
        { left: 'volume', operation: 'greater', right: 400000 },
        { left: 'change', operation: 'greater', right: 3 }
      ], 'relative_volume_10d_calc', 'desc', 16),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1, 300] },
        { left: 'volume', operation: 'greater', right: 120000 },
        { left: 'premarket_change', operation: 'greater', right: 2 }
      ], 'premarket_change', 'desc', 16),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1, 250] },
        { left: 'volume', operation: 'greater', right: 300000 },
        { left: 'change', operation: 'less', right: -2 }
      ], 'change', 'asc', 16),
      tvScan(cols, [
        { left: 'type', operation: 'in_range', right: ['stock'] },
        { left: 'close', operation: 'in_range', right: [1, 300] },
        { left: 'volume', operation: 'greater', right: 250000 },
        { left: 'postmarket_change', operation: 'less', right: -2.5 }
      ], 'postmarket_change', 'asc', 14),
      fetchNasdaqHalts(),
      fetchMarketOverview(false)
    ]);

    const haltMap = new Map((halts || []).map(h => [h.sym, h]));

    // Ensure user watchlist US equities are also scanned live in Cockpit (including Pre-Market & BOATS Overnight)
    const customRows = [];
    const scannedSet = new Set([...lowFloatRows, ...topGainerRows, ...earlyMoverRows, ...squeeze5mRows, ...pillars5Rows, ...preMarketRows, ...sellLoserRows, ...extFadeRows].map(r => r.sym));
    for (const s of (customSyms || []).slice(0, 8)) {
      const up = String(s || '').toUpperCase().trim();
      if (up && isUsEquitySymbol(up) && !scannedSet.has(up)) {
        scannedSet.add(up);
        customRows.push({ sym: up, name: up, rawSym: up });
      }
    }

    // Enrich live quotes (Yahoo + TradingView Overnight BOATS + Pre/Post real-time)
    const allRawRows = [...customRows, ...preMarketRows, ...earlyMoverRows, ...pillars5Rows, ...extFadeRows, ...sellLoserRows, ...lowFloatRows, ...squeeze5mRows, ...topGainerRows];
    const allUniqueSyms = Array.from(new Set(allRawRows.map(r => r.sym))).slice(0, 72);
    const quoteMap = await fetchYahooQuoteBatch(allUniqueSyms);

    const priorityStructSyms = Array.from(new Set([
      ...squeeze5mRows.slice(0, 4).map(r => r.sym),
      ...pillars5Rows.slice(0, 4).map(r => r.sym),
      ...lowFloatRows.slice(0, 4).map(r => r.sym),
      ...sellLoserRows.slice(0, 3).map(r => r.sym)
    ])).slice(0, 14);

    const prioritySecSyms = Array.from(new Set([
      ...lowFloatRows.slice(0, 3).map(r => r.sym),
      ...extFadeRows.slice(0, 2).map(r => r.sym),
      ...topGainerRows.filter(r => safeNum(r.change, 0) >= 20).slice(0, 3).map(r => r.sym),
      ...pillars5Rows.slice(0, 2).map(r => r.sym)
    ])).slice(0, 8);

    const distinctNewsSyms = [];
    const seenS = new Set();
    for (const row of [...pillars5Rows, ...earlyMoverRows, ...extFadeRows, ...lowFloatRows, ...sellLoserRows, ...squeeze5mRows, ...topGainerRows, ...customRows]) {
      if (!seenS.has(row.sym)) {
        seenS.add(row.sym);
        distinctNewsSyms.push(row.sym);
      }
      if (distinctNewsSyms.length >= 14) break;
    }

    const [structSettled, secSettled, newsSettled] = await Promise.all([
      Promise.allSettled(priorityStructSyms.map(async s => ({ sym: s, data: await fetchYahooStructureSummary(s) }))),
      Promise.allSettled(prioritySecSyms.map(async s => ({ sym: s, data: await fetchSecFilings(s) }))),
      Promise.allSettled(distinctNewsSyms.map(async s => ({ sym: s, items: (await fetchNewsForSymbol(s)).slice(0, 3) })))
    ]);

    const structMap = new Map();
    for (const r of structSettled) if (r.status === 'fulfilled' && r.value?.data?.available) structMap.set(r.value.sym, r.value.data);
    const secMap = new Map();
    for (const r of secSettled) if (r.status === 'fulfilled' && r.value?.data?.available) secMap.set(r.value.sym, r.value.data);

    const symNewsAgeMap = {};
    const newsfeed = [];
    for (const r of newsSettled) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { sym, items } = r.value;
      if (items.length) {
        const minAgeH = items[0].ageHours;
        symNewsAgeMap[sym] = {
          ageHours: minAgeH,
          isHot: minAgeH <= 36,
          headline: items[0].title,
          bias: items[0].bias,
          category: items[0].category,
          catalystType: items[0].catalystType,
          isDilutionRisk: items[0].isDilutionRisk,
          publishedTimeEt: items[0].publishedTimeEt,
          publishedTimeRo: items[0].publishedTimeRo,
          link: items[0].link
        };
        for (const it of items) newsfeed.push({ sym, ...it });
      }
    }
    newsfeed.sort((a, b) => (b.publishedTs || 0) - (a.publishedTs || 0));

    const normRow = (r, extraTag = null) => {
      const q = quoteMap.get(r.sym) || {};
      const st = structMap.get(r.sym) || null;
      const secPack = secMap.get(r.sym) || null;
      const halt = haltMap.get(r.sym) || null;
      const newsMeta = symNewsAgeMap[r.sym] || null;

      const extInfo = resolveCockpitExtendedFields(q, r, sessionCtx);
      const close = extInfo.livePrice;
      const chg = extInfo.chgPct;
      const liveMovePct = extInfo.liveMovePct;

      const chg5 = safeNum(r['change|5'], 0);
      const rvol = safeNum(r.relative_volume_10d_calc, 1);
      const rvol5m = safeNum(r['relative_volume_intraday|5'], 0);
      const tvFlt = safeNum(r.float_shares_outstanding, null);
      const yfFlt = st?.floatShares ?? null;
      const flt = yfFlt ?? tvFlt;
      const volume = safeNum(q.regularMarketVolume, safeNum(r.volume, 0));
      const hi = safeNum(q.regularMarketDayHigh, safeNum(r.high, close));
      const vwapPx = safeNum(r.VWAP, close);
      const distVwapPct = vwapPx > 0 ? ((close - vwapPx) / vwapPx) * 100 : 0;
      const nearHod = hi > 0 && close >= hi * 0.985;

      const bidPx = safeNum(q.bid, safeNum(r.bid, null));
      const askPx = safeNum(q.ask, safeNum(r.ask, null));
      const rawSpr = (bidPx > 0 && askPx >= bidPx) ? ((askPx - bidPx) / ((askPx + bidPx) / 2)) * 100 : null;
      const spreadPct = rawSpr != null && (sessionCtx.isRegular || rawSpr <= 6.0) ? Number(clamp(rawSpr, 0, 25).toFixed(2)) : null;

      const dataQuality = auditDataQuality({
        sym: r.sym,
        chgPct: liveMovePct,
        sessionCtx,
        volume,
        price: close,
        rvolDaily: rvol,
        rvol5m,
        floatShares: flt,
        yfFloatShares: yfFlt,
        tvFloatShares: tvFlt,
        spreadPct,
        rawSpreadPct: rawSpr
      });

      const preBuyCheck = evaluatePreBuySafetyChecks({
        sym: r.sym,
        price: close,
        chgPct: liveMovePct,
        distVwapPct,
        volume,
        rvol5m,
        floatShares: flt,
        yfFloatShares: yfFlt,
        tvFloatShares: tvFlt,
        spreadPct,
        newsMeta,
        secPack,
        halt,
        sessionCtx,
        dataQuality
      });

      const siPct = st?.shortPctFloat ?? null;
      const siRatio = st?.shortRatio ?? null;
      let strategy = extraTag || 'Low Float - High Rel Vol';
      let stratTone = 'green';
      let setupType = 'MOMENTUM';
      if (chg5 >= 3.5 && ((siPct != null && siPct >= 12) || (siRatio != null && siRatio >= 2.5))) {
        setupType = 'SHORT_SQUEEZE';
        strategy = `Short Squeeze · SI ${siPct != null ? siPct + '%' : siRatio + 'z'} · +${chg5.toFixed(1)}% (5m)`;
        stratTone = 'purple';
      } else if (chg5 >= 5) {
        setupType = 'MOMENTUM_SURGE';
        strategy = siPct != null
          ? `Momentum 5m Surge · +${chg5.toFixed(1)}% (SI ${siPct}%)`
          : `Momentum 5m Surge · +${chg5.toFixed(1)}% (Fără conf. Short)`;
        stratTone = 'amber';
      } else if (chg5 >= 1.5 && (flt == null || flt < 25000000)) {
        setupType = 'RUNNING_UP';
        strategy = `Running Up · +${chg5.toFixed(1)}% (5m)`;
        stratTone = 'cyan';
      } else if (nearHod && rvol >= 3) {
        setupType = 'HOD_BREAKOUT';
        strategy = 'High of Day Breakout · Rel Vol 3x+';
        stratTone = 'amber';
      } else if (extraTag === 'Early Mover') {
        setupType = 'EARLY_MOVER';
        strategy = `Early Mover · Vol 5m ${dataQuality.rvol5mReliable ? rvol5m.toFixed(1) + 'x' : 'Anomalie'}`;
        stratTone = 'green';
      }

      const fivePillarsDetail = computeFivePillarsBreakdown({
        rvolDaily: rvol,
        chgPct: liveMovePct,
        floatShares: flt,
        shortPctFloat: siPct,
        shortRatio: siRatio,
        rvol5m,
        newsMeta
      });

      const rsiVal = safeNum(r.RSI, 50);
      const postSpikeDump = extInfo.regChgPct >= 10 && extInfo.extChgPct != null && extInfo.extChgPct <= -2.5;
      let cpAction = 'WAIT';
      let cpBadge = 'AȘTEAPTĂ';
      let cpTone = 'wait';
      let cpReason = 'Urmărește confirmarea pe 5m și VWAP.';
      if (halt) {
        cpBadge = 'HALT LULD';
        cpReason = `Oprit la tranzacționare (${halt.code || 'HALT'}): ${halt.explanation || ''}`;
      } else if (postSpikeDump || (liveMovePct <= -2 && (chg5 <= 0 || !sessionCtx.isRegular))) {
        cpAction = 'SELL';
        cpBadge = 'SELL';
        cpTone = 'sell';
        cpReason = postSpikeDump
          ? `Fade ${extInfo.extLabel} (${extInfo.extChgPct.toFixed(2)}% vs înch. $${extInfo.regPrice.toFixed(2)}) · SL ~$${(close * 1.04).toFixed(2)} · Țintă ~$${(close * 0.92).toFixed(2)}`
          : `Presiune vânzare (${liveMovePct.toFixed(2)}%) · SL ~$${(close * 1.04).toFixed(2)} · Țintă ~$${(close * 0.92).toFixed(2)}`;
      } else if (liveMovePct >= 2 && (chg5 >= 0.4 || nearHod || (!sessionCtx.isRegular && liveMovePct >= 3)) && rvol5m >= 1.2 && rsiVal < 82) {
        if (!preBuyCheck.allowBuy) {
          cpAction = 'WAIT';
          cpBadge = preBuyCheck.isOverExtended ? 'SUPRA-EXTINS' : 'BLOCAT PRE-BUY';
          cpTone = 'wait';
          cpReason = `BUY blocat de Pre-BUY Gate (${preBuyCheck.passedCount}/${preBuyCheck.totalChecks}): ${preBuyCheck.blockers.join(' · ')}`;
        } else {
          cpAction = liveMovePct >= 12 && nearHod && rvol5m >= 3 ? 'STRONG BUY' : 'BUY';
          cpBadge = cpAction;
          cpTone = cpAction === 'STRONG BUY' ? 'strong-buy' : 'buy';
          cpReason = `Validat Pre-BUY (${preBuyCheck.passedCount}/${preBuyCheck.totalChecks}) · SL ~$${(close * 0.96).toFixed(2)} · Țintă ~$${(close * 1.085).toFixed(2)}`;
        }
      } else if (preBuyCheck.isOverExtended) {
        cpBadge = 'SUPRA-EXTINS';
        cpReason = `Mișcare deja întinsă (+${liveMovePct.toFixed(1)}%) — risc FOMO ridicat; așteaptă retragere la VWAP.`;
      }

      const rvol5mDisplay = !Number.isFinite(rvol5m) || rvol5m <= 0
        ? '—'
        : (!dataQuality.rvol5mReliable ? `${rvol5m.toFixed(0)}x (!)` : `${rvol5m.toFixed(1)}x`);

      return {
        sym: r.sym,
        name: String(q.shortName || r.description || r.sym),
        price: close,
        regPrice: extInfo.regPrice,
        regChgPct: extInfo.regChgPct,
        extType: extInfo.extType,
        extLabel: extInfo.extLabel,
        extPrice: extInfo.extPrice,
        extChgPct: extInfo.extChgPct,
        extTime: extInfo.extTime,
        preVolume: extInfo.preVolume,
        chgPct: chg,
        liveMovePct,
        chg5m: chg5,
        volume,
        dollarVolume: Math.round(close * volume),
        floatShares: flt,
        yfFloatShares: yfFlt,
        tvFloatShares: tvFlt,
        sharesOut: safeNum(r.total_shares_outstanding, null),
        mcap: safeNum(r.market_cap_basic, null),
        rvolDaily: Number(rvol.toFixed(2)),
        rvol5m: Number(rvol5m.toFixed(1)),
        rvol5mDisplay,
        preChgPct: extInfo.preChgPct,
        pmHigh: extInfo.pmHigh,
        high: hi,
        vwap: Number(vwapPx.toFixed(4)),
        distVwapPct: Number(distVwapPct.toFixed(2)),
        rsi: rsiVal,
        bid: bidPx,
        ask: askPx,
        spreadPct,
        shortPctFloat: siPct,
        shortRatio: siRatio,
        setupType,
        strategy,
        stratTone,
        nearHod,
        dataQuality,
        preBuyCheck,
        fivePillarsDetail,
        halt,
        newsMeta,
        verdict: {
          action: cpAction,
          shortBadge: cpBadge,
          tone: cpTone,
          summary: cpReason
        }
      };
    };

    const lowFloat = lowFloatRows.map(r => normRow(r, 'Low Float Top Gainer'));
    const topGainers = topGainerRows.map(r => normRow(r, 'Top Gainer US'));
    const earlyMovers = earlyMoverRows.map(r => normRow(r, 'Early Mover'));
    const fivePillars = pillars5Rows.map(r => normRow(r, '5 Pillars Match'));
    const squeezeAlerts = squeeze5mRows.map(r => normRow(r));
    const sellLosers = sellLoserRows.map(r => normRow(r, 'Breakdown / SELL'));
    const extFades = extFadeRows.map(r => normRow(r, 'Fade Extended'));
    const customNorm = customRows.map(r => normRow(r, 'Watchlist'));

    // In Pre-Market, prioritize rows actually moving positively in Pre-Market!
    const preMoversNorm = preMarketRows
      .map(r => normRow(r, 'Pre-Market Mover'))
      .filter(r => r.extType === 'PRE' && (r.extChgPct ?? 0) > 1);

    if (sessionCtx.isPreMarket && preMoversNorm.length) {
      const mergedTop = [];
      const seenTop = new Set();
      for (const item of [...preMoversNorm, ...topGainers].sort((a, b) => (b.liveMovePct || 0) - (a.liveMovePct || 0))) {
        if (!seenTop.has(item.sym)) {
          seenTop.add(item.sym);
          mergedTop.push(item);
        }
      }
      topGainers.splice(0, topGainers.length, ...mergedTop.slice(0, 22));
    }

    const { topProposals, buyProposals, sellProposals } = buildTop10CockpitProposals(
      [...preMoversNorm, ...earlyMovers, ...fivePillars, ...lowFloat, ...squeezeAlerts, ...extFades, ...sellLosers, ...topGainers, ...customNorm],
      sessionCtx
    );

    const out = {
      ok: true,
      sessionCtx,
      updatedAt: new Date().toISOString(),
      updatedTimeRo: nowTimeRo(),
      updatedTimeEt: sessionCtx.timeEt,
      source: 'TradingView US + BOATS Overnight + Yahoo L1 Quote/Short + SEC EDGAR + NASDAQ Halts + Știri',
      marketRegime: mktOverview.regime,
      topProposals,
      buyProposals,
      sellProposals,
      sellSetups: [...extFades, ...sellLosers, ...customNorm].slice(0, 28),
      earlyMovers,
      lowFloat,
      topGainers,
      fivePillars,
      squeezeAlerts,
      halts,
      newsfeed: newsfeed.slice(0, 32)
    };

    setCached(cacheKey, out);
    return out;
  }

  // ─── 10. MULTI-TENANT REAL PORTFOLIO AUGMENTATION & RISK ADVISOR ──────────
  function calcDailyTechLevels(bars, spotPrice) {
    if (!Array.isArray(bars) || bars.length < 5) {
      return {
        sma20: null, sma50: null, sma200: null, rsi14: null, atr14: null, atrPct: null,
        support1: null, support2: null, resistance1: null, resistance2: null,
        high52w: null, off52wHighPct: null, trend: 'NECUNOSCUT'
      };
    }
    const closes = bars.map(b => b.close).filter(v => Number.isFinite(v) && v > 0);
    const avgTail = (arr, n) => arr.length >= n
      ? arr.slice(-n).reduce((s, v) => s + v, 0) / n
      : null;
    const sma20 = avgTail(closes, 20);
    const sma50 = avgTail(closes, 50);
    const sma200 = avgTail(closes, 200);

    let rsi14 = null;
    if (closes.length >= 15) {
      let gains = 0, losses = 0;
      const start = Math.max(1, closes.length - 14);
      for (let i = start; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d;
        else losses -= d;
      }
      const avgG = gains / 14;
      const avgL = losses / 14;
      rsi14 = avgL === 0 ? 100 : 100 - (100 / (1 + avgG / avgL));
    }

    let atr14 = null;
    if (bars.length >= 15) {
      const trs = [];
      for (let i = Math.max(1, bars.length - 14); i < bars.length; i++) {
        const b = bars[i], p = bars[i - 1];
        const tr = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
        if (Number.isFinite(tr)) trs.push(tr);
      }
      if (trs.length) atr14 = trs.reduce((s, v) => s + v, 0) / trs.length;
    }

    const spot = Number.isFinite(spotPrice) && spotPrice > 0 ? spotPrice : closes[closes.length - 1];
    const atrPct = (atr14 != null && spot > 0) ? (atr14 / spot) * 100 : null;
    const w20 = bars.slice(-20);
    const w60 = bars.slice(-60);
    const low20 = Math.min(...w20.map(b => b.low));
    const low60 = Math.min(...w60.map(b => b.low));
    const high20 = Math.max(...w20.map(b => b.high));
    const high60 = Math.max(...w60.map(b => b.high));
    const high52w = Math.max(...bars.map(b => b.high));
    const off52wHighPct = high52w > 0 ? ((spot - high52w) / high52w) * 100 : null;

    let trend = 'CONSOLIDARE';
    if (sma20 && sma50 && spot > sma20 && sma20 > sma50) trend = 'ASCENDENT';
    else if (sma50 && spot < sma50 && (!sma20 || spot < sma20)) trend = 'DESCENDENT';
    else if (sma20 && spot > sma20 && sma50 && spot < sma50) trend = 'REBOUND SUB SMA50';

    const resCandidates = [sma20, sma50, high20, high60].filter(v => Number.isFinite(v) && v > spot * 1.015).sort((a, b) => a - b);
    return {
      sma20,
      sma50,
      sma200,
      rsi14,
      atr14,
      atrPct,
      support1: Number.isFinite(low20) ? low20 : null,
      support2: Number.isFinite(low60) ? low60 : null,
      resistance1: resCandidates[0] || (Number.isFinite(high20) ? high20 : null),
      resistance2: resCandidates[1] || (Number.isFinite(high60) ? high60 : null),
      high52w: Number.isFinite(high52w) ? high52w : null,
      off52wHighPct,
      trend
    };
  }

  function formatCompactPx(v) {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 100) return v.toFixed(2);
    if (Math.abs(v) >= 1) return v.toFixed(2);
    if (Math.abs(v) >= 0.01) return v.toFixed(4);
    return v.toFixed(6);
  }

  function buildLotInsights(asset, livePrice) {
    const lots = Array.isArray(asset.lots) ? asset.lots : [];
    const cur = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : (asset.brokerPrice || asset.avgOpen);
    return lots.map((l) => {
      const sign = l.side === 'SHORT' ? -1 : 1;
      const lotLivePnl = cur > 0 ? l.units * (cur - l.open) * sign : (l.brokerPnl ?? 0);
      const slDistPct = (l.sl && cur > 0)
        ? (sign > 0 ? ((cur - l.sl) / cur) * 100 : ((l.sl - cur) / cur) * 100)
        : null;
      const tpUpsidePct = (l.tp && cur > 0)
        ? (sign > 0 ? ((l.tp - cur) / cur) * 100 : ((cur - l.tp) / cur) * 100)
        : null;
      const breakevenNeedPct = (l.open > 0 && cur > 0)
        ? (sign > 0 ? Math.max(0, ((l.open - cur) / cur) * 100) : Math.max(0, ((cur - l.open) / cur) * 100))
        : 0;

      let riskState = 'OK';
      let hint = 'Menține supravegherea nivelurilor tehnice.';
      if (slDistPct !== null && slDistPct <= 0) {
        riskState = 'CRITICAL_SL';
        hint = `Prețul (${formatCompactPx(cur)}) a depășit SL (${formatCompactPx(l.sl)}) — risc iminent de execuție/lichidare!`;
      } else if (slDistPct !== null && slDistPct <= 4.0) {
        riskState = 'CRITICAL_SL';
        hint = `Critic: SL la ${formatCompactPx(l.sl)} este la doar ${slDistPct.toFixed(2)}% distanță — un singur wick îl declanșează.`;
      } else if (slDistPct !== null && slDistPct <= 11.0) {
        riskState = 'NEAR_SL';
        hint = `SL la ${formatCompactPx(l.sl)} (${slDistPct.toFixed(1)}% buffer); verifică dacă stă sub suport real.`;
      } else if (!l.sl && l.isCfd) {
        riskState = 'NO_SL';
        hint = 'CFD fără SL setat explicit — adaugă protecție sub suport ca să limitezi apelul în marjă.';
      } else if (breakevenNeedPct <= 15 && breakevenNeedPct > 0) {
        hint = `Lot recent cel mai aproape de breakeven (+${breakevenNeedPct.toFixed(1)}% până la ${formatCompactPx(l.open)}) — candidat bun de marcare / reducere expunere pe rebound.`;
      } else if (breakevenNeedPct >= 150 && l.isCfd) {
        hint = `Lot vechi adânc în pierdere (necesită +${Math.round(breakevenNeedPct)}% la open) cu taxă CFD zilnică — redu parțial pe rally-uri spre rezistență.`;
      } else if (lotLivePnl > 0) {
        hint = 'Lot pe profit — mută SL la breakeven sau folosește trailing stop sub ultimul swing low.';
      }

      return {
        ...l,
        livePnl: Number(lotLivePnl.toFixed(2)),
        slDistPct: slDistPct !== null ? Number(slDistPct.toFixed(2)) : null,
        tpUpsidePct: tpUpsidePct !== null ? Number(tpUpsidePct.toFixed(2)) : null,
        breakevenNeedPct: Number(breakevenNeedPct.toFixed(1)),
        riskState,
        hint
      };
    });
  }

  function classifyAndRecommendAsset({
    asset, livePrice, livePnl, livePnlPct, netValue, notionalValue, concentrationPct,
    tech, sec, opt, struct, lotInsights
  }) {
    const reasons = [];
    const critSlLots = lotInsights.filter(l => l.riskState === 'CRITICAL_SL');
    const cfdCount = lotInsights.filter(l => l.isCfd).length + (lotInsights.length === 0 && asset.isCfd ? 1 : 0);
    const hasNoSlCfd = lotInsights.some(l => l.riskState === 'NO_SL') || (!lotInsights.length && asset.isCfd && !asset.sl);
    const singleSlDist = (asset.sl && livePrice > 0) ? (((livePrice - asset.sl) / livePrice) * 100) : null;
    const minSlDist = lotInsights.reduce((m, l) => (l.slDistPct !== null && (m === null || l.slDistPct < m)) ? l.slDistPct : m, singleSlDist);
    const isZombie = netValue < 20 && livePnlPct <= -92;

    const atrBuf = tech.atr14 ? Math.max(livePrice * 0.04, Math.min(livePrice * 0.45, tech.atr14 * 1.35)) : livePrice * 0.08;
    const structSupport = [tech.support1, tech.support2, opt?.putWall?.strike].filter(v => Number.isFinite(v) && v > 0 && v < livePrice).sort((a, b) => b - a)[0];
    const rawSl = structSupport ? Math.min(structSupport * 0.985, livePrice - atrBuf) : (livePrice - atrBuf);
    const suggestedSl = Math.max(livePrice * 0.18, rawSl);
    const trimZone = [tech.resistance1, opt?.callWall?.strike, tech.sma50].filter(v => Number.isFinite(v) && v > livePrice * 1.03).sort((a, b) => a - b)[0] || livePrice * 1.12;
    const target2 = tech.resistance2 || (trimZone * 1.15);

    if (critSlLots.length > 0) {
      reasons.push(
        `${critSlLots.length}/${lotInsights.length} loturi au Stop-Loss critic (buffer minim ${(minSlDist ?? 0).toFixed(2)}% — mai mic decât volatilitatea zilnică ATR ${tech.atrPct ? tech.atrPct.toFixed(1) + '%' : 'uzuală'}).`
      );
    } else if (minSlDist !== null && minSlDist <= 13) {
      reasons.push(`Cel mai apropiat SL este la ${minSlDist.toFixed(1)}% sub prețul live ($${formatCompactPx(livePrice)}).`);
    }
    if (cfdCount > 0) {
      const levX = netValue > 0 ? (notionalValue / netValue) : 1;
      reasons.push(`Structură CFD (${cfdCount} ${cfdCount === 1 ? 'lot' : 'loturi'}, levier efectiv ~${levX.toFixed(1)}x pe valoarea netă actuală) — suportă costuri overnight zilnice.`);
    }
    if (concentrationPct >= 20) {
      reasons.push(`Concentrare foarte mare: reprezintă ${concentrationPct.toFixed(1)}% din valoarea netă a pozițiilor afișate.`);
    }
    if (tech.trend !== 'NECUNOSCUT') {
      const rsiTxt = tech.rsi14 != null ? `, RSI(14) = ${tech.rsi14.toFixed(1)}` : '';
      const smaTxt = tech.sma50 != null ? `, SMA50 = $${formatCompactPx(tech.sma50)}` : '';
      reasons.push(`Tehnic zilnic: trend ${tech.trend}${rsiTxt}${smaTxt}. Suport cheie ~$${formatCompactPx(tech.support1)}, rezistență ~$${formatCompactPx(trimZone)}.`);
    }
    if (sec?.dilutionRisk && sec.dilutionRisk !== 'NECUNOSCUT' && sec.dilutionRisk !== 'N/A') {
      if (sec.dilutionRisk === 'RIDICAT') {
        reasons.push(`Risc SEC de diluție RIDICAT (${sec.dilutionHits180?.length || 1} raportări S-3/424B recente) — reduce pe creșteri rapide.`);
      }
    }
    if (opt?.available && (opt.putWall?.strike || opt.callWall?.strike)) {
      reasons.push(`Opțiuni CBOE: Put Wall $${opt.putWall?.strike ?? '—'} · Call Wall $${opt.callWall?.strike ?? '—'} · Max Pain $${opt.maxPain ? formatCompactPx(opt.maxPain) : '—'}.`);
    }
    if (struct?.nextEarnings) {
      reasons.push(`Următorul raport Earnings estimat: ${struct.nextEarnings} (atenție la risc de gap peste SL).`);
    }

    let actionBadge = 'MONITORIZEAZĂ';
    let severity = 'neutral';
    let headline = `Păstrează cu monitorizare spre $${formatCompactPx(trimZone)}`;

    if (isZombie) {
      actionBadge = 'CURĂȚĂ REZIDUAL';
      severity = 'warn';
      headline = `Valoare rămasă minusculă ($${netValue.toFixed(2)}, ${livePnlPct.toFixed(1)}%) — ocupă spațiu mental / tax-loss harvest`;
    } else if (critSlLots.length > 0 || (singleSlDist !== null && singleSlDist <= 4)) {
      actionBadge = 'URGENT SL / MARJĂ';
      severity = 'critical';
      headline = `Pericol iminent de Stop-Out la ${(minSlDist ?? singleSlDist ?? 0).toFixed(2)}% distanță! Mută SL sub $${formatCompactPx(suggestedSl)} sau taie parțial loturile slabe.`;
    } else if (concentrationPct >= 25 && livePnlPct <= -50) {
      actionBadge = 'REDUCE PE REBOUND';
      severity = 'warn';
      headline = `Supraponderat (${concentrationPct.toFixed(1)}% din capital) și adânc sub open — eliberează treptat 20–35% spre $${formatCompactPx(trimZone)}.`;
    } else if (hasNoSlCfd) {
      actionBadge = 'ADAUGĂ SL';
      severity = 'warn';
      headline = `Poziție fără Stop-Loss explicit — setează protecție de invalidare sub $${formatCompactPx(suggestedSl)}.`;
    } else if (livePnlPct >= 15) {
      actionBadge = 'TRAIL / PROFIT';
      severity = 'good';
      headline = `Poziție profitabilă — protejează câștigul cu trailing SL spre $${formatCompactPx(suggestedSl)} și țintă parțială $${formatCompactPx(trimZone)}.`;
    } else if (tech.rsi14 != null && tech.rsi14 <= 34 && livePnlPct < 0) {
      actionBadge = 'SUPRAVÂNDUT · AȘTEAPTĂ REBOUND';
      severity = 'neutral';
      headline = `RSI scăzut (${tech.rsi14.toFixed(0)}) lângă suport $${formatCompactPx(tech.support1)} — evită vânzarea în panică dacă SL rezistă; evaluează reducere la $${formatCompactPx(trimZone)}.`;
    }

    return {
      actionBadge,
      severity,
      headline,
      reasons,
      levels: {
        suggestedSl: Number(suggestedSl.toFixed(livePrice >= 1 ? 2 : 4)),
        trimZone: Number(trimZone.toFixed(livePrice >= 1 ? 2 : 4)),
        target2: Number(target2.toFixed(livePrice >= 1 ? 2 : 4)),
        invalidation: tech.support2 ? Number(tech.support2.toFixed(livePrice >= 1 ? 2 : 4)) : null
      }
    };
  }

  async function evaluateRealPortfolio(rawPortfolio) {
    const assets = Array.isArray(rawPortfolio?.assets) ? rawPortfolio.assets : [];
    const sessionCtx = getMarketSessionContext();
    const mktOverview = await fetchMarketOverview(false).catch(() => null);
    if (!assets.length) {
      return {
        ok: true,
        empty: true,
        sessionCtx,
        updatedTimeRo: nowTimeRo(),
        marketRegime: mktOverview?.regime || null,
        healthScore: 100,
        healthLabel: 'FĂRĂ POZIȚII ACTIVE',
        totals: {
          assetsCount: 0, totalLotsCount: 0, cfdLotsCount: 0, totalInvestedMargin: 0,
          totalNotional: 0, totalNetValue: 0, cashAvailable: rawPortfolio?.cashAvailable ?? null,
          totalAccountEquity: rawPortfolio?.cashAvailable ?? 0, totalLivePnl: 0, totalLivePnlPct: 0,
          totalDailyPnl: 0, effectiveLeverage: 1, top2ConcentrationPct: 0, criticalSlLotsTotal: 0, zombieAssetsCount: 0
        },
        priorityActions: [],
        evaluatedAssets: []
      };
    }

    const uniqueSyms = Array.from(new Set(assets.map(a => String(a.sym || a.brokerSym || '').trim().toUpperCase()).filter(Boolean)));
    const quoteMap = await fetchYahooQuoteBatch(uniqueSyms);

    const perSymIntel = new Map();
    await Promise.all(uniqueSyms.map(async (sym) => {
      const ck = `pf:sym:${sym}`;
      const cached = getCached(ck, 45000);
      if (cached) {
        perSymIntel.set(sym, cached);
        return;
      }
      const isEquity = isUsEquityTicker(sym);
      const q = quoteMap.get(sym) || {};
      const spotHint = finiteNum(q.regularMarketPrice, null);
      const [dailyPack, secPack, optPack, structPack, newsList] = await Promise.all([
        fetchYahooBars(sym, '1d', '1y', false).catch(() => ({ bars: [], meta: null })),
        isEquity ? fetchSecFilings(sym).catch(() => ({ available: false, dilutionRisk: 'N/A' })) : Promise.resolve({ available: false, dilutionRisk: 'N/A' }),
        isEquity ? fetchCboeOptionsIntel(sym, spotHint).catch(() => ({ available: false })) : Promise.resolve({ available: false }),
        isEquity ? fetchYahooStructureSummary(sym).catch(() => ({ available: false })) : Promise.resolve({ available: false }),
        fetchNewsForSymbol(sym).catch(() => [])
      ]);
      const tech = calcDailyTechLevels(dailyPack.bars || [], spotHint);
      const pack = {
        dailyMeta: dailyPack.meta || null,
        tech,
        sec: secPack,
        opt: optPack,
        struct: structPack,
        news: Array.isArray(newsList) ? newsList.slice(0, 2) : []
      };
      setCached(ck, pack);
      perSymIntel.set(sym, pack);
    }));

    const prelimRows = assets.map((asset) => {
      const sym = String(asset.sym || asset.brokerSym || '').toUpperCase();
      const q = quoteMap.get(sym) || {};
      const intelPack = perSymIntel.get(sym) || {};
      const mktState = String(q.marketState || '').toUpperCase();
      const regPrice = finiteNum(q.regularMarketPrice, finiteNum(intelPack.dailyMeta?.regularMarketPrice, asset.brokerPrice ?? asset.avgOpen));
      const extPrice = mktState === 'PRE'
        ? finiteNum(q.preMarketPrice, null)
        : ((mktState === 'POST' || mktState === 'POSTPOST' || mktState === 'PREPRE' || mktState === 'CLOSED')
          ? finiteNum(q.overnightPrice, finiteNum(q.postMarketPrice, null))
          : null);
      const livePrice = (mktState !== 'REGULAR' && Number.isFinite(extPrice) && extPrice > 0) ? extPrice : regPrice;
      const prevClose = finiteNum(q.regularMarketPreviousClose, livePrice);
      const sign = asset.side === 'SHORT' ? -1 : 1;

      const units = Number(asset.units) || 0;
      const avgOpen = Number(asset.avgOpen) || 0;
      const livePnl = units * (livePrice - avgOpen) * sign;
      const notionalValue = units * livePrice;

      let investedCapital = finiteNum(asset.invested, null);
      if (investedCapital === null && asset.brokerNetValue != null && asset.brokerPnl != null) {
        const diff = Number(asset.brokerNetValue) - Number(asset.brokerPnl);
        if (Number.isFinite(diff) && diff > 0) investedCapital = diff;
      }
      if (investedCapital === null && asset.brokerPnl != null && asset.brokerPnlPct != null && Math.abs(asset.brokerPnlPct) > 0.25 && Math.abs(asset.brokerPnlPct) < 99.5) {
        const inf = Math.abs(Number(asset.brokerPnl) / (Number(asset.brokerPnlPct) / 100));
        if (Number.isFinite(inf) && inf > 0) investedCapital = inf;
      }
      if (investedCapital === null) investedCapital = units * avgOpen;

      const isLeveraged = asset.isCfd || (asset.lots || []).some(l => l.isCfd) || (units * avgOpen > investedCapital * 1.15);
      const netValue = isLeveraged
        ? Math.max(0, investedCapital + livePnl)
        : Math.max(0, asset.brokerNetValue != null && Math.abs(livePrice - (asset.brokerPrice || livePrice)) < 1e-4 ? asset.brokerNetValue : notionalValue);
      const livePnlPct = investedCapital > 0
        ? (livePnl / investedCapital) * 100
        : (avgOpen > 0 ? ((livePrice - avgOpen) / avgOpen) * 100 * sign : 0);
      const dailyPnl = units * (livePrice - (prevClose || livePrice)) * sign;
      const dayChgPct = finiteNum(q.regularMarketChangePercent, prevClose > 0 ? ((livePrice - prevClose) / prevClose) * 100 : 0);

      return {
        asset, sym, q, intelPack, mktState, regPrice, extPrice, livePrice, dayChgPct,
        units, avgOpen, livePnl, livePnlPct, dailyPnl, notionalValue, investedCapital, netValue
      };
    });

    const totalNetPositionsValue = prelimRows.reduce((s, r) => s + Math.max(0, r.netValue), 0);
    const totalInvestedMargin = prelimRows.reduce((s, r) => s + Math.max(0, r.investedCapital), 0);
    const totalNotional = prelimRows.reduce((s, r) => s + Math.max(0, r.notionalValue), 0);
    const totalLivePnl = prelimRows.reduce((s, r) => s + r.livePnl, 0);
    const totalDailyPnl = prelimRows.reduce((s, r) => s + r.dailyPnl, 0);
    const totalLivePnlPct = totalInvestedMargin > 0 ? (totalLivePnl / totalInvestedMargin) * 100 : 0;

    const evaluatedAssets = prelimRows.map((r) => {
      const concentrationPct = totalNetPositionsValue > 0 ? (r.netValue / totalNetPositionsValue) * 100 : 0;
      const lotInsights = buildLotInsights(r.asset, r.livePrice);
      const critLots = lotInsights.filter(l => l.riskState === 'CRITICAL_SL').length;
      const singleSlDist = (r.asset.sl && r.livePrice > 0) ? (((r.livePrice - r.asset.sl) / r.livePrice) * 100) : null;
      const minSlDistPct = lotInsights.reduce((m, l) => (l.slDistPct !== null && (m === null || l.slDistPct < m)) ? l.slDistPct : m, singleSlDist);
      const rec = classifyAndRecommendAsset({
        asset: r.asset,
        livePrice: r.livePrice,
        livePnl: r.livePnl,
        livePnlPct: r.livePnlPct,
        netValue: r.netValue,
        notionalValue: r.notionalValue,
        concentrationPct,
        tech: r.intelPack.tech || {},
        sec: r.intelPack.sec || {},
        opt: r.intelPack.opt || {},
        struct: r.intelPack.struct || {},
        lotInsights
      });

      return {
        id: r.asset.id,
        brokerSym: r.asset.brokerSym,
        sym: r.sym,
        name: r.asset.name || r.q.shortName || r.q.longName || r.sym,
        side: r.asset.side,
        isCfd: r.asset.isCfd || lotInsights.some(l => l.isCfd) || (r.units * r.avgOpen > r.investedCapital * 1.15),
        is24_5: r.asset.is24_5,
        is24_7: r.asset.is24_7,
        units: r.units,
        avgOpen: r.avgOpen,
        livePrice: Number(r.livePrice.toFixed(r.livePrice >= 1 ? 4 : 6)),
        regPrice: Number(r.regPrice.toFixed(r.regPrice >= 1 ? 4 : 6)),
        extPrice: r.extPrice !== null ? Number(r.extPrice.toFixed(r.extPrice >= 1 ? 4 : 6)) : null,
        mktState: r.mktState || 'UNKNOWN',
        dayChgPct: Number((r.dayChgPct || 0).toFixed(2)),
        investedCapital: Number(r.investedCapital.toFixed(2)),
        notionalValue: Number(r.notionalValue.toFixed(2)),
        netValue: Number(r.netValue.toFixed(2)),
        livePnl: Number(r.livePnl.toFixed(2)),
        livePnlPct: Number(r.livePnlPct.toFixed(2)),
        dailyPnl: Number(r.dailyPnl.toFixed(2)),
        concentrationPct: Number(concentrationPct.toFixed(1)),
        breakevenGainPct: r.livePrice > 0 && r.avgOpen > r.livePrice && r.asset.side === 'LONG'
          ? Number((((r.avgOpen - r.livePrice) / r.livePrice) * 100).toFixed(1))
          : 0,
        lotsCount: lotInsights.length,
        criticalSlLotsCount: critLots,
        minSlDistPct: minSlDistPct !== null ? Number(minSlDistPct.toFixed(2)) : null,
        lotInsights,
        tech: r.intelPack.tech || null,
        sec: r.intelPack.sec || null,
        options: r.intelPack.opt || null,
        structure: r.intelPack.struct || null,
        news: r.intelPack.news || [],
        recommendation: rec
      };
    }).sort((a, b) => Math.abs(b.notionalValue) - Math.abs(a.notionalValue));

    const sortedByNet = [...evaluatedAssets].sort((a, b) => b.netValue - a.netValue);
    const top2ConcentrationPct = totalNetPositionsValue > 0
      ? ((sortedByNet.slice(0, 2).reduce((s, x) => s + x.netValue, 0) / totalNetPositionsValue) * 100)
      : 0;
    const totalLotsCount = evaluatedAssets.reduce((s, a) => s + Math.max(1, a.lotsCount), 0);
    const cfdLotsCount = evaluatedAssets.reduce((s, a) => s + (a.lotsCount ? a.lotInsights.filter(l => l.isCfd).length : (a.isCfd ? 1 : 0)), 0);
    const criticalSlAssets = evaluatedAssets.filter(a => a.criticalSlLotsCount > 0 || (a.minSlDistPct !== null && a.minSlDistPct <= 4));
    const criticalSlLotsTotal = evaluatedAssets.reduce((s, a) => s + a.criticalSlLotsCount, 0);
    const zombieAssetsCount = evaluatedAssets.filter(a => a.netValue < 20 && a.livePnlPct <= -92).length;
    const dilutionRiskAssets = evaluatedAssets.filter(a => a.sec?.dilutionRisk === 'RIDICAT').map(a => a.sym);
    const effectiveLeverage = totalNetPositionsValue > 0 ? (totalNotional / totalNetPositionsValue) : 1;

    let healthScore = 88;
    if (criticalSlAssets.length > 0) healthScore -= Math.min(34, criticalSlAssets.length * 16 + criticalSlLotsTotal);
    if (top2ConcentrationPct >= 65) healthScore -= 18;
    else if (top2ConcentrationPct >= 45) healthScore -= 10;
    if (effectiveLeverage >= 2.2) healthScore -= 16;
    else if (effectiveLeverage >= 1.4) healthScore -= 8;
    if (totalLivePnlPct <= -50) healthScore -= 15;
    else if (totalLivePnlPct <= -20) healthScore -= 8;
    if (zombieAssetsCount > 0) healthScore -= Math.min(10, zombieAssetsCount * 3);
    if (dilutionRiskAssets.length > 0) healthScore -= Math.min(12, dilutionRiskAssets.length * 6);
    healthScore = Math.max(5, Math.min(100, Math.round(healthScore)));

    const healthLabel = healthScore <= 35
      ? 'CRITIC · Acțiune Imediată'
      : healthScore <= 55
        ? 'RISC RIDICAT · Necesită Rebalansare'
        : healthScore <= 75
          ? 'MODERAT · Supraveghere Activă'
          : 'ECHILIBRAT';

    const priorityActions = [];
    for (const crit of criticalSlAssets) {
      priorityActions.push({
        severity: 'critical',
        sym: crit.sym,
        title: `URGENT ${crit.brokerSym}: ${crit.criticalSlLotsCount || 1} ${(crit.criticalSlLotsCount || 1) === 1 ? 'lot' : 'loturi'} la doar ${crit.minSlDistPct}% de Stop-Loss!`,
        detail: `Preț live $${formatCompactPx(crit.livePrice)} vs SL activ ($${formatCompactPx(crit.lotInsights.find(l => l.riskState === 'CRITICAL_SL')?.sl)}). Sugestie: mută protecția sub $${formatCompactPx(crit.recommendation.levels.suggestedSl)} (dacă ai marjă) SAU închide 20–30% înainte de open ca să nu pierzi toată poziția simultan pe un singur wick.`
      });
    }
    if (top2ConcentrationPct >= 45) {
      const top2Names = sortedByNet.slice(0, 2).map(x => `${x.brokerSym} (${x.concentrationPct.toFixed(0)}%)`).join(' + ');
      priorityActions.push({
        severity: 'warn',
        sym: sortedByNet[0]?.sym || '',
        title: `Concentrare extremă: ${top2Names} = ${top2ConcentrationPct.toFixed(1)}% din valoarea netă`,
        detail: `Prea mult capital activ depinde de 2 acțiuni volatile. Pe orice rebound spre rezistențe ($${sortedByNet[0]?.brokerSym}: ~$${formatCompactPx(sortedByNet[0]?.recommendation.levels.trimZone)}), redu gradual loturile cele mai aproape de breakeven pentru a muta riscul în cash sau lideri cu trend ascendent.`
      });
    }
    if (cfdLotsCount > 0 && effectiveLeverage > 1.25) {
      priorityActions.push({
        severity: 'warn',
        sym: '',
        title: `Expunere CFD cu levier ${effectiveLeverage.toFixed(2)}x (${cfdLotsCount} loturi CFD cu costuri overnight)`,
        detail: `Expunerea noțională totală este $${Math.round(totalNotional).toLocaleString('en-US')} față de valoarea netă curentă de $${Math.round(totalNetPositionsValue).toLocaleString('en-US')}. Prioritate pe CFD-urile blocate long-term: înlocuiește treptat expunerea pe scăderi de volatilitate cu acțiuni spot 1:1 (fără taxe zilnice) odată ce eliberezi marjă.`
      });
    }
    if (dilutionRiskAssets.length > 0) {
      priorityActions.push({
        severity: 'warn',
        sym: dilutionRiskAssets[0],
        title: `Alertă SEC EDGAR Diluție pe ${dilutionRiskAssets.join(', ')}`,
        detail: `Raportări S-3 / 424B active în ultimele 180 zile detectate pe SEC. Evită adăugarea de loturi noi (averaging down) fără confirmare clară peste SMA50 / volum instituțional.`
      });
    }
    if (zombieAssetsCount > 0) {
      const zList = evaluatedAssets.filter(a => a.netValue < 20 && a.livePnlPct <= -92).map(a => `${a.brokerSym} ($${a.netValue.toFixed(2)})`).join(', ');
      priorityActions.push({
        severity: 'info',
        sym: '',
        title: `Curățenie portofoliu: ${zombieAssetsCount} poziții reziduale (${zList})`,
        detail: `Aceste poziții au scăzut peste -92% și valorează sub $20 — nu mai pot influența recuperarea contului. Închiderea lor curăță contul (și poate ajuta fiscal în funcție de jurisdicție).`
      });
    }

    const cash = rawPortfolio?.cashAvailable != null && Number.isFinite(Number(rawPortfolio.cashAvailable))
      ? Number(rawPortfolio.cashAvailable)
      : null;

    return {
      ok: true,
      empty: false,
      sessionCtx,
      updatedTimeRo: nowTimeRo(),
      marketRegime: mktOverview?.regime || null,
      healthScore,
      healthLabel,
      totals: {
        assetsCount: evaluatedAssets.length,
        totalLotsCount,
        cfdLotsCount,
        totalInvestedMargin: Number(totalInvestedMargin.toFixed(2)),
        totalNotional: Number(totalNotional.toFixed(2)),
        totalNetValue: Number(totalNetPositionsValue.toFixed(2)),
        cashAvailable: cash,
        totalAccountEquity: Number((totalNetPositionsValue + (cash || 0)).toFixed(2)),
        totalLivePnl: Number(totalLivePnl.toFixed(2)),
        totalLivePnlPct: Number(totalLivePnlPct.toFixed(2)),
        totalDailyPnl: Number(totalDailyPnl.toFixed(2)),
        effectiveLeverage: Number(effectiveLeverage.toFixed(2)),
        top2ConcentrationPct: Number(top2ConcentrationPct.toFixed(1)),
        criticalSlLotsTotal,
        criticalSlAssetSyms: criticalSlAssets.map(a => a.brokerSym),
        zombieAssetsCount,
        dilutionRiskAssets
      },
      priorityActions,
      evaluatedAssets
    };
  }

  return {
    fetchMarketOverview,
    computeEarlyRadar,
    getSignalValidationReport,
    fetchSymbolDeepIntel,
    fetchOrderFlowIntel,
    fetchSecFilings,
    fetchCboeOptionsIntel,
    resolveCopilotSymbols,
    answerCopilotQuery,
    fetchScannerCockpit,
    evaluateRealPortfolio,
    auditDataQuality,
    evaluatePreBuySafetyChecks,
    compute5InterpretableScores,
    scoreNewsCatalyst,
    getMarketSessionContext
  };
}

module.exports = { createIntelEngine };
