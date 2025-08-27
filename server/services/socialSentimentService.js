/**
 * Serviço de análise de sentimento de redes sociais
 */

class SocialSentimentService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutos
  }

  /**
   * Analisa sentimento geral das redes sociais
   */
  async analyzeSocialSentiment() {
    try {
      console.log('🔍 Analisando sentimento das redes sociais...');

      const [
        twitterSentiment,
        redditSentiment,
        googleTrends,
        newsSentiment
      ] = await Promise.allSettled([
        this.analyzeTwitterSentiment(),
        this.analyzeRedditSentiment(),
        this.analyzeGoogleTrends(),
        this.analyzeNewsSentiment()
      ]);

      const socialData = {
        twitter: twitterSentiment.status === 'fulfilled' ? twitterSentiment.value : null,
        reddit: redditSentiment.status === 'fulfilled' ? redditSentiment.value : null,
        googleTrends: googleTrends.status === 'fulfilled' ? googleTrends.value : null,
        news: newsSentiment.status === 'fulfilled' ? newsSentiment.value : null,
        timestamp: new Date()
      };

      const aggregatedSentiment = this.aggregateSocialSentiment(socialData);
      
      console.log('✅ Análise de sentimento social concluída');
      return aggregatedSentiment;
    } catch (error) {
      console.error('❌ Erro na análise de sentimento social:', error.message);
      return this.getFallbackSentiment();
    }
  }

  /**
   * Analisa sentimento do Twitter/X
   */
  async analyzeTwitterSentiment() {
    try {
      console.log('🐦 Analisando sentimento do Twitter...');

      // Simula análise do Twitter (em produção, usaria Twitter API v2)
      const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency'];
      const twitterData = await this.simulateTwitterAnalysis(cryptoKeywords);

      return {
        platform: 'Twitter',
        sentiment: twitterData.sentiment,
        score: twitterData.score,
        volume: twitterData.mentions,
        trending: twitterData.trending,
        topHashtags: twitterData.topHashtags,
        confidence: twitterData.confidence
      };
    } catch (error) {
      console.error('❌ Erro na análise do Twitter:', error.message);
      return null;
    }
  }

  /**
   * Obtém sentimento de notícias via Alpha Vantage
   */
  async getAlphaVantageNewsSentiment() {
    try {
      // News & Sentiment API da Alpha Vantage
      const url = `${this.alphaVantageBaseUrl}?function=NEWS_SENTIMENT&tickers=CRYPTO:BTC,CRYPTO:ETH&apikey=${this.alphaVantageKey}&limit=50`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        signal: AbortSignal.timeout(20000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log('📰 Alpha Vantage News response preview:', responseText.substring(0, 150));
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Erro ao parsear News JSON:', parseError.message);
        throw new Error('Resposta inválida da Alpha Vantage');
      }
      
      // Verifica se há erro na resposta
      if (data['Error Message'] || data['Note']) {
        console.error('❌ Alpha Vantage News error:', data['Error Message'] || data['Note']);
        throw new Error('Limite de API atingido ou erro na Alpha Vantage');
      }
      
      if (data.feed && Array.isArray(data.feed) && data.feed.length > 0) {
        let totalSentiment = 0;
        let sentimentCount = 0;
        let bullishCount = 0;
        let bearishCount = 0;
        let neutralCount = 0;
        const topics = new Set();
        const keywords = new Set();
        
        // Analisa cada artigo
        data.feed.forEach(article => {
          if (article.overall_sentiment_score !== undefined) {
            const score = parseFloat(article.overall_sentiment_score);
            totalSentiment += score;
            sentimentCount++;
            
            // Classifica sentimento
            if (score > 0.15) {
              bullishCount++;
            } else if (score < -0.15) {
              bearishCount++;
            } else {
              neutralCount++;
            }
            
            // Coleta tópicos e palavras-chave
            if (article.topics) {
              article.topics.forEach(topic => {
                if (topic.topic) topics.add(topic.topic);
              });
            }
            
            // Extrai palavras-chave do título
            if (article.title) {
              const title = article.title.toLowerCase();
              if (title.includes('bitcoin') || title.includes('btc')) keywords.add('#Bitcoin');
              if (title.includes('ethereum') || title.includes('eth')) keywords.add('#Ethereum');
              if (title.includes('crypto')) keywords.add('#Crypto');
              if (title.includes('bull')) keywords.add('#Bull');
              if (title.includes('bear')) keywords.add('#Bear');
            }
          }
        });
        
        if (sentimentCount > 0) {
          const avgSentiment = totalSentiment / sentimentCount;
          
          // Determina sentimento geral
          let overallSentiment = 'NEUTRAL';
          if (avgSentiment > 0.1) {
            overallSentiment = 'BULLISH';
          } else if (avgSentiment < -0.1) {
            overallSentiment = 'BEARISH';
          }
          
          // Calcula score (0-100)
          const score = Math.max(0, Math.min(100, (avgSentiment + 1) * 50));
          
          // Calcula confiança baseada no volume de dados
          const confidence = Math.min(0.95, 0.5 + (sentimentCount / 100));
          
          console.log(`✅ Sentimento Alpha Vantage: ${overallSentiment} (${score.toFixed(1)}/100) - ${sentimentCount} artigos`);
          
          return {
            sentiment: overallSentiment,
            score: score,
            articles: sentimentCount,
            topics: Array.from(topics).slice(0, 5),
            keywords: Array.from(keywords).slice(0, 5),
            confidence: confidence,
            breakdown: {
              bullish: bullishCount,
              bearish: bearishCount,
              neutral: neutralCount
            },
            source: 'Alpha Vantage News API'
          };
        }
      }
      
      throw new Error('Dados insuficientes da Alpha Vantage');
    } catch (error) {
      console.error('❌ Erro na Alpha Vantage News:', error.message);
      return null;
    }
  }

  /**
   * Simula análise do Twitter (substitua por API real)
   */
  async simulateTwitterAnalysis(keywords) {
    // Em produção, substituir por chamadas reais à Twitter API
    const sentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    
    return {
      sentiment: randomSentiment,
      score: Math.random() * 100,
      mentions: Math.floor(Math.random() * 10000) + 1000,
      trending: ['#Bitcoin', '#Crypto', '#BTC', '#Ethereum', '#Altcoins'],
      topHashtags: ['#HODL', '#ToTheMoon', '#CryptoBull', '#DeFi'],
      confidence: Math.random() * 0.4 + 0.6 // 60-100%
    };
  }

  /**
   * Analisa sentimento do Reddit
   */
  async analyzeRedditSentiment() {
    try {
      console.log('📱 Analisando sentimento do Reddit...');

      // Simula análise do Reddit (em produção, usaria Reddit API)
      const subreddits = ['cryptocurrency', 'Bitcoin', 'ethereum', 'CryptoMarkets'];
      const redditData = await this.simulateRedditAnalysis(subreddits);

      return {
        platform: 'Reddit',
        sentiment: redditData.sentiment,
        score: redditData.score,
        posts: redditData.posts,
        comments: redditData.comments,
        upvoteRatio: redditData.upvoteRatio,
        topPosts: redditData.topPosts,
        confidence: redditData.confidence
      };
    } catch (error) {
      console.error('❌ Erro na análise do Reddit:', error.message);
      return null;
    }
  }

  /**
   * Simula análise do Reddit
   */
  async simulateRedditAnalysis(subreddits) {
    const sentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    
    return {
      sentiment: randomSentiment,
      score: Math.random() * 100,
      posts: Math.floor(Math.random() * 500) + 100,
      comments: Math.floor(Math.random() * 5000) + 1000,
      upvoteRatio: Math.random() * 0.3 + 0.7, // 70-100%
      topPosts: [
        'Bitcoin breaking resistance!',
        'Altcoin season incoming?',
        'Market analysis for this week'
      ],
      confidence: Math.random() * 0.3 + 0.7 // 70-100%
    };
  }

  /**
   * Analisa Google Trends
   */
  async analyzeGoogleTrends() {
    try {
      console.log('🔍 Analisando Google Trends...');

      // Simula análise do Google Trends (em produção, usaria Google Trends API)
      const trendsData = await this.simulateGoogleTrends();

      return {
        platform: 'Google Trends',
        interest: trendsData.interest,
        trending: trendsData.trending,
        regions: trendsData.regions,
        relatedQueries: trendsData.relatedQueries,
        confidence: trendsData.confidence
      };
    } catch (error) {
      console.error('❌ Erro na análise do Google Trends:', error.message);
      return null;
    }
  }

  /**
   * Simula Google Trends
   */
  async simulateGoogleTrends() {
    return {
      interest: Math.floor(Math.random() * 100) + 1,
      trending: ['Bitcoin price', 'Crypto news', 'Ethereum ETF'],
      regions: ['United States', 'Germany', 'Japan', 'South Korea'],
      relatedQueries: [
        'bitcoin price prediction',
        'crypto market today',
        'ethereum news'
      ],
      confidence: Math.random() * 0.2 + 0.8 // 80-100%
    };
  }

  /**
   * Analisa sentimento de notícias
   */
  async analyzeNewsSentiment() {
    try {
      console.log('📰 Analisando sentimento de notícias...');

      // Simula análise de notícias (em produção, usaria News API)
      const newsData = await this.simulateNewsAnalysis();

      return {
        platform: 'News',
        sentiment: newsData.sentiment,
        score: newsData.score,
        articles: newsData.articles,
        sources: newsData.sources,
        topHeadlines: newsData.topHeadlines,
        confidence: newsData.confidence
      };
    } catch (error) {
      console.error('❌ Erro na análise de notícias:', error.message);
      return null;
    }
  }

  /**
   * Simula análise de notícias
   */
  async simulateNewsAnalysis() {
    const sentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    
    return {
      sentiment: randomSentiment,
      score: Math.random() * 100,
      articles: Math.floor(Math.random() * 50) + 10,
      sources: ['CoinDesk', 'CoinTelegraph', 'Decrypt', 'The Block'],
      topHeadlines: [
        'Bitcoin reaches new resistance level',
        'Institutional adoption continues to grow',
        'Regulatory clarity improves market sentiment'
      ],
      confidence: Math.random() * 0.3 + 0.7 // 70-100%
    };
  }

  /**
   * Agrega sentimento de todas as fontes
   */
  aggregateSocialSentiment(socialData) {
    const sources = [];
    let totalScore = 0;
    let totalWeight = 0;
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;

    // Pesos por plataforma
    const weights = {
      twitter: 0.3,
      reddit: 0.25,
      news: 0.25,
      googleTrends: 0.2
    };

    // Processa cada fonte
    Object.entries(socialData).forEach(([platform, data]) => {
      if (data && platform !== 'timestamp') {
        sources.push({
          platform: data.platform,
          sentiment: data.sentiment,
          score: data.score || 50,
          confidence: data.confidence || 0.5
        });

        const weight = weights[platform] || 0.1;
        totalWeight += weight;

        // Converte sentimento para score numérico
        let sentimentScore = 50; // Neutro
        if (data.sentiment === 'BULLISH') {
          sentimentScore = 70 + ((data.score || 50) * 0.3);
          bullishCount++;
        } else if (data.sentiment === 'BEARISH') {
          sentimentScore = 30 - ((data.score || 50) * 0.3);
          bearishCount++;
        } else {
          sentimentScore = 45 + (Math.random() * 10);
          neutralCount++;
        }

        totalScore += sentimentScore * weight;
      }
    });

    // Calcula sentimento agregado
    const aggregatedScore = totalWeight > 0 ? totalScore / totalWeight : 50;
    
    let overallSentiment = 'NEUTRAL';
    if (aggregatedScore > 60) {
      overallSentiment = 'BULLISH';
    } else if (aggregatedScore < 40) {
      overallSentiment = 'BEARISH';
    }

    // Calcula confiança baseada na concordância entre fontes
    const maxCount = Math.max(bullishCount, bearishCount, neutralCount);
    const totalSources = bullishCount + bearishCount + neutralCount;
    const confidence = totalSources > 0 ? (maxCount / totalSources) * 100 : 50;

    return {
      overall: overallSentiment,
      score: Math.round(aggregatedScore),
      confidence: Math.round(confidence),
      sources: sources,
      breakdown: {
        bullish: bullishCount,
        bearish: bearishCount,
        neutral: neutralCount
      },
      details: this.generateSocialAnalysis(socialData, overallSentiment),
      timestamp: socialData.timestamp
    };
  }

  /**
   * Gera análise detalhada das redes sociais
   */
  generateSocialAnalysis(socialData, overallSentiment) {
    const analysis = [];

    // Análise do Twitter
    if (socialData.twitter) {
      const twitter = socialData.twitter;
      analysis.push(`🐦 Twitter: ${twitter.mentions ? twitter.mentions.toLocaleString('pt-BR') : '0'} menções, sentimento ${twitter.sentiment}`);
      
      if (twitter.trending && twitter.trending.length > 0) {
        analysis.push(`📈 Trending: ${twitter.trending.slice(0, 3).join(', ')}`);
      }
    }

    // Análise do Reddit
    if (socialData.reddit) {
      const reddit = socialData.reddit;
      analysis.push(`📱 Reddit: ${reddit.posts || 0} posts, ${reddit.comments ? reddit.comments.toLocaleString('pt-BR') : '0'} comentários`);
      analysis.push(`👍 Upvote ratio: ${(reddit.upvoteRatio * 100).toFixed(1)}%`);
    }

    // Análise do Google Trends
    if (socialData.googleTrends) {
      const trends = socialData.googleTrends;
      analysis.push(`🔍 Google: Interesse ${trends.interest}/100 em pesquisas crypto`);
    }

    // Análise de notícias
    if (socialData.news) {
      const news = socialData.news;
      analysis.push(`📰 Notícias: ${news.articles} artigos analisados, tom ${news.sentiment}`);
    }

    // Interpretação geral
    if (overallSentiment === 'BULLISH') {
      analysis.push('🟢 Redes sociais mostram otimismo generalizado');
    } else if (overallSentiment === 'BEARISH') {
      analysis.push('🔴 Redes sociais refletem pessimismo no mercado');
    } else {
      analysis.push('🟡 Sentimento misto nas redes sociais');
    }

    return analysis;
  }

  /**
   * Retorna sentimento de fallback
   */
  getFallbackSentiment() {
    return {
      overall: 'NEUTRAL',
      score: 50,
      confidence: 30,
      sources: [],
      breakdown: { bullish: 0, bearish: 0, neutral: 1 },
      details: ['📱 Análise de redes sociais temporariamente indisponível'],
      timestamp: new Date()
    };
  }

  /**
   * Obtém dados em cache se disponíveis
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  /**
   * Armazena dados em cache
   */
  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}

export default SocialSentimentService;