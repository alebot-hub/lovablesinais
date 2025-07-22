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
  VOLATILITY_THRESHOLD: 5.0 // Threshold para alertas de volatilidade
};

// Configurações de agendamento
export const SCHEDULE_CONFIG = {
  SIGNAL_ANALYSIS: '0 * * * *', // A cada hora
  BITCOIN_ANALYSIS: '0 */4 * * *', // A cada 4 horas
  MARKET_SENTIMENT: '0 */6 * * *', // A cada 6 horas
  VOLATILITY_CHECK: '*/15 * * * *' // A cada 15 minutos
};