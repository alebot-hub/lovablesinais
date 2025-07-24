/**
 * Serviço de análise de correlação com Bitcoin
 */

class BitcoinCorrelationService {
  constructor(binanceService, technicalAnalysis) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis;
    this.btcCache = {
      data: null,
      trend: null,
      strength: 0,
      timestamp: null,
      cacheTimeout: 15 * 60 * 1000 // 15 minutos
    };
  }

  /**
   * Obtém tendência atual do Bitcoin (com cache)
   */
  async getBitcoinTrend() {
    try {
      const now = Date.now();
      
      // Usa cache se ainda válido
      if (this.btcCache.data && 
          this.btcCache.timestamp && 
          (now - this.btcCache.timestamp) < this.btcCache.cacheTimeout) {
        console.log(`₿ Usando cache BTC: ${this.btcCache.trend} (força: ${this.btcCache.strength})`);
        return {
          trend: this.btcCache.trend,
          strength: this.btcCache.strength,
          price: this.btcCache.data.close[this.btcCache.data.close.length - 1],
          cached: true
        };
      }

      console.log('₿ Atualizando análise do Bitcoin...');
      
      // Obtém dados do Bitcoin
      const btcData = await this.binanceService.getOHLCVData('BTC/USDT', '1h', 100);
      
      if (!btcData || !btcData.close || btcData.close.length < 50) {
        console.log('⚠️ Dados insuficientes do Bitcoin');
        return { trend: 'NEUTRAL', strength: 0, price: 0, cached: false };
      }

      // Análise técnica do Bitcoin
      const btcIndicators = this.technicalAnalysis.calculateIndicators(btcData);
      const btcTrend = this.technicalAnalysis.detectTrend(btcIndicators);
      const btcStrength = this.calculateTrendStrength(btcIndicators, btcData);

      // Atualiza cache
      this.btcCache = {
        data: btcData,
        trend: btcTrend,
        strength: btcStrength,
        timestamp: now,
        cacheTimeout: this.btcCache.cacheTimeout
      };

      console.log(`₿ Bitcoin: ${btcTrend} (força: ${btcStrength}) - $${btcData.close[btcData.close.length - 1].toFixed(2)}`);

      return {
        trend: btcTrend,
        strength: btcStrength,
        price: btcData.close[btcData.close.length - 1],
        cached: false
      };

    } catch (error) {
      console.error('❌ Erro ao obter tendência do Bitcoin:', error.message);
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
      
      if (!btcAnalysis || btcAnalysis.trend === 'NEUTRAL') {
        console.log(`⚠️ Bitcoin neutro - correlação não aplicada`);
        return {
          btcTrend: 'NEUTRAL',
          btcStrength: 0,
          correlation: 'NEUTRAL',
          bonus: 0,
          penalty: 0,
          recommendation: 'Bitcoin neutro - foco na análise técnica do ativo'
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
        btcPrice: btcAnalysis.price,
        priceCorrelation: priceCorrelation,
        alignment: alignment.type,
        bonus: alignment.bonus,
        penalty: alignment.penalty,
        recommendation: alignment.recommendation,
        confidence: this.calculateConfidence(btcAnalysis.strength, priceCorrelation)
      };

    } catch (error) {
      console.error(`❌ Erro na análise de correlação ${symbol}:`, error.message);
      return {
        btcTrend: 'NEUTRAL',
        btcStrength: 0,
        correlation: 'NEUTRAL',
        bonus: 0,
        penalty: 0,
        recommendation: 'Erro na análise - usando apenas análise técnica'
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

      if (!btcData || !assetData || 
          btcData.close.length < 20 || assetData.close.length < 20) {
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
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * Calcula correlação de Pearson
   */
  pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.slice(0, n).reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < n; i++) {
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
    // Bitcoin muito forte (>80) tem mais influência
    const isStrongBtc = btcStrength > 80;
    const isModerateBtc = btcStrength > 60;

    if (assetTrend === btcTrend) {
      // ALINHADO COM BITCOIN
      if (btcTrend === 'BULLISH') {
        return {
          type: 'ALIGNED_BULLISH',
          bonus: isStrongBtc ? 25 : isModerateBtc ? 15 : 10,
          penalty: 0,
          recommendation: `Bitcoin ${isStrongBtc ? 'muito' : ''} bullish favorece COMPRA`
        };
      } else if (btcTrend === 'BEARISH') {
        return {
          type: 'ALIGNED_BEARISH',
          bonus: isStrongBtc ? 25 : isModerateBtc ? 15 : 10,
          penalty: 0,
          recommendation: `Bitcoin ${isStrongBtc ? 'muito' : ''} bearish favorece VENDA`
        };
      }
    } else {
      // CONTRA BITCOIN
      if (btcTrend === 'BULLISH' && assetTrend === 'BEARISH') {
        return {
          type: 'AGAINST_BULLISH_BTC',
          bonus: 0,
          penalty: isStrongBtc ? -30 : isModerateBtc ? -20 : -10,
          recommendation: `Bitcoin bullish ${isStrongBtc ? 'forte' : ''} - VENDA arriscada`
        };
      } else if (btcTrend === 'BEARISH' && assetTrend === 'BULLISH') {
        return {
          type: 'AGAINST_BEARISH_BTC',
          bonus: 0,
          penalty: isStrongBtc ? -30 : isModerateBtc ? -20 : -10,
          recommendation: `Bitcoin bearish ${isStrongBtc ? 'forte' : ''} - COMPRA arriscada`
        };
      }
    }

    // Casos neutros ou sideways
    return {
      type: 'NEUTRAL',
      bonus: 0,
      penalty: 0,
      recommendation: 'Correlação neutra - análise técnica prevalece'
    };
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
      cacheTimeout: 15 * 60 * 1000
    };
    console.log('🗑️ Cache do Bitcoin limpo');
  }
}

export default BitcoinCorrelationService;