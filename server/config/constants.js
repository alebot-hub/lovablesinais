/**
 * Configurações e constantes do sistema
 */

// Lista das 70 principais criptomoedas de futuros perpétuos (excluindo stablecoins)
export const CRYPTO_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
  'DOGE/USDT', 'SOL/USDT', 'TRX/USDT', 'DOT/USDT', 'POL/USDT',
  'LTC/USDT', '1000SHIB/USDT', 'AVAX/USDT', 'UNI/USDT', 'ATOM/USDT',
  'LINK/USDT', 'ETC/USDT', 'XLM/USDT', 'BCH/USDT', 'NEAR/USDT',
  'ALGO/USDT', 'VET/USDT', 'ICP/USDT', 'FIL/USDT', 'APE/USDT',
  'MANA/USDT', 'SAND/USDT', 'LRC/USDT', 'AXS/USDT', 'THETA/USDT',
  'AAVE/USDT', 'EOS/USDT', 'FLOW/USDT', 'CAKE/USDT', 'GRT/USDT',
  'CHZ/USDT', 'ENJ/USDT', 'ZEC/USDT', 'COMP/USDT', 'YFI/USDT',
  'SNX/USDT', 'MKR/USDT', 'SUSHI/USDT', 'CRV/USDT', 'STORJ/USDT',
  'QTUM/USDT', 'ZIL/USDT', 'WAVES/USDT', 'FTM/USDT', 'RUNE/USDT',
  // Novos símbolos válidos
  'ARB/USDT', 'OP/USDT', 'PEPE/USDT', 'SUI/USDT', 'SEI/USDT', 'S/USDT',
  'RENDER/USDT', 'WLD/USDT', 'TIA/USDT', 'JUP/USDT', 'PYTH/USDT',
  'JTO/USDT', '1000PEPE/USDT', '1000BONK/USDT', 'WIF/USDT', 'ORDI/USDT', 'INJ/USDT',
  'BLUR/USDT', 'PENDLE/USDT', 'STRK/USDT', 'MEME/USDT', 'NOT/USDT'
]

// Timeframes para análise
export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];

// Configurações de indicadores técnicos
export const INDICATORS_CONFIG = {
  RSI: { period: 14 },
  MACD: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  ICHIMOKU: { conversionPeriod: 9, basePeriod: 26, spanPeriod: 52 },
  MA_SHORT: { period: 21 },
  MA_LONG: { period: 200 },
  BOLLINGER: { period: 20, stdDev: 2 },
  VOLUME_MA: { period: 20 }
};

// Configurações de pontuação
export const SCORING_WEIGHTS = {
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

// Configurações de trading
export const TRADING_CONFIG = {
  MIN_SIGNAL_PROBABILITY: 70, // Threshold mais alto para garantir qualidade
  TARGET_PERCENTAGES: [1.5, 3.0, 4.5, 6.0, 7.5, 9.0],
  STOP_LOSS_PERCENTAGE: 4.5, // Sempre positivo - direção aplicada no cálculo
  VOLATILITY_THRESHOLD: 5.0, // Threshold para alertas de volatilidade
  
  // Configurações específicas para sinais contra-tendência
  COUNTER_TREND: {
    MIN_REVERSAL_STRENGTH: 85, // Força alta para aceitar contra-tendência
    EXTREME_REVERSAL_THRESHOLD: 95, // Threshold para reversão EXTREMA
    PENALTY_WEAK_REVERSAL: 0.3, // Penalidade severa para reversões fracas (70% redução)
    BONUS_STRONG_REVERSAL: 1.05, // Bônus pequeno para reversões fortes (5% aumento)
    BONUS_EXTREME_REVERSAL: 1.15, // Bônus moderado para reversões extremas (15% aumento)
    SIDEWAYS_BREAKOUT_BONUS: 1.25, // Bônus para breakouts em mercado lateral
    MAX_COUNTER_TREND_PER_DAY: 3, // Máximo 3 sinais contra-tendência por dia
    COUNTER_TREND_COOLDOWN: 4 * 60 * 60 * 1000, // 4 horas entre sinais contra-tendência
    SHORT_TERM_TIMEFRAMES: ['5m', '15m'], // Timeframes para correções de curto prazo
    SHORT_TERM_BONUS: 1.20, // Bônus para sinais de curto prazo (20% aumento)
    MIN_SHORT_TERM_RSI_EXTREME: 15, // RSI deve ser muito extremo para 5m/15m
    MAX_SHORT_TERM_RSI_EXTREME: 85, // RSI máximo para sinais de curto prazo
    REQUIRE_VOLUME_SPIKE: true, // Exige pico de volume para contra-tendência
    MIN_VOLUME_SPIKE: 2.0, // Volume deve ser 2x acima da média
    DIVERGENCE_BONUS: 25, // Bônus extra para divergências em contra-tendência
    PATTERN_REVERSAL_BONUS: 20 // Bônus para padrões de reversão clássicos
  },
  
  // Configurações de qualidade de sinal
  QUALITY_FILTERS: {
    MIN_VOLUME_RATIO: 1.2, // Volume deve ser 20% acima da média
    MIN_RSI_EXTREME: 25, // RSI deve ser mais extremo para sinais
    MAX_RSI_EXTREME: 75, // RSI máximo para sinais
    MIN_MACD_STRENGTH: 0.001, // MACD deve ter força mínima
    MIN_PATTERN_CONFIDENCE: 80, // Padrões devem ter alta confiança
    REQUIRE_MULTIPLE_CONFIRMATIONS: true, // Exige múltiplas confirmações
    MIN_CONFIRMATIONS: 3, // Mínimo 3 indicadores confirmando
    BLACKLIST_LOW_PERFORMERS: true, // Remove ativos com baixa performance
    MIN_HISTORICAL_PERFORMANCE: 60 // Performance histórica mínima (%)
  }
};

// Configurações de agendamento
export const SCHEDULE_CONFIG = {
  SIGNAL_ANALYSIS: '0 */2 * * *', // A cada 2 horas (reduzido para evitar rate limit)
  BITCOIN_ANALYSIS: '0 */4 * * *', // A cada 4 horas
  MARKET_SENTIMENT: '0 0,6,12,18 * * *', // A cada 6 horas (0h, 6h, 12h, 18h UTC)
  VOLATILITY_CHECK: '*/30 * * * *' // A cada 30 minutos (reduzido)
};