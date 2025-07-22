/**
 * Sistema de alertas inteligentes
 */

class AlertSystemService {
  constructor(telegramBot) {
    this.telegramBot = telegramBot;
    this.alertHistory = [];
    this.lastAlerts = new Map();
  }

  /**
   * Verifica condições de mercado para alertas
   */
  async checkMarketConditions(marketData) {
    const alerts = [];

    // Alerta de correlação Bitcoin
    if (marketData.btcDominance) {
      if (marketData.btcDominance > 60) {
        alerts.push({
          type: 'BTC_DOMINANCE_HIGH',
          message: '⚠️ Dominância do Bitcoin alta (>60%) - Altcoins podem sofrer',
          priority: 'MEDIUM'
        });
      }
    }

    // Alerta de volume anômalo
    if (marketData.totalVolume && marketData.avgVolume) {
      const volumeRatio = marketData.totalVolume / marketData.avgVolume;
      if (volumeRatio > 2) {
        alerts.push({
          type: 'VOLUME_SPIKE',
          message: `🔥 Volume anômalo detectado: ${(volumeRatio * 100).toFixed(0)}% acima da média`,
          priority: 'HIGH'
        });
      }
    }

    // Alerta de medo extremo
    if (marketData.fearGreedIndex < 20) {
      alerts.push({
        type: 'EXTREME_FEAR',
        message: '😱 Medo extremo no mercado - Possível oportunidade de compra',
        priority: 'HIGH'
      });
    }

    // Alerta de ganância extrema
    if (marketData.fearGreedIndex > 80) {
      alerts.push({
        type: 'EXTREME_GREED',
        message: '🤑 Ganância extrema no mercado - Cuidado com correções',
        priority: 'HIGH'
      });
    }

    // Envia alertas não duplicados
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }

  /**
   * Alerta de performance do bot
   */
  async checkBotPerformance(performanceData) {
    const { winRate, totalSignals, recentPerformance } = performanceData;

    // Alerta de baixa performance
    if (totalSignals >= 10 && winRate < 40) {
      await this.sendAlert({
        type: 'LOW_PERFORMANCE',
        message: `⚠️ Performance baixa detectada: ${winRate}% de acerto em ${totalSignals} sinais`,
        priority: 'HIGH'
      });
    }

    // Alerta de alta performance
    if (totalSignals >= 5 && winRate > 80) {
      await this.sendAlert({
        type: 'HIGH_PERFORMANCE',
        message: `🎉 Excelente performance: ${winRate}% de acerto em ${totalSignals} sinais!`,
        priority: 'MEDIUM'
      });
    }

    // Alerta de sequência de perdas
    if (recentPerformance && recentPerformance.consecutiveLosses >= 3) {
      await this.sendAlert({
        type: 'LOSING_STREAK',
        message: `🔴 Sequência de ${recentPerformance.consecutiveLosses} perdas - Revisando estratégia`,
        priority: 'HIGH'
      });
    }
  }

  /**
   * Envia alerta se não foi enviado recentemente
   */
  async sendAlert(alert) {
    const now = Date.now();
    const lastSent = this.lastAlerts.get(alert.type);
    const cooldown = this.getCooldownTime(alert.priority);

    // Verifica cooldown
    if (lastSent && (now - lastSent) < cooldown) {
      return;
    }

    try {
      const message = `🚨 *ALERTA DO SISTEMA*\n\n${alert.message}\n\n⏰ ${new Date().toLocaleString('pt-BR')}\n\n👑 Sinais Lobo Cripto`;
      
      if (this.telegramBot && this.telegramBot.isEnabled) {
        await this.telegramBot.bot.sendMessage(this.telegramBot.chatId, message, {
          parse_mode: 'Markdown'
        });
      }

      // Registra envio
      this.lastAlerts.set(alert.type, now);
      this.alertHistory.push({
        ...alert,
        timestamp: new Date(),
        sent: true
      });

      console.log(`🚨 Alerta enviado: ${alert.type}`);
    } catch (error) {
      console.error('Erro ao enviar alerta:', error.message);
    }
  }

  /**
   * Obtém tempo de cooldown baseado na prioridade
   */
  getCooldownTime(priority) {
    switch (priority) {
      case 'HIGH': return 30 * 60 * 1000; // 30 minutos
      case 'MEDIUM': return 2 * 60 * 60 * 1000; // 2 horas
      case 'LOW': return 6 * 60 * 60 * 1000; // 6 horas
      default: return 60 * 60 * 1000; // 1 hora
    }
  }

  /**
   * Obtém histórico de alertas
   */
  getAlertHistory(limit = 20) {
    return this.alertHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

export default AlertSystemService;