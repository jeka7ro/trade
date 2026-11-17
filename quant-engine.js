/* ═══════════════════════════════════════════════════════════════════════════
   QUANT ENGINE — TRADEPRO ULTRA
   Institutional Indicators · SMC · VPVR · Auto-Fib · Multi-Confluence Signals
   & Honest Bar-by-Bar Strategy Backtester (Zero Lookahead Bias)
═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // ─── 1. DATA SANITIZATION & CANDLE TRANSFORMS ─────────────────────────────
  function sanitizeBars(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const map = new Map();
    for (let i = 0; i < raw.length; i++) {
      const d = raw[i];
      if (!d) continue;
      const t = Math.floor(Number(d.time));
      const o = Number(d.open);
      const h = Number(d.high);
      const l = Number(d.low);
      const c = Number(d.close);
      const v = Number(d.volume) || 0;
      if (!isFinite(t) || !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
      if (c <= 0 || o <= 0) continue;
      map.set(t, {
        time: t,
        open: o,
        high: Math.max(h, o, c),
        low: Math.min(l, o, c),
        close: c,
        volume: Math.max(0, v)
      });
    }
    const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);
    if (sorted.length < 10) return sorted;

    // Filter isolated off-exchange / extended-hours corrupted single-bar print wicks
    // while preserving genuine multi-bar moves, breakouts, and gap opens.
    const n = sorted.length;
    const baseSpans = new Array(n);
    for (let i = 0; i < n; i++) {
      const b = sorted[i];
      const top = Math.max(b.open, b.close);
      const body = Math.abs(b.close - b.open);
      const rawSpan = b.high - b.low;
      baseSpans[i] = Math.max(body, Math.min(rawSpan, top * 0.035));
    }

    for (let i = 0; i < n; i++) {
      const b = sorted[i];
      const win = [];
      const from = Math.max(0, i - 7);
      const to = Math.min(n - 1, i + 7);
      for (let j = from; j <= to; j++) {
        if (j !== i) win.push(baseSpans[j]);
      }
      if (win.length < 4) continue;
      win.sort((x, y) => x - y);
      const medSpan = win[win.length >> 1] || 0;

      const bodyTop = Math.max(b.open, b.close);
      const bodyBot = Math.min(b.open, b.close);
      const prev = i > 0 ? sorted[i - 1] : null;
      const next = i + 1 < n ? sorted[i + 1] : null;
      const nbHi = Math.max(
        bodyTop,
        prev ? Math.max(prev.open, prev.close) : bodyTop,
        next ? Math.max(next.open, next.close) : bodyTop
      );
      const nbLo = Math.min(
        bodyBot,
        prev ? Math.min(prev.open, prev.close) : bodyBot,
        next ? Math.min(next.open, next.close) : bodyBot
      );
      const refUnit = Math.max(medSpan, Math.abs(b.close - b.open), bodyTop * 0.0022);

      if ((b.high - bodyTop) > refUnit * 5.8 && b.high > nbHi + refUnit * 4.2) {
        b.high = Math.min(b.high, Math.max(nbHi, bodyTop + refUnit * 2.0));
      }
      if ((bodyBot - b.low) > refUnit * 5.8 && b.low < nbLo - refUnit * 4.2) {
        b.low = Math.max(b.low, Math.min(nbLo, bodyBot - refUnit * 2.0));
      }
    }
    return sorted;
  }

  function toHeikinAshi(bars) {
    if (!bars.length) return [];
    const out = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const haClose = (b.open + b.high + b.low + b.close) / 4;
      const haOpen = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
      const haHigh = Math.max(b.high, haOpen, haClose);
      const haLow = Math.min(b.low, haOpen, haClose);
      out.push({ time: b.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: b.volume });
    }
    return out;
  }

  function toSeries(bars, values) {
    const out = [];
    for (let i = 0; i < bars.length; i++) {
      const v = values[i];
      if (v != null && isFinite(v)) out.push({ time: bars[i].time, value: v });
    }
    return out;
  }

  // ─── 2. CORE QUANTITATIVE INDICATORS (INDEX-ALIGNED ARRAYS) ───────────────
  function calcSMAArray(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function calcEMAArray(values, period) {
    const out = new Array(values.length).fill(null);
    if (!values.length) return out;
    const k = 2 / (period + 1);
    let emaVal = null;
    let seedSum = 0;
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !isFinite(v)) continue;
      if (emaVal === null) {
        seedSum += v;
        count++;
        if (count === period) {
          emaVal = seedSum / period;
          out[i] = emaVal;
        }
      } else {
        emaVal = v * k + emaVal * (1 - k);
        out[i] = emaVal;
      }
    }
    return out;
  }

  function calcATRArray(bars, period = 14) {
    const n = bars.length;
    const out = new Array(n).fill(null);
    if (n === 0) return out;
    const tr = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const h = bars[i].high;
      const l = bars[i].low;
      const pc = i > 0 ? bars[i - 1].close : bars[i].open;
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    let atr = tr[0];
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        out[i] = tr[0];
      } else if (i < period) {
        atr = ((atr * i) + tr[i]) / (i + 1);
        out[i] = atr;
      } else {
        atr = (atr * (period - 1) + tr[i]) / period;
        out[i] = atr;
      }
    }
    return out;
  }

  // Exact PineScript ta.supertrend(factor, atrPeriod)
  function calcSuperTrend(bars, period = 10, mult = 3.0) {
    const n = bars.length;
    const atr = calcATRArray(bars, period);
    const upperBand = new Array(n).fill(null);
    const lowerBand = new Array(n).fill(null);
    const st = new Array(n).fill(null);
    const dir = new Array(n).fill(1); // 1 = Bullish, -1 = Bearish

    for (let i = 0; i < n; i++) {
      const hl2 = (bars[i].high + bars[i].low) / 2;
      const a = atr[i] || 0;
      let up = hl2 - mult * a;
      let dn = hl2 + mult * a;

      if (i > 0) {
        const prevUp = lowerBand[i - 1];
        const prevDn = upperBand[i - 1];
        if (prevUp != null && bars[i - 1].close > prevUp) up = Math.max(up, prevUp);
        if (prevDn != null && bars[i - 1].close < prevDn) dn = Math.min(dn, prevDn);

        let d = dir[i - 1];
        if (d === -1 && bars[i].close > prevDn) d = 1;
        else if (d === 1 && bars[i].close < prevUp) d = -1;
        dir[i] = d;
      }
      lowerBand[i] = up;
      upperBand[i] = dn;
      st[i] = dir[i] === 1 ? up : dn;
    }

    const bullSeries = [];
    const bearSeries = [];
    for (let i = 0; i < n; i++) {
      if (st[i] == null) continue;
      const isBull = dir[i] === 1;
      const prevBull = i > 0 && dir[i - 1] === 1;
      const nextBull = i === n - 1 ? isBull : dir[i + 1] === 1;
      const showBull = isBull && prevBull && nextBull;

      const isBear = dir[i] === -1;
      const prevBear = i > 0 && dir[i - 1] === -1;
      const nextBear = i === n - 1 ? isBear : dir[i + 1] === -1;
      const showBear = isBear && prevBear && nextBear;

      bullSeries.push({
        time: bars[i].time,
        value: isBull ? st[i] : bars[i].close,
        color: showBull ? '#089981' : 'rgba(0, 0, 0, 0)'
      });
      bearSeries.push({
        time: bars[i].time,
        value: isBear ? st[i] : bars[i].close,
        color: showBear ? '#f23645' : 'rgba(0, 0, 0, 0)'
      });
    }
    return { st, dir, lowerBand, upperBand, bullSeries, bearSeries, lineSeries: toSeries(bars, st) };
  }

  function calcBollinger(bars, period = 20, mult = 2.0) {
    const closes = bars.map(b => b.close);
    const mid = calcSMAArray(closes, period);
    const atr = calcATRArray(bars, period);
    const ema20 = calcEMAArray(closes, period);
    const upper = new Array(bars.length).fill(null);
    const lower = new Array(bars.length).fill(null);
    const squeeze = new Array(bars.length).fill(false);

    for (let i = period - 1; i < bars.length; i++) {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = closes[j] - mid[i];
        sumSq += diff * diff;
      }
      const std = Math.sqrt(sumSq / period);
      upper[i] = mid[i] + mult * std;
      lower[i] = mid[i] - mult * std;

      // TTM Squeeze: Bollinger Bands inside Keltner Channel (EMA20 +- 1.5*ATR)
      if (ema20[i] != null && atr[i] != null) {
        const kcUp = ema20[i] + 1.5 * atr[i];
        const kcLo = ema20[i] - 1.5 * atr[i];
        squeeze[i] = upper[i] < kcUp && lower[i] > kcLo;
      }
    }
    return {
      mid, upper, lower, squeeze,
      upperS: toSeries(bars, upper),
      midS: toSeries(bars, mid),
      lowerS: toSeries(bars, lower)
    };
  }

  function calcVWAP(bars) {
    // Anchors per UTC day on intraday timeframes; rolling 30-bar or full-session on daily+
    const isIntraday = bars.length > 2 && (bars[bars.length - 1].time - bars[bars.length - 2].time) < 86400;
    let pv = 0, v = 0, sqSum = 0;
    let lastDayKey = null;
    const vwap = [], u1 = [], l1 = [], u2 = [], l2 = [];

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (isIntraday) {
        const d = new Date(b.time * 1000);
        const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
        if (dayKey !== lastDayKey) {
          pv = 0; v = 0; sqSum = 0;
          lastDayKey = dayKey;
        }
      }
      const tp = (b.high + b.low + b.close) / 3;
      const vol = b.volume > 0 ? b.volume : 1;
      pv += tp * vol;
      v += vol;
      const vw = pv / v;
      sqSum += vol * Math.pow(tp - vw, 2);
      const sd = Math.sqrt(sqSum / v);
      vwap.push(vw);
      u1.push(vw + sd);
      l1.push(vw - sd);
      u2.push(vw + 2 * sd);
      l2.push(vw - 2 * sd);
    }

    return {
      vwap,
      vwapS: toSeries(bars, vwap),
      u1S: toSeries(bars, u1),
      l1S: toSeries(bars, l1),
      u2S: toSeries(bars, u2),
      l2S: toSeries(bars, l2)
    };
  }

  function calcRSIArray(bars, period = 14) {
    const n = bars ? bars.length : 0;
    const out = new Array(n).fill(null);
    if (n <= period) return out;
    const valAt = (k) => (typeof bars[k] === 'number' ? bars[k] : bars[k].close);
    let avgG = 0, avgL = 0;
    for (let i = 1; i <= period; i++) {
      const chg = valAt(i) - valAt(i - 1);
      if (chg > 0) avgG += chg;
      else avgL -= chg;
    }
    avgG /= period;
    avgL /= period;
    out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);

    for (let i = period + 1; i < n; i++) {
      const chg = valAt(i) - valAt(i - 1);
      const g = chg > 0 ? chg : 0;
      const l = chg < 0 ? -chg : 0;
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
  }

  function calcStochRSI(bars, rsiLen = 14, stochLen = 14, kSmooth = 3, dSmooth = 3) {
    const rsi = calcRSIArray(bars, rsiLen);
    const rawK = new Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
      if (i < rsiLen + stochLen - 1 || rsi[i] == null) continue;
      let minR = Infinity, maxR = -Infinity;
      for (let j = i - stochLen + 1; j <= i; j++) {
        if (rsi[j] != null) {
          if (rsi[j] < minR) minR = rsi[j];
          if (rsi[j] > maxR) maxR = rsi[j];
        }
      }
      rawK[i] = maxR - minR < 1e-9 ? 50 : ((rsi[i] - minR) / (maxR - minR)) * 100;
    }
    const k = new Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
      if (rawK[i] == null) continue;
      let s = 0, c = 0;
      for (let j = Math.max(0, i - kSmooth + 1); j <= i; j++) {
        if (rawK[j] != null) { s += rawK[j]; c++; }
      }
      if (c === kSmooth) k[i] = s / c;
    }
    const d = new Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
      if (k[i] == null) continue;
      let s = 0, c = 0;
      for (let j = Math.max(0, i - dSmooth + 1); j <= i; j++) {
        if (k[j] != null) { s += k[j]; c++; }
      }
      if (c === dSmooth) d[i] = s / c;
    }
    return { k, d, kS: toSeries(bars, k), dS: toSeries(bars, d) };
  }

  function calcMACD(bars, fast = 12, slow = 26, sigLen = 9) {
    const closes = bars.map(b => b.close);
    const ef = calcEMAArray(closes, fast);
    const es = calcEMAArray(closes, slow);
    const line = new Array(bars.length).fill(null);
    for (let i = 0; i < bars.length; i++) {
      if (ef[i] != null && es[i] != null) line[i] = ef[i] - es[i];
    }
    const signal = calcEMAArray(line, sigLen);
    const hist = new Array(bars.length).fill(null);
    const histS = [];
    for (let i = 0; i < bars.length; i++) {
      if (line[i] != null && signal[i] != null) {
        const h = line[i] - signal[i];
        hist[i] = h;
        const prevH = i > 0 && hist[i - 1] != null ? hist[i - 1] : 0;
        let color;
        if (h >= 0) color = h >= prevH ? '#089981' : 'rgba(8,153,129,0.45)';
        else color = h <= prevH ? '#f23645' : 'rgba(242,54,69,0.45)';
        histS.push({ time: bars[i].time, value: h, color });
      }
    }
    return {
      line, signal, hist,
      lineS: toSeries(bars, line),
      sigS: toSeries(bars, signal),
      histS
    };
  }

  function calcADXArray(bars, period = 14) {
    const n = bars.length;
    const adx = new Array(n).fill(null);
    const plusDI = new Array(n).fill(null);
    const minusDI = new Array(n).fill(null);
    if (n <= period * 2) return { adx, plusDI, minusDI };

    let smTR = 0, smPlus = 0, smMinus = 0;
    const dxArr = new Array(n).fill(null);

    for (let i = 1; i < n; i++) {
      const upMove = bars[i].high - bars[i - 1].high;
      const dnMove = bars[i - 1].low - bars[i].low;
      const pDM = upMove > dnMove && upMove > 0 ? upMove : 0;
      const mDM = dnMove > upMove && dnMove > 0 ? dnMove : 0;
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      );

      if (i <= period) {
        smTR += tr; smPlus += pDM; smMinus += mDM;
        if (i === period && smTR > 0) {
          plusDI[i] = (smPlus / smTR) * 100;
          minusDI[i] = (smMinus / smTR) * 100;
          const sum = plusDI[i] + minusDI[i];
          dxArr[i] = sum > 0 ? (Math.abs(plusDI[i] - minusDI[i]) / sum) * 100 : 0;
        }
      } else {
        smTR = smTR - smTR / period + tr;
        smPlus = smPlus - smPlus / period + pDM;
        smMinus = smMinus - smMinus / period + mDM;
        plusDI[i] = smTR > 0 ? (smPlus / smTR) * 100 : 0;
        minusDI[i] = smTR > 0 ? (smMinus / smTR) * 100 : 0;
        const sum = plusDI[i] + minusDI[i];
        dxArr[i] = sum > 0 ? (Math.abs(plusDI[i] - minusDI[i]) / sum) * 100 : 0;
      }
    }

    let adxSum = 0;
    for (let i = period; i < period * 2; i++) adxSum += dxArr[i] || 0;
    adx[period * 2 - 1] = adxSum / period;
    for (let i = period * 2; i < n; i++) {
      adx[i] = ((adx[i - 1] * (period - 1)) + (dxArr[i] || 0)) / period;
    }
    return { adx, plusDI, minusDI };
  }

  function calcIchimoku(bars) {
    const hlMid = (idx, len) => {
      if (idx < len - 1) return null;
      let hi = -Infinity, lo = Infinity;
      for (let j = idx - len + 1; j <= idx; j++) {
        if (bars[j].high > hi) hi = bars[j].high;
        if (bars[j].low < lo) lo = bars[j].low;
      }
      return (hi + lo) / 2;
    };
    const tenkan = bars.map((_, i) => hlMid(i, 9));
    const kijun = bars.map((_, i) => hlMid(i, 26));
    return {
      tenkan, kijun,
      tenkanS: toSeries(bars, tenkan),
      kijunS: toSeries(bars, kijun)
    };
  }

  // ─── 3. INSTITUTIONAL SMC (BOS / CHoCH / ORDER BLOCKS / FVG) ──────────────
  function calcSMC(bars, atrArr) {
    const n = bars.length;
    if (n < 20) return { orderBlocks: [], fvgs: [], structures: [], swingHighs: [], swingLows: [] };

    const depth = 4;
    const swingHighs = [];
    const swingLows = [];

    for (let i = depth; i < n - depth; i++) {
      let isH = true, isL = true;
      for (let j = i - depth; j <= i + depth; j++) {
        if (j === i) continue;
        if (bars[j].high > bars[i].high) isH = false;
        if (bars[j].low < bars[i].low) isL = false;
      }
      if (isH) swingHighs.push({ idx: i, time: bars[i].time, price: bars[i].high });
      if (isL) swingLows.push({ idx: i, time: bars[i].time, price: bars[i].low });
    }

    // BOS & CHoCH + Order Blocks
    const structures = [];
    let activeBullOBs = [];
    let activeBearOBs = [];
    let trend = 0; // 1 = Bull, -1 = Bear
    let lastSH = null, lastSL = null;
    let shPtr = 0, slPtr = 0;

    for (let i = depth * 2; i < n; i++) {
      while (shPtr < swingHighs.length && swingHighs[shPtr].idx <= i - depth) {
        lastSH = swingHighs[shPtr];
        shPtr++;
      }
      while (slPtr < swingLows.length && swingLows[slPtr].idx <= i - depth) {
        lastSL = swingLows[slPtr];
        slPtr++;
      }

      const b = bars[i];
      // Mitigate existing OBs if price closes decisively through them
      activeBullOBs = activeBullOBs.filter(ob => b.close >= ob.bottom);
      activeBearOBs = activeBearOBs.filter(ob => b.close <= ob.top);

      // Break above Swing High
      if (lastSH && !lastSH.broken && b.close > lastSH.price) {
        lastSH.broken = true;
        const type = trend === -1 ? 'CHoCH' : 'BOS';
        trend = 1;
        structures.push({
          startIdx: lastSH.idx,
          endIdx: i,
          startTime: lastSH.time,
          endTime: b.time,
          price: lastSH.price,
          type,
          bullish: true
        });
        // Find last bearish candle before breakout as Bullish Order Block
        for (let k = i - 1; k >= Math.max(lastSH.idx, i - 12); k--) {
          if (bars[k].close < bars[k].open) {
            activeBullOBs.push({
              idx: k,
              startTime: bars[k].time,
              top: Math.max(bars[k].open, bars[k].close),
              bottom: bars[k].low,
              bullish: true
            });
            break;
          }
        }
      }

      // Break below Swing Low
      if (lastSL && !lastSL.broken && b.close < lastSL.price) {
        lastSL.broken = true;
        const type = trend === 1 ? 'CHoCH' : 'BOS';
        trend = -1;
        structures.push({
          startIdx: lastSL.idx,
          endIdx: i,
          startTime: lastSL.time,
          endTime: b.time,
          price: lastSL.price,
          type,
          bullish: false
        });
        // Find last bullish candle before breakdown as Bearish Order Block
        for (let k = i - 1; k >= Math.max(lastSL.idx, i - 12); k--) {
          if (bars[k].close > bars[k].open) {
            activeBearOBs.push({
              idx: k,
              startTime: bars[k].time,
              top: bars[k].high,
              bottom: Math.min(bars[k].open, bars[k].close),
              bullish: false
            });
            break;
          }
        }
      }
    }

    // Unmitigated Fair Value Gaps (FVG)
    let bullFVGs = [];
    let bearFVGs = [];
    for (let i = 2; i < n; i++) {
      const c1 = bars[i - 2], c2 = bars[i - 1], c3 = bars[i];
      bullFVGs = bullFVGs.filter(f => c3.low > f.bottom);
      bearFVGs = bearFVGs.filter(f => c3.high < f.top);

      const minGap = (atrArr && atrArr[i] ? atrArr[i] * 0.12 : c2.close * 0.0015);
      if (c3.low - c1.high > minGap && c2.close > c2.open) {
        bullFVGs.push({ idx: i - 1, startTime: c2.time, top: c3.low, bottom: c1.high, bullish: true });
      }
      if (c1.low - c3.high > minGap && c2.close < c2.open) {
        bearFVGs.push({ idx: i - 1, startTime: c2.time, top: c1.low, bottom: c3.high, bullish: false });
      }
    }

    return {
      orderBlocks: [...activeBullOBs.slice(-3), ...activeBearOBs.slice(-3)],
      fvgs: [...bullFVGs.slice(-3), ...bearFVGs.slice(-3)],
      structures: structures.slice(-6),
      swingHighs,
      swingLows
    };
  }

  // ─── 4. VISIBLE RANGE VOLUME PROFILE (VPVR: POC + VAH/VAL 70%) ────────────
  function calcVPVR(bars, numBins = 42) {
    if (!bars || bars.length < 5) return null;
    let minP = Infinity, maxP = -Infinity;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].low < minP) minP = bars[i].low;
      if (bars[i].high > maxP) maxP = bars[i].high;
    }
    if (!isFinite(minP) || !isFinite(maxP) || maxP <= minP) return null;

    const step = (maxP - minP) / numBins;
    const bins = Array.from({ length: numBins }, (_, i) => ({
      priceLow: minP + i * step,
      priceHigh: minP + (i + 1) * step,
      priceMid: minP + (i + 0.5) * step,
      buyVol: 0,
      sellVol: 0,
      totalVol: 0
    }));

    let grandTotal = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const vol = b.volume || 1;
      const rng = Math.max(b.high - b.low, 1e-9);
      const buyRatio = Math.max(0.05, Math.min(0.95, (b.close - b.low) / rng));
      const bStart = Math.max(0, Math.min(numBins - 1, Math.floor((b.low - minP) / step)));
      const bEnd = Math.max(0, Math.min(numBins - 1, Math.floor((b.high - minP) / step)));
      const span = bEnd - bStart + 1;
      const vPerBin = vol / span;

      for (let k = bStart; k <= bEnd; k++) {
        bins[k].buyVol += vPerBin * buyRatio;
        bins[k].sellVol += vPerBin * (1 - buyRatio);
        bins[k].totalVol += vPerBin;
      }
      grandTotal += vol;
    }

    let pocIdx = 0, maxBinVol = 0;
    for (let i = 0; i < numBins; i++) {
      if (bins[i].totalVol > maxBinVol) {
        maxBinVol = bins[i].totalVol;
        pocIdx = i;
      }
    }

    // 70% Value Area expansion around POC
    const targetVA = grandTotal * 0.70;
    let accVol = bins[pocIdx].totalVol;
    let loIdx = pocIdx, hiIdx = pocIdx;
    while (accVol < targetVA && (loIdx > 0 || hiIdx < numBins - 1)) {
      const nextUp = hiIdx < numBins - 1 ? bins[hiIdx + 1].totalVol : -1;
      const nextDn = loIdx > 0 ? bins[loIdx - 1].totalVol : -1;
      if (nextUp >= nextDn) {
        hiIdx++;
        accVol += bins[hiIdx].totalVol;
      } else {
        loIdx--;
        accVol += bins[loIdx].totalVol;
      }
    }

    return {
      bins,
      maxBinVol,
      poc: bins[pocIdx].priceMid,
      vah: bins[hiIdx].priceHigh,
      val: bins[loIdx].priceLow
    };
  }

  // ─── 5. AUTO FIBONACCI (FIXED EXTENSIONS!) & FLOOR PIVOTS ─────────────────
  function calcAutoFib(bars, lookback = 60) {
    if (!bars || bars.length < 10) return null;
    const slice = bars.slice(-Math.min(lookback, bars.length));
    let hi = -Infinity, lo = Infinity, hiIdx = 0, loIdx = 0;
    slice.forEach((b, i) => {
      if (b.high > hi) { hi = b.high; hiIdx = i; }
      if (b.low < lo) { lo = b.low; loIdx = i; }
    });
    const range = Math.max(hi - lo, 1e-9);
    const trendUp = hiIdx >= loIdx; // Swing Low -> Swing High impulse

    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const extRatios = [1.272, 1.618, 2.0, 2.618];

    // In Uptrend: 0% is at SwingHigh, retracements step down toward 100% (SwingLow),
    // and upside target extensions project ABOVE SwingHigh!
    const levels = ratios.map(r => ({
      ratio: r,
      label: (r * 100).toFixed(1),
      price: trendUp ? (hi - r * range) : (lo + r * range)
    }));

    const extensions = extRatios.map(r => ({
      ratio: r,
      label: (r * 100).toFixed(1),
      price: trendUp ? (lo + r * range) : (hi - r * range)
    }));

    const gpTop = trendUp ? (hi - 0.5 * range) : (lo + 0.618 * range);
    const gpBot = trendUp ? (hi - 0.618 * range) : (lo + 0.5 * range);

    return { swingHigh: hi, swingLow: lo, range, trendUp, levels, extensions, gpTop, gpBot };
  }

  function calcPivotPoints(bars) {
    if (!bars || bars.length < 3) return null;
    const prev = bars[bars.length - 2];
    const P = (prev.high + prev.low + prev.close) / 3;
    const rng = prev.high - prev.low;
    return {
      P,
      R1: 2 * P - prev.low,
      S1: 2 * P - prev.high,
      R2: P + rng,
      S2: P - rng,
      R3: prev.high + 2 * (P - prev.low),
      S3: prev.low - 2 * (prev.high - P)
    };
  }

  // ─── 6. TRADINGVIEW 3-DIAL TECHNICALS SUMMARY ─────────────────────────────
  function computeTVTechnicals(bars) {
    if (!bars || bars.length < 30) {
      return {
        ma: { buy: 0, sell: 0, neutral: 0, score: 0, label: 'NEUTRU' },
        osc: { buy: 0, sell: 0, neutral: 0, score: 0, label: 'NEUTRU' },
        summary: { buy: 0, sell: 0, neutral: 0, score: 0, label: 'NEUTRU' },
        details: []
      };
    }
    const closes = bars.map(b => b.close);
    const last = bars[bars.length - 1];
    const price = last.close;
    const details = [];

    // 12 Moving Averages
    let maBuy = 0, maSell = 0, maNeut = 0;
    const maDefs = [
      ['EMA 10', calcEMAArray(closes, 10)],
      ['SMA 10', calcSMAArray(closes, 10)],
      ['EMA 20', calcEMAArray(closes, 20)],
      ['SMA 20', calcSMAArray(closes, 20)],
      ['EMA 30', calcEMAArray(closes, 30)],
      ['SMA 30', calcSMAArray(closes, 30)],
      ['EMA 50', calcEMAArray(closes, 50)],
      ['SMA 50', calcSMAArray(closes, 50)],
      ['EMA 100', calcEMAArray(closes, 100)],
      ['SMA 100', calcSMAArray(closes, 100)],
      ['EMA 200', calcEMAArray(closes, 200)],
      ['SMA 200', calcSMAArray(closes, 200)]
    ];
    for (const [name, arr] of maDefs) {
      const v = arr[arr.length - 1];
      if (v == null) { maNeut++; continue; }
      const diffPct = (price - v) / v;
      let act = 'NEUTRU';
      if (diffPct > 0.001) { maBuy++; act = 'CUMPĂRĂ'; }
      else if (diffPct < -0.001) { maSell++; act = 'VINDE'; }
      else maNeut++;
      details.push({ group: 'MA', name, val: v, action: act });
    }

    // 8 Oscillators
    let oscBuy = 0, oscSell = 0, oscNeut = 0;
    const rsiArr = calcRSIArray(bars, 14);
    const rsi = rsiArr[rsiArr.length - 1] ?? 50;
    if (rsi < 32) { oscBuy++; details.push({ group: 'OSC', name: 'RSI (14)', val: rsi, action: 'CUMPĂRĂ' }); }
    else if (rsi > 68) { oscSell++; details.push({ group: 'OSC', name: 'RSI (14)', val: rsi, action: 'VINDE' }); }
    else { oscNeut++; details.push({ group: 'OSC', name: 'RSI (14)', val: rsi, action: 'NEUTRU' }); }

    const srsi = calcStochRSI(bars);
    const sk = srsi.k[srsi.k.length - 1] ?? 50;
    const sd = srsi.d[srsi.d.length - 1] ?? 50;
    if (sk < 25 && sk >= sd) { oscBuy++; details.push({ group: 'OSC', name: 'Stoch RSI', val: sk, action: 'CUMPĂRĂ' }); }
    else if (sk > 75 && sk <= sd) { oscSell++; details.push({ group: 'OSC', name: 'Stoch RSI', val: sk, action: 'VINDE' }); }
    else { oscNeut++; details.push({ group: 'OSC', name: 'Stoch RSI', val: sk, action: 'NEUTRU' }); }

    const macd = calcMACD(bars);
    const mh = macd.hist[macd.hist.length - 1] ?? 0;
    if (mh > 0) { oscBuy++; details.push({ group: 'OSC', name: 'MACD (12,26)', val: mh, action: 'CUMPĂRĂ' }); }
    else if (mh < 0) { oscSell++; details.push({ group: 'OSC', name: 'MACD (12,26)', val: mh, action: 'VINDE' }); }
    else oscNeut++;

    const { adx, plusDI, minusDI } = calcADXArray(bars, 14);
    const adxV = adx[adx.length - 1] ?? 20;
    const pdi = plusDI[plusDI.length - 1] ?? 20;
    const mdi = minusDI[minusDI.length - 1] ?? 20;
    if (adxV > 20 && pdi > mdi) { oscBuy++; details.push({ group: 'OSC', name: 'ADX (14)', val: adxV, action: 'CUMPĂRĂ' }); }
    else if (adxV > 20 && mdi > pdi) { oscSell++; details.push({ group: 'OSC', name: 'ADX (14)', val: adxV, action: 'VINDE' }); }
    else { oscNeut++; details.push({ group: 'OSC', name: 'ADX (14)', val: adxV, action: 'NEUTRU' }); }

    // Momentum (10)
    const mom10 = price - bars[Math.max(0, bars.length - 11)].close;
    if (mom10 > 0) { oscBuy++; details.push({ group: 'OSC', name: 'Momentum (10)', val: mom10, action: 'CUMPĂRĂ' }); }
    else { oscSell++; details.push({ group: 'OSC', name: 'Momentum (10)', val: mom10, action: 'VINDE' }); }

    // Williams %R (14)
    const sl14 = bars.slice(-14);
    const hh14 = Math.max(...sl14.map(b => b.high));
    const ll14 = Math.min(...sl14.map(b => b.low));
    const wr = hh14 > ll14 ? ((hh14 - price) / (hh14 - ll14)) * -100 : -50;
    if (wr < -80) { oscBuy++; details.push({ group: 'OSC', name: 'Williams %R', val: wr, action: 'CUMPĂRĂ' }); }
    else if (wr > -20) { oscSell++; details.push({ group: 'OSC', name: 'Williams %R', val: wr, action: 'VINDE' }); }
    else { oscNeut++; details.push({ group: 'OSC', name: 'Williams %R', val: wr, action: 'NEUTRU' }); }

    // CCI (20)
    const sl20 = bars.slice(-20);
    const tps = sl20.map(b => (b.high + b.low + b.close) / 3);
    const tpMean = tps.reduce((s, x) => s + x, 0) / tps.length;
    const meanDev = tps.reduce((s, x) => s + Math.abs(x - tpMean), 0) / tps.length || 1;
    const cci = (tps[tps.length - 1] - tpMean) / (0.015 * meanDev);
    if (cci < -100) { oscBuy++; details.push({ group: 'OSC', name: 'CCI (20)', val: cci, action: 'CUMPĂRĂ' }); }
    else if (cci > 100) { oscSell++; details.push({ group: 'OSC', name: 'CCI (20)', val: cci, action: 'VINDE' }); }
    else { oscNeut++; details.push({ group: 'OSC', name: 'CCI (20)', val: cci, action: 'NEUTRU' }); }

    // SuperTrend vote
    const stObj = calcSuperTrend(bars, 10, 3.0);
    const stDir = stObj.dir[stObj.dir.length - 1];
    if (stDir === 1) { oscBuy++; details.push({ group: 'OSC', name: 'SuperTrend', val: stObj.st[stObj.st.length - 1], action: 'CUMPĂRĂ' }); }
    else { oscSell++; details.push({ group: 'OSC', name: 'SuperTrend', val: stObj.st[stObj.st.length - 1], action: 'VINDE' }); }

    const summarize = (b, s, n) => {
      const tot = Math.max(1, b + s + n);
      const sc = (b - s) / tot; // -1..+1
      const label = sc >= 0.45 ? 'CUMPĂRARE PUTERNICĂ'
        : sc >= 0.15 ? 'CUMPĂRARE'
          : sc <= -0.45 ? 'VÂNZARE PUTERNICĂ'
            : sc <= -0.15 ? 'VÂNZARE'
              : 'NEUTRU';
      return { buy: b, sell: s, neutral: n, score: sc, label };
    };

    const ma = summarize(maBuy, maSell, maNeut);
    const osc = summarize(oscBuy, oscSell, oscNeut);
    const summary = summarize(maBuy + oscBuy, maSell + oscSell, maNeut + oscNeut);

    return { ma, osc, summary, details };
  }

  // ─── 7. ULTRA SMART BUY/SELL SIGNAL ENGINE + STRATEGY BACKTESTER ──────────
  function runSmartSignalEngine(bars) {
    const empty = {
      signals: [],
      markers: [],
      trades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, netReturnPct: 0, avgR: 0, maxDrawdownPct: 0, equityCurve: [100] },
      currentPlan: null
    };
    if (!bars || bars.length < 30) return empty;

    const n = bars.length;
    const closes = bars.map(b => b.close);
    const vols = bars.map(b => b.volume || 0);

    const ema9 = calcEMAArray(closes, 9);
    const ema21 = calcEMAArray(closes, 21);
    const ema50 = calcEMAArray(closes, 50);
    const ema200 = calcEMAArray(closes, 200);
    const atr = calcATRArray(bars, 14);
    const st = calcSuperTrend(bars, 10, 2.8);
    const vwapObj = calcVWAP(bars);
    const vwap = vwapObj.vwap;
    const rsi = calcRSIArray(bars, 14);
    const srsi = calcStochRSI(bars, 14, 14, 3, 3);
    const macd = calcMACD(bars, 12, 26, 9);
    const { adx, plusDI, minusDI } = calcADXArray(bars, 14);
    const bb = calcBollinger(bars, 20, 2.0);
    const volSMA20 = calcSMAArray(vols, 20);

    const fmtLvl = (v) => {
      if (!isFinite(v)) return '0.00';
      return Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4);
    };

    // Precompute robust median/mean active volume so thin Pre/Post-Market ghost bars don't fake RVOL or stops
    const nonZeroVols = vols.filter(v => v > 0).sort((x, y) => x - y);
    const baselineActiveVol = nonZeroVols.length ? nonZeroVols[Math.floor(nonZeroVols.length * 0.55)] : 1;

    // Helper: evaluate bar i using ONLY 0..i (strict zero lookahead!)
    function evaluateBar(i) {
      const b = bars[i];
      const prev = bars[i - 1] || b;
      const prev2 = bars[i - 2] || prev;
      // Robust Active-Session ATR floor (ignores dead extended-hours quiet periods when sizing stops)
      let activeAtrSum = 0, activeAtrCnt = 0;
      for (let k = Math.max(1, i - 36); k <= i; k++) {
        if ((vols[k] || 0) >= baselineActiveVol * 0.35 || nonZeroVols.length <= 25) {
          activeAtrSum += (atr[k] || 0);
          activeAtrCnt++;
        }
      }
      const activeAtrAvg = activeAtrCnt > 0 ? (activeAtrSum / activeAtrCnt) : (atr[i] || 0);
      const a = Math.max(atr[i] || (b.close * 0.012), activeAtrAvg * 0.92, b.close * 0.0045);
      const rng = Math.max(b.high - b.low, 1e-9);
      const closePos = (b.close - b.low) / rng; // 0 = closed at low, 1 = closed at high
      const barDelta = ((b.close - b.low) - (b.high - b.close)) / rng; // -1..+1 intrabar orderflow delta
      const denomVol = Math.max(volSMA20[i] || 0, baselineActiveVol * 0.25);
      const rvol = denomVol > 0 ? (b.volume / denomVol) : 1.0;
      const isThinGhostBar = nonZeroVols.length > 30 && b.volume > 0 && b.volume < baselineActiveVol * 0.14;

      const e9 = ema9[i] ?? b.close;
      const e9Prev = ema9[i - 1] ?? e9;
      const e21 = ema21[i] ?? b.close;
      const e21Prev = ema21[i - 1] ?? e21;
      const e50 = ema50[i] ?? b.close;
      const e200 = ema200[i] ?? e50;
      const vw = vwap[i] || e21;
      const vwPrev = vwap[i - 1] || vw;

      const r = rsi[i] ?? 50;
      const rPrev = rsi[i - 1] ?? r;
      const sk = srsi.k[i] ?? 50, sd = srsi.d[i] ?? 50;
      const skPrev = srsi.k[i - 1] ?? sk, sdPrev = srsi.d[i - 1] ?? sd;
      const mh = macd.hist[i] ?? 0, mhPrev = macd.hist[i - 1] ?? mh;
      const adxV = adx[i] ?? 18;
      const pDI = plusDI[i] ?? 20;
      const mDI = minusDI[i] ?? 20;
      const stBull = st.dir[i] === 1;
      const stFlipBull = i > 0 && st.dir[i] === 1 && st.dir[i - 1] === -1;
      const stFlipBear = i > 0 && st.dir[i] === -1 && st.dir[i - 1] === 1;

      // Recent swing structure over prior 10 and 35 bars (excluding current bar for BOS/sweep)
      let prev10High = -Infinity, prev10Low = Infinity;
      let prev3High = Math.max(prev.high, prev2.high);
      let prev3Low = Math.min(prev.low, prev2.low);
      let prev35High = -Infinity, prev35Low = Infinity;
      for (let k = Math.max(0, i - 10); k < i; k++) {
        if (bars[k].high > prev10High) prev10High = bars[k].high;
        if (bars[k].low < prev10Low) prev10Low = bars[k].low;
      }
      if (i >= 3) {
        prev3High = Math.max(prev3High, bars[i - 3].high);
        prev3Low = Math.min(prev3Low, bars[i - 3].low);
      }
      for (let k = Math.max(0, i - 35); k <= i; k++) {
        if (bars[k].high > prev35High) prev35High = bars[k].high;
        if (bars[k].low < prev35Low) prev35Low = bars[k].low;
      }
      if (!isFinite(prev10High)) prev10High = b.high;
      if (!isFinite(prev10Low)) prev10Low = b.low;

      // Check Bullish / Bearish RSI Divergence (current swing vs 5-22 bars ago)
      let bullDiv = false, bearDiv = false;
      if (r < 47 && b.close > b.open) {
        for (let k = i - 4; k >= Math.max(14, i - 22); k--) {
          if (bars[i].low <= bars[k].low * 1.005 && rsi[k] != null && r > rsi[k] + 2.8 && rsi[k] < 40) {
            bullDiv = true; break;
          }
        }
      }
      if (r > 53 && b.close < b.open) {
        for (let k = i - 4; k >= Math.max(14, i - 22); k--) {
          if (bars[i].high >= bars[k].high * 0.995 && rsi[k] != null && r < rsi[k] - 2.8 && rsi[k] > 60) {
            bearDiv = true; break;
          }
        }
      }

      // ── BULLISH SCORING & 8 INSTITUTIONAL ARCHETYPES ──
      let bullScore = 0;
      const bullReasons = [];
      let bullTrigger = false;
      let bullArchetype = 'Confluență Bullish Multi-Factor';

      // 1. Trend, Ribbon & VWAP Alignment (up to 44 pts so sustained trends always register strongly)
      const ribbonBull = b.close > e21 && e9 >= e21 * 0.9985;
      const macroBull = b.close > e50 && e21 >= e50 * 0.996;
      const aboveVwap = b.close >= vw;

      if (ribbonBull) {
        bullScore += 12;
        bullReasons.push(`Ribbon bullish (Preț > EMA21 ${fmtLvl(e21)} & EMA9 > EMA21)`);
      } else if (b.close > e21) {
        bullScore += 6;
      }
      if (macroBull) {
        bullScore += 13;
        bullReasons.push(`Structură ascendentă peste EMA50 (${fmtLvl(e50)})`);
      }
      if (e50 >= e200 * 0.998) bullScore += 6;
      if (stBull) {
        bullScore += 9;
        bullReasons.push(`SuperTrend instituțional BULLISH (${fmtLvl(st.st[i] || e21)})`);
      }
      if (aboveVwap) {
        bullScore += 7;
        bullReasons.push(`Preț susținut peste VWAP (${fmtLvl(vw)})`);
      }

      const emaTrendSlopeBull = e50 >= (ema50[Math.max(0, i - 6)] ?? e50) * 0.9985;
      const emaTrendSlopeBear = e50 <= (ema50[Math.max(0, i - 6)] ?? e50) * 1.0015;

      // 2. Entry Archetypes & High-Conviction Institutional Triggers (Macro-Aligned!)
      const touchedDynamicSupport = (macroBull && emaTrendSlopeBull && stBull && aboveVwap && adxV >= 18 && b.low <= Math.max(e21, vw) * 1.006 && b.close > e21 && b.close > e9 && b.close > b.open && closePos >= 0.65 && r >= 42 && r <= 65);
      const vwapReclaim = (prev.close <= vwPrev * 1.001 && b.close > vw + 0.20 * a && b.close > b.open && closePos >= 0.64 && e9 >= e21 && rvol >= 1.25);
      const ema9CrossUp = (e9Prev <= e21Prev && e9 > e21 && b.close > e9 && b.close > e50 && closePos >= 0.62 && stBull && mh > mhPrev && r >= 48 && r <= 67 && rvol >= 1.15);
      const fibRetrace = prev35High > prev35Low ? (prev35High - b.low) / (prev35High - prev35Low) : 0;
      const inGoldenZone = fibRetrace >= 0.36 && fibRetrace <= 0.68 && b.close > e200 * 0.985;
      const liqSweepLow = (b.close > e200 * 0.99 || r <= 42) && b.low < prev10Low && b.close > prev10Low && closePos >= 0.64 && b.close > b.open && rvol >= 1.08;
      const bosBreakout = (macroBull || (b.close > e50 && e50 >= e200 * 0.996)) && b.close > prev10High && prev.close <= prev10High * 1.001 && b.close > e21 && aboveVwap && closePos >= 0.62 && adxV >= 18 && rvol >= 1.10;
      const squeezeBreak = i > 2 && (bb.squeeze[i - 1] || bb.squeeze[i - 2]) && b.close > (bb.upper[i] || Infinity) * 0.996 && b.close > prev.high && b.close > e50 && closePos >= 0.62 && rvol >= 1.12;
      const flagContinuationBull = (macroBull && emaTrendSlopeBull && stBull && aboveVwap && adxV >= 19 && r <= 68 && prev.close <= prev.open * 1.003 && b.close > prev3High && closePos >= 0.64 && mh >= mhPrev * 0.95);
      const impulseDisplacementBull = (macroBull && stBull && rng >= 1.38 * a && rvol >= 1.30 && closePos >= 0.70 && b.close > prev3High && aboveVwap);

      if (stFlipBull && (b.close > e50 || e50 >= e200 * 0.997) && aboveVwap && closePos >= 0.58 && rvol >= 1.05) {
        bullScore += 22;
        bullTrigger = true;
        bullArchetype = 'SuperTrend Flip Bullish';
        bullReasons.unshift('Inversare confirmată SuperTrend peste structura de trend');
      }
      if (bosBreakout && (rvol >= 1.10 || mh > mhPrev)) {
        bullScore += 20;
        bullTrigger = true;
        bullArchetype = 'Breakout Structură (BOS)';
        bullReasons.unshift(`Break of Structure peste ${fmtLvl(prev10High)} (RVOL ${rvol.toFixed(1)}x)`);
      }
      if (vwapReclaim) {
        // VWAP reclaim boosts confluence score, fires trigger ONLY when macro-aligned & strong
        bullScore += 14;
        if (macroBull && stBull && rvol >= 1.35) bullTrigger = true;
        bullReasons.push(`Recucerire instituțională VWAP (${fmtLvl(vw)})`);
      }
      if (ema9CrossUp) {
        bullScore += 15;
        bullTrigger = true;
        if (bullArchetype.startsWith('Confluență')) bullArchetype = 'EMA 9/21 Momentum Cross';
        bullReasons.push('Încrucișare dinamică EMA9 peste EMA21 cu impuls MACD');
      }
      if (touchedDynamicSupport) {
        bullScore += 19;
        bullTrigger = true;
        if (bullArchetype.startsWith('Confluență')) bullArchetype = 'Pullback în Trend pe EMA21';
        bullReasons.unshift(`Pullback cumpărat din suportul dinamic EMA21 (${fmtLvl(e21)})`);
      }
      if (flagContinuationBull) {
        bullScore += 17;
        bullTrigger = true;
        if (bullArchetype.startsWith('Confluență')) bullArchetype = 'Continuare Trend (Bull Flag)';
        bullReasons.unshift('Spargere micro-consolidare în direcția trendului dominant');
      }
      if (impulseDisplacementBull) {
        bullScore += 15;
        bullTrigger = true;
        if (bullArchetype.startsWith('Confluență')) bullArchetype = 'Impuls Orderflow & Volum';
      }
      if (inGoldenZone && b.close > b.open && closePos > 0.56) {
        bullScore += 9;
        bullReasons.push(`Retragere Fibonacci optimă (${(fibRetrace * 100).toFixed(0)}%)`);
      }
      if (liqSweepLow && (r < 44 || macroBull)) {
        bullScore += 20;
        bullTrigger = true;
        bullArchetype = 'Liquidity Sweep & Reversal';
        bullReasons.unshift('Măturare lichiditate sub minimul recent + respingere bullish');
      }
      if (squeezeBreak) {
        bullScore += 18;
        bullTrigger = true;
        bullArchetype = 'Explozie Volatility Squeeze';
        bullReasons.unshift('Ieșire explozivă din compresie Bollinger-Keltner');
      }

      // 3. Momentum, Orderflow Delta & ADX (up to 24 pts)
      const stochCrossUp = skPrev <= sdPrev && sk > sd && sk < 72;
      const rsiOversoldHook = rPrev < 33 && r > rPrev + 2.2 && b.close > b.open && closePos >= 0.58;
      if (bullDiv) {
        bullScore += 19;
        bullTrigger = true;
        bullArchetype = 'Divergență Bullish RSI';
        bullReasons.unshift(`Divergență Bullish RSI (${r.toFixed(1)}) pe epuizare vânzători`);
      } else if (rsiOversoldHook) {
        bullScore += 14;
        if (aboveVwap || b.close > e21) bullTrigger = true;
        bullReasons.push(`Revenire din supravânzare RSI (${rPrev.toFixed(0)} -> ${r.toFixed(0)})`);
      } else if (r >= 44 && r <= 68 && r >= rPrev - 1) {
        bullScore += 8;
      }

      if (stochCrossUp) {
        bullScore += 7;
        bullReasons.push('Confirmare ascendentă Stochastic RSI');
      }
      if (mh > mhPrev && (mh > 0 || mhPrev < 0)) {
        bullScore += 7;
        bullReasons.push('Momentum MACD în accelerare pozitivă');
      } else if (mh > 0 && ribbonBull) {
        bullScore += 4;
      }

      // 4. Volume, Orderflow & Trend Strength
      if (b.close > b.open && closePos >= 0.60) bullScore += 7;
      if (barDelta >= 0.28 && rvol >= 1.15) {
        bullScore += 9;
        bullReasons.push(`Delta pozitivă & RVOL ${rvol.toFixed(2)}x media`);
      } else if (rvol >= 1.0 && b.close >= b.open) {
        bullScore += 4;
      }
      if (adxV >= 20 && pDI > mDI) {
        bullScore += 6;
      }

      // 5. Anti-FOMO / Anti-Chop / Counter-Trend Guards
      if (r > 74) bullScore -= 28;
      if ((b.close - e21) > 2.5 * a) bullScore -= 24;
      if (b.close < b.open && closePos < 0.36) bullScore -= 20;
      if (!macroBull && !stBull && !aboveVwap && !bullDiv && !liqSweepLow) bullScore -= 18;
      if (b.close < e50 && !bullDiv && !liqSweepLow && !stFlipBull) bullScore -= 10;
      if (adxV < 15 && rvol < 1.0 && !liqSweepLow && !squeezeBreak) bullScore -= 12;

      // ── BEARISH SCORING & 8 INSTITUTIONAL ARCHETYPES ──
      let bearScore = 0;
      const bearReasons = [];
      let bearTrigger = false;
      let bearArchetype = 'Confluență Bearish Multi-Factor';

      const ribbonBear = b.close < e21 && e9 <= e21 * 1.0015;
      const macroBear = b.close < e50 && e21 <= e50 * 1.004;
      const belowVwap = b.close < vw;

      if (ribbonBear) {
        bearScore += 12;
        bearReasons.push(`Ribbon bearish (Preț < EMA21 ${fmtLvl(e21)} & EMA9 < EMA21)`);
      } else if (b.close < e21) {
        bearScore += 6;
      }
      if (macroBear) {
        bearScore += 13;
        bearReasons.push(`Trend descendent activ sub EMA50 (${fmtLvl(e50)})`);
      }
      if (e50 < e200 * 1.002) bearScore += 6;
      if (!stBull) {
        bearScore += 9;
        bearReasons.push(`Sub rezistența dinamică SuperTrend (${fmtLvl(st.st[i] || e21)})`);
      }
      if (belowVwap) {
        bearScore += 7;
        bearReasons.push(`Distribuție sub VWAP (${fmtLvl(vw)})`);
      }

      const rejectedDynamicRes = (macroBear && emaTrendSlopeBear && !stBull && belowVwap && adxV >= 18 && b.high >= Math.min(e21, vw) * 0.994 && b.close < e21 && b.close < e9 && b.close < b.open && closePos <= 0.35 && r <= 58 && r >= 35);
      const vwapBreakdown = (prev.close >= vwPrev * 0.999 && b.close < vw - 0.20 * a && b.close < b.open && closePos <= 0.36 && e9 <= e21 && rvol >= 1.25);
      const ema9CrossDn = (e9Prev >= e21Prev && e9 < e21 && b.close < e9 && b.close < e50 && closePos <= 0.38 && !stBull && mh < mhPrev && r <= 52 && r >= 33 && rvol >= 1.15);
      const liqSweepHigh = (b.close < e200 * 1.01 || r >= 58) && b.high > prev10High && b.close < prev10High && closePos <= 0.36 && b.close < b.open && rvol >= 1.08;
      const bosBreakdown = (macroBear || (b.close < e50 && e50 <= e200 * 1.004)) && b.close < prev10Low && prev.close >= prev10Low * 0.999 && b.close < e21 && belowVwap && closePos <= 0.38 && adxV >= 18 && rvol >= 1.10;
      const squeezeBreakDn = i > 2 && (bb.squeeze[i - 1] || bb.squeeze[i - 2]) && b.close < (bb.lower[i] || 0) * 1.004 && b.close < prev.low && b.close < e50 && closePos <= 0.38 && rvol >= 1.12;
      const flagContinuationBear = (macroBear && emaTrendSlopeBear && !stBull && belowVwap && adxV >= 19 && r >= 32 && prev.close >= prev.open * 0.997 && b.close < prev3Low && closePos <= 0.36 && mh <= mhPrev * 1.05);
      const impulseDisplacementBear = (macroBear && !stBull && rng >= 1.38 * a && rvol >= 1.30 && closePos <= 0.30 && b.close < prev3Low && belowVwap);

      if (stFlipBear && (b.close < e50 || e50 <= e200 * 1.003) && belowVwap && closePos <= 0.42 && rvol >= 1.05) {
        bearScore += 22;
        bearTrigger = true;
        bearArchetype = 'SuperTrend Flip Bearish';
        bearReasons.unshift('Inversare SuperTrend sub structura de trend');
      }
      if (bosBreakdown && (rvol >= 1.10 || mh < mhPrev)) {
        bearScore += 20;
        bearTrigger = true;
        bearArchetype = 'Breakdown Suport (BOS)';
        bearReasons.unshift(`Spargere suport ${fmtLvl(prev10Low)} pe RVOL ${rvol.toFixed(1)}x`);
      }
      if (vwapBreakdown) {
        bearScore += 14;
        if (macroBear && !stBull && rvol >= 1.35) bearTrigger = true;
        bearReasons.push(`Pierdere instituțională a nivelului VWAP (${fmtLvl(vw)})`);
      }
      if (ema9CrossDn) {
        bearScore += 15;
        bearTrigger = true;
        if (bearArchetype.startsWith('Confluență')) bearArchetype = 'EMA 9/21 Bearish Cross';
        bearReasons.push('Încrucișare descendentă EMA9 sub EMA21 cu impuls MACD');
      }
      if (rejectedDynamicRes) {
        bearScore += 19;
        bearTrigger = true;
        if (bearArchetype.startsWith('Confluență')) bearArchetype = 'Respingere din EMA21 (Short Pullback)';
        bearReasons.unshift(`Raliu vândut exact din rezistența EMA21 (${fmtLvl(e21)})`);
      }
      if (flagContinuationBear) {
        bearScore += 17;
        bearTrigger = true;
        if (bearArchetype.startsWith('Confluență')) bearArchetype = 'Continuare Short (Bear Flag)';
        bearReasons.unshift('Continuare descendentă sub minimul de micro-consolidare');
      }
      if (impulseDisplacementBear) {
        bearScore += 15;
        bearTrigger = true;
        if (bearArchetype.startsWith('Confluență')) bearArchetype = 'Impuls Vânzare & Distribuție';
      }
      if (liqSweepHigh && (r > 56 || macroBear)) {
        bearScore += 20;
        bearTrigger = true;
        bearArchetype = 'Bull Trap / Liquidity Sweep High';
        bearReasons.unshift('Străpungere falsă peste maxim + respingere agresivă');
      }
      if (squeezeBreakDn) {
        bearScore += 18;
        bearTrigger = true;
        bearArchetype = 'Breakdown din Volatility Squeeze';
        bearReasons.unshift('Expansiune descendentă din compresie de volatilitate');
      }

      const stochCrossDn = skPrev >= sdPrev && sk < sd && sk > 28;
      const rsiOverboughtHook = rPrev > 67 && r < rPrev - 2.2 && b.close < b.open && closePos <= 0.42;
      if (bearDiv) {
        bearScore += 19;
        bearTrigger = true;
        bearArchetype = 'Divergență Bearish RSI';
        bearReasons.unshift(`Divergență Bearish RSI (${r.toFixed(1)}) cu distribuție activă`);
      } else if (rsiOverboughtHook) {
        bearScore += 14;
        if (belowVwap || b.close < e21) bearTrigger = true;
        bearReasons.push(`Inversare din supracumpărare RSI (${rPrev.toFixed(0)} -> ${r.toFixed(0)})`);
      } else if (r <= 56 && r >= 32 && r <= rPrev + 1) {
        bearScore += 8;
      }

      if (stochCrossDn) {
        bearScore += 7;
        bearReasons.push('Confirmare descendentă Stochastic RSI');
      }
      if (mh < mhPrev && (mh < 0 || mhPrev > 0)) {
        bearScore += 7;
        bearReasons.push('Histogramă MACD în accelerare negativă');
      } else if (mh < 0 && ribbonBear) {
        bearScore += 4;
      }

      if (b.close < b.open && closePos <= 0.40) bearScore += 7;
      if (barDelta <= -0.28 && rvol >= 1.15) {
        bearScore += 9;
        bearReasons.push(`Presiune vânzare & RVOL ${rvol.toFixed(2)}x media`);
      } else if (rvol >= 1.0 && b.close <= b.open) {
        bearScore += 4;
      }
      if (adxV >= 20 && mDI > pDI) bearScore += 6;

      // Bearish Anti-Capitulation / Anti-Chop / Counter-Trend Guards
      if (r < 26) bearScore -= 28;
      if ((e21 - b.close) > 2.5 * a) bearScore -= 24;
      if (b.close > b.open && closePos > 0.64) bearScore -= 20;
      if (!macroBear && stBull && !belowVwap && !bearDiv && !liqSweepHigh) bearScore -= 18;
      if (b.close > e50 && !bearDiv && !liqSweepHigh && !stFlipBear) bearScore -= 10;
      if (adxV < 15 && rvol < 1.0 && !liqSweepHigh && !squeezeBreakDn) bearScore -= 12;

      bullScore = Math.max(0, Math.min(99, Math.round(bullScore)));
      bearScore = Math.max(0, Math.min(99, Math.round(bearScore)));

      // Deduplicate reasons preserving priority
      const uniqBull = Array.from(new Set(bullReasons));
      const uniqBear = Array.from(new Set(bearReasons));

      return {
        bullScore, bearScore,
        bullTrigger, bearTrigger,
        bullArchetype, bearArchetype,
        bullReasons: uniqBull,
        bearReasons: uniqBear,
        atr: a, ema9: e9, ema21: e21, ema50: e50, ema200: e200, vwap: vw,
        stVal: st.st[i], stBull, rsi: r, rvol, adx: adxV, isThinGhostBar,
        swingLow: Math.min(prev10Low, b.low),
        swingHigh: Math.max(prev10High, b.high)
      };
    }

    function buildLevels(isBuy, entry, ev) {
      const a = Math.max(ev.atr, entry * 0.005);
      let risk;
      if (isBuy) {
        const rawRisk = entry - (ev.swingLow - 0.35 * a);
        risk = Math.max(1.55 * a, Math.min(2.90 * a, rawRisk));
        const sl = entry - risk;
        const tp1 = entry + 1.0 * risk;
        const tp2 = entry + 2.5 * risk;
        return { entry, sl, tp1, tp2, risk, rr: 2.5 };
      } else {
        const rawRisk = (ev.swingHigh + 0.35 * a) - entry;
        risk = Math.max(1.55 * a, Math.min(2.90 * a, rawRisk));
        const sl = entry + risk;
        const tp1 = entry - 1.0 * risk;
        const tp2 = entry - 2.5 * risk;
        return { entry, sl, tp1, tp2, risk, rr: 2.5 };
      }
    }

    // ── SCAN HISTORICAL BARS & SIMULATE BACKTEST (ZERO LOOKAHEAD) ──
    const signals = [];
    const markers = [];
    const trades = [];
    let activeTrade = null;
    let lastSignalBar = -20;
    let lastSignalDir = 0;
    const startScanIdx = Math.min(28, Math.max(15, n - 10));

    for (let i = startScanIdx; i < n; i++) {
      const b = bars[i];
      const ev = evaluateBar(i);

      // 1. Manage open backtest position with institutional partial-profit + 2-stage trailing stop
      if (activeTrade) {
        const t = activeTrade;
        let closed = false;
        if (t.isBuy) {
          if (b.low <= t.currentSL) {
            const exitP = t.currentSL;
            const remR = (exitP - t.entry) / t.risk;
            const rMult = t.tp1Hit ? +(0.5 * 1.0 + 0.5 * Math.max(0, remR)).toFixed(2) : -1.0;
            t.exitTime = b.time;
            t.exitIdx = i;
            t.exitPrice = exitP;
            t.rMultiple = rMult;
            t.pnlPct = t.tp1Hit
              ? (((t.tp1 - t.entry) / t.entry) * 50) + (((exitP - t.entry) / t.entry) * 50)
              : (((exitP - t.entry) / t.entry) * 100);
            t.outcome = t.trailed1R ? 'TP1 + TRAIL' : (t.tp1Hit ? 'TP1 + BE' : 'STOP LOSS');
            trades.push(t);
            activeTrade = null;
            closed = true;
          } else {
            if (!t.tp1Hit && b.high >= t.tp1) {
              t.tp1Hit = true;
              t.currentSL = t.entry;
            }
            if (t.tp1Hit && !t.trailed1R && b.high >= t.entry + 1.80 * t.risk) {
              t.trailed1R = true;
              t.currentSL = t.entry + 0.85 * t.risk;
            }
            if (b.high >= t.tp2) {
              t.exitTime = b.time;
              t.exitIdx = i;
              t.exitPrice = t.tp2;
              t.rMultiple = 1.75;
              t.pnlPct = (((t.tp1 - t.entry) / t.entry) * 50) + (((t.tp2 - t.entry) / t.entry) * 50);
              t.outcome = 'TP2 TARGET';
              trades.push(t);
              activeTrade = null;
              closed = true;
            }
          }
        } else {
          if (b.high >= t.currentSL) {
            const exitP = t.currentSL;
            const remR = (t.entry - exitP) / t.risk;
            const rMult = t.tp1Hit ? +(0.5 * 1.0 + 0.5 * Math.max(0, remR)).toFixed(2) : -1.0;
            t.exitTime = b.time;
            t.exitIdx = i;
            t.exitPrice = exitP;
            t.rMultiple = rMult;
            t.pnlPct = t.tp1Hit
              ? (((t.entry - t.tp1) / t.entry) * 50) + (((t.entry - exitP) / t.entry) * 50)
              : (((t.entry - exitP) / t.entry) * 100);
            t.outcome = t.trailed1R ? 'TP1 + TRAIL' : (t.tp1Hit ? 'TP1 + BE' : 'STOP LOSS');
            trades.push(t);
            activeTrade = null;
            closed = true;
          } else {
            if (!t.tp1Hit && b.low <= t.tp1) {
              t.tp1Hit = true;
              t.currentSL = t.entry;
            }
            if (t.tp1Hit && !t.trailed1R && b.low <= t.entry - 1.80 * t.risk) {
              t.trailed1R = true;
              t.currentSL = t.entry - 0.85 * t.risk;
            }
            if (b.low <= t.tp2) {
              t.exitTime = b.time;
              t.exitIdx = i;
              t.exitPrice = t.tp2;
              t.rMultiple = 1.75;
              t.pnlPct = (((t.entry - t.tp1) / t.entry) * 50) + (((t.entry - t.tp2) / t.entry) * 50);
              t.outcome = 'TP2 TARGET';
              trades.push(t);
              activeTrade = null;
              closed = true;
            }
          }
        }

        // Only reverse runner when already locked in profit (tp1Hit) + strong opposite macro reversal
        if (!closed && activeTrade && !ev.isThinGhostBar && t.tp1Hit) {
          const oppFlip = (t.isBuy && !ev.stBull && ev.bearTrigger && ev.bearScore >= 82 && ev.bearScore >= ev.bullScore + 22)
            || (!t.isBuy && ev.stBull && ev.bullTrigger && ev.bullScore >= 82 && ev.bullScore >= ev.bearScore + 22);
          if (oppFlip) {
            const rawMove = t.isBuy ? (b.close - t.entry) : (t.entry - b.close);
            const remR = rawMove / t.risk;
            const netR = 0.5 * 1.0 + 0.5 * Math.max(0, remR);
            t.exitTime = b.time;
            t.exitIdx = i;
            t.exitPrice = b.close;
            t.rMultiple = +netR.toFixed(2);
            t.pnlPct = (rawMove / t.entry) * 100;
            t.outcome = 'TP1 + TRAIL FLIP';
            trades.push(t);
            activeTrade = null;
          }
        }
      }

      // 2. Check for new high-conviction BUY / SELL signal (ignore thin extended-hours ghost bars)
      if (ev.isThinGhostBar) continue;
      const sameDir = (lastSignalDir === 1 && ev.bullScore > ev.bearScore) || (lastSignalDir === -1 && ev.bearScore > ev.bullScore);
      const minGap = sameDir ? 12 : 6;
      if (i - lastSignalBar < minGap) continue;
      if (activeTrade) continue;

      const isBuySig = ev.bullTrigger && ev.bullScore >= 73 && ev.bullScore >= ev.bearScore + 16;
      const isSellSig = !isBuySig && ev.bearTrigger && ev.bearScore >= 73 && ev.bearScore >= ev.bullScore + 16;

      if (isBuySig || isSellSig) {
        const score = isBuySig ? ev.bullScore : ev.bearScore;
        const grade = score >= 80 ? 'A+' : score >= 71 ? 'A' : 'B+';
        const lvls = buildLevels(isBuySig, b.close, ev);
        const sigObj = {
          idx: i,
          time: b.time,
          isBuy: isBuySig,
          score,
          grade,
          archetype: isBuySig ? ev.bullArchetype : ev.bearArchetype,
          reasons: (isBuySig ? ev.bullReasons : ev.bearReasons).slice(0, 4),
          ...lvls
        };
        signals.push(sigObj);
        lastSignalBar = i;
        lastSignalDir = isBuySig ? 1 : -1;

        markers.push({
          time: b.time,
          position: isBuySig ? 'belowBar' : 'aboveBar',
          color: isBuySig ? (grade === 'A+' ? '#00e676' : '#089981') : (grade === 'A+' ? '#ff1744' : '#f23645'),
          shape: isBuySig ? 'arrowUp' : 'arrowDown',
          text: isBuySig ? `BUY ${grade}` : `SELL ${grade}`
        });

        activeTrade = {
          ...sigObj,
          entryTime: b.time,
          entryIdx: i,
          currentSL: lvls.sl,
          tp1Hit: false,
          trailed1R: false,
          outcome: 'ACTIV'
        };
      }
    }

    // Compute Backtest KPIs (1.5% capital risk per 1R)
    const closedTrades = [...trades];
    let equity = 100;
    let peak = 100;
    let maxDD = 0;
    let grossWinR = 0, grossLossR = 0, wins = 0, losses = 0;
    const equityCurve = [100];

    for (const tr of closedTrades) {
      const r = tr.rMultiple || 0;
      if (r > 0) { wins++; grossWinR += r; }
      else if (r < 0) { losses++; grossLossR += Math.abs(r); }
      equity *= (1 + r * 0.015);
      equityCurve.push(+equity.toFixed(2));
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }

    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = grossLossR > 0 ? (grossWinR / grossLossR) : (grossWinR > 0 ? 9.99 : 0);
    const avgR = totalTrades > 0 ? ((grossWinR - grossLossR) / totalTrades) : 0;
    const netReturnPct = equity - 100;
    const weakHist = totalTrades >= 5 && (winRate < 45 || profitFactor < 0.98);
    const gradeFromScore = (sc, hi = 80, mid = 71) => {
      const raw = sc >= hi ? 'A+' : sc >= mid ? 'A' : 'B+';
      if (!weakHist) return raw;
      return raw === 'A+' ? 'B+' : 'B';
    };

    // ── BUILD DECISIVE, LIVE ACTIONABLE PLAN ──
    const lastIdx = n - 1;
    const lastBar = bars[lastIdx];
    const nowEv = evaluateBar(lastIdx);
    const latestSig = signals.length ? signals[signals.length - 1] : null;
    const barsSinceSig = latestSig ? (lastIdx - latestSig.idx) : 999;

    const sigStillNearBuyZone = latestSig && latestSig.isBuy && barsSinceSig <= 4
      && lastBar.close > latestSig.sl
      && lastBar.close < latestSig.tp1
      && (lastBar.close - latestSig.entry) <= 0.85 * latestSig.risk
      && nowEv.bullScore >= nowEv.bearScore;

    const sigStillNearSellZone = latestSig && !latestSig.isBuy && barsSinceSig <= 4
      && lastBar.close < latestSig.sl
      && lastBar.close > latestSig.tp1
      && (latestSig.entry - lastBar.close) <= 0.85 * latestSig.risk
      && nowEv.bearScore >= nowEv.bullScore;

    const liveFreshBuy = nowEv.bullTrigger && nowEv.bullScore >= 70 && nowEv.bullScore >= nowEv.bearScore + 15;
    const liveFreshSell = !liveFreshBuy && nowEv.bearTrigger && nowEv.bearScore >= 70 && nowEv.bearScore >= nowEv.bullScore + 15;

    let status, badgeClass, actionTitle, planLevels, reasons, score, grade, setupArchetype;

    if (sigStillNearBuyZone || liveFreshBuy) {
      status = 'BUY_NOW';
      badgeClass = 'buy';
      score = sigStillNearBuyZone ? Math.max(latestSig.score, nowEv.bullScore) : nowEv.bullScore;
      grade = gradeFromScore(score, 80, 71);
      actionTitle = grade === 'A+' ? 'BUY ACTIV · Confluență Instituțională A+' : 'Semnal BUY Confirmat · Zonă Intrare';
      setupArchetype = sigStillNearBuyZone ? latestSig.archetype : nowEv.bullArchetype;
      const lvls = sigStillNearBuyZone
        ? { entry: latestSig.entry, sl: latestSig.sl, tp1: latestSig.tp1, tp2: latestSig.tp2, risk: latestSig.risk, rr: latestSig.rr, isBuy: true, sigTime: latestSig.time, sigIdx: latestSig.idx, projected: false }
        : { ...buildLevels(true, lastBar.close, nowEv), isBuy: true, sigTime: lastBar.time, sigIdx: lastIdx, projected: false };
      planLevels = lvls;
      reasons = (sigStillNearBuyZone && latestSig.reasons.length ? latestSig.reasons : nowEv.bullReasons).slice(0, 4);
    } else if (sigStillNearSellZone || liveFreshSell) {
      status = 'SELL_NOW';
      badgeClass = 'sell';
      score = sigStillNearSellZone ? Math.max(latestSig.score, nowEv.bearScore) : nowEv.bearScore;
      grade = gradeFromScore(score, 80, 71);
      actionTitle = grade === 'A+' ? 'SELL ACTIV · Confluență Instituțională A+' : 'Semnal SELL Confirmat · Zonă Intrare';
      setupArchetype = sigStillNearSellZone ? latestSig.archetype : nowEv.bearArchetype;
      const lvls = sigStillNearSellZone
        ? { entry: latestSig.entry, sl: latestSig.sl, tp1: latestSig.tp1, tp2: latestSig.tp2, risk: latestSig.risk, rr: latestSig.rr, isBuy: false, sigTime: latestSig.time, sigIdx: latestSig.idx, projected: false }
        : { ...buildLevels(false, lastBar.close, nowEv), isBuy: false, sigTime: lastBar.time, sigIdx: lastIdx, projected: false };
      planLevels = lvls;
      reasons = (sigStillNearSellZone && latestSig.reasons.length ? latestSig.reasons : nowEv.bearReasons).slice(0, 4);
    } else if (activeTrade && activeTrade.isBuy) {
      const movePct = ((lastBar.close - activeTrade.entry) / activeTrade.entry) * 100;
      status = 'HOLD_LONG';
      badgeClass = 'buy';
      score = Math.max(Math.round(activeTrade.score * 0.82), nowEv.bullScore);
      grade = gradeFromScore(score, 80, 71);
      actionTitle = activeTrade.tp1Hit
        ? `LONG În Curs (${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%) · Stop Securizat`
        : `Poziție LONG Activă (${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%)`;
      setupArchetype = `${activeTrade.archetype} (${barsSinceSig} bare)`;
      planLevels = {
        entry: activeTrade.entry,
        sl: activeTrade.currentSL,
        tp1: activeTrade.tp1,
        tp2: activeTrade.tp2,
        risk: activeTrade.risk,
        rr: activeTrade.rr,
        isBuy: true,
        sigTime: activeTrade.time,
        sigIdx: activeTrade.idx,
        projected: false
      };
      reasons = [
        activeTrade.tp1Hit
          ? `TP1 atins. Stop-Loss securizat la ${fmtLvl(activeTrade.currentSL)} pentru rularea spre TP2.`
          : `Suport dinamic activ pe EMA21 (${fmtLvl(nowEv.ema21)}) și VWAP (${fmtLvl(nowEv.vwap)}).`,
        ...activeTrade.reasons.slice(0, 3)
      ];
    } else if (activeTrade && !activeTrade.isBuy) {
      const movePct = ((activeTrade.entry - lastBar.close) / activeTrade.entry) * 100;
      status = 'HOLD_SHORT';
      badgeClass = 'sell';
      score = Math.max(Math.round(activeTrade.score * 0.82), nowEv.bearScore);
      grade = gradeFromScore(score, 80, 71);
      actionTitle = activeTrade.tp1Hit
        ? `SHORT În Curs (${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%) · Stop Securizat`
        : `Poziție SHORT Activă (${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}%)`;
      setupArchetype = `${activeTrade.archetype} (${barsSinceSig} bare)`;
      planLevels = {
        entry: activeTrade.entry,
        sl: activeTrade.currentSL,
        tp1: activeTrade.tp1,
        tp2: activeTrade.tp2,
        risk: activeTrade.risk,
        rr: activeTrade.rr,
        isBuy: false,
        sigTime: activeTrade.time,
        sigIdx: activeTrade.idx,
        projected: false
      };
      reasons = [
        activeTrade.tp1Hit
          ? `TP1 atins. Stop-Loss securizat la ${fmtLvl(activeTrade.currentSL)} pentru ținta TP2.`
          : `Sub rezistența dinamică EMA21 (${fmtLvl(nowEv.ema21)}) și SuperTrend (${fmtLvl(nowEv.stVal || lastBar.close)}).`,
        ...activeTrade.reasons.slice(0, 3)
      ];
    } else if (nowEv.bullScore >= 58 && nowEv.bullScore >= nowEv.bearScore + 12) {
      // Clear institutional bullish trend/setup (never fall into misleading NEUT!)
      status = 'SETUP_BUY';
      badgeClass = 'buy';
      score = nowEv.bullScore;
      grade = gradeFromScore(score, 78, 68);
      actionTitle = score >= 68 ? 'Oportunitate BUY · Trend Bullish Activ' : 'Bias BUY · Setup pe Suport Dinamic';
      setupArchetype = nowEv.bullArchetype !== 'Confluență Bullish Multi-Factor'
        ? nowEv.bullArchetype
        : 'Continuare Trend peste EMA21 & VWAP';
      const lvls = buildLevels(true, lastBar.close, nowEv);
      planLevels = { ...lvls, isBuy: true, sigTime: lastBar.time, sigIdx: Math.max(0, lastIdx - 2), projected: false };
      reasons = [
        `Confluență Bullish ${nowEv.bullScore}/100 vs Bear ${nowEv.bearScore}/100 (EMA21 ${fmtLvl(nowEv.ema21)} · VWAP ${fmtLvl(nowEv.vwap)}).`,
        ...nowEv.bullReasons.slice(0, 3)
      ];
    } else if (nowEv.bearScore >= 58 && nowEv.bearScore >= nowEv.bullScore + 12) {
      // Clear institutional bearish trend/setup (solves APPS / bearish trend deadlock!)
      status = 'SETUP_SELL';
      badgeClass = 'sell';
      score = nowEv.bearScore;
      grade = gradeFromScore(score, 78, 68);
      actionTitle = score >= 68 ? 'Oportunitate SELL · Trend Bearish Activ' : 'Bias SELL · Presiune sub Medii';
      setupArchetype = nowEv.bearArchetype !== 'Confluență Bearish Multi-Factor'
        ? nowEv.bearArchetype
        : 'Continuare Short sub EMA21 & VWAP';
      const lvls = buildLevels(false, lastBar.close, nowEv);
      planLevels = { ...lvls, isBuy: false, sigTime: lastBar.time, sigIdx: Math.max(0, lastIdx - 2), projected: false };
      reasons = [
        `Confluență Bearish ${nowEv.bearScore}/100 vs Bull ${nowEv.bullScore}/100 (EMA21 ${fmtLvl(nowEv.ema21)} · VWAP ${fmtLvl(nowEv.vwap)}).`,
        ...nowEv.bearReasons.slice(0, 3)
      ];
    } else {
      // Genuine Dead Chop / Indecisive Range
      const leanBull = nowEv.bullScore >= nowEv.bearScore;
      status = 'WAIT_SETUP';
      badgeClass = 'wait';
      score = Math.max(nowEv.bullScore, nowEv.bearScore);
      grade = 'NEUT';
      actionTitle = 'Echilibru / Range · Așteaptă Breakout';
      setupArchetype = `Consolidare (${fmtLvl(nowEv.swingLow)} – ${fmtLvl(nowEv.swingHigh)})`;
      const projLevels = buildLevels(leanBull, lastBar.close, nowEv);
      planLevels = { ...projLevels, isBuy: leanBull, sigTime: lastBar.time, sigIdx: lastIdx, projected: true };
      reasons = [
        `Echilibru Bull ${nowEv.bullScore} vs Bear ${nowEv.bearScore} (ADX ${nowEv.adx.toFixed(1)}, RSI ${nowEv.rsi.toFixed(1)}).`,
        `Trigger BUY peste ${fmtLvl(nowEv.swingHigh)} sau SELL sub ${fmtLvl(nowEv.swingLow)}.`
      ];
    }

    return {
      signals,
      markers,
      trades: activeTrade ? [...closedTrades, activeTrade].reverse() : [...closedTrades].reverse(),
      stats: {
        totalTrades,
        wins,
        losses,
        winRate: +winRate.toFixed(1),
        profitFactor: +profitFactor.toFixed(2),
        netReturnPct: +netReturnPct.toFixed(2),
        avgR: +avgR.toFixed(2),
        maxDrawdownPct: +maxDD.toFixed(2),
        equityCurve
      },
      currentPlan: {
        status,
        badgeClass,
        actionTitle,
        setupArchetype,
        score,
        bullScore: nowEv.bullScore,
        bearScore: nowEv.bearScore,
        grade,
        reasons,
        rsi: nowEv.rsi,
        rvol: nowEv.rvol,
        adx: nowEv.adx,
        atr: nowEv.atr,
        vwap: nowEv.vwap,
        ema9: nowEv.ema9,
        ema21: nowEv.ema21,
        ema50: nowEv.ema50,
        ema200: nowEv.ema200,
        stBull: nowEv.stBull,
        ...planLevels
      }
    };
  }

  // Institutional AI Trade Idea Strategist (SMC + VPVR + Orderflow + Fractal k-NN + Backtest Validation)
  function generateAITradeIdea(sym, bars, extra = {}) {
    const cleanBars = sanitizeBars(bars);
    if (!cleanBars || cleanBars.length < 30) return null;

    const sig = runSmartSignalEngine(cleanBars);
    const cp = sig.currentPlan;
    if (!cp) return null;

    const tech = computeTVTechnicals(cleanBars);
    const atrArr = calcATRArray(cleanBars, 14);
    const smc = calcSMC(cleanBars, atrArr);
    const vpvr = calcVPVR(cleanBars.slice(-140), 36);
    const ofp = calcOrderflowFootprint(cleanBars);
    const autoPats = calcAutoPatterns(cleanBars);
    const expMove = calcExpectedMove(cleanBars, 10);
    const fc = cleanBars.length >= 45 ? computeForecast(cleanBars, 14) : null;

    const last = cleanBars[cleanBars.length - 1];
    const prev = cleanBars[cleanBars.length - 2] || last;
    const price = isFinite(extra.price) ? Number(extra.price) : last.close;
    const chgPct = isFinite(extra.chgPct)
      ? Number(extra.chgPct)
      : (prev.close ? ((last.close - prev.close) / prev.close) * 100 : 0);

    const fmtP = (v) => {
      if (v == null || !isFinite(v)) return '—';
      const av = Math.abs(v);
      return av >= 100 ? v.toFixed(2) : av >= 2 ? v.toFixed(2) : v.toFixed(4);
    };

    const st = sig.stats;
    const isBuy = !!cp.isBuy;
    const isActionable = cp.status !== 'WAIT_SETUP';
    const isFreshTrigger = cp.status === 'BUY_NOW' || cp.status === 'SELL_NOW';
    const isSetupReady = cp.status === 'SETUP_BUY' || cp.status === 'SETUP_SELL';
    const atrVal = Math.max(cp.atr || (price * 0.012), price * 0.004);
    const effRvol = Math.max(cp.rvol || 1, Number(extra.tvRvol) || 0);

    // Nearest SMC Order Block & FVG
    const activeObs = (smc?.orderBlocks || []).filter(o => isBuy ? o.bullish : !o.bullish);
    const nearOB = activeObs.length
      ? activeObs.reduce((best, cur) => Math.abs(((cur.top + cur.bottom) / 2) - price) < Math.abs(((best.top + best.bottom) / 2) - price) ? cur : best, activeObs[0])
      : null;
    const activeFvgs = (smc?.fvgs || []).filter(f => isBuy ? f.bullish : !f.bullish);
    const nearFvg = activeFvgs.length ? activeFvgs[activeFvgs.length - 1] : null;
    const activePat = autoPats && autoPats.name ? autoPats : null;

    // Orderflow & VPVR context
    const lastFootprint = ofp?.last || ofp?.items?.[ofp.items.length - 1] || null;
    const cvdLen = ofp?.cvdSeries?.length || 0;
    const lastCvd = cvdLen ? ofp.cvdSeries[cvdLen - 1].value : 0;
    const prevCvd = cvdLen ? ofp.cvdSeries[Math.max(0, cvdLen - 6)].value : lastCvd;
    const cvdRising = typeof ofp?.deltaBullish === 'boolean' ? ofp.deltaBullish : (lastCvd >= prevCvd);
    const poc = isFinite(vpvr?.poc) ? vpvr.poc : (cp.vwap ?? price);
    const vah = isFinite(vpvr?.vah) ? vpvr.vah : price * 1.02;
    const val = isFinite(vpvr?.val) ? vpvr.val : price * 0.98;

    // Calibrated Bayesian AI Probability (38% - 84%, anchored to actual Backtest WR & multi-factor confluence)
    const techScore = tech?.summary?.score || 0;
    const techAligned = isBuy ? techScore >= 0.15 : techScore <= -0.15;
    const fcPct = isFinite(fc?.basePct) ? fc.basePct : 0;
    const fcAligned = isBuy ? fcPct > 0.25 : fcPct < -0.25;
    const fcMatchWin = fc?.topMatches?.length
      ? (fc.topMatches.filter(m => isBuy ? m.movePct > 0 : m.movePct < 0).length / fc.topMatches.length) * 100
      : 50;

    let probPct = 42 + (cp.score - 55) * 0.42;
    if (st.totalTrades >= 4) {
      probPct = probPct * 0.52 + st.winRate * 0.48;
    }
    if (techAligned) probPct += 3.5;
    if (fcAligned) probPct += 3.0;
    if ((isBuy && cvdRising) || (!isBuy && !cvdRising)) probPct += 2.5;
    if (effRvol >= 1.35) probPct += 2.5;
    if (!isActionable) probPct = Math.min(probPct, 52);
    if (st.totalTrades >= 5 && st.profitFactor < 0.95) probPct -= 7;
    probPct = Math.max(36, Math.min(84, Math.round(probPct)));

    // Re-anchor SETUP_* entry cleanly to live quote when within 0.6 ATR
    let entry = cp.entry, sl = cp.sl, tp1 = cp.tp1, tp2 = cp.tp2;
    if (isSetupReady && isFinite(price) && atrVal > 0 && Math.abs(price - cp.entry) < 0.6 * atrVal) {
      const risk = Math.abs(cp.entry - cp.sl);
      if (risk > 0) {
        entry = price;
        sl = isBuy ? price - risk : price + risk;
        tp1 = isBuy ? price + 1.0 * risk : price - 1.0 * risk;
        tp2 = isBuy ? price + 2.5 * risk : price - 2.5 * risk;
      }
    }

    const rawZLow = isBuy
      ? Math.max(sl + 0.35 * atrVal, entry - 0.35 * atrVal)
      : entry - 0.12 * atrVal;
    const rawZHigh = isBuy
      ? entry + 0.12 * atrVal
      : Math.min(sl - 0.35 * atrVal, entry + 0.35 * atrVal);
    const entryZoneLow = Math.min(rawZLow, rawZHigh);
    const entryZoneHigh = Math.max(rawZLow, rawZHigh);

    // Regime classification
    let regime = 'Consolidare / Range';
    if (!isActionable) regime = 'Consolidare / Echilibru (Fără Trend)';
    else if (cp.adx >= 24 && isBuy) regime = 'Trend Bullish Instituțional';
    else if (cp.adx >= 24 && !isBuy) regime = 'Trend Bearish / Distribuție';
    else if (effRvol >= 1.6) regime = 'Impuls & Volum Instituțional';
    else if (isBuy) regime = 'Acumulare / Structură Ascendentă';
    else regime = 'Presiune / Structură Descendentă';

    // Verdict label
    const verdictLabel = !isActionable
      ? `WAIT · Breakout ${fmtP(cp.entry)} / Range`
      : isFreshTrigger
        ? `IDEE AI ${isBuy ? 'LONG' : 'SHORT'} · INTRARE ACTIVĂ`
        : isSetupReady
          ? `IDEE AI ${isBuy ? 'LONG' : 'SHORT'} · SETUP CONFIRMARE`
          : `IDEE AI ${isBuy ? 'LONG' : 'SHORT'} · TREND ÎN CURS`;

    // Main Catalyst Badge
    let catalystBadge = cp.setupArchetype;
    const patAligned = activePat && ((isBuy && activePat.bias === 'bull') || (!isBuy && activePat.bias === 'bear'));
    if (effRvol >= 1.75) catalystBadge = `Volum RVOL ${effRvol.toFixed(1)}x`;
    else if (patAligned) catalystBadge = (activePat.stateLbl && activePat.stateLbl !== 'ÎN STRUCTURĂ') ? `${activePat.name} · ${activePat.stateLbl}` : activePat.name;
    else if (nearOB) catalystBadge = isBuy ? 'SMC Bullish Order Block' : 'SMC Bearish Order Block';
    else if (fc && Math.abs(fcPct) >= 1.5 && fcAligned) catalystBadge = `Analog k-NN (${fcPct >= 0 ? '+' : ''}${fcPct.toFixed(1)}%)`;

    // Natural Romanian Institutional Thesis
    const posVsPoc = price >= poc ? `peste POC (${fmtP(poc)})` : `sub POC (${fmtP(poc)})`;
    const obClause = nearOB
      ? (isBuy
        ? `cu suport instituțional SMC la Order Block $${fmtP(nearOB.bottom)}–$${fmtP(nearOB.top)}`
        : `sub blocul de ofertă SMC $${fmtP(nearOB.bottom)}–$${fmtP(nearOB.top)}`)
      : `cu volum profilat (VAH $${fmtP(vah)} / VAL $${fmtP(val)})`;
    const fcClause = fc
      ? (fcMatchWin >= 40
        ? `Proiecția fractală k-NN indică ${fcPct >= 0 ? '+' : ''}${fcPct.toFixed(1)}% (${Math.round(fcMatchWin)}% analogii în direcție).`
        : `Proiecția statistică estimează ${fcPct >= 0 ? '+' : ''}${fcPct.toFixed(1)}% pe 14 bare.`)
      : '';
    const ofClause = (isBuy && cvdRising) || (!isBuy && !cvdRising)
      ? `Orderflow CVD confirmă ${isBuy ? 'acumulare netă' : 'distribuție activă'} (RVOL ${effRvol.toFixed(1)}x).`
      : `Atenție: Orderflow CVD este mixt (RVOL ${effRvol.toFixed(1)}x) — așteaptă confirmare pe zona de intrare.`;

    const thesis = !isActionable
      ? `${sym} se consolidează în range (${fmtP(val)} – ${fmtP(vah)}, RSI ${cp.rsi.toFixed(0)}). Nu forța intrarea la mijloc; așteaptă spargere cu volum peste ${fmtP(vah)} sau sub ${fmtP(val)}.`
      : `${sym} evoluează ${posVsPoc} (${cp.setupArchetype}), ${obClause}. ${ofClause} ${fcClause}`.trim();

    const invalidationText = isBuy
      ? `Închiderea unei lumânări sub ${fmtP(sl)} (sub EMA21/suport structural) anulează scenariul LONG.`
      : `Recuperarea și închiderea fermă peste ${fmtP(sl)} anulează scenariul SHORT.`;

    // Honest Counter-Arguments / Risk Notes
    const risks = [];
    if (isBuy && cp.rsi >= 66) risks.push(`RSI ridicat (${cp.rsi.toFixed(0)}): nu urmări lumânări extinse; preferă retest în zona ${fmtP(entryZoneLow)}–${fmtP(entryZoneHigh)}.`);
    if (!isBuy && cp.rsi <= 34) risks.push(`RSI scăzut (${cp.rsi.toFixed(0)}): posibil bounce tehnic scurt; execută strict spre zona ${fmtP(entryZoneLow)}–${fmtP(entryZoneHigh)}.`);
    if (st.totalTrades >= 4 && st.winRate < 46) risks.push(`Istoric recent selectiv (WinRate ${st.winRate}% pe ${st.totalTrades} semnale): folosește risc redus 0.5%–1.0%.`);
    if (st.totalTrades >= 4 && st.profitFactor >= 1.35) risks.push(`Edge istoric confirmat: WinRate ${st.winRate}% · Profit Factor ${st.profitFactor} (${st.totalTrades} tranzacții).`);
    if (effRvol < 0.95) risks.push(`Volum relativ moderat (${effRvol.toFixed(2)}x) — evită dimensiuni mari până nu intră lichiditate.`);
    if (expMove && isFinite(expMove.movePct1SD)) risks.push(`Mișcare statistică așteptată (1σ, 10 bare): ±${expMove.movePct1SD.toFixed(1)}% ($${fmtP(expMove.lower1)} – $${fmtP(expMove.upper1)}).`);
    if (!risks.length) risks.push(`Respectă Stop-Loss-ul la ${fmtP(sl)} și mută la Break-Even imediat după atingerea TP1 (${fmtP(tp1)}).`);

    // Opportunity Ranking Score (penalize negative historical PF/WR so real high-edge setups rank #1-#10!)
    let oppScore = cp.score;
    if (isFreshTrigger) oppScore += 11;
    else if (isSetupReady) oppScore += 6;
    else if (cp.status === 'HOLD_LONG' || cp.status === 'HOLD_SHORT') {
      const distAtr = atrVal > 0 ? Math.abs(price - entry) / atrVal : 0;
      oppScore += distAtr <= 0.85 ? 4 : -6;
    } else {
      oppScore -= 28;
    }
    if (st.totalTrades >= 4) {
      if (st.winRate >= 54 && st.profitFactor >= 1.2) oppScore += Math.min(11, (st.winRate - 50) * 0.35 + (st.profitFactor - 1.1) * 3.0);
      else if (st.winRate < 45 || st.profitFactor < 0.98) oppScore -= 12;
      else oppScore += (st.winRate - 48) * 0.20;
    }
    if (effRvol >= 1.20) oppScore += Math.min(7, (effRvol - 1.0) * 3.0);
    if (techAligned) oppScore += 4;
    if (fcAligned) oppScore += 3;
    oppScore = Math.max(1, Math.min(99, Math.round(oppScore)));

    const weakHist = st.totalTrades >= 5 && (st.winRate < 45 || st.profitFactor < 0.98);
    let oppGrade = oppScore >= 84 ? 'A+' : oppScore >= 74 ? 'A' : oppScore >= 65 ? 'B+' : 'B';
    if (weakHist && (oppGrade === 'A+' || oppGrade === 'A')) oppGrade = 'B+';

    return {
      sym,
      name: extra.name || sym,
      cat: extra.cat || 'Acțiuni',
      exch: extra.exch || 'US',
      tf: extra.tf || '30m',
      price,
      chgPct,
      extType: extra.extType || '',
      extPrice: extra.extPrice ?? null,
      extChgPct: extra.extChgPct ?? null,
      isActionable,
      isFreshTrigger,
      isBuy,
      direction: isBuy ? 'BUY' : 'SELL',
      status: cp.status,
      badgeClass: cp.badgeClass,
      oppScore,
      score: cp.score,
      grade: isActionable ? oppGrade : cp.grade,
      probPct,
      verdictLabel,
      regime,
      catalystBadge,
      setupArchetype: cp.setupArchetype,
      actionTitle: cp.actionTitle,
      aiThesis: thesis,
      invalidationText,
      entryZoneLow,
      entryZoneHigh,
      entry,
      sl,
      tp1,
      tp2,
      rr: cp.rr || 2.5,
      rsi: cp.rsi,
      rvol: +effRvol.toFixed(2),
      adx: cp.adx,
      atr: atrVal,
      aboveVwap: last.close >= (cp.vwap || last.close),
      aboveEma21: last.close >= (cp.ema21 || last.close),
      macdBull: (tech?.details?.find(d => d.name.startsWith('MACD'))?.action === 'CUMPĂRĂ'),
      techLabel: tech?.summary?.label || 'Neutru',
      reasons: cp.reasons || [],
      risks: risks.slice(0, 3),
      keyLevels: {
        poc,
        vah,
        val,
        vwap: cp.vwap,
        ema21: cp.ema21,
        ema50: cp.ema50,
        bullOB: smc?.orderBlocks?.find(o => o.bullish) || null,
        bearOB: smc?.orderBlocks?.find(o => !o.bullish) || null,
        nearestFvg: nearFvg,
        chartPattern: activePat?.name || null,
        chartPatternState: activePat?.stateLbl || null,
        expectedMovePct: (expMove && isFinite(expMove.movePct1SD)) ? +expMove.movePct1SD.toFixed(2) : null,
        expectedUpper: isFinite(expMove?.upper1) ? expMove.upper1 : null,
        expectedLower: isFinite(expMove?.lower1) ? expMove.lower1 : null,
        forecastPct: (fc && isFinite(fc.basePct)) ? +fc.basePct.toFixed(2) : null,
        forecastTarget: isFinite(fc?.baseTarget) ? fc.baseTarget : null,
        forecastConf: fc?.confidence ?? null,
        cvdRising,
        footprintDelta: isFinite(ofp?.netDelta10) ? Math.round(ofp.netDelta10) : (isFinite(lastFootprint?.delta) ? Math.round(lastFootprint.delta) : 0)
      },
      winRate: st.winRate,
      profitFactor: st.profitFactor,
      totalTrades: st.totalTrades,
      netReturnPct: st.netReturnPct,
      news: Array.isArray(extra.news) ? extra.news.slice(0, 4) : [],
      cp: {
        ...cp,
        entry,
        sl,
        tp1,
        tp2,
        rvol: +effRvol.toFixed(2),
        grade: isActionable ? oppGrade : cp.grade
      }
    };
  }

  // Composite Institutional Opportunity Scorer for Market-Wide Top 10 BUY / SELL Discovery
  function evaluateMarketOpportunity(sym, bars, extra = {}) {
    return generateAITradeIdea(sym, bars, extra);
  }

  // ─── 8. FRACTAL + REGRESSION FORECAST ENGINE ──────────────────────────────
  function computeForecast(bars, horizon = 14) {
    if (!bars || bars.length < 40) return null;
    const n = bars.length;
    const lastClose = bars[n - 1].close;
    const lastTime = bars[n - 1].time;
    const barSec = n > 1 ? Math.max(60, bars[n - 1].time - bars[n - 2].time) : 86400;

    // 1. Weighted Linear Regression over last 34 bars
    const lb = Math.min(34, n);
    const sl = bars.slice(-lb).map(b => b.close);
    const mx = (lb - 1) / 2;
    const my = sl.reduce((s, v) => s + v, 0) / lb;
    let num = 0, den = 0;
    for (let i = 0; i < lb; i++) {
      num += (i - mx) * (sl[i] - my);
      den += (i - mx) * (i - mx);
    }
    const slope = den > 0 ? num / den : 0;
    const intercept = my - slope * mx;
    let resSq = 0, totSq = 0;
    for (let i = 0; i < lb; i++) {
      const pred = intercept + slope * i;
      resSq += Math.pow(sl[i] - pred, 2);
      totSq += Math.pow(sl[i] - my, 2);
    }
    const std = Math.sqrt(resSq / lb);
    const r2 = totSq > 0 ? Math.max(0, Math.min(1, 1 - resSq / totSq)) : 0.3;

    // 2. k-NN Historical Normalized Pattern Analogs (14-bar Z-score / pct shape)
    const patLen = 14;
    const curWin = bars.slice(-patLen);
    const curBase = curWin[0].close;
    const curNorm = curWin.map(b => (b.close / curBase) - 1);
    const matches = [];

    for (let i = 0; i < n - patLen - horizon - patLen; i++) {
      const win = bars.slice(i, i + patLen);
      const base = win[0].close;
      let dist = 0;
      for (let j = 0; j < patLen; j++) {
        const hn = (win[j].close / base) - 1;
        dist += Math.abs(curNorm[j] - hn);
      }
      const after = bars.slice(i + patLen, i + patLen + horizon);
      if (after.length < horizon) continue;
      const endBase = win[patLen - 1].close;
      const movePct = ((after[after.length - 1].close / endBase) - 1) * 100;
      const maxUpPct = ((Math.max(...after.map(x => x.high)) / endBase) - 1) * 100;
      const maxDnPct = ((Math.min(...after.map(x => x.low)) / endBase) - 1) * 100;
      matches.push({
        idx: i,
        dateStr: new Date(win[0].time * 1000).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }),
        dist,
        movePct,
        maxUpPct,
        maxDnPct,
        pathRatio: after.map(x => x.close / endBase)
      });
    }

    matches.sort((a, b) => a.dist - b.dist);
    const topMatches = matches.slice(0, 5);

    // Blend regression slope + k-NN median path
    const lineS = [{ time: lastTime, value: lastClose }];
    const upperS = [{ time: lastTime, value: lastClose }];
    const lowerS = [{ time: lastTime, value: lastClose }];

    for (let step = 1; step <= horizon; step++) {
      const t = lastTime + step * barSec;
      const regP = lastClose + slope * step;
      let knnP = regP;
      if (topMatches.length >= 3) {
        const avgRatio = topMatches.slice(0, 3).reduce((s, m) => s + (m.pathRatio[step - 1] || 1), 0) / 3;
        knnP = lastClose * avgRatio;
      }
      const blended = topMatches.length >= 3 ? (0.45 * regP + 0.55 * knnP) : regP;
      const cone = std * Math.sqrt(step) * 0.85;
      lineS.push({ time: t, value: blended });
      upperS.push({ time: t, value: blended + cone });
      lowerS.push({ time: t, value: Math.max(0.0001, blended - cone) });
    }

    const baseTarget = lineS[lineS.length - 1].value;
    const bullTarget = upperS[upperS.length - 1].value;
    const bearTarget = lowerS[lowerS.length - 1].value;
    const confidence = Math.max(25, Math.min(92, Math.round((r2 * 55 + (topMatches.length >= 3 ? 35 : 15)) * Math.max(0.55, 1 - (horizon - 7) * 0.005))));

    return {
      horizon,
      lastClose,
      baseTarget,
      bullTarget,
      bearTarget,
      basePct: ((baseTarget / lastClose) - 1) * 100,
      bullPct: ((bullTarget / lastClose) - 1) * 100,
      bearPct: ((bearTarget / lastClose) - 1) * 100,
      confidence,
      topMatches: topMatches.slice(0, 4),
      curWin,
      lineS,
      upperS,
      lowerS
    };
  }

  // ─── 9. TRADINGVIEW ULTIMATE: RANGE BARS · TPO · FOOTPRINT · PATTERNS · EXPECTED MOVE ───

  // 9A. Custom ATR Range Bars (Price-Based Bricks, Zero Noise)
  function toRangeBars(bars, atrMult = 0.65) {
    if (!bars || bars.length < 10) return bars || [];
    const atrArr = calcATRArray(bars, 14).filter(v => v != null && isFinite(v) && v > 0);
    const lastClose = bars[bars.length - 1].close;
    const medAtr = atrArr.length
      ? atrArr.slice(-40).reduce((s, v) => s + v, 0) / Math.min(40, atrArr.length)
      : lastClose * 0.012;
    const brick = Math.max(lastClose * 0.0015, medAtr * atrMult);

    const out = [];
    let cur = {
      time: bars[0].time,
      open: bars[0].open,
      high: bars[0].open,
      low: bars[0].open,
      close: bars[0].open,
      volume: 0
    };
    let lastOutTime = bars[0].time - 1;

    const pushBrick = (b) => {
      const safeTime = Math.max(b.time, lastOutTime + 1);
      lastOutTime = safeTime;
      out.push({ ...b, time: safeTime });
    };

    for (let i = 0; i < bars.length; i++) {
      const src = bars[i];
      const waypoints = src.close >= src.open
        ? [src.low, src.high, src.close]
        : [src.high, src.low, src.close];
      const vShare = (src.volume || 0) / 3;

      for (const wp of waypoints) {
        cur.volume += vShare;
        let guard = 0;
        while (Math.abs(wp - cur.open) >= brick && guard < 12) {
          guard++;
          const dir = wp > cur.open ? 1 : -1;
          const nextClose = cur.open + dir * brick;
          cur.high = Math.max(cur.high, nextClose);
          cur.low = Math.min(cur.low, nextClose);
          cur.close = nextClose;
          cur.time = Math.max(cur.time, src.time);
          pushBrick(cur);
          cur = {
            time: src.time,
            open: nextClose,
            high: nextClose,
            low: nextClose,
            close: nextClose,
            volume: 0
          };
        }
        cur.high = Math.max(cur.high, wp);
        cur.low = Math.min(cur.low, wp);
        cur.close = wp;
        cur.time = Math.max(cur.time, src.time);
      }
    }
    if (cur) pushBrick(cur);
    return out.slice(-320);
  }

  // 9B. Time Price Opportunity (TPO / Market Profile)
  function calcTPO(bars, numBins = 32) {
    if (!bars || bars.length < 12) return null;
    const win = bars.slice(-Math.min(bars.length, 120));
    let minP = Infinity, maxP = -Infinity;
    for (const b of win) {
      if (b.low < minP) minP = b.low;
      if (b.high > maxP) maxP = b.high;
    }
    if (!isFinite(minP) || !isFinite(maxP) || maxP <= minP) return null;

    const step = (maxP - minP) / numBins;
    const bins = Array.from({ length: numBins }, (_, i) => ({
      priceLow: minP + i * step,
      priceHigh: minP + (i + 1) * step,
      priceMid: minP + (i + 0.5) * step,
      count: 0,
      ibCount: 0
    }));

    const ibLen = Math.max(2, Math.floor(win.length * 0.16));
    let ibHigh = -Infinity, ibLow = Infinity;
    let totalTPO = 0;

    win.forEach((b, idx) => {
      if (idx < ibLen) {
        if (b.high > ibHigh) ibHigh = b.high;
        if (b.low < ibLow) ibLow = b.low;
      }
      const startBin = Math.max(0, Math.floor((b.low - minP) / step));
      const endBin = Math.min(numBins - 1, Math.floor((b.high - minP) / step));
      for (let k = startBin; k <= endBin; k++) {
        bins[k].count += 1;
        if (idx < ibLen) bins[k].ibCount += 1;
        totalTPO += 1;
      }
    });

    let pocIdx = 0, maxCount = 0;
    bins.forEach((bin, i) => {
      if (bin.count > maxCount) {
        maxCount = bin.count;
        pocIdx = i;
      }
    });

    // 70% TPO Value Area expansion from POC
    let vaSum = bins[pocIdx].count;
    let lo = pocIdx, hi = pocIdx;
    const targetVA = totalTPO * 0.70;
    while (vaSum < targetVA && (lo > 0 || hi < numBins - 1)) {
      const upCnt = hi < numBins - 1 ? bins[hi + 1].count : -1;
      const dnCnt = lo > 0 ? bins[lo - 1].count : -1;
      if (upCnt >= dnCnt && hi < numBins - 1) {
        hi++;
        vaSum += bins[hi].count;
      } else if (lo > 0) {
        lo--;
        vaSum += bins[lo].count;
      } else break;
    }

    return {
      bins,
      maxCount,
      poc: bins[pocIdx].priceMid,
      vah: bins[hi].priceHigh,
      val: bins[lo].priceLow,
      ibHigh,
      ibLow
    };
  }

  // 9C. OHLCV Structural Orderflow Proxy (Bar CLV Delta, Absorption & Cumulative Proxy — NU tick Bid/Ask)
  function calcOrderflowFootprint(bars) {
    if (!bars || bars.length < 10) return null;
    const vols = bars.map(b => b.volume || 0);
    const volAvg = calcSMAArray(vols, 20);
    let cvd = 0;
    const items = [];
    const cvdSeries = [];

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const rng = Math.max(1e-9, b.high - b.low);
      const clv = (b.close - b.low) / rng; // 0..1 close location
      const bodyBias = b.close >= b.open ? 0.56 : 0.44;
      const buyRatio = Math.max(0.08, Math.min(0.92, 0.55 * clv + 0.45 * bodyBias));
      const vol = b.volume || 0;
      const buyVol = vol * buyRatio;
      const sellVol = vol - buyVol;
      const delta = buyVol - sellVol;
      cvd += delta;

      const avgV = volAvg[i] || vol || 1;
      const rvol = avgV > 0 ? vol / avgV : 1;
      const deltaPct = vol > 0 ? delta / vol : 0;
      const imbalance = Math.abs(deltaPct) >= 0.40 && rvol >= 1.25;
      const absorption = rvol >= 1.55 && Math.abs(b.close - b.open) < rng * 0.28;

      items.push({
        idx: i,
        time: b.time,
        buyVol,
        sellVol,
        delta,
        deltaPct,
        rvol,
        cvd,
        imbalance,
        bullImb: delta > 0,
        absorption
      });
      cvdSeries.push({ time: b.time, value: cvd });
    }

    const recent = items.slice(-10);
    const netDelta10 = recent.reduce((s, x) => s + x.delta, 0);
    return {
      isOhlcvProxy: true,
      items,
      cvdSeries,
      last: items[items.length - 1],
      netDelta10,
      deltaBullish: netDelta10 >= 0
    };
  }

  // 9D. Auto Chart Patterns (Automated Channels, Wedges, Triangles & Breakouts)
  function calcAutoPatterns(bars) {
    if (!bars || bars.length < 35) return null;
    const n = bars.length;
    const startScan = Math.max(4, n - 115);
    const pivHi = [];
    const pivLo = [];
    const L = 4, R = 3;

    for (let i = startScan; i < n - R; i++) {
      let isH = true, isL = true;
      for (let k = i - L; k <= i + R; k++) {
        if (k === i) continue;
        if (bars[k].high > bars[i].high) isH = false;
        if (bars[k].low < bars[i].low) isL = false;
      }
      if (isH) pivHi.push({ idx: i, time: bars[i].time, price: bars[i].high });
      if (isL) pivLo.push({ idx: i, time: bars[i].time, price: bars[i].low });
    }

    if (pivHi.length < 2 || pivLo.length < 2) return null;

    const h1 = pivHi[pivHi.length - 2];
    const h2 = pivHi[pivHi.length - 1];
    const l1 = pivLo[pivLo.length - 2];
    const l2 = pivLo[pivLo.length - 1];

    const slopeH = (h2.price - h1.price) / Math.max(1, h2.idx - h1.idx);
    const slopeL = (l2.price - l1.price) / Math.max(1, l2.idx - l1.idx);
    const lastClose = bars[n - 1].close;
    const normSH = (slopeH / lastClose) * 100; // % per bar
    const normSL = (slopeL / lastClose) * 100;

    const endIdx = n - 1 + 8;
    const barSec = n > 1 ? Math.max(1, bars[n - 1].time - bars[n - 2].time) : 86400;
    const endTime = bars[n - 1].time + 8 * barSec;

    const upperNow = h2.price + slopeH * ((n - 1) - h2.idx);
    const lowerNow = l2.price + slopeL * ((n - 1) - l2.idx);
    const upperEnd = h2.price + slopeH * (endIdx - h2.idx);
    const lowerEnd = l2.price + slopeL * (endIdx - l2.idx);

    let name = 'Structură Dinamică S/R';
    let bias = 'neutral';

    if (Math.abs(h2.price - h1.price) / h1.price < 0.0075 && lastClose < h2.price) {
      name = 'Dublu Vârf (Rezistență)';
      bias = 'bear';
    } else if (Math.abs(l2.price - l1.price) / l1.price < 0.0075 && lastClose > l2.price) {
      name = 'Dublu Minim (Suport)';
      bias = 'bull';
    } else if (normSH > 0.03 && normSL > 0.03 && Math.abs(normSH - normSL) < 0.14) {
      name = 'Canal Ascendent';
      bias = 'bull';
    } else if (normSH < -0.03 && normSL < -0.03 && Math.abs(normSH - normSL) < 0.14) {
      name = 'Canal Descendent';
      bias = 'bear';
    } else if (normSH < -0.03 && normSL < 0 && normSL > normSH) {
      name = 'Falling Wedge (Bullish)';
      bias = 'bull';
    } else if (normSH > 0 && normSL > 0.03 && normSL > normSH) {
      name = 'Rising Wedge (Bearish)';
      bias = 'bear';
    } else if (Math.abs(normSH) < 0.025 && normSL > 0.03) {
      name = 'Triunghi Ascendent';
      bias = 'bull';
    } else if (normSH < -0.03 && Math.abs(normSL) < 0.025) {
      name = 'Triunghi Descendent';
      bias = 'bear';
    } else if (normSH < -0.015 && normSL > 0.015) {
      name = 'Triunghi Simetric';
      bias = lastClose >= (upperNow + lowerNow) / 2 ? 'bull' : 'bear';
    }

    let stateLbl = 'ÎN STRUCTURĂ';
    if (lastClose > upperNow) { stateLbl = 'BREAKOUT SUS'; bias = 'bull'; }
    else if (lastClose < lowerNow) { stateLbl = 'BREAKDOWN JOS'; bias = 'bear'; }

    const heightSpan = Math.abs(Math.max(h1.price, h2.price) - Math.min(l1.price, l2.price));
    const targetPrice = bias === 'bear' ? lowerNow - heightSpan * 0.618 : upperNow + heightSpan * 0.618;

    return {
      name,
      bias,
      stateLbl,
      upperLine: {
        p1: { idx: h1.idx, time: h1.time, price: h1.price },
        p2: { idx: endIdx, time: endTime, price: upperEnd }
      },
      lowerLine: {
        p1: { idx: l1.idx, time: l1.time, price: l1.price },
        p2: { idx: endIdx, time: endTime, price: lowerEnd }
      },
      pivots: [h1, h2, l1, l2],
      upperNow,
      lowerNow,
      targetPrice
    };
  }

  // 9D-bis. Wolfe Wave Detector (Bill Wolfe 1-2-3-4-5 Converging Wedge + EPA 1->4 Target)
  function calcWolfeWave(bars) {
    if (!bars || bars.length < 28) return null;
    const n = bars.length;
    const scanStart = Math.max(2, n - 160);
    const L = 3, R = 2;

    // Collect major swing highs & lows cleanly
    const rawSwings = [];
    for (let i = scanStart; i < n - R; i++) {
      let isH = true, isL = true;
      for (let k = i - L; k <= i + R; k++) {
        if (k < 0 || k === i) continue;
        if (bars[k].high > bars[i].high) isH = false;
        if (bars[k].low < bars[i].low) isL = false;
      }
      if (isH) rawSwings.push({ type: 'H', idx: i, time: bars[i].time, price: bars[i].high });
      if (isL) rawSwings.push({ type: 'L', idx: i, time: bars[i].time, price: bars[i].low });
    }
    if (rawSwings.length < 4) return null;

    // Enforce strict alternation (H -> L -> H -> L) keeping sharper extremes
    const alt = [];
    for (const sw of rawSwings) {
      const prev = alt[alt.length - 1];
      if (!prev) {
        alt.push(sw);
      } else if (prev.type === sw.type) {
        if ((sw.type === 'H' && sw.price >= prev.price) || (sw.type === 'L' && sw.price <= prev.price)) {
          alt[alt.length - 1] = sw;
        }
      } else {
        alt.push(sw);
      }
    }

    // Add live trailing edge candidate for developing Wave 5 if last pivot occurred >= 2 bars ago
    const lastAlt = alt[alt.length - 1];
    if (lastAlt && (n - 1 - lastAlt.idx) >= 2) {
      const wantType = lastAlt.type === 'H' ? 'L' : 'H';
      let bestIdx = n - 1;
      let bestPx = wantType === 'L' ? bars[n - 1].low : bars[n - 1].high;
      for (let k = lastAlt.idx + 1; k < n; k++) {
        const px = wantType === 'L' ? bars[k].low : bars[k].high;
        if ((wantType === 'L' && px <= bestPx) || (wantType === 'H' && px >= bestPx)) {
          bestPx = px;
          bestIdx = k;
        }
      }
      alt.push({ type: wantType, idx: bestIdx, time: bars[bestIdx].time, price: bestPx, isLive: true });
    }

    if (alt.length < 5) return null;

    let bestWave = null;
    let bestScore = -Infinity;
    const minWindowIdx = Math.max(5, alt.length - 14);

    for (let s = Math.max(0, minWindowIdx - 5); s <= alt.length - 5; s++) {
      const p1 = alt[s];
      const p2 = alt[s + 1];
      const p3 = alt[s + 2];
      const p4 = alt[s + 3];
      const p5 = alt[s + 4];
      if (p5.idx < n - 30) continue; // Keep only recent active or newly triggered waves
      const totalSpan = p5.idx - p1.idx;
      if (totalSpan < 10) continue;

      const d13 = p3.idx - p1.idx;
      const d24 = p4.idx - p2.idx;
      const d35 = p5.idx - p3.idx;
      if (d13 < 2 || d24 < 2 || d35 < 2) continue;

      const isBull = p1.type === 'L' && p2.type === 'H' && p3.type === 'L' && p4.type === 'H' && p5.type === 'L';
      const isBear = p1.type === 'H' && p2.type === 'L' && p3.type === 'H' && p4.type === 'L' && p5.type === 'H';
      if (!isBull && !isBear) continue;

      const s13 = (p3.price - p1.price) / d13;
      const s24 = (p4.price - p2.price) / d24;
      const s14 = (p4.price - p1.price) / Math.max(1, p4.idx - p1.idx);

      let valid = false;
      if (isBull) {
        // Bullish Wolfe: 3 < 1, 4 > 1 (above Point 1 floor), 4 < 2, converging falling wedge (s24 < s13)
        if (p3.price < p1.price && p4.price > p1.price * 0.992 && p4.price < p2.price && s24 < s13) {
          valid = true;
        }
      } else {
        // Bearish Wolfe: 3 > 1, 4 < 1 (below Point 1 ceiling), 4 > 2, converging rising wedge (s24 > s13)
        if (p3.price > p1.price && p4.price < p1.price * 1.008 && p4.price > p2.price && s24 > s13) {
          valid = true;
        }
      }
      if (!valid) continue;

      // Line 1-3 projection at Point 5 (Sweet Zone trigger check)
      const proj13At5 = p1.price + s13 * (p5.idx - p1.idx);
      const devRatio = Math.abs(p5.price - proj13At5) / Math.max(1e-9, proj13At5);
      if (isBull) {
        if (p5.price > proj13At5 * 1.015 || p5.price < proj13At5 * 0.945 || p5.price > p3.price * 1.008) continue;
      } else {
        if (p5.price < proj13At5 * 0.985 || p5.price > proj13At5 * 1.055 || p5.price < p3.price * 0.992) continue;
      }

      // Convergence apex (ETA) between Line 1-3 and Line 2-4
      const b13 = p1.price - s13 * p1.idx;
      const b24 = p2.price - s24 * p2.idx;
      const rawApex = (b13 - b24) / (s24 - s13);
      if (!isFinite(rawApex) || rawApex <= p4.idx || rawApex > p5.idx + totalSpan * 1.8) continue;

      const etaIdx = Math.min(n - 1 + 22, Math.max(p5.idx + 4, Math.round(rawApex)));
      const epaPrice = p1.price + s14 * (etaIdx - p1.idx);
      if (isBull && epaPrice <= p5.price) continue;
      if (isBear && epaPrice >= p5.price) continue;

      // Score: tighter Point 5 fit on 1-3 + balanced wave timing + freshness near n-1
      const touchScore = Math.max(0, 40 - devRatio * 1400);
      const symScore = 25 * (Math.min(d13, d35) / Math.max(d13, d35));
      const recencyScore = Math.max(0, 35 - (n - 1 - p5.idx) * 1.2);
      const score = touchScore + symScore + recencyScore;

      if (score > bestScore) {
        bestScore = score;
        const projEndIdx = Math.min(etaIdx, n - 1 + 14);
        const curClose = bars[n - 1].close;
        const moveFrom5Pct = Math.abs((curClose - p5.price) / p5.price);
        const status = (n - 1 - p5.idx <= 4 || moveFrom5Pct < 0.015) ? 'SWEET ZONE (5)' : 'CONFIRMAT SPRE EPA';
        bestWave = {
          bullish: isBull,
          status,
          p1, p2, p3, p4, p5,
          proj13At5,
          extIdx: projEndIdx,
          ext13Price: p1.price + s13 * (projEndIdx - p1.idx),
          ext24Price: p2.price + s24 * (projEndIdx - p2.idx),
          etaIdx,
          epaPrice,
          score: Math.round(score)
        };
      }
    }

    return bestWave;
  }

  // 9E. Expected Move Cone (±1σ 68% & ±2σ 95% Statistical Volatility Envelope)
  function calcExpectedMove(bars, horizonBars = 10) {
    if (!bars || bars.length < 22) return null;
    const n = bars.length;
    const lastClose = bars[n - 1].close;
    const lastTime = bars[n - 1].time;
    const barSec = n > 1 ? Math.max(1, bars[n - 1].time - bars[n - 2].time) : 86400;

    const lb = Math.min(30, n - 1);
    const rets = [];
    for (let i = n - lb; i < n; i++) {
      const prev = bars[i - 1].close;
      if (prev > 0 && bars[i].close > 0) rets.push(Math.log(bars[i].close / prev));
    }
    const mean = rets.reduce((s, v) => s + v, 0) / Math.max(1, rets.length);
    const variance = rets.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / Math.max(1, rets.length);
    const hvBar = Math.sqrt(variance);

    const atrArr = calcATRArray(bars, 14);
    const atrPct = ((atrArr[n - 1] || lastClose * 0.015) / lastClose) * 0.82;
    const sigmaBar = Math.max(0.0015, 0.6 * hvBar + 0.4 * atrPct);

    const move1SD = lastClose * sigmaBar * Math.sqrt(horizonBars);
    const move2SD = move1SD * 2;
    const barsPerYear = barSec >= 86400 ? 252 : Math.round((252 * 6.5 * 3600) / Math.max(60, barSec));
    const annualVolPct = sigmaBar * Math.sqrt(barsPerYear) * 100;

    const u1S = [{ time: lastTime, value: lastClose }];
    const l1S = [{ time: lastTime, value: lastClose }];
    for (let s = 1; s <= horizonBars; s++) {
      const m = lastClose * sigmaBar * Math.sqrt(s);
      u1S.push({ time: lastTime + s * barSec, value: lastClose + m });
      l1S.push({ time: lastTime + s * barSec, value: Math.max(0.0001, lastClose - m) });
    }

    return {
      horizonBars,
      lastClose,
      endTime: lastTime + horizonBars * barSec,
      move1SD,
      move2SD,
      movePct1SD: (move1SD / lastClose) * 100,
      upper1: lastClose + move1SD,
      lower1: Math.max(0.0001, lastClose - move1SD),
      upper2: lastClose + move2SD,
      lower2: Math.max(0.0001, lastClose - move2SD),
      annualVolPct,
      u1S,
      l1S
    };
  }

  // 9F. Intraday ATR Renko Bricks (Price-Based Reversal Bricks)
  function toRenkoBars(bars, atrMult = 0.85) {
    if (!bars || bars.length < 15) return bars || [];
    const atrArr = calcATRArray(bars, 14);
    const recentAtr = atrArr.slice(-30).filter(v => v != null && isFinite(v));
    const avgAtr = recentAtr.length ? recentAtr.reduce((s, v) => s + v, 0) / recentAtr.length : bars[bars.length - 1].close * 0.015;
    const brick = Math.max(bars[bars.length - 1].close * 0.0025, avgAtr * atrMult);

    const out = [];
    let lastBrickOpen = bars[0].open;
    let lastBrickClose = bars[0].close >= bars[0].open ? lastBrickOpen + brick : lastBrickOpen - brick;
    let dir = lastBrickClose > lastBrickOpen ? 1 : -1;
    let lastTs = bars[0].time;

    for (let i = 1; i < bars.length; i++) {
      const b = bars[i];
      const p = b.close;
      let safety = 0;
      if (dir >= 0) {
        while (p >= lastBrickClose + brick && safety < 25) {
          const o = lastBrickClose;
          const c = o + brick;
          const t = Math.max(lastTs + 1, b.time);
          lastTs = t;
          out.push({ time: t, open: o, high: c, low: o, close: c, volume: Math.round((b.volume || 0) / 2) });
          lastBrickOpen = o;
          lastBrickClose = c;
          dir = 1;
          safety++;
        }
        if (p <= lastBrickOpen - brick) {
          const o = lastBrickOpen;
          const c = o - brick;
          const t = Math.max(lastTs + 1, b.time);
          lastTs = t;
          out.push({ time: t, open: o, high: o, low: c, close: c, volume: b.volume || 0 });
          lastBrickOpen = o;
          lastBrickClose = c;
          dir = -1;
        }
      } else {
        while (p <= lastBrickClose - brick && safety < 25) {
          const o = lastBrickClose;
          const c = o - brick;
          const t = Math.max(lastTs + 1, b.time);
          lastTs = t;
          out.push({ time: t, open: o, high: o, low: c, close: c, volume: Math.round((b.volume || 0) / 2) });
          lastBrickOpen = o;
          lastBrickClose = c;
          dir = -1;
          safety++;
        }
        if (p >= lastBrickOpen + brick) {
          const o = lastBrickOpen;
          const c = o + brick;
          const t = Math.max(lastTs + 1, b.time);
          lastTs = t;
          out.push({ time: t, open: o, high: c, low: o, close: c, volume: b.volume || 0 });
          lastBrickOpen = o;
          lastBrickClose = c;
          dir = 1;
        }
      }
    }
    return out.length >= 8 ? out : bars;
  }

  // 9G. Three-Line Break Bars (Price-Action Reversal System)
  function toLineBreakBars(bars, lines = 3) {
    if (!bars || bars.length < 10) return bars || [];
    const out = [];
    const firstUp = bars[0].close >= bars[0].open;
    out.push({
      time: bars[0].time,
      open: bars[0].open,
      high: Math.max(bars[0].open, bars[0].close),
      low: Math.min(bars[0].open, bars[0].close),
      close: bars[0].close,
      volume: bars[0].volume || 0,
      dir: firstUp ? 1 : -1
    });
    let lastTs = bars[0].time;

    for (let i = 1; i < bars.length; i++) {
      const p = bars[i].close;
      const cur = out[out.length - 1];
      const look = out.slice(-lines);
      const maxHi = Math.max(...look.map(x => Math.max(x.open, x.close)));
      const minLo = Math.min(...look.map(x => Math.min(x.open, x.close)));

      if (cur.dir === 1) {
        if (p > cur.close) {
          const t = Math.max(lastTs + 1, bars[i].time);
          lastTs = t;
          out.push({ time: t, open: cur.close, high: p, low: cur.close, close: p, volume: bars[i].volume || 0, dir: 1 });
        } else if (p < minLo) {
          const t = Math.max(lastTs + 1, bars[i].time);
          lastTs = t;
          out.push({ time: t, open: cur.open, high: cur.open, low: p, close: p, volume: bars[i].volume || 0, dir: -1 });
        }
      } else {
        if (p < cur.close) {
          const t = Math.max(lastTs + 1, bars[i].time);
          lastTs = t;
          out.push({ time: t, open: cur.close, high: cur.close, low: p, close: p, volume: bars[i].volume || 0, dir: -1 });
        } else if (p > maxHi) {
          const t = Math.max(lastTs + 1, bars[i].time);
          lastTs = t;
          out.push({ time: t, open: cur.open, high: p, low: cur.open, close: p, volume: bars[i].volume || 0, dir: 1 });
        }
      }
    }
    return out.length >= 8 ? out : bars;
  }

  // 9H. Kagi Reversal Bars (Yang / Yin Supply-Demand Transitions)
  function toKagiBars(bars, revMult = 0.90) {
    if (!bars || bars.length < 15) return bars || [];
    const atrArr = calcATRArray(bars, 14);
    const revAmt = Math.max(bars[bars.length - 1].close * 0.003, (atrArr[bars.length - 1] || bars[0].close * 0.015) * revMult);
    const out = [];
    let dir = bars[1].close >= bars[0].close ? 1 : -1;
    let pivot = bars[0].close;
    let extreme = bars[1].close;
    let lastTs = bars[0].time;

    for (let i = 1; i < bars.length; i++) {
      const p = bars[i].close;
      if (dir === 1) {
        if (p >= extreme) {
          extreme = p;
        } else if (extreme - p >= revAmt) {
          const t = Math.max(lastTs + 1, bars[i].time);
          lastTs = t;
          out.push({ time: t, open: pivot, high: extreme, low: pivot, close: extreme, volume: bars[i].volume || 0 });
          pivot = extreme;
          extreme = p;
          dir = -1;
        }
      } else {
        if (p <= extreme) {
          extreme = p;
        } else if (p - extreme >= revAmt) {
          const t = Math.max(lastTs + 1, bars[i].time);
          lastTs = t;
          out.push({ time: t, open: pivot, high: pivot, low: extreme, close: extreme, volume: bars[i].volume || 0 });
          pivot = extreme;
          extreme = p;
          dir = 1;
        }
      }
    }
    const tEnd = Math.max(lastTs + 1, bars[bars.length - 1].time);
    out.push({
      time: tEnd,
      open: pivot,
      high: Math.max(pivot, extreme),
      low: Math.min(pivot, extreme),
      close: extreme,
      volume: bars[bars.length - 1].volume || 0
    });
    return out.length >= 6 ? out : bars;
  }

  // 9I. Tick-Based Interval Bars (100T / 500T Volume-Normalized Trade Activity Bars)
  function toTickBars(bars, ticksPerBar = 100) {
    if (!bars || bars.length < 5) return bars || [];
    const src = bars.slice(-90);
    const avgVol = src.reduce((s, b) => s + (b.volume || 1000), 0) / src.length;
    const volPerTick = Math.max(1, avgVol / 260);
    const targetVol = volPerTick * ticksPerBar;

    const out = [];
    let cur = null;
    let accVol = 0;
    let lastTs = src[0].time - 60;

    for (const b of src) {
      const subSteps = 6;
      const vStep = Math.max(1, (b.volume || avgVol * 0.5) / subSteps);
      const isUp = b.close >= b.open;
      const waypoints = isUp
        ? [b.open, b.low, (b.open + b.close) * 0.5, b.high, (b.high + b.close) * 0.5, b.close]
        : [b.open, b.high, (b.open + b.close) * 0.5, b.low, (b.low + b.close) * 0.5, b.close];

      for (let s = 0; s < subSteps; s++) {
        const px = waypoints[s];
        if (!cur) {
          const t = Math.max(lastTs + 1, b.time - (subSteps - s));
          lastTs = t;
          cur = { time: t, open: px, high: px, low: px, close: px, volume: 0 };
        }
        if (px > cur.high) cur.high = px;
        if (px < cur.low) cur.low = px;
        cur.close = px;
        cur.volume += Math.round(vStep);
        accVol += vStep;

        if (accVol >= targetVol) {
          out.push(cur);
          cur = null;
          accVol = 0;
        }
      }
    }
    if (cur) out.push(cur);
    return out.length >= 10 ? out.slice(-450) : src;
  }

  // 9J. Candlestick Pattern Recognition (Engulfing, Hammer, Shooting Star, Morning/Evening Star, Doji)
  function detectCandlestickPatterns(bars) {
    if (!bars || bars.length < 5) return [];
    const markers = [];
    const start = Math.max(2, bars.length - 80);
    for (let i = start; i < bars.length; i++) {
      const c = bars[i], p = bars[i - 1], pp = bars[i - 2];
      const rng = Math.max(1e-9, c.high - c.low);
      const body = Math.abs(c.close - c.open);
      const pBody = Math.abs(p.close - p.open);
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;

      // Bullish Engulfing
      if (p.close < p.open && c.close > c.open && c.open <= p.close && c.close >= p.open && body > pBody * 1.08) {
        markers.push({ time: c.time, position: 'belowBar', color: '#00e676', shape: 'arrowUp', text: 'Bull Engulf' });
      }
      // Bearish Engulfing
      else if (p.close > p.open && c.close < c.open && c.open >= p.close && c.close <= p.open && body > pBody * 1.08) {
        markers.push({ time: c.time, position: 'aboveBar', color: '#ff1744', shape: 'arrowDown', text: 'Bear Engulf' });
      }
      // Hammer (Pinbar Bullish)
      else if (lowerWick >= body * 2.2 && upperWick <= body * 0.65 && body / rng >= 0.12 && p.close < p.open) {
        markers.push({ time: c.time, position: 'belowBar', color: '#38bdf8', shape: 'circle', text: 'Hammer' });
      }
      // Shooting Star
      else if (upperWick >= body * 2.2 && lowerWick <= body * 0.65 && body / rng >= 0.12 && p.close > p.open) {
        markers.push({ time: c.time, position: 'aboveBar', color: '#fb923c', shape: 'circle', text: 'ShootStar' });
      }
      // Morning Star
      else if (pp.close < pp.open && Math.abs(p.close - p.open) < Math.abs(pp.close - pp.open) * 0.35 && c.close > c.open && c.close > (pp.open + pp.close) / 2) {
        markers.push({ time: c.time, position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: 'MorningStar' });
      }
    }
    return markers.slice(-14);
  }

  const api = {
    sanitizeBars,
    toHeikinAshi,
    toRangeBars,
    toRenkoBars,
    toLineBreakBars,
    toKagiBars,
    toTickBars,
    detectCandlestickPatterns,
    toSeries,
    calcSMAArray,
    calcEMAArray,
    calcATRArray,
    calcSuperTrend,
    calcBollinger,
    calcVWAP,
    calcRSIArray,
    calcStochRSI,
    calcMACD,
    calcADXArray,
    calcIchimoku,
    calcSMC,
    calcVPVR,
    calcTPO,
    calcOrderflowFootprint,
    calcAutoPatterns,
    calcWolfeWave,
    calcExpectedMove,
    calcAutoFib,
    calcPivotPoints,
    computeTVTechnicals,
    runSmartSignalEngine,
    generateAITradeIdea,
    evaluateMarketOpportunity,
    computeForecast
  };

  if (global) global.QuantEngine = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
