/**
 * Serviço de detecção de padrões gráficos
 */

class PatternDetectionService {
  /**
   * Detecta todos os padrões gráficos
   */
  detectPatterns(data) {
    const patterns = {};

    try {
      // Dados recentes para análise
      const recentData = {
        open: data.open.slice(-20),
        high: data.high.slice(-20),
        low: data.low.slice(-20),
        close: data.close.slice(-20),
        volume: data.volume.slice(-20)
      };

      // Suporte e resistência
      const resistance = Math.max(...recentData.high);
      const support = Math.min(...recentData.low);

      patterns.support = support;
      patterns.resistance = resistance;

      // Rompimentos
      patterns.breakout = this.detectBreakout(recentData, support, resistance);

      // Triângulos
      patterns.triangle = this.detectTriangles(recentData);

      // Bandeiras
      patterns.flag = this.detectFlags(recentData);

      // Cunhas
      patterns.wedge = this.detectWedges(recentData);

      // Topo/Fundo duplo
      patterns.double = this.detectDoublePatterns(recentData, support, resistance);

      // Cabeça e ombros
      patterns.headShoulders = this.detectHeadShoulders(recentData);

      // Padrões de candlestick
      patterns.candlestick = this.detectCandlestickPatterns(recentData);

      return patterns;
    } catch (error) {
      console.error('Erro ao detectar padrões:', error.message);
      return {};
    }
  }

  /**
   * Detecta rompimentos de suporte/resistência
   */
  detectBreakout(data, support, resistance) {
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
  }

  /**
   * Detecta triângulos ascendentes/descendentes
   */
  detectTriangles(data) {
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
  }

  /**
   * Detecta bandeiras de alta/baixa
   */
  detectFlags(data) {
    const prices = data.close;
    
    // Movimento forte seguido de consolidação
    const strongMove = Math.abs(prices[19] - prices[10]) > prices[10] * 0.05;
    const consolidation = Math.abs(prices[19] - prices[15]) < prices[15] * 0.02;

    if (strongMove && consolidation) {
      const direction = prices[19] > prices[10] ? 'BULLISH' : 'BEARISH';
      return { type: `${direction}_FLAG`, strength: 'MEDIUM' };
    }

    return null;
  }

  /**
   * Detecta cunhas
   */
  detectWedges(data) {
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
  }

  /**
   * Detecta topo duplo/fundo duplo
   */
  detectDoublePatterns(data, support, resistance) {
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
  }

  /**
   * Detecta cabeça e ombros
   */
  detectHeadShoulders(data) {
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
  }

  /**
   * Detecta padrões de candlestick
   */
  detectCandlestickPatterns(data) {
    const patterns = [];
    const lastIndex = data.close.length - 1;

    if (lastIndex < 1) return patterns;

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

    // Doji
    if (Math.abs(current.open - current.close) < current.close * 0.001) {
      patterns.push({ type: 'DOJI', bias: 'NEUTRAL' });
    }

    // Engolfo bullish
    if (previous.close < previous.open && // Candle anterior bearish
        current.close > current.open && // Candle atual bullish
        current.open < previous.close && // Abre abaixo do fechamento anterior
        current.close > previous.open) { // Fecha acima da abertura anterior
      patterns.push({ type: 'BULLISH_ENGULFING', bias: 'BULLISH' });
    }

    // Engolfo bearish
    if (previous.close > previous.open && // Candle anterior bullish
        current.close < current.open && // Candle atual bearish
        current.open > previous.close && // Abre acima do fechamento anterior
        current.close < previous.open) { // Fecha abaixo da abertura anterior
      patterns.push({ type: 'BEARISH_ENGULFING', bias: 'BEARISH' });
    }

    // Martelo
    const bodySize = Math.abs(current.close - current.open);
    const lowerShadow = Math.min(current.open, current.close) - current.low;
    const upperShadow = current.high - Math.max(current.open, current.close);

    if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
      patterns.push({ type: 'HAMMER', bias: 'BULLISH' });
    }

    // Enforcado
    if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
      patterns.push({ type: 'HANGING_MAN', bias: 'BEARISH' });
    }

    return patterns;
  }

  /**
   * Detecta padrões de candlestick
   */
  detectCandlestickPatterns(data) {
    const patterns = [];
    const lastIndex = data.close.length - 1;

    if (lastIndex < 1) return patterns;

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

    // Doji
    if (Math.abs(current.open - current.close) < current.close * 0.001) {
      patterns.push({ type: 'DOJI', bias: 'NEUTRAL' });
    }

    // Engolfo bullish
    if (previous.close < previous.open && // Candle anterior bearish
        current.close > current.open && // Candle atual bullish
        current.open < previous.close && // Abre abaixo do fechamento anterior
        current.close > previous.open) { // Fecha acima da abertura anterior
      patterns.push({ type: 'BULLISH_ENGULFING', bias: 'BULLISH' });
    }

    // Engolfo bearish
    if (previous.close > previous.open && // Candle anterior bullish
        current.close < current.open && // Candle atual bearish
        current.open > previous.close && // Abre acima do fechamento anterior
        current.close < previous.open) { // Fecha abaixo da abertura anterior
      patterns.push({ type: 'BEARISH_ENGULFING', bias: 'BEARISH' });
    }

    // Martelo
    const bodySize = Math.abs(current.close - current.open);
    const lowerShadow = Math.min(current.open, current.close) - current.low;
    const upperShadow = current.high - Math.max(current.open, current.close);

    if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
      patterns.push({ type: 'HAMMER', bias: 'BULLISH' });
    }

    // Enforcado
    if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
      patterns.push({ type: 'HANGING_MAN', bias: 'BEARISH' });
    }

    return patterns;
  }

  /**
   * Verifica se uma linha é horizontal
   */
  isHorizontalLine(values, tolerance = 0.02) {
    const first = values[0];
    const last = values[values.length - 1];
    return Math.abs(last - first) < first * tolerance;
  }

  /**
   * Verifica se uma linha está subindo
   */
  isRisingLine(values) {
    const first = values[0];
    const last = values[values.length - 1];
    return last > first;
  }

  /**
   * Verifica se uma linha está descendo
   */
  isFallingLine(values) {
    const first = values[0];
    const last = values[values.length - 1];
    return last < first;
  }
}

export default PatternDetectionService;