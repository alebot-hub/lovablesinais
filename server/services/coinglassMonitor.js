/**
 * Serviço de monitoramento para a API Coinglass
 */
import { Logger } from '../services/logger.js';
import CoinglassPerformanceAnalyzer from '../services/coinglassPerformanceAnalyzer.js';
import CoinglassValidator from '../services/coinglassValidator.js';

const logger = new Logger('CoinglassMonitor');

export default class CoinglassMonitor {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.performanceAnalyzer = new CoinglassPerformanceAnalyzer(coinglassService);
    this.validator = new CoinglassValidator(coinglassService);
    this.monitoredEndpoints = new Set();
    this.monitorInterval = 60 * 1000; // 1 minuto
    this.lastCheck = Date.now();
  }

  /**
   * Inicia monitoramento
   */
  start() {
    this.checkHealth();
    setInterval(() => this.checkHealth(), this.monitorInterval);
  }

  /**
   * Verifica saúde do sistema
   */
  async checkHealth() {
    try {
      const now = Date.now();
      if (now - this.lastCheck < this.monitorInterval) return;

      // Verifica performance
      const performance = await this.performanceAnalyzer.generatePerformanceReport();
      
      // Verifica validação
      const validation = this.validator.getValidationMetrics();

      // Verifica endpoints
      const endpoints = await this.checkEndpoints();

      // Gera relatório
      const report = {
        timestamp: new Date().toLocaleString('pt-BR'),
        performance,
        validation,
        endpoints,
        metrics: this.service.getMetrics()
      };

      logger.info('📊 Relatório de Monitoramento:', report);
      
      // Verifica problemas
      if (this.hasCriticalIssues(report)) {
        this.sendAlert(report);
      }

      this.lastCheck = now;
    } catch (error) {
      logger.error('Erro no monitoramento:', error);
      this.sendAlert({ error });
    }
  }

  /**
   * Verifica endpoints
   */
  async checkEndpoints() {
    const endpoints = {};
    const metrics = this.service.getMetrics();

    Object.entries(metrics.endpoints).forEach(([endpoint, stats]) => {
      endpoints[endpoint] = {
        status: stats.status,
        calls: stats.calls,
        errors: stats.errors,
        successRate: stats.successRate,
        errorRate: stats.errorRate,
        lastCall: stats.lastCall,
        responseTime: stats.responseTime
      };
    });

    return endpoints;
  }

  /**
   * Verifica se há problemas críticos
   */
  hasCriticalIssues(report) {
    const metrics = report.metrics;
    
    // Verifica taxa de erro
    if (metrics.errorRate > 10) {
      return true;
    }

    // Verifica cache
    if (metrics.cacheHitRate < 70) {
      return true;
    }

    // Verifica endpoints
    Object.entries(report.endpoints).forEach(([endpoint, stats]) => {
      if (stats.errorRate > 20) {
        return true;
      }
      if (stats.responseTime > 1000) {
        return true;
      }
    });

    return false;
  }

  /**
   * Envia alerta
   */
  async sendAlert(report) {
    const message = `
⚠️ Alerta Crítico - ${new Date().toLocaleString('pt-BR')}

${this.generateAlertMessage(report)}
    `;
    await this.service.sendAlert(message);
  }

  /**
   * Gera mensagem de alerta
   */
  generateAlertMessage(report) {
    const alerts = [];

    // Alertas de performance
    if (report.metrics.errorRate > 10) {
      alerts.push(`❌ Taxa de erro alta (${report.metrics.errorRate}%)`);
    }

    if (report.metrics.cacheHitRate < 70) {
      alerts.push(`❌ Baixa taxa de cache hit (${report.metrics.cacheHitRate}%)`);
    }

    // Alertas de endpoints
    Object.entries(report.endpoints).forEach(([endpoint, stats]) => {
      if (stats.errorRate > 20) {
        alerts.push(`❌ Endpoint ${endpoint} com erro alto (${stats.errorRate}%)`);
      }
      if (stats.responseTime > 1000) {
        alerts.push(`❌ Endpoint ${endpoint} lento (${stats.responseTime}ms)`);
      }
    });

    return alerts.join('\n');
  }

  /**
   * Adiciona endpoint para monitoramento
   */
  addEndpoint(endpoint) {
    this.monitoredEndpoints.add(endpoint);
  }

  /**
   * Remove endpoint do monitoramento
   */
  removeEndpoint(endpoint) {
    this.monitoredEndpoints.delete(endpoint);
  }

  /**
   * Obtém endpoints monitorados
   */
  getMonitoredEndpoints() {
    return [...this.monitoredEndpoints];
  }

  /**
   * Define intervalo de monitoramento
   */
  setInterval(interval) {
    this.monitorInterval = interval;
  }

  /**
   * Obtém status do monitoramento
   */
  getStatus() {
    return {
      lastCheck: this.lastCheck,
      monitorInterval: this.monitorInterval,
      monitoredEndpoints: this.getMonitoredEndpoints(),
      isActive: true
    };
  }

  /**
   * Gera relatório detalhado
   */
  async generateDetailedReport() {
    const report = {
      timestamp: new Date().toLocaleString('pt-BR'),
      status: this.getStatus(),
      performance: await this.performanceAnalyzer.generatePerformanceReport(),
      validation: this.validator.getValidationMetrics(),
      endpoints: await this.checkEndpoints(),
      suggestions: this.generateOptimizationSuggestions()
    };

    logger.info('📊 Relatório Detalhado:', report);
    return report;
  }

  /**
   * Gera sugestões de otimização
   */
  generateOptimizationSuggestions() {
    const suggestions = [];
    const metrics = this.service.getMetrics();

    // Sugestões baseadas em métricas
    if (metrics.errorRate > 5) {
      suggestions.push('Aumentar número de tentativas de retry');
    }

    if (metrics.cacheHitRate < 80) {
      suggestions.push('Aumentar TTL do cache');
    }

    if (metrics.responseTime > 500) {
      suggestions.push('Aumentar timeout para endpoints lentos');
    }

    return suggestions;
  }
}
