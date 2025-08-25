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
      
      // Ajuste nos limiares para refletir melhor o mercado em alta
      const isStrongUptrend = btcDaily.trend === 'UP' && btcDaily.rsi > 55; // Reduzido de 60 para 55
      const isPriceAboveMA = btcDaily.price > btcDaily.ma200 * 1.03; // Reduzido de 5% para 3% acima da MA200
      const isStrongDowntrend = btcDaily.trend === 'DOWN' && btcDaily.rsi < 45;
      
      // Tendência de alta - mais sensível
      if (isStrongUptrend) {
        regimeScores.BULL += 2; // Peso maior para tendências fortes
        if (isPriceAboveMA) regimeScores.BULL += 1; // Adiciona ponto extra se estiver acima da MA200
      } else if (btcDaily.trend === 'UP' && btcDaily.rsi > 50) { // Reduzido de 55 para 50
        regimeScores.BULL += 1;
      }
      
      // Tendência de baixa - mantido mais conservador
      if (isStrongDowntrend) {
        regimeScores.BEAR += 2;
      } else if (btcDaily.trend === 'DOWN' && btcDaily.rsi < 45) {
        regimeScores.BEAR += 1;
      }
      
      // Mercado volátil - apenas se não houver tendência clara
      const hasClearTrend = isStrongUptrend || isStrongDowntrend;
      if (!hasClearTrend) {
        if (btcDaily.volatility > 0.02) regimeScores.VOLATILE += 1; // Reduzido o limiar de volatilidade
        if (fearGreed >= 70 || fearGreed <= 30) regimeScores.VOLATILE += 1; // Ajustado os limiares de medo/ganância
      }

      // Se houver uma tendência clara, reduz a chance de ser classificado como NORMAL
      if (hasClearTrend || btcDaily.price > btcDaily.ma200 * 1.03) {
        regimeScores.NORMAL = -1;
      }

      // Determina o regime com maior pontuação
      let newRegime = 'NORMAL';
      let maxScore = Math.max(...Object.values(regimeScores));
      
      // Só muda para um novo regime se a pontuação for pelo menos 1
      if (maxScore >= 1) {
        newRegime = Object.entries(regimeScores).find(([_, v]) => v === maxScore)[0];
      }

      // Log detalhado para debug
      console.log('📊 Pontuação dos regimes:', {
        scores: regimeScores,
        selected: newRegime,
        btcTrend: btcDaily.trend,
        rsi: btcDaily.rsi,
        priceVsMA: ((btcDaily.price / btcDaily.ma200 - 1) * 100).toFixed(2) + '%',
        volatility: btcDaily.volatility,
        fearGreed,
        ma200: btcDaily.ma200,
        currentPrice: btcDaily.price
      });

      this.regime = newRegime;
      this.lastUpdate = new Date();
      
      return {
        regime: newRegime,
        btcTrend: btcDaily.trend,
        rsi: btcDaily.rsi,
        volatility: btcDaily.volatility,
        fearGreedIndex: fearGreed,
        btcDominance,
        scores: regimeScores // Incluindo scores no retorno para análise
      };
      
    } catch (error) {
      console.error('❌ Erro ao identificar regime de mercado:', error);
      return { regime: 'NORMAL', error: error.message };
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
