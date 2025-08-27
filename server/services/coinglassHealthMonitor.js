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

      // Verifica status da API com timeout
      const apiStatus = await Promise.race([
        this.monitor.checkApiStatus(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout na verificação de API')), 5000)
        )
      ]).catch(error => {
        console.warn('⚠️ Verificação de API falhou:', error.message);
        return { status: 'warning', message: 'API check timeout' };
      });

      // Analisa performance com timeout
      const performance = await Promise.race([
        this.performanceAnalyzer.analyzePerformance(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout na análise de performance')), 5000)
        )
      ]).catch(error => {
        console.warn('⚠️ Análise de performance falhou:', error.message);
        return { 
          metrics: { 
            responseTime: 0, 
            errorRate: 0, 
            cacheHitRate: 100 
          } 
        };
      });

      // Atualiza status
      this.healthStatus = {
        timestamp: now,
        apiStatus,
        performance,
        lastCheck: now,
        isHealthy: apiStatus.status !== 'error'
      };

      // Registra status
      const statusSummary = {
        api: apiStatus.status || 'unknown',
        performance: performance.metrics ? 'ok' : 'degraded'
      };
      logger.info(`✅ Status de saúde atualizado:`, statusSummary);

      return this.healthStatus;
    } catch (error) {
      logger.error('❌ Erro ao verificar saúde:', error.message);
      
      // Status de fallback
      this.healthStatus = {
        timestamp: Date.now(),
        apiStatus: { status: 'error', message: error.message },
        performance: { metrics: { responseTime: -1, errorRate: 100, cacheHitRate: 0 } },
        lastCheck: Date.now(),
        isHealthy: false,
        error: error.message
      };
      
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
