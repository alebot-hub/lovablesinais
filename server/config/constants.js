/**
 * Configurações e constantes do sistema
 */

// Lista das 70 principais criptomoedas de futuros perpétuos (excluindo stablecoins)
// OBS: Mantido exatamente conforme solicitado; apenas removida a duplicidade de 1000PEPE/USDT
export const CRYPTO_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
  'DOGE/USDT', 'SOL/USDT', 'TRX/USDT', 'DOT/USDT', 'POL/USDT',
  'LTC/USDT', '1000SHIB/USDT', 'UNI/USDT', 'ATOM/USDT',
  'LINK/USDT', 'ETC/USDT', 'XLM/USDT', 'BCH/USDT', 'NEAR/USDT',
  'ALGO/USDT', 'VET/USDT', 'ICP/USDT', 'FIL/USDT', 'APE/USDT',
  'MANA/USDT', 'SAND/USDT', 'LRC/USDT', 'AXS/USDT', 'THETA/USDT',
  'AAVE/USDT', 'EOS/USDT', 'FLOW/USDT', 'CAKE/USDT', 'GRT/USDT',
  'CHZ/USDT', 'ENJ/USDT', 'ZEC/USDT', 'COMP/USDT', 'YFI/USDT',
  'SNX/USDT', 'MKR/USDT', 'SUSHI/USDT', 'CRV/USDT', 'STORJ/USDT',
  'QTUM/USDT', 'ZIL/USDT', 'APT/USDT', 'RUNE/USDT',
  // Novos símbolos válidos
  'ARB/USDT', 'OP/USDT', '1000PEPE/USDT', 'SUI/USDT', 'SEI/USDT', 'S/USDT',
  'RENDER/USDT', 'WLD/USDT', 'TIA/USDT', 'JUP/USDT', 'PYTH/USDT',
  'JTO/USDT', '1000BONK/USDT', 'WIF/USDT', 'ORDI/USDT', 'INJ/USDT',
  'BLUR/USDT', 'PENDLE/USDT', 'STRK/USDT', 'MEME/USDT', 'NOT/USDT',

  // ➕ Ativos adicionais sugeridos para scalping (boa liquidez em perp):
  '1000FLOKI/USDT', 'ENA/USDT', 'AEVO/USDT', 'ONDO/USDT', 'JASMY/USDT'
  // Observação: mantenha apenas se houver suporte na(s) exchange(s) alvo do bot.
];

// Timeframes para análise (mantidos)
export const TIMEFRAMES = ['1m', '5m'];

// Configurações de indicadores técnicos (mantidas)
export const INDICATORS_CONFIG = {
  RSI: { period: 10 },
  MACD: { fastPeriod: 10, slowPeriod: 22, signalPeriod: 7 },
  ICHIMOKU: { conversionPeriod: 7, basePeriod: 22, spanPeriod: 44 },
  MA_SHORT: { period: 14 },
  MA_LONG: { period: 180 },
  BOLLINGER: { period: 18, stdDev: 1.8 },
  VOLUME_MA: { period: 14 }
};

// Configurações de pontuação (mantidas + compat fix)
export const SCORING_WEIGHTS = {
  RSI_OVERSOLD: 35,
  RSI_OVERBOUGHT: -45,
  MACD_BULLISH: 40,
  MACD_BEARISH: -50,
  ICHIMOKU_BULLISH: 25,
  ICHIMOKU_BEARISH: -30,
  RSI_DIVERGENCE: 30,
  MA_BULLISH: 20,
  MA_BEARISH: -25,
  BOLLINGER_BREAKOUT: 25,
  PATTERN_BREAKOUT: 25,
  PATTERN_REVERSAL: 40,
  VOLUME_CONFIRMATION: 30,
  // Usado como multiplicador de probabilidade (0–1) × 100
  ML_WEIGHT: 0.6,
  // ➕ Compatibilidade com AdaptiveScoring.getIndicatorPerformanceReport
  // (evita this.weights[indicator] undefined ao trackear correlação BTC)
  BITCOIN_CORRELATION: 0
};

// Configurações de trading (ajustadas para scalping 1m/5m)
export const TRADING_CONFIG = {
  // Probabilidade mínima do sinal (score → prob)
  MIN_SIGNAL_PROBABILITY: 70,

  // 🎯 Alvos menores para scalp; melhora taxa de acerto e giro
  TARGET_PERCENTAGES: [0.4, 0.8, 1.2, 1.6], // em %

  // 🛑 Stop mais apertado para candles curtos
  STOP_LOSS_PERCENTAGE: 1.3, // em %

  // 📈 Volatilidade mínima (recom.: ATR% no 5m). 1.2% é mais realista que 7% para scalp.
  // Definição: VOLATILITY_THRESHOLD interpreta-se como (ATR/close * 100) no timeframe de referência.
  VOLATILITY_THRESHOLD: 1.2,

  QUALITY_FILTERS: {
    // Volume atual vs. média(14). Mais alto evita rompimento “oco”.
    MIN_VOLUME_RATIO: 0.8,

    // RSI extremos padrão; ajuste dinâmico pode ser aplicado no runtime conforme regime.
    MIN_RSI_EXTREME: 20,
    MAX_RSI_EXTREME: 80,

    // Força mínima do MACD (mantida); recomendo normalizar no cálculo (abs(hist)/close) no código.
    MIN_MACD_STRENGTH: 0.00001,

    // Confiança mínima em padrões (triângulos, bandeiras, M/W etc.)
    MIN_PATTERN_CONFIDENCE: 25,

    // Requer confluência real: ex. RSI extremo + BB breakout + volume
    REQUIRE_MULTIPLE_CONFIRMATIONS: true,
    MIN_CONFIRMATIONS: 2, // ↑ de 1 para 2 para reduzir falso positivo em 1m

    // Blacklist de pares de baixo desempenho histórico
    BLACKLIST_LOW_PERFORMERS: true, // ativado

    // Mínimo de trades históricos por par para considerar desempenho
    MIN_HISTORICAL_PERFORMANCE: 20
  },

  COUNTER_TREND: {
    MIN_REVERSAL_STRENGTH: 45,
    EXTREME_REVERSAL_THRESHOLD: 65,
    PENALTY_WEAK_REVERSAL: 0.8,
    BONUS_STRONG_REVERSAL: 1.3,
    BONUS_EXTREME_REVERSAL: 1.4,
    SIDEWAYS_BREAKOUT_BONUS: 1.3,

    // Evita overtrading de reversão
    MAX_COUNTER_TREND_PER_DAY: 8,
    COUNTER_TREND_COOLDOWN: 30 * 60 * 1000, // 30 min

    // Usa 15m/30m como “bússola” da tendência enquanto entra no 1m/5m
    SHORT_TERM_TIMEFRAMES: ['5m', '15m', '30m'],
    SHORT_TERM_BONUS: 1.3,

    MIN_SHORT_TERM_RSI_EXTREME: 20,
    MAX_SHORT_TERM_RSI_EXTREME: 80,

    // Exigir pico de volume no candle de reversão/rompimento
    REQUIRE_VOLUME_SPIKE: true,
    MIN_VOLUME_SPIKE: 1.8, // ↑ de 1.5 para 1.8

    DIVERGENCE_BONUS: 35,
    PATTERN_REVERSAL_BONUS: 30
  }
};

// 🔒 Rate limit lógico para emissão de sinais (garante no máximo 1 sinal/2h)
export const RATE_LIMITING = {
  GLOBAL_SIGNAL_COOLDOWN_MS: 2 * 60 * 60 * 1000, // 2 horas
  MAX_SIGNALS_PER_WINDOW: 1,                     // 1 sinal por janela
  SCOPE: 'global'                                 // 'global' | 'por-par' (ajuste conforme necessidade)
};

// Configurações de agendamento
export const SCHEDULE_CONFIG = {
  // Mantido conforme sua estratégia: analisar a cada 2 horas e emitir no máx. 1 sinal/2h (com RATE_LIMITING)
  SIGNAL_ANALYSIS: '0 */2 * * *',      // A cada 2 horas
  MARKET_SENTIMENT: '0 11,23 * * *'    // A cada 12 horas (11h e 23h UTC = 8h e 20h Brasília)
};
