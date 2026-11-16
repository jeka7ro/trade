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
      this.onToolReset = opts.onToolReset || (() => {});

      this.tool = 'cursor';
      this.magnet = false;
      this.hideDrawings = false;

      this.symbol = '';
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
      this.expectedMoveData = null;
      this.showVPVR = false;
      this.showSMC = false;
      this.showTradePlan = true;
      this.showTPO = false;
      this.showFootprint = false;
      this.showAutoPatterns = false;
      this.showExpectedMove = false;
      this.showExtSessions = true;

      this._etFmt = null;
      this._etCache = new Map();

      this._raf = null;
      this._bindEvents();
    }

    setSymbol(sym) {
      this.symbol = sym || '';
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
      vpvrData, smcData, tradePlan, tpoData, footprintData, patternData, expectedMoveData,
      showVPVR, showSMC, showTradePlan, showTPO, showFootprint, showAutoPatterns, showExpectedMove,
      showExtSessions
    }) {
      if (vpvrData !== undefined) this.vpvrData = vpvrData;
      if (smcData !== undefined) this.smcData = smcData;
      if (tradePlan !== undefined) this.tradePlan = tradePlan;
      if (tpoData !== undefined) this.tpoData = tpoData;
      if (footprintData !== undefined) this.footprintData = footprintData;
      if (patternData !== undefined) this.patternData = patternData;
      if (expectedMoveData !== undefined) this.expectedMoveData = expectedMoveData;
      if (showVPVR !== undefined) this.showVPVR = showVPVR;
      if (showSMC !== undefined) this.showSMC = showSMC;
      if (showTradePlan !== undefined) this.showTradePlan = showTradePlan;
      if (showTPO !== undefined) this.showTPO = showTPO;
      if (showFootprint !== undefined) this.showFootprint = showFootprint;
      if (showAutoPatterns !== undefined) this.showAutoPatterns = showAutoPatterns;
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
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}

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
      return `tp_ultra_drawings_${this.symbol || 'DEFAULT'}`;
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
      } catch (_) {}
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
      if (!chart || !series || !bars || !bars.length) {
        ctx.restore();
        return;
      }

      if (this.showExtSessions) this._renderExtendedSessions(ctx, w, h, chart, bars);
      if (this.showTPO && this.tpoData) this._renderTPO(ctx, w, h, series);
      if (this.showVPVR && this.vpvrData) this._renderVPVR(ctx, w, h, series);
      if (this.showSMC && this.smcData) this._renderSMC(ctx, w, h, chart, series, bars);
      if (this.showAutoPatterns && this.patternData) this._renderAutoPatterns(ctx, w, h, chart, series);
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
      } catch (_) {}
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
        this._drawTag(ctx, w - maxBarPx - 4, yPOC, `POC ${this.fmtPrice(vp.poc)}`, '#d97706', '#fff', 'right');
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
        this._drawTag(ctx, w - maxBarPx - 4, yVAH, `VAH ${this.fmtPrice(vp.vah)}`, 'rgba(14, 116, 144, 0.92)', '#e0f2fe', 'right');
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
        this._drawTag(ctx, w - maxBarPx - 4, yVAL, `VAL ${this.fmtPrice(vp.val)}`, 'rgba(14, 116, 144, 0.92)', '#e0f2fe', 'right');
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

        ctx.fillStyle = ob.bullish ? (isLight ? '#047857' : '#10b981') : (isLight ? '#be123c' : '#f87171');
        ctx.font = '700 9.5px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(ob.bullish ? 'OB +' : 'OB −', w - 8, top + Math.min(boxH - 2, 10));
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
        if (w - left > 45) ctx.fillText('FVG', left + 4, top + Math.min(boxH - 2, 10));
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
        ctx.fillStyle = col;
        ctx.font = '800 9.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(st.type, midX, st.bullish ? y - 4 : y + 10);
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
      this._drawTag(ctx, x2, yTP2, `TP2 ${this.fmtPrice(tp.tp2)}`, '#089981', '#fff', 'right');
      if (yTP1 != null && Math.abs(yTP1 - yTP2) > 18 && Math.abs(yTP1 - yEntry) > 18) {
        this._drawTag(ctx, x2, yTP1, `TP1 ${this.fmtPrice(tp.tp1)}`, '#0d6e5d', '#e2e8f0', 'right');
      }
      this._drawTag(ctx, x2, yEntry, `IN ${this.fmtPrice(tp.entry)}`, '#2962ff', '#fff', 'right');
      this._drawTag(ctx, x2, ySL, `SL ${this.fmtPrice(tp.sl)}`, '#f23645', '#fff', 'right');
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
        this._drawTag(ctx, maxPx + 8, yPOC, `TPO POC ${this.fmtPrice(tpo.poc)}`, '#0891b2', '#fff', 'left');
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
      this._drawTag(ctx, tagX, tagY, `${pat.name} · ${pat.stateLbl}`, tagBg, '#ffffff', 'right');
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

      this._drawTag(ctx, xEnd, yU1, `+1σ ${this.fmtPrice(em.upper1)} (+${em.movePct1SD.toFixed(1)}%)`, '#7c3aed', '#fff', 'right');
      this._drawTag(ctx, xEnd, yL1, `-1σ ${this.fmtPrice(em.lower1)} (-${em.movePct1SD.toFixed(1)}%)`, '#7c3aed', '#fff', 'right');
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

        this._drawTag(ctx, x, yPos, `${prefix}${fmtD}`, bg, '#fff', 'center');
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
    }
  }

  global.ChartOverlayEngine = ChartOverlayEngine;
})(window);

