/**
 * Serviço de análise técnica
 */

import technicalindicators from 'technicalindicators';
import { INDICATORS_CONFIG } from '../config/constants.js';

class TechnicalAnalysisService {
  /**
   * Calcula todos os indicadores técnicos
   */
  calculateIndicators(data) {
    const indicators = {};

    try {
      if (!data || !data.close || data.close.length < 10) {
        console.error(`❌ DADOS INSUFICIENTES para análise técnica:`);
        console.error(`   📊 Candles disponíveis: ${data?.close?.length || 0}`);
        console.error(`   📊 Mínimo necessário: 10`);
        return {};
      }

      const currentPrice = data.close[data.close.length - 1];
      const previousPrice = data.close[data.close.length - 2];
      const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;
      
      console.log(`📊 ANÁLISE TÉCNICA - ${data.close.length} candles:`);
      console.log(`   💰 Preço atual: $${currentPrice.toFixed(6)}`);
      console.log(`   💰 Preço anterior: $${previousPrice.toFixed(6)}`);
      console.log(`   📈 Variação: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
      
      // Validação crítica dos preços
      const prices = data.close;
      let invalidPrices = 0;
      
      for (let i = 0; i < prices.length; i++) {
        if (prices[i] <= 0 || isNaN(prices[i]) || !isFinite(prices[i])) {
          invalidPrices++;
          console.error(`❌ Preço inválido no índice ${i}: ${prices[i]}`);
        }
      }
      
      if (invalidPrices > 0) {
        console.error(`❌ ERRO: ${invalidPrices} preços inválidos encontrados`);
        return {};
      }

      // RSI
      const rsi = technicalindicators.RSI.calculate({
        period: INDICATORS_CONFIG.RSI.period,
        values: data.close
      });
      indicators.rsi = rsi.length > 0 ? rsi[rsi.length - 1] : null;
      
      if (indicators.rsi !== null) {
        console.log(`📈 RSI: ${indicators.rsi.toFixed(2)} (${
          indicators.rsi < 30 ? 'SOBREVENDIDO' :
          indicators.rsi > 70 ? 'SOBRECOMPRADO' : 'NEUTRO'
        })`);
      } else {
        console.warn(`⚠️ RSI não calculado`);
      }

      // MACD
      const macd = technicalindicators.MACD.calculate({
        fastPeriod: INDICATORS_CONFIG.MACD.fastPeriod,
        slowPeriod: INDICATORS_CONFIG.MACD.slowPeriod,
        signalPeriod: INDICATORS_CONFIG.MACD.signalPeriod,
        values: data.close
      });
      indicators.macd = macd.length > 0 ? macd[macd.length - 1] : null;
      
      if (indicators.macd && indicators.macd.MACD !== null) {
        const macdTrend = indicators.macd.MACD > indicators.macd.signal ? 'BULLISH' : 'BEARISH';
        console.log(`📊 MACD: ${indicators.macd.MACD.toFixed(4)} (${macdTrend})`);
      } else {
        console.warn(`⚠️ MACD não calculado`);
      }

      // Ichimoku Cloud
      if (data.high && data.low && data.high.length >= 52 && data.low.length >= 52) {
        const ichimoku = technicalindicators.IchimokuCloud.calculate({
          high: data.high,
          low: data.low,
          conversionPeriod: INDICATORS_CONFIG.ICHIMOKU.conversionPeriod,
          basePeriod: INDICATORS_CONFIG.ICHIMOKU.basePeriod,
          spanPeriod: INDICATORS_CONFIG.ICHIMOKU.spanPeriod
        });
        indicators.ichimoku = ichimoku.length > 0 ? ichimoku[ichimoku.length - 1] : null;
        
        if (indicators.ichimoku) {
          console.log(`☁️ Ichimoku: Conversão=${indicators.ichimoku.conversionLine?.toFixed(4)} Base=${indicators.ichimoku.baseLine?.toFixed(4)}`);
        }
      } else {
        indicators.ichimoku = null;
        console.log(`⚠️ Ichimoku: Dados insuficientes (${data.high?.length || 0} < 52)`);
      }

      // Médias Móveis
      if (data.close.length >= 21) {
        const ma21 = technicalindicators.SMA.calculate({
          period: INDICATORS_CONFIG.MA_SHORT.period,
          values: data.close
        });
        indicators.ma21 = ma21.length > 0 ? ma21[ma21.length - 1] : null;
      } else {
        indicators.ma21 = null;
        console.warn(`⚠️ MA21: Dados insuficientes (${data.close.length} < 21)`);
      }

      if (data.close.length >= 200) {
        const ma200 = technicalindicators.SMA.calculate({
          period: INDICATORS_CONFIG.MA_LONG.period,
          values: data.close
        });
        indicators.ma200 = ma200.length > 0 ? ma200[ma200.length - 1] : null;
      } else {
        // Usa MA50 como fallback se não tiver dados suficientes para MA200
        if (data.close.length >= 50) {
          const ma50 = technicalindicators.SMA.calculate({
            period: 50,
            values: data.close
          });
          indicators.ma200 = ma50.length > 0 ? ma50[ma50.length - 1] : null;
          console.log(`⚠️ MA200: Usando MA50 como fallback (${data.close.length} < 200)`);
        } else {
          indicators.ma200 = null;
          console.warn(`⚠️ MA200: Dados insuficientes (${data.close.length} < 50)`);
        }
      }
      
      if (indicators.ma21) {
        console.log(`📊 MA21: $${indicators.ma21.toFixed(6)}`);
      }
      if (indicators.ma200) {
        console.log(`📊 MA200: $${indicators.ma200.toFixed(6)}`);
      }
      
      // Validação crítica dos indicadores
      
      // Validação MA21 - deve estar próxima do preço atual
      if (indicators.ma21) {
        const ma21Ratio = indicators.ma21 / currentPrice;
        console.log(`🔍 VALIDAÇÃO MA21:`);
        console.log(`   📊 MA21: $${indicators.ma21.toFixed(6)}`);
        console.log(`   💰 Preço: $${currentPrice.toFixed(6)}`);
        console.log(`   📈 Ratio: ${ma21Ratio.toFixed(3)} (deve estar entre 0.8-1.2)`);
        
        // MA21 pode variar entre 80% e 120% do preço atual (muito próxima)
        if (ma21Ratio > 1.2 || ma21Ratio < 0.8) {
          console.error(`❌ MA21 REJEITADA: Ratio ${ma21Ratio.toFixed(3)} fora da faixa 0.8-1.2`);
          indicators.ma21 = null;
        } else {
          console.log(`✅ MA21 VALIDADA: ${(ma21Ratio * 100).toFixed(1)}% do preço atual`);
        }
      }
      
      // Validação MA200 - pode estar mais distante
      if (indicators.ma200) {
        const ma200Ratio = indicators.ma200 / currentPrice;
        console.log(`🔍 VALIDAÇÃO MA200:`);
        console.log(`   📊 MA200: $${indicators.ma200.toFixed(6)}`);
        console.log(`   💰 Preço: $${currentPrice.toFixed(6)}`);
        console.log(`   📈 Ratio: ${ma200Ratio.toFixed(3)} (deve estar entre 0.6-1.4)`);
        
        // MA200 pode variar entre 60% e 140% do preço atual
        if (ma200Ratio > 1.4 || ma200Ratio < 0.6) {
          console.error(`❌ MA200 REJEITADA: Ratio ${ma200Ratio.toFixed(3)} fora da faixa 0.6-1.4`);
          indicators.ma200 = null;
        } else {
          console.log(`✅ MA200 VALIDADA: ${(ma200Ratio * 100).toFixed(1)}% do preço atual`);
        }
      }

      // Bandas de Bollinger
      if (data.close.length >= 20) {
        const bb = technicalindicators.BollingerBands.calculate({
          period: INDICATORS_CONFIG.BOLLINGER.period,
          stdDev: INDICATORS_CONFIG.BOLLINGER.stdDev,
          values: data.close
        });
        indicators.bollinger = bb.length > 0 ? bb[bb.length - 1] : null;
      } else {
        indicators.bollinger = null;
      }

      // VWAP
      if (data.high && data.low && data.volume && data.close.length >= 10) {
        const vwap = technicalindicators.VWAP.calculate({
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volume
        });
        indicators.vwap = vwap.length > 0 ? vwap[vwap.length - 1] : null;
      } else {
        indicators.vwap = null;
      }

      // Fibonacci Retracement
      if (data.high && data.low && data.high.length >= 20) {
        const high = Math.max(...data.high.slice(-20));
        const low = Math.min(...data.low.slice(-20));
        indicators.fibonacci = this.calculateFibonacci(high, low);
      } else {
        indicators.fibonacci = null;
      }

      // Divergência de RSI
      indicators.rsiDivergence = this.detectRSIDivergence(data.close, rsi);

      // Volume médio
      if (data.volume && data.volume.length >= 20) {
        const volumeMA = technicalindicators.SMA.calculate({
          period: INDICATORS_CONFIG.VOLUME_MA.period,
          values: data.volume
        });
        indicators.volumeMA = volumeMA.length > 0 ? volumeMA[volumeMA.length - 1] : null;
      } else {
        indicators.volumeMA = null;
      }

      console.log(`✅ Indicadores calculados com sucesso`);
      return indicators;
    } catch (error) {
      console.error('Erro ao calcular indicadores:', error.message);
      console.error('Stack trace:', error.stack);
      return {};
    }
  }

  /**
   * Calcula níveis de Fibonacci
   */
  calculateFibonacci(high, low) {
    const diff = high - low;
    return {
      level_0: high,
      level_236: high - (diff * 0.236),
      level_382: high - (diff * 0.382),
      level_500: high - (diff * 0.500),
      level_618: high - (diff * 0.618),
      level_786: high - (diff * 0.786),
      level_100: low
    };
  }

  /**
   * Detecta divergência de RSI
   */
  detectRSIDivergence(prices, rsi) {
    if (prices.length < 10 || rsi.length < 10) return false;

    const recentPrices = prices.slice(-5);
    const recentRSI = rsi.slice(-5);

    // Divergência bullish: preços fazem mínimas mais baixas, RSI faz mínimas mais altas
    const priceDowntrend = recentPrices[4] < recentPrices[0];
    const rsiUptrend = recentRSI[4] > recentRSI[0];

    // Divergência bearish: preços fazem máximas mais altas, RSI faz máximas mais baixas
    const priceUptrend = recentPrices[4] > recentPrices[0];
    const rsiDowntrend = recentRSI[4] < recentRSI[0];

    return (priceDowntrend && rsiUptrend) || (priceUptrend && rsiDowntrend);
  }

  /**
   * Calcula suporte e resistência
   */
  calculateSupportResistance(data, periods = 20) {
    const recentHigh = data.high.slice(-periods);
    const recentLow = data.low.slice(-periods);

    const resistance = Math.max(...recentHigh);
    const support = Math.min(...recentLow);

    // Níveis de pivô
    const pivot = (recentHigh[recentHigh.length - 1] + recentLow[recentLow.length - 1] + data.close[data.close.length - 1]) / 3;
    const r1 = (2 * pivot) - recentLow[recentLow.length - 1];
    const s1 = (2 * pivot) - recentHigh[recentHigh.length - 1];

    return {
      resistance,
      support,
      pivot,
      r1,
      s1
    };
  }

  /**
   * Detecta tendência do mercado
   */
  detectTrend(indicators) {
    console.log('Detectando tendência com indicadores:', {
      ma21: indicators.ma21,
      ma200: indicators.ma200,
      rsi: indicators.rsi,
      macd: indicators.macd?.MACD,
      macdSignal: indicators.macd?.signal
    });
    
    let bullishPoints = 0;
    let bearishPoints = 0;
    
    // Médias móveis (peso 3)
    if (indicators.ma21 && indicators.ma200) {
      const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
      console.log(`📊 Diferença MA21/MA200: ${maDiff.toFixed(2)}%`);
      
      if (maDiff > 1) {
        bullishPoints += 3;
      } else if (maDiff < -1) {
        bearishPoints += 3;
      } else if (maDiff > 0) {
        bullishPoints += 1;
      } else if (maDiff < 0) {
        bearishPoints += 1;
      }
    }
    
    // RSI (peso 2)
    if (indicators.rsi) {
      if (indicators.rsi > 60) {
        bullishPoints += 2;
      } else if (indicators.rsi < 40) {
        bearishPoints += 2;
      } else if (indicators.rsi > 50) {
        bullishPoints += 1;
      } else if (indicators.rsi < 50) {
        bearishPoints += 1;
      }
    }
    
    // MACD (peso 2)
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      if (indicators.macd.MACD > indicators.macd.signal) {
        bullishPoints += 2;
      } else {
        bearishPoints += 2;
      }
    }
    
    // Ichimoku (peso 1)
    if (indicators.ichimoku && indicators.ichimoku.conversionLine !== null && indicators.ichimoku.baseLine !== null) {
      if (indicators.ichimoku.conversionLine > indicators.ichimoku.baseLine) {
        bullishPoints += 1;
      } else {
        bearishPoints += 1;
      }
    }
    
    console.log(`Pontos de tendência: Bullish=${bullishPoints}, Bearish=${bearishPoints}`);
    
    // Determina tendência
    if (bullishPoints > bearishPoints + 1) {
      return 'BULLISH';
    } else if (bearishPoints > bullishPoints + 1) {
      return 'BEARISH';
    } else {
      return 'SIDEWAYS';
    }

  }
}

export default TechnicalAnalysisService;