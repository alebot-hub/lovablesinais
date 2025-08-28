/**
 * Serviço de detecção de padrões gráficos - Versão Blindada (v2.3-proto-call-safe)
 * - Evita "this.detectCandlestickPatterns is not a function" chamando via protótipo
 * - Não derruba o processo se algum método faltar: cria stubs seguros e avisa
 */

const PDS_VERSION = 'v2.3-proto-call-safe';

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
        regressionMinR2: 0.3
      },
      config || {}
    );

    const FILE_ID = typeof __filename !== 'undefined' ? __filename : 'unknown';
    this.log(`🔧 PatternDetectionService ${PDS_VERSION} @ ${FILE_ID}`);

    // Garante que o protótipo tem todos os métodos essenciais (senão cria stubs)
    this.ensurePrototypeMethods();

    // Evita que novas props sejam adicionadas e sobrescrevam métodos por engano
    try { Object.preventExtensions(this); } catch {}

    this.log('✅ Inicialização concluída');
  }

  // -------------------- Infra --------------------

  log(message, ...args) {
    if (this.config.debug) console.log(message, ...args);
  }

  warn(message, ...args) {
    console.warn(message, ...args);
  }

  ensurePrototypeMethods() {
    const mustHave = [
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
      'getEmptyPatterns',
      'calculateLinearRegression',
      'isHorizontalLine',
      'isRisingLine',
      'isFallingLine',
      'calculateVolatility',
      'adjustToleranceForVolatility',
      'getPatternStats'
    ];

    for (const name of mustHave) {
      const exists = typeof PatternDetectionService.prototype[name] === 'function';
      if (!exists) {
        this.warn(`⚠️ Método ausente no protótipo: ${name} — criando stub seguro.`);
        // Stubs seguros para não derrubar a aplicação
        if (name === 'detectCandlestickPatterns') {
          PatternDetectionService.prototype[name] = function () { return []; };
        } else if (name === 'getEmptyPatterns') {
          PatternDetectionService.prototype[name] = function () {
            return {
              support: 0, resistance: 0,
              breakout: null, triangle: null, flag: null, wedge: null,
              double: null, headShoulders: null, candlestick: []
            };
          };
        } else if (name === 'validateInputData') {
          PatternDetectionService.prototype[name] = function (data) {
            return data && data.open && data.high && data.low && data.close
              ? { isValid: true, reason: 'stub-ok' }
              : { isValid: false, reason: 'stub-invalid' };
          };
        } else {
          PatternDetectionService.prototype[name] = function () { return null; };
        }
      }
    }
  }

  // -------------------- Orquestração --------------------

  detectPatterns(data) {
    try {
      this.log('🔍 Iniciando detecção de padrões...');

      const validation = this.validateInputData(data);
      if (!validation.isValid) {
        this.warn('⚠️ Dados insuficientes para padrões:', validation.reason);
        return this.getEmptyPatterns();
      }

      if (this.config.volatilityAdjustment) this.adjustToleranceForVolatility(data);

      const windowSize = this.config.minDataLength;
      const recentData = {
        open: data.open.slice(-windowSize),
        high: data.high.slice(-windowSize),
        low: data.low.slice(-windowSize),
        close: data.close.slice(-windowSize),
        volume: Array.isArray(data.volume)
          ? data.volume.slice(-windowSize)
          : Array(windowSize).fill(1)
      };

      if (!Array.isArray(data.volume)) {
        this.warn('⚠️ Volume ausente/invalidado – usando 1 como volume padrão');
      }

      const patterns = {};

      // suporte/resistência
      const resistance = Math.max(...recentData.high);
      const support = Math.min(...recentData.low);
      patterns.support = support;
      patterns.resistance = resistance;

      // geométricos
      patterns.breakout = this.detectBreakout(recentData, support, resistance);
      patterns.triangle = this.detectTriangles(recentData);
      patterns.flag = this.detectFlags(recentData);
      patterns.wedge = this.detectWedges(recentData);
      patterns.double = this.detectDoublePatterns(recentData, support, resistance);
      patterns.headShoulders = this.detectHeadShoulders(recentData);

      // Candlestick — chama SEMPRE a implementação do protótipo (blindado)
      try {
        const protoFn = PatternDetectionService.prototype.detectCandlestickPatterns;
        patterns.candlestick = typeof protoFn === 'function'
          ? protoFn.call(this, recentData)
          : this.detectCandlestickPatternsInline(recentData);
      } catch (e) {
        console.error('❌ Candlestick (proto) falhou:', e && e.message);
        try {
          patterns.candlestick = this.detectCandlestickPatternsInline(recentData);
        } catch {
          patterns.candlestick = [];
        }
      }

      this.log('✅ Detecção concluída');
      return patterns;
    } catch (err) {
      console.error('❌ Erro ao detectar padrões:', err && err.message);
      return this.getEmptyPatterns();
    }
  }

  // -------------------- Validação de dados --------------------

  validateInputData(data) {
    if (!data) return { isValid: false, reason: 'Dados não fornecidos' };
    const req = ['open', 'high', 'low', 'close'];
    const minLen = this.config.minDataLength;

    for (const k of req) {
      if (!Array.isArray(data[k])) return { isValid: false, reason: `${k} não é array` };
      if (data[k].length < minLen)
        return { isValid: false, reason: `${k} tem ${data[k].length} (< ${minLen})` };
      const bad = data[k].filter((v) => typeof v !== 'number' || !isFinite(v) || v < 0);
      if (bad.length) return { isValid: false, reason: `${k} contém ${bad.length} inválidos` };
    }

    // checagem rápida OHLC
    const head = [0, 1, 2, 3, 4];
    const base = data.close.length;
    const tail = [base - 5, base - 4, base - 3, base - 2, base - 1];
    for (const i of head.concat(tail)) {
      if (i < 0 || i >= base) continue;
      const c = { open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i] };
      if (!this.isValidCandle(c)) return { isValid: false, reason: `OHLC inconsistente em ${i}` };
    }
    return { isValid: true, reason: 'OK' };
  }

  // -------------------- Candlestick --------------------

  detectCandlestickPatterns(data) {
    const patterns = [];
    const last = data.close.length - 1;
    if (last < 1) return patterns;

    const cur = {
      open: data.open[last],
      high: data.high[last],
      low: data.low[last],
      close: data.close[last]
    };
    const prev = {
      open: data.open[last - 1],
      high: data.high[last - 1],
      low: data.low[last - 1],
      close: data.close[last - 1]
    };
    if (!this.isValidCandle(cur) || !this.isValidCandle(prev)) return patterns;

    const prevTrend = this.calculatePreviousTrend(data);

    // Doji
    const dojiTol = cur.close * this.config.candlestickTolerance;
    if (Math.abs(cur.open - cur.close) < dojiTol) {
      const conf = this.calculateDynamicConfidence(70, cur, prevTrend);
      patterns.push({ type: 'DOJI', bias: 'NEUTRAL', confidence: conf });
    }

    // Bullish Engulfing
    if (prev.close < prev.open && cur.close > cur.open && cur.open < prev.close && cur.close > prev.open) {
      const conf = this.calculateDynamicConfidence(80, cur, prevTrend, 'BULLISH');
      patterns.push({ type: 'BULLISH_ENGULFING', bias: 'BULLISH', confidence: conf });
    }

    // Bearish Engulfing
    if (prev.close > prev.open && cur.close < cur.open && cur.open > prev.close && cur.close < prev.open) {
      const conf = this.calculateDynamicConfidence(80, cur, prevTrend, 'BEARISH');
      patterns.push({ type: 'BEARISH_ENGULFING', bias: 'BEARISH', confidence: conf });
    }

    // Hammer / Hanging Man
    const body = Math.abs(cur.close - cur.open);
    const lower = Math.min(cur.open, cur.close) - cur.low;
    const upper = cur.high - Math.max(cur.open, cur.close);

    if (lower > body * 2 && upper < body * 0.5) {
      const conf = this.calculateDynamicConfidence(75, cur, prevTrend, 'BULLISH');
      patterns.push({ type: 'HAMMER', bias: 'BULLISH', confidence: conf });
    }
    if (upper > body * 2 && lower < body * 0.5) {
      const conf = this.calculateDynamicConfidence(75, cur, prevTrend, 'BEARISH');
      patterns.push({ type: 'HANGING_MAN', bias: 'BEARISH', confidence: conf });
    }

    return patterns;
  }

  // Fallback mínimo
  detectCandlestickPatternsInline(data) {
    const out = [];
    const last = data.close.length - 1;
    if (last < 1) return out;
    const c = {
      open: data.open[last],
      high: data.high[last],
      low: data.low[last],
      close: data.close[last]
    };
    if (Math.abs(c.open - c.close) < c.close * 0.001) out.push({ type: 'DOJI', bias: 'NEUTRAL', confidence: 70 });
    return out;
  }

  // -------------------- Apoio Candlestick --------------------

  calculatePreviousTrend(data) {
    const w = Math.min(5, data.close.length - 1);
    if (w < 2) return 'NEUTRAL';
    const prices = data.close.slice(-w - 1, -1);
    let up = 0, down = 0;
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
    const range = candle.high - candle.low;
    const ratio = range > 0 ? body / range : 0;
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

  isValidCandle(c) {
    return (
      c &&
      typeof c.open === 'number' && isFinite(c.open) && c.open > 0 &&
      typeof c.high === 'number' && isFinite(c.high) && c.high > 0 &&
      typeof c.low === 'number' && isFinite(c.low) && c.low > 0 &&
      typeof c.close === 'number' && isFinite(c.close) && c.close > 0 &&
      c.high >= c.low &&
      c.high >= Math.max(c.open, c.close) &&
      c.low <= Math.min(c.open, c.close)
    );
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

  // -------------------- Padrões geométricos --------------------

  detectBreakout(data, support, resistance) {
    try {
      const last = data.close.length - 1;
      const cur = data.close[last];
      const prev = data.close[last - 1];

      const vols = Array.isArray(data.volume) && data.volume.length === data.close.length
        ? data.volume
        : Array(data.close.length).fill(1);
      const vol = vols[last];
      const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;

      if (cur > resistance && prev <= resistance && vol > avgVol * this.config.breakoutVolumeThreshold) {
        return { type: 'BULLISH_BREAKOUT', level: resistance, strength: 'HIGH', confidence: 85, volumeConfirmation: true };
      }
      if (cur < support && prev >= support && vol > avgVol * this.config.breakoutVolumeThreshold) {
        return { type: 'BEARISH_BREAKOUT', level: support, strength: 'HIGH', confidence: 85, volumeConfirmation: true };
      }
      return null;
    } catch {
      return null;
    }
  }

  detectTriangles(data) {
    const n = Math.min(10, data.high.length);
    const highs = data.high.slice(-n);
    const lows = data.low.slice(-n);
    const r = this.calculateLinearRegression(highs);
    const s = this.calculateLinearRegression(lows);

    if (Math.abs(r.slope) < this.config.tolerance && r.r2 > this.config.regressionMinR2 &&
        s.slope > this.config.tolerance && s.r2 > this.config.regressionMinR2) {
      return { type: 'ASCENDING_TRIANGLE', bias: 'BULLISH', confidence: 70, resistanceSlope: r.slope, supportSlope: s.slope };
    }
    if (Math.abs(s.slope) < this.config.tolerance && s.r2 > this.config.regressionMinR2 &&
        r.slope < -this.config.tolerance && r.r2 > this.config.regressionMinR2) {
      return { type: 'DESCENDING_TRIANGLE', bias: 'BEARISH', confidence: 70, resistanceSlope: r.slope, supportSlope: s.slope };
    }
    return null;
  }

  detectFlags(data) {
    const p = data.close;
    const last = p.length - 1;
    const mid = Math.floor(p.length / 2);
    const q = Math.floor(p.length * 0.75);

    const strong = Math.abs(p[last] - p[mid]) > p[mid] * 0.05;
    const cons = Math.abs(p[last] - p[q]) < p[q] * 0.02;
    if (strong && cons) {
      const dir = p[last] > p[mid] ? 'BULLISH' : 'BEARISH';
      return { type: `${dir}_FLAG`, strength: 'MEDIUM', confidence: 65, moveSize: (Math.abs(p[last] - p[mid]) / p[mid]) * 100 };
    }
    return null;
  }

  detectWedges(data) {
    const n = Math.min(10, data.high.length);
    const highs = data.high.slice(-n);
    const lows = data.low.slice(-n);
    const hr = this.calculateLinearRegression(highs);
    const lr = this.calculateLinearRegression(lows);
    const hs = hr.slope, ls = lr.slope;
    const conv = Math.abs(hs - ls) > this.config.tolerance;

    if (hs > 0 && ls > 0 && conv && hs < ls) {
      return { type: 'RISING_WEDGE', bias: 'BEARISH', confidence: 60, convergence: Math.abs(hs - ls), highsSlope: hs, lowsSlope: ls };
    }
    if (hs < 0 && ls < 0 && conv && hs > ls) {
      return { type: 'FALLING_WEDGE', bias: 'BULLISH', confidence: 60, convergence: Math.abs(hs - ls), highsSlope: hs, lowsSlope: ls };
    }
    return null;
  }

  detectDoublePatterns(data, support, resistance) {
    const highs = data.high;
    const lows = data.low;
    const tol = resistance * this.config.tolerance;

    const rHits = [];
    for (let i = 0; i < highs.length; i++) if (Math.abs(highs[i] - resistance) < tol) rHits.push(i);
    if (rHits.length >= 2) {
      const sep = rHits[rHits.length - 1] - rHits[0];
      if (sep >= this.config.minSeparation) {
        return { type: 'DOUBLE_TOP', level: resistance, bias: 'BEARISH', confidence: 75, separation: sep };
      }
    }

    const sHits = [];
    for (let i = 0; i < lows.length; i++) if (Math.abs(lows[i] - support) < support * this.config.tolerance) sHits.push(i);
    if (sHits.length >= 2) {
      const sep = sHits[sHits.length - 1] - sHits[0];
      if (sep >= this.config.minSeparation) {
        return { type: 'DOUBLE_BOTTOM', level: support, bias: 'BULLISH', confidence: 75, separation: sep };
      }
    }

    return null;
  }

  detectHeadShoulders(data) {
    const minLength = 7;
    if (data.high.length < minLength) return null;

    const highs = data.high.slice(-minLength);
    const lows = data.low.slice(-minLength);

    // Índices relativos (modelo simples)
    const leftShoulderIdx = 1;
    const headIdx = 3;
    const rightShoulderIdx = 5;

    const leftShoulder = highs[leftShoulderIdx];
    const head = highs[headIdx];
    const rightShoulder = highs[rightShoulderIdx];
    const neckline = Math.min(lows[2], lows[4]);

    const shoulderTolerance = leftShoulder * this.config.tolerance;

    if (head > leftShoulder &&
        head > rightShoulder &&
        Math.abs(leftShoulder - rightShoulder) < shoulderTolerance) {
      return {
        type: 'HEAD_AND_SHOULDERS',
        neckline,
        bias: 'BEARISH',
        target: neckline - (head - neckline),
        confidence: 80,
        leftShoulder, head, rightShoulder
      };
    }

    return null;
  }

  // -------------------- Utilidades --------------------

  calculateLinearRegression(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return { slope: 0, intercept: 0, r2: 0 };
      const n = values.length;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = values;

      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
      const sumXX = x.reduce((s, xi) => s + xi * xi, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      const yMean = sumY / n;
      const ssTot = y.reduce((s, yi) => s + Math.pow(yi - yMean, 2), 0);
      const ssRes = y.reduce((s, yi, i) => s + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
      const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

      return { slope, intercept, r2 };
    } catch {
      return { slope: 0, intercept: 0, r2: 0 };
    }
  }

  isHorizontalLine(values, tolerance = null) {
    try {
      const tol = tolerance || this.config.tolerance;
      if (!Array.isArray(values) || values.length < 2) return false;
      const r = this.calculateLinearRegression(values);
      return Math.abs(r.slope) < tol && r.r2 > this.config.regressionMinR2;
    } catch {
      return false;
    }
  }

  isRisingLine(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      const r = this.calculateLinearRegression(values);
      return r.slope > this.config.tolerance && r.r2 > this.config.regressionMinR2;
    } catch {
      return false;
    }
  }

  isFallingLine(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      const r = this.calculateLinearRegression(values);
      return r.slope < -this.config.tolerance && r.r2 > this.config.regressionMinR2;
    } catch {
      return false;
    }
  }

  calculateVolatility(prices) {
    try {
      if (!Array.isArray(prices) || prices.length < 2) return 0;
      const returns = [];
      for (let i = 1; i < prices.length; i++) if (prices[i - 1] > 0) returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      if (!returns.length) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
      return Math.sqrt(variance);
    } catch {
      return 0;
    }
  }

  adjustToleranceForVolatility(data) {
    const vol = this.calculateVolatility(data.close);
    if (vol > 0.05) this.config.tolerance = 0.03;
    else if (vol < 0.01) this.config.tolerance = 0.01;
    else this.config.tolerance = 0.02;
    this.log(`📊 Tolerância ${(this.config.tolerance * 100).toFixed(1)}% (vol: ${(vol * 100).toFixed(2)}%)`);
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
      Object.entries(patterns).forEach(([, pattern]) => {
        if (pattern && typeof pattern === 'object') {
          if (Array.isArray(pattern)) {
            pattern.forEach((p) => {
              stats.totalPatterns++;
              if (p.bias === 'BULLISH') stats.bullishPatterns++;
              else if (p.bias === 'BEARISH') stats.bearishPatterns++;
              else stats.neutralPatterns++;
              if (p.confidence >= 80) stats.highConfidencePatterns++;
              stats.patternTypes[p.type] = (stats.patternTypes[p.type] || 0) + 1;
            });
          } else {
            stats.totalPatterns++;
            if (pattern.bias === 'BULLISH') stats.bullishPatterns++;
            else if (pattern.bias === 'BEARISH') stats.bearishPatterns++;
            else stats.neutralPatterns++;
            if (pattern.confidence >= 80) stats.highConfidencePatterns++;
            stats.patternTypes[pattern.type] = (stats.patternTypes[pattern.type] || 0) + 1;
          }
        }
      });
      return stats;
    } catch {
      return { totalPatterns: 0, bullishPatterns: 0, bearishPatterns: 0, neutralPatterns: 0, highConfidencePatterns: 0, patternTypes: {} };
    }
  }
}

export default PatternDetectionService;
