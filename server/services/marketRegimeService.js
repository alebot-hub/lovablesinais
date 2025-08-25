/**
 * Serviço para identificação do regime de mercado
 */

import technicalAnalysis from './technicalAnalysis.js';

class MarketRegimeService {
  constructor(binanceService) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis; // Usando a instância importada diretamente
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
      
      if (!ohlcvData || !ohlcvData.close || ohlcvData.close.length === 0) {
        throw new Error('Dados de OHLCV vazios ou inválidos');
      }
      
      // Prepara os dados no formato esperado
      const formattedData = {
        open: ohlcvData.open,
        high: ohlcvData.high,
        low: ohlcvData.low,
        close: ohlcvData.close,
        volume: ohlcvData.volume || Array(ohlcvData.close.length).fill(0)
      };
      
      // Calcula indicadores - usando calculateMA em vez de calculateSMA
      const rsi = this.technicalAnalysis.calculateRSI(formattedData, 14);
      const ma200 = this.technicalAnalysis.calculateMA(ohlcvData.close, 200);
      
      // Cálculo simplificado de volatilidade
      const returns = ohlcvData.close.slice(1).map((c, i) => (c - ohlcvData.close[i]) / ohlcvData.close[i]);
      const volatility = returns.length > 0 ? 
        Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length) : 0;
      
      const lastClose = ohlcvData.close[ohlcvData.close.length-1] || 0;
      
      // Se ma200 for um array, pega o último valor, senão usa o valor direto
      const lastMA200 = Array.isArray(ma200) ? ma200[ma200.length-1] : ma200;
      
      return {
        price: lastClose,
        rsi: rsi || 50, // Valor padrão se RSI não puder ser calculado
        ma200: lastMA200 || 0,
        volatility: volatility || 0,
        trend: !lastMA200 ? 'NEUTRAL' : 
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
