/**
 * Serviço de logging para a API Coinglass
 */
import { Logger } from './logger';

const logger = new Logger('CoinglassLogger');

export default class CoinglassLogger {
  constructor() {
    this.logs = [];
    this.logRetention = 24 * 60 * 60 * 1000; // 24 horas
    this.lastCleanup = Date.now();
    this.cleanupInterval = 60 * 60 * 1000; // 1 hora
  }

  /**
   * Limpa logs antigos
   */
  cleanupLogs() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;

    this.logs = this.logs.filter(log => {
      return now - log.timestamp < this.logRetention;
    });

    this.lastCleanup = now;
  }

  /**
   * Obtém logs filtrados
   */
  getLogs({ level = 'all', type = 'all', symbol = 'all', limit = 100 } = {}) {
    this.cleanupLogs();
    
    return this.logs
      .filter(log => {
        if (level !== 'all' && log.level !== level) return false;
        if (type !== 'all' && log.type !== type) return false;
        if (symbol !== 'all' && log.symbol !== symbol) return false;
        return true;
      })
      .slice(0, limit);
  }

  /**
   * Obtém estatísticas dos logs
   */
  getLogStats() {
    this.cleanupLogs();
    
    return {
      total: this.logs.length,
      byLevel: this.logs.reduce((acc, log) => {
        acc[log.level] = (acc[log.level] || 0) + 1;
        return acc;
      }, {}),
      byType: this.logs.reduce((acc, log) => {
        acc[log.type] = (acc[log.type] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /**
   * Gera relatório de logs
   */
  generateLogReport() {
    const report = {
      timestamp: new Date().toLocaleString('pt-BR'),
      stats: this.getLogStats(),
      recentLogs: this.getLogs({ limit: 10 }),
      insights: this.generateLogInsights()
    };

    logger.info('📄 Relatório de Logs:', report);
    return report;
  }

  /**
   * Gera insights dos logs
   */
  generateLogInsights() {
    const stats = this.getLogStats();
    const insights = [];

    // Insights baseados em erros
    if (stats.byLevel.error && stats.byLevel.error > 10) {
      insights.push('⚠️ Número elevado de erros detectados');
    }

    // Insights baseados em warnings
    if (stats.byLevel.warn && stats.byLevel.warn > 20) {
      insights.push('⚠️ Número elevado de avisos detectados');
    }

    return insights;
  }

  /**
   * Define intervalo de limpeza
   */
  setInterval(interval) {
    this.cleanupInterval = interval;
  }

  /**
   * Define retenção de logs
   */
  setRetention(retention) {
    this.logRetention = retention;
  }

  /**
   * Obtém status do logger
   */
  getStatus() {
    return {
      totalLogs: this.logs.length,
      lastCleanup: this.lastCleanup,
      cleanupInterval: this.cleanupInterval,
      logRetention: this.logRetention
    };
  }
}
