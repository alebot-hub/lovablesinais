/**
 * Serviço de limpeza de cache para a API Coinglass
 */
import { Logger } from '../services/logger.js';
import { CoinglassCache } from '../services/coinglassCache.js';

const logger = new Logger('CoinglassCacheCleaner');

export default class CoinglassCacheCleaner {
  constructor(coinglassCache) {
    this.cache = coinglassCache;
    this.cleanupInterval = 30 * 60 * 1000; // 30 minutos
    this.lastCleanup = Date.now();
    this.cleanupStats = {
      total: 0,
      byType: {
        expired: 0,
        leastUsed: 0,
        oversized: 0
      }
    };
  }

  /**
   * Inicia limpeza automática
   */
  start() {
    this.cleanupCache();
    setInterval(() => this.cleanupCache(), this.cleanupInterval);
  }

  /**
   * Limpa cache
   */
  cleanupCache() {
    try {
      const now = Date.now();
      if (now - this.lastCleanup < this.cleanupInterval) return;

      // Limpa itens expirados
      this.cleanupExpiredItems();

      // Limpa itens menos usados
      this.cleanupLeastUsedItems();

      // Limpa itens que excedem limite de tamanho
      this.cleanupOversizedItems();

      logger.info('🗑️ Cache limpo com sucesso', this.cleanupStats);
      this.lastCleanup = now;
    } catch (error) {
      logger.error('Erro ao limpar cache:', error);
      throw error;
    }
  }

  /**
   * Limpa itens expirados
   */
  cleanupExpiredItems() {
    const expiredItems = [];
    this.cache.cache.forEach((item, key) => {
      if (Date.now() - item.timestamp > item.ttl) {
        expiredItems.push(key);
      }
    });

    expiredItems.forEach(key => {
      this.cache.cache.delete(key);
      this.cleanupStats.byType.expired++;
    });

    this.cleanupStats.total += expiredItems.length;
  }

  /**
   * Limpa itens menos usados
   */
  cleanupLeastUsedItems() {
    if (this.cache.cacheSize <= this.cache.maxSize * 0.8) return;

    const items = Array.from(this.cache.cache.entries());
    items.sort((a, b) => {
      const aLastAccess = a[1].timestamp;
      const bLastAccess = b[1].timestamp;
      return bLastAccess - aLastAccess;
    });

    const itemsToRemove = items.slice(Math.floor(items.length * 0.2));
    itemsToRemove.forEach(([key]) => {
      this.cache.cache.delete(key);
      this.cleanupStats.byType.leastUsed++;
    });

    this.cleanupStats.total += itemsToRemove.length;
  }

  /**
   * Limpa itens que excedem limite de tamanho
   */
  cleanupOversizedItems() {
    const oversizedItems = [];
    this.cache.cache.forEach((item, key) => {
      if (this.getItemSize(item.value) > 1024 * 1024) { // 1MB
        oversizedItems.push(key);
      }
    });

    oversizedItems.forEach(key => {
      this.cache.cache.delete(key);
      this.cleanupStats.byType.oversized++;
    });

    this.cleanupStats.total += oversizedItems.length;
  }

  /**
   * Obtém tamanho do item
   */
  getItemSize(item) {
    return JSON.stringify(item).length;
  }

  /**
   * Obtém estatísticas de limpeza
   */
  getCleanupStats() {
    return {
      total: this.cleanupStats.total,
      byType: this.cleanupStats.byType,
      lastCleanup: this.lastCleanup,
      cleanupInterval: this.cleanupInterval
    };
  }

  /**
   * Define intervalo de limpeza
   */
  setInterval(interval) {
    this.cleanupInterval = interval;
  }

  /**
   * Gera relatório de limpeza
   */
  generateCleanupReport() {
    const report = {
      timestamp: new Date().toLocaleString('pt-BR'),
      stats: this.getCleanupStats(),
      insights: this.generateCleanupInsights()
    };

    logger.info('📊 Relatório de Limpeza:', report);
    return report;
  }

  /**
   * Gera insights de limpeza
   */
  generateCleanupInsights() {
    const stats = this.getCleanupStats();
    const insights = [];

    if (stats.byType.expired > stats.total * 0.5) {
      insights.push('⚠️ Muitos itens expirados - Ajustar TTL?');
    }

    if (stats.byType.leastUsed > stats.total * 0.3) {
      insights.push('⚠️ Muitos itens pouco usados - Ajustar maxSize?');
    }

    if (stats.byType.oversized > 0) {
      insights.push('⚠️ Itens grandes encontrados - Ajustar limite de tamanho?');
    }

    return insights;
  }

  /**
   * Obtém status do cleaner
   */
  getStatus() {
    return {
      lastCleanup: this.lastCleanup,
      cleanupInterval: this.cleanupInterval,
      totalCleaned: this.cleanupStats.total,
      isActive: true
    };
  }
}