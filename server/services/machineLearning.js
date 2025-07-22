/**
 * Serviço de Machine Learning para previsão de preços
 */

let tf;
let isTensorFlowAvailable = false;

// Tenta carregar TensorFlow.js Node primeiro, depois fallback para browser
async function initializeTensorFlow() {
  try {
    // Tenta carregar TensorFlow.js Node (otimizado)
    await import('@tensorflow/tfjs-node');
    tf = await import('@tensorflow/tfjs');
    isTensorFlowAvailable = true;
    console.log('✅ TensorFlow.js Node backend carregado com sucesso');
    return true;
  } catch (nodeError) {
    console.log('⚠️ TensorFlow.js Node não disponível, tentando versão browser...');
    try {
      // Fallback para versão browser
      tf = await import('@tensorflow/tfjs');
      isTensorFlowAvailable = true;
      console.log('✅ TensorFlow.js browser backend carregado');
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
      console.log('🤖 Inicializando sistema de Machine Learning...');
      this.isInitialized = await initializeTensorFlow();
      if (this.isInitialized) {
        console.log('✅ MachineLearningService inicializado com TensorFlow.js');
        console.log('🧠 Sistema ML pronto para treinamento e previsões');
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

      // Prepara features e labels
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
              console.log(`🧠 ${symbol} - Época ${epoch}/50: loss = ${logs.loss.toFixed(4)}, acc = ${logs.acc?.toFixed(4) || 'N/A'}`);
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

      // Prepara features atuais
      const features = this.prepareCurrentFeatures(currentData, indicators);
      
      // Faz previsão
      const prediction = model.predict(tf.tensor2d([features]));
      const probability = await prediction.data();
      
      prediction.dispose();

      console.log(`🧠 Previsão ML para ${symbol}: ${(probability[0] * 100).toFixed(1)}%`);
      return probability[0];
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
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu',
      inputShape: [10] // 10 features
    }));

    // Camadas ocultas
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu'
    }));

    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({
      units: 16,
      activation: 'relu'
    }));

    // Camada de saída
    model.add(tf.layers.dense({
      units: 1,
      activation: 'sigmoid'
    }));

    // Compila modelo
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  /**
   * Prepara dados de treinamento
   */
  prepareTrainingData(data) {
    const features = [];
    const labels = [];
    const windowSize = 10;

    // Calcula indicadores para todo o histórico
    const rsi = this.calculateSimpleRSI(data.close);
    const macd = this.calculateSimpleMACD(data.close);
    const returns = this.calculateReturns(data.close);

    for (let i = windowSize; i < data.close.length - 1; i++) {
      // Features: janela de preços, volume, RSI, MACD
      const priceWindow = data.close.slice(i - windowSize, i);
      const volumeWindow = data.volume.slice(i - windowSize, i);
      
      // Normaliza preços (retornos percentuais)
      const normalizedPrices = priceWindow.map((price, idx) => {
        if (idx === 0) return 0;
        return (price - priceWindow[idx - 1]) / priceWindow[idx - 1];
      });

      // Normaliza volume
      const avgVolume = volumeWindow.reduce((a, b) => a + b, 0) / volumeWindow.length;
      const normalizedVolume = volumeWindow[volumeWindow.length - 1] / avgVolume;

      const feature = [
        ...normalizedPrices.slice(-5), // Últimos 5 retornos
        normalizedVolume,
        rsi[i] / 100, // RSI normalizado
        macd[i],
        returns[i],
        data.high[i] / data.close[i] - 1 // Sombra superior
      ];

      features.push(feature);

      // Label: 1 se preço subiu no próximo período, 0 caso contrário
      const label = data.close[i + 1] > data.close[i] ? 1 : 0;
      labels.push(label);
    }

    return { features, labels };
  }

  /**
   * Prepara features atuais para previsão
   */
  prepareCurrentFeatures(data, indicators) {
    const windowSize = 5;
    const recentPrices = data.close.slice(-windowSize);
    const recentVolume = data.volume.slice(-windowSize);

    // Normaliza preços
    const normalizedPrices = recentPrices.map((price, idx) => {
      if (idx === 0) return 0;
      return (price - recentPrices[idx - 1]) / recentPrices[idx - 1];
    });

    // Normaliza volume
    const avgVolume = recentVolume.reduce((a, b) => a + b, 0) / recentVolume.length;
    const normalizedVolume = recentVolume[recentVolume.length - 1] / avgVolume;

    const currentPrice = data.close[data.close.length - 1];
    const currentHigh = data.high[data.high.length - 1];

    return [
      ...normalizedPrices,
      normalizedVolume,
      (indicators.rsi || 50) / 100,
      indicators.macd?.MACD || 0,
      normalizedPrices[normalizedPrices.length - 1],
      currentHigh / currentPrice - 1
    ];
  }

  /**
   * Calcula RSI simplificado
   */
  calculateSimpleRSI(prices, period = 14) {
    const rsi = [];
    
    for (let i = period; i < prices.length; i++) {
      const gains = [];
      const losses = [];
      
      for (let j = i - period + 1; j <= i; j++) {
        const change = prices[j] - prices[j - 1];
        if (change > 0) {
          gains.push(change);
          losses.push(0);
        } else {
          gains.push(0);
          losses.push(Math.abs(change));
        }
      }
      
      const avgGain = gains.reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
      
      const rs = avgGain / (avgLoss || 0.001);
      const rsiValue = 100 - (100 / (1 + rs));
      
      rsi.push(rsiValue);
    }
    
    return rsi;
  }

  /**
   * Calcula MACD simplificado
   */
  calculateSimpleMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    
    return ema12.map((val, idx) => val - ema26[idx]);
  }

  /**
   * Calcula EMA
   */
  calculateEMA(prices, period) {
    const ema = [];
    const multiplier = 2 / (period + 1);
    
    ema[0] = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
    }
    
    return ema;
  }

  /**
   * Calcula retornos percentuais
   */
  calculateReturns(prices) {
    const returns = [0];
    
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
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