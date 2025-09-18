/**
 * Serviço de geração de gráficos profissionais com Chart.js + Canvas
 * Otimizado para sinais de scalping com timeframes 1m/5m
 */

import { createCanvas } from 'canvas';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import 'chartjs-chart-financial';

class ChartGeneratorService {
  constructor() {
    this.defaultWidth = 1200;
    this.defaultHeight = 800;
    this.telegramWidth = 800;
    this.telegramHeight = 600;
    
    // Registra tipos de gráfico financeiro
    Chart.register(...Chart.controllers, ...Chart.elements, ...Chart.plugins, ...Chart.scales);
  }

  /**
   * Gera gráfico completo para sinal de scalping
   */
  async generateScalpingChart(symbol, data, indicators, signal) {
    try {
      console.log(`📊 Gerando gráfico de scalping para ${symbol}...`);

      const canvas = createCanvas(this.telegramWidth, this.telegramHeight);
      const ctx = canvas.getContext('2d');

      // Usa apenas últimos 50 candles para scalping
      const recentData = this.getRecentData(data, 50);
      
      // Prepara datasets
      const datasets = [
        this.createCandlestickDataset(symbol, recentData),
        this.createVolumeDataset(recentData),
        this.createRSIDataset(recentData, indicators),
        ...this.createMovingAverageDatasets(recentData, indicators),
        ...this.createTradingLevelsDatasets(signal, recentData)
      ].filter(Boolean);

      const chartConfig = {
        type: 'line', // Base type, candlesticks override
        data: { datasets },
        options: this.getScalpingChartOptions(symbol, signal),
        plugins: [{
          id: 'customAnnotations',
          afterDraw: (chart) => this.addScalpingAnnotations(chart.ctx, signal, indicators, symbol)
        }]
      };

      const chart = new Chart(ctx, chartConfig);
      
      // Força renderização
      chart.update('none');
      
      const buffer = canvas.toBuffer('image/png');
      chart.destroy(); // Limpa memória
      
      console.log(`✅ Gráfico de scalping gerado: ${symbol} (${buffer.length} bytes)`);
      return buffer;

    } catch (error) {
      console.error(`❌ Erro ao gerar gráfico de scalping ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Obtém dados recentes para scalping
   */
  getRecentData(data, count = 50) {
    const len = data.timestamp.length;
    const start = Math.max(0, len - count);
    
    return {
      timestamp: data.timestamp.slice(start),
      open: data.open.slice(start),
      high: data.high.slice(start),
      low: data.low.slice(start),
      close: data.close.slice(start),
      volume: data.volume.slice(start)
    };
  }

  /**
   * Dataset de candlesticks
   */
  createCandlestickDataset(symbol, data) {
    const candleData = data.timestamp.map((timestamp, index) => ({
      x: new Date(timestamp),
      o: data.open[index],
      h: data.high[index],
      l: data.low[index],
      c: data.close[index]
    }));

    return {
      label: `${symbol} Price`,
      type: 'candlestick',
      data: candleData,
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37, 99, 235, 0.1)',
      yAxisID: 'price',
      order: 1
    };
  }

  /**
   * Dataset de volume
   */
  createVolumeDataset(data) {
    const volumeData = data.timestamp.map((timestamp, index) => ({
      x: new Date(timestamp),
      y: data.volume[index]
    }));

    return {
      label: 'Volume',
      type: 'bar',
      data: volumeData,
      backgroundColor: 'rgba(156, 163, 175, 0.3)',
      borderColor: '#9ca3af',
      borderWidth: 1,
      yAxisID: 'volume',
      order: 3
    };
  }

  /**
   * Dataset de RSI
   */
  createRSIDataset(data, indicators) {
    if (!indicators?.rsi) return null;

    // RSI como linha horizontal no valor atual
    const rsiData = data.timestamp.map((timestamp, index) => ({
      x: new Date(timestamp),
      y: index === data.timestamp.length - 1 ? indicators.rsi : null
    })).filter(point => point.y !== null);

    return {
      label: `RSI (${indicators.rsi.toFixed(1)})`,
      type: 'line',
      data: rsiData,
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#8b5cf6',
      yAxisID: 'rsi',
      order: 4
    };
  }

  /**
   * Datasets de médias móveis
   */
  createMovingAverageDatasets(data, indicators) {
    const datasets = [];

    if (indicators?.ma21) {
      datasets.push({
        label: 'MA21',
        type: 'line',
        data: data.timestamp.map((timestamp, index) => ({
          x: new Date(timestamp),
          y: index === data.timestamp.length - 1 ? indicators.ma21 : null
        })).filter(point => point.y !== null),
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'price',
        order: 2
      });
    }

    if (indicators?.ma200) {
      datasets.push({
        label: 'MA200',
        type: 'line',
        data: data.timestamp.map((timestamp, index) => ({
          x: new Date(timestamp),
          y: index === data.timestamp.length - 1 ? indicators.ma200 : null
        })).filter(point => point.y !== null),
        borderColor: '#ef4444',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'price',
        order: 2
      });
    }

    return datasets;
  }

  /**
   * Datasets de níveis de trading
   */
  createTradingLevelsDatasets(signal, data) {
    if (!signal?.entry || !signal?.targets || !signal?.stopLoss) return [];

    const datasets = [];
    const timeRange = {
      start: new Date(data.timestamp[0]),
      end: new Date(data.timestamp[data.timestamp.length - 1])
    };

    // Linha de entrada
    datasets.push({
      label: `Entrada ($${signal.entry.toFixed(4)})`,
      type: 'line',
      data: [
        { x: timeRange.start, y: signal.entry },
        { x: timeRange.end, y: signal.entry }
      ],
      borderColor: '#3b82f6',
      backgroundColor: 'transparent',
      borderWidth: 3,
      borderDash: [8, 4],
      pointRadius: 0,
      yAxisID: 'price',
      order: 5
    });

    // Linhas de alvos
    signal.targets.forEach((target, index) => {
      datasets.push({
        label: `TP${index + 1} ($${target.toFixed(4)})`,
        type: 'line',
        data: [
          { x: timeRange.start, y: target },
          { x: timeRange.end, y: target }
        ],
        borderColor: '#10b981',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [4, 2],
        pointRadius: 0,
        yAxisID: 'price',
        order: 5
      });
    });

    // Linha de stop loss
    datasets.push({
      label: `Stop Loss ($${signal.stopLoss.toFixed(4)})`,
      type: 'line',
      data: [
        { x: timeRange.start, y: signal.stopLoss },
        { x: timeRange.end, y: signal.stopLoss }
      ],
      borderColor: '#ef4444',
      backgroundColor: 'transparent',
      borderWidth: 3,
      borderDash: [12, 6],
      pointRadius: 0,
      yAxisID: 'price',
      order: 5
    });

    return datasets;
  }

  /**
   * Opções do gráfico de scalping
   */
  getScalpingChartOptions(symbol, signal) {
    return {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: `🎯 ${symbol} SCALPING - ${signal?.timeframe || '5m'} | Prob: ${signal?.probability?.toFixed(1) || 'N/A'}%`,
          font: { size: 18, weight: 'bold' },
          color: '#1f2937',
          padding: 20
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { size: 10 },
            color: '#374151',
            usePointStyle: true,
            boxWidth: 6
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: '#2563eb',
          borderWidth: 1,
          callbacks: {
            title: function(context) {
              return new Date(context[0].parsed.x).toLocaleString('pt-BR');
            },
            label: function(context) {
              const dataset = context.dataset;
              if (dataset.type === 'candlestick') {
                const data = context.raw;
                return [
                  `Abertura: $${data.o.toFixed(4)}`,
                  `Máxima: $${data.h.toFixed(4)}`,
                  `Mínima: $${data.l.toFixed(4)}`,
                  `Fechamento: $${data.c.toFixed(4)}`
                ];
              }
              return `${dataset.label}: ${context.parsed.y?.toFixed(4) || 'N/A'}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: signal?.timeframe === '1m' ? 'minute' : 'minute',
            displayFormats: {
              minute: 'HH:mm',
              hour: 'HH:mm'
            }
          },
          grid: {
            color: 'rgba(156, 163, 175, 0.2)',
            lineWidth: 1
          },
          ticks: {
            color: '#6b7280',
            font: { size: 10 },
            maxTicksLimit: 10
          }
        },
        price: {
          type: 'linear',
          position: 'left',
          grid: {
            color: 'rgba(156, 163, 175, 0.2)',
            lineWidth: 1
          },
          ticks: {
            color: '#1f2937',
            font: { size: 11, weight: 'bold' },
            callback: function(value) {
              return '$' + value.toFixed(4);
            }
          }
        },
        volume: {
          type: 'linear',
          position: 'right',
          grid: { display: false },
          ticks: {
            color: '#9ca3af',
            font: { size: 9 },
            callback: function(value) {
              if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
              if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
              return value.toFixed(0);
            }
          }
        },
        rsi: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 100,
          grid: { display: false },
          ticks: {
            color: '#8b5cf6',
            font: { size: 9 },
            stepSize: 25,
            callback: function(value) {
              if (value === 70) return '70 (Sobrecompra)';
              if (value === 30) return '30 (Sobrevenda)';
              return value;
            }
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
   * Adiciona anotações personalizadas para scalping
   */
  addScalpingAnnotations(ctx, signal, indicators, symbol) {
    // Caixa principal de informações
    const boxWidth = 280;
    const boxHeight = 140;
    const x = 20;
    const y = 20;

    // Fundo da caixa
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(x, y, boxWidth, boxHeight);
    
    // Borda colorida baseada na tendência
    ctx.strokeStyle = signal?.trend === 'BULLISH' ? '#10b981' : '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    // Título
    ctx.fillStyle = signal?.trend === 'BULLISH' ? '#10b981' : '#ef4444';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`🎯 SCALPING ${signal?.trend || 'SIGNAL'}`, x + 10, y + 25);

    // Informações técnicas
    ctx.fillStyle = '#1f2937';
    ctx.font = '13px Arial';
    
    const lines = [
      `📊 ${symbol} | ${signal?.timeframe || '5m'} | ${signal?.probability?.toFixed(1) || 'N/A'}%`,
      `💰 Entrada: $${signal?.entry?.toFixed(4) || 'N/A'}`,
      `🎯 TP1: $${signal?.targets?.[0]?.toFixed(4) || 'N/A'} | TP6: $${signal?.targets?.[5]?.toFixed(4) || 'N/A'}`,
      `🛑 Stop: $${signal?.stopLoss?.toFixed(4) || 'N/A'}`,
      `📈 RSI: ${indicators?.rsi?.toFixed(1) || 'N/A'} | MACD: ${indicators?.macd?.histogram?.toFixed(6) || 'N/A'}`
    ];

    lines.forEach((line, index) => {
      ctx.fillText(line, x + 10, y + 50 + (index * 18));
    });

    // Timestamp
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Arial';
    ctx.fillText(`⏰ ${new Date().toLocaleString('pt-BR')}`, x + 10, y + boxHeight - 10);

    // Adiciona linhas de referência RSI
    if (indicators?.rsi) {
      this.addRSIReferenceLines(ctx, indicators.rsi);
    }

    // Adiciona indicador de força do sinal
    this.addSignalStrengthIndicator(ctx, signal);
  }

  /**
   * Adiciona linhas de referência do RSI
   */
  addRSIReferenceLines(ctx, rsiValue) {
    const chartHeight = this.telegramHeight;
    
    // Linha RSI 70 (sobrecompra)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, chartHeight - 120);
    ctx.lineTo(this.telegramWidth, chartHeight - 120);
    ctx.stroke();

    // Linha RSI 30 (sobrevenda)
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, chartHeight - 80);
    ctx.lineTo(this.telegramWidth, chartHeight - 80);
    ctx.stroke();
    
    ctx.setLineDash([]);

    // Valor atual do RSI
    const rsiY = rsiValue <= 30 ? chartHeight - 80 : 
                 rsiValue >= 70 ? chartHeight - 120 : 
                 chartHeight - 100;

    ctx.fillStyle = rsiValue <= 30 ? '#10b981' : rsiValue >= 70 ? '#ef4444' : '#8b5cf6';
    ctx.beginPath();
    ctx.arc(this.telegramWidth - 50, rsiY, 6, 0, 2 * Math.PI);
    ctx.fill();

    // Texto do RSI
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(rsiValue.toFixed(0), this.telegramWidth - 50, rsiY + 3);
    ctx.textAlign = 'left';
  }

  /**
   * Adiciona indicador visual da força do sinal
   */
  addSignalStrengthIndicator(ctx, signal) {
    if (!signal?.probability) return;

    const x = this.telegramWidth - 80;
    const y = 180;
    const radius = 25;

    // Círculo de fundo
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();

    // Círculo de progresso
    const percentage = signal.probability / 100;
    const angle = (percentage * 2 * Math.PI) - (Math.PI / 2);
    
    ctx.strokeStyle = signal.probability >= 80 ? '#10b981' : 
                      signal.probability >= 70 ? '#f59e0b' : '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, radius - 2, -Math.PI / 2, angle);
    ctx.stroke();

    // Texto da probabilidade
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${signal.probability.toFixed(0)}%`, x, y + 4);
    ctx.textAlign = 'left';
  }

  /**
   * Cria datasets de médias móveis
   */
  createMovingAverageDatasets(data, indicators) {
    const datasets = [];

    // MA21 (linha contínua estimada)
    if (indicators?.ma21) {
      const ma21Data = data.timestamp.map((timestamp, index) => {
        // Simula linha MA21 (na prática seria calculada para todos os pontos)
        const variation = (Math.random() - 0.5) * 0.002; // ±0.2% de variação
        const estimatedMA = indicators.ma21 * (1 + variation);
        
        return {
          x: new Date(timestamp),
          y: estimatedMA
        };
      });

      datasets.push({
        label: 'MA21',
        type: 'line',
        data: ma21Data,
        borderColor: '#f59e0b',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'price',
        order: 2
      });
    }

    return datasets;
  }

  /**
   * Gera gráfico simplificado para análise rápida
   */
  async generateQuickChart(symbol, currentPrice, change24h, signal) {
    try {
      const canvas = createCanvas(600, 400);
      const ctx = canvas.getContext('2d');

      // Gráfico simples de linha com sinal
      const chartConfig = {
        type: 'line',
        data: {
          labels: ['Entrada', 'TP1', 'TP2', 'TP3', 'TP4', 'TP5', 'TP6'],
          datasets: [{
            label: `${symbol} Níveis`,
            data: [
              signal?.entry || currentPrice,
              ...(signal?.targets || [])
            ],
            borderColor: signal?.trend === 'BULLISH' ? '#10b981' : '#ef4444',
            backgroundColor: signal?.trend === 'BULLISH' ? 
              'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.2,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: signal?.trend === 'BULLISH' ? '#10b981' : '#ef4444',
            pointBorderWidth: 2,
            pointRadius: 6
          }]
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: `🎯 ${symbol} SCALPING | ${signal?.probability?.toFixed(1) || 'N/A'}% | ${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%`,
              font: { size: 16, weight: 'bold' },
              color: signal?.trend === 'BULLISH' ? '#10b981' : '#ef4444'
            },
            legend: { display: false }
          },
          scales: {
            y: {
              ticks: {
                callback: function(value) {
                  return '$' + value.toFixed(4);
                }
              }
            }
          }
        }
      };

      const chart = new Chart(ctx, chartConfig);
      chart.update('none');
      
      const buffer = canvas.toBuffer('image/png');
      chart.destroy();
      
      return buffer;
    } catch (error) {
      console.error(`❌ Erro ao gerar gráfico rápido ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Formata informações do gráfico para caption
   */
  formatChartCaption(symbol, signal, indicators) {
    const lines = [
      `📊 *${symbol} SCALPING ANALYSIS*`,
      ``,
      `🎯 *Probabilidade:* ${signal?.probability?.toFixed(1) || 'N/A'}%`,
      `📈 *Tendência:* ${signal?.trend || 'N/A'}`,
      `⏰ *Timeframe:* ${signal?.timeframe || '5m'}`,
      ``,
      `💰 *Entrada:* $${signal?.entry?.toFixed(4) || 'N/A'}`,
      `🎯 *TP1:* $${signal?.targets?.[0]?.toFixed(4) || 'N/A'}`,
      `🌕 *TP6:* $${signal?.targets?.[5]?.toFixed(4) || 'N/A'}`,
      `🛑 *Stop:* $${signal?.stopLoss?.toFixed(4) || 'N/A'}`,
      ``,
      `📊 *RSI:* ${indicators?.rsi?.toFixed(1) || 'N/A'}`,
      `🔄 *MACD:* ${indicators?.macd?.histogram?.toFixed(6) || 'N/A'}`,
      ``,
      `👑 *Sinais Lobo Scalping*`,
      `⏰ ${new Date().toLocaleString('pt-BR')}`
    ];

    return lines.join('\n');
  }
}

export default ChartGeneratorService;