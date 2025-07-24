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
export const TIMEFRAMES = ['15m', '1h', '4h', '1d'];

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
  MIN_SIGNAL_PROBABILITY: 70, // Threshold mínimo para sinais de alta qualidade
  TARGET_PERCENTAGES: [1.5, 3.0, 4.5, 6.0, 7.5, 9.0],
  STOP_LOSS_PERCENTAGE: -4.5,
  VOLATILITY_THRESHOLD: 5.0, // Threshold para alertas de volatilidade
  
  // Configurações específicas para sinais contra-tendência
  COUNTER_TREND: {
    MIN_REVERSAL_STRENGTH: 95, // Força MUITO alta para aceitar contra-tendência
    EXTREME_REVERSAL_THRESHOLD: 98, // Threshold para reversão EXTREMA
    PENALTY_WEAK_REVERSAL: 0.3, // Penalidade severa para reversões fracas (70% redução)
    BONUS_STRONG_REVERSAL: 1.05, // Bônus pequeno para reversões fortes (5% aumento)
    BONUS_EXTREME_REVERSAL: 1.10, // Bônus moderado para reversões extremas (10% aumento)
    SIDEWAYS_BREAKOUT_BONUS: 1.25, // Bônus para breakouts em mercado lateral
    MAX_COUNTER_TREND_PER_DAY: 1, // Máximo 1 sinal contra-tendência por dia
    COUNTER_TREND_COOLDOWN: 6 * 60 * 60 * 1000 // 6 horas entre sinais contra-tendência
  }
};

// Configurações de agendamento
export const SCHEDULE_CONFIG = {
  SIGNAL_ANALYSIS: '0 */2 * * *', // A cada 2 horas (reduzido para evitar rate limit)
  BITCOIN_ANALYSIS: '0 */4 * * *', // A cada 4 horas
  MARKET_SENTIMENT: '0 0,6,12,18 * * *', // A cada 6 horas (0h, 6h, 12h, 18h UTC)
  VOLATILITY_CHECK: '*/30 * * * *' // A cada 30 minutos (reduzido)
};