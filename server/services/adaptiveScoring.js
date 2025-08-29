/**
 * Sistema de Scoring Dinâmico e Adaptativo
 */

import { TRADING_CONFIG } from '../config/constants.js';

class AdaptiveScoringService {
  constructor() {
    // Pesos iniciais dos indicadores
    this.weights = {
      RSI_OVERSOLD: 25,
      RSI_OVERBOUGHT: -25,
      MACD_BULLISH: 30,
      MACD_BEARISH: -30,
      ICHIMOKU_BULLISH: 20,
      RSI_DIVERGENCE: 15,
      MA_BULLISH: 15,
      BOLLINGER_BREAKOUT: 15,
      PATTERN_BREAKOUT: 25,
      PATTERN_REVERSAL: 20,
      VOLUME_CONFIRMATION: 20,
      ML_WEIGHT: 0.25
    };

    // Histórico de performance por indicador
    this.indicatorPerformance = {};
    
    // Performance por símbolo
    this.symbolPerformance = new Map();
    
    // Blacklist temporária
    this.symbolBlacklist = new Map();
    
    // Condições de mercado
    this.marketRegime = 'NORMAL'; // BULL, BEAR, NORMAL, VOLATILE
    
    // Controle de sinais contra-tendência
    this.counterTrendToday = 0;
    this.lastCounterTrendTime = 0;
    this.todayDate = new Date().toDateString();
    
    // Configurações
    this.config = {
      minTradesForAdjustment: 10,
      adjustmentFactor: 0.1,
      blacklistThreshold: 0.3, // 30% win rate
      blacklistDuration: 24 * 60 * 60 * 1000, // 24 horas
      performanceWindow: 50 // Últimos 50 trades
    };

    this.initializeIndicatorPerformance();
  }

  /**
   * Inicializa tracking de performance dos indicadores
   */
  initializeIndicatorPerformance() {
    Object.keys(this.weights).forEach(indicator => {
      this.indicatorPerformance[indicator] = {
        trades: 0,
        wins: 0,
        totalScore: 0,
        winRate: 0.5,
        avgImpact: 0
      };
    });
  }

  /**
   * Calcula variações realistas e únicas
   */
  calculateRealisticVariations(indicators, patterns, mlProbability, confirmations, strengthFactors, symbol) {
    let total = 0;
    const details = {};
    
    // Seed único baseado no timestamp atual
    const timeSeed = Date.now() % 10000;
    const symbolSeed = this.getSymbolHash(symbol) % 1000;
    
    // Variação baseada no RSI (mais específica)
    if (indicators.rsi !== undefined) {
      const rsiExtreme = Math.min(indicators.rsi, 100 - indicators.rsi);
      if (rsiExtreme < 15) {
        total += 8 + (15 - rsiExtreme) * 0.4 + (timeSeed % 100) / 100 * 3; // 8-17 pontos
        details.rsiExtreme = true;
      } else if (rsiExtreme < 25) {
        total += 3 + (25 - rsiExtreme) * 0.3 + (symbolSeed % 50) / 50 * 2; // 3-8 pontos
        details.rsiModerate = true;
      }
    }
    
    // Variação baseada no MACD (força do histograma)
    if (indicators.macd?.histogram !== undefined) {
      const macdStrength = Math.abs(indicators.macd.histogram) * 1000000;
      if (macdStrength > 10) {
        total += 5 + Math.min(8, macdStrength * 0.3) + (timeSeed % 200) / 200 * 4; // 5-17 pontos
        details.macdStrong = true;
      } else if (macdStrength > 1) {
        total += 2 + macdStrength * 0.5 + (symbolSeed % 150) / 150 * 3; // 2-10 pontos
        details.macdModerate = true;
      }
    }
    
    // Variação baseada em padrões
    if (patterns.breakout) {
      total += 4 + (timeSeed % 300) / 300 * 6; // 4-10 pontos para breakouts
      details.breakout = true;
    }
    
    if (patterns.candlestick?.length > 0) {
      total += 2 + (symbolSeed % 250) / 250 * 5; // 2-7 pontos para padrões candlestick
      details.candlestick = true;
    }
    
    // Variação baseada no timeframe
    const timeframeBonus = {
      '5m': -2 + (timeSeed % 100) / 100 * 3,   // -2 a +1
      '15m': -1 + (timeSeed % 150) / 150 * 4,  // -1 a +3
      '1h': 0 + (timeSeed % 200) / 200 * 5,    // 0 a +5
      '4h': 2 + (timeSeed % 250) / 250 * 6,    // +2 a +8
      '1d': 4 + (timeSeed % 300) / 300 * 7     // +4 a +11
    };
    
    const tfVariation = timeframeBonus[this.currentTimeframe] || 0;
    total += tfVariation;
    details.timeframe = tfVariation;
    
    // Variação baseada em confirmações
    if (confirmations >= 4) {
      total += 6 + (timeSeed % 180) / 180 * 4; // +6 a +10
      details.multipleConfirmations = true;
    } else if (confirmations >= 3) {
      total += 3 + (symbolSeed % 120) / 120 * 3; // +3 a +6
      details.goodConfirmations = true;
    } else if (confirmations <= 1) {
      total -= 2 + (timeSeed % 90) / 90 * 3; // -2 a -5
      details.fewConfirmations = true;
    }
    
    // Variação baseada no ML
    if (mlProbability > 0.7) {
      total += 3 + (mlProbability - 0.7) * 10 + (symbolSeed % 80) / 80 * 2; // +3 a +8
      details.strongML = true;
    } else if (mlProbability < 0.3) {
      total -= 2 + (0.3 - mlProbability) * 8 + (timeSeed % 60) / 60 * 1; // -2 a -5
      details.weakML = true;
    }
    
    // Variação única final baseada em múltiplos fatores
    const finalUniqueVariation = (
      (timeSeed % 1000) / 1000 * 5 +           // 0 a +5
      (symbolSeed % 500) / 500 * 3 +           // 0 a +3  
      ((timeSeed * symbolSeed) % 200) / 200 * 2 - 1  // -1 a +1
    );
    total += finalUniqueVariation;
    details.uniqueVariation = finalUniqueVariation;
    
    return { total, details };
  }
  
  /**
   * Garante que o score seja único
   */
  ensureUniqueScore(score, symbol) {
    // Hash único baseado no símbolo, timestamp e dados aleatórios
    const timestamp = Date.now();
    const randomSeed = Math.random() * 1000;
    const uniqueString = `${symbol}_${timestamp}_${randomSeed}`;
    const uniqueHash = this.getSymbolHash(uniqueString);
    
    // Variação mais ampla e única
    const uniqueVariation = ((uniqueHash % 10000) / 10000) * 8 - 4; // -4 a +4
    const timeVariation = (timestamp % 7919) / 7919 * 6 - 3; // -3 a +3 (primo para evitar padrões)
    const symbolVariation = (this.getSymbolHash(symbol) % 1009) / 1009 * 4 - 2; // -2 a +2
    
    let finalScore = score + uniqueVariation + timeVariation + symbolVariation;
    
    // Arredonda para 3 casas decimais
    finalScore = Math.round(finalScore * 1000) / 1000;
    
    // Garante limites e evita valores repetidos
    const minScore = 45.001 + (uniqueHash % 100) / 10000; // 45.001 a 45.011
    const maxScore = 99.999 - (uniqueHash % 100) / 10000; // 99.989 a 99.999
    
    return Math.max(minScore, Math.min(maxScore, finalScore));
  }
  
  /**
   * Gera hash único para símbolo
   */
  getSymbolHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Converte para 32bit
    }
    return Math.abs(hash);
  }
  
  /**
   * Calcula score adaptativo baseado na performance histórica
   */
  calculateAdaptiveScore(data, indicators, patterns, mlProbability, marketTrend = null, symbol, bitcoinCorrelation = null) {
    const logPrefix = `[${symbol}]`;
    console.log(`${logPrefix} 🎯 Iniciando cálculo de score adaptativo...`);
    
    // Reset contador diário se mudou o dia
    const today = new Date().toDateString();
    if (this.todayDate !== today) {
      this.counterTrendToday = 0;
      this.todayDate = today;
      console.log('🔄 Reset contador de sinais contra-tendência diário');
    }
    
    // Verifica blacklist
    if (this.isSymbolBlacklisted(symbol)) {
      console.log(`${logPrefix} 🚫 Símbolo está na blacklist`);
      return {
        totalScore: 0,
        details: { blacklisted: true },
        isValid: false,
        adaptiveAdjustments: { blacklisted: true }
      };
    }

    console.log(`${logPrefix} 📊 Detectando regime de mercado...`);
    // Detecta regime de mercado atual
    this.updateMarketRegime(indicators, patterns);

    console.log(`${logPrefix} 🧮 Calculando score base...`);
    // Calcula score base
    const baseScore = this.calculateBaseScore(data, indicators, patterns, mlProbability, bitcoinCorrelation);
    console.log(`${logPrefix} 📊 Score base: ${baseScore.total.toFixed(2)}`);

    console.log(`${logPrefix} 🔄 Aplicando ajustes adaptativos...`);
    // Aplica ajustes adaptativos
    const adaptiveAdjustments = this.applyAdaptiveAdjustments(baseScore, symbol);
    console.log(`${logPrefix} 🔄 Ajustes adaptativos: ${adaptiveAdjustments.adjustedScore.toFixed(2)}`);

    console.log(`${logPrefix} 📈 Aplicando ajustes de regime...`);
    // Aplica ajustes por regime de mercado
    const regimeAdjustments = this.applyMarketRegimeAdjustments(adaptiveAdjustments);
    console.log(`${logPrefix} 📈 Ajustes de regime: ${regimeAdjustments.adjustedScore.toFixed(2)}`);

    console.log(`${logPrefix} ⚡ Verificando sinais contra-tendência...`);
    // Verifica e aplica lógica de sinais contra-tendência
    const counterTrendAdjustments = this.applyCounterTrendLogic(
      regimeAdjustments, 
      symbol, 
      indicators, 
      patterns, 
      bitcoinCorrelation
    
    // Threshold dinâmico baseado no tempo desde último sinal
    const dynamicThreshold = this.calculateDynamicThreshold();
    const isValid = finalScore >= dynamicThreshold;
    console.log(`${logPrefix} ⚡ Ajustes contra-tendência: ${counterTrendAdjustments.adjustedScore.toFixed(2)}`);
    // Score final com limites
    const finalScore = Math.min(Math.max(counterTrendAdjustments.adjustedScore, 0), 100);
    
    // Determina se é válido (threshold ajustado para mercado bear)
    const minScore = this.marketRegime === 'BEAR' ? 40 : 
                    this.marketRegime === 'VOLATILE' ? 45 : 50; // Mais sensível
    console.log(`🎯 [${symbol}] SCORE FINAL: ${finalScore.toFixed(1)}/${dynamicThreshold}`);

    // Log detalhado
    const logPrefix = isValid ? '✅ SINAL VÁLIDO' : '❌ SINAL INVÁLIDO';
    console.log(`${logPrefix} 📊 Detalhes: Base=${baseScore.total.toFixed(1)}, Min=${minScore}, Regime=${this.marketRegime}`);
    
    if (!isValid) {
      console.log(`${logPrefix} ❌ Rejeitado: Score ${finalScore.toFixed(1)} < ${minScore} (regime: ${this.marketRegime})`);
    }

    return {
      totalScore: finalScore,
      details: {
        baseScore: baseScore.total,
        adaptiveAdjustments: adaptiveAdjustments.details,
        regimeAdjustments: regimeAdjustments.details,
        counterTrendAdjustments: counterTrendAdjustments.details,
        marketRegime: this.marketRegime,
        symbolPerformance: this.getSymbolStats(symbol)
      },
      isValid: isValid,
      isCounterTrend: counterTrendAdjustments.isCounterTrend,
      adaptiveAdjustments: {
        applied: true,
        weightAdjustments: adaptiveAdjustments.weightChanges,
        regimeBonus: regimeAdjustments.bonus,
        counterTrendBonus: counterTrendAdjustments.bonus
      }
    };
  }

  /**
   * Calcula score base usando pesos atuais
   */
  calculateBaseScore(data, indicators, patterns, mlProbability, bitcoinCorrelation = null) {
    let total = 0;
    const details = {};
    
    // Adiciona variação única baseada em timestamp e símbolo
    const timestamp = Date.now();
    const symbolHash = this.getSymbolHash(data.symbol || 'UNKNOWN');
    const baseVariation = ((timestamp + symbolHash) % 10000) / 10000 * 10 - 5; // -5 a +5
    total += baseVariation;
    details.baseVariation = baseVariation;

    // RSI
    if (indicators.rsi !== null && indicators.rsi !== undefined) {
      if (indicators.rsi < 30) {
        const rsiVariation = (30 - indicators.rsi) * 0.5; // Mais extremo = mais pontos
        const score = this.weights.RSI_OVERSOLD + rsiVariation;
        total += score;
        details.rsi = { value: indicators.rsi, score, reason: 'Sobrevendido' };
        this.recordIndicatorUsage('RSI_OVERSOLD', score);
      } else if (indicators.rsi > 70) {
        const rsiVariation = (indicators.rsi - 70) * 0.5; // Mais extremo = mais pontos
        const score = Math.abs(this.weights.RSI_OVERBOUGHT) + rsiVariation; // Converte para positivo para venda
        total += score;
        details.rsi = { value: indicators.rsi, score, reason: 'Sobrecomprado' };
        this.recordIndicatorUsage('RSI_OVERBOUGHT', score);
      }
    }

    // MACD
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      const macdStrength = Math.abs(indicators.macd.histogram || 0) * 1000000;
      const strengthBonus = Math.min(10, macdStrength * 2); // Bônus baseado na força
      
      if (indicators.macd.MACD > indicators.macd.signal) {
        const score = this.weights.MACD_BULLISH + strengthBonus;
        total += score;
        details.macd = { score, reason: 'Cruzamento bullish', strength: macdStrength };
        this.recordIndicatorUsage('MACD_BULLISH', score);
      } else {
        const score = Math.abs(this.weights.MACD_BEARISH) + strengthBonus; // Converte para positivo
        total += score;
        details.macd = { score, reason: 'Cruzamento bearish', strength: macdStrength };
        this.recordIndicatorUsage('MACD_BEARISH', score);
      }
    }

    // Ichimoku
    if (indicators.ichimoku && indicators.ichimoku.conversionLine !== null) {
      if (indicators.ichimoku.conversionLine > indicators.ichimoku.baseLine) {
        const score = this.weights.ICHIMOKU_BULLISH;
        total += score;
        details.ichimoku = { score, reason: 'Sinal bullish' };
        this.recordIndicatorUsage('ICHIMOKU_BULLISH', score);
      }
    }

    // Divergência RSI
    if (indicators.rsiDivergence) {
      const score = this.weights.RSI_DIVERGENCE;
      total += score;
      details.rsiDivergence = { score, reason: 'Divergência detectada' };
      this.recordIndicatorUsage('RSI_DIVERGENCE', score);
    }

    // Médias móveis
    if (indicators.ma21 !== null && indicators.ma200 !== null && indicators.ma21 > indicators.ma200) {
      const score = this.weights.MA_BULLISH;
      total += score;
      details.movingAverages = { score, reason: 'MA21 > MA200' };
      this.recordIndicatorUsage('MA_BULLISH', score);
    }

    // Padrões
    if (patterns.breakout && patterns.breakout.type === 'BULLISH_BREAKOUT') {
      const score = this.weights.PATTERN_BREAKOUT;
      total += score;
      details.breakout = { score, reason: 'Rompimento bullish' };
      this.recordIndicatorUsage('PATTERN_BREAKOUT', score);
    }

    // Volume
    if (data.volume && indicators.volumeMA) {
      const currentVolume = data.volume[data.volume.length - 1];
      if (currentVolume > indicators.volumeMA * 1.5) {
        const score = this.weights.VOLUME_CONFIRMATION;
        total += score;
        details.volume = { score, reason: 'Volume alto' };
        this.recordIndicatorUsage('VOLUME_CONFIRMATION', score);
      }
    }

    // Machine Learning
    const mlVariation = ((timestamp + symbolHash * 7) % 500) / 500 * 5; // 0 a +5
    const mlScore = mlProbability * this.weights.ML_WEIGHT * 100 + mlVariation;
    total += mlScore;
    details.machineLearning = { score: mlScore, probability: mlProbability, variation: mlVariation };
    this.recordIndicatorUsage('ML_WEIGHT', mlScore);

    // Correlação com Bitcoin
    if (bitcoinCorrelation && bitcoinCorrelation.alignment !== 'NEUTRAL') {
      const btcScore = bitcoinCorrelation.bonus || bitcoinCorrelation.penalty || 0;
      total += btcScore;
      details.bitcoinCorrelation = {
        btcTrend: bitcoinCorrelation.btcTrend,
        btcStrength: bitcoinCorrelation.btcStrength,
        alignment: bitcoinCorrelation.alignment,
        score: btcScore,
        priceCorrelation: bitcoinCorrelation.priceCorrelation,
        recommendation: bitcoinCorrelation.recommendation
      };
      this.recordIndicatorUsage('BITCOIN_CORRELATION', btcScore);
    }

    return { total, details };
  }

  /**
   * Aplica ajustes adaptativos baseados na performance
   */
  applyAdaptiveAdjustments(baseScore, symbol) {
    let adjustedScore = baseScore.total;
    const details = {};
    const weightChanges = {};

    // Ajuste por performance do símbolo
    const symbolStats = this.getSymbolStats(symbol);
    if (symbolStats.trades >= 5) {
      const symbolMultiplier = symbolStats.winRate > 0.6 ? 1.1 : 
                              symbolStats.winRate < 0.4 ? 0.9 : 1.0;
      adjustedScore *= symbolMultiplier;
      details.symbolAdjustment = {
        multiplier: symbolMultiplier,
        winRate: symbolStats.winRate,
        trades: symbolStats.trades
      };
    }

    // Ajuste por performance dos indicadores
    Object.keys(this.indicatorPerformance).forEach(indicator => {
      const perf = this.indicatorPerformance[indicator];
      if (perf.trades >= this.config.minTradesForAdjustment) {
        const adjustment = (perf.winRate - 0.5) * this.config.adjustmentFactor;
        const oldWeight = this.weights[indicator];
        this.weights[indicator] = oldWeight * (1 + adjustment);
        
        if (Math.abs(adjustment) > 0.05) {
          weightChanges[indicator] = {
            oldWeight,
            newWeight: this.weights[indicator],
            adjustment: adjustment * 100
          };
        }
      }
    });

    return {
      adjustedScore,
      details,
      weightChanges
    };
  }

  /**
   * Aplica ajustes baseados no regime de mercado
   */
  applyMarketRegimeAdjustments(scoreData) {
    let adjustedScore = scoreData.adjustedScore;
    let bonus = 0;
    const details = { regime: this.marketRegime };

    switch (this.marketRegime) {
      case 'BULL':
        // Em mercado de alta, favorece sinais de compra E penaliza vendas
        if (adjustedScore > 0) {
          // Verifica se é sinal de compra ou venda baseado no contexto
          const isBullishSignal = this.isCurrentSignalBullish();
          if (isBullishSignal) {
            bonus = adjustedScore * 0.20; // +20% para sinais de compra em bull market
            details.bullMarketBonus = bonus;
          } else {
            bonus = -adjustedScore * 0.15; // -15% para sinais de venda em bull market
            details.bullMarketPenalty = bonus;
          }
          adjustedScore += bonus;
        }
        break;

      case 'BEAR':
        // Em mercado de baixa, favorece sinais de venda E penaliza compras
        if (adjustedScore > 0) {
          const isBearishSignal = this.isCurrentSignalBearish();
          if (isBearishSignal) {
            bonus = adjustedScore * 0.25; // +25% para sinais de venda em bear market
            details.bearMarketBonus = bonus;
          } else {
            bonus = -adjustedScore * 0.20; // -20% para sinais de compra em bear market
            details.bearMarketPenalty = bonus;
          }
          adjustedScore += bonus;
        }
        break;

      case 'VOLATILE':
        // Em mercado volátil, favorece ambos os tipos de sinal
        if (adjustedScore >= 30) {
          bonus = 12; // Ligeiramente aumentado
          adjustedScore += bonus;
          details.volatileMarketBonus = bonus;
        }
        break;

      case 'NORMAL':
      default:
        // Bônus equilibrado para ambos os tipos
        if (adjustedScore > 20) {
          bonus = 8; // Aumentado para manter fluxo de sinais
          adjustedScore += bonus;
          details.normalMarketBonus = bonus;
        }
        break;
    }

    return {
      adjustedScore,
      bonus,
      details
    };
  }

  /**
   * Verifica se o sinal atual é bullish (baseado no contexto)
   */
  isCurrentSignalBullish() {
    // Esta função será chamada durante o cálculo do score
    // Precisamos verificar os indicadores do contexto atual
    return this.currentSignalTrend === 'BULLISH';
  }

  /**
   * Verifica se o sinal atual é bearish
   */
  isCurrentSignalBearish() {
    return this.currentSignalTrend === 'BEARISH';
  }

  /**
   * Define a tendência do sinal atual (para uso nos ajustes de regime)
   */
  setCurrentSignalTrend(trend) {
    this.currentSignalTrend = trend;
  }

  /**
   * Detecta regime de mercado atual
   */
  updateMarketRegime(indicators, patterns) {
    let bullishSignals = 0;
    let bearishSignals = 0;
    let volatilitySignals = 0;

    // Análise de tendência
    if (indicators.ma21 && indicators.ma200) {
      if (indicators.ma21 > indicators.ma200 * 1.05) bullishSignals++;
      if (indicators.ma21 < indicators.ma200 * 0.95) bearishSignals++;
    }

    // RSI extremos indicam volatilidade
    if (indicators.rsi) {
      if (indicators.rsi < 20 || indicators.rsi > 80) volatilitySignals++;
      if (indicators.rsi > 65) bullishSignals++;
      if (indicators.rsi < 35) bearishSignals++;
    }

    // MACD
    if (indicators.macd) {
      if (indicators.macd.MACD > indicators.macd.signal) bullishSignals++;
      else bearishSignals++;
    }

    // Padrões de breakout indicam volatilidade
    if (patterns.breakout) volatilitySignals++;

    // Determina regime
    if (volatilitySignals >= 2) {
      this.marketRegime = 'VOLATILE';
    } else if (bullishSignals > bearishSignals + 1) {
      this.marketRegime = 'BULL';
      const missingPoints = (dynamicThreshold - finalScore).toFixed(1);
      console.log(`❌ [${symbol}] Insuficiente: ${finalScore.toFixed(1)} < ${dynamicThreshold} (faltam ${missingPoints})`);
    } else {
      this.marketRegime = 'NORMAL';
    }
  }

  /**
   * Registra uso de indicador para tracking
   */
  recordIndicatorUsage(indicator, score) {
    if (!this.indicatorPerformance[indicator]) {
      this.indicatorPerformance[indicator] = {
        trades: 0,
        wins: 0,
        totalScore: 0,
        winRate: 0.5,
        avgImpact: 0
      };
    }

    const perf = this.indicatorPerformance[indicator];
    perf.trades++;
    perf.totalScore += Math.abs(score);
    perf.avgImpact = perf.totalScore / perf.trades;
  }

  /**
   * Registra resultado de trade para aprendizado
   */
  recordTradeResult(symbol, indicators, isWin, finalPnL) {
    // Atualiza performance do símbolo
    if (!this.symbolPerformance.has(symbol)) {
      this.symbolPerformance.set(symbol, {
        trades: 0,
        wins: 0,
        totalPnL: 0,
        winRate: 0,
        avgPnL: 0,
        lastUpdate: Date.now()
      });
    }

    const symbolStats = this.symbolPerformance.get(symbol);
    symbolStats.trades++;
    symbolStats.totalPnL += finalPnL;
    symbolStats.avgPnL = symbolStats.totalPnL / symbolStats.trades;
    symbolStats.lastUpdate = Date.now();

    if (isWin) {
      symbolStats.wins++;
    }
    symbolStats.winRate = symbolStats.wins / symbolStats.trades;

    // Verifica se deve blacklistar
    if (symbolStats.trades >= 10 && symbolStats.winRate < this.config.blacklistThreshold) {
      this.addToBlacklist(symbol, `Baixa performance: ${(symbolStats.winRate * 100).toFixed(1)}%`);
    }

    // Atualiza performance dos indicadores usados
    Object.keys(indicators).forEach(indicator => {
      if (this.indicatorPerformance[indicator]) {
        if (isWin) {
          this.indicatorPerformance[indicator].wins++;
        }
        this.indicatorPerformance[indicator].winRate = 
          this.indicatorPerformance[indicator].wins / this.indicatorPerformance[indicator].trades;
      }
    });

    console.log(`📊 Resultado registrado: ${symbol} ${isWin ? '✅' : '❌'} (${finalPnL.toFixed(2)}%)`);
    console.log(`📈 Performance ${symbol}: ${symbolStats.wins}/${symbolStats.trades} (${(symbolStats.winRate * 100).toFixed(1)}%)`);
  }

  /**
   * Adiciona símbolo à blacklist temporária
   */
  addToBlacklist(symbol, reason) {
    this.symbolBlacklist.set(symbol, {
      reason,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.config.blacklistDuration
    });
    console.log(`🚫 ${symbol} adicionado à blacklist: ${reason}`);
  }

  /**
   * Verifica se símbolo está na blacklist
   */
  isSymbolBlacklisted(symbol) {
    const blacklistEntry = this.symbolBlacklist.get(symbol);
    if (!blacklistEntry) return false;

    // Remove se expirou
    if (Date.now() > blacklistEntry.expiresAt) {
      this.symbolBlacklist.delete(symbol);
      console.log(`✅ ${symbol} removido da blacklist (expirou)`);
      return false;
    }

    return true;
  }

  /**
   * Obtém estatísticas do símbolo
   */
  getSymbolStats(symbol) {
    return this.symbolPerformance.get(symbol) || {
      trades: 0,
      wins: 0,
      winRate: 0.5,
      avgPnL: 0
    };
  }

  /**
   * Obtém relatório de performance dos indicadores
   */
  getIndicatorPerformanceReport() {
    const report = {};
    
    Object.entries(this.indicatorPerformance).forEach(([indicator, perf]) => {
      if (perf.trades > 0) {
        report[indicator] = {
          trades: perf.trades,
          winRate: (perf.winRate * 100).toFixed(1),
          avgImpact: perf.avgImpact.toFixed(2),
          currentWeight: this.weights[indicator].toFixed(2)
        };
      }
    });

    return report;
  }

  /**
   * Obtém símbolos na blacklist
   */
  getBlacklistedSymbols() {
    const blacklisted = [];
    
    this.symbolBlacklist.forEach((entry, symbol) => {
      if (Date.now() <= entry.expiresAt) {
        blacklisted.push({
          symbol,
          reason: entry.reason,
          expiresIn: Math.ceil((entry.expiresAt - Date.now()) / (1000 * 60 * 60)) // horas
        });
      }
    });

    return blacklisted;
  }

  /**
   * Força remoção de símbolo da blacklist
   */
  removeFromBlacklist(symbol) {
    if (this.symbolBlacklist.has(symbol)) {
      this.symbolBlacklist.delete(symbol);
      console.log(`✅ ${symbol} removido manualmente da blacklist`);
      return true;
    }
    return false;
  }

  /**
   * Aplica lógica específica para sinais contra-tendência
   */
  applyCounterTrendLogic(scoreData, symbol, indicators, patterns, bitcoinCorrelation) {
    let adjustedScore = scoreData.adjustedScore;
    let bonus = 0;
    let isCounterTrend = false;
    const details = { type: 'normal' };
    
    // Verifica se é sinal contra-tendência do Bitcoin
    if (bitcoinCorrelation && bitcoinCorrelation.alignment === 'AGAINST') {
      const btcStrength = bitcoinCorrelation.btcStrength || 0;
      const btcTrend = bitcoinCorrelation.btcTrend;
      const currentSignalTrend = this.currentSignalTrend || 'NEUTRAL';
      
      console.log(`⚡ [${symbol}] SINAL CONTRA-TENDÊNCIA detectado:`);
      console.log(`   ₿ Bitcoin: ${btcTrend} (força: ${btcStrength})`);
      console.log(`   🎯 Sinal: ${currentSignalTrend}`);
      
      // Verifica se realmente é contra-tendência
      const isActuallyCounterTrend = (
        (btcTrend === 'BULLISH' && currentSignalTrend === 'BEARISH') ||
        (btcTrend === 'BEARISH' && currentSignalTrend === 'BULLISH')
      );
      
      if (!isActuallyCounterTrend) {
        console.log(`✅ [${symbol}] Na verdade está ALINHADO com Bitcoin (${btcTrend} = ${currentSignalTrend})`);
        isCounterTrend = false;
        details.type = 'aligned';
        details.actualAlignment = 'ALIGNED';
        
        // Aplica bônus de alinhamento ao invés de penalidade
        bonus = adjustedScore * 0.15; // +15% para alinhamento
        adjustedScore += bonus;
        details.alignmentBonus = bonus;
        
        return {
          adjustedScore,
          bonus,
          isCounterTrend: false,
          details
        };
      }
      
      // Verifica limite diário de sinais contra-tendência
      if (this.counterTrendToday >= TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY) {
        console.log(`❌ [${symbol}] Limite diário de sinais contra-tendência atingido (${this.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY})`);
        return {
          adjustedScore: 0,
          bonus: 0,
          isCounterTrend: false,
          details: { rejected: true, reason: 'Limite diário atingido' }
        };
      }
      
      // Verifica cooldown entre sinais contra-tendência
      const timeSinceLastCounter = Date.now() - this.lastCounterTrendTime;
      if (timeSinceLastCounter < TRADING_CONFIG.COUNTER_TREND.COUNTER_TREND_COOLDOWN) {
        const remainingTime = Math.ceil((TRADING_CONFIG.COUNTER_TREND.COUNTER_TREND_COOLDOWN - timeSinceLastCounter) / (60 * 1000));
        console.log(`⏳ [${symbol}] Cooldown ativo - aguarde ${remainingTime} minutos`);
        return {
          adjustedScore: 0,
          bonus: 0,
          isCounterTrend: false,
          details: { rejected: true, reason: `Cooldown ativo (${remainingTime}m)` }
        };
      }
      
      isCounterTrend = true;
      details.type = 'counter_trend';
      details.btcTrend = btcTrend;
      details.btcStrength = btcStrength;
      
      // Calcula força de reversão necessária
      const reversalStrength = this.calculateReversalStrength(indicators, patterns);
      console.log(`🔄 [${symbol}] Força de reversão: ${reversalStrength.toFixed(1)}/100`);
      
      // Verifica se a reversão é forte o suficiente
      if (reversalStrength < TRADING_CONFIG.COUNTER_TREND.MIN_REVERSAL_STRENGTH) {
        console.log(`❌ [${symbol}] Reversão fraca: ${reversalStrength.toFixed(1)} < ${TRADING_CONFIG.COUNTER_TREND.MIN_REVERSAL_STRENGTH}`);
        return {
          adjustedScore: 0,
          bonus: 0,
          isCounterTrend: false,
          details: { rejected: true, reason: `Reversão fraca (${reversalStrength.toFixed(1)})` }
        };
      }
      
      // Aplica ajustes baseados na força da reversão
      if (reversalStrength >= TRADING_CONFIG.COUNTER_TREND.EXTREME_REVERSAL_THRESHOLD) {
        // Reversão extrema (≥65%)
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL;
        bonus = adjustedScore * 0.4;
        details.reversalType = 'EXTREME';
        console.log(`🔥 [${symbol}] REVERSÃO EXTREMA: ${reversalStrength.toFixed(1)}% - Bônus ${TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL}x`);
      } else if (reversalStrength >= 55) {
        // Reversão forte (55-64%)
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL;
        bonus = adjustedScore * 0.3;
        details.reversalType = 'STRONG';
        console.log(`💪 [${symbol}] REVERSÃO FORTE: ${reversalStrength.toFixed(1)}% - Bônus ${TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL}x`);
      } else {
        // Reversão moderada (45-54%)
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.PENALTY_WEAK_REVERSAL;
        bonus = -adjustedScore * 0.2;
        details.reversalType = 'MODERATE';
        console.log(`⚠️ [${symbol}] REVERSÃO MODERADA: ${reversalStrength.toFixed(1)}% - Penalidade ${TRADING_CONFIG.COUNTER_TREND.PENALTY_WEAK_REVERSAL}x`);
      }
      
      // Bônus para timeframes de curto prazo (mais sensíveis a reversões)
      if (TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_TIMEFRAMES.includes(this.currentTimeframe)) {
        const shortTermBonus = adjustedScore * (TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_BONUS - 1);
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_BONUS;
        bonus += shortTermBonus;
        details.shortTermBonus = shortTermBonus;
        console.log(`⚡ [${symbol}] Bônus timeframe curto (${this.currentTimeframe}): +${shortTermBonus.toFixed(1)}`);
      }
      
      // Verifica RSI extremo para timeframes curtos
      if (indicators.rsi && TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_TIMEFRAMES.includes(this.currentTimeframe)) {
        const isExtremeRSI = indicators.rsi <= TRADING_CONFIG.COUNTER_TREND.MIN_SHORT_TERM_RSI_EXTREME || 
                            indicators.rsi >= TRADING_CONFIG.COUNTER_TREND.MAX_SHORT_TERM_RSI_EXTREME;
        
        if (isExtremeRSI) {
          const rsiBonus = 15;
          adjustedScore += rsiBonus;
          bonus += rsiBonus;
          details.extremeRSI = { value: indicators.rsi, bonus: rsiBonus };
          console.log(`🎯 [${symbol}] RSI EXTREMO (${indicators.rsi.toFixed(2)}): +${rsiBonus} pontos`);
        }
      }
      
      // Verifica volume spike (confirmação importante para contra-tendência)
      if (TRADING_CONFIG.COUNTER_TREND.REQUIRE_VOLUME_SPIKE && indicators.volume) {
        const volumeRatio = indicators.volume.volumeRatio || 1;
        if (volumeRatio >= TRADING_CONFIG.COUNTER_TREND.MIN_VOLUME_SPIKE) {
          const volumeBonus = 10;
          adjustedScore += volumeBonus;
          bonus += volumeBonus;
          details.volumeSpike = { ratio: volumeRatio, bonus: volumeBonus };
          console.log(`📊 [${symbol}] VOLUME SPIKE (${volumeRatio.toFixed(2)}x): +${volumeBonus} pontos`);
        } else {
          console.log(`❌ [${symbol}] Volume insuficiente para contra-tendência: ${volumeRatio.toFixed(2)}x < ${TRADING_CONFIG.COUNTER_TREND.MIN_VOLUME_SPIKE}x`);
          return {
            adjustedScore: 0,
            bonus: 0,
            isCounterTrend: false,
            details: { rejected: true, reason: `Volume insuficiente (${volumeRatio.toFixed(2)}x)` }
          };
        }
      }
      
      // Bônus para divergências (muito importante em reversões)
      // Divergência RSI - REMOVIDO (causava erros)
      // Sistema funciona sem divergências
      
      // Bônus para padrões de reversão
      if (patterns.candlestick && patterns.candlestick.some(p => 
          ['HAMMER', 'HANGING_MAN', 'BULLISH_ENGULFING', 'BEARISH_ENGULFING', 'DOJI'].includes(p.type))) {
        const patternBonus = TRADING_CONFIG.COUNTER_TREND.PATTERN_REVERSAL_BONUS;
        adjustedScore += patternBonus;
        bonus += patternBonus;
        details.reversalPatternBonus = patternBonus;
        console.log(`🕯️ [${symbol}] PADRÃO DE REVERSÃO: +${patternBonus} pontos`);
      }
      
      // Bônus para breakout lateral (rompimento de consolidação)
      if (patterns.breakout && this.isSidewaysBreakout(patterns, indicators)) {
        const sidewaysBonus = adjustedScore * (TRADING_CONFIG.COUNTER_TREND.SIDEWAYS_BREAKOUT_BONUS - 1);
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.SIDEWAYS_BREAKOUT_BONUS;
        bonus += sidewaysBonus;
        details.sidewaysBreakout = sidewaysBonus;
        console.log(`📈 [${symbol}] BREAKOUT LATERAL: +${sidewaysBonus.toFixed(1)} pontos`);
      }
      
      // Registra sinal contra-tendência se aprovado
      if (adjustedScore >= TRADING_CONFIG.MIN_SIGNAL_PROBABILITY) {
        this.counterTrendToday++;
        this.lastCounterTrendTime = Date.now();
        console.log(`✅ [${symbol}] SINAL CONTRA-TENDÊNCIA APROVADO (${this.counterTrendToday}/${TRADING_CONFIG.COUNTER_TREND.MAX_COUNTER_TREND_PER_DAY} hoje)`);
      }
      
      details.reversalStrength = reversalStrength;
      details.counterTrendCount = this.counterTrendToday;
    }

    return {
      adjustedScore,
      bonus,
      isCounterTrend,
      details
    };
  }

  /**
   * Reset completo do sistema adaptativo
   */
  resetAdaptiveSystem() {
    this.initializeIndicatorPerformance();
    this.symbolPerformance.clear();
    this.symbolBlacklist.clear();
    this.marketRegime = 'NORMAL';
    console.log('🔄 Sistema adaptativo resetado');
  }

  /**
   * Calcula força de reversão baseada em múltiplos indicadores
   */
  calculateReversalStrength(indicators, patterns) {
    let strength = 0;
    const factors = [];
    
    // RSI extremo (peso 30%)
    if (indicators.rsi !== undefined) {
      if (indicators.rsi <= 20) {
        strength += 30;
        factors.push(`RSI sobrevenda extrema (${indicators.rsi.toFixed(2)})`);
      } else if (indicators.rsi <= 30) {
        strength += 20;
        factors.push(`RSI sobrevenda (${indicators.rsi.toFixed(2)})`);
      } else if (indicators.rsi >= 80) {
        strength += 30;
        factors.push(`RSI sobrecompra extrema (${indicators.rsi.toFixed(2)})`);
      } else if (indicators.rsi >= 70) {
        strength += 20;
        factors.push(`RSI sobrecompra (${indicators.rsi.toFixed(2)})`);
      }
    }
    
    // MACD divergência ou cruzamento forte (peso 25%)
    if (indicators.macd && indicators.macd.histogram !== undefined) {
      const macdStrength = Math.abs(indicators.macd.histogram) * 1000000;
      if (macdStrength > 10) {
        strength += 25;
        factors.push(`MACD forte (${macdStrength.toFixed(2)})`);
      } else if (macdStrength > 5) {
        strength += 15;
        factors.push(`MACD moderado (${macdStrength.toFixed(2)})`);
      }
    }
    
    // Divergência RSI (peso 20%)
    if (indicators.rsiDivergence) {
      strength += 20;
      factors.push('Divergência RSI detectada');
    }
    
    // Padrões de reversão (peso 15%)
    if (patterns.candlestick) {
      const reversalPatterns = patterns.candlestick.filter(p => 
        ['HAMMER', 'HANGING_MAN', 'BULLISH_ENGULFING', 'BEARISH_ENGULFING', 'DOJI'].includes(p.type)
      );
      if (reversalPatterns.length > 0) {
        strength += 15;
        factors.push(`Padrão de reversão (${reversalPatterns[0].type})`);
      }
    }
    
    // Volume confirmação (peso 10%)
    if (indicators.volume && indicators.volume.volumeRatio > 1.5) {
      strength += 10;
      factors.push(`Volume alto (${indicators.volume.volumeRatio.toFixed(2)}x)`);
    }
    
    console.log(`🔄 Fatores de reversão: ${factors.join(', ')}`);
    return Math.min(100, strength);
  }
  
  /**
   * Verifica se é um breakout lateral (consolidação)
   */
  isSidewaysBreakout(patterns, indicators) {
    // Verifica se o mercado estava em consolidação antes do breakout
    if (!patterns.breakout) return false;
    
    // RSI próximo ao centro indica consolidação
    const rsiNeutral = indicators.rsi && indicators.rsi > 40 && indicators.rsi < 60;
    
    // Médias móveis próximas indicam consolidação
    const maFlat = indicators.ma21 && indicators.ma200 && 
                   Math.abs(indicators.ma21 - indicators.ma200) / indicators.ma200 < 0.02;
    
    return rsiNeutral || maFlat;
  }
}

export default AdaptiveScoringService;