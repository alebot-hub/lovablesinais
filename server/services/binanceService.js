/**
 * Serviço para integração com a API pública da Binance Futures
 */

import ccxt from 'ccxt';

class BinanceService {
  constructor() {
    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.requestsPerMinute = 0;
    this.maxRequestsPerMinute = 1200; // 50% do limite da Binance (2400)
    this.requestWindow = 60 * 1000; // 1 minuto
    this.lastRequestReset = Date.now();
    
    // Cache de dados OHLCV
    this.ohlcvCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
    
    try {
      // Configuração para usar apenas endpoints públicos da Binance Futures
      this.exchange = new ccxt.binance({
        options: {
          defaultType: 'future' // Usar Binance Futures
        }
      });
      console.log('✅ BinanceService: Exchange inicializado');
    } catch (error) {
      console.error('❌ BinanceService: Erro na inicialização:', error.message);
      this.exchange = null;
    }
    
    // WebSocket connections para diferentes timeframes
    this.wsConnections = new Map();
    this.priceData = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 3;
  }

  /**
   * Obtém dados OHLCV históricos usando endpoint público
   */
  async getOHLCVData(symbol, timeframe, limit = 100) {
    // Verifica cache primeiro
    const cacheKey = `${symbol}_${timeframe}_${limit}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      console.log(`📦 Cache hit para ${symbol} ${timeframe}`);
      return cached;
    }
    
    // Adiciona à fila de rate limiting
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        symbol,
        timeframe,
        limit,
        cacheKey,
        resolve,
        reject
      });
      
      this.processRequestQueue();
    });
  }

  /**
   * Processa fila de requests com rate limiting
   */
  async processRequestQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      // Reset contador se passou 1 minuto
      const now = Date.now();
      if (now - this.lastRequestReset >= this.requestWindow) {
        this.requestsPerMinute = 0;
        this.lastRequestReset = now;
      }
      
      // Verifica limite
      if (this.requestsPerMinute >= this.maxRequestsPerMinute) {
        const waitTime = this.requestWindow - (now - this.lastRequestReset);
        console.log(`⏳ Rate limit atingido. Aguardando ${Math.ceil(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
        this.requestsPerMinute = 0;
        this.lastRequestReset = Date.now();
      }
      
      const request = this.requestQueue.shift();
      
      try {
        const data = await this.executeOHLCVRequest(request.symbol, request.timeframe, request.limit);
        
        // Armazena no cache
        this.setCachedData(request.cacheKey, data);
        
        request.resolve(data);
        this.requestsPerMinute++;
        
        // Pausa entre requests
        await this.sleep(100);
        
      } catch (error) {
        console.error(`❌ Erro na request ${request.symbol}:`, error.message);
        
        // Se for rate limit, recoloca na fila
        if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
          console.log(`🔄 Recolocando ${request.symbol} na fila devido ao rate limit`);
          this.requestQueue.unshift(request);
          await this.sleep(5000); // Aguarda 5 segundos
          continue;
        }
        
        request.reject(error);
      }
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Executa request OHLCV real
   */
  async executeOHLCVRequest(symbol, timeframe, limit) {
    try {
      // Usa endpoint público para dados históricos
      const binanceSymbol = symbol.replace('/', '');
      const candles = await this.exchange.fapiPublicGetKlines({
        symbol: binanceSymbol,
        interval: this.convertTimeframe(timeframe),
        limit: limit
      });
      
      // Converte formato da resposta para o formato esperado
      const formattedCandles = candles.map(candle => [
        parseInt(candle[0]), // timestamp
        parseFloat(candle[1]), // open
        parseFloat(candle[2]), // high
        parseFloat(candle[3]), // low
        parseFloat(candle[4]), // close
        parseFloat(candle[5])  // volume
      ]);
      
      // Validação crítica dos dados
      const lastPrice = formattedCandles[formattedCandles.length - 1][4]; // close
      console.log(`📊 ${symbol} ${timeframe}: Último preço = $${lastPrice.toFixed(6)}`);
      
      // Validação específica por tipo de ativo
      let isValidPrice = true;
      if (symbol.includes('BTC')) {
        // Bitcoin: $1k - $1M
        if (lastPrice < 1000 || lastPrice > 1000000) {
          isValidPrice = false;
        }
      } else if (symbol.includes('ETH')) {
        // Ethereum: $1 - $50k
        if (lastPrice < 1 || lastPrice > 50000) {
          isValidPrice = false;
        }
      } else {
        // Outros ativos: validação mais ampla
        if (lastPrice < 0.000001 || lastPrice > 100000) {
          isValidPrice = false;
        }
      }
      
      if (!isValidPrice) {
        console.error(`❌ ERRO: Preço fora da faixa válida para ${symbol}: $${lastPrice}`);
        console.error('🔧 Possível problema na API da Binance');
      }
      
      return {
        timestamp: formattedCandles.map(c => c[0]),
        open: formattedCandles.map(c => c[1]),
        high: formattedCandles.map(c => c[2]),
        low: formattedCandles.map(c => c[3]),
        close: formattedCandles.map(c => c[4]),
        volume: formattedCandles.map(c => c[5])
      };
    } catch (error) {
      console.error(`Erro ao obter dados OHLCV para ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Obtém dados do cache
   */
  getCachedData(key) {
    const cached = this.ohlcvCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  /**
   * Armazena dados no cache
   */
  setCachedData(key, data) {
    this.ohlcvCache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Limpa cache antigo
    if (this.ohlcvCache.size > 500) {
      const oldestKey = this.ohlcvCache.keys().next().value;
      this.ohlcvCache.delete(oldestKey);
    }
  }

  /**
   * Função sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Converte timeframe para formato da Binance
   */
  convertTimeframe(timeframe) {
    const mapping = {
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d'
    };
    return mapping[timeframe] || timeframe;
  }

  /**
   * Obtém ticker atual usando endpoint público
   */
  async getCurrentTicker(symbol) {
    try {
      const binanceSymbol = symbol.replace('/', '');
      
      // Usa endpoint público da Binance
      const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${binanceSymbol}`);
      const ticker = await response.json();
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${ticker.msg || 'Unknown error'}`);
      }
      
      return {
        symbol: ticker.symbol,
        last: parseFloat(ticker.lastPrice),
        percentage: parseFloat(ticker.priceChangePercent),
        quoteVolume: parseFloat(ticker.quoteVolume),
        baseVolume: parseFloat(ticker.volume),
        high: parseFloat(ticker.highPrice),
        low: parseFloat(ticker.lowPrice),
        open: parseFloat(ticker.openPrice),
        close: parseFloat(ticker.lastPrice),
        timestamp: parseInt(ticker.closeTime)
      };
    } catch (error) {
      console.error(`Erro ao obter ticker para ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Conecta ao WebSocket público da Binance Futures para monitoramento em tempo real
   */
  async connectWebSocket(symbol, timeframe, callback) {
    try {
      const { default: WebSocket } = await import('ws');
      const binanceSymbol = symbol.replace('/', '').toLowerCase();
      const wsUrl = `wss://fstream.binance.com/ws/${binanceSymbol}@kline_${this.convertTimeframe(timeframe)}`;
      
      // Fecha conexão existente se houver
      const connectionKey = `${symbol}_${timeframe}`;
      if (this.wsConnections.has(connectionKey)) {
        const existingWs = this.wsConnections.get(connectionKey);
        existingWs.close();
        this.wsConnections.delete(connectionKey);
      }
      
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        console.log(`WebSocket conectado para ${symbol} ${timeframe}`);
        this.reconnectAttempts.set(connectionKey, 0);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.k) {
            const kline = message.k;
            const candleData = {
              symbol: kline.s,
              timestamp: kline.t,
              open: parseFloat(kline.o),
              high: parseFloat(kline.h),
              low: parseFloat(kline.l),
              close: parseFloat(kline.c),
              volume: parseFloat(kline.v),
              isClosed: kline.x // true quando o candle está fechado
            };
            
            callback(candleData);
          }
        } catch (error) {
          console.error('Erro ao processar mensagem WebSocket:', error.message);
        }
      });
      
      ws.on('error', (error) => {
        console.error(`Erro WebSocket ${symbol}:`, error.message);
        
        // Reconectar apenas se não excedeu tentativas
        const attempts = this.reconnectAttempts.get(connectionKey) || 0;
        if (attempts < this.maxReconnectAttempts) {
          this.reconnectAttempts.set(connectionKey, attempts + 1);
          console.log(`🔄 Tentativa de reconexão ${attempts + 1}/${this.maxReconnectAttempts} para ${symbol}`);
          setTimeout(() => this.connectWebSocket(symbol, timeframe, callback), 5000 * (attempts + 1));
        } else {
          console.log(`❌ Máximo de tentativas de reconexão atingido para ${symbol}`);
          this.wsConnections.delete(connectionKey);
        }
      });
      
      ws.on('close', () => {
        console.log(`WebSocket fechado para ${symbol}`);
        this.wsConnections.delete(connectionKey);
        
        // Reconectar apenas se não foi fechado intencionalmente
        const attempts = this.reconnectAttempts.get(connectionKey) || 0;
        if (attempts < this.maxReconnectAttempts) {
          this.reconnectAttempts.set(connectionKey, attempts + 1);
          setTimeout(() => this.connectWebSocket(symbol, timeframe, callback), 5000);
        }
      });
      
      // Armazena conexão para gerenciamento
      this.wsConnections.set(connectionKey, ws);
      
      return ws;
    } catch (error) {
      console.error(`Erro ao conectar WebSocket para ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Monitora preço em tempo real (compatibilidade com código existente)
   */
  async watchTicker(symbol, callback) {
    return this.connectWebSocket(symbol, '1m', (candleData) => {
      // Converte para formato de ticker compatível
      const ticker = {
        symbol: candleData.symbol,
        last: candleData.close,
        percentage: 0, // Será calculado se necessário
        timestamp: candleData.timestamp
      };
      callback(ticker);
    });
  }

  /**
   * Obtém dados de volume agregado do mercado usando endpoints públicos
   */
  async getMarketVolume(symbols) {
    try {
      const tickers = await this.exchange.fapiPublicGetTicker24hr();
      let totalVolume = 0;
      
      for (const ticker of tickers) {
        const formattedSymbol = ticker.symbol.replace('USDT', '/USDT');
        if (symbols.includes(formattedSymbol)) {
          totalVolume += parseFloat(ticker.quoteVolume) || 0;
        }
      }
      
      return totalVolume;
    } catch (error) {
      console.error('Erro ao obter volume do mercado:', error.message);
      throw error;
    }
  }

  /**
   * Verifica se o mercado está aberto (Futures opera 24/7)
   */
  async isMarketOpen() {
    try {
      // Binance Futures opera 24/7, então sempre retorna true
      // Mas podemos verificar se a API está respondendo
      await this.exchange.fapiPublicGetPing();
      return true;
    } catch (error) {
      console.error('Erro ao verificar status do mercado:', error.message);
      return false;
    }
  }

  /**
   * Para WebSocket para um símbolo específico
   */
  stopWebSocketForSymbol(symbol, timeframe = '1m') {
    const connectionKey = `${symbol}_${timeframe}`;
    if (this.wsConnections.has(connectionKey)) {
      const ws = this.wsConnections.get(connectionKey);
      try {
        ws.close();
      } catch (error) {
        console.error(`Erro ao fechar WebSocket ${connectionKey}:`, error.message);
      }
      this.wsConnections.delete(connectionKey);
      this.reconnectAttempts.delete(connectionKey);
      console.log(`🔌 WebSocket parado para ${symbol}`);
      return true;
    }
    return false;
  }

  /**
   * Fecha todas as conexões WebSocket
   */
  closeAllWebSockets() {
    for (const [key, ws] of this.wsConnections) {
      try {
        ws.close();
        console.log(`WebSocket fechado: ${key}`);
      } catch (error) {
        console.error(`Erro ao fechar WebSocket ${key}:`, error.message);
      }
    }
    this.wsConnections.clear();
    this.reconnectAttempts.clear();
  }

  /**
   * Obtém informações do servidor (para verificar conectividade)
   */
  async getServerTime() {
    try {
      const response = await this.exchange.fapiPublicGetTime();
      return response.serverTime;
    } catch (error) {
      console.error('Erro ao obter tempo do servidor:', error.message);
      throw error;
    }
  }
}

export default BinanceService;