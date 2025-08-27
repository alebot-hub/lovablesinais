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
    const cacheKey = `${symbol}:${timeframe}`;
    console.log(`[${cacheKey}] 🔧 Iniciando otimização de indicadores...`);
    
    try {
      // Validação robusta dos dados de entrada
      if (!historicalData?.close?.length || historicalData.close.length < 50) {
        const errorMsg = `Dados insuficientes para ${cacheKey}: ${historicalData?.close?.length || 0} candles`;
        console.warn(`[${cacheKey}] ⚠️ ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Validação adicional dos dados
      const requiredProps = ['open', 'high', 'low', 'close', 'volume'];
      for (const prop of requiredProps) {
        if (!Array.isArray(historicalData[prop]) || historicalData[prop].length !== historicalData.close.length) {
          const errorMsg = `Dados inválidos para ${cacheKey}: propriedade ${prop} inválida`;
          console.error(`[${cacheKey}] ❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }

      // Verifica cache com timeout mais curto (30 minutos)
      const cached = this.optimizedParams.get(cacheKey);
      const CACHE_TIMEOUT = 30 * 60 * 1000; // 30 minutos
      
      if (cached && (Date.now() - new Date(cached.lastUpdated).getTime() < CACHE_TIMEOUT)) {
        console.log(`[${cacheKey}] 📦 Usando parâmetros em cache`);
        return cached;
      }

      console.log(`[${cacheKey}] ⚙️ Otimizando indicadores...`);
      
      // Cálculo de volatilidade com tratamento de erro
      let volatility;
      try {
        volatility = this.calculateVolatility(historicalData);
        if (isNaN(volatility) || !isFinite(volatility)) {
          throw new Error('Volatilidade inválida');
        }
      } catch (error) {
        console.error(`[${cacheKey}] ❌ Erro ao calcular volatilidade:`, error.message);
        volatility = 1.0; // Valor padrão seguro
      }
      
      // Timeout para evitar travamentos
      const OPTIMIZATION_TIMEOUT = 5000; // 5 segundos (reduzido)
      
      // Função com timeout para evitar travamentos
      const withTimeout = (promise, ms) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout de ${ms}ms excedido`)), ms)
          )
        ]);
      };
      
      console.log(`[${cacheKey}] 🔧 Otimizando RSI, MACD e MA...`);
      
      // Otimização com timeout
      const optimizationPromises = {
        RSI: withTimeout(this.optimizeRSI(historicalData, volatility), OPTIMIZATION_TIMEOUT)
          .catch(err => {
            console.error(`[${cacheKey}] ❌ Erro ao otimizar RSI:`, err.message);
            return this.getDefaultParams().RSI;
          }),
          
        MACD: withTimeout(this.optimizeMACD(historicalData, volatility), OPTIMIZATION_TIMEOUT)
          .catch(err => {
            console.error(`[${cacheKey}] ❌ Erro ao otimizar MACD:`, err.message);
            return this.getDefaultParams().MACD;
          }),
          
        MA: withTimeout(this.optimizeMovingAverages(historicalData, volatility), OPTIMIZATION_TIMEOUT)
          .catch(err => {
            console.error(`[${cacheKey}] ❌ Erro ao otimizar MA:`, err.message);
            return this.getDefaultParams().MA;
          })
      };
      
      // Aguarda todas as otimizações com timeout
      const [rsi, macd, ma] = await Promise.all([
        optimizationPromises.RSI,
        optimizationPromises.MACD,
        optimizationPromises.MA
      ]);
      
      // Monta o objeto de resultado
      const optimized = {
        RSI: rsi,
        MACD: macd,
        MA: ma,
        VOLATILITY: {
          value: volatility,
          level: this.getVolatilityLevel(volatility)
        },
        lastUpdated: new Date()
      };

      // Valida os resultados
      if (!optimized.RSI || !optimized.MACD || !optimized.MA) {
        console.warn(`[${cacheKey}] ⚠️ Falha na otimização, usando parâmetros padrão`);
        return this.getDefaultParams();
      }

      // Atualiza cache
      this.optimizedParams.set(cacheKey, optimized);
      
      console.log(`[${cacheKey}] ✅ Otimização concluída: RSI=${optimized.RSI.period}, MACD=${optimized.MACD.fastPeriod}/${optimized.MACD.slowPeriod}/${optimized.MACD.signalPeriod}`);
      
      return optimized;
      
    } catch (error) {
      console.error(`[${cacheKey}] ❌ Erro crítico na otimização:`, error.message);
      // Retorna parâmetros padrão em caso de erro
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

  async optimizeRSI(data, volatility = 1.0) {
    try {
      // Intervalos de otimização ajustados para períodos mais curtos
      const periods = [8, 9, 10, 11, 12];  // Períodos mais curtos
      let bestScore = -1;
      let bestPeriod = 14;
      
      for (const period of periods) {
        const rsi = technicalindicators.RSI.calculate({
          values: data.close,
          period: period
        });
        
        if (!rsi || rsi.length === 0) continue;
        
        const currentRsi = rsi[rsi.length - 1];
        const score = this.calculateRSIScore(currentRsi, period, volatility);
        
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
      
      return {
        period: bestPeriod,
        overbought: 70,  // Limiares fixos para evitar oscilações
        oversold: 30
      };
      
    } catch (error) {
      console.error('❌ Erro ao otimizar RSI:', error);
      return this.getDefaultParams().RSI;
    }
  }

  calculateRSIScore(currentRsi, period, volatility) {
    // Implementação simplificada
    return currentRsi / period * volatility;
  }

  async optimizeMACD(data, volatility = 1.0) {
    try {
      // Combinações mais sensíveis
      const fastPeriods = [8, 9, 10, 11, 12];
      const slowPeriods = [20, 21, 22, 23, 24];
      const signalPeriods = [6, 7, 8, 9];
      
      let bestScore = -1;
      let bestFastPeriod = 12;
      let bestSlowPeriod = 26;
      let bestSignalPeriod = 9;
      
      for (const fast of fastPeriods) {
        for (const slow of slowPeriods) {
          if (slow <= fast) continue; // slow deve ser maior que fast
          
          for (const signal of signalPeriods) {
            const macd = technicalindicators.MACD.calculate({
              values: data.close,
              fastPeriod: fast,
              slowPeriod: slow,
              signalPeriod: signal,
              SimpleMAOscillator: false,
              SimpleMASignal: false
            });
            
            if (!macd || macd.length === 0) continue;
            
            const current = macd[macd.length - 1];
            const score = this.calculateMACDScore(current, volatility);
            
            if (score > bestScore) {
              bestScore = score;
              bestFastPeriod = fast;
              bestSlowPeriod = slow;
              bestSignalPeriod = signal;
            }
          }
        }
      }
      
      return {
        fastPeriod: bestFastPeriod,
        slowPeriod: bestSlowPeriod,
        signalPeriod: bestSignalPeriod,
        minStrength: 0.0005  // Força mínima reduzida
      };
      
    } catch (error) {
      console.error('❌ Erro ao otimizar MACD:', error);
      return this.getDefaultParams().MACD;
    }
  }

  calculateMACDScore(current, volatility) {
    // Implementação simplificada
    return current.histogram / volatility;
  }

  async optimizeMovingAverages(historicalData, volatility) {
    // Implementação simplificada
    return { shortPeriod: 14, longPeriod: 180, minDiffPercent: 0.5 };
  }

  getDefaultParams() {
    // Parâmetros padrão mais sensíveis
    return {
      RSI: { 
        period: 10,  // Período mais curto para maior sensibilidade
        overbought: 70,  // Limiares ajustados
        oversold: 30
      },
      MACD: {
        fastPeriod: 10,
        slowPeriod: 22,
        signalPeriod: 7,
        minStrength: 0.0005  // Força mínima reduzida
      },
      MA: {
        shortPeriod: 14,
        longPeriod: 180,
        minDiffPercent: 0.5  // Diferença percentual mínima reduzida
      },
      VOLATILITY: 1.3,
      MIN_CONFIRMATIONS: 2,  // Reduzido de 3 para 2 confirmações necessárias
      MIN_VOLUME_RATIO: 1.1  // Reduzido de 1.2 para 1.1
    };
  }
}

export default new IndicatorOptimizer();
