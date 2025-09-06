// server/services/technicalAnalysis.js
/**
 * Serviço de análise técnica (singleton)
 * - Validação robusta dos dados
 * - Cache por símbolo/timeframe com TTL coerente
 * - Parâmetros otimizados (quando disponíveis) + defaults saneados
 * - Otimização assíncrona não-bloqueante com cooldown
 * - Volatilidade: aceita número (compat) ou calcula ATR (auto) quando não vier definida
 * - Compatibilidade total com SignalScoring/AdaptiveScoring/BitcoinCorrelation:
 *   rsi, macd{MACD,signal,histogram}, ma21, ma200, volumeMA, atr, ichimoku, volatility, optimizedParams
 */

import technicalindicators from 'technicalindicators';
import { INDICATORS_CONFIG } from '../config/constants.js';
import indicatorOptimizer from './indicatorOptimizer.js';

const MAX_CACHE_ENTRIES       = 500;     // segurança contra crescimento infinito
const OPTIMIZATION_COOLDOWN_MS = 15_000; // evita otimização repetida logo após timeout/erro
const OPTIMIZATION_TIMEOUT_MS  = 10_000;

class TechnicalAnalysisService {
  constructor() {
    this.indicatorCache = new Map();         // key = `${symbol}:${timeframe}`
    this.optimizationInProgress = new Set(); // chaves em execução
    this.lastOptimizationAttempt = new Map();
  }

  /**
   * Calcula todos os indicadores para (data, symbol, timeframe).
   * Respeita cache (TTL + coerência com último candle).
   */
  async calculateIndicators(data, symbol = 'UNKNOWN', timeframe = '1h') {
    const logPrefix = `[${symbol} ${timeframe}]`;

    try {
      // 1) validação mínima
      if (!this.validateData(data)) {
        console.error(`${logPrefix} ❌ Dados inválidos/insuficientes — abortando cálculo de indicadores.`);
        return null;
      }

      const cacheKey = `${symbol}:${timeframe}`;
      const cached = this.indicatorCache.get(cacheKey);

      // parâmetros: usa últimos otimizados se houver; senão defaults
      const paramsFromCache = cached?.indicators?.optimizedParams;
      const params = paramsFromCache || this.getDefaultParams();
      const { RSI, MACD, MA, VOLATILITY } = this.normalizeParams(params);

      // 2) cache fresco?
      if (cached && this.isCacheFresh(cached, timeframe, data)) {
        // console.log(`${logPrefix} ✅ Usando cache de indicadores`);
        return cached.indicators;
      }

      // 3) cálculo principal
      // volatilidade: se VOLATILITY numérico > 0, respeita; senão tenta ATR(14) como “auto”
      const atr = this.safeCalculate(() => this.calculateATR(data, 14), 'ATR(14)');
      let volatilityValue = (typeof VOLATILITY === 'number' && isFinite(VOLATILITY) && VOLATILITY > 0)
        ? VOLATILITY
        : (atr != null ? atr : 1.3); // ATR como proxy de nível; fallback 1.3

      const rsi = this.safeCalculate(() => this.calculateRSI(data, RSI.period), `RSI(${RSI.period})`);
      const macd = this.safeCalculate(
        () => this.calculateMACD(data, MACD.fastPeriod, MACD.slowPeriod, MACD.signalPeriod),
        `MACD(${MACD.fastPeriod},${MACD.slowPeriod},${MACD.signalPeriod})`
      );
      const ma21  = this.safeCalculate(() => this.calculateMA(data.close, MA.shortPeriod), `MA${MA.shortPeriod}`);
      const ma200 = this.safeCalculate(() => this.calculateMA(data.close, MA.longPeriod),  `MA${MA.longPeriod}`);

      // volumeMA (exposto pra economizar fallback nos scorings)
      const volumeMAPeriod = INDICATORS_CONFIG?.VOLUME_MA?.period ?? 14;
      const volumeMA = this.safeCalculate(() => this.calculateVolumeMA(data.volume, volumeMAPeriod), `VOLUME_MA(${volumeMAPeriod})`);

      // Ichimoku (básico: Tenkan/Kijun) — usado de forma opcional pelo AdaptiveScoring
      const ichCfg = INDICATORS_CONFIG?.ICHIMOKU || { conversionPeriod: 9, basePeriod: 26, spanPeriod: 52 };
      const ichimoku = this.safeCalculate(
        () => this.calculateIchimoku(data, ichCfg.conversionPeriod ?? 9, ichCfg.basePeriod ?? 26, ichCfg.spanPeriod ?? 52),
        `ICHIMOKU(${ichCfg.conversionPeriod ?? 9},${ichCfg.basePeriod ?? 26},${ichCfg.spanPeriod ?? 52})`
      );

      const indicators = {
        rsi,
        macd,                     // { MACD, signal, histogram }
        ma21,
        ma200,
        volumeMA,
        atr,                      // numérico (se calculado com sucesso)
        ichimoku,                 // { conversionLine, baseLine, spanA?, spanB? }
        volatility: volatilityValue,
        optimizedParams: params,  // mantém o shape original
      };

      // 4) atualiza cache
      this._setCache(cacheKey, {
        indicators,
        timestamp: Date.now(),
        lastClose: data.close[data.close.length - 1],
        length: data.close.length,
      });

      // 5) dispara otimização off-thread (não bloqueia)
      this.optimizeInBackground(data, symbol, timeframe).catch((error) => {
        console.error(`${logPrefix} ❌ Falha na otimização em segundo plano:`, error?.message || error);
      });

      return indicators;
    } catch (error) {
      console.error(`${logPrefix} ❌ Erro ao calcular indicadores:`, error?.message || error);
      return null;
    }
  }

  // ==================== NORMALIZAÇÃO & CACHE ====================

  normalizeParams(params) {
    const defaults = this._internalDefaultParams();
    const out = {
      RSI: { period: params?.RSI?.period ?? defaults.RSI.period },
      MACD: {
        fastPeriod:   params?.MACD?.fastPeriod   ?? defaults.MACD.fastPeriod,
        slowPeriod:   params?.MACD?.slowPeriod   ?? defaults.MACD.slowPeriod,
        signalPeriod: params?.MACD?.signalPeriod ?? defaults.MACD.signalPeriod,
      },
      MA: {
        shortPeriod: params?.MA?.shortPeriod ?? defaults.MA.shortPeriod,
        longPeriod:  params?.MA?.longPeriod  ?? defaults.MA.longPeriod,
      },
      // VOLATILITY pode vir como número (compat) ou {level}
      VOLATILITY:
        (typeof params?.VOLATILITY === 'object' && params?.VOLATILITY?.level != null)
          ? params.VOLATILITY.level
          : (typeof params?.VOLATILITY === 'number' ? params.VOLATILITY : defaults.VOLATILITY.level),
    };
    return out;
  }

  isCacheFresh(cached, timeframe, data) {
    const ttl = this.getTTLFor(timeframe);
    const withinTTL = (Date.now() - cached.timestamp) < ttl;
    const sameLength = cached.length === data.close.length;
    const sameLast = cached.lastClose === data.close[data.close.length - 1];
    return withinTTL && sameLength && sameLast;
  }

  getTTLFor(tf) {
    const map = {
      '1m':  30_000,
      '3m':  60_000,
      '5m':  60_000,
      '15m': 180_000,
      '30m': 300_000,
      '1h':  900_000,
      '2h':  1_800_000,
      '4h':  3_600_000,
      '1d':  4 * 3_600_000,
    };
    return map[tf] ?? 900_000;
  }

  _setCache(key, value) {
    if (!this.indicatorCache.has(key) && this.indicatorCache.size >= MAX_CACHE_ENTRIES) {
      // política simples de poda: remove o 1º item iterado
      const firstKey = this.indicatorCache.keys().next().value;
      if (firstKey) this.indicatorCache.delete(firstKey);
    }
    this.indicatorCache.set(key, value);
  }

  // ==================== UTIL DE CÁLCULO SEGURO ====================

  safeCalculate(calcFn, indicatorName) {
    try {
      const result = calcFn();
      if (result === null || result === undefined || (typeof result === 'number' && !isFinite(result))) {
        console.warn(`⚠️ ${indicatorName} não pôde ser calculado`);
        return null;
      }
      return result;
    } catch (error) {
      console.error(`❌ Erro ao calcular ${indicatorName}:`, error.message);
      return null;
    }
  }

  // ==================== LÓGICA DE TENDÊNCIA (opcional) ====================

  detectTrend(indicators) {
    try {
      if (!indicators) return 'NEUTRAL';

      let bullish = 0;
      let bearish = 0;
      let total = 0;

      // RSI
      if (isFinite(indicators.rsi)) {
        total++;
        if (indicators.rsi > 85) bearish++;
        else if (indicators.rsi < 25) bullish++;
        else if (indicators.rsi > 60) bullish++;
        else if (indicators.rsi < 40) bearish++;
      }

      // MACD
      if (indicators.macd && isFinite(indicators.macd.MACD) && isFinite(indicators.macd.signal)) {
        total++;
        const diff = indicators.macd.MACD - indicators.macd.signal;
        if (Math.abs(diff) > 0.001) (diff > 0 ? bullish++ : bearish++);
      }

      // MAs
      if (isFinite(indicators.ma21) && isFinite(indicators.ma200)) {
        total++;
        const maDiffPct = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
        if (Math.abs(maDiffPct) > 0.5) (indicators.ma21 > indicators.ma200 ? bullish++ : bearish++);
      }

      if (total === 0) return 'NEUTRAL';
      const bullPct = (bullish / total) * 100;
      const bearPct = (bearish / total) * 100;
      if (bullPct >= 60) return 'BULLISH';
      if (bearPct >= 60) return 'BEARISH';
      return 'NEUTRAL';
    } catch (error) {
      console.error('❌ Erro ao detectar tendência:', error?.message || error);
      return 'NEUTRAL';
    }
  }

  // ==================== VALIDAÇÃO DE DADOS ====================

  validateData(data) {
    try {
      if (!data) return false;
      const keys = ['open', 'high', 'low', 'close', 'volume'];
      const minLength = 50;

      for (const k of keys) {
        const arr = data[k];
        if (!Array.isArray(arr) || arr.length < minLength) return false;
      }
      const len = data.close.length;
      if (!keys.every((k) => data[k].length === len)) return false;

      // checagem spot: primeiras/últimas 5 barras
      const indices = [
        0, 1, 2, 3, 4,
        len - 5, len - 4, len - 3, len - 2, len - 1,
      ].filter((i) => i >= 0 && i < len);

      for (const i of indices) {
        const o = data.open[i], h = data.high[i], l = data.low[i], c = data.close[i], v = data.volume[i];
        if (![o, h, l, c, v].every((x) => typeof x === 'number' && isFinite(x) && x >= 0)) return false;
        if (!(h >= Math.max(o, c))) return false;
        if (!(l <= Math.min(o, c))) return false;
        if (!(h >= l)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  // ==================== INDICADORES BÁSICOS ====================

  calculateRSI(data, period = 14) {
    if (!data?.close?.length || data.close.length < period) return null;
    const rsiValues = technicalindicators.RSI.calculate({ values: data.close, period });
    const rsi = rsiValues?.[rsiValues.length - 1];
    return (typeof rsi === 'number' && isFinite(rsi)) ? rsi : null;
  }

  calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const need = slowPeriod + signalPeriod;
    if (!data?.close?.length || data.close.length < need) return null;
    if (!data.close.every((v) => typeof v === 'number' && isFinite(v) && v > 0)) return null;

    const arr = technicalindicators.MACD.calculate({
      values: data.close,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const last = arr?.[arr.length - 1];
    if (!last) return null;
    const ok = ['MACD', 'signal', 'histogram'].every((k) => typeof last[k] === 'number' && isFinite(last[k]));
    return ok ? last : null;
  }

  calculateMA(values = [], period = 21) {
    const n = Math.min(period, values.length);
    if (n < Math.min(10, Math.floor(period * 0.5))) return null;
    const win = values.slice(-n).filter((v) => typeof v === 'number' && isFinite(v));
    if (win.length < Math.min(10, Math.floor(period * 0.5))) return null;

    const ma = technicalindicators.SMA.calculate({ values: win, period: win.length })?.pop();
    return (typeof ma === 'number' && isFinite(ma)) ? ma : null;
  }

  calculateVolumeMA(volumes = [], period = 14) {
    const n = Math.min(period, volumes.length);
    if (n < period) return null;
    const win = volumes.slice(-n).filter((v) => typeof v === 'number' && isFinite(v));
    if (win.length < period) return null;
    const vma = technicalindicators.SMA.calculate({ values: win, period })?.pop();
    return (typeof vma === 'number' && isFinite(vma)) ? vma : null;
  }

  calculateATR(data, period = 14) {
    const { high, low, close } = data || {};
    if (!Array.isArray(high) || !Array.isArray(low) || !Array.isArray(close)) return null;
    if (high.length < period + 1 || low.length < period + 1 || close.length < period + 1) return null;

    const result = technicalindicators.ATR.calculate({ high, low, close, period });
    const atr = result?.[result.length - 1];
    return (typeof atr === 'number' && isFinite(atr)) ? atr : null;
  }

  calculateIchimoku(data, conv = 9, base = 26, span = 52) {
    const { high, low } = data || {};
    if (!Array.isArray(high) || !Array.isArray(low)) return null;
    const len = Math.min(high.length, low.length);
    if (len < Math.max(conv, base, span)) return null;

    const highest = (arr, p) => {
      const win = arr.slice(-p);
      return Math.max(...win);
    };
    const lowest = (arr, p) => {
      const win = arr.slice(-p);
      return Math.min(...win);
    };

    const conversionLine = (highest(high, conv) + lowest(low, conv)) / 2;
    const baseLine       = (highest(high, base) + lowest(low, base)) / 2;

    // Span A/B são opcionais — calculamos se possível (não obrigatório para os scorings)
    let spanA = null, spanB = null;
    try {
      const convHist = (highest(high.slice(0, -base), conv) + lowest(low.slice(0, -base), conv)) / 2;
      const baseHist = (highest(high.slice(0, -base), base) + lowest(low.slice(0, -base), base)) / 2;
      spanA = (convHist + baseHist) / 2;

      const spanHigh = highest(high, span);
      const spanLow  = lowest(low, span);
      spanB = (spanHigh + spanLow) / 2;
    } catch { /* opcional */ }

    return {
      conversionLine: isFinite(conversionLine) ? conversionLine : null,
      baseLine:       isFinite(baseLine) ? baseLine : null,
      spanA:          (spanA != null && isFinite(spanA)) ? spanA : null,
      spanB:          (spanB != null && isFinite(spanB)) ? spanB : null
    };
  }

  // ==================== DEFAULTS & PARAM SOURCES ====================

  _internalDefaultParams() {
    return {
      RSI: { period: 10 },                     // mais responsivo para scalping
      MACD: { fastPeriod: 10, slowPeriod: 22, signalPeriod: 7 },
      MA: { shortPeriod: 14, longPeriod: 180 },
      VOLATILITY: { level: 1.3 },              // compat: número simples
    };
  }

  getDefaultParams() {
    const base = this._internalDefaultParams();
    // aceita tanto INDICATORS_CONFIG.DEFAULTS quanto INDICATORS_CONFIG direto
    const cfg = INDICATORS_CONFIG?.DEFAULTS || INDICATORS_CONFIG || {};

    return {
      RSI: { period: cfg?.RSI?.period ?? base.RSI.period },
      MACD: {
        fastPeriod:   cfg?.MACD?.fastPeriod   ?? base.MACD.fastPeriod,
        slowPeriod:   cfg?.MACD?.slowPeriod   ?? base.MACD.slowPeriod,
        signalPeriod: cfg?.MACD?.signalPeriod ?? base.MACD.signalPeriod,
      },
      MA: {
        shortPeriod: cfg?.MA?.shortPeriod ?? base.MA.shortPeriod,
        longPeriod:  cfg?.MA?.longPeriod  ?? base.MA.longPeriod,
      },
      VOLATILITY: cfg?.VOLATILITY?.level ?? cfg?.VOLATILITY ?? base.VOLATILITY.level,
    };
  }

  // ==================== OTIMIZAÇÃO EM BACKGROUND ====================

  async optimizeInBackground(data, symbol, timeframe) {
    const key = `${symbol}:${timeframe}`;
    const now = Date.now();

    // cooldown
    const last = this.lastOptimizationAttempt.get(key) || 0;
    if (now - last < OPTIMIZATION_COOLDOWN_MS) {
      // console.log(`[${key}] Otimização em cooldown`);
      return null;
    }
    this.lastOptimizationAttempt.set(key, now);

    if (this.optimizationInProgress.has(key)) return null;
    this.optimizationInProgress.add(key);

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite de otimização excedido')), OPTIMIZATION_TIMEOUT_MS)
      );

      const optimizedParams = await Promise.race([
        indicatorOptimizer.optimizeIndicators(data, symbol, timeframe),
        timeoutPromise,
      ]);

      if (!optimizedParams) return null;

      // normaliza e recalcula indicadores com parâmetros otimizados
      const norm = this.normalizeParams(optimizedParams);

      const rsi = this.calculateRSI(data, norm.RSI.period);
      const macd = this.calculateMACD(data, norm.MACD.fastPeriod, norm.MACD.slowPeriod, norm.MACD.signalPeriod);
      const ma21 = this.calculateMA(data.close, norm.MA.shortPeriod);
      const ma200 = this.calculateMA(data.close, norm.MA.longPeriod);

      const volumeMAPeriod = INDICATORS_CONFIG?.VOLUME_MA?.period ?? 14;
      const volumeMA = this.calculateVolumeMA(data.volume, volumeMAPeriod);

      const ichCfg = INDICATORS_CONFIG?.ICHIMOKU || { conversionPeriod: 9, basePeriod: 26, spanPeriod: 52 };
      const ichimoku = this.calculateIchimoku(data, ichCfg.conversionPeriod ?? 9, ichCfg.basePeriod ?? 26, ichCfg.spanPeriod ?? 52);

      const atr = this.calculateATR(data, 14);
      const volatility = (typeof norm.VOLATILITY === 'number' && isFinite(norm.VOLATILITY) && norm.VOLATILITY > 0)
        ? norm.VOLATILITY
        : (atr != null ? atr : 1.3);

      const recalculated = {
        rsi,
        macd,
        ma21,
        ma200,
        volumeMA,
        atr,
        ichimoku,
        volatility,
        optimizedParams,
        lastOptimized: new Date(),
      };

      // atualiza cache
      this._setCache(key, {
        indicators: recalculated,
        timestamp: Date.now(),
        lastClose: data.close[data.close.length - 1],
        length: data.close.length,
      });

      return optimizedParams;
    } catch (err) {
      console.error(`[${key}] ❌ Erro na otimização:`, err?.message || err);
      return null;
    } finally {
      this.optimizationInProgress.delete(key);
    }
  }
}

export default new TechnicalAnalysisService();
