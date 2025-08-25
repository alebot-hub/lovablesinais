/**
 * Serviço para otimização de indicadores técnicos
 */

import technicalindicators from 'technicalindicators';
import { INDICATORS_CONFIG } from '../config/constants.js';
import { Logger } from './logger.js';

const logger = new Logger('IndicatorOptimizer');

class IndicatorOptimizer {
  constructor() {
    this.optimizedParams = new Map();
    this.volatilityThresholds = { low: 0.5, high: 2.0 };
  }

  /**
   * Otimiza indicadores para um ativo específico
   */
  async optimizeIndicators(historicalData, symbol, timeframe) {
    try {
      if (!historicalData?.close?.length || historicalData.close.length < 50) {
        logger.warn(`Dados insuficientes para ${symbol} (${timeframe}): ${historicalData?.close?.length || 0} candles`);
        return this.getDefaultParams();
      }

      const cacheKey = `${symbol}:${timeframe}`;
      const cached = this.optimizedParams.get(cacheKey);
      
      // Usa cache se disponível e recente (menos de 1 hora)
      if (cached && (Date.now() - new Date(cached.lastUpdated).getTime() < 60 * 60 * 1000)) {
        logger.info(`Usando parâmetros em cache para ${cacheKey}`);
        return cached;
      }

      logger.info(`Otimizando indicadores para ${cacheKey}...`);
      
      const volatility = this.calculateVolatility(historicalData);
      
      // Tenta otimizar cada indicador individualmente
      let optimized = {
        RSI: await this.optimizeRSI(historicalData, volatility).catch(err => {
          logger.error(`Erro ao otimizar RSI para ${cacheKey}:`, err);
          return this.getDefaultParams().RSI;
        }),
        
        MACD: await this.optimizeMACD(historicalData, volatility).catch(err => {
          logger.error(`Erro ao otimizar MACD para ${cacheKey}:`, err);
          return this.getDefaultParams().MACD;
        }),
        
        MA: await this.optimizeMovingAverages(historicalData, volatility).catch(err => {
          logger.error(`Erro ao otimizar Médias Móveis para ${cacheKey}:`, err);
          return this.getDefaultParams().MA;
        }),
        
        VOLATILITY: {
          value: volatility,
          level: this.getVolatilityLevel(volatility)
        },
        lastUpdated: new Date()
      };

      // Valida os parâmetros otimizados
      if (!optimized.RSI || !optimized.MACD || !optimized.MA) {
        logger.warn(`Falha na otimização para ${cacheKey}, usando parâmetros padrão`);
        return this.getDefaultParams();
      }

      this.optimizedParams.set(cacheKey, optimized);
      logger.info(`Parâmetros otimizados para ${cacheKey}:`, {
        RSI: optimized.RSI.period,
        MACD: `${optimized.MACD.fastPeriod}/${optimized.MACD.slowPeriod}/${optimized.MACD.signalPeriod}`,
        MA: `${optimized.MA.shortPeriod}/${optimized.MA.longPeriod}`,
        volatility: `${volatility.toFixed(2)}% (${this.getVolatilityLevel(volatility)})`
      });
      
      return optimized;
    } catch (error) {
      logger.error(`Erro crítico na otimização para ${symbol} (${timeframe}):`, error);
      return this.getDefaultParams();
    }
  }

  calculateVolatility(data) {
    try {
      const atr = technicalindicators.ATR.calculate({
        high: data.high,
        low: data.low,
        close: data.close,
        period: 14
      });
      return atr?.length ? (atr[atr.length - 1] / data.close[data.close.length - 1]) * 100 : 0;
    } catch (error) {
      logger.error('Erro ao calcular volatilidade:', error);
      return 0;
    }
  }

  getVolatilityLevel(volatility) {
    return volatility > this.volatilityThresholds.high ? 'HIGH' : 
           volatility < this.volatilityThresholds.low ? 'LOW' : 'NORMAL';
  }

  async optimizeRSI(data, volatility) {
    const periods = [7, 14, 21];
    let bestScore = -1;
    let bestPeriod = 14;
    
    for (const period of periods) {
      const rsi = technicalindicators.RSI.calculate({
        values: data.close,
        period
      });
      const score = this.evaluateRSIQuality(rsi);
      if (score > bestScore) {
        bestScore = score;
        bestPeriod = period;
      }
    }
    
    // Ajuste por volatilidade
    if (volatility > this.volatilityThresholds.high) {
      bestPeriod = Math.min(bestPeriod + 2, 30);
    } else if (volatility < this.volatilityThresholds.low) {
      bestPeriod = Math.max(bestPeriod - 2, 7);
    }
    
    return { period: bestPeriod };
  }

  evaluateRSIQuality(rsiValues) {
    if (!rsiValues?.length) return 0;
    return rsiValues.filter(v => v > 30 && v < 70).length / rsiValues.length;
  }

  async optimizeMACD(historicalData, volatility) {
    // Implementação simplificada
    return { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 };
  }

  async optimizeMovingAverages(historicalData, volatility) {
    // Implementação simplificada
    return { shortPeriod: 21, longPeriod: 50 };
  }

  getDefaultParams() {
    return {
      RSI: { period: 14 },
      MACD: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      MA: { shortPeriod: 21, longPeriod: 50 },
      VOLATILITY: { value: 0, level: 'NORMAL' },
      lastUpdated: new Date()
    };
  }
}

export default new IndicatorOptimizer();
