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
    try {
      // Score baseado na efetividade do RSI para detectar reversões
      let score = 0;
      
      // RSI em zonas extremas tem maior valor
      if (currentRsi <= 30) {
        score = 100 - currentRsi; // Quanto menor, melhor para compra
      } else if (currentRsi >= 70) {
        score = currentRsi - 30; // Quanto maior, melhor para venda
      } else {
        score = 50 - Math.abs(currentRsi - 50); // Penaliza zona neutra
      }
      
      // Ajusta por volatilidade
      score *= (1 + volatility * 0.1);
      
      // Ajusta por período (períodos menores são mais sensíveis)
      score *= (20 / period);
      
      return Math.max(0, score);
    } catch (error) {
      console.error('Erro ao calcular score RSI:', error);
      return 0;
    }
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
    try {
      if (!current || typeof current.histogram !== 'number') {
        return 0;
      }
      
      // Score baseado na força do histograma e cruzamentos
      let score = 0;
      
      // Força do histograma
      const histogramStrength = Math.abs(current.histogram) * 1000000; // Amplifica valores pequenos
      score += histogramStrength * 10;
      
      // Cruzamento MACD vs Signal
      if (current.MACD && current.signal) {
        const crossover = current.MACD - current.signal;
        if (Math.abs(crossover) > 0.000001) {
          score += Math.abs(crossover) * 1000000 * 5;
        }
      }
      
      // Ajusta por volatilidade
      score *= (1 + volatility * 0.2);
      
      return Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error('Erro ao calcular score MACD:', error);
      return 0;
    }
  }

  async optimizeMovingAverages(historicalData, volatility) {
    try {
      console.log('🔧 Otimizando Médias Móveis...');
      
      // Testa diferentes combinações de períodos
      const shortPeriods = [10, 14, 18, 21];
      const longPeriods = [150, 180, 200];
      
      let bestScore = -1;
      let bestShort = 14;
      let bestLong = 180;
      
      for (const shortPeriod of shortPeriods) {
        for (const longPeriod of longPeriods) {
          if (longPeriod <= shortPeriod || historicalData.close.length < longPeriod) continue;
          
          try {
            const shortMA = technicalindicators.SMA.calculate({
              values: historicalData.close,
              period: shortPeriod
            });
            
            const longMA = technicalindicators.SMA.calculate({
              values: historicalData.close,
              period: longPeriod
            });
            
            if (shortMA.length > 0 && longMA.length > 0) {
              const score = this.calculateMAScore(shortMA, longMA, volatility);
              
              if (score > bestScore) {
                bestScore = score;
                bestShort = shortPeriod;
                bestLong = longPeriod;
              }
            }
          } catch (error) {
            console.warn(`Erro ao testar MA ${shortPeriod}/${longPeriod}:`, error.message);
          }
        }
      }
      
      // Ajusta diferença mínima baseada na volatilidade
      const minDiffPercent = volatility > 2 ? 1.0 : volatility > 1 ? 0.7 : 0.5;
      
      console.log(`✅ MA otimizada: ${bestShort}/${bestLong} (score: ${bestScore.toFixed(2)})`);
      
      return {
        shortPeriod: bestShort,
        longPeriod: bestLong,
        minDiffPercent: minDiffPercent
      };
    } catch (error) {
      console.error('❌ Erro ao otimizar MA:', error);
      return { shortPeriod: 14, longPeriod: 180, minDiffPercent: 0.5 };
    }
  }

  /**
   * Calcula score das médias móveis
   */
  calculateMAScore(shortMA, longMA, volatility) {
    try {
      if (!shortMA.length || !longMA.length) return 0;
      
      const currentShort = shortMA[shortMA.length - 1];
      const currentLong = longMA[longMA.length - 1];
      
      // Score baseado na separação das médias
      const separation = Math.abs(currentShort - currentLong) / currentLong * 100;
      let score = separation * 10;
      
      // Bônus para cruzamentos recentes
      if (shortMA.length >= 2 && longMA.length >= 2) {
        const prevShort = shortMA[shortMA.length - 2];
        const prevLong = longMA[longMA.length - 2];
        
        const currentCross = currentShort > currentLong;
        const prevCross = prevShort > prevLong;
        
        if (currentCross !== prevCross) {
          score += 20; // Bônus para cruzamento
        }
      }
      
      // Ajusta por volatilidade
      score *= (1 + volatility * 0.1);
      
      return Math.max(0, Math.min(100, score));
    } catch (error) {
      console.error('Erro ao calcular score MA:', error);
      return 0;
    }
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
