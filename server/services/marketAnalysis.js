/**
 * Serviço de análise de mercado
 */

import { CRYPTO_SYMBOLS, TRADING_CONFIG } from '../config/constants.js';

class MarketAnalysisService {
  constructor(binanceService, technicalAnalysis, socialSentiment = null) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis;
    this.socialSentiment = socialSentiment;
  }

  /**
   * Analisa sentimento geral do mercado
   */
  async analyzeMarketSentiment() {
    try {
      console.log('Analisando sentimento do mercado...');

      const marketData = await this.getMarketOverview();
      const realFearGreed = await this.getRealFearGreedIndex();
      
      // Garante que valores numéricos são válidos
      if (!marketData.totalVolume || isNaN(marketData.totalVolume)) {
        marketData.totalVolume = 0;
      }
      
      // Obtém sentimento das redes sociais
      let socialSentiment = null;
      if (this.socialSentiment) {
        try {
          socialSentiment = await this.socialSentiment.analyzeSocialSentiment();
          console.log('✅ Sentimento social obtido:', socialSentiment.overall);
        } catch (error) {
          console.log('⚠️ Erro no sentimento social:', error.message);
        }
      }
      
      const sentiment = this.calculateSentiment(marketData);

      return {
        overall: sentiment.overall,
        fearGreedIndex: sentiment.fearGreedIndex,
        fearGreedLabel: sentiment.fearGreedLabel,
        totalVolume: Number(marketData.totalVolume) || 0,
        volatility: sentiment.volatility || 0,
        assetsUp: marketData.assetsUp,
        assetsDown: marketData.assetsDown,
        volumeVsAverage: sentiment.volumeVsAverage || 1,
        topMovers: marketData.topMovers,
        analysis: sentiment.analysis,
        socialSentiment: socialSentiment,
        cryptoMarketCap: {
          totalMarketCap: marketData.totalMarketCap,
          btcDominance: marketData.btcDominance,
          change24h: (Math.random() - 0.5) * 4, // -2% a +2%
          altcoinSeason: marketData.btcDominance < 45
        }
      };
    } catch (error) {
      console.error('Erro na análise de sentimento:', error.message);
      return null;
    }
  }

  /**
   * Obtém Fear & Greed Index real da API
   */
  async getRealFearGreedIndex() {
    try {
      console.log('Obtendo Fear & Greed Index real...');
      
      const response = await fetch('https://api.alternative.me/fng/');
      const data = await response.json();
      
      if (data && data.data && data.data[0]) {
        const fngData = data.data[0];
        console.log(`Fear & Greed Index: ${fngData.value} (${fngData.value_classification})`);
        
        return {
          value: parseInt(fngData.value),
          classification: this.translateFearGreedLabel(fngData.value_classification),
          timestamp: fngData.timestamp
        };
      }
      
      throw new Error('Dados inválidos da API');
    } catch (error) {
      console.error('Erro ao obter Fear & Greed Index real:', error.message);
      console.log('Usando valor simulado como fallback');
      
      // Fallback para valor simulado
      return {
        value: 50,
        classification: 'Neutro',
        timestamp: Date.now(),
        isSimulated: true
      };
    }
  }
  /**
   * Traduz labels do Fear & Greed Index
   */
  translateFearGreedLabel(label) {
    const translations = {
      'Extreme Fear': 'Medo Extremo',
      'Fear': 'Medo',
      'Neutral': 'Neutro',
      'Greed': 'Ganância',
      'Extreme Greed': 'Ganância Extrema'
    };
    return translations[label] || label;
  }

  /**
   * Obtém visão geral do mercado
   */
  async getMarketOverview() {
    const marketData = {
      totalVolume: 0,
      assetsUp: 0,
      assetsDown: 0,
      topMovers: [],
      volatilities: [],
      volumes: [],
      totalMarketCap: 0,
      btcDominance: 0
    };

    // Obtém dados reais do CoinGecko
    try {
      console.log('📊 Obtendo dados reais do mercado cripto...');
      
      // Dados globais do mercado
      const globalResponse = await fetch('https://api.coingecko.com/api/v3/global');
      const globalData = await globalResponse.json();
      
      if (globalData && globalData.data) {
        marketData.totalMarketCap = globalData.data.total_market_cap.usd / 1e12; // Trilhões
        marketData.btcDominance = globalData.data.market_cap_percentage.btc;
        marketData.totalVolume = Number(globalData.data.total_volume.usd) / 1e9 || 0; // Bilhões
        console.log(`✅ Dados reais obtidos: $${marketData.totalMarketCap.toFixed(2)}T, BTC: ${marketData.btcDominance.toFixed(1)}%`);
      }
      
      // Top 50 criptomoedas para análise de sentimento
      const coinsResponse = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h');
      const coinsData = await coinsResponse.json();
      
      if (coinsData && Array.isArray(coinsData)) {
        console.log(`📈 Analisando ${coinsData.length} criptomoedas...`);
        
        coinsData.forEach(coin => {
          const change24h = coin.price_change_percentage_24h || 0;
          const volume = coin.total_volume || 0;
          
          // Conta ativos em alta/baixa
          if (change24h > 0) {
            marketData.assetsUp++;
          } else {
            marketData.assetsDown++;
          }
          
          // Adiciona aos top movers se mudança significativa
          if (Math.abs(change24h) > 2) {
            marketData.topMovers.push({
              symbol: coin.symbol.toUpperCase() + '/USDT',
              name: coin.name,
              change: change24h,
              volume: Number(volume) || 0,
              marketCap: coin.market_cap || 0,
              volatility: Math.abs(change24h) / 10 // Aproximação da volatilidade
            });
          }
          
          marketData.volumes.push(Number(volume) || 0);
          marketData.volatilities.push(Math.abs(change24h) / 100);
        });
        
        // Ordena top movers por mudança absoluta
        marketData.topMovers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
        marketData.topMovers = marketData.topMovers.slice(0, 10);
        
        console.log(`✅ Análise completa: ${marketData.assetsUp} alta, ${marketData.assetsDown} baixa`);
      }
      
    } catch (error) {
      console.error('❌ Erro ao obter dados reais:', error.message);
      console.log('⚠️ Usando dados de fallback');
      
      // Fallback apenas se API falhar
      marketData.totalMarketCap = 3.5;
      marketData.btcDominance = 57;
      marketData.totalVolume = 50;
      marketData.assetsUp = 25;
      marketData.assetsDown = 25;
    }

    return marketData;
  }

  /**
   * Calcula sentimento baseado nos dados
   */
  calculateSentiment(marketData, realFearGreed = null) {
    const totalAssets = marketData.assetsUp + marketData.assetsDown;
    const bullishRatio = totalAssets > 0 ? marketData.assetsUp / totalAssets : 0.5;

    // Volatilidade média
    const avgVolatility = marketData.volatilities.length > 0 ?
      marketData.volatilities.reduce((sum, v) => sum + v, 0) / marketData.volatilities.length : 0;

    // Volume vs média histórica (simulado)
    const avgVolume = marketData.volumes.length > 0 ?
      marketData.volumes.reduce((sum, v) => sum + v, 0) / marketData.volumes.length : 0;
    const volumeVsAverage = avgVolume > 0 ? marketData.totalVolume / (avgVolume * marketData.volumes.length) : 1;

    // Usa Fear & Greed Index real ou simulado
    let fearGreedIndex = 50;
    let fearGreedLabel = 'Neutro';
    let isRealData = false;
    
    if (realFearGreed && !realFearGreed.isSimulated) {
      fearGreedIndex = realFearGreed.value;
      fearGreedLabel = realFearGreed.classification;
      isRealData = true;
      console.log(`Usando Fear & Greed real: ${fearGreedIndex} (${fearGreedLabel})`);
    } else {
      // Fallback para cálculo simulado
      if (bullishRatio > 0.6) fearGreedIndex += 20;
      if (bullishRatio < 0.4) fearGreedIndex -= 20;
      if (volumeVsAverage > 1.2) fearGreedIndex += 10;
      if (volumeVsAverage < 0.8) fearGreedIndex -= 10;
      if (avgVolatility > 0.05) fearGreedIndex -= 15;
      
      fearGreedIndex = Math.max(0, Math.min(100, fearGreedIndex));
      fearGreedLabel = this.getFearGreedLabel(fearGreedIndex);
      console.log(`Usando Fear & Greed simulado: ${fearGreedIndex} (${fearGreedLabel})`);
    }

    // Sentimento geral
    let overall = 'NEUTRO';
    if (bullishRatio > 0.6 && fearGreedIndex > 60) {
      overall = 'OTIMISTA';
    } else if (bullishRatio < 0.4 && fearGreedIndex < 40) {
      overall = 'PESSIMISTA';
    }

    // Análise textual
    const analysis = this.generateSentimentAnalysis(bullishRatio, avgVolatility, volumeVsAverage, fearGreedIndex, isRealData);

    return {
      overall,
      fearGreedIndex: Math.round(fearGreedIndex),
      fearGreedLabel,
      volatility: avgVolatility * 100,
      volumeVsAverage,
      analysis
    };
  }

  /**
   * Obtém label do Fear & Greed Index
   */
  getFearGreedLabel(index) {
    if (index >= 75) return 'Ganância Extrema';
    if (index >= 55) return 'Ganância';
    if (index >= 45) return 'Neutro';
    if (index >= 25) return 'Medo';
    return 'Medo Extremo';
  }
  /**
   * Gera análise textual do sentimento
   */
  generateSentimentAnalysis(bullishRatio, volatility, volumeRatio, fearGreed, isRealData = false) {
    let analysis = [];

    // Indica se está usando dados reais
    if (isRealData) {
      analysis.push('📊 Fear & Greed Index obtido em tempo real de alternative.me');
    } else {
      analysis.push('📊 Fear & Greed Index calculado com base em dados de mercado');
    }
    // Análise de direção
    if (bullishRatio > 0.7) {
      analysis.push('Mercado fortemente otimista com maioria dos ativos em alta');
    } else if (bullishRatio > 0.6) {
      analysis.push('Sentimento positivo predomina no mercado');
    } else if (bullishRatio < 0.3) {
      analysis.push('Mercado pessimista com pressão vendedora');
    } else if (bullishRatio < 0.4) {
      analysis.push('Sentimento negativo prevalece');
    } else {
      analysis.push('Mercado indeciso com movimentos laterais');
    }

    // Análise de volatilidade
    if (volatility > 0.06) {
      analysis.push('Alta volatilidade indica incerteza e oportunidades de swing trading');
    } else if (volatility < 0.02) {
      analysis.push('Baixa volatilidade sugere consolidação e possível breakout');
    } else {
      analysis.push('Volatilidade normal para operações de médio prazo');
    }

    // Análise de volume
    if (volumeRatio > 1.3) {
      analysis.push('Volume acima da média confirma movimentos atuais');
    } else if (volumeRatio < 0.7) {
      analysis.push('Volume baixo pode indicar falta de convicção');
    }

    // Fear & Greed
    if (fearGreed > 75) {
      analysis.push('Extrema ganância - cuidado com correções');
    } else if (fearGreed < 25) {
      analysis.push('Extremo medo - possíveis oportunidades de compra');
    }

    return analysis;
  }

  /**
   * Detecta alta volatilidade em tempo real
   */
  async detectHighVolatility() {
    const alerts = [];
    const symbols = CRYPTO_SYMBOLS.slice(0, 30); // Monitora top 30

    for (const symbol of symbols) {
      try {
        const data = await this.binanceService.getOHLCVData(symbol, '15m', 4);
        
        if (data.close.length >= 2) {
          const currentPrice = data.close[data.close.length - 1];
          const previousPrice = data.close[data.close.length - 2];
          const change = ((currentPrice - previousPrice) / previousPrice) * 100;

          if (Math.abs(change) >= TRADING_CONFIG.VOLATILITY_THRESHOLD) {
            alerts.push({
              symbol,
              change,
              currentPrice,
              timeframe: '15m',
              timestamp: new Date()
            });
          }
        }

        // Pausa para rate limit
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Erro ao verificar volatilidade de ${symbol}:`, error.message);
      }
    }

    return alerts;
  }

  /**
   * Analisa correlações entre ativos
   */
  async analyzeCorrelations() {
    try {
      const symbols = CRYPTO_SYMBOLS.slice(0, 10);
      const correlations = [];

      for (let i = 0; i < symbols.length; i++) {
        for (let j = i + 1; j < symbols.length; j++) {
          const symbol1 = symbols[i];
          const symbol2 = symbols[j];

          const data1 = await this.binanceService.getOHLCVData(symbol1, '1h', 50);
          const data2 = await this.binanceService.getOHLCVData(symbol2, '1h', 50);

          const returns1 = this.calculateReturns(data1.close);
          const returns2 = this.calculateReturns(data2.close);

          const correlation = this.calculateCorrelation(returns1, returns2);

          correlations.push({
            pair: `${symbol1}/${symbol2}`,
            correlation: correlation.toFixed(3)
          });

          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    } catch (error) {
      console.error('Erro ao calcular correlações:', error.message);
      return [];
    }
  }

  /**
   * Calcula retornos percentuais
   */
  calculateReturns(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * Calcula volatilidade (desvio padrão)
   */
  calculateVolatility(returns) {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calcula correlação entre dois arrays
   */
  calculateCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const meanX = x.slice(0, n).reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.slice(0, n).reduce((sum, val) => sum + val, 0) / n;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < n; i++) {
      const deltaX = x[i] - meanX;
      const deltaY = y[i] - meanY;
      
      numerator += deltaX * deltaY;
      sumXSquared += deltaX * deltaX;
      sumYSquared += deltaY * deltaY;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Identifica setores em alta/baixa
   */
  categorizeBySector() {
    // Categorização simplificada por tipo de projeto
    const sectors = {
      'DeFi': ['UNI/USDT', 'AAVE/USDT', 'SUSHI/USDT', 'CRV/USDT', 'COMP/USDT', 'YFI/USDT'],
      'Layer1': ['BTC/USDT', 'ETH/USDT', 'ADA/USDT', 'SOL/USDT', 'DOT/USDT'],
      'Gaming': ['AXS/USDT', 'MANA/USDT', 'SAND/USDT', 'ENJ/USDT'],
      'Meme': ['DOGE/USDT', '1000SHIB/USDT', 'PEPE/USDT', 'BONK/USDT', 'WIF/USDT'],
      'Exchange': ['BNB/USDT', 'S/USDT', 'KCS/USDT'],
      'AI/GPU': ['RENDER/USDT', 'WLD/USDT'],
      'Layer2': ['ARB/USDT', 'OP/USDT'],
      'Solana': ['SOL/USDT', 'JUP/USDT', 'JTO/USDT', 'PYTH/USDT'],
      'Cosmos': ['ATOM/USDT', 'TIA/USDT']
    };

    return sectors;
  }
}

export default MarketAnalysisService;