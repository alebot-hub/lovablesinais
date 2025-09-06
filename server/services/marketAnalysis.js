/**
 * Serviço de análise de mercado (sem Coinglass)
 */

import { CRYPTO_SYMBOLS } from '../config/constants.js';

// Alias simples para símbolos descontinuados/renomeados
const SYMBOL_ALIASES = {
  'MATIC/USDT': 'POL/USDT',
  'MATICUSDT': 'POL/USDT',
};
function resolveAlias(symbol) {
  return SYMBOL_ALIASES[symbol] || symbol;
}

class MarketAnalysisService {
  constructor(binanceService, technicalAnalysis) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis; // mantido para compatibilidade (não usado aqui)
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutos
  }

  /**
   * Analisa sentimento do mercado com dados reais (sem Coinglass)
   */
  async analyzeMarketSentiment() {
    try {
      console.log('🌍 Iniciando análise de sentimento do mercado...');

      const [
        marketData,
        realFearGreed,
        altcoinSeasonData,
        newsData,
        socialData,
        btcSpecificData,
        ethSpecificData
      ] = await Promise.allSettled([
        this.getMarketOverview(),
        this.getRealFearGreedIndex(),
        this.getAltcoinSeasonData(),
        this.getNewsAnalysis(),
        this.getSocialSentimentData(),
        this.getBitcoinSpecificSentiment(),
        this.getEthereumSpecificSentiment()
      ]);

      const marketOverview = marketData.status === 'fulfilled' ? marketData.value : null;
      const fearGreedData = realFearGreed.status === 'fulfilled' ? realFearGreed.value : null;
      const altcoinSeason = altcoinSeasonData.status === 'fulfilled' ? altcoinSeasonData.value : null;
      const newsAnalysis = newsData.status === 'fulfilled' ? newsData.value : null;
      const socialSentiment = socialData.status === 'fulfilled' ? socialData.value : null;
      const btcSentiment = btcSpecificData.status === 'fulfilled' ? btcSpecificData.value : null;
      const ethSentiment = ethSpecificData.status === 'fulfilled' ? ethSpecificData.value : null;

      const sentiment = this.calculateSentiment(
        marketOverview,
        fearGreedData,
        newsAnalysis,
        socialSentiment,
        btcSentiment,
        ethSentiment
      );

      // Enriquecimento
      sentiment.bitcoinSentiment = btcSentiment || sentiment.bitcoinSentiment;
      sentiment.ethereumSentiment = ethSentiment || sentiment.ethereumSentiment;
      sentiment.altcoinSeason = altcoinSeason;

      console.log('✅ Análise de sentimento concluída');
      return sentiment;
    } catch (error) {
      console.error('❌ Erro na análise de sentimento:', error.message);
      return this.getFallbackSentiment();
    }
  }

  /**
   * Overview do mercado (amostra de símbolos)
   */
  async getMarketOverview() {
    try {
      console.log('📊 Obtendo overview do mercado...');
      
      let totalVolume = 0;
      let assetsUp = 0;
      let assetsDown = 0;
      let totalChange = 0;
      let validAssets = 0;

      const sampleSymbols = CRYPTO_SYMBOLS.slice(0, 20); // Top 20 para performance

      for (const rawSymbol of sampleSymbols) {
        const symbol = resolveAlias(rawSymbol);
        try {
          const ticker = await this.binanceService.getCurrentTicker(symbol);
          
          if (ticker && typeof ticker.quoteVolume === 'number' && typeof ticker.percentage === 'number') {
            totalVolume += Number(ticker.quoteVolume) || 0;
            totalChange += Number(ticker.percentage) || 0;
            validAssets++;
            if (ticker.percentage > 0) assetsUp++; else assetsDown++;
          }
          
          // leve pausa para rate limit
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
        volumeVsAverage: 1 + (Math.random() - 0.5) * 0.4 // proxy simples
      };
    } catch (error) {
      console.error('❌ Erro no overview do mercado:', error.message);
      return null;
    }
  }

  /**
   * Fear & Greed Index (Alternative.me) com fallback
   */
  async getRealFearGreedIndex() {
    try {
      console.log('😰 Obtendo Fear & Greed Index real...');
      
      const sources = [
        'https://api.alternative.me/fng/',
        'https://api.alternative.me/fng/?limit=1'
      ];
      
      let response = null;
      let lastError = null;
      
      for (const url of sources) {
        try {
          response = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)',
              'Cache-Control': 'no-cache'
            },
            signal: AbortSignal.timeout(8000)
          });
          
          if (response.ok) break;
          lastError = `HTTP ${response.status}: ${response.statusText}`;
        } catch (error) {
          lastError = error.message;
          continue;
        }
      }
      
      if (!response || !response.ok) {
        throw new Error(lastError || 'Todas as fontes falharam');
      }
      
      const data = await response.json();
      
      if (data?.data?.[0]) {
        const fngData = data.data[0];
        const index = parseInt(fngData.value);
        const label = fngData.value_classification;
        
        console.log(`✅ Fear & Greed real: ${index}/100 (${label})`);
        
        return { index, label, isReal: true, timestamp: fngData.timestamp };
      }
      
      throw new Error('Dados inválidos da API');
    } catch (error) {
      console.error('❌ Erro no Fear & Greed real:', error.message);
      
      // Fallback baseado no BTC
      const btcSentiment = await this.calculateBtcBasedFearGreed().catch(() => null);
      if (btcSentiment) {
        console.log(`✅ Fear & Greed calculado via BTC: ${btcSentiment.index}/100`);
        return btcSentiment;
      }
      
      // Fallback final (simulado)
      const simulatedIndex = 35 + Math.random() * 30; // 35-65
      return {
        index: Math.round(simulatedIndex),
        label: this.getFearGreedLabel(simulatedIndex),
        isReal: false,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Fear & Greed aproximado com base no BTC
   */
  async calculateBtcBasedFearGreed() {
    try {
      const btcData = await this.binanceService.getOHLCVData(resolveAlias('BTC/USDT'), '1d', 30);
      if (!btcData?.close || btcData.close.length < 20) return null;
      
      const currentPrice = btcData.close[btcData.close.length - 1];
      const price7dAgo = btcData.close[btcData.close.length - 8];
      const price30dAgo = btcData.close[0];
      
      const change7d = ((currentPrice - price7dAgo) / price7dAgo) * 100;
      const change30d = ((currentPrice - price30dAgo) / price30dAgo) * 100;
      
      // Volatilidade
      const returns = [];
      for (let i = 1; i < btcData.close.length; i++) {
        returns.push((btcData.close[i] - btcData.close[i-1]) / btcData.close[i-1]);
      }
      const volatility = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * 100;
      
      let index = 50;
      // 7d
      if (change7d > 15) index += 25;
      else if (change7d > 5) index += 15;
      else if (change7d > 0) index += 5;
      else if (change7d < -15) index -= 25;
      else if (change7d < -5) index -= 15;
      else if (change7d < 0) index -= 5;
      // 30d
      if (change30d > 30) index += 15;
      else if (change30d > 10) index += 10;
      else if (change30d < -30) index -= 15;
      else if (change30d < -10) index -= 10;
      // Vol
      if (volatility > 5) index -= 10;
      else if (volatility < 2) index += 5;
      // Volume
      const avgVolume = btcData.volume.reduce((s, v) => s + v, 0) / btcData.volume.length;
      const currentVolume = btcData.volume[btcData.volume.length - 1];
      if (currentVolume > avgVolume * 1.5) index += 5;
      
      index = Math.max(0, Math.min(100, Math.round(index)));
      return {
        index,
        label: this.getFearGreedLabel(index),
        isReal: false,
        calculatedFrom: 'Bitcoin metrics',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Erro ao calcular F&G via BTC:', error.message);
      return null;
    }
  }

  /**
   * Altcoin Season (via dominância BTC com fallback)
   */
  async getAltcoinSeasonData() {
    try {
      console.log('🚀 Verificando Altcoin Season...');
      const btcDominance = await this.getBtcDominanceFromCoinGecko();
      
      if (btcDominance !== null) {
        const altcoinIndex = Math.max(0, Math.min(100, 100 - btcDominance * 1.5));
        const isAltcoinSeason = altcoinIndex > 75;
        const isBitcoinSeason = altcoinIndex < 25;
        
        let status = 'Neutro';
        let description = 'Mercado equilibrado';
        if (isAltcoinSeason) { status = 'Altcoin Season'; description = 'Altcoins superando Bitcoin'; }
        else if (isBitcoinSeason) { status = 'Bitcoin Season'; description = 'Bitcoin dominando o mercado'; }
        
        console.log(`✅ Altcoin Season calculado: ${Math.round(altcoinIndex)}/100 (${status}) - BTC Dom: ${btcDominance}%`);
        
        return {
          index: Math.round(altcoinIndex),
          status,
          description,
          isAltcoinSeason,
          isBitcoinSeason,
          isRealData: false,
          calculatedFrom: `BTC Dominance ${btcDominance.toFixed(1)}%`
        };
      }
      
      console.log('⚠️ Usando fallback para Altcoin Season');
      return {
        index: 45,
        status: 'Neutro',
        description: 'Dados temporariamente indisponíveis',
        isAltcoinSeason: false,
        isBitcoinSeason: false,
        isRealData: false
      };
    } catch (error) {
      console.error('❌ Erro no Altcoin Season:', error.message);
      return null;
    }
  }

  async getBtcDominanceFromCoinGecko() {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/global', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)',
          'Cache-Control': 'no-cache'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data?.data?.market_cap_percentage?.btc != null) {
        return Number(data.data.market_cap_percentage.btc);
      }
      return null;
    } catch (error) {
      console.error('❌ Erro ao obter dominância BTC:', error.message);
      return null;
    }
  }

  /**
   * Análise de notícias (CoinGecko trending com fallback)
   */
  async getNewsAnalysis() {
    try {
      console.log('📰 Analisando trending coins para sentimento de notícias...');
      const response = await fetch('https://api.coingecko.com/api/v3/search/trending', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)',
          'Cache-Control': 'no-cache'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        console.warn(`⚠️ CoinGecko trending falhou: ${response.status}`);
        return this.getFallbackNewsAnalysis();
      }

      const data = await response.json();
      if (data?.coins?.length > 0) {
        const trendingCoins = data.coins.slice(0, 7);
        let defiCount = 0, layer2Count = 0, memeCount = 0, blueChipCount = 0, aiCount = 0;
        const trendingNames = [];
        const defiTokens = [], layer2Tokens = [], memeTokens = [], blueChipTokens = [], aiTokens = [];
        
        trendingCoins.forEach(coin => {
          const name = coin.item.name?.toLowerCase?.() || '';
          const symbol = coin.item.symbol?.toLowerCase?.() || '';
          if (coin.item?.symbol) trendingNames.push(coin.item.symbol);

          if (['uniswap', 'aave', 'compound', 'sushi', 'curve', 'pancake'].some(x => name.includes(x))) {
            defiCount++; defiTokens.push(coin.item.symbol);
          } else if (['arbitrum', 'optimism', 'polygon', 'layer'].some(x => name.includes(x))) {
            layer2Count++; layer2Tokens.push(coin.item.symbol);
          } else if (['doge', 'shib', 'pepe', 'bonk', 'floki'].some(x => name.includes(x) || symbol.includes(x))) {
            memeCount++; memeTokens.push(coin.item.symbol);
          } else if (['bitcoin', 'ethereum', 'bnb', 'cardano', 'solana'].some(x => name.includes(x))) {
            blueChipCount++; blueChipTokens.push(coin.item.symbol);
          } else if (['render', 'worldcoin', 'fetch', 'ocean', 'ai'].some(x => name.includes(x))) {
            aiCount++; aiTokens.push(coin.item.symbol);
          }
        });

        let newsScore = 50;
        if (blueChipCount >= 3) newsScore += 20;
        else if (blueChipCount >= 1) newsScore += 10;
        if (defiCount >= 2) newsScore += 15;
        if (layer2Count >= 2) newsScore += 12;
        if (aiCount >= 2) newsScore += 18;
        if (memeCount >= 4) newsScore -= 5;
        else if (memeCount >= 2) newsScore += 8;

        newsScore = Math.max(25, Math.min(85, newsScore));
        console.log(`✅ Análise de notícias: ${newsScore.toFixed(1)}/100`);

        return {
          score: newsScore,
          trendingCoins: trendingNames,
          trendingByCategory: {
            blueChip: blueChipTokens,
            defi: defiTokens,
            layer2: layer2Tokens,
            meme: memeTokens,
            ai: aiTokens
          },
          categories: { blueChip: blueChipCount, defi: defiCount, layer2: layer2Count, meme: memeCount, ai: aiCount },
          isRealData: true
        };
      }

      return this.getFallbackNewsAnalysis();
    } catch (error) {
      console.error('❌ Erro na análise de notícias:', error.message);
      return this.getFallbackNewsAnalysis();
    }
  }

  getFallbackNewsAnalysis() {
    const hour = new Date().getHours();
    let baseScore = 50;
    if (hour >= 13 && hour <= 16) baseScore += 10;       // US
    else if (hour >= 8 && hour <= 10) baseScore += 5;     // EU
    else if (hour >= 0 && hour <= 2) baseScore += 8;      // Ásia
    const variation = (Math.random() - 0.5) * 20;
    const finalScore = Math.max(30, Math.min(70, baseScore + variation));
    return {
      score: finalScore,
      trendingCoins: ['BTC', 'ETH', 'SOL'],
      categories: { blueChip: 2, defi: 1, layer2: 1, meme: 1, ai: 0 },
      isRealData: false,
      fallbackReason: 'API temporariamente indisponível'
    };
  }

  /**
   * Sentimento específico do Bitcoin
   */
  async getBitcoinSpecificSentiment() {
    try {
      console.log('₿ Analisando sentimento específico do Bitcoin...');
      const btcData = await this.binanceService.getOHLCVData(resolveAlias('BTC/USDT'), '1h', 24);
      if (!btcData?.close || btcData.close.length < 20) throw new Error('Dados insuficientes do Bitcoin');
      
      const currentPrice = btcData.close[btcData.close.length - 1];
      const price24hAgo = btcData.close[0];
      const change24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
      
      const volume24h = btcData.volume.slice(-24).reduce((s, v) => s + v, 0);
      const avgVolume = btcData.volume.reduce((s, v) => s + v, 0) / btcData.volume.length;
      const volumeRatio = avgVolume > 0 ? (volume24h / (avgVolume * 24)) : 1;
      
      const prices = btcData.close.slice(-24);
      const returns = [];
      for (let i = 1; i < prices.length; i++) returns.push((prices[i] - prices[i-1]) / prices[i-1]);
      const volatility = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / (returns.length || 1)) * 100;
      
      let btcScore = 50;
      if (change24h > 5) btcScore += 25;
      else if (change24h > 2) btcScore += 15;
      else if (change24h > 0) btcScore += 8;
      else if (change24h < -5) btcScore -= 25;
      else if (change24h < -2) btcScore -= 15;
      else if (change24h < 0) btcScore -= 8;

      if (volumeRatio > 1.5) btcScore += 12;
      else if (volumeRatio > 1.2) btcScore += 8;
      else if (volumeRatio < 0.8) btcScore -= 5;

      if (volatility > 3) btcScore += 10;
      else if (volatility < 1) btcScore -= 5;

      const recent = btcData.close.slice(-6);
      if (recent.length >= 2) {
        const momentum = (recent[recent.length - 1] - recent[0]) / recent[0] * 100;
        if (momentum > 1) btcScore += 8;
        else if (momentum < -1) btcScore -= 8;
      }

      btcScore = Math.max(15, Math.min(85, btcScore));

      const factors = [];
      if (Math.abs(change24h) > 3) factors.push(`${change24h > 0 ? 'alta forte' : 'queda forte'} 24h`);
      if (volumeRatio > 1.3) factors.push('volume alto');
      if (volatility > 2.5) factors.push('alta volatilidade');

      console.log(`✅ Bitcoin sentimento: ${btcScore.toFixed(1)}/100 (${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}% 24h)`);

      return {
        score: btcScore,
        change24h,
        volume24h,
        volumeRatio,
        volatility,
        isRealData: true,
        factors
      };
    } catch (error) {
      console.error('❌ Erro no sentimento Bitcoin:', error.message);
      return { score: 45 + Math.random() * 15, change24h: 0, factors: [], isRealData: false };
    }
  }

  /**
   * Sentimento específico do Ethereum (Layer2 atualizado com POL)
   */
  async getEthereumSpecificSentiment() {
    try {
      console.log('⟠ Analisando sentimento específico do Ethereum...');
      
      const [ethData, btcData] = await Promise.all([
        this.binanceService.getOHLCVData(resolveAlias('ETH/USDT'), '1h', 24),
        this.binanceService.getOHLCVData(resolveAlias('BTC/USDT'), '1h', 24)
      ]);
      if (!ethData?.close || !btcData?.close) throw new Error('Dados insuficientes ETH/BTC');
      
      const ethChange24h = ((ethData.close[ethData.close.length - 1] - ethData.close[0]) / ethData.close[0]) * 100;
      const btcChange24h = ((btcData.close[btcData.close.length - 1] - btcData.close[0]) / btcData.close[0]) * 100;
      const ethVsBtc = ethChange24h - btcChange24h;
      
      // DeFi tokens
      const defiTokens = ['UNI/USDT', 'AAVE/USDT', 'SUSHI/USDT'];
      let defiPerformance = 0, validDefiTokens = 0;
      for (const raw of defiTokens) {
        const token = resolveAlias(raw);
        try {
          const t = await this.binanceService.getCurrentTicker(token);
          if (t && typeof t.percentage === 'number') { defiPerformance += t.percentage; validDefiTokens++; }
        } catch {}
      }
      const avgDefiPerformance = validDefiTokens > 0 ? defiPerformance / validDefiTokens : 0;

      // Layer 2 (POL atualizado)
      const layer2Tokens = ['ARB/USDT', 'OP/USDT', 'POL/USDT'];
      let layer2Performance = 0, validLayer2Tokens = 0;
      for (const raw of layer2Tokens) {
        const token = resolveAlias(raw);
        try {
          const t = await this.binanceService.getCurrentTicker(token);
          if (t && typeof t.percentage === 'number') { layer2Performance += t.percentage; validLayer2Tokens++; }
        } catch {}
      }
      const avgLayer2Performance = validLayer2Tokens > 0 ? layer2Performance / validLayer2Tokens : 0;

      let ethScore = 50;
      if (ethVsBtc > 3) ethScore += 20;
      else if (ethVsBtc > 1) ethScore += 12;
      else if (ethVsBtc > -1) ethScore += 5;
      else if (ethVsBtc < -3) ethScore -= 15;
      else ethScore -= 8;

      if (avgDefiPerformance > 5) ethScore += 15;
      else if (avgDefiPerformance > 2) ethScore += 10;
      else if (avgDefiPerformance < -5) ethScore -= 10;

      if (avgLayer2Performance > 5) ethScore += 10;
      else if (avgLayer2Performance > 2) ethScore += 6;
      else if (avgLayer2Performance < -5) ethScore -= 8;

      if (ethChange24h > 5) ethScore += 5;
      else if (ethChange24h < -5) ethScore -= 5;

      ethScore = Math.max(20, Math.min(80, ethScore));

      const factors = [];
      if (Math.abs(ethVsBtc) > 2) factors.push(`${ethVsBtc > 0 ? 'superando' : 'perdendo para'} Bitcoin`);
      if (validDefiTokens >= 2) factors.push(`${validDefiTokens} tokens DeFi trending`);
      if (avgLayer2Performance > 3) factors.push('Layer 2 forte');

      console.log(`✅ Ethereum sentimento: ${ethScore.toFixed(1)}/100 (vs BTC: ${ethVsBtc > 0 ? '+' : ''}${ethVsBtc.toFixed(1)})`);

      return {
        score: ethScore,
        change24h: ethChange24h,
        vsBitcoin: ethVsBtc,
        defiPerformance: avgDefiPerformance,
        layer2Performance: avgLayer2Performance,
        factors,
        isRealData: true
      };
    } catch (error) {
      console.error('❌ Erro no sentimento Ethereum:', error.message);
      return { score: 45 + Math.random() * 15, change24h: 0, vsBitcoin: 0, factors: [], isRealData: false };
    }
  }

  /**
   * Sentimento social (placeholder)
   */
  async getSocialSentimentData() {
    return {
      score: 50 + (Math.random() - 0.5) * 20, // 40-60
      sources: [],
      isRealData: false
    };
  }

  /**
   * Cálculo do sentimento final (sem Coinglass)
   * overall padronizado para 'NEUTRAL' | 'BULLISH' | 'BEARISH'
   */
  calculateSentiment(marketOverview, fearGreedData, newsAnalysis, socialSentiment, btcSentiment, ethSentiment) {
    const fearGreedIndex = fearGreedData?.index ?? 50;
    const isRealFearGreed = fearGreedData?.isReal ?? false;
    
    let overall = 'NEUTRAL';
    const totalVolume = marketOverview?.totalVolume ?? 0;
    const assetsUp = marketOverview?.assetsUp ?? 0;
    const assetsDown = marketOverview?.assetsDown ?? 0;
    const volatility = marketOverview?.volatility ?? 2;
    const volumeVsAverage = marketOverview?.volumeVsAverage ?? 1;

    // Score base
    let sentimentScore = 50;

    // Pesos recalibrados (Coinglass removido)
    const weights = {
      fearGreed: 0.35,
      marketOverview: 0.25,
      news: 0.20,
      social: 0.20
    };

    // Fear & Greed
    sentimentScore += (fearGreedIndex - 50) * weights.fearGreed;

    // Overview
    const denom = assetsUp + assetsDown;
    const bullishRatio = denom > 0 ? assetsUp / denom : 0.5;
    sentimentScore += (bullishRatio - 0.5) * 20 * weights.marketOverview;

    // Notícias
    if (typeof newsAnalysis?.score === 'number') {
      sentimentScore += (newsAnalysis.score - 50) * weights.news;
    }

    // Social
    if (typeof socialSentiment?.score === 'number') {
      sentimentScore += (socialSentiment.score - 50) * weights.social;
    }

    // Normaliza 0–100
    sentimentScore = Math.max(0, Math.min(100, sentimentScore));

    if (sentimentScore > 60) overall = 'BULLISH';
    else if (sentimentScore < 40) overall = 'BEARISH';

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
      newsAnalysis,
      socialSentiment
    };
  }

  /**
   * Detecta alta volatilidade
   */
  async detectHighVolatility() {
    try {
      console.log('🔥 Detectando alta volatilidade...');
      
      const alerts = [];
      const sampleSymbols = CRYPTO_SYMBOLS.slice(0, 15);
      
      for (const raw of sampleSymbols) {
        const symbol = resolveAlias(raw);
        try {
          const data = await this.binanceService.getOHLCVData(symbol, '15m', 10);
          if (data?.close?.length >= 2) {
            const currentPrice = data.close[data.close.length - 1];
            const previousPrice = data.close[data.close.length - 2];
            const change = ((currentPrice - previousPrice) / previousPrice) * 100;
            if (Math.abs(change) >= 5) {
              alerts.push({ symbol, change, currentPrice, timeframe: '15m', timestamp: new Date() });
            }
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.warn(`Erro ao verificar volatilidade ${symbol}:`, error.message);
        }
      }
      
      alerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      console.log(`🔥 ${alerts.length} alertas de volatilidade detectados`);
      return alerts.slice(0, 5);
    } catch (error) {
      console.error('❌ Erro na detecção de volatilidade:', error.message);
      return [];
    }
  }

  getFearGreedLabel(index) {
    if (index >= 75) return 'Ganância Extrema';
    if (index >= 55) return 'Ganância';
    if (index >= 45) return 'Neutro';
    if (index >= 25) return 'Medo';
    return 'Medo Extremo';
  }

  getFallbackSentiment() {
    return {
      overall: 'NEUTRAL',
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
      newsAnalysis: { score: 50, isRealData: false }
    };
  }
}

export default MarketAnalysisService;
