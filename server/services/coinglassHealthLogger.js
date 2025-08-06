/**
 * Logger específico para monitoramento da API do Coinglass
 */

export default class CoinglassHealthLogger {
  constructor() {
    this.logs = [];
    this.lastLog = null;
    this.logRetention = 24 * 60 * 60 * 1000; // 24 horas
    this.cleanupInterval = 60 * 60 * 1000; // 1 hora
  }

  /**
   * Limpa logs antigos
   */
  cleanupLogs() {
    const now = Date.now();
    this.logs = this.logs.filter(log => now - log.timestamp < this.logRetention);
  }

  /**
   * Registra um evento de saúde
   */
  logHealthEvent({ status, message, error = null }) {
    const log = {
      timestamp: Date.now(),
      status,
      message,
      error
    };

    this.logs.push(log);
    this.lastLog = log;

    // Limpa logs antigos
    this.cleanupLogs();

    // Formata mensagem para console
    const color = status === 'healthy' ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    console.log(`${color}[CoinglassHealth][${status.toUpperCase()}] ${message}${reset}`);

    // Se houver erro, registra detalhes
    if (error) {
      console.error(`[CoinglassHealth][ERROR]`, error);
    }
  }

  /**
   * Obtém status atual
   */
  getCurrentStatus() {
    return this.lastLog?.status || 'unknown';
  }

  /**
   * Obtém logs recentes
   */
  getRecentLogs(limit = 10) {
    return this.logs.slice(-limit);
  }

  /**
   * Obtém estatísticas de saúde
   */
  getHealthStats() {
    const now = Date.now();
    const lastHourLogs = this.logs.filter(log => now - log.timestamp < 60 * 60 * 1000);
    
    return {
      lastCheck: this.lastLog?.timestamp,
      lastStatus: this.getCurrentStatus(),
      healthyChecksLastHour: lastHourLogs.filter(log => log.status === 'healthy').length,
      errorChecksLastHour: lastHourLogs.filter(log => log.status === 'error').length
    };
  }
}
