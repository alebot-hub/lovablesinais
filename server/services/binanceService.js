// server/services/binanceService.js
// Serviço de integração com a Binance (REST + WS opcional)
// ✅ Exporta apenas a CLASSE (default). NÃO instancia aqui!

import ccxt from 'ccxt';

const WS_ENDPOINT = 'wss://stream.binance.com:9443/ws';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default class BinanceService {
  constructor() {
    const apiKey = process.env.BINANCE_API_KEY || '';
    const secret = process.env.BINANCE_SECRET || '';
    const defaultType = (process.env.BINANCE_DEFAULT_TYPE || 'spot').toLowerCase(); // 'spot' ou 'future'
    const enableRateLimit = true;

    this.exchange = new ccxt.binance({
      apiKey,
      secret,
      enableRateLimit,
      options: {
        defaultType, // spot por padrão
      },
      timeout: 15_000,
    });

    // Cache simples de OHLCV (por símbolo+timeframe)
    this.ohlcvCache = new Map(); // key: `${symbol}|${timeframe}` => { ts, data }

    // WebSockets
    this.wsEnabled = String(process.env.BINANCE_WS_ENABLED || 'false').toLowerCase() === 'true';
    this.wsClients = new Map();   // key: `${symbol}|${interval}` => ws instance
    this.wsHandlers = new Map();  // key: `${symbol}|${interval}` => callback
    this.wsLastSeen = new Map();  // key: `${symbol}|${interval}` => last timestamp

    // Limites
    this.maxOhlcvLimit = 1500;
  }

  // ===== Util =====

  _key(symbol, timeframe) {
    return `${symbol}|${timeframe}`;
  }

  _normalizeTimeframe(tf) {
    const allowed = new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M']);
    if (!allowed.has(tf)) {
      const map = {
        '5min': '5m',
        '15min': '15m',
        '30min': '30m',
        '60min': '1h',
        '240min': '4h',
        'D': '1d',
        'H4': '4h',
      };
      return map[tf] || '1h';
    }
    return tf;
  }

  _streamName(symbol, interval) {
    // BTC/USDT -> btcusdt
    const s = symbol.replace('/', '').toLowerCase();
    const i = this._normalizeTimeframe(interval);
    return `${s}@kline_${i}`;
  }

  _toSeries(ohlcv) {
    // ccxt OHLCV: [ts, open, high, low, close, volume]
    const ts = [];
    const open = [];
    const high = [];
    const low = [];
    const close = [];
    const volume = [];

    for (const c of ohlcv) {
      ts.push(c[0]);
      open.push(Number(c[1]));
      high.push(Number(c[2]));
      low.push(Number(c[3]));
      close.push(Number(c[4]));
      volume.push(Number(c[5]));
    }

    return { timestamp: ts, open, high, low, close, volume };
  }

  // ===== REST =====

  async getServerTime() {
    try {
      const t = await this.exchange.fetchTime();
      return String(t ?? Date.now());
    } catch (err) {
      console.warn('[BinanceService] fetchTime falhou, usando Date.now():', err.message);
      return String(Date.now());
    }
  }

  /**
   * Busca OHLCV (com retry/backoff em 429/500/timeout).
   * Retorna em formato de séries {timestamp[], open[], high[], low[], close[], volume[]}
   */
  async getOHLCVData(symbol, timeframe = '1h', limit = 200) {
    const tf = this._normalizeTimeframe(timeframe);
    const requestedLimit = Number(limit) || 200;
    const safeLimit = Math.min(Math.max(50, requestedLimit), this.maxOhlcvLimit);
    const cacheKey = this._key(symbol, tf);

    // usa cache dos últimos 30s pra aliviar chamadas
    const cached = this.ohlcvCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.ts < 30_000 && cached.data?.close?.length >= Math.min(50, safeLimit)) {
      return cached.data;
    }

    const tryFetch = async (lim) => {
      let attempts = 0;
      let lastErr = null;

      while (attempts < 4) {
        attempts++;
        try {
          const ohlcv = await this.exchange.fetchOHLCV(symbol, tf, undefined, lim);
          const data = this._toSeries(ohlcv);
          this.ohlcvCache.set(cacheKey, { ts: Date.now(), data });
          return data;
        } catch (err) {
          lastErr = err;
          const msg = (err && err.message) || '';
          const http = Number(err?.httpStatus || 0);

          const is429 =
            msg.includes('Too Many Requests') ||
            http === 429 ||
            msg.includes('429');

          const is500 =
            http === 500 ||
            /500 Internal Server Error/i.test(msg);

          const isNetwork =
            err instanceof ccxt.NetworkError ||
            err instanceof ccxt.ExchangeNotAvailable ||
            err instanceof ccxt.RequestTimeout ||
            /ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN/i.test(msg);

          if (is429 || is500 || isNetwork) {
            const backoff = 600 * attempts; // 0.6s, 1.2s, 1.8s, 2.4s
            console.warn(
              `[BinanceService] ${http || 'ERR'} em OHLCV ${symbol} ${tf} (tentativa ${attempts}) — aguardando ${backoff}ms`
            );
            await sleep(backoff);
            continue;
          }

          // erro diferente → não adianta insistir
          throw err;
        }
      }

      // falhou após tentativas
      throw lastErr || new Error(`Falha em fetchOHLCV ${symbol} ${tf} (limit=${lim})`);
    };

    // 1) tenta com o limit solicitado
    try {
      return await tryFetch(safeLimit);
    } catch (err1) {
      // 2) fallback: tenta com metade do limit (alguns 500 somem com payload menor)
      const smaller = Math.max(50, Math.floor(safeLimit / 2));
      if (smaller < safeLimit) {
        console.warn(`[BinanceService] Fallback OHLCV com limit reduzido: ${symbol} ${tf} ${smaller}`);
        try {
          return await tryFetch(smaller);
        } catch (err2) {
          // 3) último fallback: retorna cache (se existir) para não quebrar a análise
          const cached2 = this.ohlcvCache.get(cacheKey)?.data;
          if (cached2 && cached2.close?.length) {
            console.warn('[BinanceService] Usando OHLCV em cache como último recurso.');
            return cached2;
          }
          throw err2;
        }
      }
      throw err1;
    }
  }

  /**
   * Preço atual simples (número). Se falhar, retorna 0 para não quebrar.
   */
  async getCurrentPrice(symbol) {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return Number(ticker?.last ?? ticker?.close ?? 0);
    } catch (err) {
      console.warn(`[BinanceService] getCurrentPrice falhou para ${symbol}:`, err.message);
      return 0;
    }
  }

  /**
   * Ticker completo (objeto padronizado). Se falhar, retorna null.
   * Corrige os logs “getCurrentTicker is not a function”.
   */
  async getCurrentTicker(symbol) {
    try {
      const t = await this.exchange.fetchTicker(symbol);
      return {
        symbol,
        last: Number(t.last ?? t.close ?? 0),
        bid: Number(t.bid ?? 0),
        ask: Number(t.ask ?? 0),
        high: Number(t.high ?? 0),
        low: Number(t.low ?? 0),
        baseVolume: Number(t.baseVolume ?? 0),
        quoteVolume: Number(t.quoteVolume ?? 0),
        change: Number(t.change ?? 0),
        percentage: Number(t.percentage ?? 0),
        ts: t.timestamp ?? Date.now(),
        info: t.info,
      };
    } catch (err) {
      console.warn(`[BinanceService] getCurrentTicker falhou para ${symbol}:`, err.message);
      return null;
    }
  }

  // Alias por compatibilidade com possíveis chamadas antigas
  async getTicker(symbol) {
    return this.getCurrentTicker(symbol);
  }

  // ===== WS (opcional) =====

  /**
   * Conecta WS de kline e repassa candles fechados via callback.
   * Se WS não estiver habilitado ou faltar 'ws', retorna false e não quebra.
   */
  async connectWebSocket(symbol, interval = '1m', onCandleClosed) {
    if (!this.wsEnabled) {
      console.log(`[BinanceService] WS desabilitado (BINANCE_WS_ENABLED=false) — ignorando connectWebSocket.`);
      return false;
    }

    let WS;
    try {
      const mod = await import('ws');
      WS = mod.default || mod;
    } catch (err) {
      console.warn('[BinanceService] Pacote "ws" não encontrado. Desative WS ou adicione "ws" nas dependências.');
      return false;
    }

    const tf = this._normalizeTimeframe(interval);
    const key = this._key(symbol, tf);
    if (this.wsClients.has(key)) {
      return true;
    }

    const stream = this._streamName(symbol, tf);
    const url = `${WS_ENDPOINT}/${stream}`;
    const ws = new WS(url);

    this.wsClients.set(key, ws);
    if (typeof onCandleClosed === 'function') {
      this.wsHandlers.set(key, onCandleClosed);
    }

    ws.on('open', () => {
      this.wsLastSeen.set(key, Date.now());
      console.log(`[BinanceService][WS] Conectado ${symbol} ${tf}`);
    });

    ws.on('message', (raw) => {
      try {
        const evt = JSON.parse(raw.toString());
        this.wsLastSeen.set(key, Date.now());
        const k = evt?.k;
        if (!k) return;

        const candle = {
          symbol,
          interval: tf,
          isClosed: Boolean(k.x),
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: Number(k.v),
          timestamp: Number(k.t),
        };

        if (candle.isClosed) {
          const handler = this.wsHandlers.get(key);
          if (handler) handler(candle);
        }
      } catch (e) {
        console.warn('[BinanceService][WS] erro ao parsear mensagem:', e.message);
      }
    });

    ws.on('error', (err) => {
      console.warn(`[BinanceService][WS] erro ${symbol} ${tf}:`, err?.message || err);
    });

    ws.on('close', () => {
      console.log(`[BinanceService][WS] Conexão encerrada ${symbol} ${tf}`);
      this.wsClients.delete(key);
      this.wsHandlers.delete(key);
      this.wsLastSeen.delete(key);
    });

    return true;
  }

  stopWebSocketForSymbol(symbol, interval = '1m') {
    const tf = this._normalizeTimeframe(interval);
    const key = this._key(symbol, tf);
    const ws = this.wsClients.get(key);
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
      this.wsClients.delete(key);
      this.wsHandlers.delete(key);
      this.wsLastSeen.delete(key);
      console.log(`[BinanceService][WS] Stop ${symbol} ${tf}`);
      return true;
    }
    return false;
  }

  async cleanupOrphanedWebSockets(maxIdleMs = 10 * 60 * 1000) {
    const now = Date.now();
    for (const [key, last] of this.wsLastSeen.entries()) {
      if (now - last > maxIdleMs) {
        const [symbol, tf] = key.split('|');
        console.log(`[BinanceService][WS] Limpando conexão ociosa: ${key}`);
        this.stopWebSocketForSymbol(symbol, tf);
      }
    }
  }

  closeAllWebSockets() {
    for (const [key, ws] of this.wsClients.entries()) {
      try {
        ws.close();
      } catch (_) {}
      this.wsClients.delete(key);
      this.wsHandlers.delete(key);
      this.wsLastSeen.delete(key);
    }
    console.log('[BinanceService][WS] Todas as conexões fechadas');
  }
}
