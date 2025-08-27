/**
 * Serviço de pontuação de sinais
 */

import { SCORING_WEIGHTS, TRADING_CONFIG } from '../config/constants.js';

class SignalScoringService {
  /**
   * Calcula pontuação total do sinal
   */
  calculateSignalScore(data, indicators, patterns, mlProbability, marketTrend = null, bitcoinCorrelation = null) {
    console.log('\n🔍 INÍCIO DA ANÁLISE DE SINAL =========================');
    console.log(`📊 ${new Date().toISOString()} - Analisando sinal para ${data.symbol || 'desconhecido'}`);
    
    // Log do regime de mercado
    console.log(`\n🌐 REGIME DE MERCADO: ${marketTrend || 'Não especificado'}`);
    if (bitcoinCorrelation) {
      console.log(`   Correlação com BTC: ${(bitcoinCorrelation * 100).toFixed(1)}%`);
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

      console.log('\n📈 ANALISANDO INDICADORES TÉCNICOS');
      const indicatorScore = this.scoreIndicators(indicators);
      score += addScoreComponent('Indicadores Técnicos', indicatorScore.total, 1, 
        `RSI: ${indicators.RSI?.toFixed(2) || 'N/A'}, ` +
        `MACD: ${indicators.MACD?.histogram?.toFixed(6) || 'N/A'}`);
      
      details.indicators = indicatorScore.details;
      confirmations += indicatorScore.confirmations || 0;
      strengthFactors.push(...(indicatorScore.strengthFactors || []));
      console.log(`  Confirmações: ${indicatorScore.confirmations || 0}`);
      
      // Análise detalhada dos indicadores
      if (indicators.RSI !== undefined) {
        let rsiAnalysis = '';
        if (indicators.RSI < 30) rsiAnalysis = 'SOBREVENDA';
        else if (indicators.RSI > 70) rsiAnalysis = 'SOBRECOMPRA';
        if (rsiAnalysis) console.log(`  ${rsiAnalysis}: RSI em ${indicators.RSI.toFixed(2)}`);
      }
      
      if (indicators.MACD?.histogram !== undefined) {
        if (Math.abs(indicators.MACD.histogram) > 0.001) {
          console.log(`  Sinal MACD: ${indicators.MACD.histogram > 0 ? 'COMPRA' : 'VENDA'} ` + 
                     `(Força: ${Math.abs(indicators.MACD.histogram).toFixed(6)})`);
        }
      }

      console.log('\n🔍 ANALISANDO PADRÕES GRÁFICOS');
      const patternScore = this.scorePatterns(patterns || {});
      score += addScoreComponent('Padrões Gráficos', patternScore.total, 1, 
        `Reversão: ${patterns?.reversalPatterns?.length || 0}, ` +
        `Continuação: ${patterns?.continuationPatterns?.length || 0}`);
      
      details.patterns = patternScore.details;
      confirmations += patternScore.confirmations || 0;
      strengthFactors.push(...(patternScore.strengthFactors || []));
      console.log(`  Confirmações: ${patternScore.confirmations || 0}`);

      console.log('\n📊 ANALISANDO VOLUME');
      const volumeScore = this.scoreVolume(data, indicators);
      const volumeRatio = indicators.volumeMA ? (data.volume / indicators.volumeMA).toFixed(2) : 0;
      score += addScoreComponent('Volume', volumeScore, 1, 
        `Atual: ${data.volume?.toFixed(2) || 'N/A'}, ` +
        `Média: ${indicators.volumeMA?.toFixed(2) || 'N/A'} (${volumeRatio}x)`);
      
      details.volume = volumeScore;
      if (volumeScore > 0) confirmations++;
      if (volumeScore > 15) strengthFactors.push('VOLUME_HIGH');
      if (volumeScore > 25) strengthFactors.push('VOLUME_EXTREME');

      console.log('\n✅ VERIFICANDO FILTROS DE QUALIDADE');
      const qualityCheck = this.applyQualityFilters(data, indicators, patterns, confirmations);
      if (!qualityCheck.passed) {
        console.log(`❌ Sinal rejeitado: ${qualityCheck.reason}`);
        return { 
          totalScore: 0, 
          details: { ...details, qualityCheck }, 
          isValid: false, 
          isMLDriven: false,
          reason: qualityCheck.reason,
          scoreComponents
        };
      }
      
      console.log('\n🏁 RESULTADO FINAL');
      console.log(`  Score bruto: ${score.toFixed(2)}`);
      console.log(`  Confirmações totais: ${confirmations}`);
      
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
      
      // Log detalhado dos componentes do score
      console.log('\n📊 DETALHAMENTO DO SCORE:');
      console.log('  ' + '='.repeat(60));
      console.log('  COMPONENTE'.padEnd(30) + 'VALOR'.padStart(10) + 'PESO'.padStart(10) + 'TOTAL'.padStart(10) + '  DETALHES');
      console.log('  ' + '-'.repeat(60));
      
      scoreComponents.forEach(comp => {
        const name = comp.name.padEnd(28);
        const value = comp.value.toFixed(2).padStart(8);
        const weight = comp.weight.toFixed(2).padStart(8);
        const total = (comp.value * comp.weight).toFixed(2).padStart(8);
        const details = comp.description ? `  ${comp.description}` : '';
        console.log(`  ${name}${value} × ${weight} = ${total}${details}`);
      });
      
      console.log('  ' + '='.repeat(60));
      console.log(`  SCORE FINAL: ${finalScore.toFixed(1).padStart(46)} / ${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY}`);
      
      // Log resumido
      const logPrefix = isValid ? '✅ SINAL VÁLIDO' : '❌ SINAL INVÁLIDO';
      console.log(`\n${logPrefix} - ${data.symbol} - Score: ${finalScore.toFixed(1)}/100`);
      
      // Log detalhado dos motivos de não envio
      if (!isValid) {
        const missingPoints = (TRADING_CONFIG.MIN_SIGNAL_PROBABILITY - finalScore).toFixed(1);
        console.log('\n📉 RAZÕES PARA NÃO ENVIO:');
        console.log(`  • Pontuação insuficiente: ${finalScore.toFixed(1)} < ${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY} (faltam ${missingPoints} pontos)`);
        
        // Análise detalhada dos componentes do score
        console.log('\n📊 ANÁLISE DETALHADA DOS COMPONENTES:');
        
        // Ordena os componentes pelo peso ponderado (maior primeiro)
        const sortedComponents = [...scoreComponents].sort((a, b) => 
          (b.value * b.weight) - (a.value * a.weight));
        
        sortedComponents.forEach(comp => {
          const percentage = (comp.weightedValue / TRADING_CONFIG.MIN_SIGNAL_PROBABILITY * 100).toFixed(1);
          const contribution = comp.weightedValue >= 0 ? 'contribuiu com' : 'reduziu em';
          console.log(`\n  • ${comp.name}:`);
          console.log(`    - ${contribution} ${Math.abs(comp.weightedValue).toFixed(1)} pontos (${percentage}% do necessário)`);
          
          // Análise específica baseada no tipo de componente
          if (comp.name === 'Indicadores Técnicos') {
            if (indicators.RSI !== undefined) {
              if (indicators.RSI < 30) console.log(`    - RSI em sobrevenda (${indicators.RSI.toFixed(2)}) - possível oportunidade`);
              else if (indicators.RSI > 70) console.log(`    - RSI em sobrecompra (${indicators.RSI.toFixed(2)}) - cuidado`);
              else console.log(`    - RSI neutro (${indicators.RSI.toFixed(2)}) - aguardando confirmação`);
            }
            
            if (indicators.MACD?.histogram !== undefined) {
              const macdStrength = Math.abs(indicators.MACD.histogram);
              if (macdStrength > 0.001) {
                console.log(`    - Sinal MACD ${indicators.MACD.histogram > 0 ? 'compra' : 'venda'} ` + 
                           `(força: ${macdStrength.toFixed(6)})`);
              } else {
                console.log('    - Sinal MACD fraco ou indefinido');
              }
            }
            
            if (indicators.MA200 && indicators.MA50) {
              const maRelation = indicators.MA50 >= indicators.MA200 ? 'acima' : 'abaixo';
              console.log(`    - Média Móvel 50 períodos está ${maRelation} da M200`);
            }
          }
          
          if (comp.name === 'Volume') {
            const volumeRatio = indicators.volumeMA ? (data.volume / indicators.volumeMA).toFixed(2) : 0;
            if (volumeRatio < 1) {
              console.log(`    - Volume abaixo da média (${volumeRatio}x) - aguardar confirmação`);
            } else if (volumeRatio < 1.5) {
              console.log(`    - Volume na média (${volumeRatio}x)`);
            } else {
              console.log(`    - Volume acima da média (${volumeRatio}x) - bom sinal`);
            }
          }
        });
        
        // Verificação de confirmações
        if (confirmations < TRADING_CONFIG.QUALITY_FILTERS.MIN_CONFIRMATIONS) {
          console.log(`\n⚠️  POUCAS CONFIRMAÇÕES: ${confirmations}/${TRADING_CONFIG.QUALITY_FILTERS.MIN_CONFIRMATIONS}`);
          console.log('   Confirmações atuais:');
          if (indicatorScore.confirmations > 0) console.log(`   - ${indicatorScore.confirmations} indicadores técnicos`);
          if (patternScore.confirmations > 0) console.log(`   - ${patternScore.confirmations} padrões gráficos`);
          if (volumeScore > 15) console.log('   - Volume acima da média');
          if (mlProbability > 0.6) console.log('   - Confirmação do modelo de ML');
        }
        
        // Sugestões de melhoria baseadas no score
        console.log('\n💡 SUGESTÕES DE MELHORIA:');
        if (finalScore < 30) {
          console.log('  • Aguardar melhores condições de mercado');
          if (indicators.RSI < 30) console.log('  • Monitorar para possíveis reversões (RSI em sobrevenda)');
          if (indicators.RSI > 70) console.log('  • Cautela com sobrecompra (RSI elevado)');
          console.log('  • Procurar por divergências de RSI');
          console.log('  • Aguardar confirmação de volume acima da média');
        } else if (finalScore < 45) {
          console.log('  • Aguardar confirmação adicional de indicadores');
          console.log('  • Verificar se há padrões gráficos em formação');
          console.log('  • Monitorar volume para confirmação');
          console.log('  • Considerar timeframes maiores para confirmação');
        } else {
          // Score entre 45-50, próximo do limite
          console.log('  • Sinal próximo do limite de aceitação');
          console.log('  • Aguardar confirmação adicional ou melhora nos indicadores');
          console.log('  • Reduzir tamanho da posição para gerenciar risco');
        }
      }
      
      // Adiciona aos melhores sinais se for válido
      if (isValid) {
        const signalInfo = {
          symbol: data.symbol,
          score: finalScore,
          timestamp: new Date(),
          components: scoreComponents,
          indicators: {
            RSI: indicators.RSI,
            MACD: indicators.MACD?.histogram,
            volumeRatio: indicators.volumeMA ? (data.volume / indicators.volumeMA).toFixed(2) : null,
            trend: marketTrend
          }
        };
        
        global.bestSignals.push(signalInfo);
        global.bestSignals.sort((a, b) => b.score - a.score);
        global.bestSignals = global.bestSignals.slice(0, 10); // Mantém apenas os 10 melhores
        
        console.log('\n🏆 SINAL ADICIONADO AOS MELHORES DO DIA');
        console.log(`   Posição: ${global.bestSignals.findIndex(s => s.symbol === data.symbol) + 1} de ${global.bestSignals.length}`);
      }
      
      return {
        totalScore: finalScore,
        details: { ...details, scoreComponents },
        isValid,
        isMLDriven,
        confirmations,
        strengthFactors,
        scoreComponents,
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
    
    let bullishFactors = 0;
    let bearishFactors = 0;
    
    // Análise de tendência com base no RSI
    if (indicators.rsi) {
      if (indicators.rsi > 70) bearishFactors++;
      if (indicators.rsi < 30) bullishFactors++;
    }
    
    // Análise de tendência com base no MACD
    if (indicators.macd) {
      if (indicators.macd.histogram > 0) bullishFactors++;
      if (indicators.macd.histogram < 0) bearishFactors++;
    }
    
    // Análise de tendência com base nas Médias Móveis
    if (indicators.maShort && indicators.maLong) {
      if (indicators.maShort > indicators.maLong) bullishFactors++;
      if (indicators.maShort < indicators.maLong) bearishFactors++;
    }
    
    // Análise de padrões
    const bullishPatterns = ['bullish_engulfing', 'morning_star', 'hammer', 'piercing_line'];
    const bearishPatterns = ['bearish_engulfing', 'evening_star', 'shooting_star', 'hanging_man'];
    
    Object.entries(patterns).forEach(([pattern, data]) => {
      if (data && data.confidence > 60) {
        if (bullishPatterns.includes(pattern)) bullishFactors++;
        if (bearishPatterns.includes(pattern)) bearishFactors++;
      }
    });
    
    // Determina a tendência com base nos fatores
    const difference = bullishFactors - bearishFactors;
    
    if (difference >= 2) return 'bullish';
    if (difference <= -2) return 'bearish';
    return 'neutral';
  }

  // Restante do código...
}

export default SignalScoringService;