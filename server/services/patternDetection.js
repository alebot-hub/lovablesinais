/**
 * PatternDetectionService — versão estável e simples
 * - Sem bind/lock
 * - Sem validações que lancem exceção
 * - Todos os métodos existem no protótipo
 */

const PDS_VERSION = 'v1-stable';

class PatternDetectionService {
  constructor(config = {}) {
    this.config = {
      minDataLength: 20,
      breakoutVolumeThreshold: 1.5,
      tolerance: 0.02,
      candlestickTolerance: 0.001,
      debug: true,
      volatilityAdjustment: true,
      minSeparation: 3,
      regressionMinR2: 0.3,
      ...config
    };

    const fileId = (typeof __filename !== 'undefined')
      ? __filename
      : (typeof import !== 'undefined' && import.meta && import.meta.url ? import.meta.url : 'unknown');

    this.log(`🔧 PatternDetectionService ${PDS_VERSION} @ ${fileId}`);
  }

  log(msg, ...args) {
    if (this.config.debug) console.log(msg, ...args);
  }

  // ========== PONTO ÚNICO DE ENTRADA ==========
  detectPatterns(data) {
    try {
      // validação mínima
      const ok = this.#isValidInput(data);
      if (!ok) return this.getEmptyPatterns();

      // ajuste de tolerância por volatilidade
      if (this.config.volatilityAdjustment) {
        this.adjustToleranceForVolatility(data);
      }

      const windowSize = this.config.minDataLength;
      const recent = {
        open: data.open.slice(-windowSize),
        high: data.high.slice(-windowSize),
        low: data.low.slice(-windowSize),
        close: data.close.slice(-windowSize),
        volume: Array.isArray(data.volume) && data.volume.length === data.close.length
          ? data.volume.slice(-windowSize)
          : Array(windowSize).fill(1)
      };

      const resistance = Math.max(...recent.high);
      const support = Math.min(...recent.low);

      const patterns = {
        support,
        resistance,
        breakout: this.detectBreakout(recent, support, resistance),
        triangle: this.detectTriangles(recent),
        flag: this.detectFlags(recent),
        wedge: this.detectWedges(recent),
        double: this.detectDoublePatterns(recent, support, resistance),
        headShoulders: this.detectHeadShoulders(recent),
        candlestick: this.detectCandlestickPatterns(recent) || []
      };

      this.log('✅ Detecção concluída');
      return patterns;
    } catch (e) {
      console.error('❌ Erro ao detectar padrões:', e?.message);
      return this.getEmptyPatterns();
    }
  }

  // ========== CANDLESTICKS ==========
  detectCandlestickPatterns(data) {
    try {
      const pats = [];
      const n = data.close.length;
      if (n < 2) return pats;

      const i = n - 1;
      const cur = { open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i] };
      const prev = { open: data.open[i - 1], high: data.high[i - 1], low: data.low[i - 1], close: data.close[i - 1] };

      if (!this.isValidCandle(cur) || !this.isValidCandle(prev)) return pats;

      const prevTrend = this.calculatePreviousTrend(data);

      // Doji
      const dojiTol = cur.close * this.config.candlestickTolerance;
      if (Math.abs(cur.open - cur.close) < dojiTol) {
        pats.push({ type: 'DOJI', bias: 'NEUTRAL', confidence: 70 });
      }

      // Engolfo bullish
      if (prev.close < prev.open && cur.close > cur.open && cur.open <= prev.close && cur.close >= prev.open) {
        pats.push({ type: 'BULLISH_ENGULFING', bias: 'BULLISH', confidence: this.calculateDynamicConfidence(80, cur, prevTrend, 'BULLISH') });
      }

      // Engolfo bearish
      if (prev.close > prev.open && cur.close < cur.open && cur.open >= prev.close && cur.close <= prev.open) {
        pats.push({ type: 'BEARISH_ENGULFING', bias: 'BEARISH', confidence: this.calculateDynamicConfidence(80, cur, prevTrend, 'BEARISH') });
      }

      // Martelo / Enforcado simples
      const body = Math.abs(cur.close - cur.open);
      const lower = Math.min(cur.open, cur.close) - cur.low;
      const upper = cur.high - Math.max(cur.open, cur.close);

      if (lower > body * 2 && upper < body * 0.5) {
        pats.push({ type: 'HAMMER', bias: 'BULLISH', confidence: this.calculateDynamicConfidence(75, cur, prevTrend, 'BULLISH') });
      }
      if (upper > body * 2 && lower < body * 0.5) {
        pats.push({ type: 'HANGING_MAN', bias: 'BEARISH', confidence: this.calculateDynamicConfidence(75, cur, prevTrend, 'BEARISH') });
      }

      return pats;
    } catch (e) {
      console.error('❌ Erro candlestick:', e?.message);
      return [];
    }
  }

  // ========== PADRÕES CLÁSSICOS ==========
  detectBreakout(data, support, resistance) {
    try {
      const cp = data.close.at(-1);
      const pp = data.close.at(-2);

      const volArr = data.volume && data.volume.length === data.close.length ? data.volume : Array(data.close.length).fill(1);
      const v = volArr.at(-1);
      const vAvg = volArr.reduce((a, b) => a + b, 0) / volArr.length;

      if (cp > resistance && pp <= resistance && v > vAvg * this.config.breakoutVolumeThreshold) {
        return { type: 'BULLISH_BREAKOUT', level: resistance, strength: 'HIGH', confidence: 85, volumeConfirmation: true };
      }
      if (cp < support && pp >= support && v > vAvg * this.config.breakoutVolumeThreshold) {
        return { type: 'BEARISH_BREAKOUT', level: support, strength: 'HIGH', confidence: 85, volumeConfirmation: true };
      }
      return null;
    } catch {
      return null;
    }
  }

  detectTriangles(data) {
    try {
      const w = Math.min(10, data.high.length);
      const highs = data.high.slice(-w);
      const lows = data.low.slice(-w);

      const rHigh = this.calculateLinearRegression(highs);
      const rLow = this.calculateLinearRegression(lows);

      if (Math.abs(rHigh.slope) < this.config.tolerance && rHigh.r2 > this.config.regressionMinR2 &&
          rLow.slope > this.config.tolerance && rLow.r2 > this.config.regressionMinR2) {
        return { type: 'ASCENDING_TRIANGLE', bias: 'BULLISH', confidence: 70 };
      }

      if (Math.abs(rLow.slope) < this.config.tolerance && rLow.r2 > this.config.regressionMinR2 &&
          rHigh.slope < -this.config.tolerance && rHigh.r2 > this.config.regressionMinR2) {
        return { type: 'DESCENDING_TRIANGLE', bias: 'BEARISH', confidence: 70 };
      }

      return null;
    } catch {
      return null;
    }
  }

  detectFlags(data) {
    try {
      const p = data.close;
      if (p.length < 6) return null;
      const last = p.length - 1;
      const mid = Math.floor(p.length / 2);
      const q = Math.floor(p.length * 0.75);

      const strongMove = Math.abs(p[last] - p[mid]) > p[mid] * 0.05;
      const consolidation = Math.abs(p[last] - p[q]) < p[q] * 0.02;

      if (strongMove && consolidation) {
        const dir = p[last] > p[mid] ? 'BULLISH' : 'BEARISH';
        return { type: `${dir}_FLAG`, strength: 'MEDIUM', confidence: 65 };
      }
      return null;
    } catch {
      return null;
    }
  }

  detectWedges(data) {
    try {
      const w = Math.min(10, data.high.length);
      const highs = data.high.slice(-w);
      const lows = data.low.slice(-w);

      const rH = this.calculateLinearRegression(highs);
      const rL = this.calculateLinearRegression(lows);

      const converging = Math.abs(rH.slope - rL.slope) > this.config.tolerance;

      if (rH.slope > 0 && rL.slope > 0 && converging && rH.slope < rL.slope) {
        return { type: 'RISING_WEDGE', bias: 'BEARISH', confidence: 60 };
      }
      if (rH.slope < 0 && rL.slope < 0 && converging && rH.slope > rL.slope) {
        return { type: 'FALLING_WEDGE', bias: 'BULLISH', confidence: 60 };
      }
      return null;
    } catch {
      return null;
    }
  }

  detectDoublePatterns(data, support, resistance) {
    try {
      const highs = data.high;
      const lows = data.low;
      const tolRes = resistance * this.config.tolerance;
      const tolSup = support * this.config.tolerance;

      const resHits = [];
      for (let i = 0; i < highs.length; i++) if (Math.abs(highs[i] - resistance) < tolRes) resHits.push(i);
      if (resHits.length >= 2 && (resHits.at(-1) - resHits[0]) >= this.config.minSeparation) {
        return { type: 'DOUBLE_TOP', level: resistance, bias: 'BEARISH', confidence: 75 };
      }

      const supHits = [];
      for (let i = 0; i < lows.length; i++) if (Math.abs(lows[i] - support) < tolSup) supHits.push(i);
      if (supHits.length >= 2 && (supHits.at(-1) - supHits[0]) >= this.config.minSeparation) {
        return { type: 'DOUBLE_BOTTOM', level: support, bias: 'BULLISH', confidence: 75 };
      }

      return null;
    } catch {
      return null;
    }
  }

  detectHeadShoulders(data) {
    try {
      const minLen = 7;
      if (data.high.length < minLen || data.low.length < minLen) return null;

      const h = data.high.slice(-minLen);
      const l = data.low.slice(-minLen);

      const ls = h[1], head = h[3], rs = h[5];
      const neckline = Math.min(l[2], l[4]);

      const tol = ls * this.config.tolerance;

      if (head > ls && head > rs && Math.abs(ls - rs) < tol) {
        return {
          type: 'HEAD_AND_SHOULDERS',
          neckline,
          bias: 'BEARISH',
          target: neckline - (head - neckline),
          confidence: 80
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // ========== SUPORTE ==========

  isValidCandle(c) {
    return c &&
      typeof c.open === 'number' && isFinite(c.open) && c.open > 0 &&
      typeof c.high === 'number' && isFinite(c.high) && c.high > 0 &&
      typeof c.low === 'number' && isFinite(c.low) && c.low > 0 &&
      typeof c.close === 'number' && isFinite(c.close) && c.close > 0 &&
      c.high >= c.low &&
      c.high >= Math.max(c.open, c.close) &&
      c.low <= Math.min(c.open, c.close);
  }

  getEmptyPatterns() {
    return {
      support: 0,
      resistance: 0,
      breakout: null,
      triangle: null,
      flag: null,
      wedge: null,
      double: null,
      headShoulders: null,
      candlestick: []
    };
  }

  calculatePreviousTrend(data) {
    try {
      const win = Math.min(5, data.close.length - 1);
      if (win < 2) return 'NEUTRAL';
      const prices = data.close.slice(-win - 1, -1);
      let up = 0, down = 0;
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > prices[i - 1]) up++;
        else if (prices[i] < prices[i - 1]) down++;
      }
      if (up > down) return 'BULLISH';
      if (down > up) return 'BEARISH';
      return 'NEUTRAL';
    } catch {
      return 'NEUTRAL';
    }
  }

  calculateDynamicConfidence(base, candle, prevTrend, expected = null) {
    try {
      let conf = base;
      const body = Math.abs(candle.close - candle.open);
      const range = candle.high - candle.low;
      const ratio = range > 0 ? body / range : 0;

      if (ratio > 0.7) conf += 5;
      else if (ratio < 0.3) conf -= 5;

      if (expected && prevTrend !== 'NEUTRAL') {
        if ((expected === 'BULLISH' && prevTrend === 'BEARISH') ||
            (expected === 'BEARISH' && prevTrend === 'BULLISH')) conf += 10;
      }

      return Math.max(50, Math.min(95, conf));
    } catch {
      return base;
    }
  }

  calculateVolatility(prices) {
    try {
      if (!Array.isArray(prices) || prices.length < 2) return 0;
      const rets = [];
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
      const varc = rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (rets.length || 1);
      return Math.sqrt(varc);
    } catch {
      return 0;
    }
  }

  adjustToleranceForVolatility(data) {
    const vol = this.calculateVolatility(data.close);
    if (vol > 0.05) this.config.tolerance = 0.03;
    else if (vol < 0.01) this.config.tolerance = 0.01;
    else this.config.tolerance = 0.02;
    this.log(`📊 Tolerância ${ (this.config.tolerance*100).toFixed(1) }% (vol: ${(vol*100).toFixed(2)}%)`);
  }

  calculateLinearRegression(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return { slope: 0, intercept: 0, r2: 0 };
      const n = values.length;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = values;
      const sx = x.reduce((a,b)=>a+b,0);
      const sy = y.reduce((a,b)=>a+b,0);
      const sxy = x.reduce((s,xi,i)=>s+xi*y[i],0);
      const sxx = x.reduce((s,xi)=>s+xi*xi,0);
      const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx);
      const intercept = (sy - slope*sx) / n;
      const yMean = sy / n;
      const sst = y.reduce((s,yi)=>s+Math.pow(yi - yMean,2),0);
      const ssr = y.reduce((s,yi,i)=>s+Math.pow(yi - (slope*x[i] + intercept),2),0);
      const r2 = sst > 0 ? 1 - (ssr/sst) : 0;
      return { slope, intercept, r2 };
    } catch {
      return { slope: 0, intercept: 0, r2: 0 };
    }
  }

  isHorizontalLine(values, tol = null) {
    try {
      const t = tol ?? this.config.tolerance;
      if (!Array.isArray(values) || values.length < 2) return false;
      const r = this.calculateLinearRegression(values);
      return Math.abs(r.slope) < t && r.r2 > this.config.regressionMinR2;
    } catch { return false; }
  }

  isRisingLine(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      const r = this.calculateLinearRegression(values);
      return r.slope > this.config.tolerance && r.r2 > this.config.regressionMinR2;
    } catch { return false; }
  }

  isFallingLine(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      const r = this.calculateLinearRegression(values);
      return r.slope < -this.config.tolerance && r.r2 > this.config.regressionMinR2;
    } catch { return false; }
  }

  getPatternStats(patterns) {
    try {
      const stats = {
        totalPatterns: 0,
        bullishPatterns: 0,
        bearishPatterns: 0,
        neutralPatterns: 0,
        highConfidencePatterns: 0,
        patternTypes: {}
      };

      const acc = (p) => {
        stats.totalPatterns++;
        if (p.bias === 'BULLISH') stats.bullishPatterns++;
        else if (p.bias === 'BEARISH') stats.bearishPatterns++;
        else stats.neutralPatterns++;
        if (p.confidence >= 80) stats.highConfidencePatterns++;
        if (p.type) stats.patternTypes[p.type] = (stats.patternTypes[p.type] || 0) + 1;
      };

      for (const key of Object.keys(patterns || {})) {
        const val = patterns[key];
        if (!val) continue;
        if (Array.isArray(val)) val.forEach(acc);
        else if (typeof val === 'object' && val.type) acc(val);
      }

      return stats;
    } catch (e) {
      console.error('Erro em getPatternStats:', e?.message);
      return {
        totalPatterns: 0,
        bullishPatterns: 0,
        bearishPatterns: 0,
        neutralPatterns: 0,
        highConfidencePatterns: 0,
        patternTypes: {}
      };
    }
  }

  // ===== interno =====
  #isValidInput(data) {
    try {
      const arrs = ['open','high','low','close'];
      for (const k of arrs) {
        if (!Array.isArray(data?.[k]) || data[k].length < this.config.minDataLength) {
          console.warn(`⚠️ ${k} inválido ou insuficiente`);
          return false;
        }
        if (data[k].some(v => typeof v !== 'number' || !isFinite(v) || v <= 0)) {
          console.warn(`⚠️ ${k} contém valores inválidos`);
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

export default PatternDetectionService;
