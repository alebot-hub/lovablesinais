/**
 * Serviço de priorização de endpoints para a API Coinglass
 */
import { Logger } from './logger';

const logger = new Logger('CoinglassPriority');

export default class CoinglassPriority {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.priorityQueue = new Map();
    this.lastUpdate = Date.now();
    this.updateInterval = 60 * 1000; // 1 minuto

    // Prioridades padrão dos endpoints
    this.setPriorities({
      fundingRate: 1,
      longShortRatio: 2,
      openInterest: 3,
      volume: 4,
      volatility: 5
    });
  }

  /**
   * Define prioridades dos endpoints
   */
  setPriorities(priorities) {
    this.priorityQueue.clear();
    Object.entries(priorities).forEach(([endpoint, priority]) => {
      if (!this.priorityQueue.has(priority)) {
        this.priorityQueue.set(priority, []);
      }
      this.priorityQueue.get(priority).push(endpoint);
    });
    this.lastUpdate = Date.now();
    logger.info('Prioridades atualizadas:', priorities);
  }

  /**
   * Obtém próxima chamada prioritária
   */
  getNextPriorityCall() {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) {
      return null;
    }

    // Ordena prioridades
    const priorities = Array.from(this.priorityQueue.entries())
      .sort((a, b) => a[0] - b[0]);

    // Encontra próxima chamada disponível
    for (const [priority, endpoints] of priorities) {
      for (const endpoint of endpoints) {
        if (this.canCallEndpoint(endpoint)) {
          return endpoint;
        }
      }
    }

    return null;
  }

  /**
   * Verifica se pode chamar endpoint
   */
  canCallEndpoint(endpoint) {
    const metrics = this.service.getMetrics();
    const endpointMetrics = metrics.endpoints[endpoint];

    // Verifica taxa de chamadas
    if (metrics.calls / (1000 * 60) >= this.service.getRateLimit()) {
      return false;
    }

    // Verifica intervalo mínimo
    if (endpointMetrics.lastCall && 
        now - endpointMetrics.lastCall < endpointMetrics.interval) {
      return false;
    }

    // Verifica erros recentes
    if (endpointMetrics.errors > 5) {
      return false;
    }

    return true;
  }

  /**
   * Registra chamada de endpoint
   */
  registerEndpointCall(endpoint) {
    this.service.registerEndpointCall(endpoint);
    this.lastUpdate = Date.now();
  }

  /**
   * Obtém prioridades atuais
   */
  getPriorities() {
    const priorities = {};
    this.priorityQueue.forEach((endpoints, priority) => {
      endpoints.forEach(endpoint => {
        priorities[endpoint] = priority;
      });
    });
    return priorities;
  }

  /**
   * Atualiza prioridade de endpoint
   */
  updateEndpointPriority(endpoint, newPriority) {
    const currentPriorities = this.getPriorities();
    if (!currentPriorities[endpoint]) {
      throw new Error(`❌ Endpoint ${endpoint} não existe`);
    }

    // Remove da prioridade atual
    const currentPriority = currentPriorities[endpoint];
    const endpoints = this.priorityQueue.get(currentPriority);
    const index = endpoints.indexOf(endpoint);
    if (index > -1) {
      endpoints.splice(index, 1);
    }

    // Adiciona na nova prioridade
    if (!this.priorityQueue.has(newPriority)) {
      this.priorityQueue.set(newPriority, []);
    }
    this.priorityQueue.get(newPriority).push(endpoint);

    this.lastUpdate = Date.now();
    logger.info(`Prioridade de ${endpoint} atualizada para ${newPriority}`);
  }

  /**
   * Obtém sugestões de priorização
   */
  getPrioritySuggestions() {
    const suggestions = [];
    const metrics = this.service.getMetrics();

    // Sugerir aumentar prioridade para endpoints com alta taxa de sucesso
    Object.entries(metrics.endpoints).forEach(([endpoint, stats]) => {
      if (stats.successRate > 95) {
        suggestions.push({
          endpoint,
          suggestion: 'Aumentar prioridade devido à alta taxa de sucesso'
        });
      }
    });

    // Sugerir reduzir prioridade para endpoints com alta taxa de erro
    Object.entries(metrics.endpoints).forEach(([endpoint, stats]) => {
      if (stats.errorRate > 5) {
        suggestions.push({
          endpoint,
          suggestion: 'Reduzir prioridade devido à alta taxa de erro'
        });
      }
    });

    return suggestions;
  }

  /**
   * Gera relatório de priorização
   */
  generatePriorityReport() {
    const report = {
      timestamp: new Date().toLocaleString('pt-BR'),
      priorities: this.getPriorities(),
      suggestions: this.getPrioritySuggestions(),
      metrics: this.service.getMetrics()
    };

    logger.info('🎯 Relatório de Priorização:', report);
    return report;
  }

  /**
   * Define novo intervalo de atualização
   */
  setInterval(interval) {
    this.updateInterval = interval;
  }

  /**
   * Obtém status do serviço
   */
  getStatus() {
    return {
      lastUpdate: this.lastUpdate,
      updateInterval: this.updateInterval,
      priorities: this.getPriorities()
    };
  }
}
