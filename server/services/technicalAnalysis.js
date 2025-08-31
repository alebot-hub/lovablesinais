/**
 * Serviço de análise técnica
 */

import technicalindicators from 'technicalindicators';
import { INDICATORS_CONFIG } from '../config/constants.js';
import indicatorOptimizer from './indicatorOptimizer.js';

class TechnicalAnalysisService {
  constructor() {
    this.indicatorCache = new Map();
    this.optimizationInProgress = new Set(); // Controle de otimizações ativas
    this.lastOptimizationAttempt = new Map(); // Cooldown pós-timeout
  }

  /**
   * Calcula todos os indicadores técnicos com parâmetros (otimizados se existirem)
   */
  async calculateIndicators(data, symbol = 'UNKNOWN', timeframe = '1h') {
    const logPrefix = `[${symbol} ${timeframe}]`;

    try {
      // Validação mínima para evitar quebras
      if (!data || !data.close || !data.close.length) {
        console.error(`${logPrefix} ❌ Dados inválidos ou vazios`);
        console.error(`${logPrefix} Dados recebidos:`, {
          hasClose: !!data?.close,
          closeLength: data?.close?.length || 0,
          hasOpen: !!data?.open,
          hasHigh: !!data?.high,
          hasLow: !!data?.low
        });
        return null;
      }

      const cacheKey = `${symbol}:${timeframe}`;
      const cached = this.indicatorCache.get(cacheKey);

      // Params: priorizar os últimos otimizados do cache; senão, defaults (mesclando com constants se houver)
      const paramsFromCache = cached?.indicators?.optimizedParams;
      const params = paramsFromCache || this.getDefaultParams();
      const { RSI, MACD, MA, VOLATILITY } = this.normalizeParams(params);

      // Se cache está fresco e ainda corresponde ao último candle conhecido, usar
      if (cached && this.isCacheFresh(cached, timeframe, data)) {
        console.log(`${logPrefix} ✅ Usando cache de indicadores`);
        return cached.indicators;
      }

      console.log(`${logPrefix} Calculando indicadores para ${data.close.length} candles...`);

      // Calcula com os parâmetros atuais (otimizados se houver)
      const indicators = {
        rsi: this.safeCalculate(() => this.calculateRSI(data, RSI.period), `RSI(${RSI.period})`),
        macd: this.safeCalculate(
          () => this.calculateMACD(data, MACD.fastPeriod, MACD.slowPeriod, MACD.signalPeriod),
          `MACD(${MACD.fastPeriod},${MACD.slowPeriod},${MACD.signalPeriod})`
        ),
        ma21: this.safeCalculate(() => this.calculateMA(data.close, MA.shortPeriod), `MA${MA.shortPeriod}`),
        ma200: this.safeCalculate(() => this.calculateMA(data.close, MA.longPeriod), `MA${MA.longPeriod}`),
        volatility: VOLATILITY, // número
        optimizedParams: params // guarda o shape original (compatível)
      };

      console.log(`${logPrefix} ✅ Indicadores calculados:`, {
        rsi: indicators.rsi,
        macd: indicators.macd ? 'OK' : 'Falha',
        ma21: indicators.ma21,
        ma200: indicators.ma200
      });

      // Atualiza cache primário
      this.indicatorCache.set(cacheKey, {
        indicators,
        timestamp: Date.now(),
        lastClose: data.close[data.close.length - 1],
        length: data.close.length
      });

      // Dispara otimização em segundo plano (sem bloquear)
      this.optimizeInBackground(data, symbol, timeframe).catch(error => {
        console.error(`${logPrefix} ❌ Falha na otimização em segundo plano:`, error?.message || error);
      });

      return indicators;
    } catch (error) {
      console.error(`${logPrefix} ❌ Erro ao calcular indicadores:`, error?.message || error);
      return null;
    }
  }

  // Função auxiliar: normaliza params (aceita VOLATILITY como objeto {level} ou número)
  normalizeParams(params) {
    const defaults = this._internalDefaultParams();
    const out = {
      RSI: { period: params?.RSI?.period ?? defaults.RSI.period },
      MACD: {
        fastPeriod: params?.MACD?.fastPeriod ?? defaults.MACD.fastPeriod,
        slowPeriod: params?.MACD?.slowPeriod ?? defaults.MACD.slowPeriod,
        signalPeriod: params?.MACD?.signalPeriod ?? defaults.MACD.signalPeriod
      },
      MA: {
        shortPeriod: params?.MA?.shortPeriod ?? defaults.MA.shortPeriod,
        longPeriod: params?.MA?.longPeriod ?? defaults.MA.longPeriod
      },
      VOLATILITY:
        (typeof params?.VOLATILITY === 'object' && params?.VOLATILITY?.level != null)
          ? params.VOLATILITY.level
          : (typeof params?.VOLATILITY === 'number' ? params.VOLATILITY : defaults.VOLATILITY.level)
    };
    return out;
  }

  // Helper de cache por timeframe + coerência com o último candle
  isCacheFresh(cached, timeframe, data) {
    const ttl = this.getTTLFor(timeframe);
    const withinTTL = (Date.now() - cached.timestamp) < ttl;
    const sameLength = cached.length === data.close.length;
    const sameLast = cached.lastClose === data.close[data.close.length - 1];
    return withinTTL && sameLength && sameLast;
  }

  getTTLFor(tf) {
    // TTLs mais curtos para timeframes baixos
    const map = {
      '1m': 30_000,
      '3m': 60_000,
      '5m': 60_000,
      '15m': 180_000,
      '30m': 300_000,
      '1h': 900_000,
      '2h': 1_800_000,
      '4h': 3_600_000,
      '1d': 4 * 3_600_000
    };
    return map[tf] ?? 900_000;
  }

  // Função auxiliar com log correto para valores nulos
  safeCalculate(calcFn, indicatorName) {
    try {
      const result = calcFn();
      if (result === null || result === undefined) {
        console.warn(`⚠️ ${indicatorName} não pôde ser calculado`);
        return null;
      }
      console.log(`✅ ${indicatorName} calculado com sucesso`);
      return result;
    } catch (error) {
      console.error(`❌ Erro ao calcular ${indicatorName}:`, error.message);
      return null;
    }
  }

  /**
   * Detecta a tendência do mercado com base nos indicadores técnicos
   * Retorna: 'BULLISH', 'BEARISH' ou 'NEUTRAL'
   */
  detectTrend(indicators) {
    try {
      if (!indicators) return 'NEUTRAL';

      let bullishScore = 0;
      let bearishScore = 0;
      let totalIndicators = 0;

      // RSI - limiares ajustados
      if (indicators.rsi !== undefined && indicators.rsi !== null) {
        totalIndicators++;
        if (indicators.rsi > 85) bearishScore++;       // sobrecompra extrema
        else if (indicators.rsi < 25) bullishScore++;  // sobrevenda extrema
        else if (indicators.rsi > 60) bullishScore++;  // alta moderada
        else if (indicators.rsi < 40) bearishScore++;  // baixa moderada
      }

      // MACD - sensível a cruzamentos (mantido para compatibilidade)
      if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
        totalIndicators++;
        const macdDiff = indicators.macd.MACD - indicators.macd.signal;
        if (Math.abs(macdDiff) > 0.001) {
          if (macdDiff > 0) bullishScore++;
          else bearishScore++;
        }
      }

      // Médias Móveis
      if (indicators.ma21 !== null && indicators.ma200 !== null) {
        totalIndicators++;
        const maDiff = (indicators.ma21 - indicators.ma200) / indicators.ma200 * 100;
        if (Math.abs(maDiff) > 0.5) {
          if (indicators.ma21 > indicators.ma200) bullishScore++;
          else bearishScore++;
        }
      }

      if (totalIndicators === 0) return 'NEUTRAL';

      const bullishPercentage = (bullishScore / totalIndicators) * 100;
      const bearishPercentage = (bearishScore / totalIndicators) * 100;

      if (bullishPercentage >= 60) return 'BULLISH';
      if (bearishPercentage >= 60) return 'BEARISH';
      return 'NEUTRAL';
    } catch (error) {
      console.error('❌ Erro ao detectar tendência:', error?.message || error);
      return 'NEUTRAL';
    }
  }

  validateData(data) {
    try {
      if (!data) {
        console.error('❌ Dados não fornecidos para validação');
        return false;
      }

      const requiredArrays = ['open', 'high', 'low', 'close', 'volume'];
      const minLength = 50;

      for (const key of requiredArrays) {
        if (!Array.isArray(data[key])) {
          console.error(`❌ Dados inválidos: ${key} não é um array`);
          return false;
        }
        if (data[key].length < minLength) {
          console.error(`❌ Dados insuficientes: ${key} tem apenas ${data[key].length} candles (mínimo ${minLength})`);
          return false;
        }
      }

      const firstLength = data.close.length;
      for (const key of requiredArrays) {
        if (data[key].length !== firstLength) {
          console.error(`❌ Tamanho inconsistente: ${key} tem ${data[key].length} itens, esperado ${firstLength}`);
          return false;
        }
      }

      const checkIndices = [
        ...Array(5).fill().map((_, i) => i),
        ...Array(5).fill().map((_, i) => data.close.length - 5 + i)
      ];

      for (const i of checkIndices) {
        if (i >= data.close.length) continue;

        const candle = {
          open: data.open[i],
          high: data.high[i],
          low: data.low[i],
          close: data.close[i],
          volume: data.volume[i]
        };

        for (const [key, value] of Object.entries(candle)) {
          if (typeof value !== 'number' || !isFinite(value) || value < 0) {
            console.error(`❌ Valor inválido em ${key}[${i}]:`, value);
            return false;
          }
        }

        if (candle.high < candle.low) {
          console.error(`❌ Candle ${i}: high (${candle.high}) < low (${candle.low})`);
          return false;
        }
        if (candle.high < Math.max(candle.open, candle.close)) {
          console.error(`❌ Candle ${i}: high (${candle.high}) menor que open/close (${candle.open}/${candle.close})`);
          return false;
        }
        if (candle.low > Math.min(candle.open, candle.close)) {
          console.error(`❌ Candle ${i}: low (${candle.low}) maior que open/close (${candle.open}/${candle.close})`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Erro ao validar dados:', error?.message || error);
      return false;
    }
  }

  calculateRSI(data, period = 14) {
    try {
      if (!data?.close?.length || data.close.length < period) {
        console.error(`❌ Dados insuficientes para calcular RSI(${period}): ${data?.close?.length || 0} candles`);
        return null;
      }

      const rsiValues = technicalindicators.RSI.calculate({
        values: data.close,
        period
      });

      const rsi = rsiValues.pop();

      if (typeof rsi !== 'number' || isNaN(rsi) || !isFinite(rsi)) {
        console.error(`❌ Valor de RSI inválido: ${rsi}`);
        return null;
      }

      console.log(`✅ RSI(${period}) calculado: ${rsi.toFixed(2)}`);
      return rsi;
    } catch (error) {
      console.error(`❌ Erro ao calcular RSI(${period}):`, error.message);
      return null;
    }
  }

  calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    try {
      if (!data?.close?.length || data.close.length < slowPeriod + signalPeriod) {
        console.error(
          `❌ Dados insuficientes para calcular MACD(${fastPeriod},${slowPeriod},${signalPeriod}): ${data?.close?.length || 0} candles`
        );
        return null;
      }

      if (!data.close.every(v => typeof v === 'number' && isFinite(v) && v > 0)) {
        console.error('❌ Valores de fechamento inválidos para calcular MACD');
        return null;
      }

      const macdResults = technicalindicators.MACD.calculate({
        values: data.close,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });

      if (!macdResults || !macdResults.length) {
        console.error('❌ Nenhum resultado retornado pelo cálculo do MACD');
        return null;
      }

      const macd = macdResults[macdResults.length - 1];

      if (
        !macd || typeof macd.MACD !== 'number' || !isFinite(macd.MACD) ||
        typeof macd.signal !== 'number' || !isFinite(macd.signal) ||
        typeof macd.histogram !== 'number' || !isFinite(macd.histogram)
      ) {
        console.error('❌ Valores de MACD inválidos:', macd);
        return null;
      }

      console.log(`✅ MACD(${fastPeriod},${slowPeriod},${signalPeriod}) calculado:`, {
        macd: macd.MACD.toFixed(8),
        signal: macd.signal.toFixed(8),
        histogram: macd.histogram.toFixed(8)
      });

      return macd;
    } catch (error) {
      console.error(`❌ Erro ao calcular MACD(${fastPeriod},${slowPeriod},${signalPeriod}):`, error.message);
      return null;
    }
  }

  calculateMA(values, period) {
    try {
      const maxPeriod = Math.min(period, values.length);

      if (maxPeriod < Math.min(10, period * 0.5)) {
        console.error(`❌ Dados insuficientes para calcular MA(${period}): apenas ${values.length} candles disponíveis`);
        return null;
      }

      if (maxPeriod < period) {
        console.log(`📊 MA${period} ajustado para MA${maxPeriod} (${values.length} candles disponíveis)`);
      }

      const validValues = values
        .slice(-maxPeriod)
        .filter(v => typeof v === 'number' && isFinite(v));

      if (validValues.length !== maxPeriod) {
        console.warn(`⚠️ ${maxPeriod - validValues.length} valores inválidos removidos para cálculo da MA(${maxPeriod})`);
      }

      if (validValues.length < 10) {
        console.error(`❌ Dados insuficientes após limpeza para MA(${maxPeriod}): ${validValues.length} valores`);
        return null;
      }

      const maValues = technicalindicators.SMA.calculate({
        values: validValues,
        period: validValues.length // usa toda a janela válida para obter o último ponto
      });

      if (!maValues || !maValues.length) {
        console.error(`❌ Nenhum valor retornado pelo cálculo da MA(${validValues.length})`);
        return null;
      }

      const ma = maValues[maValues.length - 1];

      if (typeof ma !== 'number' || isNaN(ma) || !isFinite(ma)) {
        console.error(`❌ Valor de MA(${validValues.length}) inválido: ${ma}`);
        return null;
      }

      console.log(`✅ MA(${validValues.length} de ${period} desejados) calculada: ${ma.toFixed(8)}`);
      return ma;
    } catch (error) {
      console.error(`❌ Erro ao calcular MA(${period}):`, error.message);
      console.error(error.stack);
      return null;
    }
  }

  // Defaults internos (base) — usados como fallback
  _internalDefaultParams() {
    return {
      RSI: { period: 10 }, // mais sensível
      MACD: { fastPeriod: 10, slowPeriod: 22, signalPeriod: 7 },
      MA: { shortPeriod: 14, longPeriod: 180 },
      VOLATILITY: { level: 1.3 }
    };
  }

  /**
   * Defaults públicos, mesclando com INDICATORS_CONFIG quando disponível,
   * mantendo compatibilidade com o shape anterior.
   */
  getDefaultParams() {
    const base = this._internalDefaultParams();

    // Tenta ler de INDICATORS_CONFIG se existir algo compatível
    const cfg = INDICATORS_CONFIG?.DEFAULTS || INDICATORS_CONFIG || {};

    return {
      RSI: { period: cfg?.RSI?.period ?? base.RSI.period },
      MACD: {
        fastPeriod: cfg?.MACD?.fastPeriod ?? base.MACD.fastPeriod,
        slowPeriod: cfg?.MACD?.slowPeriod ?? base.MACD.slowPeriod,
        signalPeriod: cfg?.MACD?.signalPeriod ?? base.MACD.signalPeriod
      },
      MA: {
        shortPeriod: cfg?.MA?.shortPeriod ?? base.MA.shortPeriod,
        longPeriod: cfg?.MA?.longPeriod ?? base.MA.longPeriod
      },
      // Mantém compatibilidade: pode voltar como número (antes era 1.3)
      VOLATILITY: cfg?.VOLATILITY?.level ?? cfg?.VOLATILITY ?? base.VOLATILITY.level
    };
  }

  /**
   * Otimiza parâmetros em segundo plano; ao concluir, recalcula indicadores com os
   * novos parâmetros e atualiza o cache (sem quebrar compatibilidade).
   */
  async optimizeInBackground(data, symbol, timeframe) {
    const optimizationKey = `${symbol}:${timeframe}`;
    const now = Date.now();

    // Cooldown simples para evitar reinícios imediatos após timeout/erro
    const lastAttempt = this.lastOptimizationAttempt.get(optimizationKey) || 0;
    if (now - lastAttempt < 15_000) {
      console.log(`[${optimizationKey}] Otimização em cooldown — aguardando antes de nova tentativa`);
      return null;
    }
    this.lastOptimizationAttempt.set(optimizationKey, now);

    try {
      if (this.optimizationInProgress.has(optimizationKey)) {
        console.log(`[${optimizationKey}] Otimização já em andamento, ignorando nova solicitação`);
        return null;
      }

      this.optimizationInProgress.add(optimizationKey);
      console.log(`[${optimizationKey}] Iniciando otimização em segundo plano...`);
      console.log(`[${optimizationKey}] 🔧 Iniciando otimização de indicadores...`);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite de otimização excedido')), 10_000)
      );

      // Executa a otimização com timeout
      const optimizationPromise = indicatorOptimizer.optimizeIndicators(data, symbol, timeframe);
      const optimizedParams = await Promise.race([optimizationPromise, timeoutPromise]);

      if (optimizedParams) {
        console.log(`[${optimizationKey}] ✅ Parâmetros otimizados:`, {
          RSI: optimizedParams.RSI?.period,
          MACD: `${optimizedParams.MACD?.fastPeriod}/${optimizedParams.MACD?.slowPeriod}/${optimizedParams.MACD?.signalPeriod}`,
          MA: `${optimizedParams.MA?.shortPeriod}/${optimizedParams.MA?.longPeriod}`,
          volatility: optimizedParams.VOLATILITY?.level ?? optimizedParams.VOLATILITY
        });

        // Recalcula indicadores com os novos parâmetros e atualiza o cache
        const norm = this.normalizeParams(optimizedParams);
        const recalculated = {
          rsi: this.calculateRSI(data, norm.RSI.period),
          macd: this.calculateMACD(data, norm.MACD.fastPeriod, norm.MACD.slowPeriod, norm.MACD.signalPeriod),
          ma21: this.calculateMA(data.close, norm.MA.shortPeriod),
          ma200: this.calculateMA(data.close, norm.MA.longPeriod),
          volatility: norm.VOLATILITY,
          optimizedParams: optimizedParams,
          lastOptimized: new Date()
        };

        const cacheKey = `${symbol}:${timeframe}`;
        this.indicatorCache.set(cacheKey, {
          indicators: recalculated,
          timestamp: Date.now(),
          lastClose: data.close[data.close.length - 1],
          length: data.close.length
        });

        console.log(`[${optimizationKey}] ✅ Cache atualizado com indicadores otimizados`);
      } else {
        console.log(`[${optimizationKey}] ⚠️ Otimização retornou null - usando parâmetros padrão`);
      }

      return optimizedParams ?? null;
    } catch (error) {
      console.error(`[${optimizationKey}] ❌ Erro na otimização em segundo plano:`, error?.message || error);
      return null;
    } finally {
      this.optimizationInProgress.delete(optimizationKey);
    }
  }
}

export default new TechnicalAnalysisService();
