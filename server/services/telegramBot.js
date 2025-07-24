/**
 * Serviço do Bot do Telegram
 */

import TelegramBot from 'node-telegram-bot-api';
import { TRADING_CONFIG } from '../config/constants.js';

class TelegramBotService {
  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.isEnabled = !!(this.token && this.chatId);
    this.bot = null;
    this.activeMonitors = new Map();
    this.wsConnections = new Map();
    
    if (this.isEnabled) {
      try {
        this.bot = new TelegramBot(this.token, { polling: false });
        console.log('✅ TelegramBot: Bot inicializado com sucesso');
      } catch (error) {
        console.error('❌ TelegramBot: Erro na inicialização:', error.message);
        this.isEnabled = false;
      }
    } else {
      console.log('⚠️ TelegramBot: Variáveis não configuradas - modo simulado ativo');
      console.log('💡 Configure TELEGRAM_TOKEN e TELEGRAM_CHAT_ID no .env para ativar');
    }
  }

  /**
   * Cria monitor para um símbolo
   */
  createMonitor(symbol, entry, targets, stopLoss, signalId) {
    try {
      console.log(`📊 Criando monitor para ${symbol}...`);
      
      const monitor = {
        symbol: symbol,
        entry: entry,
        targets: targets,
        stopLoss: stopLoss,
        signalId: signalId,
        timestamp: new Date(),
        status: 'ACTIVE',
        targetsHit: 0,
        maxTargetsHit: 0,
        peakProfit: 0,
        currentDrawdown: 0,
        lastPrice: entry,
        stopType: 'INITIAL'
      };
      
      this.activeMonitors.set(symbol, monitor);
      console.log(`✅ Monitor criado para ${symbol}. Total: ${this.activeMonitors.size}`);
      
      return monitor;
    } catch (error) {
      console.error(`❌ Erro ao criar monitor para ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Verifica se tem monitor ativo para um símbolo
   */
  hasActiveMonitor(symbol) {
    return this.activeMonitors.has(symbol);
  }

  /**
   * Remove monitor
   */
  removeMonitor(symbol, reason = 'COMPLETED') {
    if (this.activeMonitors.has(symbol)) {
      const monitor = this.activeMonitors.get(symbol);
      this.activeMonitors.delete(symbol);
      
      // Para WebSocket se existir
      if (this.wsConnections.has(symbol)) {
        try {
          const ws = this.wsConnections.get(symbol);
          ws.close();
          this.wsConnections.delete(symbol);
          console.log(`🔌 WebSocket fechado para ${symbol}`);
        } catch (error) {
          console.error(`Erro ao fechar WebSocket ${symbol}:`, error.message);
        }
      }
      
      console.log(`🗑️ Monitor removido: ${symbol} (${reason}). Total: ${this.activeMonitors.size}`);
      return monitor;
    }
    return null;
  }

  /**
   * Obtém símbolos ativos
   */
  getActiveSymbols() {
    return Array.from(this.activeMonitors.keys());
  }

  /**
   * Envia sinal de trading
   */
  async sendTradingSignal(signal, chart = null) {
    try {
      if (!this.isEnabled) {
        console.log(`📤 [SIMULADO] Sinal para ${signal.symbol}: ${signal.probability.toFixed(1)}%`);
        console.log(`📊 [SIMULADO] Monitor mantido para ${signal.symbol} (modo desenvolvimento)`);
        return true; // Sucesso simulado
      }

      // Formata mensagem
      const message = this.formatTradingSignal(signal);
      
      // Envia mensagem
      if (chart) {
        await this.bot.sendPhoto(this.chatId, Buffer.from(''), {
          caption: message,
          parse_mode: 'Markdown'
        });
      } else {
        await this.bot.sendMessage(this.chatId, message, {
          parse_mode: 'Markdown'
        });
      }
      
      console.log(`✅ Sinal enviado para ${signal.symbol}`);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao enviar sinal para ${signal.symbol}:`, error.message);
      throw error; // Propaga erro para tratamento correto
    }
  }

  /**
   * Formata sinal de trading
   */
  formatTradingSignal(signal) {
    const riskReward = signal.riskRewardRatio ? signal.riskRewardRatio.toFixed(2) : 'N/A';
    const mlInfo = signal.isMLDriven ? ` 🤖 (ML: ${signal.mlContribution?.toFixed(1)}%)` : '';
    
    let message = `🎯 *SINAL DE TRADING*${mlInfo}\n\n`;
    message += `📊 *Par:* ${signal.symbol}\n`;
    message += `📈 *Probabilidade:* ${signal.probability.toFixed(1)}%\n`;
    message += `⏰ *Timeframe:* ${signal.timeframe}\n`;
    message += `🎯 *Tendência:* ${signal.trend}\n\n`;
    
    message += `💰 *Entrada:* $${signal.entry.toFixed(4)}\n\n`;
    
    message += `🎯 *Alvos:*\n`;
    signal.targets.forEach((target, index) => {
      const percentage = (((target - signal.entry) / signal.entry) * 100).toFixed(1);
      message += `   TP${index + 1}: $${target.toFixed(4)} (+${percentage}%)\n`;
    });
    
    message += `\n🛑 *Stop Loss:* $${signal.stopLoss.toFixed(4)} (${TRADING_CONFIG.STOP_LOSS_PERCENTAGE}%)\n`;
    message += `⚖️ *Risk/Reward:* 1:${riskReward}\n\n`;
    
    // Indicadores principais
    if (signal.indicators) {
      message += `📊 *Indicadores:*\n`;
      if (signal.indicators.rsi) {
        message += `   • RSI: ${signal.indicators.rsi.toFixed(1)}\n`;
      }
      if (signal.indicators.macd && signal.indicators.macd.MACD) {
        message += `   • MACD: ${signal.indicators.macd.MACD.toFixed(2)}\n`;
      }
      if (signal.indicators.ma21 && signal.indicators.ma200) {
        const maTrend = signal.indicators.ma21 > signal.indicators.ma200 ? '📈' : '📉';
        message += `   • MA21/200: ${maTrend}\n`;
      }
      message += '\n';
    }
    
    // Detalhes do score se disponível
    if (signal.details) {
      message += `🔍 *Análise:*\n`;
      if (signal.details.indicators?.rsi) {
        message += `   • ${signal.details.indicators.rsi.reason}\n`;
      }
      if (signal.details.indicators?.macd) {
        message += `   • ${signal.details.indicators.macd.reason}\n`;
      }
      if (signal.details.patterns?.breakout) {
        message += `   • ${signal.details.patterns.breakout.reason}\n`;
      }
      if (signal.details.bitcoinCorrelation) {
        message += `   • ${signal.details.bitcoinCorrelation.recommendation}\n`;
      }
      message += '\n';
    }
    
    message += `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
    message += `👑 Sinais Lobo Cripto`;
    
    return message;
  }

  /**
   * Inicia monitoramento de preço em tempo real
   */
  async startPriceMonitoring(symbol, entry, targets, stopLoss, binanceService, signal, app, adaptiveScoring = null) {
    try {
      console.log(`🔄 Iniciando monitoramento para ${symbol}...`);
      
      // Verifica se monitor existe
      if (!this.hasActiveMonitor(symbol)) {
        console.log(`❌ Monitor não encontrado para ${symbol} - criando...`);
        this.createMonitor(symbol, entry, targets, stopLoss, signal.signalId || 'unknown');
      }
      
      console.log(`📊 Monitor confirmado para ${symbol}. Iniciando WebSocket...`);
      
      // Conecta WebSocket
      const ws = await binanceService.connectWebSocket(symbol, '1m', (candleData) => {
        this.handlePriceUpdate(symbol, candleData, app, adaptiveScoring);
      });
      
      if (ws) {
        this.wsConnections.set(symbol, ws);
        console.log(`✅ WebSocket conectado para ${symbol}`);
      }
      
    } catch (error) {
      console.error(`❌ Erro ao iniciar monitoramento para ${symbol}:`, error.message);
      // Não remove monitor - pode funcionar sem WebSocket perfeito
    }
  }

  /**
   * Manipula atualizações de preço
   */
  handlePriceUpdate(symbol, candleData, app, adaptiveScoring = null) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) {
        console.log(`⚠️ Monitor não encontrado para ${symbol} - parando WebSocket`);
        this.stopWebSocketForSymbol(symbol);
        return;
      }

      const currentPrice = candleData.close;
      monitor.lastPrice = currentPrice;

      // Calcula P&L atual
      const currentPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
      
      // Atualiza peak profit
      if (currentPnL > monitor.peakProfit) {
        monitor.peakProfit = currentPnL;
      }
      
      // Calcula drawdown atual
      monitor.currentDrawdown = monitor.peakProfit - currentPnL;

      // Verifica alvos
      let newTargetsHit = 0;
      for (let i = 0; i < monitor.targets.length; i++) {
        if (currentPrice >= monitor.targets[i]) {
          newTargetsHit = i + 1;
        } else {
          break;
        }
      }

      // Se atingiu novo alvo
      if (newTargetsHit > monitor.targetsHit) {
        monitor.targetsHit = newTargetsHit;
        monitor.maxTargetsHit = Math.max(monitor.maxTargetsHit, newTargetsHit);
        
        this.sendTargetHitNotification(symbol, newTargetsHit, monitor.targets[newTargetsHit - 1], currentPnL);
        
        // Se atingiu todos os alvos
        if (newTargetsHit >= monitor.targets.length) {
          this.completeMonitor(symbol, 'ALL_TARGETS', currentPnL, app, adaptiveScoring);
          return;
        }
      }

      // Verifica stop loss
      if (currentPrice <= monitor.stopLoss) {
        this.completeMonitor(symbol, 'STOP_LOSS', currentPnL, app, adaptiveScoring);
        return;
      }

      // Log periódico (a cada 1% de mudança)
      const priceChange = Math.abs(currentPnL);
      if (priceChange > 0 && priceChange % 1 < 0.1) {
        console.log(`📊 ${symbol}: $${currentPrice.toFixed(4)} (${currentPnL > 0 ? '+' : ''}${currentPnL.toFixed(2)}%) - ${monitor.targetsHit}/${monitor.targets.length} alvos`);
      }

    } catch (error) {
      console.error(`Erro ao processar atualização de preço para ${symbol}:`, error.message);
    }
  }

  /**
   * Completa monitoramento
   */
  completeMonitor(symbol, reason, finalPnL, app, adaptiveScoring = null) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) return;

      const isWin = finalPnL > 0;
      const leveragedPnL = finalPnL * 15; // Aplica alavancagem 15x
      
      // Registra resultado
      if (app && app.performanceTracker) {
        app.performanceTracker.updateSignalResult(symbol, monitor.targetsHit, leveragedPnL, reason);
      }
      
      if (app && app.riskManagement) {
        app.riskManagement.recordTrade(symbol, leveragedPnL, isWin);
      }
      
      // Registra no sistema adaptativo
      if (adaptiveScoring) {
        adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, isWin, leveragedPnL);
      }

      // Envia notificação de conclusão
      this.sendCompletionNotification(symbol, reason, finalPnL, leveragedPnL, monitor);
      
      // Remove monitor
      this.removeMonitor(symbol, reason);
      
      console.log(`✅ Operação concluída: ${symbol} - ${reason} (${leveragedPnL > 0 ? '+' : ''}${leveragedPnL.toFixed(2)}% com 15x)`);
      
    } catch (error) {
      console.error(`Erro ao completar monitor ${symbol}:`, error.message);
    }
  }

  /**
   * Envia notificação de alvo atingido
   */
  async sendTargetHitNotification(symbol, targetNumber, targetPrice, currentPnL) {
    try {
      const leveragedPnL = currentPnL * 15;
      const message = `🎯 *ALVO ATINGIDO*\n\n` +
                     `📊 *Par:* ${symbol}\n` +
                     `🎯 *Alvo ${targetNumber}:* $${targetPrice.toFixed(4)}\n` +
                     `💰 *Lucro:* +${currentPnL.toFixed(2)}% (+${leveragedPnL.toFixed(2)}% com 15x)\n\n` +
                     `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
                     `👑 Sinais Lobo Cripto`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      } else {
        console.log(`🎯 [SIMULADO] Alvo ${targetNumber} atingido para ${symbol}: +${leveragedPnL.toFixed(2)}%`);
      }
    } catch (error) {
      console.error(`Erro ao enviar notificação de alvo para ${symbol}:`, error.message);
    }
  }

  /**
   * Envia notificação de conclusão
   */
  async sendCompletionNotification(symbol, reason, finalPnL, leveragedPnL, monitor) {
    try {
      let emoji = '✅';
      let reasonText = '';
      
      switch (reason) {
        case 'ALL_TARGETS':
          emoji = '🎉';
          reasonText = 'Todos os alvos atingidos';
          break;
        case 'STOP_LOSS':
          emoji = '🛑';
          reasonText = 'Stop loss ativado';
          break;
        case 'MANUAL':
          emoji = '👤';
          reasonText = 'Fechamento manual';
          break;
        default:
          reasonText = reason;
      }

      const duration = new Date() - monitor.timestamp;
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      
      const message = `${emoji} *OPERAÇÃO FINALIZADA*\n\n` +
                     `📊 *Par:* ${symbol}\n` +
                     `📝 *Motivo:* ${reasonText}\n` +
                     `🎯 *Alvos atingidos:* ${monitor.targetsHit}/${monitor.targets.length}\n` +
                     `💰 *Resultado:* ${finalPnL > 0 ? '+' : ''}${finalPnL.toFixed(2)}%\n` +
                     `🚀 *Com alavancagem 15x:* ${leveragedPnL > 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n` +
                     `⏱️ *Duração:* ${hours}h ${minutes}m\n` +
                     `📈 *Pico de lucro:* +${monitor.peakProfit.toFixed(2)}%\n\n` +
                     `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
                     `👑 Sinais Lobo Cripto`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      } else {
        console.log(`${emoji} [SIMULADO] Operação finalizada ${symbol}: ${leveragedPnL > 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%`);
      }
    } catch (error) {
      console.error(`Erro ao enviar notificação de conclusão para ${symbol}:`, error.message);
    }
  }

  /**
   * Envia análise do Bitcoin
   */
  async sendBitcoinAnalysis(analysis) {
    try {
      const trendEmoji = analysis.trend === 'BULLISH' ? '📈' : 
                        analysis.trend === 'BEARISH' ? '📉' : '🟡';
      
      let message = `₿ *ANÁLISE DO BITCOIN*\n\n`;
      message += `💰 *Preço Atual:* $${analysis.currentPrice.toFixed(2)}\n`;
      message += `${trendEmoji} *Tendência:* ${analysis.trend} (${analysis.strength}/100)\n`;
      message += `🛡️ *Suporte:* $${analysis.support.toFixed(2)}\n`;
      message += `🚧 *Resistência:* $${analysis.resistance.toFixed(2)}\n`;
      message += `📊 *RSI:* ${analysis.rsi ? analysis.rsi.toFixed(1) : 'N/A'}\n\n`;
      
      // Análise por timeframe
      if (analysis.timeframes && analysis.timeframes.length > 0) {
        message += `⏰ *Por Timeframe:*\n`;
        analysis.timeframes.forEach(tf => {
          const tfEmoji = tf.trend === 'BULLISH' ? '📈' : tf.trend === 'BEARISH' ? '📉' : '🟡';
          message += `   • ${tf.timeframe}: ${tfEmoji} ${tf.trend} (${tf.strength})\n`;
        });
        message += '\n';
      }
      
      // Interpretação inteligente
      if (analysis.smartInterpretation && analysis.smartInterpretation.length > 0) {
        message += `💡 *Interpretação:*\n`;
        analysis.smartInterpretation.forEach(insight => {
          message += `   • ${insight}\n`;
        });
        message += '\n';
      }
      
      message += `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
      message += `👑 Sinais Lobo Cripto`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      } else {
        console.log(`₿ [SIMULADO] Análise Bitcoin: ${analysis.trend} $${analysis.currentPrice.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Erro ao enviar análise do Bitcoin:', error.message);
    }
  }

  /**
   * Envia análise de sentimento do mercado
   */
  async sendMarketSentiment(sentiment) {
    try {
      const sentimentEmoji = sentiment.overall === 'OTIMISTA' ? '🟢' :
                            sentiment.overall === 'PESSIMISTA' ? '🔴' : '🟡';
      
      let message = `🌍 *SENTIMENTO DO MERCADO*\n\n`;
      message += `${sentimentEmoji} *Geral:* ${sentiment.overall}\n`;
      message += `😱 *Fear & Greed:* ${sentiment.fearGreedIndex}/100 (${sentiment.fearGreedLabel})\n`;
      
      if (sentiment.isRealFearGreed) {
        message += `   ✅ Dados reais da alternative.me\n`;
      }
      
      message += `💰 *Volume Total:* $${this.formatVolume(sentiment.totalVolume)}\n`;
      message += `📊 *Volatilidade:* ${sentiment.volatility.toFixed(1)}%\n`;
      message += `📈 *Ativos em alta:* ${sentiment.assetsUp}\n`;
      message += `📉 *Ativos em baixa:* ${sentiment.assetsDown}\n\n`;
      
      // Market cap cripto se disponível
      if (sentiment.cryptoMarketCap) {
        message += `₿ *MERCADO CRIPTO:*\n`;
        message += `   • Market Cap: $${sentiment.cryptoMarketCap.totalMarketCap.toFixed(2)}T\n`;
        message += `   • Dominância BTC: ${sentiment.cryptoMarketCap.btcDominance.toFixed(1)}%\n`;
        message += `   • Variação 24h: ${sentiment.cryptoMarketCap.change24h > 0 ? '+' : ''}${sentiment.cryptoMarketCap.change24h.toFixed(2)}%\n`;
        
        if (sentiment.cryptoMarketCap.isRealData) {
          message += `   ✅ Dados reais da CoinGecko\n`;
        }
        
        if (sentiment.altcoinSeason) {
          if (sentiment.altcoinSeason.isAltcoinSeason) {
            message += `   🚀 Temporada de Altcoins ativa (${sentiment.altcoinSeason.index}/100)\n`;
          } else if (sentiment.altcoinSeason.isBitcoinSeason) {
            message += `   ₿ Temporada do Bitcoin ativa (${sentiment.altcoinSeason.index}/100)\n`;
          }
          
          if (sentiment.altcoinSeason.isRealData) {
            message += `   ✅ Dados reais da blockchaincenter.net\n`;
          }
        }
        message += '\n';
      }
      
      // Análise detalhada
      if (sentiment.analysis && sentiment.analysis.length > 0) {
        message += `🔍 *Análise:*\n`;
        sentiment.analysis.slice(0, 3).forEach(point => {
          message += `   • ${point}\n`;
        });
        message += '\n';
      }
      
      message += `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
      message += `👑 Sinais Lobo Cripto`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      } else {
        console.log(`🌍 [SIMULADO] Sentimento: ${sentiment.overall} (F&G: ${sentiment.fearGreedIndex})`);
      }
    } catch (error) {
      console.error('Erro ao enviar sentimento do mercado:', error.message);
    }
  }

  /**
   * Envia alerta de volatilidade
   */
  async sendVolatilityAlert(symbol, change, timeframe) {
    try {
      const emoji = change > 0 ? '🚀' : '📉';
      const message = `🔥 *ALTA VOLATILIDADE*\n\n` +
                     `📊 *Par:* ${symbol}\n` +
                     `${emoji} *Variação:* ${change > 0 ? '+' : ''}${change.toFixed(2)}%\n` +
                     `⏰ *Timeframe:* ${timeframe}\n\n` +
                     `💡 *Oportunidade de swing trading detectada*\n\n` +
                     `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n` +
                     `👑 Sinais Lobo Cripto`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      } else {
        console.log(`🔥 [SIMULADO] Volatilidade ${symbol}: ${change > 0 ? '+' : ''}${change.toFixed(2)}%`);
      }
    } catch (error) {
      console.error(`Erro ao enviar alerta de volatilidade para ${symbol}:`, error.message);
    }
  }

  /**
   * Para WebSocket para um símbolo
   */
  stopWebSocketForSymbol(symbol) {
    if (this.wsConnections.has(symbol)) {
      try {
        const ws = this.wsConnections.get(symbol);
        ws.close();
        this.wsConnections.delete(symbol);
        console.log(`🔌 WebSocket parado para ${symbol}`);
        return true;
      } catch (error) {
        console.error(`Erro ao parar WebSocket ${symbol}:`, error.message);
        return false;
      }
    }
    return false;
  }

  /**
   * Formata volume
   */
  formatVolume(volume) {
    if (!volume || isNaN(volume)) return '0';
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
    return volume.toFixed(0);
  }

  /**
   * Lista operações ativas (para debugging)
   */
  listActiveOperations() {
    console.log(`📊 Operações ativas (${this.activeMonitors.size}):`);
    
    if (this.activeMonitors.size === 0) {
      console.log('   Nenhuma operação ativa');
      return;
    }
    
    this.activeMonitors.forEach((monitor, symbol) => {
      const targetsHit = monitor.targetsHit || 0;
      const totalTargets = monitor.targets?.length || 0;
      
      console.log(`🔍 Operação ativa encontrada para ${symbol}:`);
      console.log(`   • Entrada: $${monitor.entry.toFixed(4)}`);
      console.log(`   • Alvos atingidos: ${targetsHit}/${totalTargets}`);
      console.log(`   • Status: ${monitor.status || 'ACTIVE'}`);
      console.log(`   • Timestamp: ${monitor.timestamp}`);
    });
  }
}

export default TelegramBotService;