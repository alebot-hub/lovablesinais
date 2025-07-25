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
  createMonitor(symbol, entry, targets, stopLoss, signalId, trend = 'BULLISH') {
    try {
      console.log(`📊 Criando monitor para ${symbol}...`);
      
      const monitor = {
        symbol: symbol,
        entry: entry,
        targets: targets,
        stopLoss: stopLoss,
        isShort: trend === 'BEARISH', // Identifica se é operação SHORT
        currentStopLoss: stopLoss, // Stop loss atual (pode ser móvel)
        signalId: signalId,
        timestamp: new Date(),
        status: 'ACTIVE',
        targetsHit: 0,
        maxTargetsHit: 0,
        peakProfit: 0,
        currentDrawdown: 0,
        lastPrice: entry,
        stopType: 'INITIAL', // INITIAL, PROFIT_PROTECTION
        partialProfitRealized: 0 // Percentual de lucro já realizado
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
      
      // WebSocket já foi parado em completeMonitor
      
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
      // Sempre envia como mensagem de texto (sem imagem)
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown'
      });
      
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
    // Extrai símbolo base (ex: BNB de BNB/USDT)
    const baseSymbol = signal.symbol.split('/')[0];
    const trendEmoji = signal.trend === 'BULLISH' ? '🟢 COMPRA' : '🔴 VENDA';
    const isShort = signal.trend === 'BEARISH';
    
    console.log(`📝 FORMATANDO SINAL:`);
    console.log(`   💰 Símbolo: ${signal.symbol}`);
    console.log(`   📈 Tendência: ${signal.trend} (${isShort ? 'SHORT' : 'LONG'})`);
    console.log(`   💰 Entrada: $${signal.entry.toFixed(8)}`);
    console.log(`   🎯 Alvos: ${signal.targets.map(t => '$' + t.toFixed(8)).join(', ')}`);
    console.log(`   🛑 Stop: $${signal.stopLoss.toFixed(8)}`);
    
    let message = `🚨 *SINAL LOBO #${baseSymbol}* ${trendEmoji} (Futures)\n\n`;
    
    message += `💰 *#${baseSymbol} Futures*\n`;
    message += `📊 *TEMPO GRÁFICO:* ${signal.timeframe}\n`;
    message += `📈 *Alavancagem sugerida:* 15x\n`;
    message += `🎯 *Probabilidade:* ${Math.round(signal.probability)}/100\n`;
    message += `⚡️ *Entrada:* $${signal.entry.toFixed(8)}\n\n`;
    
    message += `🎯 *Alvos:*\n`;
    signal.targets.forEach((target, index) => {
      if (index === 0) {
        message += `1️⃣ *Alvo 1:* $${target.toFixed(8)}\n`;
      } else if (index === 1) {
        message += `2️⃣ *Alvo 2:* $${target.toFixed(8)}\n`;
      } else if (index === 2) {
        message += `3️⃣ *Alvo 3:* $${target.toFixed(8)}\n`;
      } else if (index === 3) {
        message += `4️⃣ *Alvo 4:* $${target.toFixed(8)}\n`;
      } else if (index === 4) {
        message += `5️⃣ *Alvo 5:* $${target.toFixed(8)}\n`;
      } else if (index === 5) {
        message += `🌕 *Alvo 6 - Lua!:* $${target.toFixed(8)}\n`;
      }
    });
    
    message += `\n🛑 *Stop Loss:* $${signal.stopLoss.toFixed(8)}\n\n`;
    
    // Validação final dos alvos antes do envio
    let hasErrors = false;
    
    if (isShort) {
      // Para SHORT: alvos devem ser menores que entrada
      const invalidTargets = signal.targets.filter(target => target >= signal.entry);
      if (invalidTargets.length > 0) {
        console.error(`❌ ERRO CRÍTICO: Alvos SHORT inválidos para ${signal.symbol}:`);
        invalidTargets.forEach((target, i) => {
          console.error(`   🎯 Alvo inválido: $${target.toFixed(8)} >= $${signal.entry.toFixed(8)}`);
        });
        hasErrors = true;
      }
      // Para SHORT: stop deve ser maior que entrada
      if (signal.stopLoss <= signal.entry) {
        console.error(`❌ ERRO CRÍTICO: Stop SHORT inválido para ${signal.symbol}: $${signal.stopLoss.toFixed(8)} <= $${signal.entry.toFixed(8)}`);
        hasErrors = true;
      }
    } else {
      // Para LONG: alvos devem ser maiores que entrada
      const invalidTargets = signal.targets.filter(target => target <= signal.entry);
      if (invalidTargets.length > 0) {
        console.error(`❌ ERRO CRÍTICO: Alvos LONG inválidos para ${signal.symbol}:`);
        invalidTargets.forEach((target, i) => {
          console.error(`   🎯 Alvo inválido: $${target.toFixed(8)} <= $${signal.entry.toFixed(8)}`);
        });
        hasErrors = true;
      }
      // Para LONG: stop deve ser menor que entrada
      if (signal.stopLoss >= signal.entry) {
        console.error(`❌ ERRO CRÍTICO: Stop LONG inválido para ${signal.symbol}: $${signal.stopLoss.toFixed(8)} >= $${signal.entry.toFixed(8)}`);
        hasErrors = true;
      }
    }
    
    if (hasErrors) {
      console.error(`❌ SINAL COM ERROS - NÃO DEVE SER ENVIADO`);
      message += `\n⚠️ *ATENÇÃO: SINAL COM ERROS DETECTADOS*\n`;
    } else {
      console.log(`✅ SINAL VALIDADO: Todos os níveis estão corretos`);
    }
    
    message += `👑 *Sinais Lobo Cripto*\n`;
    message += `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
    
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
        console.log(`⚠️ MONITOR INEXISTENTE: ${symbol} - fechando WebSocket`);
        // Para o WebSocket imediatamente e remove da lista
        if (this.wsConnections.has(symbol)) {
          try {
            const ws = this.wsConnections.get(symbol);
            ws._intentionalClose = true; // Marca como fechamento intencional
            ws.close();
            this.wsConnections.delete(symbol);
            console.log(`🔌 WebSocket fechado intencionalmente: ${symbol}`);
          } catch (error) {
            console.error(`❌ Erro ao fechar WebSocket ${symbol}:`, error.message);
          }
        }
        return;
      }

      const currentPrice = candleData.close;
      
      // Validação crítica do preço recebido
      if (!currentPrice || currentPrice <= 0 || isNaN(currentPrice) || !isFinite(currentPrice)) {
        console.error(`❌ PREÇO INVÁLIDO recebido para ${symbol}: ${currentPrice}`);
        return;
      }
      
      monitor.lastPrice = currentPrice;
      
      // Log detalhado do preço
      const entryPriceChange = monitor.lastPrice ? 
        ((currentPrice - monitor.entry) / monitor.entry) * 100 : 0;
      
      console.log(`📊 UPDATE ${symbol}: $${currentPrice.toFixed(8)} (${entryPriceChange > 0 ? '+' : ''}${entryPriceChange.toFixed(2)}%)`);

      // Calcula P&L atual
      // Calcula P&L baseado no tipo de operação (LONG ou SHORT)
      let currentPnL;
      if (monitor.isShort) {
        // Para SHORT: lucro quando preço desce
        currentPnL = ((monitor.entry - currentPrice) / monitor.entry) * 100;
        console.log(`📉 SHORT P&L: Entrada $${monitor.entry.toFixed(8)} → Atual $${currentPrice.toFixed(8)} = ${currentPnL.toFixed(2)}%`);
      } else {
        // Para LONG: lucro quando preço sobe
        currentPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
        console.log(`📈 LONG P&L: Entrada $${monitor.entry.toFixed(8)} → Atual $${currentPrice.toFixed(8)} = ${currentPnL.toFixed(2)}%`);
      }
      
      // Atualiza peak profit
      if (currentPnL > monitor.peakProfit) {
        monitor.peakProfit = currentPnL;
        console.log(`🚀 NOVO PICO: ${monitor.peakProfit.toFixed(2)}%`);
      }
      
      // Calcula drawdown atual
      monitor.currentDrawdown = monitor.peakProfit - currentPnL;

      // Verifica alvos
      let newTargetsHit = 0;
      
      console.log(`🎯 VERIFICANDO ALVOS para ${symbol}:`);
      console.log(`   💰 Preço atual: $${currentPrice.toFixed(8)}`);
      console.log(`   🎯 Alvos: ${monitor.targets.map(t => '$' + t.toFixed(8)).join(', ')}`);
      console.log(`   🔄 Tipo: ${monitor.isShort ? 'SHORT' : 'LONG'}`);
      
      if (monitor.isShort) {
        // Para SHORT: alvos são atingidos quando preço desce
        for (let i = 0; i < monitor.targets.length; i++) {
          if (currentPrice <= monitor.targets[i]) {
            newTargetsHit = i + 1;
            console.log(`🎯 SHORT: Alvo ${i + 1} atingido ($${currentPrice.toFixed(8)} <= $${monitor.targets[i].toFixed(8)})`);
          } else {
            break;
          }
        }
      } else {
        // Para LONG: alvos são atingidos quando preço sobe
        for (let i = 0; i < monitor.targets.length; i++) {
          if (currentPrice >= monitor.targets[i]) {
            newTargetsHit = i + 1;
            console.log(`🎯 LONG: Alvo ${i + 1} atingido ($${currentPrice.toFixed(8)} >= $${monitor.targets[i].toFixed(8)})`);
          } else {
            break;
          }
        }
      }

      // Se atingiu novo alvo
      if (newTargetsHit > monitor.targetsHit) {
        console.log(`🎉 NOVO ALVO ATINGIDO: ${newTargetsHit} (anterior: ${monitor.targetsHit})`);
        monitor.targetsHit = newTargetsHit;
        monitor.maxTargetsHit = Math.max(monitor.maxTargetsHit, newTargetsHit);
        
        this.sendTargetHitNotification(symbol, newTargetsHit, monitor.targets[newTargetsHit - 1], currentPnL);
        
        // Se atingiu todos os alvos
        if (newTargetsHit >= monitor.targets.length) {
          console.log(`🌕 TODOS OS ALVOS ATINGIDOS: ${symbol}`);
          this.completeMonitor(symbol, 'ALL_TARGETS', currentPnL, app, adaptiveScoring);
          return;
        }
      }

      // Verifica stop loss
      let stopHit = false;
      console.log(`🛑 VERIFICANDO STOP LOSS:`);
      console.log(`   💰 Preço atual: $${currentPrice.toFixed(8)}`);
      console.log(`   🛑 Stop Loss: $${monitor.stopLoss.toFixed(8)}`);
      console.log(`   🔄 Tipo: ${monitor.isShort ? 'SHORT' : 'LONG'}`);
      
      if (monitor.isShort) {
        // Para SHORT: stop loss quando preço sobe acima do stop
        stopHit = currentPrice >= monitor.stopLoss;
        console.log(`🛑 SHORT: Stop ${stopHit ? 'ATINGIDO' : 'OK'} ($${currentPrice.toFixed(8)} ${stopHit ? '>=' : '<'} $${monitor.stopLoss.toFixed(8)})`);
      } else {
        // Para LONG: stop loss quando preço desce abaixo do stop
        stopHit = currentPrice <= monitor.stopLoss;
        console.log(`🛑 LONG: Stop ${stopHit ? 'ATINGIDO' : 'OK'} ($${currentPrice.toFixed(8)} ${stopHit ? '<=' : '>'} $${monitor.stopLoss.toFixed(8)})`);
      }
      
      if (stopHit) {
        console.log(`🛑 STOP LOSS ATIVADO: ${symbol}`);
        this.completeMonitor(symbol, 'STOP_LOSS', currentPnL, app, adaptiveScoring);
        return;
      }

      // Log periódico (a cada 1% de mudança)
      const pnlChange = Math.abs(currentPnL);
      if (pnlChange > 0 && pnlChange % 1 < 0.1) {
        console.log(`📊 PROGRESSO ${symbol}: $${currentPrice.toFixed(8)} (${currentPnL > 0 ? '+' : ''}${currentPnL.toFixed(2)}%) - ${monitor.targetsHit}/${monitor.targets.length} alvos`);
      }

    } catch (error) {
      console.error(`❌ ERRO ao processar update de preço ${symbol}:`, error.message);
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
      const baseSymbol = symbol.split('/')[0];
      
      console.log(`🎯 ENVIANDO NOTIFICAÇÃO DE ALVO:`);
      console.log(`   💰 Símbolo: ${symbol}`);
      console.log(`   🎯 Alvo: ${targetNumber}`);
      console.log(`   💰 Preço: $${targetPrice.toFixed(8)}`);
      console.log(`   📊 P&L: ${currentPnL.toFixed(2)}% (${leveragedPnL.toFixed(2)}% com 15x)`);
      
      let targetEmoji = '';
      if (targetNumber === 1) targetEmoji = '1️⃣';
      else if (targetNumber === 2) targetEmoji = '2️⃣';
      else if (targetNumber === 3) targetEmoji = '3️⃣';
      else if (targetNumber === 4) targetEmoji = '4️⃣';
      else if (targetNumber === 5) targetEmoji = '5️⃣';
      else if (targetNumber === 6) targetEmoji = '🌕';
      
      const message = `🎯 *ALVO ${targetNumber} ATINGIDO* ${targetEmoji}\n\n` +
                     `💰 *#${baseSymbol} Futures*\n` +
                     `🎯 *Alvo ${targetNumber}:* $${targetPrice.toFixed(8)}\n` +
                     `💰 *Lucro:* +${currentPnL.toFixed(2)}% (+${leveragedPnL.toFixed(2)}% com 15x)\n\n` +
                     `👑 Sinais Lobo Cripto\n` +
                     `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
        console.log(`✅ NOTIFICAÇÃO ENVIADA: Alvo ${targetNumber} para ${symbol}`);
      } else {
        console.log(`🎯 [SIMULADO] Alvo ${targetNumber} atingido: ${symbol} +${leveragedPnL.toFixed(2)}%`);
      }
    } catch (error) {
      console.error(`❌ ERRO ao enviar notificação de alvo ${symbol}:`, error.message);
    }
  }

  /**
   * Envia notificação de conclusão
   */
  async sendCompletionNotification(symbol, reason, finalPnL, leveragedPnL, monitor) {
    try {
      const baseSymbol = symbol.split('/')[0];
      let emoji = '✅';
      let reasonText = '';
      
      switch (reason) {
        case 'ALL_TARGETS':
          emoji = '🌕';
          reasonText = 'TODOS OS ALVOS ATINGIDOS - LUA!';
          break;
        case 'STOP_LOSS':
          emoji = '❌';
          reasonText = 'STOP LOSS ATIVADO';
          break;
        case 'PROFIT_STOP':
          emoji = '🛡️';
          reasonText = 'STOP DE LUCRO ATIVADO';
          break;
        case 'MANUAL':
          emoji = '✋';
          reasonText = 'FECHAMENTO MANUAL';
          break;
        default:
          reasonText = reason.toUpperCase();
      }

      const duration = new Date() - monitor.timestamp;
      const hours = Math.floor(duration / (1000 * 60 * 60));
      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
      
      const message = `${emoji} *OPERAÇÃO #${baseSymbol} FINALIZADA*\n\n` +
                     `💰 *#${baseSymbol} Futures*\n` +
                     `📝 *Status:* ${reasonText}\n` +
                     `🎯 *Alvos atingidos:* ${monitor.targetsHit}/${monitor.targets.length}\n` +
                     `💰 *Resultado final:* ${finalPnL > 0 ? '+' : ''}${finalPnL.toFixed(2)}%\n` +
                     `🚀 *Com alavancagem 15x:* ${leveragedPnL > 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n` +
                     `⏱️ *Duração:* ${hours}h ${minutes}m\n` +
                     `📈 *Pico máximo:* +${monitor.peakProfit.toFixed(2)}%\n\n` +
                     `👑 Sinais Lobo Cripto\n` +
                     `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

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
    const connectionKey = `${symbol}_1m`;
    if (this.wsConnections.has(symbol)) {
      try {
        const ws = this.wsConnections.get(symbol);
        // Marca como fechamento intencional
        ws._intentionalClose = true;
        ws.close(1000, 'Monitor removed');
        this.wsConnections.delete(symbol);
        console.log(`🔌 WebSocket intencionalmente fechado para ${symbol}`);
        return true;
      } catch (error) {
        console.error(`Erro ao parar WebSocket ${symbol}:`, error.message);
        // Force remove da lista mesmo com erro
        this.wsConnections.delete(symbol);
        return false;
      }
    }
    
    // Verifica também por connectionKey
    if (this.wsConnections.has(connectionKey)) {
      try {
        const ws = this.wsConnections.get(connectionKey);
        ws._intentionalClose = true;
        ws.close(1000, 'Monitor removed');
        this.wsConnections.delete(connectionKey);
        console.log(`🔌 WebSocket parado para ${symbol}`);
        return true;
      } catch (error) {
        console.error(`Erro ao parar WebSocket ${symbol}:`, error.message);
        // Force remove da lista mesmo com erro
        this.wsConnections.delete(connectionKey);
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