// server/services/binanceService.js
// Serviço de integração com a Binance (REST + WS) com fallback para Bybit (perp USDT)
// ✅ Exporta apenas a CLASSE (default). NÃO instancia aqui!

import ccxt from 'ccxt';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Mapeia símbolo padrão (ex.: BTC/USDT) para o contrato perp USDT linear na Bybit (ex.: BTC/USDT:USDT)
 */
function toBybitLinear(symbol) {
  // Muitos pares em Bybit linear são "BASE/USDT:USDT"
  if (symbol.includes(':')) return symbol; // já está mapeado
  const [base, quote] = symbol.split('/');
  if (!quote) return symbol;
  return `${base}/${quote}:USDT`;
}

export default class BinanceService {
  constructor() {
    const apiKey = process.env.BINANCE_API_KEY || '';
    const secret = process.env.BINANCE_SECRET || '';
    const defaultType = (process.env.BINANCE_DEFAULT_TYPE || 'future').toLowerCase(); // 'future' por padrão
    const enableRateLimit = true;

    // ===== EXCHANGES =====
    this.binance = new ccxt.binance({
      apiKey,
      secret,
      enableRateLimit,
      options: {
        defaultType, // 'future' para perp USDT
        adjustForTimeDifference: true,
      },
      timeout: 15_000,
    });

    // Bybit como fallback (swap linear)
    this.bybit = new ccxt.bybit({
      enableRateLimit: true,
      options: {
        defaultType: 'swap',
      },
      timeout: 15_000,
    });

    // Carregamento lazy de markets (evita travar boot)
    this._marketsLoaded = false;

    // Cache simples de OHLCV (por símbolo+timeframe)
    this.ohlcvCache = new Map(); // key: `${symbol}|${timeframe}|primary` ou `...|bybit`

    // WebSockets
    this.wsEnabled = String(process.env.BINANCE_WS_ENABLED || 'false').toLowerCase() === 'true';
    this.wsClients = new Map();   // key: `${symbol}|${interval}` => ws instance
    this.wsHandlers = new Map();  // key: `${symbol}|${interval}` => callback
    this.wsLastSeen = new Map();  // key: `${symbol}|${interval}` => last timestamp

    // Limites
    this.maxOhlcvLimit = 1500;

    // WS endpoint correto para o mercado
    this.wsEndpoint =
      defaultType === 'future'
        ? 'wss://fstream.binance.com/ws'
        : 'wss://stream.binance.com:9443/ws';
  }

  // ===== Util =====

  async _ensureMarkets() {
    if (this._marketsLoaded) return;
    try {
      await Promise.allSettled([this.binance.loadMarkets(), this.bybit.loadMarkets()]);
    } catch (_) {}
    this._marketsLoaded = true;
  }

  _key(symbol, timeframe, venue = 'primary') {
    return `${symbol}|${timeframe}|${venue}`;
  }

  _normalizeTimeframe(tf) {
    const allowed = new Set([
      '1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M'
    ]);
    if (!allowed.has(tf)) {
      const map = {
        '5min': '5m',
        '15min': '15m',
        '30min': '30m',
        '60min': '1h',
        '240min': '4h',
        'D': '1d',
        'H4': '4h',
        '1min': '1m',
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
      const t = await this.binance.fetchTime();
      return String(t ?? Date.now());
    } catch (err) {
      console.warn('[BinanceService] fetchTime falhou, usando Date.now():', err.message);
      return String(Date.now());
    }
  }

  /**
   * Busca OHLCV (com retry/backoff) na Binance e cai para Bybit se necessário.
   * Retorna em formato de séries {timestamp[], open[], high[], low[], close[], volume[]}
   */
  async getOHLCVData(symbol, timeframe = '1h', limit = 200) {
    await this._ensureMarkets();

    const tf = this._normalizeTimeframe(timeframe);
    const requestedLimit = Number(limit) || 200;
    const safeLimit = clamp(requestedLimit, 50, this.maxOhlcvLimit);

    // 1) Tenta Binance (primário)
    try {
      const data = await this._fetchOHLCVWithRetry(this.binance, symbol, tf, safeLimit, 'primary');
      if (data?.close?.length >= Math.min(50, safeLimit)) return data;
      throw new Error('Dados insuficientes da Binance');
    } catch (err1) {
      console.warn(`[BinanceService] OHLCV Binance falhou (${symbol} ${tf}): ${err1.message}`);
    }

    // 2) Fallback Bybit (swap linear USDT)
    try {
      const bybitSymbol = toBybitLinear(symbol);
      const data = await this._fetchOHLCVWithRetry(this.bybit, bybitSymbol, tf, safeLimit, 'bybit');
      if (data?.close?.length) return data;
      throw new Error('Dados insuficientes da Bybit');
    } catch (err2) {
      console.warn(`[BinanceService] OHLCV Bybit falhou (${symbol} ${tf}): ${err2.message}`);
    }

    // 3) Último recurso: cache de qualquer venue
    const cached =
      this.ohlcvCache.get(this._key(symbol, tf, 'primary'))?.data ||
      this.ohlcvCache.get(this._key(symbol, tf, 'bybit'))?.data;

    if (cached?.close?.length) {
      console.warn('[BinanceService] Usando OHLCV em cache como último recurso.');
      return cached;
    }

    throw new Error(`Falha em OHLCV para ${symbol} ${tf}`);
  }

  async _fetchOHLCVWithRetry(exchange, symbol, tf, limit, venue) {
    const cacheKey = this._key(symbol, tf, venue);
    const now = Date.now();

    // cache 30s para aliviar chamadas
    const cached = this.ohlcvCache.get(cacheKey);
    if (cached && now - cached.ts < 30_000 && cached.data?.close?.length >= Math.min(50, limit)) {
      return cached.data;
    }

    const tryFetch = async (lim) => {
      let attempts = 0;
      let lastErr = null;

      while (attempts < 4) {
        attempts++;
        try {
          const ohlcv = await exchange.fetchOHLCV(symbol, tf, undefined, lim);
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

          const is5xx =
            http >= 500 ||
            /5\d{2}/.test(String(http)) ||
            /Internal Server Error|Service Unavailable/i.test(msg);

          const isNetwork =
            err instanceof ccxt.NetworkError ||
            err instanceof ccxt.ExchangeNotAvailable ||
            err instanceof ccxt.RequestTimeout ||
            /ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN/i.test(msg);

          if (is429 || is5xx || isNetwork) {
            const backoff = 700 * attempts; // 0.7s, 1.4s, 2.1s, 2.8s
            console.warn(
              `[BinanceService] ${venue} ${http || 'ERR'} em OHLCV ${symbol} ${tf} (tentativa ${attempts}) — aguardando ${backoff}ms`
            );
            await sleep(backoff);
            continue;
          }

          // erro diferente → não adianta insistir
          throw err;
        }
      }

      // falhou após tentativas
      throw lastErr || new Error(`Falha em fetchOHLCV ${venue} ${symbol} ${tf} (limit=${lim})`);
    };

    // 1) tenta com o limit solicitado
    try {
      return await tryFetch(limit);
    } catch (err1) {
      // 2) fallback: tenta com metade do limit
      const smaller = Math.max(50, Math.floor(limit / 2));
      if (smaller < limit) {
        console.warn(`[BinanceService] Fallback OHLCV (${venue}) com limit reduzido: ${symbol} ${tf} ${smaller}`);
        try {
          return await tryFetch(smaller);
        } catch (err2) {
          // 3) último fallback: retorna cache (se existir)
          const cached2 = this.ohlcvCache.get(cacheKey)?.data;
          if (cached2?.close?.length) {
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
   * Preço atual simples (número) com fallback:
   * 1) Binance ticker.last (future)
   * 2) Bybit ticker.last (swap linear)
   * 3) Último close (1m) de quem responder primeiro
   */
  async getLastPrice(symbol) {
    await this._ensureMarkets();
    // 1) Binance
    try {
      const t = await this.binance.fetchTicker(symbol);
      const last = Number(t?.last ?? t?.close ?? 0);
      if (isFinite(last) && last > 0) return last;
    } catch (err) {
      console.warn(`[BinanceService] getLastPrice Binance falhou ${symbol}:`, err.message);
    }

    // 2) Bybit
    try {
      const bybitSymbol = toBybitLinear(symbol);
      const t = await this.bybit.fetchTicker(bybitSymbol);
      const last = Number(t?.last ?? t?.close ?? 0);
      if (isFinite(last) && last > 0) return last;
    } catch (err) {
      console.warn(`[BinanceService] getLastPrice Bybit falhou ${symbol}:`, err.message);
    }

    // 3) Último close 1m (quem vier primeiro)
    try {
      const [p] = await Promise.race([
        this.getOHLCVCloseSafe(symbol, '1m'),
        sleep(1200).then(() => [null]), // timeout leve
      ]);
      if (isFinite(p) && p > 0) return p;
    } catch (_) {}

    return 0;
  }

  // Compat aliases usados pelo monitor
  async fetchTickerPrice(symbol) {
    return this.getLastPrice(symbol);
  }
  async getPrice(symbol) {
    return this.getLastPrice(symbol);
  }

  async getOHLCV(symbol, timeframe = '1m', limit = 1) {
    const d = await this.getOHLCVData(symbol, timeframe, limit);
    // para compat: retorna array ccxt-like quando limit pequeno
    const out = [];
    for (let i = 0; i < d.timestamp.length; i++) {
      out.push([d.timestamp[i], d.open[i], d.high[i], d.low[i], d.close[i], d.volume[i]]);
    }
    return out;
  }

  async fetchOHLCV(symbol, timeframe = '1m', limit = 1) {
    return this.getOHLCV(symbol, timeframe, limit);
  }

  async getOHLCVCloseSafe(symbol, timeframe = '1m') {
    try {
      const arr = await this.getOHLCV(symbol, timeframe, 2);
      const last = arr[arr.length - 1];
      if (Array.isArray(last)) return [Number(last[4])];
    } catch (e) {}
    return [null];
  }

  /**
   * Ticker completo (objeto padronizado). Se falhar, tenta Bybit. Se tudo falhar, null.
   */
  async getCurrentTicker(symbol) {
    await this._ensureMarkets();

    // Binance
    try {
      const t = await this.binance.fetchTicker(symbol);
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
        venue: 'binance',
      };
    } catch (err) {
      console.warn(`[BinanceService] getCurrentTicker Binance falhou para ${symbol}:`, err.message);
    }

    // Bybit (fallback)
    try {
      const bybitSymbol = toBybitLinear(symbol);
      const t = await this.bybit.fetchTicker(bybitSymbol);
      return {
        symbol: bybitSymbol,
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
        venue: 'bybit',
      };
    } catch (err) {
      console.warn(`[BinanceService] getCurrentTicker Bybit falhou para ${symbol}:`, err.message);
    }

    return null;
  }

  // Alias por compatibilidade com possíveis chamadas antigas
  async getTicker(symbol) {
    return this.getCurrentTicker(symbol);
  }

  // ===== WS (opcional) =====

  /**
   * Conecta WS de kline (mercado correto) e repassa candles fechados via callback.
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
    const key = `${symbol}|${tf}`;
    if (this.wsClients.has(key)) {
      return true;
    }

    const stream = this._streamName(symbol, tf);
    const url = `${this.wsEndpoint}/${stream}`;
    const ws = new WS(url);

    this.wsClients.set(key, ws);
    if (typeof onCandleClosed === 'function') {
      this.wsHandlers.set(key, onCandleClosed);
    }

    ws.on('open', () => {
      this.wsLastSeen.set(key, Date.now());
      console.log(`[BinanceService][WS] Conectado ${symbol} ${tf} (${this.wsEndpoint.includes('fstream') ? 'futures' : 'spot'})`);
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
    const key = `${symbol}|${tf}`;
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
