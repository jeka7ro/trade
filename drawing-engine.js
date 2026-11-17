/* ═══════════════════════════════════════════════════════════════════════════
   DRAWING & INSTITUTIONAL OVERLAY ENGINE — TRADEPRO ULTRA
   60fps Canvas 2D Synchronized with LightweightCharts v4
   Renders: VPVR Histogram · SMC (OB / FVG / BOS / CHoCH) · Active Trade Plan
   & Interactive Tools (Trend, Ray, HLine, VLine, Zone, Fib, Long/Short R:R, Ruler)
═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  class ChartOverlayEngine {
    constructor(opts) {
      this.canvas = opts.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.getChart = opts.getChart;
      this.getSeries = opts.getSeries;
      this.getBars = opts.getBars;
      this.fmtPrice = opts.fmtPrice || (v => Number(v).toFixed(2));
      this.onToolReset = opts.onToolReset || (() => { });

      this.tool = 'cursor';
      this.magnet = false;
      this.hideDrawings = false;

      this.symbol = '';
      this.storagePrefix = opts.storagePrefix || 'tp_ultra_drawings_';
      this.onDrawingsChange = typeof opts.onDrawingsChange === 'function' ? opts.onDrawingsChange : null;
      this.drawings = [];
      this.draft = null; // First point clicked while drawing 2-point shapes
      this.mousePt = null;

      // Institutional computed layers
      this.vpvrData = null;
      this.smcData = null;
      this.tradePlan = null;
      this.tpoData = null;
      this.footprintData = null;
      this.patternData = null;
      this.wolfeData = null;
      this.expectedMoveData = null;
      this.showVPVR = false;
      this.showSMC = false;
      this.showTradePlan = true;
      this.showTPO = false;
      this.showFootprint = false;
      this.showAutoPatterns = false;
      this.showWolfeWave = false;
      this.showExpectedMove = false;
      this.showExtSessions = true;

      this._etFmt = null;
      this._etCache = new Map();
      this.hitRegions = [];

      this._raf = null;
      this._bindEvents();
    }

    setSymbol(sym) {
      const next = sym || '';
      if (this.symbol !== next) {
        this.vpvrData = null;
        this.smcData = null;
        this.tradePlan = null;
        this.tpoData = null;
        this.footprintData = null;
        this.patternData = null;
        this.wolfeData = null;
        this.expectedMoveData = null;
        this.hitRegions = [];
      }
      this.symbol = next;
      this.draft = null;
      this._loadDrawings();
      this.requestRender();
    }

    setStorageScope(prefix) {
      this.storagePrefix = prefix || 'tp_ultra_drawings_';
      this.draft = null;
      this._loadDrawings();
      this.requestRender();
    }

    setTool(tool) {
      this.tool = tool || 'cursor';
      this.draft = null;
      if (this.tool === 'cursor') {
        this.canvas.classList.remove('interactive');
      } else {
        this.canvas.classList.add('interactive');
      }
      this.requestRender();
    }

    toggleMagnet() {
      this.magnet = !this.magnet;
      return this.magnet;
    }

    toggleHideDrawings() {
      this.hideDrawings = !this.hideDrawings;
      this.requestRender();
      return this.hideDrawings;
    }

    undo() {
      if (this.draft) {
        this.draft = null;
      } else if (this.drawings.length > 0) {
        this.drawings.pop();
        this._saveDrawings();
      }
      this.requestRender();
    }

    clearAll() {
      this.draft = null;
      this.drawings = [];
      this._saveDrawings();
      this.requestRender();
    }

    setLayers({
      vpvrData, smcData, tradePlan, tpoData, footprintData, patternData, wolfeData, expectedMoveData,
      showVPVR, showSMC, showTradePlan, showTPO, showFootprint, showAutoPatterns, showWolfeWave, showExpectedMove,
      showExtSessions
    }) {
      if (vpvrData !== undefined) this.vpvrData = vpvrData;
      if (smcData !== undefined) this.smcData = smcData;
      if (tradePlan !== undefined) this.tradePlan = tradePlan;
      if (tpoData !== undefined) this.tpoData = tpoData;
      if (footprintData !== undefined) this.footprintData = footprintData;
      if (patternData !== undefined) this.patternData = patternData;
      if (wolfeData !== undefined) this.wolfeData = wolfeData;
      if (expectedMoveData !== undefined) this.expectedMoveData = expectedMoveData;
      if (showVPVR !== undefined) this.showVPVR = showVPVR;
      if (showSMC !== undefined) this.showSMC = showSMC;
      if (showTradePlan !== undefined) this.showTradePlan = showTradePlan;
      if (showTPO !== undefined) this.showTPO = showTPO;
      if (showFootprint !== undefined) this.showFootprint = showFootprint;
      if (showAutoPatterns !== undefined) this.showAutoPatterns = showAutoPatterns;
      if (showWolfeWave !== undefined) this.showWolfeWave = showWolfeWave;
      if (showExpectedMove !== undefined) this.showExpectedMove = showExpectedMove;
      if (showExtSessions !== undefined) this.showExtSessions = showExtSessions;
      this.requestRender();
    }

    resize() {
      const parent = this.canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w <= 0 || h <= 0) return;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.requestRender();
    }

    requestRender() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = null;
        this.render();
      });
    }

    // ─── COORDINATE MAPPING ─────────────────────────────────────────────────
    _priceScaleWidth() {
      const chart = this.getChart();
      try {
        const w = chart && chart.priceScale('right') ? chart.priceScale('right').width() : 64;
        return w > 20 ? w : 64;
      } catch (_) {
        return 64;
      }
    }

    _plotBounds() {
      const dpr = window.devicePixelRatio || 1;
      const totalW = this.canvas.width / dpr;
      const totalH = this.canvas.height / dpr;
      const rightAxisW = this._priceScaleWidth();
      const timeAxisH = 26;
      return {
        w: Math.max(50, totalW - rightAxisW),
        h: Math.max(50, totalH - timeAxisH),
        totalW,
        totalH
      };
    }

    _anchorToXY(anchor) {
      const chart = this.getChart();
      const series = this.getSeries();
      const bars = this.getBars();
      if (!chart || !series || !bars || !bars.length) return null;

      const y = series.priceToCoordinate(anchor.price);
      if (y == null || !isFinite(y)) return null;

      let logical = null;
      if (anchor.time != null) {
        // Binary search exact or nearest bar index for time
        let lo = 0, hi = bars.length - 1, found = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (bars[mid].time === anchor.time) { found = mid; break; }
          if (bars[mid].time < anchor.time) lo = mid + 1;
          else hi = mid - 1;
        }
        if (found !== -1) {
          logical = found;
        } else if (anchor.time > bars[bars.length - 1].time) {
          const barSec = bars.length > 1 ? Math.max(1, bars[bars.length - 1].time - bars[bars.length - 2].time) : 86400;
          logical = (bars.length - 1) + (anchor.time - bars[bars.length - 1].time) / barSec;
        } else {
          logical = Math.max(0, Math.min(bars.length - 1, lo));
        }
      } else if (anchor.logical != null) {
        logical = anchor.logical;
      }

      if (logical == null) return null;
      const x = chart.timeScale().logicalToCoordinate(logical);
      if (x == null || !isFinite(x)) return null;
      return { x, y, logical };
    }

    _xyToAnchor(x, y) {
      const chart = this.getChart();
      const series = this.getSeries();
      const bars = this.getBars();
      if (!chart || !series || !bars || !bars.length) return null;

      let price = series.coordinateToPrice(y);
      const logicalRaw = chart.timeScale().coordinateToLogical(x);
      if (price == null || logicalRaw == null || !isFinite(price) || !isFinite(logicalRaw)) return null;

      const logical = Math.round(logicalRaw);
      let time;
      if (logical >= 0 && logical < bars.length) {
        const b = bars[logical];
        time = b.time;
        if (this.magnet) {
          const candidates = [b.open, b.high, b.low, b.close];
          let best = candidates[0];
          for (const c of candidates) {
            if (Math.abs(c - price) < Math.abs(best - price)) best = c;
          }
          price = best;
        }
      } else if (logical >= bars.length) {
        const barSec = bars.length > 1 ? Math.max(1, bars[bars.length - 1].time - bars[bars.length - 2].time) : 86400;
        time = bars[bars.length - 1].time + (logical - (bars.length - 1)) * barSec;
      } else {
        const barSec = bars.length > 1 ? Math.max(1, bars[1].time - bars[0].time) : 86400;
        time = bars[0].time + logical * barSec;
      }

      return { time, price, logical };
    }

    // ─── INTERACTION EVENTS (DESKTOP MOUSE + MOBILE TOUCH POINTERS) ─────────
    _bindEvents() {
      let startedDraftOnDown = false;

      const getLocalPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      };

      this.canvas.addEventListener('pointermove', (e) => {
        if (this.tool === 'cursor') return;
        const pos = getLocalPos(e);
        this.mousePt = this._xyToAnchor(pos.x, pos.y);
        if (this.draft) this.requestRender();
      });

      this.canvas.addEventListener('pointerdown', (e) => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || this.tool === 'cursor') return;
        e.preventDefault();
        e.stopPropagation();
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { }

        const pos = getLocalPos(e);
        const anchor = this._xyToAnchor(pos.x, pos.y);
        if (!anchor) return;

        // 1-tap tools
        if (this.tool === 'hline' || this.tool === 'vline' || this.tool === 'ray') {
          this.drawings.push({ type: this.tool, p1: anchor, createdAt: Date.now() });
          this._saveDrawings();
          this.setTool('cursor');
          this.onToolReset('cursor');
          return;
        }

        if (this.tool === 'long' || this.tool === 'short') {
          const bars = this.getBars();
          const lastSlice = bars.slice(-15);
          let atrApprox = anchor.price * 0.018;
          if (lastSlice.length > 2) {
            atrApprox = lastSlice.reduce((s, b) => s + (b.high - b.low), 0) / lastSlice.length;
          }
          const risk = Math.max(atrApprox * 1.4, anchor.price * 0.005);
          const isLong = this.tool === 'long';
          const barSec = bars.length > 1 ? Math.max(60, bars[bars.length - 1].time - bars[bars.length - 2].time) : 86400;
          const p2 = {
            time: anchor.time + 14 * barSec,
            price: isLong ? anchor.price + risk * 2.5 : anchor.price - risk * 2.5,
            logical: anchor.logical + 14
          };
          const slPrice = isLong ? anchor.price - risk : anchor.price + risk;
          this.drawings.push({ type: this.tool, p1: anchor, p2, slPrice, createdAt: Date.now() });
          this._saveDrawings();
          this.setTool('cursor');
          this.onToolReset('cursor');
          return;
        }

        // 2-point tools: trend, rect, fib, measure (supports both 2-tap and press-drag-release)
        if (!this.draft) {
          this.draft = { type: this.tool, p1: anchor, startPx: pos };
          this.mousePt = anchor;
          startedDraftOnDown = true;
          this.requestRender();
        } else {
          startedDraftOnDown = false;
          this.drawings.push({ type: this.draft.type, p1: this.draft.p1, p2: anchor, createdAt: Date.now() });
          this.draft = null;
          this._saveDrawings();
          this.setTool('cursor');
          this.onToolReset('cursor');
        }
      });

      this.canvas.addEventListener('pointerup', (e) => {
        if (!startedDraftOnDown || !this.draft || this.tool === 'cursor') return;
        startedDraftOnDown = false;
        const pos = getLocalPos(e);
        const dist = this.draft.startPx
          ? Math.hypot(pos.x - this.draft.startPx.x, pos.y - this.draft.startPx.y)
          : 0;
        if (dist >= 20) {
          const anchor = this._xyToAnchor(pos.x, pos.y);
          if (anchor) {
            this.drawings.push({ type: this.draft.type, p1: this.draft.p1, p2: anchor, createdAt: Date.now() });
            this.draft = null;
            this._saveDrawings();
            this.setTool('cursor');
            this.onToolReset('cursor');
          }
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (this.draft || this.tool !== 'cursor')) {
          this.draft = null;
          this.setTool('cursor');
          this.onToolReset('cursor');
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
          e.preventDefault();
          this.undo();
        }
      });
    }

    _storageKey() {
      return `${this.storagePrefix}${this.symbol || 'DEFAULT'}`;
    }

    _loadDrawings() {
      try {
        const raw = localStorage.getItem(this._storageKey());
        this.drawings = raw ? JSON.parse(raw) : [];
      } catch (_) {
        this.drawings = [];
      }
    }

    _saveDrawings() {
      try {
        localStorage.setItem(this._storageKey(), JSON.stringify(this.drawings.slice(-50)));
        if (this.onDrawingsChange) this.onDrawingsChange(this.symbol, this.drawings);
      } catch (_) { }
    }

    // ─── MASTER RENDER PIPELINE ─────────────────────────────────────────────
    render() {
      const ctx = this.ctx;
      const dpr = window.devicePixelRatio || 1;
      const { w, h, totalW, totalH } = this._plotBounds();

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, totalW, totalH);

      // Clip strictly to plot area so nothing bleeds onto price or time axes
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();

      const chart = this.getChart();
      const series = this.getSeries();
      const bars = this.getBars();
      this.hitRegions = [];
      if (!chart || !series || !bars || !bars.length) {
        ctx.restore();
        return;
      }

      if (this.showExtSessions) this._renderExtendedSessions(ctx, w, h, chart, bars);
      if (this.showTPO && this.tpoData) this._renderTPO(ctx, w, h, series);
      if (this.showVPVR && this.vpvrData) this._renderVPVR(ctx, w, h, series);
      if (this.showSMC && this.smcData) this._renderSMC(ctx, w, h, chart, series, bars);
      if (this.showAutoPatterns && this.patternData) this._renderAutoPatterns(ctx, w, h, chart, series);
      if (this.showWolfeWave) this._renderWolfeWave(ctx, w, h, chart, series, bars);
      if (this.showExpectedMove && this.expectedMoveData) this._renderExpectedMove(ctx, w, h, chart, series, bars);
      if (this.showFootprint && this.footprintData) this._renderFootprint(ctx, w, h, chart, series, bars);
      if (this.showTradePlan && this.tradePlan) this._renderTradePlan(ctx, w, h, chart, series, bars);

      if (!this.hideDrawings) {
        for (const d of this.drawings) {
          this._renderShape(ctx, d, w, h, series, bars);
        }
        if (this.draft && this.mousePt) {
          this._renderShape(ctx, { type: this.draft.type, p1: this.draft.p1, p2: this.mousePt, isDraft: true }, w, h, series, bars);
        }
      }

      ctx.restore();
    }

    // ─── LAYER 0: PRE-MARKET & POST-MARKET EXTENDED SESSION BANDS (TRADINGVIEW ETH) ───
    _classifyETSession(unixSec) {
      const minKey = Math.floor(unixSec / 60);
      const cached = this._etCache.get(minKey);
      if (cached !== undefined) return cached;

      let mins = -1;
      try {
        if (!this._etFmt) {
          this._etFmt = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
          });
        }
        const parts = this._etFmt.formatToParts(new Date(unixSec * 1000));
        let hh = 0, mm = 0;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].type === 'hour') hh = parseInt(parts[i].value, 10) % 24;
          else if (parts[i].type === 'minute') mm = parseInt(parts[i].value, 10);
        }
        mins = hh * 60 + mm;
      } catch (_) {
        const d = new Date((unixSec - 5 * 3600) * 1000);
        mins = d.getUTCHours() * 60 + d.getUTCMinutes();
      }

      // 04:00 - 09:30 ET = Pre-Market | 09:30 - 16:00 ET = Regular | 16:00 - 20:00 ET = Post-Market | 20:00 - 04:00 ET = Overnight (BOATS)
      let sess = 'REG';
      if (mins >= 240 && mins < 570) sess = 'PRE';
      else if (mins >= 960 && mins < 1200) sess = 'POST';
      else if (mins >= 1200 || mins < 240) sess = 'OVN';

      if (this._etCache.size > 12000) this._etCache.clear();
      this._etCache.set(minKey, sess);
      return sess;
    }

    _renderExtendedSessions(ctx, w, h, chart, bars) {
      if (!bars || bars.length < 4) return;
      const sym = String(this.symbol || '').toUpperCase();
      // Skip 24/7 crypto and 24/5 FX spot pairs (session bands apply to US equities, ETFs & index futures)
      if (sym.endsWith('-USD') || sym.endsWith('=X')) return;

      // Determine base bar interval from smallest positive step across recent bars
      let minStep = Infinity;
      const sampleStart = Math.max(1, bars.length - 40);
      for (let i = sampleStart; i < bars.length; i++) {
        const dt = bars[i].time - bars[i - 1].time;
        if (dt > 0 && dt < minStep) minStep = dt;
      }
      // Only shade intraday intervals (< 4 hours = 14400s)
      if (!isFinite(minStep) || minStep >= 14400) return;

      const ts = chart.timeScale();
      let startIdx = 0;
      let endIdx = bars.length - 1;
      try {
        const vr = ts.getVisibleLogicalRange();
        if (vr) {
          startIdx = Math.max(0, Math.floor(vr.from) - 2);
          endIdx = Math.min(bars.length - 1, Math.ceil(vr.to) + 2);
        }
      } catch (_) { }
      if (endIdx < startIdx) return;

      // Estimate half-bar pixel width so adjacent session bars join seamlessly with zero gaps
      let halfBarPx = 3;
      const probeA = ts.timeToCoordinate(bars[Math.max(0, endIdx - 1)].time);
      const probeB = ts.timeToCoordinate(bars[endIdx].time);
      if (probeA != null && probeB != null && probeB > probeA) {
        halfBarPx = Math.max(1, Math.min(24, (probeB - probeA) * 0.5));
      }

      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const sessTheme = {
        PRE: {
          fill: isLight ? 'rgba(245, 158, 11, 0.085)' : 'rgba(245, 158, 11, 0.068)',
          border: isLight ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.16)',
          txt: isLight ? 'rgba(217, 119, 6, 0.72)' : 'rgba(245, 158, 11, 0.55)',
          tag: 'PRE'
        },
        POST: {
          fill: isLight ? 'rgba(41, 98, 255, 0.075)' : 'rgba(41, 98, 255, 0.082)',
          border: isLight ? 'rgba(41, 98, 255, 0.22)' : 'rgba(41, 98, 255, 0.18)',
          txt: isLight ? 'rgba(37, 99, 235, 0.72)' : 'rgba(91, 140, 255, 0.58)',
          tag: 'POST'
        },
        OVN: {
          fill: isLight ? 'rgba(147, 51, 234, 0.075)' : 'rgba(168, 85, 247, 0.072)',
          border: isLight ? 'rgba(147, 51, 234, 0.22)' : 'rgba(168, 85, 247, 0.18)',
          txt: isLight ? 'rgba(126, 34, 206, 0.72)' : 'rgba(192, 132, 252, 0.62)',
          tag: 'OVN'
        }
      };

      const spans = [];
      let curSess = null;
      let curX1 = 0;
      let curX2 = 0;

      for (let i = startIdx; i <= endIdx; i++) {
        const b = bars[i];
        const sess = this._classifyETSession(b.time);
        if (sess === 'REG') {
          if (curSess) {
            spans.push({ sess: curSess, x1: curX1, x2: curX2 });
            curSess = null;
          }
          continue;
        }
        const cx = ts.timeToCoordinate(b.time);
        if (cx == null) continue;
        const left = cx - halfBarPx;
        const right = cx + halfBarPx;

        // Break span if session type changes or if there is a multi-day gap (> 10h)
        const prevBarTime = i > startIdx ? bars[i - 1].time : b.time;
        const hasBigTimeGap = (b.time - prevBarTime) > 36000;

        if (curSess === sess && !hasBigTimeGap) {
          curX2 = Math.max(curX2, right);
        } else {
          if (curSess) spans.push({ sess: curSess, x1: curX1, x2: curX2 });
          curSess = sess;
          curX1 = left;
          curX2 = right;
        }
      }
      if (curSess) spans.push({ sess: curSess, x1: curX1, x2: curX2 });

      if (!spans.length) return;

      ctx.save();
      ctx.font = '600 9px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textBaseline = 'bottom';

      for (let k = 0; k < spans.length; k++) {
        const sp = spans[k];
        const x1 = Math.max(0, sp.x1);
        const x2 = Math.min(w, sp.x2);
        const bw = x2 - x1;
        if (bw <= 0.5) continue;

        const st = sessTheme[sp.sess] || sessTheme.POST;
        ctx.fillStyle = st.fill;
        ctx.fillRect(x1, 0, bw, h);

        // Crisp vertical hairline on session boundary
        ctx.strokeStyle = st.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (sp.x1 >= 1 && sp.x1 <= w - 1) {
          ctx.moveTo(Math.round(x1) + 0.5, 0);
          ctx.lineTo(Math.round(x1) + 0.5, h);
        }
        if (sp.x2 >= 1 && sp.x2 <= w - 1) {
          ctx.moveTo(Math.round(x2) + 0.5, 0);
          ctx.lineTo(Math.round(x2) + 0.5, h);
        }
        ctx.stroke();

        // Subtle institutional session tag near bottom of chart (keeps top legend 100% clear)
        if (bw >= 44) {
          ctx.fillStyle = st.txt;
          ctx.fillText(st.tag, x1 + 5, h - 6);
          const tw = ctx.measureText(st.tag).width;
          const sessDesc = sp.sess === 'PRE'
            ? { title: 'Sesiune PRE-MARKET (SUA)', meaning: 'Tranzacționare înainte de deschiderea bursei americane: 04:00 – 09:30 ET (11:00 – 16:30 ora României).', action: 'Lichiditatea este mai redusă decât în sesiunea regulară și spread-urile pot fi mai mari. Reacțiile la știri sau praguri cheie dau direcția deschiderii.' }
            : sp.sess === 'POST'
              ? { title: 'Sesiune POST-MARKET / After-Hours', meaning: 'Tranzacționare după închiderea bursei americane: 16:00 – 20:00 ET (23:00 – 03:00 ora României).', action: 'Reacții frecvente la raportări financiare (earnings), comunicate SEC 8-K și ghidaj. Confirmă mișcarea la volum mai mare în Pre-Market/RTH.' }
              : { title: 'Sesiune OVERNIGHT (BOATS)', meaning: 'Sesiune de noapte prin Blue Ocean ATS: 20:00 – 04:00 ET (03:00 – 11:00 ora României).', action: 'Indică sentimentul global înainte de Pre-Market. Mișcările pe volum subțire pot fi retestate la 11:00 RO.' };
          this._addHit({ x: x1 + 2, y: h - 20, w: tw + 8, h: 16 }, {
            category: 'Sesiune Extinsă (ETH)',
            badge: st.tag,
            tone: 'neut',
            ...sessDesc
          });
        }
      }
      ctx.restore();
    }

    // ─── LAYER 1: VPVR HISTOGRAM (RIGHT EDGE) ───────────────────────────────
    _renderVPVR(ctx, w, h, series) {
      const vp = this.vpvrData;
      if (!vp || !vp.bins || !vp.maxBinVol) return;
      const maxBarPx = Math.min(84, w * 0.12);

      // Shaded Value Area background strip (VAL -> VAH)
      const yVAH = series.priceToCoordinate(vp.vah);
      const yVAL = series.priceToCoordinate(vp.val);
      if (yVAH != null && yVAL != null) {
        const top = Math.min(yVAH, yVAL);
        const bot = Math.max(yVAH, yVAL);
        ctx.fillStyle = 'rgba(41, 98, 255, 0.03)';
        ctx.fillRect(w - maxBarPx, top, maxBarPx, bot - top);
      }

      for (const bin of vp.bins) {
        const y1 = series.priceToCoordinate(bin.priceHigh);
        const y2 = series.priceToCoordinate(bin.priceLow);
        if (y1 == null || y2 == null) continue;
        const top = Math.min(y1, y2);
        const barH = Math.max(1.5, Math.abs(y2 - y1) - 1);
        if (top + barH < 0 || top > h) continue;

        const inVA = bin.priceMid >= vp.val && bin.priceMid <= vp.vah;
        const totalPx = (bin.totalVol / vp.maxBinVol) * maxBarPx;
        const buyPx = totalPx * (bin.buyVol / (bin.totalVol || 1));
        const sellPx = totalPx - buyPx;

        // Sell portion anchored to right edge, Buy portion extending left
        ctx.fillStyle = inVA ? 'rgba(242, 54, 69, 0.34)' : 'rgba(242, 54, 69, 0.14)';
        ctx.fillRect(w - sellPx, top, sellPx, barH);

        ctx.fillStyle = inVA ? 'rgba(8, 153, 129, 0.36)' : 'rgba(8, 153, 129, 0.14)';
        ctx.fillRect(w - sellPx - buyPx, top, buyPx, barH);
      }

      //POC, VAH & VAL Lines + Capsule Tags
      const yPOC = series.priceToCoordinate(vp.poc);
      if (yPOC != null && yPOC >= 0 && yPOC <= h) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, w - maxBarPx * 1.9), yPOC);
        ctx.lineTo(w, yPOC);
        ctx.stroke();
        ctx.setLineDash([]);
        const pocRect = this._drawTag(ctx, w - maxBarPx - 4, yPOC, `POC ${this.fmtPrice(vp.poc)}`, '#d97706', '#fff', 'right');
        this._addHit(pocRect, {
          category: 'VPVR · Volume Profile',
          badge: `POC ${this.fmtPrice(vp.poc)}`,
          tone: 'warn',
          title: 'Point of Control (POC)',
          meaning: 'Nivelul exact de preț unde s-a tranzacționat cel mai mare volum din zona analizată — prețul de „echilibru” instituțional.',
          action: 'Prețul tinde să fie atras către POC ca un magnet. Deasupra POC cumpărătorii controlează echilibrul; sub POC controlul e bearish.'
        });
        ctx.restore();
      }
      if (yVAH != null && yVAH >= 8 && yVAH <= h - 8 && (!yPOC || Math.abs(yVAH - yPOC) > 16)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, w - maxBarPx * 1.45), yVAH);
        ctx.lineTo(w, yVAH);
        ctx.stroke();
        ctx.setLineDash([]);
        const vahRect = this._drawTag(ctx, w - maxBarPx - 4, yVAH, `VAH ${this.fmtPrice(vp.vah)}`, 'rgba(14, 116, 144, 0.92)', '#e0f2fe', 'right');
        this._addHit(vahRect, {
          category: 'VPVR · Volume Profile',
          badge: `VAH ${this.fmtPrice(vp.vah)}`,
          tone: 'neut',
          title: 'Value Area High (VAH)',
          meaning: 'Limita superioară a zonei în care s-a concentrat 70% din volumul total (zona de valoare corectă).',
          action: 'Funcționează ca rezistență în consolidări; un breakout susținut peste VAH indică acceptarea unor prețuri mai mari (impuls bullish).'
        });
        ctx.restore();
      }
      if (yVAL != null && yVAL >= 8 && yVAL <= h - 8 && (!yPOC || Math.abs(yVAL - yPOC) > 16)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, w - maxBarPx * 1.45), yVAL);
        ctx.lineTo(w, yVAL);
        ctx.stroke();
        ctx.setLineDash([]);
        const valRect = this._drawTag(ctx, w - maxBarPx - 4, yVAL, `VAL ${this.fmtPrice(vp.val)}`, 'rgba(14, 116, 144, 0.92)', '#e0f2fe', 'right');
        this._addHit(valRect, {
          category: 'VPVR · Volume Profile',
          badge: `VAL ${this.fmtPrice(vp.val)}`,
          tone: 'neut',
          title: 'Value Area Low (VAL)',
          meaning: 'Limita inferioară a zonei în care s-a concentrat 70% din volumul total.',
          action: 'Funcționează ca suport pentru respingeri spre POC; o spargere curată sub VAL accelerează căderea către următorul nod de volum.'
        });
        ctx.restore();
      }
    }

    // ─── LAYER 2: SMART MONEY CONCEPTS (OB · FVG · BOS / CHoCH) ─────────────
    _renderSMC(ctx, w, h, chart, series, bars) {
      const smc = this.smcData;
      const ts = chart.timeScale();
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';

      // 1. Order Blocks
      for (const ob of (smc.orderBlocks || [])) {
        const x1 = ts.logicalToCoordinate(ob.idx);
        const yTop = series.priceToCoordinate(ob.top);
        const yBot = series.priceToCoordinate(ob.bottom);
        if (yTop == null || yBot == null) continue;
        const left = Math.max(0, x1 != null ? x1 : 0);
        const top = Math.min(yTop, yBot);
        const boxH = Math.max(2, Math.abs(yBot - yTop));
        if (left > w || top > h || top + boxH < 0) continue;

        ctx.fillStyle = ob.bullish ? 'rgba(8, 153, 129, 0.11)' : 'rgba(242, 54, 69, 0.11)';
        ctx.fillRect(left, top, w - left, boxH);
        ctx.strokeStyle = ob.bullish ? 'rgba(8, 153, 129, 0.45)' : 'rgba(242, 54, 69, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(w, top);
        ctx.moveTo(left, top + boxH);
        ctx.lineTo(w, top + boxH);
        ctx.stroke();

        const obLbl = ob.bullish ? 'OB +' : 'OB −';
        const obY = top + Math.min(boxH - 2, 10);
        ctx.fillStyle = ob.bullish ? (isLight ? '#047857' : '#10b981') : (isLight ? '#be123c' : '#f87171');
        ctx.font = '700 9.5px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(obLbl, w - 8, obY);
        const obW = ctx.measureText(obLbl).width;
        const zoneStr = `${this.fmtPrice(ob.bottom)} – ${this.fmtPrice(ob.top)}`;
        this._addHit({ x: w - 8 - obW - 6, y: obY - 11, w: Math.max(obW + 12, 38), h: Math.max(15, Math.min(boxH, 24)) }, {
          category: 'SMC · Order Block',
          badge: `${obLbl} (${zoneStr})`,
          tone: ob.bullish ? 'up' : 'dn',
          title: ob.bullish ? 'Bullish Order Block (OB + · Cerere)' : 'Bearish Order Block (OB − · Ofertă)',
          meaning: ob.bullish
            ? `Zonă instituțională de acumulare (ultima lumânare roșie înaintea unui impuls puternic de urcare) în intervalul ${zoneStr}.`
            : `Zonă instituțională de distribuție/vânzare (ultima lumânare verde înaintea unei scăderi agresive) în intervalul ${zoneStr}.`,
          action: ob.bullish
            ? `La retestarea zonei ${zoneStr}, cumpărătorii mari apără deseori prețul → caută semnale de respingere în sus (BUY / suport).`
            : `La retestarea zonei ${zoneStr}, ordinele de vânzare rămase pot respinge prețul în jos → zonă cheie de rezistență / Short.`
        });
      }

      // 2. Fair Value Gaps (FVG)
      for (const fvg of (smc.fvgs || [])) {
        const x1 = ts.logicalToCoordinate(fvg.idx);
        const yTop = series.priceToCoordinate(fvg.top);
        const yBot = series.priceToCoordinate(fvg.bottom);
        if (yTop == null || yBot == null) continue;
        const left = Math.max(0, x1 != null ? x1 : 0);
        const top = Math.min(yTop, yBot);
        const boxH = Math.max(2, Math.abs(yBot - yTop));
        if (left > w || top > h || top + boxH < 0) continue;

        ctx.fillStyle = fvg.bullish ? 'rgba(41, 98, 255, 0.09)' : 'rgba(245, 158, 11, 0.09)';
        ctx.fillRect(left, top, w - left, boxH);
        ctx.fillStyle = fvg.bullish
          ? (isLight ? 'rgba(29, 78, 216, 0.90)' : 'rgba(96, 165, 250, 0.85)')
          : (isLight ? 'rgba(180, 83, 9, 0.90)' : 'rgba(251, 191, 36, 0.85)');
        ctx.font = '700 9px sans-serif';
        ctx.textAlign = 'left';
        if (w - left > 45) {
          const fvgY = top + Math.min(boxH - 2, 10);
          ctx.fillText('FVG', left + 4, fvgY);
          const fvgRange = `${this.fmtPrice(fvg.bottom)} – ${this.fmtPrice(fvg.top)}`;
          this._addHit({ x: left, y: fvgY - 10, w: 36, h: Math.max(14, Math.min(boxH, 22)) }, {
            category: 'SMC · Imbalance',
            badge: `FVG (${fvgRange})`,
            tone: fvg.bullish ? 'up' : 'dn',
            title: fvg.bullish ? 'Fair Value Gap Bullish (FVG)' : 'Fair Value Gap Bearish (FVG)',
            meaning: `Gol de lichiditate apărut dintr-o mișcare bruscă de 3 lumânări între ${fvgRange}, unde piața nu a apucat să tranzacționeze echilibrat.`,
            action: fvg.bullish
              ? `Prețul revine frecvent să „umple” parțial acest gol (${fvgRange}), oferind o zonă de pullback pentru continuare bullish.`
              : `Prețul poate retesta acest gol (${fvgRange}) pentru a reîncărca lichiditate înainte de a continua scăderea.`
          });
        }
      }

      // 3. BOS & CHoCH Horizontal Structure Breaks
      for (const st of (smc.structures || [])) {
        const x1 = ts.logicalToCoordinate(st.startIdx);
        const x2 = ts.logicalToCoordinate(st.endIdx);
        const y = series.priceToCoordinate(st.price);
        if (x1 == null || x2 == null || y == null || y < 0 || y > h) continue;
        if (x2 < 0 || x1 > w) continue;

        const col = st.bullish ? '#089981' : '#f23645';
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = st.type === 'CHoCH' ? 1.5 : 1;
        ctx.setLineDash(st.type === 'CHoCH' ? [3, 2] : [5, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.max(0, x1), y);
        ctx.lineTo(Math.min(w, x2), y);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (Math.max(0, x1) + Math.min(w, x2)) / 2;
        const lblY = st.bullish ? y - 4 : y + 10;
        ctx.fillStyle = col;
        ctx.font = '800 9.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.type, midX, lblY);
        const stW = ctx.measureText(st.type).width;
        const pxStr = this.fmtPrice(st.price);
        const isChoch = st.type === 'CHoCH';
        this._addHit({ x: midX - stW / 2 - 6, y: lblY - 10, w: stW + 12, h: 14 }, {
          category: 'SMC · Structura Pieței',
          badge: `${st.type} · ${pxStr}`,
          tone: st.bullish ? 'up' : 'dn',
          title: isChoch
            ? `CHoCH — Change of Character (${st.bullish ? 'Bullish' : 'Bearish'})`
            : `BOS — Break of Structure (${st.bullish ? 'Bullish' : 'Bearish'})`,
          meaning: isChoch
            ? `Schimbare de caracter la ${pxStr}: prețul a rupt primul prag structural împotriva trendului anterior — semnal timpuriu de posibilă întoarcere (reversal).`
            : `Ruptură de structură la ${pxStr}: prețul a spart ultimul ${st.bullish ? 'maxim' : 'minim'} în aceeași direcție cu trendul existent.`,
          action: isChoch
            ? `Atenție la schimbarea direcției! Așteaptă o retestare în OB/FVG pentru a confirma ${st.bullish ? 'noul trend ascendent' : 'noul trend descendent'}.`
            : `Confirmă continuarea trendului ${st.bullish ? 'Bullish (în sus)' : 'Bearish (în jos)'}. Retragerile spre ultimul OB/FVG devin puncte clasice de intrare.`
        });
        ctx.restore();
      }
    }

    // ─── LAYER 3: ACTIVE SMART SIGNAL R:R TRADE PLAN BOX ────────────────────
    _renderTradePlan(ctx, w, h, chart, series, bars) {
      const tp = this.tradePlan;
      // Only draw R:R box on chart when an actual validated trade/signal is active (never clutter on WAIT_SETUP!)
      if (!tp || tp.projected || tp.entry == null || tp.sl == null || tp.tp2 == null) return;
      const ts = chart.timeScale();
      const startIdx = tp.sigIdx != null ? tp.sigIdx : (bars.length - 1);
      const endIdx = bars.length - 1 + 10;

      const x1Raw = ts.logicalToCoordinate(startIdx);
      const x2Raw = ts.logicalToCoordinate(endIdx);
      const yEntry = series.priceToCoordinate(tp.entry);
      const ySL = series.priceToCoordinate(tp.sl);
      const yTP1 = series.priceToCoordinate(tp.tp1);
      const yTP2 = series.priceToCoordinate(tp.tp2);
      if (yEntry == null || ySL == null || yTP2 == null) return;

      const x1 = Math.max(0, x1Raw != null ? x1Raw : w - 140);
      const x2 = Math.min(w - 6, x2Raw != null ? Math.max(x1 + 76, x2Raw) : w - 10);
      if (x2 <= x1 + 15) return;

      // Subtle institutional Profit Zone (Entry -> TP2)
      const pTop = Math.min(yEntry, yTP2);
      const pH = Math.abs(yTP2 - yEntry);
      ctx.fillStyle = 'rgba(8, 153, 129, 0.08)';
      ctx.fillRect(x1, pTop, x2 - x1, pH);

      // Subtle institutional Risk Zone (Entry -> SL)
      const rTop = Math.min(yEntry, ySL);
      const rH = Math.abs(ySL - yEntry);
      ctx.fillStyle = 'rgba(242, 54, 69, 0.08)';
      ctx.fillRect(x1, rTop, x2 - x1, rH);

      ctx.save();
      // Entry Line
      ctx.strokeStyle = 'rgba(41, 98, 255, 0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, yEntry); ctx.lineTo(x2, yEntry); ctx.stroke();

      // TP2 Line
      ctx.strokeStyle = 'rgba(8, 153, 129, 0.9)';
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(x1, yTP2); ctx.lineTo(x2, yTP2); ctx.stroke();

      // TP1 Intermediate Line
      if (yTP1 != null) {
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, yTP1); ctx.lineTo(x2, yTP1); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Stop Loss Line
      ctx.strokeStyle = 'rgba(242, 54, 69, 0.9)';
      ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(x1, ySL); ctx.lineTo(x2, ySL); ctx.stroke();
      ctx.restore();

      // Compact Right-Edge Labels
      const tp2Rect = this._drawTag(ctx, x2, yTP2, `TP2 ${this.fmtPrice(tp.tp2)}`, '#089981', '#fff', 'right');
      this._addHit(tp2Rect, {
        category: 'Plan Tranzacție R:R',
        badge: `TP2 · ${this.fmtPrice(tp.tp2)}`,
        tone: 'up',
        title: 'Take-Profit 2 (Țintă Principală)',
        meaning: 'Obiectivul extins de profit calculat dinamic din ATR și structura pieței.',
        action: 'Închide restul poziției sau mută Stop-Loss pe profit (trailing) odată ce prețul atinge TP2.'
      });
      if (yTP1 != null && Math.abs(yTP1 - yTP2) > 18 && Math.abs(yTP1 - yEntry) > 18) {
        const tp1Rect = this._drawTag(ctx, x2, yTP1, `TP1 ${this.fmtPrice(tp.tp1)}`, '#0d6e5d', '#e2e8f0', 'right');
        this._addHit(tp1Rect, {
          category: 'Plan Tranzacție R:R',
          badge: `TP1 · ${this.fmtPrice(tp.tp1)}`,
          tone: 'up',
          title: 'Take-Profit 1 (Parțial)',
          meaning: 'Primul nivel realist de marcare parțială a profitului (~50% din poziție).',
          action: 'La atingerea TP1, profesioniștii încasează jumătate și mută SL la prețul de intrare (break-even).'
        });
      }
      const inRect = this._drawTag(ctx, x2, yEntry, `IN ${this.fmtPrice(tp.entry)}`, '#2962ff', '#fff', 'right');
      this._addHit(inRect, {
        category: 'Plan Tranzacție R:R',
        badge: `IN · ${this.fmtPrice(tp.entry)}`,
        tone: 'neut',
        title: 'Preț de Intrare Sugerat (Entry)',
        meaning: 'Nivelul curent de referință al semnalului Smart Quant.',
        action: 'Compară distanța față de SL și TP1/TP2 pentru a verifica raportul Risc / Recompensă (>= 1:2).'
      });
      const slRect = this._drawTag(ctx, x2, ySL, `SL ${this.fmtPrice(tp.sl)}`, '#f23645', '#fff', 'right');
      this._addHit(slRect, {
        category: 'Plan Tranzacție R:R',
        badge: `SL · ${this.fmtPrice(tp.sl)}`,
        tone: 'dn',
        title: 'Stop-Loss (Protecție Capital)',
        meaning: 'Pragul de invalidare a scenariului: dacă prețul îl sparge, setup-ul nu mai este valabil.',
        action: 'Nu muta SL-ul mai jos/sus contra poziției; dimensionează poziția astfel încât pierderea maximă să fie 1%–2% din cont.'
      });
    }

    // ─── LAYER 3B: ULTIMATE TPO (TIME PRICE OPPORTUNITY / MARKET PROFILE) ───
    _renderTPO(ctx, w, h, series) {
      const tpo = this.tpoData;
      if (!tpo || !tpo.bins || !tpo.maxCount) return;
      const maxPx = Math.min(92, w * 0.13);

      // Value Area background band on left edge
      const yVAH = series.priceToCoordinate(tpo.vah);
      const yVAL = series.priceToCoordinate(tpo.val);
      if (yVAH != null && yVAL != null) {
        const top = Math.min(yVAH, yVAL);
        const bot = Math.max(yVAH, yVAL);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.05)';
        ctx.fillRect(0, top, maxPx + 8, bot - top);
      }

      for (const bin of tpo.bins) {
        if (!bin.count) continue;
        const y1 = series.priceToCoordinate(bin.priceHigh);
        const y2 = series.priceToCoordinate(bin.priceLow);
        if (y1 == null || y2 == null) continue;
        const top = Math.min(y1, y2);
        const rowH = Math.max(2, Math.abs(y2 - y1) - 1.5);
        if (top + rowH < 0 || top > h) continue;

        const inVA = bin.priceMid >= tpo.val && bin.priceMid <= tpo.vah;
        const isPOC = Math.abs(bin.priceMid - tpo.poc) < (bin.priceHigh - bin.priceLow) * 0.6;
        const barW = (bin.count / tpo.maxCount) * maxPx;

        // Segmented TPO blocks
        const blocks = Math.max(1, Math.min(18, bin.count));
        const blkW = Math.max(2, (barW / blocks) - 1);
        for (let b = 0; b < blocks; b++) {
          const bx = 4 + b * (blkW + 1);
          ctx.fillStyle = isPOC
            ? 'rgba(245, 158, 11, 0.72)'
            : inVA
              ? (b < bin.ibCount ? 'rgba(10, 132, 255, 0.48)' : 'rgba(6, 182, 212, 0.42)')
              : 'rgba(148, 163, 184, 0.20)';
          ctx.fillRect(bx, top, blkW, rowH);
        }
      }

      const yPOC = series.priceToCoordinate(tpo.poc);
      if (yPOC != null && yPOC >= 10 && yPOC <= h - 10) {
        ctx.save();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.75)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, yPOC);
        ctx.lineTo(maxPx * 1.65, yPOC);
        ctx.stroke();
        ctx.setLineDash([]);
        const tpoRect = this._drawTag(ctx, maxPx + 8, yPOC, `TPO POC ${this.fmtPrice(tpo.poc)}`, '#0891b2', '#fff', 'left');
        this._addHit(tpoRect, {
          category: 'TPO Market Profile',
          badge: `TPO POC · ${this.fmtPrice(tpo.poc)}`,
          tone: 'neut',
          title: 'Time Price Opportunity (TPO POC)',
          meaning: 'Prețul la care piața a petrecut cel mai mult timp în sesiunile recente (Market Profile).',
          action: 'Indică zona de acceptare de timp: deviațiile mari față de TPO POC fără volum tind să revină spre acest nivel.'
        });
        ctx.restore();
      }
    }

    // ─── LAYER 3C: ULTIMATE AUTO CHART PATTERNS ─────────────────────────────
    _renderAutoPatterns(ctx, w, h, chart, series) {
      const pat = this.patternData;
      if (!pat || !pat.upperLine || !pat.lowerLine) return;
      const ts = chart.timeScale();

      const ux1 = ts.logicalToCoordinate(pat.upperLine.p1.idx);
      const ux2 = ts.logicalToCoordinate(pat.upperLine.p2.idx);
      const uy1 = series.priceToCoordinate(pat.upperLine.p1.price);
      const uy2 = series.priceToCoordinate(pat.upperLine.p2.price);

      const lx1 = ts.logicalToCoordinate(pat.lowerLine.p1.idx);
      const lx2 = ts.logicalToCoordinate(pat.lowerLine.p2.idx);
      const ly1 = series.priceToCoordinate(pat.lowerLine.p1.price);
      const ly2 = series.priceToCoordinate(pat.lowerLine.p2.price);

      if ([ux1, ux2, uy1, uy2, lx1, lx2, ly1, ly2].some(v => v == null || !isFinite(v))) return;

      ctx.save();
      // Subtle translucent pattern wedge/channel fill
      ctx.beginPath();
      ctx.moveTo(ux1, uy1);
      ctx.lineTo(ux2, uy2);
      ctx.lineTo(lx2, ly2);
      ctx.lineTo(lx1, ly1);
      ctx.closePath();
      ctx.fillStyle = pat.bias === 'bull'
        ? 'rgba(16, 185, 129, 0.055)'
        : pat.bias === 'bear'
          ? 'rgba(244, 63, 94, 0.055)'
          : 'rgba(10, 132, 255, 0.05)';
      ctx.fill();

      // Upper Resistance Trendline
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(ux1, uy1);
      ctx.lineTo(ux2, uy2);
      ctx.stroke();

      // Lower Support Trendline
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(lx1, ly1);
      ctx.lineTo(lx2, ly2);
      ctx.stroke();

      // Pivot anchor rings
      for (const pv of (pat.pivots || [])) {
        const px = ts.logicalToCoordinate(pv.idx);
        const py = series.priceToCoordinate(pv.price);
        if (px != null && py != null && px >= 0 && px <= w) {
          this._drawHandle(ctx, px, py, '#38bdf8');
        }
      }

      const tagX = Math.min(w - 12, Math.max(80, ux2));
      const tagY = Math.max(22, Math.min(h - 22, (uy2 + ly2) / 2));
      const tagBg = pat.bias === 'bull' ? '#059669' : pat.bias === 'bear' ? '#e11d48' : '#0284c7';
      const patRect = this._drawTag(ctx, tagX, tagY, `${pat.name} · ${pat.stateLbl}`, tagBg, '#ffffff', 'right');
      this._addHit(patRect, this._describePattern(pat));
      ctx.restore();
    }

    // ─── LAYER 3C-bis: WOLFE WAVE (1-2-3-4-5 + LINEA EPA 1->4) ─────────────
    _renderWolfeWave(ctx, w, h, chart, series) {
      const ww = this.wolfeData;
      if (!ww) {
        const emptyRect = this._drawTag(ctx, 14, h - 26, 'Wolfe 1-5: Caută convergență (0 active)', 'rgba(30, 41, 59, 0.85)', '#cbd5e1', 'left');
        this._addHit(emptyRect, {
          category: 'Wolfe Wave (1-2-3-4-5)',
          badge: 'SCANNER ACTIV',
          tone: 'neut',
          title: 'Triunghi / Valurile lui Bill Wolfe (Wolfe Wave)',
          meaning: 'Pe simbolul și timeframe-ul curent nu există momentan o pană convergentă completă cu 5 puncte simetrice 1-2-3-4-5.',
          action: 'Caută un punct 3 sub/peste 1, punctul 4 între 1 și 2, și punctul 5 la atingerea/spargerea ușoară a liniei 1–3 (Sweet Zone). Încearcă pe 15m, 30m, 1h sau 1D.'
        });
        return;
      }

      const ts = chart.timeScale();
      const pts = [ww.p1, ww.p2, ww.p3, ww.p4, ww.p5].map((p, idx) => ({
        num: idx + 1,
        x: ts.logicalToCoordinate(p.idx),
        y: series.priceToCoordinate(p.price),
        price: p.price
      }));
      const xExt = ts.logicalToCoordinate(ww.extIdx);
      const y13Ext = series.priceToCoordinate(ww.ext13Price);
      const y24Ext = series.priceToCoordinate(ww.ext24Price);
      const xEta = ts.logicalToCoordinate(ww.etaIdx);
      const yEpa = series.priceToCoordinate(ww.epaPrice);

      if (pts.some(p => p.x == null || p.y == null || !isFinite(p.x) || !isFinite(p.y))) return;

      const mainCol = ww.bullish ? '#10b981' : '#f43f5e';
      const fillCol = ww.bullish ? 'rgba(16, 185, 129, 0.065)' : 'rgba(244, 63, 94, 0.065)';
      ctx.save();

      // Subtle shaded triangle 1 -> 5 -> 4 -> 2
      if (xExt != null && y13Ext != null && y24Ext != null) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(xExt, y13Ext);
        ctx.lineTo(xExt, y24Ext);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.closePath();
        ctx.fillStyle = fillCol;
        ctx.fill();
      }

      // 1-2-3-4-5 internal wave path (subtle dotted)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Line 1-3-5 & Line 2-4
      ctx.strokeStyle = mainCol;
      ctx.lineWidth = 1.85;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(xExt != null ? xExt : pts[4].x, y13Ext != null ? y13Ext : pts[4].y);
      ctx.moveTo(pts[1].x, pts[1].y);
      ctx.lineTo(xExt != null ? xExt : pts[3].x, y24Ext != null ? y24Ext : pts[3].y);
      ctx.stroke();

      // Line 1 -> 4 Projected EPA Target (Gold dashed)
      const epaX2 = xEta != null ? Math.min(w - 14, Math.max(pts[3].x + 28, xEta)) : Math.min(w - 14, pts[3].x + 65);
      const epaY2 = yEpa != null ? Math.max(18, Math.min(h - 18, yEpa)) : pts[3].y;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(epaX2, epaY2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Numbered wave circles 1..5
      for (const p of pts) {
        if (p.x < 4 || p.x > w - 4 || p.y < 8 || p.y > h - 8) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = p.num === 5 ? '#f59e0b' : (ww.bullish ? '#064e3b' : '#4c0519');
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.num === 5 ? '#fef3c7' : mainCol;
        ctx.stroke();
        ctx.fillStyle = p.num === 5 ? '#000' : '#f8fafc';
        ctx.font = '800 9.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(p.num), p.x, p.y + 0.5);
      }

      const epaStr = this.fmtPrice(ww.epaPrice);
      const p5Str = this.fmtPrice(ww.p5.price);
      const dirLbl = ww.bullish ? 'Wolfe Bullish 1-5' : 'Wolfe Bearish 1-5';
      const epaRect = this._drawTag(ctx, Math.max(85, Math.min(w - 10, epaX2)), epaY2, `${dirLbl} · EPA ${epaStr}`, ww.bullish ? '#059669' : '#e11d48', '#ffffff', 'right');
      this._addHit(epaRect, {
        category: 'Wolfe Wave · Țintă EPA',
        badge: ww.status,
        tone: ww.bullish ? 'up' : 'dn',
        title: `${dirLbl} (Punct 5: ${p5Str} → Țintă EPA: ${epaStr})`,
        meaning: ww.bullish
          ? `Triunghi/Pană convergentă de întoarcere Bullish (1→2→3→4→5). Punctul 5 (${p5Str}) atinge sau depășește ușor linia 1–3 („Sweet Zone”), pregătind revenirea spre linia 1→4.`
          : `Triunghi/Pană convergentă de întoarcere Bearish (1→2→3→4→5). Punctul 5 (${p5Str}) testează linia superioară 1–3 („Sweet Zone”), pregătind scăderea spre linia 1→4.`,
        action: `Regula Bill Wolfe: intrarea se face în Sweet Zone (Punct 5 ~${p5Str}, cu SL imediat dincolo de vârful 5), iar ținta matematică EPA de pe linia aurie 1→4 este ${epaStr}.`
      });
      ctx.restore();
    }

    // ─── LAYER 3D: ULTIMATE EXPECTED MOVE CONE (±1σ 68%) ────────────────────
    _renderExpectedMove(ctx, w, h, chart, series, bars) {
      const em = this.expectedMoveData;
      if (!em || !bars.length) return;
      const ts = chart.timeScale();
      const lastIdx = bars.length - 1;
      const xStart = ts.logicalToCoordinate(lastIdx);
      const xEndRaw = ts.logicalToCoordinate(lastIdx + em.horizonBars);
      const yMid = series.priceToCoordinate(em.lastClose);
      const yU1 = series.priceToCoordinate(em.upper1);
      const yL1 = series.priceToCoordinate(em.lower1);
      if (xStart == null || yMid == null || yU1 == null || yL1 == null) return;

      const xEnd = Math.min(w - 8, xEndRaw != null ? Math.max(xStart + 48, xEndRaw) : Math.min(w - 12, xStart + 76));
      if (xEnd <= xStart + 8) return;

      ctx.save();
      // Parabolic volatility cone fill
      ctx.beginPath();
      ctx.moveTo(xStart, yMid);
      const steps = 12;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const cx = xStart + (xEnd - xStart) * t;
        const cy = yMid + (yU1 - yMid) * Math.sqrt(t);
        ctx.lineTo(cx, cy);
      }
      for (let s = steps; s >= 1; s--) {
        const t = s / steps;
        const cx = xStart + (xEnd - xStart) * t;
        const cy = yMid + (yL1 - yMid) * Math.sqrt(t);
        ctx.lineTo(cx, cy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(168, 85, 247, 0.09)';
      ctx.fill();

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.78)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(xEnd, yU1);
      ctx.lineTo(xEnd, yL1);
      ctx.stroke();
      ctx.setLineDash([]);

      const emUpRect = this._drawTag(ctx, xEnd, yU1, `+1σ ${this.fmtPrice(em.upper1)} (+${em.movePct1SD.toFixed(1)}%)`, '#7c3aed', '#fff', 'right');
      const emDnRect = this._drawTag(ctx, xEnd, yL1, `-1σ ${this.fmtPrice(em.lower1)} (-${em.movePct1SD.toFixed(1)}%)`, '#7c3aed', '#fff', 'right');
      const emInfo = {
        category: 'Volatilitate Statistică',
        badge: `±${em.movePct1SD.toFixed(1)}% (1σ)`,
        tone: 'neut',
        title: 'Expected Move Cone (±1σ · 68%)',
        meaning: `Intervalul statistic estimat (${this.fmtPrice(em.lower1)} – ${this.fmtPrice(em.upper1)}) în care prețul ar trebui să rămână cu probabilitate de ~68% în următoarele ${em.horizonBars} bare.`,
        action: 'Folosește limitele ±1σ pentru a plasa ținte realiste de Take-Profit sau pentru a detecta mișcări extreme supracumpărate/supravândute.'
      };
      this._addHit(emUpRect, emInfo);
      this._addHit(emDnRect, emInfo);
      ctx.restore();
    }

    // ─── LAYER 3E: ULTIMATE ORDERFLOW VOLUME FOOTPRINT DELTA ────────────────
    _renderFootprint(ctx, w, h, chart, series, bars) {
      const fp = this.footprintData;
      if (!fp || !fp.items || !fp.items.length) return;
      const ts = chart.timeScale();

      // Determine pixel spacing per bar so we never overlap text
      const xA = ts.logicalToCoordinate(bars.length - 1);
      const xB = bars.length > 2 ? ts.logicalToCoordinate(bars.length - 2) : null;
      const barPx = (xA != null && xB != null) ? Math.abs(xA - xB) : 10;

      ctx.save();
      let lastLabelX = -999;
      const startI = Math.max(0, bars.length - 95);

      for (let i = startI; i < bars.length; i++) {
        const it = fp.items[i];
        const b = bars[i];
        if (!it || !b) continue;
        const x = ts.logicalToCoordinate(i);
        if (x == null || x < 16 || x > w - 16) continue;

        // When zoomed in (barPx >= 26), show compact BuyxSell footprint split; otherwise highlight institutional imbalances
        if (!it.imbalance && !it.absorption && barPx < 28) continue;
        if (Math.abs(x - lastLabelX) < 44) continue;

        const yHi = series.priceToCoordinate(b.high);
        const yLo = series.priceToCoordinate(b.low);
        if (yHi == null || yLo == null) continue;

        const isBull = it.delta >= 0;
        const absD = Math.abs(it.delta);
        const fmtD = absD >= 1e6 ? (absD / 1e6).toFixed(1) + 'M' : absD >= 1e3 ? (absD / 1e3).toFixed(0) + 'K' : Math.round(absD);
        const prefix = it.absorption ? 'ABS ' : (isBull ? '+Δ' : '-Δ');
        const yPos = isBull ? Math.min(h - 14, yLo + 14) : Math.max(14, yHi - 14);
        const bg = it.absorption ? '#d97706' : (isBull ? 'rgba(5, 150, 105, 0.92)' : 'rgba(225, 29, 72, 0.92)');

        const fpRect = this._drawTag(ctx, x, yPos, `${prefix}${fmtD}`, bg, '#fff', 'center');
        this._addHit(fpRect, {
          category: 'Orderflow Proxy (OHLCV)',
          badge: `${prefix}${fmtD}`,
          tone: it.absorption ? 'warn' : (isBull ? 'up' : 'dn'),
          title: it.absorption ? 'Absorbție Estimată (ABS)' : (isBull ? 'Dezechilibru Cumpărători (+Δ)' : 'Dezechilibru Vânzători (-Δ)'),
          meaning: it.absorption
            ? 'Volum mare cu deplasare mică a prețului — indică faptul că ordinele limită absorb agresiunea contrară (posibil punct de întoarcere).'
            : `Delta volumului estimat din structura lumânării indică presiune netă ${isBull ? 'de cumpărare' : 'de vânzare'} (${prefix}${fmtD}).`,
          action: 'Combină semnalul cu zonele SMC (OB/FVG) sau VPVR pentru confirmare înainte de intrare.'
        });
        lastLabelX = x;
      }
      ctx.restore();
    }

    // ─── LAYER 4: USER INTERACTIVE DRAWINGS ─────────────────────────────────
    _renderShape(ctx, d, w, h, series, bars) {
      const a = this._anchorToXY(d.p1);
      if (!a) return;

      if (d.type === 'hline') {
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(w, a.y); ctx.stroke();
        this._drawTag(ctx, w - 6, a.y, this.fmtPrice(d.p1.price), '#f59e0b', '#000', 'right');
        ctx.restore();
        return;
      }

      if (d.type === 'ray') {
        ctx.save();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(w, a.y); ctx.stroke();
        this._drawHandle(ctx, a.x, a.y, '#06b6d4');
        this._drawTag(ctx, w - 6, a.y, this.fmtPrice(d.p1.price), '#06b6d4', '#000', 'right');
        ctx.restore();
        return;
      }

      if (d.type === 'vline') {
        ctx.save();
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, h); ctx.stroke();
        ctx.restore();
        return;
      }

      const b = d.p2 ? this._anchorToXY(d.p2) : null;
      if (!b) return;

      if (d.type === 'trend') {
        ctx.save();
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        this._drawHandle(ctx, a.x, a.y, '#2962ff');
        this._drawHandle(ctx, b.x, b.y, '#2962ff');

        const pct = ((d.p2.price - d.p1.price) / d.p1.price) * 100;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2 - 8;
        this._drawTag(ctx, midX, midY, `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, '#1e222d', '#f0f3fa', 'center');
        ctx.restore();
        return;
      }

      if (d.type === 'rect') {
        const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
        const rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
        ctx.save();
        ctx.fillStyle = 'rgba(41, 98, 255, 0.14)';
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 1.5;
        ctx.fillRect(left, top, rw, rh);
        ctx.strokeRect(left, top, rw, rh);
        this._drawHandle(ctx, a.x, a.y, '#2962ff');
        this._drawHandle(ctx, b.x, b.y, '#2962ff');
        ctx.restore();
        return;
      }

      if (d.type === 'measure') {
        const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y);
        const rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
        const diff = d.p2.price - d.p1.price;
        const pct = (diff / d.p1.price) * 100;
        const nBars = Math.round(Math.abs(b.logical - a.logical));
        const isUp = diff >= 0;

        ctx.save();
        ctx.fillStyle = isUp ? 'rgba(8, 153, 129, 0.18)' : 'rgba(242, 54, 69, 0.18)';
        ctx.strokeStyle = isUp ? '#089981' : '#f23645';
        ctx.lineWidth = 1.5;
        ctx.fillRect(left, top, rw, rh);
        ctx.strokeRect(left, top, rw, rh);

        // Crosshair arrows inside ruler box
        const cx = left + rw / 2, cy = top + rh / 2;
        ctx.beginPath();
        ctx.moveTo(left, cy); ctx.lineTo(left + rw, cy);
        ctx.moveTo(cx, top); ctx.lineTo(cx, top + rh);
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        const txt = `${diff >= 0 ? '+' : ''}${this.fmtPrice(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${nBars} bare`;
        this._drawTag(ctx, cx, top - 10 < 14 ? top + rh + 14 : top - 10, txt, isUp ? '#089981' : '#f23645', '#fff', 'center');
        ctx.restore();
        return;
      }

      if (d.type === 'fib') {
        const ratios = [
          { r: 0, col: '#787b86' },
          { r: 0.236, col: '#f23645' },
          { r: 0.382, col: '#f59e0b' },
          { r: 0.5, col: '#10b981' },
          { r: 0.618, col: '#089981' },
          { r: 0.786, col: '#06b6d4' },
          { r: 1, col: '#787b86' }
        ];
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x, left + 120);
        const pSpan = d.p1.price - d.p2.price;

        // Golden Pocket highlight (0.5 -> 0.618)
        const y50 = series.priceToCoordinate(d.p2.price + pSpan * 0.5);
        const y618 = series.priceToCoordinate(d.p2.price + pSpan * 0.618);
        if (y50 != null && y618 != null) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
          ctx.fillRect(left, Math.min(y50, y618), right - left, Math.abs(y618 - y50));
        }

        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(120,123,134,0.6)';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);

        for (const lv of ratios) {
          const lp = d.p2.price + pSpan * (1 - lv.r);
          const ly = series.priceToCoordinate(lp);
          if (ly == null) continue;
          ctx.strokeStyle = lv.col;
          ctx.lineWidth = (lv.r === 0.618 || lv.r === 0.5) ? 1.6 : 1;
          ctx.beginPath(); ctx.moveTo(left, ly); ctx.lineTo(right, ly); ctx.stroke();
          ctx.fillStyle = lv.col;
          ctx.font = '700 10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`${(lv.r * 100).toFixed(1)}% (${this.fmtPrice(lp)})`, left + 4, ly - 3);
        }
        ctx.restore();
        return;
      }

      if (d.type === 'long' || d.type === 'short') {
        const isLong = d.type === 'long';
        const ySL = series.priceToCoordinate(d.slPrice);
        if (ySL == null) return;
        const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x, left + 90);
        const rw = right - left;

        // Profit box
        ctx.fillStyle = 'rgba(8, 153, 129, 0.20)';
        ctx.fillRect(left, Math.min(a.y, b.y), rw, Math.abs(b.y - a.y));
        ctx.strokeStyle = '#089981';
        ctx.strokeRect(left, Math.min(a.y, b.y), rw, Math.abs(b.y - a.y));

        // Stop box
        ctx.fillStyle = 'rgba(242, 54, 69, 0.20)';
        ctx.fillRect(left, Math.min(a.y, ySL), rw, Math.abs(ySL - a.y));
        ctx.strokeStyle = '#f23645';
        ctx.strokeRect(left, Math.min(a.y, ySL), rw, Math.abs(ySL - a.y));

        const reward = Math.abs(d.p2.price - d.p1.price);
        const risk = Math.max(1e-9, Math.abs(d.p1.price - d.slPrice));
        const rr = (reward / risk).toFixed(2);
        const gainPct = ((reward / d.p1.price) * 100).toFixed(2);
        const lossPct = ((risk / d.p1.price) * 100).toFixed(2);

        this._drawTag(ctx, left + rw / 2, a.y, `${isLong ? 'LONG' : 'SHORT'} · R:R 1:${rr}`, '#2962ff', '#fff', 'center');
        this._drawTag(ctx, right, b.y, `TP +${gainPct}% (${this.fmtPrice(d.p2.price)})`, '#089981', '#fff', 'right');
        this._drawTag(ctx, right, ySL, `SL -${lossPct}% (${this.fmtPrice(d.slPrice)})`, '#f23645', '#fff', 'right');
      }
    }

    _drawHandle(ctx, x, y, color) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#131722';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    }

    _drawTag(ctx, x, y, text, bg, fg, align = 'left') {
      ctx.save();
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
      const padX = 8, boxH = 18;
      const tw = ctx.measureText(text).width + padX * 2;
      let bx = x;
      if (align === 'right') bx = x - tw;
      else if (align === 'center') bx = x - tw / 2;
      const by = y - boxH / 2;

      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, tw, boxH, boxH / 2);
      else ctx.rect(bx, by, tw, boxH);
      ctx.fill();

      ctx.fillStyle = fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + padX, y + 0.5);
      ctx.restore();
      return { x: bx, y: by, w: tw, h: boxH };
    }

    _addHit(rect, info) {
      if (!rect || !isFinite(rect.x) || !isFinite(rect.y)) return;
      this.hitRegions.push({
        x: rect.x - 4,
        y: rect.y - 3,
        w: Math.max(18, rect.w + 8),
        h: Math.max(14, rect.h + 6),
        ...info
      });
    }

    hitTestAnnotation(px, py) {
      for (let i = this.hitRegions.length - 1; i >= 0; i--) {
        const r = this.hitRegions[i];
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r;
      }
      return null;
    }

    _describePattern(pat) {
      const name = String(pat.name || 'Structură Dinamică');
      const resStr = pat.upperNow != null ? this.fmtPrice(pat.upperNow) : '—';
      const supStr = pat.lowerNow != null ? this.fmtPrice(pat.lowerNow) : '—';
      const tgtStr = pat.targetPrice != null ? this.fmtPrice(pat.targetPrice) : '—';
      let meaning = 'Formațiune geometrică detectată automat între maximele (linia roșie) și minimele (linia verde) recente.';
      if (name.includes('Dublu Vârf')) {
        meaning = 'Pattern clasic de epuizare bearish (Double Top): prețul a testat de două ori zona de rezistență (linia roșie) fără să o poată sparge în sus.';
      } else if (name.includes('Dublu Minim')) {
        meaning = 'Pattern clasic de întoarcere bullish (Double Bottom): cumpărătorii au apărat de două ori același suport (linia verde).';
      } else if (name.includes('Triunghi Descendent')) {
        meaning = 'Prețul face maxime tot mai joase împotriva unui suport orizontal (presiune crescândă de vânzare spre o spargere în jos).';
      } else if (name.includes('Triunghi Ascendent')) {
        meaning = 'Prețul presează cu minime tot mai înalte o rezistență plată (acumulare bullish înainte de breakout).';
      } else if (name.includes('Triunghi Simetric')) {
        meaning = 'Compresie de volatilitate între maxime descendente și minime ascendente — urmează de obicei o mișcare explozivă la ieșirea din triunghi.';
      } else if (name.includes('Falling Wedge')) {
        meaning = 'Pană descendentă (Falling Wedge · Bullish): vânzătorii își pierd forța, iar ieșirea în sus peste linia roșie generează des o revenire puternică.';
      } else if (name.includes('Rising Wedge')) {
        meaning = 'Pană ascendentă (Rising Wedge · Bearish): urcarea pierde din avânt, iar spargerea liniei verzi în jos semnalează risc de corecție rapidă.';
      } else if (name.includes('Canal Ascendent')) {
        meaning = 'Trend ascendent ordonat între două linii paralele; suportul verde oferă zone de retest, iar rezistența roșie marchează zone de profit.';
      } else if (name.includes('Canal Descendent')) {
        meaning = 'Trend descendent ordonat între maxime și minime paralele în coborâre; revenirea peste linia roșie semnalează schimbare de impuls.';
      }
      const stateInfo = pat.stateLbl === 'BREAKDOWN JOS'
        ? `Prețul a spart deja suportul (${supStr}) ÎN JOS. Linia roșie (${resStr}) devine rezistență, iar ținta tehnică proiectată este ~${tgtStr}.`
        : pat.stateLbl === 'BREAKOUT SUS'
          ? `Prețul a spart deja rezistența (${resStr}) ÎN SUS. Suport cheie la ${supStr}, iar ținta tehnică proiectată este ~${tgtStr}.`
          : `Prețul este încă în interiorul formațiunii (Suport ${supStr} · Rezistență ${resStr}). Așteaptă confirmarea la ieșirea din linie (~${tgtStr}).`;
      return {
        category: 'Auto Chart Pattern',
        badge: pat.stateLbl || 'ÎN STRUCTURĂ',
        tone: pat.bias === 'bull' ? 'up' : (pat.bias === 'bear' ? 'dn' : 'neut'),
        title: `${name} · ${pat.stateLbl || ''}`,
        meaning,
        action: stateInfo
      };
    }
  }

  global.ChartOverlayEngine = ChartOverlayEngine;
})(window);

