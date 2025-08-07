/**
 * Serviço de análise de mercado
 */

import { CRYPTO_SYMBOLS } from '../config/constants.js';
import CoinglassSentimentAnalyzer from './coinglassSentimentAnalyzer.js';

class MarketAnalysisService {
  constructor(binanceService, technicalAnalysis) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis;
    this.coinglassAnalyzer = new CoinglassSentimentAnalyzer();
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutos
  }

  /**
   * Analisa sentimento do mercado com dados reais
   */
  async analyzeMarketSentiment() {
    try {
      console.log('🌍 Iniciando análise de sentimento do mercado...');

      const [marketData, realFearGreed, altcoinSeasonData, newsData, socialData, btcSpecificData, ethSpecificData, coinglassData] = await Promise.allSettled([
        this.getMarketOverview(),
        this.getRealFearGreedIndex(),
        this.getAltcoinSeasonData(),
        this.getNewsAnalysis(),
        this.getSocialSentimentData(),
        this.getBitcoinSpecificSentiment(),
        this.getEthereumSpecificSentiment(),
        this.getCoinglassSentiment()
      ]);

      const marketOverview = marketData.status === 'fulfilled' ? marketData.value : null;
      const fearGreedData = realFearGreed.status === 'fulfilled' ? realFearGreed.value : null;
      const altcoinSeason = altcoinSeasonData.status === 'fulfilled' ? altcoinSeasonData.value : null;
      const newsAnalysis = newsData.status === 'fulfilled' ? newsData.value : null;
      const socialSentiment = socialData.status === 'fulfilled' ? socialData.value : null;
      const btcSentiment = btcSpecificData.status === 'fulfilled' ? btcSpecificData.value : null;
      const ethSentiment = ethSpecificData.status === 'fulfilled' ? ethSpecificData.value : null;
      const coinglassSentiment = coinglassData.status === 'fulfilled' ? coinglassData.value : null;

      const sentiment = this.calculateSentiment(marketOverview, fearGreedData, newsAnalysis, socialSentiment, btcSentiment, ethSentiment, coinglassSentiment);

      // Adiciona dados específicos ao resultado
      sentiment.bitcoinSentiment = btcSentiment || sentiment.bitcoinSentiment;
      sentiment.ethereumSentiment = ethSentiment || sentiment.ethereumSentiment;
      sentiment.altcoinSeason = altcoinSeason;
      sentiment.coinglassData = coinglassSentiment;

      console.log('✅ Análise de sentimento concluída');
      return sentiment;
    } catch (error) {
      console.error('❌ Erro na análise de sentimento:', error.message);
      return this.getFallbackSentiment();
    }
  }

  /**
   * Obtém overview do mercado usando dados da Binance
   */
  async getMarketOverview() {
    try {
      console.log('📊 Obtendo overview do mercado...');
      
      let totalVolume = 0;
      let assetsUp = 0;
      let assetsDown = 0;
      let totalChange = 0;
      let validAssets = 0;

      // Analisa uma amostra dos principais ativos
      const sampleSymbols = CRYPTO_SYMBOLS.slice(0, 20); // Top 20 para performance

      for (const symbol of sampleSymbols) {
        try {
          const ticker = await this.binanceService.getCurrentTicker(symbol);
          
          if (ticker && ticker.quoteVolume && ticker.percentage !== undefined) {
            totalVolume += ticker.quoteVolume;
            totalChange += ticker.percentage;
            validAssets++;
            
            if (ticker.percentage > 0) {
              assetsUp++;
            } else {
              assetsDown++;
            }
          }
          
          // Pausa para rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.warn(`Erro ao obter ticker ${symbol}:`, error.message);
        }
      }

      const avgChange = validAssets > 0 ? totalChange / validAssets : 0;
      const volatility = Math.abs(avgChange);

      console.log(`📊 Overview: ${assetsUp}↑ ${assetsDown}↓, Vol: ${(totalVolume/1e9).toFixed(1)}B, Var: ${avgChange.toFixed(2)}%`);

      return {
        totalVolume,
        assetsUp,
        assetsDown,
        avgChange,
        volatility,
        volumeVsAverage: 1 + (Math.random() - 0.5) * 0.4 // Simula comparação com média
      };
    } catch (error) {
      console.error('❌ Erro no overview do mercado:', error.message);
      return null;
    }
  }

  /**
   * Obtém Fear & Greed Index real
   */
  async getRealFearGreedIndex() {
    try {
      console.log('😰 Obtendo Fear & Greed Index real...');
      
      const response = await fetch('https://api.alternative.me/fng/', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data && data.data && data.data[0]) {
        const fngData = data.data[0];
        const index = parseInt(fngData.value);
        const label = fngData.value_classification;
        
        console.log(`✅ Fear & Greed real: ${index}/100 (${label})`);
        
        return {
          index: index,
          label: label,
          isReal: true,
          timestamp: fngData.timestamp
        };
      }
      
      throw new Error('Dados inválidos da API');
    } catch (error) {
      console.error('❌ Erro no Fear & Greed real:', error.message);
      
      // Fallback com dados simulados mais realistas
      const simulatedIndex = 45 + Math.random() * 20; // 45-65
      return {
        index: Math.round(simulatedIndex),
        label: this.getFearGreedLabel(simulatedIndex),
        isReal: false,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Obtém dados de Altcoin Season
   */
  async getAltcoinSeasonData() {
    try {
      console.log('🚀 Verificando Altcoin Season...');
      
      const response = await fetch('https://www.blockchaincenter.net/api/altcoin_season', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data && data.altcoin_season_index !== undefined) {
        const index = data.altcoin_season_index;
        const isAltcoinSeason = index > 75;
        const isBitcoinSeason = index < 25;
        
        let status = 'Neutro';
        let description = 'Mercado equilibrado';
        
        if (isAltcoinSeason) {
          status = 'Altcoin Season';
          description = 'Altcoins superando Bitcoin';
        } else if (isBitcoinSeason) {
          status = 'Bitcoin Season';
          description = 'Bitcoin dominando o mercado';
        }
        
        console.log(`✅ Altcoin Season real: ${index}/100 (${status})`);
        
        return {
          index: index,
          status: status,
          description: description,
          isAltcoinSeason: isAltcoinSeason,
          isBitcoinSeason: isBitcoinSeason,
          isRealData: true
        };
      }
      
      throw new Error('Dados inválidos da API');
    } catch (error) {
      console.error('❌ Erro no Altcoin Season real:', error.message);
      return null;
    }
  }

  /**
   * Análise de notícias baseada em trending coins
   */
  async getNewsAnalysis() {
    try {
      console.log('📰 Analisando trending coins para sentimento de notícias...');
      
      const response = await fetch('https://api.coingecko.com/api/v3/search/trending', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data && data.coins && data.coins.length > 0) {
        const trendingCoins = data.coins.slice(0, 7); // Top 7 trending
        
        // Analisa tipos de coins trending para determinar sentimento
        let defiCount = 0;
        let layer2Count = 0;
        let memeCount = 0;
        let blueChipCount = 0;
        let aiCount = 0;
        
        const trendingNames = [];
        
        trendingCoins.forEach(coin => {
          const name = coin.item.name.toLowerCase();
          const symbol = coin.item.symbol.toLowerCase();
          
          trendingNames.push(coin.item.symbol);
          
          // Categoriza por tipo
          if (['uniswap', 'aave', 'compound', 'sushi', 'curve', 'pancake'].some(defi => name.includes(defi))) {
            defiCount++;
          } else if (['arbitrum', 'optimism', 'polygon', 'layer'].some(l2 => name.includes(l2))) {
            layer2Count++;
          } else if (['doge', 'shib', 'pepe', 'bonk', 'floki'].some(meme => name.includes(meme) || symbol.includes(meme))) {
            memeCount++;
          } else if (['bitcoin', 'ethereum', 'bnb', 'cardano', 'solana'].some(blue => name.includes(blue))) {
            blueChipCount++;
          } else if (['render', 'worldcoin', 'fetch', 'ocean'].some(ai => name.includes(ai))) {
            aiCount++;
          }
        });
        
        // Calcula score baseado no tipo de trending
        let newsScore = 50; // Base
        
        if (blueChipCount >= 3) {
          newsScore += 20; // Blue chips trending = muito positivo
        } else if (blueChipCount >= 1) {
          newsScore += 10;
        }
        
        if (defiCount >= 2) {
          newsScore += 15; // DeFi trending = positivo
        }
        
        if (layer2Count >= 2) {
          newsScore += 12; // Layer 2 trending = inovação
        }
        
        if (aiCount >= 2) {
          newsScore += 18; // AI trending = muito positivo
        }
        
        if (memeCount >= 4) {
          newsScore -= 5; // Muitas memes = especulação excessiva
        } else if (memeCount >= 2) {
          newsScore += 8; // Algumas memes = interesse retail
        }
        
        // Limita entre 25-85
        newsScore = Math.max(25, Math.min(85, newsScore));
        
        console.log(`✅ Análise de notícias: ${newsScore.toFixed(1)}/100`);
        console.log(`📊 Trending: ${blueChipCount} blue chips, ${defiCount} DeFi, ${memeCount} memes`);
        
        return {
          score: newsScore,
          trendingCoins: trendingNames,
          categories: {
            blueChip: blueChipCount,
            defi: defiCount,
            layer2: layer2Count,
            meme: memeCount,
            ai: aiCount
          },
          isRealData: true
        };
      }
      
      throw new Error('Dados inválidos da API');
    } catch (error) {
      console.error('❌ Erro na análise de notícias:', error.message);
      
      // Fallback
      return {
        score: 45 + Math.random() * 20, // 45-65
        trendingCoins: [],
        categories: {},
        isRealData: false
      };
    }
  }

  /**
   * Análise específica do Bitcoin
   */
  async getBitcoinSpecificSentiment() {
    try {
      console.log('₿ Analisando sentimento específico do Bitcoin...');
      
      const btcData = await this.binanceService.getOHLCVData('BTC/USDT', '1h', 24);
      
      if (!btcData || !btcData.close || btcData.close.length < 20) {
        throw new Error('Dados insuficientes do Bitcoin');
      }
      
      const currentPrice = btcData.close[btcData.close.length - 1];
      const price24hAgo = btcData.close[0];
      const change24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
      
      // Volume 24h
      const volume24h = btcData.volume.slice(-24).reduce((sum, vol) => sum + vol, 0);
      const avgVolume = btcData.volume.reduce((sum, vol) => sum + vol, 0) / btcData.volume.length;
      const volumeRatio = volume24h / (avgVolume * 24);
      
      // Volatilidade
      const prices = btcData.close.slice(-24);
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
      }
      const volatility = Math.sqrt(returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length) * 100;
      
      // Calcula score baseado em fatores reais
      let btcScore = 50; // Base neutra
      
      // Variação 24h (peso 40%)
      if (change24h > 5) {
        btcScore += 25; // Rally muito forte
      } else if (change24h > 2) {
        btcScore += 15; // Rally forte
      } else if (change24h > 0) {
        btcScore += 8; // Leve alta
      } else if (change24h < -5) {
        btcScore -= 25; // Queda muito forte
      } else if (change24h < -2) {
        btcScore -= 15; // Queda forte
      } else if (change24h < 0) {
        btcScore -= 8; // Leve baixa
      }
      
      // Volume (peso 25%)
      if (volumeRatio > 1.5) {
        btcScore += 12; // Volume muito alto
      } else if (volumeRatio > 1.2) {
        btcScore += 8; // Volume alto
      } else if (volumeRatio < 0.8) {
        btcScore -= 5; // Volume baixo
      }
      
      // Volatilidade (peso 20%)
      if (volatility > 3) {
        btcScore += 10; // Alta volatilidade = interesse
      } else if (volatility < 1) {
        btcScore -= 5; // Baixa volatilidade = desinteresse
      }
      
      // Momentum (peso 15%)
      const recentPrices = btcData.close.slice(-6); // Últimas 6 horas
      const momentum = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100;
      if (momentum > 1) {
        btcScore += 8;
      } else if (momentum < -1) {
        btcScore -= 8;
      }
      
      // Limita entre 15-85
      btcScore = Math.max(15, Math.min(85, btcScore));
      
      // Determina fatores principais
      const factors = [];
      if (Math.abs(change24h) > 3) {
        factors.push(`${change24h > 0 ? 'alta forte' : 'queda forte'} 24h`);
      }
      if (volumeRatio > 1.3) {
        factors.push('volume alto');
      }
      if (volatility > 2.5) {
        factors.push('alta volatilidade');
      }
      
      console.log(`✅ Bitcoin sentimento: ${btcScore.toFixed(1)}/100 (${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}% 24h)`);
      
      return {
        score: btcScore,
        change24h: change24h,
        volume24h: volume24h,
        volumeRatio: volumeRatio,
        volatility: volatility,
        momentum: momentum,
        factors: factors,
        isRealData: true
      };
    } catch (error) {
      console.error('❌ Erro no sentimento Bitcoin:', error.message);
      
      // Fallback
      return {
        score: 45 + Math.random() * 15, // 45-60
        change24h: 0,
        factors: [],
        isRealData: false
      };
    }
  }

  /**
   * Análise específica do Ethereum
   */
  async getEthereumSpecificSentiment() {
    try {
      console.log('⟠ Analisando sentimento específico do Ethereum...');
      
      const [ethData, btcData] = await Promise.all([
        this.binanceService.getOHLCVData('ETH/USDT', '1h', 24),
        this.binanceService.getOHLCVData('BTC/USDT', '1h', 24)
      ]);
      
      if (!ethData || !btcData || !ethData.close || !btcData.close) {
        throw new Error('Dados insuficientes ETH/BTC');
      }
      
      // Performance ETH vs BTC
      const ethChange24h = ((ethData.close[ethData.close.length - 1] - ethData.close[0]) / ethData.close[0]) * 100;
      const btcChange24h = ((btcData.close[btcData.close.length - 1] - btcData.close[0]) / btcData.close[0]) * 100;
      const ethVsBtc = ethChange24h - btcChange24h;
      
      // Análise do ecossistema DeFi (tokens relacionados)
      const defiTokens = ['UNI/USDT', 'AAVE/USDT', 'SUSHI/USDT'];
      let defiPerformance = 0;
      let validDefiTokens = 0;
      
      for (const token of defiTokens) {
        try {
          const ticker = await this.binanceService.getCurrentTicker(token);
          if (ticker && ticker.percentage !== undefined) {
            defiPerformance += ticker.percentage;
            validDefiTokens++;
          }
        } catch (error) {
          // Ignora erros individuais
        }
      }
      
      const avgDefiPerformance = validDefiTokens > 0 ? defiPerformance / validDefiTokens : 0;
      
      // Análise Layer 2 (tokens relacionados ao Ethereum)
      const layer2Tokens = ['ARB/USDT', 'OP/USDT', 'MATIC/USDT'];
      let layer2Performance = 0;
      let validLayer2Tokens = 0;
      
      for (const token of layer2Tokens) {
        try {
          const ticker = await this.binanceService.getCurrentTicker(token);
          if (ticker && ticker.percentage !== undefined) {
            layer2Performance += ticker.percentage;
            validLayer2Tokens++;
          }
        } catch (error) {
          // Ignora erros individuais
        }
      }
      
      const avgLayer2Performance = validLayer2Tokens > 0 ? layer2Performance / validLayer2Tokens : 0;
      
      // Calcula score do Ethereum
      let ethScore = 50; // Base neutra
      
      // Performance vs Bitcoin (peso 40%)
      if (ethVsBtc > 3) {
        ethScore += 20; // ETH muito superior ao BTC
      } else if (ethVsBtc > 1) {
        ethScore += 12; // ETH superior ao BTC
      } else if (ethVsBtc > -1) {
        ethScore += 5; // ETH similar ao BTC
      } else if (ethVsBtc < -3) {
        ethScore -= 15; // ETH muito inferior ao BTC
      } else {
        ethScore -= 8; // ETH inferior ao BTC
      }
      
      // Performance DeFi (peso 30%)
      if (avgDefiPerformance > 5) {
        ethScore += 15; // DeFi muito forte
      } else if (avgDefiPerformance > 2) {
        ethScore += 10; // DeFi forte
      } else if (avgDefiPerformance < -5) {
        ethScore -= 10; // DeFi fraco
      }
      
      // Performance Layer 2 (peso 20%)
      if (avgLayer2Performance > 5) {
        ethScore += 10; // Layer 2 forte
      } else if (avgLayer2Performance > 2) {
        ethScore += 6; // Layer 2 moderado
      } else if (avgLayer2Performance < -5) {
        ethScore -= 8; // Layer 2 fraco
      }
      
      // Performance absoluta ETH (peso 10%)
      if (ethChange24h > 5) {
        ethScore += 5;
      } else if (ethChange24h < -5) {
        ethScore -= 5;
      }
      
      // Limita entre 20-80
      ethScore = Math.max(20, Math.min(80, ethScore));
      
      // Determina fatores principais
      const factors = [];
      if (Math.abs(ethVsBtc) > 2) {
        factors.push(`${ethVsBtc > 0 ? 'superando' : 'perdendo para'} Bitcoin`);
      }
      if (validDefiTokens >= 2) {
        factors.push(`${validDefiTokens} tokens DeFi trending`);
      }
      if (avgLayer2Performance > 3) {
        factors.push('Layer 2 forte');
      }
      
      console.log(`✅ Ethereum sentimento: ${ethScore.toFixed(1)}/100 (vs BTC: ${ethVsBtc > 0 ? '+' : ''}${ethVsBtc.toFixed(1)})`);
      
      return {
        score: ethScore,
        change24h: ethChange24h,
        vsBitcoin: ethVsBtc,
        defiPerformance: avgDefiPerformance,
        layer2Performance: avgLayer2Performance,
        factors: factors,
        isRealData: true
      };
    } catch (error) {
      console.error('❌ Erro no sentimento Ethereum:', error.message);
      
      // Fallback
      return {
        score: 45 + Math.random() * 15, // 45-60
        change24h: 0,
        vsBitcoin: 0,
        factors: [],
        isRealData: false
      };
    }
  }

  /**
   * Dados de sentimento social (placeholder para futuras APIs)
   */
  async getSocialSentimentData() {
    // Placeholder - pode ser expandido com APIs de Twitter, Reddit, etc.
    return {
      score: 50 + (Math.random() - 0.5) * 20, // 40-60
      sources: [],
      isRealData: false
    };
  }

  /**
   * Obtém análise de sentimento do Coinglass
   */
  async getCoinglassSentiment() {
    try {
      console.log('📊 Obtendo análise de sentimento do Coinglass...');
      
      // Analisa Bitcoin e Ethereum para métricas importantes
      const [btcSentiment, ethSentiment] = await Promise.all([
        this.coinglassAnalyzer.analyzeIntegratedSentiment('BTC/USDT', 'medium'),
        this.coinglassAnalyzer.analyzeIntegratedSentiment('ETH/USDT', 'medium')
      ]);

      // Extrai métricas importantes
      const coinglassMetrics = {
        btc: {
          fundingRate: btcSentiment.coinglassMetrics.fundingRate.magnitude,
          longShortRatio: btcSentiment.coinglassMetrics.longShortRatio.magnitude,
          openInterest: btcSentiment.coinglassMetrics.openInterest.change,
          volume: btcSentiment.coinglassMetrics.volume.change,
          socialSentiment: btcSentiment.socialSentiment.overallSentiment,
          volatility: btcSentiment.coinglassMetrics.volatility
        },
        eth: {
          fundingRate: ethSentiment.coinglassMetrics.fundingRate.magnitude,
          longShortRatio: ethSentiment.coinglassMetrics.longShortRatio.magnitude,
          openInterest: ethSentiment.coinglassMetrics.openInterest.change,
          volume: ethSentiment.coinglassMetrics.volume.change,
          socialSentiment: ethSentiment.socialSentiment.overallSentiment,
          volatility: ethSentiment.coinglassMetrics.volatility
        }
      };

      console.log(`✅ Análise Coinglass: BTC ${coinglassMetrics.btc.fundingRate.toFixed(2)}, ETH ${coinglassMetrics.eth.fundingRate.toFixed(2)}`);
      
      return {
        metrics: coinglassMetrics,
        insights: this.generateCoinglassInsights(coinglassMetrics),
        isRealData: true,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('❌ Erro na análise Coinglass:', error.message);
      return null;
    }
  }

  /**
   * Gera insights baseados nas métricas do Coinglass
   */
  generateCoinglassInsights(metrics) {
    const insights = [];

    // Análise de taxa de financiamento
    if (metrics.btc.fundingRate > 0.01 || metrics.eth.fundingRate > 0.01) {
      insights.push('📈 Taxa de financiamento positiva indicando pressão compradora');
    } else if (metrics.btc.fundingRate < -0.01 || metrics.eth.fundingRate < -0.01) {
      insights.push('📉 Taxa de financiamento negativa indicando pressão vendedora');
    }

    // Análise de posição do mercado
    if (metrics.btc.longShortRatio > 0.7 || metrics.eth.longShortRatio > 0.7) {
      insights.push('📈 Posição longa dominante no mercado');
    } else if (metrics.btc.longShortRatio < 0.3 || metrics.eth.longShortRatio < 0.3) {
      insights.push('📉 Posição short dominante no mercado');
    }

    // Análise de volume e interesse aberto
    if (metrics.btc.volume > 1.5 || metrics.eth.volume > 1.5) {
      insights.push('⚡️ Alto volume de negociação indicando força no mercado');
    }

    return insights;
  }

  /**
   * Calcula sentimento final
   */
  calculateSentiment(marketOverview, fearGreedData, newsAnalysis, socialSentiment, btcSentiment, ethSentiment, coinglassData) {
    // Usa dados reais quando disponíveis
    const fearGreedIndex = fearGreedData?.index || 50;
    const isRealFearGreed = fearGreedData?.isReal || false;
    
    let overall = 'NEUTRO';
    let totalVolume = marketOverview?.totalVolume || 0;
    let assetsUp = marketOverview?.assetsUp || 0;
    let assetsDown = marketOverview?.assetsDown || 0;
    let volatility = marketOverview?.volatility || 2;
    let volumeVsAverage = marketOverview?.volumeVsAverage || 1;

    // Inicializa score com base em 50
    let sentimentScore = 50;

    // Peso das métricas
    const weights = {
      fearGreed: 0.25,
      marketOverview: 0.20,
      news: 0.15,
      social: 0.10,
      coinglass: 0.30  // Aumentando peso do Coinglass
    };

    // Calcula contribuição do Fear & Greed
    sentimentScore += (fearGreedIndex - 50) * weights.fearGreed;
    
    // Calcula contribuição do overview do mercado
    const bullishRatio = assetsUp / (assetsUp + assetsDown);
    sentimentScore += (bullishRatio - 0.5) * 20 * weights.marketOverview;
    
    // Calcula contribuição das notícias
    sentimentScore += (newsAnalysis?.score - 50) * weights.news;
    
    // Calcula contribuição do sentimento social
    sentimentScore += (socialSentiment?.overallSentiment - 50) * weights.social;
    
    // Calcula contribuição do Coinglass
    if (coinglassData?.metrics) {
      // Considera taxa de financiamento
      sentimentScore += (coinglassData.metrics.btc.fundingRate + coinglassData.metrics.eth.fundingRate) * 50 * weights.coinglass;
      
      // Considera posição do mercado
      sentimentScore += (coinglassData.metrics.btc.longShortRatio + coinglassData.metrics.eth.longShortRatio - 1) * 50 * weights.coinglass;
      
      // Considera volume
      sentimentScore += (coinglassData.metrics.btc.volume + coinglassData.metrics.eth.volume - 2) * 25 * weights.coinglass;
    }
    
    // Normaliza entre 0 e 100
    sentimentScore = Math.max(0, Math.min(100, sentimentScore));
    
    // Determina classificação
    if (sentimentScore > 60) {
      overall = 'OTIMISTA';
    } else if (sentimentScore < 40) {
      overall = 'PESSIMISTA';
    }

    return {
      overall,
      fearGreedIndex,
      fearGreedLabel: fearGreedData?.label || this.getFearGreedLabel(fearGreedIndex),
      isRealFearGreed,
      totalVolume,
      volatility,
      assetsUp,
      assetsDown,
      volumeVsAverage,
      bitcoinSentiment: btcSentiment,
      ethereumSentiment: ethSentiment,
      newsAnalysis: newsAnalysis,
      socialSentiment: socialSentiment,
      coinglassData: coinglassData
    };
  }

  /**
   * Detecta alta volatilidade
   */
  async detectHighVolatility() {
    try {
      console.log('🔥 Detectando alta volatilidade...');
      
      const alerts = [];
      const sampleSymbols = CRYPTO_SYMBOLS.slice(0, 15); // Amostra para performance
      
      for (const symbol of sampleSymbols) {
        try {
          const data = await this.binanceService.getOHLCVData(symbol, '15m', 10);
          
          if (data && data.close && data.close.length >= 2) {
            const currentPrice = data.close[data.close.length - 1];
            const previousPrice = data.close[data.close.length - 2];
            const change = ((currentPrice - previousPrice) / previousPrice) * 100;
            
            if (Math.abs(change) >= 5) { // 5% ou mais em 15 minutos
              alerts.push({
                symbol,
                change,
                currentPrice,
                timeframe: '15m',
                timestamp: new Date()
              });
            }
          }
          
          // Pausa para rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.warn(`Erro ao verificar volatilidade ${symbol}:`, error.message);
        }
      }
      
      // Ordena por maior variação
      alerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      
      console.log(`🔥 ${alerts.length} alertas de volatilidade detectados`);
      return alerts.slice(0, 5); // Máximo 5 alertas
    } catch (error) {
      console.error('❌ Erro na detecção de volatilidade:', error.message);
      return [];
    }
  }

  /**
   * Obtém label do Fear & Greed
   */
  getFearGreedLabel(index) {
    if (index >= 75) return 'Ganância Extrema';
    if (index >= 55) return 'Ganância';
    if (index >= 45) return 'Neutro';
    if (index >= 25) return 'Medo';
    return 'Medo Extremo';
  }

  /**
   * Sentimento de fallback
   */
  getFallbackSentiment() {
    return {
      overall: 'NEUTRO',
      fearGreedIndex: 50,
      fearGreedLabel: 'Neutro',
      isRealFearGreed: false,
      totalVolume: 0,
      volatility: 2,
      assetsUp: 35,
      assetsDown: 35,
      volumeVsAverage: 1,
      bitcoinSentiment: { score: 50, factors: [], isRealData: false },
      ethereumSentiment: { score: 50, factors: [], isRealData: false },
      newsAnalysis: { score: 50, isRealData: false },
      coinglassData: null
    };
  }
}

export default MarketAnalysisService;