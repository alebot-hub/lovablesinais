// server/services/performanceTracker.js
/**
 * Serviço de rastreamento de performance + Relatório semanal automático
 * Pensado para SCALPING (6 TPs e SL fixo) com 15x de alavancagem.
 *
 * Integra com TelegramBotService (opcional). Se não houver Telegram habilitado,
 * o timer de relatório NÃO inicia automaticamente, a menos que PERF_AUTO_START=true.
 */

class PerformanceTrackerService {
  constructor(telegramBotService = null, options = {}) {
    this.telegram = telegramBotService;

    // --- Dados de performance ---
    this.signals = [];
    this.monthlyStats = new Map();
    this.weeklyStats = new Map();
    this.lastWeeklyReport = null;
    this.dailyStats = { trades: 0, wins: 0, losses: 0, totalPnL: 0 };

    // --- Configuração do agendador ---
    this.schedule = {
      tz: process.env.REPORT_TZ || options.tz || 'America/Sao_Paulo',
      // 0=Dom, 1=Seg, ... 6=Sáb
      day: toNum(process.env.WEEKLY_REPORT_DAY, options.day, 0),
      hour: toNum(process.env.WEEKLY_REPORT_HOUR, options.hour, 17),
      minute: toNum(process.env.WEEKLY_REPORT_MINUTE, options.minute, 0),
      windowMin: toNum(process.env.WEEKLY_REPORT_WINDOW_MIN, options.windowMin, 90),
      pollMs: toNum(process.env.REPORT_POLL_MS, options.pollMs, 30_000),
    };

    // Autostart seguro:
    // - true se options.autoStart === true
    // - ou se PERF_AUTO_START === 'true'
    // - senão, só inicia se houver this.telegram e this.telegram.isEnabled
    const envAuto = String(process.env.PERF_AUTO_START || '').trim().toLowerCase() === 'true';
    const shouldAutoStart =
      options.autoStart === true || envAuto || (!!this.telegram && !!this.telegram.isEnabled);

    if (shouldAutoStart) {
      this.startWeeklyReportTimer().catch(e =>
        console.error('Erro ao iniciar timer do relatório semanal:', e?.message || e)
      );
    } else {
      console.log('ℹ️ PerformanceTracker: timer semanal não iniciado (sem Telegram habilitado e PERF_AUTO_START!=true).');
    }
  }

  // ========================= AGENDADOR =========================
  async startWeeklyReportTimer(sendFn = null) {
    if (this._timer) clearInterval(this._timer);

    const sender = sendFn || (async (text) => {
      if (this.telegram && this.telegram.isEnabled && typeof this.telegram._sendMessageSafe === 'function') {
        await this.telegram._sendMessageSafe(text);
      } else {
        console.log('📨 [SIMULADO] Relatório semanal:\n' + text);
      }
    });

    const tick = async () => {
      try {
        if (!this._isWithinScheduleWindow()) return;
        const weekKey = this.getWeekKey(this._nowInTz(this.schedule.tz));
        if (this.lastWeeklyReport === weekKey) return; // já enviado

        const rpt = this.generateWeeklyReport();
        const msg = this.formatWeeklyReportMessage(rpt);
        await sender(msg);

        this.markWeeklyReportSent();
        console.log(`📤 Relatório semanal enviado (week=${weekKey})`);
      } catch (e) {
        console.error('❌ Erro ao enviar relatório semanal:', e?.message || e);
      }
    };

    await tick(); // dispara já se estiver na janela
    this._timer = setInterval(tick, Math.max(5_000, this.schedule.pollMs));
  }

  stopWeeklyReportTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _isWithinScheduleWindow() {
    const tz = this.schedule.tz;
    const now = this._nowInTz(tz);
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const targetMin = this.schedule.hour * 60 + this.schedule.minute;
    const withinWindow =
      now.getDay() === this.schedule.day &&
      minutesNow >= targetMin &&
      minutesNow < targetMin + this.schedule.windowMin;
    return withinWindow;
  }

  _nowInTz(tz) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
  }

  // =================== API DE RASTREAMENTO ===================
  recordSignal(signal) {
    const signalRecord = {
      id: this.generateSignalId(),
      symbol: signal.symbol,
      timestamp: new Date(),
      entry: signal.entry,
      targets: signal.targets,
      stopLoss: signal.stopLoss,
      probability: signal.probability,
      totalScore: signal.totalScore,
      trend: signal.trend,
      isMLDriven: signal.isMLDriven,
      timeframe: signal.timeframe,
      status: 'ACTIVE',
      results: {
        targetsHit: 0,
        finalPnL: 0,
        duration: null,
        exitReason: null,
        maxDrawdown: 0,
        peakProfit: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        isStopMobile: false,
        isPartialWin: false,
      }
    };

    this.signals.push(signalRecord);
    this.updateWeeklyStats(signalRecord, 'NEW_SIGNAL');
    console.log(`📊 Sinal registrado: ${signal.symbol} (ID: ${signalRecord.id})`);
    return signalRecord.id;
  }

  recordTrade(symbol, pnlPercent, isWin) {
    this.dailyStats.trades++;
    this.dailyStats.totalPnL += pnlPercent * 15; // alavancagem 15x
    if (isWin) this.dailyStats.wins++; else this.dailyStats.losses++;

    console.log(`📊 Trade: ${symbol} ${isWin ? '✅' : '❌'} ${(pnlPercent * 15).toFixed(2)}% (15x)`);
    console.log(`📈 Diária: ${this.dailyStats.wins}W/${this.dailyStats.losses}L (${this.dailyStats.totalPnL.toFixed(2)}% 15x)`);
  }

  updateSignalResult(symbol, targetsHit, finalPnL, exitReason, realizedPnL = null) {
    const signal = this.signals.find(s => s.symbol === symbol && s.status === 'ACTIVE');
    if (!signal) return;

    signal.status = 'COMPLETED';
    signal.results.targetsHit = targetsHit;
    signal.results.finalPnL = finalPnL * 15; // 15x
    signal.results.realizedPnL = (isFinite(realizedPnL) ? realizedPnL : finalPnL) * 15;
    signal.results.unrealizedPnL = signal.results.finalPnL - signal.results.realizedPnL;
    signal.results.duration = new Date() - signal.timestamp;
    signal.results.exitReason = exitReason;
    signal.results.isStopMobile = exitReason === 'STOP_MOBILE';
    signal.results.isPartialWin = targetsHit > 0 && exitReason !== 'ALL_TARGETS';

    this.updateMonthlyStats(signal);
    this.updateWeeklyStats(signal, 'COMPLETED');

    const r = signal.results;
    console.log(
      `📈 Resultado ${symbol}: ${targetsHit}/6 alvos ` +
      `(total=${r.finalPnL.toFixed(2)}% | realizado=${r.realizedPnL.toFixed(2)}% | não-realizado=${r.unrealizedPnL.toFixed(2)}%)`
    );
  }

  // =================== ESTATÍSTICAS SEMANAIS ===================
  updateWeeklyStats(signal, action) {
    const week = this.getWeekKey(signal.timestamp);

    if (!this.weeklyStats.has(week)) {
      this.weeklyStats.set(week, {
        weekStart: this.getWeekStart(signal.timestamp),
        weekEnd: this.getWeekEnd(signal.timestamp),
        totalSignals: 0,
        completedSignals: 0,
        winningSignals: 0,
        losingSignals: 0,
        totalPnL: 0,
        avgTargetsHit: 0,
        bestTrade: null,
        worstTrade: null,
        mlSignals: 0,
        mlWins: 0,
        stopMobileActivations: 0,
        stopMobileAvgTargets: 0,
        partialWins: 0,
        fullLosses: 0,
        fullWins: 0,
        partialLosses: 0,
        timeframeBreakdown: {
          '5m': { signals: 0, wins: 0 },
          '15m': { signals: 0, wins: 0 },
          '1h': { signals: 0, wins: 0 },
          '4h': { signals: 0, wins: 0 },
          '1d': { signals: 0, wins: 0 }
        },
        topPerformers: [],
        worstPerformers: []
      });
    }

    const stats = this.weeklyStats.get(week);

    if (action === 'NEW_SIGNAL') {
      stats.totalSignals++;
      if (signal.isMLDriven) stats.mlSignals++;
      if (signal.timeframe && stats.timeframeBreakdown[signal.timeframe]) {
        stats.timeframeBreakdown[signal.timeframe].signals++;
      }
      return;
    }

    if (action === 'COMPLETED') {
      stats.completedSignals++;
      stats.totalPnL += signal.results.finalPnL;
      stats.avgTargetsHit =
        (stats.avgTargetsHit * (stats.completedSignals - 1) + signal.results.targetsHit) / stats.completedSignals;

      const isWin =
        signal.results.finalPnL > 0 ||
        signal.results.isStopMobile ||
        signal.results.exitReason === 'STOP_MOBILE';

      if (isWin) {
        stats.winningSignals++;
        if (signal.isMLDriven) stats.mlWins++;
        if (signal.timeframe && stats.timeframeBreakdown[signal.timeframe]) {
          stats.timeframeBreakdown[signal.timeframe].wins++;
        }

        if (signal.results.exitReason === 'ALL_TARGETS') {
          stats.fullWins = (stats.fullWins || 0) + 1;
        } else if (signal.results.isPartialWin) {
          stats.partialWins = (stats.partialWins || 0) + 1;
        }

        if (!stats.bestTrade || signal.results.finalPnL > stats.bestTrade.pnl) {
          stats.bestTrade = {
            symbol: signal.symbol,
            pnl: signal.results.finalPnL,
            targetsHit: signal.results.targetsHit,
            duration: signal.results.duration,
            exitReason: signal.results.exitReason
          };
        }

        stats.topPerformers.push({
          symbol: signal.symbol,
          pnl: signal.results.finalPnL,
          targetsHit: signal.results.targetsHit,
          exitReason: signal.results.exitReason,
          realizedPnL: signal.results.realizedPnL
        });
        stats.topPerformers.sort((a, b) => b.pnl - a.pnl);
        stats.topPerformers = stats.topPerformers.slice(0, 5);
      } else {
        stats.losingSignals++;
        if (signal.results.targetsHit === 0) stats.fullLosses = (stats.fullLosses || 0) + 1;
        else stats.partialLosses = (stats.partialLosses || 0) + 1;

        if (!stats.worstTrade || signal.results.finalPnL < stats.worstTrade.pnl) {
          stats.worstTrade = {
            symbol: signal.symbol,
            pnl: signal.results.finalPnL,
            duration: signal.results.duration,
            targetsHit: signal.results.targetsHit,
            exitReason: signal.results.exitReason
          };
        }

        stats.worstPerformers.push({
          symbol: signal.symbol,
          pnl: signal.results.finalPnL,
          targetsHit: signal.results.targetsHit,
          exitReason: signal.results.exitReason
        });
        stats.worstPerformers.sort((a, b) => a.pnl - b.pnl);
        stats.worstPerformers = stats.worstPerformers.slice(0, 3);
      }

      if (signal.results.isStopMobile) {
        stats.stopMobileActivations = (stats.stopMobileActivations || 0) + 1;
        stats.stopMobileAvgTargets =
          stats.stopMobileActivations > 0
            ? ((stats.stopMobileAvgTargets || 0) * (stats.stopMobileActivations - 1) + signal.results.targetsHit) /
              stats.stopMobileActivations
            : signal.results.targetsHit;
      }
    }
  }

  // =================== RELATÓRIO SEMANAL ===================
  generateWeeklyReport() {
    // Semana anterior; se vazia, usa a atual
    const tzNow = this._nowInTz(this.schedule.tz);
    const currentWeek = this.getWeekKey(tzNow);
    const lastWeekDate = new Date(tzNow.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeek = this.getWeekKey(lastWeekDate);

    const stats = this.weeklyStats.get(lastWeek) || this.weeklyStats.get(currentWeek);
    if (!stats || stats.completedSignals === 0) {
      return { hasData: false, message: 'Dados insuficientes para relatório semanal.' };
    }

    const weekSignals = this.signals.filter(
      s => s.timestamp >= stats.weekStart && s.timestamp <= stats.weekEnd && s.status === 'COMPLETED' && s.results
    );

    const metrics = {
      totalTrades: 0,
      winningTrades: 0,
      totalRawPnL: 0,
      totalRiskAdjustedPnL: 0,
      totalRealizedProfit: 0,
      totalUnrealizedProfit: 0,
      targetDistribution: [0, 0, 0, 0, 0, 0],
      timeframeStats: {},
      bestTrade: null,
      worstTrade: null
    };

    weekSignals.forEach(signal => {
      const r = signal.results;
      const pnl = r.riskAdjustedPnL || r.finalPnL; // fallback

      metrics.totalTrades++;
      metrics.totalRawPnL += r.finalPnL;
      metrics.totalRiskAdjustedPnL += pnl;
      metrics.totalRealizedProfit += r.realizedPnL || 0;
      metrics.totalUnrealizedProfit += r.unrealizedPnL || 0;

      if (pnl > 0) metrics.winningTrades++;

      if (r.targetsHit > 0 && r.targetsHit <= 6) metrics.targetDistribution[r.targetsHit - 1]++;

      if (!metrics.bestTrade || pnl > metrics.bestTrade.pnl) {
        metrics.bestTrade = {
          symbol: signal.symbol,
          pnl,
          targetsHit: r.targetsHit,
          timeframe: signal.timeframe,
          exitReason: r.exitReason
        };
      }
      if (!metrics.worstTrade || pnl < metrics.worstTrade.pnl) {
        metrics.worstTrade = {
          symbol: signal.symbol,
          pnl,
          targetsHit: r.targetsHit,
          timeframe: signal.timeframe,
          exitReason: r.exitReason
        };
      }

      const tf = signal.timeframe || '1h';
      if (!metrics.timeframeStats[tf]) metrics.timeframeStats[tf] = { trades: 0, wins: 0, pnl: 0 };
      metrics.timeframeStats[tf].trades++;
      metrics.timeframeStats[tf].pnl += pnl;
      if (pnl > 0) metrics.timeframeStats[tf].wins++;
    });

    const winRate = metrics.totalTrades ? (metrics.winningTrades / metrics.totalTrades) * 100 : 0;
    const avgRawPnL = metrics.totalTrades ? metrics.totalRawPnL / metrics.totalTrades : 0;
    const avgRiskAdjustedPnL = metrics.totalTrades ? metrics.totalRiskAdjustedPnL / metrics.totalTrades : 0;

    const timeframeStats = Object.entries(metrics.timeframeStats).map(([tf, data]) => ({
      timeframe: tf,
      trades: data.trades,
      winRate: data.trades ? ((data.wins / data.trades) * 100).toFixed(1) : '0.0',
      avgPnl: data.trades ? (data.pnl / data.trades).toFixed(2) : '0.00'
    }));

    const targetDistribution = metrics.targetDistribution.map((count, i) => ({
      target: i + 1,
      count,
      percentage: metrics.totalTrades ? ((count / metrics.totalTrades) * 100).toFixed(1) + '%' : '0.0%',
      profitShare: [50, 15, 10, 10, 10, 5][i] + '%'
    }));

    return {
      hasData: true,
      period: {
        start: stats.weekStart,
        end: stats.weekEnd,
        days: Math.ceil((stats.weekEnd - stats.weekStart) / (1000 * 60 * 60 * 24))
      },
      summary: {
        totalTrades: metrics.totalTrades,
        winRate: winRate.toFixed(1),
        totalRawPnL: metrics.totalRawPnL.toFixed(2),
        totalRiskAdjustedPnL: metrics.totalRiskAdjustedPnL.toFixed(2),
        avgRawPnL: avgRawPnL.toFixed(2),
        avgRiskAdjustedPnL: avgRiskAdjustedPnL.toFixed(2),
        realizedProfit: metrics.totalRealizedProfit.toFixed(2),
        unrealizedProfit: metrics.totalUnrealizedProfit.toFixed(2),
        profitRealizationRatio:
          metrics.totalRiskAdjustedPnL > 0
            ? ((metrics.totalRealizedProfit / metrics.totalRiskAdjustedPnL) * 100).toFixed(1) + '%'
            : '0%',
        stopMobileRate:
          stats.completedSignals > 0
            ? (((stats.stopMobileActivations || 0) / stats.completedSignals) * 100).toFixed(1) + '%'
            : '0%'
      },
      performance: {
        bestTrade: metrics.bestTrade
          ? {
              symbol: metrics.bestTrade.symbol,
              pnl: metrics.bestTrade.pnl.toFixed(2) + '%',
              targetsHit: metrics.bestTrade.targetsHit,
              timeframe: metrics.bestTrade.timeframe,
              exitReason: metrics.bestTrade.exitReason
            }
          : null,
        worstTrade: metrics.worstTrade
          ? {
              symbol: metrics.worstTrade.symbol,
              pnl: metrics.worstTrade.pnl.toFixed(2) + '%',
              targetsHit: metrics.worstTrade.targetsHit,
              timeframe: metrics.worstTrade.timeframe,
              exitReason: metrics.worstTrade.exitReason
            }
          : null,
        targetDistribution,
        timeframes: timeframeStats,
        riskManagement: {
          stopMobileActivations: stats.stopMobileActivations || 0,
          stopMobileAvgTargets: (stats.stopMobileAvgTargets || 0).toFixed(1),
          fullWins: stats.fullWins || 0,
          partialWins: stats.partialWins || 0,
          fullLosses: stats.fullLosses || 0,
          partialLosses: stats.partialLosses || 0
        }
      },
      insights: this.generateInsights(stats, winRate, 0)
    };
  }

  formatWeeklyReportMessage(rpt) {
    const fmtDate = d => new Date(d).toLocaleDateString('pt-BR', { timeZone: this.schedule.tz });
    if (!rpt.hasData) {
      return `📊 *Relatório Semanal*\n\nℹ️ ${rpt.message}\n\n⏰ Domingo ${this.schedule.hour.toString().padStart(2, '0')}:${this.schedule.minute.toString().padStart(2, '0')} (${this.schedule.tz})`;
    }

    const s = rpt.summary;
    const perf = rpt.performance;

    const tfLines = (perf.timeframes || [])
      .map(tf => `• ${tf.timeframe}: ${tf.trades} trades | acerto ${tf.winRate}% | média ${tf.avgPnl}%`)
      .join('\n');

    const distLines = (perf.targetDistribution || [])
      .map(t => `• Alvo ${t.target}: ${t.count} (${t.percentage}) — ${t.profitShare} do plano`)
      .join('\n');

    const best = perf.bestTrade
      ? `🏆 *Melhor trade:* ${perf.bestTrade.symbol} | ${perf.bestTrade.pnl} | ${perf.bestTrade.targetsHit}/6 alvos`
      : '🏆 *Melhor trade:* —';

    const worst = perf.worstTrade
      ? `⚠️ *Pior trade:* ${perf.worstTrade.symbol} | ${perf.worstTrade.pnl} | ${perf.worstTrade.targetsHit}/6 alvos`
      : '⚠️ *Pior trade:* —';

    const insights = (rpt.insights || []).map(i => `• ${i}`).join('\n');

    return (
`📊 *RELATÓRIO SEMANAL — Sinais Lobo Scalping*
_Período:_ ${fmtDate(rpt.period.start)} → ${fmtDate(rpt.period.end)} (${rpt.period.days}d)

*Resumo*
• Trades: ${s.totalTrades}
• Taxa de acerto: ${s.winRate}%
• PnL total (15x): ${s.totalRawPnL}%
• PnL ajustado risco: ${s.totalRiskAdjustedPnL}%
• Média por trade: ${s.avgRawPnL}%
• Lucro realizado: ${s.realizedProfit}% | Não-realizado: ${s.unrealizedProfit}% (${s.profitRealizationRatio} realizados)
• Stop móvel: ${s.stopMobileRate}

${best}
${worst}

*Timeframes*
${tfLines || '—'}

*Distribuição de Alvos*
${distLines || '—'}

*Insights*
${insights || '—'}

👑 *Sinais Lobo Scalping*`
    );
  }

  // =================== INSIGHTS ===================
  generateInsights(stats, winRate /*, mlWinRate */) {
    const insights = [];

    if (winRate >= 70) insights.push('🎯 Excelente performance semanal - acima de 70% de acerto');
    else if (winRate >= 60) insights.push('✅ Boa performance semanal - mantendo consistência');
    else if (winRate >= 50) insights.push('⚠️ Performance moderada - ajustes podem ser necessários');
    else insights.push('🔴 Performance abaixo do esperado - revisão de estratégia recomendada');

    if (stats.stopMobileActivations > 0) {
      const rate = ((stats.stopMobileActivations / Math.max(1, stats.completedSignals)) * 100).toFixed(1);
      insights.push(`🛡️ Stop móvel ativado em ${rate}% das operações (média ${Number(stats.stopMobileAvgTargets || 0).toFixed(1)} alvos)`);
    }

    if ((stats.partialWins || 0) > (stats.fullLosses || 0)) {
      insights.push('✅ Gestão de risco eficiente - mais ganhos parciais que perdas totais');
    }

    const realizationRate =
      stats.completedSignals > 0
        ? (((stats.partialWins || 0) + (stats.fullWins || 0)) / stats.completedSignals) * 100
        : 0;
    if (realizationRate >= 80) insights.push('💰 Excelente taxa de realização de lucros');
    else if (realizationRate >= 60) insights.push('💰 Boa disciplina na realização de lucros');

    const bestTimeframe = Object.entries(stats.timeframeBreakdown || {})
      .filter(([, d]) => (d?.signals || 0) >= 2)
      .sort((a, b) => (b[1].wins / Math.max(1, b[1].signals)) - (a[1].wins / Math.max(1, a[1].signals)))[0];
    if (bestTimeframe) {
      const tfWinRate = ((bestTimeframe[1].wins / Math.max(1, bestTimeframe[1].signals)) * 100).toFixed(1);
      insights.push(`📈 Melhor timeframe: ${bestTimeframe[0]} (${tfWinRate}% de acerto)`);
    }

    if ((stats.avgTargetsHit || 0) >= 4) insights.push('🎯 Excelente gestão de alvos - média de 4+ alvos atingidos');
    else if ((stats.avgTargetsHit || 0) >= 2) insights.push('✅ Boa gestão de alvos - mantendo disciplina');

    if ((stats.totalSignals || 0) >= 15) insights.push('📊 Alta atividade - muitas oportunidades identificadas');
    else if ((stats.totalSignals || 0) <= 5) insights.push('🔍 Seletividade alta - focando apenas nos melhores sinais');

    return insights;
  }

  // =================== SUPORTE/UTILS ===================
  shouldSendWeeklyReport() {
    // Compatível com app.js
    return this._isWithinScheduleWindow() && this.lastWeeklyReport !== this.getWeekKey(this._nowInTz(this.schedule.tz));
  }

  markWeeklyReportSent() {
    this.lastWeeklyReport = this.getWeekKey(this._nowInTz(this.schedule.tz));
  }

  getWeekKey(date) {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // segunda
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  }

  getWeekEnd(date) {
    const weekStart = this.getWeekStart(date);
    const end = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  updateMonthlyStats(signal) {
    // Usa mês do sinal (não "mês atual")
    const dt = signal.timestamp instanceof Date ? signal.timestamp : new Date(signal.timestamp);
    const month = dt.toISOString().slice(0, 7); // YYYY-MM

    if (!this.monthlyStats.has(month)) {
      this.monthlyStats.set(month, {
        totalSignals: 0,
        winningSignals: 0,
        totalPnL: 0,
        avgTargetsHit: 0,
        mlSignals: 0,
        mlWins: 0
      });
    }

    const stats = this.monthlyStats.get(month);
    stats.totalSignals++;
    stats.totalPnL += signal.results.finalPnL;
    stats.avgTargetsHit = (stats.avgTargetsHit * (stats.totalSignals - 1) + signal.results.targetsHit) / stats.totalSignals;

    if (signal.results.finalPnL > 0) stats.winningSignals++;
    if (signal.isMLDriven) {
      stats.mlSignals++;
      if (signal.results.finalPnL > 0) stats.mlWins++;
    }
  }

  generatePerformanceReport() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const stats = this.monthlyStats.get(currentMonth) || {
      totalSignals: 0, winningSignals: 0, totalPnL: 0, avgTargetsHit: 0, mlSignals: 0, mlWins: 0
    };

    const winRate = stats.totalSignals > 0 ? (stats.winningSignals / stats.totalSignals * 100).toFixed(1) : '0.0';
    const mlWinRate = stats.mlSignals > 0 ? (stats.mlWins / stats.mlSignals * 100).toFixed(1) : '0.0';

    return {
      month: currentMonth,
      totalSignals: stats.totalSignals,
      winRate: parseFloat(winRate),
      totalPnL: stats.totalPnL,
      avgTargetsHit: Number(stats.avgTargetsHit || 0).toFixed(1),
      mlPerformance: { signals: stats.mlSignals, winRate: parseFloat(mlWinRate) },
      recentSignals: this.signals.slice(-10).map(signal => ({
        symbol: signal.symbol,
        probability: signal.probability || signal.totalScore || 0,
        totalScore: signal.totalScore || signal.probability || 0,
        trend: signal.trend || 'NEUTRAL',
        entry: signal.entry || 0,
        timestamp: signal.timestamp,
        isMLDriven: signal.isMLDriven || false,
        timeframe: signal.timeframe || '1h',
        status: signal.status || 'ACTIVE'
      }))
    };
  }

  getTopPerformers(limit = 5) {
    return this.signals
      .filter(s => s.status === 'COMPLETED')
      .sort((a, b) => b.results.finalPnL - a.results.finalPnL)
      .slice(0, limit)
      .map(s => ({
        symbol: s.symbol,
        pnl: s.results.finalPnL,
        targetsHit: s.results.targetsHit,
        probability: s.probability,
        isMLDriven: s.isMLDriven
      }));
  }

  generateSignalId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// --------- helpers locais ----------
function toNum(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export default PerformanceTrackerService;
