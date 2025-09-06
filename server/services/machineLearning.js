/**
 * Serviço de Machine Learning para previsão de preços
 */

let tf;
let isTensorFlowAvailable = false;

// Helpers numéricos para evitar NaN/Infinity
const safeNum = (v, def = 0) => (Number.isFinite(v) ? Number(v) : def);
const divSafe = (num, den, def = 0) =>
  (Number.isFinite(num) && Number.isFinite(den) && Math.abs(den) > 1e-12 ? num / den : def);

// Tenta carregar TensorFlow.js Node primeiro, depois fallback para browser
async function initializeTensorFlow() {
  try {
    // Suprime logs informativos do TensorFlow
    process.env.TF_CPP_MIN_LOG_LEVEL = '2';

    // Tenta carregar TensorFlow.js Node (otimizado)
    await import('@tensorflow/tfjs-node');
    tf = await import('@tensorflow/tfjs');
    isTensorFlowAvailable = true;
    console.log('✅ TensorFlow.js Node backend carregado (CPU otimizado com AVX2/FMA)');
    return true;
  } catch (nodeError) {
    console.log('⚠️ TensorFlow.js Node não disponível, tentando versão browser...');
    try {
      // Fallback para versão browser
      tf = await import('@tensorflow/tfjs');
      isTensorFlowAvailable = true;
      console.log('✅ TensorFlow.js browser backend carregado com sucesso');
      return true;
    } catch (browserError) {
      console.log('❌ TensorFlow.js não disponível - ML desabilitado');
      console.log('Node error:', nodeError.message);
      console.log('Browser error:', browserError.message);
      isTensorFlowAvailable = false;
      return false;
    }
  }
}

class MachineLearningService {
  constructor() {
    this.models = new Map();
    this.loggedMissingModels = new Set();
    this.isInitialized = false;
    this.trainingInProgress = false;
    this.lastTrainingTime = null;
    this.trainingStats = {
      totalModels: 0,
      successfulModels: 0,
      failedModels: 0
    };

    // Inicializa TensorFlow de forma assíncrona
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      if (this.isInitialized) {
        console.log('✅ ML já inicializado - pulando reinicialização');
        return this.isInitialized;
      }

      console.log('🤖 Inicializando sistema de Machine Learning...');

      // Suprime mensagens informativas do TensorFlow
      if (typeof process !== 'undefined' && process.env) {
        process.env.TF_CPP_MIN_LOG_LEVEL = '2';
      }

      this.isInitialized = await initializeTensorFlow();
      if (this.isInitialized) {
        console.log('✅ Sistema ML inicializado com TensorFlow.js');
        console.log('🧠 Sistema ML pronto para treinamento e previsões');
        console.log('ℹ️ Mensagens "This TensorFlow binary is optimized..." são normais e indicam otimização de CPU');
      } else {
        console.log('⚠️ MachineLearningService inicializado SEM TensorFlow.js');
        console.log('📊 Funcionando apenas com análise técnica tradicional');
      }
      return this.isInitialized;
    } catch (error) {
      console.error('❌ Erro na inicialização do ML:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Treina modelo para um símbolo específico
   */
  async trainModel(symbol, historicalData) {
    try {
      await this.initPromise;

      if (!this.isInitialized || !isTensorFlowAvailable) {
        console.log(`⚠️ ML não disponível - pulando treinamento para ${symbol}`);
        return null;
      }

      console.log(`🧠 Iniciando treinamento ML para ${symbol}...`);
      this.trainingInProgress = true;
      this.trainingStats.totalModels++;

      console.log('ℹ️ Mensagens do TensorFlow sobre otimização de CPU são informativas (não são erros)');

      // Prepara features e labels (robustos)
      const { features, labels } = this.prepareTrainingData(historicalData);

      if (features.length < 50) {
        console.warn(`⚠️ Dados insuficientes para treinar modelo de ${symbol} (${features.length} < 50)`);
        this.trainingStats.failedModels++;
        this.trainingInProgress = false;
        return null;
      }

      // Cria modelo
      const model = this.createModel();

      // Converte dados para tensores
      const xs = tf.tensor2d(features);
      const ys = tf.tensor2d(labels, [labels.length, 1]);

      console.log(`📊 Treinando com ${features.length} amostras para ${symbol}...`);

      // Treina modelo
      await model.fit(xs, ys, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        verbose: 0,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 25 === 0) {
              const acc = logs?.acc ?? logs?.accuracy;
              const vloss = logs?.val_loss;
              console.log(
                `🧠 ${symbol} - Época ${epoch}/50: loss=${logs.loss?.toFixed?.(4)} valLoss=${vloss?.toFixed?.(4) ?? 'N/A'} acc=${acc?.toFixed?.(4) ?? 'N/A'}`
              );
            }
          }
        }
      });

      // Limpa tensores
      xs.dispose();
      ys.dispose();

      // Armazena modelo
      this.models.set(symbol, model);
      this.trainingStats.successfulModels++;
      this.lastTrainingTime = new Date();
      this.trainingInProgress = false;

      console.log(`✅ Modelo ML para ${symbol} treinado com sucesso!`);
      console.log(`📈 Stats ML: ${this.trainingStats.successfulModels}/${this.trainingStats.totalModels} modelos treinados`);

      return model;
    } catch (error) {
      console.error(`❌ Erro ao treinar modelo ML para ${symbol}:`, error.message);
      this.trainingStats.failedModels++;
      this.trainingInProgress = false;
      return null;
    }
  }

  /**
   * Faz previsão para um símbolo
   */
  async predict(symbol, currentData, indicators) {
    try {
      await this.initPromise;

      if (!this.isInitialized || !isTensorFlowAvailable) {
        // ML não disponível - retorna probabilidade neutra
        if (!this.loggedMissingModels.has(symbol)) {
          console.log(`⚠️ ML não disponível para ${symbol} - usando análise técnica apenas`);
          this.loggedMissingModels.add(symbol);
        }
        return 0.5;
      }

      const model = this.models.get(symbol);
      if (!model) {
        // Modelo não encontrado - usa probabilidade neutra
        if (!this.loggedMissingModels.has(symbol)) {
          console.log(`🤖 Modelo ML não encontrado para ${symbol} - será treinado na próxima oportunidade`);
          this.loggedMissingModels.add(symbol);
        }
        return 0.5;
      }

      // Prepara features atuais (robusto, alinhado ao sistema)
      const feats = this.prepareCurrentFeatures(currentData, indicators);

      // Faz previsão com tidy (evita memory leaks) + clamp
      const prob = tf.tidy(() => {
        const out = model.predict(tf.tensor2d([feats]));
        const v = out.dataSync()[0]; // 0..1
        return v;
      });

      const p = Math.min(1, Math.max(0, safeNum(prob, 0.5)));
      console.log(`🧠 Previsão ML para ${symbol}: ${(p * 100).toFixed(1)}%`);
      return p;
    } catch (error) {
      console.error(`❌ Erro na previsão ML para ${symbol}:`, error.message);
      return 0.5;
    }
  }

  /**
   * Cria arquitetura do modelo
   */
  createModel() {
    if (!tf) {
      throw new Error('TensorFlow.js não está disponível');
    }

    const model = tf.sequential();

    // Camada de entrada
    model.add(
      tf.layers.dense({
        units: 64,
        activation: 'relu',
        inputShape: [10] // 10 features
      })
    );

    // Camadas ocultas
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(
      tf.layers.dense({
        units: 32,
        activation: 'relu'
      })
    );

    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(
      tf.layers.dense({
        units: 16,
        activation: 'relu'
      })
    );

    // Camada de saída
    model.add(
      tf.layers.dense({
        units: 1,
        activation: 'sigmoid'
      })
    );

    // Compila modelo
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  /**
   * Prepara dados de treinamento (robusto a NaN/Infinity)
   */
  prepareTrainingData(data) {
    const features = [];
    const labels = [];
    const windowSize = 10;

    const closes = data.close || [];
    const highs = data.high || [];
    const vols = data.volume || [];

    if (closes.length < windowSize + 2) return { features, labels };

    // Calcula indicadores para todo o histórico (mesmo comprimento)
    const rsi = this.calculateSimpleRSI(closes);
    const macd = this.calculateSimpleMACD(closes);
    const rets = this.calculateReturns(closes);

    for (let i = windowSize; i < closes.length - 1; i++) {
      // Features: janela de preços, volume, RSI, MACD
      const priceWindow = closes.slice(i - windowSize, i);
      const volumeWindow = vols.slice(i - windowSize, i);

      // Normaliza preços (retornos percentuais)
      const normalizedPrices = priceWindow.map((p, idx) =>
        idx === 0 ? 0 : divSafe(p - priceWindow[idx - 1], priceWindow[idx - 1], 0)
      );

      // Usamos os últimos 5 retornos; garante tamanho 5
      const last5 = normalizedPrices.slice(-5);
      while (last5.length < 5) last5.unshift(0);

      // Normaliza volume
      const avgVolume = divSafe(
        volumeWindow.reduce((a, b) => a + safeNum(b, 0), 0),
        volumeWindow.length,
        0
      );
      const normalizedVolume = divSafe(volumeWindow[volumeWindow.length - 1], avgVolume, 1);

      // Sombra superior relativa
      const shadowUpper = safeNum(divSafe(highs[i], closes[i], 1) - 1, 0);

      const feature = [
        ...last5.map((v) => safeNum(v, 0)), // 5
        safeNum(normalizedVolume, 1), // 1
        safeNum(rsi[i] / 100, 0.5), // 1 (RSI normalizado)
        safeNum(macd[i], 0), // 1
        safeNum(rets[i], 0), // 1
        shadowUpper // 1
      ]; // total = 10

      features.push(feature);

      // Label: 1 se preço subiu no próximo período, 0 caso contrário
      const label = closes[i + 1] > closes[i] ? 1 : 0;
      labels.push(label);
    }

    return { features, labels };
  }

  /**
   * Prepara features atuais para previsão (alinhado e robusto)
   */
  prepareCurrentFeatures(data, indicators = {}) {
    const windowSize = 5;
    const closes = data.close || [];
    const vols = data.volume || [];
    const highs = data.high || [];

    const recentPrices = closes.slice(-windowSize);
    const recentVolume = vols.slice(-windowSize);

    // Normaliza preços (retornos)
    const normalizedPrices = recentPrices.map((p, idx) =>
      idx === 0 ? 0 : divSafe(p - recentPrices[idx - 1], recentPrices[idx - 1], 0)
    );
    while (normalizedPrices.length < windowSize) normalizedPrices.unshift(0);

    // Normaliza volume
    const avgVolume = divSafe(
      recentVolume.reduce((a, b) => a + safeNum(b, 0), 0),
      recentVolume.length,
      0
    );
    const normalizedVolume = divSafe(recentVolume[recentVolume.length - 1], avgVolume, 1);

    const currentPrice = closes[closes.length - 1];
    const currentHigh = highs[highs.length - 1];

    // Padroniza com o resto do sistema: usar histogram
    const macdHist = safeNum(indicators?.macd?.histogram, 0);
    const rsiNorm = safeNum((indicators?.rsi ?? 50) / 100, 0.5);

    return [
      ...normalizedPrices.map((v) => safeNum(v, 0)), // 5
      safeNum(normalizedVolume, 1), // 1
      rsiNorm, // 1
      macdHist, // 1
      safeNum(normalizedPrices[normalizedPrices.length - 1], 0), // 1
      safeNum(divSafe(currentHigh, currentPrice, 1) - 1, 0) // 1
    ]; // total = 10
  }

  /**
   * Calcula RSI simplificado (mesmo comprimento de prices)
   */
  calculateSimpleRSI(prices, period = 14) {
    const n = prices.length;
    const rsi = new Array(n).fill(NaN);
    if (n < period + 1) return rsi;

    for (let i = period; i < n; i++) {
      let gain = 0,
        loss = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const ch = prices[j] - prices[j - 1];
        if (ch > 0) gain += ch;
        else loss += -ch;
      }
      const avgGain = gain / period;
      const avgLoss = loss / period;
      const rs = divSafe(avgGain, avgLoss, avgLoss === 0 ? 1e6 : 0); // se avgLoss ~ 0, RSI → 100
      rsi[i] = 100 - 100 / (1 + rs);
    }
    return rsi;
  }

  /**
   * Calcula MACD simplificado (mesmo comprimento de prices)
   */
  calculateSimpleMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = new Array(prices.length).fill(NaN);
    for (let i = 0; i < prices.length; i++) {
      macd[i] = safeNum(ema12[i] - ema26[i], 0);
    }
    return macd;
  }

  /**
   * Calcula EMA
   */
  calculateEMA(prices, period) {
    const ema = new Array(prices.length).fill(NaN);
    if (!prices?.length) return ema;

    const multiplier = 2 / (period + 1);

    ema[0] = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema[i] = prices[i] * multiplier + ema[i - 1] * (1 - multiplier);
    }

    return ema;
  }

  /**
   * Calcula retornos percentuais (mesmo comprimento)
   */
  calculateReturns(prices) {
    const n = prices.length;
    const returns = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      returns[i] = divSafe(prices[i] - prices[i - 1], prices[i - 1], 0);
    }
    return returns;
  }

  /**
   * Avalia performance do modelo
   */
  async evaluateModel(symbol, testData) {
    try {
      await this.initPromise;

      if (!this.isInitialized || !isTensorFlowAvailable) {
        return null;
      }

      const model = this.models.get(symbol);
      if (!model) return null;

      const { features, labels } = this.prepareTrainingData(testData);
      if (features.length === 0) return null;

      const xs = tf.tensor2d(features);
      const ys = tf.tensor2d(labels, [labels.length, 1]);

      const evaluation = await model.evaluate(xs, ys);
      const loss = await evaluation[0].data();
      const accuracy = await evaluation[1].data();

      xs.dispose();
      ys.dispose();
      evaluation[0].dispose();
      evaluation[1].dispose();

      return {
        loss: loss[0],
        accuracy: accuracy[0]
      };
    } catch (error) {
      console.error(`Erro ao avaliar modelo para ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Verifica se ML está disponível
   */
  isMLAvailable() {
    return this.isInitialized && isTensorFlowAvailable;
  }

  /**
   * Verifica se está treinando
   */
  isTraining() {
    return this.trainingInProgress;
  }

  /**
   * Obtém estatísticas de treinamento
   */
  getTrainingStats() {
    return {
      ...this.trainingStats,
      isTraining: this.trainingInProgress,
      lastTrainingTime: this.lastTrainingTime,
      totalModelsLoaded: this.models.size,
      isInitialized: this.isInitialized,
      tensorflowAvailable: isTensorFlowAvailable
    };
  }

  /**
   * Força treinamento de um modelo
   */
  async forceTrainModel(symbol, binanceService) {
    try {
      console.log(`🚀 Forçando treinamento ML para ${symbol}...`);
      const data = await binanceService.getOHLCVData(symbol, '1h', 500);

      if (data && data.close && data.close.length >= 100) {
        return await this.trainModel(symbol, data);
      } else {
        console.log(`❌ Dados insuficientes para treinar ${symbol}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Erro ao forçar treinamento de ${symbol}:`, error.message);
      return null;
    }
  }
}

export default MachineLearningService;
