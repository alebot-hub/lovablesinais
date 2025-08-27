/**
 * Serviço de gestão de risco avançada
 */

class RiskManagementService {
  constructor() {
    this.maxConcurrentTrades = 20; // Máximo 20 operações simultâneas
    this.maxDailyLoss = null; // Sem limite de perda diária
    this.maxSymbolExposure = 2; // Máximo 2 operações por símbolo
    this.dailyStats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      date: new Date().toDateString()
    };
  }

  /**
   * Verifica se pode abrir nova operação
   */
  canOpenTrade(symbol, activeMonitors) {
    // Reset stats se mudou o dia
    if (this.dailyStats.date !== new Date().toDateString()) {
      this.resetDailyStats();
    }

    // Verifica limite de operações simultâneas
    if (activeMonitors.size >= this.maxConcurrentTrades) {
      console.log(`❌ Limite de operações simultâneas atingido: ${activeMonitors.size}/${this.maxConcurrentTrades}`);
      return { allowed: false, reason: 'Limite de operações simultâneas' };
    }

    // Sem limite de perda diária - removido

    // Verifica exposição por símbolo
    const symbolCount = Array.from(activeMonitors.keys()).filter(s => s === symbol).length;
    if (symbolCount >= this.maxSymbolExposure) {
      console.log(`❌ Limite de exposição para ${symbol}: ${symbolCount}/${this.maxSymbolExposure}`);
      return { allowed: false, reason: `Limite de exposição para ${symbol}` };
    }

    return { allowed: true, reason: 'OK' };
  }

  /**
   * Registra resultado de operação
   */
  recordTrade(symbol, pnlPercent, isWin) {
    this.dailyStats.trades++;
    this.dailyStats.totalPnL += pnlPercent;
    
    if (isWin) {
      this.dailyStats.wins++;
    } else {
      this.dailyStats.losses++;
    }

    console.log(`📊 Trade registrado: ${symbol} ${isWin ? '✅' : '❌'} ${pnlPercent.toFixed(2)}%`);
    console.log(`📈 Stats diárias: ${this.dailyStats.wins}W/${this.dailyStats.losses}L (${this.dailyStats.totalPnL.toFixed(2)}%)`);
  }

  /**
   * Calcula tamanho da posição baseado no risco
   */
  calculatePositionSize(accountBalance, riskPercent = 2, stopLossPercent = 4.5) {
    const riskAmount = accountBalance * (riskPercent / 100);
    const positionSize = riskAmount / (stopLossPercent / 100);
    
    return {
      positionSize: positionSize.toFixed(2),
      riskAmount: riskAmount.toFixed(2),
      maxLoss: (positionSize * stopLossPercent / 100).toFixed(2)
    };
  }

  /**
   * Reset estatísticas diárias
   */
  resetDailyStats() {
    this.dailyStats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      date: new Date().toDateString()
    };
    console.log('📊 Estatísticas diárias resetadas');
  }

  /**
   * Obtém estatísticas atuais
   */
  getDailyStats() {
    return {
      ...this.dailyStats,
      winRate: this.dailyStats.trades > 0 ? (this.dailyStats.wins / this.dailyStats.trades * 100).toFixed(1) : 0
    };
  }
}

export default RiskManagementService;