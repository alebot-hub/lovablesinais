const ccxt = require('ccxt');
const TelegramBot = require('node-telegram-bot-api');
const tf = require('@tensorflow/tfjs');
const { createCanvas } = require('canvas');
const Chart = require('chart.js');
const schedule = require('node-schedule');
const technicalindicators = require('technicalindicators');

// Configuração
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const binance = new ccxt.binance({
  apiKey: BINANCE_API_KEY,
  secret: BINANCE_API_SECRET,
  enableRateLimit: true
});

// Lista de 70 criptomoedas (exemplo, deve ser atualizada via CoinMarketCap API)
const symbols = ['BTC/USDT', 'ETH/USDT' /* +68 ativos, sem stablecoins */];

// Obtém dados de preços via WebSocket
async function getPriceData(symbol, timeframe, limit = 100) {
  const candles = await binance.fetchOHLCV(symbol, timeframe, undefined, limit);
  return {
    open: candles.map(c => c[1]),
    close: candles.map(c => c[4]),
    high: candles.map(c => c[2]),
    low: candles.map(c => c[3]),
    volume: candles.map(c => c[5]),
    timestamp: candles.map(c => c[0])
  };
}

// Calcula indicadores técnicos
async function calculateIndicators(data) {
  const rsi = technicalindicators.RSI.calculate({ period: 14, values: data.close });
  const macd = technicalindicators.MACD.calculate({
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    values: data.close
  });
  const ichimoku = technicalindicators.IchimokuCloud.calculate({
    high: data.high,
    low: data.low,
    conversionPeriod: 9,
    basePeriod: 26,
    spanPeriod: 52
  });
  const ma21 = technicalindicators.SMA.calculate({ period: 21, values: data.close });
  const ma200 = technicalindicators.SMA.calculate({ period: 200, values: data.close });
  const bb = technicalindicators.BollingerBands.calculate({
    period: 20,
    stdDev: 2,
    values: data.close
  });
  const vwap = technicalindicators.VWAP.calculate({
    high: data.high,
    low: data.low,
    close: data.close,
    volume: data.volume
  });
  // Divergência de RSI (simplificada)
  const rsiDivergence = rsi[rsi.length - 1] < 30 && data.close[rsi.length - 1] > data.close[rsi.length - 2] ? 1 : 0;
  return {
    rsi: rsi[rsi.length - 1],
    macd: macd[macd.length - 1],
    ichimoku: ichimoku[ichimoku.length - 1],
    ma21: ma21[ma21.length - 1],
    ma200: ma200[ma200.length - 1],
    bb: bb[bb.length - 1],
    vwap: vwap[vwap.length - 1],
    rsiDivergence
  };
}

// Detecta padrões gráficos
function detectPatterns(data) {
  const lastClose = data.close[data.close.length - 1];
  const prevClose = data.close[data.close.length - 2];
  const lastOpen = data.open[data.open.length - 1];
  const prevOpen = data.open[data.open.length - 2];
  const lastHigh = data.high[data.high.length - 1];
  const lastLow = data.low[data.low.length - 1];
  const resistance = Math.max(...data.high.slice(-20));
  const support = Math.min(...data.low.slice(-20));

  // Rompimento de suporte/resistência
  const breakout = lastClose > resistance && prevClose <= resistance ? 'bullish' : (lastClose < support && prevClose >= support ? 'bearish' : null);

  // Triângulo ascendente/descendente (simplificado: convergência de máximas/mínimas)
  const highs20 = data.high.slice(-20);
  const lows20 = data.low.slice(-20);
  const triangleAsc = highs20[19] - highs20[0] < 0 && lows20[19] - lows20[0] > 0;
  const triangleDesc = highs20[19] - highs20[0] > 0 && lows20[19] - lows20[0] < 0;

  // Bandeira de alta/baixa (simplificado: consolidação após movimento forte)
  const flagBull = data.close[19] - data.close[10] > data.close[10] * 0.05 && Math.abs(data.close[19] - data.close[15]) < data.close[15] * 0.02;
  const flagBear = data.close[10] - data.close[19] > data.close[19] * 0.05 && Math.abs(data.close[19] - data.close[15]) < data.close[15] * 0.02;

  // Cunhas (simplificado: inclinação oposta)
  const wedgeUp = highs20[19] - highs20[0] > 0 && lows20[19] - lows20[0] > 0;
  const wedgeDown = highs20[19] - highs20[0] < 0 && lows20[19] - lows20[0] < 0;

  // Topo duplo/fundo duplo
  const doubleTop = data.high.slice(-5).filter(h => Math.abs(h - resistance) < resistance * 0.01).length >= 2;
  const doubleBottom = data.low.slice(-5).filter(l => Math.abs(l - support) < support * 0.01).length >= 2;

  // Cabeça e ombros (simplificado)
  const headShoulders = data.high.slice(-7)[2] > data.high.slice(-7)[0] && data.high.slice(-7)[2] > data.high.slice(-7)[4] &&
                       data.low.slice(-7)[1] < data.low.slice(-7)[3] && data.low.slice(-7)[3] < data.low.slice(-7)[5];

  // Engolfo de alta/baixa
  const engulfingBull = lastClose > prevOpen && lastOpen < prevClose && lastClose > lastOpen;
  const engulfingBear = lastClose < prevOpen && lastOpen > prevClose && lastClose < lastOpen;

  // Doji
  const doji = Math.abs(lastOpen - lastClose) < lastClose * 0.001;

  // Martelo/enforcado
  const hammer = lastLow < lastOpen * 0.98 && lastClose > lastOpen * 0.99;
  const hangingMan = lastHigh > lastOpen * 1.02 && lastClose < lastOpen * 1.01;

  return {
    breakout,
    triangleAsc,
    triangleDesc,
    flagBull,
    flagBear,
    wedgeUp,
    wedgeDown,
    doubleTop,
    doubleBottom,
    headShoulders,
    engulfingBull,
    engulfingBear,
    doji,
    hammer,
    hangingMan,
    resistance,
    support
  };
}

// Calcula pontuação de probabilidade
function calculateSignalScore(indicators, patterns, mlProbability) {
  let score = 0;
  // Indicadores técnicos
  if (indicators.rsi < 30) score += 15; // RSI sobrevendido
  if (indicators.macd.MACD > indicators.macd.signal) score += 20; // Cruzamento MACD
  if (indicators.ichimoku.conversionLine > indicators.ichimoku.baseLine && indicators.close > indicators.ichimoku.spanA) score += 15; // Ichimoku bullish
  if (indicators.rsiDivergence) score += 10; // Divergência de RSI
  if (indicators.ma21 > indicators.ma200) score += 10; // MA21 acima de MA200
  if (indicators.close > indicators.bb.upper) score += 10; // Acima de Bollinger
  // Padrões gráficos
  if (patterns.breakout === 'bullish') score += 20;
  if (patterns.triangleAsc || patterns.flagBull || patterns.wedgeUp || patterns.engulfingBull || patterns.hammer) score += 15;
  if (patterns.doubleBottom || patterns.headShoulders) score += 15;
  if (patterns.doji && indicators.close > indicators.ma21) score += 10;
  // Volume
  const avgVolume = technicalindicators.SMA.calculate({ period: 20, values: data.volume });
  if (data.volume[data.volume.length - 1] > avgVolume[avgVolume.length - 1] * 1.5) score += 15;
  // Machine Learning
  score += mlProbability * 0.25; // Peso de 25% para ML
  return Math.min(score, 100);
}

// Treina modelo de aprendizado de máquina
async function trainModel(symbol, timeframe) {
  const data = await getPriceData(symbol, timeframe, 100);
  const X = data.close.slice(0, -1).map((p, i) => [
    technicalindicators.RSI.calculate({ period: 14, values: data.close.slice(i, i + 10) })[9],
    technicalindicators.MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: data.close.slice(i, i + 10) })[9].MACD,
    data.volume[i + 9]
  ]);
  const y = data.close.slice(10).map((p, i) => p > data.close[i + 9] ? 1 : 0);
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 10, inputShape: [3], activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy' });
  await model.fit(tf.tensor2d(X), tf.tensor2d(y, [y.length, 1]), { epochs: 10 });
  return model;
}

// Gera gráfico
async function generateChart(symbol, data) {
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.timestamp.map(t => new Date(t).toLocaleTimeString()),
      datasets: [
        {
          label: `${symbol} Price`,
          data: data.close,
          borderColor: '#36A2EB',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          fill: true
        }
      ]
    },
    options: {
      scales: {
        y: { beginAtZero: false },
        x: { display: true }
      }
    }
  });
  return canvas.toBuffer('image/png');
}

// Envia sinal
async function sendSignal(chatId, symbol, entryPrice, indicators, patterns, score) {
  const targets = Array.from({ length: 6 }, (_, i) => entryPrice * (1 + 0.015 * (i + 1)));
  const stopLoss = entryPrice * (1 - 0.045);
  const data = await getPriceData(symbol, '1h');
  const chart = await generateChart(symbol, data);
  const message = `
Sinal para ${symbol}
Probabilidade: ${score.toFixed(2)}%
Entrada: $${entryPrice.toFixed(2)}
Alvos: ${targets.map((t, i) => `TP${i + 1}: $${t.toFixed(2)}`).join('\n')}
Stop-Loss: $${stopLoss.toFixed(2)}
RSI: ${indicators.rsi.toFixed(2)}
MACD: ${indicators.macd.MACD.toFixed(2)}
Padrão: ${patterns.breakout || patterns.triangleAsc || patterns.flagBull ? 'Bullish' : 'N/A'}
  `;
  await bot.sendPhoto(chatId, chart, { caption: message });
}

// Monitora preços em tempo real para alvos e stop-loss
function monitorPrice(symbol, entryPrice, targets, stopLoss, chatId) {
  binance.watchTicker(symbol).then(ticker => {
    const currentPrice = ticker.last;
    if (currentPrice >= targets[0]) {
      const targetNumber = 6 - targets.length + 1; // Calcula qual alvo foi atingido (1 a 6)
      bot.sendMessage(chatId, `${symbol} atingiu TP${targetNumber}: $${targets[0].toFixed(2)}`);
      
      // Se for o último alvo (TP6), encerra o monitoramento
      if (targets.length === 1) {
        bot.sendMessage(chatId, `✅ Operação finalizada! ${symbol} atingiu o alvo final (TP6) de $${targets[0].toFixed(2)}`);
        return; // Encerra a função
      }
      
      targets.shift(); // Remove o alvo atingido
    } else if (currentPrice <= stopLoss) {
      bot.sendMessage(chatId, `❌ ${symbol} atingiu Stop-Loss: $${stopLoss.toFixed(2)}`);
      return; // Encerra a função
    }
    
    // Continua monitorando se ainda houver alvos
    if (targets.length > 0) {
      setTimeout(() => monitorPrice(symbol, entryPrice, targets, stopLoss, chatId), 1000);
    }
  });
}

// Análise do Bitcoin
async function analyzeBitcoin(chatId) {
  const data = await getPriceData('BTC/USDT', '4h');
  const indicators = await calculateIndicators(data);
  const patterns = detectPatterns(data);
  const message = `
Análise do Bitcoin
Preço Atual: $${data.close[data.close.length - 1].toFixed(2)}
Suporte: $${patterns.support.toFixed(2)}
Resistência: $${patterns.resistance.toFixed(2)}
Tendência: ${indicators.ma21 > indicators.ma200 ? 'Alta' : 'Baixa'}
  `;
  await bot.sendMessage(chatId, message);
}

// Análise de sentimento
async function analyzeMarketSentiment(chatId) {
  let totalVolume = 0;
  for (const symbol of symbols) {
    const data = await getPriceData(symbol, '1h');
    totalVolume += data.volume[data.volume.length - 1];
  }
  const avgVolume = totalVolume / symbols.length;
  const sentiment = totalVolume > avgVolume * 1.2 ? 'Otimista' : 'Pessimista';
  await bot.sendMessage(chatId, `Sentimento de Mercado: ${sentiment}\nVolume Total: ${totalVolume.toFixed(2)}`);
}

// Agendamento
schedule.scheduleJob('0 * * * *', async () => {
  let bestSignal = { score: 0, symbol: null, entryPrice: 0, indicators: null, patterns: null };
  for (const symbol of symbols) {
    for (const timeframe of ['15m', '1h', '4h', '1d']) {
      const data = await getPriceData(symbol, timeframe);
      const indicators = await calculateIndicators(data);
      const patterns = detectPatterns(data);
      const model = await trainModel(symbol, timeframe);
      const features = [
        indicators.rsi,
        indicators.macd.MACD,
        data.volume[data.volume.length - 1]
      ];
      const mlProbability = model.predict(tf.tensor2d([features])).dataSync()[0] * 100;
      const score = calculateSignalScore(indicators, patterns, mlProbability);
      if (score > 70 && score > bestSignal.score) {
        bestSignal = {
          score,
          symbol,
          entryPrice: data.close[data.close.length - 1],
          indicators,
          patterns
        };
      }
    }
  }
  if (bestSignal.symbol) {
    const { symbol, entryPrice, indicators, patterns, score } = bestSignal;
    if (!TELEGRAM_CHAT_ID) {
      console.error('❌ TELEGRAM_CHAT_ID não configurado. Não é possível enviar sinais.');
      return;
    }
    await sendSignal(TELEGRAM_CHAT_ID, symbol, entryPrice, indicators, patterns, score);
    const targets = Array.from({ length: 6 }, (_, i) => entryPrice * (1 + 0.015 * (i + 1)));
    const stopLoss = entryPrice * (1 - 0.045);
    monitorPrice(symbol, entryPrice, targets, stopLoss, TELEGRAM_CHAT_ID);
  }
});

schedule.scheduleJob('0 */4 * * *', () => analyzeBitcoin(TELEGRAM_CHAT_ID || 'CHAT_ID'));
schedule.scheduleJob('0 */6 * * *', () => analyzeMarketSentiment(TELEGRAM_CHAT_ID || 'CHAT_ID'));

// Servidor web (para interface React)
const express = require('express');
const app = express();
app.use(express.static('public')); // Pasta com React/Tailwind
app.listen(process.env.PORT || 3000, () => console.log('Servidor rodando'));