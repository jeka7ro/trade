(function () {
  'use strict';

  /**
   * TradePro Ultimate — AI Trading Intelligence Workspace & Copilot UI
   * Connects to /api/intel/* and window.TradeProBridge cleanly without touching chart rendering loops.
   */

  const stateIntel = {
    view: 'chart',
    radarMode: 'all',
    heatmapSector: 'ALL',
    symbolDeepCache: new Map(), // sym -> { ts, data }
    marketCache: null,
    marketCacheTs: 0,
    radarCache: new Map(),      // mode -> { ts, data }
    deepSymInput: '',
    builderRules: [
      { id: 1, metric: 'price_above_vwap', op: '>=', val: 0 },
      { id: 2, metric: 'vol_spike_mult', op: '>=', val: 1.8 },
      { id: 3, metric: 'rsi_lt', op: '<', val: 68 }
    ],
    builderParams: {
      dir: 'long',
      slPct: 2.5,
      tpRr: 2.2,
      capital: 10000,
      riskPct: 1.5,
      spreadPct: 0.08,
      commissionUsd: 1.0,
      slippagePct: 0.05
    },
    lastBacktest: null,
    copilotBusy: false,
    cockpitCache: null,
    cockpitCacheTs: 0,
    cockpitPaused: false,
    cockpitSelectedSym: '',
    cockpitPropFilter: 'all',
    cockpitTimer: null,
    radarDetailSym: '',
    radarShowValidation: false,
    radarFilters: {
      open: false,
      active: false,
      chgMin: '-2',
      chgMax: '8',
      minRvolTod: '2',
      minVolAccel5m: '2',
      maxFloatM: '25',
      maxSpreadPct: '2.5',
      nearVwapOrRes: false,
      requirePosAccel: false,
      requireCatalyst: false
    },
    orderFlowSym: '',
    adminUsersData: null,
    adminSearch: '',
    adminFilter: 'all',
    adminEditUserId: '',
    adminNotice: null,
    pfEvalData: null,
    pfEvalTs: 0,
    pfExpandedIds: new Set(),
    pfShowImporter: false,
    pfShowAddModal: false,
    pfEditAssetId: '',
    pfReduceAssetId: '',
    pfConfirmDelAssetId: '',
    pfAddLotAssetId: '',
    pfEditLotKey: '', // `${assetId}:${lotId}`
    pfFilter: 'all',
    pfSort: 'notional',
    pfSortDir: 'desc',
    pfLotSortCol: 'open',
    pfLotSortDir: 'desc',
    pfNotice: null,
    pfParsePreview: null,
    pfShowCalc: false,
    pfCalcAssetId: '',
    pfCalcSlInput: '',
    pfCalcTpInput: '',
    pfCalcCashInput: '',
    pfCalcShowLots: false,
    pfCalcConfirmApply: false,
    pfShowEtoroConfig: false,
    pfShowSmartAlerts: false,
    pfAutoPushEnabled: false,
    pfSentPushKeys: (() => {
      try { return JSON.parse(localStorage.getItem('tp_pf_pushed_keys_v1') || '{}'); } catch (_) { return {}; }
    })(),
    etoroStatus: null,
    portfolioTimer: null,
    portfolioTickBusy: false,
    prevPriceMap: {},
    tickFlashMap: {}
  };

  function bridge() {
    return window.TradeProBridge || {
      getContext: () => ({ sym: 'ONDS', tf: '30m', bars: [], quote: null, watchlist: ['NVDA', 'TSLA', 'APPS', 'ONDS'], paper: { positions: [], balance: 10000, closedPnl: 0 } }),
      getRealPortfolio: () => null,
      fetchRealPortfolio: async () => null,
      saveRealPortfolio: async (pf) => pf,
      loadSymbol: () => { },
      assignFocusedSymbol: () => { },
      addAlert: () => { },
      openRightPage: () => { },
      addToWatchlist: () => { },
      toggleWatchlist: () => { },
      isInWatchlist: () => false,
      openBottomTab: () => { },
      renderLogoAvatar: null
    };
  }

  const ICO = {
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><polyline points="7 14 11 10 15 13 20 7"/></svg>',
    layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    details: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="12" y1="7" x2="12.01" y2="7"/></svg>',
    sec: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/></svg>',
    options: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    radar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="12" x2="18.5" y2="5.5"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    pulse: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="22 12 18 12 15 20 9 4 6 12 2 12"/></svg>',
    trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    calc: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="10" y2="11"/><line x1="14" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="10" y2="15"/><line x1="14" y1="15" x2="16" y2="15"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  };

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSymAvatar(sym, sizeCls = 'sm') {
    const raw = String(sym || '').trim().toUpperCase();
    if (!raw || raw === '—' || raw === '-') return '';
    const fn = bridge().renderLogoAvatar;
    if (typeof fn === 'function') {
      const html = fn(raw, sizeCls);
      if (html) return html;
    }
    const base = raw.split('.')[0].split('-')[0].replace(/=F$/i, '').replace(/[^A-Z0-9]/g, '');
    const letters = (base || raw.replace(/[^A-Z0-9]/g, '') || '?').slice(0, 2);
    let h = 0;
    for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) % 360;
    return `<span class="sym-logo-wrap ${esc(sizeCls)}" data-logosym="${esc(raw)}"><span class="sym-logo-fb" style="background:hsl(${h},60%,42%)">${esc(letters)}</span></span>`;
  }

  function fmtPx(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  function fmtCompact(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return '—';
    const a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  function fmtPct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  }

  async function apiGet(url) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || '');
        const isNetErr = err?.name === 'TypeError' || /failed to fetch|network/i.test(msg);
        if (!isNetErr || attempt === 1) throw err;
        await new Promise(r => setTimeout(r, 350));
      }
    }
    throw lastErr;
  }

  async function getMarketOverviewData(force = false) {
    if (!force && stateIntel.marketCache && Date.now() - stateIntel.marketCacheTs < 45000) {
      return stateIntel.marketCache;
    }
    const data = await apiGet(`/api/intel/market-overview${force ? '?refresh=1' : ''}`);
    stateIntel.marketCache = data;
    stateIntel.marketCacheTs = Date.now();
    return data;
  }

  async function getEarlyRadarData(mode = stateIntel.radarMode, force = false) {
    const f = stateIntel.radarFilters;
    const fQuery = f.active
      ? `&chgMin=${encodeURIComponent(f.chgMin)}&chgMax=${encodeURIComponent(f.chgMax)}&minRvolTod=${encodeURIComponent(f.minRvolTod)}&minVolAccel5m=${encodeURIComponent(f.minVolAccel5m)}&maxFloatM=${encodeURIComponent(f.maxFloatM)}&maxSpreadPct=${encodeURIComponent(f.maxSpreadPct)}&nearVwapOrRes=${f.nearVwapOrRes ? '1' : '0'}&requirePosAccel=${f.requirePosAccel ? '1' : '0'}&requireCatalyst=${f.requireCatalyst ? '1' : '0'}`
      : '';
    const key = `${mode}:${f.active ? fQuery : 'raw'}`;
    const hit = stateIntel.radarCache.get(key);
    if (!force && hit && Date.now() - hit.ts < 35000) return hit.data;
    const wl = (bridge().getContext().watchlist || []).slice(0, 12).join(',');
    const url = `/api/intel/early-radar?mode=${encodeURIComponent(mode)}&wl=${encodeURIComponent(wl)}${fQuery}${force ? '&refresh=1' : ''}`;
    const data = await apiGet(url);
    stateIntel.radarCache.set(key, { ts: Date.now(), data });
    return data;
  }

  async function getScannerCockpitData(force = false) {
    if (!force && stateIntel.cockpitCache && Date.now() - stateIntel.cockpitCacheTs < 12000) {
      return stateIntel.cockpitCache;
    }
    const wl = (bridge().getContext().watchlist || []).slice(0, 12).join(',');
    const url = `/api/intel/scanner-cockpit?wl=${encodeURIComponent(wl)}${force ? '&refresh=1' : ''}`;
    const data = await apiGet(url);
    stateIntel.cockpitCache = data;
    stateIntel.cockpitCacheTs = Date.now();
    return data;
  }

  function syncCockpitTimer() {
    if (stateIntel.cockpitTimer) {
      clearInterval(stateIntel.cockpitTimer);
      stateIntel.cockpitTimer = null;
    }
    if (stateIntel.view === 'cockpit' && !stateIntel.cockpitPaused) {
      stateIntel.cockpitTimer = setInterval(() => {
        if (stateIntel.view === 'cockpit' && !stateIntel.cockpitPaused && !document.hidden) {
          renderCockpitView(true);
        }
      }, 15000);
    }
    if (stateIntel.portfolioTimer) {
      clearInterval(stateIntel.portfolioTimer);
      stateIntel.portfolioTimer = null;
    }
    if (stateIntel.view === 'portfolio') {
      stateIntel.portfolioTimer = setInterval(async () => {
        if (stateIntel.view !== 'portfolio' || document.hidden || stateIntel.portfolioTickBusy) return;
        const stage = document.getElementById('intelStage');
        const activeEl = document.activeElement;
        if (stage && activeEl && stage.contains(activeEl) && /^(INPUT|SELECT|TEXTAREA)$/i.test(activeEl.tagName)) {
          return;
        }
        if (stateIntel.pfEditLotKey || stateIntel.pfShowEtoroConfig || stateIntel.pfShowImporter) return;
        stateIntel.portfolioTickBusy = true;
        try {
          if (stateIntel.etoroStatus?.credentials?.configured) {
            await fetch('/api/etoro/sync', { method: 'POST' }).catch(() => { });
          }
          await renderRealPortfolioView(true, true);
        } catch (_) {
        } finally {
          stateIntel.portfolioTickBusy = false;
        }
      }, 4500);
    }
  }

  async function getSymbolDeepData(sym, tf = '30m', force = false) {
    const clean = String(sym || bridge().getContext().sym || 'ONDS').toUpperCase().trim();
    const hit = stateIntel.symbolDeepCache.get(clean);
    if (!force && hit && Date.now() - hit.ts < 40000) return hit.data;
    const data = await apiGet(`/api/intel/symbol-deep?sym=${encodeURIComponent(clean)}&tf=${encodeURIComponent(tf)}`);
    stateIntel.symbolDeepCache.set(clean, { ts: Date.now(), data });
    return data;
  }

  // ─── WORKSPACE VIEW SWITCHING ────────────────────────────────────────────
  const ACTIVE_WVIEW_KEY = 'tp_active_wview_v1';

  function switchWorkspaceView(view, persist = true) {
    const valid = ['chart', 'market', 'radar', 'cockpit', 'secnews', 'options', 'builder', 'portfolio', 'admin'];
    let next = valid.includes(view) ? view : 'chart';
    if (next === 'admin' && bridge().getUser?.()?.role !== 'admin') {
      next = 'chart';
    }
    stateIntel.view = next;
    if (persist) {
      try {
        localStorage.setItem(ACTIVE_WVIEW_KEY, next);
      } catch (_) { }
    }
    syncCockpitTimer();

    document.querySelectorAll('[data-wview]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.wview === next);
    });

    const center = document.getElementById('centerColumn');
    if (center) {
      center.classList.toggle('intel-mode', next !== 'chart');
    }

    // Dismiss mobile overlay sheets & sync bottom nav when switching workspace modes
    if (window.innerWidth <= 820) {
      document.getElementById('rightPanel')?.classList.remove('mobile-open');
      const dock = document.getElementById('bottomDock');
      if (dock && dock.classList.contains('expanded')) {
        dock.classList.remove('expanded');
        const bdIcon = document.getElementById('bdToggleIcon');
        if (bdIcon) {
          bdIcon.innerHTML = '<svg class="tv-ico sm" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>';
        }
      }
      document.getElementById('leftToolbar')?.classList.remove('mob-draw-open');
      document.getElementById('mobDrawToggleBtn')?.classList.remove('active');
      document.querySelectorAll('.tv-menu.open').forEach(m => m.classList.remove('open'));
      toggleCopilotDrawer(false);
      document.querySelectorAll('[data-mnav]').forEach(b => {
        b.classList.toggle('active', b.dataset.mnav === 'chart');
      });
    }

    if (next === 'chart') {
      try { bridge().refreshChartsAfterShow?.(); } catch (_) { }
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        try { bridge().refreshChartsAfterShow?.(); } catch (_) { }
      }, 40);
      return;
    }

    renderActiveIntelStage();
  }

  function renderLoadingState(title, msg) {
    const stage = document.getElementById('intelStage');
    if (!stage) return;
    stage.innerHTML = `
      <div class="intel-head">
        <div class="intel-title-grp">
          <div class="intel-h1">${esc(title)}</div>
          <div class="intel-sub">${esc(msg || 'Se încarcă datele live...')}</div>
        </div>
      </div>
      <div class="intel-card" style="padding:24px;text-align:center;color:var(--text-muted);">
        Se interoghează sursele verificate (Yahoo Finance · TradingView Scanner · SEC EDGAR · CBOE)...
      </div>
    `;
  }

  async function renderActiveIntelStage(force = false) {
    const v = stateIntel.view;
    if (v === 'chart') return;
    if (v === 'market') return renderMarketOverviewView(force);
    if (v === 'radar') return renderEarlyRadarView(force);
    if (v === 'cockpit') return renderCockpitView(force);
    if (v === 'secnews') return renderSecNewsView(force);
    if (v === 'options') return renderOptionsShortView(force);
    if (v === 'builder') return renderStrategyBuilderView();
    if (v === 'portfolio') return renderRealPortfolioView(force);
    if (v === 'admin') return renderAdminUsersView(force);
  }

  // ─── VIEW 1: MARKET OVERVIEW, MACRO, BREADTH & SECTOR HEATMAP ────────────
  async function renderMarketOverviewView(force = false) {
    const stage = document.getElementById('intelStage');
    if (!stage) return;
    if (!stateIntel.marketCache || force) {
      renderLoadingState('Piață SUA, Macro, Breadth & Sector Heatmap', 'Actualizare indici, 11 sectoare și top acțiuni US...');
    }

    try {
      const data = await getMarketOverviewData(force);
      if (stateIntel.view !== 'market') return;

      const sectorNames = ['ALL', ...Array.from(new Set((data.heatmap || []).map(h => h.sector).filter(Boolean))).sort()];
      const filteredTiles = stateIntel.heatmapSector === 'ALL'
        ? (data.heatmap || [])
        : (data.heatmap || []).filter(h => h.sector === stateIntel.heatmapSector);

      const maxAbsSec = Math.max(1.5, ...(data.sectors || []).map(s => Math.abs(s.chgPct || 0)));

      stage.innerHTML = `
        <div class="intel-head">
          <div class="intel-title-grp">
            <div class="intel-h1">Piață SUA, Macro &amp; Sector Heatmap</div>
            <div class="intel-sub">Actualizat ${esc(data.updatedTimeRo)} · ${esc(data.source)}</div>
          </div>
          <div class="intel-controls">
            <span class="pill ${data.regime.tone === 'up' ? 'pill-buy' : (data.regime.tone === 'dn' ? 'pill-sell' : 'pill-neut')}">${esc(data.regime.label)} · ${data.regime.score}/100</span>
            <button id="mktRefreshBtn" class="intel-chip-btn" type="button">${ICO.refresh}<span>Actualizează</span></button>
            <button class="intel-chip-btn" type="button" data-jumpchart="true">${ICO.chart}<span>Înapoi la Grafic</span></button>
          </div>
        </div>

        <div class="macro-strip">
          ${(data.macro || []).map(m => {
        const cls = m.chgPct >= 0 ? 'up' : 'dn';
        return `
              <div class="macro-tile" data-picksym="${esc(m.sym)}">
                <div class="macro-tile-top">
                  <span style="display:inline-flex;align-items:center;gap:5px;">${renderSymAvatar(m.sym, 'xs')}<span>${esc(m.label)}</span></span>
                  <span class="${cls} tabular">${fmtPct(m.chgPct)}</span>
                </div>
                <div class="macro-tile-px tabular">${fmtPx(m.price)}</div>
              </div>
            `;
      }).join('')}
        </div>

        <div class="intel-grid-2">
          <div class="intel-card">
            <div class="intel-card-hdr">
              <div class="intel-card-title">Performanță 11 Sectoare S&amp;P (ETF-uri)</div>
              <div class="intel-card-meta">Click pe sector pentru grafic</div>
            </div>
            <div class="sector-bar-list">
              ${(data.sectors || []).map(s => {
        const isUp = s.chgPct >= 0;
        const w = Math.min(100, Math.max(4, (Math.abs(s.chgPct || 0) / maxAbsSec) * 100));
        return `
                  <div class="sector-bar-row" data-picksym="${esc(s.sym)}">
                    <strong class="sector-bar-sym" style="color:var(--text-bright);">${renderSymAvatar(s.sym, 'xs')}<span>${esc(s.sym)}</span></strong>
                    <span style="color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.name)}</span>
                    <div class="sector-track"><div class="sector-fill ${isUp ? 'up' : 'dn'}" style="width:${w.toFixed(1)}%;"></div></div>
                    <span class="tabular ${isUp ? 'up' : 'dn'}" style="text-align:right;font-weight:700;">${fmtPct(s.chgPct)}</span>
                  </div>
                `;
      }).join('')}
            </div>
          </div>

          <div class="intel-card">
            <div class="intel-card-hdr">
              <div class="intel-card-title">Market Breadth &amp; Tailwind Small-Caps</div>
              <div class="intel-card-meta">${data.breadth.sampleSize} acțiuni lichide US</div>
            </div>
            <div class="intel-kpi-row" style="margin-bottom:8px;">
              <div class="intel-kpi-card">
                <div class="intel-kpi-lbl">Verzi / Roșii</div>
                <div class="intel-kpi-val tabular"><span class="up">${data.breadth.advancers}</span> / <span class="dn">${data.breadth.decliners}</span></div>
                <div class="intel-kpi-sub">${data.breadth.pctUp}% acțiuni pe verde azi</div>
              </div>
              <div class="intel-kpi-card">
                <div class="intel-kpi-lbl">Peste SMA50 / SMA200</div>
                <div class="intel-kpi-val tabular">${data.breadth.pctAboveSma50 ?? '—'}% / ${data.breadth.pctAboveSma200 ?? '—'}%</div>
                <div class="intel-kpi-sub">Sănătate trend mediu &amp; lung</div>
              </div>
            </div>
            <div class="intel-sub" style="padding:10px 12px;background:var(--bg-elev);border-radius:var(--r-ctrl);border:1px solid var(--border);box-shadow:var(--glass-rim);line-height:1.45;">
              <strong style="color:var(--text-bright);">Regim:</strong> ${esc(data.regime.summary)}<br>
              <strong style="color:var(--text-bright);">Impact Small-Caps:</strong> ${esc(data.regime.smallCapBias)}
            </div>
          </div>
        </div>

        <div class="intel-card">
          <div class="intel-card-hdr">
            <div class="intel-card-title">Heatmap Piață SUA (Capitalizare Mare &amp; Lichiditate)</div>
            <div class="intel-controls">
              <select id="hmSectorSelect" class="builder-select">
                ${sectorNames.map(sec => `<option value="${esc(sec)}" ${sec === stateIntel.heatmapSector ? 'selected' : ''}>${sec === 'ALL' ? 'Toate Sectoarele' : esc(sec)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="heatmap-grid">
            ${filteredTiles.slice(0, 60).map(h => {
        const c = Number(h.chgPct || 0);
        const absC = Math.min(5, Math.abs(c));
        const alpha = (0.68 + absC * 0.06).toFixed(2);
        const bg = c >= 0 ? `rgba(8, 153, 129, ${alpha})` : `rgba(242, 54, 69, ${alpha})`;
        return `
                <div class="hm-tile" style="background:${bg};" data-picksym="${esc(h.sym)}" title="${esc(h.name)} · RVOL ${Number(h.rvol || 1).toFixed(1)}x">
                  <div class="hm-top">
                    <span class="hm-sym-wrap">${renderSymAvatar(h.sym, 'xs')}<span class="hm-sym">${esc(h.sym)}</span></span>
                    <span class="hm-chg tabular">${fmtPct(c)}</span>
                  </div>
                  <div class="hm-sub">${fmtPx(h.price)} · ${Number(h.rvol || 1).toFixed(1)}x</div>
                </div>
              `;
      }).join('')}
          </div>
        </div>
      `;

      stage.querySelector('#mktRefreshBtn')?.addEventListener('click', () => renderMarketOverviewView(true));
      stage.querySelector('[data-jumpchart]')?.addEventListener('click', () => switchWorkspaceView('chart'));
      stage.querySelector('#hmSectorSelect')?.addEventListener('change', (e) => {
        stateIntel.heatmapSector = e.target.value;
        renderMarketOverviewView(false);
      });
      stage.querySelectorAll('[data-picksym]').forEach(el => {
        el.addEventListener('click', () => {
          bridge().loadSymbol(el.dataset.picksym);
          switchWorkspaceView('chart');
        });
      });
    } catch (e) {
      stage.innerHTML = `<div class="intel-card dn">Eroare Market Overview: ${esc(e.message)}</div>`;
    }
  }

  // ─── VIEW 2: EARLY OPPORTUNITY RADAR & 5m VOLUME EXPLOSION DETECTOR ──────
  // ─── VIEW 2: EARLY SIGNAL ENGINE v2 & OUTCOME VALIDATION RADAR ───────────
  function renderPreBuyGateHtml(preBuy, dq) {
    if (!preBuy && !dq) return '';
    const flagsHtml = (dq?.flags || []).map(fl => `
      <div class="cp-dq-banner ${fl.severity === 'ANOMALIE' ? 'anomaly' : ''}">
        <strong>${esc(fl.severity)}:</strong> ${esc(fl.message)}
      </div>
    `).join('');
    const checksHtml = (preBuy?.checks || []).map(ck => `
      <div class="cp-prebuy-row">
        <div>
          <div style="font-weight:700;color:var(--text-bright);">${esc(ck.label)}</div>
          <div style="color:var(--text-muted);">${esc(ck.detail)}</div>
        </div>
        <span class="cp-prebuy-badge ${esc(ck.status)}">${esc(ck.status)}</span>
      </div>
    `).join('');
    return `
      ${flagsHtml ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">${flagsHtml}</div>` : ''}
      ${preBuy ? `
        <div style="margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">
            <span>Verificări Obligatorii Pre-BUY (${preBuy.passedCount}/${preBuy.totalChecks} PASS)</span>
            <span class="${preBuy.allowBuy ? 'up' : 'dn'}">${preBuy.allowBuy ? 'ELIGIBIL' : 'BLOCAT'}</span>
          </div>
          <div class="cp-prebuy-list">${checksHtml}</div>
        </div>
      ` : ''}
    `;
  }

  function renderRadarScoreDetailPanel(c) {
    if (!c) return '';
    const bd = Array.isArray(c.scoreBreakdown) ? c.scoreBreakdown : [];
    const fs = c.fiveScores || {};
    const fmtM = (v, suffix = '') => (v != null && Number.isFinite(Number(v)) ? `${v}${suffix}` : '—');
    const secCells = [
      { k: 'RVOL TOD', v: c.rvolTod != null ? `${c.rvolTod.toFixed(2)}x (${c.rvolTodDays || 0}z)` : 'N/A' },
      { k: 'RVOL 10D (Zilnic)', v: `${c.rvol10d.toFixed(2)}x` },
      { k: 'Vol Acceleration', v: `${c.volAccelSlopePct >= 0 ? '+' : ''}${c.volAccelSlopePct}% (5m: ${c.volAccel5m.toFixed(1)}x)` },
      { k: 'Price Accel 15m', v: `${c.priceAccelPct >= 0 ? '+' : ''}${c.priceAccelPct.toFixed(2)}% (15m: ${c.chg15mPct.toFixed(2)}%)` },
      { k: 'Dist from HOD', v: `${c.distFromHodPct.toFixed(2)}%` },
      { k: 'Dist from PM High', v: c.distFromPmHighPct != null ? `${c.distFromPmHighPct >= 0 ? '+' : ''}${c.distFromPmHighPct.toFixed(2)}%` : 'N/A' },
      { k: 'Float', v: fmtCompact(c.floatShares) },
      { k: 'Short Interest', v: c.shortPctFloat != null ? `${c.shortPctFloat}% (${c.shortRatio || '—'}z)` : 'N/A (Top 10 verificat)' },
      { k: 'Spread % (Quote L1)', v: c.spreadPct != null ? `${c.spreadPct.toFixed(2)}%` : 'N/A (Piață închisă/PM)' },
      { k: 'ATR % (Zi / 5m)', v: `${fmtM(c.atrPct, '%')} / ${fmtM(c.atr5mPct, '%')}` },
      { k: 'Flux 5m [OHLCV Proxy]', v: `${c.cvdTrend} (${c.buyPressurePct}% bară CLV)` },
      { k: 'Setup Type', v: `${c.setupCategoryLabel || c.setupCategory}` }
    ];

    const fiveCards = [fs.earlyOpportunity, fs.momentum, fs.breakoutConfirm, fs.risk, fs.newsCatalyst].filter(Boolean);

    return `
      <div class="radar-detail-panel" id="radarDetailPanel">
        <div class="intel-card-hdr" style="margin-bottom:6px;">
          <div>
            <div class="intel-card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${renderSymAvatar(c.sym, 'sm')}
              <span>5 Scoruri Separate &amp; Telemetrie Verificată · ${esc(c.sym)}</span>
              ${c.verdict ? `<span class="radar-verdict-pill v-${esc(c.verdict.tone)}">${esc(c.verdict.shortBadge)}</span>` : ''}
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);">${esc(c.verdict?.summary || c.setupTag)}${c.newsMeta ? ` · ${esc(c.newsMeta.category)} (${esc(c.newsMeta.publishedTimeEt || Math.round(c.newsMeta.ageHours) + 'h')}): ${esc(c.newsMeta.title)}` : ''}</div>
          </div>
          <div style="display:flex;gap:5px;">
            <button type="button" class="intel-chip-btn sm" data-picksym="${esc(c.sym)}">${ICO.chart}<span>Deschide Grafic</span></button>
            <button type="button" class="intel-chip-btn sm" id="radarCloseDetailBtn">${ICO.close}<span>Închide</span></button>
          </div>
        </div>
        ${fiveCards.length ? `
          <div class="intel-kpi-row" style="margin-bottom:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
            ${fiveCards.map(sc => `
              <div class="intel-kpi-card">
                <div class="intel-kpi-lbl">${esc(sc.label)}</div>
                <div class="intel-kpi-val tabular ${sc.tone || (sc.score >= 70 ? 'up' : (sc.score <= 35 ? 'dn' : 'amber'))}">${sc.score}/100</div>
                <div class="intel-kpi-sub">${(sc.factors || []).map(f => esc(f)).join(' · ')}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="radar-detail-grid">
          <div class="radar-score-bar-grid">
            ${bd.map(comp => {
      const pctW = comp.max > 0 ? Math.round((comp.score / comp.max) * 100) : 0;
      const fillCls = pctW >= 70 ? 'hi' : (pctW <= 30 ? 'lo' : '');
      return `
                <div class="radar-comp-row">
                  <div class="radar-comp-lbl" title="${esc(comp.label)}">${esc(comp.label)} (${comp.weightPct}%)</div>
                  <div class="radar-comp-bar"><div class="radar-comp-fill ${fillCls}" style="width:${pctW}%"></div></div>
                  <div class="radar-comp-val">${comp.score}/${comp.max}</div>
                  <div class="radar-comp-sub">${esc(comp.detail)}</div>
                </div>
              `;
    }).join('')}
          </div>
          <div>
            <div class="radar-sec-metrics">
              ${secCells.map(cell => `
                <div class="radar-sec-cell">
                  <div class="radar-sec-k">${esc(cell.k)}</div>
                  <div class="radar-sec-v">${esc(cell.v)}</div>
                </div>
              `).join('')}
            </div>
            ${renderPreBuyGateHtml(c.preBuyCheck, c.dataQuality)}
          </div>
        </div>
      </div>
    `;
  }

  function renderRadarValidationPanel(valStats) {
    const v = valStats || {};
    const fmtRet = (x) => {
      if (x == null || !Number.isFinite(Number(x))) return '<span style="color:var(--text-muted);">—</span>';
      const n = Number(x);
      return `<span class="tabular ${n >= 0 ? 'up' : 'dn'}">${n >= 0 ? '+' : ''}${n.toFixed(2)}%</span>`;
    };
    const sigs = v.recentSignals || [];
    return `
      <div class="radar-val-panel" id="radarValidationPanel">
        <div class="intel-card-hdr" style="margin-bottom:8px;">
          <div>
            <div class="intel-card-title">Signal Performance Tracker · (+5m / +15m / +30m / +60m / EOD)</div>
            <div style="font-size:10.5px;color:var(--text-muted);">
              Înregistrare &amp; evaluare direcțională reală (LONG/SHORT) pe semnale &gt;= 70/100 (${v.totalSignals || 0} totale, ${v.evaluatedCount || 0} evaluate). Scorul != probabilitate istorică; măsurare strictă post-semnal.
            </div>
          </div>
          <div style="display:flex;gap:5px;">
            <button id="radarValidateNowBtn" class="intel-chip-btn sm active" type="button">${ICO.check}<span>Evaluează Semnale Acum</span></button>
            <button id="radarCloseValBtn" class="intel-chip-btn sm" type="button">${ICO.close}<span>Ascunde</span></button>
          </div>
        </div>
        <div class="intel-kpi-row" style="margin-bottom:8px;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));">
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Win Rate Real &amp; Profit Factor</div>
            <div class="intel-kpi-val tabular ${v.winRatePct != null && v.winRatePct >= 50 ? 'up' : 'amber'}">${v.winRatePct != null ? v.winRatePct + '%' : '—'} · PF ${v.profitFactor != null ? v.profitFactor : '—'}</div>
            <div class="intel-kpi-sub">Expectancy: ${v.expectancyPct != null ? fmtPct(v.expectancyPct) : '—'} per semnal</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Target MFE +3% / +5% / +10%</div>
            <div class="intel-kpi-val tabular up">${v.hit3Pct != null ? v.hit3Pct + '%' : '—'} · ${v.hit5Pct != null ? v.hit5Pct + '%' : '—'} · ${v.hit10Pct != null ? v.hit10Pct + '%' : '—'}</div>
            <div class="intel-kpi-sub">Avg MFE: ${v.avgMfePct != null ? fmtPct(v.avgMfePct) : '—'} · Avg MAE: ${v.avgMaePct != null ? fmtPct(v.avgMaePct) : '—'}</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">False Positives &amp; Orizont Mediu</div>
            <div class="intel-kpi-val tabular ${v.falsePositivePct != null && v.falsePositivePct > 35 ? 'dn' : 'amber'}">${v.falsePositivePct != null ? v.falsePositivePct + '%' : '—'}</div>
            <div class="intel-kpi-sub">5m: ${v.avgRet5m != null ? fmtPct(v.avgRet5m) : '—'} · 15m: ${v.avgRet15m != null ? fmtPct(v.avgRet15m) : '—'} · 30m: ${v.avgRet30m != null ? fmtPct(v.avgRet30m) : '—'} · 60m: ${v.avgRet60m != null ? fmtPct(v.avgRet60m) : '—'} · EOD: ${v.avgRetEod != null ? fmtPct(v.avgRetEod) : '—'}</div>
          </div>
        </div>
        <div class="radar-table-wrap" tabindex="0" role="region" aria-label="Jurnal Performanță Semnale" style="max-height:240px;overflow:auto;">
          <table class="intel-table">
            <thead>
              <tr>
                <th>Oră (RO / ET)</th>
                <th>Simbol</th>
                <th>Dir / Tier</th>
                <th>Categorie</th>
                <th>Scor</th>
                <th>Preț Semnal</th>
                <th>+5m</th>
                <th>+15m</th>
                <th>+30m</th>
                <th>+60m</th>
                <th>EOD</th>
                <th>MFE / MAE</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${sigs.map(s => `
                <tr>
                  <td class="tabular">${esc(s.createdTimeRo || '—')}${s.createdTimeEt ? `<div style="font-size:9px;color:var(--text-muted);">${esc(s.createdTimeEt)}</div>` : ''}</td>
                  <td><button type="button" class="intel-sym-btn" data-picksym="${esc(s.sym)}">${renderSymAvatar(s.sym, 'sm')}<span>${esc(s.sym)}</span></button></td>
                  <td><span class="pill ${s.direction === 'SHORT' ? 'pill-sell' : 'pill-buy'}">${esc(s.direction || 'LONG')}</span> <span class="pill ${s.tier === 'HIGH_PRIORITY' ? 'pill-buy' : 'pill-neut'}">${s.tier === 'HIGH_PRIORITY' ? '>=85' : '>=70'}</span></td>
                  <td style="font-size:10.5px;">${esc(s.setupCategory || '—')}</td>
                  <td class="tabular"><strong>${s.entryScore}/100</strong></td>
                  <td class="tabular">${fmtPx(s.entryPrice)}</td>
                  <td>${fmtRet(s.outcomes?.m5)}</td>
                  <td>${fmtRet(s.outcomes?.m15)}</td>
                  <td>${fmtRet(s.outcomes?.m30)}</td>
                  <td>${fmtRet(s.outcomes?.m60)}</td>
                  <td>${fmtRet(s.outcomes?.eod)}</td>
                  <td class="tabular">${fmtRet(s.mfePct)} / ${fmtRet(s.maePct)}</td>
                  <td style="font-size:10px;color:var(--text-muted);">${esc(s.status || 'TRACKING')}</td>
                </tr>
              `).join('') || '<tr><td colspan="13" style="text-align:center;color:var(--text-muted);padding:12px;">Niciun semnal >= 70 înregistrat încă. Semnalele noi se salvează și se evaluează automat aici.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRadarFilterBarHtml() {
    const f = stateIntel.radarFilters;
    return `
      <form id="radarFilterForm" class="radar-filter-bar">
        <div class="radar-filter-field">
          <label for="rfChgMin">Min Chg %</label>
          <input id="rfChgMin" class="intel-input" type="number" step="0.5" value="${esc(f.chgMin)}" />
        </div>
        <div class="radar-filter-field">
          <label for="rfChgMax">Max Chg %</label>
          <input id="rfChgMax" class="intel-input" type="number" step="0.5" value="${esc(f.chgMax)}" />
        </div>
        <div class="radar-filter-field">
          <label for="rfMinTod">Min RVOL TOD (x)</label>
          <input id="rfMinTod" class="intel-input" type="number" step="0.2" min="0" value="${esc(f.minRvolTod)}" />
        </div>
        <div class="radar-filter-field">
          <label for="rfMinVol5m">Min Vol Accel 5m (x)</label>
          <input id="rfMinVol5m" class="intel-input" type="number" step="0.2" min="0" value="${esc(f.minVolAccel5m)}" />
        </div>
        <div class="radar-filter-field">
          <label for="rfMaxFloat">Max Float (M)</label>
          <input id="rfMaxFloat" class="intel-input" type="number" step="1" min="0.5" value="${esc(f.maxFloatM)}" />
        </div>
        <div class="radar-filter-field">
          <label for="rfMaxSpr">Max Spread %</label>
          <input id="rfMaxSpr" class="intel-input" type="number" step="0.1" min="0.05" value="${esc(f.maxSpreadPct)}" />
        </div>
        <label class="radar-filter-check">
          <input id="rfNearRes" type="checkbox" ${f.nearVwapOrRes ? 'checked' : ''} />
          <span>Lângă VWAP / HOD</span>
        </label>
        <label class="radar-filter-check">
          <input id="rfPosAcc" type="checkbox" ${f.requirePosAccel ? 'checked' : ''} />
          <span>Accel 5m/15m Pozitivă</span>
        </label>
        <label class="radar-filter-check">
          <input id="rfReqCat" type="checkbox" ${f.requireCatalyst ? 'checked' : ''} />
          <span>Doar cu Catalizator</span>
        </label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;grid-column:1 / -1;justify-content:flex-end;margin-top:2px;">
          <button id="radarPresetEarlyBtn" class="intel-chip-btn" type="button">${ICO.radar}<span>Preset Early Movers (-2%..+8%)</span></button>
          <button id="radarResetFilterBtn" class="intel-chip-btn" type="button">${ICO.refresh}<span>Reset Filtre</span></button>
          <button class="intel-chip-btn active" type="submit">${ICO.check}<span>Aplică Filtre</span></button>
        </div>
      </form>
    `;
  }

  async function renderEarlyRadarView(force = false) {
    const stage = document.getElementById('intelStage');
    if (!stage) return;
    if (!stateIntel.radarCache.has(stateIntel.radarMode) || force) {
      renderLoadingState('Early Signal Engine v2 · Detector Pre-Breakout & Validare', 'Calculez RVOL TOD (10 zile 5m), 5 scoruri separate, Pre-BUY Safety Gate și evaluarea semnalelor...');
    }

    try {
      const data = await getEarlyRadarData(stateIntel.radarMode, force);
      if (stateIntel.view !== 'radar') return;

      const cnt = data.categoryCounts || {};
      const valStats = data.validationStats || {};
      const reg = data.marketRegime || {};
      const sCtx = data.sessionCtx || {};
      const modes = [
        { k: 'all', ico: ICO.layers, l: `Toate (${cnt.all ?? data.totalScanned ?? 0})` },
        { k: 'actionable', ico: ICO.target, l: `Doar BUY / SELL (${cnt.actionable ?? ((data.buySignalsCount || 0) + (data.sellSignalsCount || 0))})` },
        { k: 'early_momentum', ico: ICO.radar, l: `1. Early Momentum (${cnt.early_momentum ?? 0})` },
        { k: 'volume_explosion', ico: ICO.bolt, l: `2. Volume Explosion (${cnt.volume_explosion ?? 0})` },
        { k: 'breakout_confirmed', ico: ICO.trend, l: `3. Breakout Confirmat (${cnt.breakout_confirmed ?? 0})` },
        { k: 'reversal_accum', ico: ICO.refresh, l: `4. Reversal / Accum (${cnt.reversal_accum ?? 0})` },
        { k: 'smallcap', ico: ICO.filter, l: `Small Caps <$5B (${cnt.smallcap ?? data.smallCapsCount ?? 0})` },
        { k: 'watchlist', ico: ICO.bookmark, l: `Watchlist (${cnt.watchlist ?? 0})` }
      ];

      const detailCand = stateIntel.radarDetailSym
        ? (data.candidates || []).find(x => x.sym === stateIntel.radarDetailSym) || null
        : null;

      stage.innerHTML = `
        <div class="intel-head">
          <div class="intel-title-grp">
            <div class="intel-h1" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>Early Signal Engine v2 · Detector Pre-Breakout &amp; Validare</span>
              ${sCtx.label ? `<span class="intel-sess-pill ${esc(sCtx.tone || 'muted')}">${esc(sCtx.label)} · ${esc(sCtx.timeEt || '')}</span>` : ''}
            </div>
            <div class="intel-sub">Actualizat RO ${esc(data.updatedTimeRo)} (${esc(data.updatedTimeEt || sCtx.timeEt || '')}) · ${esc(data.source || '')}</div>
          </div>
          <div class="intel-controls">
            <button id="radarToggleFiltersBtn" class="intel-chip-btn ${stateIntel.radarFilters.open || stateIntel.radarFilters.active ? 'active' : ''}" type="button">
              ${ICO.filter}<span>${stateIntel.radarFilters.active ? 'Filtre Radar (ACTIVE)' : 'Filtre Radar'}</span>
            </button>
            <button id="radarToggleValBtn" class="intel-chip-btn ${stateIntel.radarShowValidation ? 'active' : ''}" type="button">
              ${ICO.check}<span>Validare Semnale (${valStats.totalSignals || 0})</span>
            </button>
            <button id="radarRefreshBtn" class="intel-chip-btn" type="button">${ICO.refresh}<span>Scanează Acum</span></button>
          </div>
        </div>

        <div class="radar-val-strip">
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Recomandări Validated (Pre-BUY Gate)</div>
            <div class="intel-kpi-val tabular"><span class="up">${data.buySignalsCount || 0} BUY</span> · <span class="dn">${data.sellSignalsCount || 0} SELL</span></div>
            <div class="intel-kpi-sub">${data.radarReadyCount || 0} semnale cu scor &gt;= 70 (${data.highPriorityCount || 0} &gt;=85)</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Market Tailwind &amp; Explozii 5m</div>
            <div class="intel-kpi-val tabular">${esc(reg.label || 'Mixt')} (${reg.score ?? 50}/100)</div>
            <div class="intel-kpi-sub">${data.volumeSpikesCount} acțiuni cu Vol 5m &gt;= 2.5x</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Small Caps Strict (&lt;$5B)</div>
            <div class="intel-kpi-val tabular">${data.smallCapsCount}</div>
            <div class="intel-kpi-sub">${stateIntel.radarFilters.active ? 'Filtru custom activ' : 'Filtru strict fără companii mega-cap'}</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Validare Reală (+3% / Win Rate)</div>
            <div class="intel-kpi-val tabular up">${valStats.hit3Pct != null ? valStats.hit3Pct + '%' : 'Tracking...'} · ${valStats.winRatePct != null ? 'WR ' + valStats.winRatePct + '%' : '—'}</div>
            <div class="intel-kpi-sub">Evaluate: ${valStats.evaluatedCount || 0} · PF: ${valStats.profitFactor ?? '—'} · FP: ${valStats.falsePositivePct != null ? valStats.falsePositivePct + '%' : '—'}</div>
          </div>
        </div>

        ${stateIntel.radarFilters.open ? renderRadarFilterBarHtml() : ''}

        <div class="intel-controls" style="margin-bottom:10px;flex-wrap:wrap;">
          ${modes.map(m => `
            <button type="button" class="intel-chip-btn ${m.k === stateIntel.radarMode ? 'active' : ''}" data-rmode="${m.k}">${m.ico}<span>${esc(m.l)}</span></button>
          `).join('')}
        </div>

        ${stateIntel.radarShowValidation ? renderRadarValidationPanel(valStats) : ''}
        ${detailCand ? renderRadarScoreDetailPanel(detailCand) : ''}

        <div class="radar-table-wrap" tabindex="0" role="region" aria-label="Tabel candidați Early Signal Radar">
          <table class="intel-table">
            <thead>
              <tr>
                <th>Simbol &amp; Float</th>
                <th>Pre-BUY Gate &amp; Verdict</th>
                <th>Preț &amp; Accel 15m</th>
                <th>Volum 5m &amp; RVOL TOD</th>
                <th>Flux [Proxy OHLCV] &amp; VWAP</th>
                <th>5 Scoruri &amp; Context</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              ${(data.candidates || []).map(c => {
        const chgCls = c.chgPct >= 0 ? 'up' : 'dn';
        const volCls = c.volAccel5m >= 3 ? 'up' : (c.volAccel5m >= 1.8 ? 'amber' : '');
        const todVal = c.rvolTod != null ? c.rvolTod : c.rvol10d;
        const todCls = todVal >= 3 ? 'up' : (todVal >= 1.8 ? 'amber' : '');
        const bpCls = c.buyPressurePct >= 62 ? 'up' : (c.buyPressurePct <= 42 ? 'dn' : '');
        const tierCls = c.earlyScore >= 85 ? 'tier-high' : (c.earlyScore >= 70 ? 'tier-radar' : 'tier-watch');
        const slopeStr = `${c.volAccelSlopePct >= 0 ? '+' : ''}${c.volAccelSlopePct}%`;
        const cvdLbl = c.cvdTrend === 'ACCUM' ? 'CVD+' : (c.cvdTrend === 'REBOUND' ? 'Rebound' : (c.cvdTrend === 'DISTRIB' ? 'CVD-' : 'Neutru'));
        const vd = c.verdict || { shortBadge: 'AȘTEAPTĂ', tone: 'wait', summary: 'Condiții mixte' };
        const fs = c.fiveScores || {};
        const pb = c.preBuyCheck || null;
        const dq = c.dataQuality || null;
        const rskVal = fs.risk?.score ?? 50;
        const rskCls = rskVal >= 65 ? 'dn' : (rskVal >= 40 ? 'amber' : 'up');
        const eScore = fs.earlyOpportunity?.score ?? c.earlyScore;
        const mScore = fs.momentum?.score ?? '—';
        const bScore = fs.breakoutConfirm?.score ?? '—';
        const nScore = fs.newsCatalyst?.score ?? '—';
        const ctxTip = [
          `Early ${eScore} · Mom ${mScore} · Brk ${bScore} · Risk ${rskVal} · News ${nScore}`,
          c.shortPctFloat != null ? `Short ${c.shortPctFloat}%` : '',
          c.spreadPct != null ? `Spr ${c.spreadPct.toFixed(2)}%` : '',
          c.atrPct != null ? `ATR ${c.atrPct}%` : '',
          `RSI5m ${c.rsi5m}`,
          c.nextEarningsIso ? `Earn ${c.nextEarningsIso}` : ''
        ].filter(Boolean).join(' · ');
        const rvol5Tag = dq && !dq.rvol5mReliable ? `${c.volAccel5m.toFixed(0)}x (!)` : `${c.volAccel5m.toFixed(1)}x`;
        const vwapLine = `${c.aboveVwap ? 'Peste' : 'Sub'} VWAP (${fmtPct(c.distVwapPct)}) · HOD ${c.distFromHodPct.toFixed(1)}%`;
        return `
                  <tr>
                    <td>
                      <div class="radar-cell-l1">
                        <button class="intel-sym-btn" type="button" data-picksym="${esc(c.sym)}" title="Deschide ${esc(c.sym)} pe grafic">${renderSymAvatar(c.sym, 'sm')}<span>${esc(c.sym)}</span></button>
                        ${c.newsMeta && c.newsMeta.ageHours <= 36 ? CP_FLAME_SVG : ''}
                      </div>
                      <div class="radar-cell-l2 tabular">
                        ${c.inWatchlist ? '<strong style="color:var(--tv-blue-lt);">WL</strong> · ' : ''}${fmtCompact(c.mcap)}${c.floatShares ? ` · Flt ${fmtCompact(c.floatShares)}` : ''}
                      </div>
                    </td>
                    <td>
                      <div class="radar-cell-l1">
                        <span class="radar-verdict-pill v-${esc(vd.tone)}">${esc(vd.shortBadge)}</span>
                        ${pb ? `<span class="cp-prebuy-badge ${pb.allowBuy ? 'PASS' : 'WARN'}" title="${esc((pb.blockers || []).join(' · ') || 'Pre-BUY verificat')}">${pb.passedCount}/${pb.totalChecks}</span>` : ''}
                      </div>
                      <div class="radar-plan-sub" title="${esc(vd.summary)}">${esc(vd.summary)}</div>
                    </td>
                    <td class="tabular">
                      <div class="radar-cell-l1">
                        <strong style="color:var(--text-bright);">${fmtPx(c.price)}</strong>
                        <span class="${chgCls}" style="font-size:10.5px;font-weight:700;">${fmtPct(c.chgPct)}</span>
                      </div>
                      <div class="radar-cell-l2">15m: <span class="${c.priceAccelPct >= 0 ? 'up' : 'dn'}">${c.priceAccelPct >= 0 ? '+' : ''}${c.priceAccelPct.toFixed(2)}%</span></div>
                    </td>
                    <td class="tabular">
                      <div class="radar-cell-l1">
                        <strong class="${volCls}" title="${dq && !dq.rvol5mReliable ? 'Anomalie bază RVOL 5m / sesiune extinsă' : 'Volum 5m vs medie 20 bare'}">${esc(rvol5Tag)}</strong>
                        <span style="font-size:10px;color:${c.volAccelSlopePct >= 10 ? 'var(--tv-green)' : (c.volAccelSlopePct <= -15 ? 'var(--tv-red)' : 'var(--text-muted)')};">(${slopeStr})</span>
                      </div>
                      <div class="radar-cell-l2">
                        TOD: <strong class="${todCls}">${c.rvolTod != null ? c.rvolTod.toFixed(1) + 'x' : '—'}</strong> · 10D: ${c.rvol10d.toFixed(1)}x
                      </div>
                    </td>
                    <td class="tabular">
                      <div class="radar-cell-l1"><strong class="${bpCls}">${c.buyPressurePct}%</strong> <span style="font-size:10px;color:var(--text-muted);">(${esc(cvdLbl)} · CLV)</span></div>
                      <div class="radar-cell-l2 ${c.aboveVwap ? 'up' : 'dn'}" title="${esc(vwapLine)}">${esc(vwapLine)}</div>
                    </td>
                    <td>
                      <div class="radar-cell-l1">
                        <button type="button" class="radar-score-btn ${tierCls}" data-radardetail="${esc(c.sym)}" title="Click pentru cele 5 scoruri, breakdown și Pre-BUY Gate">
                          ${ICO.pulse}<span>${c.earlyScore}/100</span>
                        </button>
                        <span class="radar-cat-badge ${esc(c.setupCategory)}">${esc(c.setupCategoryLabel || c.setupCategory)}</span>
                      </div>
                      <div class="radar-score-summary tabular" title="${esc(ctxTip)}">
                        E${eScore} · M${mScore} · B${bScore} · <span class="${rskCls}">R${rskVal}</span> · N${nScore}${c.atrPct != null ? ` · ATR ${c.atrPct}%` : ''} · RSI ${c.rsi5m}
                      </div>
                    </td>
                    <td>
                      <div class="intel-icon-actions">
                        <button type="button" class="intel-icon-btn ${stateIntel.radarDetailSym === c.sym ? 'active' : ''}" data-radardetail="${esc(c.sym)}" title="Detalii 5 scoruri &amp; Pre-BUY Gate (${esc(c.sym)})" aria-label="Detalii ${esc(c.sym)}">${ICO.details}</button>
                        <button type="button" class="intel-icon-btn" data-picksym="${esc(c.sym)}" title="Deschide grafic ${esc(c.sym)}" aria-label="Grafic ${esc(c.sym)}">${ICO.chart}</button>
                        <button type="button" class="intel-icon-btn" data-pickdeep="${esc(c.sym)}" title="SEC EDGAR, Știri &amp; Opțiuni ${esc(c.sym)}" aria-label="SEC și Opțiuni ${esc(c.sym)}">${ICO.sec}</button>
                      </div>
                    </td>
                  </tr>
                `;
      }).join('') || `<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-muted);">Niciun candidat potrivit în această categorie / filtre acum. Schimbă filtrele sau apasă "Scanează Acum".</td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="ai-obs-foot" style="margin-top:8px;">
          Separare surse date: <strong>Scanner OHLCV</strong> (Yahoo 5m / 10 zile pentru RVOL TOD &amp; Proxy CLV — nu tape tick Bid/Ask plătit) · <strong>Quote L1 Bid/Ask</strong> pentru Spread % · <strong>Pre-BUY Gate (6 verificări)</strong> + <strong>SEC EDGAR &amp; Știri</strong> separate. Apasă pe orice <strong>Scor</strong> sau <strong>Detalii</strong> pentru cele 5 scoruri, 9 componente și auditul complet.
        </div>
      `;

      stage.querySelector('#radarRefreshBtn')?.addEventListener('click', () => renderEarlyRadarView(true));
      stage.querySelector('#radarToggleFiltersBtn')?.addEventListener('click', () => {
        stateIntel.radarFilters.open = !stateIntel.radarFilters.open;
        renderEarlyRadarView(false);
      });
      stage.querySelector('#radarPresetEarlyBtn')?.addEventListener('click', () => {
        Object.assign(stateIntel.radarFilters, {
          open: true,
          active: true,
          chgMin: '-2',
          chgMax: '8',
          minRvolTod: '2',
          minVolAccel5m: '2',
          maxFloatM: '25',
          maxSpreadPct: '2.5',
          nearVwapOrRes: true,
          requirePosAccel: true,
          requireCatalyst: false
        });
        renderEarlyRadarView(true);
      });
      stage.querySelector('#radarResetFilterBtn')?.addEventListener('click', () => {
        stateIntel.radarFilters.active = false;
        stateIntel.radarFilters.nearVwapOrRes = false;
        stateIntel.radarFilters.requirePosAccel = false;
        stateIntel.radarFilters.requireCatalyst = false;
        renderEarlyRadarView(true);
      });
      stage.querySelector('#radarFilterForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        stateIntel.radarFilters.active = true;
        stateIntel.radarFilters.chgMin = stage.querySelector('#rfChgMin')?.value ?? '-2';
        stateIntel.radarFilters.chgMax = stage.querySelector('#rfChgMax')?.value ?? '8';
        stateIntel.radarFilters.minRvolTod = stage.querySelector('#rfMinTod')?.value ?? '2';
        stateIntel.radarFilters.minVolAccel5m = stage.querySelector('#rfMinVol5m')?.value ?? '2';
        stateIntel.radarFilters.maxFloatM = stage.querySelector('#rfMaxFloat')?.value ?? '25';
        stateIntel.radarFilters.maxSpreadPct = stage.querySelector('#rfMaxSpr')?.value ?? '2.5';
        stateIntel.radarFilters.nearVwapOrRes = Boolean(stage.querySelector('#rfNearRes')?.checked);
        stateIntel.radarFilters.requirePosAccel = Boolean(stage.querySelector('#rfPosAcc')?.checked);
        stateIntel.radarFilters.requireCatalyst = Boolean(stage.querySelector('#rfReqCat')?.checked);
        renderEarlyRadarView(true);
      });
      stage.querySelector('#radarToggleValBtn')?.addEventListener('click', () => {
        stateIntel.radarShowValidation = !stateIntel.radarShowValidation;
        renderEarlyRadarView(false);
      });
      stage.querySelector('#radarCloseValBtn')?.addEventListener('click', () => {
        stateIntel.radarShowValidation = false;
        renderEarlyRadarView(false);
      });
      stage.querySelector('#radarValidateNowBtn')?.addEventListener('click', async () => {
        try {
          const vRes = await apiGet('/api/intel/signal-validation?refresh=1');
          data.validationStats = vRes;
          renderEarlyRadarView(false);
        } catch (_) { }
      });
      stage.querySelector('#radarCloseDetailBtn')?.addEventListener('click', () => {
        stateIntel.radarDetailSym = '';
        renderEarlyRadarView(false);
      });
      stage.querySelectorAll('[data-radardetail]').forEach(b => {
        b.addEventListener('click', () => {
          const sym = b.dataset.radardetail;
          stateIntel.radarDetailSym = stateIntel.radarDetailSym === sym ? '' : sym;
          renderEarlyRadarView(false);
        });
      });
      stage.querySelectorAll('[data-rmode]').forEach(b => {
        b.addEventListener('click', () => {
          stateIntel.radarMode = b.dataset.rmode;
          renderEarlyRadarView(false);
        });
      });
      stage.querySelectorAll('[data-picksym]').forEach(b => {
        b.addEventListener('click', () => {
          bridge().loadSymbol(b.dataset.picksym);
          switchWorkspaceView('chart');
        });
      });
      stage.querySelectorAll('[data-pickdeep]').forEach(b => {
        b.addEventListener('click', () => {
          stateIntel.deepSymInput = b.dataset.pickdeep;
          bridge().loadSymbol(b.dataset.pickdeep);
          switchWorkspaceView('secnews');
        });
      });
    } catch (e) {
      stage.innerHTML = `<div class="intel-card dn">Eroare Early Radar: ${esc(e.message)}</div>`;
    }
  }

  // ─── VIEW 2B: MULTI-SCANNER DAY-TRADING COCKPIT ──────────────────────────
  const CP_FLAME_SVG = '<svg class="cp-flame-svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c.5 3.5-2 5.5-2 8.5 0 1.4.9 2.5 2 2.5 1.8 0 3-1.8 3-4 2.5 1.7 4 4.3 4 7.2A7 7 0 0 1 5 16.2c0-2.9 1.6-5.5 4.2-7.4-.1 1.3.4 2.3 1.2 2.9-.5-2.6.1-5.8 1.6-9.7z"/></svg>';

  function chgHeatCls(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    if (n >= 20) return 'cp-chg-3';
    if (n >= 10) return 'cp-chg-2';
    if (n > 0) return 'cp-chg-1';
    if (n < 0) return 'cp-chg-0';
    return '';
  }

  function volHeatCls(rvol, vol) {
    const r = Number(rvol) || 0;
    const v = Number(vol) || 0;
    if (r >= 5 || v >= 10e6) return 'cp-vol-3';
    if (r >= 2.2 || v >= 2e6) return 'cp-vol-2';
    if (r >= 1.2) return 'cp-vol-1';
    return '';
  }

  function fltHeatCls(flt) {
    const f = Number(flt);
    if (!Number.isFinite(f) || f <= 0) return '';
    if (f < 5e6) return 'cp-flt-3';
    if (f < 20e6) return 'cp-flt-2';
    if (f < 80e6) return 'cp-flt-1';
    return '';
  }

  function fmtRvolCell(r) {
    const n = Number(r);
    return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)}x` : '—';
  }

  function fmtNewsBadge(nm) {
    if (!nm) return '<span style="color:var(--text-muted);">—</span>';
    const h = Number(nm.ageHours);
    const ageLbl = Number.isFinite(h) ? (h < 24 ? `${Math.max(1, Math.round(h))}h` : `${Math.round(h / 24)}z`) : 'Știre';
    if (nm.isHot || (Number.isFinite(h) && h <= 6)) {
      return `${CP_FLAME_SVG}${CP_FLAME_SVG} <span class="cp-news-age hot">${esc(ageLbl)}</span>`;
    }
    if (Number.isFinite(h) && h <= 48) {
      return `${CP_FLAME_SVG} <span class="cp-news-age warm">${esc(ageLbl)}</span>`;
    }
    return `<span style="font-size:10px;color:var(--text-muted);">${esc(ageLbl)}</span>`;
  }

  function fmtCockpitPriceCell(r) {
    if (!r) return '—';
    const base = fmtPx(r.price);
    if (!r.extType || r.extChgPct == null) return base;
    const cls = String(r.extType).toLowerCase();
    const shortLbl = r.extType === 'OVN' ? 'Ovn' : (r.extType === 'PRE' ? 'Pre' : 'Post');
    const dirCls = Number(r.extChgPct) >= 0 ? 'up' : 'dn';
    return `${base}<span class="cp-ext-mini ${cls} ${dirCls}" title="${esc(r.extLabel || shortLbl)} vs Reg ${fmtPx(r.regPrice)} (${fmtPct(r.regChgPct)})">${shortLbl} ${fmtPct(r.extChgPct)}</span>`;
  }

  function buildCockpitScannerRows(rows, selectedSym, mode) {
    if (!rows || !rows.length) {
      const cols = (mode === 'pillars' || mode === 'squeeze') ? 7 : 8;
      return `<tr><td colspan="${cols}" style="text-align:center;color:var(--text-muted);padding:12px;">Fără candidați care îndeplinesc filtrele acum.</td></tr>`;
    }
    return rows.map(r => {
      const selCls = selectedSym === r.sym ? ' selected' : '';
      const chgCls = chgHeatCls(r.chgPct);
      const chg5Cls = chgHeatCls((Number(r.chg5m) || 0) * 4);
      const vCls = volHeatCls(r.rvolDaily, r.volume);
      const v5Cls = volHeatCls(r.rvol5m, 0);
      const fCls = fltHeatCls(r.floatShares);
      const newsHtml = fmtNewsBadge(r.newsMeta);
      const rv5Txt = r.rvol5mDisplay || fmtRvolCell(r.rvol5m);
      const pxHtml = fmtCockpitPriceCell(r);

      if (mode === 'pillars') {
        const pScore = r.fivePillarsDetail?.score;
        return `
          <tr class="cp-row${selCls}" data-cpsym="${esc(r.sym)}">
            <td class="cp-sym-cell"><span class="cp-sym-wrap">${renderSymAvatar(r.sym, 'sm')}<span>${esc(r.sym)}</span></span></td>
            <td>${newsHtml}</td>
            <td>${pxHtml}</td>
            <td class="${vCls}">${fmtCompact(r.volume)}</td>
            <td class="${chgCls}">${fmtPct(r.chgPct)}</td>
            <td class="${fCls}">${fmtCompact(r.floatShares)}</td>
            <td class="${v5Cls}" title="${pScore != null ? `5 Pillars Score ${pScore}/100` : ''}">${pScore != null ? `<strong>${pScore}p</strong> · ` : ''}${esc(rv5Txt)}</td>
          </tr>
        `;
      }

      if (mode === 'squeeze') {
        const stratTone = ['purple', 'cyan', 'amber', 'green'].includes(r.stratTone) ? r.stratTone : 'cyan';
        return `
          <tr class="cp-row${selCls}" data-cpsym="${esc(r.sym)}">
            <td class="cp-sym-cell"><span class="cp-sym-wrap">${renderSymAvatar(r.sym, 'sm')}<span>${esc(r.sym)}</span></span></td>
            <td>${newsHtml}</td>
            <td>${pxHtml}</td>
            <td class="${vCls}">${fmtCompact(r.volume)}</td>
            <td class="${v5Cls}">${esc(rv5Txt)}</td>
            <td class="${chg5Cls}">${fmtPct(r.chg5m)}</td>
            <td><span class="cp-strat-tag cp-strat-${stratTone}">${esc(r.strategy || 'Momentum 5m')}</span></td>
          </tr>
        `;
      }

      // Default: 'gainer' (Low Float Top Gainers & Top Gainers US) or 'early' (Early Movers -2%..+8%)
      return `
        <tr class="cp-row${selCls}" data-cpsym="${esc(r.sym)}">
          <td class="${chgCls}">${fmtPct(r.chgPct)}</td>
          <td class="cp-sym-cell"><span class="cp-sym-wrap">${renderSymAvatar(r.sym, 'sm')}<span>${esc(r.sym)}</span></span></td>
          <td>${newsHtml}</td>
          <td>${pxHtml}</td>
          <td class="${vCls}">${fmtCompact(r.volume)}</td>
          <td class="${fCls}">${fmtCompact(r.floatShares)}</td>
          <td class="${chg5Cls}">${fmtPct(r.chg5m)}</td>
          <td class="${mode === 'early' ? v5Cls : vCls}">${mode === 'early' ? esc(rv5Txt) : fmtRvolCell(r.rvolDaily)}</td>
        </tr>
      `;
    }).join('');
  }

  function findCockpitRecord(data, sym) {
    const clean = String(sym || '').toUpperCase().trim();
    const pools = [data.earlyMovers, data.lowFloat, data.topGainers, data.fivePillars, data.squeezeAlerts, data.sellSetups];
    let row = null;
    for (const list of pools) {
      if (!Array.isArray(list)) continue;
      const found = list.find(x => x.sym === clean);
      if (found) { row = found; break; }
    }
    const halt = (data.halts || []).find(h => h.sym === clean) || null;
    const news = (data.newsfeed || []).find(n => n.sym === clean) || null;
    return { row, halt, news, sym: clean };
  }

  function renderCockpitInspectorHtml(data, sym) {
    const rec = findCockpitRecord(data, sym);
    const r = rec.row;
    const h = rec.halt;
    const n = rec.news;
    const dispSym = rec.sym || '—';

    const newsHeadline = r?.newsMeta?.headline || n?.title || '';
    const newsTimeStr = n?.publishedTimeEt
      ? `${n.publishedTimeEt} (${n.publishedTimeRo || ''})`
      : (r?.newsMeta?.publishedTimeEt || (r?.newsMeta?.ageHours != null ? `${Math.round(r.newsMeta.ageHours)}h în urmă` : (n?.publishedDate || '')));

    const vd = r?.verdict || (h
      ? { shortBadge: 'HALT LULD', tone: 'wait', summary: `Oprit la tranzacționare (${h.code || 'HALT'}): ${h.explanation || ''}` }
      : { shortBadge: 'AȘTEAPTĂ', tone: 'wait', summary: 'Selectează un ticker din liste pentru verificarea Pre-BUY.' });

    const inWl = dispSym && dispSym !== '—' && bridge().isInWatchlist?.(dispSym);
    const fiveDetail = r?.fivePillarsDetail || null;
    const inspPct = r ? (r.liveMovePct != null ? r.liveMovePct : r.chgPct) : 0;

    return `
      <div class="cp-insp-head">
        <div>
          <div class="cp-insp-sym-wrap">${dispSym && dispSym !== '—' ? renderSymAvatar(dispSym, 'lg') : ''}<div class="cp-insp-sym">${esc(dispSym)}</div></div>
          <div class="cp-insp-name">${esc(r?.name || h?.name || 'Instrument US Live')}</div>
        </div>
        ${r ? `
          <div class="cp-insp-px">
            <div style="font-size:14px;font-weight:800;color:var(--text-bright);">${fmtPx(r.price)}</div>
            <div class="tabular ${Number(inspPct) >= 0 ? 'up' : 'dn'}" style="font-size:11px;font-weight:700;">${r.extType ? `${esc(r.extLabel)} ` : ''}${fmtPct(inspPct)}</div>
            ${r.extType && r.regPrice > 0 && Math.abs(r.price - r.regPrice) > 1e-4 ? `<div style="font-size:9px;color:var(--text-muted);">Reg ${fmtPx(r.regPrice)} (${fmtPct(r.regChgPct)})</div>` : ''}
          </div>
        ` : (h ? `<span class="cp-pane-badge halt-live">${esc(h.code || 'HALT')}</span>` : '')}
      </div>

      ${(r || h) ? `
        <div class="cp-insp-verdict">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;">Verdict Pre-BUY Gate</span>
            <span class="radar-verdict-pill v-${esc(vd.tone || 'wait')}">${esc(vd.shortBadge || 'AȘTEAPTĂ')}</span>
          </div>
          <div style="font-size:10px;color:var(--text-main);line-height:1.35;">${esc(vd.summary || '')}</div>
        </div>
      ` : ''}

      ${r ? `
        <div class="cp-insp-stats">
          <div class="cp-insp-row"><span class="cp-insp-lbl">Setup / Regim</span><span class="cp-insp-val">${esc(r.setupType || r.strategy || '—')}</span></div>
          <div class="cp-insp-row"><span class="cp-insp-lbl">Extins / Pre-Mkt %</span><span class="cp-insp-val ${Number(r.extChgPct ?? r.preChgPct ?? 0) >= 0 ? 'up' : 'dn'}">${r.extChgPct != null ? `${esc(r.extLabel)} ${fmtPct(r.extChgPct)}` : (r.preChgPct != null ? fmtPct(r.preChgPct) : '—')}${r.pmHigh ? ` · H ${fmtPx(r.pmHigh)}` : ''}</span></div>
          <div class="cp-insp-row"><span class="cp-insp-lbl">VWAP / Dist %</span><span class="cp-insp-val">${r.vwap ? fmtPx(r.vwap) : '—'} (${r.distVwapPct != null ? fmtPct(r.distVwapPct) : '—'})</span></div>
          <div class="cp-insp-row"><span class="cp-insp-lbl">Volum Zi / $Vol</span><span class="cp-insp-val">${fmtCompact(r.volume)} · ${fmtCompact(r.dollarVolume)}</span></div>
          <div class="cp-insp-row"><span class="cp-insp-lbl">Rel Daily / 5m Vol</span><span class="cp-insp-val">${fmtRvolCell(r.rvolDaily)} · ${esc(r.rvol5mDisplay || fmtRvolCell(r.rvol5m))}</span></div>
          <div class="cp-insp-row"><span class="cp-insp-lbl">Variație 5m / Spread L1</span><span class="cp-insp-val">${fmtPct(r.chg5m)} · ${r.spreadPct != null ? r.spreadPct.toFixed(2) + '%' : 'N/A'}</span></div>
          <div class="cp-insp-row"><span class="cp-insp-lbl">Float / Short %</span><span class="cp-insp-val">${fmtCompact(r.floatShares)} · ${r.shortPctFloat != null ? r.shortPctFloat + '%' : '—'}</span></div>
          <div class="cp-insp-row"><span class="cp-insp-lbl">RSI / HOD</span><span class="cp-insp-val">${r.rsi != null ? Math.round(r.rsi) : '—'} · ${r.high ? fmtPx(r.high) : '—'}${r.nearHod ? ' (HOD)' : ''}</span></div>
        </div>
      ` : ''}

      ${r ? renderPreBuyGateHtml(r.preBuyCheck, r.dataQuality) : ''}

      ${fiveDetail ? `
        <div style="margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:3px;">
            <span>5 Pillars Breakdown</span>
            <span style="color:var(--text-bright);">${fiveDetail.score}/100</span>
          </div>
          <div class="cp-prebuy-list">
            ${(fiveDetail.pillars || []).map(p => `
              <div class="cp-prebuy-row">
                <div>
                  <div style="font-weight:700;color:var(--text-bright);">${esc(p.name)}</div>
                  <div style="color:var(--text-muted);">${esc(p.detail)}</div>
                </div>
                <span class="cp-prebuy-badge ${esc(p.status)}">${p.score}/${p.max}</span>
              </div>
            `).join('')}
          </div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:3px;line-height:1.3;">${esc(fiveDetail.disclaimer || '')}</div>
        </div>
      ` : ''}

      ${h ? `
        <div class="cp-insp-newsbox" style="border-color:rgba(242,54,69,0.45);">
          <strong class="cp-halt-lbl">LULD / Trade Halt (${esc(h.code || 'N/A')}):</strong> ${esc(h.explanation || h.market || '')} · Halt: ${esc(h.haltTime || '—')} · Reluare: ${esc(h.resumptionTime || 'În așteptare')}
        </div>
      ` : ''}

      ${newsHeadline ? `
        <div class="cp-insp-newsbox">
          <div class="cp-news-cat-lbl">
            <span>${CP_FLAME_SVG} ${esc(r?.newsMeta?.category || n?.category || 'Catalizator')}</span>
            <span>${esc(newsTimeStr)}</span>
          </div>
          <div>${esc(newsHeadline)}</div>
        </div>
      ` : `
        <div class="cp-insp-newsbox" style="color:var(--text-muted);">
          Nicio știre recentă asociată direct în feed-ul curent. Verifică tab-ul SEC &amp; Știri pentru 8-K / S-3 / 424B.
        </div>
      `}

      <div class="cp-insp-actions">
        <button class="intel-chip-btn active" type="button" data-inspact="chart" data-inspsym="${esc(dispSym)}">${ICO.chart}<span>Grafic Live</span></button>
        <button class="intel-chip-btn" type="button" data-inspact="orderflow" data-inspsym="${esc(dispSym)}">${ICO.layers}<span>Order Flow L1</span></button>
        <button class="intel-chip-btn" type="button" data-inspact="secnews" data-inspsym="${esc(dispSym)}">${ICO.sec}<span>SEC &amp; Diluție</span></button>
        <button class="intel-chip-btn" type="button" data-inspact="options" data-inspsym="${esc(dispSym)}">${ICO.options}<span>Opțiuni &amp; Short</span></button>
        <button class="intel-chip-btn ${inWl ? 'active' : ''}" type="button" data-inspact="wl" data-inspsym="${esc(dispSym)}">${ICO.bookmark}<span>${inWl ? 'În Watchlist' : '+ Watchlist'}</span></button>
      </div>
    `;
  }

  function wireCockpitInspectorActions(container) {
    container.querySelectorAll('[data-inspact]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sym = btn.dataset.inspsym;
        const act = btn.dataset.inspact;
        if (!sym || sym === '—') return;
        if (act === 'chart') {
          bridge().loadSymbol(sym);
          switchWorkspaceView('chart');
        } else if (act === 'orderflow') {
          bridge().loadSymbol(sym);
          switchWorkspaceView('chart');
          bridge().openBottomTab('orderflow');
        } else if (act === 'secnews' || act === 'options') {
          stateIntel.deepSymInput = sym;
          bridge().loadSymbol(sym);
          switchWorkspaceView(act);
        } else if (act === 'wl') {
          const added = bridge().toggleWatchlist ? bridge().toggleWatchlist(sym) : (bridge().addToWatchlist(sym), true);
          btn.classList.toggle('active', Boolean(added));
          btn.innerHTML = `${ICO.bookmark}<span>${added ? 'În Watchlist' : '+ Watchlist'}</span>`;
        }
      });
    });
  }

  function buildCockpitTop10CardsHtml(list, selectedSym) {
    if (!list || !list.length) {
      return '<div style="grid-column:1 / -1;padding:10px;text-align:center;color:var(--text-muted);font-size:11px;">Niciun setup clar cu criteriile curente în această sesiune. Încearcă filtrul opus sau Scanează Acum.</div>';
    }
    return list.map((p, idx) => {
      const sideCls = p.side === 'BUY' ? 'buy' : 'sell';
      const mvCls = Number(p.movePct) >= 0 ? 'up' : 'dn';
      const selCls = selectedSym === p.sym ? ' selected' : '';
      return `
        <article class="cp-prop-card ${sideCls}${selCls}" data-cpsym="${esc(p.sym)}" title="Click pentru detalii în Inspector · Dublu-click sau buton Grafic pentru deschidere grafic">
          <div class="cp-prop-top">
            <span class="cp-prop-sym-grp">
              <span class="cp-prop-rank">#${idx + 1}</span>
              ${renderSymAvatar(p.sym, 'xs')}
              <span class="cp-prop-sym">${esc(p.sym)}</span>
            </span>
            <span class="cp-prop-score tabular">${Number(p.score || 0)}p</span>
          </div>
          <div class="cp-prop-act-row">
            <span class="cp-prop-badge ${sideCls}">${esc(p.badge)}</span>
            <span class="cp-prop-px tabular">${fmtPx(p.price)}</span>
          </div>
          <div class="cp-prop-px-row">
            <span class="cp-prop-mv ${mvCls} tabular">${esc(p.moveLabel || '')}</span>
            ${p.regRefLabel ? `<span class="cp-prop-reg tabular">${esc(p.regRefLabel)}</span>` : ''}
          </div>
          <div class="cp-prop-levels tabular">
            <span>In <b>${fmtPx(p.levels?.entry)}</b></span>
            <span class="dn">SL <b>${fmtPx(p.levels?.sl)}</b></span>
            <span class="up">TP <b>${fmtPx(p.levels?.tp1)}</b></span>
          </div>
          <div class="cp-prop-foot">
            <span class="cp-prop-reason" title="${esc(p.reason || '')}">${esc(p.reason || '')}</span>
            <button type="button" class="cp-prop-go" data-propchart="${esc(p.sym)}">${ICO.chart}<span>Grafic</span></button>
          </div>
        </article>
      `;
    }).join('');
  }

  function getActiveCockpitProposals(data) {
    const mode = stateIntel.cockpitPropFilter || 'all';
    if (mode === 'buy') return data?.buyProposals || [];
    if (mode === 'sell') return data?.sellProposals || [];
    return data?.topProposals || [];
  }

  function renderCockpitTop10Section(data, selectedSym) {
    const sCtx = data.sessionCtx || {};
    const mixCnt = (data.topProposals || []).length;
    const buyCnt = (data.buyProposals || []).length;
    const sellCnt = (data.sellProposals || []).length;
    const mode = stateIntel.cockpitPropFilter || 'all';
    const list = getActiveCockpitProposals(data);
    return `
      <section class="cp-top10-wrap" aria-label="Top 10 Propuneri BUY si SELL Live si Pre-Market">
        <div class="cp-top10-hdr">
          <div class="cp-top10-title-grp">
            <span class="cp-top10-title">Top 10 Propuneri Clari · BUY &amp; SELL</span>
            <span class="intel-sess-pill ${esc(sCtx.tone || 'muted')}">${sCtx.label ? `${esc(sCtx.label)} · Prețuri Live Extinse` : 'Pre-Market &amp; Overnight Live'}</span>
          </div>
          <div class="cp-top10-tabs" role="tablist" aria-label="Filtru direcție Top 10">
            <button type="button" class="cp-prop-tab${mode === 'all' ? ' active' : ''}" data-propfilter="all">Top 10 Mix (${mixCnt})</button>
            <button type="button" class="cp-prop-tab buy${mode === 'buy' ? ' active' : ''}" data-propfilter="buy">Doar BUY (${buyCnt})</button>
            <button type="button" class="cp-prop-tab sell${mode === 'sell' ? ' active' : ''}" data-propfilter="sell">Doar SELL (${sellCnt})</button>
          </div>
        </div>
        <div id="cpTop10Grid" class="cp-top10-grid">
          ${buildCockpitTop10CardsHtml(list, selectedSym)}
        </div>
      </section>
    `;
  }

  async function renderCockpitView(force = false) {
    const stage = document.getElementById('intelStage');
    if (!stage) return;

    // Preserve scroll positions across 15s auto-refresh ticks
    const savedPaneScrolls = Array.from(stage.querySelectorAll('.cp-table-wrap, .cp-news-list')).map(el => el.scrollTop);
    const savedStageScroll = stage.scrollTop;

    if (!stateIntel.cockpitCache) {
      renderLoadingState('Cockpit Multi-Scanner Day-Trading', 'Se încarcă Top 10 BUY/SELL Live, Early Movers, Pre-Market / Overnight BOATS, Halts și catalizatori SEC/Știri...');
    }

    try {
      const data = await getScannerCockpitData(force);
      if (stateIntel.view !== 'cockpit') return;

      const reg = data.marketRegime || {};
      const sCtx = data.sessionCtx || {};
      const regTone = reg.tone === 'up' ? 'up' : (reg.tone === 'dn' ? 'dn' : 'neut');

      // Pick default symbol for Inspector if none selected or not present yet
      if (!stateIntel.cockpitSelectedSym) {
        const ctxSym = bridge().getContext().sym;
        const fallback = data.topProposals?.[0]?.sym || data.earlyMovers?.[0]?.sym || data.lowFloat?.[0]?.sym || data.topGainers?.[0]?.sym || ctxSym || 'ONDS';
        stateIntel.cockpitSelectedSym = fallback;
      }

      const selSym = stateIntel.cockpitSelectedSym;

      stage.innerHTML = `
        <div class="cockpit-head-bar">
          <div class="intel-title-grp">
            <div class="intel-h1" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>Cockpit Multi-Scanner Day-Trading</span>
              ${sCtx.label ? `<span class="intel-sess-pill ${esc(sCtx.tone || 'muted')}">${esc(sCtx.label)} · ${esc(sCtx.timeEt || '')}</span>` : ''}
            </div>
            <div class="intel-sub">Actualizat RO ${esc(data.updatedTimeRo)} (${esc(data.updatedTimeEt || sCtx.timeEt || '')}) · ${esc(data.source || '')}</div>
          </div>
          <div class="cockpit-regime-pill ${regTone}" title="${esc(reg.summary || '')}">
            <span>Market Tailwind: ${esc(reg.label || 'Neutru')} (${Number(reg.score || 50)}/100)</span>
            <span style="opacity:0.85;">· ${esc(reg.smallCapBias || '')}</span>
          </div>
          <div class="intel-controls">
            <button id="cpPauseBtn" class="intel-chip-btn ${stateIntel.cockpitPaused ? '' : 'active'}" type="button">
              ${stateIntel.cockpitPaused ? ICO.pause : ICO.play}<span>${stateIntel.cockpitPaused ? 'Auto 15s: OPRIT' : 'Auto 15s: LIVE'}</span>
            </button>
            <button id="cpRefreshBtn" class="intel-chip-btn" type="button">${ICO.refresh}<span>Scanează Acum</span></button>
            <button id="cpGoRadarBtn" class="intel-chip-btn" type="button">${ICO.radar}<span>Early Radar</span></button>
          </div>
        </div>

        ${renderCockpitTop10Section(data, selSym)}

        <div class="cockpit-shell">
          <!-- LEFT COLUMN: Low Float Top Gainers + Halts LULD + Live Newsfeed -->
          <div class="cp-col">
            <section class="cp-pane">
              <div class="cp-pane-hdr">
                <span class="cp-pane-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  Low Float Top Gainers (&lt;25M Float)
                </span>
                <span class="cp-pane-badge">${(data.lowFloat || []).length}</span>
              </div>
              <div class="cp-table-wrap cp-tall" tabindex="0" role="region" aria-label="Low Float Top Gainers">
                <table class="cp-table">
                  <thead>
                    <tr>
                      <th>Chg %</th>
                      <th>Sym</th>
                      <th>Știri</th>
                      <th>Preț</th>
                      <th>Vol Azi</th>
                      <th>Float</th>
                      <th>5m %</th>
                      <th>RVol</th>
                    </tr>
                  </thead>
                  <tbody>${buildCockpitScannerRows(data.lowFloat || [], selSym, 'gainer')}</tbody>
                </table>
              </div>
            </section>

            <section class="cp-pane">
              <div class="cp-pane-hdr">
                <span class="cp-pane-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Halts LULD Live (NASDAQ / NYSE)
                </span>
                <span class="cp-pane-badge halt-live">${(data.halts || []).length}</span>
              </div>
              <div class="cp-table-wrap cp-compact" tabindex="0" role="region" aria-label="Halts LULD Live">
                <table class="cp-table">
                  <thead>
                    <tr>
                      <th>Oră ET</th>
                      <th>Sym</th>
                      <th>Cod</th>
                      <th>Motiv / Status</th>
                      <th>Reluare</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${(data.halts || []).map(h => `
                      <tr class="cp-row${selSym === h.sym ? ' selected' : ''}" data-cpsym="${esc(h.sym)}">
                        <td>${esc(h.haltTime || '—')}</td>
                        <td class="cp-sym-cell"><span class="cp-sym-wrap">${renderSymAvatar(h.sym, 'sm')}<span>${esc(h.sym)}</span></span></td>
                        <td><span class="cp-pane-badge halt-live">${esc(h.code || '—')}</span></td>
                        <td title="${esc(h.explanation || '')}">${esc((h.explanation || h.market || '—').slice(0, 32))}</td>
                        <td>${esc(h.resumptionTime || 'În curs')}</td>
                      </tr>
                    `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:10px;">Niciun halt LULD activ raportat în fluxul curent.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="cp-pane">
              <div class="cp-pane-hdr">
                <span class="cp-pane-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg>
                  Live Newsfeed Catalizatori (10 Categorii + Dilution Alert)
                </span>
                <span class="cp-pane-badge">${(data.newsfeed || []).length}</span>
              </div>
              <div class="cp-news-list">
                ${(data.newsfeed || []).map(n => {
        const pillCls = n.categoryRisk === 'DILUTION' || n.bias === 'BEARISH'
          ? 'dilution'
          : (n.bias === 'BULLISH' ? 'bullish' : '');
        const timeStr = n.publishedDate
          ? `${n.publishedDate}${n.publishedTimeEt ? ` (${n.publishedTimeEt})` : ''}`
          : (n.publishedTimeEt
            ? `${n.publishedTimeEt}${n.publishedTimeRo ? ` (${n.publishedTimeRo})` : ''}`
            : '');
        return `
                    <div class="cp-news-item" data-cpsym="${esc(n.sym)}">
                      <div class="cp-news-top">
                        <span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;">
                          <span class="cp-news-sym">${renderSymAvatar(n.sym, 'xs')}<span>${esc(n.sym)}</span></span>
                          ${n.isFresh ? CP_FLAME_SVG : ''}
                          <span class="cp-news-cat-pill ${pillCls}">${esc(n.category || 'Catalizator')}</span>
                        </span>
                        <span>${esc(n.publisher || '')} · ${esc(timeStr)}</span>
                      </div>
                      <div class="cp-news-title">${esc(n.title)}</div>
                      ${n.link ? `<a class="cp-news-link" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">Citește știrea originală (${esc(n.publisher || 'Sursă')})</a>` : ''}
                    </div>
                  `;
      }).join('') || '<div style="padding:12px;color:var(--text-muted);font-size:11px;">Nicio știre proaspătă disponibilă în acest ciclu.</div>'}
              </div>
            </section>
          </div>

          <!-- CENTER COLUMN: Early Movers + Top Gainers US + 5 Pillars Scan + Squeeze Alerts / Running Up -->
          <div class="cp-col">
            <section class="cp-pane">
              <div class="cp-pane-hdr">
                <span class="cp-pane-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                  Early Movers (-2% .. +8% · Volum 5m Accelerat)
                </span>
                <span class="cp-pane-badge">${(data.earlyMovers || []).length}</span>
              </div>
              <div class="cp-table-wrap cp-compact" tabindex="0" role="region" aria-label="Early Movers pre-breakout">
                <table class="cp-table">
                  <thead>
                    <tr>
                      <th>Chg %</th>
                      <th>Sym</th>
                      <th>Știri</th>
                      <th>Preț</th>
                      <th>Vol Azi</th>
                      <th>Float</th>
                      <th>5m %</th>
                      <th>5m Vol</th>
                    </tr>
                  </thead>
                  <tbody>${buildCockpitScannerRows(data.earlyMovers || [], selSym, 'early')}</tbody>
                </table>
              </div>
            </section>

            <section class="cp-pane">
              <div class="cp-pane-hdr">
                <span class="cp-pane-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                  Top Gainers US (Momentum Lideri)
                </span>
                <span class="cp-pane-badge">${(data.topGainers || []).length}</span>
              </div>
              <div class="cp-table-wrap cp-compact" tabindex="0" role="region" aria-label="Top Gainers US">
                <table class="cp-table">
                  <thead>
                    <tr>
                      <th>Chg %</th>
                      <th>Sym</th>
                      <th>Știri</th>
                      <th>Preț</th>
                      <th>Vol Azi</th>
                      <th>Float</th>
                      <th>5m %</th>
                      <th>RVol</th>
                    </tr>
                  </thead>
                  <tbody>${buildCockpitScannerRows(data.topGainers || [], selSym, 'gainer')}</tbody>
                </table>
              </div>
            </section>

            <section class="cp-pane">
              <div class="cp-pane-hdr">
                <span class="cp-pane-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  5 Pillars Momentum Scan (+10% · RVol &gt;= 2x · Float &lt; 25M · $1-$35)
                </span>
                <span class="cp-pane-badge">${(data.fivePillars || []).length}</span>
              </div>
              <div class="cp-table-wrap cp-compact" tabindex="0" role="region" aria-label="5 Pillars Momentum Scan">
                <table class="cp-table">
                  <thead>
                    <tr>
                      <th>Sym</th>
                      <th>Știri</th>
                      <th>Preț</th>
                      <th>Vol Azi</th>
                      <th>Chg %</th>
                      <th>Float</th>
                      <th>P-Score / 5m</th>
                    </tr>
                  </thead>
                  <tbody>${buildCockpitScannerRows(data.fivePillars || [], selSym, 'pillars')}</tbody>
                </table>
              </div>
            </section>

            <section class="cp-pane">
              <div class="cp-pane-hdr">
                <span class="cp-pane-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  Squeeze Alerts vs Running Up vs Momentum 5m
                </span>
                <span class="cp-pane-badge">${(data.squeezeAlerts || []).length}</span>
              </div>
              <div class="cp-table-wrap cp-compact" tabindex="0" role="region" aria-label="Squeeze Alerts si Running Up">
                <table class="cp-table">
                  <thead>
                    <tr>
                      <th>Sym</th>
                      <th>Știri</th>
                      <th>Preț</th>
                      <th>Vol Azi</th>
                      <th>5m Vol</th>
                      <th>5m %</th>
                      <th>Fenomen Detectat</th>
                    </tr>
                  </thead>
                  <tbody>${buildCockpitScannerRows(data.squeezeAlerts || [], selSym, 'squeeze')}</tbody>
                </table>
              </div>
            </section>
          </div>

          <!-- RIGHT COLUMN: Quick Symbol Inspector Card -->
          <div class="cp-inspector-col">
            <aside id="cpInspectorCard" class="cp-inspector-card">
              ${renderCockpitInspectorHtml(data, selSym)}
            </aside>
          </div>
        </div>
      `;

      // Restore pane scrolls cleanly after live tick refresh
      stage.scrollTop = savedStageScroll;
      Array.from(stage.querySelectorAll('.cp-table-wrap, .cp-news-list')).forEach((el, idx) => {
        if (savedPaneScrolls[idx] != null) el.scrollTop = savedPaneScrolls[idx];
      });

      // Controls
      stage.querySelector('#cpPauseBtn')?.addEventListener('click', () => {
        stateIntel.cockpitPaused = !stateIntel.cockpitPaused;
        syncCockpitTimer();
        const btn = stage.querySelector('#cpPauseBtn');
        if (btn) {
          btn.classList.toggle('active', !stateIntel.cockpitPaused);
          btn.innerHTML = `${stateIntel.cockpitPaused ? ICO.pause : ICO.play}<span>${stateIntel.cockpitPaused ? 'Auto 15s: OPRIT' : 'Auto 15s: LIVE'}</span>`;
        }
      });

      stage.querySelector('#cpRefreshBtn')?.addEventListener('click', () => renderCockpitView(true));
      stage.querySelector('#cpGoRadarBtn')?.addEventListener('click', () => switchWorkspaceView('radar'));

      const bindCockpitInteractiveNodes = (rootEl) => {
        rootEl.querySelectorAll('[data-propchart]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sym = btn.dataset.propchart;
            if (sym) {
              bridge().loadSymbol(sym);
              switchWorkspaceView('chart');
            }
          });
        });

        rootEl.querySelectorAll('[data-cpsym]').forEach(rowEl => {
          rowEl.addEventListener('click', (e) => {
            if (e.target.closest('a, [data-propchart]')) return;
            const sym = rowEl.dataset.cpsym;
            if (!sym) return;
            stateIntel.cockpitSelectedSym = sym;
            stage.querySelectorAll('.cp-row.selected, .cp-prop-card.selected').forEach(el => el.classList.remove('selected'));
            stage.querySelectorAll(`[data-cpsym="${CSS.escape(sym)}"].cp-row, [data-cpsym="${CSS.escape(sym)}"].cp-prop-card`).forEach(el => el.classList.add('selected'));
            const insp = stage.querySelector('#cpInspectorCard');
            if (insp) {
              insp.innerHTML = renderCockpitInspectorHtml(data, sym);
              wireCockpitInspectorActions(insp);
            }
          });
          rowEl.addEventListener('dblclick', (e) => {
            if (e.target.closest('a')) return;
            const sym = rowEl.dataset.cpsym;
            if (sym) {
              bridge().loadSymbol(sym);
              switchWorkspaceView('chart');
            }
          });
        });
      };

      stage.querySelectorAll('[data-propfilter]').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
          const nextMode = tabBtn.dataset.propfilter || 'all';
          stateIntel.cockpitPropFilter = nextMode;
          stage.querySelectorAll('[data-propfilter]').forEach(b => b.classList.toggle('active', b === tabBtn));
          const grid = stage.querySelector('#cpTop10Grid');
          if (grid) {
            grid.innerHTML = buildCockpitTop10CardsHtml(getActiveCockpitProposals(data), stateIntel.cockpitSelectedSym);
            bindCockpitInteractiveNodes(grid);
          }
        });
      });

      bindCockpitInteractiveNodes(stage);

      const inspInit = stage.querySelector('#cpInspectorCard');
      if (inspInit) wireCockpitInspectorActions(inspInit);
    } catch (e) {
      stage.innerHTML = `<div class="intel-card dn">Eroare Cockpit Multi-Scanner: ${esc(e.message)}</div>`;
    }
  }

  // ─── VIEW 3: NEWS CATALYSTS, SEC EDGAR FILINGS & DILUTION RISK ───────────
  async function renderSecNewsView(force = false) {
    const stage = document.getElementById('intelStage');
    if (!stage) return;
    const ctx = bridge().getContext();
    const sym = (stateIntel.deepSymInput || ctx.sym || 'ONDS').toUpperCase();
    stateIntel.deepSymInput = '';

    renderLoadingState(`Știri Live, SEC EDGAR & Risc Diluție · ${sym}`, 'Se preiau raportările SEC EDGAR (8-K, 10-Q, S-3, 424B, Form 4) și știrile evaluate...');

    try {
      const data = await getSymbolDeepData(sym, ctx.tf, force);
      if (stateIntel.view !== 'secnews') return;
      renderRightObsCard(data);

      const sec = data.sec || {};
      const st = data.structure || {};
      const dilCls = sec.dilutionRisk === 'RIDICAT' ? 'pill-sell' : (sec.dilutionRisk === 'MODERAT' ? 'pill-neut' : 'pill-buy');

      stage.innerHTML = `
        <div class="intel-head">
          <div class="intel-title-grp">
            <div class="intel-h1 intel-title-sym">${renderSymAvatar(data.sym, 'lg')}<span>Știri Catalizator, SEC EDGAR &amp; Risc Diluție · ${esc(data.sym)}</span></div>
            <div class="intel-sub">${esc(data.quote.name)} (${esc(data.quote.exchange)}) · Preț ${fmtPx(data.quote.price)} (${fmtPct(data.quote.chgPct)}) · Actualizat ${esc(data.updatedTimeRo)}</div>
          </div>
          <div class="intel-controls">
            <input id="secSymLookup" class="intel-input" style="width:98px;text-transform:uppercase;" value="${esc(data.sym)}" placeholder="Ticker">
            <button id="secGoBtn" class="intel-chip-btn active" type="button">${ICO.target}<span>Analizează</span></button>
            <button id="secRefreshBtn" class="intel-chip-btn" type="button">${ICO.refresh}<span>Actualizează</span></button>
          </div>
        </div>

        <div class="intel-card" style="margin-bottom:12px;border-left:3px solid var(--tv-blue);">
          <div class="intel-card-hdr">
            <div class="intel-card-title">${esc(data.aiMarketAnalysis.title)} (Observații Verificate)</div>
            <span class="intel-card-meta">${esc(data.aiMarketAnalysis.subtitle)}</span>
          </div>
          <ul class="intel-bullet-list" style="margin-bottom:8px;">
            ${(data.aiMarketAnalysis.observations || []).map(o => `<li>${esc(o)}</li>`).join('')}
          </ul>
          <div style="font-size:11px;font-weight:700;color:var(--text-bright);margin-bottom:4px;">Ce urmărim în continuare:</div>
          <ul class="intel-bullet-list">
            ${(data.aiMarketAnalysis.watchItems || []).map(w => `<li>${esc(w)}</li>`).join('')}
          </ul>
          <div class="ai-obs-foot" style="margin-top:8px;"><strong>Priced-In Check:</strong> ${esc(data.pricedInVerdict)}</div>
        </div>

        <div class="intel-grid-2">
          <div class="intel-card">
            <div class="intel-card-hdr">
              <div class="intel-card-title">SEC EDGAR Filings &amp; Detector Diluție</div>
              ${sec.available ? `<span class="pill ${dilCls}">Risc Diluție: ${esc(sec.dilutionRisk)}</span>` : ''}
            </div>
            ${sec.available ? `
              <div class="intel-kpi-row" style="margin-bottom:8px;">
                <div class="intel-kpi-card">
                  <div class="intel-kpi-lbl">CIK / Sector SIC</div>
                  <div class="intel-kpi-val" style="font-size:12px;">${esc(sec.cik)}</div>
                  <div class="intel-kpi-sub">${esc(sec.sicDescription || 'US Issuer')}</div>
                </div>
                <div class="intel-kpi-card">
                  <div class="intel-kpi-lbl">S-3 / 424B / 8-K 3.02 (180z)</div>
                  <div class="intel-kpi-val tabular ${sec.dilutionHits180.length ? 'dn' : 'up'}">${sec.dilutionHits180.length}</div>
                  <div class="intel-kpi-sub">Form 4 (90z): ${sec.form4Count90} raportări</div>
                </div>
              </div>
              <div style="max-height:360px;overflow-y:auto;">
                ${(sec.filings || []).map(f => `
                  <div class="sec-filing-row">
                    <div>
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span class="pill ${f.isDilution ? 'pill-sell' : 'pill-neut'}">${esc(f.form)}</span>
                        <strong class="tabular" style="color:var(--text-bright);">${esc(f.date)}</strong>
                        ${f.isDilution ? '<span style="color:var(--tv-red);font-weight:700;font-size:10px;">POTENȚIAL DILUȚIE</span>' : ''}
                      </div>
                      <div style="color:var(--text-muted);font-size:10.5px;margin-top:2px;">
                        ${esc(f.items.length ? f.items.join(' · ') : (f.description || 'Document SEC'))}
                      </div>
                    </div>
                    <a class="sec-link" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">SEC.gov</a>
                  </div>
                `).join('')}
              </div>
            ` : `<div style="color:var(--text-muted);font-size:11.5px;">${esc(sec.reason || 'Fără date SEC EDGAR pentru acest simbol.')}</div>`}
          </div>

          <div class="intel-card">
            <div class="intel-card-hdr">
              <div class="intel-card-title">Știri Catalizator Evaluate (${(data.news || []).length})</div>
              <div class="intel-card-meta">Clasificare automată impact</div>
            </div>
            <div style="max-height:320px;overflow-y:auto;margin-bottom:10px;">
              ${(data.news || []).map(n => `
                <div class="intel-news-item">
                  <a class="intel-news-title" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
                  <div class="intel-news-meta">
                    <span class="pill ${n.bias === 'BULLISH' ? 'pill-buy' : (n.bias === 'BEARISH' ? 'pill-sell' : 'pill-neut')}">${esc(n.bias)}</span>
                    <span>${esc(n.category)}</span>
                    <span>Impact ${n.impact}/100</span>
                    <span>${n.isFresh ? '<strong style="color:var(--tv-blue-lt);">NOU</strong> · ' : ''}${esc(n.publisher)} · ${esc(n.publishedDate)}</span>
                  </div>
                </div>
              `).join('') || '<div style="color:var(--text-muted);font-size:11.5px;">Nicio știre recentă returnată de Yahoo pentru acest ticker.</div>'}
            </div>

            ${st.insiderTxns?.length ? `
              <div class="intel-card-hdr" style="margin-top:10px;">
                <div class="intel-card-title">Tranzacții Insideri (Yahoo / Form 4)</div>
              </div>
              <div style="max-height:170px;overflow-y:auto;">
                ${st.insiderTxns.slice(0, 6).map(tx => `
                  <div class="sec-filing-row">
                    <div>
                      <strong style="color:var(--text-bright);">${esc(tx.name)}</strong> <span style="color:var(--text-muted);">(${esc(tx.relation)})</span>
                      <div style="font-size:10.5px;color:var(--text-muted);">${esc(tx.text)}</div>
                    </div>
                    <div class="tabular" style="text-align:right;font-size:10.5px;">
                      <div>${fmtCompact(tx.shares)} acț.</div>
                      <div style="color:var(--text-muted);">${esc(tx.date)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;

      const runLookup = () => {
        const val = stage.querySelector('#secSymLookup')?.value.trim().toUpperCase();
        if (val) {
          stateIntel.deepSymInput = val;
          bridge().loadSymbol(val);
          renderSecNewsView(true);
        }
      };
      stage.querySelector('#secGoBtn')?.addEventListener('click', runLookup);
      stage.querySelector('#secSymLookup')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runLookup(); });
      stage.querySelector('#secRefreshBtn')?.addEventListener('click', () => renderSecNewsView(true));
    } catch (e) {
      stage.innerHTML = `<div class="intel-card dn">Eroare SEC &amp; Știri: ${esc(e.message)}</div>`;
    }
  }

  // ─── VIEW 4: OPTIONS CHAIN (CBOE), MAX PAIN, GEX & SHORT SQUEEZE ─────────
  async function renderOptionsShortView(force = false) {
    const stage = document.getElementById('intelStage');
    if (!stage) return;
    const ctx = bridge().getContext();
    const sym = (stateIntel.deepSymInput || ctx.sym || 'ONDS').toUpperCase();
    stateIntel.deepSymInput = '';

    renderLoadingState(`Opțiuni CBOE, Max Pain, GEX & Short Squeeze · ${sym}`, 'Se calculează IV30, Max Pain, Put/Call, Call/Put Walls și structura Short Float...');

    try {
      const data = await getSymbolDeepData(sym, ctx.tf, force);
      if (stateIntel.view !== 'options') return;
      renderRightObsCard(data);

      const opt = data.options || {};
      const st = data.structure || {};
      const sqCls = st.squeezeRisk === 'RIDICAT' ? 'pill-sell' : (st.squeezeRisk === 'MODERAT' ? 'pill-neut' : 'pill-buy');
      const maxStrikeOI = opt.keyStrikes?.length
        ? Math.max(1, ...opt.keyStrikes.map(s => Math.max(s.callOI, s.putOI)))
        : 1;

      stage.innerHTML = `
        <div class="intel-head">
          <div class="intel-title-grp">
            <div class="intel-h1 intel-title-sym">${renderSymAvatar(data.sym, 'lg')}<span>Opțiuni CBOE, GEX Walls &amp; Short Squeeze · ${esc(data.sym)}</span></div>
            <div class="intel-sub">${esc(data.quote.name)} · Spot ${fmtPx(data.quote.price)} (${fmtPct(data.quote.chgPct)}) · Actualizat ${esc(data.updatedTimeRo)}</div>
          </div>
          <div class="intel-controls">
            <input id="optSymLookup" class="intel-input" style="width:98px;text-transform:uppercase;" value="${esc(data.sym)}">
            <button id="optGoBtn" class="intel-chip-btn active" type="button">${ICO.target}<span>Analizează</span></button>
            <button id="optRefreshBtn" class="intel-chip-btn" type="button">${ICO.refresh}<span>Actualizează</span></button>
          </div>
        </div>

        <div class="intel-kpi-row">
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Short % din Float</div>
            <div class="intel-kpi-val tabular ${(st.shortPctFloat || 0) >= 18 ? 'dn' : ''}">${st.shortPctFloat != null ? st.shortPctFloat + '%' : '—'}</div>
            <div class="intel-kpi-sub">${st.shortRatio != null ? `${st.shortRatio} zile acoperire · ` : ''}<span class="pill ${sqCls}">Squeeze: ${esc(st.squeezeRisk || 'N/A')}</span></div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Float / Acț. Totale</div>
            <div class="intel-kpi-val tabular">${fmtCompact(st.floatShares)} / ${fmtCompact(st.sharesOut)}</div>
            <div class="intel-kpi-sub">Acț. Short: ${fmtCompact(st.sharesShort)}</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Instituționali / Insideri</div>
            <div class="intel-kpi-val tabular">${st.heldInstitutions != null ? st.heldInstitutions + '%' : '—'} / ${st.heldInsiders != null ? st.heldInsiders + '%' : '—'}</div>
            <div class="intel-kpi-sub">Earnings: ${esc(st.nextEarnings || 'Nedisponibil')}</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">IV30 &amp; Put/Call Ratio</div>
            <div class="intel-kpi-val tabular">${opt.iv30 != null ? opt.iv30 + '%' : '—'} · P/C ${opt.pcVolRatio ?? '—'}</div>
            <div class="intel-kpi-sub">Vol Call ${fmtCompact(opt.totalCallVol)} / Put ${fmtCompact(opt.totalPutVol)}</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Max Pain / Walls</div>
            <div class="intel-kpi-val tabular">${opt.maxPain != null ? fmtPx(opt.maxPain) : '—'}</div>
            <div class="intel-kpi-sub">Put Wall ${opt.putWall?.strike ?? '—'} · Call Wall ${opt.callWall?.strike ?? '—'}</div>
          </div>
        </div>

        ${opt.available ? `
          <div class="intel-card" style="margin-bottom:12px;">
            <div class="intel-card-hdr">
              <div class="intel-card-title">Regim Gamma (GEX Estimat) &amp; Open Interest pe Strike (${opt.totalContracts} contracte · Exp Front: ${esc(opt.frontExpiry)})</div>
              <span class="pill ${opt.totalNetGex >= 0 ? 'pill-buy' : 'pill-sell'}">${esc(opt.gexRegime)}</span>
            </div>
            <div class="radar-table-wrap">
              <table class="intel-table">
                <thead>
                  <tr>
                    <th>Strike</th>
                    <th>Call OI (Rezistență)</th>
                    <th>Put OI (Suport)</th>
                    <th>Vol Call / Put</th>
                    <th>Net GEX ($)</th>
                    <th>Marcaj</th>
                  </tr>
                </thead>
                <tbody>
                  ${(opt.keyStrikes || []).map(s => {
        const cw = opt.callWall?.strike === s.strike;
        const pw = opt.putWall?.strike === s.strike;
        const mp = opt.maxPain === s.strike;
        const cW = Math.round((s.callOI / maxStrikeOI) * 100);
        const pW = Math.round((s.putOI / maxStrikeOI) * 100);
        return `
                      <tr>
                        <td class="tabular"><strong style="color:var(--text-bright);">${fmtPx(s.strike)}</strong></td>
                        <td>
                          <div style="display:flex;align-items:center;gap:6px;">
                            <div style="width:80px;height:6px;background:var(--bg-seg-track);border-radius:999px;overflow:hidden;"><div style="height:100%;width:${cW}%;background:var(--tv-green);border-radius:999px;"></div></div>
                            <span class="tabular up">${fmtCompact(s.callOI)}</span>
                          </div>
                        </td>
                        <td>
                          <div style="display:flex;align-items:center;gap:6px;">
                            <div style="width:80px;height:6px;background:var(--bg-seg-track);border-radius:999px;overflow:hidden;"><div style="height:100%;width:${pW}%;background:var(--tv-red);border-radius:999px;"></div></div>
                            <span class="tabular dn">${fmtCompact(s.putOI)}</span>
                          </div>
                        </td>
                        <td class="tabular">${fmtCompact(s.callVol)} / ${fmtCompact(s.putVol)}</td>
                        <td class="tabular ${s.netGex >= 0 ? 'up' : 'dn'}">${fmtCompact(s.netGex)}</td>
                        <td>
                          ${cw ? '<span class="pill pill-buy">Call Wall</span> ' : ''}
                          ${pw ? '<span class="pill pill-sell">Put Wall</span> ' : ''}
                          ${mp ? '<span class="pill pill-neut">Max Pain</span>' : ''}
                        </td>
                      </tr>
                    `;
      }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="intel-card">
            <div class="intel-card-hdr">
              <div class="intel-card-title">Cele Mai Active Contracte de Opțiuni (CBOE Delayed)</div>
              <div class="intel-card-meta">Sortate după Volum zilnic</div>
            </div>
            <div class="radar-table-wrap">
              <table class="intel-table">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Tip</th>
                    <th>Strike</th>
                    <th>Expirare</th>
                    <th>Volum</th>
                    <th>OI</th>
                    <th>Vol/OI</th>
                    <th>IV %</th>
                    <th>Delta</th>
                    <th>Bid / Ask</th>
                  </tr>
                </thead>
                <tbody>
                  ${(opt.unusualContracts || []).map(c => `
                    <tr>
                      <td class="tabular" style="font-size:10.5px;">${esc(c.contract)}</td>
                      <td><span class="pill ${c.type === 'C' ? 'pill-buy' : 'pill-sell'}">${c.type === 'C' ? 'CALL' : 'PUT'}</span></td>
                      <td class="tabular"><strong>${fmtPx(c.strike)}</strong></td>
                      <td class="tabular">${esc(c.expiry)}</td>
                      <td class="tabular"><strong>${fmtCompact(c.vol)}</strong></td>
                      <td class="tabular">${fmtCompact(c.oi)}</td>
                      <td class="tabular ${c.volOiRatio >= 2 ? 'amber' : ''}">${c.volOiRatio}x</td>
                      <td class="tabular">${c.iv != null ? c.iv + '%' : '—'}</td>
                      <td class="tabular">${c.delta}</td>
                      <td class="tabular">${fmtPx(c.bid)} / ${fmtPx(c.ask)}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:12px;">Fără contracte cu volum >= 25 azi.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        ` : `<div class="intel-card">${esc(opt.reason || 'Fără date de opțiuni pentru acest activ.')}</div>`}
      `;

      const runLookup = () => {
        const val = stage.querySelector('#optSymLookup')?.value.trim().toUpperCase();
        if (val) {
          stateIntel.deepSymInput = val;
          bridge().loadSymbol(val);
          renderOptionsShortView(true);
        }
      };
      stage.querySelector('#optGoBtn')?.addEventListener('click', runLookup);
      stage.querySelector('#optSymLookup')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') runLookup(); });
      stage.querySelector('#optRefreshBtn')?.addEventListener('click', () => renderOptionsShortView(true));
    } catch (e) {
      stage.innerHTML = `<div class="intel-card dn">Eroare Opțiuni &amp; Short: ${esc(e.message)}</div>`;
    }
  }

  // ─── VIEW 5: NO-CODE VISUAL STRATEGY BUILDER + REALISTIC COSTS BACKTESTER ─
  function calcEmaSeries(vals, p) {
    const out = new Array(vals.length).fill(0);
    if (!vals.length) return out;
    const k = 2 / (p + 1);
    let e = vals[0];
    out[0] = e;
    for (let i = 1; i < vals.length; i++) {
      e = vals[i] * k + e * (1 - k);
      out[i] = e;
    }
    return out;
  }

  function calcRsiSeries(closes, period = 14) {
    const out = new Array(closes.length).fill(50);
    if (closes.length <= period) return out;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    let avgG = gains / period, avgL = losses / period;
    out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgG = (avgG * (period - 1) + Math.max(0, d)) / period;
      avgL = (avgL * (period - 1) + Math.max(0, -d)) / period;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
  }

  function runVisualStrategyBacktest(bars, rules, params) {
    if (!Array.isArray(bars) || bars.length < 40) {
      return { ok: false, error: 'Sunt necesare minim 40 bare pe grafic pentru simulare realistă.' };
    }

    const n = bars.length;
    const closes = bars.map(b => b.close);
    const vols = bars.map(b => b.volume || 0);
    const ema9 = calcEmaSeries(closes, 9);
    const ema21 = calcEmaSeries(closes, 21);
    const ema50 = calcEmaSeries(closes, 50);
    const ema12 = calcEmaSeries(closes, 12);
    const ema26 = calcEmaSeries(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const macdSig = calcEmaSeries(macdLine, 9);
    const rsi = calcRsiSeries(closes, 14);

    // Session VWAP reset per UTC date
    const vwap = new Array(n).fill(0);
    let pv = 0, vv = 0, prevDay = '';
    for (let i = 0; i < n; i++) {
      const d = new Date(bars[i].time * 1000).toISOString().slice(0, 10);
      if (d !== prevDay) { pv = 0; vv = 0; prevDay = d; }
      const typ = (bars[i].high + bars[i].low + bars[i].close) / 3;
      const v = Math.max(0, bars[i].volume || 0);
      pv += typ * v; vv += v;
      vwap[i] = vv > 0 ? pv / vv : bars[i].close;
    }

    const slFrac = Math.max(0.002, (Number(params.slPct) || 2.5) / 100);
    const tpFrac = slFrac * Math.max(0.5, Number(params.tpRr) || 2.2);
    const spreadFrac = Math.max(0, (Number(params.spreadPct) || 0) / 100);
    const slipFrac = Math.max(0, (Number(params.slippagePct) || 0) / 100);
    const commUsd = Math.max(0, Number(params.commissionUsd) || 0);
    const riskFrac = Math.max(0.001, (Number(params.riskPct) || 1.5) / 100);

    let equity = Math.max(100, Number(params.capital) || 10000);
    const initCap = equity;
    let peakEq = equity, maxDd = 0, totalCosts = 0;
    const eqCurve = [equity];
    const trades = [];
    let pos = null;

    function matchRule(rule, i) {
      const b = bars[i];
      const val = Number(rule.val) || 0;
      const avgV = vols.slice(Math.max(0, i - 20), i).reduce((a, x) => a + x, 0) / Math.max(1, Math.min(20, i));
      const rvol = avgV > 0 ? (b.volume || 0) / avgV : 1;
      const prevHigh20 = Math.max(...bars.slice(Math.max(0, i - 20), i).map(x => x.high));
      const rng = b.high - b.low;

      switch (rule.metric) {
        case 'price_above_vwap': return b.close > vwap[i];
        case 'price_below_vwap': return b.close < vwap[i];
        case 'rsi_lt': return rsi[i] < (val || 65);
        case 'rsi_gt': return rsi[i] > (val || 50);
        case 'ema_cross_bull': return ema9[i] > ema21[i] && ema9[i - 1] <= ema21[i - 1];
        case 'ema_trend_bull': return ema9[i] > ema21[i] && ema21[i] > ema50[i];
        case 'vol_spike_mult': return rvol >= (val || 1.8);
        case 'breakout_high_20': return b.close > prevHigh20;
        case 'macd_hist_pos': return (macdLine[i] - macdSig[i]) > 0;
        case 'bull_close_top': return rng > 0 ? ((b.close - b.low) / rng) >= 0.7 : b.close > b.open;
        default: return false;
      }
    }

    const isShortMode = params.dir === 'short';
    for (let i = 25; i < n; i++) {
      const b = bars[i];
      if (pos) {
        let exitPx = null, reason = '';
        if (pos.isBuy) {
          if (b.low <= pos.sl) { exitPx = pos.sl * (1 - slipFrac); reason = 'Stop-Loss'; }
          else if (b.high >= pos.tp) { exitPx = pos.tp * (1 - slipFrac); reason = 'Take-Profit'; }
        } else {
          if (b.high >= pos.sl) { exitPx = pos.sl * (1 + slipFrac); reason = 'Stop-Loss'; }
          else if (b.low <= pos.tp) { exitPx = pos.tp * (1 + slipFrac); reason = 'Take-Profit'; }
        }

        if (exitPx != null || i === n - 1) {
          if (exitPx == null) { exitPx = b.close; reason = 'Sfârșit Date'; }
          const grossPnl = (pos.isBuy ? (exitPx - pos.entry) : (pos.entry - exitPx)) * pos.qty;
          const halfSpreadCost = pos.entry * spreadFrac * pos.qty;
          const roundTripCosts = halfSpreadCost + commUsd * 2 + (pos.entry * slipFrac * pos.qty);
          const netPnl = grossPnl - commUsd * 2;
          totalCosts += roundTripCosts;
          equity += netPnl;
          if (equity > peakEq) peakEq = equity;
          const dd = peakEq > 0 ? ((peakEq - equity) / peakEq) * 100 : 0;
          if (dd > maxDd) maxDd = dd;
          eqCurve.push(equity);
          trades.push({
            side: pos.isBuy ? 'LONG' : 'SHORT',
            entryTime: new Date(pos.entryTime * 1000).toLocaleString('ro-RO', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
            entry: pos.entry,
            exit: exitPx,
            qty: Number(pos.qty.toFixed(2)),
            netPnl: Number(netPnl.toFixed(2)),
            reason
          });
          pos = null;
        }
        continue;
      }

      if (rules.length && rules.every(r => matchRule(r, i))) {
        const isBuy = !isShortMode;
        const fillAdjust = isBuy ? (1 + spreadFrac * 0.5 + slipFrac) : (1 - spreadFrac * 0.5 - slipFrac);
        const entry = b.close * fillAdjust;
        const sl = isBuy ? entry * (1 - slFrac) : entry * (1 + slFrac);
        const tp = isBuy ? entry * (1 + tpFrac) : entry * (1 - tpFrac);
        const riskUsd = equity * riskFrac;
        const riskUnit = Math.max(0.0001, Math.abs(entry - sl));
        const maxAffordableQty = (equity * 0.95) / entry;
        const qty = Math.min(maxAffordableQty, riskUsd / riskUnit);
        if (qty > 0) {
          pos = { isBuy, entry, sl, tp, qty, entryTime: b.time };
        }
      }
    }

    const wins = trades.filter(t => t.netPnl > 0);
    const losses = trades.filter(t => t.netPnl <= 0);
    const grossWin = wins.reduce((s, t) => s + t.netPnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
    const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 9.9 : 0);
    const netRetPct = ((equity - initCap) / initCap) * 100;
    const bhPct = ((bars[n - 1].close - bars[25].close) / bars[25].close) * 100;

    return {
      ok: true,
      barsTested: n,
      tradesCount: trades.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      profitFactor: Number(pf.toFixed(2)),
      netRetPct: Number(netRetPct.toFixed(2)),
      buyHoldPct: Number(bhPct.toFixed(2)),
      maxDd: Number(maxDd.toFixed(2)),
      totalCosts: Number(totalCosts.toFixed(2)),
      finalEquity: Number(equity.toFixed(2)),
      eqCurve,
      trades: trades.slice(-25).reverse()
    };
  }

  function renderEqSvg(eqCurve) {
    if (!eqCurve || eqCurve.length < 2) return '';
    const w = 520, h = 110, pad = 6;
    const min = Math.min(...eqCurve), max = Math.max(...eqCurve);
    const span = Math.max(1, max - min);
    const pts = eqCurve.map((v, i) => {
      const x = pad + (i / (eqCurve.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const isUp = eqCurve[eqCurve.length - 1] >= eqCurve[0];
    const col = isUp ? '#089981' : '#f23645';
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:110px;display:block;"><polyline fill="none" stroke="${col}" stroke-width="2" points="${pts}"/></svg>`;
  }

  function renderStrategyBuilderView() {
    const stage = document.getElementById('intelStage');
    if (!stage) return;
    const ctx = bridge().getContext();
    const p = stateIntel.builderParams;

    const metricOpts = [
      { v: 'price_above_vwap', l: 'Preț Peste VWAP Sesiune' },
      { v: 'price_below_vwap', l: 'Preț Sub VWAP Sesiune' },
      { v: 'vol_spike_mult', l: 'Volum Bară >= Nx Media 20' },
      { v: 'rsi_lt', l: 'RSI(14) Sub Prag (<)' },
      { v: 'rsi_gt', l: 'RSI(14) Peste Prag (>)' },
      { v: 'ema_cross_bull', l: 'EMA 9 Încrucișează Peste EMA 21' },
      { v: 'ema_trend_bull', l: 'Trend EMA 9 > EMA 21 > EMA 50' },
      { v: 'breakout_high_20', l: 'Breakout Peste Maxim 20 Bare' },
      { v: 'macd_hist_pos', l: 'MACD Histogramă Pozitivă (>0)' },
      { v: 'bull_close_top', l: 'Închidere Puternică (Top 30% Lumânare)' }
    ];

    const bt = stateIntel.lastBacktest || runVisualStrategyBacktest(ctx.bars, stateIntel.builderRules, p);
    stateIntel.lastBacktest = bt;

    stage.innerHTML = `
      <div class="intel-head">
        <div class="intel-title-grp">
          <div class="intel-h1 intel-title-sym">${renderSymAvatar(ctx.sym, 'lg')}<span>No-Code Visual Strategy Builder · ${esc(ctx.sym)} (${esc(ctx.tf.toUpperCase())})</span></div>
          <div class="intel-sub">Construiești reguli IF...AND...THEN și testezi cu Spread, Comision și Slippage pe ${(ctx.bars || []).length} bare reale</div>
        </div>
        <div class="intel-controls">
          <button type="button" class="intel-chip-btn" data-preset="vwap">${ICO.bolt}<span>Preset: Momentum VWAP+Vol</span></button>
          <button type="button" class="intel-chip-btn" data-preset="oversold">${ICO.refresh}<span>Preset: Reversal RSI</span></button>
          <button type="button" class="intel-chip-btn" data-preset="breakout">${ICO.trend}<span>Preset: Breakout 20B</span></button>
        </div>
      </div>

      <div class="intel-grid-2">
        <div class="intel-card">
          <div class="intel-card-hdr">
            <div class="intel-card-title">Condiții Intrare (TOATE trebuie îndeplinite)</div>
            <button id="bldAddRuleBtn" type="button" class="intel-chip-btn sm">${ICO.plus}<span>Condiție</span></button>
          </div>
          <div class="builder-rule-list">
            ${stateIntel.builderRules.map(r => `
              <div class="builder-rule-row" data-rid="${r.id}">
                <span style="font-size:10.5px;font-weight:800;color:var(--tv-blue-lt);">IF</span>
                <select class="builder-select bld-metric" style="flex:1;">
                  ${metricOpts.map(m => `<option value="${m.v}" ${m.v === r.metric ? 'selected' : ''}>${esc(m.l)}</option>`).join('')}
                </select>
                ${['vol_spike_mult', 'rsi_lt', 'rsi_gt'].includes(r.metric) ? `
                  <input type="number" step="0.1" class="builder-num bld-val" value="${r.val}">
                ` : ''}
                <button type="button" class="intel-chip-btn sm bld-del" style="color:var(--tv-red);" title="Șterge condiția">${ICO.trash}</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="intel-card">
          <div class="intel-card-hdr">
            <div class="intel-card-title">Execuție, Risc &amp; Costuri Reale</div>
          </div>
          <div class="intel-grid-2" style="gap:7px;margin-bottom:8px;">
            <label style="font-size:10.5px;color:var(--text-muted);">Direcție
              <select id="bldDir" class="builder-select" style="width:100%;margin-top:2px;">
                <option value="long" ${p.dir === 'long' ? 'selected' : ''}>LONG Only</option>
                <option value="short" ${p.dir === 'short' ? 'selected' : ''}>SHORT Only</option>
              </select>
            </label>
            <label style="font-size:10.5px;color:var(--text-muted);">Stop-Loss (%)
              <input id="bldSl" type="number" step="0.25" class="builder-num" style="width:100%;margin-top:2px;" value="${p.slPct}">
            </label>
            <label style="font-size:10.5px;color:var(--text-muted);">Take-Profit (R:R)
              <input id="bldTpRr" type="number" step="0.2" class="builder-num" style="width:100%;margin-top:2px;" value="${p.tpRr}">
            </label>
            <label style="font-size:10.5px;color:var(--text-muted);">Risc / Trade (%)
              <input id="bldRisk" type="number" step="0.25" class="builder-num" style="width:100%;margin-top:2px;" value="${p.riskPct}">
            </label>
            <label style="font-size:10.5px;color:var(--text-muted);">Spread (%)
              <input id="bldSpread" type="number" step="0.01" class="builder-num" style="width:100%;margin-top:2px;" value="${p.spreadPct}">
            </label>
            <label style="font-size:10.5px;color:var(--text-muted);">Comision ($ / ord) + Slippage (%)
              <div style="display:flex;gap:4px;margin-top:2px;">
                <input id="bldComm" type="number" step="0.5" class="builder-num" style="width:50%;" value="${p.commissionUsd}">
                <input id="bldSlip" type="number" step="0.01" class="builder-num" style="width:50%;" value="${p.slippagePct}">
              </div>
            </label>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button id="bldRunBtn" type="button" class="tv-primary-btn" style="flex:1;height:31px;border-radius:var(--r-pill);display:inline-flex;align-items:center;justify-content:center;gap:5px;">${ICO.play}<span>Rulează Backtest cu Costuri</span></button>
            <button id="bldToAlertBtn" type="button" class="intel-chip-btn" style="height:31px;">${ICO.bell}<span>Trimite Condiție în Alerte</span></button>
          </div>
        </div>
      </div>

      ${bt.ok ? `
        <div class="intel-kpi-row">
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Randament Net (după costuri)</div>
            <div class="intel-kpi-val tabular ${bt.netRetPct >= 0 ? 'up' : 'dn'}">${fmtPct(bt.netRetPct)}</div>
            <div class="intel-kpi-sub">Buy &amp; Hold: ${fmtPct(bt.buyHoldPct)}</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Win Rate &amp; Nr Trade-uri</div>
            <div class="intel-kpi-val tabular">${bt.winRate.toFixed(1)}% · ${bt.tradesCount}</div>
            <div class="intel-kpi-sub">${bt.barsTested} bare evaluate</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Profit Factor</div>
            <div class="intel-kpi-val tabular">${bt.profitFactor}</div>
            <div class="intel-kpi-sub">Max Drawdown: -${bt.maxDd}%</div>
          </div>
          <div class="intel-kpi-card">
            <div class="intel-kpi-lbl">Costuri Spread/Com/Slip</div>
            <div class="intel-kpi-val tabular dn">-$${bt.totalCosts}</div>
            <div class="intel-kpi-sub">Echitate Finală: $${bt.finalEquity.toLocaleString('en-US')}</div>
          </div>
        </div>

        <div class="intel-grid-2">
          <div class="intel-card">
            <div class="intel-card-hdr">
              <div class="intel-card-title">Curbă Echitate Strategie (Net)</div>
              <span class="intel-card-meta">${esc(ctx.sym)} · ${esc(ctx.tf)}</span>
            </div>
            ${renderEqSvg(bt.eqCurve)}
          </div>
          <div class="intel-card">
            <div class="intel-card-hdr">
              <div class="intel-card-title">Ultimele Execuții Simulate (${bt.trades.length})</div>
            </div>
            <div class="radar-table-wrap" tabindex="0" role="region" aria-label="Execuții simulate strategie" style="max-height:200px;overflow:auto;">
              <table class="intel-table">
                <thead><tr><th>Data</th><th>Tip</th><th>Entry</th><th>Exit</th><th>Net P&amp;L</th><th>Motiv</th></tr></thead>
                <tbody>
                  ${bt.trades.map(t => `
                    <tr>
                      <td class="tabular" style="font-size:10px;">${esc(t.entryTime)}</td>
                      <td><span class="pill ${t.side === 'LONG' ? 'pill-buy' : 'pill-sell'}">${t.side}</span></td>
                      <td class="tabular">${fmtPx(t.entry)}</td>
                      <td class="tabular">${fmtPx(t.exit)}</td>
                      <td class="tabular ${t.netPnl >= 0 ? 'up' : 'dn'}"><strong>${t.netPnl >= 0 ? '+' : ''}$${t.netPnl}</strong></td>
                      <td style="font-size:10px;">${esc(t.reason)}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:12px;">Nicio intrare declanșată de aceste reguli. Relaxează condițiile.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : `<div class="intel-card">${esc(bt.error)}</div>`}
    `;

    // Wire events
    stage.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.preset;
        if (k === 'vwap') {
          stateIntel.builderRules = [
            { id: Date.now() + 1, metric: 'price_above_vwap', op: '>=', val: 0 },
            { id: Date.now() + 2, metric: 'vol_spike_mult', op: '>=', val: 1.8 },
            { id: Date.now() + 3, metric: 'rsi_lt', op: '<', val: 68 }
          ];
        } else if (k === 'oversold') {
          stateIntel.builderRules = [
            { id: Date.now() + 1, metric: 'rsi_lt', op: '<', val: 34 },
            { id: Date.now() + 2, metric: 'bull_close_top', op: '>=', val: 0 }
          ];
        } else {
          stateIntel.builderRules = [
            { id: Date.now() + 1, metric: 'breakout_high_20', op: '>=', val: 0 },
            { id: Date.now() + 2, metric: 'vol_spike_mult', op: '>=', val: 1.5 }
          ];
        }
        stateIntel.lastBacktest = null;
        renderStrategyBuilderView();
      });
    });

    stage.querySelector('#bldAddRuleBtn')?.addEventListener('click', () => {
      stateIntel.builderRules.push({ id: Date.now(), metric: 'macd_hist_pos', op: '>=', val: 0 });
      renderStrategyBuilderView();
    });

    stage.querySelectorAll('.builder-rule-row').forEach(row => {
      const rid = Number(row.dataset.rid);
      const rule = stateIntel.builderRules.find(x => x.id === rid);
      if (!rule) return;
      row.querySelector('.bld-metric')?.addEventListener('change', (e) => {
        rule.metric = e.target.value;
        if (rule.metric === 'vol_spike_mult') rule.val = 2.0;
        else if (rule.metric === 'rsi_lt') rule.val = 35;
        else if (rule.metric === 'rsi_gt') rule.val = 55;
        renderStrategyBuilderView();
      });
      row.querySelector('.bld-val')?.addEventListener('change', (e) => {
        rule.val = parseFloat(e.target.value) || 0;
      });
      row.querySelector('.bld-del')?.addEventListener('click', () => {
        stateIntel.builderRules = stateIntel.builderRules.filter(x => x.id !== rid);
        stateIntel.lastBacktest = null;
        renderStrategyBuilderView();
      });
    });

    stage.querySelector('#bldRunBtn')?.addEventListener('click', () => {
      stateIntel.builderParams = {
        dir: stage.querySelector('#bldDir')?.value || 'long',
        slPct: parseFloat(stage.querySelector('#bldSl')?.value) || 2.5,
        tpRr: parseFloat(stage.querySelector('#bldTpRr')?.value) || 2.2,
        riskPct: parseFloat(stage.querySelector('#bldRisk')?.value) || 1.5,
        spreadPct: parseFloat(stage.querySelector('#bldSpread')?.value) || 0,
        commissionUsd: parseFloat(stage.querySelector('#bldComm')?.value) || 0,
        slippagePct: parseFloat(stage.querySelector('#bldSlip')?.value) || 0,
        capital: 10000
      };
      stateIntel.lastBacktest = runVisualStrategyBacktest(ctx.bars, stateIntel.builderRules, stateIntel.builderParams);
      renderStrategyBuilderView();
    });

    stage.querySelector('#bldToAlertBtn')?.addEventListener('click', () => {
      const hasVol = stateIntel.builderRules.some(r => r.metric === 'vol_spike_mult');
      const cond = hasVol ? 'vol_spike_3x' : 'multi_bull';
      bridge().addAlert(0, 'up', cond);
      bridge().openRightPage('alerts');
    });
  }

  // ─── REAL PORTFOLIO VAULT & AI EVALUATOR (STRICTLY PER-USER MULTI-TENANT) ───
  function pfFmtUsd(v, signed = false) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (signed) return `${n >= 0 ? '+$' : '-$'}${abs}`;
    return `${n < 0 ? '-$' : '$'}${abs}`;
  }

  function pfParseNum(str) {
    if (str == null) return null;
    const s = String(str).replace(/[$€£,\s]/g, '').trim();
    if (!s || /^[-—]+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function resolveBrokerSymClient(rawSym, rawName = '') {
    const clean = String(rawSym || '').trim().toUpperCase().replace(/\.(24-7|24-5|24_7|24_5)$/i, '');
    if (clean === 'TRUMP' || String(rawName || '').toLowerCase().includes('official trump')) {
      return 'TRUMP35336-USD';
    }
    return clean;
  }

  function reduceAssetUnits(asset, qtyToRemove, strategy = 'nearest_be') {
    const lots = Array.isArray(asset.lots) ? asset.lots.map(l => ({ ...l })) : [];
    const totalU = lots.length ? lots.reduce((s, l) => s + Number(l.units || 0), 0) : Number(asset.units || 0);
    const rem = Number(qtyToRemove) || 0;
    if (!Number.isFinite(rem) || rem <= 0) return asset;
    if (rem >= totalU - 1e-8) return null; // Fully closed / removed

    const ratioLeft = totalU > 0 ? Math.max(0, (totalU - rem) / totalU) : 0;
    const nextInvested = (asset.invested != null && Number.isFinite(Number(asset.invested)))
      ? Number((Number(asset.invested) * ratioLeft).toFixed(2))
      : asset.invested;

    if (!lots.length) {
      return {
        ...asset,
        units: Number((totalU - rem).toFixed(8)),
        invested: nextInvested
      };
    }

    if (strategy === 'proportional') {
      const scaled = lots
        .map(l => ({ ...l, units: Number((Number(l.units || 0) * ratioLeft).toFixed(8)) }))
        .filter(l => l.units > 1e-8);
      return { ...asset, lots: scaled, invested: nextInvested };
    }

    const order = lots.map((l, idx) => ({ idx, open: Number(l.open || 0) }));
    if (strategy === 'nearest_be') {
      order.sort((a, b) => (asset.side === 'SHORT' ? b.open - a.open : a.open - b.open));
    } else if (strategy === 'oldest_high') {
      order.sort((a, b) => (asset.side === 'SHORT' ? a.open - b.open : b.open - a.open));
    } else if (strategy === 'fifo') {
      order.reverse();
    } // 'lifo' keeps default newest-first order

    let leftToCut = rem;
    for (const item of order) {
      if (leftToCut <= 1e-8) break;
      const lot = lots[item.idx];
      const u = Number(lot.units || 0);
      if (u <= leftToCut + 1e-8) {
        leftToCut -= u;
        lot.units = 0;
      } else {
        lot.units = Number((u - leftToCut).toFixed(8));
        leftToCut = 0;
      }
    }
    const remainingLots = lots.filter(l => Number(l.units || 0) > 1e-8);
    if (!remainingLots.length) return null;
    return {
      ...asset,
      lots: remainingLots,
      invested: nextInvested
    };
  }

  function parseEtoroLotLines(lines) {
    const joined = lines.join('\n');
    const lots = [];
    // Split on each Buy/Sell anchor (works both for single-line table rows and Chrome multi-line selection!)
    const chunks = joined.split(/(?=(?:^|\n)\s*(?:Buy|Sell)\b)/i).map(c => c.trim()).filter(Boolean);
    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];
      if (!/^(?:Buy|Sell)\b/i.test(ch)) continue;
      const linesInChunk = ch.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const headerLine = linesInChunk[0] || '';
      const isShort = /^Sell\b/i.test(headerLine);
      const isCfd = /\bCFD\b/i.test(ch);
      const is24_5 = /24\/5/.test(ch);
      const dateMatch = ch.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*[•·,-]?\s*\d{1,2}:\d{2})?)/);
      const openedAt = dateMatch ? dateMatch[1].replace(/\s+/g, ' ').trim() : '';
      const typeLabel = `${isShort ? 'Sell' : 'Buy'}${isCfd ? ' CFD' : ''}${is24_5 ? ' 24/5' : ''}`.trim();

      // Strip prefix metadata so only numeric/placeholder columns remain
      let rest = ch
        .replace(/^(?:Buy|Sell)(?:\s+CFD)?(?:\s+24\/5)?/i, '')
        .replace(/(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*[•·,-]?\s*\d{1,2}:\d{2})?)/, '')
        .replace(/\bClose(?:\s+All)?\b/gi, '');
      const tokens = rest.match(/[-+]?\$?\d[\d,]*(?:\.\d+)?%?|\-{3,}|—+|N\/A/g) || [];
      const nums = [];
      for (const tok of tokens) {
        if (/^\-{3,}$|^—+$|^N\/A$/i.test(tok)) {
          nums.push({ raw: tok, val: null, isPct: false, isDollar: false });
        } else {
          const isPct = tok.endsWith('%');
          const isDollar = tok.includes('$');
          const v = pfParseNum(tok.replace('%', ''));
          if (v !== null) nums.push({ raw: tok, val: v, isPct, isDollar });
        }
      }
      // Columns order in eToro drilldown: Units, Open, SL, TP, [Daily P/L], [P/L], [P/L(%)]
      const units = nums[0]?.val;
      const open = nums[1]?.val;
      if (!units || units <= 0 || open === null) continue;
      const sl = nums[2]?.val ?? null;
      const tp = nums[3]?.val ?? null;
      const pctItem = [...nums].reverse().find(x => x.isPct);
      const dollarItems = nums.slice(4).filter(x => x.isDollar);
      const brokerPnl = dollarItems.length >= 2 ? dollarItems[dollarItems.length - 1].val : (dollarItems[0]?.val ?? null);
      const dailyPnl = dollarItems.length >= 2 ? dollarItems[0].val : null;
      lots.push({
        id: `lot_${Date.now()}_${i}`,
        openedAt,
        type: typeLabel,
        side: isShort ? 'SHORT' : 'LONG',
        isCfd,
        is24_5,
        units,
        open,
        sl: sl && sl > 0 ? sl : null,
        tp: tp && tp > 0 ? tp : null,
        dailyPnl,
        brokerPnl,
        brokerPnlPct: pctItem ? pctItem.val : null
      });
    }
    return lots;
  }

  function parseBrokerPortfolioText(rawText, mode = 'auto', targetSymHint = '') {
    const text = String(rawText || '').trim();
    if (!text) return { ok: false, error: 'Lipește textul sau JSON-ul din broker.' };

    // 1. JSON snapshot support
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return { ok: true, kind: 'assets', assets: parsed, meta: {} };
        }
        if (parsed && Array.isArray(parsed.assets)) {
          return { ok: true, kind: 'full', portfolio: parsed, assets: parsed.assets, meta: parsed };
        }
      } catch (e) {
        return { ok: false, error: `JSON invalid: ${e.message}` };
      }
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const meta = {};
    const cashM = text.match(/(?:cash(?:\s+available)?|disponibil|available)\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i);
    if (cashM) meta.cashAvailable = pfParseNum(cashM[1]);
    const eqM = text.match(/(?:total\s+equity|net\s+value|equity)\s*[:=]?\s*\$?([\d,]+(?:\.\d+)?)/i);
    if (eqM) meta.accountEquity = pfParseNum(eqM[1]);

    // Detect target header in eToro drill-down paste (e.g. "APPS • Digital Turbine Inc" or "Invested 4030.21088 Units @ 10.61")
    let detectedLotSym = String(targetSymHint || '').trim().toUpperCase();
    let detectedLotName = '';
    const hdrMatch = text.match(/^([A-Z][A-Z0-9.\-]{0,11})\s*[•·]\s*([^\n\r]+)$/m);
    if (hdrMatch && !detectedLotSym) {
      detectedLotSym = hdrMatch[1].trim().toUpperCase();
      detectedLotName = hdrMatch[2].trim();
    }
    const invMatch = text.match(/Invested\s+([\d,.]+)\s+Units\s*@\s*([\d,.]+)/i);
    const netMatch = text.match(/Net\s*Value\s*\$?([\d,.]+)/i);

    // 2. Check for eToro multi-lot rows (Buy / Buy CFD / Sell CFD)
    if (mode === 'lots' || (/\b(?:Buy|Sell)(?:\s+CFD)?(?:\s+24\/5)?\b/i.test(text) && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text))) {
      const lots = parseEtoroLotLines(lines);
      if (lots.length > 0) {
        const symClean = resolveBrokerSymClient(detectedLotSym || 'SIMBOL', detectedLotName);
        return {
          ok: true,
          kind: 'lots',
          targetBrokerSym: detectedLotSym || symClean,
          targetSym: symClean,
          targetName: detectedLotName || symClean,
          netValue: netMatch ? pfParseNum(netMatch[1]) : null,
          lots,
          meta
        };
      }
    }

    // 3. Parse eToro Overview / Generic Lines / CSV
    const assets = [];
    const seen = new Set();

    // Try single-line structured rows first (tab-separated, CSV, or space-separated ticker rows)
    for (const line of lines) {
      if (/^(?:My Portfolio|Asset\s*\(|Orders|Manual Trades|Price\s+Units|Symbol|Close|Trade)/i.test(line)) continue;
      // e.g. "APPS 4030.21 @ 10.61 SL 6.90 TP 21.93" or "NVDA, 15, 112.50, LONG, 105, 160"
      const mSimple = line.match(/^([A-Z][A-Z0-9.\-=]{0,14}(?:\.(?:24-7|24-5))?)\s*(?:[,|\t\s]\s*@\s*|[,|\t\s]+)\s*([\d,.]+)\s*(?:units|sh|act)?\s*(?:@\s*|[,|\t\s]+)\s*\$?([\d,.]+)(.*)$/i);
      if (mSimple) {
        const bSym = mSimple[1].toUpperCase();
        const n1 = pfParseNum(mSimple[2]);
        const n2 = pfParseNum(mSimple[3]);
        const tail = mSimple[4] || '';
        const isShort = /\bshort\b|\bsell\b/i.test(tail);
        const slM = tail.match(/\bSL\s*[:=]?\s*\$?([\d,.]+)/i);
        const tpM = tail.match(/\bTP\s*[:=]?\s*\$?([\d,.]+)/i);
        // Heuristic: if n2 looks like stock price & units follows Long/Short in eToro single-line copy
        const etoroTail = tail.match(/^\s*(?:[-+]?\d[\d,.]*\s*\([^)]+\)\s*)?([\d,.]+)\s+(Long|Short)\s+([\d,.]+)\s+([-+]?\$[\d,.]+)\s+([-+]?[\d,.]+%)/i);
        if (etoroTail) {
          const uVal = pfParseNum(etoroTail[1]);
          const oVal = pfParseNum(etoroTail[3]);
          if (uVal > 0 && oVal !== null && !seen.has(bSym)) {
            seen.add(bSym);
            assets.push({
              brokerSym: bSym,
              sym: resolveBrokerSymClient(bSym),
              name: bSym,
              side: /short/i.test(etoroTail[2]) ? 'SHORT' : 'LONG',
              units: uVal,
              avgOpen: oVal,
              brokerPrice: n1,
              brokerPnl: pfParseNum(etoroTail[4]),
              brokerPnlPct: pfParseNum(etoroTail[5].replace('%', '')),
              is24_5: /24-5/.test(bSym),
              is24_7: /24-7/.test(bSym),
              lots: []
            });
            continue;
          }
        }
        if (n1 > 0 && n2 !== null && !/^\(/.test(tail.trim()) && !seen.has(bSym)) {
          seen.add(bSym);
          assets.push({
            brokerSym: bSym,
            sym: resolveBrokerSymClient(bSym),
            name: bSym,
            side: isShort ? 'SHORT' : 'LONG',
            units: n1,
            avgOpen: n2,
            sl: slM ? pfParseNum(slM[1]) : null,
            tp: tpM ? pfParseNum(tpM[1]) : null,
            lots: []
          });
          continue;
        }
      }
    }

    // Multiline eToro Overview fallback: scan blocks starting with a ticker line + units + Long/Short + avgOpen
    if (assets.length === 0) {
      for (let i = 0; i < lines.length; i++) {
        const cur = lines[i].replace(/\s+24\/[57]$/i, '').trim();
        const tkMatch = cur.match(/^([A-Z][A-Z0-9.\-]{0,14}(?:\.(?:24-7|24-5))?)$/);
        if (!tkMatch) continue;
        const bSym = tkMatch[1].toUpperCase();
        if (['LONG', 'SHORT', 'CLOSE', 'TRADE', 'PRICE', 'UNITS', 'BUY', 'SELL', 'CFD'].includes(bSym)) continue;
        const block = lines.slice(i + 1, Math.min(lines.length, i + 10));
        const dirIdx = block.findIndex(x => /^(Long|Short)$/i.test(x));
        if (dirIdx >= 1) {
          const side = /^Short$/i.test(block[dirIdx]) ? 'SHORT' : 'LONG';
          const units = pfParseNum(block[dirIdx - 1]);
          const avgOpen = pfParseNum(block[dirIdx + 1]);
          const pnlDollar = pfParseNum((block.find(x => /^[-+]?\$[\d,.]+$/.test(x)) || ''));
          const pnlPctStr = block.find(x => /^[-+]?[\d,.]+%$/.test(x));
          const pnlPct = pnlPctStr ? pfParseNum(pnlPctStr.replace('%', '')) : null;
          const maybeName = (block[0] && !/^[-+]?\$?\d/.test(block[0])) ? block[0] : bSym;
          const maybePrice = pfParseNum(block.find(x => /^\d[\d,.]*$/.test(x) && x !== block[dirIdx - 1] && x !== block[dirIdx + 1]));
          if (units > 0 && avgOpen !== null && !seen.has(bSym)) {
            seen.add(bSym);
            assets.push({
              brokerSym: bSym,
              sym: resolveBrokerSymClient(bSym, maybeName),
              name: maybeName,
              side,
              units,
              avgOpen,
              brokerPrice: maybePrice,
              brokerPnl: pnlDollar,
              brokerPnlPct: pnlPct,
              is24_5: /24\/?5/.test(lines[i]) || (block[0] || '').includes('24/5'),
              is24_7: /24-7/.test(bSym),
              lots: []
            });
          }
        }
      }
    }

    if (assets.length === 0 && invMatch && netMatch) {
      const targetS = resolveBrokerSymClient(detectedLotSym || 'SIMBOL', detectedLotName);
      assets.push({
        brokerSym: detectedLotSym || targetS,
        sym: targetS,
        name: detectedLotName || targetS,
        side: 'LONG',
        units: pfParseNum(invMatch[1]),
        avgOpen: pfParseNum(invMatch[2]),
        brokerNetValue: pfParseNum(netMatch[1]),
        lots: []
      });
    }

    if (assets.length === 0) {
      return {
        ok: false,
        error: 'Nu am detectat poziții valide. Încearcă format: `APPS 4030.21 @ 10.61 SL 6.90`, CSV (`SIMBOL, UNITĂȚI, PREȚ`), sau copy-paste direct din eToro.'
      };
    }

    return { ok: true, kind: 'assets', assets, meta };
  }

  async function evaluatePortfolioClientFallback(pf) {
    const assets = Array.isArray(pf?.assets) ? pf.assets : [];
    const syms = Array.from(new Set(assets.map(a => String(a.sym || a.brokerSym || '').toUpperCase()).filter(Boolean)));
    const qMap = new Map();
    if (syms.length) {
      try {
        const res = await apiGet(`/proxy?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms.join(',')}`)}`);
        for (const q of (res?.quoteResponse?.result || [])) {
          if (q?.symbol) qMap.set(String(q.symbol).toUpperCase(), q);
        }
      } catch (_) { }
    }
    let totalNet = 0, totalInv = 0, totalNotional = 0, totalPnl = 0, totalDaily = 0;
    const rows = assets.map(a => {
      const sym = String(a.sym || a.brokerSym || '').toUpperCase();
      const q = qMap.get(sym) || {};
      const liveP = Number(q.regularMarketPrice) || Number(a.brokerPrice) || Number(a.avgOpen) || 0;
      const prevC = Number(q.regularMarketPreviousClose) || liveP;
      const sign = a.side === 'SHORT' ? -1 : 1;
      const units = Number(a.units) || 0;
      const avgOpen = Number(a.avgOpen) || 0;
      const livePnl = units * (liveP - avgOpen) * sign;
      const notional = units * liveP;
      const inv = Number(a.invested) || (a.brokerNetValue && a.brokerPnl != null ? Math.max(0, a.brokerNetValue - a.brokerPnl) : units * avgOpen);
      const netVal = a.isCfd ? Math.max(0, inv + livePnl) : notional;
      const pnlPct = inv > 0 ? (livePnl / inv) * 100 : 0;
      const dPnl = units * (liveP - prevC) * sign;
      totalNet += netVal;
      totalInv += inv;
      totalNotional += notional;
      totalPnl += livePnl;
      totalDaily += dPnl;
      return {
        ...a,
        sym,
        livePrice: liveP,
        regPrice: liveP,
        dayChgPct: q.regularMarketChangePercent || 0,
        investedCapital: Number(inv.toFixed(2)),
        notionalValue: Number(notional.toFixed(2)),
        netValue: Number(netVal.toFixed(2)),
        livePnl: Number(livePnl.toFixed(2)),
        livePnlPct: Number(pnlPct.toFixed(2)),
        dailyPnl: Number(dPnl.toFixed(2)),
        lotsCount: (a.lots || []).length,
        lotInsights: (a.lots || []).map(l => ({
          ...l,
          livePnl: Number((l.units * (liveP - l.open) * (l.side === 'SHORT' ? -1 : 1)).toFixed(2)),
          slDistPct: l.sl && liveP > 0 ? Number((((liveP - l.sl) / liveP) * 100).toFixed(2)) : null,
          riskState: (l.sl && liveP > 0 && (((liveP - l.sl) / liveP) * 100) <= 4) ? 'CRITICAL_SL' : 'OK',
          hint: 'Date fundamentale/opțiuni indisponibile offline.'
        })),
        concentrationPct: 0,
        minSlDistPct: null,
        criticalSlLotsCount: 0,
        recommendation: { actionBadge: 'LIVE QUOTE', severity: 'neutral', headline: 'Cotație live activă (mod minimal fără server SEC/Opțiuni).', reasons: [], levels: {} }
      };
    });
    rows.forEach(r => { r.concentrationPct = totalNet > 0 ? Number(((r.netValue / totalNet) * 100).toFixed(1)) : 0; });
    return {
      ok: true,
      empty: rows.length === 0,
      updatedTimeRo: new Date().toLocaleTimeString('ro-RO', { hour12: false }),
      healthScore: 60,
      healthLabel: 'MOD LIVE CLIENT',
      totals: {
        assetsCount: rows.length,
        totalLotsCount: rows.reduce((s, r) => s + r.lotsCount, 0),
        cfdLotsCount: rows.filter(r => r.isCfd).length,
        totalInvestedMargin: Number(totalInv.toFixed(2)),
        totalNotional: Number(totalNotional.toFixed(2)),
        totalNetValue: Number(totalNet.toFixed(2)),
        cashAvailable: pf?.cashAvailable ?? null,
        totalAccountEquity: Number((totalNet + (Number(pf?.cashAvailable) || 0)).toFixed(2)),
        totalLivePnl: Number(totalPnl.toFixed(2)),
        totalLivePnlPct: totalInv > 0 ? Number(((totalPnl / totalInv) * 100).toFixed(2)) : 0,
        totalDailyPnl: Number(totalDaily.toFixed(2)),
        effectiveLeverage: totalNet > 0 ? Number((totalNotional / totalNet).toFixed(2)) : 1,
        top2ConcentrationPct: 0,
        criticalSlLotsTotal: 0,
        zombieAssetsCount: 0
      },
      priorityActions: [],
      evaluatedAssets: rows
    };
  }

  async function renderRealPortfolioView(force = false, silent = false) {
    const stage = document.getElementById('intelStage');
    const curUser = bridge().getUser?.();
    if (!stage) return;

    if (!curUser) {
      stage.innerHTML = `
        <div class="intel-head">
          <div class="intel-title-grp">
            <div class="intel-h1">Portofoliu Real · Autentificare Necesară</div>
            <div class="intel-sub">Datele contului sunt izolate strict per utilizator.</div>
          </div>
        </div>
      `;
      return;
    }

    let pf = bridge().getRealPortfolio?.();
    if (!pf || !Array.isArray(pf.assets) || pf.assets.length === 0 || force) {
      try {
        const fetchedPf = await bridge().fetchRealPortfolio?.();
        if (fetchedPf && (Array.isArray(fetchedPf.assets) && fetchedPf.assets.length > 0 || !pf)) {
          pf = fetchedPf;
        }
      } catch (_) { }
    }
    pf = (pf && typeof pf === 'object') ? pf : { broker: 'eToro', currency: 'USD', cashAvailable: null, accountEquity: null, notes: '', assets: [] };

    if (!force && stateIntel.pfEvalData && Date.now() - stateIntel.pfEvalTs < 35000 && pf.assets?.length > 0) {
      renderRealPortfolioStageFromData(pf, stateIntel.pfEvalData);
      return;
    }

    if (!silent && !stateIntel.pfEvalData) {
      renderLoadingState(
        `Portofoliu Real · @${curUser.username}`,
        `Se încarcă cotațiile live, analiza tehnică zilnică, SEC EDGAR, CBOE Options și auditul pe ${pf.assets?.length || 0} active...`
      );
    }

    try {
      let evalData;
      try {
        const tok = bridge().getAuthToken?.() || localStorage.getItem('tp_auth_token_v1') || '';
        const res = await fetch('/api/intel/portfolio-evaluate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(tok ? { Authorization: `Bearer ${tok}` } : {})
          },
          cache: 'no-store',
          body: JSON.stringify({ realPortfolio: pf })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        evalData = await res.json();
        if (evalData?.syncedPortfolio?.assets?.length && (!pf.assets || pf.assets.length === 0)) {
          pf = evalData.syncedPortfolio;
          try { await bridge().saveRealPortfolio?.(pf); } catch (_) {}
        }
      } catch (_) {
        evalData = await evaluatePortfolioClientFallback(pf);
      }
      if (stateIntel.view !== 'portfolio') return;
      try {
        const tokEt = bridge().getAuthToken?.() || localStorage.getItem('tp_auth_token_v1') || '';
        const etRes = await fetch('/api/etoro/status', {
          cache: 'no-store',
          headers: tokEt ? { Authorization: `Bearer ${tokEt}` } : {}
        });
        if (etRes.ok) stateIntel.etoroStatus = await etRes.json();
      } catch (_) { }

      const nextFlash = {};
      const nextPrev = { ...(stateIntel.prevPriceMap || {}) };
      for (const row of (evalData?.evaluatedAssets || [])) {
        const key = row.brokerSym || row.id;
        const old = nextPrev[key];
        if (old) {
          if (Number(row.livePrice) > Number(old.livePrice)) {
            nextFlash[key] = 'pf-tick-up';
          } else if (Number(row.livePrice) < Number(old.livePrice)) {
            nextFlash[key] = 'pf-tick-dn';
          }
        }
        nextPrev[key] = { livePrice: row.livePrice, livePnl: row.livePnl };
      }
      stateIntel.prevPriceMap = nextPrev;
      stateIntel.tickFlashMap = nextFlash;

      stateIntel.pfEvalData = evalData;
      stateIntel.pfEvalTs = Date.now();
      try {
        bridge().ingestPortfolioQuotes?.(evalData?.evaluatedAssets || []);
      } catch (_) { }
      const prevScroll = stage.scrollTop;
      renderRealPortfolioStageFromData(pf, evalData);
      if (silent && prevScroll > 0) {
        stage.scrollTop = prevScroll;
      }
    } catch (e) {
      if (!silent) {
        stage.innerHTML = `<div class="intel-card" style="padding:20px;color:var(--tv-red);">Eroare evaluare portofoliu: ${esc(e.message)}</div>`;
      }
    }
  }

  function defaultCalcInputsForRow(r, rawAsset) {
    if (!r) return { sl: '', tp: '' };
    const lots = rawAsset?.lots || r.lotInsights || [];
    const lp = Number(r.livePrice || r.avgOpen || 1);
    const dec = lp >= 1 ? 2 : 4;
    const validSls = lots.map(l => Number(l.sl)).filter(v => Number.isFinite(v) && v > 0);
    let pickSl = rawAsset?.sl ?? r.recommendation?.levels?.suggestedSl;
    if (validSls.length > 0) {
      // If most lots share a target SL (e.g. 14 lots at 3.60 and 1 lot at 3.62), default to the lowest/target SL (3.60) so the user immediately sees the cost to align the remaining lot(s)
      const minSl = Math.min(...validSls);
      const maxSl = Math.max(...validSls);
      pickSl = minSl !== maxSl ? minSl : validSls[0];
    }
    const firstTp = lots.find(l => l.tp != null && Number(l.tp) > 0)?.tp ?? rawAsset?.tp ?? r.recommendation?.levels?.trimZone;
    return {
      sl: (pickSl != null && Number(pickSl) > 0) ? Number(pickSl).toFixed(dec) : '',
      tp: (firstTp != null && Number(firstTp) > 0) ? Number(firstTp).toFixed(dec) : ''
    };
  }

  function computeSlTpSimulation(r, rawAsset, rawSlVal, rawTpVal, cashVal = null) {
    if (!r) return null;
    const lpRef = Number(r.livePrice || r.avgOpen || 1);
    const dec = lpRef >= 1 ? 2 : 4;
    const rawTargetSl = pfParseNum(rawSlVal);
    const rawTargetTp = pfParseNum(rawTpVal);
    const targetSl = rawTargetSl !== null && rawTargetSl > 0 ? Number(rawTargetSl.toFixed(dec)) : null;
    const targetTp = rawTargetTp !== null && rawTargetTp > 0 ? Number(rawTargetTp.toFixed(dec)) : null;
    const hasSl = targetSl !== null && targetSl > 0;
    const hasTp = targetTp !== null && targetTp > 0;
    const cashAvail = (cashVal !== null && Number.isFinite(Number(cashVal)) && String(cashVal).trim() !== '') ? Number(Number(cashVal).toFixed(2)) : null;
    const liveP = Number(r.livePrice || 0);
    const rawLotsById = new Map(((rawAsset && rawAsset.lots) || []).map(x => [String(x.id), x]));
    const srcLots = (r.lotInsights && r.lotInsights.length)
      ? r.lotInsights
      : ((rawAsset?.lots && rawAsset.lots.length)
        ? rawAsset.lots
        : [{
          id: 'single',
          openedAt: 'Poziție unică',
          type: r.isCfd ? (r.side === 'SHORT' ? 'Sell CFD' : 'Buy CFD') : 'Buy Spot',
          side: r.side || 'LONG',
          isCfd: !!r.isCfd,
          units: Number(r.units || 0),
          open: Number(r.avgOpen || 0),
          sl: rawAsset?.sl ?? null,
          tp: rawAsset?.tp ?? null
        }]);

    let extraCashTotal = 0;
    let cfdUnits = 0;
    let cfdLotsCount = 0;
    let changedLotsCount = 0;
    let changedUnits = 0;
    let minOldSl = null;
    let maxOldSl = null;
    let cfdWeightedOldSlSum = 0;
    let totalUnits = 0;
    let totalPnlAtSl = 0;
    let totalLossAtOldSl = 0;
    let hasAllOldSl = true;
    let usedFallbackOpen = false;
    let totalPnlAtTp = 0;
    let totalGainFromLiveTp = 0;
    const lotRows = [];

    for (const l of srcLots) {
      const units = Number(l.units || 0);
      if (units <= 0) continue;
      const rawLot = rawLotsById.get(String(l.id)) || l;
      const isCfd = Boolean(rawLot.isCfd ?? l.isCfd);
      const lev = Number(rawLot.leverage || l.leverage || (isCfd ? 5 : 1));
      const lotInv = Number(rawLot.invested ?? l.invested ?? 0);
      const isShort = (l.side || r.side) === 'SHORT';
      const sign = isShort ? -1 : 1;
      const open = Number(l.open ?? r.avgOpen ?? 0);
      const oldSl = (l.sl != null && Number(l.sl) > 0) ? Number(Number(l.sl).toFixed(dec)) : null;
      const refSl = oldSl != null ? oldSl : (open > 0 ? open : liveP);
      if (oldSl == null && isCfd) usedFallbackOpen = true;
      if (oldSl == null) hasAllOldSl = false;

      let lotExtra = 0;
      let lotPnlSl = null;
      if (hasSl) {
        lotPnlSl = Number(((targetSl - open) * sign * units).toFixed(2));
        totalPnlAtSl += lotPnlSl;
        if (isCfd) {
          cfdUnits += units;
          cfdLotsCount += 1;
          cfdWeightedOldSlSum += refSl * units;
          if (oldSl != null) {
            if (minOldSl === null || oldSl < minOldSl) minOldSl = oldSl;
            if (maxOldSl === null || oldSl > maxOldSl) maxOldSl = oldSl;
          }
          // Exact eToro CFD margin formula: invested(sl) = units * (open - sl) * sign + 0.5 * initMargin
          const initMargin = (units * open) / (lev > 1 ? lev : 5);
          if (Math.abs(refSl - targetSl) < 1e-6) {
            lotExtra = 0;
          } else if (lotInv > 0 && oldSl != null && lev > 1) {
            const newLotInv = Math.max(initMargin, Number((units * (open - targetSl) * sign + 0.5 * initMargin).toFixed(2)));
            lotExtra = Number((newLotInv - lotInv).toFixed(2));
          } else {
            lotExtra = Number(((refSl - targetSl) * sign * units).toFixed(2));
          }
          if (Math.abs(lotExtra) >= 0.01) {
            changedLotsCount += 1;
            changedUnits += units;
          }
          extraCashTotal = Number((extraCashTotal + lotExtra).toFixed(2));
        }
      }
      if (oldSl != null) {
        totalLossAtOldSl = Number((totalLossAtOldSl + (oldSl - open) * sign * units).toFixed(2));
      }

      let lotPnlTp = null;
      if (hasTp) {
        lotPnlTp = Number(((targetTp - open) * sign * units).toFixed(2));
        totalPnlAtTp = Number((totalPnlAtTp + lotPnlTp).toFixed(2));
        if (liveP > 0) {
          totalGainFromLiveTp = Number((totalGainFromLiveTp + (targetTp - liveP) * sign * units).toFixed(2));
        }
      }

      totalUnits += units;
      lotRows.push({
        id: l.id,
        openedAt: l.openedAt || '—',
        type: l.type || (isCfd ? 'Buy CFD' : 'Buy Spot'),
        isCfd,
        units,
        open,
        oldSl,
        lotExtra,
        lotPnlSl,
        lotPnlTp
      });
    }

    const baseInvested = Number(r.investedCapital || 0) > 0 ? Number(r.investedCapital) : Number(r.notionalValue || 0);
    const totalCapitalAfter = Math.max(0, Number((baseInvested + (hasSl ? extraCashTotal : 0)).toFixed(2)));
    const cashAfter = (cashAvail !== null && hasSl) ? Number((cashAvail - extraCashTotal).toFixed(2)) : null;
    const avgRefSl = cfdUnits > 0 ? (cfdWeightedOldSlSum / cfdUnits) : null;

    const mainSign = r.side === 'SHORT' ? -1 : 1;
    const slDistPct = (hasSl && liveP > 0) ? (((liveP - targetSl) * mainSign) / liveP) * 100 : null;
    const tpDistPct = (hasTp && liveP > 0) ? (((targetTp - liveP) * mainSign) / liveP) * 100 : null;
    const atr = Number(r.tech?.atr14 || 0);
    const slAtrMult = (hasSl && liveP > 0 && atr > 0) ? (((liveP - targetSl) * mainSign) / atr) : null;

    let maxAffordableSl = null;
    if (hasSl && cfdUnits > 0 && avgRefSl != null && cashAvail !== null && cashAvail >= 0 && extraCashTotal > cashAvail) {
      const factor = liveP >= 1 ? 100 : 10000;
      const stepUnit = 1 / factor;
      // Exact 2-decimal (or 4-decimal) lot-by-lot search so the suggested SL never exceeds cashAvail in eToro
      const startSl = maxOldSl != null ? maxOldSl : Number(avgRefSl.toFixed(dec));
      let bestCand = startSl;
      for (let k = 0; k <= 5000; k++) {
        const cand = Number((startSl - mainSign * k * stepUnit).toFixed(dec));
        if (cand <= 0) break;
        let candExtra = 0;
        for (const lr of lotRows) {
          if (!lr.isCfd) continue;
          const rSl = lr.oldSl != null ? lr.oldSl : lr.open;
          candExtra += (rSl - cand) * mainSign * lr.units;
        }
        if (Number(candExtra.toFixed(2)) <= cashAvail + 1e-6) {
          bestCand = cand;
        } else {
          break;
        }
      }
      maxAffordableSl = bestCand;
    }

    let rrRatio = null;
    if (hasSl && hasTp && liveP > 0) {
      const riskFromLive = (liveP - targetSl) * mainSign;
      const rewFromLive = (targetTp - liveP) * mainSign;
      if (riskFromLive > 0 && rewFromLive > 0) rrRatio = rewFromLive / riskFromLive;
    }

    const warnings = [];
    if (hasSl && liveP > 0) {
      if (r.side !== 'SHORT' && targetSl >= liveP) {
        warnings.push(`Stop-Loss ales ($${fmtPx(targetSl)}) este egal sau peste prețul live ($${fmtPx(liveP)}) — o poziție LONG s-ar închide imediat la piață.`);
      } else if (r.side === 'SHORT' && targetSl <= liveP) {
        warnings.push(`Stop-Loss ales ($${fmtPx(targetSl)}) este sub sau egal cu prețul live ($${fmtPx(liveP)}) — o poziție SHORT s-ar închide imediat.`);
      }
    }
    if (hasTp && liveP > 0) {
      if (r.side !== 'SHORT' && targetTp <= liveP) {
        warnings.push(`Take-Profit ales ($${fmtPx(targetTp)}) este sub sau egal cu prețul live ($${fmtPx(liveP)}) — o poziție LONG s-ar executa imediat.`);
      } else if (r.side === 'SHORT' && targetTp >= liveP) {
        warnings.push(`Take-Profit ales ($${fmtPx(targetTp)}) este peste prețul live ($${fmtPx(liveP)}) — o poziție SHORT s-ar executa imediat.`);
      }
    }
    if (hasSl && usedFallbackOpen) {
      warnings.push('Unele loturi CFD nu au un SL anterior salvat — diferența de cash pentru ele este estimată față de prețul de Open.');
    }

    return {
      hasSl,
      hasTp,
      targetSl,
      targetTp,
      liveP,
      totalUnits,
      cfdUnits,
      cfdLotsCount,
      changedLotsCount,
      changedUnits,
      minOldSl,
      maxOldSl,
      baseInvested,
      extraCashTotal,
      totalCapitalAfter,
      cashAvail,
      cashAfter,
      avgRefSl,
      maxAffordableSl,
      totalPnlAtSl,
      totalLossAtOldSl: hasAllOldSl ? totalLossAtOldSl : null,
      slDistPct,
      slAtrMult,
      totalPnlAtTp,
      totalGainFromLiveTp,
      tpDistPct,
      rrRatio,
      warnings,
      lotRows
    };
  }

  function renderSlTpCalcResultHtml(r, sim, showLots = false, confirmApply = false) {
    if (!r || !sim) return '<div style="font-size:12px;color:var(--text-dim);">Selectează un simbol și introdu un SL sau TP.</div>';
    const hasCfd = sim.cfdUnits > 0;
    let extraLabel = '$0.00';
    let extraCls = '';
    let heroClass = '';
    let extraSub = 'Introdu SL mai sus';
    const hasMixedOldSl = sim.minOldSl !== null && sim.maxOldSl !== null && Math.abs(sim.maxOldSl - sim.minOldSl) > 1e-4;
    const oldSlRangeStr = hasMixedOldSl
      ? `$${fmtPx(sim.minOldSl)}–$${fmtPx(sim.maxOldSl)}`
      : (sim.avgRefSl ? `$${fmtPx(sim.avgRefSl)}` : '');

    if (sim.hasSl) {
      if (!hasCfd) {
        extraLabel = '$0.00';
        extraCls = 'up';
        heroClass = 'is-hero-ok';
        extraSub = 'Spot (fără levier)';
      } else if (sim.extraCashTotal > 0.005) {
        extraLabel = `+${pfFmtUsd(sim.extraCashTotal)}`;
        extraCls = 'amber';
        heroClass = 'is-hero';
        const lotInfo = (hasMixedOldSl && sim.changedLotsCount > 0 && sim.changedLotsCount < sim.cfdLotsCount)
          ? ` (${sim.changedLotsCount}/${sim.cfdLotsCount} lot. · ${Number(sim.changedUnits).toLocaleString('en-US', { maximumFractionDigits: 2 })} u.)`
          : '';
        extraSub = oldSlRangeStr ? `SL ${oldSlRangeStr} → $${fmtPx(sim.targetSl)}${lotInfo}` : `SL → $${fmtPx(sim.targetSl)}`;
      } else if (sim.extraCashTotal < -0.005) {
        extraLabel = `-${pfFmtUsd(Math.abs(sim.extraCashTotal))}`;
        extraCls = 'up';
        heroClass = 'is-hero-ok';
        extraSub = oldSlRangeStr ? `Eliberat (${oldSlRangeStr} → $${fmtPx(sim.targetSl)})` : 'Cash eliberat';
      } else {
        extraLabel = '$0.00';
        extraCls = 'up';
        heroClass = 'is-hero-ok';
        extraSub = 'Același SL pe toate loturile';
      }
    }

    let cashCheckHtml = '';
    if (sim.cashAfter !== null) {
      if (sim.cashAfter >= 0) {
        cashCheckHtml = `<div style="margin-top:3px;font-weight:700;" class="up">Rămân ${pfFmtUsd(sim.cashAfter)} în Cash Trading</div>`;
      } else {
        const miss = Math.abs(sim.cashAfter);
        cashCheckHtml = `<div style="margin-top:3px;font-weight:700;" class="dn">Lipsesc ${pfFmtUsd(miss)} în Cash Trading${sim.maxAffordableSl ? ` (maxim permis: $${fmtPx(sim.maxAffordableSl)})` : ''}</div>`;
      }
    }

    const slPnlCls = sim.hasSl ? (sim.totalPnlAtSl >= 0 ? 'up' : 'dn') : '';
    const tpPnlCls = sim.hasTp ? (sim.totalPnlAtTp >= 0 ? 'up' : 'dn') : '';
    const tpROI = (sim.hasTp && sim.totalCapitalAfter > 0) ? (sim.totalPnlAtTp / sim.totalCapitalAfter) * 100 : null;

    return `
      <div class="pf-calc-kpi-grid">
        <div class="pf-calc-kpi">
          <div class="pf-calc-k">Bani Necesari în Plus (SL)</div>
          <div class="pf-calc-v tabular ${extraCls}">${extraLabel}</div>
          <div class="pf-calc-sub">${extraSub}${cashCheckHtml}</div>
        </div>
        <div class="pf-calc-kpi">
          <div class="pf-calc-k">Total Blocat (${esc(r.brokerSym)})</div>
          <div class="pf-calc-v tabular">${pfFmtUsd(sim.totalCapitalAfter)}</div>
          <div class="pf-calc-sub">Investit acum: <b>${pfFmtUsd(sim.baseInvested)}</b> · ${Number(sim.totalUnits).toLocaleString('en-US', { maximumFractionDigits: 2 })} u.</div>
        </div>
        <div class="pf-calc-kpi">
          <div class="pf-calc-k">Pierdere la SL ${sim.hasSl ? `($${fmtPx(sim.targetSl)})` : ''}</div>
          <div class="pf-calc-v tabular ${slPnlCls}">${sim.hasSl ? pfFmtUsd(sim.totalPnlAtSl, true) : '—'}</div>
          <div class="pf-calc-sub">${sim.hasSl ? `Distanță live: <b>${sim.slDistPct != null ? `${sim.slDistPct.toFixed(1)}%` : '—'}</b>${sim.totalLossAtOldSl != null ? ` · Vechi: ${pfFmtUsd(sim.totalLossAtOldSl, true)}` : ''}` : 'Fără SL introdus'}</div>
        </div>
        <div class="pf-calc-kpi">
          <div class="pf-calc-k">P&amp;L la TP ${sim.hasTp ? `($${fmtPx(sim.targetTp)})` : ''}</div>
          <div class="pf-calc-v tabular ${tpPnlCls}">${sim.hasTp ? `${pfFmtUsd(sim.totalPnlAtTp, true)}${tpROI != null ? ` <small>(${fmtPct(tpROI)})</small>` : ''}` : '—'}</div>
          <div class="pf-calc-sub">${sim.hasTp ? `De la live: <b>${pfFmtUsd(sim.totalGainFromLiveTp, true)}</b>${sim.rrRatio != null ? ` · R:R <b>${sim.rrRatio.toFixed(1)}:1</b>` : ''}` : 'Fără TP introdus'}</div>
        </div>
      </div>

      ${sim.warnings.length ? `
        <div class="pf-calc-warn">
          ${sim.warnings.map(w => `<div>• ${esc(w)}</div>`).join('')}
        </div>
      ` : ''}

      <div class="pf-calc-foot">
        <div style="display:flex;gap:8px;align-items:center;">
          ${sim.lotRows.length > 1 ? `<button type="button" id="pfCalcToggleLots" class="pf-ico-btn" title="${showLots ? 'Ascunde tabelul pe loturi' : 'Vezi tabelul pe loturi'}">${ICO.layers}<span>${sim.lotRows.length}</span></button>` : ''}
        </div>
        ${(sim.hasSl || sim.hasTp) ? `
          <div style="display:flex;gap:6px;align-items:center;">
            ${confirmApply ? `
              <button type="button" id="pfCalcApplyConfirm" class="intel-chip-btn active" style="height:30px;" title="Confirmă salvarea în baza de date">${ICO.check}<span>Confirmă Bulk (${sim.lotRows.length} lot.)</span></button>
              <button type="button" id="pfCalcApplyCancel" class="pf-ico-btn" title="Anulează">${ICO.close}</button>
            ` : `<button type="button" id="pfCalcApplyBtn" class="adm-btn-xs" title="Aplică acest SL / TP în bulk pe toate loturile simbolului">${ICO.check}<span>Aplică Bulk (${sim.lotRows.length} lot.)</span></button>`}
          </div>
        ` : ''}
      </div>

      ${(showLots && sim.lotRows.length > 1) ? `
        <div class="adm-table-wrap" style="margin-top:9px;">
          <table class="tv-table pf-lots-table">
            <thead>
              <tr>
                <th>Lot / Data</th>
                <th>Unități</th>
                <th>Open</th>
                <th>SL Vechi → Nou</th>
                <th>Bani în Plus</th>
                <th>P&amp;L la SL</th>
                <th>P&amp;L la TP</th>
              </tr>
            </thead>
            <tbody>
              ${sim.lotRows.map(lr => `
                <tr>
                  <td><b>${esc(lr.type)}</b> <small style="color:var(--text-dim);">${esc(lr.openedAt)}</small></td>
                  <td class="tabular">${lr.units.toLocaleString('en-US', { maximumFractionDigits: 5 })}</td>
                  <td class="tabular">${fmtPx(lr.open)}</td>
                  <td class="tabular">${lr.oldSl ? `$${fmtPx(lr.oldSl)}` : '—'} → ${sim.hasSl ? `<b>$${fmtPx(sim.targetSl)}</b>` : '—'}</td>
                  <td class="tabular ${!lr.isCfd ? 'up' : (lr.lotExtra > 0 ? 'amber' : (lr.lotExtra < 0 ? 'up' : ''))}">${!lr.isCfd ? '$0.00 (Spot)' : (sim.hasSl ? pfFmtUsd(lr.lotExtra, true) : '—')}</td>
                  <td class="tabular ${lr.lotPnlSl != null ? (lr.lotPnlSl >= 0 ? 'up' : 'dn') : ''}">${lr.lotPnlSl != null ? pfFmtUsd(lr.lotPnlSl, true) : '—'}</td>
                  <td class="tabular ${lr.lotPnlTp != null ? (lr.lotPnlTp >= 0 ? 'up' : 'dn') : ''}">${lr.lotPnlTp != null ? pfFmtUsd(lr.lotPnlTp, true) : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  function buildSmartPortfolioSignals(allRows, etSt) {
    const signals = [];
    const bySymBadge = {};
    for (const r of (allRows || [])) {
      const sym = r.brokerSym || r.sym;
      const lp = Number(r.livePrice || 0);
      const dayChg = Number(r.dayChgPct || 0);
      const slDist = r.minSlDistPct != null ? Number(r.minSlDistPct) : null;
      const firstSl = (r.lotInsights || []).find(l => l.sl)?.sl ?? r.sl;
      const rsi = r.tech?.rsi14 != null ? Number(r.tech.rsi14) : null;
      const sup1 = r.tech?.support1 != null ? Number(r.tech.support1) : null;
      const res1 = r.tech?.resistance1 != null ? Number(r.tech.resistance1) : null;

      if (slDist !== null && slDist <= 9.5 && firstSl) {
        const isCrit = slDist <= 5.5;
        const extra20c = Math.round(Number(r.units || 0) * 0.20);
        signals.push({
          key: `sl_${sym}_${isCrit ? 'crit' : 'warn'}`,
          sym,
          assetId: r.id,
          kind: 'SL_WARN',
          tone: isCrit ? 'crit' : 'warn',
          badge: isCrit ? `SL CRITIC (${slDist.toFixed(1)}%)` : `SL APROPIAT (${slDist.toFixed(1)}%)`,
          title: `${sym} este la doar ${slDist.toFixed(1)}% ($${Math.abs(lp - firstSl).toFixed(2)}) de Stop-Loss ($${fmtPx(firstSl)})`,
          detail: `Preț live $${fmtPx(lp)}. Pentru a coborî SL-ul cu încă $0.20 pe toate cele ${Number(r.units).toLocaleString('en-US', { maximumFractionDigits: 0 })} unități sunt necesari ~$${extra20c}.`
        });
      }

      const nearSupport = sup1 && lp > 0 && ((lp - sup1) / lp) <= 0.045 && ((lp - sup1) / lp) >= -0.02;
      if ((rsi !== null && rsi <= 40) || nearSupport || dayChg <= -3.0) {
        const addUnits = lp < 15 ? 200 : 15;
        const newAvg = (r.units > 0 && r.avgOpen > 0)
          ? ((r.units * r.avgOpen + addUnits * lp) / (r.units + addUnits))
          : lp;
        const reasonParts = [];
        if (dayChg <= -2.0) reasonParts.push(`corecție azi ${fmtPct(dayChg)}`);
        if (rsi !== null && rsi <= 42) reasonParts.push(`RSI ${rsi.toFixed(0)} (supravândut)`);
        if (sup1) reasonParts.push(`suport tehnic S1 la $${fmtPx(sup1)}`);
        signals.push({
          key: `dip_${sym}`,
          sym,
          assetId: r.id,
          kind: 'BUY_DIP',
          tone: 'up',
          badge: 'OPORTUNITATE DCA / SUPORT',
          title: `${sym} ($${fmtPx(lp)}) — Zonă de suport / acumulare (${reasonParts.join(' · ') || 'pullback tehnic'})`,
          detail: `Media ta actuală este $${fmtPx(r.avgOpen)}. O intrare de +${addUnits} u. la $${fmtPx(lp)} (cost ~$${(addUnits * lp / (r.isCfd ? 5 : 1)).toFixed(0)} CFD 5x) ar coborî media la $${fmtPx(newAvg)}.`
        });
      }

      if (dayChg >= 1.8) {
        signals.push({
          key: `surge_${sym}`,
          sym,
          assetId: r.id,
          kind: 'SURGE',
          tone: 'up',
          badge: `IMPULS ${fmtPct(dayChg)}`,
          title: `${sym} urcă puternic azi (${fmtPct(dayChg)} la $${fmtPx(lp)})`,
          detail: res1
            ? `Prima rezistență tehnică (R1) este la $${fmtPx(res1)}. Poți ridica SL-ul dacă depășește rezistența.`
            : `Impuls pozitiv intraday (+$${fmtPx(r.dailyPnl || 0)} azi).`
        });
      }
    }
    return { signals, bySymBadge };
  }

  async function pushSmartSignalsToTelegram(signals, manual = false) {
    if (!manual) return { ok: true, skipped: true };
    if (!signals || !signals.length) return { ok: false, error: 'Nicio alertă activă.' };
    const toSend = signals.slice(0, 8);
    if (!toSend.length) return { ok: true, skipped: true };
    const lines = toSend.map(s => `• <b>${esc(s.badge)}</b> — <b>${esc(s.title)}</b>\n  <i>${esc(s.detail)}</i>`);
    const html = `<b>TradePro · Radar Smart Portofoliu (@jeka7ro)</b>\n\n${lines.join('\n\n')}`;
    const r = await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'manual',
        explicitUserClick: true,
        allowClosedMarket: true,
        summary: `Alerte Smart Portofoliu (${toSend.length})`,
        html
      })
    });
    return r.json();
  }

  function renderRealPortfolioStageFromData(pf, evalData) {
    const stage = document.getElementById('intelStage');
    const curUser = bridge().getUser?.();
    if (!stage || !evalData) return;

    const t = evalData.totals || {};
    const allRows = Array.isArray(evalData.evaluatedAssets) ? evalData.evaluatedAssets : [];
    const flt = stateIntel.pfFilter || 'all';
    const srt = stateIntel.pfSort || 'notional';
    const srtDir = stateIntel.pfSortDir === 'asc' ? 1 : -1;

    const rows = allRows.filter(r => {
      if (flt === 'critical') return r.criticalSlLotsCount > 0 || r.recommendation?.severity === 'critical' || r.recommendation?.severity === 'warn';
      if (flt === 'cfd') return r.isCfd;
      if (flt === 'losers') return r.livePnl < 0;
      if (flt === 'winners') return r.livePnl >= 0;
      return true;
    }).sort((a, b) => {
      if (srt === 'sym') return srtDir * String(a.brokerSym || '').localeCompare(String(b.brokerSym || ''));
      if (srt === 'livePrice') return srtDir * ((Number(a.livePrice) || 0) - (Number(b.livePrice) || 0));
      if (srt === 'units') return srtDir * ((Number(a.units) || 0) - (Number(b.units) || 0));
      if (srt === 'netValue') return srtDir * ((Number(a.netValue) || 0) - (Number(b.netValue) || 0));
      if (srt === 'invested') return srtDir * ((Number(a.investedCapital) || 0) - (Number(b.investedCapital) || 0));
      if (srt === 'dailyPnl') return srtDir * ((Number(a.dailyPnl) || 0) - (Number(b.dailyPnl) || 0));
      if (srt === 'pnlAsc' || srt === 'livePnl') return srtDir * ((Number(a.livePnl) || 0) - (Number(b.livePnl) || 0));
      if (srt === 'lotsCount') return srtDir * ((Number(a.lotsCount) || 0) - (Number(b.lotsCount) || 0));
      if (srt === 'slDist') {
        const da = a.minSlDistPct ?? 9999;
        const db = b.minSlDistPct ?? 9999;
        return srtDir * (da - db);
      }
      return srtDir * ((Number(a.notionalValue) || 0) - (Number(b.notionalValue) || 0));
    });

    const editAsset = stateIntel.pfEditAssetId
      ? (pf.assets || []).find(a => a.id === stateIntel.pfEditAssetId || a.brokerSym === stateIntel.pfEditAssetId)
      : null;

    let calcRow = allRows.find(x => x.id === stateIntel.pfCalcAssetId || x.brokerSym === stateIntel.pfCalcAssetId);
    if (!calcRow && allRows.length) {
      calcRow = allRows.find(x => x.isCfd && x.lotsCount > 0) || allRows.find(x => x.isCfd) || allRows[0];
      stateIntel.pfCalcAssetId = calcRow.id;
      const calcRawInit = (pf.assets || []).find(a => a.id === calcRow.id || a.brokerSym === calcRow.brokerSym);
      const defs = defaultCalcInputsForRow(calcRow, calcRawInit);
      if (!stateIntel.pfCalcSlInput) stateIntel.pfCalcSlInput = defs.sl;
      if (!stateIntel.pfCalcTpInput) stateIntel.pfCalcTpInput = defs.tp;
    }
    const calcRawAsset = calcRow ? (pf.assets || []).find(a => a.id === calcRow.id || a.brokerSym === calcRow.brokerSym) : null;
    const defaultTradingCash = pf.tradingCash != null
      ? Number(pf.tradingCash).toFixed(2)
      : (pf.cashAvailable != null ? Number(pf.cashAvailable).toFixed(2) : '');
    const effectiveCashStr = stateIntel.pfCalcCashInput !== ''
      ? stateIntel.pfCalcCashInput
      : defaultTradingCash;
    const calcSim = calcRow
      ? computeSlTpSimulation(calcRow, calcRawAsset, stateIntel.pfCalcSlInput, stateIntel.pfCalcTpInput, effectiveCashStr)
      : null;

    const hScore = Number(evalData.healthScore ?? 100);
    const hCls = hScore <= 35 ? 'dn' : (hScore <= 60 ? 'amber' : 'up');
    const pnlCls = (t.totalLivePnl || 0) >= 0 ? 'up' : 'dn';
    const dayCls = (t.totalDailyPnl || 0) >= 0 ? 'up' : 'dn';

    const etSt = stateIntel.etoroStatus;
    const etConnState = etSt?.account?.status || 'Disconnected';
    const etDotCls = etConnState === 'Connected' ? 'up' : (etConnState === 'Error' ? 'crit' : (etConnState === 'Synchronizing' ? 'warn' : ''));
    const etLastSyncStr = etSt?.account?.lastSyncAt
      ? new Date(etSt.account.lastSyncAt).toLocaleTimeString('ro-RO', { hour12: false })
      : null;
    const smartPack = buildSmartPortfolioSignals(allRows, etSt);
    const smartSignals = smartPack.signals;
    const smartBySym = smartPack.bySymBadge;
    const hasCritSmart = smartSignals.some(s => s.tone === 'crit' || s.tone === 'warn');

    stage.innerHTML = `
      <div class="intel-head">
        <div class="intel-title-grp pf-title-with-av">
          ${String(curUser?.username || '').toLowerCase() === 'jeka7ro' ? `<img src="/avatar-jeka7ro.jpg" alt="@jeka7ro" class="pf-user-hdr-av" />` : ''}
          <div>
            <div class="intel-h1 pf-h1-with-etoro"><span>Portofoliu Real</span><img src="/logo?sym=ETORO" alt="eToro" class="pf-etoro-brand-ico" /><span>· @${esc(curUser?.username || 'cont')}</span></div>
            <div class="intel-sub">${esc(pf.broker || 'eToro')} · Actualizat ${esc(evalData.updatedTimeRo || '')}${etLastSyncStr ? ` · Sync eToro: ${esc(etLastSyncStr)}` : ''}</div>
          </div>
        </div>
        <div class="intel-controls">
          <button id="pfToggleSmartAlertsBtn" class="intel-chip-btn ${stateIntel.pfShowSmartAlerts ? 'active' : ''}" type="button" title="Alerte Smart Portofoliu: Stop-Loss, Moment Oportun Cumpărare (DCA), Creșteri/Scăderi &amp; Push Telegram">
            <span class="pf-status-dot ${hasCritSmart ? 'crit' : 'up'}"></span>
            <span>Alerte Smart (${smartSignals.length})</span>
          </button>
          <button id="pfToggleEtoroCfgBtn" class="intel-chip-btn ${stateIntel.pfShowEtoroConfig ? 'active' : ''}" type="button" title="Settings → Integrations → eToro (100% READ-ONLY)">
            <span class="pf-status-dot ${etDotCls}"></span>
            <span>eToro API: ${esc(etConnState)}</span>
          </button>
          ${allRows.length ? `<button id="pfToggleCalcBtn" class="intel-chip-btn ${stateIntel.pfShowCalc ? 'active' : ''}" type="button" title="Calculator SL / TP">${ICO.calc}<span>Calculator</span></button>` : ''}
          <button id="pfToggleImportBtn" class="intel-chip-btn ${stateIntel.pfShowImporter || !allRows.length ? 'active' : ''}" type="button" title="Importă din Broker">${ICO.plus}<span>Import</span></button>
          <button id="pfAddAssetBtn" class="pf-ico-btn" type="button" title="Adaugă poziție nouă">${ICO.plus}</button>
          <button id="pfRefreshBtn" class="pf-ico-btn" type="button" title="Re-evaluează Live">${ICO.refresh}</button>
          <button id="pfExportBtn" class="pf-ico-btn" type="button" title="Export JSON">${ICO.download}</button>
          <button class="pf-ico-btn" type="button" data-jumpchart="true" title="Înapoi la Grafic">${ICO.chart}</button>
        </div>
      </div>

      ${stateIntel.pfShowSmartAlerts ? `
        <div class="intel-card pf-smart-panel" style="margin-bottom:14px;">
          <div class="pf-sec-hdr">
            <div>
              <div class="pf-sec-title">Radar Smart &amp; Alerte Portofoliu (SL Warning · Moment Oportun Cumpărare / DCA · Impuls Live)</div>
              <div class="pf-sec-sub">Monitorizare automată la fiecare 4.5s pe cele ${allRows.length} active din portofoliul tău + Push direct pe <b>Telegram (@jeka7ro_bot)</b> și notificări browser.</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button id="pfAutoPushToggleBtn" type="button" class="adm-btn-xs ${stateIntel.pfAutoPushEnabled ? 'up' : ''}">
                <span class="pf-status-dot ${stateIntel.pfAutoPushEnabled ? 'up' : ''}"></span>
                <span>Auto-Push: ${stateIntel.pfAutoPushEnabled ? 'ON' : 'OFF'}</span>
              </button>
              <button id="pfPushTelegramNowBtn" type="button" class="intel-chip-btn active">Trimite Alertele pe Telegram</button>
              <button id="pfCloseSmartAlertsBtn" type="button" class="pf-ico-btn" title="Închide">${ICO.close}</button>
            </div>
          </div>
          <div class="pf-smart-list">
            ${smartSignals.map(s => `
              <div class="pf-smart-item tone-${esc(s.tone)}">
                <div class="pf-smart-top">
                  <span class="pf-smart-badge ${esc(s.tone)}">${esc(s.badge)}</span>
                  <span class="pf-smart-title">${esc(s.title)}</span>
                  <button type="button" class="adm-btn-xs pf-calc-sym-btn" data-pfcalc="${esc(s.assetId)}" style="margin-left:auto;">Simulează SL / DCA</button>
                </div>
                <div class="pf-smart-detail">${esc(s.detail)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${stateIntel.pfShowEtoroConfig ? `
        <div class="intel-card pf-importer-card" style="margin-bottom:14px;">
          <div class="pf-sec-hdr">
            <div>
              <div class="pf-sec-title">Settings → Integrations → eToro Public API (STRICT READ-ONLY)</div>
              <div class="pf-sec-sub">Status: <b>${esc(etConnState)}</b> · Permisiune: <b>READ-ONLY (doar GET)</b> · Cont: <b>REAL</b>${etLastSyncStr ? ` · Ultima sincronizare: <b>${esc(etLastSyncStr)}</b>` : ''}${etSt?.account?.lastError ? ` · <span class="dn">Eroare: ${esc(etSt.account.lastError)}</span>` : ''}</div>
            </div>
            <button id="pfCloseEtoroCfgBtn" type="button" class="pf-ico-btn" title="Închide">${ICO.close}</button>
          </div>
          <div class="pf-calc-inputs" style="grid-template-columns: 1fr 1fr 0.7fr 0.7fr;">
            <div class="adm-edit-field">
              <label>Public API Key (x-api-key) ${etSt?.credentials?.maskedApiKey ? `· ${esc(etSt.credentials.maskedApiKey)}` : ''}</label>
              <input id="etoroApiKeyInp" type="password" class="tv-input" placeholder="Lipește x-api-key din eToro..." autocomplete="off" />
            </div>
            <div class="adm-edit-field">
              <label>User Key (x-user-key) ${etSt?.credentials?.maskedUserKey ? `· ${esc(etSt.credentials.maskedUserKey)}` : ''}</label>
              <input id="etoroUserKeyInp" type="password" class="tv-input" placeholder="Lipește x-user-key (READ-ONLY)..." autocomplete="off" />
            </div>
            <div class="adm-edit-field">
              <label>Cont &amp; Auto-Sync</label>
              <select id="etoroAutoSyncSel" class="tv-input">
                <option value="1" ${etSt?.account?.enabled ? 'selected' : ''}>REAL · Auto-Sync Activ</option>
                <option value="0" ${!etSt?.account?.enabled ? 'selected' : ''}>REAL · Doar Manual</option>
              </select>
            </div>
            <div class="adm-edit-field">
              <label>Interval Sincronizare</label>
              <select id="etoroIntervalSel" class="tv-input">
                <option value="1" ${etSt?.account?.syncIntervalMin === 1 ? 'selected' : ''}>La 1 minut</option>
                <option value="5" ${(etSt?.account?.syncIntervalMin || 5) === 5 ? 'selected' : ''}>La 5 minute</option>
                <option value="15" ${etSt?.account?.syncIntervalMin === 15 ? 'selected' : ''}>La 15 minute</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button id="etoroSaveCfgBtn" type="button" class="intel-chip-btn active">Salvează Configurația (.env Backend)</button>
            <button id="etoroTestConnBtn" type="button" class="adm-btn-xs">Testează Conexiunea READ</button>
            <button id="etoroSyncNowBtn" type="button" class="adm-btn-xs">${ICO.refresh}<span>Sincronizează Acum din eToro</span></button>
          </div>
        </div>
      ` : ''}

      ${stateIntel.pfNotice ? `
        <div class="adm-notice ${stateIntel.pfNotice.tone === 'err' ? 'is-err' : 'is-ok'}">
          <span>${esc(stateIntel.pfNotice.text)}</span>
          <button type="button" id="pfNoticeClose" class="adm-notice-x">${ICO.close}</button>
        </div>
      ` : ''}

      <div class="pf-kpi-grid">
        <div class="intel-card pf-kpi-card">
          <div class="pf-kpi-lbl">Valoare Totală (Total Value)</div>
          <div class="pf-kpi-val tabular">${pfFmtUsd(t.totalAccountEquity ?? t.totalNetValue)}</div>
          <div class="pf-kpi-sub">Investit: <b>${pfFmtUsd(t.totalInvestedMargin)}</b>${t.cashAvailable != null ? ` · Cash: <b class="up">${pfFmtUsd(t.cashAvailable)}</b>` : ''}</div>
        </div>
        <div class="intel-card pf-kpi-card">
          <div class="pf-kpi-lbl">Profit / Pierdere (P/L)</div>
          <div class="pf-kpi-val ${pnlCls} tabular">${pfFmtUsd(t.totalLivePnl, true)} <span style="font-size:12px;">(${fmtPct(t.totalLivePnlPct)})</span></div>
          <div class="pf-kpi-sub">Daily P/L: <b class="${dayCls}">${pfFmtUsd(t.totalDailyPnl, true)}</b></div>
        </div>
        ${(() => {
        const slSorted = [...allRows].filter(x => x.minSlDistPct != null).sort((a, b) => a.minSlDistPct - b.minSlDistPct);
        const topSl = slSorted[0];
        const topSlVal = topSl ? ((topSl.lotInsights || []).find(l => l.sl)?.sl ?? topSl.sl) : null;
        const topSlDiff = (topSl && topSlVal) ? Math.abs(Number(topSl.livePrice) - Number(topSlVal)) : 0;
        const slCardCls = !topSl ? 'up' : (topSl.minSlDistPct <= 5 ? 'dn' : (topSl.minSlDistPct <= 9 ? 'amber' : 'up'));
        const nextSlStr = slSorted.slice(1, 3).map(x => `${esc(x.brokerSym)} −${x.minSlDistPct.toFixed(1)}%`).join(' · ');

        const daySorted = [...allRows].sort((a, b) => (Number(b.dailyPnl) || 0) - (Number(a.dailyPnl) || 0));
        const bestD = daySorted[0];
        const worstD = daySorted[daySorted.length - 1];
        return `
            <div class="intel-card pf-kpi-card ${topSl && topSl.minSlDistPct <= 5 ? 'pf-kpi-danger' : ''}">
              <div class="pf-kpi-lbl">Proximitate Stop-Loss (Risc Marjă)</div>
              <div class="pf-kpi-val ${slCardCls} tabular" style="font-size:16px;">
                ${topSl ? `${esc(topSl.brokerSym)} −${topSl.minSlDistPct.toFixed(1)}% <span style="font-size:12px;font-weight:600;">($${fmtPx(topSlDiff)} până la SL)</span>` : 'Fără SL activ'}
              </div>
              <div class="pf-kpi-sub">${nextSlStr ? `Următoarele: <b>${nextSlStr}</b>` : 'Distanță sigură față de SL'}</div>
            </div>
            <div class="intel-card pf-kpi-card">
              <div class="pf-kpi-lbl">Impuls Azi &amp; Expunere</div>
              <div class="pf-kpi-val tabular" style="font-size:15px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;">
                ${bestD ? `<span class="${(bestD.dailyPnl || 0) >= 0 ? 'up' : 'dn'}">${esc(bestD.brokerSym)} ${pfFmtUsd(bestD.dailyPnl || 0, true)}</span>` : ''}
                ${worstD && worstD !== bestD ? `<span class="dn" style="font-size:13px;">${esc(worstD.brokerSym)} ${pfFmtUsd(worstD.dailyPnl || 0, true)}</span>` : ''}
              </div>
              <div class="pf-kpi-sub">Expunere: <b>${pfFmtUsd(t.totalNotional)}</b> (${t.effectiveLeverage || 1}x) · Top 2: <b>${t.top2ConcentrationPct || 0}%</b></div>
            </div>
          `;
      })()}
      </div>

      ${(stateIntel.pfShowImporter || !allRows.length) ? `
        <div class="intel-card pf-importer-card">
          <div class="pf-sec-hdr">
            <div>
              <div class="pf-sec-title">Importă sau Actualizează Situația Reală din Broker (${esc(pf.broker || 'eToro')})</div>
              <div class="pf-sec-sub">Selectează și copiază direct din eToro (My Portfolio sau pagina de loturi APPS/ONDS), Trading 212, IBKR, XTB sau format liber <code>SIMBOL UNITĂȚI @ PREȚ SL TP</code>. Nimeni altcineva nu are acces la aceste date.</div>
            </div>
          </div>

          <div class="pf-acct-row">
            <div class="adm-edit-field">
              <label>Broker</label>
              <input id="pfMetaBroker" class="tv-input" value="${esc(pf.broker || 'eToro')}" placeholder="eToro / IBKR / T212 / XTB" />
            </div>
            <div class="adm-edit-field">
              <label>Cash Disponibil ($)</label>
              <input id="pfMetaCash" type="number" step="0.01" class="tv-input" value="${pf.cashAvailable != null ? esc(pf.cashAvailable) : ''}" placeholder="ex: 2450.00" />
            </div>
            <div class="adm-edit-field">
              <label>Equity Raportat Broker ($ opțional)</label>
              <input id="pfMetaEquity" type="number" step="0.01" class="tv-input" value="${pf.accountEquity != null ? esc(pf.accountEquity) : ''}" placeholder="ex: 16500.00" />
            </div>
            <div class="adm-edit-field">
              <label>Notițe / Profil Risc</label>
              <input id="pfMetaNotes" class="tv-input" value="${esc(pf.notes || '')}" placeholder="ex: Nu vreau să adaug marjă sub..." />
            </div>
            <button id="pfSaveMetaBtn" type="button" class="intel-chip-btn active" style="height:32px;align-self:end;">Salvează Cont</button>
          </div>

          <div class="pf-import-controls">
            <div class="adm-edit-field" style="min-width:210px;">
              <label>Mod Import Text</label>
              <select id="pfImportMode" class="tv-input">
                <option value="auto">Auto-Detect (eToro Overview / Loturi / CSV / Text)</option>
                <option value="lots">Loturi Drill-Down eToro -> Atașează la simbol</option>
              </select>
            </div>
            <div class="adm-edit-field" style="min-width:160px;">
              <label>Simbol Țintă (doar pt. loturi)</label>
              <input id="pfImportTargetSym" class="tv-input" placeholder="ex: APPS sau ONDS" />
            </div>
            <div class="adm-edit-field" style="min-width:190px;">
              <label>Mod Aplicare</label>
              <select id="pfImportMergeMode" class="tv-input">
                <option value="merge">Combină / Actualizează pozițiile găsite</option>
                <option value="replace">Înlocuiește complet portofoliul</option>
              </select>
            </div>
          </div>

          <textarea id="pfPasteBox" class="pf-paste-area" placeholder="Lipește aici cu Cmd+V tabelul copiat din eToro, Trading 212, IBKR, CSV sau linii simple (ex: APPS 4030.21 @ 10.61346 SL 6.90 TP 21.93)..."></textarea>
          <div class="pf-import-actions">
            <button id="pfParseApplyBtn" type="button" class="intel-chip-btn active">Parsează, Salvează &amp; Evaluează Live</button>
            <button id="pfParsePreviewBtn" type="button" class="intel-chip-btn">Doar Previzualizare</button>
            ${allRows.length ? '<button id="pfClearAllBtn" type="button" class="adm-btn-xs danger" style="margin-left:auto;">Golește Portofoliul</button>' : ''}
          </div>
          ${stateIntel.pfParsePreview ? `<div class="pf-preview-box">${esc(stateIntel.pfParsePreview)}</div>` : ''}
        </div>
      ` : ''}

      ${(stateIntel.pfShowAddModal || editAsset) ? `
        <div class="intel-card pf-edit-card">
          <div class="pf-sec-hdr">
            <div class="pf-sec-title">${editAsset ? `Editează Poziția: ${esc(editAsset.brokerSym)}` : 'Adaugă Poziție Nouă în Contul Real'}</div>
            <button id="pfEditCancelBtn" type="button" class="adm-btn-xs">Anulează</button>
          </div>
          <div class="adm-edit-grid">
            <div class="adm-edit-field"><label>Simbol Broker</label><input id="pfEdBrokerSym" class="tv-input" value="${esc(editAsset?.brokerSym || '')}" placeholder="ex: APPS sau SPCX.24-7" /></div>
            <div class="adm-edit-field"><label>Simbol Live (Yahoo)</label><input id="pfEdSym" class="tv-input" value="${esc(editAsset?.sym || '')}" placeholder="auto (ex: SPCX)" /></div>
            <div class="adm-edit-field"><label>Denumire Companie</label><input id="pfEdName" class="tv-input" value="${esc(editAsset?.name || '')}" placeholder="ex: Digital Turbine Inc" /></div>
            <div class="adm-edit-field"><label>Direcție</label><select id="pfEdSide" class="tv-input"><option value="LONG" ${editAsset?.side !== 'SHORT' ? 'selected' : ''}>LONG</option><option value="SHORT" ${editAsset?.side === 'SHORT' ? 'selected' : ''}>SHORT</option></select></div>
            <div class="adm-edit-field"><label>Unități / Cantitate Totală</label><input id="pfEdUnits" type="number" step="any" class="tv-input" value="${editAsset?.units ?? ''}" /></div>
            <div class="adm-edit-field"><label>Preț Open Mediu</label><input id="pfEdOpen" type="number" step="any" class="tv-input" value="${editAsset?.avgOpen ?? ''}" /></div>
            <div class="adm-edit-field"><label>Capital / Marjă Investită ($)</label><input id="pfEdInvested" type="number" step="0.01" class="tv-input" value="${editAsset?.invested ?? ''}" placeholder="opțional (pt. CFD)" /></div>
            <div class="adm-edit-field"><label>Stop-Loss Global (opțional)</label><input id="pfEdSl" type="number" step="any" class="tv-input" value="${editAsset?.sl ?? ''}" placeholder="ex: 6.20" /></div>
            <div class="adm-edit-field"><label>Take-Profit Global (opțional)</label><input id="pfEdTp" type="number" step="any" class="tv-input" value="${editAsset?.tp ?? ''}" placeholder="ex: 12.50" /></div>
            <div class="adm-edit-field" style="grid-column: span 2;"><label>Notițe Poziție</label><input id="pfEdNotes" class="tv-input" value="${esc(editAsset?.notes || '')}" placeholder="Strategie sau condiții de ieșire..." /></div>
          </div>
          ${(editAsset?.lots || []).length ? `
            <div class="pf-edit-lots-note">
              <span>Această poziție conține <b>${editAsset.lots.length} sub-loturi individuale</b>. Dacă modifici cantitatea sau SL/TP-ul mai sus, poți ajusta automat sub-loturile sau poți trece la poziție unică simplă.</span>
              <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;">
                <label style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;"><input id="pfEdApplySlTpLots" type="checkbox" checked /> Aplică SL/TP-ul completat pe toate cele ${editAsset.lots.length} loturi</label>
                <label style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;"><input id="pfEdFlattenLots" type="checkbox" /> Combină într-un singur rând fără sub-loturi (folosește exact Unitățile &amp; Open Mediu de mai sus)</label>
              </div>
            </div>
          ` : ''}
          <div style="display:flex;align-items:center;gap:14px;margin-top:10px;flex-wrap:wrap;">
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;"><input id="pfEdCfd" type="checkbox" ${editAsset?.isCfd ? 'checked' : ''} /> Poziție CFD (cu levier)</label>
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;"><input id="pfEd245" type="checkbox" ${editAsset?.is24_5 ? 'checked' : ''} /> Piață 24/5</label>
            <button id="pfEdSaveBtn" type="button" class="intel-chip-btn active">Salvează Modificările</button>
          </div>
        </div>
      ` : ''}

      ${(allRows.length && stateIntel.pfShowCalc && calcRow) ? `
        <div id="pfCalcCard" class="intel-card pf-calc-card">
          <div class="pf-sec-hdr" style="margin-bottom:8px;">
            <div class="pf-sec-title">Calculator SL / TP · ${esc(calcRow.brokerSym)}</div>
            <button id="pfCalcCloseBtn" type="button" class="pf-ico-btn" title="Ascunde calculatorul">${ICO.close}</button>
          </div>

          <div class="pf-calc-inputs">
            <div class="adm-edit-field">
              <label>Simbol</label>
              <div class="pf-sym-pick-wrap">
                ${renderSymAvatar(calcRow.sym, 'sm')}
                <select id="pfCalcSym" class="tv-input pf-sym-pick-sel">
                  ${allRows.map(ar => `
                    <option value="${esc(ar.id)}" ${ar.id === calcRow.id ? 'selected' : ''}>${esc(ar.brokerSym)}</option>
                  `).join('')}
                </select>
              </div>
            </div>
            <div class="adm-edit-field">
              <label>Stop-Loss Dorit ($)</label>
              <div class="pf-step-wrap">
                <button type="button" class="pf-step-btn" data-step-target="pfCalcSl" data-step="-0.01" title="Scade cu $0.01">−</button>
                <input id="pfCalcSl" type="number" step="0.01" class="tv-input pf-step-inp tabular" value="${esc(stateIntel.pfCalcSlInput)}" placeholder="6.00" />
                <button type="button" class="pf-step-btn" data-step-target="pfCalcSl" data-step="0.01" title="Crește cu $0.01">+</button>
              </div>
            </div>
            <div class="adm-edit-field">
              <label>Take-Profit Dorit ($)</label>
              <div class="pf-step-wrap">
                <button type="button" class="pf-step-btn" data-step-target="pfCalcTp" data-step="-0.01" title="Scade cu $0.01">−</button>
                <input id="pfCalcTp" type="number" step="0.01" class="tv-input pf-step-inp tabular" value="${esc(stateIntel.pfCalcTpInput)}" placeholder="12.50" />
                <button type="button" class="pf-step-btn" data-step-target="pfCalcTp" data-step="0.01" title="Crește cu $0.01">+</button>
              </div>
            </div>
            <div class="adm-edit-field">
              <label>Cash Trading eToro ($)${pf.walletCashExtra > 0 ? ` <small style="font-weight:500;opacity:0.75;">(+ $${Number(pf.walletCashExtra).toFixed(2)} Wallet)</small>` : ''}</label>
              <div class="pf-step-wrap">
                <button type="button" class="pf-step-btn" data-step-target="pfCalcCashInp" data-step="-10" title="Scade cu $10">−</button>
                <input id="pfCalcCashInp" type="number" step="0.01" class="tv-input pf-step-inp tabular" value="${esc(effectiveCashStr)}" placeholder="1.01" />
                <button type="button" class="pf-step-btn" data-step-target="pfCalcCashInp" data-step="10" title="Crește cu $10">+</button>
              </div>
            </div>
          </div>

          <div class="pf-calc-presets">
            <span class="pf-calc-preset-lbl">SL</span>
            <div class="pf-calc-preset-grp">
              ${(() => {
          const isShort = calcRow.side === 'SHORT';
          const sgn = isShort ? 1 : -1;
          const lp = Number(calcRow.livePrice || 0);
          if (lp <= 0) return '';
          const dec = lp >= 1 ? 2 : 4;
          const fmtBtn = v => `$${Number(v).toFixed(dec)}`;
          const pcts = [0.03, 0.06, 0.10, 0.15, 0.20, 0.25, 0.35];
          const items = pcts.map(p => {
            const val = Number((lp * (1 + sgn * p)).toFixed(dec));
            return { val, tip: `SL ${isShort ? '+' : '−'}${Math.round(p * 100)}% ($${fmtPx(val)})` };
          });
          const stSl = Number(calcRow.recommendation?.levels?.suggestedSl || 0);
          if (stSl > 0) {
            const stRound = Number(stSl.toFixed(dec));
            if (!items.some(x => Math.abs(x.val - stRound) / lp < 0.015)) {
              items.push({ val: stRound, tip: `SL Sugerat ($${fmtPx(stRound)})` });
            }
          }
          items.sort((a, b) => isShort ? a.val - b.val : b.val - a.val);
          const curSlNum = pfParseNum(stateIntel.pfCalcSlInput);
          return items.slice(0, 7).map(it => {
            const act = curSlNum !== null && Math.abs(curSlNum - it.val) < 1e-4 ? 'active' : '';
            return `<button type="button" class="pf-calc-pre tabular ${act}" data-kind="sl" data-val="${it.val}" title="${it.tip}">${fmtBtn(it.val)}</button>`;
          }).join('');
        })()}
            </div>
            <span class="pf-calc-preset-lbl pf-tp-lbl">TP</span>
            <div class="pf-calc-preset-grp">
              ${(() => {
          const isShort = calcRow.side === 'SHORT';
          const sgn = isShort ? -1 : 1;
          const lp = Number(calcRow.livePrice || 0);
          if (lp <= 0) return '';
          const dec = lp >= 1 ? 2 : 4;
          const fmtBtn = v => `$${Number(v).toFixed(dec)}`;
          const candidates = [
            { val: Number((lp * (1 + sgn * 0.10)).toFixed(dec)), tip: 'TP +10% față de live' },
            { val: Number((lp * (1 + sgn * 0.20)).toFixed(dec)), tip: 'TP +20% față de live' },
            { val: Number((lp * (1 + sgn * 0.35)).toFixed(dec)), tip: 'TP +35% față de live' },
            { val: Number((lp * (1 + sgn * 0.50)).toFixed(dec)), tip: 'TP +50% față de live' },
            { val: Number((lp * (1 + sgn * 0.75)).toFixed(dec)), tip: 'TP +75% față de live' },
            { val: Number((lp * (1 + sgn * 1.00)).toFixed(dec)), tip: 'TP +100% față de live' }
          ];
          const be = Number(calcRow.avgOpen || 0);
          if (be > 0 && ((isShort && be < lp) || (!isShort && be > lp))) {
            candidates.push({ val: Number(be.toFixed(dec)), tip: `Breakeven Open Mediu ($${fmtPx(be)})` });
          }
          const trim = Number(calcRow.recommendation?.levels?.trimZone || 0);
          if (trim > 0 && ((isShort && trim < lp) || (!isShort && trim > lp))) {
            candidates.push({ val: Number(trim.toFixed(dec)), tip: `Zonă Rezistență ($${fmtPx(trim)})` });
          }
          candidates.sort((a, b) => isShort ? b.val - a.val : a.val - b.val);
          const dedup = [];
          for (const c of candidates) {
            if (c.val <= 0) continue;
            if (!dedup.some(x => Math.abs(x.val - c.val) / lp < 0.02)) dedup.push(c);
          }
          const curTpNum = pfParseNum(stateIntel.pfCalcTpInput);
          return dedup.slice(0, 7).map(it => {
            const act = curTpNum !== null && Math.abs(curTpNum - it.val) < 1e-4 ? 'active' : '';
            return `<button type="button" class="pf-calc-pre tabular ${act}" data-kind="tp" data-val="${it.val}" title="${it.tip}">${fmtBtn(it.val)}</button>`;
          }).join('');
        })()}
            </div>
          </div>

          <div id="pfCalcOutput">
            ${renderSlTpCalcResultHtml(calcRow, calcSim, stateIntel.pfCalcShowLots, stateIntel.pfCalcConfirmApply)}
          </div>
        </div>
      ` : ''}

      ${allRows.length ? `
        <div class="adm-toolbar">
          <div class="intel-seg">
            <button type="button" class="intel-seg-btn ${flt === 'all' ? 'active' : ''}" data-pfflt="all">Toate (${allRows.length})</button>
            <button type="button" class="intel-seg-btn ${flt === 'critical' ? 'active' : ''}" data-pfflt="critical">Alerte (${allRows.filter(x => x.criticalSlLotsCount > 0 || x.recommendation?.severity === 'critical' || x.recommendation?.severity === 'warn').length})</button>
            <button type="button" class="intel-seg-btn ${flt === 'cfd' ? 'active' : ''}" data-pfflt="cfd">CFD (${allRows.filter(x => x.isCfd).length})</button>
            <button type="button" class="intel-seg-btn ${flt === 'losers' ? 'active' : ''}" data-pfflt="losers">Pierdere (${allRows.filter(x => x.livePnl < 0).length})</button>
            <button type="button" class="intel-seg-btn ${flt === 'winners' ? 'active' : ''}" data-pfflt="winners">Profit (${allRows.filter(x => x.livePnl >= 0).length})</button>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <span style="font-size:11px;color:var(--text-dim);">Sortare:</span>
            <select id="pfSortSelect" class="tv-input" style="height:28px;font-size:11px;">
              <option value="notional" ${srt === 'notional' ? 'selected' : ''}>Expunere</option>
              <option value="netValue" ${srt === 'netValue' ? 'selected' : ''}>Valoare Netă</option>
              <option value="invested" ${srt === 'invested' ? 'selected' : ''}>Investit ($)</option>
              <option value="dailyPnl" ${srt === 'dailyPnl' ? 'selected' : ''}>Daily P/L (Azi)</option>
              <option value="slDist" ${srt === 'slDist' ? 'selected' : ''}>Cel mai aproape de SL</option>
              <option value="pnlAsc" ${srt === 'pnlAsc' || srt === 'livePnl' ? 'selected' : ''}>Pierdere / Profit ($)</option>
            </select>
          </div>
        </div>

        <div class="intel-card pf-etoro-board">
          <div class="pf-etoro-hdr">
            ${(() => {
          const sArrow = col => srt === col ? `<span class="pf-sort-arr">${stateIntel.pfSortDir === 'asc' ? '▴' : '▾'}</span>` : '';
          return `
                <div class="pf-sort-col ${srt === 'sym' ? 'active' : ''}" data-pfsortcol="sym">Instrument ${sArrow('sym')}</div>
                <div class="r pf-sort-col ${srt === 'livePrice' ? 'active' : ''}" data-pfsortcol="livePrice">Preț Live ${sArrow('livePrice')}</div>
                <div class="r pf-sort-col ${srt === 'units' ? 'active' : ''}" data-pfsortcol="units">Unități @ Open ${sArrow('units')}</div>
                <div class="r pf-sort-col ${srt === 'slDist' ? 'active' : ''}" data-pfsortcol="slDist">Stop-Loss / TP ${sArrow('slDist')}</div>
                <div class="r"><span class="pf-sort-col ${srt === 'netValue' ? 'active' : ''}" data-pfsortcol="netValue">Net${sArrow('netValue')}</span> / <span class="pf-sort-col ${srt === 'invested' ? 'active' : ''}" data-pfsortcol="invested">Investit${sArrow('invested')}</span></div>
                <div class="r"><span class="pf-sort-col ${srt === 'livePnl' || srt === 'pnlAsc' ? 'active' : ''}" data-pfsortcol="livePnl">P&amp;L${sArrow('livePnl') || sArrow('pnlAsc')}</span> / <span class="pf-sort-col ${srt === 'dailyPnl' ? 'active' : ''}" data-pfsortcol="dailyPnl">Daily P&amp;L${sArrow('dailyPnl')}</span></div>
                <div class="r pf-sort-col ${srt === 'lotsCount' ? 'active' : ''}" data-pfsortcol="lotsCount">Loturi ${sArrow('lotsCount')}</div>
              `;
        })()}
          </div>
          <div class="pf-etoro-body">
            ${rows.map(r => {
      const expanded = stateIntel.pfExpandedIds.has(r.id);
      const slDanger = r.minSlDistPct != null && r.minSlDistPct <= 5 ? 'dn' : '';
      const validRowSls = (r.lotInsights || []).map(l => Number(l.sl)).filter(v => Number.isFinite(v) && v > 0);
      const minRowSl = validRowSls.length ? Math.min(...validRowSls) : (r.sl ? Number(r.sl) : null);
      const maxRowSl = validRowSls.length ? Math.max(...validRowSls) : minRowSl;
      const slLabelHtml = minRowSl
        ? (maxRowSl && Math.abs(maxRowSl - minRowSl) > 1e-4 ? `SL $${fmtPx(minRowSl)}–$${fmtPx(maxRowSl)}` : `SL $${fmtPx(minRowSl)}`)
        : 'Fără SL';
      const firstTpVal = (r.lotInsights || []).find(l => l.tp)?.tp ?? r.tp;
      const rawAst = (pf.assets || []).find(a => a.id === r.id || a.brokerSym === r.brokerSym);
      const rawLotsById = new Map(((rawAst && rawAst.lots) || []).map(x => [String(x.id), x]));
      const flashCls = stateIntel.tickFlashMap?.[r.brokerSym || r.id] || '';
      return `
              <div class="pf-etoro-group ${expanded ? 'is-expanded' : ''}">
                <div class="pf-etoro-row pf-expand-btn" data-pfexpand="${esc(r.id)}" data-pfcalc="${esc(r.id)}">
                  <div class="pf-etoro-inst">
                    ${renderSymAvatar(r.sym, 'md')}
                    <div class="pf-etoro-inst-txt">
                      <div class="pf-etoro-sym-line">
                        <span class="pf-sym-title">${esc(String(r.brokerSym || '').replace(/\.(24-7|24-5)$/i, ''))}</span>
                        <span class="pf-tag-mono">${r.isCfd ? 'CFD' : 'SPOT'}</span>
                      </div>
                      <div class="pf-asset-name">${esc(r.name)} · ${r.concentrationPct}%</div>
                    </div>
                  </div>
                  <div class="pf-etoro-cell r tabular">
                    <div class="pf-cell-main"><span class="pf-price-live ${flashCls}">$${fmtPx(r.livePrice)}</span> <span class="${r.dayChgPct >= 0 ? 'up' : 'dn'}" style="font-size:11px;font-weight:700;margin-left:4px;">${fmtPct(r.dayChgPct)}</span></div>
                    <div class="pf-cell-sub ${slDanger}" style="font-weight:600;">${slLabelHtml}${r.minSlDistPct != null ? ` (−${r.minSlDistPct.toFixed(1)}%)` : ''}</div>
                  </div>
                  <div class="pf-etoro-cell r tabular">
                    <div class="pf-cell-main">${Number(r.units).toLocaleString('en-US', { maximumFractionDigits: 2 })} u</div>
                    <div class="pf-cell-sub">@ $${fmtPx(r.avgOpen)}</div>
                  </div>
                  <div class="pf-etoro-cell r tabular">
                    <div class="pf-cell-main ${slDanger}">${slLabelHtml} ${r.minSlDistPct != null ? `<small>(−${r.minSlDistPct.toFixed(1)}%)</small>` : ''}</div>
                    <div class="pf-cell-sub">${firstTpVal ? `TP $${fmtPx(firstTpVal)}` : 'Fără TP'}</div>
                  </div>
                  <div class="pf-etoro-cell r tabular">
                    <div class="pf-cell-main">${pfFmtUsd(r.netValue)}</div>
                    <div class="pf-cell-sub">Inv: ${pfFmtUsd(r.investedCapital)}</div>
                  </div>
                  <div class="pf-etoro-cell r tabular">
                    <div class="pf-cell-main ${r.livePnl >= 0 ? 'up' : 'dn'}">${pfFmtUsd(r.livePnl, true)}</div>
                    <div class="pf-cell-sub ${(r.dailyPnl || 0) >= 0 ? 'up' : 'dn'}">Daily: ${pfFmtUsd(r.dailyPnl || 0, true)}</div>
                  </div>
                  <div class="pf-etoro-cell r pf-etoro-actions" onclick="event.stopPropagation();">
                    <button type="button" class="pf-lots-pill pf-expand-btn ${expanded ? 'active' : ''}" data-pfexpand="${esc(r.id)}" title="Vezi cele ${r.lotsCount || 1} poziții individuale">
                      <span>${r.lotsCount || 1}</span>
                      <span class="pf-chev">${expanded ? '▴' : '▾'}</span>
                    </button>
                  </div>
                </div>

                ${expanded ? `
                  <div class="pf-lots-wrap">
                    <div class="pf-lots-head">
                      <div class="pf-lots-title-left">
                        <span>Poziții (${r.lotInsights.length}) · <b>${esc(r.brokerSym)}</b></span>
                        <button type="button" class="adm-btn-xs pf-calc-sym-btn" data-pfcalc="${esc(r.id)}">Deschide în Calculator</button>
                        <button type="button" class="adm-btn-xs pf-jump-sym" data-pfsym="${esc(r.sym)}">Grafic Live</button>
                      </div>
                      <div class="pf-lots-head-tools">
                        ${r.lotInsights.length ? `
                          <div class="pf-bulk-sl">
                            <input id="pfBulkSl_${esc(r.id)}" type="number" step="0.1" class="tv-input pf-bulk-inp" placeholder="SL Bulk ($)" />
                            <input id="pfBulkTp_${esc(r.id)}" type="number" step="0.1" class="tv-input pf-bulk-inp" placeholder="TP Bulk ($)" />
                            <button type="button" class="adm-btn-xs pf-bulk-sl-btn" data-pfbulksl="${esc(r.id)}">${ICO.check}<span>Aplică Bulk</span></button>
                          </div>
                        ` : ''}
                      </div>
                    </div>

                    ${r.lotInsights.length ? `
                      <div class="adm-table-wrap">
                        <table class="tv-table pf-lots-table pf-etoro-subtable">
                          <thead>
                            ${(() => {
                  const lCol = stateIntel.pfLotSortCol || 'open';
                  const lArr = col => lCol === col ? `<span class="pf-sort-arr">${stateIntel.pfLotSortDir === 'asc' ? '▴' : '▾'}</span>` : '';
                  return `
                                <tr>
                                  <th style="width:32px;"><input type="checkbox" class="pf-bulk-chk-all" data-pfast="${esc(r.id)}" checked title="Selectează / Deselectează toate loturile" /></th>
                                  <th class="pf-sort-col ${lCol === 'date' ? 'active' : ''}" data-pflotsort="date">Poziție (${r.lotInsights.length}) ${lArr('date')}</th>
                                  <th class="r pf-sort-col ${lCol === 'units' ? 'active' : ''}" data-pflotsort="units">Unități ${lArr('units')}</th>
                                  <th class="r pf-sort-col ${lCol === 'open' ? 'active' : ''}" data-pflotsort="open">Open ${lArr('open')}</th>
                                  <th class="c pf-sort-col ${lCol === 'sl' ? 'active' : ''}" data-pflotsort="sl">SL ${lArr('sl')}</th>
                                  <th class="c pf-sort-col ${lCol === 'tp' ? 'active' : ''}" data-pflotsort="tp">TP ${lArr('tp')}</th>
                                  <th class="r pf-sort-col ${lCol === 'invested' ? 'active' : ''}" data-pflotsort="invested">Investit ${lArr('invested')}</th>
                                  <th class="r pf-sort-col ${lCol === 'dailyPnl' ? 'active' : ''}" data-pflotsort="dailyPnl">Daily P/L ${lArr('dailyPnl')}</th>
                                  <th class="r pf-sort-col ${lCol === 'pnl' ? 'active' : ''}" data-pflotsort="pnl">P/L ($) ${lArr('pnl')}</th>
                                </tr>
                              `;
                })()}
                          </thead>
                          <tbody>
                            ${[...r.lotInsights].sort((la, lb) => {
                  const lCol = stateIntel.pfLotSortCol || 'open';
                  const lDir = stateIntel.pfLotSortDir === 'asc' ? 1 : -1;
                  const ra = rawLotsById.get(String(la.id)) || {};
                  const rb = rawLotsById.get(String(lb.id)) || {};
                  const invA = Number(ra.invested ?? la.invested ?? (la.units * la.open / (ra.leverage || 5)));
                  const invB = Number(rb.invested ?? lb.invested ?? (lb.units * lb.open / (rb.leverage || 5)));
                  const pnlA = ra.brokerPnl != null ? Number(ra.brokerPnl) : Number(la.livePnl || 0);
                  const pnlB = rb.brokerPnl != null ? Number(rb.brokerPnl) : Number(lb.livePnl || 0);
                  if (lCol === 'date') return lDir * String(la.openedAt || '').localeCompare(String(lb.openedAt || ''));
                  if (lCol === 'units') return lDir * ((Number(la.units) || 0) - (Number(lb.units) || 0));
                  if (lCol === 'open') return lDir * ((Number(la.open) || 0) - (Number(lb.open) || 0));
                  if (lCol === 'sl') return lDir * ((Number(la.sl) || 0) - (Number(lb.sl) || 0));
                  if (lCol === 'tp') return lDir * ((Number(la.tp) || 0) - (Number(lb.tp) || 0));
                  if (lCol === 'invested') return lDir * (invA - invB);
                  if (lCol === 'dailyPnl') return lDir * ((Number(la.units) || 0) - (Number(lb.units) || 0));
                  if (lCol === 'pnl') return lDir * (pnlA - pnlB);
                  return 0;
                }).map(l => {
                  const lotKey = `${r.id}:${l.id}`;
                  const rawLot = rawLotsById.get(String(l.id)) || {};
                  const lotInv = Number(rawLot.invested ?? l.invested ?? (l.units * l.open / (rawLot.leverage || 5)));
                  const lotPnlUsd = rawLot.brokerPnl != null ? Number(rawLot.brokerPnl) : Number(l.livePnl || 0);
                  const lotDailyPnl = r.units > 0 ? Number(((Number(r.dailyPnl || 0) * (Number(l.units || 0) / Number(r.units)))).toFixed(2)) : 0;
                  const isEditingLot = stateIntel.pfEditLotKey === lotKey;
                  if (isEditingLot) {
                    return `
                                  <tr class="pf-lot-editing">
                                    <td></td>
                                    <td>
                                      <select id="pfEdLotType" class="tv-input pf-lot-inp">
                                        <option value="Buy CFD" ${/buy cfd/i.test(l.type) ? 'selected' : ''}>Buy CFD</option>
                                        <option value="Buy" ${/^buy$/i.test(l.type) ? 'selected' : ''}>Buy</option>
                                        <option value="Sell CFD" ${/sell cfd/i.test(l.type) ? 'selected' : ''}>Sell CFD</option>
                                      </select>
                                    </td>
                                    <td class="r"><input id="pfEdLotUnits" type="number" step="any" class="tv-input pf-lot-inp" value="${l.units}" /></td>
                                    <td class="r"><input id="pfEdLotOpen" type="number" step="any" class="tv-input pf-lot-inp" value="${l.open}" /></td>
                                    <td class="c"><input id="pfEdLotSl" type="number" step="any" class="tv-input pf-lot-inp" value="${l.sl ?? ''}" placeholder="SL" /></td>
                                    <td class="c"><input id="pfEdLotTp" type="number" step="any" class="tv-input pf-lot-inp" value="${l.tp ?? ''}" placeholder="TP" /></td>
                                    <td class="r tabular">${pfFmtUsd(lotInv)}</td>
                                    <td class="r tabular ${lotDailyPnl >= 0 ? 'up' : 'dn'}">${pfFmtUsd(lotDailyPnl, true)}</td>
                                    <td class="r" style="white-space:nowrap;">
                                      <button type="button" class="adm-btn-xs pf-save-edit-lot" data-pfast="${esc(r.id)}" data-pflotid="${esc(l.id)}">OK</button>
                                      <button type="button" class="adm-btn-xs pf-cancel-edit-lot">✕</button>
                                    </td>
                                  </tr>
                                `;
                  }
                  return `
                                <tr class="${l.riskState === 'CRITICAL_SL' ? 'pf-lot-crit' : ''}">
                                  <td><input type="checkbox" class="pf-lot-chk" data-pfast="${esc(r.id)}" data-pflotid="${esc(l.id)}" checked /></td>
                                  <td>
                                    <div class="pf-etoro-lot-type"><b>Buy</b> <span class="pf-tag-mono">${l.isCfd !== false ? 'CFD' : 'SPOT'}</span></div>
                                    <div class="pf-etoro-lot-date">${esc(l.openedAt || '—')}</div>
                                  </td>
                                  <td class="r tabular">${Number(l.units).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</td>
                                  <td class="r tabular">${Number(l.open).toFixed(l.open < 10 ? 2 : 2)}</td>
                                  <td class="c tabular">
                                    <button type="button" class="pf-etoro-box pf-edit-lot-btn ${l.riskState === 'CRITICAL_SL' ? 'dn' : ''}" data-pflotkey="${esc(lotKey)}" title="Click pentru a modifica SL">
                                      ${l.sl ? Number(l.sl).toFixed(2) : '—'}
                                    </button>
                                  </td>
                                  <td class="c tabular">
                                    <button type="button" class="pf-etoro-box pf-edit-lot-btn" data-pflotkey="${esc(lotKey)}" title="Click pentru a modifica TP">
                                      ${l.tp ? Number(l.tp).toFixed(2) : '—'}
                                    </button>
                                  </td>
                                  <td class="r tabular">${pfFmtUsd(lotInv)}</td>
                                  <td class="r tabular ${lotDailyPnl >= 0 ? 'up' : 'dn'}">${pfFmtUsd(lotDailyPnl, true)}</td>
                                  <td class="r tabular ${lotPnlUsd >= 0 ? 'up' : 'dn'}">${pfFmtUsd(lotPnlUsd, true)}</td>
                                </tr>
                              `;
                }).join('')}
                          </tbody>
                        </table>
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
      `;
        }).join('')}
          </div>
        </div>
      ` : `
        <div class="intel-card" style="padding:26px;text-align:center;color:var(--text-muted);">
          Nu ai încă poziții salvate în portofoliul tău real. Lipește situația din broker mai sus sau adaugă prima poziție.
        </div>
      `}
    `;

    const persistAndRefresh = async (nextPf, noticeText, noticeTone = 'ok') => {
      try {
        await bridge().saveRealPortfolio(nextPf);
        const updAst = (nextPf?.assets || []).find(a => a.id === stateIntel.pfCalcAssetId || a.brokerSym === stateIntel.pfCalcAssetId);
        if (updAst) {
          const firstSl = (updAst.lots || []).find(l => l.sl != null && Number(l.sl) > 0)?.sl ?? updAst.sl;
          const firstTp = (updAst.lots || []).find(l => l.tp != null && Number(l.tp) > 0)?.tp ?? updAst.tp;
          if (firstSl != null && Number(firstSl) > 0) stateIntel.pfCalcSlInput = String(Number(firstSl));
          if (firstTp != null && Number(firstTp) > 0) stateIntel.pfCalcTpInput = String(Number(firstTp));
        }
        stateIntel.pfEvalData = null;
        stateIntel.pfNotice = noticeText ? { text: noticeText, tone: noticeTone } : null;
        await renderRealPortfolioView(true);
      } catch (err) {
        stateIntel.pfNotice = { text: err.message, tone: 'err' };
        renderRealPortfolioStageFromData(pf, evalData);
      }
    };

    stage.querySelector('[data-jumpchart]')?.addEventListener('click', () => switchWorkspaceView('chart'));
    stage.querySelector('#pfRefreshBtn')?.addEventListener('click', async () => {
      stateIntel.pfNotice = null;
      stateIntel.pfCalcSlInput = '';
      stateIntel.pfCalcTpInput = '';
      try {
        await fetch('/api/etoro/sync', { method: 'POST' });
      } catch (_) { }
      renderRealPortfolioView(true);
    });
    stage.querySelector('#pfNoticeClose')?.addEventListener('click', () => {
      stateIntel.pfNotice = null;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfToggleImportBtn')?.addEventListener('click', () => {
      stateIntel.pfShowImporter = !stateIntel.pfShowImporter;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfToggleSmartAlertsBtn')?.addEventListener('click', () => {
      stateIntel.pfShowSmartAlerts = !stateIntel.pfShowSmartAlerts;
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { });
      }
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfCloseSmartAlertsBtn')?.addEventListener('click', () => {
      stateIntel.pfShowSmartAlerts = false;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfAutoPushToggleBtn')?.addEventListener('click', () => {
      stateIntel.pfAutoPushEnabled = !stateIntel.pfAutoPushEnabled;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfPushTelegramNowBtn')?.addEventListener('click', async () => {
      try {
        const res = await pushSmartSignalsToTelegram(smartSignals, true);
        if (res.ok === false) throw new Error(res.error || 'Eroare trimitere Telegram.');
        stateIntel.pfNotice = { text: `Raportul Smart (${smartSignals.length} alerte & oportunități portofoliu) a fost trimis pe Telegram (@jeka7ro_bot)!`, tone: 'ok' };
        renderRealPortfolioStageFromData(pf, evalData);
      } catch (err) {
        stateIntel.pfNotice = { text: err.message, tone: 'err' };
        renderRealPortfolioStageFromData(pf, evalData);
      }
    });
    stage.querySelector('#pfToggleEtoroCfgBtn')?.addEventListener('click', () => {
      stateIntel.pfShowEtoroConfig = !stateIntel.pfShowEtoroConfig;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfCloseEtoroCfgBtn')?.addEventListener('click', () => {
      stateIntel.pfShowEtoroConfig = false;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    const etoroAuthHeaders = () => {
      const tok = bridge().getAuthToken?.() || localStorage.getItem('tp_auth_token_v1') || '';
      return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
    };
    stage.querySelector('#etoroSaveCfgBtn')?.addEventListener('click', async () => {
      try {
        const apiKey = stage.querySelector('#etoroApiKeyInp')?.value.trim() || '';
        const userKey = stage.querySelector('#etoroUserKeyInp')?.value.trim() || '';
        const enabled = stage.querySelector('#etoroAutoSyncSel')?.value === '1';
        const syncIntervalMin = Number(stage.querySelector('#etoroIntervalSel')?.value || 5);
        const r = await fetch('/api/etoro/config', {
          method: 'POST',
          headers: etoroAuthHeaders(),
          body: JSON.stringify({ apiKey, userKey, enabled, syncIntervalMin })
        });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || 'Eroare salvare configurare eToro.');
        stateIntel.etoroStatus = j;
        stateIntel.pfNotice = { text: 'Configurația eToro READ-ONLY a fost salvată în backend.', tone: 'ok' };
        renderRealPortfolioStageFromData(pf, evalData);
      } catch (err) {
        stateIntel.pfNotice = { text: err.message, tone: 'err' };
        renderRealPortfolioStageFromData(pf, evalData);
      }
    });
    stage.querySelector('#etoroTestConnBtn')?.addEventListener('click', async () => {
      try {
        const apiKey = stage.querySelector('#etoroApiKeyInp')?.value.trim() || '';
        const userKey = stage.querySelector('#etoroUserKeyInp')?.value.trim() || '';
        const r = await fetch('/api/etoro/test', {
          method: 'POST',
          headers: etoroAuthHeaders(),
          body: JSON.stringify({ apiKey, userKey })
        });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || 'Eroare la testarea conexiunii eToro.');
        stateIntel.pfNotice = { text: `Conexiune eToro READ-ONLY verificată! Poziții active: ${j.positionsCount}, Ordine: ${j.ordersCount}.`, tone: 'ok' };
        await renderRealPortfolioView(true);
      } catch (err) {
        stateIntel.pfNotice = { text: err.message, tone: 'err' };
        await renderRealPortfolioView(true);
      }
    });
    stage.querySelector('#etoroSyncNowBtn')?.addEventListener('click', async () => {
      try {
        const apiKey = stage.querySelector('#etoroApiKeyInp')?.value.trim() || '';
        const userKey = stage.querySelector('#etoroUserKeyInp')?.value.trim() || '';
        const enabled = stage.querySelector('#etoroAutoSyncSel')?.value === '1';
        const syncIntervalMin = Number(stage.querySelector('#etoroIntervalSel')?.value || 5);
        if (apiKey || userKey) {
          await fetch('/api/etoro/config', {
            method: 'POST',
            headers: etoroAuthHeaders(),
            body: JSON.stringify({ apiKey, userKey, enabled, syncIntervalMin })
          });
        }
        const r = await fetch('/api/etoro/sync', { method: 'POST', headers: etoroAuthHeaders() });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || 'Eroare sincronizare eToro.');
        if (j.realPortfolio?.assets?.length) {
          try { await bridge().saveRealPortfolio?.(j.realPortfolio); } catch (_) {}
        }
        stateIntel.pfCalcSlInput = '';
        stateIntel.pfCalcTpInput = '';
        stateIntel.pfCalcCashInput = '';
        stateIntel.pfNotice = { text: `Sincronizat din eToro READ-ONLY: ${j.positionsCount} poziții individuale (${j.changesDetected} modificări detectate).`, tone: 'ok' };
        await renderRealPortfolioView(true);
      } catch (err) {
        stateIntel.pfNotice = { text: err.message, tone: 'err' };
        await renderRealPortfolioView(true);
      }
    });
    stage.querySelector('#pfToggleCalcBtn')?.addEventListener('click', () => {
      stateIntel.pfShowCalc = !stateIntel.pfShowCalc;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfCalcCloseBtn')?.addEventListener('click', () => {
      stateIntel.pfShowCalc = false;
      renderRealPortfolioStageFromData(pf, evalData);
    });

    const wireCalcDynamicActions = () => {
      const outEl = stage.querySelector('#pfCalcOutput');
      if (!outEl || !calcRow) return;
      outEl.querySelector('#pfCalcToggleLots')?.addEventListener('click', () => {
        stateIntel.pfCalcShowLots = !stateIntel.pfCalcShowLots;
        refreshCalcOutput();
      });
      outEl.querySelector('#pfCalcApplyBtn')?.addEventListener('click', () => {
        stateIntel.pfCalcConfirmApply = true;
        refreshCalcOutput();
      });
      outEl.querySelector('#pfCalcApplyCancel')?.addEventListener('click', () => {
        stateIntel.pfCalcConfirmApply = false;
        refreshCalcOutput();
      });
      outEl.querySelector('#pfCalcApplyConfirm')?.addEventListener('click', () => {
        const cashValNow = stateIntel.pfCalcCashInput !== ''
          ? stateIntel.pfCalcCashInput
          : (pf.cashAvailable != null ? String(pf.cashAvailable) : '');
        const simNow = computeSlTpSimulation(calcRow, calcRawAsset, stateIntel.pfCalcSlInput, stateIntel.pfCalcTpInput, cashValNow);
        if (!simNow || (!simNow.hasSl && !simNow.hasTp)) return;
        const nextAssets = (pf.assets || []).map(a => {
          if (a.id !== calcRow.id && a.brokerSym !== calcRow.brokerSym) return a;
          const nextInv = (simNow.hasSl && a.invested != null && simNow.cfdUnits > 0)
            ? Math.max(0, Number((Number(a.invested) + simNow.extraCashTotal).toFixed(2)))
            : a.invested;
          return {
            ...a,
            invested: nextInv,
            ...(simNow.hasSl ? { sl: simNow.targetSl } : {}),
            ...(simNow.hasTp ? { tp: simNow.targetTp } : {}),
            lots: (a.lots || []).map(l => ({
              ...l,
              ...(simNow.hasSl ? { sl: simNow.targetSl } : {}),
              ...(simNow.hasTp ? { tp: simNow.targetTp } : {})
            }))
          };
        });
        stateIntel.pfCalcConfirmApply = false;
        const msgParts = [
          simNow.hasSl ? `SL → $${fmtPx(simNow.targetSl)}` : '',
          simNow.hasTp ? `TP → $${fmtPx(simNow.targetTp)}` : ''
        ].filter(Boolean).join(', ');
        persistAndRefresh({ ...pf, assets: nextAssets }, `${calcRow.brokerSym} actualizat în bulk (${msgParts}).`);
      });
    };

    const refreshCalcOutput = () => {
      const outEl = stage.querySelector('#pfCalcOutput');
      if (!outEl || !calcRow) return;
      const cashValNow = stateIntel.pfCalcCashInput !== ''
        ? stateIntel.pfCalcCashInput
        : defaultTradingCash;
      const simNow = computeSlTpSimulation(calcRow, calcRawAsset, stateIntel.pfCalcSlInput, stateIntel.pfCalcTpInput, cashValNow);
      outEl.innerHTML = renderSlTpCalcResultHtml(calcRow, simNow, stateIntel.pfCalcShowLots, stateIntel.pfCalcConfirmApply);
      wireCalcDynamicActions();
    };
    wireCalcDynamicActions();

    stage.querySelector('#pfCalcSym')?.addEventListener('change', (e) => {
      const nextId = e.target.value;
      const nextRow = allRows.find(x => x.id === nextId || x.brokerSym === nextId);
      const nextRaw = nextRow ? (pf.assets || []).find(a => a.id === nextRow.id || a.brokerSym === nextRow.brokerSym) : null;
      const defs = defaultCalcInputsForRow(nextRow, nextRaw);
      stateIntel.pfCalcAssetId = nextId;
      stateIntel.pfCalcSlInput = defs.sl;
      stateIntel.pfCalcTpInput = defs.tp;
      stateIntel.pfCalcConfirmApply = false;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfCalcSl')?.addEventListener('input', (e) => {
      stateIntel.pfCalcSlInput = e.target.value;
      stateIntel.pfCalcConfirmApply = false;
      refreshCalcOutput();
    });
    stage.querySelector('#pfCalcTp')?.addEventListener('input', (e) => {
      stateIntel.pfCalcTpInput = e.target.value;
      stateIntel.pfCalcConfirmApply = false;
      refreshCalcOutput();
    });
    const applyCashToSl = (rawCashStr) => {
      stateIntel.pfCalcCashInput = rawCashStr;
      stateIntel.pfCalcConfirmApply = false;
      const cashNum = pfParseNum(rawCashStr);
      if (cashNum !== null && cashNum >= 0 && calcRow) {
        const baseSim = computeSlTpSimulation(calcRow, calcRawAsset, stateIntel.pfCalcSlInput || '1', stateIntel.pfCalcTpInput, null);
        if (baseSim && baseSim.cfdUnits > 0 && baseSim.avgRefSl != null) {
          const mainSign = calcRow.side === 'SHORT' ? -1 : 1;
          const dec = Number(calcRow.livePrice || 0) >= 1 ? 2 : 4;
          const factor = Math.pow(10, dec);
          const stepUnit = 1 / factor;
          // Exact 2-decimal lot-by-lot search so the suggested SL never exceeds cashNum in eToro
          const startSl = baseSim.maxOldSl != null ? baseSim.maxOldSl : Number(baseSim.avgRefSl.toFixed(dec));
          let bestCand = startSl;
          for (let k = 0; k <= 5000; k++) {
            const cand = Number((startSl - mainSign * k * stepUnit).toFixed(dec));
            if (cand <= 0) break;
            const testSim = computeSlTpSimulation(calcRow, calcRawAsset, cand.toFixed(dec), stateIntel.pfCalcTpInput, null);
            if (testSim && testSim.extraCashTotal <= cashNum + 1e-6) {
              bestCand = cand;
            } else {
              break;
            }
          }
          const autoSl = Math.max(0.0001, Number(bestCand.toFixed(dec)));
          const slStr = autoSl.toFixed(dec);
          stateIntel.pfCalcSlInput = slStr;
          const slInp = stage.querySelector('#pfCalcSl');
          if (slInp) slInp.value = slStr;
          stage.querySelectorAll('.pf-calc-pre[data-kind="sl"]').forEach(x => {
            x.classList.toggle('active', Math.abs(Number(x.dataset.val) - autoSl) < 1e-4);
          });
        }
      }
      refreshCalcOutput();
    };

    stage.querySelector('#pfCalcCashInp')?.addEventListener('input', (e) => {
      applyCashToSl(e.target.value);
    });
    stage.querySelectorAll('.pf-step-btn').forEach(b => {
      b.addEventListener('click', () => {
        const targetId = b.dataset.stepTarget;
        const delta = Number(b.dataset.step) || 0;
        const inp = stage.querySelector(`#${targetId}`);
        if (!inp) return;
        const curRaw = pfParseNum(inp.value);
        const fallback = targetId === 'pfCalcCashInp' ? 0 : (Number(calcRow?.livePrice) || 0);
        const base = curRaw !== null ? curRaw : fallback;
        const decimals = (targetId === 'pfCalcSl' || targetId === 'pfCalcTp' || targetId === 'pfCalcCashInp') ? 2 : (Math.abs(delta) < 1 ? 2 : 0);
        const nextVal = Math.max(0, Number((base + delta).toFixed(decimals)));
        const strVal = decimals > 0 ? nextVal.toFixed(decimals) : String(nextVal);
        inp.value = strVal;
        stateIntel.pfCalcConfirmApply = false;
        if (targetId === 'pfCalcCashInp') {
          applyCashToSl(strVal);
          return;
        }
        if (targetId === 'pfCalcSl') stateIntel.pfCalcSlInput = strVal;
        else if (targetId === 'pfCalcTp') stateIntel.pfCalcTpInput = strVal;
        refreshCalcOutput();
      });
    });
    stage.querySelectorAll('.pf-calc-pre').forEach(b => {
      b.addEventListener('click', () => {
        const kind = b.dataset.kind;
        const val = b.dataset.val || '';
        stateIntel.pfCalcConfirmApply = false;
        stage.querySelectorAll(`.pf-calc-pre[data-kind="${kind}"]`).forEach(x => x.classList.toggle('active', x === b));
        if (kind === 'sl') {
          stateIntel.pfCalcSlInput = val;
          const inp = stage.querySelector('#pfCalcSl');
          if (inp) inp.value = val;
        } else {
          stateIntel.pfCalcTpInput = val;
          const inp = stage.querySelector('#pfCalcTp');
          if (inp) inp.value = val;
        }
        refreshCalcOutput();
      });
    });
    stage.querySelectorAll('.pf-calc-sym-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.pfcalc;
        const nextRow = allRows.find(x => x.id === id || x.brokerSym === id);
        const nextRaw = nextRow ? (pf.assets || []).find(a => a.id === nextRow.id || a.brokerSym === nextRow.brokerSym) : null;
        const defs = defaultCalcInputsForRow(nextRow, nextRaw);
        stateIntel.pfShowCalc = true;
        stateIntel.pfCalcAssetId = id;
        stateIntel.pfCalcSlInput = defs.sl;
        stateIntel.pfCalcTpInput = defs.tp;
        stateIntel.pfCalcConfirmApply = false;
        renderRealPortfolioStageFromData(pf, evalData);
        stage.querySelector('#pfCalcCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    stage.querySelector('#pfAddAssetBtn')?.addEventListener('click', () => {
      stateIntel.pfEditAssetId = '';
      stateIntel.pfShowAddModal = !stateIntel.pfShowAddModal;
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfEditCancelBtn')?.addEventListener('click', () => {
      stateIntel.pfShowAddModal = false;
      stateIntel.pfEditAssetId = '';
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelector('#pfExportBtn')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(pf, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `TradePro_RealPortfolio_${curUser?.username || 'user'}.json`;
      a.click();
    });

    stage.querySelector('#pfSaveMetaBtn')?.addEventListener('click', () => {
      const nextPf = {
        ...pf,
        broker: stage.querySelector('#pfMetaBroker')?.value.trim() || 'eToro',
        cashAvailable: pfParseNum(stage.querySelector('#pfMetaCash')?.value),
        accountEquity: pfParseNum(stage.querySelector('#pfMetaEquity')?.value),
        notes: stage.querySelector('#pfMetaNotes')?.value.trim() || ''
      };
      persistAndRefresh(nextPf, 'Datele generale ale contului (broker / cash / equity) au fost salvate privat.');
    });

    stage.querySelector('#pfParsePreviewBtn')?.addEventListener('click', () => {
      const raw = stage.querySelector('#pfPasteBox')?.value || '';
      const mode = stage.querySelector('#pfImportMode')?.value || 'auto';
      const targetS = stage.querySelector('#pfImportTargetSym')?.value || '';
      const parsed = parseBrokerPortfolioText(raw, mode, targetS);
      if (!parsed.ok) {
        stateIntel.pfParsePreview = `Eroare: ${parsed.error}`;
      } else if (parsed.kind === 'lots') {
        stateIntel.pfParsePreview = `Detectate ${parsed.lots.length} loturi pentru ${parsed.targetBrokerSym}: total ${parsed.lots.reduce((s, l) => s + l.units, 0).toFixed(4)} unități.`;
      } else {
        stateIntel.pfParsePreview = `Detectate ${parsed.assets.length} active: ${parsed.assets.map(a => `${a.brokerSym} (${a.units} @ ${a.avgOpen})`).join(', ')}.`;
      }
      renderRealPortfolioStageFromData(pf, evalData);
    });

    stage.querySelector('#pfParseApplyBtn')?.addEventListener('click', () => {
      const raw = stage.querySelector('#pfPasteBox')?.value || '';
      const mode = stage.querySelector('#pfImportMode')?.value || 'auto';
      const mergeMode = stage.querySelector('#pfImportMergeMode')?.value || 'merge';
      const targetS = stage.querySelector('#pfImportTargetSym')?.value || '';
      const parsed = parseBrokerPortfolioText(raw, mode, targetS);
      if (!parsed.ok) {
        stateIntel.pfNotice = { text: parsed.error, tone: 'err' };
        renderRealPortfolioStageFromData(pf, evalData);
        return;
      }

      const nextPf = {
        ...pf,
        cashAvailable: parsed.meta?.cashAvailable ?? pf.cashAvailable,
        accountEquity: parsed.meta?.accountEquity ?? pf.accountEquity,
        assets: Array.isArray(pf.assets) ? pf.assets.map(x => ({ ...x, lots: [...(x.lots || [])] })) : []
      };

      if (parsed.kind === 'full') {
        nextPf.broker = parsed.portfolio.broker || nextPf.broker;
        nextPf.currency = parsed.portfolio.currency || nextPf.currency;
        nextPf.assets = parsed.assets;
      } else if (parsed.kind === 'lots') {
        const bSym = String(parsed.targetBrokerSym || parsed.targetSym || '').toUpperCase();
        const hit = nextPf.assets.find(a => a.brokerSym === bSym || a.sym === parsed.targetSym);
        if (hit) {
          hit.lots = parsed.lots;
          if (parsed.netValue) hit.brokerNetValue = parsed.netValue;
        } else {
          nextPf.assets.push({
            id: `ast_${Date.now()}`,
            brokerSym: bSym,
            sym: parsed.targetSym,
            name: parsed.targetName || parsed.targetSym,
            side: parsed.lots[0]?.side || 'LONG',
            units: parsed.lots.reduce((s, l) => s + l.units, 0),
            avgOpen: 0,
            brokerNetValue: parsed.netValue || null,
            lots: parsed.lots
          });
        }
      } else {
        if (mergeMode === 'replace') {
          nextPf.assets = parsed.assets;
        } else {
          for (const inc of parsed.assets) {
            const idx = nextPf.assets.findIndex(x => x.brokerSym === inc.brokerSym || x.sym === inc.sym);
            if (idx >= 0) {
              nextPf.assets[idx] = { ...nextPf.assets[idx], ...inc, id: nextPf.assets[idx].id, lots: inc.lots?.length ? inc.lots : (nextPf.assets[idx].lots || []) };
            } else {
              nextPf.assets.push({ ...inc, id: `ast_${Date.now()}_${nextPf.assets.length}` });
            }
          }
        }
      }

      stateIntel.pfParsePreview = null;
      stateIntel.pfShowImporter = false;
      persistAndRefresh(nextPf, 'Portofoliul tău real a fost actualizat, salvat privat și re-evaluat live!');
    });

    stage.querySelector('#pfClearAllBtn')?.addEventListener('click', () => {
      stateIntel.pfShowImporter = false;
      persistAndRefresh({ ...pf, assets: [] }, 'Toate pozițiile au fost șterse din contul tău.');
    });

    stage.querySelector('#pfEdSaveBtn')?.addEventListener('click', () => {
      const bSym = (stage.querySelector('#pfEdBrokerSym')?.value || '').trim().toUpperCase();
      const units = Number(stage.querySelector('#pfEdUnits')?.value);
      const avgOpen = Number(stage.querySelector('#pfEdOpen')?.value);
      if (!bSym || !Number.isFinite(units) || units <= 0 || !Number.isFinite(avgOpen)) {
        stateIntel.pfNotice = { text: 'Completează simbolul, cantitatea (>0) și prețul de intrare.', tone: 'err' };
        renderRealPortfolioStageFromData(pf, evalData);
        return;
      }
      const nextName = (stage.querySelector('#pfEdName')?.value || '').trim();
      const nextSymRaw = (stage.querySelector('#pfEdSym')?.value || '').trim().toUpperCase();
      const edSl = pfParseNum(stage.querySelector('#pfEdSl')?.value);
      const edTp = pfParseNum(stage.querySelector('#pfEdTp')?.value);
      const edNotes = (stage.querySelector('#pfEdNotes')?.value || '').trim();
      const edCfd = !!stage.querySelector('#pfEdCfd')?.checked;
      const ed245 = !!stage.querySelector('#pfEd245')?.checked;
      const flattenLots = !!stage.querySelector('#pfEdFlattenLots')?.checked;
      const applySlTpToLots = !!stage.querySelector('#pfEdApplySlTpLots')?.checked;

      let nextLots = (!flattenLots && Array.isArray(editAsset?.lots)) ? editAsset.lots.map(l => ({ ...l })) : [];
      if (nextLots.length > 0) {
        if (applySlTpToLots && (edSl !== null || edTp !== null)) {
          nextLots = nextLots.map(l => ({
            ...l,
            ...(edSl !== null ? { sl: edSl } : {}),
            ...(edTp !== null ? { tp: edTp } : {})
          }));
        }
        const curLotsSum = nextLots.reduce((s, l) => s + Number(l.units || 0), 0);
        if (Math.abs(units - curLotsSum) > 1e-6) {
          if (units < curLotsSum) {
            const reduced = reduceAssetUnits({ ...editAsset, lots: nextLots }, curLotsSum - units, 'proportional');
            nextLots = reduced?.lots || [];
          } else {
            nextLots.push({
              id: `lot_${Date.now()}`,
              openedAt: new Date().toLocaleDateString('ro-RO'),
              type: `${stage.querySelector('#pfEdSide')?.value === 'SHORT' ? 'Sell' : 'Buy'}${edCfd ? ' CFD' : ''}`,
              side: stage.querySelector('#pfEdSide')?.value === 'SHORT' ? 'SHORT' : 'LONG',
              isCfd: edCfd,
              is24_5: ed245,
              units: Number((units - curLotsSum).toFixed(8)),
              open: avgOpen,
              sl: edSl,
              tp: edTp
            });
          }
        }
      }

      const nextItem = {
        id: editAsset?.id || `ast_${Date.now()}`,
        brokerSym: bSym,
        sym: resolveBrokerSymClient(nextSymRaw || bSym, nextName),
        name: nextName || bSym,
        side: stage.querySelector('#pfEdSide')?.value === 'SHORT' ? 'SHORT' : 'LONG',
        units,
        avgOpen,
        invested: pfParseNum(stage.querySelector('#pfEdInvested')?.value),
        sl: edSl,
        tp: edTp,
        notes: edNotes,
        isCfd: edCfd,
        is24_5: ed245,
        lots: nextLots
      };
      const nextAssets = [...(pf.assets || [])];
      if (editAsset) {
        const idx = nextAssets.findIndex(x => x.id === editAsset.id);
        if (idx >= 0) nextAssets[idx] = nextItem;
      } else {
        nextAssets.push(nextItem);
      }
      stateIntel.pfShowAddModal = false;
      stateIntel.pfEditAssetId = '';
      persistAndRefresh({ ...pf, assets: nextAssets }, `Poziția ${bSym} (${units} unități) a fost salvată.`);
    });

    stage.querySelectorAll('[data-pfflt]').forEach(b => {
      b.addEventListener('click', () => {
        stateIntel.pfFilter = b.dataset.pfflt;
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelector('#pfSortSelect')?.addEventListener('change', (e) => {
      stateIntel.pfSort = e.target.value;
      stateIntel.pfSortDir = e.target.value === 'slDist' || e.target.value === 'pnlAsc' ? 'asc' : 'desc';
      renderRealPortfolioStageFromData(pf, evalData);
    });
    stage.querySelectorAll('[data-pfsortcol]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const col = hdr.dataset.pfsortcol;
        if (stateIntel.pfSort === col) {
          stateIntel.pfSortDir = stateIntel.pfSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          stateIntel.pfSort = col;
          stateIntel.pfSortDir = (col === 'sym' || col === 'slDist') ? 'asc' : 'desc';
        }
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('[data-pflotsort]').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const col = hdr.dataset.pflotsort;
        if (stateIntel.pfLotSortCol === col) {
          stateIntel.pfLotSortDir = stateIntel.pfLotSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          stateIntel.pfLotSortCol = col;
          stateIntel.pfLotSortDir = 'desc';
        }
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-expand-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.pfexpand;
        stateIntel.pfExpandedInit = true;
        if (stateIntel.pfExpandedIds.has(id)) {
          stateIntel.pfExpandedIds.delete(id);
        } else {
          stateIntel.pfExpandedIds.add(id);
          const nextRow = allRows.find(x => x.id === id || x.brokerSym === id);
          const nextRaw = nextRow ? (pf.assets || []).find(a => a.id === nextRow.id || a.brokerSym === nextRow.brokerSym) : null;
          if (nextRow) {
            const defs = defaultCalcInputsForRow(nextRow, nextRaw);
            stateIntel.pfCalcAssetId = id;
            stateIntel.pfCalcSlInput = defs.sl;
            stateIntel.pfCalcTpInput = defs.tp;
            stateIntel.pfCalcConfirmApply = false;
          }
        }
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-jump-sym').forEach(b => {
      b.addEventListener('click', () => {
        bridge().loadSymbol(b.dataset.pfsym);
        switchWorkspaceView('chart');
      });
    });
    stage.querySelectorAll('.pf-ask-sym').forEach(b => {
      b.addEventListener('click', () => {
        const s = b.dataset.pfask;
        toggleCopilotDrawer(true);
        askCopilot(`Analizează poziția mea deschisă pe ${s} (avg open ${b.dataset.pfopen}, P/L ${b.dataset.pfpnl}%): ce niveluri tehnice, riscuri SEC/diluție și opțiuni există azi?`);
      });
    });
    stage.querySelectorAll('.pf-edit-btn').forEach(b => {
      b.addEventListener('click', () => {
        stateIntel.pfEditAssetId = b.dataset.pfedit;
        stateIntel.pfShowAddModal = false;
        stateIntel.pfReduceAssetId = '';
        stateIntel.pfConfirmDelAssetId = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-reduce-toggle').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.pfred;
        stateIntel.pfReduceAssetId = stateIntel.pfReduceAssetId === id ? '' : id;
        stateIntel.pfConfirmDelAssetId = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-red-pct').forEach(b => {
      b.addEventListener('click', () => {
        const inp = stage.querySelector(`#${CSS.escape(b.dataset.target)}`);
        if (!inp) return;
        const pct = Number(b.dataset.pct);
        const tot = Number(b.dataset.units);
        inp.value = pct >= 1 ? String(tot) : String(Number((tot * pct).toFixed(4)));
      });
    });
    stage.querySelectorAll('.pf-red-close').forEach(b => {
      b.addEventListener('click', () => {
        stateIntel.pfReduceAssetId = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-red-apply').forEach(b => {
      b.addEventListener('click', () => {
        const astId = b.dataset.pfrun;
        const ast = (pf.assets || []).find(a => a.id === astId);
        if (!ast) return;
        const qty = pfParseNum(stage.querySelector(`#pfRedQty_${CSS.escape(astId)}`)?.value);
        const strat = stage.querySelector(`#pfRedStrat_${CSS.escape(astId)}`)?.value || 'nearest_be';
        if (!qty || qty <= 0) {
          stateIntel.pfNotice = { text: 'Introdu o cantitate validă mai mare ca 0.', tone: 'err' };
          renderRealPortfolioStageFromData(pf, evalData);
          return;
        }
        const nextAst = reduceAssetUnits(ast, qty, strat);
        const nextAssets = nextAst
          ? (pf.assets || []).map(a => a.id === astId ? nextAst : a)
          : (pf.assets || []).filter(a => a.id !== astId);
        stateIntel.pfReduceAssetId = '';
        persistAndRefresh(
          { ...pf, assets: nextAssets },
          nextAst ? `Au fost scoase ${qty} unități din ${ast.brokerSym}.` : `Poziția ${ast.brokerSym} a fost închisă complet.`
        );
      });
    });
    stage.querySelectorAll('.pf-del-btn').forEach(b => {
      b.addEventListener('click', () => {
        stateIntel.pfConfirmDelAssetId = b.dataset.pfdel;
        stateIntel.pfReduceAssetId = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-del-cancel').forEach(b => {
      b.addEventListener('click', () => {
        stateIntel.pfConfirmDelAssetId = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-del-confirm').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.pfdelok;
        stateIntel.pfConfirmDelAssetId = '';
        const nextAssets = (pf.assets || []).filter(a => a.id !== id && a.brokerSym !== id);
        persistAndRefresh({ ...pf, assets: nextAssets }, 'Poziția a fost ștearsă din portofoliul tău.');
      });
    });

    stage.querySelectorAll('.pf-bulk-chk-all').forEach(chk => {
      chk.addEventListener('change', () => {
        const astId = chk.dataset.pfast;
        stage.querySelectorAll(`.pf-lot-chk[data-pfast="${CSS.escape(astId)}"]`).forEach(c => {
          c.checked = chk.checked;
        });
      });
    });

    stage.querySelectorAll('.pf-bulk-sl-btn').forEach(b => {
      const astId = b.dataset.pfbulksl;
      const bulkSlInp = stage.querySelector(`#pfBulkSl_${CSS.escape(astId)}`);
      const bulkTpInp = stage.querySelector(`#pfBulkTp_${CSS.escape(astId)}`);
      bulkSlInp?.addEventListener('input', (e) => {
        const v = e.target.value;
        if (calcRow && calcRow.id === astId && v !== '') {
          stateIntel.pfCalcSlInput = v;
          const topSl = stage.querySelector('#pfCalcSl');
          if (topSl) topSl.value = v;
          refreshCalcOutput();
        }
      });
      bulkTpInp?.addEventListener('input', (e) => {
        const v = e.target.value;
        if (calcRow && calcRow.id === astId && v !== '') {
          stateIntel.pfCalcTpInput = v;
          const topTp = stage.querySelector('#pfCalcTp');
          if (topTp) topTp.value = v;
          refreshCalcOutput();
        }
      });
      b.addEventListener('click', () => {
        const slVal = pfParseNum(bulkSlInp?.value);
        const tpVal = pfParseNum(bulkTpInp?.value);
        const hasSl = slVal !== null && slVal > 0;
        const hasTp = tpVal !== null && tpVal > 0;
        if (!hasSl && !hasTp) {
          stateIntel.pfNotice = { text: 'Introdu un SL (>0) sau TP (>0) pentru aplicarea Bulk.', tone: 'err' };
          renderRealPortfolioStageFromData(pf, evalData);
          return;
        }
        stateIntel.pfCalcAssetId = astId;
        if (hasSl) stateIntel.pfCalcSlInput = String(slVal);
        if (hasTp) stateIntel.pfCalcTpInput = String(tpVal);
        const checkedLotIds = new Set(
          Array.from(stage.querySelectorAll(`.pf-lot-chk[data-pfast="${CSS.escape(astId)}"]:checked`)).map(c => c.dataset.pflotid)
        );
        let changedCount = 0;
        const nextAssets = (pf.assets || []).map(a => {
          if (a.id !== astId) return a;
          const allLotIds = (a.lots || []).map(l => l.id);
          const applyAll = checkedLotIds.size === 0 || checkedLotIds.size === allLotIds.length;
          let extraCashDelta = 0;
          const nextLots = (a.lots || []).map(l => {
            if (!applyAll && !checkedLotIds.has(l.id)) return l;
            changedCount++;
            if (hasSl && l.isCfd && l.sl != null && Number(l.sl) > 0) {
              const sgn = (l.side || a.side) === 'SHORT' ? -1 : 1;
              extraCashDelta += (Number(l.sl) - slVal) * sgn * Number(l.units || 0);
            }
            return {
              ...l,
              ...(hasSl ? { sl: slVal } : {}),
              ...(hasTp ? { tp: tpVal } : {})
            };
          });
          const nextInv = (hasSl && a.invested != null && Math.abs(extraCashDelta) > 0.01)
            ? Math.max(0, Number((Number(a.invested) + extraCashDelta).toFixed(2)))
            : a.invested;
          return {
            ...a,
            invested: nextInv,
            ...(applyAll && hasSl ? { sl: slVal } : {}),
            ...(applyAll && hasTp ? { tp: tpVal } : {}),
            lots: nextLots
          };
        });
        persistAndRefresh({ ...pf, assets: nextAssets }, `Actualizat în Bulk pe ${changedCount} loturi.`);
      });
    });
    stage.querySelectorAll('.pf-add-lot-btn').forEach(b => {
      b.addEventListener('click', () => {
        const astId = b.dataset.pfaddlot;
        stateIntel.pfAddLotAssetId = stateIntel.pfAddLotAssetId === astId ? '' : astId;
        stateIntel.pfEditLotKey = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-save-new-lot').forEach(b => {
      b.addEventListener('click', () => {
        const astId = b.dataset.pfast;
        const typeStr = stage.querySelector(`#pfNewLotType_${CSS.escape(astId)}`)?.value || 'Buy CFD';
        const uNum = pfParseNum(stage.querySelector(`#pfNewLotUnits_${CSS.escape(astId)}`)?.value);
        const pNum = pfParseNum(stage.querySelector(`#pfNewLotOpen_${CSS.escape(astId)}`)?.value);
        const slNum = pfParseNum(stage.querySelector(`#pfNewLotSl_${CSS.escape(astId)}`)?.value);
        const tpNum = pfParseNum(stage.querySelector(`#pfNewLotTp_${CSS.escape(astId)}`)?.value);
        if (!uNum || uNum <= 0 || pNum === null) {
          stateIntel.pfNotice = { text: 'Completează cantitatea (>0) și prețul de intrare pentru lot.', tone: 'err' };
          renderRealPortfolioStageFromData(pf, evalData);
          return;
        }
        const nextAssets = (pf.assets || []).map(a => {
          if (a.id !== astId) return a;
          const nextLots = [{
            id: `lot_${Date.now()}`,
            openedAt: new Date().toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            type: typeStr,
            side: /^sell/i.test(typeStr) ? 'SHORT' : 'LONG',
            isCfd: /cfd/i.test(typeStr),
            is24_5: !!a.is24_5,
            units: uNum,
            open: pNum,
            sl: slNum,
            tp: tpNum
          }, ...(a.lots || [])];
          return { ...a, lots: nextLots };
        });
        stateIntel.pfAddLotAssetId = '';
        persistAndRefresh({ ...pf, assets: nextAssets }, 'Lot nou adăugat în poziție.');
      });
    });
    stage.querySelectorAll('.pf-edit-lot-btn').forEach(b => {
      b.addEventListener('click', () => {
        stateIntel.pfEditLotKey = b.dataset.pflotkey;
        stateIntel.pfAddLotAssetId = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-cancel-edit-lot').forEach(b => {
      b.addEventListener('click', () => {
        stateIntel.pfEditLotKey = '';
        renderRealPortfolioStageFromData(pf, evalData);
      });
    });
    stage.querySelectorAll('.pf-save-edit-lot').forEach(b => {
      b.addEventListener('click', () => {
        const astId = b.dataset.pfast;
        const lotId = b.dataset.pflotid;
        const typeStr = stage.querySelector('#pfEdLotType')?.value || 'Buy CFD';
        const uNum = pfParseNum(stage.querySelector('#pfEdLotUnits')?.value);
        const oNum = pfParseNum(stage.querySelector('#pfEdLotOpen')?.value);
        const slNum = pfParseNum(stage.querySelector('#pfEdLotSl')?.value);
        const tpNum = pfParseNum(stage.querySelector('#pfEdLotTp')?.value);
        if (!uNum || uNum <= 0 || oNum === null) {
          stateIntel.pfNotice = { text: 'Cantitatea (>0) și Open sunt obligatorii pentru lot.', tone: 'err' };
          renderRealPortfolioStageFromData(pf, evalData);
          return;
        }
        const nextAssets = (pf.assets || []).map(a => {
          if (a.id !== astId) return a;
          return {
            ...a,
            lots: (a.lots || []).map(l => l.id !== lotId ? l : {
              ...l,
              type: typeStr,
              side: /^sell/i.test(typeStr) ? 'SHORT' : 'LONG',
              isCfd: /cfd/i.test(typeStr),
              is24_5: /24\/5/.test(typeStr) || l.is24_5,
              units: uNum,
              open: oNum,
              sl: slNum,
              tp: tpNum
            })
          };
        });
        stateIntel.pfEditLotKey = '';
        persistAndRefresh({ ...pf, assets: nextAssets }, 'Lotul a fost actualizat.');
      });
    });
    stage.querySelectorAll('.pf-del-lot-btn').forEach(b => {
      b.addEventListener('click', () => {
        const astId = b.dataset.pfast;
        const lotId = b.dataset.pflotid;
        const nextAssets = [];
        for (const a of (pf.assets || [])) {
          if (a.id !== astId) {
            nextAssets.push(a);
            continue;
          }
          const delLot = (a.lots || []).find(l => l.id === lotId);
          const remLots = (a.lots || []).filter(l => l.id !== lotId);
          if (remLots.length > 0) {
            const prevSum = (a.lots || []).reduce((s, l) => s + Number(l.units || 0), 0);
            const newSum = remLots.reduce((s, l) => s + Number(l.units || 0), 0);
            const ratio = prevSum > 0 ? newSum / prevSum : 1;
            nextAssets.push({
              ...a,
              lots: remLots,
              invested: a.invested != null ? Number((Number(a.invested) * ratio).toFixed(2)) : a.invested
            });
          } else if ((a.lots || []).length > 0 && delLot) {
            // Removing the last remaining lot removes the position if it held all remaining units
            const leftU = Math.max(0, Number(a.units || 0) - Number(delLot.units || 0));
            if (leftU > 1e-6) {
              nextAssets.push({ ...a, units: Number(leftU.toFixed(8)), lots: [] });
            }
          } else {
            nextAssets.push(a);
          }
        }
        persistAndRefresh({ ...pf, assets: nextAssets }, 'Lot șters și poziția recalculată.');
      });
    });
  }

  // ─── ADMIN USERS & SECURITY CONTROL PANEL (ADMIN ONLY) ───────────────────
  async function adminApiFetch(url, { method = 'GET', body = null } = {}) {
    const tok = bridge().getAuthToken?.() || localStorage.getItem('tp_auth_token_v1') || '';
    const headers = { Accept: 'application/json' };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    if (body !== null) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, {
      method,
      headers,
      cache: 'no-store',
      body: body !== null ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({ ok: false, error: 'Răspuns invalid de la server.' }));
    if (!r.ok || j.ok === false) {
      if (r.status === 401 || r.status === 403) {
        if (r.status === 401) bridge().forceAuthLock?.(j.error);
      }
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    return j;
  }

  function fmtAdminDate(ts) {
    if (!ts || !isFinite(Number(ts))) return '—';
    try {
      return new Date(Number(ts)).toLocaleString('ro-RO', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return '—';
    }
  }

  function renderAdminUsersPanelFromCache() {
    const stage = document.getElementById('intelStage');
    const pack = stateIntel.adminUsersData;
    const curUser = bridge().getUser?.();
    if (!stage || !pack) return;

    const stats = pack.stats || {};
    const allUsers = Array.isArray(pack.users) ? pack.users : [];
    const q = String(stateIntel.adminSearch || '').trim().toLowerCase();
    const flt = stateIntel.adminFilter || 'all';

    const filtered = allUsers.filter(u => {
      if (flt === 'active' && u.blocked) return false;
      if (flt === 'blocked' && !u.blocked) return false;
      if (flt === 'google' && u.authProvider !== 'google' && u.authProvider !== 'both') return false;
      if (flt === 'admin' && u.role !== 'admin') return false;
      if (!q) return true;
      const hay = [
        u.username, u.email, u.role, u.authProvider, u.activeSymbol,
        ...(u.personalSymbols || []), ...(u.profileNames || [])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    const editTarget = stateIntel.adminEditUserId ? allUsers.find(u => u.id === stateIntel.adminEditUserId) : null;

    stage.innerHTML = `
      <div class="intel-head">
        <div class="intel-title-grp">
          <div class="intel-h1">Admin Conturi &amp; Securitate</div>
          <div class="intel-sub">Control total utilizatori · Acces strict pe bază de autentificare · Rol curent: @${esc(curUser?.username || 'admin')}</div>
        </div>
        <div class="intel-controls">
          <button id="admRefreshBtn" class="intel-chip-btn" type="button">${ICO.refresh}<span>Reîmprospătează</span></button>
          <button class="intel-chip-btn" type="button" data-jumpchart="true">${ICO.chart}<span>Înapoi la Grafic</span></button>
        </div>
      </div>

      ${stateIntel.adminNotice ? `
        <div class="adm-notice ${stateIntel.adminNotice.tone === 'err' ? 'is-err' : 'is-ok'}">
          <span>${esc(stateIntel.adminNotice.text)}</span>
          <button type="button" id="admNoticeClose" class="adm-notice-x" title="Închide">${ICO.close}</button>
        </div>
      ` : ''}

      <div class="adm-kpi-grid">
        <div class="intel-card adm-kpi-card">
          <div class="adm-kpi-lbl">Total Conturi</div>
          <div class="adm-kpi-val tabular">${stats.totalUsers ?? allUsers.length}</div>
        </div>
        <div class="intel-card adm-kpi-card">
          <div class="adm-kpi-lbl">Active</div>
          <div class="adm-kpi-val up tabular">${stats.activeUsers ?? 0}</div>
        </div>
        <div class="intel-card adm-kpi-card">
          <div class="adm-kpi-lbl">Blocate</div>
          <div class="adm-kpi-val dn tabular">${stats.blockedUsers ?? 0}</div>
        </div>
        <div class="intel-card adm-kpi-card">
          <div class="adm-kpi-lbl">Google OAuth</div>
          <div class="adm-kpi-val blue tabular">${stats.googleUsers ?? 0}</div>
        </div>
        <div class="intel-card adm-kpi-card">
          <div class="adm-kpi-lbl">Simboluri Personale</div>
          <div class="adm-kpi-val tabular">${stats.totalPersonalSymbols ?? 0}</div>
        </div>
        <div class="intel-card adm-kpi-card">
          <div class="adm-kpi-lbl">Bază Generală</div>
          <div class="adm-kpi-val tabular">${stats.generalWatchlistCount ?? 0} repere</div>
        </div>
      </div>

      ${editTarget ? `
        <form id="admEditForm" class="intel-card adm-edit-card">
          <div class="adm-edit-hdr">
            <div>
              <div class="intel-h2" style="margin:0;">Editează Cont · @${esc(editTarget.username)}</div>
              <div style="font-size:11px;color:var(--text-muted);">${esc(editTarget.email)} · ID: ${esc(editTarget.id)}</div>
            </div>
            <button type="button" id="admEditCancelBtn" class="intel-chip-btn">${ICO.close}<span>Anulează</span></button>
          </div>
          <div class="adm-edit-grid">
            <label class="auth-field">
              <span>Username</span>
              <input id="admEdUser" class="tv-input" value="${esc(editTarget.username)}" required>
            </label>
            <label class="auth-field">
              <span>Email</span>
              <input id="admEdEmail" type="email" class="tv-input" value="${esc(editTarget.email)}" required>
            </label>
            <label class="auth-field">
              <span>Rol</span>
              <select id="admEdRole" class="tv-input" ${editTarget.id === curUser?.id ? 'disabled' : ''}>
                <option value="user" ${editTarget.role !== 'admin' ? 'selected' : ''}>Utilizator (user)</option>
                <option value="admin" ${editTarget.role === 'admin' ? 'selected' : ''}>Administrator (admin)</option>
              </select>
            </label>
            <label class="auth-field">
              <span>Parolă nouă (opțional, min. 4 car.)</span>
              <input id="admEdPass" type="password" class="tv-input" placeholder="Lasă gol pentru neschimbat...">
            </label>
          </div>
          <div class="adm-edit-row2">
            <label class="auth-check-row">
              <input id="admEdBlocked" type="checkbox" ${editTarget.blocked ? 'checked' : ''} ${editTarget.id === curUser?.id ? 'disabled' : ''}>
              <span>Cont Blocat (interzice accesul la autentificare și sincronizare)</span>
            </label>
            <input id="admEdReason" class="tv-input" style="max-width:340px;" value="${esc(editTarget.blockedReason || '')}" placeholder="Motiv blocare (opțional)..." ${editTarget.id === curUser?.id ? 'disabled' : ''}>
          </div>
          <div class="adm-edit-foot">
            <label class="auth-check-row" style="color:var(--tv-amber);">
              <input id="admEdResetPers" type="checkbox">
              <span>Resetează datele personale (simboluri, profile, desene, alerte)</span>
            </label>
            <button type="submit" id="admEdSaveBtn" class="tv-primary-btn" style="height:32px;padding:0 16px;">Salvează Modificări</button>
          </div>
        </form>
      ` : ''}

      <div class="intel-card adm-toolbar-card">
        <div class="adm-toolbar">
          <input id="admSearchInp" class="tv-input" style="max-width:340px;" value="${esc(stateIntel.adminSearch)}" placeholder="Caută după username, email sau ticker...">
          <div class="adm-filter-pills">
            ${[
        ['all', `Toate (${allUsers.length})`],
        ['active', `Active (${stats.activeUsers ?? 0})`],
        ['blocked', `Blocate (${stats.blockedUsers ?? 0})`],
        ['google', `Google (${stats.googleUsers ?? 0})`],
        ['admin', `Admini (${stats.adminUsers ?? 0})`]
      ].map(([k, lbl]) => `
              <button type="button" class="intel-chip-btn ${flt === k ? 'active' : ''}" data-admflt="${k}">${esc(lbl)}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="adm-users-list">
        ${!filtered.length ? `
          <div class="intel-card" style="padding:28px;text-align:center;color:var(--text-muted);">
            Niciun cont găsit pentru filtrul curent.
          </div>
        ` : filtered.map(u => {
        const isSelf = curUser && u.id === curUser.id;
        const provLbl = u.authProvider === 'both' ? 'Google + Parolă' : (u.authProvider === 'google' ? 'Google' : 'Email & Parolă');
        const paperStr = u.paperBalance != null ? `$${Number(u.paperBalance).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';
        return `
            <div class="intel-card adm-user-card ${u.blocked ? 'is-blocked' : ''}">
              <div class="adm-u-top">
                <div class="adm-u-ident">
                  <div class="adm-u-avatar ${u.role === 'admin' ? 'is-admin' : ''}">${esc(String(u.username || 'U').charAt(0).toUpperCase())}</div>
                  <div style="min-width:0;">
                    <div class="adm-u-name-row">
                      <strong>@${esc(u.username)}</strong>
                      ${u.role === 'admin' ? '<span class="pill pill-admin">ADMIN</span>' : '<span class="pill pill-neut">USER</span>'}
                      <span class="pill ${u.authProvider === 'local' ? 'pill-neut' : 'pill-blue'}">${esc(provLbl)}</span>
                      <span class="pill ${u.blocked ? 'pill-sell' : 'pill-buy'}">${u.blocked ? 'Blocat' : 'Activ'}</span>
                      ${isSelf ? '<span class="adm-self-tag">Tu</span>' : ''}
                    </div>
                    <div class="adm-u-email">${esc(u.email)} · ID: <span class="tabular">${esc(u.id)}</span></div>
                    ${u.blocked && u.blockedReason ? `<div class="adm-u-block-reason">Motiv blocare: ${esc(u.blockedReason)}</div>` : ''}
                  </div>
                </div>
                <div class="adm-u-actions">
                  <button type="button" class="intel-chip-btn" data-admedit="${esc(u.id)}">Editează</button>
                  <button type="button" class="intel-chip-btn ${u.blocked ? 'is-unblock' : 'is-block'}" data-admblock="${esc(u.id)}" data-curblocked="${u.blocked ? '1' : '0'}" ${isSelf ? 'disabled title="Nu îți poți bloca propriul cont"' : ''}>
                    ${u.blocked ? 'Deblochează' : 'Blochează'}
                  </button>
                  <button type="button" class="intel-chip-btn is-del" data-admdel="${esc(u.id)}" data-admuname="${esc(u.username)}" data-admmail="${esc(u.email)}" ${isSelf ? 'disabled title="Nu îți poți șterge propriul cont"' : ''}>
                    ${ICO.trash}<span>Șterge</span>
                  </button>
                </div>
              </div>

              <div class="adm-u-meta-grid">
                <div class="adm-u-stat">
                  <span class="adm-k">Creat</span>
                  <span class="adm-v tabular">${esc(fmtAdminDate(u.createdAt))}</span>
                </div>
                <div class="adm-u-stat">
                  <span class="adm-k">Ultima logare</span>
                  <span class="adm-v tabular">${esc(fmtAdminDate(u.lastLoginAt))}</span>
                </div>
                <div class="adm-u-stat">
                  <span class="adm-k">Ultima sincronizare</span>
                  <span class="adm-v tabular">${esc(fmtAdminDate(u.updatedAt))}</span>
                </div>
                <div class="adm-u-stat">
                  <span class="adm-k">Ecran &amp; Layout</span>
                  <span class="adm-v tabular">${esc(u.activeSymbol)} · ${esc(String(u.activeTf).toUpperCase())} · Layout ${esc(u.activeLayout)} · ${u.activeIndicatorsCount} ind.</span>
                </div>
                <div class="adm-u-stat">
                  <span class="adm-k">Resurse Salvate</span>
                  <span class="adm-v tabular">${u.profilesCount} profile · ${u.arrangementsCount} aranj. · ${u.alertsCount} alerte · ${u.drawingsSymbolsCount} desene</span>
                </div>
                <div class="adm-u-stat">
                  <span class="adm-k">Paper Trading</span>
                  <span class="adm-v tabular">${esc(paperStr)} (${u.paperOpenPositions} poz.)</span>
                </div>
              </div>

              <div class="adm-u-syms-row">
                <span class="adm-k">Simboluri personale (${u.personalSymbolsCount}):</span>
                ${(u.personalSymbols || []).length
            ? u.personalSymbols.map(s => `<span class="adm-sym-chip">${esc(s)}</span>`).join('')
            : '<span style="color:var(--text-muted);font-size:11px;">Doar reperele generale</span>'}
                ${u.profileNames?.length ? `<span class="adm-k" style="margin-left:10px;">Profile:</span> ${u.profileNames.map(n => `<span class="adm-sym-chip prof">${esc(n)}</span>`).join('')}` : ''}
              </div>
            </div>
          `;
      }).join('')}
      </div>
    `;

    stage.querySelector('[data-jumpchart]')?.addEventListener('click', () => switchWorkspaceView('chart'));
    stage.querySelector('#admRefreshBtn')?.addEventListener('click', () => {
      stateIntel.adminNotice = null;
      renderAdminUsersView(true);
    });
    stage.querySelector('#admNoticeClose')?.addEventListener('click', () => {
      stateIntel.adminNotice = null;
      renderAdminUsersPanelFromCache();
    });

    const srch = stage.querySelector('#admSearchInp');
    if (srch) {
      srch.addEventListener('input', () => {
        stateIntel.adminSearch = srch.value;
        const pos = srch.selectionStart;
        renderAdminUsersPanelFromCache();
        const nextInp = stage.querySelector('#admSearchInp');
        if (nextInp) {
          nextInp.focus();
          try { nextInp.setSelectionRange(pos, pos); } catch (_) { }
        }
      });
    }

    stage.querySelectorAll('[data-admflt]').forEach(btn => {
      btn.addEventListener('click', () => {
        stateIntel.adminFilter = btn.dataset.admflt;
        renderAdminUsersPanelFromCache();
      });
    });

    stage.querySelectorAll('[data-admedit]').forEach(btn => {
      btn.addEventListener('click', () => {
        stateIntel.adminEditUserId = stateIntel.adminEditUserId === btn.dataset.admedit ? '' : btn.dataset.admedit;
        stateIntel.adminNotice = null;
        renderAdminUsersPanelFromCache();
      });
    });

    stage.querySelector('#admEditCancelBtn')?.addEventListener('click', () => {
      stateIntel.adminEditUserId = '';
      renderAdminUsersPanelFromCache();
    });

    stage.querySelector('#admEditForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editTarget) return;
      const saveBtn = stage.querySelector('#admEdSaveBtn');
      if (saveBtn) saveBtn.disabled = true;
      try {
        const body = {
          userId: editTarget.id,
          username: stage.querySelector('#admEdUser')?.value.trim(),
          email: stage.querySelector('#admEdEmail')?.value.trim(),
          role: stage.querySelector('#admEdRole')?.value,
          blocked: stage.querySelector('#admEdBlocked')?.checked === true,
          blockedReason: stage.querySelector('#admEdReason')?.value.trim() || '',
          newPassword: stage.querySelector('#admEdPass')?.value || '',
          resetPersonal: stage.querySelector('#admEdResetPers')?.checked === true
        };
        const res = await adminApiFetch('/api/auth/admin/user-update', { method: 'POST', body });
        stateIntel.adminUsersData = res;
        stateIntel.adminEditUserId = '';
        stateIntel.adminNotice = { tone: 'ok', text: `Contul @${res.updatedUser?.username || body.username} a fost actualizat.` };
        renderAdminUsersPanelFromCache();
      } catch (err) {
        stateIntel.adminNotice = { tone: 'err', text: err.message };
        renderAdminUsersPanelFromCache();
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });

    stage.querySelectorAll('[data-admblock]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.admblock;
        const currentlyBlocked = btn.dataset.curblocked === '1';
        let reason = '';
        if (!currentlyBlocked) {
          const inpReason = window.prompt('Motiv blocare cont (opțional — va fi afișat utilizatorului):', 'Acces restricționat de administrator');
          if (inpReason === null) return;
          reason = inpReason.trim();
        }
        try {
          const res = await adminApiFetch('/api/auth/admin/user-update', {
            method: 'POST',
            body: { userId: uid, blocked: !currentlyBlocked, blockedReason: reason }
          });
          stateIntel.adminUsersData = res;
          stateIntel.adminNotice = {
            tone: 'ok',
            text: !currentlyBlocked ? `Contul @${res.updatedUser?.username} a fost blocat.` : `Contul @${res.updatedUser?.username} a fost deblocat.`
          };
          renderAdminUsersPanelFromCache();
        } catch (err) {
          stateIntel.adminNotice = { tone: 'err', text: err.message };
          renderAdminUsersPanelFromCache();
        }
      });
    });

    stage.querySelectorAll('[data-admdel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.admdel;
        const uname = btn.dataset.admuname || '';
        const umail = btn.dataset.admmail || '';
        if (!window.confirm(`Ești sigur că vrei să ȘTERGI DEFINITIV contul @${uname} (${umail})?\n\nToate simbolurile, profilele și setările salvate pe acel cont vor fi șterse ireversibil.`)) {
          return;
        }
        try {
          const res = await adminApiFetch('/api/auth/admin/user-delete', {
            method: 'POST',
            body: { userId: uid }
          });
          stateIntel.adminUsersData = res;
          if (stateIntel.adminEditUserId === uid) stateIntel.adminEditUserId = '';
          stateIntel.adminNotice = { tone: 'ok', text: `Contul @${uname} (${umail}) a fost șters definitiv.` };
          renderAdminUsersPanelFromCache();
        } catch (err) {
          stateIntel.adminNotice = { tone: 'err', text: err.message };
          renderAdminUsersPanelFromCache();
        }
      });
    });
  }

  async function renderAdminUsersView(force = false) {
    const stage = document.getElementById('intelStage');
    if (!stage) return;
    if (bridge().getUser?.()?.role !== 'admin') {
      switchWorkspaceView('chart');
      return;
    }
    if (!stateIntel.adminUsersData || force) {
      renderLoadingState('Admin Conturi & Securitate', 'Se încarcă lista conturilor și statisticile de utilizare...');
    } else {
      renderAdminUsersPanelFromCache();
    }
    try {
      const data = await adminApiFetch('/api/auth/admin/users', { method: 'GET' });
      if (stateIntel.view !== 'admin') return;
      stateIntel.adminUsersData = data;
      renderAdminUsersPanelFromCache();
    } catch (e) {
      if (stateIntel.view !== 'admin') return;
      stage.innerHTML = `<div class="intel-card" style="padding:20px;color:var(--tv-red);">Eroare Admin Panel: ${esc(e.message)}</div>`;
    }
  }

  // ─── RIGHT PANEL LIVE AI OBSERVATIONS CARD (PDF PAGE 6 ONDS STYLE) ────────
  function renderRightObsCard(data) {
    const wrap = document.getElementById('aiMarketObsWrap');
    if (!wrap || !data?.aiMarketAnalysis) return;
    const obs = (data.aiMarketAnalysis.observations || []).slice(0, 4);
    const watch = (data.aiMarketAnalysis.watchItems || []).slice(0, 2);
    wrap.innerHTML = `
      <div class="ai-obs-card">
        <div class="ai-obs-hdr">
          <span class="intel-title-sym">${renderSymAvatar(data.sym, 'xs')}<span>AI Market Analysis · ${esc(data.sym)}</span></span>
          <button id="obsOpenDeepBtn" type="button" class="sec-link-btn">${ICO.sec}<span>SEC &amp; Opțiuni</span></button>
        </div>
        <ul class="ai-obs-list">
          ${obs.map(x => `<li>${esc(x)}</li>`).join('')}
          ${watch.map(x => `<li><strong>De urmărit:</strong> ${esc(x)}</li>`).join('')}
        </ul>
        <div class="ai-obs-foot">${esc(data.aiMarketAnalysis.subtitle)}</div>
      </div>
    `;
    wrap.querySelector('#obsOpenDeepBtn')?.addEventListener('click', () => switchWorkspaceView('secnews'));
  }

  async function refreshActiveSymbolObservations(sym, tf) {
    if (!bridge().getUser?.()) return;
    try {
      const data = await getSymbolDeepData(sym, tf, false);
      renderRightObsCard(data);
    } catch (_) { }
  }

  // ─── PAPER PORTFOLIO EXPOSURE & AUTO TRADE JOURNAL ───────────────────────
  function renderPaperIntelSummary(detail) {
    const el = document.getElementById('paperIntelSummary');
    if (!el) return;
    const ctx = bridge().getContext();
    const positions = detail?.positions || ctx.paper?.positions || [];
    const balance = detail?.balance ?? ctx.paper?.balance ?? 10000;

    let longExp = 0, shortExp = 0, maxRiskUsd = 0;
    for (const p of positions) {
      const px = p.lastPrice || p.entry || 0;
      const val = px * (p.qty || 0);
      if (p.isBuy) longExp += val; else shortExp += val;
      maxRiskUsd += Math.abs(p.entry - (p.sl || p.entry)) * (p.qty || 0);
    }
    const grossExp = longExp + shortExp;
    const expPct = balance > 0 ? (grossExp / balance) * 100 : 0;
    const riskPct = balance > 0 ? (maxRiskUsd / balance) * 100 : 0;

    let journal = [];
    try { journal = JSON.parse(localStorage.getItem('tp_ultra_journal') || '[]'); } catch (_) { }

    el.innerHTML = `
      <div class="paper-subcard">
        <div class="paper-subcard-title">
          <span>Expunere Portofoliu &amp; Risc la Stop-Loss</span>
          <span class="tabular">${positions.length} poziții</span>
        </div>
        <div style="font-size:11px;line-height:1.5;color:var(--text);">
          Expunere Brută: <strong class="tabular" style="color:var(--text-bright);">$${grossExp.toFixed(0)}</strong> (${expPct.toFixed(1)}% din capital)<br>
          Long: <strong class="up tabular">$${longExp.toFixed(0)}</strong> · Short: <strong class="dn tabular">$${shortExp.toFixed(0)}</strong><br>
          Risc Total până la SL: <strong class="${riskPct > 5 ? 'dn' : 'amber'} tabular">$${maxRiskUsd.toFixed(2)} (${riskPct.toFixed(2)}%)</strong>
        </div>
      </div>

      <div class="paper-subcard">
        <div class="paper-subcard-title">
          <span>Jurnal Execuții Închise (${journal.length})</span>
          ${journal.length ? `<button id="clearJournalBtn" type="button" class="sec-link-btn">${ICO.trash}<span>Golește</span></button>` : ''}
        </div>
        <div style="max-height:92px;overflow-y:auto;font-size:10.5px;">
          ${journal.slice(0, 6).map(j => `
            <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--border);">
              <span class="intel-title-sym">${renderSymAvatar(j.sym, 'xs')}<span><strong>${esc(j.sym)}</strong> <span class="${j.side === 'LONG' ? 'up' : 'dn'}">${j.side}</span> · ${esc(j.closedAt)}</span></span>
              <span class="tabular ${j.pnl >= 0 ? 'up' : 'dn'}"><strong>${j.pnl >= 0 ? '+' : ''}$${j.pnl}</strong> (${j.rMultiple >= 0 ? '+' : ''}${j.rMultiple}R)</span>
            </div>
          `).join('') || '<div style="color:var(--text-muted);">Pozițiile închise din Paper Trading se salvează automat aici cu multiplu R.</div>'}
        </div>
      </div>
    `;

    el.querySelector('#clearJournalBtn')?.addEventListener('click', () => {
      try { localStorage.removeItem('tp_ultra_journal'); } catch (_) { }
      renderPaperIntelSummary(detail);
    });
  }

  // ─── AI TRADING COPILOT DRAWER ───────────────────────────────────────────
  function toggleCopilotDrawer(open) {
    const drawer = document.getElementById('aiCopilotDrawer');
    const topBtn = document.getElementById('aiCopilotTopBtn');
    const railBtn = document.getElementById('railCopilotBtn');
    const mobChip = document.getElementById('mobCopilotChipBtn');
    if (!drawer) return;
    const next = open != null ? !!open : !drawer.classList.contains('open');
    drawer.classList.toggle('open', next);
    drawer.setAttribute('aria-hidden', next ? 'false' : 'true');
    topBtn?.classList.toggle('active', next);
    railBtn?.classList.toggle('active', next);
    mobChip?.classList.toggle('active', next);

    if (next && window.innerWidth <= 820) {
      document.getElementById('rightPanel')?.classList.remove('mobile-open');
      document.getElementById('bottomDock')?.classList.remove('expanded');
      document.getElementById('leftToolbar')?.classList.remove('mob-draw-open');
      document.getElementById('mobDrawToggleBtn')?.classList.remove('active');
      document.querySelectorAll('.tv-menu.open').forEach(m => m.classList.remove('open'));
    }

    const msgs = document.getElementById('copilotMessages');
    if (next && msgs && !msgs.children.length) {
      const ctx = bridge().getContext();
      msgs.innerHTML = `
        <div class="copilot-msg assistant">
          <div class="copilot-sec-h intel-title-sym">${renderSymAvatar(ctx.sym, 'xs')}<span>Copilot Pregătit (${esc(ctx.sym)})</span></div>
          Întreabă orice despre simbolul activ sau piață. Răspund exclusiv pe baza fluxurilor live:
          Yahoo 5m/Quote/News, SEC EDGAR (S-3, 424B, 8-K, Form 4), Opțiuni CBOE (IV30, Max Pain, GEX) și Early Radar.
        </div>
      `;
    }
    if (next && window.innerWidth > 820) {
      setTimeout(() => document.getElementById('copilotInput')?.focus(), 140);
    }
  }

  async function askCopilot(queryText) {
    const q = String(queryText || '').trim();
    if (!q || stateIntel.copilotBusy) return;
    stateIntel.copilotBusy = true;
    const msgs = document.getElementById('copilotMessages');
    const ctx = bridge().getContext();

    if (msgs) {
      msgs.insertAdjacentHTML('beforeend', `<div class="copilot-msg user">${esc(q)}</div>`);
      const qLabel = q.length > 44 ? `${q.slice(0, 44)}...` : q;
      msgs.insertAdjacentHTML('beforeend', `<div id="copilotTypingMsg" class="copilot-msg assistant" style="color:var(--text-muted);">Se colectează date live pentru „${esc(qLabel)}”...</div>`);
      msgs.scrollTop = msgs.scrollHeight;
    }

    try {
      const res = await fetch('/api/intel/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, sym: ctx.sym, tf: ctx.tf, watchlist: ctx.watchlist })
      });
      const data = await res.json();
      document.getElementById('copilotTypingMsg')?.remove();

      if (msgs) {
        const htmlSections = (data.sections || []).map(s => `
          <div class="copilot-sec-h">${esc(s.heading)}</div>
          <ul class="intel-bullet-list" style="margin-bottom:6px;">
            ${(s.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}
          </ul>
          ${s.quickSymbols?.length ? `
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
              ${s.quickSymbols.map(sym => `<button type="button" class="intel-chip-btn sm" data-copsym="${esc(sym)}">${renderSymAvatar(sym, 'xs')}<span>Încarcă ${esc(sym)}</span></button>`).join('')}
            </div>
          ` : ''}
        `).join('');

        const actionSyms = (Array.isArray(data.syms) && data.syms.length ? data.syms : [data.sym]).filter(Boolean).slice(0, 2);
        const actionBtnsHtml = actionSyms.map(s => `
          <button type="button" class="intel-chip-btn sm" data-copview="chart" data-copsym="${esc(s)}">${renderSymAvatar(s, 'xs')}<span>Grafic ${esc(s)}</span></button>
          <button type="button" class="intel-chip-btn sm" data-copview="secnews" data-copsym="${esc(s)}">${ICO.sec}<span>SEC/Știri ${esc(s)}</span></button>
          <button type="button" class="intel-chip-btn sm" data-copview="options" data-copsym="${esc(s)}">${ICO.options}<span>Opțiuni ${esc(s)}</span></button>
        `).join('');

        msgs.insertAdjacentHTML('beforeend', `
          <div class="copilot-msg assistant">
            ${htmlSections || 'Nu am găsit date concludente pentru această întrebare.'}
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">
              ${actionBtnsHtml}
            </div>
            <div class="ai-obs-foot">${esc(data.answeredAt || '')} · Surse: ${esc(data.sources || '')}</div>
          </div>
        `);
        msgs.scrollTop = msgs.scrollHeight;

        msgs.querySelectorAll('[data-copsym]').forEach(btn => {
          btn.onclick = () => {
            const sym = btn.dataset.copsym;
            const v = btn.dataset.copview || 'chart';
            stateIntel.deepSymInput = sym;
            bridge().loadSymbol(sym);
            switchWorkspaceView(v);
            if (window.innerWidth <= 820) toggleCopilotDrawer(false);
          };
        });
      }
    } catch (e) {
      document.getElementById('copilotTypingMsg')?.remove();
      msgs?.insertAdjacentHTML('beforeend', `<div class="copilot-msg assistant dn">Eroare Copilot: ${esc(e.message)}</div>`);
    } finally {
      stateIntel.copilotBusy = false;
    }
  }

  // ─── ZONE 05: HONEST ORDER FLOW L1 & OHLCV VOLUME PROFILE DOCK ───────────
  async function renderOrderFlowDock(symInput, tfInput = '5m', force = false) {
    const box = document.getElementById('orderFlowDockContainer');
    if (!box) return;
    const sym = String(symInput || bridge().getContext().sym || 'ONDS').toUpperCase().trim();
    const tf = ['1m', '5m', '15m', '30m', '1h', '1D'].includes(tfInput) ? tfInput : '5m';
    stateIntel.orderFlowSym = sym;

    box.innerHTML = `<div style="padding:14px;color:var(--text-muted);font-size:11px;">Se încarcă Order Flow L1 Top-of-Book &amp; Volume Profile OHLCV pentru <strong>${esc(sym)}</strong> (${esc(tf)})...</div>`;
    try {
      const qForce = force ? '&refresh=1' : '';
      const data = await apiGet(`/api/intel/order-flow?sym=${encodeURIComponent(sym)}&tf=${encodeURIComponent(tf)}${qForce}`);
      if (stateIntel.orderFlowSym !== sym) return;

      const l1 = data.l1Quote || {};
      const vp = data.volumeProfile || null;
      const proxy = data.ohlcvProxyFlow || {};
      const tape = data.tickTape || {};
      const sCtx = data.sessionCtx || {};

      const l1BarW = l1.l1ImbalancePct != null ? Math.max(0, Math.min(100, l1.l1ImbalancePct)) : 50;
      const maxBins = vp?.bins ? vp.bins.slice(0, 18) : [];

      box.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong class="intel-title-sym" style="font-size:12px;color:var(--text-bright);">${renderSymAvatar(sym, 'sm')}<span>Zona 05 · Order Flow Intelligence · ${esc(sym)} (${esc(data.interval || tf)})</span></strong>
            ${sCtx.label ? `<span class="intel-sess-pill ${esc(sCtx.tone || 'muted')}">${esc(sCtx.label)} · ${esc(sCtx.timeEt || '')}</span>` : ''}
            <span style="font-size:10px;color:var(--text-muted);">Actualizat RO ${esc(data.updatedTimeRo || '')}</span>
          </div>
          <div style="display:flex;gap:5px;align-items:center;">
            <button type="button" class="intel-chip-btn sm ${tf === '5m' ? 'active' : ''}" data-oftf="5m">${ICO.pulse}<span>5m</span></button>
            <button type="button" class="intel-chip-btn sm ${tf === '15m' ? 'active' : ''}" data-oftf="15m">${ICO.pulse}<span>15m</span></button>
            <button type="button" class="intel-chip-btn sm ${tf === '30m' ? 'active' : ''}" data-oftf="30m">${ICO.pulse}<span>30m</span></button>
            <button id="ofRefreshBtn" type="button" class="intel-chip-btn sm">${ICO.refresh}<span>Actualizează</span></button>
          </div>
        </div>

        <div class="of-grid">
          <div class="of-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <strong style="font-size:11px;color:var(--text-bright);">L1 Top-of-Book Quote (Real)</strong>
              <span class="cp-prebuy-badge ${l1.available ? 'PASS' : 'WARN'}">${l1.available ? 'ACTIV' : 'N/A'}</span>
            </div>
            ${l1.available ? `
              <div class="cp-insp-stats" style="margin-bottom:6px;">
                <div class="cp-insp-row"><span class="cp-insp-lbl">Best Bid × Size</span><span class="cp-insp-val up">${fmtPx(l1.bid)} × ${l1.bidSize ?? '—'}</span></div>
                <div class="cp-insp-row"><span class="cp-insp-lbl">Best Ask × Size</span><span class="cp-insp-val dn">${fmtPx(l1.ask)} × ${l1.askSize ?? '—'}</span></div>
                <div class="cp-insp-row"><span class="cp-insp-lbl">Spread Abs / %</span><span class="cp-insp-val">${l1.spread != null ? fmtPx(l1.spread) : '—'} (${l1.spreadPct != null ? l1.spreadPct.toFixed(2) + '%' : '—'})</span></div>
                <div class="cp-insp-row"><span class="cp-insp-lbl">L1 Size Imbalance</span><span class="cp-insp-val">${l1.l1ImbalancePct != null ? l1.l1ImbalancePct + '% Bid' : 'N/A'}</span></div>
              </div>
              <div style="height:7px;border-radius:999px;background:rgba(242,54,69,0.45);overflow:hidden;">
                <div style="width:${l1BarW}%;height:100%;background:var(--tv-green);"></div>
              </div>
              <div style="font-size:9.5px;color:var(--text-muted);margin-top:4px;">${esc(l1.imbalanceSide || '')} · Sursa: ${esc(l1.source || '')}</div>
            ` : `
              <div style="font-size:10.5px;color:var(--text-muted);line-height:1.4;">Cotația Bid/Ask L1 nu este disponibilă momentan pentru ${esc(sym)} (${esc(sCtx.label || 'sesiune închisă')}).</div>
            `}
          </div>

          <div class="of-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <strong style="font-size:11px;color:var(--text-bright);">Volume Profile OHLCV (${vp ? vp.barsCount + ' bare' : '—'})</strong>
              <span style="font-size:10px;color:var(--tv-amber);font-weight:700;">POC ${vp ? fmtPx(vp.poc) : '—'}</span>
            </div>
            ${vp ? `
              <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--text-muted);margin-bottom:4px;">
                <span>VAH: <strong style="color:var(--text-bright);">${fmtPx(vp.vah)}</strong></span>
                <span>VAL: <strong style="color:var(--text-bright);">${fmtPx(vp.val)}</strong></span>
                <span>Vol: <strong style="color:var(--text-bright);">${fmtCompact(vp.totalVol)}</strong></span>
              </div>
              <div class="of-vp-list" tabindex="0" role="region" aria-label="Histograma Volume Profile OHLCV">
                ${maxBins.map(bn => `
                  <div class="of-vp-row ${bn.isPoc ? 'poc' : (bn.inValueArea ? 'va' : '')}">
                    <span class="tabular" style="color:${bn.isPoc ? 'var(--tv-amber)' : 'var(--text-muted)'};font-weight:${bn.isPoc ? '700' : '500'};">${fmtPx(bn.priceMid)}</span>
                    <div class="of-vp-track"><div class="of-vp-fill" style="width:${Math.max(2, bn.pctOfMax)}%;"></div></div>
                    <span class="tabular" style="text-align:right;color:var(--text-muted);">${fmtCompact(bn.totalVol)}</span>
                  </div>
                `).join('')}
              </div>
              <div style="font-size:9.5px;color:var(--text-muted);margin-top:4px;">
                HVN: ${(vp.hvn || []).map(fmtPx).join(', ') || '—'} · LVN: ${(vp.lvn || []).map(fmtPx).join(', ') || '—'}
              </div>
            ` : '<div style="font-size:10.5px;color:var(--text-muted);">Date insuficiente pentru Volume Profile OHLCV.</div>'}
          </div>

          <div class="of-card">
            <div class="of-unavail-box" style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <strong class="of-unavail-title">Trade Tape &amp; L2 Order Book</strong>
                <span class="cp-prebuy-badge WARN">${esc(tape.statusLabel || 'INDISPONIBIL')}</span>
              </div>
              <div>${esc(tape.reason || 'Lipsesc Time & Sales tick-by-tick și Level 2.')}</div>
              <div style="font-size:9.5px;color:var(--text-muted);margin-top:4px;">Indisponibil nativ: ${esc((tape.missingMetrics || []).join(' · '))}</div>
            </div>
            <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">
              ${esc(proxy.methodLabel || 'Proxy Structural OHLCV')} (${proxy.absorptionCount || 0} bare absorbție)
            </div>
            <div style="max-height:110px;overflow-y:auto;" tabindex="0" role="region" aria-label="Bare Proxy OHLCV Absorbție">
              <table class="cp-table">
                <thead>
                  <tr><th>Oră ET</th><th>Preț</th><th>RVol</th><th>CLV%</th><th>Structură [OHLCV]</th></tr>
                </thead>
                <tbody>
                  ${(proxy.recentBars || []).slice(0, 8).map(b => `
                    <tr>
                      <td>${esc(b.timeEt || b.timeRo || '—')}</td>
                      <td>${fmtPx(b.close)}</td>
                      <td>${b.rvol}x</td>
                      <td class="${b.clvBuyProxyPct >= 55 ? 'up' : (b.clvBuyProxyPct <= 45 ? 'dn' : '')}">${b.clvBuyProxyPct}%</td>
                      <td style="color:${b.isAbsorption ? 'var(--tv-amber)' : 'var(--text-muted)'};">${esc(b.absorptionType)}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Fără bare recente.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      box.querySelector('#ofRefreshBtn')?.addEventListener('click', () => renderOrderFlowDock(sym, tf, true));
      box.querySelectorAll('[data-oftf]').forEach(btn => {
        btn.addEventListener('click', () => renderOrderFlowDock(sym, btn.dataset.oftf, false));
      });
    } catch (e) {
      box.innerHTML = `<div style="padding:12px;color:var(--tv-red);font-size:11px;">Eroare Order Flow Dock: ${esc(e.message)}</div>`;
    }
  }

  // ─── INIT ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-wview]').forEach(btn => {
      btn.addEventListener('click', () => switchWorkspaceView(btn.dataset.wview));
    });

    document.getElementById('aiCopilotTopBtn')?.addEventListener('click', () => toggleCopilotDrawer());
    document.getElementById('railCopilotBtn')?.addEventListener('click', () => toggleCopilotDrawer());
    document.getElementById('mobCopilotChipBtn')?.addEventListener('click', () => toggleCopilotDrawer());
    document.getElementById('copilotCloseBtn')?.addEventListener('click', () => toggleCopilotDrawer(false));

    document.querySelectorAll('#copilotPresets .copilot-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => askCopilot(btn.dataset.cquery));
    });

    document.getElementById('copilotForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('copilotInput');
      if (!inp) return;
      const q = inp.value.trim();
      if (!q) return;
      inp.value = '';
      askCopilot(q);
    });

    window.addEventListener('tp:switchWorkspaceView', (e) => {
      if (e.detail?.view) switchWorkspaceView(e.detail.view);
    });

    window.addEventListener('tp:bottomTabOpened', (e) => {
      if (e.detail?.tab === 'orderflow') {
        renderOrderFlowDock(e.detail?.sym || bridge().getContext().sym, '5m', false);
      }
    });

    window.addEventListener('tp:symbolLoaded', (e) => {
      const sym = e.detail?.sym;
      const tf = e.detail?.tf;
      if (sym) {
        refreshActiveSymbolObservations(sym, tf);
        if (['secnews', 'options', 'builder'].includes(stateIntel.view)) {
          renderActiveIntelStage(false);
        }
        if (document.getElementById('bd-orderflow')?.classList.contains('active')) {
          renderOrderFlowDock(sym, '5m', false);
        }
      }
    });

    window.addEventListener('tp:paperUpdated', (e) => renderPaperIntelSummary(e.detail));

    window.addEventListener('tp:realPortfolioUpdated', () => {
      stateIntel.pfEvalData = null;
      stateIntel.pfEvalTs = 0;
      stateIntel.pfParsePreview = null;
      stateIntel.pfNotice = null;
      stateIntel.pfEditAssetId = '';
      stateIntel.pfExpandedIds.clear();
      try {
        const savedV = localStorage.getItem(ACTIVE_WVIEW_KEY);
        if (savedV === 'admin' && stateIntel.view !== 'admin' && bridge().getUser?.()?.role === 'admin') {
          switchWorkspaceView('admin', false);
          return;
        }
      } catch (_) { }
      if (stateIntel.view === 'portfolio' && bridge().getUser?.()) {
        renderRealPortfolioView(true);
      }
    });

    try {
      const savedView = localStorage.getItem(ACTIVE_WVIEW_KEY);
      if (savedView && savedView !== 'chart') {
        switchWorkspaceView(savedView, false);
      }
    } catch (_) { }

    // Initial passive load for active symbol observations & portfolio exposure (only when authenticated)
    setTimeout(() => {
      if (!bridge().getUser?.()) return;
      const ctx = bridge().getContext();
      if (ctx.sym) refreshActiveSymbolObservations(ctx.sym, ctx.tf);
      renderPaperIntelSummary();
    }, 900);
  });
})();

