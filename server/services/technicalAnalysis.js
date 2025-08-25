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
    try {
      if (!this.validateData(data)) {
        return {};
      }

      const cacheKey = `${symbol}:${timeframe}`;
      const cached = this.indicatorCache.get(cacheKey);
      
      // Usa cache se disponível e recente (menos de 1 hora)
      if (cached && (Date.now() - new Date(cached.timestamp).getTime() < 60 * 60 * 1000)) {
        return cached.indicators;
      }

      // Obtém parâmetros otimizados
      const optimizedParams = await indicatorOptimizer.optimizeIndicators(data, symbol, timeframe);
      
      const indicators = {
        rsi: this.calculateRSI(data, optimizedParams.RSI.period),
        macd: this.calculateMACD(data, 
          optimizedParams.MACD.fastPeriod, 
          optimizedParams.MACD.slowPeriod, 
          optimizedParams.MACD.signalPeriod
        ),
        ma21: this.calculateMA(data.close, optimizedParams.MA.shortPeriod),
        ma200: this.calculateMA(data.close, optimizedParams.MA.longPeriod),
        volatility: optimizedParams.VOLATILITY,
        optimizedParams
      };

      // Atualiza cache
      this.indicatorCache.set(cacheKey, {
        indicators,
        timestamp: new Date()
      });

      return indicators;
    } catch (error) {
      console.error('❌ Erro ao calcular indicadores:', error);
      return {};
    }
  }

  validateData(data) {
    if (!data?.close?.length || data.close.length < 50) {
      console.error('❌ Dados insuficientes para análise técnica');
      return false;
    }
    return true;
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