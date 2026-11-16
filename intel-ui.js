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
    orderFlowSym: ''
  };

  function bridge() {
    return window.TradeProBridge || {
      getContext: () => ({ sym: 'ONDS', tf: '30m', bars: [], quote: null, watchlist: ['NVDA', 'TSLA', 'APPS', 'ONDS'], paper: { positions: [], balance: 10000, closedPnl: 0 } }),
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
    target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>'
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
  function switchWorkspaceView(view) {
    const valid = ['chart', 'market', 'radar', 'cockpit', 'secnews', 'options', 'builder'];
    const next = valid.includes(view) ? view : 'chart';
    stateIntel.view = next;
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
      setTimeout(() => window.dispatchEvent(new Event('resize')), 40);
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
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
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
            <span style="display:inline-flex;align-items:center;gap:4px;">
              <span class="cp-prop-badge ${sideCls}">${esc(p.badge)}</span>
              <span class="cp-prop-score tabular">${Number(p.score || 0)}p</span>
            </span>
          </div>
          <div class="cp-prop-px-row">
            <span class="cp-prop-px tabular">${fmtPx(p.price)}</span>
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
                  const timeStr = n.publishedTimeEt
                    ? `${n.publishedTimeEt} (${n.publishedTimeRo || ''})`
                    : (n.publishedDate || '');
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

    // Initial passive load for active symbol observations & portfolio exposure
    setTimeout(() => {
      const ctx = bridge().getContext();
      if (ctx.sym) refreshActiveSymbolObservations(ctx.sym, ctx.tf);
      renderPaperIntelSummary();
    }, 900);
  });
})();

