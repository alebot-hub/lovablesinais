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

    // Pesos ajustados para métricas do Coinglass
    this.metricsWeight = {
      fundingRate: 0.3,      // 30% - Importante para identificar pressões de mercado
      longShortRatio: 0.25,  // 25% - Indicador de posição do mercado
      openInterest: 0.2,     // 20% - Força do mercado
      volume: 0.15,          // 15% - Volume de negociação
      social: 0.1,          // 10% - Sentimento social
      volatility: 0.05,      // 5% - Volatilidade do mercado
      overallTrend: 0.05     // 5% - Tendência geral
    };

    // Intervalos de análise
    this.timeIntervals = {
      short: { minutes: 15 },    // Análise de curto prazo
      medium: { minutes: 60 },   // Análise de médio prazo
      long: { minutes: 240 }     // Análise de longo prazo
    };
  }

  /**
   * Analisa sentimento integrado para um símbolo em diferentes intervalos de tempo
   */
  async analyzeIntegratedSentiment(symbol, interval = 'medium') {
    try {
      // Obtém análise do Coinglass
      const coinglassAnalysis = await this.coinglassAnalytics.analyzeSymbol(symbol);
      
      // Obtém análise do sentimento social
      const socialAnalysis = await this.socialSentiment.analyzeSocialSentiment();

      // Calcula peso das métricas
      const metricsWeight = this.metricsWeight;

      // Normaliza as métricas (0 a 1)
      const normalizedMetrics = {
        fundingRate: this.normalize(coinglassAnalysis.fundingRate.magnitude),
        longShortRatio: this.normalize(coinglassAnalysis.longShortRatio.magnitude),
        openInterest: this.normalize(coinglassAnalysis.openInterest.change),
        volume: this.normalize(coinglassAnalysis.volume.change),
        social: this.normalize(socialAnalysis.overallSentiment),
        volatility: this.normalize(coinglassAnalysis.volatility),
        overallTrend: this.normalize(coinglassAnalysis.overallTrend)
      };

      // Calcula sentimento integrado
      const integratedSentiment = this.calculateIntegratedSentiment(normalizedMetrics, metricsWeight);

      // Gera relatório
      const report = {
        timestamp: new Date().toISOString(),
        symbol,
        interval,
        coinglassMetrics: coinglassAnalysis,
        socialSentiment: socialAnalysis,
        integratedSentiment,
        insights: this.generateInsights(integratedSentiment, normalizedMetrics),
        timeframeAnalysis: this.analyzeTimeframe(coinglassAnalysis, interval)
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
   * Analisa métricas em diferentes intervalos de tempo
   */
  analyzeTimeframe(coinglassAnalysis, interval) {
    const timeframe = this.timeIntervals[interval];
    const timeframeAnalysis = {};

    // Análise de variação
    timeframeAnalysis.variation = {
      fundingRate: this.calculateVariation(coinglassAnalysis.fundingRate, timeframe),
      longShortRatio: this.calculateVariation(coinglassAnalysis.longShortRatio, timeframe),
      openInterest: this.calculateVariation(coinglassAnalysis.openInterest, timeframe),
      volume: this.calculateVariation(coinglassAnalysis.volume, timeframe)
    };

    // Análise de tendência
    timeframeAnalysis.trend = {
      fundingRate: this.analyzeTrend(coinglassAnalysis.fundingRate, timeframe),
      longShortRatio: this.analyzeTrend(coinglassAnalysis.longShortRatio, timeframe),
      openInterest: this.analyzeTrend(coinglassAnalysis.openInterest, timeframe),
      volume: this.analyzeTrend(coinglassAnalysis.volume, timeframe)
    };

    return timeframeAnalysis;
  }

  /**
   * Calcula variação em um intervalo de tempo
   */
  calculateVariation(metric, timeframe) {
    // Implementar lógica para calcular variação
    return {
      percentage: this.calculatePercentageChange(metric),
      direction: this.determineDirection(metric)
    };
  }

  /**
   * Analisa tendência em um intervalo de tempo
   */
  analyzeTrend(metric, timeframe) {
    // Implementar lógica para análise de tendência
    return {
      strength: this.calculateTrendStrength(metric),
      direction: this.determineTrendDirection(metric)
    };
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
   * Gera insights mais detalhados baseados no sentimento e métricas do Coinglass
   */
  generateInsights(sentiment, metrics) {
    const insights = [];

    // Análise de mercado
    if (sentiment > 0.7) {
      insights.push('Sentimento altamente positivo no mercado');
      if (metrics.fundingRate > 0.6) {
        insights.push('Taxa de financiamento alta indicando pressão compradora');
      }
    } else if (sentiment < 0.3) {
      insights.push('Sentimento altamente negativo no mercado');
      if (metrics.fundingRate < 0.4) {
        insights.push('Taxa de financiamento baixa indicando pressão vendedora');
      }
    }

    // Análise de posição do mercado
    if (metrics.longShortRatio > 0.7) {
      insights.push('Posição longa dominante no mercado');
    } else if (metrics.longShortRatio < 0.3) {
      insights.push('Posição short dominante no mercado');
    }

    // Análise de volume e interesse aberto
    if (metrics.openInterest > 0.8 && metrics.volume > 0.7) {
      insights.push('Alto interesse aberto e volume de negociação indicando força no mercado');
    } else if (metrics.openInterest < 0.2 && metrics.volume < 0.3) {
      insights.push('Baixo interesse e volume de negociação indicando mercado fraco');
    }

    // Análise de volatilidade
    if (metrics.volatility > 0.6) {
      insights.push('Mercado altamente volátil - maior risco');
    } else if (metrics.volatility < 0.3) {
      insights.push('Mercado estável - menor risco');
    }

    // Análise de disparidades
    if (Math.abs(metrics.fundingRate - metrics.social) > 0.4) {
      insights.push('Disparidade significativa entre mercado e sentimento social');
      if (metrics.fundingRate > metrics.social) {
        insights.push('Mercado mais otimista que o sentimento social');
      } else {
        insights.push('Sentimento social mais otimista que o mercado');
      }
    }

    // Análise de tendência geral
    if (metrics.overallTrend > 0.7) {
      insights.push('Tendência de alta forte no mercado');
    } else if (metrics.overallTrend < 0.3) {
      insights.push('Tendência de baixa forte no mercado');
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

  /**
   * Calcula variação percentual
   */
  calculatePercentageChange(metric) {
    // Implementar lógica para calcular variação percentual
  }

  /**
   * Determina direção da variação
   */
  determineDirection(metric) {
    // Implementar lógica para determinar direção da variação
  }

  /**
   * Calcula força da tendência
   */
  calculateTrendStrength(metric) {
    // Implementar lógica para calcular força da tendência
  }

  /**
   * Determina direção da tendência
   */
  determineTrendDirection(metric) {
    // Implementar lógica para determinar direção da tendência
  }
}
