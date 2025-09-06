/**
 * Configurações e constantes do sistema
 */

// Lista das 70 principais criptomoedas de futuros perpétuos (excluindo stablecoins)
// OBS: Mantido exatamente conforme solicitado; apenas removida a duplicidade de 1000PEPE/USDT
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
  'QTUM/USDT', 'ZIL/USDT', 'APT/USDT', 'RUNE/USDT',
  // Novos símbolos válidos
  'ARB/USDT', 'OP/USDT', '1000PEPE/USDT', 'SUI/USDT', 'SEI/USDT', 'S/USDT',
  'RENDER/USDT', 'WLD/USDT', 'TIA/USDT', 'JUP/USDT', 'PYTH/USDT',
  'JTO/USDT', '1000BONK/USDT', 'WIF/USDT', 'ORDI/USDT', 'INJ/USDT',
  'BLUR/USDT', 'PENDLE/USDT', 'STRK/USDT', 'MEME/USDT', 'NOT/USDT'
];

// Timeframes para análise (mantidos)
export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];

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

// Configurações de trading (mantidas)
export const TRADING_CONFIG = {
  MIN_SIGNAL_PROBABILITY: 70,
  TARGET_PERCENTAGES: [1.5, 3.0, 4.5, 6.0, 7.5, 9.0],
  STOP_LOSS_PERCENTAGE: 3.0,
  VOLATILITY_THRESHOLD: 7.0,
  QUALITY_FILTERS: {
    MIN_VOLUME_RATIO: 0.4,
    MIN_RSI_EXTREME: 20,
    MAX_RSI_EXTREME: 80,
    MIN_MACD_STRENGTH: 0.00001,
    MIN_PATTERN_CONFIDENCE: 25,
    REQUIRE_MULTIPLE_CONFIRMATIONS: true,
    MIN_CONFIRMATIONS: 1,
    BLACKLIST_LOW_PERFORMERS: false,
    MIN_HISTORICAL_PERFORMANCE: 20
  },
  COUNTER_TREND: {
    MIN_REVERSAL_STRENGTH: 45,
    EXTREME_REVERSAL_THRESHOLD: 65,
    PENALTY_WEAK_REVERSAL: 0.8,
    BONUS_STRONG_REVERSAL: 1.3,
    BONUS_EXTREME_REVERSAL: 1.4,
    SIDEWAYS_BREAKOUT_BONUS: 1.3,
    MAX_COUNTER_TREND_PER_DAY: 8,
schedule.scheduleJob('0 */2 * * *', async () => {
    SHORT_TERM_TIMEFRAMES: ['5m', '15m', '30m'],
    console.log('\n🔍 ===== INICIANDO ANÁLISE DE SCALPING (2H) =====');
    MIN_SHORT_TERM_RSI_EXTREME: 20,
    console.log('📊 Analisando 72 símbolos em scalping (1m/5m)...');
    REQUIRE_VOLUME_SPIKE: true,
    MIN_VOLUME_SPIKE: 1.5,
    DIVERGENCE_BONUS: 35,
    console.error('❌ Erro na análise de scalping:', error);
  }
};

// Configurações de agendamento
export const SCHEDULE_CONFIG = {
  SIGNAL_ANALYSIS: '0 * * * *',       // A cada 1 hora
  MARKET_SENTIMENT: '0 11,23 * * *'   // A cada 12 horas (11h e 23h UTC = 8h e 20h Brasília)
};
