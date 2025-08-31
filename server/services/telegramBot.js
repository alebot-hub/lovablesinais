/**
 * Serviço do Bot do Telegram
 * (Mantida sua estrutura original; adicionado monitor com fallback por polling)
 * Correções/Travas:
 *  - Níveis SEMPRE fixos: 6 alvos em +1.50% (ou -1.50% p/ short) e STOP em 4.50%
 *  - Mesmo que o pipeline envie valores diferentes, normalizamos na emissão e no monitor
 *  - Persiste níveis normalizados e força o monitor a respeitar esses números (sem recomputar fora do padrão)
 *  - Mantém "stopLossOriginal" para exibir exatamente o preço publicado no resultado
 *  - Adiciona hash de níveis para auditoria
 */

import TelegramBot from 'node-telegram-bot-api';
import crypto from 'crypto';
import { Logger } from './logger.js';

const logger = new Logger('TelegramBot');

// 🔒 Parâmetros FIXOS de níveis
const LEVELS = {
  TARGET_STEP: 0.015,     // 1.50%
  NUM_TARGETS: 6,
  STOP_PCT: 0.045,        // 4.50%
  EPS: 1e-10,             // tolerância numérica para comparações
};

class TelegramBotService {
  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.isEnabled = !!(this.token && this.chatId);
    this.activeMonitors = new Map();

    // 🔒 Fonte-de-verdade dos níveis publicados
    this.lastSignalById = new Map();      // signalId -> { symbol, entry, targets, stopLoss, timeframe, levelsHash, createdAt }
    this.lastSignalBySymbol = new Map();  // symbol   -> último objeto acima

    if (this.isEnabled) {
      this.bot = new TelegramBot(this.token, { polling: false });
      console.log('✅ Telegram Bot inicializado');
    } else {
      console.log('⚠️ Telegram Bot em modo simulado (variáveis não configuradas)');
    }
  }

  // =============== UTILITÁRIOS DE ENVIO (Markdown Safe) ===============

  _stripAllMarkdown(text) {
    if (!text) return text;
    return String(text)
      .replace(/[*_`]/g, '')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/~/g, '')
      .replace(/>/g, '')
      .replace(/#/g, '')
      .replace(/\+/g, '')
      .replace(/-/g, '')
      .replace(/=/g, '')
      .replace(/\|/g, '')
      .replace(/{/g, '')
      .replace(/}/g, '')
      .replace(/\./g, '.')
      .replace(/!/g, '');
  }

  _escapeMarkdownV2(text) {
    if (!text) return text;
    return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }

  async _sendMessageSafe(text) {
    if (!this.isEnabled) {
      console.log('📱 [SIMULADO] Sinal enviado (safe):', (text || '').slice(0, 120) + '...');
      return true;
    }
    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
      return true;
    } catch (err1) {
      const msg1 = String(err1?.message || '');
      const parseFail1 = msg1.includes("can't parse entities") || msg1.includes('parse entities');
      if (!parseFail1) throw err1;

      try {
        const escaped = this._escapeMarkdownV2(text);
        await this.bot.sendMessage(this.chatId, escaped, {
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        });
        return true;
      } catch (err2) {
        const msg2 = String(err2?.message || '');
        const parseFail2 = msg2.includes("can't parse entities") || msg2.includes('parse entities');
        if (!parseFail2) throw err2;

        const plain = this._stripAllMarkdown(text);
        await this.bot.sendMessage(this.chatId, plain, { disable_web_page_preview: true });
        return true;
      }
    }
  }

  // ====== HORÁRIO SÃO PAULO ======
  formatNowSP() {
    try {
      return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    } catch (_) {
      return new Date().toLocaleString('pt-BR');
    }
  }

  // =================== NÍVEIS (STOP E ALVOS) ===================

  /** Calcula os níveis FIXOS (1.50% × 6 e stop 4.50%) a partir da entrada e direção. */
  _expectedLevels(entry, isLong) {
    const e = Number(entry);
    if (!isFinite(e) || e <= 0) return { targets: [], stopLoss: null };
    const steps = Array.from({ length: LEVELS.NUM_TARGETS }, (_, i) => LEVELS.TARGET_STEP * (i + 1));
    const targets = steps.map(pct => (isLong ? e * (1 + pct) : e * (1 - pct)));
    const stopLoss = isLong ? e * (1 - LEVELS.STOP_PCT) : e * (1 + LEVELS.STOP_PCT);
    return { targets, stopLoss };
  }

  /** Hash estável dos níveis para auditoria */
  _levelsHash(entry, targets, stopLoss) {
    const payload = JSON.stringify({
      e: Number(entry),
      t: Array.isArray(targets) ? targets.map(Number) : [],
      s: Number(stopLoss),
    });
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
  }

  /** Comparação com tolerância numérica */
  _almostEqual(a, b, eps = LEVELS.EPS) {
    if (!isFinite(a) || !isFinite(b)) return false;
    const diff = Math.abs(a - b);
    return diff <= eps * Math.max(1, Math.abs(a), Math.abs(b));
  }
  _arraysEqualWithin(a = [], b = [], eps = LEVELS.EPS) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!this._almostEqual(Number(a[i]), Number(b[i]), eps)) return false;
    }
    return true;
  }

  /**
   * Normaliza quaisquer níveis recebidos para SEMPRE respeitar:
   * - 6 alvos em 1.50% cada (acumulado)
   * - stop em 4.50% da entrada
   */
  _enforceFixedLevels(entry, isLong, maybeTargets, maybeStop) {
    const { targets: expTargets, stopLoss: expStop } = this._expectedLevels(entry, isLong);

    const haveTargets = Array.isArray(maybeTargets) && maybeTargets.length === LEVELS.NUM_TARGETS;
    const haveStop = isFinite(maybeStop);

    const needRecalc =
      !haveTargets ||
      !this._arraysEqualWithin(maybeTargets.map(Number), expTargets, LEVELS.EPS) ||
      !haveStop ||
      !this._almostEqual(Number(maybeStop), expStop, LEVELS.EPS);

    if (needRecalc) {
      console.log('🔒 Normalizando níveis para padrão fixo (1.50% & 4.50%).');
      return { targets: expTargets, stopLoss: expStop, normalized: true };
    }
    return { targets: maybeTargets.map(Number), stopLoss: Number(maybeStop), normalized: false };
  }

  // =================== EMISSÃO DO SINAL ===================

  /**
   * Envia sinal de trading formatado.
   * Níveis SEMPRE normalizados para 1.50%/4.50%.
   */
  async sendTradingSignal(signalData) {
    try {
      if (!this.isEnabled) {
        console.log('📱 [SIMULADO] Sinal enviado:', signalData.symbol);
        return true;
      }

      const isLong = signalData.trend === 'BULLISH';
      const entry = Number(signalData.entry);

      // 1) Normaliza níveis (mesmo que venham do pipeline)
      const normalization = this._enforceFixedLevels(
        entry,
        isLong,
        signalData.targets,
        signalData.stopLoss
      );

      const targets = normalization.targets;
      const stopLoss = normalization.stopLoss;

      if (normalization.normalized) {
        console.log('🧮 Níveis ajustados na emissão para o padrão fixo.');
      }

      // 2) Persistir níveis publicados (fonte de verdade do monitor)
      const published = {
        symbol: signalData.symbol,
        entry,
        targets: [...targets],
        stopLoss,
        timeframe: signalData.timeframe || '1h',
        createdAt: new Date(),
      };
      published.levelsHash = this._levelsHash(entry, targets, stopLoss);

      const signalId = signalData.signalId || `${signalData.symbol}:${published.timeframe}:${entry}`;
      this.lastSignalById.set(signalId, published);
      this.lastSignalBySymbol.set(signalData.symbol, { ...published, signalId });

      console.log(`🧩 [TelegramBot] Níveis publicados (${signalId}) hash=${published.levelsHash}`);
      console.log(`    Entry=${entry}  Stop=${stopLoss}  Targets=${targets.join(', ')}`);

      // 3) Mensagem com exatamente os níveis normalizados
      const message = this.formatTradingSignal({
        ...signalData,
        entry,
        targets,
        stopLoss,
      });

      await this._sendMessageSafe(message);
      console.log(`✅ Sinal enviado via Telegram: ${signalData.symbol}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar sinal:', error.message);
      return false;
    }
  }

  // =================== FORMATAÇÃO ===================

  formatPrice(price) {
    if (!price || isNaN(price)) return '0.00';
    if (price >= 100) return Number(price).toFixed(2);
    if (price >= 10) return Number(price).toFixed(3);
    if (price >= 1) return Number(price).toFixed(4);
    if (price >= 0.01) return Number(price).toFixed(5);
    return Number(price).toFixed(6);
  }

  formatTradingSignal(signal) {
    const isLong = signal.trend === 'BULLISH';
    const direction = isLong ? 'COMPRA' : 'VENDA';
    const emoji = isLong ? '🟢' : '🔴';
    const animal = isLong ? '🐂' : '🐻';

    const displayProbability = this.calculateDisplayProbability(
      signal.probability ?? signal.totalScore ?? 0
    );

    const factors = this.generateSpecificFactors(signal, isLong);
    const factorsText = factors.map((f) => `   • ${f}`).join('\n');

    const targets = (signal.targets || [])
      .map((target, index) => {
        const targetNum = index + 1;
        const tEmoji = targetNum === 6 ? '🌕' : `${targetNum}️⃣`;
        const label =
          targetNum === 6
            ? isLong
              ? 'Alvo 6 - Lua!'
              : 'Alvo 6 - Queda Infinita!'
            : `Alvo ${targetNum}`;
        return `${tEmoji} *${label}:* ${this.formatPrice(target).replace('.', '․')}`;
      })
      .join('\n');

    const isCounterTrend =
      signal.btcCorrelation && signal.btcCorrelation.alignment === 'AGAINST';
    const counterTrendWarning = isCounterTrend
      ? this.getCounterTrendWarning(signal, isLong)
      : '';

    return `🚨 *LOBO PREMIUM #${signal.symbol.split('/')[0]} ${emoji} ${direction} ${animal}*${
      isCounterTrend ? ' ⚡' : ''
    }

💰 *#${signal.symbol.split('/')[0]} Futures*
📊 *TEMPO GRÁFICO:* ${signal.timeframe || '1h'}
📈 *Alavancagem sugerida:* 15x
🎯 *Probabilidade:* ${displayProbability.toFixed(1)}%

💡 *Interpretação:* ${this.getInterpretation(signal, isLong)}
🔍 *Fatores-chave:*
${factorsText}

⚡️ *Entrada:* ${this.formatPrice(signal.entry).replace('.', '․')}

🎯 *ALVOS (15x):*
${targets}

🛑 *Stop Loss:* ${this.formatPrice(signal.stopLoss).replace('.', '․')}

${counterTrendWarning}

👑 *Sinais Lobo Premium*
⏰ ${this.formatNowSP()}`;
  }

  getCounterTrendWarning(signal, isLong) {
    const btcTrend =
      signal?.btcCorrelation?.btcTrend === 'BULLISH' ? 'alta' : 'baixa';
    const btcStrength = signal?.btcCorrelation?.btcStrength ?? 0;
    const operationType = isLong ? 'COMPRA' : 'VENDA';
    const reversalType =
      signal?.details?.counterTrendAdjustments?.reversalType || 'MODERATE';

    let icon = '⚠️';
    let risk = 'ELEVADO';
    let recommendation =
      'Sinal contra-tendência — use gestão de risco rigorosa';

    if (reversalType === 'STRONG') {
      icon = '💪';
      risk = 'MODERADO';
      recommendation = 'Forte sinal de reversão — boa oportunidade';
    } else if (reversalType === 'EXTREME') {
      icon = '🔥';
      risk = 'CONTROLADO';
      recommendation = 'Reversão extrema detectada — sinal de alta qualidade';
    }

    return `${icon} *SINAL CONTRA-TENDÊNCIA*
₿ *Bitcoin:* Tendência de *${btcTrend}* (força: ${btcStrength})
🎯 *Operação:* ${operationType} contra a tendência do BTC
⚖️ *Risco:* ${risk}
💡 *Estratégia:* ${recommendation}

🛡️ *GESTÃO DE RISCO REFORÇADA:*
• Monitore de perto os primeiros alvos
• Realize lucros parciais rapidamente
• Mantenha stop loss rigoroso
• Considere reduzir alavancagem se necessário`;
  }

  generateSpecificFactors(signal, isLong) {
    const factors = [];
    const indicators = signal.indicators || {};
    const patterns = signal.patterns || {};
    const btcCorrelation = signal.btcCorrelation || {};

    if (indicators.rsi !== undefined) {
      if (isLong && indicators.rsi < 25) factors.push('RSI em sobrevenda favorável para compra');
      else if (!isLong && indicators.rsi > 80) factors.push('RSI em sobrecompra favorável para venda');
      else if (indicators.rsi < 40) factors.push(isLong ? 'RSI em zona de compra' : 'RSI em sobrevenda');
      else if (indicators.rsi > 60) factors.push(isLong ? 'RSI em sobrecompra' : 'RSI em zona de venda');
    }

    if (indicators.macd && indicators.macd.histogram !== undefined) {
      if (isLong && indicators.macd.histogram > 0) factors.push('MACD com momentum bullish confirmado');
      else if (!isLong && indicators.macd.histogram < 0) factors.push('MACD com momentum bearish confirmado');
      else if (indicators.macd.histogram > 0) factors.push('MACD indicando força compradora');
      else factors.push('MACD indicando pressão vendedora');
    }

    if (indicators.volume && indicators.volume.volumeRatio > 1.2) {
      factors.push(isLong ? 'Volume alto confirmando movimento de compra' : 'Volume alto confirmando pressão vendedora');
    } else if (indicators.volume) {
      factors.push('Volume moderado sustentando o movimento');
    }

    if (patterns.breakout) {
      if (patterns.breakout.type === 'BULLISH_BREAKOUT') factors.push('Rompimento bullish de resistência confirmado');
      else if (patterns.breakout.type === 'BEARISH_BREAKOUT') factors.push('Rompimento bearish de suporte confirmado');
    }
    if (patterns.candlestick && patterns.candlestick.length > 0) {
      const p = patterns.candlestick[0];
      if (p.bias === 'BULLISH') factors.push(`Padrão ${p.type.toLowerCase()} detectado (bullish)`);
      else if (p.bias === 'BEARISH') factors.push(`Padrão ${p.type.toLowerCase()} detectado (bearish)`);
    }

    if (indicators.rsiDivergence) factors.push('Divergência RSI detectada (sinal de reversão)');

    if (btcCorrelation.alignment === 'ALIGNED') {
      const btcTrend = btcCorrelation.btcTrend === 'BULLISH' ? 'bullish' : 'bearish';
      factors.push(`Alinhado com tendência ${btcTrend} do Bitcoin`);
    } else if (btcCorrelation.alignment === 'AGAINST') {
      factors.push('Operação contra tendência do Bitcoin (risco elevado)');
    }

    if (indicators.ma21 && indicators.ma200) {
      if (isLong && indicators.ma21 > indicators.ma200) factors.push('Médias móveis em configuração bullish');
      else if (!isLong && indicators.ma21 < indicators.ma200) factors.push('Médias móveis em configuração bearish');
    }

    const unique = [...new Set(factors)];
    return unique.slice(0, 4);
  }

  getInterpretation(signal, isLong) {
    const indicators = signal.indicators || {};
    if (indicators.rsi < 25 && isLong) return 'RSI em sobrevenda extrema favorável para compra';
    if (indicators.rsi > 75 && !isLong) return 'RSI em sobrecompra extrema favorável para venda';
    if (indicators.macd && Math.abs(indicators.macd.histogram) > 0.001) {
      const d = isLong ? 'compra' : 'venda';
      return `MACD com forte momentum favorável para ${d}`;
    }
    if (signal.btcCorrelation && signal.btcCorrelation.alignment === 'ALIGNED')
      return 'Análise técnica alinhada com tendência do Bitcoin';
    return `Análise técnica favorável para ${isLong ? 'compra' : 'venda'}`;
  }

  /**
   * Comprime extremos apenas para exibição
   */
  calculateDisplayProbability(rawProbability) {
    let p = Number(rawProbability);
    if (!isFinite(p) || p < 0) p = 0;
    if (p > 100) p = 100;

    if (p >= 98) return 82 + Math.min(5, (p - 98) * 0.5);
    if (p >= 90) return 80 + (p - 90) * 0.2;
    if (p >= 60) return 72 + (p - 60) * 0.2;
    if (p >= 30) return 66 + (p - 30) * 0.2;
    return 60 + p * 0.2;
  }

  // ====== Monitores ======

  /**
   * Cria monitor SEMPRE com os níveis normalizados (1.50%/4.50%).
   * Se o chamador passar níveis divergentes ou o sinal publicado tiver sido alterado,
   * normalizamos novamente aqui.
   */
  createMonitor(symbol, entry, targets, stopLoss, signalId, trend) {
    try {
      if (this.activeMonitors.has(symbol)) {
        console.log(`⚠️ Monitor já existe para ${symbol} - substituindo`);
        this.removeMonitor(symbol, 'REPLACED');
      }

      // 1) Recupera o último sinal publicado (já normalizado na emissão)
      const published =
        (signalId && this.lastSignalById.get(signalId)) ||
        this.lastSignalBySymbol.get(symbol);

      const isLong = trend === 'BULLISH';
      let entryNum = Number(entry);

      let finalTargets = Array.isArray(targets) ? targets.map(Number) : [];
      let finalStop = Number(stopLoss);

      if (published) {
        entryNum = Number(published.entry); // garantir mesma entrada do sinal
        finalTargets = [...published.targets];
        finalStop = Number(published.stopLoss);
      }

      // 2) Segurança extra: normaliza de novo para o padrão fixo
      const { targets: normTargets, stopLoss: normStop } =
        this._enforceFixedLevels(entryNum, isLong, finalTargets, finalStop);

      const monitor = {
        symbol,
        entry: entryNum,
        targets: [...normTargets],
        originalTargets: [...normTargets],
        stopLoss: normStop,                  // stop atual (poderá virar móvel)
        stopLossOriginal: normStop,          // fixo para exibição
        signalId,
        trend,
        startTime: new Date(),
        targetsHit: 0,
        status: 'ACTIVE',
        lastUpdate: new Date(),
        // metadados
        levelsHash: this._levelsHash(entryNum, normTargets, normStop),
        timeframe: published?.timeframe || '1h',
      };

      this.activeMonitors.set(symbol, monitor);
      console.log(`✅ Monitor criado para ${symbol} (${normTargets.length} alvos) [hash=${monitor.levelsHash}]`);

      return monitor;
    } catch (error) {
      console.error(`❌ Erro ao criar monitor para ${symbol}:`, error.message);
      return null;
    }
  }

  removeMonitor(symbol, reason = 'COMPLETED') {
    if (this.activeMonitors.has(symbol)) {
      const monitor = this.activeMonitors.get(symbol);
      this.activeMonitors.delete(symbol);
      console.log(`🗑️ Monitor removido: ${symbol} (${reason})`);
      return monitor;
    }
    return null;
  }

  hasActiveMonitor(symbol) {
    return this.activeMonitors.has(symbol);
  }

  getActiveSymbols() {
    return Array.from(this.activeMonitors.keys());
  }

  /**
   * Monitor de preço: usa SEMPRE os níveis do monitor (já normalizados).
   */
  async startPriceMonitoring(symbol, entry, targets, stopLoss, binanceService, signalData, app, adaptiveScoring) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) {
        console.error(`❌ Monitor não encontrado para ${symbol}`);
        return;
      }

      console.log(`📊 Iniciando monitoramento de ${symbol}...`);
      console.log(`   🧾 Hash níveis: ${monitor.levelsHash}`);
      console.log(`   💰 Entrada (fixa): $${this.formatPrice(monitor.entry)}`);
      console.log(`   🎯 Alvos (fixos): ${monitor.targets.map((t) => '$' + this.formatPrice(t)).join(', ')}`);
      console.log(`   🛑 Stop (fixo): $${this.formatPrice(monitor.stopLossOriginal)}`);
      console.log(`   📈 Trend: ${monitor.trend}`);

      const wsEnabled = String(process.env.BINANCE_WS_ENABLED || '').toLowerCase() === 'true';
      const hasWS = binanceService && typeof binanceService.connectWebSocket === 'function' && typeof binanceService.stopWebSocketForSymbol === 'function';

      const onTick = async (tick) => {
        try {
          const currentPrice = Number(tick.close || tick.price || tick);
          if (!isFinite(currentPrice)) return;

          const currentMonitor = this.activeMonitors.get(symbol);
          if (!currentMonitor || currentMonitor.status !== 'ACTIVE') {
            console.log(`⏭️ Monitor inativo para ${symbol} - parando monitoramento`);
            if (hasWS && wsEnabled) binanceService.stopWebSocketForSymbol(symbol, '1m');
            if (pollTimer) clearInterval(pollTimer);
            return;
          }

          // STOP
          const hitStopLoss =
            currentMonitor.trend === 'BULLISH'
              ? currentPrice <= currentMonitor.stopLoss
              : currentPrice >= currentMonitor.stopLoss;

          if (hitStopLoss) {
            if (currentMonitor.isMobileStopActive && currentMonitor.targetsHit > 0) {
              console.log(`🛡️ [${symbol}] STOP MÓVEL ATINGIDO! Preço: $${currentPrice}, Stop: $${currentMonitor.stopLoss}`);
              await this.handleStopMobile(symbol, currentPrice, currentMonitor, app);
            } else {
              console.log(`🛑 [${symbol}] STOP LOSS ATINGIDO! Preço: $${currentPrice}, Stop: $${currentMonitor.stopLoss}`);
              await this.handleStopLoss(symbol, currentPrice, currentMonitor, app);
            }
            return;
          }

          // Alvos
          await this.checkTargets(symbol, currentPrice, currentMonitor, app);
        } catch (e) {
          console.error(`❌ Erro no monitoramento ${symbol}:`, e.message);
        }
      };

      // 1) WebSocket
      let pollTimer = null;
      if (wsEnabled && hasWS) {
        await binanceService.connectWebSocket(symbol, '1m', (candleData) => {
          if (candleData?.isClosed) onTick(candleData);
        });
        console.log(`✅ WebSocket configurado para ${symbol} - monitoramento ativo`);
        return;
      }

      // 2) Polling
      console.log('⚠️ WebSocket indisponível — ativando polling leve (6–10s)');
      const pollIntervalMs = Number(process.env.MONITOR_POLL_INTERVAL_MS || 9000);

      const safeGetLastPrice = async () => {
        try {
          if (binanceService?.getLastPrice) return await binanceService.getLastPrice(symbol);
          if (binanceService?.fetchTickerPrice) return await binanceService.fetchTickerPrice(symbol);
          if (binanceService?.getPrice) return await binanceService.getPrice(symbol);
          if (binanceService?.getOHLCV) {
            const candles = await binanceService.getOHLCV(symbol, '1m', 1);
            const last = candles?.[0];
            if (Array.isArray(last)) return Number(last[4]);
            return last?.close ?? null;
          }
          if (binanceService?.fetchOHLCV) {
            const candles = await binanceService.fetchOHLCV(symbol, '1m', 1);
            const last = candles?.[candles.length - 1];
            if (Array.isArray(last)) return Number(last[4]);
            return last?.close ?? null;
          }
        } catch {}
        return null;
      };

      // Primeira leitura
      {
        const p = await safeGetLastPrice();
        if (isFinite(p)) await onTick({ price: p });
      }

      pollTimer = setInterval(async () => {
        try {
          const price = await safeGetLastPrice();
          if (isFinite(price)) await onTick({ price });
        } catch (e) {
          console.error(`Polling ${symbol} erro:`, e.message);
        }
      }, pollIntervalMs);

    } catch (error) {
      console.error(`❌ Erro ao iniciar monitoramento ${symbol}:`, error.message);
      this.removeMonitor(symbol, 'ERROR');
    }
  }

  async checkTargets(symbol, currentPrice, monitor, app) {
    try {
      const isLong = monitor.trend === 'BULLISH';

      console.log(`🎯 [${symbol}] Verificando alvos:`);
      console.log(`   💰 Preço atual: $${currentPrice}`);
      console.log(`   🎯 Próximo alvo: $${monitor.targets[0] || 'N/A'}`);
      console.log(`   📊 Direção: ${isLong ? 'LONG' : 'SHORT'}`);

      if (monitor.targets.length > 0) {
        const distance = isLong
          ? ((monitor.targets[0] - currentPrice) / currentPrice) * 100
          : ((currentPrice - monitor.targets[0]) / currentPrice) * 100;
        console.log(`   📏 Distância para alvo: ${distance > 0 ? '+' : ''}${distance.toFixed(3)}%`);
      }

      const targetHit =
        monitor.targets.length > 0 &&
        (isLong ? currentPrice >= monitor.targets[0] : currentPrice <= monitor.targets[0]);

      if (targetHit) {
        const targetNumber = monitor.originalTargets.length - monitor.targets.length + 1;
        const targetPrice = monitor.targets[0];

        console.log(`🎉 [${symbol}] ALVO ${targetNumber} ATINGIDO! $${targetPrice}`);

        monitor.targets.shift();
        monitor.targetsHit++;
        monitor.lastUpdate = new Date();

        const pnlPercent = isLong
          ? ((targetPrice - monitor.entry) / monitor.entry) * 100
          : ((monitor.entry - targetPrice) / monitor.entry) * 100;

        console.log(`💰 [${symbol}] Lucro: ${pnlPercent.toFixed(2)}% (${(pnlPercent * 15).toFixed(1)}% com 15x)`);

        await this.sendTargetHitNotification(symbol, targetNumber, targetPrice, pnlPercent);

        if (app.performanceTracker) {
          app.performanceTracker.recordTrade(symbol, pnlPercent, true);
        }

        if (monitor.targets.length === 0) {
          console.log(`🌕 [${symbol}] TODOS OS ALVOS ATINGIDOS!`);
          await this.handleAllTargetsHit(symbol, monitor, app);
        } else {
          await this.handleStopMovement(symbol, targetNumber, monitor);
        }
      } else {
        console.log(`⏳ [${symbol}] Aguardando movimento para alvo...`);
      }
    } catch (error) {
      console.error(`❌ Erro ao verificar alvos ${symbol}:`, error.message);
    }
  }

  async handleStopMovement(symbol, targetNumber, monitor) {
    try {
      let newStopPrice = null;
      let stopDescription = '';

      switch (targetNumber) {
        case 1:
          // Após alvo 1, mantém stop original
          return;
        case 2:
          newStopPrice = monitor.entry;
          stopDescription = 'ponto de entrada';
          break;
        case 3:
          newStopPrice = monitor.originalTargets[0];
          stopDescription = 'alvo 1';
          break;
        case 4:
          newStopPrice = monitor.originalTargets[1];
          stopDescription = 'alvo 2';
          break;
        case 5:
          newStopPrice = monitor.originalTargets[2];
          stopDescription = 'alvo 3';
          break;
        default:
          return;
      }

      if (newStopPrice) {
        console.log(`🛡️ [${symbol}] Movendo stop para ${stopDescription}: $${newStopPrice}`);

        monitor.stopLoss = newStopPrice;        // stop dinâmico
        monitor.isMobileStopActive = true;
        monitor.mobileStopLevel = stopDescription;

        await this.sendStopMovedNotification(symbol, newStopPrice, stopDescription);
      }
    } catch (error) {
      console.error(`❌ Erro ao mover stop ${symbol}:`, error.message);
    }
  }

  async sendStopMovedNotification(symbol, newStopPrice, stopDescription) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) {
        console.error(`❌ Monitor não encontrado para ${symbol}`);
        return;
      }

      const isLong = monitor.trend === 'BULLISH';
      const direction = isLong ? 'COMPRA' : 'VENDA';
      const duration = this.calculateDuration(monitor.startTime);

      const totalRealizedPnL = this.calculateTotalRealizedPnL(monitor, monitor.targetsHit);
      const leveragedTotalPnL = totalRealizedPnL * 15;
      const realizationBreakdown = this.getRealizationBreakdown(monitor.targetsHit);

      const message = `🛡️ *STOP MÓVEL ATIVADO #${symbol
        .split('/')[0]} ${direction}*

✅ *Stop loss movido para ${stopDescription}*
💰 *Lucro parcial realizado:* +${leveragedTotalPnL.toFixed(1)}% (${realizationBreakdown})
📈 *Alvos atingidos:* ${monitor.targetsHit}/6
📊 *Entrada:* ${this.formatPrice(monitor.entry).replace('.', '․')}
🛡️ *Novo stop:* ${this.formatPrice(newStopPrice).replace('.', '․')}
⏱️ *Duração:* ${duration}

💡 *PROTEÇÃO ATIVADA:*
• Stop móvel protegendo lucros parciais
• Operação sem risco de perda
• Gestão de risco funcionando perfeitamente
• Continue seguindo a estratégia!

👑 *Sinais Lobo Premium*`;

      await this._sendMessageSafe(message);
      console.log(`🛡️ Stop móvel enviado: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar stop móvel:`, error.message);
    }
  }

  async handleStopLoss(symbol, currentPrice, monitor, app) {
    try {
      const isLong = monitor.trend === 'BULLISH';
      const pnlPercent = isLong
        ? ((currentPrice - monitor.entry) / monitor.entry) * 100
        : ((monitor.entry - currentPrice) / monitor.entry) * 100;

      if (app.performanceTracker) {
        app.performanceTracker.recordTrade(symbol, pnlPercent, false);
        const realizedPnL = this.calculateTotalRealizedPnL(monitor, monitor.targetsHit);
        app.performanceTracker.updateSignalResult(
          symbol,
          monitor.targetsHit,
          pnlPercent,
          'STOP_LOSS',
          realizedPnL
        );
      }

      if (app.adaptiveScoring) {
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, false, pnlPercent);
      }

      await this.sendStopLossNotification(symbol, currentPrice, monitor, pnlPercent);

      this.removeMonitor(symbol, 'STOP_LOSS');
      if (app.binanceService?.stopWebSocketForSymbol) {
        app.binanceService.stopWebSocketForSymbol(symbol, '1m');
      }
    } catch (error) {
      console.error(`❌ Erro ao tratar stop loss ${symbol}:`, error.message);
    }
  }

  async handleAllTargetsHit(symbol, monitor, app) {
    try {
      const finalTarget = monitor.originalTargets[monitor.originalTargets.length - 1];
      const isLong = monitor.trend === 'BULLISH';
      const totalPnlPercent = isLong
        ? ((finalTarget - monitor.entry) / monitor.entry) * 100
        : ((monitor.entry - finalTarget) / monitor.entry) * 100;

      if (app.performanceTracker) {
        app.performanceTracker.updateSignalResult(
          symbol,
          6,
          totalPnlPercent,
          'ALL_TARGETS',
          totalPnlPercent
        );
      }

      if (app.adaptiveScoring) {
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, true, totalPnlPercent);
      }

      await this.sendAllTargetsHitNotification(symbol, monitor, totalPnlPercent);

      this.removeMonitor(symbol, 'ALL_TARGETS');
      if (app.binanceService?.stopWebSocketForSymbol) {
        app.binanceService.stopWebSocketForSymbol(symbol, '1m');
      }
    } catch (error) {
      console.error(`❌ Erro ao tratar todos alvos ${symbol}:`, error.message);
    }
  }

  async sendTargetHitNotification(symbol, targetNumber, targetPrice, pnlPercent) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) {
        console.error(`❌ Monitor não encontrado para ${symbol}`);
        return;
      }

      const isLong = monitor.trend === 'BULLISH';
      const direction = isLong ? 'COMPRA' : 'VENDA';
      const leveragedPnL = pnlPercent * 15;
      const timeElapsed = this.calculateDuration(monitor.startTime);

      const message = `✅ *ALVO ${targetNumber} ATINGIDO #${symbol.split('/')[0]} ${direction}*

🔍 *Alvo ${targetNumber} atingido no par #${symbol.split('/')[0]}*
💰 *Lucro atual:* +${leveragedPnL.toFixed(1)}% (Alv. 15×)
⚡️ *Posição parcial realizada*
📊 *Entrada:* ${this.formatPrice(monitor.entry).replace('.', '․')}
💵 *Preço do alvo:* ${this.formatPrice(targetPrice).replace('.', '․')}
⏱️ *Tempo até o alvo:* ${timeElapsed}
🛡️ *Stop ativado:* ${this.getStopStatus(targetNumber)}

💰 *Recomendação:* ${this.getTargetRecommendation(targetNumber)}

👑 *Sinais Lobo Premium*`;

      await this._sendMessageSafe(message);
      console.log(`✅ Notificação alvo ${targetNumber} enviada: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar notificação alvo:`, error.message);
    }
  }

  async sendStopLossNotification(symbol, currentPrice, monitor, pnlPercent) {
    try {
      const leveragedPnL = pnlPercent * 15;
      const duration = this.calculateDuration(monitor.startTime);

      // 🧷 Exibir o stop publicado (fixo)
      const publishedStop = this.formatPrice(monitor.stopLossOriginal).replace('.', '․');

      let message;

      if (monitor.targetsHit === 0) {
        message = `❌ *#${symbol.split('/')[0]} - OPERAÇÃO FINALIZADA* ❌

📊 *Resultado:* 🔴
⚡ *Alavancado (15x):* 🔴 ${leveragedPnL.toFixed(1)}%

📌 *Motivo:* STOP LOSS ATIVADO

📈 *Alvos atingidos:* Nenhum
🛑 *Stop loss:* ${publishedStop}
📅 *Duração:* ${duration}

💡 *GERENCIAMENTO DE RISCO:*
- Stop loss ativado sem alvos atingidos
- Perda limitada conforme estratégia
- Gestão de risco protegeu o capital total
- Aguarde próxima oportunidade
- Mantenha disciplina!

📊 *ANÁLISE:*
- Mercado se moveu contra nossa operação
- Stop loss protegeu de perdas maiores
- Próxima operação pode ser mais favorável

👑 Sinais Lobo Cripto
⏰ ${this.formatNowSP()}`;
      } else {
        message = `❌ *#${symbol.split('/')[0]} - OPERAÇÃO FINALIZADA* ❌

📊 *Resultado:* 🔴
⚡ *Alavancado (15x):* 🔴 ${leveragedPnL.toFixed(1)}%

📌 *Motivo:* STOP LOSS ATIVADO APÓS ALVO ${monitor.targetsHit}

📈 *Alvos atingidos:* ${monitor.targetsHit}
🛑 *Stop loss:* ${publishedStop}
📅 *Duração:* ${duration}

💡 *GERENCIAMENTO DE RISCO:*
- Stop loss ativado após realização parcial no Alvo ${monitor.targetsHit}
- ${monitor.targetsHit > 0 ? '50% da posição foi realizada com lucro' : 'Perda limitada conforme estratégia'}
- Perda reduzida na posição restante
- Estratégia de proteção funcionou
- Aguarde próxima oportunidade

📊 *ANÁLISE:*
- Mercado reverteu após atingir o${monitor.targetsHit > 1 ? 's' : ''} primeiro${monitor.targetsHit > 1 ? 's' : ''} alvo${monitor.targetsHit > 1 ? 's' : ''}
- Realização parcial garantiu lucro na operação
- Stop móvel protegeu os ganhos parciais

👑 Sinais Lobo Cripto
⏰ ${this.formatNowSP()}`;
      }

      await this._sendMessageSafe(message);
      console.log(`❌ Stop loss enviado: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar notificação stop loss:`, error.message);
    }
  }

  async sendAllTargetsHitNotification(symbol, monitor, totalPnlPercent) {
    try {
      const leveragedPnL = totalPnlPercent * 15;
      const duration = this.calculateDuration(monitor.startTime);

      const message = `🌕 *#${symbol.split('/')[0]} - OPERAÇÃO FINALIZADA* 🌕

📊 *Resultado:* 🟢 +${totalPnlPercent.toFixed(1)}%
⚡ *Alavancado (15x):* 🟢 +${leveragedPnL.toFixed(1)}%

📌 *Motivo:* TODOS OS ALVOS ATINGIDOS - LUA!

📈 *Alvos atingidos:* 6/6
👑 Aí é Loucura!!
📅 *Duração:* ${duration}

👑 *Sinais Lobo Cripto*
⏰ ${this.formatNowSP()}`;

      await this._sendMessageSafe(message);
      console.log(`🌕 Lua enviada: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar lua:`, error.message);
    }
  }

  async handleStopMobile(symbol, currentPrice, monitor, app) {
    try {
      const isLong = monitor.trend === 'BULLISH';
      const direction = isLong ? 'COMPRA' : 'VENDA';
      const duration = this.calculateDuration(monitor.startTime);

      const totalRealizedPnL = this.calculateTotalRealizedPnL(monitor, monitor.targetsHit);
      const leveragedTotalPnL = totalRealizedPnL * 15;

      const message = `✅ *STOP DE LUCRO ATIVADO #${symbol.split('/')[0]} ${direction}*

🔍 *Preço retornou ao ${monitor.mobileStopLevel || 'ponto de proteção'}*
💰 *Lucro realizado:* +${leveragedTotalPnL.toFixed(1)}% (${this.getRealizationBreakdown(monitor.targetsHit)})
📈 *Alvos atingidos:* ${monitor.targetsHit}/6
📊 *Entrada:* ${this.formatPrice(monitor.entry).replace('.', '․')}
💵 *Preço atual:* ${this.formatPrice(currentPrice).replace('.', '․')}
⏱️ *Duração:* ${duration}

🎉 *EXCELENTE RESULTADO!*
• Operação finalizada sem perdas
• Stop de lucro protegeu os ganhos
• Gestão de risco funcionou perfeitamente
• Parabéns pela disciplina!

👑 *Sinais Lobo Premium*`;

      await this._sendMessageSafe(message);
      console.log(`🛡️ Stop de lucro enviado: ${symbol}`);

      if (app.performanceTracker) {
        const realizedPnL = this.calculateTotalRealizedPnL(monitor, monitor.targetsHit);
        app.performanceTracker.updateSignalResult(
          symbol,
          monitor.targetsHit,
          realizedPnL,
          'STOP_MOBILE',
          realizedPnL
        );
      }

      if (app.adaptiveScoring) {
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, true, totalRealizedPnL);
      }

      this.removeMonitor(symbol, 'STOP_MOBILE');
      if (app.binanceService?.stopWebSocketForSymbol) {
        app.binanceService.stopWebSocketForSymbol(symbol, '1m');
      }
    } catch (error) {
      console.error(`❌ Erro ao tratar stop móvel ${symbol}:`, error.message);
    }
  }

  calculateDuration(startTime) {
    const now = new Date();
    const diff = now - startTime;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days} dias ${hours}h ${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  getStopStatus(targetNumber) {
    switch (targetNumber) {
      case 1:
        return 'Mantenha o Stop Original';
      case 2:
        return 'movido para entrada';
      case 3:
        return 'movido para alvo 1';
      case 4:
        return 'movido para alvo 2';
      case 5:
        return 'movido para alvo 3';
      case 6:
        return 'operação finalizada';
      default:
        return 'stop móvel ativo';
    }
  }

  getTargetRecommendation(targetNumber) {
    switch (targetNumber) {
      case 1:
        return 'Realize 50% de Lucro Parcial da posição';
      case 2:
        return 'Realize 15% da posição e mova o stop para o ponto de entrada';
      case 3:
        return 'Realize 10% da posição e mova o stop para o alvo 1';
      case 4:
        return 'Realize 10% da posição e mova o stop para o alvo 2';
      case 5:
        return 'Realize 10% da posição e mova o stop para o alvo 3';
      case 6:
        return 'PARABÉNS! Todos os alvos atingidos!';
      default:
        return 'Continue seguindo a estratégia';
    }
  }

  calculateTotalRealizedPnL(monitor, targetsHit) {
    if (targetsHit === 0) return 0;

    const isLong = monitor.trend === 'BULLISH';
    let totalPnL = 0;

    const realizationPercentages = [50, 15, 10, 10, 10, 5];

    for (let i = 0; i < targetsHit; i++) {
      const targetPrice = monitor.originalTargets[i];
      const realizationPercent = realizationPercentages[i];

      const targetPnL = isLong
        ? ((targetPrice - monitor.entry) / monitor.entry) * 100
        : ((monitor.entry - targetPrice) / monitor.entry) * 100;

      totalPnL += (targetPnL * realizationPercent) / 100;
    }

    return totalPnL;
  }

  getRealizationBreakdown(targetsHit) {
    const realizationPercentages = [50, 15, 10, 10, 10, 5];
    const breakdown = [];
    for (let i = 0; i < targetsHit; i++) {
      breakdown.push(`${realizationPercentages[i]}% no Alvo ${i + 1}`);
    }
    return breakdown.join(' + ');
  }
}

export default TelegramBotService;
