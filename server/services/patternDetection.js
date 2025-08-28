/**
 * Serviço de detecção de padrões gráficos
 */

class PatternDetectionService {
  constructor() {
    console.log('✅ PatternDetectionService inicializado');
  }

  /**
   * Detecta todos os padrões gráficos
   */
  detectPatterns(data) {
    try {
      console.log('🔍 Iniciando detecção de padrões...');
      
      if (!data || !data.close || !Array.isArray(data.close) || data.close.length < 20) {
        console.warn('⚠️ Dados insuficientes para detecção de padrões');
        return this.getEmptyPatterns();
      }

      const patterns = {};

      // Dados recentes para análise
      const recentData = {
        open: data.open.slice(-20),
        high: data.high.slice(-20),
        low: data.low.slice(-20),
        close: data.close.slice(-20),
        volume: data.volume ? data.volume.slice(-20) : Array(20).fill(1)
      };

      console.log('📊 Analisando suporte e resistência...');
      // Suporte e resistência
      const resistance = Math.max(...recentData.high);
      const support = Math.min(...recentData.low);
      patterns.support = support;
      patterns.resistance = resistance;

      console.log('📈 Detectando rompimentos...');
      // Rompimentos
      patterns.breakout = this.detectBreakout(recentData, support, resistance);

      console.log('🔺 Detectando triângulos...');
      // Triângulos
      patterns.triangle = this.detectTriangles(recentData);

      console.log('🏳️ Detectando bandeiras...');
      // Bandeiras
      patterns.flag = this.detectFlags(recentData);

      console.log('📐 Detectando cunhas...');
      // Cunhas
      patterns.wedge = this.detectWedges(recentData);

      console.log('🔄 Detectando padrões duplos...');
      // Topo/Fundo duplo
      patterns.double = this.detectDoublePatterns(recentData, support, resistance);

      console.log('👤 Detectando cabeça e ombros...');
      // Cabeça e ombros
      patterns.headShoulders = this.detectHeadShoulders(recentData);

      console.log('🕯️ Detectando padrões de candlestick...');
      // Padrões de candlestick
      patterns.candlestick = this.detectCandlestickPatterns(recentData);

      console.log('✅ Detecção de padrões concluída');
      return patterns;
    } catch (error) {
      console.error('❌ Erro ao detectar padrões:', error.message);
      return this.getEmptyPatterns();
    }
  }

  /**
   * Retorna padrões vazios em caso de erro
   */
  getEmptyPatterns() {
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
   * Detecta rompimentos de suporte/resistência
   */
  detectBreakout(data, support, resistance) {
    try {
      const currentPrice = data.close[data.close.length - 1];
      const previousPrice = data.close[data.close.length - 2];
      const volume = data.volume[data.volume.length - 1];
      const avgVolume = data.volume.reduce((a, b) => a + b, 0) / data.volume.length;

      // Rompimento de resistência com volume
      if (currentPrice > resistance && previousPrice <= resistance && volume > avgVolume * 1.5) {
        return { type: 'BULLISH_BREAKOUT', level: resistance, strength: 'HIGH' };
      }

      // Rompimento de suporte com volume
      if (currentPrice < support && previousPrice >= support && volume > avgVolume * 1.5) {
        return { type: 'BEARISH_BREAKOUT', level: support, strength: 'HIGH' };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar breakout:', error.message);
      return null;
    }
  }

  /**
   * Detecta triângulos ascendentes/descendentes
   */
  detectTriangles(data) {
    try {
      const highs = data.high.slice(-10);
      const lows = data.low.slice(-10);

      // Triângulo ascendente: resistência horizontal, suporte ascendente
      const resistanceFlat = this.isHorizontalLine(highs);
      const supportRising = this.isRisingLine(lows);

      if (resistanceFlat && supportRising) {
        return { type: 'ASCENDING_TRIANGLE', bias: 'BULLISH' };
      }

      // Triângulo descendente: suporte horizontal, resistência descendente
      const supportFlat = this.isHorizontalLine(lows);
      const resistanceFalling = this.isFallingLine(highs);

      if (supportFlat && resistanceFalling) {
        return { type: 'DESCENDING_TRIANGLE', bias: 'BEARISH' };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar triângulos:', error.message);
      return null;
    }
  }

  /**
   * Detecta bandeiras de alta/baixa
   */
  detectFlags(data) {
    try {
      const prices = data.close;
      
      // Movimento forte seguido de consolidação
      const strongMove = Math.abs(prices[19] - prices[10]) > prices[10] * 0.05;
      const consolidation = Math.abs(prices[19] - prices[15]) < prices[15] * 0.02;

      if (strongMove && consolidation) {
        const direction = prices[19] > prices[10] ? 'BULLISH' : 'BEARISH';
        return { type: `${direction}_FLAG`, strength: 'MEDIUM' };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar bandeiras:', error.message);
      return null;
    }
  }

  /**
   * Detecta cunhas
   */
  detectWedges(data) {
    try {
      const highs = data.high.slice(-10);
      const lows = data.low.slice(-10);

      const highsRising = this.isRisingLine(highs);
      const lowsRising = this.isRisingLine(lows);
      const highsFalling = this.isFallingLine(highs);
      const lowsFalling = this.isFallingLine(lows);

      // Cunha ascendente: ambas as linhas sobem, mas resistência sobe mais devagar
      if (highsRising && lowsRising) {
        return { type: 'RISING_WEDGE', bias: 'BEARISH' };
      }

      // Cunha descendente: ambas as linhas descem, mas suporte desce mais devagar
      if (highsFalling && lowsFalling) {
        return { type: 'FALLING_WEDGE', bias: 'BULLISH' };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar cunhas:', error.message);
      return null;
    }
  }

  /**
   * Detecta topo duplo/fundo duplo
   */
  detectDoublePatterns(data, support, resistance) {
    try {
      const highs = data.high;
      const lows = data.low;

      // Topo duplo: dois picos próximos à resistência
      const resistanceHits = highs.filter(h => Math.abs(h - resistance) < resistance * 0.01).length;
      if (resistanceHits >= 2) {
        return { type: 'DOUBLE_TOP', level: resistance, bias: 'BEARISH' };
      }

      // Fundo duplo: dois vales próximos ao suporte
      const supportHits = lows.filter(l => Math.abs(l - support) < support * 0.01).length;
      if (supportHits >= 2) {
        return { type: 'DOUBLE_BOTTOM', level: support, bias: 'BULLISH' };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar padrões duplos:', error.message);
      return null;
    }
  }

  /**
   * Detecta cabeça e ombros
   */
  detectHeadShoulders(data) {
    try {
      if (data.high.length < 7) return null;

      const highs = data.high.slice(-7);
      const lows = data.low.slice(-7);

      // Cabeça e ombros: pico central maior que os laterais
      const leftShoulder = highs[1];
      const head = highs[3];
      const rightShoulder = highs[5];
      const neckline = Math.min(lows[2], lows[4]);

      if (head > leftShoulder && head > rightShoulder && 
          Math.abs(leftShoulder - rightShoulder) < leftShoulder * 0.02) {
        return { 
          type: 'HEAD_AND_SHOULDERS', 
          neckline, 
          bias: 'BEARISH',
          target: neckline - (head - neckline)
        };
      }

      return null;
    } catch (error) {
      console.error('Erro ao detectar cabeça e ombros:', error.message);
      return null;
    }
  }

  /**
   * Detecta padrões de candlestick
   */
  detectCandlestickPatterns(data) {
    try {
      console.log('🕯️ Detectando padrões de candlestick...');
      const patterns = [];
      const lastIndex = data.close.length - 1;

      if (lastIndex < 1) {
        console.log('⚠️ Dados insuficientes para padrões candlestick');
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

      // Doji
      if (Math.abs(current.open - current.close) < current.close * 0.001) {
        patterns.push({ type: 'DOJI', bias: 'NEUTRAL', confidence: 70 });
        console.log('✅ Padrão DOJI detectado');
      }

      // Engolfo bullish
      if (previous.close < previous.open && // Candle anterior bearish
          current.close > current.open && // Candle atual bullish
          current.open < previous.close && // Abre abaixo do fechamento anterior
          current.close > previous.open) { // Fecha acima da abertura anterior
        patterns.push({ type: 'BULLISH_ENGULFING', bias: 'BULLISH', confidence: 80 });
        console.log('✅ Padrão BULLISH_ENGULFING detectado');
      }

      // Engolfo bearish
      if (previous.close > previous.open && // Candle anterior bullish
          current.close < current.open && // Candle atual bearish
          current.open > previous.close && // Abre acima do fechamento anterior
          current.close < previous.open) { // Fecha abaixo da abertura anterior
        patterns.push({ type: 'BEARISH_ENGULFING', bias: 'BEARISH', confidence: 80 });
        console.log('✅ Padrão BEARISH_ENGULFING detectado');
      }

      // Martelo
      const bodySize = Math.abs(current.close - current.open);
      const lowerShadow = Math.min(current.open, current.close) - current.low;
      const upperShadow = current.high - Math.max(current.open, current.close);

      if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
        patterns.push({ type: 'HAMMER', bias: 'BULLISH', confidence: 75 });
        console.log('✅ Padrão HAMMER detectado');
      }

      // Enforcado
      if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
        patterns.push({ type: 'HANGING_MAN', bias: 'BEARISH', confidence: 75 });
        console.log('✅ Padrão HANGING_MAN detectado');
      }

      console.log(`✅ ${patterns.length} padrões candlestick detectados`);
      return patterns;
    } catch (error) {
      console.error('❌ Erro ao detectar padrões candlestick:', error.message);
      return [];
    }
  }

  /**
   * Valida se um candle tem dados válidos
   */
  isValidCandle(candle) {
    return candle && 
           typeof candle.open === 'number' && isFinite(candle.open) &&
           typeof candle.high === 'number' && isFinite(candle.high) &&
           typeof candle.low === 'number' && isFinite(candle.low) &&
           typeof candle.close === 'number' && isFinite(candle.close) &&
           candle.high >= candle.low &&
           candle.high >= Math.max(candle.open, candle.close) &&
           candle.low <= Math.min(candle.open, candle.close);
  }

  /**
   * Verifica se uma linha é horizontal
   */
  isHorizontalLine(values, tolerance = 0.02) {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      const first = values[0];
      const last = values[values.length - 1];
      return Math.abs(last - first) < first * tolerance;
    } catch (error) {
      console.error('Erro ao verificar linha horizontal:', error.message);
      return false;
    }
  }

  /**
   * Verifica se uma linha está subindo
   */
  isRisingLine(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      const first = values[0];
      const last = values[values.length - 1];
      return last > first;
    } catch (error) {
      console.error('Erro ao verificar linha ascendente:', error.message);
      return false;
    }
  }

  /**
   * Verifica se uma linha está descendo
   */
  isFallingLine(values) {
    try {
      if (!Array.isArray(values) || values.length < 2) return false;
      const first = values[0];
      const last = values[values.length - 1];
      return last < first;
    } catch (error) {
      console.error('Erro ao verificar linha descendente:', error.message);
      return false;
    }
  }
}

export default PatternDetectionService;