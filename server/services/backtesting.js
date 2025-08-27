/**
 * Serviço de backtesting
 */

class BacktestingService {
  constructor() {
    this.results = [];
  }

  /**
   * Executa backtesting para um símbolo
   */
  async runBacktest(symbol, historicalData, analysisService, scoringService, mlService) {
    try {
      console.log(`Iniciando backtesting para ${symbol}...`);

      const trades = [];
      const windowSize = 100; // Janela para análise

      for (let i = windowSize; i < historicalData.close.length - 10; i++) {
        // Dados para análise
        const data = {
          timestamp: historicalData.timestamp.slice(i - windowSize, i),
          open: historicalData.open.slice(i - windowSize, i),
          high: historicalData.high.slice(i - windowSize, i),
          low: historicalData.low.slice(i - windowSize, i),
          close: historicalData.close.slice(i - windowSize, i),
          volume: historicalData.volume.slice(i - windowSize, i)
        };

        // Análise técnica
        const indicators = analysisService.calculateIndicators(data);
        const patterns = analysisService.detectPatterns(data);

        // Previsão ML
        const mlProbability = await mlService.predict(symbol, data, indicators);

        // Pontuação do sinal
        const scoring = scoringService.calculateSignalScore(data, indicators, patterns, mlProbability);

        // Se sinal válido, simula trade
        if (scoring.isValid) {
          const trade = this.simulateTrade(
            historicalData,
            i,
            scoring.totalScore,
            scoringService.calculateTradingLevels(data.close[data.close.length - 1])
          );

          if (trade) {
            trades.push(trade);
          }
        }
      }

      // Calcula métricas
      const metrics = this.calculateMetrics(trades);
      
      const result = {
        symbol,
        totalTrades: trades.length,
        winningTrades: trades.filter(t => t.profit > 0).length,
        losingTrades: trades.filter(t => t.profit <= 0).length,
        totalProfit: trades.reduce((sum, t) => sum + t.profit, 0),
        metrics,
        trades: trades.slice(-10) // Últimos 10 trades para análise
      };

      this.results.push(result);
      console.log(`Backtesting concluído para ${symbol}: ${result.winningTrades}/${result.totalTrades} trades vencedores`);

      return result;
    } catch (error) {
      console.error(`Erro no backtesting de ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Simula um trade
   */
  simulateTrade(data, entryIndex, signalScore, levels) {
    const entry = levels.entry;
    const targets = levels.targets;
    const stopLoss = levels.stopLoss;

    let exitPrice = null;
    let exitReason = null;
    let exitIndex = null;

    // Procura saída nos próximos 10 períodos
    for (let j = entryIndex + 1; j < Math.min(entryIndex + 11, data.close.length); j++) {
      const currentPrice = data.close[j];

      // Verifica stop loss
      if (currentPrice <= stopLoss) {
        exitPrice = stopLoss;
        exitReason = 'STOP_LOSS';
        exitIndex = j;
        break;
      }

      // Verifica alvos
      for (let k = 0; k < targets.length; k++) {
        if (currentPrice >= targets[k]) {
          exitPrice = targets[k];
          exitReason = `TARGET_${k + 1}`;
          exitIndex = j;
          break;
        }
      }

      if (exitPrice) break;
    }

    // Se não encontrou saída, usa preço de fechamento do último período
    if (!exitPrice) {
      exitIndex = Math.min(entryIndex + 10, data.close.length - 1);
      exitPrice = data.close[exitIndex];
      exitReason = 'TIME_EXIT';
    }

    const profit = (exitPrice - entry) / entry * 100;
    const duration = exitIndex - entryIndex;

    return {
      entryTime: data.timestamp[entryIndex],
      exitTime: data.timestamp[exitIndex],
      entryPrice: entry,
      exitPrice,
      profit,
      duration,
      exitReason,
      signalScore
    };
  }

  /**
   * Calcula métricas de performance
   */
  calculateMetrics(trades) {
    if (trades.length === 0) {
      return {
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        sharpeRatio: 0
      };
    }

    const winningTrades = trades.filter(t => t.profit > 0);
    const losingTrades = trades.filter(t => t.profit <= 0);

    const winRate = (winningTrades.length / trades.length) * 100;
    const avgProfit = winningTrades.length > 0 ? 
      winningTrades.reduce((sum, t) => sum + t.profit, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? 
      Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0) / losingTrades.length) : 0;

    const totalProfit = winningTrades.reduce((sum, t) => sum + t.profit, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;

    // Calcula drawdown máximo
    let maxDrawdown = 0;
    let peak = 0;
    let cumulativeReturn = 0;

    trades.forEach(trade => {
      cumulativeReturn += trade.profit;
      if (cumulativeReturn > peak) {
        peak = cumulativeReturn;
      }
      const drawdown = peak - cumulativeReturn;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    // Calcula Sharpe Ratio simplificado
    const returns = trades.map(t => t.profit);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    return {
      winRate,
      avgProfit,
      avgLoss,
      profitFactor,
      maxDrawdown,
      sharpeRatio
    };
  }

  /**
   * Gera relatório de backtesting
   */
  generateReport() {
    if (this.results.length === 0) {
      return 'Nenhum resultado de backtesting disponível.';
    }

    let report = '📊 RELATÓRIO DE BACKTESTING\n\n';

    this.results.forEach(result => {
      report += `🔸 ${result.symbol}\n`;
      report += `   Trades: ${result.totalTrades}\n`;
      report += `   Taxa de acerto: ${result.metrics.winRate.toFixed(1)}%\n`;
      report += `   Profit Factor: ${result.metrics.profitFactor.toFixed(2)}\n`;
      report += `   Lucro total: ${result.totalProfit.toFixed(2)}%\n`;
      report += `   Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%\n\n`;
    });

    // Estatísticas gerais
    const totalTrades = this.results.reduce((sum, r) => sum + r.totalTrades, 0);
    const totalWinning = this.results.reduce((sum, r) => sum + r.winningTrades, 0);
    const overallWinRate = totalTrades > 0 ? (totalWinning / totalTrades) * 100 : 0;
    const totalProfit = this.results.reduce((sum, r) => sum + r.totalProfit, 0);

    report += `📈 RESUMO GERAL\n`;
    report += `Total de trades: ${totalTrades}\n`;
    report += `Taxa de acerto geral: ${overallWinRate.toFixed(1)}%\n`;
    report += `Lucro total: ${totalProfit.toFixed(2)}%\n`;

    return report;
  }

  /**
   * Obtém melhores performers
   */
  getBestPerformers(limit = 5) {
    return this.results
      .sort((a, b) => b.metrics.profitFactor - a.metrics.profitFactor)
      .slice(0, limit)
      .map(result => ({
        symbol: result.symbol,
        winRate: result.metrics.winRate,
        profitFactor: result.metrics.profitFactor,
        totalProfit: result.totalProfit
      }));
  }

  /**
   * Limpa resultados
   */
  clearResults() {
    this.results = [];
  }
}

export default BacktestingService;