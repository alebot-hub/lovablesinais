/**
 * Serviço do Bot do Telegram
 * (Mantida sua estrutura original; adicionado monitor com fallback por polling)
 * Correções/Travas:
 *  - Branding: LOBO SCALPING + rodapé "Sinais Lobo Scalping"
 *  - Destaque: SCALPING (operação rápida) no corpo da emissão
 *  - Níveis FIXOS (SCALPING):
 *      • 6 alvos em +0.80% (ou -0.80% p/ short)
 *      • STOP em 1.30%
 *  - Pré-check de preço (anti-late-entry / anti-chase):
 *      • Bloqueia se faltarem ≤0.16% para o TP1 (≥80% do caminho já percorrido)
 *      • Bloqueia se preço já passou o TP1
 *      • Bloqueia se desvio adverso ≥0.30% da entrada
 *  - Mesmo que o pipeline envie outros níveis, normalizamos na emissão e no monitor
 *  - Persiste níveis normalizados e força o monitor a respeitar esses números
 *  - Mantém "stopLossOriginal" para exibir exatamente o preço publicado no resultado
 *  - Adiciona hash de níveis para auditoria
 *  - Mensagens coerentes e mais informativas (interpretação/sentimento/fatores)
 *  - Gate de confiança do BTC (força mínima + timeframe coerente), ajustável por .env
 *  - Guarda de emissão contra-tendência
 *
 * Robustez de envio:
 *  - Timeout configurável, fila, fallback HTML→MarkdownV2→texto puro e circuit breaker
 */

import TelegramBot from 'node-telegram-bot-api';
import crypto from 'crypto';
import { Logger } from './logger.js';

const logger = new Logger('TelegramBot');

// Helpers p/ envs (robustos)
const envBool = (key, def = '') => {
  const v = (process.env[key] ?? def).toString().trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'no' || v === 'off' || v === '');
};
const envNum = (key, def) => Number((process.env[key] ?? def).toString().trim());

// 🔧 Env de envio
const SEND_TIMEOUT_MS = envNum('TELEGRAM_SEND_TIMEOUT_MS', 8000);
const MAX_CONSECUTIVE_SEND_FAILS = envNum('TELEGRAM_MAX_FAILS', 3);

// 🔒 Parâmetros FIXOS de níveis (SCALPING)
const LEVELS = {
  TARGET_STEP: 0.008, // 0.80% por alvo
  NUM_TARGETS: 6,
  STOP_PCT: 0.013, // 1.30%
  EPS: 1e-10,
};

// ⚙️ Guarda de emissão (env)
const EMIT_GUARD = {
  ENABLED: envBool('COUNTERTREND_GUARD_ENABLED', 'true'),
  MIN_DISPLAY_PROB: envNum('COUNTERTREND_MIN_DISPLAY_PROB', 75), // %
  STRONG_STRENGTH: envNum('COUNTERTREND_STRONG_STRENGTH', 67), // 0..100
  MIN_MACD_ABS_FOR_REVERSAL: envNum('COUNTERTREND_MIN_MACD_ABS', 0.0015),
};

// ✅ Gate de confiança p/ falar de “tendência do BTC”
const BTC_TREND_GUARD = {
  MIN_STRENGTH: envNum('BTC_TREND_MIN_STRENGTH', 70),
  ENFORCE_TF_MATCH: envBool('BTC_TREND_ENFORCE_TF', 'true'),
  REQUIRE_EXPLICIT_ALIGNMENT: envBool('BTC_ALIGNMENT_REQUIRE_EXPLICIT', 'true'),
  SHOW_UNCERTAIN_BTC_FACTOR: envBool('SHOW_UNCERTAIN_BTC_FACTOR', 'false'),
};

// 🔎 Pré-check (limiares)
const PRECHECK = {
  TP1_PROXIMITY_OK_REMAINING: 0.002, // 0.20% restante até o TP1
  TP1_STEP: LEVELS.TARGET_STEP,      // 0.80%
  ADV_SLIPPAGE_MAX: 0.003,           // 0.30% adverso máx.
};

// ⚖️ Exibição da linha de risco
const RISK = {
  SHOW_ALWAYS: envBool('RISK_SHOW_ALWAYS', 'false'), // se true, sempre mostra; se false, oculta quando BAIXO
};

class TelegramBotService {
  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.isEnabled = !!(this.token && this.chatId);
    this.activeMonitors = new Map();

    // 🔒 Fonte-de-verdade dos níveis publicados
    this.lastSignalById = new Map();
    this.lastSignalBySymbol = new Map();

    // Robustez de envio
    this.failCount = 0;
    this.circuitOpen = false;
    this.queue = Promise.resolve();

    if (this.isEnabled) {
      this.bot = new TelegramBot(this.token, { polling: false, request: { timeout: SEND_TIMEOUT_MS } });
      console.log('✅ Telegram Bot inicializado (com timeout/fila)');
      console.log(
        `[BTC GUARD] MIN_STRENGTH=${BTC_TREND_GUARD.MIN_STRENGTH} TF_MATCH=${BTC_TREND_GUARD.ENFORCE_TF_MATCH} REQUIRE_EXPLICIT=${BTC_TREND_GUARD.REQUIRE_EXPLICIT_ALIGNMENT} SHOW_UNCERTAIN=${BTC_TREND_GUARD.SHOW_UNCERTAIN_BTC_FACTOR}`
      );
    } else {
      console.log('⚠️ Telegram Bot em modo simulado (variáveis não configuradas)');
    }
  }

  // =============== ENVIO ROBUSTO ===============
  _delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  _withTimeout(p, ms = SEND_TIMEOUT_MS) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('TELEGRAM_SEND_TIMEOUT')), ms))]);
  }
  _enqueue(taskFn) {
    this.queue = this.queue.then(() => taskFn()).catch((e) => console.error('❌ Fila Telegram:', e?.message || e));
    return this.queue;
  }
  _resetCircuit() {
    if (this.circuitOpen) console.log('🔁 Circuito Telegram reaberto.');
    this.failCount = 0;
    this.circuitOpen = false;
  }
  _tripCircuit(err) {
    this.failCount += 1;
    console.error(`🚨 Falha Telegram (${this.failCount}/${MAX_CONSECUTIVE_SEND_FAILS}):`, err?.message || err);
    if (this.failCount >= MAX_CONSECUTIVE_SEND_FAILS) {
      this.circuitOpen = true;
      console.error('⛔ Circuito aberto: envio pausado; mensagens apenas logadas até um sucesso futuro.');
    }
  }

  // Escapes
  _stripAllMarkdown(t) {
    return !t ? t : String(t).replace(/[\\_*[\]()~`>#+\-=|{}!]/g, '');
  }
  _escapeMarkdownV2(t) {
    return !t ? t : String(t).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
  _escapeHtml(t) {
    if (t == null) return '';
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  _stripHtml(t) {
    return !t ? t : String(t).replace(/<[^>]*>/g, '');
  }

  async _sendRawHtml(t) {
    return this._withTimeout(
      this.bot.sendMessage(this.chatId, t, { parse_mode: 'HTML', disable_web_page_preview: true })
    );
  }
  async _sendRawMarkdownV2(t) {
    return this._withTimeout(
      this.bot.sendMessage(this.chatId, this._escapeMarkdownV2(t), {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      })
    );
  }
  async _sendRawPlain(t) {
    return this._withTimeout(
      this.bot.sendMessage(this.chatId, this._stripAllMarkdown(this._stripHtml(t)), { disable_web_page_preview: true })
    );
  }

  async _sendMessageSafe(text) {
    if (!this.isEnabled || this.circuitOpen) {
      console.log('📱 [SIMULADO] Sinal enviado (safe):', (text || '').slice(0, 160) + '...');
      return true;
    }
    return this._enqueue(async () => {
      try {
        // 1) Tenta HTML (principal)
        try {
          await this._sendRawHtml(text);
          this._resetCircuit();
          return true;
        } catch (errHtml) {
          const m = String(errHtml?.message || '');
          if (m.includes('429')) await this._delay(350);
          // segue para fallback
        }
        // 2) Fallback MarkdownV2
        try {
          await this._sendRawMarkdownV2(text);
          this._resetCircuit();
          return true;
        } catch (err2) {
          const m = String(err2?.message || '');
          if (m.includes('429')) await this._delay(450);
        }
        // 3) Fallback texto puro
        await this._sendRawPlain(text);
        this._resetCircuit();
        return true;
      } catch (err) {
        this._tripCircuit(err);
        console.log('📱 [SIMULADO] Fallback: considerado enviado.');
        return false;
      }
    });
  }

  // ====== HORÁRIO SÃO PAULO ======
  formatNowSP() {
    try {
      return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    } catch {
      return new Date().toLocaleString('pt-BR');
    }
  }

  // =================== NÍVEIS (SCALPING) ===================
  _expectedLevels(entry, isLong) {
    const e = Number(entry);
    if (!isFinite(e) || e <= 0) return { targets: [], stopLoss: null };
    const steps = Array.from({ length: LEVELS.NUM_TARGETS }, (_, i) => LEVELS.TARGET_STEP * (i + 1));
    const targets = steps.map((p) => (isLong ? e * (1 + p) : e * (1 - p)));
    const stopLoss = isLong ? e * (1 - LEVELS.STOP_PCT) : e * (1 + LEVELS.STOP_PCT);
    return { targets, stopLoss };
  }
  _levelsHash(entry, targets, stopLoss) {
    const payload = JSON.stringify({
      e: Number(entry),
      t: Array.isArray(targets) ? targets.map(Number) : [],
      s: Number(stopLoss),
    });
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
  }
  _almostEqual(a, b, eps = LEVELS.EPS) {
    if (!isFinite(a) || !isFinite(b)) return false;
    return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
  }
  _arraysEqualWithin(a = [], b = [], eps = LEVELS.EPS) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!this._almostEqual(Number(a[i]), Number(b[i]), eps)) return false;
    }
    return true;
  }

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
      console.log('🔒 Normalizando níveis para 0.80% (TP) & 1.30% (SL) — SCALPING.');
      return { targets: expTargets, stopLoss: expStop, normalized: true };
    }
    return { targets: maybeTargets.map(Number), stopLoss: Number(maybeStop), normalized: false };
  }

  // =================== AUXILIARES BTC ===================
  _tfLabel(signal) {
    return signal?.timeframe || '1h';
  }
  _baseSymbol(symbol) {
    return String(symbol || '').split('/')[0].replace('#', '').toUpperCase();
  }
  _strengthLabel(v) {
    if (!isFinite(v)) return null;
    if (v <= 33) return 'fraca';
    if (v <= 66) return 'moderada';
    return 'forte';
  }

  _logBtcDecision(sym, info) {
    const { confident, reason, btcTrend, strength, timeframe } = info || {};
    if (confident) {
      console.log(`₿[${sym}] BTC alignment CONFIRMADO (trend=${btcTrend}, strength=${strength}, tf=${timeframe})`);
    } else {
      console.log(
        `₿[${sym}] BTC alignment INDEFINIDO (motivo=${reason || 'unknown'}, strength=${strength ?? 'n/a'}, tf=${timeframe})`
      );
    }
  }

  _resolveBtcAlignment(signal, isLong) {
    const corr = signal?.btcCorrelation || {};
    
    const trendRaw = String(corr.btcTrend || '').toUpperCase();
    const rawAlignment = String(corr.alignment || '').toUpperCase();
    const tfSignal = this._tfLabel(signal);
    const tfCorr = corr.timeframe || null;

    const strengthRaw = Number(corr.btcStrength);
    const strength = isFinite(strengthRaw) ? Math.max(0, Math.min(100, strengthRaw)) : null;
    const strengthText = strength == null ? null : this._strengthLabel(strength);

    const tfMatch = !BTC_TREND_GUARD.ENFORCE_TF_MATCH || !tfCorr || tfCorr === tfSignal;
    const strongEnough = strength != null && strength >= BTC_TREND_GUARD.MIN_STRENGTH;

    let alignment = 'UNKNOWN';
    let btcTrend = trendRaw === 'BULLISH' || trendRaw === 'BEARISH' ? trendRaw : 'UNKNOWN';
    let confident = false;
    let reason = null;

    if ((rawAlignment === 'ALIGNED' || rawAlignment === 'AGAINST') && tfMatch && strongEnough) {
      alignment = rawAlignment;
      confident = true;
    } else if (
      !BTC_TREND_GUARD.REQUIRE_EXPLICIT_ALIGNMENT &&
      (trendRaw === 'BULLISH' || trendRaw === 'BEARISH') &&
      tfMatch &&
      strongEnough
    ) {
      alignment = trendRaw === 'BULLISH' ? (isLong ? 'ALIGNED' : 'AGAINST') : isLong ? 'AGAINST' : 'ALIGNED';
      confident = true;
    } else {
      reason = !tfMatch ? 'TF_MISMATCH' : !strongEnough ? 'LOW_STRENGTH' : 'NO_EXPLICIT_ALIGNMENT';
      btcTrend = 'UNKNOWN';
    }

    if (tfCorr && tfCorr !== tfSignal) {
      console.log(
        `⚠️ btcCorrelation.timeframe=${tfCorr} difere do sinal=${tfSignal} — alinhamento ${confident ? 'aceito' : 'descartado'} (${reason || 'ok'}).`
      );
    }

    const res = { alignment, btcTrend, strength, strengthText, timeframe: tfSignal, confident, reason };
    this._logBtcDecision(signal?.symbol || 'N/A', res);
    return res;
  }

  // =================== GUARDA DE EMISSÃO ===================
  _shouldEmitSignal(signal, entry, targets, stopLoss) {
    if (!isFinite(entry) || !isFinite(stopLoss) || !Array.isArray(targets) || targets.length !== LEVELS.NUM_TARGETS) {
      return { ok: false, reason: 'LEVELS_INVALID' };
    }
    const isLong = signal.trend === 'BULLISH';
    const displayProb = this.calculateDisplayProbability(signal.probability ?? signal.totalScore ?? 0);

    const btc = this._resolveBtcAlignment(signal, isLong);
    const isAgainst = btc.confident && btc.alignment === 'AGAINST';

    if (!EMIT_GUARD.ENABLED || !isAgainst) return { ok: true };

    const indicators = signal.indicators || {};
    const rsi = indicators.rsi;
    const macdAbs = indicators.macd && isFinite(indicators.macd.histogram) ? Math.abs(indicators.macd.histogram) : 0;

    const reversalType = String(signal?.details?.counterTrendAdjustments?.reversalType || 'MODERATE').toUpperCase();
    const hasStrongReversal = reversalType === 'STRONG' || reversalType === 'EXTREME';

    const rsiExtremeOk = (isLong && isFinite(rsi) && rsi < 25) || (!isLong && isFinite(rsi) && rsi > 75);
    const macdOk = macdAbs >= EMIT_GUARD.MIN_MACD_ABS_FOR_REVERSAL;
    const probOk = displayProb >= EMIT_GUARD.MIN_DISPLAY_PROB;

    if ((btc.strength ?? 0) >= EMIT_GUARD.STRONG_STRENGTH && !hasStrongReversal) {
      if (!(probOk && (rsiExtremeOk || macdOk))) return { ok: false, reason: 'COUNTERTREND_GUARD_STRONG_BTC' };
    }
    if (!(probOk || rsiExtremeOk || macdOk || hasStrongReversal)) {
      return { ok: false, reason: 'COUNTERTREND_GUARD_WEAK_CRITERIA' };
    }
    return { ok: true };
  }

  // ---------- PRÉ-CHECK DE PREÇO ----------
  async _preEmissionPriceCheck(symbol, isLong, entry, targets, providedPrice, priceProvider) {
    try {
      let live = Number(providedPrice);
      if (!isFinite(live) && typeof priceProvider === 'function') {
        try {
          live = Number(await priceProvider());
        } catch (_) {}
      }
      if (!isFinite(live)) {
        console.warn(`[PreCheck] Sem preço ao vivo para ${symbol}. Pré-check pulado.`);
        return { ok: true, reason: 'NO_LIVE_PRICE' };
      }

      const tp1 = Number(targets?.[0]);
      if (!isFinite(tp1)) return { ok: true, reason: 'NO_TP1' };

      const step = PRECHECK.TP1_STEP; // 0.008
      const advMax = PRECHECK.ADV_SLIPPAGE_MAX; // 0.003

      const alreadyBeyondTp1 = isLong ? live >= tp1 : live <= tp1;
      if (alreadyBeyondTp1) {
        return { ok: false, reason: 'TP1_ALREADY_HIT', details: { live, tp1 } };
      }

      // progresso (entry→TP1)
      const totalStep = step * entry;
      const progressed = isLong ? (live - entry) / totalStep : (entry - live) / totalStep;

      if (progressed >= 0.8) {
        return { ok: false, reason: 'TOO_CLOSE_TO_TP1', details: { live, tp1, progressed } };
      }

      // Desvio adverso
      const adverse = isLong ? (entry - live) / entry : (live - entry) / entry;
      if (adverse >= advMax) {
        return { ok: false, reason: 'ADVERSE_SLIPPAGE', details: { live, entry, adverse } };
      }

      return { ok: true, reason: 'PASS', details: { live, tp1, progressed, adverse } };
    } catch (e) {
      console.warn('[PreCheck] Erro inesperado:', e.message);
      return { ok: true, reason: 'ERROR_SKIP' };
    }
  }

  // =================== EMISSÃO DO SINAL ===================
  async sendTradingSignal(signalData) {
    try {
      if (!this.isEnabled) {
        console.log('📱 [SIMULADO] Sinal enviado:', signalData.symbol);
        return true;
      }

      const isLong = signalData.trend === 'BULLISH';
      const entry = Number(signalData.entry);

      const normalization = this._enforceFixedLevels(entry, isLong, signalData.targets, signalData.stopLoss);
      const targets = normalization.targets;
      const stopLoss = normalization.stopLoss;

      if (normalization.normalized) console.log('🧮 Níveis ajustados na emissão para o padrão SCALPING.');

      // 🔎 Pré-check de preço (se possível)
      const pre = await this._preEmissionPriceCheck(
        signalData.symbol,
        isLong,
        entry,
        targets,
        signalData.livePrice,
        signalData.priceProvider
      );
      if (!pre.ok) {
        console.log(`🚫 Sinal NÃO emitido (${signalData.symbol}) — PreCheck: ${pre.reason}`, pre.details || '');
        return false;
      }

      // Guarda contra-tendência
      const guard = this._shouldEmitSignal(signalData, entry, targets, stopLoss);
      if (!guard.ok) {
        console.log(`🚫 Sinal NÃO emitido (${signalData.symbol}) — motivo: ${guard.reason}`);
        return false;
      }

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

      const message = this.formatTradingSignal({ ...signalData, entry, targets, stopLoss });
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

  _renderSentimentBlock(signal) {
    const s = signal?.sentiment || {};
    const regime = signal?.marketRegime || {};
    const parts = [];

    if (s?.overall) {
      const label = this._escapeHtml(String(s.overall).toUpperCase());
      const fgi = isFinite(s.fearGreedIndex) ? ` (F&amp;G: ${s.fearGreedIndex})` : '';
      parts.push(`📣 <b>Sentimento de Mercado:</b> ${label}${fgi}`);
    }
    if (regime?.label) {
      const lbl = this._escapeHtml(regime.label);
      const vol = isFinite(regime.volatility) ? ` — vol: ${regime.volatility}` : '';
      parts.push(`🌊 <b>Regime Atual:</b> ${lbl}${vol}`);
    }
    if (parts.length === 0) return '';
    return parts.join('\n') + '\n';
  }

  // ---------- NOVO: Avaliação de Risco (BAIXO/MODERADO/ALTO) ----------
  assessRisk(signal, isLong, btc) {
    // Contra-tendência: ALTO, mas suaviza por reversão forte/extrema
    if (btc?.confident && btc.alignment === 'AGAINST') {
      const reversalType = String(signal?.details?.counterTrendAdjustments?.reversalType || 'MODERATE').toUpperCase();
      if (reversalType === 'EXTREME') return { level: 'CONTROLADO', reason: 'Reversão extrema contra o BTC' };
      if (reversalType === 'STRONG') return { level: 'MODERADO', reason: 'Forte reversão contra o BTC' };
      const side = btc.btcTrend === 'BULLISH' ? 'alta' : 'baixa';
      return { level: 'ALTO', reason: `Contra a tendência do BTC (${side})` };
    }

    // Alinhado com BTC: BAIXO
    if (btc?.confident && btc.alignment === 'ALIGNED') {
      const side = btc.btcTrend === 'BULLISH' ? 'alta' : 'baixa';
      return { level: 'BAIXO', reason: `Alinhado com a tendência do BTC (${side})` };
    }

    // BTC indefinido ⇒ olhar momentum
    const h = Number(signal?.indicators?.macd?.histogram);
    if (isFinite(h) && Math.abs(h) >= EMIT_GUARD.MIN_MACD_ABS_FOR_REVERSAL) {
      return { level: 'MODERADO', reason: 'Momentum forte com BTC indefinido' };
    }

    // RSI extremos também ajudam a reduzir incerteza
    const rsi = Number(signal?.indicators?.rsi);
    if (isLong && isFinite(rsi) && rsi < 25) {
      return { level: 'MODERADO', reason: 'RSI em sobrevenda com BTC indefinido' };
    }
    if (!isLong && isFinite(rsi) && rsi > 75) {
      return { level: 'MODERADO', reason: 'RSI em sobrecompra com BTC indefinido' };
    }

    return { level: 'MODERADO', reason: 'BTC indefinido e momentum moderado' };
  }

  // (REMOVIDO) getRiskTag antigo — substituído por assessRisk + linha no cabeçalho

  formatTradingSignal(signal) {
    const isLong = signal.trend === 'BULLISH';
    const direction = isLong ? 'COMPRA' : 'VENDA';
    const emoji = isLong ? '🟢' : '🔴';
    const animal = isLong ? '🐂' : '🐻';
    const base = this._escapeHtml(signal.symbol.split('/')[0]);

    const displayProbability = this.calculateDisplayProbability(signal.probability ?? signal.totalScore ?? 0);

    const btc = this._resolveBtcAlignment(signal, isLong);
    const isCounterTrend = btc.confident && btc.alignment === 'AGAINST';

    const factors = this.generateSpecificFactors(signal, isLong, btc);
    const factorsText = factors.map((f) => `   • ${this._escapeHtml(f)}`).join('\n');

    const targets = (signal.targets || [])
      .map((target, index) => {
        const targetNum = index + 1;
        const tEmoji = targetNum === 6 ? '🌕' : `${targetNum}️⃣`;
        const label = targetNum === 6 ? (isLong ? 'Alvo 6 - Lua!' : 'Alvo 6 - Queda Infinita!') : `Alvo ${targetNum}`;
        return `${tEmoji} <b>${this._escapeHtml(label)}:</b> ${this._escapeHtml(this.formatPrice(target))}`;
      })
      .join('\n');

    const counterTrendWarning = isCounterTrend ? `\n${this.getCounterTrendWarning(signal, isLong, btc)}\n` : '';
    const sentimentBlock = this._renderSentimentBlock(signal);

    // NOVO: calcular risco e injetar no cabeçalho
    const riskInfo = this.assessRisk(signal, isLong, btc);
    const showRisk =
      RISK.SHOW_ALWAYS ||
      (riskInfo && String(riskInfo.level || '').toUpperCase() !== 'BAIXO');
    const riskLine = showRisk
      ? `\n⚖️ <b>Risco:</b> ${this._escapeHtml(riskInfo.level)} — ${this._escapeHtml(riskInfo.reason)}`
      : '';

    // Espaçador garantido abaixo do Stop
    const spacerAfterStop = '\n';

    return `🚨 <b>LOBO SCALPING #${base} ${emoji} ${direction} ${animal}</b>${isCounterTrend ? ' ⚡️' : ''}

⚡️ <b>SCALPING — operação rápida (1m/5m).</b> Execução ágil e <b>gestão de risco obrigatória</b>.

${sentimentBlock}💰 <b>#${base} Futures</b>
📊 <b>Tempo gráfico:</b> ${this._escapeHtml(signal.timeframe || '1h')}
📈 <b>Alavancagem sugerida:</b> 15x
🎯 <b>Probabilidade:</b> ${this._escapeHtml(displayProbability.toFixed(1))}%${riskLine}

💡 <b>Interpretação:</b> ${this._escapeHtml(this.getInterpretation(signal, isLong, btc))}
🔍 <b>Fatores-chave:</b>
${factorsText}

⚡️ <b>Entrada:</b> ${this._escapeHtml(this.formatPrice(signal.entry))}

🎯 <b>ALVOS (15x):</b>
${targets}

🛑 <b>Stop Loss:</b> ${this._escapeHtml(this.formatPrice(signal.stopLoss))}
${spacerAfterStop}${counterTrendWarning}👑 <b>Sinais Lobo Scalping</b>
⏰ ${this._escapeHtml(this.formatNowSP())}`;
  }

  getCounterTrendWarning(signal, isLong, btc) {
    const tf = btc.timeframe || this._tfLabel(signal);
    const base = this._baseSymbol(signal.symbol);
    const btcTrendWord = btc.btcTrend === 'BULLISH' ? 'alta' : 'baixa';
    const operationType = isLong ? 'COMPRA' : 'VENDA';
    const strengthLine = btc.strength != null ? `${btc.strengthText || 'indefinida'} (${btc.strength}/100)` : 'indefinida';

    const reversalType = signal?.details?.counterTrendAdjustments?.reversalType || 'MODERATE';

    let icon = '⚠️',
      risk = 'ELEVADO',
      recommendation = 'Sinal contra-tendência — use gestão de risco rigorosa';
    if (reversalType === 'STRONG') {
      icon = '💪';
      risk = 'MODERADO';
      recommendation = 'Forte sinal de reversão — boa oportunidade';
    } else if (reversalType === 'EXTREME') {
      icon = '🔥';
      risk = 'CONTROLADO';
      recommendation = 'Reversão extrema detectada — sinal de alta qualidade';
    }

    const header = !btc.confident
      ? base === 'BTC'
        ? `₿ <b>Tendência:</b> indefinida neste tempo gráfico (${this._escapeHtml(tf)}) (força: ${this._escapeHtml(
            strengthLine
          )})\n🎯 <b>Operação:</b> ${operationType} com Bitcoin indefinido`
        : `₿ <b>Bitcoin:</b> Tendência <b>indefinida</b> neste tempo gráfico (${this._escapeHtml(
            tf
          )}) (força: ${this._escapeHtml(strengthLine)})\n🎯 <b>Operação:</b> ${operationType} com Bitcoin indefinido`
      : base === 'BTC'
      ? `₿ <b>Tendência:</b> ${this._escapeHtml(btcTrendWord)} neste tempo gráfico (${this._escapeHtml(
          tf
        )}) (força: ${this._escapeHtml(strengthLine)})\n🎯 <b>Operação:</b> ${operationType} contra a tendência ${
          base === 'BTC' ? 'neste tempo gráfico' : 'do BTC'
        }`
      : `₿ <b>Bitcoin:</b> Tendência de <b>${this._escapeHtml(btcTrendWord)}</b> neste tempo gráfico (${this._escapeHtml(
          tf
        )})\n🎯 <b>Operação:</b> ${operationType} contra a tendência do BTC`;

    return `${icon} <b>SINAL CONTRA-TENDÊNCIA</b>
${header}
⚖️ <b>Risco:</b> ${risk}
💡 <b>Estratégia:</b> ${this._escapeHtml(recommendation)}

🛡️ <b>GESTÃO DE RISCO REFORÇADA:</b>
• Monitore de perto os primeiros alvos
• Realize lucros parciais rapidamente
• Mantenha stop loss rigoroso
• Considere reduzir alavancagem se necessário`;
  }

  // ---------------- FATORES-CHAVE ----------------
  generateSpecificFactors(signal, isLong, btcResolved) {
    const factors = [];
    const indicators = signal.indicators || {};
    const patterns = signal.patterns || {};
    const btc = btcResolved || this._resolveBtcAlignment(signal, isLong);
    const base = this._baseSymbol(signal.symbol);

    const rsi = indicators.rsi;
    const macd = indicators.macd;
    const volume = indicators.volume;
    const ma21 = indicators.ma21;
    const ma200 = indicators.ma200;

    if (macd && macd.histogram !== undefined) {
      if (isLong && macd.histogram > 0) {
        factors.push('MACD com momentum bullish confirmado');
      } else if (!isLong && macd.histogram < 0) {
        factors.push('MACD com momentum bearish confirmado');
      }
    }

    if (rsi !== undefined) {
      if (isLong) {
        if (rsi < 25) factors.push('RSI em sobrevenda extrema (reversão propícia)');
        else if (rsi < 40) factors.push('RSI em zona de compra');
      } else {
        if (rsi > 75) factors.push('RSI em sobrecompra extrema (reversão propícia)');
        else if (rsi > 60) factors.push('RSI em zona de venda');
      }
    }

    if (patterns.breakout) {
      if (isLong && patterns.breakout.type === 'BULLISH_BREAKOUT')
        factors.push('Rompimento de resistência confirmado');
      else if (!isLong && patterns.breakout.type === 'BEARISH_BREAKOUT')
        factors.push('Rompimento de suporte confirmado');
    }

    if (Array.isArray(patterns.candlestick) && patterns.candlestick.length > 0) {
      const p = patterns.candlestick[0];
      const bias = String(p.bias || '').toUpperCase();
      const aligned = (isLong && bias === 'BULLISH') || (!isLong && bias === 'BEARISH');
      if (aligned)
        factors.push(`Padrão ${String(p.type || '').toLowerCase()} alinhado (${bias === 'BULLISH' ? 'bullish' : 'bearish'})`);
    }

    if (volume && volume.volumeRatio !== undefined) {
      if (volume.volumeRatio > 1.2)
        factors.push(isLong ? 'Volume forte confirmando compras' : 'Volume forte confirmando vendas');
      else factors.push('Volume moderado sustentando o movimento');
    }

    if (btc.confident) {
      if (btc.alignment === 'ALIGNED') {
        const word = btc.btcTrend === 'BULLISH' ? 'bullish' : 'bearish';
        factors.push(`Alinhado com tendência ${word} do Bitcoin no ${this._tfLabel(signal)}`);
      } else if (btc.alignment === 'AGAINST') {
        factors.push(
          base === 'BTC'
            ? 'Operação contra tendência neste tempo gráfico (risco elevado)'
            : 'Operação contra tendência do Bitcoin (risco elevado)'
        );
      }
    } else if (BTC_TREND_GUARD.SHOW_UNCERTAIN_BTC_FACTOR) {
      factors.push('Tendência do Bitcoin indefinida no mesmo timeframe');
    }

    if (ma21 && ma200) {
      if (isLong && ma21 > ma200) factors.push('Médias móveis em configuração bullish (curto acima do longo)');
      else if (!isLong && ma21 < ma200) factors.push('Médias móveis em configuração bearish (curto abaixo do longo)');
    }

    const unique = [...new Set(factors)];
    return unique.slice(0, 4);
  }

  // ---------------- INTERPRETAÇÃO ----------------
  getInterpretation(signal, isLong, btcResolved) {
    const indicators = signal.indicators || {};
    const btc = btcResolved || this._resolveBtcAlignment(signal, isLong);

    if (indicators.rsi !== undefined) {
      if (isLong && indicators.rsi < 25) return 'RSI em sobrevenda extrema favorece pullback de compra';
      if (!isLong && indicators.rsi > 75) return 'RSI em sobrecompra extrema favorece pullback de venda';
    }

    if (indicators.macd && Math.abs(indicators.macd.histogram) > 0.001) {
      return `MACD com forte momentum favorável para ${isLong ? 'compra' : 'venda'}`;
    }

    if (btc.confident && btc.alignment === 'ALIGNED') {
      return 'Sinal alinhado com a tendência do Bitcoin no mesmo timeframe';
    }

    return `Confluência favorável para ${isLong ? 'compra' : 'venda'} no curto prazo`;
  }

  // ---------- Probabilidade para exibição ----------
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

  // =================== MONITORES ===================
  createMonitor(symbol, entry, targets, stopLoss, signalId, trend) {
    try {
      if (this.activeMonitors.has(symbol)) {
        console.log(`⚠️ Monitor já existe para ${symbol} - substituindo`);
        this.removeMonitor(symbol, 'REPLACED');
      }
      const published = (signalId && this.lastSignalById.get(signalId)) || this.lastSignalBySymbol.get(symbol);

      const isLong = trend === 'BULLISH';
      let entryNum = Number(entry);
      let finalTargets = Array.isArray(targets) ? targets.map(Number) : [];
      let finalStop = Number(stopLoss);

      if (published) {
        entryNum = Number(published.entry);
        finalTargets = [...published.targets];
        finalStop = Number(published.stopLoss);
      }

      const { targets: normTargets, stopLoss: normStop } = this._enforceFixedLevels(
        entryNum,
        isLong,
        finalTargets,
        finalStop
      );

      const monitor = {
        symbol,
        entry: entryNum,
        targets: [...normTargets],
        originalTargets: [...normTargets],
        stopLoss: normStop,
        stopLossOriginal: normStop,
        signalId,
        trend,
        startTime: new Date(),
        targetsHit: 0,
        status: 'ACTIVE',
        lastUpdate: new Date(),
        levelsHash: this._levelsHash(entryNum, normTargets, normStop),
        timeframe: published?.timeframe || '1h',
      };

      this.activeMonitors.set(symbol, monitor);
      console.log(`✅ Monitor criado para ${symbol} (${normTargets.length} alvos) [hash=${monitor.levelsHash}]`);
      return monitor;
    } catch (e) {
      console.error(`❌ Erro ao criar monitor para ${symbol}:`, e.message);
      return null;
    }
  }

  removeMonitor(symbol, reason = 'COMPLETED') {
    if (this.activeMonitors.has(symbol)) {
      const m = this.activeMonitors.get(symbol);
      this.activeMonitors.delete(symbol);
      console.log(`🗑️ Monitor removido: ${symbol} (${reason})`);
      return m;
    }
    return null;
  }
  hasActiveMonitor(symbol) {
    return this.activeMonitors.has(symbol);
  }
  getActiveSymbols() {
    return Array.from(this.activeMonitors.keys());
  }

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

      const wsEnabled = envBool('BINANCE_WS_ENABLED', 'false');
      const hasWS =
        binanceService &&
        typeof binanceService.connectWebSocket === 'function' &&
        typeof binanceService.stopWebSocketForSymbol === 'function';

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

          const hitStopLoss =
            currentMonitor.trend === 'BULLISH'
              ? currentPrice <= currentMonitor.stopLoss
              : currentPrice >= currentMonitor.stopLoss;

          if (hitStopLoss) {
            if (currentMonitor.isMobileStopActive && currentMonitor.targetsHit > 0) {
              console.log(
                `🛡️ [${symbol}] STOP MÓVEL ATINGIDO! Preço: $${currentPrice}, Stop: $${currentMonitor.stopLoss}`
              );
              await this.handleStopMobile(symbol, currentPrice, currentMonitor, app);
            } else {
              console.log(
                `🛑 [${symbol}] STOP LOSS ATINGIDO! Preço: $${currentPrice}, Stop: $${currentMonitor.stopLoss}`
              );
              await this.handleStopLoss(symbol, currentPrice, currentMonitor, app);
            }
            return;
          }

          await this.checkTargets(symbol, currentPrice, currentMonitor, app);
        } catch (e) {
          console.error(`❌ Erro no monitoramento ${symbol}:`, e.message);
        }
      };

      let pollTimer = null;
      if (wsEnabled && hasWS) {
        await binanceService.connectWebSocket(symbol, '1m', (candleData) => {
          if (candleData?.isClosed) onTick(candleData);
        });
        console.log(`✅ WebSocket configurado para ${symbol} - monitoramento ativo`);
        return;
      }

      console.log('⚠️ WebSocket indisponível — ativando polling leve (6–10s)');
      const pollIntervalMs = envNum('MONITOR_POLL_INTERVAL_MS', 9000);

      const safeGetLastPrice = async () => {
        try {
          if (binanceService?.getLastPrice) return await binanceService.getLastPrice(symbol);
          if (binanceService?.fetchTickerPrice) return await binanceService.fetchTickerPrice(symbol);
          if (binanceService?.getPrice) return await binanceService.getPrice(symbol);
          if (binanceService?.getOHLCV) {
            const candles = await binanceService.getOHLCV(symbol, '1m', 1);
            const last = candles?.[0];
            return Array.isArray(last) ? Number(last[4]) : last?.close ?? null;
          }
          if (binanceService?.fetchOHLCV) {
            const candles = await binanceService.fetchOHLCV(symbol, '1m', 1);
            const last = candles?.[candles.length - 1];
            return Array.isArray(last) ? Number(last[4]) : last?.close ?? null;
          }
        } catch {}
        return null;
      };

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
      const targetHit =
        monitor.targets.length > 0 &&
        (isLong ? currentPrice >= monitor.targets[0] : currentPrice <= monitor.targets[0]);

      if (targetHit) {
        const targetNumber = monitor.originalTargets.length - monitor.targets.length + 1;
        const targetPrice = monitor.targets[0];

        monitor.targets.shift();
        monitor.targetsHit++;
        monitor.lastUpdate = new Date();

        const pnlPercent = isLong
          ? ((targetPrice - monitor.entry) / monitor.entry) * 100
          : ((monitor.entry - targetPrice) / monitor.entry) * 100;

        await this.sendTargetHitNotification(symbol, targetNumber, targetPrice, pnlPercent);

        if (app?.performanceTracker) app.performanceTracker.recordTrade(symbol, pnlPercent, true);

        if (monitor.targets.length === 0) {
          await this.handleAllTargetsHit(symbol, monitor, app);
        } else {
          await this.handleStopMovement(symbol, targetNumber, monitor);
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao verificar alvos ${symbol}:`, error.message);
    }
  }

  async handleStopMovement(symbol, targetNumber, monitor) {
    try {
      let newStopPrice = null,
        stopDescription = '';
      switch (targetNumber) {
        case 1:
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
        monitor.stopLoss = newStopPrice;
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
      if (!monitor) return;

      const isLong = monitor.trend === 'BULLISH';
      const direction = isLong ? 'COMPRA' : 'VENDA';
      const duration = this.calculateDuration(monitor.startTime);

      const totalRealizedPnL = this.calculateTotalRealizedPnL(monitor, monitor.targetsHit);
      const leveragedTotalPnL = totalRealizedPnL * 15;
      const realizationBreakdown = this.getRealizationBreakdown(monitor.targetsHit);

      const message = `🛡️ <b>STOP MÓVEL ATIVADO #${this._escapeHtml(symbol.split('/')[0])} ${direction}</b>

✅ <b>Stop loss movido para ${this._escapeHtml(stopDescription)}</b>
💰 <b>Lucro parcial realizado:</b> +${this._escapeHtml(leveragedTotalPnL.toFixed(1))}% (${this._escapeHtml(realizationBreakdown)})
📈 <b>Alvos atingidos:</b> ${monitor.targetsHit}/6
📊 <b>Entrada:</b> ${this._escapeHtml(this.formatPrice(monitor.entry))}
🛡️ <b>Novo stop:</b> ${this._escapeHtml(this.formatPrice(newStopPrice))}
⏱️ <b>Duração:</b> ${this._escapeHtml(duration)}

💡 <b>PROTEÇÃO ATIVADA (SCALPING):</b>
• Stop móvel protegendo lucros parciais
• Operação rápida — preservando ganhos
• Gestão de risco funcionando perfeitamente
• Continue seguindo a estratégia!

👑 <b>Sinais Lobo Scalping</b>`;

      await this._sendMessageSafe(message);
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

      if (app?.performanceTracker) {
        app.performanceTracker.recordTrade(symbol, pnlPercent, false);
        const realized = this.calculateTotalRealizedPnL(monitor, monitor.targetsHit);
        app.performanceTracker.updateSignalResult(symbol, monitor.targetsHit, pnlPercent, 'STOP_LOSS', realized);
      }
      if (app?.adaptiveScoring) {
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, false, pnlPercent);
      }

      await this.sendStopLossNotification(symbol, currentPrice, monitor, pnlPercent);

      this.removeMonitor(symbol, 'STOP_LOSS');
      if (app?.binanceService?.stopWebSocketForSymbol) app.binanceService.stopWebSocketForSymbol(symbol, '1m');
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

      if (app?.performanceTracker)
        app.performanceTracker.updateSignalResult(symbol, 6, totalPnlPercent, 'ALL_TARGETS', totalPnlPercent);
      if (app?.adaptiveScoring)
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, true, totalPnlPercent);

      await this.sendAllTargetsHitNotification(symbol, monitor, totalPnlPercent);

      this.removeMonitor(symbol, 'ALL_TARGETS');
      if (app?.binanceService?.stopWebSocketForSymbol) app.binanceService.stopWebSocketForSymbol(symbol, '1m');
    } catch (error) {
      console.error(`❌ Erro ao tratar todos alvos ${symbol}:`, error.message);
    }
  }

  async sendTargetHitNotification(symbol, targetNumber, targetPrice, pnlPercent) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) return;
      const isLong = monitor.trend === 'BULLISH';
      const direction = isLong ? 'COMPRA' : 'VENDA';
      const leveragedPnL = pnlPercent * 15;
      const timeElapsed = this.calculateDuration(monitor.startTime);

      const message = `✅ <b>ALVO ${this._escapeHtml(String(targetNumber))} ATINGIDO #${this._escapeHtml(
        symbol.split('/')[0]
      )} ${direction}</b>

🔍 <b>Alvo ${this._escapeHtml(String(targetNumber))} atingido no par #${this._escapeHtml(symbol.split('/')[0])}</b>
💰 <b>Lucro atual:</b> +${this._escapeHtml(leveragedPnL.toFixed(1))}% (Alv. 15×)
⚡️ <b>SCALPING:</b> operação rápida — realize parcial conforme plano
📊 <b>Entrada:</b> ${this._escapeHtml(this.formatPrice(monitor.entry))}
💵 <b>Preço do alvo:</b> ${this._escapeHtml(this.formatPrice(targetPrice))}
⏱️ <b>Tempo até o alvo:</b> ${this._escapeHtml(timeElapsed)}
🛡️ <b>Stop ativado:</b> ${this._escapeHtml(this.getStopStatus(targetNumber))}

💰 <b>Recomendação:</b> ${this._escapeHtml(this.getTargetRecommendation(targetNumber))}

👑 <b>Sinais Lobo Scalping</b>`;

      await this._sendMessageSafe(message);
    } catch (error) {
      console.error(`❌ Erro ao enviar notificação alvo:`, error.message);
    }
  }

  async sendStopLossNotification(symbol, currentPrice, monitor, pnlPercent) {
    try {
      const leveragedPnL = pnlPercent * 15;
      const duration = this.calculateDuration(monitor.startTime);
      const publishedStop = this.formatPrice(monitor.stopLossOriginal);

      let message;

      if (monitor.targetsHit === 0) {
        message = `❌ <b>#${this._escapeHtml(symbol.split('/')[0])} - OPERAÇÃO FINALIZADA</b> ❌

📊 <b>Resultado:</b> 🔴
⚡ <b>Alavancado (15x):</b> 🔴 ${this._escapeHtml(leveragedPnL.toFixed(1))}%

📌 <b>Motivo:</b> STOP LOSS ATIVADO

📈 <b>Alvos atingidos:</b> Nenhum
🛑 <b>Stop loss:</b> ${this._escapeHtml(publishedStop)}
📅 <b>Duração:</b> ${this._escapeHtml(duration)}

💡 <b>GERENCIAMENTO (SCALPING):</b>
- Stop loss ativado sem alvos atingidos
- Perda limitada conforme estratégia
- Execução rápida preservou capital
- Aguarde próxima oportunidade

👑 Sinais Lobo Scalping
⏰ ${this._escapeHtml(this.formatNowSP())}`;
      } else {
        message = `❌ <b>#${this._escapeHtml(symbol.split('/')[0])} - OPERAÇÃO FINALIZADA</b> ❌

📊 <b>Resultado:</b> 🔴
⚡ <b>Alavancado (15x):</b> 🔴 ${this._escapeHtml(leveragedPnL.toFixed(1))}%

📌 <b>Motivo:</b> STOP LOSS ATIVADO APÓS ALVO ${this._escapeHtml(String(monitor.targetsHit))}

📈 <b>Alvos atingidos:</b> ${this._escapeHtml(String(monitor.targetsHit))}
🛑 <b>Stop loss:</b> ${this._escapeHtml(publishedStop)}
📅 <b>Duração:</b> ${this._escapeHtml(duration)}

💡 <b>GERENCIAMENTO (SCALPING):</b>
- Stop ativado após realização parcial
- Perda reduzida na posição restante
- Estratégia de proteção funcionou

👑 Sinais Lobo Scalping
⏰ ${this._escapeHtml(this.formatNowSP())}`;
      }

      await this._sendMessageSafe(message);
    } catch (error) {
      console.error(`❌ Erro ao enviar notificação stop loss:`, error.message);
    }
  }

  async sendAllTargetsHitNotification(symbol, monitor, totalPnlPercent) {
    try {
      const leveragedPnL = totalPnlPercent * 15;
      const duration = this.calculateDuration(monitor.startTime);

      const message = `🌕 <b>#${this._escapeHtml(symbol.split('/')[0])} - OPERAÇÃO FINALIZADA</b> 🌕

📊 <b>Resultado:</b> 🟢 +${this._escapeHtml(totalPnlPercent.toFixed(1))}%
⚡ <b>Alavancado (15x):</b> 🟢 +${this._escapeHtml(leveragedPnL.toFixed(1))}%

📌 <b>Motivo:</b> TODOS OS ALVOS ATINGIDOS - LUA!

📈 <b>Alvos atingidos:</b> 6/6
👑 Aí é Loucura!!
📅 <b>Duração:</b> ${this._escapeHtml(duration)}

👑 <b>Sinais Lobo Scalping</b>
⏰ ${this._escapeHtml(this.formatNowSP())}`;

      await this._sendMessageSafe(message);
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

      const message = `✅ <b>STOP DE LUCRO ATIVADO #${this._escapeHtml(symbol.split('/')[0])} ${direction}</b>

🔍 <b>Preço retornou ao ${this._escapeHtml(monitor.mobileStopLevel || 'ponto de proteção')}</b>
💰 <b>Lucro realizado:</b> +${this._escapeHtml(leveragedTotalPnL.toFixed(1))}% (${this._escapeHtml(
        this.getRealizationBreakdown(monitor.targetsHit)
      )})
📈 <b>Alvos atingidos:</b> ${monitor.targetsHit}/6
📊 <b>Entrada:</b> ${this._escapeHtml(this.formatPrice(monitor.entry))}
💵 <b>Preço atual:</b> ${this._escapeHtml(this.formatPrice(currentPrice))}
⏱️ <b>Duração:</b> ${this._escapeHtml(duration)}

🎉 <b>SCALPING BEM-SUCEDIDO!</b>
• Operação finalizada sem perdas
• Stop de lucro protegeu os ganhos
• Gestão de risco funcionou perfeitamente

👑 <b>Sinais Lobo Scalping</b>`;

      await this._sendMessageSafe(message);

      if (app?.performanceTracker) {
        const realizedPnL = this.calculateTotalRealizedPnL(monitor, monitor.targetsHit);
        app.performanceTracker.updateSignalResult(symbol, monitor.targetsHit, realizedPnL, 'STOP_MOBILE', realizedPnL);
      }
      if (app?.adaptiveScoring) {
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, true, totalRealizedPnL);
      }

      this.removeMonitor(symbol, 'STOP_MOBILE');
      if (app?.binanceService?.stopWebSocketForSymbol) app.binanceService.stopWebSocketForSymbol(symbol, '1m');
    } catch (error) {
      console.error(`❌ Erro ao tratar stop móvel ${symbol}:`, error.message);
    }
  }

  // ============== Utilidades diversas ==============
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
    const realizationPercentages = [50, 15, 10, 10, 10, 5];
    let total = 0;
    for (let i = 0; i < targetsHit; i++) {
      const tp = monitor.originalTargets[i];
      const rp = realizationPercentages[i];
      const pnl = isLong ? ((tp - monitor.entry) / monitor.entry) * 100 : ((monitor.entry - tp) / monitor.entry) * 100;
      total += (pnl * rp) / 100;
    }
    return total;
  }

  getRealizationBreakdown(targetsHit) {
    const realizationPercentages = [50, 15, 10, 10, 10, 5];
    const arr = [];
    for (let i = 0; i < targetsHit; i++) {
      arr.push(`${realizationPercentages[i]}% no Alvo ${i + 1}`);
    }
    return arr.join(' + ');
  }
}

export default TelegramBotService;
