/**
 * Serviço de pontuação de sinais
 */

import { SCORING_WEIGHTS, TRADING_CONFIG } from '../config/constants.js';

class SignalScoringService {
  /**
   * Calcula pontuação total do sinal
   */
  calculateSignalScore(data, indicators, patterns, mlProbability, marketTrend = null) {
    let score = 0;
    const details = {};
    let isMLDriven = false;

    try {
      console.log('🔍 Calculando score com dados:', {
        hasData: !!data,
        hasIndicators: !!indicators,
        hasPatterns: !!patterns,
        mlProbability,
        marketTrend
      });

      // Validação básica
      if (!data || !indicators) {
        console.error('❌ Dados ou indicadores ausentes');
        return { totalScore: 0, details: {}, isValid: false, isMLDriven: false };
      }
      // Pontuação dos indicadores técnicos
      const indicatorScore = this.scoreIndicators(indicators);
      score += indicatorScore.total;
      details.indicators = indicatorScore.details;
      console.log('📊 Score indicadores:', indicatorScore.total);

      // Pontuação dos padrões gráficos
      const patternScore = this.scorePatterns(patterns || {});
      score += patternScore.total;
      details.patterns = patternScore.details;
      console.log('📈 Score padrões:', patternScore.total);

      // Confirmação de volume
      const volumeScore = this.scoreVolume(data, indicators);
      score += volumeScore;
      details.volume = volumeScore;
      console.log('🔊 Score volume:', volumeScore);

      // Pontuação do Machine Learning
      const mlScore = (mlProbability || 0.5) * SCORING_WEIGHTS.ML_WEIGHT * 100;
      score += mlScore;
      details.machineLearning = mlScore;
      console.log('🤖 Score ML:', mlScore);
      
      // Verifica se o sinal é principalmente baseado em ML
      // Se ML contribui com mais de 40% da pontuação total, considera ML-driven
      if (mlScore > score * 0.4 && mlProbability > 0.7) {
        isMLDriven = true;
      }

      // Aplica lógica de priorização de tendência
      const trendAdjustment = this.applyTrendPriority(score, indicators, patterns, marketTrend);
      score = trendAdjustment.adjustedScore;
      details.trendAdjustment = trendAdjustment.details;
      console.log('📈 Score após ajuste de tendência:', score);

      // Limita pontuação máxima
      score = Math.min(Math.max(score, 0), 100);
      console.log('🎯 Score final:', score);

      return {
        totalScore: score,
        details,
        isValid: score >= TRADING_CONFIG.MIN_SIGNAL_PROBABILITY,
        isMLDriven,
        mlContribution: mlScore
      };
    } catch (error) {
      console.error('Erro ao calcular pontuação:', error.message);
      console.error('Stack trace:', error.stack);
      return { totalScore: 0, details: {}, isValid: false, isMLDriven: false };
    }
  }

  /**
   * Pontua indicadores técnicos
   */
  scoreIndicators(indicators) {
    let total = 0;
    const details = {};

    console.log('🔍 Analisando indicadores:', {
      rsi: indicators.rsi,
      macd: indicators.macd,
      ichimoku: indicators.ichimoku,
      ma21: indicators.ma21,
      ma200: indicators.ma200
    });
    

    // RSI
    if (indicators.rsi !== null && indicators.rsi !== undefined) {
      if (indicators.rsi < 25) {
        total += SCORING_WEIGHTS.RSI_OVERSOLD;
        details.rsi = { value: indicators.rsi, score: SCORING_WEIGHTS.RSI_OVERSOLD, reason: 'Sobrevendido' };
        console.log('✅ RSI sobrevendido:', SCORING_WEIGHTS.RSI_OVERSOLD);
      } else if (indicators.rsi > 85) {
        total -= Math.abs(SCORING_WEIGHTS.RSI_OVERBOUGHT);
        details.rsi = { value: indicators.rsi, score: -Math.abs(SCORING_WEIGHTS.RSI_OVERBOUGHT), reason: 'Sobrecomprado' };
        console.log('❌ RSI sobrecomprado:', -Math.abs(SCORING_WEIGHTS.RSI_OVERBOUGHT));
      } else if (indicators.rsi < 35) {
        // RSI moderadamente sobrevendido
        total += 15;
        details.rsi = { value: indicators.rsi, score: 15, reason: 'RSI moderadamente baixo' };
        console.log('🟡 RSI moderadamente baixo:', 15);
      } else if (indicators.rsi > 75) {
        // RSI moderadamente sobrecomprado
        total -= 15;
        details.rsi = { value: indicators.rsi, score: -15, reason: 'RSI moderadamente alto' };
        console.log('🟡 RSI moderadamente alto:', -15);
      } else {
        console.log('🟡 RSI neutro:', indicators.rsi);
      }
    } else {
      console.log('⚠️ RSI não disponível');
    }

    // MACD
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      if (indicators.macd.MACD > indicators.macd.signal) {
        total += SCORING_WEIGHTS.MACD_BULLISH;
        details.macd = { score: SCORING_WEIGHTS.MACD_BULLISH, reason: 'Cruzamento bullish' };
        console.log('✅ MACD bullish:', SCORING_WEIGHTS.MACD_BULLISH);
      } else if (indicators.macd.MACD < indicators.macd.signal) {
        total += SCORING_WEIGHTS.MACD_BEARISH; // Já é negativo
        details.macd = { score: SCORING_WEIGHTS.MACD_BEARISH, reason: 'Cruzamento bearish' };
        console.log('❌ MACD bearish:', SCORING_WEIGHTS.MACD_BEARISH);
      }
    } else {
      console.log('⚠️ MACD não disponível');
    }

    // Ichimoku
    if (indicators.ichimoku && indicators.ichimoku.conversionLine !== null && indicators.ichimoku.baseLine !== null) {
      const { conversionLine, baseLine, spanA } = indicators.ichimoku;
      if (conversionLine > baseLine) {
        total += SCORING_WEIGHTS.ICHIMOKU_BULLISH;
        details.ichimoku = { score: SCORING_WEIGHTS.ICHIMOKU_BULLISH, reason: 'Sinal bullish' };
        console.log('✅ Ichimoku bullish:', SCORING_WEIGHTS.ICHIMOKU_BULLISH);
      }
    } else {
      console.log('⚠️ Ichimoku não disponível');
    }

    // Divergência de RSI
    if (indicators.rsiDivergence) {
      total += SCORING_WEIGHTS.RSI_DIVERGENCE;
      details.rsiDivergence = { score: SCORING_WEIGHTS.RSI_DIVERGENCE, reason: 'Divergência detectada' };
      console.log('✅ RSI divergência:', SCORING_WEIGHTS.RSI_DIVERGENCE);
    }

    // Médias móveis
    if (indicators.ma21 !== null && indicators.ma200 !== null) {
      if (indicators.ma21 > indicators.ma200) {
        // Verifica se a diferença é significativa (>2%)
        const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
        if (maDiff > 2) {
          total += SCORING_WEIGHTS.MA_BULLISH;
          details.movingAverages = { score: SCORING_WEIGHTS.MA_BULLISH, reason: `MA21 > MA200 (+${maDiff.toFixed(1)}%)` };
          console.log('✅ MA bullish forte:', SCORING_WEIGHTS.MA_BULLISH);
        } else if (maDiff > 0.5) {
          total += 5;
          details.movingAverages = { score: 5, reason: `MA21 > MA200 (+${maDiff.toFixed(1)}%)` };
          console.log('🟡 MA bullish fraco:', 5);
        }
      } else if (indicators.ma21 < indicators.ma200) {
        const maDiff = ((indicators.ma200 - indicators.ma21) / indicators.ma200) * 100;
        if (maDiff > 2) {
          total -= 15; // Penalidade por tendência bearish
          details.movingAverages = { score: -15, reason: `MA21 < MA200 (-${maDiff.toFixed(1)}%)` };
          console.log('❌ MA bearish forte:', -15);
        }
      }
    } else {
      console.log('⚠️ Médias móveis não disponíveis');
    }

    // Bandas de Bollinger
    if (indicators.bollinger && indicators.bollinger.upper !== null) {
      // Precisa do preço atual para comparar
      if (indicators.bollinger.middle && indicators.bollinger.middle > indicators.bollinger.upper) {
        total += SCORING_WEIGHTS.BOLLINGER_BREAKOUT;
        details.bollinger = { score: SCORING_WEIGHTS.BOLLINGER_BREAKOUT, reason: 'Rompimento superior' };
        console.log('✅ Bollinger breakout:', SCORING_WEIGHTS.BOLLINGER_BREAKOUT);
      }
    } else {
      console.log('⚠️ Bollinger não disponível');
    }

    console.log('📊 Total score indicadores:', total);
    return { total, details };
  }

  /**
   * Pontua padrões gráficos
   */
  scorePatterns(patterns) {
    let total = 0;
    const details = {};

    // Rompimentos
    if (patterns.breakout) {
      if (patterns.breakout.type === 'BULLISH_BREAKOUT') {
        total += SCORING_WEIGHTS.PATTERN_BREAKOUT;
        details.breakout = { 
          score: SCORING_WEIGHTS.PATTERN_BREAKOUT, 
          reason: `Rompimento bullish em ${patterns.breakout.level}` 
        };
      }
    }

    // Triângulos
    if (patterns.triangle) {
      if (patterns.triangle.bias === 'BULLISH') {
        total += SCORING_WEIGHTS.PATTERN_REVERSAL;
        details.triangle = { 
          score: SCORING_WEIGHTS.PATTERN_REVERSAL, 
          reason: patterns.triangle.type 
        };
      }
    }

    // Bandeiras
    if (patterns.flag) {
      if (patterns.flag.type === 'BULLISH_FLAG') {
        total += SCORING_WEIGHTS.PATTERN_REVERSAL;
        details.flag = { 
          score: SCORING_WEIGHTS.PATTERN_REVERSAL, 
          reason: 'Bandeira de alta' 
        };
      }
    }

    // Cunhas
    if (patterns.wedge) {
      if (patterns.wedge.bias === 'BULLISH') {
        total += SCORING_WEIGHTS.PATTERN_REVERSAL;
        details.wedge = { 
          score: SCORING_WEIGHTS.PATTERN_REVERSAL, 
          reason: patterns.wedge.type 
        };
      }
    }

    // Padrões duplos
    if (patterns.double) {
      if (patterns.double.bias === 'BULLISH') {
        total += SCORING_WEIGHTS.PATTERN_REVERSAL;
        details.double = { 
          score: SCORING_WEIGHTS.PATTERN_REVERSAL, 
          reason: patterns.double.type 
        };
      }
    }

    // Cabeça e ombros
    if (patterns.headShoulders) {
      if (patterns.headShoulders.bias === 'BEARISH') {
        total -= SCORING_WEIGHTS.PATTERN_REVERSAL; // Negativo para bearish
        details.headShoulders = { 
          score: -SCORING_WEIGHTS.PATTERN_REVERSAL, 
          reason: 'Cabeça e ombros bearish' 
        };
      }
    }

    // Padrões de candlestick
    if (patterns.candlestick && patterns.candlestick.length > 0) {
      patterns.candlestick.forEach(pattern => {
        if (pattern.bias === 'BULLISH') {
          total += 10; // Peso aumentado para candlesticks
          details[pattern.type] = { score: 10, reason: pattern.type };
        }
      });
    }

    return { total, details };
  }

  /**
   * Pontua confirmação de volume
   */
  scoreVolume(data, indicators) {
    console.log('🔍 Analisando volume:', {
      hasVolume: !!data.volume,
      hasVolumeMA: !!indicators.volumeMA,
      currentVolume: data.volume ? data.volume[data.volume.length - 1] : null,
      volumeMA: indicators.volumeMA
    });

    if (!data.volume || !indicators.volumeMA) return 0;

    const currentVolume = data.volume[data.volume.length - 1];
    const avgVolume = indicators.volumeMA;

    // Volume precisa ser significativamente alto para confirmar
    if (currentVolume > avgVolume * 2.0) {
      console.log('✅ Volume alto confirmado:', SCORING_WEIGHTS.VOLUME_CONFIRMATION);
      return SCORING_WEIGHTS.VOLUME_CONFIRMATION;
    } else if (currentVolume > avgVolume * 1.5) {
      console.log('🟡 Volume moderadamente alto:', 8);
      return 8;
    }

    console.log('🟡 Volume normal');
    return 0;
  }

  /**
   * Calcula níveis de entrada, alvos e stop-loss
   */
  calculateTradingLevels(currentPrice, trend = 'BULLISH') {
    const entry = currentPrice;
    const isLong = trend === 'BULLISH';
    
    // Calcula alvos baseado na direção
    const targets = TRADING_CONFIG.TARGET_PERCENTAGES.map(percentage => {
      if (isLong) {
        return entry * (1 + percentage / 100); // COMPRA: alvos acima
      } else {
        return entry * (1 - percentage / 100); // VENDA: alvos abaixo
      }
    });

    // Calcula stop-loss baseado na direção
    const stopLoss = isLong 
      ? entry * (1 + TRADING_CONFIG.STOP_LOSS_PERCENTAGE / 100) // COMPRA: stop abaixo
      : entry * (1 - TRADING_CONFIG.STOP_LOSS_PERCENTAGE / 100); // VENDA: stop acima

    // Calcula risk/reward ratio
    const riskRewardRatio = (targets[0] - entry) / (entry - stopLoss);

    return {
      entry,
      targets,
      stopLoss,
      riskRewardRatio: Math.abs(riskRewardRatio)
    };
  }

  /**
   * Avalia qualidade do sinal
   */
  evaluateSignalQuality(score, riskRewardRatio, marketConditions) {
    let quality = 'LOW';

    if (score >= 85 && riskRewardRatio >= 2) {
      quality = 'EXCELLENT';
    } else if (score >= 75 && riskRewardRatio >= 1.5) {
      quality = 'HIGH';
    } else if (score >= 70 && riskRewardRatio >= 1) {
      quality = 'MEDIUM';
    }

    // Ajusta baseado nas condições de mercado
    if (marketConditions && marketConditions.volatility > 0.05) {
      quality = this.downgradeQuality(quality);
    }

    return quality;
  }

  /**
   * Rebaixa qualidade do sinal
   */
  downgradeQuality(quality) {
    const levels = ['LOW', 'MEDIUM', 'HIGH', 'EXCELLENT'];
    const currentIndex = levels.indexOf(quality);
    return levels[Math.max(0, currentIndex - 1)];
  }

  /**
   * Aplica lógica de priorização de tendência
   */
  applyTrendPriority(currentScore, indicators, patterns, marketTrend) {
    const signalTrend = this.detectSignalTrend(indicators, patterns);
    let adjustedScore = currentScore;
    const details = {
      marketTrend,
      signalTrend,
      adjustment: 0,
      reason: ''
    };

    // Se não conseguir detectar tendência do mercado, usa tendência local
    const effectiveTrend = marketTrend || this.detectLocalTrend(indicators);
    details.effectiveTrend = effectiveTrend;

    // LÓGICA DE PRIORIZAÇÃO
    if (effectiveTrend === 'BULLISH') {
      if (signalTrend === 'BULLISH') {
        // Tendência de alta + sinal de compra = PRIORIDADE
        adjustedScore *= 1.15; // +15% bonus
        details.adjustment = 15;
        details.reason = 'Sinal alinhado com tendência de alta';
      } else if (signalTrend === 'BEARISH') {
        // Tendência de alta + sinal de venda = EXCEÇÃO (precisa ser muito forte)
        const reversalStrength = this.calculateReversalStrength(indicators, patterns);
        if (reversalStrength < 80) {
          adjustedScore *= 0.6; // -40% penalidade
          details.adjustment = -40;
          details.reason = 'Sinal contra tendência - padrão de reversão fraco';
        } else {
          adjustedScore *= 1.10; // +10% se reversão muito forte
          details.adjustment = 10;
          details.reason = 'Padrão de reversão muito forte detectado';
        }
      }
    } else if (effectiveTrend === 'BEARISH') {
      if (signalTrend === 'BEARISH') {
        // Tendência de baixa + sinal de venda = PRIORIDADE
        adjustedScore *= 1.15; // +15% bonus
        details.adjustment = 15;
        details.reason = 'Sinal alinhado com tendência de baixa';
      } else if (signalTrend === 'BULLISH') {
        // Tendência de baixa + sinal de compra = EXCEÇÃO (precisa ser muito forte)
        const reversalStrength = this.calculateReversalStrength(indicators, patterns);
        if (reversalStrength < 80) {
          adjustedScore *= 0.6; // -40% penalidade
          details.adjustment = -40;
          details.reason = 'Sinal contra tendência - padrão de reversão fraco';
        } else {
          adjustedScore *= 1.10; // +10% se reversão muito forte
          details.adjustment = 10;
          details.reason = 'Padrão de reversão muito forte detectado';
        }
      }
    }

    return {
      adjustedScore: Math.min(adjustedScore, 100),
      details
    };
  }

  /**
   * Detecta tendência do sinal baseado em indicadores e padrões
   */
  detectSignalTrend(indicators, patterns) {
    let bullishSignals = 0;
    let bearishSignals = 0;

    // Análise de indicadores
    if (indicators.rsi < 30) bullishSignals++;
    if (indicators.rsi > 70) bearishSignals++;

    if (indicators.macd && indicators.macd.MACD > indicators.macd.signal) {
      bullishSignals++;
    } else if (indicators.macd && indicators.macd.MACD < indicators.macd.signal) {
      bearishSignals++;
    }

    if (indicators.ma21 > indicators.ma200) {
      bullishSignals++;
    } else if (indicators.ma21 < indicators.ma200) {
      bearishSignals++;
    }

    // Análise de padrões
    if (patterns.breakout && patterns.breakout.type === 'BULLISH_BREAKOUT') {
      bullishSignals += 2; // Peso maior para breakouts
    } else if (patterns.breakout && patterns.breakout.type === 'BEARISH_BREAKOUT') {
      bearishSignals += 2;
    }

    if (patterns.triangle && patterns.triangle.bias === 'BULLISH') {
      bullishSignals++;
    } else if (patterns.triangle && patterns.triangle.bias === 'BEARISH') {
      bearishSignals++;
    }

    if (patterns.candlestick) {
      patterns.candlestick.forEach(pattern => {
        if (pattern.bias === 'BULLISH') bullishSignals++;
        if (pattern.bias === 'BEARISH') bearishSignals++;
      });
    }

    // Determina tendência do sinal
    if (bullishSignals > bearishSignals) {
      return 'BULLISH';
    } else if (bearishSignals > bullishSignals) {
      return 'BEARISH';
    } else {
      return 'NEUTRAL';
    }
  }

  /**
   * Detecta tendência local baseada em médias móveis
   */
  detectLocalTrend(indicators) {
    if (indicators.ma21 && indicators.ma200) {
      if (indicators.ma21 > indicators.ma200 * 1.02) {
        return 'BULLISH';
      } else if (indicators.ma21 < indicators.ma200 * 0.98) {
        return 'BEARISH';
      }
    }
    return 'NEUTRAL';
  }

  /**
   * Calcula força do padrão de reversão
   */
  calculateReversalStrength(indicators, patterns) {
    let strength = 0;

    // RSI extremo
    if (indicators.rsi < 15 || indicators.rsi > 85) {
      strength += 30; // RSI muito extremo
    } else if (indicators.rsi < 25 || indicators.rsi > 75) {
      strength += 20; // RSI extremo
    }

    // Divergência de RSI
    if (indicators.rsiDivergence) {
      strength += 25; // Divergência é sinal muito forte
    }

    // Padrões de reversão fortes
    if (patterns.double && (patterns.double.type === 'DOUBLE_TOP' || patterns.double.type === 'DOUBLE_BOTTOM')) {
      strength += 30; // Topo/Fundo duplo muito confiável
    }

    if (patterns.headShoulders) {
      strength += 35; // Cabeça e ombros padrão clássico
    }

    // Rompimento de níveis importantes com volume
    if (patterns.breakout && patterns.breakout.strength === 'HIGH') {
      if (patterns.breakout.type === 'BEARISH_BREAKOUT' || patterns.breakout.type === 'BULLISH_BREAKOUT') {
        strength += 25; // Rompimento forte contra tendência
      }
    }

    // Padrões de candlestick de reversão
    if (patterns.candlestick) {
      const strongReversalPatterns = ['BULLISH_ENGULFING', 'BEARISH_ENGULFING'];
      const moderateReversalPatterns = ['HAMMER', 'HANGING_MAN', 'DOJI'];
      
      patterns.candlestick.forEach(pattern => {
        if (strongReversalPatterns.includes(pattern.type)) {
          strength += 20; // Engolfos são muito fortes
        } else if (moderateReversalPatterns.includes(pattern.type)) {
          strength += 15;
        }
      });
    }

    // MACD divergindo da tendência
    if (indicators.macd && indicators.macd.MACD && indicators.macd.signal) {
      const macdCrossover = Math.abs(indicators.macd.MACD - indicators.macd.signal);
      if (macdCrossover > 0.001) { // Cruzamento significativo
        strength += 15;
      }
    }

    // Múltiplos timeframes confirmando reversão (simulado)
    if (strength > 50) {
      strength += 10; // Bônus se múltiplos sinais convergem
    }

    return Math.min(strength, 100);
  }
}

export default SignalScoringService;