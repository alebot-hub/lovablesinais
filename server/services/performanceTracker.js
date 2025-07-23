/**
 * Serviço de rastreamento de performance
 */

class PerformanceTrackerService {
  constructor() {
    this.signals = [];
    this.monthlyStats = new Map();
    this.weeklyStats = new Map();
    this.lastWeeklyReport = null;
    this.dailyStats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0
    };
  }

  /**
   * Registra novo sinal
   */
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
        peakProfit: 0
      }
    };

    this.signals.push(signalRecord);
    this.updateWeeklyStats(signalRecord, 'NEW_SIGNAL');
    console.log(`📊 Sinal registrado: ${signal.symbol} (ID: ${signalRecord.id})`);
    
    return signalRecord.id;
  }

  /**
   * Registra trade
   */
  recordTrade(symbol, pnlPercent, isWin) {
    this.dailyStats.trades++;
    this.dailyStats.totalPnL += pnlPercent * 15; // Aplica alavancagem 15x
    
    if (isWin) {
      this.dailyStats.wins++;
    } else {
      this.dailyStats.losses++;
    }

    console.log(`📊 Trade registrado: ${symbol} ${isWin ? '✅' : '❌'} ${(pnlPercent * 15).toFixed(2)}% (15x)`);
    console.log(`📈 Stats diárias: ${this.dailyStats.wins}W/${this.dailyStats.losses}L (${this.dailyStats.totalPnL.toFixed(2)}% com 15x)`);
  }

  /**
   * Atualiza resultado do sinal
   */
  updateSignalResult(symbol, targetsHit, finalPnL, exitReason) {
    const signal = this.signals.find(s => s.symbol === symbol && s.status === 'ACTIVE');
    
    if (signal) {
      signal.status = 'COMPLETED';
      signal.results.targetsHit = targetsHit;
      signal.results.finalPnL = finalPnL * 15; // Aplica alavancagem 15x
      signal.results.duration = new Date() - signal.timestamp;
      signal.results.exitReason = exitReason;

      this.updateMonthlyStats(signal);
      this.updateWeeklyStats(signal, 'COMPLETED');
      console.log(`📈 Resultado atualizado: ${symbol} - ${targetsHit}/6 alvos (${(finalPnL * 15).toFixed(2)}% com 15x)`);
    }
  }

  /**
   * Atualiza estatísticas semanais
   */
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
        timeframeBreakdown: {
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
      if (signal.isMLDriven) {
        stats.mlSignals++;
      }
      if (signal.timeframe && stats.timeframeBreakdown[signal.timeframe]) {
        stats.timeframeBreakdown[signal.timeframe].signals++;
      }
    } else if (action === 'COMPLETED') {
      stats.completedSignals++;
      stats.totalPnL += signal.results.finalPnL;
      stats.avgTargetsHit = (stats.avgTargetsHit * (stats.completedSignals - 1) + signal.results.targetsHit) / stats.completedSignals;
      
      if (signal.results.finalPnL > 0) {
        stats.winningSignals++;
        if (signal.isMLDriven) stats.mlWins++;
        if (signal.timeframe && stats.timeframeBreakdown[signal.timeframe]) {
          stats.timeframeBreakdown[signal.timeframe].wins++;
        }
        
        // Atualiza melhor trade
        if (!stats.bestTrade || signal.results.finalPnL > stats.bestTrade.pnl) {
          stats.bestTrade = {
            symbol: signal.symbol,
            pnl: signal.results.finalPnL,
            targetsHit: signal.results.targetsHit,
            duration: signal.results.duration
          };
        }
        
        // Top performers
        stats.topPerformers.push({
          symbol: signal.symbol,
          pnl: signal.results.finalPnL,
          targetsHit: signal.results.targetsHit
        });
        stats.topPerformers.sort((a, b) => b.pnl - a.pnl);
        stats.topPerformers = stats.topPerformers.slice(0, 5);
        
      } else {
        stats.losingSignals++;
        
        // Atualiza pior trade
        if (!stats.worstTrade || signal.results.finalPnL < stats.worstTrade.pnl) {
          stats.worstTrade = {
            symbol: signal.symbol,
            pnl: signal.results.finalPnL,
            duration: signal.results.duration
          };
        }
        
        // Worst performers
        stats.worstPerformers.push({
          symbol: signal.symbol,
          pnl: signal.results.finalPnL
        });
        stats.worstPerformers.sort((a, b) => a.pnl - b.pnl);
        stats.worstPerformers = stats.worstPerformers.slice(0, 3);
      }
    }
  }

  /**
   * Gera relatório semanal completo
   */
  generateWeeklyReport() {
    const currentWeek = this.getWeekKey(new Date());
    const lastWeek = this.getWeekKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    
    const stats = this.weeklyStats.get(lastWeek) || this.weeklyStats.get(currentWeek);
    
    if (!stats || stats.completedSignals === 0) {
      return {
        hasData: false,
        message: 'Dados insuficientes para relatório semanal'
      };
    }

    const winRate = stats.completedSignals > 0 ? (stats.winningSignals / stats.completedSignals * 100) : 0;
    const mlWinRate = stats.mlSignals > 0 ? (stats.mlWins / stats.mlSignals * 100) : 0;
    const avgPnL = stats.completedSignals > 0 ? stats.totalPnL / stats.completedSignals : 0;
    
    // Calcula performance por timeframe
    const timeframePerformance = {};
    Object.entries(stats.timeframeBreakdown).forEach(([tf, data]) => {
      if (data.signals > 0) {
        timeframePerformance[tf] = {
          signals: data.signals,
          winRate: (data.wins / data.signals * 100).toFixed(1)
        };
      }
    });

    return {
      hasData: true,
      period: {
        start: stats.weekStart,
        end: stats.weekEnd
      },
      summary: {
        totalSignals: stats.totalSignals,
        completedSignals: stats.completedSignals,
        winRate: winRate.toFixed(1),
        totalPnL: stats.totalPnL.toFixed(2),
        avgPnL: avgPnL.toFixed(2),
        avgTargetsHit: stats.avgTargetsHit.toFixed(1)
      },
      mlPerformance: {
        signals: stats.mlSignals,
        winRate: mlWinRate.toFixed(1),
        percentage: stats.totalSignals > 0 ? (stats.mlSignals / stats.totalSignals * 100).toFixed(1) : 0
      },
      timeframes: timeframePerformance,
      bestTrade: stats.bestTrade,
      worstTrade: stats.worstTrade,
      topPerformers: stats.topPerformers,
      worstPerformers: stats.worstPerformers,
      insights: this.generateInsights(stats, winRate, mlWinRate)
    };
  }

  /**
   * Gera insights inteligentes
   */
  generateInsights(stats, winRate, mlWinRate) {
    const insights = [];
    
    // Performance geral
    if (winRate >= 70) {
      insights.push('🎯 Excelente performance semanal - acima de 70% de acerto');
    } else if (winRate >= 60) {
      insights.push('✅ Boa performance semanal - mantendo consistência');
    } else if (winRate >= 50) {
      insights.push('⚠️ Performance moderada - ajustes podem ser necessários');
    } else {
      insights.push('🔴 Performance abaixo do esperado - revisão de estratégia recomendada');
    }
    
    // ML vs Técnica
    if (stats.mlSignals > 0 && mlWinRate > winRate + 10) {
      insights.push('🤖 Sinais de IA superaram análise técnica em +10%');
    } else if (stats.mlSignals > 0 && mlWinRate < winRate - 10) {
      insights.push('📊 Análise técnica superou IA - modelos podem precisar retreinamento');
    }
    
    // Timeframes
    const bestTimeframe = Object.entries(stats.timeframeBreakdown)
      .filter(([_, data]) => data.signals >= 2)
      .sort((a, b) => (b[1].wins / b[1].signals) - (a[1].wins / a[1].signals))[0];
    
    if (bestTimeframe) {
      const tfWinRate = (bestTimeframe[1].wins / bestTimeframe[1].signals * 100).toFixed(1);
      insights.push(`📈 Melhor timeframe: ${bestTimeframe[0]} (${tfWinRate}% de acerto)`);
    }
    
    // Alvos
    if (stats.avgTargetsHit >= 4) {
      insights.push('🎯 Excelente gestão de alvos - média de 4+ alvos atingidos');
    } else if (stats.avgTargetsHit >= 2) {
      insights.push('✅ Boa gestão de alvos - mantendo disciplina');
    }
    
    // Volume de sinais
    if (stats.totalSignals >= 15) {
      insights.push('📊 Alta atividade - muitas oportunidades identificadas');
    } else if (stats.totalSignals <= 5) {
      insights.push('🔍 Seletividade alta - focando apenas nos melhores sinais');
    }
    
    return insights;
  }

  /**
   * Verifica se deve enviar relatório semanal
   */
  shouldSendWeeklyReport() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = domingo, 1 = segunda
    const hour = now.getHours();
    
    // Envia todo domingo às 20h
    if (dayOfWeek === 0 && hour === 20) {
      const currentWeek = this.getWeekKey(now);
      return this.lastWeeklyReport !== currentWeek;
    }
    
    return false;
  }

  /**
   * Marca relatório semanal como enviado
   */
  markWeeklyReportSent() {
    this.lastWeeklyReport = this.getWeekKey(new Date());
  }

  /**
   * Obtém chave da semana (YYYY-WW)
   */
  getWeekKey(date) {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  /**
   * Obtém número da semana
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Obtém início da semana
   */
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Segunda-feira
    return new Date(d.setDate(diff));
  }

  /**
   * Obtém fim da semana
   */
  getWeekEnd(date) {
    const weekStart = this.getWeekStart(date);
    return new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000); // Domingo
  }

  /**
   * Atualiza estatísticas mensais
   */
  updateMonthlyStats(signal) {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    
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

    if (signal.results.finalPnL > 0) {
      stats.winningSignals++;
    }

    if (signal.isMLDriven) {
      stats.mlSignals++;
      if (signal.results.finalPnL > 0) {
        stats.mlWins++;
      }
    }
  }

  /**
   * Gera relatório de performance
   */
  generatePerformanceReport() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const stats = this.monthlyStats.get(currentMonth) || {
      totalSignals: 0,
      winningSignals: 0,
      totalPnL: 0,
      avgTargetsHit: 0,
      mlSignals: 0,
      mlWins: 0
    };

    const winRate = stats.totalSignals > 0 ? (stats.winningSignals / stats.totalSignals * 100).toFixed(1) : 0;
    const mlWinRate = stats.mlSignals > 0 ? (stats.mlWins / stats.mlSignals * 100).toFixed(1) : 0;

    return {
      month: currentMonth,
      totalSignals: stats.totalSignals,
      winRate: parseFloat(winRate),
      totalPnL: stats.totalPnL,
      avgTargetsHit: stats.avgTargetsHit.toFixed(1),
      mlPerformance: {
        signals: stats.mlSignals,
        winRate: parseFloat(mlWinRate)
      },
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

  /**
   * Obtém top performers
   */
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

  /**
   * Gera ID único para sinal
   */
  generateSignalId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

export default PerformanceTrackerService;