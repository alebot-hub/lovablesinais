/**
 * Serviço de análise de correlação com Bitcoin
 */

import technicalAnalysis from './technicalAnalysis.js';

class BitcoinCorrelationService {
  constructor(binanceService) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis; // Usando a instância importada diretamente
    this.btcCache = {
      data: null,
      trend: null,
      strength: 0,
      timestamp: null,
      cacheTimeout: 5 * 60 * 1000 // 5 minutos
    };
  }

  /**
   * Obtém tendência atual do Bitcoin (com cache)
   */
  async getBitcoinTrend() {
    try {
      const now = Date.now();
      
      // Usa cache se ainda válido (5 minutos)
      if (this.btcCache.data && 
          this.btcCache.timestamp && 
          (now - this.btcCache.timestamp) < (5 * 60 * 1000)) {
        return {
          trend: this.btcCache.trend,
          strength: this.btcCache.strength,
          price: this.btcCache.data.close[this.btcCache.data.close.length - 1],
          cached: true
        };
      }

      console.log('₿ Atualizando análise do Bitcoin...');
      
      // Obtém dados do BTC (últimas 300 velas de 1h)
      const btcData = await this.binanceService.getOHLCVData('BTC/USDT', '1h', 300);
      
      if (!btcData?.close?.length) {
        console.log('⚠️ Dados insuficientes do Bitcoin');
        return { trend: 'NEUTRAL', strength: 0, price: 0, cached: false };
      }

      const formattedData = {
        open: btcData.open,
        high: btcData.high,
        low: btcData.low,
        close: btcData.close,
        volume: btcData.volume || Array(btcData.close.length).fill(1)
      };
      
      // Calcula indicadores com parâmetros otimizados
      const btcIndicators = await this.technicalAnalysis.calculateIndicators(formattedData, 'BTC/USDT', '1h');
      
      if (typeof this.technicalAnalysis.detectTrend === 'function') {
        let btcTrend = this.technicalAnalysis.detectTrend(btcIndicators);
        let btcStrength = this.calculateTrendStrength(btcIndicators, btcData);
        
        // Obtém preço atual e MA200
        const lastPrice = btcData.close[btcData.close.length - 1];
        const ma200 = btcIndicators.ma200 || lastPrice;
        const priceVsMA = ((lastPrice - ma200) / ma200) * 100;
        
        // Ajusta a tendência com base no preço em relação à MA200
        if (priceVsMA > 1.5) {
          btcTrend = 'BULLISH';
          btcStrength = Math.max(btcStrength, 60);
        } else if (priceVsMA < -1.5) {
          btcTrend = 'BEARISH';
          btcStrength = Math.max(btcStrength, 60);
        } else if (btcStrength > 40) {
          // Mantém a tendência se a força for significativa
          btcStrength = Math.min(btcStrength, 70);
        } else {
          btcTrend = 'NEUTRAL';
          btcStrength = 0;
        }
        
        // Atualiza cache
        this.btcCache = {
          data: btcData,
          trend: btcTrend,
          strength: btcStrength,
          timestamp: now,
          cacheTimeout: 5 * 60 * 1000
        };

        console.log(`₿ Bitcoin: ${btcTrend} (força: ${btcStrength}) - $${lastPrice.toFixed(2)} vs MA200(${ma200.toFixed(2)}) ${priceVsMA > 0 ? '+' : ''}${priceVsMA.toFixed(2)}%`);
        
        return {
          trend: btcTrend,
          strength: btcStrength,
          price: lastPrice,
          cached: false,
          indicators: btcIndicators
        };
      }
      
      return { trend: 'NEUTRAL', strength: 0, price: 0, cached: false };
      
    } catch (error) {
      console.error('❌ Erro ao analisar tendência do Bitcoin:', error);
      return { trend: 'NEUTRAL', strength: 0, price: 0, cached: false };
    }
  }

  /**
   * Calcula força da tendência do Bitcoin
   */
  calculateTrendStrength(indicators, data) {
    let strength = 50; // Base neutra

    try {
      // RSI - peso 25%
      if (indicators.rsi) {
        if (indicators.rsi > 70) {
          strength += 20; // Muito bullish
        } else if (indicators.rsi > 60) {
          strength += 15; // Bullish
        } else if (indicators.rsi < 30) {
          strength += 20; // Oversold (potencial alta)
        } else if (indicators.rsi < 40) {
          strength -= 15; // Bearish
        }
      }

      // MACD - peso 25%
      if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
        const macdDiff = indicators.macd.MACD - indicators.macd.signal;
        if (macdDiff > 0) {
          strength += Math.min(20, macdDiff * 1000); // Bullish
        } else {
          strength += Math.max(-20, macdDiff * 1000); // Bearish
        }
      }

      // Médias móveis - peso 30%
      if (indicators.ma21 && indicators.ma200) {
        const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
        if (maDiff > 2) {
          strength += 25; // Tendência de alta forte
        } else if (maDiff > 0.5) {
          strength += 15; // Tendência de alta moderada
        } else if (maDiff < -2) {
          strength -= 25; // Tendência de baixa forte
        } else if (maDiff < -0.5) {
          strength -= 15; // Tendência de baixa moderada
        }
      }

      // Volume - peso 20%
      if (data.volume && data.volume.length >= 20) {
        const currentVolume = data.volume[data.volume.length - 1];
        const avgVolume = data.volume.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const volumeRatio = currentVolume / avgVolume;
        
        if (volumeRatio > 1.5) {
          strength += 10; // Volume alto confirma tendência
        } else if (volumeRatio < 0.7) {
          strength -= 5; // Volume baixo enfraquece tendência
        }
      }

      // Limita entre 0 e 100
      strength = Math.max(0, Math.min(100, strength));

      return Math.round(strength);

    } catch (error) {
      console.error('Erro ao calcular força da tendência BTC:', error.message);
      return 50;
    }
  }

  /**
   * Analisa correlação entre ativo e Bitcoin
   */
  async analyzeCorrelation(symbol, assetTrend, assetData) {
    try {
      console.log(`🔗 Analisando correlação ${symbol} vs Bitcoin...`);

      const btcAnalysis = await this.getBitcoinTrend();
      
      // Log detalhado da análise do BTC
      console.log('🔍 Análise BTC:', {
        trend: btcAnalysis.trend,
        strength: btcAnalysis.strength,
        price: btcAnalysis.price,
        cached: btcAnalysis.cached
      });
      
      // Aplica correlação apenas se a força for significativa
      if (!btcAnalysis || btcAnalysis.strength < 30) {
        console.log(`ℹ️ Correlação não aplicada - Força insuficiente (${btcAnalysis?.strength || 0} < 30)`);
        return {
          btcTrend: 'NEUTRAL',
          btcStrength: 0,
          correlation: 'NEUTRAL',
          bonus: 0,
          penalty: 0,
          recommendation: 'Tendência do Bitcoin muito fraca - foco na análise técnica do ativo'
        };
      }

      // Calcula correlação de preços (últimos 20 períodos)
      const priceCorrelation = await this.calculatePriceCorrelation(symbol, assetData);

      // Determina alinhamento de tendências
      const alignment = this.analyzeTrendAlignment(assetTrend, btcAnalysis.trend, btcAnalysis.strength);

      console.log(`🔗 ${symbol}: Asset=${assetTrend}, BTC=${btcAnalysis.trend} (${btcAnalysis.strength}), Correlação=${priceCorrelation.toFixed(2)}`);

      return {
        btcTrend: btcAnalysis.trend,
        btcStrength: btcAnalysis.strength,
        ...alignment,
        priceCorrelation: priceCorrelation
      };
      
    } catch (error) {
      console.error(`❌ Erro ao analisar correlação ${symbol}:`, error);
      return {
        btcTrend: 'NEUTRAL',
        btcStrength: 0,
        correlation: 'NEUTRAL',
        bonus: 0,
        penalty: 0,
        recommendation: 'Erro na análise de correlação'
      };
    }
  }

  /**
   * Calcula correlação de preços entre ativo e Bitcoin
   */
  async calculatePriceCorrelation(symbol, assetData) {
    try {
      // Usa dados do Bitcoin do cache se disponível
      let btcData = this.btcCache.data;
      
      if (!btcData) {
        btcData = await this.binanceService.getOHLCVData('BTC/USDT', '1h', 50);
      }

      // Validação robusta dos dados
      if (!btcData || !btcData.close || !Array.isArray(btcData.close) ||
          !assetData || !assetData.close || !Array.isArray(assetData.close)) {
        console.warn(`⚠️ Dados inválidos para correlação ${symbol}: BTC=${!!btcData?.close}, Asset=${!!assetData?.close}`);
        return 0;
      }
      
      if (btcData.close.length < 20 || assetData.close.length < 20) {
        console.warn(`⚠️ Dados insuficientes para correlação ${symbol}: BTC=${btcData.close.length}, Asset=${assetData.close.length}`);
        return 0;
      }

      // Pega últimos 20 períodos
      const btcReturns = this.calculateReturns(btcData.close.slice(-20));
      const assetReturns = this.calculateReturns(assetData.close.slice(-20));

      // Calcula correlação de Pearson
      const correlation = this.pearsonCorrelation(btcReturns, assetReturns);

      return isNaN(correlation) ? 0 : correlation;

    } catch (error) {
      console.error(`Erro ao calcular correlação de preços ${symbol}:`, error.message);
      return 0;
    }
  }

  /**
   * Calcula retornos percentuais
   */
  calculateReturns(prices) {
    if (!Array.isArray(prices) || prices.length < 2) {
      console.warn('⚠️ Dados insuficientes para calcular retornos');
      return [];
    }
    
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      if (typeof prices[i] !== 'number' || typeof prices[i-1] !== 'number' || prices[i-1] === 0) {
        continue; // Pula valores inválidos
      }
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * Calcula correlação de Pearson
   */
  pearsonCorrelation(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length === 0 || y.length === 0) {
      console.warn('⚠️ Arrays inválidos para correlação de Pearson');
      return 0;
    }
    
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.slice(0, n).reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < n; i++) {
      if (typeof x[i] !== 'number' || typeof y[i] !== 'number' || 
          !isFinite(x[i]) || !isFinite(y[i])) {
        continue; // Pula valores inválidos
      }
      
      const deltaX = x[i] - meanX;
      const deltaY = y[i] - meanY;
      
      numerator += deltaX * deltaY;
      sumXSquared += deltaX * deltaX;
      sumYSquared += deltaY * deltaY;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Analisa alinhamento de tendências
   */
  analyzeTrendAlignment(assetTrend, btcTrend, btcStrength) {
    console.log(`🔗 Analisando alinhamento: Asset=${assetTrend} vs BTC=${btcTrend} (força: ${btcStrength})`);
    
    // Bitcoin forte (>70) tem mais influência
    const isStrongBtc = btcStrength > 70;
    const isModerateBtc = btcStrength > 50;
    const isWeakBtc = btcStrength <= 50;

    // Se a tendência do ativo estiver alinhada com o Bitcoin
    if (assetTrend === btcTrend) {
      console.log(`✅ Tendências ALINHADAS: ${assetTrend} = ${btcTrend}`);
      
      const alignment = {
        type: `ALIGNED_${btcTrend}`,
        bonus: 15, // AUMENTADO: Bônus maior para alinhamento
        penalty: 0,
        recommendation: `Sinal a favor da tendência do Bitcoin (${btcTrend})`,
        alignment: 'ALIGNED'
      };

      // Bônus maior para tendências fortes
      if (isStrongBtc) {
        alignment.bonus = 25; // AUMENTADO para Bitcoin forte
        alignment.recommendation = `Bitcoin com forte tendência ${btcTrend} - sinal altamente favorável`;
      } else if (isModerateBtc) {
        alignment.bonus = 15;
        alignment.recommendation = `Bitcoin em tendência ${btcTrend} - sinal favorável`;
      } else if (isWeakBtc) {
        alignment.bonus = 8;
        alignment.recommendation = `Tendência fraca do Bitcoin, mas alinhada com o sinal`;
      }

      console.log(`🎯 Bônus de alinhamento: +${alignment.bonus} pontos`);
      return alignment;
    } 
    // Se o ativo estiver neutro
    else if (assetTrend === 'NEUTRAL') {
      console.log(`⚖️ Tendência NEUTRAL - sem correlação`);
      return {
        type: 'NEUTRAL',
        bonus: 0,
        penalty: 0,
        recommendation: 'Tendência neutra - análise técnica prevalece',
        alignment: 'NEUTRAL'
      };
    }
    // Se o ativo estiver contra a tendência do Bitcoin
    else {
      console.log(`⚠️ Tendências OPOSTAS: ${assetTrend} vs ${btcTrend}`);
      
      const alignment = {
        type: `AGAINST_${btcTrend}`,
        bonus: 0,
        penalty: 0,
        recommendation: `Operação contra tendência do Bitcoin (${btcTrend})`,
        alignment: 'AGAINST'
      };

      // Apenas penalizamos se o Bitcoin estiver muito forte
      if (isStrongBtc) {
        alignment.penalty = -15; // AUMENTADO: Penalidade maior para Bitcoin forte
        alignment.recommendation = `RISCO ALTO: Bitcoin com forte tendência ${btcTrend} oposta ao sinal`;
      } else if (isModerateBtc) {
        alignment.penalty = -8;
        alignment.recommendation = `RISCO MODERADO: Bitcoin em tendência ${btcTrend} oposta`;
      }
      // Se o Bitcoin estiver fraco, não penalizamos e até damos um pequeno bônus
      else if (isWeakBtc) {
        alignment.bonus = 3;
        alignment.recommendation = `Bitcoin com tendência fraca - sinal independente viável`;
      }

      console.log(`⚠️ Penalidade por oposição: ${alignment.penalty} pontos`);
      return alignment;
    }
  }

  /**
   * Calcula confiança da análise
   */
  calculateConfidence(btcStrength, priceCorrelation) {
    let confidence = 50; // Base

    // Força do Bitcoin aumenta confiança
    confidence += (btcStrength - 50) * 0.5;

    // Correlação alta aumenta confiança
    confidence += Math.abs(priceCorrelation) * 30;

    return Math.max(30, Math.min(95, Math.round(confidence)));
  }

  /**
   * Gera resumo da correlação para logs
   */
  generateCorrelationSummary(symbol, correlation) {
    if (!correlation || correlation.alignment === 'NEUTRAL') {
      return `${symbol}: Correlação neutra com Bitcoin`;
    }

    const direction = correlation.bonus > 0 ? 'FAVORECE' : 'PENALIZA';
    const impact = Math.abs(correlation.bonus || correlation.penalty);
    
    return `${symbol}: ${direction} sinal (${impact > 0 ? '+' : ''}${impact}) - ${correlation.recommendation}`;
  }

  /**
   * Limpa cache (para testes ou reset manual)
   */
  clearCache() {
    this.btcCache = {
      data: null,
      trend: null,
      strength: 0,
      timestamp: null,
      cacheTimeout: 5 * 60 * 1000 // 5 minutos
    };
    console.log('🗑️ Cache do Bitcoin limpo');
  }
}

export default BitcoinCorrelationService;