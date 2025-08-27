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
  updateSignalResult(symbol, targetsHit, finalPnL, exitReason, realizedPnL = null) {
    const signal = this.signals.find(s => s.symbol === symbol && s.status === 'ACTIVE');
    
    if (signal) {
      signal.status = 'COMPLETED';
      signal.results.targetsHit = targetsHit;
      signal.results.finalPnL = finalPnL * 15; // Aplica alavancagem 15x
      signal.results.realizedPnL = realizedPnL ? realizedPnL * 15 : signal.results.finalPnL;
      signal.results.unrealizedPnL = signal.results.finalPnL - signal.results.realizedPnL;
      signal.results.duration = new Date() - signal.timestamp;
      signal.results.exitReason = exitReason;
      signal.results.isStopMobile = exitReason === 'STOP_MOBILE';
      signal.results.isPartialWin = targetsHit > 0 && exitReason !== 'ALL_TARGETS';

      this.updateMonthlyStats(signal);
      this.updateWeeklyStats(signal, 'COMPLETED');
      console.log(`📈 Resultado atualizado: ${symbol} - ${targetsHit}/6 alvos (${(finalPnL * 15).toFixed(2)}% total, ${(realizedPnL * 15).toFixed(2)}% realizado)`);
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
        stopMobileActivations: 0,
        stopMobileAvgTargets: 0,
        partialWins: 0,
        fullLosses: 0,
        fullWins: 0,
        partialLosses: 0,
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
      
      // Classifica como vitória se teve lucro OU se foi stop móvel com alvos
      const isWin = signal.results.finalPnL > 0 || 
                   (signal.results.isStopMobile && signal.results.targetsHit > 0) ||
                   signal.results.exitReason === 'STOP_MOBILE';
      
      if (isWin) {
        stats.winningSignals++;
        if (signal.isMLDriven) stats.mlWins++;
        if (signal.timeframe && stats.timeframeBreakdown[signal.timeframe]) {
          stats.timeframeBreakdown[signal.timeframe].wins++;
        }
        
        // Conta vitórias parciais vs totais
        if (signal.results.exitReason === 'ALL_TARGETS') {
          stats.fullWins = (stats.fullWins || 0) + 1;
        } else if (signal.results.isPartialWin) {
          stats.partialWins = (stats.partialWins || 0) + 1;
        }
        
        // Atualiza melhor trade
        if (!stats.bestTrade || signal.results.finalPnL > stats.bestTrade.pnl) {
          stats.bestTrade = {
            symbol: signal.symbol,
            pnl: signal.results.finalPnL,
            targetsHit: signal.results.targetsHit,
            duration: signal.results.duration,
            exitReason: signal.results.exitReason
          };
        }
        
        // Top performers
        stats.topPerformers.push({
          symbol: signal.symbol,
          pnl: signal.results.finalPnL,
          targetsHit: signal.results.targetsHit,
          exitReason: signal.results.exitReason,
          realizedPnL: signal.results.realizedPnL
        });
        stats.topPerformers.sort((a, b) => b.pnl - a.pnl);
        stats.topPerformers = stats.topPerformers.slice(0, 5);
        
      } else if (signal.results.finalPnL <= 0) {
        stats.losingSignals++;
        
        // Conta perdas totais vs parciais
        if (signal.results.targetsHit === 0) {
          stats.fullLosses = (stats.fullLosses || 0) + 1;
        } else {
          stats.partialLosses = (stats.partialLosses || 0) + 1;
        }
        
        // Atualiza pior trade
        if (!stats.worstTrade || signal.results.finalPnL < stats.worstTrade.pnl) {
          stats.worstTrade = {
            symbol: signal.symbol,
            pnl: signal.results.finalPnL,
            duration: signal.results.duration,
            targetsHit: signal.results.targetsHit,
            exitReason: signal.results.exitReason
          };
        }
        
        // Worst performers
        stats.worstPerformers.push({
          symbol: signal.symbol,
          pnl: signal.results.finalPnL,
          targetsHit: signal.results.targetsHit,
          exitReason: signal.results.exitReason
        });
        stats.worstPerformers.sort((a, b) => a.pnl - b.pnl);
        stats.worstPerformers = stats.worstPerformers.slice(0, 3);
      }
      
      // Categoria especial para stop móvel (sempre considerado sucesso)
      if (signal.results.isStopMobile) {
        stats.stopMobileActivations = (stats.stopMobileActivations || 0) + 1;
        stats.stopMobileAvgTargets = stats.stopMobileActivations > 0 ? 
          ((stats.stopMobileAvgTargets || 0) * (stats.stopMobileActivations - 1) + signal.results.targetsHit) / stats.stopMobileActivations : 
          signal.results.targetsHit;
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
      return { hasData: false, message: 'Dados insuficientes' };
    }

    // Filtra sinais completos da semana
    const weekSignals = this.signals.filter(s => 
      s.timestamp >= stats.weekStart && 
      s.timestamp <= stats.weekEnd && 
      s.status === 'COMPLETED' &&
      s.results
    );

    // Inicializa métricas
    const metrics = {
      totalTrades: 0,
      winningTrades: 0,
      totalRawPnL: 0,
      totalRiskAdjustedPnL: 0,
      totalRealizedProfit: 0,
      totalUnrealizedProfit: 0,
      targetDistribution: [0, 0, 0, 0, 0, 0], // Contador de alvos 1-6
      timeframeStats: {},
      bestTrade: null,
      worstTrade: null
    };

    // Processa cada sinal
    weekSignals.forEach(signal => {
      const result = signal.results;
      const pnl = result.riskAdjustedPnL || result.finalPnL;
      
      // Atualiza métricas básicas
      metrics.totalTrades++;
      metrics.totalRawPnL += result.finalPnL;
      metrics.totalRiskAdjustedPnL += pnl;
      metrics.totalRealizedProfit += result.realizedProfit || 0;
      metrics.totalUnrealizedProfit += result.unrealizedProfit || 0;
      
      // Conta vitórias
      if (pnl > 0) metrics.winningTrades++;
      
      // Atualiza distribuição de alvos
      if (result.targetsHit > 0 && result.targetsHit <= 6) {
        metrics.targetDistribution[result.targetsHit - 1]++;
      }
      
      // Atualiza melhor/maior trade
      if (!metrics.bestTrade || pnl > metrics.bestTrade.pnl) {
        metrics.bestTrade = {
          symbol: signal.symbol,
          pnl: pnl,
          targetsHit: result.targetsHit,
          timeframe: signal.timeframe
        };
      }
      
      // Atualiza pior trade
      if (!metrics.worstTrade || pnl < metrics.worstTrade.pnl) {
        metrics.worstTrade = {
          symbol: signal.symbol,
          pnl: pnl,
          targetsHit: result.targetsHit,
          timeframe: signal.timeframe
        };
      }
      
      // Atualiza estatísticas por timeframe
      const tf = signal.timeframe || '1h';
      if (!metrics.timeframeStats[tf]) {
        metrics.timeframeStats[tf] = { trades: 0, wins: 0, pnl: 0 };
      }
      metrics.timeframeStats[tf].trades++;
      metrics.timeframeStats[tf].pnl += pnl;
      if (pnl > 0) metrics.timeframeStats[tf].wins++;
    });

    // Calcula médias e percentuais
    const winRate = metrics.totalTrades > 0 ? 
      (metrics.winningTrades / metrics.totalTrades * 100) : 0;
      
    const avgRawPnL = metrics.totalTrades > 0 ? 
      metrics.totalRawPnL / metrics.totalTrades : 0;
      
    const avgRiskAdjustedPnL = metrics.totalTrades > 0 ? 
      metrics.totalRiskAdjustedPnL / metrics.totalTrades : 0;

    // Formata estatísticas por timeframe
    const timeframeStats = Object.entries(metrics.timeframeStats).map(([tf, data]) => ({
      timeframe: tf,
      trades: data.trades,
      winRate: data.trades > 0 ? (data.wins / data.trades * 100).toFixed(1) : 0,
      avgPnl: (data.pnl / data.trades).toFixed(2)
    }));

    // Formata distribuição de alvos
    const targetDistribution = metrics.targetDistribution.map((count, index) => ({
      target: index + 1,
      count: count,
      percentage: ((count / metrics.totalTrades) * 100).toFixed(1) + '%',
      profitShare: [50, 15, 10, 10, 10, 5][index] + '%'
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
        profitRealizationRatio: metrics.totalRiskAdjustedPnL > 0 ? 
          (metrics.totalRealizedProfit / metrics.totalRiskAdjustedPnL * 100).toFixed(1) + '%' : '0%',
        stopMobileRate: stats.completedSignals > 0 ? 
          ((stats.stopMobileActivations || 0) / stats.completedSignals * 100).toFixed(1) + '%' : '0%'
      },
      performance: {
        bestTrade: metrics.bestTrade ? {
          symbol: metrics.bestTrade.symbol,
          pnl: metrics.bestTrade.pnl.toFixed(2) + '%',
          targetsHit: metrics.bestTrade.targetsHit,
          timeframe: metrics.bestTrade.timeframe,
          exitReason: metrics.bestTrade.exitReason
        } : null,
        worstTrade: metrics.worstTrade ? {
          symbol: metrics.worstTrade.symbol,
          pnl: metrics.worstTrade.pnl.toFixed(2) + '%',
          targetsHit: metrics.worstTrade.targetsHit,
          timeframe: metrics.worstTrade.timeframe,
          exitReason: metrics.worstTrade.exitReason
        } : null,
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
    
    // Stop móvel
    if (stats.stopMobileActivations > 0) {
      const stopMobileRate = (stats.stopMobileActivations / stats.completedSignals * 100).toFixed(1);
      insights.push(`🛡️ Stop móvel ativado em ${stopMobileRate}% das operações (média ${stats.stopMobileAvgTargets.toFixed(1)} alvos)`);
    }
    
    // Gestão de risco
    if (stats.partialWins > stats.fullLosses) {
      insights.push('✅ Gestão de risco eficiente - mais ganhos parciais que perdas totais');
    }
    
    // Eficiência do stop móvel
    if (stats.stopMobileActivations >= 3) {
      const stopMobileEfficiency = stats.stopMobileAvgTargets;
      if (stopMobileEfficiency >= 2.5) {
        insights.push(`🛡️ Stop móvel muito eficiente - média de ${stopMobileEfficiency.toFixed(1)} alvos antes da ativação`);
      } else if (stopMobileEfficiency >= 1.5) {
        insights.push(`🛡️ Stop móvel funcionando bem - protegendo lucros parciais`);
      }
    }
    
    // Análise de realizações
    const realizationRate = stats.completedSignals > 0 ? 
      ((stats.partialWins + stats.fullWins) / stats.completedSignals * 100) : 0;
    if (realizationRate >= 80) {
      insights.push('💰 Excelente taxa de realização de lucros');
    } else if (realizationRate >= 60) {
      insights.push('💰 Boa disciplina na realização de lucros');
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