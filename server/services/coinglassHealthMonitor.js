/**
 * Serviço de monitoramento de saúde para a API Coinglass
 */
import { Logger } from '../services/logger.js';
import CoinglassPerformanceAnalyzer from '../services/coinglassPerformanceAnalyzer.js';
import CoinglassMonitor from '../services/coinglassMonitor.js';

const logger = new Logger('CoinglassHealthMonitor');

export default class CoinglassHealthMonitor {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.performanceAnalyzer = new CoinglassPerformanceAnalyzer(coinglassService);
    this.monitor = new CoinglassMonitor(coinglassService);
    this.healthCheckInterval = 60 * 1000; // 1 minuto
    this.lastCheck = Date.now();
    this.healthStatus = {};
    this.initialize();
  }

  initialize() {
    // Inicia monitoramento
    this.startHealthCheck();
  }

  startHealthCheck() {
    this.checkHealth();
    setInterval(() => this.checkHealth(), this.healthCheckInterval);
  }

  async checkHealth() {
    try {
      const now = Date.now();
      if (now - this.lastCheck < this.healthCheckInterval) {
        return this.healthStatus;
      }

      // Verifica status da API
      const apiStatus = await this.monitor.checkApiStatus();

      // Analisa performance
      const performance = await this.performanceAnalyzer.analyzePerformance();

      // Atualiza status
      this.healthStatus = {
        timestamp: now,
        apiStatus,
        performance,
        lastCheck: now
      };

      // Registra status
      logger.info(`Status de saúde atualizado: ${JSON.stringify(apiStatus)}`);

      return this.healthStatus;
    } catch (error) {
      logger.error('Erro ao verificar saúde:', error);
      this.healthStatus.error = error.message;
      return this.healthStatus;
    }
  }

  getHealthStatus() {
    return this.healthStatus;
  }

  getLastCheckTime() {
    return this.lastCheck;
  }
}
