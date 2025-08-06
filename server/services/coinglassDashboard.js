/**
 * Serviço de dashboard para a API Coinglass
 */
import { Logger } from '../services/logger.js';
import CoinglassPerformanceAnalyzer from '../services/coinglassPerformanceAnalyzer.js';
import { CoinglassDataAnalyzer } from '../services/coinglassDataAnalyzer.js';
import CoinglassMonitor from '../services/coinglassMonitor.js';

const logger = new Logger('CoinglassDashboard');

export default class CoinglassDashboard {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.performanceAnalyzer = new CoinglassPerformanceAnalyzer(coinglassService);
    this.dataAnalyzer = new CoinglassDataAnalyzer(coinglassService);
    this.monitor = new CoinglassMonitor(coinglassService);
    this.dashboardData = {};
    this.updateInterval = 60 * 1000; // 1 minuto
    this.lastUpdate = Date.now();
  }

  /**
   * Atualiza dados do dashboard
   */
  async updateDashboard() {
    try {
      const now = Date.now();
      if (now - this.lastUpdate < this.updateInterval) return;

      // Atualiza dados de performance
      const performance = await this.performanceAnalyzer.generatePerformanceReport();

      // Atualiza dados de análise
      const dataAnalysis = await this.dataAnalyzer.generateAnalysisReport('BTC'); // Exemplo com BTC

      // Atualiza dados de monitoramento
      const monitoring = await this.monitor.generateLogReport();

      // Atualiza dados do cache
      const cacheMetrics = this.service.getCacheMetrics();

      // Atualiza dados do rate limit
      const rateLimit = this.service.getRateLimitMetrics();

      // Atualiza dados dos endpoints
      const endpoints = await this.getEndpointMetrics();

      // Atualiza dados do dashboard
      this.dashboardData = {
        timestamp: new Date().toLocaleString('pt-BR'),
        performance,
        dataAnalysis,
        monitoring,
        cache: cacheMetrics,
        rateLimit,
        endpoints
      };

      logger.info('📊 Dashboard atualizado');
      this.lastUpdate = now;
    } catch (error) {
      logger.error('Erro ao atualizar dashboard:', error);
      throw error;
    }
  }

  /**
   * Obtém métricas dos endpoints
   */
  async getEndpointMetrics() {
    const metrics = this.service.getMetrics();
    const endpoints = {};

    Object.entries(metrics.endpoints).forEach(([endpoint, stats]) => {
      endpoints[endpoint] = {
        calls: stats.calls,
        errors: stats.errors,
        successRate: stats.successRate,
        errorRate: stats.errorRate,
        responseTime: stats.responseTime,
        lastCall: stats.lastCall
      };
    });

    return endpoints;
  }

  /**
   * Obtém dados do dashboard
   */
  getDashboardData() {
    return { ...this.dashboardData };
  }

  /**
   * Obtém insights
   */
  getInsights() {
    const insights = [];

    // Insights de performance
    if (this.dashboardData.performance.metrics.errorRate.current > 5) {
      insights.push('⚠️ Alta taxa de erro na API');
    }

    if (this.dashboardData.performance.metrics.cacheHitRate.current < 80) {
      insights.push('⚠️ Baixa taxa de cache hit');
    }

    // Insights de análise de dados
    if (this.dashboardData.dataAnalysis.currentAnalysis.volatility.level === 'high') {
      insights.push('⚠️ Volatilidade alta detectada');
    }

    // Insights de monitoramento
    if (this.dashboardData.monitoring.stats.byLevel.error > 10) {
      insights.push('⚠️ Número elevado de erros detectados');
    }

    return insights;
  }

  /**
   * Gera relatório completo
   */
  generateReport() {
    const report = {
      timestamp: new Date().toLocaleString('pt-BR'),
      data: this.getDashboardData(),
      insights: this.getInsights(),
      suggestions: this.generateOptimizationSuggestions()
    };

    logger.info('📊 Relatório Completo:', report);
    return report;
  }

  /**
   * Gera sugestões de otimização
   */
  generateOptimizationSuggestions() {
    const suggestions = [];

    // Sugestões baseadas em performance
    if (this.dashboardData.performance.metrics.errorRate.current > 5) {
      suggestions.push('Aumentar número de tentativas de retry');
    }

    if (this.dashboardData.performance.metrics.cacheHitRate.current < 80) {
      suggestions.push('Aumentar TTL do cache');
    }

    // Sugestões baseadas em endpoints
    Object.entries(this.dashboardData.endpoints).forEach(([endpoint, stats]) => {
      if (stats.errorRate > 20) {
        suggestions.push(`Ajustar configuração do endpoint ${endpoint}`);
      }
      if (stats.responseTime > 1000) {
        suggestions.push(`Aumentar timeout para o endpoint ${endpoint}`);
      }
    });

    return suggestions;
  }

  /**
   * Define intervalo de atualização
   */
  setInterval(interval) {
    this.updateInterval = interval;
  }

  /**
   * Obtém status do dashboard
   */
  getStatus() {
    return {
      lastUpdate: this.lastUpdate,
      updateInterval: this.updateInterval,
      isActive: true
    };
  }

  /**
   * Inicia atualização periódica
   */
  start() {
    this.updateDashboard();
    setInterval(() => this.updateDashboard(), this.updateInterval);
  }
}
