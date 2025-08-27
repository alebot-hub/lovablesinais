/**
 * Serviço de validação para a API Coinglass
 */
import { Logger } from '../services/logger.js';

const logger = new Logger('CoinglassValidator');

export default class CoinglassValidator {
  constructor(coinglassService) {
    this.service = coinglassService;
    this.validSymbols = new Set();
    this.lastValidation = Date.now();
    this.validationInterval = 60 * 1000; // 1 minuto
  }

  /**
   * Valida símbolo
   */
  async validateSymbol(symbol) {
    if (!symbol) {
      throw new Error('❌ Símbolo é obrigatório');
    }

    if (this.isValidSymbol(symbol)) {
      return true;
    }

    await this.updateValidSymbols();
    return this.isValidSymbol(symbol);
  }

  /**
   * Verifica se símbolo é válido
   */
  isValidSymbol(symbol) {
    return this.validSymbols.has(symbol.toUpperCase());
  }

  /**
   * Atualiza lista de símbolos válidos
   */
  async updateValidSymbols() {
    try {
      const now = Date.now();
      if (now - this.lastValidation < this.validationInterval) {
        return;
      }

      // Aqui seria a chamada real para obter os símbolos suportados
      const supportedCoins = await this.service.getSupportedCoins();
      
      this.validSymbols.clear();
      supportedCoins.forEach(coin => {
        this.validSymbols.add(coin.symbol.toUpperCase());
      });

      this.lastValidation = now;
      logger.info('Lista de símbolos válidos atualizada');
    } catch (error) {
      logger.error('Erro ao atualizar lista de símbolos:', error);
      throw error;
    }
  }

  /**
   * Valida parâmetros da API
   */
  validateApiParams(params) {
    if (!params) {
      throw new Error('❌ Parâmetros são obrigatórios');
    }

    if (!params.symbol) {
      throw new Error('❌ Símbolo é obrigatório');
    }

    if (!this.isValidSymbol(params.symbol)) {
      throw new Error(`❌ Símbolo ${params.symbol} não suportado`);
    }

    if (params.interval && !this.isValidInterval(params.interval)) {
      throw new Error(`❌ Intervalo ${params.interval} não suportado`);
    }
  }

  /**
   * Valida intervalo
   */
  isValidInterval(interval) {
    const validIntervals = ['1h', '4h', '1d'];
    return validIntervals.includes(interval);
  }

  /**
   * Valida taxa de chamadas
   */
  validateRateLimit() {
    const metrics = this.service.getMetrics();
    const callsPerMinute = metrics.calls / (1000 * 60);
    
    if (callsPerMinute > this.service.getRateLimit()) {
      throw new Error(`❌ Limite de chamadas excedido (${callsPerMinute}/${this.service.getRateLimit()})`);
    }
  }

  /**
   * Valida cache
   */
  validateCache() {
    const cacheSize = this.service.getCacheSize();
    if (cacheSize > 1000) { // Limite máximo de cache
      logger.warn('Cache está próximo do limite máximo');
    }
  }

  /**
   * Valida uso da API
   */
  async validateApiUsage(endpoint, params) {
    this.validateRateLimit();
    this.validateCache();
    this.validateApiParams(params);
    
    const metrics = this.service.getMetrics();
    const endpointMetrics = metrics.endpoints[endpoint];
    
    if (endpointMetrics.errors > 5) { // Limite de erros
      throw new Error(`❌ Muitos erros recentes no endpoint ${endpoint}`);
    }
  }

  /**
   * Obtém métricas de validação
   */
  getValidationMetrics() {
    return {
      lastValidation: this.lastValidation,
      validSymbolsCount: this.validSymbols.size,
      validationInterval: this.validationInterval
    };
  }
}
