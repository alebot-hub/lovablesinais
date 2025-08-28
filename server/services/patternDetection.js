/**
 * PatternDetectionService — v3.2 (proto-safe + bind-lock)
 * Corrige:
 *  - "Método ausente no protótipo: detectHeadShoulders"
 *  - "this.detectCandlestickPatterns is not a function"
 */

class PatternDetectionService {
  constructor(config = {}) {
    this.config = Object.assign(
      {
        minDataLength: 20,
        breakoutVolumeThreshold: 1.5,
        tolerance: 0.02,
        candlestickTolerance: 0.001,
        debug: true,
        volatilityAdjustment: true,
        minSeparation: 3,
        regressionMinR2: 0.3,
      },
      config || {}
    );

    // 1) Garante que o protótipo tenha todos os métodos (stubs se faltar)
    this.ensurePrototype();

    // 2) Bind + lock na instância (impede sobrescrita acidental)
    this.lockMethods([
      'detectPatterns',
      'detectCandlestickPatterns',
      'detectBreakout',
      'detectTriangles',
      'detectFlags',
      'detectWedges',
      'detectDoublePatterns',
      'detectHeadShoulders',
      'validateInputData',
      'calculatePreviousTrend',
      'calculateDynamicConfidence',
      'isValidCandle',
      'calculateLinearRegression',
      'calculateVolatility',
      'adjustToleranceForVolatility',
      'getPatternStats',
    ]);

    if (this.config.debug) {
      console.log('🔧 PatternDetectionService v3.2 (proto-safe + bind-lock)');
    }
  }

  // ---------- Infra ----------

  log(...a) {
    if (this.config.debug) console.log(...a);
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
      candlestick: [],
    };
  }

  ensurePrototype() {
    const proto = PatternDetectionService.prototype;
    const required = [
      'detectPatterns',
      'detectCandlestickPatterns',
      'detectBreakout',
      'detectTriangles',
      'detectFlags',
      'detectWedges',
      'detectDoublePatterns',
      'detectHeadShoulders',
      'validateInputData',
      'calculatePreviousTrend',
      'calculateDynamicConfidence',
      'isValidCandle',
      'calculateLinearRegression',
      'calculateVolatility',
      'adjustToleranceForVolatility',
      'getPatternStats',
    ];

    for (const name of required) {
      if (typeof proto[name] !== 'function') {
        // Stub seguro
        proto[name] = function stub() {
          switch (name) {
            case 'detectPatterns':
              return this.getEmptyPatterns();
            case 'detectCandlestickPatterns':
              return [];
            case 'detectBreakout':
            case 'detectTriangles':
            case 'detectFlags':
            case 'detectWedges':
            case 'detectDoublePatterns':
            case 'detectHeadShoulders':
              return null;
            case 'validateInputData':
              return { isValid: false, reason: 'stub' };
            case 'getPatternStats':
              return {
                totalPatterns: 0,
                bullishPatterns: 0,
                bearishPatterns: 0,
                neutralPatterns: 0,
                highConfidencePatterns: 0,
                patternTypes: {},
              };
            default:
              return null;
          }
        };
        console.warn(`⚠️ [PDS] método ausente no protótipo foi criado como stub: ${name}`);
      }
    }
  }

  lockMethods(names) {
    for (const name of names) {
      const fn = PatternDetectionService.prototype[name];
      const bound = fn.bind(this);
      Object.defineProperty(this, name, {
        value: bound,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    }
  }

  // ---------- Pipeline ----------

  detectPatterns(data) {
    try {
      this.log('🔍 Iniciando detecção de padrões...');

      const validation = PatternDetectionService.prototype.validateInputData.call(this, data);
      if (!validation.isValid) {
        console.warn('⚠️ Dados inválidos:', validation.reason);
        return this.getEmptyPatterns();
      }

      if (this.config.volatilityAdjustment) {
        PatternDetectionService.prototype.adjustToleranceForVolatility.call(this, data);
      }

      const win = this.config.minDataLength;
      const recentData = {
        open: data.open.slice(-win),
        high: data.high.slice(-win),
        low: data.low.slice(-win),
        close: data.close.slice(-win),
        volume: Array.isArray(data.volume) ? data.volume.slice(-win) : Array(win).fill(1),
      };

      const resistance = Math.max.apply(null, recentData.high);
      const support = Math.min.apply(null, recentData.low);

      const patterns = {
        support,
        resistance,
        breakout: PatternDetectionService.prototype.detectBreakout.call(this, recentData, support, resistance),
        triangle: PatternDetectionService.prototype.detectTriangles.call(this, recentData),
        flag: PatternDetectionService.prototype.detectFlags.call(this, recentData),
        wedge: PatternDetectionService.prototype.detectWedges.call(this, recentData),
        double: PatternDetectionService.prototype.detectDoublePatterns.call(this, recentData, support, resistance),
        headShoulders: PatternDetectionService.prototype.detectHeadShoulders.call(this, recentData),
        candlestick: [],
      };

      try {
        // proto-call (não depende de this.detectCandlestickPatterns)
        patterns.candlestick =
          PatternDetectionService.prototype.detectCandlestickPatterns.call(this, recentData) || [];
      } catch (e) {
        console.error('❌ Erro em candlestick:', e?.message);
        patterns.candlestick = [];
      }

      this.log('✅ Detecção concluída');
      return patterns;
    } catch (e) {
      console.error('❌ Erro ao detectar padrões:', e?.message);
      return this.getEmptyPatterns();
    }
  }

  // ---------- Validações / auxiliares ----------

  validateInputData(data) {
    if (!data) return { isValid: false, reason: 'dados ausentes' };
    const req = ['open', 'high', 'low', 'close'];
    const min = this.config.minDataLength;

    for (const k of req) {
      if (!Array.isArray(data[k])) return { isValid: false, reason: `${k} não é array` };
      if (data[k].length < min) return { isValid: false, reason: `${k} < ${min}` };
      if (data[k].some((v) => typeof v !== 'number' || !isFinite(v) || v <= 0)) {
        return { isValid: false, reason: `${k} possui valores inválidos` };
      }
    }

    const n = data.close.length;
    const idxs = [0, 1, 2, n - 3, n - 2, n - 1].filter((i) => i >= 0 && i < n);
    for (const i of idxs) {
      const c = { open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i] };
      if (!PatternDetectionService.prototype.isValidCandle.call(this, c)) {
        return { isValid: false, reason: `OHLC inconsistente @ ${i}` };
      }
    }
    return { isValid: true };
  }

  isValidCandle(c) {
    return (
      c &&
      typeof c.open === 'number' &&
      typeof c.high === 'number' &&
      typeof c.low === 'number' &&
      typeof c.close === 'number' &&
      isFinite(c.open) &&
      isFinite(c.high) &&
      isFinite(c.low) &&
      isFinite(c.close) &&
      c.open > 0 &&
      c.high > 0 &&
      c.low > 0 &&
      c.close > 0 &&
      c.high >= Math.max(c.open, c.close) &&
      c.low <= Math.min(c.open, c.close) &&
      c.high >= c.low
    );
  }

  calculatePreviousTrend(data) {
    const len = data.close.length;
    const w = Math.min(5, len - 1);
    if (w < 2) return 'NEUTRAL';
    const prices = data.close.slice(-w - 1, -1);
    let up = 0,
      down = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) up++;
      else if (prices[i] < prices[i - 1]) down++;
    }
    if (up > down) return 'BULLISH';
    if (down > up) return 'BEARISH';
    return 'NEUTRAL';
  }

  calculateDynamicConfidence(base, candle, prevTrend, expectedBias = null) {
    let conf = base;
    const body = Math.abs(candle.close - candle.open);
    const range = Math.max(1e-12, candle.high - candle.low);
    const ratio = body / range;
    if (ratio > 0.7) conf += 5;
    else if (ratio < 0.3) conf -= 5;

    if (expectedBias && prevTrend !== 'NEUTRAL') {
      if (
        (expectedBias === 'BULLISH' && prevTrend === 'BEARISH') ||
        (expectedBias === 'BEARISH' && prevTrend === 'BULLISH')
      ) {
        conf += 10;
      }
    }
    return Math.max(50, Math.min(95, conf));
  }

  calculateLinearRegression(values) {
    if (!Array.isArray(values) || values.length < 2) return { slope: 0, intercept: 0, r2: 0 };
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
    const sumXX = x.reduce((s, xi) => s + xi * xi, 0);
    const denom = n * sumXX - sumX * sumX || 1e-12;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const mean = sumY / n;
    const ssTot = y.reduce((s, yi) => s + (yi - mean) ** 2, 0);
    const ssRes = y.reduce((s, yi, i) => s + (yi - (slope * x[i] + intercept)) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return { slope, intercept, r2 };
  }

  calculateVolatility(prices) {
    if (!Array.isArray(prices) || prices.length < 2) return 0;
    const rets = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      if (prev > 0) rets.push((prices[i] - prev) / prev);
    }
    if (!rets.length) return 0;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const varc = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
    return Math.sqrt(varc);
  }

  adjustToleranceForVolatility(data) {
    const vol = PatternDetectionService.prototype.calculateVolatility.call(this, data.close);
    if (vol > 0.05) this.config.tolerance = 0.03;
    else if (vol < 0.01) this.config.tolerance = 0.01;
    else this.config.tolerance = 0.02;
    this.log(`📊 Tolerância ${((this.config.tolerance || 0) * 100).toFixed(1)}% (vol: ${(vol * 100).toFixed(2)}%)`);
  }

  // ---------- Detectores ----------

  detectBreakout(data, support, resistance) {
    const n = data.close.length;
    const c = data.close[n - 1];
    const p = data.close[n - 2];
    const volArr =
      Array.isArray(data.volume) && data.volume.length === data.close.length
        ? data.volume
        : Array(data.close.length).fill(1);
    const v = volArr[n - 1];
    const vAvg = volArr.reduce((a, b) => a + b, 0) / volArr.length;

    if (c > resistance && p <= resistance && v > vAvg * this.config.breakoutVolumeThreshold) {
      return { type: 'BULLISH_BREAKOUT', level: resistance, strength: 'HIGH', confidence: 85, volumeConfirmation: true };
    }
    if (c < support && p >= support && v > vAvg * this.config.breakoutVolumeThreshold) {
      return { type: 'BEARISH_BREAKOUT', level: support, strength: 'HIGH', confidence: 85, volumeConfirmation: true };
    }
    return null;
  }

  detectTriangles(data) {
    const w = Math.min(10, data.high.length);
    const highs = data.high.slice(-w);
    const lows = data.low.slice(-w);
    const r = PatternDetectionService.prototype.calculateLinearRegression.call(this, highs);
    const s = PatternDetectionService.prototype.calculateLinearRegression.call(this, lows);

    if (Math.abs(r.slope) < this.config.tolerance && r.r2 > this.config.regressionMinR2 && s.slope > this.config.tolerance && s.r2 > this.config.regressionMinR2) {
      return { type: 'ASCENDING_TRIANGLE', bias: 'BULLISH', confidence: 70 };
    }
    if (Math.abs(s.slope) < this.config.tolerance && s.r2 > this.config.regressionMinR2 && r.slope < -this.config.tolerance && r.r2 > this.config.regressionMinR2) {
      return { type: 'DESCENDING_TRIANGLE', bias: 'BEARISH', confidence: 70 };
    }
    return null;
  }

  detectFlags(data) {
    const prices = data.close;
    const n = prices.length - 1;
    const mid = Math.floor(prices.length / 2);
    const q = Math.floor(prices.length * 0.75);
    const strong = Math.abs(prices[n] - prices[mid]) > prices[mid] * 0.05;
    const cons = Math.abs(prices[n] - prices[q]) < prices[q] * 0.02;
    if (strong && cons) {
      const dir = prices[n] > prices[mid] ? 'BULLISH' : 'BEARISH';
      return { type: `${dir}_FLAG`, strength: 'MEDIUM', confidence: 65 };
    }
    return null;
  }

  detectWedges(data) {
    const w = Math.min(10, data.high.length);
    const highs = data.high.slice(-w);
    const lows = data.low.slice(-w);
    const hr = PatternDetectionService.prototype.calculateLinearRegression.call(this, highs);
    const lr = PatternDetectionService.prototype.calculateLinearRegression.call(this, lows);
    const hs = hr.slope,
      ls = lr.slope;
    const conv = Math.abs(hs - ls) > this.config.tolerance;

    if (hs > 0 && ls > 0 && conv && hs < ls) {
      return { type: 'RISING_WEDGE', bias: 'BEARISH', confidence: 60 };
    }
    if (hs < 0 && ls < 0 && conv && hs > ls) {
      return { type: 'FALLING_WEDGE', bias: 'BULLISH', confidence: 60 };
    }
    return null;
  }

  detectDoublePatterns(data, support, resistance) {
    const highs = data.high;
    const lows = data.low;
    const tol = resistance * this.config.tolerance;

    const rHits = [];
    for (let i = 0; i < highs.length; i++) if (Math.abs(highs[i] - resistance) < tol) rHits.push(i);
    if (rHits.length >= 2 && rHits[rHits.length - 1] - rHits[0] >= this.config.minSeparation) {
      return { type: 'DOUBLE_TOP', level: resistance, bias: 'BEARISH', confidence: 75 };
    }

    const sHits = [];
    for (let i = 0; i < lows.length; i++) if (Math.abs(lows[i] - support) < support * this.config.tolerance) sHits.push(i);
    if (sHits.length >= 2 && sHits[sHits.length - 1] - sHits[0] >= this.config.minSeparation) {
      return { type: 'DOUBLE_BOTTOM', level: support, bias: 'BULLISH', confidence: 75 };
    }
    return null;
  }

  detectHeadShoulders(data) {
    const min = 7;
    if (data.high.length < min || data.low.length < min) return null;
    const h = data.high.slice(-min);
    const l = data.low.slice(-min);
    const ls = h[1],
      hd = h[3],
      rs = h[5];
    const neck = Math.min(l[2], l[4]);
    const tol = ls * this.config.tolerance;

    if (hd > ls && hd > rs && Math.abs(ls - rs) < tol) {
      return {
        type: 'HEAD_AND_SHOULDERS',
        neckline: neck,
        bias: 'BEARISH',
        confidence: 80,
      };
    }
    return null;
  }

  detectCandlestickPatterns(data) {
    const out = [];
    const i = data.close.length - 1;
    if (i < 1) return out;

    const cur = { open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i] };
    const prev = { open: data.open[i - 1], high: data.high[i - 1], low: data.low[i - 1], close: data.close[i - 1] };
    if (!PatternDetectionService.prototype.isValidCandle.call(this, cur) || !PatternDetectionService.prototype.isValidCandle.call(this, prev)) {
      return out;
    }

    const prevTrend = PatternDetectionService.prototype.calculatePreviousTrend.call(this, data);

    // Doji
    if (Math.abs(cur.open - cur.close) < cur.close * (this.config.candlestickTolerance || 0.001)) {
      out.push({ type: 'DOJI', bias: 'NEUTRAL', confidence: 70 });
    }

    // Engolfo
    if (prev.close < prev.open && cur.close > cur.open && cur.open < prev.close && cur.close > prev.open) {
      out.push({
        type: 'BULLISH_ENGULFING',
        bias: 'BULLISH',
        confidence: PatternDetectionService.prototype.calculateDynamicConfidence.call(this, 80, cur, prevTrend, 'BULLISH'),
      });
    }
    if (prev.close > prev.open && cur.close < cur.open && cur.open > prev.close && cur.close < prev.open) {
      out.push({
        type: 'BEARISH_ENGULFING',
        bias: 'BEARISH',
        confidence: PatternDetectionService.prototype.calculateDynamicConfidence.call(this, 80, cur, prevTrend, 'BEARISH'),
      });
    }

    // Hammer / Hanging Man
    const body = Math.abs(cur.close - cur.open);
    const lower = Math.min(cur.open, cur.close) - cur.low;
    const upper = cur.high - Math.max(cur.open, cur.close);

    if (lower > body * 2 && upper < body * 0.5) {
      out.push({
        type: 'HAMMER',
        bias: 'BULLISH',
        confidence: PatternDetectionService.prototype.calculateDynamicConfidence.call(this, 75, cur, prevTrend, 'BULLISH'),
      });
    }
    if (upper > body * 2 && lower < body * 0.5) {
      out.push({
        type: 'HANGING_MAN',
        bias: 'BEARISH',
        confidence: PatternDetectionService.prototype.calculateDynamicConfidence.call(this, 75, cur, prevTrend, 'BEARISH'),
      });
    }

    return out;
  }

  // ---------- Estatísticas ----------

  getPatternStats(patterns) {
    const stats = {
      totalPatterns: 0,
      bullishPatterns: 0,
      bearishPatterns: 0,
      neutralPatterns: 0,
      highConfidencePatterns: 0,
      patternTypes: {},
    };

    const add = (p) => {
      stats.totalPatterns++;
      if (p.bias === 'BULLISH') stats.bullishPatterns++;
      else if (p.bias === 'BEARISH') stats.bearishPatterns++;
      else stats.neutralPatterns++;
      if (p.confidence >= 80) stats.highConfidencePatterns++;
      if (p.type) stats.patternTypes[p.type] = (stats.patternTypes[p.type] || 0) + 1;
    };

    if (patterns) {
      for (const k of Object.keys(patterns)) {
        const v = patterns[k];
        if (!v) continue;
        if (Array.isArray(v)) v.forEach(add);
        else if (typeof v === 'object' && v.type) add(v);
      }
    }
    return stats;
  }
}

export default PatternDetectionService;
