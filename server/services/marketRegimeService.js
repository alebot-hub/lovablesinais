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
   * Determina o regime de mercado atual
   */
  async determineMarketRegime(symbol = 'BTC/USDT', timeframe = '1d') {
    try {
      // Ajusta o número de candles baseado no timeframe para pegar um período razoável
      let limit = 200; // padrão
      
      // Ajusta o limite de candles baseado no timeframe para pegar aproximadamente 3 meses de dados
      const timeframeToCandles = {
        '1m': 60 * 24 * 90,    // ~3 meses de dados
        '5m': 12 * 24 * 90,    // ~3 meses de dados
        '15m': 4 * 24 * 90,    // ~3 meses de dados
        '1h': 24 * 90,         // ~3 meses de dados
        '4h': 6 * 30 * 3,      // ~3 meses de dados
        '1d': 90,              // 3 meses de dados
        '1w': 52               // ~1 ano de dados
      };
      
      limit = Math.min(limit, timeframeToCandles[timeframe] || 200);
      
      console.log(`📊 Analisando regime de mercado para ${symbol} (${timeframe}) com ${limit} candles`);
      
      // Obtém os dados de preço
      const data = await this.binanceService.getOHLCVData(symbol, timeframe, limit);
      
      if (!data || !data.close || data.close.length === 0) {
        console.warn(`⚠️ Dados insuficientes para determinar o regime de mercado para ${symbol}`);
        return {
          regime: 'NORMAL',
          confidence: 0,
          indicators: {}
        };
      }
      
      // Registra o período dos dados para debug
      const firstDate = new Date(data.timestamp[0]);
      const lastDate = new Date(data.timestamp[data.timestamp.length - 1]);
      console.log(`📅 Período dos dados: ${firstDate.toISOString()} até ${lastDate.toISOString()}`);
      
      // Calcula os indicadores
      const indicators = await this.technicalAnalysis.calculateIndicators(data, symbol, timeframe);
      
      // Log detalhado dos indicadores recebidos
      console.log('📊 Indicadores recebidos:', {
        hasRSI: !!indicators?.rsi,
        hasMA200: !!indicators?.ma200,
        hasMA21: !!indicators?.ma21,
        hasMACD: !!indicators?.macd,
        indicators: indicators ? Object.keys(indicators) : 'Nenhum indicador retornado'
      });
      
      // Se não tivermos indicadores suficientes, retorna NORMAL
      if (!indicators || indicators.rsi === undefined || indicators.ma200 === undefined) {
        console.warn('⚠️ Indicadores insuficientes para determinar o regime de mercado. Verifique os logs acima para mais detalhes.');
        return {
          regime: 'NORMAL',
          confidence: 0,
          indicators: indicators || {}
        };
      }
      
      // Obtém o preço atual e a média móvel de 200 períodos
      const currentPrice = data.close[data.close.length - 1];
      let ma200 = indicators.ma200;
      
      // Se não temos MA200, tentamos calcular com os dados disponíveis
      if (ma200 === null || ma200 === undefined) {
        console.warn('⚠️ MA200 não disponível, tentando calcular com dados disponíveis...');
        const availablePeriod = Math.min(200, data.close.length);
        if (availablePeriod >= 10) { // Mínimo de 10 períodos
          const prices = data.close.slice(-availablePeriod);
          ma200 = prices.reduce((sum, price) => sum + price, 0) / prices.length;
          console.log(`✅ MA calculada com ${availablePeriod} períodos: ${ma200}`);
        } else {
          console.warn('⚠️ Dados insuficientes para cálculo alternativo do MA200');
        }
      }
      
      // Verifica se o MA200 é válido antes de calcular a porcentagem
      let priceVsMA = 0;
      if (ma200 && ma200 > 0) {
        priceVsMA = ((currentPrice - ma200) / ma200) * 100;
        console.log(`📈 Preço atual: ${currentPrice}, MA: ${ma200.toFixed(2)}, Diferença: ${priceVsMA.toFixed(2)}%`);
      } else {
        console.warn(`⚠️ MA inválido (${ma200}), usando 0% para cálculo do regime`);
      }
      
      // Calcula a volatilidade (desvio padrão dos retornos percentuais)
      const returns = [];
      for (let i = 1; i < data.close.length; i++) {
        if (data.close[i-1] > 0) { // Evita divisão por zero
          const ret = (data.close[i] - data.close[i - 1]) / data.close[i - 1];
          returns.push(ret);
        }
      }
      
      // Garante que temos retornos suficientes para calcular a volatilidade
      let volatility = 0;
      if (returns.length > 1) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
        volatility = Math.sqrt(variance);
      } else {
        console.warn('⚠️ Dados insuficientes para cálculo preciso da volatilidade');
      }
      
      // Log detalhado para diagnóstico
      console.log('📊 Dados para cálculo do regime:', {
        currentPrice,
        ma200,
        priceVsMA: `${priceVsMA.toFixed(2)}%`,
        volatility: `${(volatility * 100).toFixed(2)}%`,
        returnsCount: returns.length,
        indicators: Object.keys(indicators).filter(k => indicators[k] !== undefined)
      });
      
      // Obtém o índice de medo e ganância (simulado, substitua por uma API real se possível)
      const fearGreed = await this.getFearGreedIndex();
      
      // Calcula os escores para cada regime
      const scores = {
        BULL: 0,
        BEAR: 0,
        VOLATILE: 0,
        NORMAL: 0
      };
      
      // 1. Tendência de preço (MA200)
      if (priceVsMA > 1) scores.BULL += 1;      // Preço acima da MA200
      else if (priceVsMA < -1) scores.BEAR += 1; // Preço abaixo da MA200
      
      // 2. RSI
      const rsi = indicators.rsi;
      if (rsi > 60) scores.BULL += 1;           // Tendência de alta
      else if (rsi < 40) scores.BEAR += 1;       // Tendência de baixa
      
      // 3. Volatilidade (ajustado para o timeframe diário)
      const volatilityThreshold = 0.015; // 1.5% de desvio padrão
      if (volatility > volatilityThreshold) {
        scores.VOLATILE += 1;
        // Em mercados voláteis, podemos ter tanto alta quanto baixa
        if (priceVsMA > 0) scores.BULL += 0.5;
        else scores.BEAR += 0.5;
      } else {
        // Em mercados estáveis, tendência atual se fortalece
        if (priceVsMA > 0) scores.BULL += 0.5;
        else if (priceVsMA < 0) scores.BEAR += 0.5;
      }
      
      // 4. Medo e Ganância (ajustado para ser menos sensível)
      if (fearGreed > 75) {
        scores.BULL += 1;      // Muita ganância (cuidado com reversão)
        scores.VOLATILE += 0.5; // Mercado pode ficar volátil
      } else if (fearGreed < 25) {
        scores.BEAR += 1;      // Muito medo (oportunidade de compra?)
        scores.VOLATILE += 0.5; // Mercado pode ficar volátil
      }
      
      // 5. Volume (se disponível)
      if (data.volume && data.volume.length > 10) {
        const recentVolumes = data.volume.slice(-20); // Últimos 20 candles
        const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
        const currentVolume = data.volume[data.volume.length - 1];
        
        if (currentVolume > avgVolume * 1.8) {
          scores.VOLATILE += 1; // Volume muito acima da média recente
          // Volume alto com preço subindo é forte sinal de alta
          if (currentPrice > data.close[data.close.length - 2]) scores.BULL += 0.5;
        }
      }
      
      // Garante que NORMAL sempre tenha pelo menos 1 ponto
      scores.NORMAL = 1;
      
      // Log detalhado para diagnóstico
      console.log('📊 Pontuação bruta dos regimes:', JSON.stringify(scores, null, 2));
      
      // Determina o regime com maior pontuação
      let maxScore = -Infinity;
      let selectedRegime = 'NORMAL';
      
      for (const [regime, score] of Object.entries(scores)) {
        if (score > maxScore) {
          maxScore = score;
          selectedRegime = regime;
        }
      }
      
      // Se o mercado está estável (baixa volatilidade) e próximo da média, força NORMAL
      if (volatility < volatilityThreshold / 2 && Math.abs(priceVsMA) < 0.5) {
        selectedRegime = 'NORMAL';
        maxScore = scores.NORMAL;
      }
      
      // Calcula a confiança baseada na diferença entre os escores
      const sortedScores = Object.entries(scores)
        .filter(([regime]) => regime !== 'NORMAL')
        .map(([regime, score]) => score)
        .sort((a, b) => b - a);
        
      let confidence = 0;
      if (selectedRegime === 'NORMAL') {
        // Para NORMAL, a confiança é baseada na proximidade com a média
        confidence = 100 - Math.min(100, Math.abs(priceVsMA) * 20);
      } else if (sortedScores.length > 1) {
        // Para outros regimes, baseia-se na diferença para o segundo colocado
        const diff = sortedScores[0] - (sortedScores[1] || 0);
        confidence = Math.min(100, 50 + (diff * 25)); // Entre 50% e 100%
      } else {
        confidence = 70; // Confiança padrão se não houver comparação
      }
      
      // Garante um mínimo de confiança
      confidence = Math.max(30, Math.min(100, confidence));
      
      console.log('📊 Pontuação dos regimes:', {
        scores,
        selected: selectedRegime,
        btcTrend: priceVsMA > 0 ? 'UP' : 'DOWN',
        rsi: rsi?.toFixed(2),
        priceVsMA: priceVsMA.toFixed(2) + '%',
        volatility,
        fearGreed,
        ma200: ma200?.toFixed(2),
        currentPrice
      });
      
      return {
        regime: selectedRegime,
        confidence,
        indicators: {
          rsi,
          ma200,
          priceVsMA,
          volatility,
          fearGreed
        }
      };
      
    } catch (error) {
      console.error('❌ Erro ao determinar o regime de mercado:', error);
      return {
        regime: 'NORMAL',
        confidence: 0,
        indicators: {}
      };
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
      this.determineMarketRegime(); // Atualiza em segundo plano
    }
    
    return this.regime;
  }
}

export default MarketRegimeService;
