/**
 * Serviço do bot do Telegram
 */

import TelegramBot from 'node-telegram-bot-api';

class TelegramBotService {
  constructor() {
    this.isEnabled = !!(process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TOKEN !== 'placeholder_token_here');
    
    if (this.isEnabled) {
      this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });
      this.chatId = process.env.TELEGRAM_CHAT_ID;
    } else {
      console.log('⚠️  Telegram não configurado - usando modo de desenvolvimento');
      this.bot = null;
      this.chatId = null;
    }
    
    this.activeMonitors = new Map();
  }

  /**
   * Envia sinal de trading
   */
  async sendTradingSignal(signal, chart) {
    try {
      if (!this.isEnabled) {
        console.log(`📊 [DEV] Sinal simulado para ${signal.symbol} (${signal.probability.toFixed(1)}%)`);
        return;
      }
      
      // Verifica se já enviou este sinal recentemente (evita duplicatas)
      const signalKey = `${signal.symbol}_${signal.entry}_${signal.timeframe}`;
      const now = Date.now();
      const lastSent = this.lastSignalSent?.get?.(signalKey);
      
      if (lastSent && (now - lastSent) < 60000) { // 1 minuto de cooldown
        console.log(`⚠️ Sinal duplicado ignorado para ${signal.symbol} (enviado há ${Math.round((now - lastSent)/1000)}s)`);
        return;
      }
      
      const message = this.formatSignalMessage(signal);
      
      // Envia sinal principal
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      // Registra envio para evitar duplicatas
      if (!this.lastSignalSent) {
        this.lastSignalSent = new Map();
      }
      this.lastSignalSent.set(signalKey, now);
      
      // Limpa registros antigos (mais de 5 minutos)
      for (const [key, timestamp] of this.lastSignalSent.entries()) {
        if (now - timestamp > 300000) { // 5 minutos
          this.lastSignalSent.delete(key);
        }
      }

      console.log(`Sinal enviado para ${signal.symbol}`);
    } catch (error) {
      console.error('Erro ao enviar sinal:', error.message);
    }
  }

  /**
   * Formata mensagem do sinal
   */
  formatSignalMessage(signal) {
    const { symbol, probability, entry, targets, stopLoss, riskRewardRatio, details, timeframe, isMLDriven } = signal;
    
    // Determina se é LONG ou SHORT baseado na tendência
    const isLong = signal.trend === 'BULLISH';
    const direction = isLong ? 'COMPRA' : 'VENDA';
    const directionEmoji = isLong ? '🟢' : '🔴';
    const symbolName = symbol.split('/')[0];

    // Adiciona identificação de ML se aplicável
    const mlIndicator = isMLDriven ? ' 🤖 *ML*' : '';
    
    // Função para formatar preços com precisão adequada
    const formatPrice = (price) => {
      // Moedas principais: apenas 2 casas decimais
      if (['BTC', 'ETH', 'SOL', 'LTC'].includes(symbolName)) {
        return price.toFixed(2);
      }
      // Outras moedas: formatação baseada no valor
      if (price >= 1) return price.toFixed(4);
      if (price >= 0.01) return price.toFixed(6);
      return price.toFixed(8);
    };
    
    let message = `🚨 *SINAL LOBO #${symbolName}*${mlIndicator} ${directionEmoji} *${direction}* (Futures)\n\n`;
    message += `💰 #${symbolName} Futures\n`;
    message += `📊 TEMPO GRÁFICO: ${timeframe || '1h'}\n`;
    message += `📈 Alavancagem sugerida: 15x\n`;
    
    // Se for ML-driven, adiciona informação especial
    if (isMLDriven) {
      message += `🤖 *Sinal gerado por Machine Learning*\n`;
    }
    
    message += `🎯 Probabilidade: ${Math.round(probability)}/100\n`;
    message += `⚡️ Entrada: $${formatPrice(entry)}\n\n`;

    message += `🎯 Alvos:\n`;
    targets.forEach((target, index) => {
      const targetEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '🌕'][index] || '🎯';
      const targetLabel = index === 5 ? (isLong ? 'Alvo 6 - Lua!' : 'Alvo 6 - Queda Infinita') : `Alvo ${index + 1}`;
      message += `${targetEmoji} ${targetLabel}: $${formatPrice(target)}\n`;
    });

    message += `\n🛑 Stop Loss: $${formatPrice(stopLoss)}\n\n`;
    
    message += `👑 Sinais Lobo Cripto`;

    message += `\n⏰ ${new Date().toLocaleString('pt-BR')}`;

    return message;
  }

  /**
   * Formata mensagem de análise técnica
   */
  formatAnalysisMessage(signal) {
    const { symbol, details, indicators, patterns, isMLDriven, mlContribution, marketTrend } = signal;
    const symbolName = this.escapeMarkdown(symbol.split('/')[0]);


    // Título diferente se for ML-driven
    const analysisTitle = isMLDriven ? 
      `🤖 *ANÁLISE ML + TÉCNICA #${symbolName}*\n\n` : 
      `📊 *ANÁLISE TÉCNICA #${symbolName}*\n\n`;
    
    let message = analysisTitle;
    
    // Informações de tendência
    if (marketTrend || details.trendAdjustment) {
      message += `📈 *Análise de Tendência:*\n`;
      if (marketTrend) {
        const trendEmoji = this.getTrendEmoji(marketTrend);
        message += `   • Tendência do mercado: ${trendEmoji} ${marketTrend}\n`;
      }
      if (details.trendAdjustment) {
        const adj = details.trendAdjustment;
        const adjEmoji = adj.adjustment > 0 ? '🟢' : adj.adjustment < 0 ? '🔴' : '🟡';
        message += `   • ${this.escapeMarkdown(adj.reason)} ${adjEmoji}\n`;
        if (adj.adjustment !== 0) {
          message += `   • Ajuste de pontuação: ${adj.adjustment > 0 ? '+' : ''}${this.escapeMarkdown(adj.adjustment.toString())}%\n`;
        }
        
        // Destaca sinais contra-tendência aprovados
        if (adj.reason.includes('Padrão de reversão muito forte')) {
          message += `   ⚠️ *SINAL CONTRA-TENDÊNCIA APROVADO*\n`;
          message += `   🔄 Padrões de reversão extremamente fortes detectados\n`;
        }
      }
      message += '\n';
    }

    // Se for ML-driven, destaca a contribuição da IA
    if (isMLDriven) {
      message += `🤖 *Inteligência Artificial:*\n`;
      message += `   • Contribuição IA: ${this.escapeMarkdown(mlContribution?.toFixed(1))}% da pontuação\n`;
      message += `   • Modelo treinado com 500+ períodos históricos\n`;
      message += `   • Padrões complexos detectados pela IA\n\n`;
    }

    // Indicadores técnicos
    if (indicators) {
      message += `📈 *Indicadores:*\n`;
      
      if (indicators.rsi !== null && indicators.rsi !== undefined) {
        const rsiStatus = indicators.rsi < 25 ? 'Sobrevendido 🟢' : 
                         indicators.rsi > 85 ? 'Sobrecomprado 🔴' : 'Neutro 🟡';
        message += `   • RSI (14): ${this.escapeMarkdown(indicators.rsi.toFixed(1))} - ${rsiStatus}\n`;
      }

      if (indicators.macd && indicators.macd.MACD !== null) {
        const macdStatus = indicators.macd.MACD > indicators.macd.signal ? 'Bullish 🟢' : 'Bearish 🔴';
        message += `   • MACD: ${this.escapeMarkdown(indicators.macd.MACD.toFixed(4))} - ${macdStatus}\n`;
      }

      if (indicators.ma21 && indicators.ma200) {
        const trendStatus = indicators.ma21 > indicators.ma200 ? 'Alta 🟢' : 'Baixa 🔴';
        message += `   • Tendência (MA21/MA200): ${trendStatus}\n`;
      }

      message += '\n';
    }

    // Padrões gráficos
    if (patterns) {
      message += `🔍 *Padrões Detectados:*\n`;
      
      if (patterns.support && patterns.resistance) {
        message += `   • Suporte: $${this.escapeMarkdown(patterns.support.toFixed(2))}\n`;
        message += `   • Resistência: $${this.escapeMarkdown(patterns.resistance.toFixed(2))}\n`;
      }

      if (patterns.breakout) {
        if (patterns.breakout.type === 'BULLISH_BREAKOUT') {
          message += `   • 🚀 Rompimento de Alta: Preço quebrou resistência com força\n`;
          message += `     (Sinal forte de continuação da alta)\n`;
        } else {
          message += `   • 📉 Rompimento de Baixa: Preço quebrou suporte com força\n`;
          message += `     (Sinal forte de continuação da queda)\n`;
        }
      }

      if (patterns.triangle) {
        const triangleExplanation = this.explainTrianglePattern(patterns.triangle);
        message += `   • ${triangleExplanation}\n`;
      }

      if (patterns.flag) {
        const flagExplanation = this.explainFlagPattern(patterns.flag);
        message += `   • ${flagExplanation}\n`;
      }

      if (patterns.wedge) {
        const wedgeExplanation = this.explainWedgePattern(patterns.wedge);
        message += `   • ${wedgeExplanation}\n`;
      }

      if (patterns.double) {
        const doubleExplanation = this.explainDoublePattern(patterns.double);
        message += `   • ${doubleExplanation}\n`;
      }

      if (patterns.candlestick && patterns.candlestick.length > 0) {
        patterns.candlestick.forEach(pattern => {
          const candleExplanation = this.explainCandlestickPattern(pattern);
          message += `   • ${candleExplanation}\n`;
        });
      }

      message += '\n';
    }

    // Pontuação detalhada
    if (details) {
      message += `⚡ *Pontuação do Sinal:*\n`;
      
      if (details.indicators) {
        Object.entries(details.indicators).forEach(([key, data]) => {
          if (data.score && data.reason) {
            const emoji = data.score > 0 ? '🟢' : '🔴';
            message += `   • ${this.escapeMarkdown(data.reason)}: ${data.score > 0 ? '+' : ''}${this.escapeMarkdown(data.score.toString())} ${emoji}\n`;
          }
        });
      }

      if (details.patterns) {
        Object.entries(details.patterns).forEach(([key, data]) => {
          if (data.score && data.reason) {
            const emoji = data.score > 0 ? '🟢' : '🔴';
            message += `   • ${this.escapeMarkdown(data.reason)}: ${data.score > 0 ? '+' : ''}${this.escapeMarkdown(data.score.toString())} ${emoji}\n`;
          }
        });
      }

      if (details.volume) {
        message += `   • Volume: +${this.escapeMarkdown(details.volume.toString())} 🟢\n`;
      }

      if (details.machineLearning) {
        message += `   • IA/ML: +${this.escapeMarkdown(details.machineLearning.toFixed(1))} 🤖\n`;
      }
    }

    message += `\n👑 Sinais Lobo Cripto`;
    return message;
  }

  /**
   * Formata mensagem do gráfico
   */
  formatChartMessage(signal, chart) {
    const { symbol } = signal;
    const symbolName = this.escapeMarkdown(symbol.split('/')[0]);


    let message = `📈 *DADOS DO GRÁFICO #${symbolName}*\n\n`;

    if (chart && chart.data) {
      const prices = chart.data.prices;
      const currentPrice = prices[prices.length - 1];
      const previousPrice = prices[prices.length - 2];
      const change = ((currentPrice - previousPrice) / previousPrice * 100);

      message += `💰 *Preço Atual:* $${this.escapeMarkdown(currentPrice.toFixed(2))}\n`;
      message += `📊 *Variação:* ${change > 0 ? '+' : ''}${this.escapeMarkdown(change.toFixed(2))}%\n\n`;

      // Últimos 5 preços
      message += `📋 *Últimos 5 Candles:*\n`;
      const lastPrices = prices.slice(-5);
      lastPrices.forEach((price, index) => {
        const emoji = index === lastPrices.length - 1 ? '🔥' : '•';
        message += `   ${emoji} $${this.escapeMarkdown(price.toFixed(2))}\n`;
      });
    }

    if (chart && chart.indicators) {
      message += `\n🔢 *Indicadores Atuais:*\n`;
      if (chart.indicators.rsi) {
        message += `   • RSI: ${this.escapeMarkdown(chart.indicators.rsi.toFixed(1))}\n`;
      }
      if (chart.indicators.ma21) {
        message += `   • MA21: $${this.escapeMarkdown(chart.indicators.ma21.toFixed(2))}\n`;
      }
      if (chart.indicators.ma200) {
        message += `   • MA200: $${this.escapeMarkdown(chart.indicators.ma200.toFixed(2))}\n`;
      }
    }

    message += `\n⏰ ${new Date().toLocaleString('pt-BR')}`;
    message += `\n👑 Sinais Lobo Cripto`;

    return message;
  }

  /**
   * Envia análise do Bitcoin
   */
  async sendBitcoinAnalysis(analysis) {
    try {
      if (!this.isEnabled) {
        console.log(`₿ [DEV] Análise do Bitcoin simulada: $${analysis.currentPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2})} - ${analysis.trend}`);
        return;
      }
      
      // Determina emoji e hashtag baseado na tendência
      const trendEmoji = this.getTrendEmoji(analysis.trend);
      const trendHash = analysis.trend === 'BULLISH' ? '#BULL' : 
                       analysis.trend === 'BEARISH' ? '#BEAR' : '#NEUTRAL';
      const trendText = analysis.trend === 'BULLISH' ? 'ALTA' : 
                       analysis.trend === 'BEARISH' ? 'BAIXA' : 'LATERAL';
      
      let message = `📈${trendEmoji} *ANÁLISE BTC ${trendHash}*\n\n`;
      
      message += `📊 *Tendência Atual:* ${trendText}\n`;
      message += `⚡️ *Força:* ${this.escapeMarkdown(analysis.strength?.toFixed(0) || '50')}%\n`;
      message += `⏱️ *Análise:* ${new Date().toLocaleString('pt-BR')}\n\n`;

      message += `📊 *Níveis Importantes:*\n`;
      message += `💲 *Preço Atual:* $${analysis.currentPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
      message += `🔺 *Resistência:* $${analysis.resistance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
      message += `🔻 *Suporte:* $${analysis.support.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n\n`;

      // Análise por timeframe
      message += `📈 *ANÁLISE POR TIMEFRAME:*\n`;
      if (analysis.timeframes) {
        analysis.timeframes.forEach(tf => {
          const tfEmoji = this.getTrendEmoji(tf.trend);
          const tfText = tf.trend === 'BULLISH' ? 'ALTA' : 
                        tf.trend === 'BEARISH' ? 'BAIXA' : 'LATERAL';
          message += `📈${tfEmoji} *${tf.timeframe}:* ${tfText} (Score: ${tf.strength.toFixed(0)})\n`;
        });
      } else {
        // Fallback se não tiver dados de timeframes
        message += `📈${trendEmoji} *4h:* ${trendText} (Score: ${(analysis.strength || 50).toFixed(0)})\n`;
      }
      message += '\n';

      // Interpretação inteligente
      message += `🔍 *INTERPRETAÇÃO:*\n\n`;
      
      // Usa interpretação inteligente se disponível
      if (analysis.smartInterpretation && analysis.smartInterpretation.length > 0) {
        analysis.smartInterpretation.forEach(point => {
          message += `${point}\n`;
        });
      } else {
        // Fallback para interpretação básica
        if (analysis.trend === 'BULLISH') {
          message += `• Favorece sinais de *COMPRA* em timeframes menores\n`;
          message += `• Possíveis quedas temporárias são oportunidades de compra\n`;
          message += `• Mantenha posições de compra, mas com cautela\n`;
          message += `• Evite posições de venda contra a tendência\n`;
        } else if (analysis.trend === 'BEARISH') {
          message += `• Favorece sinais de *VENDA* em timeframes menores\n`;
          message += `• Possíveis subidas temporárias são oportunidades de venda\n`;
          message += `• Mantenha posições de venda, mas com cautela\n`;
          message += `• Evite posições de compra contra a tendência\n`;
        } else {
          message += `• Mercado em consolidação lateral\n`;
          message += `• Aguarde o preço quebrar suporte ou resistência\n`;
          message += `• Sinais de rompimento podem ser mais confiáveis\n`;
          message += `• Gestão de risco é fundamental neste momento\n`;
        }
      }
      
      // Adiciona informações extras se disponíveis
      if (analysis.rsi) {
        message += `\n📊 *Indicadores Extras:*\n`;
        message += `• RSI(14): ${analysis.rsi.toFixed(1)}`;
        if (analysis.rsi < 25) {
          message += ` - Sobrevendido 🟢\n`;
        } else if (analysis.rsi > 85) {
          message += ` - Sobrecomprado 🔴\n`;
        } else {
          message += ` - Neutro 🟡\n`;
        }
      }
      
      if (analysis.volume && analysis.volumeAvg) {
        const volumeRatio = analysis.volume / analysis.volumeAvg;
        message += `• Volume: ${volumeRatio > 1.2 ? 'Alto 🟢' : volumeRatio < 0.8 ? 'Baixo 🔴' : 'Normal 🟡'}\n`;
      }
      
      message += `\n⏱️ *Atualizado em:* ${new Date().toLocaleString('pt-BR')}\n\n`;
     
      message += `👑 Sinais Lobo Cripto`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log('Análise do Bitcoin enviada');
    } catch (error) {
      console.error('Erro ao enviar análise do Bitcoin:', error.message);
    }
  }

  /**
   * Envia análise de sentimento do mercado
   */
  async sendMarketSentiment(sentiment) {
    try {
      if (!this.isEnabled) {
        console.log(`🌍 [DEV] Sentimento do mercado simulado: ${sentiment.overall}`);
        return;
      }
      
      let message = `🌍 *SENTIMENTO DO MERCADO*\n\n`;
      
      const sentimentEmoji = sentiment.overall === 'BULLISH' ? '🟢' : 
                           sentiment.overall === 'BEARISH' ? '🔴' : '🟡';
      
      message += `${sentimentEmoji} *Sentimento Geral:* ${sentiment.overall}\n`;
      message += `   • P&L total: ${report.summary.totalPnL}% (Alv. 15×)\n`;
      message += `🔥 *Volatilidade:* ${sentiment.volatility.toFixed(2)}%\n\n`;

      message += `📋 *Resumo:*\n`;
      message += `   • Ativos em alta: ${sentiment.assetsUp}\n`;
      message += `   • Ativos em baixa: ${sentiment.assetsDown}\n`;
      message += `   • Volume vs média: ${sentiment.volumeVsAverage > 1 ? '+' : ''}${((sentiment.volumeVsAverage - 1) * 100).toFixed(1)}%\n\n`;

      // Adiciona análise de redes sociais se disponível
      if (sentiment.socialSentiment) {
        const social = sentiment.socialSentiment;
        message += `📱 *Redes Sociais:*\n`;
        message += `   • Sentimento geral: ${social.overall} (${social.score}/100)\n`;
        message += `   • Confiança: ${social.confidence}%\n`;
        message += `   • Fontes: ${social.sources.length} plataformas analisadas\n`;
        
        if (social.breakdown) {
          message += `   • Bullish: ${social.breakdown.bullish} | Bearish: ${social.breakdown.bearish} | Neutro: ${social.breakdown.neutral}\n`;
        }
        message += '\n';
        
        // Adiciona detalhes das redes sociais
        if (social.details && social.details.length > 0) {
          message += `📊 *Detalhes Sociais:*\n`;
          social.details.slice(0, 4).forEach(detail => {
            message += `   • ${detail}\n`;
          });
          message += '\n';
        }
      }

      // Adiciona análise detalhada se disponível
      if (sentiment.analysis && sentiment.analysis.length > 0) {
        message += `🔍 *Análise:*\n`;
        sentiment.analysis.slice(0, 3).forEach(point => {
          message += `   • ${point}\n`;
        });
        message += '\n';
      }
      message += `⏰ ${new Date().toLocaleString('pt-BR')}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log('Análise de sentimento enviada');
    } catch (error) {
      console.error('Erro ao enviar análise de sentimento:', error.message);
    }
  }

  /**
   * Envia alerta de volatilidade
   */
  async sendVolatilityAlert(symbol, change, timeframe) {
    try {
      if (!this.isEnabled) {
        console.log(`🔥 [DEV] Alerta de volatilidade simulado: ${symbol} ${change.toFixed(2)}%`);
        return;
      }
      
      const emoji = change > 0 ? '🚀' : '📉';
      const direction = change > 0 ? 'ALTA' : 'BAIXA';
      
      let message = `${emoji} *ALERTA DE VOLATILIDADE*\n\n`;
      message += `📊 *Par:* ${symbol}\n`;
      message += `📈 *Variação:* ${change > 0 ? '+' : ''}${change.toFixed(2)}%\n`;
      message += `⏱️ *Timeframe:* ${timeframe}\n`;
      message += `🔥 *Movimento:* ${direction} ACENTUADA\n\n`;
      message += `⚠️ *Atenção para possíveis oportunidades de entrada!*\n\n`;
      message += `⏰ ${new Date().toLocaleString('pt-BR')}`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`Alerta de volatilidade enviado para ${symbol}`);
    } catch (error) {
      console.error('Erro ao enviar alerta de volatilidade:', error.message);
    }
  }

  /**
   * Envia notificação de alvo atingido
   */
  async sendTargetHit(symbol, targetLevel, targetNumber, currentPrice, signalTime) {
    try {
      if (!this.isEnabled) {
        console.log(`🎯 [DEV] Alvo simulado atingido: ${symbol} TP${targetNumber}`);
        return;
      }
      
      const symbolName = symbol.split('/')[0];
      const targetEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '🌕'][targetNumber - 1] || '🎯';
      
      // Calcula lucro correto: da entrada até o alvo atual, multiplicado por 15x
      const monitor = this.activeMonitors.get(symbol);
      const entryPrice = monitor ? monitor.entry : targetLevel; // Fallback se monitor não existir
      const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      const profitPercent = priceChangePercent * 15; // Alavancagem 15x
      
      // Calcula tempo decorrido
      const timeElapsed = this.calculateTimeElapsed(signalTime);
      
      // Função para formatar preços
      const formatPrice = (price) => {
        if (['BTC', 'ETH', 'SOL', 'LTC'].includes(symbolName)) {
          return price.toFixed(2);
        }
        if (price >= 1) return price.toFixed(4);
        if (price >= 0.01) return price.toFixed(6);
        return price.toFixed(8);
      };
      
      let message = `✅ *ALVO ${targetNumber} ATINGIDO #${symbolName}*\n\n`;
      message += `${targetEmoji} Alvo ${targetNumber} atingido no par #${symbolName}\n`;
      message += `💰 Lucro: +${profitPercent.toFixed(2)}% (Alv. 15×)\n`;
      
      // Recomendações específicas por alvo
      if (targetNumber === 1) {
        message += `⚡️ Posição parcial realizada\n`;
        message += `⚠️ Recomendação: Realize 50% da posição neste alvo\n`;
      } else if (targetNumber === 2) {
        message += `⚡️ Sugestão: Realizar lucro parcial de 25%\n`;
        message += `📌 Mover stop loss para o ponto de entrada\n`;
        message += `⚠️ Recomendação: Proteja o capital movendo o stop\n`;
      } else if (targetNumber === 3) {
        message += `⚡️ Sugestão: Realizar lucro parcial de 15%\n`;
        message += `📌 Mover stop loss para o Alvo 1\n`;
        message += `⚠️ Recomendação: Garanta lucros movendo stop\n`;
      } else if (targetNumber === 4) {
        message += `⚡️ Sugestão: Realizar lucro parcial de 10%\n`;
        message += `📌 Mover stop loss para o Alvo 2\n`;
      } else if (targetNumber === 5) {
        message += `⚡️ Sugestão: Realizar lucro parcial de 10%\n`;
        message += `📌 Mover stop loss para o Alvo 3\n`;
      } else if (targetNumber === 6) {
        message += `🎉 Encerrar operação com lucro máximo!\n`;
        message += `🏆 Parabéns! Todos os alvos atingidos\n`;
      }
      
      message += `📊 Entrada: $${formatPrice(entryPrice)}\n`;
      message += `💵 Preço atual: $${formatPrice(currentPrice)}\n`;
      message += `⏱️ Tempo até o alvo: ${timeElapsed}\n\n`;
      message += `👑 Sinais Lobo Cripto`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`Notificação de alvo enviada: ${symbol} TP${targetNumber}`);
    } catch (error) {
      console.error('Erro ao enviar notificação de alvo:', error.message);
    }
  }

  /**
   * Envia notificação de stop loss
   */
  async sendStopLossHit(symbol, stopLossLevel, currentPrice, signalTime) {
    try {
      if (!this.isEnabled) {
        console.log(`🛑 [DEV] Stop loss simulado: ${symbol}`);
        return;
      }
      
      const symbolName = symbol.split('/')[0];
      
      // Calcula perda correta: da entrada até o preço atual, multiplicado por 15x
      const monitor = this.activeMonitors.get(symbol);
      const entryPrice = monitor ? monitor.entry : stopLossLevel; // Fallback se monitor não existir
      const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      const lossPercent = Math.abs(priceChangePercent) * 15; // Alavancagem 15x
      
      // Calcula tempo decorrido
      const timeElapsed = this.calculateTimeElapsed(signalTime);
      
      // Função para formatar preços
      const formatPrice = (price) => {
        if (['BTC', 'ETH', 'SOL', 'LTC'].includes(symbolName)) {
          return price.toFixed(2);
        }
        if (price >= 1) return price.toFixed(4);
        if (price >= 0.01) return price.toFixed(6);
        return price.toFixed(8);
      };
      
      let message = `🛑 *STOP LOSS ATINGIDO #${symbolName}*\n\n`;
      message += `🔴 Stop loss atingido no par #${symbolName}\n`;
      message += `📉 Perda: -${lossPercent.toFixed(2)}% (Alv. 15×)\n`;
      message += `📊 Preço de entrada: $${formatPrice(entryPrice)}\n`;
      message += `💵 Preço do stop: $${formatPrice(currentPrice)}\n`;
      message += `⏱️ Duração do trade: ${timeElapsed}\n\n`;
      message += `⚠️ *Gestão de risco ativada - Capital protegido*\n\n`;
      message += `👑 Sinais Lobo Cripto`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`Notificação de stop loss enviada: ${symbol}`);
    } catch (error) {
      console.error('Erro ao enviar notificação de stop loss:', error.message);
    }
  }

  /**
   * Envia notificação de stop de lucro
   */
  async sendProfitStopHit(symbol, stopLevel, currentPrice, stopType, signalTime) {
    try {
      if (!this.isEnabled) {
        console.log(`✅ [DEV] Stop de lucro simulado: ${symbol}`);
        return;
      }
      
      const symbolName = symbol.split('/')[0];
      
      // Calcula lucro correto: da entrada até o preço atual, multiplicado por 15x
      const monitor = this.activeMonitors.get(symbol);
      const entryPrice = monitor ? monitor.entry : stopLevel; // Fallback se monitor não existir
      const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      const profitPercent = priceChangePercent * 15; // Alavancagem 15x
      
      // Calcula tempo decorrido
      const timeElapsed = this.calculateTimeElapsed(signalTime);
      
      // Função para formatar preços
      const formatPrice = (price) => {
        if (['BTC', 'ETH', 'SOL', 'LTC'].includes(symbolName)) {
          return price.toFixed(2);
        }
        if (price >= 1) return price.toFixed(4);
        if (price >= 0.01) return price.toFixed(6);
        return price.toFixed(8);
      };
      
      // Determina o tipo de stop
      let stopDescription = '';
      if (stopType === 'BREAKEVEN') {
        stopDescription = 'Stop Loss em Breakeven';
      } else if (stopType.startsWith('TARGET_')) {
        const targetNum = stopType.replace('TARGET_', '');
        stopDescription = `Stop Loss no Alvo ${targetNum}`;
      }
      
      let message = `✅ *STOP DE LUCRO ATINGIDO #${symbolName}*\n\n`;
      message += `🟢 Stop de lucro atingido no par #${symbolName}\n`;
      message += `💰 Lucro: +${profitPercent.toFixed(2)}% (Alv. 15×)\n`;
      message += `📊 Preço de entrada: $${formatPrice(entryPrice)}\n`;
      message += `💵 Preço do stop: $${formatPrice(currentPrice)}\n`;
      message += `📌 ${stopDescription}\n`;
      message += `⏱️ Duração do trade: ${timeElapsed}\n\n`;
      message += `🎯 *Gestão de lucro ativada - Lucros protegidos*\n\n`;
      message += `👑 Sinais Lobo Cripto`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`Notificação de stop de lucro enviada: ${symbol}`);
    } catch (error) {
      console.error('Erro ao enviar notificação de stop de lucro:', error.message);
    }
  }

  /**
   * Envia notificação de operação completa (todos os alvos)
   */
  async sendOperationComplete(symbol, signalTime) {
    try {
      if (!this.isEnabled) {
        console.log(`🏆 [DEV] Operação completa simulada: ${symbol}`);
        return;
      }
      
      const symbolName = symbol.split('/')[0];
      const timeElapsed = this.calculateTimeElapsed(signalTime);
      
      let message = `🏆 *OPERAÇÃO COMPLETA #${symbolName}*\n\n`;
      message += `🎉 Todos os 6 alvos atingidos no par #${symbolName}\n`;
      message += `💰 Lucro máximo alcançado!\n`;
      message += `🎯 Performance: 6/6 alvos (100%)\n`;
      message += `⏱️ Duração total: ${timeElapsed}\n\n`;
      message += `🏅 Parabéns pela disciplina e gestão de risco!\n\n`;
      message += `👑 Sinais Lobo Cripto`;

      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });

      console.log(`Notificação de operação completa enviada: ${symbol}`);
    } catch (error) {
      console.error('Erro ao enviar notificação de operação completa:', error.message);
    }
  }

  /**
   * Calcula tempo decorrido desde o sinal
   */
  calculateTimeElapsed(signalTime) {
    const now = new Date();
    const diffMs = now - signalTime;
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) {
      const remainingHours = diffHours % 24;
      return `${diffDays} dia${diffDays > 1 ? 's' : ''}${remainingHours > 0 ? ` e ${remainingHours}h` : ''}`;
    } else if (diffHours > 0) {
      const remainingMinutes = diffMinutes % 60;
      return `${diffHours}h${remainingMinutes > 0 ? ` e ${remainingMinutes}min` : ''}`;
    } else {
      return `${diffMinutes} minuto${diffMinutes !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Inicia monitoramento de preço
   */
  startPriceMonitoring(symbol, entry, targets, stopLoss, binanceService, signal, app = null, adaptiveScoring = null) {
    if (this.activeMonitors.has(symbol)) {
      console.log(`⚠️ Monitoramento já ativo para ${symbol} - parando o anterior`);
      this.stopPriceMonitoring(symbol);
    }

    // Verifica se o símbolo não está na blacklist do sistema adaptativo
    if (adaptiveScoring && adaptiveScoring.isSymbolBlacklisted && adaptiveScoring.isSymbolBlacklisted(symbol)) {
      console.log(`🚫 ${symbol} está na blacklist - não iniciando monitoramento`);
      return;
    }

    console.log(`🔄 Iniciando monitoramento TEMPO REAL para ${symbol}`);
    console.log(`📊 Alvos: ${targets.map(t => t.toFixed(2)).join(', ')}`);
    console.log(`🛑 Stop: ${stopLoss.toFixed(2)}`);
    
    const monitor = {
      symbol,
      entry,
      targets: [...targets],
      stopLoss,
      targetIndex: 0,
      signalTime: new Date(),
      currentStopLevel: stopLoss,
      stopType: 'INITIAL',
      trend: signal ? signal.trend : 'BULLISH', // Adiciona tendência para verificações corretas
      adaptiveScoring: adaptiveScoring,
      indicators: signal ? signal.indicators : null
    };

    this.activeMonitors.set(symbol, monitor);

    // 🚀 INICIA WEBSOCKET TEMPO REAL com throttling
    let lastUpdateTime = 0;
    const updateInterval = 1000; // Máximo 1 update por segundo
    
    try {
      binanceService.connectWebSocket(symbol, '1m', (candleData) => {
        const now = Date.now();
        
        // Throttling: só processa se passou tempo suficiente
        if (now - lastUpdateTime < updateInterval) {
          return;
        }
        lastUpdateTime = now;
        
        // Verifica se monitor ainda existe
        if (!this.activeMonitors.has(symbol)) {
          console.log(`⚠️ Monitor removido para ${symbol} - parando WebSocket callback`);
          return;
        }
        
        // Converte dados do candle para formato de ticker
        const ticker = {
          last: candleData.close,
          symbol: candleData.symbol,
          timestamp: candleData.timestamp
        };
        
        // ⚡ VERIFICA ALVOS E STOP (com proteção contra loop)
        this.handlePriceUpdate(symbol, ticker.last, this.activeMonitors.get(symbol), app);
      });
      
      console.log(`🔄 Monitoramento WebSocket iniciado para ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao iniciar WebSocket para ${symbol}:`, error.message);
      this.activeMonitors.delete(symbol);
    }
  }

  /**
   * Manipula atualizações de preço
   */
  async handlePriceUpdate(symbol, currentPrice, monitor, app = null) {
    try {
      // Verifica se o monitor ainda existe (pode ter sido removido)
      if (!this.activeMonitors.has(symbol)) {
        console.log(`⚠️ Monitor para ${symbol} não existe mais - parando verificação`);
        return;
      }

      const isLong = monitor.trend === 'BULLISH';
      
      // 🔍 VERIFICA STOP LOSS PRIMEIRO
      const stopHit = isLong 
        ? currentPrice <= monitor.currentStopLevel  // COMPRA: stop abaixo
        : currentPrice >= monitor.currentStopLevel; // VENDA: stop acima
        
      if (stopHit) {
        if (monitor.stopType === 'INITIAL') {
          console.log(`🛑 STOP LOSS atingido para ${symbol}: ${currentPrice}`);
          await this.sendStopLossHit(symbol, monitor.currentStopLevel, currentPrice, monitor.signalTime);
          
          // Registra resultado no performance tracker
          if (app && app.performanceTracker) {
            const finalPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
            app.performanceTracker.updateSignalResult(symbol, 0, finalPnL, 'STOP_LOSS');
          }
          
          // Registra resultado negativo no sistema adaptativo
          if (monitor.adaptiveScoring && monitor.indicators) {
            const finalPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
            monitor.adaptiveScoring.recordTradeResult(symbol, monitor.indicators, false, finalPnL);
          }
        } else {
          console.log(`✅ STOP DE LUCRO atingido para ${symbol}: ${currentPrice}`);
          await this.sendProfitStopHit(symbol, monitor.currentStopLevel, currentPrice, monitor.stopType, monitor.signalTime);
          
          // Registra resultado no performance tracker
          if (app && app.performanceTracker) {
            const finalPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
            const targetsHit = monitor.targetIndex;
            app.performanceTracker.updateSignalResult(symbol, targetsHit, finalPnL, monitor.stopType);
          }
          
          // Registra resultado positivo no sistema adaptativo
          if (monitor.adaptiveScoring && monitor.indicators) {
            const finalPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
            monitor.adaptiveScoring.recordTradeResult(symbol, monitor.indicators, true, finalPnL);
          }
        }
        this.activeMonitors.delete(symbol);
        
        // Para o WebSocket para este símbolo
        this.stopWebSocketForSymbol(symbol);
        
        console.log(`🏁 Operação finalizada para ${symbol} - ${monitor.stopType === 'INITIAL' ? 'STOP LOSS' : 'STOP DE LUCRO'}`);
        return;
      }

      // 🎯 VERIFICA ALVOS EM SEQUÊNCIA
      if (monitor.targetIndex < monitor.targets.length) {
        const currentTarget = monitor.targets[monitor.targetIndex];
        
        const targetHit = isLong 
          ? currentPrice >= currentTarget  // COMPRA: alvos acima
          : currentPrice <= currentTarget; // VENDA: alvos abaixo
          
        if (targetHit) {
          console.log(`🎯 ALVO ${monitor.targetIndex + 1} atingido para ${symbol}: ${currentPrice}`);
          await this.sendTargetHit(symbol, currentTarget, monitor.targetIndex + 1, currentPrice, monitor.signalTime);
          monitor.targetIndex++;
          
          // 📌 GERENCIAMENTO AUTOMÁTICO DE STOP
          if (monitor.targetIndex === 2) {
            // Para COMPRA: stop no breakeven, para VENDA: stop no breakeven
            monitor.currentStopLevel = monitor.entry;
            monitor.stopType = 'BREAKEVEN';
            console.log(`📌 Stop movido para BREAKEVEN: ${monitor.entry}`);
          } else if (monitor.targetIndex > 2) {
            // Move stop para alvo anterior
            monitor.currentStopLevel = monitor.targets[monitor.targetIndex - 2];
            monitor.stopType = `TARGET_${monitor.targetIndex - 1}`;
            console.log(`📌 Stop movido para TP${monitor.targetIndex - 1}: ${monitor.currentStopLevel}`);
          }
          
          // Se todos os alvos foram atingidos, para o monitoramento
          if (monitor.targetIndex >= monitor.targets.length) {
            console.log(`🏆 TODOS OS ALVOS atingidos para ${symbol}!`);
            await this.sendOperationComplete(symbol, monitor.signalTime);
            
            // Registra resultado completo no performance tracker
            if (app && app.performanceTracker) {
              const finalPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
              app.performanceTracker.updateSignalResult(symbol, 6, finalPnL, 'ALL_TARGETS');
            }
            
            // Registra resultado muito positivo no sistema adaptativo
            if (monitor.adaptiveScoring && monitor.indicators) {
              const finalPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
              monitor.adaptiveScoring.recordTradeResult(symbol, monitor.indicators, true, finalPnL);
            }
            
            this.activeMonitors.delete(symbol);
            
            // Para o WebSocket para este símbolo
            this.stopWebSocketForSymbol(symbol);
            
            console.log(`🏁 Operação COMPLETA para ${symbol} - TODOS OS ALVOS`);
          }
        }
      }
    } catch (error) {
      console.error(`Erro no monitoramento de ${symbol}:`, error.message);
    }
  }

  /**
   * Para WebSocket para um símbolo específico
   */
  stopWebSocketForSymbol(symbol) {
    // Implementação será feita no BinanceService se necessário
    console.log(`🔌 WebSocket parado para ${symbol}`);
  }

  /**
   * Para monitoramento de um símbolo
   */
  stopPriceMonitoring(symbol) {
    if (this.activeMonitors.has(symbol)) {
      this.activeMonitors.delete(symbol);
      this.stopWebSocketForSymbol(symbol);
      console.log(`Monitoramento parado para ${symbol}`);
      return true;
    }
    return false;
  }

  /**
   * Verifica se um símbolo tem operação ativa
   */
  hasActiveMonitor(symbol) {
    const hasActive = this.activeMonitors.has(symbol);
    if (hasActive) {
      const monitor = this.activeMonitors.get(symbol);
      console.log(`🔍 Operação ativa encontrada para ${symbol}:`);
      console.log(`   • Entrada: $${monitor.entry.toFixed(4)}`);
      console.log(`   • Alvos atingidos: ${monitor.targetIndex}/6`);
      console.log(`   • Stop atual: $${monitor.currentStopLevel.toFixed(4)}`);
      console.log(`   • Tempo ativo: ${this.calculateTimeElapsed(monitor.signalTime)}`);
    }
    return hasActive;
  }

  /**
   * Obtém lista de símbolos com operações ativas
   */
  getActiveSymbols() {
    return Array.from(this.activeMonitors.keys());
  }

  /**
   * Obtém emoji da tendência
   */
  getTrendEmoji(trend) {
    switch (trend) {
      case 'BULLISH': return '🟢';
      case 'BEARISH': return '🔴';
      case 'SIDEWAYS': return '🟡';
      default: return '⚪';
    }
  }

  /**
   * Formata volume
   */
  formatVolume(volume) {
    // Garante que volume é um número válido
    if (!volume || isNaN(volume) || volume === null || volume === undefined) {
      return '0';
    }
    
    // Converte para número se for string
    volume = Number(volume);
    
    if (volume >= 1e9) {
      return (volume / 1e9).toFixed(2) + 'B';
    } else if (volume >= 1e6) {
      return (volume / 1e6).toFixed(2) + 'M';
    } else if (volume >= 1e3) {
      return (volume / 1e3).toFixed(2) + 'K';
    }
    return volume.toFixed(2);
  }

  /**
   * Escapa caracteres especiais do Markdown
   */
  escapeMarkdown(text) {
    if (typeof text !== 'string') {
      text = String(text);
    }
    
    // Escapa caracteres especiais do Telegram Markdown
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  /**
   * Explica padrões de triângulo para iniciantes
   */
  explainTrianglePattern(triangle) {
    switch (triangle.type) {
      case 'ASCENDING_TRIANGLE':
        return '📈 Triângulo Ascendente: Preço faz topos iguais e fundos crescentes\n     (Pressão compradora aumentando - sinal de alta)';
      case 'DESCENDING_TRIANGLE':
        return '📉 Triângulo Descendente: Preço faz fundos iguais e topos decrescentes\n     (Pressão vendedora aumentando - sinal de baixa)';
      default:
        return `📊 ${triangle.type}: Padrão de consolidação detectado`;
    }
  }

  /**
   * Explica padrões de bandeira para iniciantes
   */
  explainFlagPattern(flag) {
    if (flag.type === 'BULLISH_FLAG') {
      return '🚩 Bandeira de Alta: Após subida forte, preço consolida lateralmente\n     (Pausa para respirar antes de continuar subindo)';
    } else {
      return '🚩 Bandeira de Baixa: Após queda forte, preço consolida lateralmente\n     (Pausa para respirar antes de continuar caindo)';
    }
  }

  /**
   * Explica padrões de cunha para iniciantes
   */
  explainWedgePattern(wedge) {
    if (wedge.type === 'RISING_WEDGE') {
      return '📐 Cunha Ascendente: Preço sobe mas com força decrescente\n     (Sinal de possível reversão para baixa)';
    } else {
      return '📐 Cunha Descendente: Preço desce mas com força decrescente\n     (Sinal de possível reversão para alta)';
    }
  }

  /**
   * Explica padrões duplos para iniciantes
   */
  explainDoublePattern(double) {
    if (double.type === 'DOUBLE_TOP') {
      return '⛰️ Topo Duplo: Preço testou resistência 2x e não conseguiu passar\n     (Sinal forte de reversão para baixa)';
    } else {
      return '🏔️ Fundo Duplo: Preço testou suporte 2x e não conseguiu quebrar\n     (Sinal forte de reversão para alta)';
    }
  }

  /**
   * Explica padrões de candlestick para iniciantes
   */
  explainCandlestickPattern(pattern) {
    const emoji = pattern.bias === 'BULLISH' ? '🟢' : pattern.bias === 'BEARISH' ? '🔴' : '🟡';
    
    switch (pattern.type) {
      case 'DOJI':
        return `🎯 Doji: Abertura = Fechamento (Indecisão do mercado) ${emoji}`;
      case 'BULLISH_ENGULFING':
        return `🟢 Engolfo de Alta: Candle verde "engole" o vermelho anterior\n     (Compradores assumiram controle)`;
      case 'BEARISH_ENGULFING':
        return `🔴 Engolfo de Baixa: Candle vermelho "engole" o verde anterior\n     (Vendedores assumiram controle)`;
      case 'HAMMER':
        return `🔨 Martelo: Candle com sombra longa embaixo\n     (Compradores rejeitaram preços baixos - sinal de alta)`;
      case 'HANGING_MAN':
        return `🪓 Enforcado: Candle com sombra longa em cima\n     (Vendedores rejeitaram preços altos - sinal de baixa)`;
      default:
        return `${pattern.type} ${emoji}`;
    }
  }
}

export default TelegramBotService;