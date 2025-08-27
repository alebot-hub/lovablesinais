/**
 * Serviço de geração de gráficos (versão simplificada para Windows)
 */

class ChartGeneratorService {
  /**
   * Gera dados do gráfico em formato JSON (sem renderização visual)
   */
  async generatePriceChart(symbol, data, indicators, patterns, signal) {
    try {
      console.log(`Gerando dados do gráfico para ${symbol}...`);

      // Retorna dados estruturados ao invés de imagem
      const chartData = {
        symbol,
        timestamp: new Date().toISOString(),
        data: {
          prices: data.close.slice(-20), // Últimos 20 pontos
          timestamps: data.timestamp.slice(-20),
          volume: data.volume.slice(-20)
        },
        indicators: {
          rsi: indicators.rsi,
          macd: indicators.macd,
          ma21: indicators.ma21,
          ma200: indicators.ma200
        },
        patterns: {
          support: patterns.support,
          resistance: patterns.resistance,
          breakout: patterns.breakout
        },
        signal: {
          entry: signal.entry,
          targets: signal.targets,
          stopLoss: signal.stopLoss,
          probability: signal.probability
        }
      };

      console.log(`Dados do gráfico gerados para ${symbol}`);
      return chartData;
    } catch (error) {
      console.error('Erro ao gerar dados do gráfico:', error.message);
      return null;
    }
  }

  /**
   * Gera dados do RSI
   */
  async generateRSIChart(data, rsiData) {
    try {
      return {
        type: 'RSI',
        data: rsiData.slice(-20),
        timestamps: data.timestamp.slice(-20),
        levels: {
          overbought: 70,
          oversold: 30
        }
      };
    } catch (error) {
      console.error('Erro ao gerar dados RSI:', error.message);
      return null;
    }
  }

  /**
   * Gera dados de volume
   */
  async generateVolumeChart(data) {
    try {
      return {
        type: 'Volume',
        data: data.volume.slice(-20),
        timestamps: data.timestamp.slice(-20),
        average: data.volume.reduce((a, b) => a + b, 0) / data.volume.length
      };
    } catch (error) {
      console.error('Erro ao gerar dados de volume:', error.message);
      return null;
    }
  }

  /**
   * Formata dados para exibição
   */
  formatChartData(chartData) {
    if (!chartData) return 'Dados não disponíveis';

    return `
📊 Gráfico: ${chartData.symbol}
💰 Preço atual: $${chartData.data.prices[chartData.data.prices.length - 1]?.toFixed(4)}
📈 RSI: ${chartData.indicators.rsi?.toFixed(1)}
🎯 Entrada: $${chartData.signal.entry?.toFixed(4)}
🛑 Stop: $${chartData.signal.stopLoss?.toFixed(4)}
    `;
  }
}

export default ChartGeneratorService;