/**
 * Serviço de pontuação de sinais
 */

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
      const finalScore = Math.min(100, Math.max(0, Math.round(score * 10) / 10)); // Arredonda para 1 casa decimal
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
   * @returns {string} - 'bullish', 'bearish' ou 'neutral'
   */
  detectSignalTrend(indicators, patterns = {}) {
    if (!indicators) return 'neutral';
    
    let bullishScore = 0;
    let bearishScore = 0;
    let totalFactors = 0;
    
    // Análise de tendência com base no RSI
    if (indicators.rsi !== undefined) {
      totalFactors++;
      if (indicators.rsi < 25) {
        bullishScore++; // Sobrevenda = oportunidade de compra
      } else if (indicators.rsi > 85) {
        bearishScore++; // Sobrecompra = oportunidade de venda
      }
    }
    
    // Análise de tendência com base no MACD
    if (indicators.macd && indicators.macd.histogram !== undefined) {
      totalFactors++;
      if (indicators.macd.histogram > 0) {
        bullishScore++; // Histograma positivo = momentum de alta
      } else if (indicators.macd.histogram < 0) {
        bearishScore++; // Histograma negativo = momentum de baixa
      }
    }
    
    // Análise de tendência com base nas Médias Móveis
    if (indicators.ma21 !== undefined && indicators.ma200 !== undefined) {
      totalFactors++;
      if (indicators.ma21 > indicators.ma200) {
        bullishScore++; // MA curta > MA longa = tendência de alta
      } else if (indicators.ma21 < indicators.ma200) {
        bearishScore++; // MA curta < MA longa = tendência de baixa
      }
    }
    
    // Análise de padrões
    const bullishPatterns = ['bullish_engulfing', 'morning_star', 'hammer', 'piercing_line'];
    const bearishPatterns = ['bearish_engulfing', 'evening_star', 'shooting_star', 'hanging_man'];
    
    Object.entries(patterns).forEach(([pattern, data]) => {
      if (data && data.confidence > 60) {
        totalFactors++;
        if (bullishPatterns.includes(pattern)) bullishScore++;
        if (bearishPatterns.includes(pattern)) bearishScore++;
      }
    });
    
    // Evita divisão por zero
    if (totalFactors === 0) return 'neutral';
    
    const bullishRatio = bullishScore / totalFactors;
    const bearishRatio = bearishScore / totalFactors;
    
    // Threshold de 50% para maior sensibilidade
    if (bullishRatio >= 0.5) return 'BULLISH';
    if (bearishRatio >= 0.5) return 'BEARISH';
    
    return 'NEUTRAL';
  }

  // Restante do código...
}

export default SignalScoringService;