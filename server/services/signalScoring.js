/**
 * Serviço de pontuação de sinais (revisto)
 * - Mantém compatibilidade com o sistema atual
 * - Mais robusto a dados ausentes/inconsistentes
 * - Logs explicativos padronizados
 * - Integração opcional com correlação BTC e regime
 * - Menos aleatoriedade (jitter controlado por config)
 */

import { SCORING_WEIGHTS, TRADING_CONFIG, CORRELATION_CONFIG } from '../config/constants.js';

const DEFAULTS = {
  MIN_SCORE: (TRADING_CONFIG?.MIN_SIGNAL_PROBABILITY ?? 70),
  ML_WEIGHT: (SCORING_WEIGHTS?.ML_WEIGHT ?? 1.0),
  JITTER_PCT: (TRADING_CONFIG?.SCORING?.JITTER_PCT ?? 0), // 0 = determinístico
  QUALITY: {
    MIN_VOLUME_RATIO: TRADING_CONFIG?.QUALITY_FILTERS?.MIN_VOLUME_RATIO ?? 0.8,
    MIN_CONFIRMATIONS: TRADING_CONFIG?.QUALITY_FILTERS?.MIN_CONFIRMATIONS ?? 2,
    REQUIRE_MULTIPLE_CONFIRMATIONS: TRADING_CONFIG?.QUALITY_FILTERS?.REQUIRE_MULTIPLE_CONFIRMATIONS ?? false,
    MIN_PATTERN_CONFIDENCE: TRADING_CONFIG?.QUALITY_FILTERS?.MIN_PATTERN_CONFIDENCE ?? 0,
    MIN_MACD_STRENGTH: TRADING_CONFIG?.QUALITY_FILTERS?.MIN_MACD_STRENGTH ?? 0,
    MIN_RSI_EXTREME: TRADING_CONFIG?.QUALITY_FILTERS?.MIN_RSI_EXTREME ?? 0,   // permitido 0..100
    MAX_RSI_EXTREME: TRADING_CONFIG?.QUALITY_FILTERS?.MAX_RSI_EXTREME ?? 100
  },
  VOLUME_MA_PERIOD: 20, // se TA não prover volumeMA, calculamos com 20 candles
};

// Bound simples para evitar números fora do range
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

class SignalScoringService {
  constructor() {
    this.currentTimeframe = '1h';
    // Histerese/cooldown leve para evitar flip-flop próximo ao threshold
    this._lastDecisions = new Map(); // key: symbol:timeframe -> { ts, score, valid }
  }

  /**
   * Calcula pontuação total do sinal (compatível)
   */
  calculateSignalScore(data, indicators, patterns, mlProbability, marketTrend = null, bitcoinCorrelation = null) {
    const symbol = data?.symbol || 'UNKNOWN';
    const tf = this.currentTimeframe || '1h';
    const lastClose = Array.isArray(data?.close) ? data.close[data.close.length - 1] : data?.close;
    console.log(`\n🔍 [${symbol}] INÍCIO DA ANÁLISE DE SINAL`);
    console.log(`🌐 [${symbol}] REGIME: ${marketTrend || 'Não especificado'}`);
    if (bitcoinCorrelation) {
      console.log(`₿ [${symbol}] Correlação BTC: ${bitcoinCorrelation.alignment || 'N/A'}`);
    }

    // Guard-rails
    if (!data || !indicators) {
      const reason = '❌ Dados ou indicadores ausentes';
      console.error(reason);
      return { totalScore: 0, details: {}, isValid: false, isMLDriven: false, reason, scoreComponents: [] };
    }

    // Assegurar features de volume caso TA não tenha fornecido
    const volumeFeatures = this._ensureVolumeFeatures(data, indicators);
    const safeIndicators = { ...indicators, ...volumeFeatures.inject };

    let score = 0;
    const details = {};
    let isMLDriven = false;
    let confirmations = 0;
    const strengthFactors = [];
    const scoreComponents = [];

    const addScoreComponent = (name, value, weight = 1, description = '') => {
      const val = Number.isFinite(value) ? value : 0;
      const w = Number.isFinite(weight) ? weight : 1;
      const weightedValue = val * w;
      const component = { name, value: val, weight: w, weightedValue, description };
      scoreComponents.push(component);

      // Log amigável
      const valueStr = val.toFixed(2).padStart(6);
      const weightedStr = weightedValue.toFixed(2).padStart(6);
      const weightStr = w.toFixed(2).padStart(4);
      let logLine = `  • ${name.padEnd(25)}: ${valueStr} × ${weightStr} = ${weightedStr}`;
      if (description) logLine += ` (${description})`;
      console.log(logLine);

      return weightedValue;
    };

    try {
      console.log(`📈 [${symbol}] ANALISANDO INDICADORES`);
      const indicatorScore = this.scoreIndicators(safeIndicators);
      score += addScoreComponent(
        'Indicadores Técnicos',
        indicatorScore.total,
        1,
        `RSI: ${safeIndicators.rsi?.toFixed?.(2) ?? 'N/A'}, MACD.h: ${safeIndicators.macd?.histogram?.toFixed?.(6) ?? 'N/A'}`
      );
      details.indicators = indicatorScore.details;
      confirmations += indicatorScore.confirmations || 0;
      strengthFactors.push(...(indicatorScore.strengthFactors || []));
      console.log(`📊 [${symbol}] Confirmações indicadores: ${indicatorScore.confirmations || 0}`);

      // Logs de leitura rápida
      if (Number.isFinite(safeIndicators.rsi)) {
        if (safeIndicators.rsi < 30) console.log(`📊 [${symbol}] SOBREVENDA (RSI ${safeIndicators.rsi.toFixed(2)})`);
        else if (safeIndicators.rsi > 70) console.log(`📊 [${symbol}] SOBRECOMPRA (RSI ${safeIndicators.rsi.toFixed(2)})`);
      }
      if (Number.isFinite(safeIndicators.macd?.histogram)) {
        const dir = safeIndicators.macd.histogram > 0 ? 'COMPRA' : 'VENDA';
        console.log(`📊 [${symbol}] MACD: ${dir} (${Math.abs(safeIndicators.macd.histogram).toFixed(8)})`);
      }

      console.log(`🔍 [${symbol}] ANALISANDO PADRÕES`);
      const patternScore = this.scorePatterns(patterns || {});
      score += addScoreComponent(
        'Padrões Gráficos',
        patternScore.total,
        1,
        `Reversão: ${patterns?.reversalPatterns?.length || 0}, Continuação: ${patterns?.continuationPatterns?.length || 0}`
      );
      details.patterns = patternScore.details;
      confirmations += patternScore.confirmations || 0;
      strengthFactors.push(...(patternScore.strengthFactors || []));
      console.log(`🔍 [${symbol}] Confirmações padrões: ${patternScore.confirmations || 0}`);

      console.log(`📊 [${symbol}] ANALISANDO VOLUME`);
      const volScore = this.scoreVolume(
        { volume: volumeFeatures.currentVolume },
        { volumeMA: volumeFeatures.volumeMA }
      );
      const volumeRatioStr = volumeFeatures.volumeMA > 0 ? (volumeFeatures.currentVolume / volumeFeatures.volumeMA).toFixed(2) : 'N/A';
      score += addScoreComponent(
        'Volume',
        volScore,
        1,
        `Atual: ${Number.isFinite(volumeFeatures.currentVolume) ? volumeFeatures.currentVolume.toFixed(2) : 'N/A'}, ` +
          `Média(${DEFAULTS.VOLUME_MA_PERIOD}): ${Number.isFinite(volumeFeatures.volumeMA) ? volumeFeatures.volumeMA.toFixed(2) : 'N/A'} (${volumeRatioStr}x)`
      );
      details.volume = volScore;
      if (volScore > 0) confirmations++;
      if (volScore > 15) strengthFactors.push('VOLUME_HIGH');
      if (volScore > 25) strengthFactors.push('VOLUME_EXTREME');

      console.log(`✅ [${symbol}] VERIFICANDO FILTROS`);
      const qualityCheck = this.applyQualityFilters(
        { ...data, lastClose, symbol },
        { ...safeIndicators, volume: { currentVolume: volumeFeatures.currentVolume, averageVolume: volumeFeatures.volumeMA, volumeRatio: (volumeFeatures.volumeMA ? volumeFeatures.currentVolume / volumeFeatures.volumeMA : 0) } },
        patterns,
        confirmations
      );

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

      // Machine Learning
      const mlProb = Number.isFinite(mlProbability) ? clamp(mlProbability, 0, 1) : 0;
      const mlScore = mlProb * DEFAULTS.ML_WEIGHT * 100;
      if (mlScore > 0) {
        score += addScoreComponent('Machine Learning', mlScore, 1, `Probabilidade: ${(mlProb * 100).toFixed(1)}%`);
        details.machineLearning = mlScore;
        if (mlProb > 0.60) confirmations++;
        if (mlScore > score * 0.4 && mlProb > 0.70) {
          isMLDriven = true;
          console.log('  🔥 Sinal impulsionado por ML');
        }
      }

      // Ajustes por Regime
      let regimeAdj = 0;
      if (marketTrend === 'BEARISH') {
        regimeAdj = score * 0.10; // bônus de resiliência para sinais com filtros passados em baixa
        console.log(`  🐻 Ajuste para mercado em baixa: +${regimeAdj.toFixed(2)}`);
      } else if (marketTrend === 'VOLATILE') {
        regimeAdj = -score * 0.05; // leve contenção
        console.log(`  ⚡ Ajuste para mercado volátil: ${regimeAdj.toFixed(2)}`);
      }
      score += regimeAdj;

      // ✅ AJUSTE ALINHADO — Alinhamento BTC (centralizado com CORRELATION_CONFIG)
      if (bitcoinCorrelation) {
        const strength = Number.isFinite(bitcoinCorrelation.btcStrength) ? bitcoinCorrelation.btcStrength : 0;
        const rho = Number.isFinite(bitcoinCorrelation.priceCorrelation) ? bitcoinCorrelation.priceCorrelation : 0;
        const absRho = Math.abs(rho);
        const corrScale = 0.5 + 0.5 * Math.min(1, absRho); // 0.5..1.0, igual ao serviço

        const hasImpact = Number.isFinite(bitcoinCorrelation.bonus) || Number.isFinite(bitcoinCorrelation.penalty);
        if (hasImpact) {
          const impact = (bitcoinCorrelation.bonus || 0) + (bitcoinCorrelation.penalty || 0);
          if (impact !== 0) {
            score += addScoreComponent(
              'Alinhamento BTC',
              impact,
              1,
              `${bitcoinCorrelation.alignment || 'N/A'} (ρ=${rho.toFixed(2)}, força: ${strength})`
            );
          }
        } else if (bitcoinCorrelation.alignment) {
          // fallback quando o serviço só entrega 'alignment'
          const rawAlign = bitcoinCorrelation.alignment;
          const align = (rawAlign === 'MISALIGNED') ? 'AGAINST' : rawAlign; // normaliza

          // aplica apenas se a força do BTC for suficiente para justificar ajuste
          if (strength >= (CORRELATION_CONFIG?.MIN_STRENGTH_APPLY ?? 30)) {
            const strong = strength >= (CORRELATION_CONFIG?.STRONG_STRENGTH ?? 70);
            const moderate = strength >= (CORRELATION_CONFIG?.MODERATE_STRENGTH ?? 50);

            if (align === 'ALIGNED') {
              // baseado na força e escalado por |ρ|
              let base = strong ? 25 : (moderate ? 15 : 8);
              const btcAdj = Math.round(base * corrScale);
              score += addScoreComponent('Alinhamento BTC', btcAdj, 1, `ALIGNED (ρ=${rho.toFixed(2)}, força: ${strength})`);
            } else if (align === 'AGAINST') {
              let base = strong ? -15 : (moderate ? -8 : 0);
              const btcAdj = Math.round(base * corrScale);
              if (btcAdj !== 0) {
                score += addScoreComponent('Alinhamento BTC', btcAdj, 1, `AGAINST (ρ=${rho.toFixed(2)}, força: ${strength})`);
              }
            }
          } else {
            console.log(`ℹ️ [${symbol}] Alinhamento BTC ignorado (força ${strength} < ${(CORRELATION_CONFIG?.MIN_STRENGTH_APPLY ?? 30)})`);
          }
        }
      }

      // Bônus por múltiplas confirmações
      if (confirmations >= DEFAULTS.QUALITY.MIN_CONFIRMATIONS) {
        const confirmationBonus = (confirmations - 1) * 5;
        if (confirmationBonus > 0) {
          score += addScoreComponent('Bônus Confirmações', confirmationBonus, 1, `${confirmations} confirmações`);
        }
      }

      // Detecção de downtrend (para sinais de venda) — mantém compatível e opcional
      const downtrendAnalysis = this.detectDowntrend(safeIndicators);
      if (downtrendAnalysis.isDowntrend) {
        const downtrendBonus = 15;
        score += downtrendBonus;
        console.log(`   🎯 Bônus de tendência de baixa: +${downtrendBonus} pontos`);
        details.downtrendAnalysis = { ...downtrendAnalysis, bonusApplied: downtrendBonus };
      }

      // Score bruto antes de variações
      console.log(`🏁 [${symbol}] RESULTADO PARCIAL`);
      console.log(`📊 [${symbol}] Score bruto: ${score.toFixed(2)}`);
      console.log(`📊 [${symbol}] Confirmações: ${confirmations}`);

      // Variações determinísticas (sem aleatoriedade)
      let finalScore = score;

      // Qualidade (sem aleatoriedade)
      finalScore += this._qualityVariationDeterministic(safeIndicators, patterns, mlProb);

      // Timeframe (sem aleatoriedade — faixas fixas)
      finalScore += this._timeframeVariationDeterministic(this.currentTimeframe);

      // Força (sem aleatoriedade, só degraus)
      finalScore += this._strengthVariationDeterministic(confirmations, strengthFactors);

      // Jitter opcional muito pequeno (±JITTER_PCT do score atual)
      if (DEFAULTS.JITTER_PCT > 0) {
        const jitter = (Math.random() * 2 - 1) * (DEFAULTS.JITTER_PCT * finalScore);
        finalScore += jitter;
      }

      finalScore = clamp(Math.round(finalScore * 1000) / 1000, 0, 100);

      // Histerese leve próximo ao threshold (evita flip-flop)
      const finalWithHysteresis = this._applyHysteresis(symbol, tf, finalScore, DEFAULTS.MIN_SCORE);

      const isValid = finalWithHysteresis >= DEFAULTS.MIN_SCORE;

      console.log(`📊 [${symbol}] DETALHAMENTO DO SCORE:`);
      scoreComponents.forEach(comp => {
        console.log(`📊 [${symbol}] ${comp.name}: ${comp.value.toFixed(2)} × ${comp.weight.toFixed(2)} = ${comp.weightedValue.toFixed(2)}`);
      });
      console.log(`🎯 [${symbol}] SCORE FINAL: ${finalWithHysteresis.toFixed(1)}/${DEFAULTS.MIN_SCORE}`);

      // Log resumido
      const logPrefix = isValid ? '✅ SINAL VÁLIDO' : '❌ SINAL INVÁLIDO';
      console.log(`${logPrefix} [${symbol}] Score: ${finalWithHysteresis.toFixed(1)}/100`);
      if (!isValid) {
        const missing = (DEFAULTS.MIN_SCORE - finalWithHysteresis).toFixed(1);
        console.log(`❌ [${symbol}] Insuficiente: ${finalWithHysteresis.toFixed(1)} < ${DEFAULTS.MIN_SCORE} (faltam ${missing})`);
      } else {
        console.log(`🏆 [${symbol}] SINAL VÁLIDO ENCONTRADO!`);
      }

      return {
        totalScore: finalWithHysteresis,
        details: { ...details, scoreComponents },
        isValid,
        isMLDriven,
        confirmations,
        strengthFactors,
        reason: isValid ? 'Sinal válido' : `Pontuação insuficiente (${finalWithHysteresis.toFixed(1)}/${DEFAULTS.MIN_SCORE})`
      };

    } catch (error) {
      console.error('❌ Erro ao calcular pontuação do sinal:', error);
      return {
        totalScore: 0,
        details: { error: error.message },
        isValid: false,
        isMLDriven: false,
        reason: `Erro: ${error.message}`,
        scoreComponents
      };
    }
  }

  /**
   * Detecta tendência de baixa com base em múltiplos indicadores
   */
  detectDowntrend(indicators) {
    const { rsi, macd, bollingerBands } = indicators || {};
    let trendScore = 0;
    const details = [];

    // RSI
    if (Number.isFinite(rsi)) {
      if (rsi > 70) { trendScore += 0.4; details.push(`RSI alto (${rsi.toFixed(2)})`); }
      else if (rsi > 60) { trendScore += 0.2; details.push(`RSI moderado (${rsi.toFixed(2)})`); }
    }

    // MACD (usa campo 'MACD' correto)
    if (macd && Number.isFinite(macd.histogram)) {
      if (macd.histogram < 0 && Number.isFinite(macd.MACD) && Number.isFinite(macd.signal) && macd.MACD < macd.signal) {
        trendScore += 0.3; details.push('MACD cruzamento para baixo');
      } else if (macd.histogram < 0) {
        trendScore += 0.15; details.push('MACD negativo');
      }
    }

    // BB (opcional)
    if (bollingerBands?.upper && bollingerBands?.middle && Number.isFinite(bollingerBands.close)) {
      const price = bollingerBands.close;
      const upper = bollingerBands.upper;
      const mid = bollingerBands.middle;
      const denom = (upper - mid);
      if (denom > 0) {
        const distanceToUpper = (price - mid) / denom;
        if (distanceToUpper > 0.7) {
          trendScore += 0.3;
          details.push(`Preço próximo à banda superior (${(distanceToUpper * 100).toFixed(1)}%)`);
        }
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
   * Variação determinística por qualidade (sem aleatoriedade)
   */
  _qualityVariationDeterministic(indicators, patterns, mlProbability) {
    let variation = 0;

    // RSI extremo (proximidade de 0/100)
    if (Number.isFinite(indicators?.rsi)) {
      const dist = Math.min(indicators.rsi, 100 - indicators.rsi); // 0..50
      if (dist < 15) variation += 6;           // muito extremo
      else if (dist < 25) variation += 3;      // extremo moderado
      else if (dist > 35) variation -= 2;      // sem informação
    }

    // Força do MACD (escala original do projeto)
    if (Number.isFinite(indicators?.macd?.histogram)) {
      const strength = Math.abs(indicators.macd.histogram) * 1e6; // 0..?
      if (strength > 10) variation += 8;
      else if (strength > 5) variation += 5;
      else if (strength < 1) variation -= 2;
    }

    // Padrões
    if (patterns?.breakout) variation += clamp((patterns.breakout.confidence ?? 20) * 0.15, 2, 7);
    const nCandles = Array.isArray(patterns?.candlestick) ? patterns.candlestick.length : 0;
    if (nCandles > 0) variation += clamp(2 + (nCandles * 0.8), 2, 6);

    // ML
    if (Number.isFinite(mlProbability)) {
      if (mlProbability > 0.65) variation += clamp((mlProbability - 0.5) * 12, 0, 6);
      else if (mlProbability < 0.40) variation -= clamp((0.5 - mlProbability) * 10, 0, 5);
    }

    return variation;
  }

  /**
   * Variação determinística por timeframe (sem aleatoriedade)
   */
  _timeframeVariationDeterministic(timeframe) {
    const table = {
      '5m': -1.5,
      '15m': 0,
      '1h': 2,
      '4h': 4,
      '1d': 6
    };
    return table[timeframe] ?? 0;
  }

  /**
   * Variação determinística pela força/confirm. (sem aleatoriedade)
   */
  _strengthVariationDeterministic(confirmations, strengthFactors) {
    let v = 0;
    if (confirmations >= 4) v += 6;
    else if (confirmations === 3) v += 3;
    else if (confirmations === 2) v += 1;
    else v -= 2;

    v += Math.min(5, (strengthFactors?.length || 0) * 1.2);
    return v;
  }

  /**
   * Leve histerese próximo ao threshold para evitar flip-flop
   */
  _applyHysteresis(symbol, timeframe, score, threshold) {
    const key = `${symbol}:${timeframe}`;
    const last = this._lastDecisions.get(key);
    const margin = 2.0; // pontos

    let adjusted = score;
    if (last) {
      // Se antes era válido e agora caiu um pouco abaixo, segura dentro da margem
      if (last.valid && score < threshold && score >= threshold - margin) {
        adjusted = threshold; // mantém válido
      }
      // Se antes era inválido e agora subiu um pouco acima, exige passinho a mais
      if (!last.valid && score >= threshold && score < threshold + margin) {
        adjusted = threshold - 0.1; // mantém inválido até romper com folga
      }
    }

    const valid = adjusted >= threshold;
    this._lastDecisions.set(key, { ts: Date.now(), score: adjusted, valid });
    return adjusted;
  }

  /**
   * Garante features de volume mesmo quando TA não as fornece
   */
  _ensureVolumeFeatures(data, indicators) {
    // currentVolume
    let currentVolume = 0;
    if (Array.isArray(data?.volume)) currentVolume = data.volume[data.volume.length - 1];
    else if (Number.isFinite(data?.volume)) currentVolume = data.volume;

    // volumeMA
    let volumeMA = Number.isFinite(indicators?.volumeMA) ? indicators.volumeMA : null;
    if (!Number.isFinite(volumeMA) && Array.isArray(data?.volume) && data.volume.length >= DEFAULTS.VOLUME_MA_PERIOD) {
      const tail = data.volume.slice(-DEFAULTS.VOLUME_MA_PERIOD).filter(v => Number.isFinite(v));
      if (tail.length) {
        volumeMA = tail.reduce((a, b) => a + b, 0) / tail.length;
      }
    }
    if (!Number.isFinite(volumeMA)) volumeMA = 0;

    return {
      currentVolume: Number.isFinite(currentVolume) ? currentVolume : 0,
      volumeMA,
      inject: { volumeMA } // mantém compatibilidade com scoreVolume()
    };
  }

  /**
   * Detecta a tendência do sinal (compatível)
   */
  detectSignalTrend(indicators, patterns = {}) {
    if (!indicators) return 'NEUTRAL';

    let bullishScore = 0;
    let bearishScore = 0;
    let totalFactors = 0;

    console.log('🔍 Detectando tendência do sinal...');

    // RSI
    if (Number.isFinite(indicators.rsi)) {
      totalFactors++;
      if (indicators.rsi <= 25) { bullishScore += 2; console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BULLISH EXTREMO (sobrevenda)`); }
      else if (indicators.rsi <= 35) { bullishScore += 1; console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BULLISH (sobrevenda)`); }
      else if (indicators.rsi >= 75) { bearishScore += 2; console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BEARISH EXTREMO (sobrecompra)`); }
      else if (indicators.rsi >= 65) { bearishScore += 1; console.log(`  RSI: ${indicators.rsi.toFixed(2)} → BEARISH (sobrecompra)`); }
      else { console.log(`  RSI: ${indicators.rsi.toFixed(2)} → NEUTRAL`); }
    }

    // MACD
    if (Number.isFinite(indicators?.macd?.histogram)) {
      totalFactors++;
      const h = indicators.macd.histogram;
      const strength = Math.abs(h) * 1e6;
      if (h > 0.000001) {
        if (strength > 5) bullishScore += 2; else bullishScore += 1;
        console.log(`  MACD: ${h.toFixed(8)} → BULLISH (força: ${strength.toFixed(2)})`);
      } else if (h < -0.000001) {
        if (strength > 5) bearishScore += 2; else bearishScore += 1;
        console.log(`  MACD: ${h.toFixed(8)} → BEARISH (força: ${strength.toFixed(2)})`);
      } else {
        console.log(`  MACD: ${h.toFixed(8)} → NEUTRAL (muito fraco)`);
      }
    }

    // MAs
    if (Number.isFinite(indicators?.ma21) && Number.isFinite(indicators?.ma200) && indicators.ma200 !== 0) {
      totalFactors++;
      const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
      if (maDiff >= 2) { bullishScore += 2; console.log(`  MA: ${maDiff.toFixed(2)}% → BULLISH FORTE`); }
      else if (maDiff >= 0.5) { bullishScore += 1; console.log(`  MA: ${maDiff.toFixed(2)}% → BULLISH`); }
      else if (maDiff <= -2) { bearishScore += 2; console.log(`  MA: ${maDiff.toFixed(2)}% → BEARISH FORTE`); }
      else if (maDiff <= -0.5) { bearishScore += 1; console.log(`  MA: ${maDiff.toFixed(2)}% → BEARISH`); }
      else { console.log(`  MA: ${maDiff.toFixed(2)}% → NEUTRAL`); }
    }

    // Breakouts
    if (patterns?.breakout) {
      totalFactors++;
      if (patterns.breakout.type === 'BULLISH_BREAKOUT') { bullishScore += 2; console.log(`  Breakout: BULLISH_BREAKOUT`); }
      else if (patterns.breakout.type === 'BEARISH_BREAKOUT') { bearishScore += 2; console.log(`  Breakout: BEARISH_BREAKOUT`); }
    }

    // Candlesticks
    if (Array.isArray(patterns?.candlestick)) {
      patterns.candlestick.forEach(p => {
        totalFactors++;
        if (p?.bias === 'BULLISH') { bullishScore += 1; console.log(`  Candlestick: ${p.type} (BULLISH)`); }
        else if (p?.bias === 'BEARISH') { bearishScore += 1; console.log(`  Candlestick: ${p.type} (BEARISH)`); }
      });
    }

    // ✅ CONFIRMAÇÃO DE VOLUME CORRIGIDA (aceita volume como número ou objeto)
    {
      const volMA = Number.isFinite(indicators?.volumeMA) ? indicators.volumeMA : null;
      const volCur = Number.isFinite(indicators?.volume)
        ? indicators.volume
        : Number.isFinite(indicators?.volume?.currentVolume)
          ? indicators.volume.currentVolume
          : null;

      if (volMA && volMA > 0 && Number.isFinite(volCur)) {
        const ratio = volCur / volMA;
        if (ratio > 1.5) {
          if (bullishScore > bearishScore) {
            bullishScore++;
            console.log(`  Volume: Alto volume confirmando tendência BULLISH`);
          } else if (bearishScore > bullishScore) {
            bearishScore++;
            console.log(`  Volume: Alto volume confirmando tendência BEARISH`);
          }
        }
      }
    }

    if (totalFactors === 0) {
      console.log('  ⚠️ Nenhum fator de tendência detectado');
      return 'NEUTRAL';
    }

    const bullishRatio = bullishScore / totalFactors;
    const bearishRatio = bearishScore / totalFactors;
    console.log(`🎯 Pontuação de tendência: BULLISH=${bullishScore}/${totalFactors} (${(bullishRatio * 100).toFixed(1)}%), BEARISH=${bearishScore}/${totalFactors} (${(bearishRatio * 100).toFixed(1)}%)`);

    if (bullishRatio >= 0.55) { console.log('✅ Tendência BULLISH detectada'); return 'BULLISH'; }
    if (bearishRatio >= 0.55) { console.log('✅ Tendência BEARISH detectada'); return 'BEARISH'; }

    if (bullishScore > bearishScore && bullishRatio >= 0.4) { console.log('⚖️ Leve tendência BULLISH'); return 'BULLISH'; }
    if (bearishScore > bullishScore && bearishRatio >= 0.4) { console.log('⚖️ Leve tendência BEARISH'); return 'BEARISH'; }

    console.log('⚖️ Tendência NEUTRAL');
    return 'NEUTRAL';
  }

  /**
   * Pontua indicadores técnicos (compatível)
   */
  scoreIndicators(indicators) {
    let total = 0;
    const details = {};
    let confirmations = 0;
    const strengthFactors = [];

    // RSI
    if (Number.isFinite(indicators?.rsi)) {
      let score = 0;
      let reason = '';
      if (indicators.rsi <= 30) { score = 25; reason = 'Sobrevenda'; confirmations++; if (indicators.rsi <= 20) strengthFactors.push('RSI_EXTREME'); }
      else if (indicators.rsi >= 70) { score = 25; reason = 'Sobrecompra'; confirmations++; if (indicators.rsi >= 80) strengthFactors.push('RSI_EXTREME'); }
      else if (indicators.rsi <= 40) { score = 15; reason = 'Sobrevenda moderada'; }
      else if (indicators.rsi >= 60) { score = 15; reason = 'Sobrecompra moderada'; }
      total += score;
      details.rsi = { score, reason };
    }

    // MACD (usa campos corretos)
    if (Number.isFinite(indicators?.macd?.histogram)) {
      let score = 0;
      let reason = '';
      const strength = Math.abs(indicators.macd.histogram) * 1e6;
      if (Math.abs(indicators.macd.histogram) > 0.000001) {
        if (strength > 10) { score = 30; reason = 'Sinal muito forte'; confirmations++; strengthFactors.push('MACD_STRONG'); }
        else if (strength > 5) { score = 20; reason = 'Sinal forte'; confirmations++; }
        else if (strength > 1) { score = 10; reason = 'Sinal moderado'; }
      }
      total += score;
      details.macd = { score, reason, strength };
    }

    // Médias móveis
    if (Number.isFinite(indicators?.ma21) && Number.isFinite(indicators?.ma200) && indicators.ma200 !== 0) {
      let score = 0;
      let reason = '';
      const maDiff = ((indicators.ma21 - indicators.ma200) / indicators.ma200) * 100;
      if (Math.abs(maDiff) > 2) { score = 20; reason = `Tendência forte (${maDiff.toFixed(2)}%)`; confirmations++; strengthFactors.push('MA_STRONG'); }
      else if (Math.abs(maDiff) > 0.5) { score = 10; reason = `Tendência moderada (${maDiff.toFixed(2)}%)`; }
      total += score;
      details.movingAverages = { score, reason, difference: maDiff };
    }

    return { total, details, confirmations, strengthFactors };
  }

  /**
   * Pontua padrões gráficos (compatível)
   */
  scorePatterns(patterns) {
    let total = 0;
    const details = {};
    let confirmations = 0;
    const strengthFactors = [];

    // Breakouts
    if (patterns?.breakout) {
      const score = patterns.breakout.confidence ?? 20;
      total += score;
      details.breakout = { score, type: patterns.breakout.type };
      confirmations++;
      if (score > 25) strengthFactors.push('BREAKOUT_STRONG');
    }

    // Candlestick
    if (Array.isArray(patterns?.candlestick)) {
      const arr = patterns.candlestick;
      arr.forEach(p => {
        const score = p?.confidence ?? 15;
        total += score;
        confirmations++;
        if (score > 20) strengthFactors.push('CANDLESTICK_STRONG');
      });
      details.candlestick = { count: arr.length, patterns: arr };
    }

    // Reversão
    if (Array.isArray(patterns?.reversalPatterns) && patterns.reversalPatterns.length > 0) {
      const score = patterns.reversalPatterns.length * 10;
      total += score;
      details.reversal = { score, count: patterns.reversalPatterns.length };
      confirmations++;
    }

    // Continuação
    if (Array.isArray(patterns?.continuationPatterns) && patterns.continuationPatterns.length > 0) {
      const score = patterns.continuationPatterns.length * 8;
      total += score;
      details.continuation = { score, count: patterns.continuationPatterns.length };
      confirmations++;
    }

    return { total, details, confirmations, strengthFactors };
  }

  /**
   * Pontua volume (compatível)
   * data.volume: número atual de volume
   * indicators.volumeMA: média de volume
   */
  scoreVolume(data, indicators) {
    const vol = Number.isFinite(data?.volume) ? data.volume : 0;
    const vma = Number.isFinite(indicators?.volumeMA) ? indicators.volumeMA : 0;
    if (vol <= 0 || vma <= 0) return 0;

    const ratio = vol / vma;
    if (ratio > 3) return 30;       // extremamente alto
    if (ratio > 2) return 20;       // muito alto
    if (ratio > 1.5) return 15;     // alto
    if (ratio > 1.2) return 10;     // moderado
    if (ratio < 0.5) return -10;    // muito baixo
    return 0;
  }

  /**
   * Aplica filtros de qualidade (compatível, mais robusto)
   */
  applyQualityFilters(data, indicators, patterns, confirmations) {
    const reasons = [];
    const result = { passed: true, reason: '' };

    // Volume
    const volumeRatio = Number.isFinite(indicators?.volume?.volumeRatio)
      ? indicators.volume.volumeRatio
      : (Number.isFinite(indicators?.volumeMA) && indicators.volumeMA > 0 && Number.isFinite(indicators?.volume))
        ? indicators.volume / indicators.volumeMA
        : 0;

    if (volumeRatio > 0 && volumeRatio < DEFAULTS.QUALITY.MIN_VOLUME_RATIO) {
      reasons.push(`Volume (${volumeRatio.toFixed(2)}x) abaixo do mínimo (${DEFAULTS.QUALITY.MIN_VOLUME_RATIO}x)`);
    }

    // RSI
    if (Number.isFinite(indicators?.rsi)) {
      const rsi = indicators.rsi;
      const minR = DEFAULTS.QUALITY.MIN_RSI_EXTREME;
      const maxR = DEFAULTS.QUALITY.MAX_RSI_EXTREME;
      if (rsi < minR || rsi > maxR) {
        reasons.push(`RSI (${rsi.toFixed(2)}) fora da faixa aceitável [${minR}-${maxR}]`);
      }
    }

    // Confirmações
    if (DEFAULTS.QUALITY.REQUIRE_MULTIPLE_CONFIRMATIONS && confirmations < DEFAULTS.QUALITY.MIN_CONFIRMATIONS) {
      reasons.push(`Apenas ${confirmations} de ${DEFAULTS.QUALITY.MIN_CONFIRMATIONS} confirmações necessárias`);
    }

    // Padrões
    if (patterns) {
      // Normaliza para { key: { confidence } } quando vier em outro formato
      const flat = [];
      Object.values(patterns).forEach(p => {
        if (!p) return;
        if (Array.isArray(p)) flat.push(...p);
        else if (typeof p === 'object') flat.push(p);
      });
      const validPatterns = flat.filter(p => Number.isFinite(p?.confidence) ? p.confidence >= DEFAULTS.QUALITY.MIN_PATTERN_CONFIDENCE : true);
      if (flat.length > 0 && validPatterns.length === 0) {
        reasons.push(`Nenhum padrão válido encontrado (mínimo ${DEFAULTS.QUALITY.MIN_PATTERN_CONFIDENCE}% de confiança)`);
      }
    }

    // MACD mínimo
    if (Number.isFinite(indicators?.macd?.histogram) && Math.abs(indicators.macd.histogram) < DEFAULTS.QUALITY.MIN_MACD_STRENGTH) {
      reasons.push(`Força do MACD (${indicators.macd.histogram.toFixed(6)}) abaixo do mínimo (${DEFAULTS.QUALITY.MIN_MACD_STRENGTH})`);
    }

    if (reasons.length > 0) {
      result.passed = false;
      result.reason = `Filtros de qualidade não atendidos:\n  • ${reasons.join('\n  • ')}`;

      console.log('\n❌ Sinal rejeitado - Motivos:');
      console.log(`  • ${reasons.join('\n  • ')}`);
      console.log('\n📊 DETALHES DO SINAL:');
      const lastPrice = Array.isArray(data?.close) ? data.close[data.close.length - 1] : data?.lastClose || 'N/A';
      console.log(`  • Preço atual: ${lastPrice}`);
      console.log(`  • Volume: ${indicators.volume?.currentVolume ?? 'N/A'}`);
      console.log(`  • Volume Média: ${indicators.volume?.averageVolume ?? 'N/A'}`);
      console.log(`  • Volume Ratio: ${Number.isFinite(volumeRatio) ? volumeRatio.toFixed(2) : 'N/A'}`);
      console.log(`  • RSI: ${Number.isFinite(indicators.rsi) ? indicators.rsi.toFixed(2) : 'N/A'}`);
      console.log(`  • MACD: ${indicators.macd ? JSON.stringify({
        histogram: Number.isFinite(indicators.macd.histogram) ? indicators.macd.histogram.toFixed(6) : undefined,
        signal: Number.isFinite(indicators.macd.signal) ? indicators.macd.signal.toFixed(6) : undefined,
        MACD: Number.isFinite(indicators.macd.MACD) ? indicators.macd.MACD.toFixed(6) : undefined
      }) : 'N/A'}`);
    } else {
      console.log('✅ Sinal aprovado em todos os filtros de qualidade');
    }

    return result;
  }

  /**
   * Define timeframe atual (compatível)
   */
  setCurrentTimeframe(timeframe) {
    this.currentTimeframe = timeframe;
    console.log(`[SignalScoring] Timeframe atual definido para: ${timeframe}`);
    return this.currentTimeframe;
  }

  /**
   * Calcula níveis de trading (compatível)
   * - Usa ATR se disponível; caso contrário, percentuais do TRADING_CONFIG
   */
  calculateTradingLevels(entryPrice, trend = 'BULLISH', indicators = null) {
    const entry = entryPrice;
    const isLong = trend === 'BULLISH';

    // Preferência: ATR -> múltiplos (R)
    const atr = Number.isFinite(indicators?.atr) ? indicators.atr : null;

    let targets, stopLoss, riskRewardRatio;

    if (atr && atr > 0) {
      // R-multiples: 1R..6R
      const r = 1.2 * atr;                 // 1R base levemente conservador
      const targetR = [1, 2, 3, 4, 5, 6];  // 6 alvos
      if (isLong) {
        targets = targetR.map(m => entry + m * r);
        stopLoss = entry - 1.5 * r;        // ~1.5R
      } else {
        targets = targetR.map(m => entry - m * r);
        stopLoss = entry + 1.5 * r;
      }
      riskRewardRatio = (targetR[0] * r) / (1.5 * r); // ~0.67, mas primeiros alvos são rápidos
    } else {
      // Percentuais (usando TRADING_CONFIG)
      const tpPercents = Array.isArray(TRADING_CONFIG?.TARGET_PERCENTAGES) && TRADING_CONFIG.TARGET_PERCENTAGES.length
        ? TRADING_CONFIG.TARGET_PERCENTAGES
        : [1.2, 2.4, 3.6, 4.8, 6.0, 7.2];

      const slPercent = Number.isFinite(TRADING_CONFIG?.STOP_LOSS_PERCENTAGE)
        ? TRADING_CONFIG.STOP_LOSS_PERCENTAGE
        : 2.5;

      if (isLong) {
        targets = tpPercents.map(pct => entry * (1 + pct / 100));
        stopLoss = entry * (1 - slPercent / 100);
      } else {
        targets = tpPercents.map(pct => entry * (1 - pct / 100));
        stopLoss = entry * (1 + slPercent / 100);
      }
      riskRewardRatio = (tpPercents[0] ?? 1.2) / slPercent;
    }

    return { entry, targets, stopLoss, riskRewardRatio };
  }
}

export default SignalScoringService;
