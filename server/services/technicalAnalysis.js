/**
 * Serviço de análise técnica
 */

import technicalindicators from 'technicalindicators';
import { INDICATORS_CONFIG } from '../config/constants.js';
import indicatorOptimizer from './indicatorOptimizer.js';

class TechnicalAnalysisService {
  constructor() {
    this.indicatorCache = new Map();
  }

  /**
   * Calcula todos os indicadores técnicos com parâmetros otimizados
   */
  async calculateIndicators(data, symbol = 'UNKNOWN', timeframe = '1h') {
    const logPrefix = `[${symbol} ${timeframe}]`;
    
    try {
      // Valida dados de entrada
      if (!this.validateData(data)) {
        console.error(`${logPrefix} ❌ Dados inválidos`);
        return {};
      }

      // Verifica cache
      const cacheKey = `${symbol}:${timeframe}`;
      const cached = this.indicatorCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 60 * 60 * 1000)) {
        console.log(`${logPrefix} ✅ Usando cache`);
        return cached.indicators;
      }

      // Obtém parâmetros otimizados
      let optimizedParams;
      try {
        optimizedParams = await indicatorOptimizer.optimizeIndicators(data, symbol, timeframe);
      } catch (error) {
        console.error(`${logPrefix} ❌ Erro ao otimizar parâmetros:`, error.message);
        optimizedParams = indicatorOptimizer.getDefaultParams();
      }

      // Calcula indicadores
      const indicators = {
        rsi: this.safeCalculate(() => this.calculateRSI(data, optimizedParams.RSI.period), 'RSI'),
        macd: this.safeCalculate(() => this.calculateMACD(
          data, 
          optimizedParams.MACD.fastPeriod, 
          optimizedParams.MACD.slowPeriod, 
          optimizedParams.MACD.signalPeriod
        ), 'MACD'),
        ma21: this.safeCalculate(() => this.calculateMA(data.close, optimizedParams.MA.shortPeriod), 'MA21'),
        ma200: this.safeCalculate(() => this.calculateMA(data.close, optimizedParams.MA.longPeriod), 'MA200'),
        volatility: optimizedParams.VOLATILITY,
        optimizedParams
      };

      // Atualiza cache
      this.indicatorCache.set(cacheKey, { indicators, timestamp: Date.now() });
      return indicators;
      
    } catch (error) {
      console.error(`${logPrefix} ❌ Erro ao calcular indicadores:`, error);
      return {};
    }
  }

  // Função auxiliar para cálculo seguro com tratamento de erro
  safeCalculate(calcFn, indicatorName) {
    try {
      const result = calcFn();
      console.log(`✅ ${indicatorName} calculado com sucesso`);
      return result;
    } catch (error) {
      console.error(`❌ Erro ao calcular ${indicatorName}:`, error.message);
      return null;
    }
  }

  /**
   * Detecta a tendência do mercado com base nos indicadores técnicos
   * @param {Object} indicators - Objeto contendo os indicadores técnicos
   * @returns {string} - 'BULLISH', 'BEARISH' ou 'NEUTRAL'
   */
  detectTrend(indicators) {
    try {
      if (!indicators) return 'NEUTRAL';

      let bullishScore = 0;
      let bearishScore = 0;
      let totalIndicators = 0;

      // RSI
      if (indicators.rsi !== undefined && indicators.rsi !== null) {
        totalIndicators++;
        if (indicators.rsi > 60) bullishScore++;
        else if (indicators.rsi < 40) bearishScore++;
      }

      // MACD
      if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
        totalIndicators++;
        if (indicators.macd.MACD > indicators.macd.signal) bullishScore++;
        else bearishScore++;
      }

      // Médias Móveis
      if (indicators.ma21 !== null && indicators.ma200 !== null) {
        totalIndicators++;
        if (indicators.ma21 > indicators.ma200) bullishScore++;
        else bearishScore++;
      }

      // Se não há indicadores suficientes, retorna NEUTRAL
      if (totalIndicators === 0) return 'NEUTRAL';

      // Calcula a porcentagem de confirmação de tendência
      const bullishPercentage = (bullishScore / totalIndicators) * 100;
      const bearishPercentage = (bearishScore / totalIndicators) * 100;

      // Define a tendência com base nos indicadores
      if (bullishPercentage >= 66) return 'BULLISH';
      if (bearishPercentage >= 66) return 'BEARISH';
      return 'NEUTRAL';
      
    } catch (error) {
      console.error('❌ Erro ao detectar tendência:', error);
      return 'NEUTRAL';
    }
  }

  validateData(data) {
    try {
      // Verifica se o objeto de dados existe
      if (!data) {
        console.error('❌ Dados não fornecidos para validação');
        return false;
      }

      // Verifica se os arrays necessários existem
      const requiredArrays = ['open', 'high', 'low', 'close', 'volume'];
      const minLength = 50; // Mínimo de candles necessários
      
      // Verifica arrays obrigatórios
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

      // Verifica consistência nos tamanhos dos arrays
      const firstLength = data.close.length;
      for (const key of requiredArrays) {
        if (data[key].length !== firstLength) {
          console.error(`❌ Tamanho inconsistente: ${key} tem ${data[key].length} itens, esperado ${firstLength}`);
          return false;
        }
      }

      // Verifica valores inválidos nos primeiros e últimos 5 candles
      const checkIndices = [
        ...Array(5).fill().map((_, i) => i), // Primeiros 5
        ...Array(5).fill().map((_, i) => data.close.length - 5 + i) // Últimos 5
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

        // Verifica valores numéricos válidos
        for (const [key, value] of Object.entries(candle)) {
          if (typeof value !== 'number' || !isFinite(value) || value < 0) {
            console.error(`❌ Valor inválido em ${key}[${i}]:`, value);
            return false;
          }
        }

        // Verifica consistência dos preços
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
      console.error('❌ Erro ao validar dados:', error);
      return false;
    }
  }

  calculateRSI(data, period = 14) {
    try {
      return technicalindicators.RSI.calculate({
        values: data.close,
        period
      }).pop();
    } catch (error) {
      console.error('❌ Erro ao calcular RSI:', error);
      return null;
    }
  }

  calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    try {
      const macd = technicalindicators.MACD.calculate({
        values: data.close,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
      return macd.pop();
    } catch (error) {
      console.error('❌ Erro ao calcular MACD:', error);
      return null;
    }
  }

  calculateMA(values, period) {
    try {
      const ma = technicalindicators.SMA.calculate({
        values,
        period
      });
      return ma.pop();
    } catch (error) {
      console.error(`❌ Erro ao calcular MA(${period}):`, error);
      return null;
    }
  }
}

export default new TechnicalAnalysisService();