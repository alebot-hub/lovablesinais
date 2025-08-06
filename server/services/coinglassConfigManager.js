/**
 * Gerenciador de configurações para a API do Coinglass
 */
import dotenv from 'dotenv';
import { Logger } from './logger';

dotenv.config();

const logger = new Logger('CoinglassConfig');

export default class CoinglassConfigManager {
  constructor() {
    this.config = {
      // Configurações básicas da API
      api: {
        baseUrl: process.env.COINGLASS_API_URL || 'https://open-api.coinglass.com/api/pro/v1',
        apiKey: process.env.COINGLASS_API_KEY,
        timeout: parseInt(process.env.COINGLASS_TIMEOUT) || 30000, // 30 segundos
        retryAttempts: parseInt(process.env.COINGLASS_RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.COINGLASS_RETRY_DELAY) || 1000 // 1 segundo
      },

      // Configurações de cache
      cache: {
        enabled: process.env.COINGLASS_CACHE_ENABLED === 'true',
        ttl: parseInt(process.env.COINGLASS_CACHE_TTL) || 300000, // 5 minutos
        maxSize: parseInt(process.env.COINGLASS_CACHE_MAX_SIZE) || 1000,
        cleanupInterval: parseInt(process.env.COINGLASS_CACHE_CLEANUP_INTERVAL) || 3600000 // 1 hora
      },

      // Configurações de monitoramento
      monitoring: {
        healthCheckInterval: parseInt(process.env.COINGLASS_HEALTH_CHECK_INTERVAL) || 60000, // 1 minuto
        performanceMetricsInterval: parseInt(process.env.COINGLASS_PERFORMANCE_METRICS_INTERVAL) || 300000, // 5 minutos
        maxResponseTime: parseInt(process.env.COINGLASS_MAX_RESPONSE_TIME) || 2000, // 2 segundos
        errorThreshold: parseInt(process.env.COINGLASS_ERROR_THRESHOLD) || 5
      },

      // Configurações de endpoints
      endpoints: {
        futures: {
          enabled: process.env.COINGLASS_FUTURES_ENABLED === 'true',
          refreshInterval: parseInt(process.env.COINGLASS_FUTURES_REFRESH_INTERVAL) || 60000, // 1 minuto
          symbols: process.env.COINGLASS_FUTURES_SYMBOLS ? process.env.COINGLASS_FUTURES_SYMBOLS.split(',') : ['BTC', 'ETH']
        },
        options: {
          enabled: process.env.COINGLASS_OPTIONS_ENABLED === 'true',
          refreshInterval: parseInt(process.env.COINGLASS_OPTIONS_REFRESH_INTERVAL) || 300000, // 5 minutos
          symbols: process.env.COINGLASS_OPTIONS_SYMBOLS ? process.env.COINGLASS_OPTIONS_SYMBOLS.split(',') : ['BTC']
        },
        funding: {
          enabled: process.env.COINGLASS_FUNDING_ENABLED === 'true',
          refreshInterval: parseInt(process.env.COINGLASS_FUNDING_REFRESH_INTERVAL) || 600000, // 10 minutos
          symbols: process.env.COINGLASS_FUNDING_SYMBOLS ? process.env.COINGLASS_FUNDING_SYMBOLS.split(',') : ['BTC', 'ETH']
        }
      },

      // Configurações de validação
      validation: {
        maxRetries: parseInt(process.env.COINGLASS_VALIDATION_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.COINGLASS_VALIDATION_RETRY_DELAY) || 1000,
        validationInterval: parseInt(process.env.COINGLASS_VALIDATION_INTERVAL) || 60000, // 1 minuto
        errorThreshold: parseInt(process.env.COINGLASS_VALIDATION_ERROR_THRESHOLD) || 3
      }
    };

    // Validação das configurações
    this.validateConfig();
  }

  /**
   * Valida as configurações mínimas necessárias
   */
  validateConfig() {
    if (!this.config.api.apiKey) {
      throw new Error('API key do Coinglass não configurada. Por favor, defina COINGLASS_API_KEY no arquivo .env');
    }

    if (!this.config.api.baseUrl) {
      throw new Error('URL base da API do Coinglass não configurada');
    }

    // Validação dos intervalos
    if (this.config.monitoring.healthCheckInterval < 10000) {
      logger.warn('Intervalo de health check muito curto. Recomenda-se no mínimo 10 segundos.');
    }

    if (this.config.cache.ttl < 10000) {
      logger.warn('TTL do cache muito curto. Recomenda-se no mínimo 10 segundos.');
    }
  }

  /**
   * Obtém a configuração completa
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Obtém uma configuração específica
   */
  getConfigSection(section) {
    return this.config[section] || null;
  }

  /**
   * Verifica se um endpoint está habilitado
   */
  isEndpointEnabled(endpoint) {
    return this.config.endpoints[endpoint]?.enabled || false;
  }

  /**
   * Obtém os símbolos configurados para um endpoint
   */
  getEndpointSymbols(endpoint) {
    return this.config.endpoints[endpoint]?.symbols || [];
  }

  /**
   * Obtém o intervalo de refresh para um endpoint
   */
  getEndpointRefreshInterval(endpoint) {
    return this.config.endpoints[endpoint]?.refreshInterval || 60000;
  }
}