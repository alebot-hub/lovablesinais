/**
 * Serviço para identificação do regime de mercado
 */

class MarketRegimeService {
  constructor(binanceService, technicalAnalysis) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis;
    this.regime = 'NORMAL'; // BULL, BEAR, VOLATILE, NORMAL
    this.lastUpdate = null;
  }

  /**
   * Identifica o regime de mercado atual
   */
  async identifyMarketRegime() {
    try {
      console.log('🔍 Identificando regime de mercado...');
      
      const [btcDaily, fearGreed, btcDominance] = await Promise.all([
        this.getBTCMetrics('1d'),
        this.getFearGreedIndex(),
        this.getBTCDominance()
      ]);

      // Análise de tendência e volatilidade
      let regimeScores = { BULL: 0, BEAR: 0, VOLATILE: 0, NORMAL: 0 };
      
      // Tendência de alta
      if (btcDaily.trend === 'UP' && btcDaily.rsi > 55) regimeScores.BULL += 2;
      if (btcDaily.price > btcDaily.ma200 * 1.05) regimeScores.BULL += 1;
      
      // Tendência de baixa
      if (btcDaily.trend === 'DOWN' && btcDaily.rsi < 45) regimeScores.BEAR += 2;
      if (btcDaily.price < btcDaily.ma200 * 0.95) regimeScores.BEAR += 1;
      
      // Mercado volátil
      if (btcDaily.volatility > 0.03) regimeScores.VOLATILE += 2;
      if (fearGreed >= 80 || fearGreed <= 20) regimeScores.VOLATILE += 1;

      // Determina o regime com maior pontuação
      let newRegime = 'NORMAL';
      let maxScore = Math.max(...Object.values(regimeScores));
      
      if (maxScore > 1) {
        newRegime = Object.entries(regimeScores).find(([_, v]) => v === maxScore)[0];
      }

      this.regime = newRegime;
      this.lastUpdate = new Date();
      
      console.log(`✅ Regime de mercado: ${this.regime}`);
      return this.regime;
      
    } catch (error) {
      console.error('❌ Erro ao identificar regime:', error.message);
      return 'NORMAL';
    }
  }

  /**
   * Obtém métricas do BTC
   */
  async getBTCMetrics(timeframe) {
    try {
      // Usando getOHLCVData em vez de getCandles
      const ohlcvData = await this.binanceService.getOHLCVData('BTC/USDT', timeframe, 200);
      
      // Extrai os preços de fechamento do OHLCV
      const closes = ohlcvData.close || [];
      
      // Calcula indicadores
      const rsi = this.technicalAnalysis.calculateRSI({ close: closes }, 14);
      const ma200 = this.technicalAnalysis.calculateSMA(closes, 200);
      
      // Cálculo simplificado de volatilidade
      const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
      const volatility = returns.length > 0 ? 
        Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length) : 0;
      
      const lastClose = closes[closes.length-1] || 0;
      const lastMA200 = ma200[ma200.length-1] || 0;
      
      return {
        price: lastClose,
        rsi: rsi || 50, // Valor padrão se RSI não puder ser calculado
        ma200: lastMA200,
        volatility: volatility || 0,
        trend: lastMA200 === 0 ? 'NEUTRAL' : 
               lastClose > lastMA200 * 1.02 ? 'UP' : 
               lastClose < lastMA200 * 0.98 ? 'DOWN' : 'NEUTRAL'
      };
      
    } catch (error) {
      console.error(`❌ Erro ao obter métricas BTC (${timeframe}):`, error.message);
      return { 
        price: 0, 
        rsi: 50, 
        ma200: 0, 
        volatility: 0, 
        trend: 'NEUTRAL' 
      };
    }
  }

  /**
   * Índice de medo e ganância (simulado)
   */
  async getFearGreedIndex() {
    try {
      // Implementar chamada real para API de Fear & Greed
      return Math.floor(Math.random() * 100);
    } catch (error) {
      console.error('Erro ao obter índice F&G:', error.message);
      return 50;
    }
  }

  /**
   * Dominância do BTC (simulado)
   */
  async getBTCDominance() {
    try {
      // Implementar chamada real para API de dominância
      return 40 + Math.random() * 20; // Entre 40% e 60%
    } catch (error) {
      console.error('Erro ao obter dominância BTC:', error.message);
      return 50;
    }
  }

  /**
   * Obtém o regime atual
   */
  getCurrentRegime() {
    // Se os dados estiverem desatualizados (mais de 1 hora), força nova identificação
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    
    if (!this.lastUpdate || this.lastUpdate < oneHourAgo) {
      this.identifyMarketRegime(); // Atualiza em segundo plano
    }
    
    return this.regime;
  }
}

export default MarketRegimeService;
