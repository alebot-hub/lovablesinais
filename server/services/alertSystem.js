/**
 * Sistema de alertas inteligentes
 * - Antispam com cooldown por tipo de alerta
 * - Envio seguro para Telegram com fallback de parse_mode
 * - Mantém estrutura simples e compatível com o app.js atual
 */

class AlertSystemService {
  constructor(telegramBot) {
    this.telegramBot = telegramBot;
    this.alertHistory = [];
    this.lastAlerts = new Map(); // type -> timestamp
  }

  /**
   * Verifica condições de mercado para alertas e envia somente
   * quando necessário (respeitando cooldown por prioridade).
   * marketData esperado (campos opcionais):
   * {
   *   overall: 'BULLISH'|'BEARISH'|'NEUTRAL'|pt-br,
   *   fearGreedIndex: number 0..100,
   *   fearGreedLabel: string,
   *   totalVolume: number,
   *   volatility: number,
   *   assetsUp: number,
   *   assetsDown: number,
   *   volumeVsAverage: number
   * }
   */
  async checkMarketConditions(marketData = {}) {
    try {
      const alerts = [];

      const overall = String(marketData.overall || 'NEUTRAL').toUpperCase();
      const fgi = Number.isFinite(Number(marketData.fearGreedIndex)) ? Number(marketData.fearGreedIndex) : null;
      const vola = Number.isFinite(Number(marketData.volatility)) ? Number(marketData.volatility) : null;
      const volRatio = Number.isFinite(Number(marketData.volumeVsAverage)) ? Number(marketData.volumeVsAverage) : null;
      const up = Number.isFinite(Number(marketData.assetsUp)) ? Number(marketData.assetsUp) : null;
      const down = Number.isFinite(Number(marketData.assetsDown)) ? Number(marketData.assetsDown) : null;

      // Breadth (amplitude de alta/baixa)
      let breadth = null;
      if (up !== null && down !== null && (up + down) > 0) {
        breadth = up / (up + down);
      }

      // ====== Regras simples de alerta ======

      // Mudança/estado de regime
      if (['BULLISH', 'OTIMISTA'].includes(overall)) {
        alerts.push({
          type: 'REGIME_BULL',
          message: '🟢 Regime de mercado otimista (bullish) detectado',
          priority: 'MEDIUM'
        });
      } else if (['BEARISH', 'PESSIMISTA'].includes(overall)) {
        alerts.push({
          type: 'REGIME_BEAR',
          message: '🔴 Regime de mercado pessimista (bearish) detectado',
          priority: 'MEDIUM'
        });
      }

      // Fear & Greed extremos
      if (fgi !== null) {
        if (fgi <= 20) {
          alerts.push({
            type: 'EXTREME_FEAR',
            message: '😱 Medo extremo no mercado — possíveis oportunidades de compra',
            priority: 'HIGH'
          });
        } else if (fgi >= 80) {
          alerts.push({
            type: 'EXTREME_GREED',
            message: '🤯 Ganância extrema no mercado — atenção a possíveis reversões',
            priority: 'HIGH'
          });
        }
      }

      // Volatilidade alta
      if (vola !== null && vola >= 5) {
        alerts.push({
          type: 'VOLA_SPIKE',
          message: '⚡ Volatilidade elevada detectada — ajuste stops e tamanho de posição',
          priority: 'HIGH'
        });
      }

      // Pico de volume vs. média
      if (volRatio !== null && volRatio >= 1.8) {
        alerts.push({
          type: 'VOLUME_SPIKE',
          message: '📈 Pico de volume acima da média — possível movimento direcional forte',
          priority: 'MEDIUM'
        });
      }

      // Amplitude (breadth) extrema
      if (breadth !== null) {
        if (breadth >= 0.7) {
          alerts.push({
            type: 'BREADTH_BULL',
            message: '🟢 Amplitude positiva ampla — maioria dos ativos em alta',
            priority: 'LOW'
          });
        } else if (breadth <= 0.3) {
          alerts.push({
            type: 'BREADTH_BEAR',
            message: '🔴 Amplitude negativa ampla — maioria dos ativos em queda',
            priority: 'LOW'
          });
        }
      }

      // ====== Envio filtrado por cooldown ======
      for (const alert of alerts) {
        if (!this.shouldNotify(alert.type, alert.priority)) continue;
        const text = this.composeAlertMessage(alert, marketData);
        await this.safeSend(text);
        this.rememberAlert(alert.type, alert.priority, text);
      }

      return alerts;
    } catch (err) {
      // Não deixa erro de alerta derrubar o app
      console.error('[AlertSystem] Erro ao verificar condições de mercado:', err.message);
      return [];
    }
  }

  /**
   * Monta mensagem MarkdownV2 segura com um pequeno sumário de mercado
   */
  composeAlertMessage(alert, marketData = {}) {
    const lines = [];

    // Título
    lines.push(`🚨 *ALERTA DE MERCADO*`);

    // Mensagem principal
    lines.push(this.escapeMdV2(`\n${alert.message}`));

    // Sumário opcional
    const extras = [];

    if (Number.isFinite(Number(marketData.fearGreedIndex))) {
      extras.push(`Índice Medo & Ganância: *${this.escapeMdV2(String(marketData.fearGreedIndex))}*`);
    }
    if (Number.isFinite(Number(marketData.volatility))) {
      extras.push(`Volatilidade: *${this.escapeMdV2(String(marketData.volatility))}*`);
    }
    if (Number.isFinite(Number(marketData.volumeVsAverage))) {
      extras.push(`Volume/Média: *${this.escapeMdV2(String(marketData.volumeVsAverage))}×*`);
    }
    if (Number.isFinite(Number(marketData.assetsUp)) && Number.isFinite(Number(marketData.assetsDown))) {
      const up = Number(marketData.assetsUp);
      const down = Number(marketData.assetsDown);
      const total = up + down;
      if (total > 0) {
        const percUp = ((up / total) * 100).toFixed(0);
        extras.push(`Amplitude: *${this.escapeMdV2(String(percUp))}%* em alta`);
      }
    }
    if (marketData.overall) {
      const overall = String(marketData.overall).toUpperCase();
      let label = 'NEUTRO';
      if (['BULLISH', 'OTIMISTA'].includes(overall)) label = 'OTIMISTA';
      else if (['BEARISH', 'PESSIMISTA'].includes(overall)) label = 'PESSIMISTA';
      extras.push(`Regime: *${this.escapeMdV2(label)}*`);
    }

    if (extras.length) {
      lines.push('\n' + extras.map(s => `• ${s}`).join('\n'));
    }

    // Rodapé
    const ts = new Date().toLocaleString('pt-BR');
    lines.push(`\n🕒 ${this.escapeMdV2(ts)}`);

    // Junta e prepara para MarkdownV2
    const msg = lines.join('\n');
    return msg;
  }

  /**
   * Envio seguro via Telegram:
   * 1) Tenta MarkdownV2 (com escape)
   * 2) Em caso de 400, tenta Markdown "clássico"
   * 3) Por fim, envia como texto puro
   */
  async safeSend(text) {
    if (!this.telegramBot || !this.telegramBot.isEnabled) {
      console.log('📱 [ALERTA - SIMULADO]\n' + text);
      return;
    }

    const chatId = this.telegramBot.chatId;

    // 1) MarkdownV2
    try {
      await this.telegramBot.bot.sendMessage(chatId, text, {
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      });
      return;
    } catch (err) {
      if (String(err?.response?.body?.description || '').includes("can't parse entities")) {
        // tenta caminhos alternativos
      } else {
        console.warn('[AlertSystem] Falha ao enviar com MarkdownV2:', err.message);
      }
    }

    // 2) Markdown (sanitize básico: remove * e _ soltos)
    try {
      const sanitized = text
        .replace(/\*/g, '')
        .replace(/_/g, '')
        .replace(/`/g, "'")
        .replace(/\|/g, '\\|'); // manter pipes seguros
      await this.telegramBot.bot.sendMessage(chatId, sanitized, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
      return;
    } catch (err) {
      console.warn('[AlertSystem] Falha ao enviar com Markdown:', err.message);
    }

    // 3) Texto puro
    try {
      const plain = text
        .replace(/\*/g, '')
        .replace(/_/g, '')
        .replace(/`/g, "'");
      await this.telegramBot.bot.sendMessage(chatId, plain, {
        disable_web_page_preview: true
      });
    } catch (err) {
      console.error('[AlertSystem] Falha ao enviar alerta (texto puro):', err.message);
    }
  }

  /**
   * Debounce de alerta por tipo usando cooldown por prioridade
   */
  shouldNotify(type, priority = 'LOW') {
    const now = Date.now();
    const key = String(type).toUpperCase();
    const last = this.lastAlerts.get(key) || 0;
    const cooldown = this.getCooldownMs(priority);
    return now - last >= cooldown;
  }

  rememberAlert(type, priority, text) {
    const key = String(type).toUpperCase();
    this.lastAlerts.set(key, Date.now());
    this.alertHistory.push({
      type: key,
      priority,
      message: text,
      timestamp: Date.now()
    });
    // mantém histórico enxuto
    if (this.alertHistory.length > 500) {
      this.alertHistory.splice(0, this.alertHistory.length - 500);
    }
  }

  getCooldownMs(priority = 'LOW') {
    switch (String(priority).toUpperCase()) {
      case 'CRITICAL': return 6 * 60 * 60 * 1000; // 6h
      case 'HIGH': return 2 * 60 * 60 * 1000;     // 2h
      case 'MEDIUM': return 60 * 60 * 1000;       // 1h
      case 'LOW': return 30 * 60 * 1000;          // 30m
      default: return 60 * 60 * 1000;             // 1h
    }
  }

  /**
   * Escapa caracteres especiais do MarkdownV2 do Telegram
   * (https://core.telegram.org/bots/api#markdownv2-style)
   */
  escapeMdV2(text = '') {
    return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }

  /**
   * Obtém histórico recente de alertas
   */
  getAlertHistory(limit = 20) {
    return this.alertHistory
      .slice(-limit)
      .reverse();
  }
}

export default AlertSystemService;
