/**
 * Serviço de geração de gráficos profissionais com Chart.js + Canvas
 */

import { createCanvas } from 'canvas';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import 'chartjs-chart-financial';

class ChartGeneratorService {
  constructor() {
    this.defaultWidth = 1200;
    this.defaultHeight = 800;
    this.chartOptions = this.getDefaultChartOptions();
  }

  /**
   * Gera gráfico completo do Bitcoin com indicadores
   */
  async generateBitcoinChart(symbol, data, indicators, signal = null) {
    try {
      console.log(`📊 Gerando gráfico profissional para ${symbol}...`);

      // Cria canvas
      const canvas = createCanvas(this.defaultWidth, this.defaultHeight);
      const ctx = canvas.getContext('2d');

      // Prepara dados de candlestick
      const candlestickData = this.prepareCandlestickData(data);
      
      // Prepara dados de indicadores
      const rsiData = this.prepareRSIData(data, indicators);
      const macdData = this.prepareMACDData(data, indicators);
      const volumeData = this.prepareVolumeData(data);
      const movingAveragesData = this.prepareMovingAveragesData(data, indicators);

      // Configuração do gráfico
      const chartConfig = {
        type: 'candlestick',
        data: {
          datasets: [
            // Candlesticks principais
            {
              label: `${symbol} Price`,
              type: 'candlestick',
              data: candlestickData,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              yAxisID: 'price'
            },
            // Média móvel 21
            {
              label: 'MA21',
              type: 'line',
              data: movingAveragesData.ma21,
              borderColor: '#f59e0b',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              yAxisID: 'price'
            },
            // Média móvel 200
            {
              label: 'MA200',
              type: 'line',
              data: movingAveragesData.ma200,
              borderColor: '#ef4444',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              yAxisID: 'price'
            },
            // Volume
            {
              label: 'Volume',
              type: 'bar',
              data: volumeData,
              backgroundColor: 'rgba(156, 163, 175, 0.3)',
              borderColor: '#9ca3af',
              borderWidth: 1,
              yAxisID: 'volume'
            },
            // RSI
            {
              label: 'RSI',
              type: 'line',
              data: rsiData,
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              borderWidth: 2,
              pointRadius: 0,
              yAxisID: 'rsi'
            },
            // MACD
            {
              label: 'MACD',
              type: 'line',
              data: macdData.macd,
              borderColor: '#06b6d4',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              yAxisID: 'macd'
            },
            // MACD Signal
            {
              label: 'MACD Signal',
              type: 'line',
              data: macdData.signal,
              borderColor: '#f97316',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              yAxisID: 'macd'
            }
          ]
        },
        options: this.getBitcoinChartOptions(signal)
      };

      // Adiciona níveis de trading se houver sinal
      if (signal) {
        this.addTradingLevels(chartConfig, signal);
      }

      // Cria e renderiza gráfico
      const chart = new Chart(ctx, chartConfig);
      
      // Adiciona anotações personalizadas
      this.addCustomAnnotations(ctx, signal, indicators);

      // Converte para buffer PNG
      const buffer = canvas.toBuffer('image/png');
      
      console.log(`✅ Gráfico gerado para ${symbol} (${buffer.length} bytes)`);
      return buffer;

    } catch (error) {
      console.error(`❌ Erro ao gerar gráfico para ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Prepara dados de candlestick
   */
  prepareCandlestickData(data) {
    return data.timestamp.map((timestamp, index) => ({
      x: new Date(timestamp),
      o: data.open[index],
      h: data.high[index],
      l: data.low[index],
      c: data.close[index]
    }));
  }

  /**
   * Prepara dados do RSI
   */
  prepareRSIData(data, indicators) {
    if (!indicators.rsi) return [];
    
    // RSI é um valor único, criamos linha horizontal
    return data.timestamp.map((timestamp, index) => ({
      x: new Date(timestamp),
      y: index === data.timestamp.length - 1 ? indicators.rsi : null
    })).filter(point => point.y !== null);
  }

  /**
   * Prepara dados do MACD
   */
  prepareMACDData(data, indicators) {
    const macdData = [];
    const signalData = [];

    if (indicators.macd) {
      data.timestamp.forEach((timestamp, index) => {
        if (index === data.timestamp.length - 1) {
          macdData.push({
            x: new Date(timestamp),
            y: indicators.macd.MACD
          });
          signalData.push({
            x: new Date(timestamp),
            y: indicators.macd.signal
          });
        }
      });
    }

    return { macd: macdData, signal: signalData };
  }

  /**
   * Prepara dados de volume
   */
  prepareVolumeData(data) {
    return data.timestamp.map((timestamp, index) => ({
      x: new Date(timestamp),
      y: data.volume[index]
    }));
  }

  /**
   * Prepara dados das médias móveis
   */
  prepareMovingAveragesData(data, indicators) {
    const ma21Data = [];
    const ma200Data = [];

    data.timestamp.forEach((timestamp, index) => {
      if (index === data.timestamp.length - 1) {
        if (indicators.ma21) {
          ma21Data.push({
            x: new Date(timestamp),
            y: indicators.ma21
          });
        }
        if (indicators.ma200) {
          ma200Data.push({
            x: new Date(timestamp),
            y: indicators.ma200
          });
        }
      }
    });

    return { ma21: ma21Data, ma200: ma200Data };
  }

  /**
   * Opções específicas para gráfico do Bitcoin
   */
  getBitcoinChartOptions(signal) {
    return {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Bitcoin Trading Analysis - ${new Date().toLocaleString('pt-BR')}`,
          font: { size: 20, weight: 'bold' },
          color: '#1f2937'
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { size: 12 },
            color: '#374151'
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: '#2563eb',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'minute',
            displayFormats: {
              minute: 'HH:mm',
              hour: 'HH:mm'
            }
          },
          grid: {
            color: 'rgba(156, 163, 175, 0.2)'
          },
          ticks: {
            color: '#6b7280',
            font: { size: 11 }
          }
        },
        price: {
          type: 'linear',
          position: 'left',
          grid: {
            color: 'rgba(156, 163, 175, 0.2)'
          },
          ticks: {
            color: '#6b7280',
            font: { size: 11 },
            callback: function(value) {
              return '$' + value.toFixed(2);
            }
          }
        },
        volume: {
          type: 'linear',
          position: 'right',
          max: Math.max(...(signal?.volumeData || [1])) * 4,
          grid: {
            display: false
          },
          ticks: {
            color: '#9ca3af',
            font: { size: 10 }
          }
        },
        rsi: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 100,
          grid: {
            display: false
          },
          ticks: {
            color: '#8b5cf6',
            font: { size: 10 }
          }
        },
        macd: {
          type: 'linear',
          position: 'right',
          grid: {
            display: false
          },
          ticks: {
            color: '#06b6d4',
            font: { size: 10 }
          }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      }
    };
  }

  /**
   * Adiciona níveis de trading ao gráfico
   */
  addTradingLevels(chartConfig, signal) {
    if (!signal || !signal.targets || !signal.stopLoss) return;

    // Linha de entrada
    chartConfig.data.datasets.push({
      label: 'Entrada',
      type: 'line',
      data: [
        { x: new Date(Date.now() - 60000), y: signal.entry },
        { x: new Date(Date.now() + 3600000), y: signal.entry }
      ],
      borderColor: '#3b82f6',
      backgroundColor: 'transparent',
      borderWidth: 3,
      borderDash: [5, 5],
      pointRadius: 0,
      yAxisID: 'price'
    });

    // Linhas de alvos
    signal.targets.forEach((target, index) => {
      chartConfig.data.datasets.push({
        label: `Alvo ${index + 1}`,
        type: 'line',
        data: [
          { x: new Date(Date.now() - 60000), y: target },
          { x: new Date(Date.now() + 3600000), y: target }
        ],
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [3, 3],
        pointRadius: 0,
        yAxisID: 'price'
      });
    });

    // Linha de stop loss
    chartConfig.data.datasets.push({
      label: 'Stop Loss',
      type: 'line',
      data: [
        { x: new Date(Date.now() - 60000), y: signal.stopLoss },
        { x: new Date(Date.now() + 3600000), y: signal.stopLoss }
      ],
      borderColor: '#ef4444',
      backgroundColor: 'transparent',
      borderWidth: 3,
      borderDash: [8, 4],
      pointRadius: 0,
      yAxisID: 'price'
    });
  }

  /**
   * Adiciona anotações personalizadas
   */
  addCustomAnnotations(ctx, signal, indicators) {
    // Adiciona caixa de informações
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(20, 20, 300, 120);
    
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, 300, 120);

    // Texto de informações
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('📊 ANÁLISE TÉCNICA', 30, 45);

    ctx.font = '14px Arial';
    if (indicators.rsi) {
      ctx.fillText(`RSI: ${indicators.rsi.toFixed(2)}`, 30, 70);
    }
    if (indicators.macd) {
      ctx.fillText(`MACD: ${indicators.macd.MACD?.toFixed(6) || 'N/A'}`, 30, 90);
    }
    if (signal) {
      ctx.fillText(`Probabilidade: ${signal.probability?.toFixed(1) || 'N/A'}%`, 30, 110);
      ctx.fillText(`Tendência: ${signal.trend || 'N/A'}`, 30, 130);
    }

    // Adiciona níveis RSI
    if (indicators.rsi) {
      // Linha RSI 70 (sobrecompra)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, this.defaultHeight - 150);
      ctx.lineTo(this.defaultWidth, this.defaultHeight - 150);
      ctx.stroke();

      // Linha RSI 30 (sobrevenda)
      ctx.strokeStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(0, this.defaultHeight - 100);
      ctx.lineTo(this.defaultWidth, this.defaultHeight - 100);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }
  }

  /**
   * Gera gráfico simples para Telegram
   */
  async generateTelegramChart(symbol, data, indicators, signal) {
    try {
      console.log(`📱 Gerando gráfico para Telegram: ${symbol}...`);

      // Canvas menor para Telegram
      const canvas = createCanvas(800, 600);
      const ctx = canvas.getContext('2d');

      // Dados simplificados (últimos 50 pontos)
      const recentData = {
        timestamp: data.timestamp.slice(-50),
        open: data.open.slice(-50),
        high: data.high.slice(-50),
        low: data.low.slice(-50),
        close: data.close.slice(-50),
        volume: data.volume.slice(-50)
      };

      const candlestickData = this.prepareCandlestickData(recentData);

      const chartConfig = {
        type: 'line', // Linha simples para Telegram
        data: {
          labels: recentData.timestamp.map(ts => new Date(ts)),
          datasets: [
            {
              label: `${symbol}`,
              data: recentData.close,
              borderColor: signal?.trend === 'BULLISH' ? '#10b981' : '#ef4444',
              backgroundColor: signal?.trend === 'BULLISH' ? 
                'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              borderWidth: 3,
              fill: true,
              tension: 0.1
            }
          ]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: `${symbol} - ${signal?.trend || 'ANÁLISE'} (${signal?.probability?.toFixed(1) || 'N/A'}%)`,
              font: { size: 18, weight: 'bold' },
              color: '#1f2937'
            },
            legend: {
              display: false
            }
          },
          scales: {
            x: {
              display: true,
              grid: { color: 'rgba(156, 163, 175, 0.3)' },
              ticks: {
                color: '#6b7280',
                maxTicksLimit: 8,
                callback: function(value, index) {
                  const date = new Date(recentData.timestamp[index]);
                  return date.toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  });
                }
              }
            },
            y: {
              display: true,
              grid: { color: 'rgba(156, 163, 175, 0.3)' },
              ticks: {
                color: '#6b7280',
                callback: function(value) {
                  return '$' + value.toFixed(4);
                }
              }
            }
          }
        }
      };

      const chart = new Chart(ctx, chartConfig);

      // Adiciona informações do sinal
      if (signal) {
        this.addTelegramSignalInfo(ctx, signal, indicators);
      }

      return canvas.toBuffer('image/png');

    } catch (error) {
      console.error(`❌ Erro ao gerar gráfico Telegram para ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Adiciona informações do sinal no gráfico do Telegram
   */
  addTelegramSignalInfo(ctx, signal, indicators) {
    // Caixa de informações
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(20, 450, 760, 130);
    
    ctx.strokeStyle = signal.trend === 'BULLISH' ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 450, 760, 130);

    // Título
    ctx.fillStyle = signal.trend === 'BULLISH' ? '#10b981' : '#ef4444';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`🎯 SINAL ${signal.trend} - ${signal.probability?.toFixed(1) || 'N/A'}%`, 30, 475);

    // Informações do sinal
    ctx.fillStyle = '#1f2937';
    ctx.font = '14px Arial';
    
    const lines = [
      `💰 Entrada: $${signal.entry?.toFixed(4) || 'N/A'}`,
      `🎯 Alvo 1: $${signal.targets?.[0]?.toFixed(4) || 'N/A'} | Alvo 6: $${signal.targets?.[5]?.toFixed(4) || 'N/A'}`,
      `🛑 Stop Loss: $${signal.stopLoss?.toFixed(4) || 'N/A'}`,
      `📊 RSI: ${indicators.rsi?.toFixed(2) || 'N/A'} | MACD: ${indicators.macd?.MACD?.toFixed(6) || 'N/A'}`
    ];

    lines.forEach((line, index) => {
      ctx.fillText(line, 30, 500 + (index * 20));
    });

    // Timestamp
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px Arial';
    ctx.fillText(`⏰ ${new Date().toLocaleString('pt-BR')}`, 30, 570);
  }

  /**
   * Opções padrão do gráfico
   */
  getDefaultChartOptions() {
    return {
      responsive: false,
      maintainAspectRatio: false,
      animation: false, // Desabilita animação para performance
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      }
    };
  }

  /**
   * Gera gráfico de RSI separado
   */
  async generateRSIChart(data, rsiData) {
    try {
      const canvas = createCanvas(800, 300);
      const ctx = canvas.getContext('2d');

      const chartConfig = {
        type: 'line',
        data: {
          labels: data.timestamp.map(ts => new Date(ts)),
          datasets: [{
            label: 'RSI',
            data: rsiData,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2,
            fill: true
          }]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: 'RSI (Relative Strength Index)',
              font: { size: 16, weight: 'bold' }
            }
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: {
                callback: function(value) {
                  if (value === 70) return '70 (Sobrecompra)';
                  if (value === 30) return '30 (Sobrevenda)';
                  return value;
                }
              }
            }
          }
        }
      };

      // Adiciona linhas de referência RSI
      chartConfig.data.datasets.push(
        {
          label: 'Sobrecompra (70)',
          data: Array(data.timestamp.length).fill(70),
          borderColor: '#ef4444',
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0
        },
        {
          label: 'Sobrevenda (30)',
          data: Array(data.timestamp.length).fill(30),
          borderColor: '#10b981',
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0
        }
      );

      const chart = new Chart(ctx, chartConfig);
      return canvas.toBuffer('image/png');

    } catch (error) {
      console.error('❌ Erro ao gerar gráfico RSI:', error.message);
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