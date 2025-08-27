/**
 * Serviço de análise técnica
 */

import technicalindicators from 'technicalindicators';
import { INDICATORS_CONFIG } from '../config/constants.js';
import indicatorOptimizer from './indicatorOptimizer.js';

class TechnicalAnalysisService {
  constructor() {
    this.indicatorCache = new Map();
    this.optimizationInProgress = new Set(); // Para controlar otimizações em andamento
  }

  /**
   * Calcula todos os indicadores técnicos com parâmetros otimizados
   */
  async calculateIndicators(data, symbol = 'UNKNOWN', timeframe = '1h') {
    const logPrefix = `[${symbol} ${timeframe}]`;
    
    try {
      // Validação de dados mais flexível
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

      // Verifica cache
      const cacheKey = `${symbol}:${timeframe}`;
      const cached = this.indicatorCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 60 * 60 * 1000)) {
        console.log(`${logPrefix} ✅ Usando cache de indicadores`);
        return cached.indicators;
      }

      console.log(`${logPrefix} Calculando indicadores para ${data.close.length} candles...`);
      
      // Usa parâmetros padrão inicialmente
      const indicators = {
        rsi: this.safeCalculate(() => this.calculateRSI(data, 14), 'RSI'),
        macd: this.safeCalculate(() => this.calculateMACD(data, 12, 26, 9), 'MACD'),
        ma21: this.safeCalculate(() => this.calculateMA(data.close, 21), 'MA21'),
        ma200: this.safeCalculate(() => this.calculateMA(data.close, 200), 'MA200'),
        volatility: 1.5, // Valor padrão
        optimizedParams: this.getDefaultParams()
      };

      console.log(`${logPrefix} ✅ Indicadores calculados:`, {
        rsi: indicators.rsi,
        macd: indicators.macd ? 'OK' : 'Falha',
        ma21: indicators.ma21,
        ma200: indicators.ma200
      });

      // Tenta otimizar os parâmetros em segundo plano
      this.optimizeInBackground(data, symbol, timeframe).catch(error => {
        console.error(`${logPrefix} ❌ Falha na otimização em segundo plano:`, error);
      });

      // Atualiza cache
      this.indicatorCache.set(cacheKey, { indicators, timestamp: Date.now() });
      return indicators;
      
    } catch (error) {
      console.error(`${logPrefix} ❌ Erro ao calcular indicadores:`, error);
      return null;
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

      // RSI - Limiares ajustados para maior sensibilidade
      if (indicators.rsi !== undefined && indicators.rsi !== null) {
        totalIndicators++;
        if (indicators.rsi > 55) bullishScore++;      // Reduzido de 60 para 55
        else if (indicators.rsi < 45) bearishScore++; // Aumentado de 40 para 45
      }

      // MACD - Mais sensível a cruzamentos
      if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
        totalIndicators++;
        const macdDiff = indicators.macd.MACD - indicators.macd.signal;
        if (Math.abs(macdDiff) > 0.001) {  // Limiar reduzido para detectar mais sinais
          if (macdDiff > 0) bullishScore++;
          else bearishScore++;
        }
      }

      // Médias Móveis - Mais sensível a cruzamentos
      if (indicators.ma21 !== null && indicators.ma200 !== null) {
        totalIndicators++;
        const maDiff = (indicators.ma21 - indicators.ma200) / indicators.ma200 * 100;
        if (Math.abs(maDiff) > 0.5) {  // Limiar percentual reduzido
          if (indicators.ma21 > indicators.ma200) bullishScore++;
          else bearishScore++;
        }
      }

      // Se não há indicadores suficientes, retorna NEUTRAL
      if (totalIndicators === 0) return 'NEUTRAL';

      // Limiar de confirmação reduzido para 60% (era 66%)
      const bullishPercentage = (bullishScore / totalIndicators) * 100;
      const bearishPercentage = (bearishScore / totalIndicators) * 100;

      if (bullishPercentage >= 60) return 'BULLISH';
      if (bearishPercentage >= 60) return 'BEARISH';
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
        console.error(`❌ Dados insuficientes para calcular MACD(${fastPeriod},${slowPeriod},${signalPeriod}): ${data?.close?.length || 0} candles`);
        return null;
      }
      
      // Verifica se todos os valores de fechamento são números válidos
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
      
      if (!macd || typeof macd.MACD !== 'number' || !isFinite(macd.MACD) || 
          typeof macd.signal !== 'number' || !isFinite(macd.signal) ||
          typeof macd.histogram !== 'number' || !isFinite(macd.histogram)) {
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
      // Se não temos candles suficientes para o período solicitado, ajustamos para o máximo possível
      const maxPeriod = Math.min(period, values.length);
      
      if (maxPeriod < 10) { // Mínimo de 10 períodos para um cálculo significativo
        console.error(`❌ Dados insuficientes para calcular MA(${period}): apenas ${values.length} candles disponíveis`);
        return null;
      }
      
      // Se o período foi ajustado, registra um aviso
      if (maxPeriod < period) {
        console.warn(`⚠️ Ajustando período de MA de ${period} para ${maxPeriod} (dados insuficientes)`);
      }
      
      // Verifica se todos os valores são números válidos
      const validValues = values.slice(-maxPeriod).filter(v => typeof v === 'number' && isFinite(v));
      
      if (validValues.length !== maxPeriod) {
        console.warn(`⚠️ ${maxPeriod - validValues.length} valores inválidos removidos para cálculo da MA(${maxPeriod})`);
      }
      
      if (validValues.length < 10) { // Mínimo absoluto de 10 valores
        console.error(`❌ Dados insuficientes após limpeza para MA(${maxPeriod}): ${validValues.length} valores`);
        return null;
      }
      
      const maValues = technicalindicators.SMA.calculate({
        values: validValues,
        period: validValues.length // Usa todos os valores válidos disponíveis
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

  getDefaultParams() {
    // Parâmetros ajustados para maior sensibilidade
    return {
      RSI: { period: 10 },  // Reduzido de 14 para 10 para maior sensibilidade
      MACD: { 
        fastPeriod: 10,    // Reduzido de 12 para 10
        slowPeriod: 22,    // Reduzido de 26 para 22
        signalPeriod: 7    // Reduzido de 9 para 7
      },
      MA: { 
        shortPeriod: 14,   // Reduzido de 21 para 14
        longPeriod: 180    // Reduzido de 200 para 180
      },
      VOLATILITY: 1.3      // Reduzido de 1.5 para 1.3
    };
  }

  async optimizeInBackground(data, symbol, timeframe) {
    // Move optimizationKey to method scope
    const optimizationKey = `${symbol}:${timeframe}`;
    
    try {
      // Verifica se já existe uma otimização em andamento para este par (symbol, timeframe)
      
      // Se já existe uma otimização em andamento, não inicia uma nova
      if (this.optimizationInProgress.has(optimizationKey)) {
        console.log(`[${optimizationKey}] Otimização já em andamento, ignorando nova solicitação`);
        return;
      }
      
      // Marca que uma otimização está em andamento
      this.optimizationInProgress.add(optimizationKey);
      
      console.log(`[${optimizationKey}] Iniciando otimização em segundo plano...`);
      
      // Define um timeout para garantir que a otimização não trave o sistema
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tempo limite de otimização excedido')), 30000)
      );
      
      // Executa a otimização com timeout
      const optimizationPromise = indicatorOptimizer.optimizeIndicators(data, symbol, timeframe);
      const optimizedParams = await Promise.race([optimizationPromise, timeoutPromise]);
      
      // Atualiza os parâmetros otimizados
      if (optimizedParams) {
        console.log(`[${optimizationKey}] Parâmetros otimizados com sucesso`);
        
        // Atualiza o cache de indicadores com os novos parâmetros
        const cacheKey = `${symbol}:${timeframe}`;
        const currentCache = this.indicatorCache.get(cacheKey) || { indicators: {} };
        
        // Atualiza apenas os parâmetros otimizados, mantendo os demais dados
        this.indicatorCache.set(cacheKey, {
          ...currentCache,
          indicators: {
            ...currentCache.indicators,
            optimizedParams: optimizedParams,
            lastOptimized: new Date()
          },
          timestamp: Date.now()
        });
        
        console.log(`[${optimizationKey}] Cache de indicadores atualizado com sucesso`);
      }
      
      return optimizedParams;
      
    } catch (error) {
      console.error(`[${optimizationKey}] ❌ Erro na otimização em segundo plano:`, error);
      return null;
    } finally {
      // Remove a marca de otimização em andamento
      this.optimizationInProgress.delete(optimizationKey);
    }
  }
}

export default new TechnicalAnalysisService();