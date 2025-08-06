/**
 * Serviço de monitoramento de saúde para a API Coinglass
 */
import { Logger } from './logger';
import { CoinglassPerformanceAnalyzer } from './coinglassPerformanceAnalyzer';
import { CoinglassMonitor } from './coinglassMonitor';
import { CoinglassLogger } from './coinglassLogger';
import CoinglassHealthMonitor from './coinglassHealthMonitor.js';

const logger = new Logger('CoinglassHealthMonitor');

export default class CoinglassHealthMonitor {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.performanceAnalyzer = new CoinglassPerformanceAnalyzer(coinglassService);
    this.monitor = new CoinglassMonitor(coinglassService);
    this.logger = new CoinglassLogger();
    this.healthCheckInterval = 60 * 1000; // 1 minuto
    this.lastCheck = Date.now();
    this.healthStatus = {};
    this.coinglassHealthMonitor = new CoinglassHealthMonitor();
  }

  /**
   * Inicia monitoramento de saúde
   */
  start() {
    this.checkHealth();
    setInterval(() => this.checkHealth(), this.healthCheckInterval);
    this.coinglassHealthMonitor.start();
  }

  /**
   * Verifica saúde do sistema
   */
  async checkHealth() {
    try {
      const now = Date.now();
      if (now - this.lastCheck < this.healthCheckInterval) return;

      // Verifica performance
      const performance = await this.performanceAnalyzer.generatePerformanceReport();

      // Verifica monitoramento
      const monitoring = await this.monitor.generateLogReport();

      // Verifica logs
      const logStats = this.logger.getLogStats();

      // Verifica integração da API do Coinglass
      const coinglassStatus = await this.coinglassHealthMonitor.checkHealth();

      // Gera status de saúde
      this.healthStatus = {
        timestamp: new Date().toLocaleString('pt-BR'),
        performance: this.checkPerformanceHealth(performance),
        monitoring: this.checkMonitoringHealth(monitoring),
        logs: this.checkLogHealth(logStats),
        coinglass: coinglassStatus
      };

      // Gera relatório
      const report = {
        status: this.healthStatus,
        insights: this.generateHealthInsights(),
        recommendations: this.generateHealthRecommendations()
      };

      logger.info('✅ Status de Saúde:', report);

      // Envia alertas se necessário
      this.sendHealthAlerts(report);

      this.lastCheck = now;
    } catch (error) {
      logger.error('Erro no monitoramento de saúde:', error);
      throw error;
    }
  }

  /**
   * Verifica saúde da performance
   */
  checkPerformanceHealth(performance) {
    const status = {
      overall: 'healthy',
      metrics: {}
    };

    // Verifica taxa de erro
    if (performance.metrics.errorRate.current > 5) {
      status.overall = 'warning';
      status.metrics.errorRate = 'high';
    }

    // Verifica taxa de cache hit
    if (performance.metrics.cacheHitRate.current < 80) {
      status.overall = 'warning';
      status.metrics.cacheHitRate = 'low';
    }

    // Verifica endpoints
    Object.entries(performance.metrics.endpoints).forEach(([endpoint, stats]) => {
      if (stats.errorRate > 20) {
        status.overall = 'warning';
        status.metrics[endpoint] = 'error';
      }
      if (stats.responseTime > 1000) {
        status.overall = 'warning';
        status.metrics[endpoint] = 'slow';
      }
    });

    return status;
  }

  /**
   * Verifica saúde do monitoramento
   */
  checkMonitoringHealth(monitoring) {
    const status = {
      overall: 'healthy',
      metrics: {}
    };

    // Verifica erros no monitoramento
    if (monitoring.stats.byLevel.error > 10) {
      status.overall = 'warning';
      status.metrics.errors = 'high';
    }

    // Verifica warnings
    if (monitoring.stats.byLevel.warn > 20) {
      status.overall = 'warning';
      status.metrics.warnings = 'high';
    }

    return status;
  }

  /**
   * Verifica saúde dos logs
   */
  checkLogHealth(logStats) {
    const status = {
      overall: 'healthy',
      metrics: {}
    };

    // Verifica número de erros
    if (logStats.byLevel.error > 10) {
      status.overall = 'warning';
      status.metrics.errors = 'high';
    }

    // Verifica número de warnings
    if (logStats.byLevel.warn > 20) {
      status.overall = 'warning';
      status.metrics.warnings = 'high';
    }

    return status;
  }

  /**
   * Gera insights de saúde
   */
  generateHealthInsights() {
    const insights = [];

    if (this.healthStatus.performance.overall === 'warning') {
      insights.push('⚠️ Problemas de performance detectados');
    }

    if (this.healthStatus.monitoring.overall === 'warning') {
      insights.push('⚠️ Problemas no monitoramento detectados');
    }

    if (this.healthStatus.logs.overall === 'warning') {
      insights.push('⚠️ Problemas nos logs detectados');
    }

    if (this.healthStatus.coinglass === 'error') {
      insights.push('⚠️ Problemas na integração da API do Coinglass');
    }

    return insights;
  }

  /**
   * Gera recomendações de saúde
   */
  generateHealthRecommendations() {
    const recommendations = [];

    if (this.healthStatus.performance.metrics.errorRate === 'high') {
      recommendations.push('Aumentar número de tentativas de retry');
    }

    if (this.healthStatus.performance.metrics.cacheHitRate === 'low') {
      recommendations.push('Aumentar TTL do cache');
    }

    if (this.healthStatus.performance.metrics.some(endpoint => endpoint === 'error')) {
      recommendations.push('Ajustar configuração dos endpoints com erro');
    }

    if (this.healthStatus.coinglass === 'error') {
      recommendations.push('Verificar integração da API do Coinglass');
    }

    return recommendations;
  }

  /**
   * Envia alertas de saúde
   */
  async sendHealthAlerts(report) {
    if (report.status.performance.overall === 'warning' || 
        report.status.monitoring.overall === 'warning' || 
        report.status.logs.overall === 'warning' || 
        report.status.coinglass === 'error') {
      
      const message = `
⚠️ Alerta de Saúde - ${report.status.timestamp}

${report.insights.join('\n')}

Recomendações:
${report.recommendations.join('\n')}
      `;
      
      await this.service.sendAlert(message);
    }
  }

  /**
   * Obtém status de saúde
   */
  getHealthStatus() {
    return { ...this.healthStatus };
  }

  /**
   * Define intervalo de verificação
   */
  setInterval(interval) {
    this.healthCheckInterval = interval;
  }

  /**
   * Obtém status do monitor
   */
  getStatus() {
    return {
      lastCheck: this.lastCheck,
      healthCheckInterval: this.healthCheckInterval,
      overallStatus: this.healthStatus.overall,
      isActive: true
    };
  }
}
