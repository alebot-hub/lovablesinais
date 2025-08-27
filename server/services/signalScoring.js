/**
 * Serviço de pontuação de sinais
 */

import { TRADING_CONFIG } from '../config/constants.js';

import { SCORING_WEIGHTS, TRADING_CONFIG } from '../config/constants.js';

class SignalScoringService {
  /**
   * Calcula pontuação total do sinal
   */
  calculateSignalScore(data, indicators, patterns, mlProbability, marketTrend = null, bitcoinCorrelation = null) {
    const symbol = data.symbol || 'UNKNOWN';
    console.log(`\n🔍 [${symbol}] INÍCIO DA ANÁLISE DE SINAL`);
    
    // Log do regime de mercado
    console.log(`🌐 [${symbol}] REGIME: ${marketTrend || 'Não especificado'}`);
    if (bitcoinCorrelation) {
      console.log(`₿ [${symbol}] Correlação BTC: ${bitcoinCorrelation.alignment || 'N/A'}`);
    }

    let score = 0;
    const details = {};
    let isMLDriven = false;
    let confirmations = 0;
    let strengthFactors = [];
    const scoreComponents = [];
    
    // Inicializa o contador de ativos analisados se não existir
    if (!global.assetsAnalyzed) {
      global.assetsAnalyzed = 0;
      global.bestSignals = [];
    }
    global.assetsAnalyzed++;

    try {
      // Validação básica
      if (!data || !indicators) {
        const errorMsg = '❌ Dados ou indicadores ausentes';
        console.error(errorMsg);
        return { totalScore: 0, details: {}, isValid: false, isMLDriven: false, reason: errorMsg };
      }

      // Função auxiliar para adicionar e logar componentes de pontuação
      const addScoreComponent = (name, value, weight = 1, description = '') => {
        const weightedValue = value * weight;
        const component = { name, value, weight, weightedValue, description };
        scoreComponents.push(component);
        
        // Formata a saída para melhor legibilidade
        const valueStr = value.toFixed(2).padStart(6);
        const weightedStr = weightedValue.toFixed(2).padStart(6);
        const weightStr = weight.toFixed(2).padStart(4);
        
        let logLine = `  • ${name.padEnd(25)}: ${valueStr} × ${weightStr} = ${weightedStr}`;
        if (description) logLine += ` (${description})`;
        console.log(logLine);
        
        return weightedValue;
      };

      console.log(`📈 [${symbol}] ANALISANDO INDICADORES`);
      const indicatorScore = this.scoreIndicators(indicators);
      score += addScoreComponent('Indicadores Técnicos', indicatorScore.total, 1, 
        `RSI: ${indicators.rsi?.toFixed(2) || 'N/A'}, ` +
        `MACD: ${indicators.macd?.histogram?.toFixed(6) || 'N/A'}`);
      
      details.indicators = indicatorScore.details;
      confirmations += indicatorScore.confirmations || 0;
      strengthFactors.push(...(indicatorScore.strengthFactors || []));
      console.log(`📊 [${symbol}] Confirmações indicadores: ${indicatorScore.confirmations || 0}`);
      
      // Análise detalhada dos indicadores
      if (indicators.rsi !== undefined) {
        let rsiAnalysis = '';
        if (indicators.rsi < 30) rsiAnalysis = 'SOBREVENDA';
        else if (indicators.rsi > 70) rsiAnalysis = 'SOBRECOMPRA';
        if (rsiAnalysis) console.log(`📊 [${symbol}] ${rsiAnalysis}: RSI ${indicators.rsi.toFixed(2)}`);
      }
      
      if (indicators.macd?.histogram !== undefined) {
        if (Math.abs(indicators.macd.histogram) > 0.000001) {
          console.log(`📊 [${symbol}] MACD: ${indicators.macd.histogram > 0 ? 'COMPRA' : 'VENDA'} ` + 
                     `(${Math.abs(indicators.macd.histogram).toFixed(8)})`);
        }
      }

      console.log(`🔍 [${symbol}] ANALISANDO PADRÕES`);
      const patternScore = this.scorePatterns(patterns || {});
      score += addScoreComponent('Padrões Gráficos', patternScore.total, 1, 
        `Reversão: ${patterns?.reversalPatterns?.length || 0}, ` +
        `Continuação: ${patterns?.continuationPatterns?.length || 0}`);
      
      details.patterns = patternScore.details;
      confirmations += patternScore.confirmations || 0;
      strengthFactors.push(...(patternScore.strengthFactors || []));
      console.log(`🔍 [${symbol}] Confirmações padrões: ${patternScore.confirmations || 0}`);

      console.log(`📊 [${symbol}] ANALISANDO VOLUME`);
      const volumeScore = this.scoreVolume(data, indicators);
      const volumeRatio = indicators.volumeMA ? (data.volume / indicators.volumeMA).toFixed(2) : 0;
      score += addScoreComponent('Volume', volumeScore, 1, 
        `Atual: ${data.volume?.toFixed(2) || 'N/A'}, ` +
        `Média: ${indicators.volumeMA?.toFixed(2) || 'N/A'} (${volumeRatio}x)`);
      
      details.volume = volumeScore;
      if (volumeScore > 0) confirmations++;
      if (volumeScore > 15) strengthFactors.push('VOLUME_HIGH');
      if (volumeScore > 25) strengthFactors.push('VOLUME_EXTREME');

      console.log(`✅ [${symbol}] VERIFICANDO FILTROS`);
      const qualityCheck = this.applyQualityFilters(data, indicators, patterns, confirmations);
      if (!qualityCheck.passed) {
        console.log(`❌ [${symbol}] REJEITADO: ${qualityCheck.reason}`);
        return { 
          totalScore: 0, 
          details: { ...details, qualityCheck }, 
          isValid: false, 
          isMLDriven: false,
          reason: qualityCheck.reason,
          scoreComponents
        };
      }
      
      console.log(`🏁 [${symbol}] RESULTADO FINAL`);
      console.log(`📊 [${symbol}] Score bruto: ${score.toFixed(2)}`);
      console.log(`📊 [${symbol}] Confirmações: ${confirmations}`);
      
      // Bônus por múltiplas confirmações
      if (confirmations >= TRADING_CONFIG.QUALITY_FILTERS.MIN_CONFIRMATIONS) {
        const confirmationBonus = (confirmations - 1) * 5; // Ajustado para começar do primeiro
        if (confirmationBonus > 0) {
          score += addScoreComponent('Bônus Confirmações', confirmationBonus, 1, 
            `${confirmations} confirmações`);
        }
      }

      // Pontuação do Machine Learning
      const mlScore = (mlProbability || 0) * SCORING_WEIGHTS.ML_WEIGHT * 100;
      if (mlScore > 0) {
        score += addScoreComponent('Machine Learning', mlScore, 1, 
          `Probabilidade: ${(mlProbability * 100).toFixed(1)}%`);
        details.machineLearning = mlScore;
        if (mlProbability > 0.6) confirmations++;
        
        if (mlScore > score * 0.4 && mlProbability > 0.7) {
          isMLDriven = true;
          console.log('  🔥 Sinal impulsionado por ML');
        }
      }

      // Ajuste final baseado no regime de mercado
      let marketRegimeAdjustment = 0;
      if (marketTrend === 'BEARISH') {
        marketRegimeAdjustment = score * 0.1; // Bônus de 10% em mercados de baixa
        console.log(`  🐻 Ajuste para mercado em baixa: +${marketRegimeAdjustment.toFixed(2)}`);
      } else if (marketTrend === 'VOLATILE') {
        marketRegimeAdjustment = -score * 0.05; // Redução de 5% em mercados voláteis
        console.log(`  ⚡ Ajuste para mercado volátil: ${marketRegimeAdjustment.toFixed(2)}`);
      }
      
      score += marketRegimeAdjustment;
      
      // Detecção de tendência de baixa
      const downtrendAnalysis = this.detectDowntrend(indicators);
      if (downtrendAnalysis.isDowntrend) {
        // Bônus para sinais de venda em tendência de baixa
        const downtrendBonus = 15;
        score += downtrendBonus;
        console.log(`   🎯 Bônus de tendência de baixa: +${downtrendBonus} pontos`);
        details.downtrendAnalysis = {
          ...downtrendAnalysis,
          bonusApplied: downtrendBonus
        };
      }

      // Verificação de score final
      // Adiciona variação realista baseada em múltiplos fatores
      let finalScore = Math.min(100, Math.max(0, score));
      
      // Adiciona variação baseada na qualidade dos indicadores
      const qualityVariation = this.calculateQualityVariation(indicators, patterns, mlProbability);
      finalScore += qualityVariation;
      
      // Adiciona variação baseada no timeframe
      const timeframeVariation = this.calculateTimeframeVariation(this.currentTimeframe);
      finalScore += timeframeVariation;
      
      // Adiciona variação baseada na força dos sinais
      const strengthVariation = this.calculateStrengthVariation(confirmations, strengthFactors);
      finalScore += strengthVariation;
      
      // Adiciona pequena variação aleatória para evitar repetição
      const randomVariation = (Math.random() - 0.5) * 3; // ±1.5%
      finalScore += randomVariation;
      
      // Arredonda para 3 casas decimais para maior precisão
      finalScore = Math.min(100, Math.max(0, Math.round(finalScore * 1000) / 1000));
      const isValid = finalScore >= TRADING_CONFIG.MIN_SIGNAL_PROBABILITY;
      
      console.log(`📊 [${symbol}] DETALHAMENTO DO SCORE:`);
      
      scoreComponents.forEach(comp => {
        console.log(`📊 [${symbol}] ${comp.name}: ${comp.value.toFixed(2)} × ${comp.weight.toFixed(2)} = ${comp.weightedValue.toFixed(2)}`);
      });
      
      console.log(`🎯 [${symbol}] SCORE FINAL: ${finalScore.toFixed(1)}/${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY}`);
      
      // Log resumido
      const logPrefix = isValid ? '✅ SINAL VÁLIDO' : '❌ SINAL INVÁLIDO';
      console.log(`${logPrefix} [${symbol}] Score: ${finalScore.toFixed(1)}/100`);
      
      if (!isValid) {
        const missingPoints = (TRADING_CONFIG.MIN_SIGNAL_PROBABILITY - finalScore).toFixed(1);
        console.log(`❌ [${symbol}] Insuficiente: ${finalScore.toFixed(1)} < ${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY} (faltam ${missingPoints})`);
      } else {
        console.log(`🏆 [${symbol}] SINAL VÁLIDO ENCONTRADO!`);
      }
      
      return {
        totalScore: finalScore,
        details: { ...details, scoreComponents },
        isValid,
        isMLDriven,
        confirmations,
        strengthFactors,
        reason: isValid ? 'Sinal válido' : `Pontuação insuficiente (${finalScore.toFixed(1)}/${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY})`
      };
      
    } catch (error) {
      console.error('❌ Erro ao calcular pontuação do sinal:', error);
      return { 
        totalScore: 0, 
        details: { error: error.message }, 
        isValid: false, 
        isMLDriven: false,
        reason: `Erro: ${error.message}`,
        scoreComponents: []
      };
    }
  }

  /**
   * Detecta tendência de baixa com base em múltiplos indicadores
   */
  detectDowntrend(indicators) {
    const { rsi, macd, bollingerBands } = indicators;
    let trendScore = 0;
    const details = [];
    
    // Análise RSI
    if (rsi > 70) {
      trendScore += 0.4;
      details.push(`RSI alto (${rsi.toFixed(2)})`);
    } else if (rsi > 60) {
      trendScore += 0.2;
      details.push(`RSI moderado (${rsi.toFixed(2)})`);
    }
    
    // Análise MACD
    if (macd?.histogram < 0 && macd?.macd < macd?.signal) {
      trendScore += 0.3;
      details.push('MACD cruzamento para baixo');
    } else if (macd?.histogram < 0) {
      trendScore += 0.15;
      details.push('MACD negativo');
    }
    
    // Análise Bandas de Bollinger
    if (bollingerBands?.upper && bollingerBands?.middle) {
      const price = bollingerBands.close;
      const upperBand = bollingerBands.upper;
      const middleBand = bollingerBands.middle;
      const distanceToUpper = (price - middleBand) / (upperBand - middleBand);
      
      if (distanceToUpper > 0.7) {
        trendScore += 0.3;
        details.push(`Preço próximo à banda superior (${(distanceToUpper * 100).toFixed(1)}%)`);
      }
    }

    const isDowntrend = trendScore > 0.6;
    if (isDowntrend) {
      console.log(`📉 TENDÊNCIA DE BAIXA DETECTADA (Score: ${(trendScore * 100).toFixed(1)}/100)`);
      console.log(`   Fatores: ${details.join(', ')}`);
    }
    
    return { isDowntrend, score: trendScore, details };
  }

  /**
   * Calcula variação baseada na qualidade dos indicadores
   */
  calculateQualityVariation(indicators, patterns, mlProbability) {
    let variation = 0;
    
    // Variação baseada na força do RSI
    if (indicators.rsi !== undefined) {
      const rsiExtreme = Math.min(indicators.rsi, 100 - indicators.rsi); // Distância do centro
      if (rsiExtreme < 20) {
        variation += 5 + (20 - rsiExtreme) * 0.3; // Bônus para RSI extremo
      } else if (rsiExtreme < 30) {
        variation += 2 + (30 - rsiExtreme) * 0.2;
      }
    }
    
    // Variação baseada na força do MACD
    if (indicators.macd && indicators.macd.histogram !== undefined) {
      const macdStrength = Math.abs(indicators.macd.histogram) * 1000000;
      variation += Math.min(8, macdStrength * 2); // Máximo 8 pontos
    }
    
    // Variação baseada nos padrões
    if (patterns.breakout) {
      variation += 3 + Math.random() * 4; // 3-7 pontos para breakouts
    }
    
    if (patterns.candlestick && patterns.candlestick.length > 0) {
      variation += 2 + Math.random() * 3; // 2-5 pontos para padrões candlestick
    }
    
    // Variação baseada no ML
    if (mlProbability > 0.6) {
      variation += (mlProbability - 0.5) * 10; // Até 5 pontos para ML forte
    } else if (mlProbability < 0.4) {
      variation -= (0.5 - mlProbability) * 8; // Penalidade para ML fraco
    }
    
    return variation;
  }
  
  /**
   * Calcula variação baseada no timeframe
   */
  calculateTimeframeVariation(timeframe) {
    const timeframeBonus = {
      '5m': -2 + Math.random() * 2,   // -2 a 0 (menos confiável)
      '15m': -1 + Math.random() * 3,  // -1 a +2
      '1h': 0 + Math.random() * 4,    // 0 a +4 (timeframe padrão)
      '4h': 2 + Math.random() * 4,    // +2 a +6 (mais confiável)
      '1d': 3 + Math.random() * 5     // +3 a +8 (mais confiável)
    };
    
    return timeframeBonus[timeframe] || 0;
  }
  
  /**
   * Calcula variação baseada na força dos sinais
   */
  calculateStrengthVariation(confirmations, strengthFactors) {
    let variation = 0;
    
    // Bônus por confirmações múltiplas
    if (confirmations >= 4) {
      variation += 4 + Math.random() * 3; // +4 a +7
    } else if (confirmations >= 3) {
      variation += 2 + Math.random() * 2; // +2 a +4
    } else if (confirmations >= 2) {
      variation += Math.random() * 2; // 0 a +2
    } else {
      variation -= 1 + Math.random() * 2; // -1 a -3 (poucas confirmações)
    }
    
    // Bônus por fatores de força
    const strengthBonus = strengthFactors.length * (1 + Math.random() * 0.5);
    variation += strengthBonus;
    
    return variation;
  }

  /**
   * Define o timeframe atual para uso nos cálculos de pontuação
   * @param {string} timeframe - O timeframe atual (ex: '1h', '4h', '1d')
   */
  setCurrentTimeframe(timeframe) {
    this.currentTimeframe = timeframe;
    console.log(`[SignalScoring] Timeframe atual definido para: ${timeframe}`);
    return this.currentTimeframe;
  }

  /**
   * Calcula níveis de trading (entrada, alvos, stop loss)
   */
  calculateTradingLevels(entryPrice, trend = 'BULLISH') {
    const entry = entryPrice;
    const isLong = trend === 'BULLISH';
    
    // Alvos ajustados para maior sensibilidade
    const targetPercentages = [1.2, 2.4, 3.6, 4.8, 6.0, 7.2]; // Reduzido de [1.5, 3.0, ...]
    const stopLossPercentage = 2.5; // Reduzido de 3.0
    
    let targets, stopLoss;
    
    if (isLong) {
      targets = targetPercentages.map(pct => entry * (1 + pct / 100));
      stopLoss = entry * (1 - stopLossPercentage / 100);
    } else {
      targets = targetPercentages.map(pct => entry * (1 - pct / 100));
      stopLoss = entry * (1 + stopLossPercentage / 100);
    }
    
    const riskRewardRatio = targetPercentages[0] / stopLossPercentage;
    
    return {
      entry,
      targets,
      stopLoss,
      riskRewardRatio
    };
  }

  /**
   * Aplica filtros de qualidade ao sinal
   */
  applyQualityFilters(data, indicators, patterns, confirmations) {
    const reasons = [];
    const result = { passed: true, reason: '' };

    // Verificação de volume
    if (indicators.volume && indicators.volume.volumeRatio < TRADING_CONFIG.QUALITY_FILTERS.MIN_VOLUME_RATIO) {
      reasons.push(`Volume (${indicators.volume.volumeRatio.toFixed(2)}x) abaixo do mínimo (${TRADING_CONFIG.QUALITY_FILTERS.MIN_VOLUME_RATIO}x)`);
    }

    // Verificação de RSI
    if (indicators.rsi) {
      if (indicators.rsi < TRADING_CONFIG.QUALITY_FILTERS.MIN_RSI_EXTREME || 
          indicators.rsi > TRADING_CONFIG.QUALITY_FILTERS.MAX_RSI_EXTREME) {
        reasons.push(`RSI (${indicators.rsi.toFixed(2)}) fora da faixa aceitável [${TRADING_CONFIG.QUALITY_FILTERS.MIN_RSI_EXTREME}-${TRADING_CONFIG.QUALITY_FILTERS.MAX_RSI_EXTREME}]`);
      }
    }

    // Verificação de confirmações
    if (TRADING_CONFIG.QUALITY_FILTERS.REQUIRE_MULTIPLE_CONFIRMATIONS && 
        confirmations < TRADING_CONFIG.QUALITY_FILTERS.MIN_CONFIRMATIONS) {
      reasons.push(`Apenas ${confirmations} de ${TRADING_CONFIG.QUALITY_FILTERS.MIN_CONFIRMATIONS} confirmações necessárias`);
    }

    // Verificação de padrões
    if (patterns) {
      const validPatterns = Object.entries(patterns)
        .filter(([_, p]) => p && p.confidence >= TRADING_CONFIG.QUALITY_FILTERS.MIN_PATTERN_CONFIDENCE);
      
      if (validPatterns.length === 0) {
        reasons.push(`Nenhum padrão válido encontrado (mínimo ${TRADING_CONFIG.QUALITY_FILTERS.MIN_PATTERN_CONFIDENCE}% de confiança)`);
      }
    }

    // Verificação de força do MACD
    if (indicators.macd && Math.abs(indicators.macd.histogram) < TRADING_CONFIG.QUALITY_FILTERS.MIN_MACD_STRENGTH) {
      reasons.push(`Força do MACD (${indicators.macd.histogram.toFixed(6)}) abaixo do mínimo (${TRADING_CONFIG.QUALITY_FILTERS.MIN_MACD_STRENGTH})`);
    }

    // Se houver razões de rejeição, monta a mensagem
    if (reasons.length > 0) {
      result.passed = false;
      result.reason = `Filtros de qualidade não atendidos:\n  • ${reasons.join('\n  • ')}`;
      
      // Log detalhado
      console.log('\n❌ Sinal rejeitado - Motivos:');
      console.log(`  • ${reasons.join('\n  • ')}`);
      console.log('\n📊 DETALHES DO SINAL:');
      console.log(`  • Preço atual: ${data.close[data.close.length - 1]}`);
      console.log(`  • Volume: ${indicators.volume?.currentVolume || 'N/A'}`);
      console.log(`  • Volume Média: ${indicators.volume?.averageVolume || 'N/A'}`);
      console.log(`  • Volume Ratio: ${indicators.volume?.volumeRatio?.toFixed(2) || 'N/A'}`);
      console.log(`  • RSI: ${indicators.rsi?.toFixed(2) || 'N/A'}`);
      console.log(`  • MACD: ${indicators.macd ? JSON.stringify({
        histogram: indicators.macd.histogram?.toFixed(6),
        signal: indicators.macd.signal?.toFixed(6),
        macd: indicators.macd.macd?.toFixed(6)
      }) : 'N/A'}`);
    } else {
      console.log('✅ Sinal aprovado em todos os filtros de qualidade');
    }

    return result;
  }

  /**
   * Detecta a tendência do mercado com base nos indicadores e padrões
   * @param {Object} indicators - Objeto contendo os indicadores técnicos
   * @param {Object} patterns - Objeto contendo os padrões detectados
   * @returns {string} - 'BULLISH', 'BEARISH' ou 'NEUTRAL'
   */
  detectSignalTrend(indicators, patterns = {}) {
    if (!indicators) return 'neutral';
    
    let bullishScore = 0;
    let bearishScore = 0;
    let totalFactors = 0;
    
    console.log('🔍 Detectando tendência do sinal...');
    
    // Análise RSI - BALANCEADO para compra E venda
    if (indicators.rsi !== undefined) {
      totalFactors++;
      if (indicators.rsi <= 25) {
        bullishScore += 2; // Sobrevenda extrema - COMPRA
        console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BULLISH EXTREMO (sobrevenda)`);
      } else if (indicators.rsi <= 35) {
        bullishScore++; // Sobrevenda - COMPRA
        console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BULLISH (sobrevenda)`);
      } else if (indicators.rsi >= 75) {
        bearishScore += 2; // Sobrecompra extrema - VENDA
        console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BEARISH EXTREMO (sobrecompra)`);
      } else if (indicators.rsi >= 65) {
        bearishScore++; // Sobrecompra - VENDA
        console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BEARISH (sobrecompra)`);
      } else {
        console.log(`  RSI: ${indicators.rsi.toFixed(2)} → NEUTRAL`);
      }
    }
    
    // Análise MACD - BALANCEADO para compra E venda
    if (indicators.macd && indicators.macd.histogram !== undefined) {
      totalFactors++;
      const histogramStrength = Math.abs(indicators.macd.histogram) * 1000000;
      
      if (indicators.macd.histogram > 0.000001) {
        if (histogramStrength > 5) {
          bullishScore += 2; // MACD muito forte - COMPRA
        } else {
          bullishScore++; // MACD moderado - COMPRA
        }
        console.log(`  MACD: ${indicators.macd.histogram.toFixed(8)} → BULLISH (força: ${histogramStrength.toFixed(2)})`);
      } else if (indicators.macd.histogram < -0.000001) {
        if (histogramStrength > 5) {
          bearishScore += 2; // MACD muito forte - VENDA
        } else {
          bearishScore++; // MACD moderado - VENDA
        }
        console.log(`  MACD: ${indicators.macd.histogram.toFixed(8)} → BEARISH (força: ${histogramStrength.toFixed(2)})`);
      } else {
        console.log(`  MACD: ${indicators.macd.histogram.toFixed(8)} → NEUTRAL (muito fraco)`);
      }
    }
    
    // Análise Médias Móveis - BALANCEADO para compra E venda
    if (indicators.ma21 !== undefined && indicators.ma200 !== undefined) {
      totalFactors++;
      const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
      
      if (maDiff >= 2) {
        bullishScore += 2; // Forte tendência de alta - COMPRA
        console.log(`  MA: ${maDiff.toFixed(2)}% → BULLISH FORTE`);
      } else if (maDiff >= 0.5) {
        bullishScore++; // Tendência de alta moderada - COMPRA
        console.log(`  MA: ${maDiff.toFixed(2)}% → BULLISH`);
      } else if (maDiff <= -2) {
        bearishScore += 2; // Forte tendência de baixa - VENDA
        console.log(`  MA: ${maDiff.toFixed(2)}% → BEARISH FORTE`);
      } else if (maDiff <= -0.5) {
        bearishScore++; // Tendência de baixa moderada - VENDA
        console.log(`  MA: ${maDiff.toFixed(2)}% → BEARISH`);
      } else {
        console.log(`  MA: ${maDiff.toFixed(2)}% → NEUTRAL`);
      }
    }
    
    // Análise de padrões - BALANCEADO para compra E venda
    if (patterns.breakout) {
      totalFactors++;
      if (patterns.breakout.type === 'BULLISH_BREAKOUT') {
        bullishScore += 2; // Rompimento de alta - COMPRA
        console.log(`  Breakout: BULLISH_BREAKOUT`);
      } else if (patterns.breakout.type === 'BEARISH_BREAKOUT') {
        bearishScore += 2; // Rompimento de baixa - VENDA
        console.log(`  Breakout: BEARISH_BREAKOUT`);
      }
    }
    
    if (patterns.candlestick && Array.isArray(patterns.candlestick)) {
      patterns.candlestick.forEach(pattern => {
        totalFactors++;
        if (pattern.bias === 'BULLISH') {
          bullishScore++; // Padrão de alta - COMPRA
          console.log(`  Candlestick: ${pattern.type} (BULLISH)`);
        } else if (pattern.bias === 'BEARISH') {
          bearishScore++; // Padrão de baixa - VENDA
          console.log(`  Candlestick: ${pattern.type} (BEARISH)`);
        }
      });
    }
    
    // Volume como confirmação - BALANCEADO
    if (indicators.volume && indicators.volume.volumeRatio > 1.5) {
      // Volume alto confirma a direção predominante
      if (bullishScore > bearishScore) {
        bullishScore++;
        console.log(`  Volume: Alto volume confirmando tendência BULLISH`);
      } else if (bearishScore > bullishScore) {
        bearishScore++;
        console.log(`  Volume: Alto volume confirmando tendência BEARISH`);
      }
    }
    
    // Evita divisão por zero
    if (totalFactors === 0) {
      console.log('  ⚠️ Nenhum fator de tendência detectado');
      return 'NEUTRAL';
    }
    
    const bullishRatio = bullishScore / totalFactors;
    const bearishRatio = bearishScore / totalFactors;
    
    console.log(`🎯 Pontuação de tendência: BULLISH=${bullishScore}/${totalFactors} (${(bullishRatio*100).toFixed(1)}%), BEARISH=${bearishScore}/${totalFactors} (${(bearishRatio*100).toFixed(1)}%)`);
    
    // Threshold balanceado para detectar COMPRA E VENDA
    if (bullishRatio >= 0.55) {
      console.log('✅ Tendência BULLISH detectada');
      return 'BULLISH';
    }
    if (bearishRatio >= 0.55) {
      console.log('✅ Tendência BEARISH detectada');
      return 'BEARISH';
    }
    
    // Se há diferença pequena, considera o mais forte
    if (bullishScore > bearishScore && bullishRatio >= 0.4) {
      console.log('⚖️ Leve tendência BULLISH');
      return 'BULLISH';
    } else if (bearishScore > bullishScore && bearishRatio >= 0.4) {
      console.log('⚖️ Leve tendência BEARISH');
      return 'BEARISH';
    }
    
    console.log('⚖️ Tendência NEUTRAL');
    return 'NEUTRAL';
  }

  // Restante do código...
}

export default SignalScoringService;