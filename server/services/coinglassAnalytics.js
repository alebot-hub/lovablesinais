/**
 * Serviço de análise de dados para a API Coinglass
 */
import { Logger } from '../services/logger.js';

const logger = new Logger('CoinglassAnalytics');

export default class CoinglassAnalytics {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.analyses = new Map();
    this.analysisInterval = 60 * 1000; // 1 minuto
    this.lastAnalysis = Date.now();
  }

  /**
   * Analisa dados de um símbolo
   */
  async analyzeSymbol(symbol) {
    try {
      const now = Date.now();
      if (now - this.lastAnalysis < this.analysisInterval) {
        return this.getLatestAnalysis(symbol);
      }

      // Coleta dados
      const fundingRate = await this.service.getFundingRate(symbol);
      const longShortRatio = await this.service.getLongShortRatio(symbol);
      const openInterest = await this.service.getOpenInterest(symbol);
      const volume = await this.service.getVolume(symbol);
      const volatility = await this.service.getVolatility(symbol);

      // Analisa dados
      const analysis = {
        timestamp: now,
        fundingRate: this.analyzeFundingRate(fundingRate),
        longShortRatio: this.analyzeLongShortRatio(longShortRatio),
        openInterest: this.analyzeOpenInterest(openInterest),
        volume: this.analyzeVolume(volume),
        volatility: this.analyzeVolatility(volatility),
        overallTrend: this.calculateOverallTrend(fundingRate, longShortRatio, openInterest, volume, volatility)
      };

      // Armazena análise
      this.storeAnalysis(symbol, analysis);
      this.lastAnalysis = now;

      return analysis;
    } catch (error) {
      logger.error(`Erro ao analisar dados de ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Analisa taxa de funding
   */
  analyzeFundingRate(data) {
    const rate = data.rate || 0;
    return {
      rate,
      trend: rate > 0 ? 'bullish' : 'bearish',
      magnitude: Math.abs(rate) * 100
    };
  }

  /**
   * Analisa ratio long/short
   */
  analyzeLongShortRatio(data) {
    const ratio = data.ratio || 1;
    return {
      ratio,
      trend: ratio > 1 ? 'bullish' : 'bearish',
      magnitude: Math.abs(ratio - 1) * 100
    };
  }

  /**
   * Analisa open interest
   */
  analyzeOpenInterest(data) {
    const oi = data.oi || 0;
    return {
      oi,
      change: data.change || 0,
      trend: data.change > 0 ? 'increasing' : 'decreasing'
    };
  }

  /**
   * Analisa volume
   */
  analyzeVolume(data) {
    const volume = data.volume || 0;
    return {
      volume,
      change: data.change || 0,
      trend: data.change > 0 ? 'increasing' : 'decreasing'
    };
  }

  /**
   * Analisa volatilidade
   */
  analyzeVolatility(data) {
    const volatility = data.volatility || 0;
    return {
      volatility,
      level: this.getVolatilityLevel(volatility)
    };
  }

  /**
   * Obtém nível de volatilidade
   */
  getVolatilityLevel(volatility) {
    if (volatility < 0.5) return 'low';
    if (volatility < 1.5) return 'medium';
    return 'high';
  }

  /**
   * Calcula tendência geral
   */
  calculateOverallTrend(...analyses) {
    const bullishCount = analyses.filter(a => a.trend === 'bullish').length;
    const bearishCount = analyses.filter(a => a.trend === 'bearish').length;

    if (bullishCount > bearishCount) return 'bullish';
    if (bearishCount > bullishCount) return 'bearish';
    return 'neutral';
  }

  /**
   * Armazena análise
   */
  storeAnalysis(symbol, analysis) {
    const symbolAnalyses = this.analyses.get(symbol) || [];
    symbolAnalyses.push(analysis);
    
    // Mantém apenas as últimas 24 análises
    if (symbolAnalyses.length > 24) {
      symbolAnalyses.shift();
    }

    this.analyses.set(symbol, symbolAnalyses);
  }

  /**
   * Obtém última análise
   */
  getLatestAnalysis(symbol) {
    const analyses = this.analyses.get(symbol);
    return analyses?.[analyses.length - 1];
  }

  /**
   * Obtém histórico de análises
   */
  getAnalysisHistory(symbol) {
    return this.analyses.get(symbol) || [];
  }

  /**
   * Gera relatório de análise
   */
  generateAnalysisReport(symbol) {
    const analysis = this.getLatestAnalysis(symbol);
    const history = this.getAnalysisHistory(symbol);

    const report = {
      timestamp: new Date().toLocaleString('pt-BR'),
      symbol,
      currentAnalysis: analysis,
      historicalTrend: this.calculateHistoricalTrend(history),
      insights: this.generateInsights(analysis, history)
    };

    logger.info('📊 Relatório de Análise:', report);
    return report;
  }

  /**
   * Calcula tendência histórica
   */
  calculateHistoricalTrend(history) {
    if (history.length < 2) return 'stable';

    const last = history[history.length - 1];
    const first = history[0];

    let bullishTrend = 0;
    let bearishTrend = 0;

    history.forEach(analysis => {
      if (analysis.overallTrend === 'bullish') bullishTrend++;
      if (analysis.overallTrend === 'bearish') bearishTrend++;
    });

    if (bullishTrend > bearishTrend) return 'bullish';
    if (bearishTrend > bullishTrend) return 'bearish';
    return 'neutral';
  }

  /**
   * Gera insights
   */
  generateInsights(currentAnalysis, history) {
    const insights = [];

    // Insights baseados em volatilidade
    if (currentAnalysis.volatility.level === 'high') {
      insights.push('Volatilidade alta detectada - Cuidado com entradas');
    }

    // Insights baseados em tendência
    if (currentAnalysis.overallTrend === 'bullish') {
      insights.push('Tendência geral em alta - Boas oportunidades de compra');
    }

    // Insights baseados em volume
    if (currentAnalysis.volume.trend === 'increasing' && 
        currentAnalysis.volume.change > 20) {
      insights.push('Volume crescente - Possível movimento forte');
    }

    return insights;
  }
}
