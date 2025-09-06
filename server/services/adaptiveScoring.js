/**
 * Sistema de Scoring Dinâmico e Adaptativo (revisto)
 * - Mantém compatibilidade com o sistema atual
 * - Cálculos mais robustos (checagens numéricas e volume fallback)
 * - Variações determinísticas (jitter opcional via config)
 * - Ajustes claros por regime e correlação com BTC
 * - Atualiza lastSignalTime quando sinal é válido (para threshold dinâmico)
 */

import { TRADING_CONFIG } from '../config/constants.js';

const DEFAULTS = {
  // Controle de "ruído": 0 = determinístico
  JITTER_PCT: TRADING_CONFIG?.SCORING?.JITTER_PCT ?? 0,

  // Volume: se TA não prover volumeMA, calculamos com N candles
  VOLUME_MA_PERIOD: TRADING_CONFIG?.SCORING?.VOLUME_MA_PERIOD ?? 20,

  // Thresholds dinâmicos (fallbacks)
  DYN_THRESH: {
    DEFAULT: TRADING_CONFIG?.MIN_SIGNAL_PROBABILITY ?? 70,
    AFTER_90M: TRADING_CONFIG?.SCORING?.THRESH_AFTER_90M ?? 60,
    AFTER_120M: TRADING_CONFIG?.SCORING?.THRESH_AFTER_120M ?? 50
  }
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function isNum(v) { return Number.isFinite(v); }

class AdaptiveScoringService {
  constructor() {
    // Pesos iniciais dos indicadores (mantidos)
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
      ML_WEIGHT: 0.25,
      // evita undefined em relatórios/track de correlação BTC
      BITCOIN_CORRELATION: 0
    };

    // Tracking
    this.indicatorPerformance = {};
    this.symbolPerformance = new Map();
    this.symbolBlacklist = new Map();

    // Estado de mercado e sinal
    this.marketRegime = 'NORMAL'; // BULL, BEAR, NORMAL, VOLATILE
    this.currentTimeframe = '1h';
    this.currentSignalTrend = 'NEUTRAL';

    // Controle contra-tendência
    this.counterTrendToday = 0;
    this.lastCounterTrendTime = 0;
    this.todayDate = new Date().toDateString();
    this.lastSignalTime = 0;

    // Configurações internas
    this.config = {
      minTradesForAdjustment: 10,
      adjustmentFactor: 0.1,
      blacklistThreshold: 0.3, // 30% win rate
      blacklistDuration: 24 * 60 * 60 * 1000, // 24h
      performanceWindow: 50
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
   * (Mantido por compatibilidade) Variações realistas – agora determinísticas com jitter opcional.
   * Não é chamada no fluxo principal, mas deixada para uso externo se necessário.
   */
  calculateRealisticVariations(indicators, patterns, mlProbability, confirmations, strengthFactors, symbol) {
    let total = 0;
    const details = {};

    // Sementes determinísticas a partir do símbolo
    const symbolHash = this.getSymbolHash(String(symbol || 'UNKNOWN'));
    const baseSeed = symbolHash % 10000;

    const pick = (span) => {
      // valor pseudo-determinístico em [0,1) baseado no hash
      const v = ((baseSeed * 2654435761) % 2**32) / 2**32;
      return v * span;
    };

    // RSI
    if (isNum(indicators?.rsi)) {
      const rsiExtreme = Math.min(indicators.rsi, 100 - indicators.rsi);
      if (rsiExtreme < 15) {
        const det = pick(3); // 0..3
        total += 8 + (15 - rsiExtreme) * 0.4 + det; // 8–17
        details.rsiExtreme = true;
      } else if (rsiExtreme < 25) {
        const det = pick(2); // 0..2
        total += 3 + (25 - rsiExtreme) * 0.3 + det; // 3–8
        details.rsiModerate = true;
      }
    }

    // MACD
    if (isNum(indicators?.macd?.histogram)) {
      const macdStrength = Math.abs(indicators.macd.histogram) * 1e6;
      if (macdStrength > 10) {
        total += 5 + Math.min(8, macdStrength * 0.3) + pick(4); // 5–17
        details.macdStrong = true;
      } else if (macdStrength > 1) {
        total += 2 + macdStrength * 0.5 + pick(3); // 2–10
        details.macdModerate = true;
      }
    }

    // Padrões
    if (patterns?.breakout) {
      total += 4 + pick(6); // 4–10
      details.breakout = true;
    }
    if (Array.isArray(patterns?.candlestick) && patterns.candlestick.length > 0) {
      total += 2 + pick(5); // 2–7
      details.candlestick = true;
    }

    // Timeframe
    const tfBonus = { '5m': -2 + pick(1), '15m': -1 + pick(3), '1h': 0 + pick(5), '4h': 2 + pick(6), '1d': 4 + pick(7) };
    const tfVariation = tfBonus[this.currentTimeframe] ?? 0;
    total += tfVariation;
    details.timeframe = tfVariation;

    // Confirmações
    if (confirmations >= 4) total += 6 + pick(4); // 6–10
    else if (confirmations === 3) total += 3 + pick(3); // 3–6
    else if (confirmations <= 1) total -= 2 + pick(3); // -2..-5

    // ML
    if (isNum(mlProbability) && mlProbability > 0.7) total += 3 + (mlProbability - 0.7) * 10 + pick(2);
    else if (isNum(mlProbability) && mlProbability < 0.3) total -= 2 + (0.3 - mlProbability) * 8 + pick(1);

    // Variação única final (determinística)
    const uniqueVariation = ( (baseSeed % 1000) / 1000 * 5 +   // 0..5
                              (baseSeed % 500) / 500 * 3 +     // 0..3
                              ((baseSeed * 131) % 200) / 200 * 2 - 1 ); // -1..+1
    total += uniqueVariation;
    details.uniqueVariation = uniqueVariation;

    // Jitter opcional
    if (DEFAULTS.JITTER_PCT > 0) {
      const jitter = (Math.random() * 2 - 1) * (DEFAULTS.JITTER_PCT * Math.abs(total));
      total += jitter;
      details.jitter = jitter;
    }

    return { total, details };
  }

  /**
   * (Mantido por compatibilidade) Garante um score único – agora respeitando limites e jitter opcional.
   */
  ensureUniqueScore(score, symbol) {
    const symbolHash = this.getSymbolHash(String(symbol || 'UNKNOWN'));
    const uniq = ((symbolHash % 10000) / 10000) * 8 - 4; // -4..+4
    const nowDet = ((symbolHash * 97) % 7919) / 7919 * 6 - 3; // -3..+3
    const symDet = ((symbolHash % 1009) / 1009) * 4 - 2; // -2..+2

    let finalScore = score + uniq + nowDet + symDet;

    if (DEFAULTS.JITTER_PCT > 0) {
      const jitter = (Math.random() * 2 - 1) * (DEFAULTS.JITTER_PCT * Math.abs(finalScore));
      finalScore += jitter;
    }

    finalScore = Math.round(finalScore * 1000) / 1000;
    return clamp(finalScore, 0, 100);
  }

  /**
   * Hash simples para símbolo/strings
   */
  getSymbolHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Entrada principal – calcula score adaptativo
   */
  calculateAdaptiveScore(data, indicators, patterns, mlProbability, marketTrend = null, symbol, bitcoinCorrelation = null) {
    const logPrefix = `[${symbol || 'UNKNOWN'}]`;
    console.log(`${logPrefix} 🎯 Iniciando cálculo de score adaptativo...`);

    // Reset diário
    const today = new Date().toDateString();
    if (this.todayDate !== today) {
      this.counterTrendToday = 0;
      this.todayDate = today;
      console.log('🔄 Reset contador de sinais contra-tendência diário');
    }

    // Blacklist
    if (this.isSymbolBlacklisted(symbol)) {
      console.log(`${logPrefix} 🚫 Símbolo está na blacklist`);
      return {
        totalScore: 0,
        details: { blacklisted: true },
        isValid: false,
        adaptiveAdjustments: { blacklisted: true }
      };
    }

    // Regime
    this.updateMarketRegime(indicators, patterns);

    // Score base (determinístico, robusto)
    const baseScore = this.calculateBaseScore(data, indicators, patterns, mlProbability, bitcoinCorrelation);
    console.log(`${logPrefix} 📊 Score base: ${baseScore.total.toFixed(2)}`);

    // Ajustes adaptativos (repondera pesos com histórico)
    const adaptiveAdjustments = this.applyAdaptiveAdjustments(baseScore, symbol);
    console.log(`${logPrefix} 🔄 Ajustes adaptativos: ${adaptiveAdjustments.adjustedScore.toFixed(2)}`);

    // Regime de mercado
    const regimeAdjustments = this.applyMarketRegimeAdjustments(adaptiveAdjustments);
    console.log(`${logPrefix} 📈 Ajustes de regime: ${regimeAdjustments.adjustedScore.toFixed(2)}`);

    // Contra-tendência (usa TRADING_CONFIG.COUNTER_TREND)
    const counterTrendAdjustments = this.applyCounterTrendLogic(
      data, // ✅ passa os dados para cálculo de volume spike corretamente
      regimeAdjustments,
      symbol,
      indicators,
      patterns,
      bitcoinCorrelation
    );
    console.log(`${logPrefix} ⚡ Ajustes contra-tendência: ${counterTrendAdjustments.adjustedScore.toFixed(2)}`);

    // Threshold dinâmico
    const dynamicThreshold = this.calculateDynamicThreshold();
    let finalScore = clamp(counterTrendAdjustments.adjustedScore, 0, 100);
    const isValid = finalScore >= dynamicThreshold;

    console.log(`🎯 [${symbol || 'UNKNOWN'}] SCORE FINAL: ${finalScore.toFixed(1)}/${dynamicThreshold}`);

    const logPrefix2 = isValid ? '✅ SINAL VÁLIDO' : '❌ SINAL INVÁLIDO';
    console.log(`${logPrefix2} 📊 Detalhes: Base=${baseScore.total.toFixed(1)}, Regime=${this.marketRegime}`);

    if (!isValid) {
      const missingPoints = (dynamicThreshold - finalScore).toFixed(1);
      console.log(`❌ [${symbol || 'UNKNOWN'}] Insuficiente: ${finalScore.toFixed(1)} < ${dynamicThreshold} (faltam ${missingPoints})`);
    } else {
      // Atualiza lastSignalTime para o threshold dinâmico funcionar corretamente
      this.lastSignalTime = Date.now();
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
      isValid,
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
   * Calcula score base – robusto a dados ausentes e determinístico
   */
  calculateBaseScore(data, indicators, patterns, mlProbability, bitcoinCorrelation = null) {
    let total = 0;
    const details = {};

    // ===== VARIAÇÃO BASE (determinística + jitter opcional) =====
    const symbolHash = this.getSymbolHash(String(data?.symbol || 'UNKNOWN'));
    let baseVariation = (((symbolHash % 10000) / 10000) * 10) - 5; // -5..+5 determinístico
    if (DEFAULTS.JITTER_PCT > 0) {
      baseVariation += (Math.random() * 2 - 1) * (DEFAULTS.JITTER_PCT * 10);
    }
    total += baseVariation;
    details.baseVariation = baseVariation;

    // ===== RSI =====
    if (isNum(indicators?.rsi)) {
      if (indicators.rsi < 30) {
        const rsiVar = (30 - indicators.rsi) * 0.5;
        const score = this.weights.RSI_OVERSOLD + rsiVar;
        total += score;
        details.rsi = { value: indicators.rsi, score, reason: 'Sobrevendido' };
        this.recordIndicatorUsage('RSI_OVERSOLD', score);
      } else if (indicators.rsi > 70) {
        const rsiVar = (indicators.rsi - 70) * 0.5;
        const score = Math.abs(this.weights.RSI_OVERBOUGHT) + rsiVar; // positivo p/ venda
        total += score;
        details.rsi = { value: indicators.rsi, score, reason: 'Sobrecomprado' };
        this.recordIndicatorUsage('RSI_OVERBOUGHT', score);
      }
    }

    // ===== MACD (usa campos corretos: MACD, signal, histogram) =====
    if (indicators?.macd && isNum(indicators.macd.MACD) && isNum(indicators.macd.signal)) {
      const h = isNum(indicators.macd.histogram) ? Math.abs(indicators.macd.histogram) : 0;
      const macdStrength = h * 1e6;
      const strengthBonus = Math.min(10, macdStrength * 2);

      if (indicators.macd.MACD > indicators.macd.signal) {
        const score = this.weights.MACD_BULLISH + strengthBonus;
        total += score;
        details.macd = { score, reason: 'Cruzamento bullish', strength: macdStrength };
        this.recordIndicatorUsage('MACD_BULLISH', score);
      } else {
        const score = Math.abs(this.weights.MACD_BEARISH) + strengthBonus;
        total += score;
        details.macd = { score, reason: 'Cruzamento bearish', strength: macdStrength };
        this.recordIndicatorUsage('MACD_BEARISH', score);
      }
    }

    // ===== Ichimoku =====
    if (indicators?.ichimoku && isNum(indicators.ichimoku.conversionLine) && isNum(indicators.ichimoku.baseLine)) {
      if (indicators.ichimoku.conversionLine > indicators.ichimoku.baseLine) {
        const score = this.weights.ICHIMOKU_BULLISH;
        total += score;
        details.ichimoku = { score, reason: 'Sinal bullish' };
        this.recordIndicatorUsage('ICHIMOKU_BULLISH', score);
      }
    }

    // ===== Divergência RSI (mantido por compatibilidade – apenas pontua se vier pronto) =====
    if (indicators?.rsiDivergence) {
      const score = this.weights.RSI_DIVERGENCE;
      total += score;
      details.rsiDivergence = { score, reason: 'Divergência detectada' };
      this.recordIndicatorUsage('RSI_DIVERGENCE', score);
    }

    // ===== Médias móveis =====
    if (isNum(indicators?.ma21) && isNum(indicators?.ma200) && indicators.ma21 > indicators.ma200) {
      const score = this.weights.MA_BULLISH;
      total += score;
      details.movingAverages = { score, reason: 'MA21 > MA200' };
      this.recordIndicatorUsage('MA_BULLISH', score);
    }

    // ===== Padrões =====
    if (patterns?.breakout && patterns.breakout.type === 'BULLISH_BREAKOUT') {
      const score = this.weights.PATTERN_BREAKOUT;
      total += score;
      details.breakout = { score, reason: 'Rompimento bullish' };
      this.recordIndicatorUsage('PATTERN_BREAKOUT', score);
    }

    // ===== Volume (robusto) =====
    const volFeat = this._ensureVolumeFeatures(data, indicators);
    if (volFeat.currentVolume > volFeat.volumeMA * 1.5 && volFeat.volumeMA > 0) {
      const score = this.weights.VOLUME_CONFIRMATION;
      total += score;
      details.volume = { score, reason: 'Volume alto', ratio: volFeat.currentVolume / volFeat.volumeMA };
      this.recordIndicatorUsage('VOLUME_CONFIRMATION', score);
    }

    // ===== Machine Learning (determinístico + jitter opcional) =====
    const mlProb = isNum(mlProbability) ? clamp(mlProbability, 0, 1) : 0;
    const mlDet = ((symbolHash * 7) % 500) / 500 * 5; // 0..5 determinístico
    let mlScore = mlProb * this.weights.ML_WEIGHT * 100 + mlDet;
    if (DEFAULTS.JITTER_PCT > 0) {
      mlScore += (Math.random() * 2 - 1) * (DEFAULTS.JITTER_PCT * mlScore);
    }
    total += mlScore;
    details.machineLearning = { score: mlScore, probability: mlProb, variation: mlDet };
    this.recordIndicatorUsage('ML_WEIGHT', mlScore);

    // ===== Correlação BTC (mantido) =====
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
   * Ajustes adaptativos com base na performance histórica
   */
  applyAdaptiveAdjustments(baseScore, symbol) {
    let adjustedScore = baseScore.total;
    const details = {};
    const weightChanges = {};

    // Performance do símbolo
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

    // Reponderação de pesos por desempenho dos indicadores
    Object.keys(this.indicatorPerformance).forEach(indicator => {
      const perf = this.indicatorPerformance[indicator];
      if (perf.trades >= this.config.minTradesForAdjustment) {
        const adjustment = (perf.winRate - 0.5) * this.config.adjustmentFactor;
        const oldWeight = this.weights[indicator];
        if (isNum(oldWeight)) {
          this.weights[indicator] = oldWeight * (1 + adjustment);
          if (Math.abs(adjustment) > 0.05) {
            weightChanges[indicator] = {
              oldWeight,
              newWeight: this.weights[indicator],
              adjustment: adjustment * 100
            };
          }
        }
      }
    });

    return { adjustedScore, details, weightChanges };
  }

  /**
   * Ajustes por regime de mercado
   */
  applyMarketRegimeAdjustments(scoreData) {
    let adjustedScore = scoreData.adjustedScore;
    let bonus = 0;
    const details = { regime: this.marketRegime };

    switch (this.marketRegime) {
      case 'BULL': {
        const isBullishSignal = this.isCurrentSignalBullish();
        if (isBullishSignal) {
          bonus = adjustedScore * 0.20;
          details.bullMarketBonus = bonus;
        } else {
          bonus = -adjustedScore * 0.15;
          details.bullMarketPenalty = bonus;
        }
        adjustedScore += bonus;
        break;
      }
      case 'BEAR': {
        const isBearishSignal = this.isCurrentSignalBearish();
        if (isBearishSignal) {
          bonus = adjustedScore * 0.25;
          details.bearMarketBonus = bonus;
        } else {
          bonus = -adjustedScore * 0.20;
          details.bearMarketPenalty = bonus;
        }
        adjustedScore += bonus;
        break;
      }
      case 'VOLATILE': {
        if (adjustedScore >= 30) {
          bonus = 12;
          adjustedScore += bonus;
          details.volatileMarketBonus = bonus;
        }
        break;
      }
      case 'NORMAL':
      default: {
        if (adjustedScore > 20) {
          bonus = 8;
          adjustedScore += bonus;
          details.normalMarketBonus = bonus;
        }
      }
    }

    return { adjustedScore, bonus, details };
  }

  isCurrentSignalBullish() { return this.currentSignalTrend === 'BULLISH'; }
  isCurrentSignalBearish() { return this.currentSignalTrend === 'BEARISH'; }
  setCurrentSignalTrend(trend) {
    this.currentSignalTrend = trend;
    return this.currentSignalTrend;
  }
  setCurrentTimeframe(tf) {
    this.currentTimeframe = tf;
    console.log(`[AdaptiveScoring] Timeframe atual: ${tf}`);
    return this.currentTimeframe;
  }

  /**
   * Atualiza regime de mercado (checagens numéricas seguras)
   */
  updateMarketRegime(indicators, patterns) {
    let bullishSignals = 0;
    let bearishSignals = 0;
    let volatilitySignals = 0;

    if (isNum(indicators?.ma21) && isNum(indicators?.ma200) && indicators.ma200 !== 0) {
      if (indicators.ma21 > indicators.ma200 * 1.05) bullishSignals++;
      if (indicators.ma21 < indicators.ma200 * 0.95) bearishSignals++;
    }

    if (isNum(indicators?.rsi)) {
      if (indicators.rsi < 20 || indicators.rsi > 80) volatilitySignals++;
      if (indicators.rsi > 65) bullishSignals++;
      if (indicators.rsi < 35) bearishSignals++;
    }

    if (isNum(indicators?.macd?.MACD) && isNum(indicators?.macd?.signal)) {
      if (indicators.macd.MACD > indicators.macd.signal) bullishSignals++;
      else bearishSignals++;
    }

    if (patterns?.breakout) volatilitySignals++;

    if (volatilitySignals >= 2) this.marketRegime = 'VOLATILE';
    else if (bullishSignals > bearishSignals + 1) this.marketRegime = 'BULL';
    else if (bearishSignals > bullishSignals + 1) this.marketRegime = 'BEAR';
    else this.marketRegime = 'NORMAL';
  }

  /**
   * Tracking de indicadores
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
   * Registro de resultado de trade (aprendizado)
   */
  recordTradeResult(symbol, indicators, isWin, finalPnL) {
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

    const stats = this.symbolPerformance.get(symbol);
    stats.trades++;
    stats.totalPnL += (isNum(finalPnL) ? finalPnL : 0);
    stats.avgPnL = stats.totalPnL / stats.trades;
    stats.lastUpdate = Date.now();
    if (isWin) stats.wins++;
    stats.winRate = stats.wins / stats.trades;

    if (stats.trades >= 10 && stats.winRate < this.config.blacklistThreshold) {
      this.addToBlacklist(symbol, `Baixa performance: ${(stats.winRate * 100).toFixed(1)}%`);
    }

    // Atualiza win-rate por indicador (apenas os conhecidos)
    Object.keys(indicators || {}).forEach(ind => {
      if (!this.indicatorPerformance[ind]) return;
      if (isWin) this.indicatorPerformance[ind].wins++;
      this.indicatorPerformance[ind].winRate =
        this.indicatorPerformance[ind].wins / this.indicatorPerformance[ind].trades;
    });

    console.log(`📊 Resultado registrado: ${symbol} ${isWin ? '✅' : '❌'} (${(isNum(finalPnL) ? finalPnL : 0).toFixed(2)}%)`);
    console.log(`📈 Performance ${symbol}: ${stats.wins}/${stats.trades} (${(stats.winRate * 100).toFixed(1)}%)`);
  }

  addToBlacklist(symbol, reason) {
    this.symbolBlacklist.set(symbol, {
      reason,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.config.blacklistDuration
    });
    console.log(`🚫 ${symbol} adicionado à blacklist: ${reason}`);
  }
  isSymbolBlacklisted(symbol) {
    const entry = this.symbolBlacklist.get(symbol);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.symbolBlacklist.delete(symbol);
      console.log(`✅ ${symbol} removido da blacklist (expirou)`);
      return false;
    }
    return true;
  }
  getBlacklistedSymbols() {
    const out = [];
    this.symbolBlacklist.forEach((entry, symbol) => {
      if (Date.now() <= entry.expiresAt) {
        out.push({
          symbol,
          reason: entry.reason,
          expiresIn: Math.ceil((entry.expiresAt - Date.now()) / (1000 * 60 * 60))
        });
      }
    });
    return out;
  }
  removeFromBlacklist(symbol) {
    if (this.symbolBlacklist.has(symbol)) {
      this.symbolBlacklist.delete(symbol);
      console.log(`✅ ${symbol} removido manualmente da blacklist`);
      return true;
    }
    return false;
  }

  /**
   * Threshold dinâmico baseado no tempo desde o último sinal válido
   */
  calculateDynamicThreshold() {
    const now = Date.now();
    const timeSince = this.lastSignalTime ? now - this.lastSignalTime : (2 * 60 * 60 * 1000); // default: 2h
    const hours = timeSince / (60 * 60 * 1000);

    if (hours >= 2) return DEFAULTS.DYN_THRESH.AFTER_120M; // mais permissivo
    if (hours >= 1.5) return DEFAULTS.DYN_THRESH.AFTER_90M;
    return DEFAULTS.DYN_THRESH.DEFAULT;
  }

  /**
   * Lógica para sinais contra-tendência (usa TRADING_CONFIG.COUNTER_TREND)
   * (assinatura ajustada para receber `data` e calcular corretamente o volume spike)
   */
  applyCounterTrendLogic(data, scoreData, symbol, indicators, patterns, bitcoinCorrelation) {
    let adjustedScore = scoreData.adjustedScore;
    let bonus = 0;
    let isCounterTrend = false;
    const details = { type: 'normal' };

    if (bitcoinCorrelation && bitcoinCorrelation.alignment === 'AGAINST') {
      const btcStrength = bitcoinCorrelation.btcStrength || 0;
      const btcTrend = bitcoinCorrelation.btcTrend;
      const currentSignalTrend = this.currentSignalTrend || 'NEUTRAL';

      console.log(`⚡ [${symbol}] SINAL CONTRA-TENDÊNCIA detectado:`);
      console.log(`   ₿ Bitcoin: ${btcTrend} (força: ${btcStrength})`);
      console.log(`   🎯 Sinal: ${currentSignalTrend}`);

      const isActuallyCounter = (
        (btcTrend === 'BULLISH' && currentSignalTrend === 'BEARISH') ||
        (btcTrend === 'BEARISH' && currentSignalTrend === 'BULLISH')
      );

      if (!isActuallyCounter) {
        console.log(`✅ [${symbol}] Alinhado com Bitcoin (${btcTrend} = ${currentSignalTrend})`);
        details.type = 'aligned';
        details.actualAlignment = 'ALIGNED';
        const alignBonus = adjustedScore * 0.15;
        adjustedScore += alignBonus;
        bonus += alignBonus;
        details.alignmentBonus = alignBonus;
        return { adjustedScore, bonus, isCounterTrend: false, details };
      }

      // Limite diário e cooldown
      if (this.counterTrendToday >= TRADING_CONFIG?.COUNTER_TREND?.MAX_COUNTER_TREND_PER_DAY) {
        console.log(`❌ [${symbol}] Limite diário de contra-tendência atingido`);
        return { adjustedScore: 0, bonus: 0, isCounterTrend: false, details: { rejected: true, reason: 'Limite diário' } };
      }
      const timeSinceLast = Date.now() - this.lastCounterTrendTime;
      if (timeSinceLast < (TRADING_CONFIG?.COUNTER_TREND?.COUNTER_TREND_COOLDOWN ?? 0)) {
        const remaining = Math.ceil(((TRADING_CONFIG.COUNTER_TREND.COUNTER_TREND_COOLDOWN - timeSinceLast) / (60 * 1000)));
        console.log(`⏳ [${symbol}] Cooldown ativo - aguarde ${remaining} minutos`);
        return { adjustedScore: 0, bonus: 0, isCounterTrend: false, details: { rejected: true, reason: `Cooldown (${remaining}m)` } };
      }

      isCounterTrend = true;
      details.type = 'counter_trend';
      details.btcTrend = btcTrend;
      details.btcStrength = btcStrength;

      // Força de reversão
      const reversalStrength = this.calculateReversalStrength(indicators, patterns);
      console.log(`🔄 [${symbol}] Força de reversão: ${reversalStrength.toFixed(1)}/100`);

      if (!isNum(TRADING_CONFIG?.COUNTER_TREND?.MIN_REVERSAL_STRENGTH) ||
          reversalStrength < TRADING_CONFIG.COUNTER_TREND.MIN_REVERSAL_STRENGTH) {
        console.log(`❌ [${symbol}] Reversão fraca: ${reversalStrength.toFixed(1)} < ${TRADING_CONFIG?.COUNTER_TREND?.MIN_REVERSAL_STRENGTH}`);
        return { adjustedScore: 0, bonus: 0, isCounterTrend: false, details: { rejected: true, reason: `Reversão fraca (${reversalStrength.toFixed(1)})` } };
      }

      // Multiplicadores por força
      if (isNum(TRADING_CONFIG?.COUNTER_TREND?.EXTREME_REVERSAL_THRESHOLD) &&
          reversalStrength >= TRADING_CONFIG.COUNTER_TREND.EXTREME_REVERSAL_THRESHOLD) {
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_EXTREME_REVERSAL;
        const b = adjustedScore * 0.4; bonus += b; details.reversalType = 'EXTREME';
        console.log(`🔥 [${symbol}] REVERSÃO EXTREMA: ${reversalStrength.toFixed(1)}%`);
      } else if (reversalStrength >= 55) {
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.BONUS_STRONG_REVERSAL;
        const b = adjustedScore * 0.3; bonus += b; details.reversalType = 'STRONG';
        console.log(`💪 [${symbol}] REVERSÃO FORTE: ${reversalStrength.toFixed(1)}%`);
      } else {
        adjustedScore *= TRADING_CONFIG.COUNTER_TREND.PENALTY_WEAK_REVERSAL;
        const b = -adjustedScore * 0.2; bonus += b; details.reversalType = 'MODERATE';
        console.log(`⚠️ [${symbol}] REVERSÃO MODERADA: ${reversalStrength.toFixed(1)}%`);
      }

      // Bônus por timeframe curto
      if (Array.isArray(TRADING_CONFIG?.COUNTER_TREND?.SHORT_TERM_TIMEFRAMES) &&
          TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_TIMEFRAMES.includes(this.currentTimeframe)) {
        const mult = TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_BONUS ?? 1;
        const inc = adjustedScore * (mult - 1);
        adjustedScore *= mult;
        bonus += inc;
        details.shortTermBonus = inc;
        console.log(`⚡ [${symbol}] Bônus timeframe curto (${this.currentTimeframe}): +${inc.toFixed(1)}`);
      }

      // RSI extremo (short-term)
      if (isNum(indicators?.rsi) &&
          Array.isArray(TRADING_CONFIG?.COUNTER_TREND?.SHORT_TERM_TIMEFRAMES) &&
          TRADING_CONFIG.COUNTER_TREND.SHORT_TERM_TIMEFRAMES.includes(this.currentTimeframe)) {
        const minE = TRADING_CONFIG.COUNTER_TREND.MIN_SHORT_TERM_RSI_EXTREME ?? 0;
        const maxE = TRADING_CONFIG.COUNTER_TREND.MAX_SHORT_TERM_RSI_EXTREME ?? 100;
        const isExtreme = (indicators.rsi <= minE) || (indicators.rsi >= maxE);
        if (isExtreme) {
          const rsiBonus = 15;
          adjustedScore += rsiBonus; bonus += rsiBonus;
          details.extremeRSI = { value: indicators.rsi, bonus: rsiBonus };
          console.log(`🎯 [${symbol}] RSI EXTREMO (${indicators.rsi.toFixed(2)}): +${rsiBonus} pontos`);
        }
      }

      // Volume spike obrigatório?
      if (TRADING_CONFIG?.COUNTER_TREND?.REQUIRE_VOLUME_SPIKE) {
        const volFeat = this._ensureVolumeFeatures(data, indicators);
        const ratio = (volFeat.volumeMA > 0) ? (volFeat.currentVolume / volFeat.volumeMA) : 0;
        const minSpike = TRADING_CONFIG.COUNTER_TREND.MIN_VOLUME_SPIKE ?? 1.0;
        if (ratio >= minSpike) {
          const vb = 10; adjustedScore += vb; bonus += vb;
          details.volumeSpike = { ratio, bonus: vb };
          console.log(`📊 [${symbol}] VOLUME SPIKE (${ratio.toFixed(2)}x): +${vb} pontos`);
        } else {
          console.log(`❌ [${symbol}] Volume insuficiente p/ contra-tendência: ${ratio.toFixed(2)}x < ${minSpike}x`);
          return { adjustedScore: 0, bonus: 0, isCounterTrend: false, details: { rejected: true, reason: `Volume insuficiente (${ratio.toFixed(2)}x)` } };
        }
      }

      // Padrões de reversão (candles)
      if (Array.isArray(patterns?.candlestick) && patterns.candlestick.some(p =>
        ['HAMMER', 'HANGING_MAN', 'BULLISH_ENGULFING', 'BEARISH_ENGULFING', 'DOJI'].includes(p.type))) {
        const pBonus = TRADING_CONFIG?.COUNTER_TREND?.PATTERN_REVERSAL_BONUS ?? 0;
        adjustedScore += pBonus; bonus += pBonus;
        details.reversalPatternBonus = pBonus;
        console.log(`🕯️ [${symbol}] PADRÃO DE REVERSÃO: +${pBonus} pontos`);
      }

      // Breakout lateral
      if (patterns?.breakout && this.isSidewaysBreakout(patterns, indicators)) {
        const mult = TRADING_CONFIG?.COUNTER_TREND?.SIDEWAYS_BREAKOUT_BONUS ?? 1;
        const inc = adjustedScore * (mult - 1);
        adjustedScore *= mult; bonus += inc; details.sidewaysBreakout = inc;
        console.log(`📈 [${symbol}] BREAKOUT LATERAL: +${inc.toFixed(1)} pontos`);
      }

      // Se aprovado, registra contadores
      if (adjustedScore >= (TRADING_CONFIG?.MIN_SIGNAL_PROBABILITY ?? 70)) {
        this.counterTrendToday++;
        this.lastCounterTrendTime = Date.now();
        console.log(`✅ [${symbol}] SINAL CONTRA-TENDÊNCIA APROVADO (${this.counterTrendToday}/${TRADING_CONFIG?.COUNTER_TREND?.MAX_COUNTER_TREND_PER_DAY} hoje)`);
      }

      details.reversalStrength = reversalStrength;
      details.counterTrendCount = this.counterTrendToday;
    }

    return { adjustedScore, bonus, isCounterTrend, details };
  }

  /**
   * Reset completo
   */
  resetAdaptiveSystem() {
    this.initializeIndicatorPerformance();
    this.symbolPerformance.clear();
    this.symbolBlacklist.clear();
    this.marketRegime = 'NORMAL';
    this.counterTrendToday = 0;
    this.lastCounterTrendTime = 0;
    this.lastSignalTime = 0;
    console.log('🔄 Sistema adaptativo resetado');
  }

  /**
   * Força de reversão (agregador)
   */
  calculateReversalStrength(indicators, patterns) {
    let strength = 0;
    const factors = [];

    // RSI (30%)
    if (isNum(indicators?.rsi)) {
      if (indicators.rsi <= 20) { strength += 30; factors.push(`RSI sobrevenda extrema (${indicators.rsi.toFixed(2)})`); }
      else if (indicators.rsi <= 30) { strength += 20; factors.push(`RSI sobrevenda (${indicators.rsi.toFixed(2)})`); }
      else if (indicators.rsi >= 80) { strength += 30; factors.push(`RSI sobrecompra extrema (${indicators.rsi.toFixed(2)})`); }
      else if (indicators.rsi >= 70) { strength += 20; factors.push(`RSI sobrecompra (${indicators.rsi.toFixed(2)})`); }
    }

    // MACD (25%)
    if (isNum(indicators?.macd?.histogram)) {
      const macdStrength = Math.abs(indicators.macd.histogram) * 1e6;
      if (macdStrength > 10) { strength += 25; factors.push(`MACD forte (${macdStrength.toFixed(2)})`); }
      else if (macdStrength > 5) { strength += 15; factors.push(`MACD moderado (${macdStrength.toFixed(2)})`); }
    }

    // Divergência RSI (20%) – opcional
    if (indicators?.rsiDivergence) { strength += 20; factors.push('Divergência RSI detectada'); }

    // Padrões (15%)
    if (Array.isArray(patterns?.candlestick)) {
      const rev = patterns.candlestick.filter(p =>
        ['HAMMER', 'HANGING_MAN', 'BULLISH_ENGULFING', 'BEARISH_ENGULFING', 'DOJI'].includes(p.type)
      );
      if (rev.length > 0) { strength += 15; factors.push(`Padrão de reversão (${rev[0].type})`); }
    }

    // Volume (10%)
    const volFeature = this._ensureVolumeFeatures(null, indicators);
    const ratio = (volFeature.volumeMA > 0) ? (volFeature.currentVolume / volFeature.volumeMA) : (indicators?.volume?.volumeRatio || 0);
    if (ratio > 1.5) { strength += 10; factors.push(`Volume alto (${ratio.toFixed(2)}x)`); }

    console.log(`🔄 Fatores de reversão: ${factors.join(', ')}`);
    return Math.min(100, strength);
  }

  /**
   * Breakout lateral (consolidação)
   */
  isSidewaysBreakout(patterns, indicators) {
    if (!patterns?.breakout) return false;
    const rsiNeutral = isNum(indicators?.rsi) && indicators.rsi > 40 && indicators.rsi < 60;
    const maFlat = isNum(indicators?.ma21) && isNum(indicators?.ma200) &&
                   Math.abs(indicators.ma21 - indicators.ma200) / Math.abs(indicators.ma200) < 0.02;
    return rsiNeutral || maFlat;
  }

  /**
   * Helpers de volume (garantem currentVolume e volumeMA)
   */
  _ensureVolumeFeatures(data, indicators) {
    // currentVolume
    let currentVolume = 0;
    if (Array.isArray(data?.volume)) currentVolume = data.volume[data.volume.length - 1];
    else if (isNum(data?.volume)) currentVolume = data.volume;
    else if (isNum(indicators?.volume?.currentVolume)) currentVolume = indicators.volume.currentVolume;

    // volumeMA
    let volumeMA = isNum(indicators?.volumeMA) ? indicators.volumeMA : null;
    if (!isNum(volumeMA)) {
      if (Array.isArray(data?.volume) && data.volume.length >= DEFAULTS.VOLUME_MA_PERIOD) {
        const tail = data.volume.slice(-DEFAULTS.VOLUME_MA_PERIOD).filter(isNum);
        if (tail.length) volumeMA = tail.reduce((a, b) => a + b, 0) / tail.length;
      } else if (isNum(indicators?.volume?.averageVolume)) {
        volumeMA = indicators.volume.averageVolume;
      }
    }
    if (!isNum(volumeMA)) volumeMA = 0;

    return { currentVolume: isNum(currentVolume) ? currentVolume : 0, volumeMA };
  }

  /**
   * Utilitários de consulta
   */
  getSymbolStats(symbol) {
    return this.symbolPerformance.get(symbol) || {
      trades: 0,
      wins: 0,
      winRate: 0.5,
      avgPnL: 0
    };
  }

  getIndicatorPerformanceReport() {
    const report = {};
    Object.entries(this.indicatorPerformance).forEach(([indicator, perf]) => {
      if (perf.trades > 0) {
        report[indicator] = {
          trades: perf.trades,
          winRate: (perf.winRate * 100).toFixed(1),
          avgImpact: perf.avgImpact.toFixed(2),
          currentWeight: (isNum(this.weights[indicator]) ? this.weights[indicator] : 0).toFixed(2)
        };
      }
    });
    return report;
  }
}

export default AdaptiveScoringService;
