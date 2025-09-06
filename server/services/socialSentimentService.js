/**
 * Serviço de análise de sentimento de redes sociais (revisado)
 * - Cache com TTL real
 * - Integração opcional com Alpha Vantage News
 * - Menos aleatoriedade na agregação (NEUTRAL determinístico)
 * - Correções de campos (mentions -> volume)
 * - Fallbacks seguros quando fetch/API ausente
 */

class SocialSentimentService {
  constructor(options = {}) {
    this.cache = new Map();
    this.cacheTimeout = options.cacheTimeout ?? (30 * 60 * 1000); // 30 min

    // Alpha Vantage (opcional)
    this.alphaVantageKey = options.alphaVantageKey || process.env.ALPHA_VANTAGE_KEY || '';
    this.alphaVantageBaseUrl = options.alphaVantageBaseUrl || 'https://www.alphavantage.co/query';

    // Permite injetar fetch em testes; usa globalThis.fetch por padrão
    this._fetch = options.fetch || globalThis.fetch?.bind(globalThis);

    if (!this._fetch) {
      console.warn('[SocialSentimentService] ⚠️ fetch não disponível no ambiente. As chamadas reais a APIs serão ignoradas.');
    }
  }

  // ========== API PÚBLICA ==========

  /**
   * Analisa sentimento geral das redes sociais (com cache)
   */
  async analyzeSocialSentiment({ useCache = true } = {}) {
    const cacheKey = 'social:aggregate';
    if (useCache) {
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        // devolve uma cópia leve pra evitar mutações acidentais
        return { ...cached, cached: true };
      }
    }

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
        this.analyzeNewsSentiment() // tenta Alpha Vantage; cai para simulado
      ]);

      const socialData = {
        twitter: twitterSentiment.status === 'fulfilled' ? twitterSentiment.value : null,
        reddit: redditSentiment.status === 'fulfilled' ? redditSentiment.value : null,
        googleTrends: googleTrends.status === 'fulfilled' ? googleTrends.value : null,
        news: newsSentiment.status === 'fulfilled' ? newsSentiment.value : null,
        timestamp: new Date()
      };

      const aggregatedSentiment = this.aggregateSocialSentiment(socialData);

      this.setCachedData(cacheKey, aggregatedSentiment);
      console.log('✅ Análise de sentimento social concluída');
      return aggregatedSentiment;
    } catch (error) {
      console.error('❌ Erro na análise de sentimento social:', error?.message || error);
      return this.getFallbackSentiment();
    }
  }

  // ========== FONTES ==========

  /**
   * Twitter/X (simulado)
   */
  async analyzeTwitterSentiment() {
    try {
      console.log('🐦 Analisando sentimento do Twitter (simulado)...');
      const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency'];
      const twitterData = await this.simulateTwitterAnalysis(cryptoKeywords);
      return {
        platform: 'Twitter',
        sentiment: twitterData.sentiment,
        score: twitterData.score,
        volume: twitterData.mentions,       // <- padronizamos como 'volume'
        trending: twitterData.trending,
        topHashtags: twitterData.topHashtags,
        confidence: twitterData.confidence
      };
    } catch (error) {
      console.error('❌ Erro na análise do Twitter:', error?.message || error);
      return null;
    }
  }

  /**
   * Reddit (simulado)
   */
  async analyzeRedditSentiment() {
    try {
      console.log('📱 Analisando sentimento do Reddit (simulado)...');
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
      console.error('❌ Erro na análise do Reddit:', error?.message || error);
      return null;
    }
  }

  /**
   * Google Trends (simulado)
   */
  async analyzeGoogleTrends() {
    try {
      console.log('🔍 Analisando Google Trends (simulado)...');
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
      console.error('❌ Erro na análise do Google Trends:', error?.message || error);
      return null;
    }
  }

  /**
   * Notícias: tenta Alpha Vantage, fallback para simulado
   */
  async analyzeNewsSentiment() {
    try {
      console.log('📰 Analisando sentimento de notícias...');
      let news = null;

      if (this._fetch && this.alphaVantageKey) {
        news = await this.getAlphaVantageNewsSentiment();
      }

      if (!news) {
        console.warn('📰 Alpha Vantage indisponível/sem chave — usando simulação.');
        news = await this.simulateNewsAnalysis();
      }

      return {
        platform: 'News',
        sentiment: news.sentiment,
        score: news.score,
        articles: news.articles,
        sources: news.sources || news.topics || [],
        topHeadlines: news.topHeadlines || [],
        confidence: news.confidence
      };
    } catch (error) {
      console.error('❌ Erro na análise de notícias:', error?.message || error);
      return null;
    }
  }

  // ========== INTEGRAÇÕES REAIS (opcionais) ==========

  /**
   * Alpha Vantage - News & Sentiment (opcional)
   */
  async getAlphaVantageNewsSentiment() {
    if (!this._fetch) return null;

    try {
      const url = `${this.alphaVantageBaseUrl}?function=NEWS_SENTIMENT&tickers=CRYPTO:BTC,CRYPTO:ETH&apikey=${this.alphaVantageKey}&limit=50`;

      // Timeout defensivo (se disponível)
      let fetchOpts = {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        }
      };
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        fetchOpts.signal = AbortSignal.timeout(20000);
      }

      const response = await this._fetch(url, fetchOpts);
      if (!response?.ok) {
        throw new Error(`HTTP ${response?.status}: ${response?.statusText || 'Erro'}`);
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

        for (const article of data.feed) {
          if (article.overall_sentiment_score !== undefined) {
            const score = parseFloat(article.overall_sentiment_score);
            if (Number.isFinite(score)) {
              totalSentiment += score;
              sentimentCount++;

              if (score > 0.15) bullishCount++;
              else if (score < -0.15) bearishCount++;
              else neutralCount++;

              if (Array.isArray(article.topics)) {
                for (const t of article.topics) {
                  if (t?.topic) topics.add(t.topic);
                }
              }

              if (article.title) {
                const title = String(article.title).toLowerCase();
                if (title.includes('bitcoin') || title.includes('btc')) keywords.add('#Bitcoin');
                if (title.includes('ethereum') || title.includes('eth')) keywords.add('#Ethereum');
                if (title.includes('crypto')) keywords.add('#Crypto');
                if (title.includes('bull')) keywords.add('#Bull');
                if (title.includes('bear')) keywords.add('#Bear');
              }
            }
          }
        }

        if (sentimentCount > 0) {
          const avgSentiment = totalSentiment / sentimentCount;

          let overallSentiment = 'NEUTRAL';
          if (avgSentiment > 0.1) overallSentiment = 'BULLISH';
          else if (avgSentiment < -0.1) overallSentiment = 'BEARISH';

          const score = Math.max(0, Math.min(100, (avgSentiment + 1) * 50));
          const confidence = Math.min(0.95, 0.5 + (sentimentCount / 100));

          console.log(`✅ Sentimento Alpha Vantage: ${overallSentiment} (${score.toFixed(1)}/100) - ${sentimentCount} artigos`);

          return {
            sentiment: overallSentiment,
            score,
            articles: sentimentCount,
            topics: Array.from(topics).slice(0, 5),
            keywords: Array.from(keywords).slice(0, 5),
            confidence,
            breakdown: { bullish: bullishCount, bearish: bearishCount, neutral: neutralCount },
            source: 'Alpha Vantage News API'
          };
        }
      }

      throw new Error('Dados insuficientes da Alpha Vantage');
    } catch (error) {
      console.error('❌ Erro na Alpha Vantage News:', error?.message || error);
      return null;
    }
  }

  // ========== SIMULAÇÕES ==========

  async simulateTwitterAnalysis(/* keywords */) {
    const sentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    return {
      sentiment: randomSentiment,
      score: Math.random() * 100,
      mentions: Math.floor(Math.random() * 10000) + 1000,
      trending: ['#Bitcoin', '#Crypto', '#BTC', '#Ethereum', '#Altcoins'],
      topHashtags: ['#HODL', '#ToTheMoon', '#CryptoBull', '#DeFi'],
      confidence: Math.random() * 0.4 + 0.6 // 60–100%
    };
  }

  async simulateRedditAnalysis(/* subreddits */) {
    const sentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
    return {
      sentiment: randomSentiment,
      score: Math.random() * 100,
      posts: Math.floor(Math.random() * 500) + 100,
      comments: Math.floor(Math.random() * 5000) + 1000,
      upvoteRatio: Math.random() * 0.3 + 0.7, // 70–100%
      topPosts: [
        'Bitcoin breaking resistance!',
        'Altcoin season incoming?',
        'Market analysis for this week'
      ],
      confidence: Math.random() * 0.3 + 0.7 // 70–100%
    };
  }

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
      confidence: Math.random() * 0.2 + 0.8 // 80–100%
    };
  }

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
      confidence: Math.random() * 0.3 + 0.7 // 70–100%
    };
  }

  // ========== AGREGAÇÃO / RELATÓRIOS ==========

  /**
   * Agrega sentimento de todas as fontes (determinístico para NEUTRAL)
   */
  aggregateSocialSentiment(socialData) {
    const sources = [];
    let totalScore = 0;
    let totalWeight = 0;
    let bullishCount = 0;
    let bearishCount = 0;
    let neutralCount = 0;

    const weights = { twitter: 0.3, reddit: 0.25, news: 0.25, googleTrends: 0.2 };

    Object.entries(socialData).forEach(([platform, data]) => {
      if (data && platform !== 'timestamp') {
        sources.push({
          platform: data.platform,
          sentiment: data.sentiment,
          score: Number.isFinite(data.score) ? data.score : 50,
          confidence: Number.isFinite(data.confidence) ? data.confidence : 0.5
        });

        const weight = weights[platform] ?? 0.1;
        totalWeight += weight;

        let sentimentScore = 50; // NEUTRAL determinístico
        if (data.sentiment === 'BULLISH') {
          sentimentScore = 70 + ((data.score || 50) * 0.3);
          bullishCount++;
        } else if (data.sentiment === 'BEARISH') {
          sentimentScore = 30 - ((data.score || 50) * 0.3);
          bearishCount++;
        } else {
          // NEUTRAL -> usa o próprio score (fallback 50) sem jitter
          sentimentScore = Number.isFinite(data.score) ? data.score : 50;
          neutralCount++;
        }

        totalScore += sentimentScore * weight;
      }
    });

    const aggregatedScore = totalWeight > 0 ? totalScore / totalWeight : 50;

    let overallSentiment = 'NEUTRAL';
    if (aggregatedScore > 60) overallSentiment = 'BULLISH';
    else if (aggregatedScore < 40) overallSentiment = 'BEARISH';

    const maxCount = Math.max(bullishCount, bearishCount, neutralCount);
    const totalSources = bullishCount + bearishCount + neutralCount;
    const confidencePct = totalSources > 0 ? (maxCount / totalSources) * 100 : 50;

    return {
      overall: overallSentiment,
      score: Math.round(aggregatedScore),
      confidence: Math.round(confidencePct),
      sources,
      breakdown: { bullish: bullishCount, bearish: bearishCount, neutral: neutralCount },
      details: this.generateSocialAnalysis(socialData, overallSentiment),
      timestamp: socialData.timestamp
    };
  }

  /**
   * Gera análise textual (corrige Twitter mentions -> volume)
   */
  generateSocialAnalysis(socialData, overallSentiment) {
    const analysis = [];

    if (socialData.twitter) {
      const t = socialData.twitter;
      analysis.push(`🐦 Twitter: ${t.volume ? Number(t.volume).toLocaleString('pt-BR') : '0'} menções, sentimento ${t.sentiment}`);
      if (Array.isArray(t.trending) && t.trending.length > 0) {
        analysis.push(`📈 Trending: ${t.trending.slice(0, 3).join(', ')}`);
      }
    }

    if (socialData.reddit) {
      const r = socialData.reddit;
      analysis.push(`📱 Reddit: ${r.posts || 0} posts, ${r.comments ? Number(r.comments).toLocaleString('pt-BR') : '0'} comentários`);
      if (Number.isFinite(r.upvoteRatio)) {
        analysis.push(`👍 Upvote ratio: ${(r.upvoteRatio * 100).toFixed(1)}%`);
      }
    }

    if (socialData.googleTrends) {
      const g = socialData.googleTrends;
      analysis.push(`🔍 Google: Interesse ${g.interest}/100 em pesquisas crypto`);
    }

    if (socialData.news) {
      const n = socialData.news;
      analysis.push(`📰 Notícias: ${n.articles ?? 0} artigos analisados, tom ${n.sentiment}`);
    }

    if (overallSentiment === 'BULLISH') analysis.push('🟢 Redes sociais mostram otimismo generalizado');
    else if (overallSentiment === 'BEARISH') analysis.push('🔴 Redes sociais refletem pessimismo no mercado');
    else analysis.push('🟡 Sentimento misto nas redes sociais');

    return analysis;
    }

  // ========== CACHE ==========

  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCachedData(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}

export default SocialSentimentService;
