/**
 * Serviço de otimização automática para a API Coinglass
 */
import { Logger } from '../services/logger.js';
import CoinglassPerformanceAnalyzer from '../services/coinglassPerformanceAnalyzer.js';
import CoinglassMonitor from '../services/coinglassMonitor.js';
import { CoinglassLogger } from '../services/coinglassLogger.js';

const logger = new Logger('CoinglassAutoOptimizer');

export default class CoinglassAutoOptimizer {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.performanceAnalyzer = new CoinglassPerformanceAnalyzer(coinglassService);
    this.monitor = new CoinglassMonitor(coinglassService);
    this.logger = new CoinglassLogger();
    this.optimizationInterval = 60 * 1000; // 1 minuto
    this.lastOptimization = Date.now();
    this.optimizations = new Map();
  }

  /**
   * Inicia otimização automática
   */
  start() {
    this.optimize();
    setInterval(() => this.optimize(), this.optimizationInterval);
  }

  /**
   * Realiza otimização
   */
  async optimize() {
    try {
      const now = Date.now();
      if (now - this.lastOptimization < this.optimizationInterval) return;

      // Analisa performance
      const performance = await this.performanceAnalyzer.generatePerformanceReport();

      // Verifica monitoramento
      const monitoring = await this.monitor.generateLogReport();

      // Gera sugestões
      const suggestions = this.generateOptimizationSuggestions(performance, monitoring);

      // Aplica otimizações
      suggestions.forEach(suggestion => {
        this.applyOptimization(suggestion);
      });

      // Registra otimização
      this.logOptimization(suggestions);

      this.lastOptimization = now;
    } catch (error) {
      logger.error('Erro na otimização automática:', error);
      throw error;
    }
  }

  /**
   * Gera sugestões de otimização
   */
  generateOptimizationSuggestions(performance, monitoring) {
    const suggestions = [];

    // Sugestões baseadas em performance
    if (performance.metrics.errorRate.current > 5) {
      suggestions.push({
        type: 'retry',
        action: 'increase',
        value: 2
      });
    }

    if (performance.metrics.cacheHitRate.current < 80) {
      suggestions.push({
        type: 'cache',
        action: 'increaseTTL',
        value: 60 * 60 * 1000 // 1 hora
      });
    }

    // Sugestões baseadas em monitoramento
    if (monitoring.stats.byLevel.error > 10) {
      suggestions.push({
        type: 'retry',
        action: 'increase',
        value: 3
      });
    }

    // Sugestões baseadas em endpoints
    Object.entries(performance.metrics.endpoints).forEach(([endpoint, stats]) => {
      if (stats.errorRate > 20) {
        suggestions.push({
          type: 'endpoint',
          action: 'adjust',
          value: endpoint
        });
      }
      if (stats.responseTime > 1000) {
        suggestions.push({
          type: 'timeout',
          action: 'increase',
          value: 5000
        });
      }
    });

    return suggestions;
  }

  /**
   * Aplica otimização
   */
  applyOptimization(suggestion) {
    switch (suggestion.type) {
      case 'retry':
        this.service.setRetryAttempts(suggestion.value);
        break;

      case 'cache':
        this.service.setCacheTTL(suggestion.value);
        break;

      case 'endpoint':
        this.service.adjustEndpoint(suggestion.value);
        break;

      case 'timeout':
        this.service.setTimeout(suggestion.value);
        break;

      default:
        logger.warn(`Tipo de otimização desconhecido: ${suggestion.type}`);
    }
  }

  /**
   * Registra otimização
   */
  logOptimization(suggestions) {
    const optimization = {
      timestamp: new Date().toLocaleString('pt-BR'),
      suggestions,
      applied: suggestions.length > 0
    };

    this.optimizations.set(new Date().toISOString(), optimization);
    logger.info('⚙️ Otimização aplicada:', optimization);
  }

  /**
   * Obtém histórico de otimizações
   */
  getOptimizationHistory() {
    return [...this.optimizations.values()];
  }

  /**
   * Obtém estatísticas de otimização
   */
  getOptimizationStats() {
    const optimizations = this.getOptimizationHistory();
    
    return {
      total: optimizations.length,
      byType: optimizations.reduce((acc, opt) => {
        opt.suggestions.forEach(s => {
          acc[s.type] = (acc[s.type] || 0) + 1;
        });
        return acc;
      }, {}),
      successRate: optimizations.filter(opt => opt.applied).length / optimizations.length * 100
    };
  }

  /**
   * Gera relatório de otimização
   */
  generateOptimizationReport() {
    const report = {
      timestamp: new Date().toLocaleString('pt-BR'),
      stats: this.getOptimizationStats(),
      recent: this.getOptimizationHistory().slice(-5),
      insights: this.generateOptimizationInsights()
    };

    logger.info('📊 Relatório de Otimização:', report);
    return report;
  }

  /**
   * Gera insights de otimização
   */
  generateOptimizationInsights() {
    const stats = this.getOptimizationStats();
    const insights = [];

    if (stats.successRate < 70) {
      insights.push('⚠️ Baixa taxa de sucesso nas otimizações');
    }

    if (stats.byType.endpoint && stats.byType.endpoint > 10) {
      insights.push('⚠️ Muitas otimizações em endpoints - Verificar configurações');
    }

    return insights;
  }

  /**
   * Define intervalo de otimização
   */
  setInterval(interval) {
    this.optimizationInterval = interval;
  }

  /**
   * Obtém status da otimização
   */
  getStatus() {
    return {
      lastOptimization: this.lastOptimization,
      optimizationInterval: this.optimizationInterval,
      totalOptimizations: this.optimizations.size,
      isActive: true
    };
  }
}
