/**
 * Serviço de detecção de padrões gráficos - Versão Atualizada
 * Solução para erro 'this.detectCandlestickPatterns is not a function'
 */

class PatternDetectionService {
  constructor(config = {}) {
    // Configurações padrão
    this.config = {
      minDataLength: config.minDataLength || 20,
      breakoutVolumeThreshold: config.breakoutVolumeThreshold || 1.5,
      tolerance: config.tolerance || 0.02,
      candlestickTolerance: config.candlestickTolerance || 0.001,
      debug: config.debug !== undefined ? config.debug : true,
      ...config
    };

    this.log('✅ PatternDetectionService inicializado com configurações:', this.config);
    
    // Verificação crítica: confirma que todos os métodos principais estão definidos
    this.validateMethods();
  }

  // Método de logging configurável
  log = (message, ...args) => {
    if (this.config.debug) {
      console.log(message, ...args);
    }
  }

  // Validação de métodos (arrow function para preservar 'this')
  validateMethods = () => {
    const requiredMethods = [
      'detectPatterns',
      'detectCandlestickPatterns',
      'detectBreakout',
      'detectTriangles',
      'detectFlags',
      'detectWedges',
      'detectDoublePatterns',
      'detectHeadShoulders'
    ];

    for (const methodName of requiredMethods) {
      if (typeof this[methodName] !== 'function') {
        console.error(`❌ ERRO CRÍTICO: Método ${methodName} não está definido como função!`);
        throw new Error(`Método ${methodName} não encontrado na classe PatternDetectionService`);
      }
    }
    
    this.log('✅ Todos os métodos principais validados com sucesso');
  }

  /**
   * Detecta todos os padrões gráficos (arrow function para preservar 'this')
   */
  detectPatterns = (data) => {
    try {
      this.log('🔍 Iniciando detecção de padrões...');
      
      // Validação completa de dados
      const validationResult = this.validateInputData(data);
      if (!validationResult.isValid) {
        console.warn('⚠️ Dados insuficientes para detecção de padrões:', validationResult.reason);
        return this.getEmptyPatterns();
      }

      const patterns = {};

      // Dados recentes para análise (usando configuração)
      const windowSize = this.config.minDataLength;
      const recentData = {
        open: data.open.slice(-windowSize),
        high: data.high.slice(-windowSize),
        low: data.low.slice(-windowSize),
        close: data.close.slice(-windowSize),
        volume: data.volume ? data.volume.slice(-windowSize) : Array(windowSize).fill(1)
      };

      // Validação adicional de volume
      if (!data.volume || !Array.isArray(data.volume)) {
        console.warn('⚠️ Volume ausente ou inválido - usando valores padrão para confirmação de rompimentos');
      }

      this.log('📊 Analisando suporte e resistência...');
      // Suporte e resistência com tolerância configurável
      const resistance = Math.max(...recentData.high);
      const support = Math.min(...recentData.low);
      patterns.support = support;
      patterns.resistance = resistance;

      this.log('📈 Detectando rompimentos...');
      // Rompimentos
      patterns.breakout = this.detectBreakout(recentData, support, resistance);

      this.log('🔺 Detectando triângulos...');
      // Triângulos
      patterns.triangle = this.detectTriangles(recentData);

      this.log('🏳️ Detectando bandeiras...');
      // Bandeiras
      patterns.flag = this.detectFlags(recentData);

      this.log('📐 Detectando cunhas...');
      // Cunhas
      patterns.wedge = this.detectWedges(recentData);

      this.log('🔄 Detectando padrões duplos...');
      // Topo/Fundo duplo
      patterns.double = this.detectDoublePatterns(recentData, support, resistance);

      this.log('👤 Detectando cabeça e ombros...');
      // Cabeça e ombros
      patterns.headShoulders = this.detectHeadShoulders(recentData);

      this.log('🕯️ Detectando padrões de candlestick...');
      // Padrões de candlestick - ARROW FUNCTION para preservar 'this'
      try {
        patterns.candlestick = this.detectCandlestickPatterns(recentData);
        this.log(`✅ ${patterns.candlestick.length} padrões candlestick detectados`);
      } catch (candlestickError) {
        console.error('❌ Erro específico em candlestick:', candlestickError.message);
        console.error('❌ Stack trace:', candlestickError.stack);
        patterns.candlestick = [];
      }

      this.log('✅ Detecção de padrões concluída');
      return patterns;
    } catch (error) {
      console.error('❌ Erro ao detectar padrões:', error.message);
      console.error('❌ Stack trace:', error.stack);
      return this.getEmptyPatterns();
    }
  }

  /**
   * Validação completa de dados de entrada
   */
  validateInputData = (data) => {
    if (!data) {
      return { isValid: false, reason: 'Dados não fornecidos' };
    }

    const requiredArrays = ['open', 'high', 'low', 'close'];
    const minLength = this.config.minDataLength;

    for (const arrayName of requiredArrays) {
      if (!Array.isArray(data[arrayName])) {
        return { isValid: false, reason: `${arrayName} não é um array` };
      }
      
      if (data[arrayName].length < minLength) {
        return { isValid: false, reason: `${arrayName} tem apenas ${data[arrayName].length} elementos (mínimo ${minLength})` };
      }

      // Verifica se todos os valores são números válidos
      const invalidValues = data[arrayName].filter(val => typeof val !== 'number' || !isFinite(val) || val < 0);
      if (invalidValues.length > 0) {
        return { isValid: false, reason: `${arrayName} contém ${invalidValues.length} valores inválidos` };
      }
    }

    // Verifica consistência OHLC
    for (let i = 0; i < Math.min(5, data.close.length); i++) {
      const candle = {
        open: data.open[i],
        high: data.high[i],
        low: data.low[i],
        close: data.close[i]
      };

      if (candle.high < candle.low || 
          candle.high < Math.max(candle.open, candle.close) ||
          candle.low > Math.min(candle.open, candle.close)) {
        return { isValid: false, reason: `Dados OHLC inconsistentes no índice ${i}` };
      }
    }

    return { isValid: true, reason: 'Dados válidos' };
  }

  /**
   * Detecta padrões de candlestick (ARROW FUNCTION para preservar 'this')
   */
  detectCandlestickPatterns = (data) => {
    try {
      this.log('🕯️ Detectando padrões de candlestick...');
      const patterns = [];
      const lastIndex = data.close.length - 1;

      if (lastIndex < 1) {
        this.log('⚠️ Dados insuficientes para padrões candlestick');
        return patterns;
      }

      const current = {
        open: data.open[lastIndex],
        high: data.high[lastIndex],
        low: data.low[lastIndex],
        close: data.close[lastIndex]
      };

      const previous = {
        open: data.open[lastIndex - 1],
        high: data.high[lastIndex - 1],
        low: data.low[lastIndex - 1],
        close: data.close[lastIndex - 1]
      };

      // Validação dos dados
      if (!this.isValidCandle(current) || !this.isValidCandle(previous)) {
        console.warn('⚠️ Dados de candlestick inválidos');
        return patterns;
      }

      // Calcula tendência prévia para melhor precisão
      const prevTrend = this.calculatePreviousTrend(data);

      // Doji (confiança dinâmica baseada no contexto)
      const dojiTolerance = current.close * this.config.candlestickTolerance;
      if (Math.abs(current.open - current.close) < dojiTolerance) {
        const confidence = this.calculateDynamicConfidence(70, current, prevTrend);
        patterns.push({ type: 'DOJI', bias: 'NEUTRAL', confidence });
        this.log('✅ Padrão DOJI detectado');
      }

      // Engolfo bullish (com verificação de tendência)
      if (previous.close < previous.open && // Candle anterior bearish
          current.close > current.open && // Candle atual bullish
          current.open < previous.close && // Abre abaixo do fechamento anterior
          current.close > previous.open) { // Fecha acima da abertura anterior
        const confidence = this.calculateDynamicConfidence(80, current, prevTrend, 'BULLISH');
        patterns.push({ type: 'BULLISH_ENGULFING', bias: 'BULLISH', confidence });
        this.log('✅ Padrão BULLISH_ENGULFING detectado');
      }

      // Engolfo bearish (com verificação de tendência)
      if (previous.close > previous.open && // Candle anterior bullish
          current.close < current.open && // Candle atual bearish
          current.open > previous.close && // Abre acima do fechamento anterior
          current.close < previous.open) { // Fecha abaixo da abertura anterior
        const confidence = this.calculateDynamicConfidence(80, current, prevTrend, 'BEARISH');
        patterns.push({ type: 'BEARISH_ENGULFING', bias: 'BEARISH', confidence });
        this.log('✅ Padrão BEARISH_ENGULFING detectado');
      }

      // Martelo (com análise de tendência prévia)
      const bodySize = Math.abs(current.close - current.open);
      const lowerShadow = Math.min(current.open, current.close) - current.low;
      const upperShadow = current.high - Math.max(current.open, current.close);

      if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
        const confidence = this.calculateDynamicConfidence(75, current, prevTrend, 'BULLISH');
        patterns.push({ type: 'HAMMER', bias: 'BULLISH', confidence });
        this.log('✅ Padrão HAMMER detectado');
      }

      // Enforcado (com análise de tendência prévia)
      if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
        const confidence = this.calculateDynamicConfidence(75, current, prevTrend, 'BEARISH');
        patterns.push({ type: 'HANGING_MAN', bias: 'BEARISH', confidence });
        this.log('✅ Padrão HANGING_MAN detectado');
      }

      return patterns;
    } catch (error) {
      console.error('❌ Erro ao detectar padrões candlestick:', error.message);
      console.error('❌ Stack trace:', error.stack);
      return [];
    }
  }

  /**
   * Calcula tendência prévia para análise de candlestick
   */
  calculatePreviousTrend = (data) => {
    try {
      const trendWindow = Math.min(5, data.close.length - 1);
      if (trendWindow < 2) return 'NEUTRAL';

      const prices = data.close.slice(-trendWindow - 1, -1);
      let upMoves = 0;
      let downMoves = 0;

      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > prices[i - 1]) upMoves++;
        else if (prices[i] < prices[i - 1]) downMoves++;
      }

      if (upMoves > downMoves) return 'BULLISH';
      if (downMoves > upMoves) return 'BEARISH';
      return 'NEUTRAL';
    } catch (error) {
      console.error('Erro ao calcular tendência prévia:', error.message);
      return 'NEUTRAL';
    }
  }

  /**
   * Calcula confiança dinâmica baseada em contexto
   */
  calculateDynamicConfidence = (baseConfidence, candle, prevTrend, expectedBias = null) => {
    try {
      let confidence = baseConfidence;

      // Ajusta baseado no tamanho do candle
      const bodySize = Math.abs(candle.close - candle.open);
      const totalRange = candle.high - candle.low;
      const bodyRatio = totalRange > 0 ? bodySize / totalRange : 0;

      if (bodyRatio > 0.7) confidence += 5; // Candle com corpo grande
      else if (bodyRatio < 0.3) confidence -= 5; // Candle com corpo pequeno

      // Ajusta baseado na tendência prévia
      if (expectedBias && prevTrend !== 'NEUTRAL') {
        if ((expectedBias === 'BULLISH' && prevTrend === 'BEARISH') ||
            (expectedBias === 'BEARISH' && prevTrend === 'BULLISH')) {
          confidence += 10; // Padrão de reversão em tendência oposta
        }
      }

      return Math.max(50, Math.min(95, confidence));
    } catch (error) {
      console.error('Erro ao calcular confiança dinâmica:', error.message);
      return baseConfidence;
    }
  }

  /**
   * Valida se um candle tem dados válidos (arrow function)
   */
  isValidCandle = (candle) => {
    return candle && 
           typeof candle.open === 'number' && isFinite(candle.open) && candle.open > 0 &&
           typeof candle.high === 'number' && isFinite(candle.high) && candle.high > 0 &&
           typeof candle.low === 'number' && isFinite(candle.low) && candle.low > 0 &&
           typeof candle.close === 'number' && isFinite(candle.close) && candle.close > 0 &&
           candle.high >= candle.low &&
           candle.high >= Math.max(candle.open, candle.close) &&
           candle.low <= Math.min(candle.open, candle.close);
  }

  /**
   * Retorna padrões vazios em caso de erro (arrow function)
   */
  getEmptyPatterns = () => {
    return {
      support: 0,
      resistance: 0,
      breakout: null,
      triangle: null,
      flag: null,
      wedge: null,
      double: null,
      headShoulders: null,
      candlestick: []
    };
  }

  /**
   * Detecta rompimentos de suporte/resistência (arrow function)
   */
  detectBreakout = (data, support, resistance) => {
    try {
      const currentPrice = data.close[data.close.length - 1];
      const previousPrice = data.close[data.close.length - 2];
      const volume = data.volume[data.volume.length - 1];
      const avgVolume = data.volume.reduce((a, b) => a + b, 0) / data.volume.length;

      // Rompimento de resistência com volume
      if (currentPrice > resistance && 
          previousPrice <= resistance && 
          volume > avgVolume * this.config.breakoutVolumeThreshold) {
        this.log('✅ Rompimento bullish detectado');
        return { 
          type: 'BULLISH_BREAKOUT', 
          level: resistance, 
          strength: 'HIGH', 
          confidence: 85,
          volumeConfirmation: true
        };
      }

      // Rompimento de suporte com volume
      if (currentPrice < support && 
          previousPrice >= support && 
          volume > avgVolume * this.config.breakoutVolumeThreshold) {
        this.log('✅ Rompimento bearish detectado');
        return { 
          type: 'BEARISH_BREAKOUT', 
          level: support, 
          strength: 'HIGH', 
          confidence: 85,
          volumeConfirmation: true
        };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar breakout:', error.message);
      return null;
    }
  }

  /**
   * Detecta triângulos ascendentes/descendentes (arrow function)
   */
  detectTriangles = (data) => {
    try {
      const analysisWindow = Math.min(10, data.high.length);
      const highs = data.high.slice(-analysisWindow);
      const lows = data.low.slice(-analysisWindow);

      // Usa regressão linear para melhor precisão
      const resistanceSlope = this.calculateLinearRegression(highs).slope;
      const supportSlope = this.calculateLinearRegression(lows).slope;

      // Triângulo ascendente: resistência horizontal, suporte ascendente
      if (Math.abs(resistanceSlope) < this.config.tolerance && supportSlope > this.config.tolerance) {
        this.log('✅ Triângulo ascendente detectado');
        return { 
          type: 'ASCENDING_TRIANGLE', 
          bias: 'BULLISH', 
          confidence: 70,
          resistanceSlope,
          supportSlope
        };
      }

      // Triângulo descendente: suporte horizontal, resistência descendente
      if (Math.abs(supportSlope) < this.config.tolerance && resistanceSlope < -this.config.tolerance) {
        this.log('✅ Triângulo descendente detectado');
        return { 
          type: 'DESCENDING_TRIANGLE', 
          bias: 'BEARISH', 
          confidence: 70,
          resistanceSlope,
          supportSlope
        };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar triângulos:', error.message);
      return null;
    }
  }

  /**
   * Detecta bandeiras de alta/baixa (arrow function com índices relativos)
   */
  detectFlags = (data) => {
    try {
      const prices = data.close;
      const lastIndex = prices.length - 1;
      const midIndex = Math.floor(prices.length / 2);
      const quarterIndex = Math.floor(prices.length * 0.75);

      // Movimento forte seguido de consolidação (índices relativos)
      const strongMove = Math.abs(prices[lastIndex] - prices[midIndex]) > prices[midIndex] * 0.05;
      const consolidation = Math.abs(prices[lastIndex] - prices[quarterIndex]) < prices[quarterIndex] * 0.02;

      if (strongMove && consolidation) {
        const direction = prices[lastIndex] > prices[midIndex] ? 'BULLISH' : 'BEARISH';
        this.log(`✅ Bandeira ${direction.toLowerCase()} detectada`);
        return { 
          type: `${direction}_FLAG`, 
          strength: 'MEDIUM', 
          confidence: 65,
          moveSize: Math.abs(prices[lastIndex] - prices[midIndex]) / prices[midIndex] * 100
        };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar bandeiras:', error.message);
      return null;
    }
  }

  /**
   * Detecta cunhas (arrow function com verificação de convergência)
   */
  detectWedges = (data) => {
    try {
      const analysisWindow = Math.min(10, data.high.length);
      const highs = data.high.slice(-analysisWindow);
      const lows = data.low.slice(-analysisWindow);

      const highsRegression = this.calculateLinearRegression(highs);
      const lowsRegression = this.calculateLinearRegression(lows);

      const highsSlope = highsRegression.slope;
      const lowsSlope = lowsRegression.slope;

      // Verifica convergência (linhas se aproximando)
      const isConverging = Math.abs(highsSlope - lowsSlope) > this.config.tolerance;

      // Cunha ascendente: ambas as linhas sobem, mas com convergência
      if (highsSlope > 0 && lowsSlope > 0 && isConverging && highsSlope < lowsSlope) {
        this.log('✅ Cunha ascendente detectada');
        return { 
          type: 'RISING_WEDGE', 
          bias: 'BEARISH', 
          confidence: 60,
          convergence: Math.abs(highsSlope - lowsSlope),
          highsSlope,
          lowsSlope
        };
      }

      // Cunha descendente: ambas as linhas descem, mas com convergência
      if (highsSlope < 0 && lowsSlope < 0 && isConverging && highsSlope > lowsSlope) {
        this.log('✅ Cunha descendente detectada');
        return { 
          type: 'FALLING_WEDGE', 
          bias: 'BULLISH', 
          confidence: 60,
          convergence: Math.abs(highsSlope - lowsSlope),
          highsSlope,
          lowsSlope
        };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar cunhas:', error.message);
      return null;
    }
  }

  /**
   * Detecta topo duplo/fundo duplo (arrow function com separação temporal)
   */
  detectDoublePatterns = (data, support, resistance) => {
    try {
      const highs = data.high;
      const lows = data.low;
      const tolerance = resistance * this.config.tolerance;

      // Encontra picos próximos à resistência com separação temporal
      const resistanceHits = [];
      for (let i = 0; i < highs.length; i++) {
        if (Math.abs(highs[i] - resistance) < tolerance) {
          resistanceHits.push(i);
        }
      }

      // Verifica se há pelo menos 2 picos com separação mínima
      if (resistanceHits.length >= 2) {
        const separation = resistanceHits[resistanceHits.length - 1] - resistanceHits[0];
        if (separation >= 3) { // Mínimo 3 candles de separação
          this.log('✅ Topo duplo detectado');
          return { 
            type: 'DOUBLE_TOP', 
            level: resistance, 
            bias: 'BEARISH', 
            confidence: 75,
            separation
          };
        }
      }

      // Encontra vales próximos ao suporte com separação temporal
      const supportHits = [];
      for (let i = 0; i < lows.length; i++) {
        if (Math.abs(lows[i] - support) < support * this.config.tolerance) {
          supportHits.push(i);
        }
      }

      // Verifica se há pelo menos 2 vales com separação mínima
      if (supportHits.length >= 2) {
        const separation = supportHits[supportHits.length - 1] - supportHits[0];
        if (separation >= 3) { // Mínimo 3 candles de separação
          this.log('✅ Fundo duplo detectado');
          return { 
            type: 'DOUBLE_BOTTOM', 
            level: support, 
            bias: 'BULLISH', 
            confidence: 75,
            separation
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar padrões duplos:', error.message);
      return null;
    }
  }

  /**
   * Detecta cabeça e ombros (arrow function com índices relativos)
   */
  detectHeadShoulders = (data) => {
    try {
      const minLength = 7;
      if (data.high.length < minLength) return null;

      const highs = data.high.slice(-minLength);
      const lows = data.low.slice(-minLength);

      // Índices relativos
      const leftShoulderIdx = 1;
      const headIdx = 3;
      const rightShoulderIdx = 5;

      const leftShoulder = highs[leftShoulderIdx];
      const head = highs[headIdx];
      const rightShoulder = highs[rightShoulderIdx];
      const neckline = Math.min(lows[2], lows[4]);

      // Verifica padrão com tolerância configurável
      const shoulderTolerance = leftShoulder * this.config.tolerance;
      
      if (head > leftShoulder && 
          head > rightShoulder && 
          Math.abs(leftShoulder - rightShoulder) < shoulderTolerance) {
        this.log('✅ Cabeça e ombros detectado');
        return { 
          type: 'HEAD_AND_SHOULDERS', 
          neckline, 
          bias: 'BEARISH',
          target: neckline - (head - neckline),
          confidence: 80,
          leftShoulder,
          head,
          rightShoulder
        };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar cabeça e ombros:', error.message);
      return null;
    }
  }

  /**
   * Regressão linear simples para análise de linhas (arrow function)
   */
  calculateLinearRegression = (values) => {
    try {
      if (!Array.isArray(values) || values.length < 2) {
        return { slope: 0, intercept: 0, r2: 0 };
      }

      const n = values.length;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = values;

      const sumX = x.reduce((a, b) => a + b, 0);
      const sumY = y.reduce((a, b) => a + b, 0);
      const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
      const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Calcula R²
      const yMean = sumY / n;
      const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
      const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
      const r2 = ssTotal > 0 ? 1 - (ssRes / ssTotal) : 0;

      return { slope, intercept, r2 };
    } catch (error) {
      console.error('Erro ao calcular regressão linear:', error.message);
      return { slope: 0, intercept: 0, r2: 0 };
    }
  }

  /**
   * Verifica se uma linha é horizontal (arrow function com regressão)
   */
  isHorizontalLine = (values, tolerance = null) => {
    try {
      const usedTolerance = tolerance || this.config.tolerance;
      if (!Array.isArray(values) || values.length < 2) return false;
      
      const regression = this.calculateLinearRegression(values);
      return Math.abs(regression.slope) < usedTolerance && regression.r2 > 0.3;
    } catch (error) {
      console.error('Erro ao verificar linha horizontal:', error.message);
      return false;
    }
  }

  /**
   * Verifica se uma linha está subindo (arrow function com regressão)
   */
  isRisingLine = (values) => {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      
      const regression = this.calculateLinearRegression(values);
      return regression.slope > this.config.tolerance && regression.r2 > 0.3;
    } catch (error) {
      console.error('Erro ao verificar linha ascendente:', error.message);
      return false;
    }
  }

  /**
   * Verifica se uma linha está descendo (arrow function com regressão)
   */
  isFallingLine = (values) => {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      
      const regression = this.calculateLinearRegression(values);
      return regression.slope < -this.config.tolerance && regression.r2 > 0.3;
    } catch (error) {
      console.error('Erro ao verificar linha descendente:', error.message);
      return false;
    }
  }

  /**
   * Calcula volatilidade baseada em desvio padrão (arrow function)
   */
  calculateVolatility = (prices) => {
    try {
      if (!Array.isArray(prices) || prices.length < 2) return 0;

      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) {
          returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
      }

      if (returns.length === 0) return 0;

      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
      
      return Math.sqrt(variance);
    } catch (error) {
      console.error('Erro ao calcular volatilidade:', error.message);
      return 0;
    }
  }

  /**
   * Ajusta tolerâncias baseado na volatilidade (arrow function)
   */
  adjustToleranceForVolatility = (data) => {
    try {
      const volatility = this.calculateVolatility(data.close);
      
      // Ajusta tolerância baseado na volatilidade
      if (volatility > 0.05) { // Alta volatilidade
        this.config.tolerance = 0.03;
      } else if (volatility < 0.01) { // Baixa volatilidade
        this.config.tolerance = 0.01;
      } else {
        this.config.tolerance = 0.02; // Padrão
      }

      this.log(`📊 Tolerância ajustada para ${(this.config.tolerance * 100).toFixed(1)}% (volatilidade: ${(volatility * 100).toFixed(2)}%)`);
    } catch (error) {
      console.error('Erro ao ajustar tolerância:', error.message);
    }
  }

  /**
   * Obtém estatísticas dos padrões detectados (arrow function)
   */
  getPatternStats = (patterns) => {
    try {
      const stats = {
        totalPatterns: 0,
        bullishPatterns: 0,
        bearishPatterns: 0,
        neutralPatterns: 0,
        highConfidencePatterns: 0,
        patternTypes: {}
      };

      Object.entries(patterns).forEach(([key, pattern]) => {
        if (pattern && typeof pattern === 'object') {
          if (Array.isArray(pattern)) {
            // Para arrays como candlestick
            pattern.forEach(p => {
              stats.totalPatterns++;
              if (p.bias === 'BULLISH') stats.bullishPatterns++;
              else if (p.bias === 'BEARISH') stats.bearishPatterns++;
              else stats.neutralPatterns++;
              
              if (p.confidence >= 80) stats.highConfidencePatterns++;
              
              stats.patternTypes[p.type] = (stats.patternTypes[p.type] || 0) + 1;
            });
          } else {
            // Para objetos únicos
            stats.totalPatterns++;
            if (pattern.bias === 'BULLISH') stats.bullishPatterns++;
            else if (pattern.bias === 'BEARISH') stats.bearishPatterns++;
            else stats.neutralPatterns++;
            
            if (pattern.confidence >= 80) stats.highConfidencePatterns++;
            
            stats.patternTypes[pattern.type] = (stats.patternTypes[pattern.type] || 0) + 1;
          }
        }
      });

      return stats;
    } catch (error) {
      console.error('Erro ao calcular estatísticas de padrões:', error.message);
      return {
        totalPatterns: 0,
        bullishPatterns: 0,
        bearishPatterns: 0,
        neutralPatterns: 0,
        highConfidencePatterns: 0,
        patternTypes: {}
      };
    }
  }
}

export default PatternDetectionService;