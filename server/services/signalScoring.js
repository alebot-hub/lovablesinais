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

    // Verifica limites de sinais contra-tendência (se adaptiveScoring disponível)
    const now = Date.now();
    const isCounterTrend = (effectiveTrend === 'BULLISH' && signalTrend === 'BEARISH') ||
                          (effectiveTrend === 'BEARISH' && signalTrend === 'BULLISH');
    
    if (isCounterTrend && this.adaptiveScoring) {
      // Verifica limite diário
      if (this.adaptiveScoring.counterTrendToday >= TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY) {
        adjustedScore *= 0.1; // Reduz drasticamente (90% redução)
        details.adjustment = -90;
        details.reason = 'Limite diário de sinais contra-tendência atingido';
        details.counterTrendBlocked = true;
        return { adjustedScore, details };
      }
      
      // Verifica cooldown
      if (now - this.adaptiveScoring.lastCounterTrendTime < TRADING_CONFIG.COUNTER_TREND.COUNTER_TREND_COOLDOWN) {
        const remainingHours = Math.ceil((TRADING_CONFIG.COUNTER_TREND.COUNTER_TREND_COOLDOWN - (now - this.adaptiveScoring.lastCounterTrendTime)) / (60 * 60 * 1000));
        adjustedScore *= 0.2; // Reduz drasticamente (80% redução)
        details.adjustment = -80;
        details.reason = `Cooldown contra-tendência ativo (${remainingHours}h restantes)`;
        details.counterTrendCooldown = true;
        return { adjustedScore, details };
      }
    }

    // LÓGICA DE PRIORIZAÇÃO
    if (effectiveTrend === 'BULLISH') {
      if (signalTrend === 'BULLISH') {
        // Tendência de alta + sinal de compra = PRIORIDADE MÁXIMA
        adjustedScore *= 1.20; // +20% bonus (aumentado)
        details.adjustment = 20;
        details.reason = 'COMPRA alinhada com tendência de alta - PRIORIDADE';
      } else if (signalTrend === 'BEARISH') {
        // Tendência de alta + sinal de venda = EXCEÇÃO RARA (precisa ser EXTREMAMENTE forte)
        const reversalStrength = this.calculateReversalStrength(indicators, patterns);
        console.log(`⚠️ Sinal VENDA em tendência de ALTA - Força de reversão: ${reversalStrength}/100`);
        
        if (reversalStrength < TRADING_CONFIG.COUNTER_TREND.MIN_REVERSAL_STRENGTH) {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.PENALTY_WEAK_REVERSAL;
          details.adjustment = -70;
          details.reason = 'VENDA contra tendência de ALTA - padrão de reversão INSUFICIENTE';
        } else if (reversalStrength >= TRADING_CONFIG.COUNTER_TREND.EXTREME_REVERSAL_THRESHOLD) {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL;
          details.adjustment = 10;
          details.reason = 'VENDA contra tendência - padrão de reversão HISTORICAMENTE forte';
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Sinal contra-tendência aprovado: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
          }
        } else {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL;
          details.adjustment = 5;
          details.reason = 'VENDA contra tendência - padrão de reversão forte detectado';
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Sinal contra-tendência aprovado: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
          }
        }
      }
    } else if (effectiveTrend === 'BEARISH') {
      if (signalTrend === 'BEARISH') {
        // Tendência de baixa + sinal de venda = PRIORIDADE MÁXIMA
        adjustedScore *= 1.20; // +20% bonus (aumentado)
        details.adjustment = 20;
        details.reason = 'VENDA alinhada com tendência de baixa - PRIORIDADE';
      } else if (signalTrend === 'BULLISH') {
        // Tendência de baixa + sinal de compra = EXCEÇÃO RARA (precisa ser EXTREMAMENTE forte)
        const reversalStrength = this.calculateReversalStrength(indicators, patterns);
        console.log(`⚠️ Sinal COMPRA em tendência de BAIXA - Força de reversão: ${reversalStrength}/100`);
        
        if (reversalStrength < TRADING_CONFIG.COUNTER_TREND.MIN_REVERSAL_STRENGTH) {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.PENALTY_WEAK_REVERSAL;
          details.adjustment = -70;
          details.reason = 'COMPRA contra tendência de BAIXA - padrão de reversão INSUFICIENTE';
        } else if (reversalStrength >= TRADING_CONFIG.COUNTER_TREND.EXTREME_REVERSAL_THRESHOLD) {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL;
          details.adjustment = 10;
          details.reason = 'COMPRA contra tendência - padrão de reversão HISTORICAMENTE forte';
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Sinal contra-tendência aprovado: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
          }
        } else {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL;
          details.adjustment = 5;
          details.reason = 'COMPRA contra tendência - padrão de reversão forte detectado';
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Sinal contra-tendência aprovado: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
          }
        }
      }
    } else {
      // Mercado lateral - sinais de breakout são favorecidos
      if (patterns.breakout && patterns.breakout.strength === 'HIGH') {
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.SIDEWAYS_BREAKOUT_BONUS;
        details.adjustment = 25;
        details.reason = 'Breakout forte em mercado lateral';
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

    // RSI MUITO extremo (critério mais rigoroso)
    if (indicators.rsi < 5 || indicators.rsi > 95) {
      strength += 50; // RSI historicamente extremo
    } else if (indicators.rsi < 8 || indicators.rsi > 92) {
      strength += 40; // RSI extremamente extremo
    } else if (indicators.rsi < 12 || indicators.rsi > 88) {
      strength += 25; // RSI muito extremo
    } else if (indicators.rsi < 15 || indicators.rsi > 85) {
      strength += 15; // RSI extremo (peso reduzido)
    }

    // Divergência de RSI
    if (indicators.rsiDivergence) {
      strength += 45; // Divergência é sinal MUITO forte para contra-tendência
    }

    // Padrões de reversão MUITO fortes
    if (patterns.double && (patterns.double.type === 'DOUBLE_TOP' || patterns.double.type === 'DOUBLE_BOTTOM')) {
      strength += 50; // Topo/Fundo duplo MUITO confiável
    }

    if (patterns.headShoulders) {
      strength += 55; // Cabeça e ombros padrão CLÁSSICO
    }

    // Rompimento de níveis CRÍTICOS com volume ALTO
    if (patterns.breakout && patterns.breakout.strength === 'HIGH') {
      if (patterns.breakout.type === 'BEARISH_BREAKOUT' || patterns.breakout.type === 'BULLISH_BREAKOUT') {
        strength += 45; // Rompimento MUITO forte
      }
    }

    // Padrões de candlestick de reversão FORTES
    if (patterns.candlestick) {
      const strongReversalPatterns = ['BULLISH_ENGULFING', 'BEARISH_ENGULFING'];
      const moderateReversalPatterns = ['HAMMER', 'HANGING_MAN'];
      
      patterns.candlestick.forEach(pattern => {
        if (strongReversalPatterns.includes(pattern.type)) {
          strength += 35; // Engolfos são MUITO fortes
        } else if (moderateReversalPatterns.includes(pattern.type)) {
          strength += 20; // Peso reduzido para outros padrões
        }
      });
    }

    // MACD divergindo FORTEMENTE da tendência
    if (indicators.macd && indicators.macd.MACD && indicators.macd.signal) {
      const macdCrossover = Math.abs(indicators.macd.MACD - indicators.macd.signal);
      if (macdCrossover > 0.005) { // Cruzamento MUITO significativo
        strength += 30;
      } else if (macdCrossover > 0.002) {
        strength += 20;
      }
    }

    // Volume EXTREMO confirmando reversão
    if (indicators.volumeMA && indicators.currentVolume) {
      const volumeRatio = indicators.currentVolume / indicators.volumeMA;
      if (volumeRatio > 5.0) { // Volume 5x acima da média
        strength += 40;
      } else if (volumeRatio > 3.5) { // Volume 3.5x acima da média
        strength += 30;
      } else if (volumeRatio > 2.5) {
        strength += 15;
      }
    }

    // Múltiplos indicadores EXTREMOS convergindo
    let extremeIndicators = 0;
    if (indicators.rsi && (indicators.rsi < 10 || indicators.rsi > 90)) extremeIndicators++;
    if (indicators.rsiDivergence) extremeIndicators++;
    if (patterns.double || patterns.headShoulders) extremeIndicators++;
    if (patterns.breakout && patterns.breakout.strength === 'HIGH') extremeIndicators++;
    
    if (extremeIndicators >= 4) {
      strength += 35; // Bônus ALTO por convergência TOTAL
    } else if (extremeIndicators >= 3) {
      strength += 25; // Bônus por convergência de sinais
    }

    // Bônus adicional para padrões HISTORICAMENTE raros
    if (indicators.rsi && indicators.rsi < 3) {
      strength += 30; // RSI abaixo de 3 é HISTORICAMENTE raro
    }
    if (indicators.rsi && indicators.rsi > 97) {
      strength += 30; // RSI acima de 97 é HISTORICAMENTE raro
    }

    return Math.min(strength, 100);
  }
}

export default SignalScoringService;