/**
 * Serviço de pontuação de sinais
 */

import { SCORING_WEIGHTS, TRADING_CONFIG } from '../config/constants.js';

class SignalScoringService {
  /**
   * Calcula pontuação total do sinal
   */
  calculateSignalScore(data, indicators, patterns, mlProbability, marketTrend = null, bitcoinCorrelation = null) {
    let score = 0;
    const details = {};
    let isMLDriven = false;
    let confirmations = 0; // Contador de confirmações
    let strengthFactors = []; // Array para rastrear força dos fatores

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
      confirmations += indicatorScore.confirmations || 0;
      strengthFactors.push(...(indicatorScore.strengthFactors || []));
      console.log('📊 Score indicadores:', indicatorScore.total);

      // Pontuação dos padrões gráficos
      const patternScore = this.scorePatterns(patterns || {});
      score += patternScore.total;
      details.patterns = patternScore.details;
      confirmations += patternScore.confirmations || 0;
      strengthFactors.push(...(patternScore.strengthFactors || []));
      console.log('📈 Score padrões:', patternScore.total);

      // Confirmação de volume
      const volumeScore = this.scoreVolume(data, indicators);
      score += volumeScore;
      details.volume = volumeScore;
      if (volumeScore > 0) confirmations++;
      if (volumeScore > 15) strengthFactors.push('VOLUME_HIGH');
      if (volumeScore > 25) strengthFactors.push('VOLUME_EXTREME');
      console.log('🔊 Score volume:', volumeScore);

      // Aplicar filtros de qualidade
      const qualityCheck = this.applyQualityFilters(data, indicators, patterns, confirmations);
      if (!qualityCheck.passed) {
        console.log(`❌ Falhou nos filtros de qualidade: ${qualityCheck.reason}`);
        return { totalScore: 0, details: { qualityCheck }, isValid: false, isMLDriven: false };
      }
      
      // Bônus por múltiplas confirmações
      if (confirmations >= TRADING_CONFIG.QUALITY_FILTERS.MIN_CONFIRMATIONS) {
        const confirmationBonus = (confirmations - 2) * 5; // +5% por confirmação extra
        score += confirmationBonus;
        details.confirmationBonus = confirmationBonus;
        console.log(`✅ Bônus por ${confirmations} confirmações: +${confirmationBonus}`);
      }

      // Pontuação do Machine Learning
      const mlScore = (mlProbability || 0.5) * SCORING_WEIGHTS.ML_WEIGHT * 100;
      score += mlScore;
      details.machineLearning = mlScore;
      if (mlProbability > 0.6) confirmations++;
      console.log('🤖 Score ML:', mlScore);
      
      // Verifica se o sinal é principalmente baseado em ML
      // Se ML contribui com mais de 40% da pontuação total, considera ML-driven
      if (mlScore > score * 0.4 && mlProbability > 0.7) {
        isMLDriven = true;
      }

      // Correlação com Bitcoin
      if (bitcoinCorrelation && bitcoinCorrelation.alignment !== 'NEUTRAL') {
        const btcScore = bitcoinCorrelation.bonus || bitcoinCorrelation.penalty || 0;
        score += btcScore;
        details.bitcoinCorrelation = {
          btcTrend: bitcoinCorrelation.btcTrend,
          btcStrength: bitcoinCorrelation.btcStrength,
          alignment: bitcoinCorrelation.alignment,
          score: btcScore,
          priceCorrelation: bitcoinCorrelation.priceCorrelation,
          recommendation: bitcoinCorrelation.recommendation
        };
        console.log(`₿ Score Bitcoin: ${btcScore} (${bitcoinCorrelation.alignment})`);
      }
      // Aplica lógica de priorização de tendência
      const trendAdjustment = this.applyTrendPriority(score, indicators, patterns, marketTrend, bitcoinCorrelation);
      score = trendAdjustment.adjustedScore;
      details.trendAdjustment = trendAdjustment.details;
      console.log('📈 Score após ajuste de tendência:', score);

      // Limita pontuação máxima
      score = Math.min(Math.max(score, 0), 100);
      console.log('🎯 Score final:', score);

      // Aplica variação realística baseada na força dos fatores
      const realisticScore = this.applyRealisticVariation(score, strengthFactors, confirmations, indicators, patterns);
      console.log('🎲 Score realístico:', realisticScore);

      return {
        totalScore: realisticScore,
        details,
        confirmations,
        isValid: realisticScore >= TRADING_CONFIG.MIN_SIGNAL_PROBABILITY,
        isMLDriven,
        mlContribution: mlScore,
        strengthFactors: strengthFactors
      };
    } catch (error) {
      console.error('Erro ao calcular pontuação:', error.message);
      console.error('Stack trace:', error.stack);
      return { totalScore: 0, details: {}, isValid: false, isMLDriven: false };
    }
  }

  /**
   * Aplica variação realística baseada na força dos fatores
   */
  applyRealisticVariation(baseScore, strengthFactors, confirmations, indicators, patterns) {
    let adjustedScore = baseScore;
    
    // Calcula força geral dos fatores
    const strengthLevel = this.calculateStrengthLevel(strengthFactors, confirmations, indicators, patterns);
    
    console.log(`🔍 Análise de força:`);
    console.log(`   📊 Score base: ${baseScore.toFixed(1)}`);
    console.log(`   💪 Nível de força: ${strengthLevel.level} (${strengthLevel.score}/100)`);
    console.log(`   🎯 Fatores: ${strengthFactors.join(', ')}`);
    console.log(`   ✅ Confirmações: ${confirmations}`);
    
    // Aplica ajuste baseado na força, com intervalos mais realistas
    if (strengthLevel.level === 'EXTREME') {
      // Sinais extremamente fortes: 80-90% (antes: 85-95%)
      adjustedScore = 80 + (strengthLevel.score / 100) * 10;
      console.log(`🚀 SINAL EXTREMO: ${adjustedScore.toFixed(1)}%`);
    } else if (strengthLevel.level === 'VERY_STRONG') {
      // Sinais muito fortes: 70-80% (antes: 78-87%)
      adjustedScore = 70 + (strengthLevel.score / 100) * 10;
      console.log(`💪 SINAL MUITO FORTE: ${adjustedScore.toFixed(1)}%`);
    } else if (strengthLevel.level === 'STRONG') {
      // Sinais fortes: 60-70% (antes: 72-80%)
      adjustedScore = 60 + (strengthLevel.score / 100) * 10;
      console.log(`🔥 SINAL FORTE: ${adjustedScore.toFixed(1)}%`);
    } else if (strengthLevel.level === 'MODERATE') {
      // Sinais moderados: 50-60% (antes: 70-75%)
      adjustedScore = 50 + (strengthLevel.score / 100) * 10;
      console.log(`⚖️ SINAL MODERADO: ${adjustedScore.toFixed(1)}%`);
    } else {
      // Sinais fracos: abaixo do threshold
      adjustedScore = Math.min(baseScore, 49);
      console.log(`⚠️ SINAL FRACO: ${adjustedScore.toFixed(1)}% (abaixo do threshold)`);
    }
    
    // Adiciona variação aleatória mais realista
    const randomVariation = (Math.random() - 0.5) * 3; // ±1.5% (antes: ±1%)
    adjustedScore += randomVariation;
    
    // Limites ajustados para evitar valores extremos
    adjustedScore = Math.max(30, Math.min(90, adjustedScore)); // Antes: 65-95%
    
    console.log(`🎲 Score final com variação: ${adjustedScore.toFixed(1)}%`);
    
    return Math.round(adjustedScore * 10) / 10; // Arredonda para 1 casa decimal
  }

  /**
   * Calcula nível de força dos fatores
   */
  calculateStrengthLevel(strengthFactors, confirmations, indicators, patterns) {
    let strengthScore = 0;
    let level = 'WEAK';
    
    // Pontuação por fatores de força
    const factorScores = {
      'RSI_EXTREME': 25,        // RSI < 15 ou > 85
      'RSI_VERY_OVERSOLD': 20,  // RSI < 20
      'RSI_VERY_OVERBOUGHT': 20, // RSI > 80
      'MACD_STRONG': 20,        // MACD com diferença > 0.005
      'MACD_VERY_STRONG': 25,   // MACD com diferença > 0.01
      'MA_STRONG_BULLISH': 20,  // MA21 > MA200 com diferença > 3%
      'MA_VERY_STRONG': 25,     // MA21 > MA200 com diferença > 5%
      'VOLUME_HIGH': 15,        // Volume 1.5x acima da média
      'VOLUME_EXTREME': 25,     // Volume 3x acima da média
      'PATTERN_STRONG': 20,     // Padrões de alta confiança
      'PATTERN_EXTREME': 30,    // Padrões raros (cabeça e ombros, etc)
      'DIVERGENCE': 25,         // Divergência RSI
      'BREAKOUT_STRONG': 25,    // Rompimento com volume alto
      'ICHIMOKU_STRONG': 15,    // Ichimoku alinhado
      'BOLLINGER_EXTREME': 20,  // Rompimento Bollinger
      'ML_HIGH_CONFIDENCE': 20, // ML > 0.8
      'FIBONACCI_LEVEL': 15,    // Preço em nível Fibonacci
      'MULTIPLE_PATTERNS': 20   // Múltiplos padrões convergindo
    };
    
    // Soma pontuação dos fatores
    strengthFactors.forEach(factor => {
      strengthScore += factorScores[factor] || 5;
    });
    
    // Bônus por confirmações múltiplas
    if (confirmations >= 5) strengthScore += 25;
    else if (confirmations >= 4) strengthScore += 15;
    else if (confirmations >= 3) strengthScore += 10;
    
    // Análise específica de indicadores
    if (indicators.rsi !== null && indicators.rsi !== undefined) {
      if (indicators.rsi < 10 || indicators.rsi > 90) {
        strengthScore += 30; // RSI historicamente extremo
      } else if (indicators.rsi < 15 || indicators.rsi > 85) {
        strengthScore += 20; // RSI muito extremo
      }
    }
    
    // Análise de MACD
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      const macdDiff = Math.abs(indicators.macd.MACD - indicators.macd.signal);
      if (macdDiff > 0.01) strengthScore += 25;
      else if (macdDiff > 0.005) strengthScore += 15;
    }
    
    // Determina nível baseado na pontuação
    if (strengthScore >= 100) {
      level = 'EXTREME';
    } else if (strengthScore >= 80) {
      level = 'VERY_STRONG';
    } else if (strengthScore >= 60) {
      level = 'STRONG';
    } else if (strengthScore >= 40) {
      level = 'MODERATE';
    } else {
      level = 'WEAK';
    }
    
    return {
      score: Math.min(strengthScore, 100),
      level: level,
      factors: strengthFactors.length,
      confirmations: confirmations
    };
  }

  /**
   * Aplica filtros de qualidade rigorosos
   */
  applyQualityFilters(data, indicators, patterns, confirmations) {
    const filters = TRADING_CONFIG.QUALITY_FILTERS;
    
    // Filtro 1: Volume mínimo
    if (data.volume && indicators.volumeMA) {
      const currentVolume = data.volume[data.volume.length - 1];
      const volumeRatio = currentVolume / indicators.volumeMA;
      if (volumeRatio < filters.MIN_VOLUME_RATIO) {
        return { passed: false, reason: `Volume insuficiente: ${volumeRatio.toFixed(2)}x (min: ${filters.MIN_VOLUME_RATIO}x)` };
      }
    }
    
    // Filtro 2: RSI deve ser mais extremo
    if (indicators.rsi !== null && indicators.rsi !== undefined) {
      if (indicators.rsi > filters.MIN_RSI_EXTREME && indicators.rsi < filters.MAX_RSI_EXTREME) {
        return { passed: false, reason: `RSI não extremo: ${indicators.rsi.toFixed(1)} (deve ser <${filters.MIN_RSI_EXTREME} ou >${filters.MAX_RSI_EXTREME})` };
      }
    }
    
    // Filtro 3: MACD deve ter força mínima
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      const macdStrength = Math.abs(indicators.macd.MACD - indicators.macd.signal);
      if (macdStrength < filters.MIN_MACD_STRENGTH) {
        return { passed: false, reason: `MACD fraco: ${macdStrength.toFixed(4)} (min: ${filters.MIN_MACD_STRENGTH})` };
      }
    }
    
    // Filtro 4: Múltiplas confirmações obrigatórias
    if (filters.REQUIRE_MULTIPLE_CONFIRMATIONS && confirmations < filters.MIN_CONFIRMATIONS) {
      return { passed: false, reason: `Poucas confirmações: ${confirmations} (min: ${filters.MIN_CONFIRMATIONS})` };
    }
    
    return { passed: true, reason: 'Todos os filtros de qualidade aprovados' };
  }

  /**
   * Pontua indicadores técnicos
   */
  scoreIndicators(indicators) {
    let total = 0;
    const details = {};
    let confirmations = 0;
    let strengthFactors = [];

    console.log('🔍 Analisando indicadores:', {
      rsi: indicators.rsi,
      macd: indicators.macd,
      ichimoku: indicators.ichimoku,
      ma21: indicators.ma21,
      ma200: indicators.ma200
    });
    

    // RSI
    if (indicators.rsi !== null && indicators.rsi !== undefined) {
      if (indicators.rsi < 25) { // Mais rigoroso
        total += SCORING_WEIGHTS.RSI_OVERSOLD;
        details.rsi = { value: indicators.rsi, score: SCORING_WEIGHTS.RSI_OVERSOLD, reason: 'Sobrevendido' };
        confirmations++;
        if (indicators.rsi < 15) strengthFactors.push('RSI_EXTREME');
        else if (indicators.rsi < 20) strengthFactors.push('RSI_VERY_OVERSOLD');
        console.log('✅ RSI sobrevendido:', SCORING_WEIGHTS.RSI_OVERSOLD);
      } else if (indicators.rsi > 75) { // Mais rigoroso
        total -= Math.abs(SCORING_WEIGHTS.RSI_OVERBOUGHT);
        details.rsi = { value: indicators.rsi, score: -Math.abs(SCORING_WEIGHTS.RSI_OVERBOUGHT), reason: 'Sobrecomprado' };
        confirmations++;
        if (indicators.rsi > 85) strengthFactors.push('RSI_EXTREME');
        else if (indicators.rsi > 80) strengthFactors.push('RSI_VERY_OVERBOUGHT');
        console.log('❌ RSI sobrecomprado:', -Math.abs(SCORING_WEIGHTS.RSI_OVERBOUGHT));
      } else if (indicators.rsi < 30) {
        // RSI extremo mas não tanto
        total += 15;
        details.rsi = { value: indicators.rsi, score: 15, reason: 'RSI extremo' };
        confirmations++;
        strengthFactors.push('RSI_VERY_OVERSOLD');
        console.log('🟡 RSI extremo:', 15);
      } else if (indicators.rsi > 70) {
        // RSI extremo mas não tanto
        total -= 10;
        details.rsi = { value: indicators.rsi, score: -10, reason: 'RSI muito alto' };
        confirmations++;
        strengthFactors.push('RSI_VERY_OVERBOUGHT');
        console.log('🟡 RSI muito alto:', -10);
      } else {
        console.log('🟡 RSI neutro:', indicators.rsi);
      }
    } else {
      console.log('⚠️ RSI não disponível');
    }

    // MACD
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      const macdDiff = indicators.macd.MACD - indicators.macd.signal;
      const macdStrength = Math.abs(macdDiff);
      if (macdDiff > 0.001) { // Exige diferença mínima significativa
        total += SCORING_WEIGHTS.MACD_BULLISH;
        details.macd = { score: SCORING_WEIGHTS.MACD_BULLISH, reason: 'Cruzamento bullish' };
        confirmations++;
        if (macdStrength > 0.01) strengthFactors.push('MACD_VERY_STRONG');
        else if (macdStrength > 0.005) strengthFactors.push('MACD_STRONG');
        console.log('✅ MACD bullish:', SCORING_WEIGHTS.MACD_BULLISH);
      } else if (macdDiff < -0.001) { // Exige diferença mínima significativa
        total += SCORING_WEIGHTS.MACD_BEARISH; // Já é negativo
        details.macd = { score: SCORING_WEIGHTS.MACD_BEARISH, reason: 'Cruzamento bearish' };
        confirmations++;
        if (macdStrength > 0.01) strengthFactors.push('MACD_VERY_STRONG');
        else if (macdStrength > 0.005) strengthFactors.push('MACD_STRONG');
        console.log('❌ MACD bearish:', SCORING_WEIGHTS.MACD_BEARISH);
      } else {
        console.log('🟡 MACD neutro - diferença insuficiente');
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
        confirmations++;
        strengthFactors.push('ICHIMOKU_STRONG');
        console.log('✅ Ichimoku bullish:', SCORING_WEIGHTS.ICHIMOKU_BULLISH);
      }
    } else {
      console.log('⚠️ Ichimoku não disponível');
    }

    // Divergência de RSI
    if (indicators.rsiDivergence) {
      total += SCORING_WEIGHTS.RSI_DIVERGENCE;
      details.rsiDivergence = { score: SCORING_WEIGHTS.RSI_DIVERGENCE, reason: 'Divergência detectada' };
      confirmations++;
      strengthFactors.push('DIVERGENCE');
      console.log('✅ RSI divergência:', SCORING_WEIGHTS.RSI_DIVERGENCE);
    }

    // Médias móveis
    if (indicators.ma21 !== null && indicators.ma200 !== null) {
      if (indicators.ma21 > indicators.ma200) {
        // Verifica se a diferença é significativa (>2%)
        const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
        if (maDiff > 1.0) { // Mais rigoroso - exige 1% de diferença
          total += SCORING_WEIGHTS.MA_BULLISH;
          details.movingAverages = { score: SCORING_WEIGHTS.MA_BULLISH, reason: `MA21 > MA200 (+${maDiff.toFixed(1)}%)` };
          confirmations++;
          if (maDiff > 5.0) strengthFactors.push('MA_VERY_STRONG');
          else if (maDiff > 3.0) strengthFactors.push('MA_STRONG_BULLISH');
          console.log('✅ MA bullish forte:', SCORING_WEIGHTS.MA_BULLISH);
        } else if (maDiff > 0.3) {
          total += 10;
          details.movingAverages = { score: 10, reason: `MA21 > MA200 (+${maDiff.toFixed(1)}%)` };
          console.log('🟡 MA bullish fraco:', 10);
        }
      } else if (indicators.ma21 < indicators.ma200) {
        const maDiff = ((indicators.ma200 - indicators.ma21) / indicators.ma200) * 100;
        if (maDiff > 8) {
          total -= 5; // Penalidade menor
          details.movingAverages = { score: -5, reason: `MA21 < MA200 (-${maDiff.toFixed(1)}%)` };
          console.log('❌ MA bearish forte:', -5);
        } else if (maDiff > 3) {
          total -= 2; // Penalidade muito pequena
          details.movingAverages = { score: -2, reason: `MA21 < MA200 (-${maDiff.toFixed(1)}%)` };
          console.log('🟡 MA bearish moderado:', -2);
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
        strengthFactors.push('BOLLINGER_EXTREME');
        console.log('✅ Bollinger breakout:', SCORING_WEIGHTS.BOLLINGER_BREAKOUT);
      }
    } else {
      console.log('⚠️ Bollinger não disponível');
    }

    console.log('📊 Total score indicadores:', total);
    return { total, details, confirmations, strengthFactors };
  }

  /**
   * Pontua padrões gráficos
   */
  scorePatterns(patterns) {
    let total = 0;
    const details = {};
    let confirmations = 0;
    let strengthFactors = [];

    // Se não há padrões detectados, adiciona score base mínimo
    if (!patterns || Object.keys(patterns).length === 0) {
      console.log('⚠️ Nenhum padrão detectado - adicionando score base');
      total += 15; // Score base aumentado
      details.base = { score: 15, reason: 'Score base sem padrões específicos' };
      return { total, details, confirmations, strengthFactors };
    }

    // Rompimentos
    if (patterns.breakout) {
      if (patterns.breakout.type === 'BULLISH_BREAKOUT') {
        total += SCORING_WEIGHTS.PATTERN_BREAKOUT;
        details.breakout = { 
          score: SCORING_WEIGHTS.PATTERN_BREAKOUT, 
          reason: `Rompimento bullish em ${patterns.breakout.level}` 
        };
        confirmations++;
        if (patterns.breakout.strength === 'HIGH') strengthFactors.push('BREAKOUT_STRONG');
        else strengthFactors.push('PATTERN_STRONG');
      } else if (patterns.breakout.type === 'BEARISH_BREAKOUT') {
        total += SCORING_WEIGHTS.PATTERN_BREAKOUT; // Também pontua breakouts bearish
        details.breakout = { 
          score: SCORING_WEIGHTS.PATTERN_BREAKOUT, 
          reason: `Rompimento bearish em ${patterns.breakout.level}` 
        };
        confirmations++;
        if (patterns.breakout.strength === 'HIGH') strengthFactors.push('BREAKOUT_STRONG');
        else strengthFactors.push('PATTERN_STRONG');
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
        confirmations++;
        strengthFactors.push('PATTERN_STRONG');
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
        confirmations++;
        strengthFactors.push('PATTERN_STRONG');
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
        confirmations++;
        strengthFactors.push('PATTERN_STRONG');
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
        confirmations++;
        strengthFactors.push('PATTERN_EXTREME');
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
        confirmations++;
        strengthFactors.push('PATTERN_EXTREME');
      }
    }

    // Padrões de candlestick
    if (patterns.candlestick && patterns.candlestick.length > 0) {
      patterns.candlestick.forEach(pattern => {
        if (pattern.bias === 'BULLISH') {
          total += 10; // Peso aumentado para candlesticks
          details[pattern.type] = { score: 10, reason: pattern.type };
          confirmations++;
          if (['BULLISH_ENGULFING', 'BEARISH_ENGULFING'].includes(pattern.type)) {
            strengthFactors.push('PATTERN_EXTREME');
          } else {
            strengthFactors.push('PATTERN_STRONG');
          }
        }
      });
    }

    // Bônus por múltiplos padrões
    if (strengthFactors.length >= 3) {
      strengthFactors.push('MULTIPLE_PATTERNS');
    }

    return { total, details, confirmations, strengthFactors };
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
    if (currentVolume > avgVolume * TRADING_CONFIG.QUALITY_FILTERS.MIN_VOLUME_RATIO) {
      console.log('✅ Volume alto confirmado:', SCORING_WEIGHTS.VOLUME_CONFIRMATION);
      return SCORING_WEIGHTS.VOLUME_CONFIRMATION;
    } else if (currentVolume > avgVolume * 1.0) {
      console.log('🟡 Volume moderadamente alto:', 8);
      return 8;
    } else if (currentVolume > avgVolume * 0.8) {
      console.log('🟡 Volume normal:', 5);
      return 5;
    }

    console.log('🟡 Volume normal');
    return 0;
  }

  /**
   * Calcula níveis de entrada, alvos e stop-loss
   */
  calculateTradingLevels(currentPrice, trend = 'BULLISH') {
    console.log(`💰 CALCULANDO NÍVEIS DE TRADING:`);
    console.log(`   💰 Preço atual: $${currentPrice.toFixed(8)}`);
    console.log(`   📈 Tendência: ${trend}`);
    
    const entry = currentPrice;
    const isLong = trend === 'BULLISH';
    
    console.log(`   🎯 Tipo de operação: ${isLong ? 'LONG (COMPRA)' : 'SHORT (VENDA)'}`);
    
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
      ? entry * (1 - TRADING_CONFIG.STOP_LOSS_PERCENTAGE / 100) // COMPRA: stop abaixo
      : entry * (1 + TRADING_CONFIG.STOP_LOSS_PERCENTAGE / 100); // VENDA: stop acima

    console.log(`   🎯 Alvos calculados:`);
    targets.forEach((target, i) => {
      console.log(`      ${i + 1}. $${target.toFixed(8)} (${isLong ? '+' : '-'}${TRADING_CONFIG.TARGET_PERCENTAGES[i]}%)`);
    });
    console.log(`   🛑 Stop Loss: $${stopLoss.toFixed(8)} (${isLong ? '-' : '+'}${TRADING_CONFIG.STOP_LOSS_PERCENTAGE}%)`);
    
    // Validação crítica dos níveis
    let hasInvalidLevels = false;
    
    if (isLong) {
      // Para LONG: todos os alvos devem ser maiores que entrada
      targets.forEach((target, i) => {
        if (target <= entry) {
          console.error(`❌ ERRO: Alvo ${i + 1} LONG inválido: $${target.toFixed(8)} <= $${entry.toFixed(8)}`);
          hasInvalidLevels = true;
        }
      });
      // Para LONG: stop deve ser menor que entrada
      if (stopLoss >= entry) {
        console.error(`❌ ERRO: Stop Loss LONG inválido: $${stopLoss.toFixed(8)} >= $${entry.toFixed(8)}`);
        hasInvalidLevels = true;
      }
    } else {
      // Para SHORT: todos os alvos devem ser menores que entrada
      targets.forEach((target, i) => {
        if (target >= entry) {
          console.error(`❌ ERRO: Alvo ${i + 1} SHORT inválido: $${target.toFixed(8)} >= $${entry.toFixed(8)}`);
          hasInvalidLevels = true;
        }
      });
      // Para SHORT: stop deve ser maior que entrada
      if (stopLoss <= entry) {
        console.error(`❌ ERRO: Stop Loss SHORT inválido: $${stopLoss.toFixed(8)} <= $${entry.toFixed(8)}`);
        hasInvalidLevels = true;
      }
    }
    
    if (hasInvalidLevels) {
      console.error(`❌ NÍVEIS INVÁLIDOS DETECTADOS - Corrigindo...`);
      // Força recálculo correto
      const correctedTargets = TRADING_CONFIG.TARGET_PERCENTAGES.map(percentage => {
        if (isLong) {
          return entry * (1 + percentage / 100);
        } else {
          return entry * (1 - percentage / 100);
        }
      });
      
      const correctedStopLoss = isLong 
        ? entry * (1 - TRADING_CONFIG.STOP_LOSS_PERCENTAGE / 100)
        : entry * (1 + TRADING_CONFIG.STOP_LOSS_PERCENTAGE / 100);
        
      console.log(`✅ NÍVEIS CORRIGIDOS:`);
      console.log(`   🎯 Alvos: ${correctedTargets.map(t => '$' + t.toFixed(8)).join(', ')}`);
      console.log(`   🛑 Stop: $${correctedStopLoss.toFixed(8)}`);
      
      return {
        entry,
        targets: correctedTargets,
        stopLoss: correctedStopLoss,
        riskRewardRatio: Math.abs((correctedTargets[0] - entry) / (entry - correctedStopLoss))
      };
    }
    // Calcula risk/reward ratio
    const riskRewardRatio = isLong 
      ? (targets[0] - entry) / (entry - stopLoss)  // LONG: (target - entry) / (entry - stop)
      : (entry - targets[0]) / (stopLoss - entry); // SHORT: (entry - target) / (stop - entry)

    console.log(`   📊 Risk/Reward: ${Math.abs(riskRewardRatio).toFixed(2)}:1`);
    console.log(`✅ NÍVEIS VALIDADOS com sucesso`);

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
  applyTrendPriority(currentScore, indicators, patterns, marketTrend, bitcoinCorrelation = null) {
    const signalTrend = this.detectSignalTrend(indicators, patterns);
    let adjustedScore = currentScore;
    const details = {
      marketTrend,
      signalTrend,
      bitcoinInfluence: bitcoinCorrelation ? bitcoinCorrelation.btcTrend : null,
      adjustment: 0,
      reason: ''
    };

    // Se não conseguir detectar tendência do mercado, usa tendência local
    const effectiveTrend = marketTrend || this.detectLocalTrend(indicators);
    details.effectiveTrend = effectiveTrend;

    // Considera influência do Bitcoin se disponível
    let finalTrend = effectiveTrend;
    if (bitcoinCorrelation && bitcoinCorrelation.btcStrength > 70) {
      // Bitcoin muito forte influencia a tendência efetiva
      if (bitcoinCorrelation.btcTrend !== 'NEUTRAL') {
        finalTrend = bitcoinCorrelation.btcTrend;
        details.bitcoinOverride = true;
        details.reason += ` (Bitcoin ${bitcoinCorrelation.btcTrend} forte sobrepõe tendência local)`;
        console.log(`₿ Bitcoin forte (${bitcoinCorrelation.btcStrength}) sobrepõe tendência: ${effectiveTrend} → ${finalTrend}`);
      }
    }
    
    // Detecta se é sinal contra-tendência
    const now = Date.now();
    const isCounterTrend = (finalTrend === 'BULLISH' && signalTrend === 'BEARISH') ||
                          (finalTrend === 'BEARISH' && signalTrend === 'BULLISH');
    
    // Verifica se é timeframe de curto prazo para correções
    const isShortTermTimeframe = this.currentTimeframe && 
      TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_TIMEFRAMES.includes(this.currentTimeframe);
    
    if (isCounterTrend && this.adaptiveScoring) {
      // Verifica limite diário
      if (this.adaptiveScoring.counterTrendToday >= TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY) {
        adjustedScore *= 0.2; // Reduz drasticamente (80% redução)
        details.adjustment = -80;
        details.reason = 'Limite diário de sinais contra-tendência atingido';
        details.counterTrendBlocked = true;
        return { adjustedScore, details };
      }
      
      // Verifica cooldown
      if (now - this.adaptiveScoring.lastCounterTrendTime < TRADING_CONFIG.COUNTER_TREND.COUNTER_TREND_COOLDOWN) {
        const remainingMinutes = Math.ceil((TRADING_CONFIG.COUNTER_TREND.COUNTER_TREND_COOLDOWN - (now - this.adaptiveScoring.lastCounterTrendTime)) / (60 * 1000));
        adjustedScore *= 0.4; // Reduz moderadamente (60% redução)
        details.adjustment = -60;
        details.reason = `Cooldown contra-tendência ativo (${remainingMinutes}min restantes)`;
        details.counterTrendCooldown = true;
        return { adjustedScore, details };
      }
    }

    // LÓGICA DE PRIORIZAÇÃO
    if (finalTrend === 'BULLISH') {
      if (signalTrend === 'BULLISH') {
        // Tendência de alta + sinal de compra = PRIORIDADE MÁXIMA  
        let bonus = 1.20; // Base +20%
        
        // Bônus extra se Bitcoin também estiver bullish
        if (bitcoinCorrelation && bitcoinCorrelation.btcTrend === 'BULLISH' && bitcoinCorrelation.btcStrength > 70) {
          bonus = 1.30; // +30% se Bitcoin muito bullish
          details.reason = 'COMPRA alinhada: Ativo + Bitcoin BULLISH - PRIORIDADE MÁXIMA';
        } else {
          details.reason = 'COMPRA alinhada com tendência de alta - PRIORIDADE';
        }
        
        adjustedScore *= bonus;
        details.adjustment = (bonus - 1) * 100;
      } else if (signalTrend === 'BEARISH') {
        // Tendência de alta + sinal de venda = EXCEÇÃO RARA
        const reversalStrength = this.calculateReversalStrength(indicators, patterns);
        
        // NOVO: Bônus para timeframes de curto prazo
        let shortTermBonus = 1.0;
        if (isShortTermTimeframe) {
          shortTermBonus = TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_BONUS;
          console.log(`📊 CORREÇÃO DE CURTO PRAZO: ${this.currentTimeframe} - Bônus ${((shortTermBonus - 1) * 100).toFixed(0)}%`);
          
          // Verifica critérios específicos para curto prazo
          const shortTermCriteria = this.validateShortTermCriteria(indicators, patterns);
          if (!shortTermCriteria.valid) {
            adjustedScore *= 0.5;
            details.adjustment = -50;
            details.reason = `Correção ${this.currentTimeframe} rejeitada: ${shortTermCriteria.reason}`;
            return { adjustedScore, details };
          }
        }
        
        // Penalidade extra se Bitcoin também estiver bullish
        let penalty = TRADING_CONFIG.COUNTER_TREND.PENALTY_WEAK_REVERSAL;
        if (bitcoinCorrelation && bitcoinCorrelation.btcTrend === 'BULLISH' && bitcoinCorrelation.btcStrength > 80) {
          penalty = 0.4; // Penalidade maior (60% redução)
          console.log(`⚠️ Sinal VENDA contra ALTA + Bitcoin BULLISH forte - Força: ${reversalStrength}/100`);
        } else {
          console.log(`⚠️ Sinal VENDA em tendência de ALTA - Força de reversão: ${reversalStrength}/100`);
        }
        
        if (reversalStrength < TRADING_CONFIG.COUNTER_TREND.MIN_REVERSAL_STRENGTH) {
          adjustedScore *= penalty * shortTermBonus;
          details.adjustment = -(100 - penalty * shortTermBonus * 100);
          details.reason = bitcoinCorrelation?.btcTrend === 'BULLISH' ? 
            `VENDA contra ALTA + Bitcoin BULLISH - reversão INSUFICIENTE ${isShortTermTimeframe ? '(curto prazo)' : ''}` :
            `VENDA contra tendência de ALTA - padrão de reversão INSUFICIENTE ${isShortTermTimeframe ? '(curto prazo)' : ''}`;
        } else if (reversalStrength >= TRADING_CONFIG.COUNTER_TREND.EXTREME_REVERSAL_THRESHOLD) {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL * shortTermBonus;
          details.adjustment = ((TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL * shortTermBonus - 1) * 100);
          details.reason = `VENDA contra tendência - padrão de reversão EXTREMO ${isShortTermTimeframe ? '(correção ' + this.currentTimeframe + ')' : ''}`;
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          details.isShortTerm = isShortTermTimeframe;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Correção ${isShortTermTimeframe ? this.currentTimeframe : 'longo prazo'} aprovada: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
          }
        } else {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL * shortTermBonus;
          details.adjustment = ((TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL * shortTermBonus - 1) * 100);
          details.reason = `VENDA contra tendência - padrão de reversão forte ${isShortTermTimeframe ? '(correção ' + this.currentTimeframe + ')' : ''}`;
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          details.isShortTerm = isShortTermTimeframe;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Correção ${isShortTermTimeframe ? this.currentTimeframe : 'longo prazo'} aprovada: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
          }
        }
      }
    } else if (finalTrend === 'BEARISH') {
      if (signalTrend === 'BEARISH') {
        // Tendência de baixa + sinal de venda = PRIORIDADE MÁXIMA
        let bonus = 1.20; // Base +20%
        
        // Bônus extra se Bitcoin também estiver bearish
        if (bitcoinCorrelation && bitcoinCorrelation.btcTrend === 'BEARISH' && bitcoinCorrelation.btcStrength > 70) {
          bonus = 1.30; // +30% se Bitcoin muito bearish
          details.reason = 'VENDA alinhada: Ativo + Bitcoin BEARISH - PRIORIDADE MÁXIMA';
        } else {
          details.reason = 'VENDA alinhada com tendência de baixa - PRIORIDADE';
        }
        
        adjustedScore *= bonus;
        details.adjustment = (bonus - 1) * 100;
      } else if (signalTrend === 'BULLISH') {
        // Tendência de baixa + sinal de compra = EXCEÇÃO RARA
        const reversalStrength = this.calculateReversalStrength(indicators, patterns);
        
        // NOVO: Bônus para timeframes de curto prazo
        let shortTermBonus = 1.0;
        if (isShortTermTimeframe) {
          shortTermBonus = TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_BONUS;
          console.log(`📊 CORREÇÃO DE CURTO PRAZO: ${this.currentTimeframe} - Bônus ${((shortTermBonus - 1) * 100).toFixed(0)}%`);
          
          // Verifica critérios específicos para curto prazo
          const shortTermCriteria = this.validateShortTermCriteria(indicators, patterns);
          if (!shortTermCriteria.valid) {
            adjustedScore *= 0.5;
            details.adjustment = -50;
            details.reason = `Correção ${this.currentTimeframe} rejeitada: ${shortTermCriteria.reason}`;
            return { adjustedScore, details };
          }
        }
        
        // Penalidade extra se Bitcoin também estiver bearish
        let penalty = TRADING_CONFIG.COUNTER_TREND.PENALTY_WEAK_REVERSAL;
        if (bitcoinCorrelation && bitcoinCorrelation.btcTrend === 'BEARISH' && bitcoinCorrelation.btcStrength > 80) {
          penalty = 0.4; // Penalidade maior (60% redução)
          console.log(`⚠️ Sinal COMPRA contra BAIXA + Bitcoin BEARISH forte - Força: ${reversalStrength}/100`);
        } else {
          console.log(`⚠️ Sinal COMPRA em tendência de BAIXA - Força de reversão: ${reversalStrength}/100`);
        }
        
        if (reversalStrength < TRADING_CONFIG.COUNTER_TREND.MIN_REVERSAL_STRENGTH) {
          adjustedScore *= penalty * shortTermBonus;
          details.adjustment = -(100 - penalty * shortTermBonus * 100);
          details.reason = bitcoinCorrelation?.btcTrend === 'BEARISH' ? 
            `COMPRA contra BAIXA + Bitcoin BEARISH - reversão INSUFICIENTE ${isShortTermTimeframe ? '(curto prazo)' : ''}` :
            `COMPRA contra tendência de BAIXA - padrão de reversão INSUFICIENTE ${isShortTermTimeframe ? '(curto prazo)' : ''}`;
        } else if (reversalStrength >= TRADING_CONFIG.COUNTER_TREND.EXTREME_REVERSAL_THRESHOLD) {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL * shortTermBonus;
          details.adjustment = ((TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL * shortTermBonus - 1) * 100);
          details.reason = `COMPRA contra tendência - padrão de reversão EXTREMO ${isShortTermTimeframe ? '(correção ' + this.currentTimeframe + ')' : ''}`;
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          details.isShortTerm = isShortTermTimeframe;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Correção ${isShortTermTimeframe ? this.currentTimeframe : 'longo prazo'} aprovada: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
          }
        } else {
          adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL * shortTermBonus;
          details.adjustment = ((TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL * shortTermBonus - 1) * 100);
          details.reason = `COMPRA contra tendência - padrão de reversão forte ${isShortTermTimeframe ? '(correção ' + this.currentTimeframe + ')' : ''}`;
          details.isCounterTrend = true;
          details.reversalStrength = reversalStrength;
          details.isShortTerm = isShortTermTimeframe;
          
          // Registra uso de sinal contra-tendência
          if (this.adaptiveScoring) {
            this.adaptiveScoring.counterTrendToday++;
            this.adaptiveScoring.lastCounterTrendTime = now;
            console.log(`📊 Correção ${isShortTermTimeframe ? this.currentTimeframe : 'longo prazo'} aprovada: ${this.adaptiveScoring.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje`);
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

  /**
   * Valida critérios específicos para sinais de curto prazo
   */
  validateShortTermCriteria(indicators, patterns) {
    const criteria = [];
    let score = 0;
    
    // RSI deve ser MUITO extremo para curto prazo
    if (indicators.rsi !== null && indicators.rsi !== undefined) {
      if (indicators.rsi < TRADING_CONFIG.COUNTER_TREND.MIN_SHORT_TERM_RSI_EXTREME || 
          indicators.rsi > TRADING_CONFIG.COUNTER_TREND.MAX_SHORT_TERM_RSI_EXTREME) {
        score += 30;
        criteria.push(`RSI extremo: ${indicators.rsi.toFixed(1)}`);
      } else {
        return { valid: false, reason: `RSI não extremo para curto prazo: ${indicators.rsi.toFixed(1)}` };
      }
    }
    
    // Divergência de RSI é MUITO importante para correções
    if (indicators.rsiDivergence) {
      score += TRADING_CONFIG.COUNTER_TREND.DIVERGENCE_BONUS;
      criteria.push('Divergência RSI detectada');
    }
    
    // Volume deve ter pico significativo
    if (TRADING_CONFIG.COUNTER_TREND.REQUIRE_VOLUME_SPIKE && indicators.volumeMA) {
      const currentVolume = indicators.currentVolume || 0;
      const volumeRatio = currentVolume / indicators.volumeMA;
      
      if (volumeRatio >= TRADING_CONFIG.COUNTER_TREND.MIN_VOLUME_SPIKE) {
        score += 20;
        criteria.push(`Volume spike: ${volumeRatio.toFixed(1)}x`);
      } else {
        return { valid: false, reason: `Volume insuficiente: ${volumeRatio.toFixed(1)}x (min: ${TRADING_CONFIG.COUNTER_TREND.MIN_VOLUME_SPIKE}x)` };
      }
    }
    
    // Padrões de reversão clássicos
    if (patterns.double || patterns.headShoulders) {
      score += TRADING_CONFIG.COUNTER_TREND.PATTERN_REVERSAL_BONUS;
      criteria.push('Padrão de reversão clássico');
    }
    
    // Padrões de candlestick de reversão
    if (patterns.candlestick && patterns.candlestick.length > 0) {
      const reversalPatterns = patterns.candlestick.filter(p => 
        ['BULLISH_ENGULFING', 'BEARISH_ENGULFING', 'HAMMER', 'HANGING_MAN'].includes(p.type)
      );
      if (reversalPatterns.length > 0) {
        score += 15;
        criteria.push(`Candlestick reversão: ${reversalPatterns[0].type}`);
      }
    }
    
    // MACD deve mostrar divergência clara
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      const macdStrength = Math.abs(indicators.macd.MACD - indicators.macd.signal);
      if (macdStrength > 0.002) { // Mais rigoroso para curto prazo
        score += 15;
        criteria.push(`MACD forte: ${macdStrength.toFixed(4)}`);
      }
    }
    
    // Score mínimo para aprovar correção de curto prazo
    const minScore = 60;
    
    if (score >= minScore) {
      return { 
        valid: true, 
        score, 
        criteria,
        reason: `Correção válida: ${score}/100 (${criteria.join(', ')})` 
      };
    } else {
      return { 
        valid: false, 
        reason: `Score insuficiente: ${score}/${minScore} (${criteria.join(', ')})` 
      };
    }
  }

  /**
   * Define timeframe atual para análise
   */
  setCurrentTimeframe(timeframe) {
    this.currentTimeframe = timeframe;
  }
}

export default SignalScoringService;