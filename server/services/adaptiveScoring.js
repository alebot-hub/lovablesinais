/**
 * Sistema de Scoring Dinâmico e Adaptativo
 */

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
   * Calcula score adaptativo baseado na performance histórica
   */
  calculateAdaptiveScore(data, indicators, patterns, mlProbability, marketTrend = null, symbol, bitcoinCorrelation = null) {
    // Reset contador diário se mudou o dia
    const today = new Date().toDateString();
    if (this.todayDate !== today) {
      this.counterTrendToday = 0;
      this.todayDate = today;
      console.log('🔄 Reset contador de sinais contra-tendência diário');
    }
    
    // Verifica blacklist
    if (this.isSymbolBlacklisted(symbol)) {
      console.log(`🚫 ${symbol} está na blacklist`);
      return {
        totalScore: 0,
        details: { blacklisted: true },
        isValid: false,
        adaptiveAdjustments: { blacklisted: true }
      };
    }

    // Detecta regime de mercado atual
    this.updateMarketRegime(indicators, patterns);

    // Calcula score base
    const baseScore = this.calculateBaseScore(data, indicators, patterns, mlProbability, bitcoinCorrelation);
    console.log(`📊 [${symbol}] Score base: ${baseScore.total}`);

    // Aplica ajustes adaptativos
    const adaptiveAdjustments = this.applyAdaptiveAdjustments(baseScore, symbol);
    console.log(`🔄 [${symbol}] Ajustes adaptativos:`, adaptiveAdjustments);

    // Aplica ajustes por regime de mercado
    const regimeAdjustments = this.applyMarketRegimeAdjustments(adaptiveAdjustments);
    console.log(`📈 [${symbol}] Ajustes de regime:`, regimeAdjustments);

    // Score final com limites
    const finalScore = Math.min(Math.max(regimeAdjustments.adjustedScore, 0), 100);
    
    // Determina se é válido (threshold ajustado para mercado bear)
    const minScore = marketTrend === 'BEARISH' ? 55 : 60; // Reduz threshold em mercado bear
    const isValid = finalScore >= minScore;

    // Log detalhado
    console.log(`🎯 [${symbol}] Score final: ${finalScore.toFixed(1)}% (${isValid ? 'VÁLIDO' : 'INVÁLIDO'})`, {
      baseScore: baseScore.total,
      adaptiveAdjustments: adaptiveAdjustments.adjustedScore - baseScore.total,
      regimeAdjustments: regimeAdjustments.adjustedScore - adaptiveAdjustments.adjustedScore,
      finalScore,
      minRequired: minScore
    });

    return {
      totalScore: finalScore,
      details: {
        baseScore: baseScore.total,
        adaptiveAdjustments: adaptiveAdjustments.details,
        regimeAdjustments: regimeAdjustments.details,
        marketRegime: this.marketRegime,
        symbolPerformance: this.getSymbolStats(symbol)
      },
      isValid: isValid,
      adaptiveAdjustments: {
        applied: true,
        weightAdjustments: adaptiveAdjustments.weightChanges,
        regimeBonus: regimeAdjustments.bonus
      }
    };
  }

  /**
   * Calcula score base usando pesos atuais
   */
  calculateBaseScore(data, indicators, patterns, mlProbability, bitcoinCorrelation = null) {
    let total = 0;
    const details = {};

    // RSI
    if (indicators.rsi !== null && indicators.rsi !== undefined) {
      if (indicators.rsi < 25) {
        const score = this.weights.RSI_OVERSOLD;
        total += score;
        details.rsi = { value: indicators.rsi, score, reason: 'Sobrevendido' };
        this.recordIndicatorUsage('RSI_OVERSOLD', score);
      } else if (indicators.rsi > 85) {
        const score = this.weights.RSI_OVERBOUGHT;
        total += score;
        details.rsi = { value: indicators.rsi, score, reason: 'Sobrecomprado' };
        this.recordIndicatorUsage('RSI_OVERBOUGHT', score);
      }
    }

    // MACD
    if (indicators.macd && indicators.macd.MACD !== null && indicators.macd.signal !== null) {
      if (indicators.macd.MACD > indicators.macd.signal) {
        const score = this.weights.MACD_BULLISH;
        total += score;
        details.macd = { score, reason: 'Cruzamento bullish' };
        this.recordIndicatorUsage('MACD_BULLISH', score);
      } else {
        const score = this.weights.MACD_BEARISH;
        total += score;
        details.macd = { score, reason: 'Cruzamento bearish' };
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
    const mlScore = mlProbability * this.weights.ML_WEIGHT * 100;
    total += mlScore;
    details.machineLearning = mlScore;
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
        // Em mercado de alta, favorece sinais de compra
        if (adjustedScore > 0) {
          bonus = adjustedScore * 0.15; // +15% para sinais bullish
          adjustedScore += bonus;
          details.bullMarketBonus = bonus;
        }
        break;

      case 'BEAR':
        // Em mercado de baixa, favorece sinais de venda
        if (adjustedScore > 0) {
          bonus = adjustedScore * 0.15; // +15% para sinais em mercado bear
          adjustedScore += bonus;
          details.bearMarketBonus = bonus;
        }
        break;

      case 'VOLATILE':
        // Em mercado volátil, reduz threshold
        if (adjustedScore >= 30) {
          bonus = 10;
          adjustedScore += bonus;
          details.volatileMarketBonus = bonus;
        }
        break;

      case 'NORMAL':
      default:
        // Pequeno bônus para manter sinais fluindo
        if (adjustedScore > 20) {
          bonus = 5;
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
    } else if (bearishSignals > bullishSignals + 1) {
      this.marketRegime = 'BEAR';
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
   * Reset completo do sistema adaptativo
   */
  resetAdaptiveSystem() {
    this.initializeIndicatorPerformance();
    this.symbolPerformance.clear();
    this.symbolBlacklist.clear();
    this.marketRegime = 'NORMAL';
    console.log('🔄 Sistema adaptativo resetado');
  }
}

export default AdaptiveScoringService;