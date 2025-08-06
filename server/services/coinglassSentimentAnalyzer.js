/**
 * Serviço de análise de sentimento integrado com métricas do Coinglass
 */
import { Logger } from '../services/logger.js';
import CoinglassAnalytics from '../services/coinglassAnalytics.js';
import SocialSentimentService from '../services/socialSentimentService.js';

const logger = new Logger('CoinglassSentimentAnalyzer');

export default class CoinglassSentimentAnalyzer {
  constructor() {
    this.coinglassAnalytics = new CoinglassAnalytics();
    this.socialSentiment = new SocialSentimentService();
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutos
  }

  /**
   * Analisa sentimento integrado para um símbolo
   */
  async analyzeIntegratedSentiment(symbol) {
    try {
      // Obtém análise do Coinglass
      const coinglassAnalysis = await this.coinglassAnalytics.analyzeSymbol(symbol);
      
      // Obtém análise do sentimento social
      const socialAnalysis = await this.socialSentiment.analyzeSocialSentiment();

      // Calcula peso das métricas
      const metricsWeight = {
        fundingRate: 0.3,
        longShortRatio: 0.25,
        openInterest: 0.2,
        volume: 0.15,
        social: 0.1
      };

      // Normaliza as métricas (0 a 1)
      const normalizedMetrics = {
        fundingRate: this.normalize(coinglassAnalysis.fundingRate.magnitude),
        longShortRatio: this.normalize(coinglassAnalysis.longShortRatio.magnitude),
        openInterest: this.normalize(coinglassAnalysis.openInterest.change),
        volume: this.normalize(coinglassAnalysis.volume.change),
        social: this.normalize(socialAnalysis.overallSentiment)
      };

      // Calcula sentimento integrado
      const integratedSentiment = this.calculateIntegratedSentiment(normalizedMetrics, metricsWeight);

      // Gera relatório
      const report = {
        timestamp: new Date().toISOString(),
        symbol,
        coinglassMetrics: coinglassAnalysis,
        socialSentiment: socialAnalysis,
        integratedSentiment,
        insights: this.generateInsights(integratedSentiment, normalizedMetrics)
      };

      // Armazena no cache
      this.cache.set(symbol, { 
        data: report, 
        timestamp: Date.now() 
      });

      return report;
    } catch (error) {
      logger.error(`Erro ao analisar sentimento integrado para ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Normaliza valor entre 0 e 1
   */
  normalize(value) {
    return Math.max(0, Math.min(1, value / 100));
  }

  /**
   * Calcula sentimento integrado
   */
  calculateIntegratedSentiment(metrics, weights) {
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const weightedSum = Object.entries(metrics).reduce((sum, [metric, value]) => {
      return sum + (value * weights[metric]);
    }, 0);

    return weightedSum / totalWeight;
  }

  /**
   * Gera insights baseados no sentimento
   */
  generateInsights(sentiment, metrics) {
    const insights = [];

    // Análise geral
    if (sentiment > 0.7) {
      insights.push('Sentimento altamente positivo no mercado');
    } else if (sentiment < 0.3) {
      insights.push('Sentimento altamente negativo no mercado');
    }

    // Análise de disparidades
    if (Math.abs(metrics.fundingRate - metrics.social) > 0.4) {
      insights.push('Disparidade significativa entre mercado e sentimento social');
    }

    // Análise de força
    if (metrics.openInterest > 0.8) {
      insights.push('Alto interesse aberto indicando força no mercado');
    }

    // Análise de volume
    if (metrics.volume > 0.7) {
      insights.push('Volume alto confirmado pelo sentimento positivo');
    }

    return insights;
  }

  /**
   * Obtém análise do cache ou recalcula
   */
  async getAnalysis(symbol) {
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return this.analyzeIntegratedSentiment(symbol);
  }
}
