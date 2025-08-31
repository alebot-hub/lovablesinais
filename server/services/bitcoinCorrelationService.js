/**
 * Serviço de análise de correlação com Bitcoin (compat + ajustes de força e impacto)
 */

import technicalAnalysis from './technicalAnalysis.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

class BitcoinCorrelationService {
  constructor(binanceService) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis; // Instância importada diretamente

    // Cache por timeframe (ex.: '5m', '15m', '1h', '4h', '1d')
    this.btcCache = new Map();
    this.cacheTimeoutMs = 5 * 60 * 1000; // 5 minutos
  }

  _getFromCache(timeframe) {
    const entry = this.btcCache.get(timeframe);
    if (!entry) return null;
    const fresh = Date.now() - entry.timestamp < this.cacheTimeoutMs;
    return fresh ? entry : null;
  }

  _setCache(timeframe, payload) {
    this.btcCache.set(timeframe, {
      ...payload,
      timestamp: Date.now(),
      cacheTimeout: this.cacheTimeoutMs
    });
  }

  /**
   * Obtém tendência atual do Bitcoin (com cache por timeframe)
   */
  async getBitcoinTrend(timeframe = '1h') {
    try {
      const cached = this._getFromCache(timeframe);
      if (cached) {
        return {
          trend: cached.trend,
          strength: cached.strength,
          price: cached.data.close[cached.data.close.length - 1],
          cached: true
        };
      }

      console.log(`₿ Atualizando análise do Bitcoin (${timeframe})...`);
      const btcData = await this.binanceService.getOHLCVData('BTC/USDT', timeframe, 300);

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

      // Indicadores do BTC no mesmo timeframe do ativo
      const btcIndicators = await this.technicalAnalysis.calculateIndicators(
        formattedData,
        'BTC/USDT',
        timeframe
      );

      const lastPrice = btcData.close[btcData.close.length - 1];

      if (!btcIndicators || typeof btcIndicators !== 'object') {
        this._setCache(timeframe, { data: btcData, trend: 'NEUTRAL', strength: 0 });
        return { trend: 'NEUTRAL', strength: 0, price: lastPrice, cached: false, indicators: null };
      }

      // Tendência & força
      let btcTrend =
        typeof this.technicalAnalysis.detectTrend === 'function'
          ? this.technicalAnalysis.detectTrend(btcIndicators)
          : 'NEUTRAL';

      let btcStrength = this.calculateTrendStrength(btcIndicators, btcData);

      // Regras com MA200 (e CAP contextual de força)
      const ma200 = Number(btcIndicators.ma200) || lastPrice;
      const priceVsMA = ma200 ? ((lastPrice - ma200) / ma200) * 100 : 0;
      const absPVMA = Math.abs(priceVsMA);

      if (priceVsMA > 1.5) {
        btcTrend = 'BULLISH';
        btcStrength = Math.max(btcStrength, 60); // piso moderado
      } else if (priceVsMA < -1.5) {
        btcTrend = 'BEARISH';
        btcStrength = Math.max(btcStrength, 60); // piso moderado
      } else {
        btcStrength = Math.min(btcStrength, 55); // perto da MA200 nunca é “muito forte”
      }

      // 🎛️ CAP contextual (evita 100 em movimentos medianos)
      let cap = 85;
      if (absPVMA < 0.8) cap = 60;
      else if (absPVMA < 1.5) cap = 70;
      else if (absPVMA < 3.0) cap = 80;

      // Só libera >88 com confluência extrema (longe da MA200 + RSI extremo + MACD forte)
      const rsi = Number(btcIndicators.rsi);
      const macdHist = Number(btcIndicators?.macd?.histogram);
      const macdStrong = Number.isFinite(macdHist) && Math.abs(macdHist) >= 0.0008; // ~forte p/ BTC
      const rsiExtreme = Number.isFinite(rsi) && (rsi <= 20 || rsi >= 80);
      const extremeConfluence = (absPVMA >= 4) && rsiExtreme && macdStrong;

      const hardCap = extremeConfluence ? 95 : 88; // 95 só em extremos de verdade
      btcStrength = Math.min(btcStrength, cap, hardCap);
      btcStrength = Math.round(clamp(btcStrength, 0, 100));

      // Atualiza cache
      this._setCache(timeframe, { data: btcData, trend: btcTrend, strength: btcStrength });

      console.log(
        `₿ Bitcoin ${timeframe}: ${btcTrend} (força: ${btcStrength}) - $${lastPrice.toFixed(2)} vs MA200(${ma200.toFixed(2)}) ` +
        `${priceVsMA > 0 ? '+' : ''}${priceVsMA.toFixed(2)}% | cap=${cap}, extreme=${extremeConfluence}`
      );

      return {
        trend: btcTrend,
        strength: btcStrength,
        price: lastPrice,
        cached: false,
        indicators: btcIndicators
      };
    } catch (error) {
      console.error('❌ Erro ao analisar tendência do Bitcoin:', error);
      return { trend: 'NEUTRAL', strength: 0, price: 0, cached: false };
    }
  }

  /**
   * Calcula força da tendência do Bitcoin (simétrica para alta/baixa) — suavizada
   */
  calculateTrendStrength(indicators, data) {
    let strength = 50;

    try {
      // RSI — extremos dão força, mas pesos suavizados
      if (typeof indicators.rsi === 'number') {
        const r = indicators.rsi;
        if (r >= 80 || r <= 20) strength += 14;
        else if (r >= 70 || r <= 30) strength += 9;
        else if (r >= 60 || r <= 40) strength += 5;
      }

      // MACD — usa diferença MACD-sinal (magnitude), cap ±12
      if (indicators.macd && indicators.macd.MACD != null && indicators.macd.signal != null) {
        const macdDiff = indicators.macd.MACD - indicators.macd.signal;
        // escala mais conservadora
        const macdAdj = clamp(macdDiff * 1200, -12, 12);
        strength += macdAdj;
      }

      // MAs — distância relativa entre MA21 e MA200 (cap 18)
      if (typeof indicators.ma21 === 'number' && typeof indicators.ma200 === 'number' && indicators.ma200 !== 0) {
        const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
        if (maDiff > 2) strength += 18;
        else if (maDiff > 0.5) strength += 10;
        else if (maDiff < -2) strength += 18;
        else if (maDiff < -0.5) strength += 10;
      }

      // Volume — confirma (baixo volume reduz um pouco a convicção)
      if (Array.isArray(data.volume) && data.volume.length >= 20) {
        const current = data.volume[data.volume.length - 1];
        const avg = data.volume.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const ratio = avg > 0 ? current / avg : 1;
        if (ratio > 1.8) strength += 6;
        else if (ratio > 1.2) strength += 3;
        else if (ratio < 0.7) strength -= 4;
      }

      // Clamp “macio”: a maior parte do tempo ficará entre 20 e 88
      return Math.round(clamp(strength, 20, 100));
    } catch (e) {
      console.error('Erro ao calcular força da tendência BTC:', e.message);
      return 50;
    }
  }

  async analyzeCorrelation(symbol, assetTrend, assetData, timeframe = '1h') {
    try {
      console.log(`🔗 Analisando correlação ${symbol} vs Bitcoin (${timeframe})...`);

      const btcAnalysis = await this.getBitcoinTrend(timeframe);

      console.log('🔍 Análise BTC:', {
        trend: btcAnalysis.trend,
        strength: btcAnalysis.strength,
        price: btcAnalysis.price,
        cached: btcAnalysis.cached,
        timeframe
      });

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

      const priceCorrelation = await this.calculatePriceCorrelation(symbol, assetData, timeframe);
      const alignmentBase = this.analyzeTrendAlignment(assetTrend, btcAnalysis.trend, btcAnalysis.strength);

      const corrScale = 0.5 + 0.5 * Math.min(1, Math.abs(priceCorrelation));
      let bonus = Math.round((alignmentBase.bonus || 0) * corrScale);
      let penalty = Math.round((alignmentBase.penalty || 0) * corrScale);

      if (bonus) console.log(`🎯 Bônus ajustado por correlação: ${alignmentBase.bonus} → ${bonus} (ρ=${priceCorrelation.toFixed(2)})`);
      if (penalty) console.log(`⚠️ Penalidade ajustada por correlação: ${alignmentBase.penalty} → ${penalty} (ρ=${priceCorrelation.toFixed(2)})`);

      console.log(
        `🔗 ${symbol} ${timeframe}: Asset=${assetTrend}, BTC=${btcAnalysis.trend} (${btcAnalysis.strength}), ρ=${priceCorrelation.toFixed(2)}`
      );

      return {
        btcTrend: btcAnalysis.trend,
        btcStrength: btcAnalysis.strength,
        alignment: alignmentBase.alignment,   // 'ALIGNED' | 'AGAINST' | 'NEUTRAL'
        type: alignmentBase.type,
        bonus,
        penalty,
        recommendation: alignmentBase.recommendation,
        priceCorrelation
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

  async calculatePriceCorrelation(symbol, assetData, timeframe = '1h') {
    try {
      let btcData = this._getFromCache(timeframe)?.data;
      if (!btcData) {
        btcData = await this.binanceService.getOHLCVData('BTC/USDT', timeframe, 50);
      }

      if (
        !btcData?.close?.length ||
        !assetData?.close?.length ||
        !Array.isArray(btcData.close) ||
        !Array.isArray(assetData.close)
      ) {
        console.warn(`⚠️ Dados inválidos para correlação ${symbol}: BTC=${!!btcData?.close}, Asset=${!!assetData?.close}`);
        return 0;
      }

      if (btcData.close.length < 20 || assetData.close.length < 20) {
        console.warn(`⚠️ Dados insuficientes para correlação ${symbol}: BTC=${btcData.close.length}, Asset=${assetData.close.length}`);
        return 0;
      }

      const btcReturns = this.calculateReturns(btcData.close.slice(-20));
      const assetReturns = this.calculateReturns(assetData.close.slice(-20));
      const corr = this.pearsonCorrelation(btcReturns, assetReturns);

      return isNaN(corr) ? 0 : corr;
    } catch (error) {
      console.error(`Erro ao calcular correlação de preços ${symbol}:`, error.message);
      return 0;
    }
  }

  calculateReturns(prices) {
    if (!Array.isArray(prices) || prices.length < 2) {
      console.warn('⚠️ Dados insuficientes para calcular retornos');
      return [];
    }
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      if (typeof prices[i] !== 'number' || typeof prices[i - 1] !== 'number' || prices[i - 1] === 0) continue;
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  pearsonCorrelation(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length === 0 || y.length === 0) {
      console.warn('⚠️ Arrays inválidos para correlação de Pearson');
      return 0;
    }
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;
    const _x = x.slice(-n);
    const _y = y.slice(-n);

    const meanX = _x.reduce((s, v) => s + v, 0) / n;
    const meanY = _y.reduce((s, v) => s + v, 0) / n;

    let num = 0, sumXX = 0, sumYY = 0;
    for (let i = 0; i < n; i++) {
      if (!isFinite(_x[i]) || !isFinite(_y[i])) continue;
      const dx = _x[i] - meanX;
      const dy = _y[i] - meanY;
      num += dx * dy;
      sumXX += dx * dx;
      sumYY += dy * dy;
    }
    const den = Math.sqrt(sumXX * sumYY);
    return den === 0 ? 0 : num / den;
  }

  analyzeTrendAlignment(assetTrend, btcTrend, btcStrength) {
    console.log(`🔗 Analisando alinhamento: Asset=${assetTrend} vs BTC=${btcTrend} (força: ${btcStrength})`);

    const isStrongBtc = btcStrength > 70;
    const isModerateBtc = btcStrength > 50;
    const isWeakBtc = btcStrength <= 50;

    if (assetTrend === btcTrend) {
      const alignment = {
        type: `ALIGNED_${btcTrend}`,
        bonus: 15,
        penalty: 0,
        recommendation: `Sinal a favor da tendência do Bitcoin (${btcTrend})`,
        alignment: 'ALIGNED'
      };
      if (isStrongBtc) {
        alignment.bonus = 25;
        alignment.recommendation = `Bitcoin com forte tendência ${btcTrend} - sinal altamente favorável`;
      } else if (isModerateBtc) {
        alignment.bonus = 15;
        alignment.recommendation = `Bitcoin em tendência ${btcTrend} - sinal favorável`;
      } else if (isWeakBtc) {
        alignment.bonus = 8;
        alignment.recommendation = `Tendência fraca do Bitcoin, mas alinhada com o sinal`;
      }
      console.log(`🎯 Bônus de alinhamento (base): +${alignment.bonus} pontos`);
      return alignment;
    } else if (assetTrend === 'NEUTRAL') {
      return {
        type: 'NEUTRAL',
        bonus: 0,
        penalty: 0,
        recommendation: 'Tendência neutra - análise técnica prevalece',
        alignment: 'NEUTRAL'
      };
    } else {
      const alignment = {
        type: `AGAINST_${btcTrend}`,
        bonus: 0,
        penalty: 0,
        recommendation: `Operação contra tendência do Bitcoin (${btcTrend})`,
        alignment: 'AGAINST'
      };
      if (isStrongBtc) {
        alignment.penalty = -15;
        alignment.recommendation = `RISCO ALTO: Bitcoin com forte tendência ${btcTrend} oposta ao sinal`;
      } else if (isModerateBtc) {
        alignment.penalty = -8;
        alignment.recommendation = `RISCO MODERADO: Bitcoin em tendência ${btcTrend} oposta`;
      } else if (isWeakBtc) {
        alignment.bonus = 3;
        alignment.recommendation = `Bitcoin com tendência fraca - sinal independente viável`;
      }
      console.log(`⚠️ Penalidade/ajuste (base): ${alignment.penalty || alignment.bonus} pontos`);
      return alignment;
    }
  }

  calculateConfidence(btcStrength, priceCorrelation) {
    let confidence = 50;
    confidence += (btcStrength - 50) * 0.5;
    confidence += Math.abs(priceCorrelation) * 30;
    return Math.max(30, Math.min(95, Math.round(confidence)));
  }

  generateCorrelationSummary(symbol, correlation) {
    if (!correlation || correlation.alignment === 'NEUTRAL') {
      return `${symbol}: Correlação neutra com Bitcoin`;
    }
    const direction = (correlation.bonus || 0) > 0 ? 'FAVORECE' : 'PENALIZA';
    const impact = Math.abs(correlation.bonus || correlation.penalty || 0);
    return `${symbol}: ${direction} sinal (${impact > 0 ? '+' : ''}${impact}) - ${correlation.recommendation}`;
  }

  clearCache() {
    this.btcCache.clear();
    console.log('🗑️ Cache do Bitcoin limpo (todos timeframes)');
  }
}

export default BitcoinCorrelationService;
