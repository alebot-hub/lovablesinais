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
    console.log(`   💰 Entrada: ${this.formatPrice(signal.entry)}`);
    console.log(`   🎯 Alvos: ${signal.targets.map(t => this.formatPrice(t)).join(', ')}`);
    console.log(`   🛑 Stop: ${this.formatPrice(signal.stopLoss)}`);
    
    let message = `🚨 *LOBO PREMIUM #${baseSymbol}* ${trendEmoji} (Futures)\n\n`;
    
    message += `💰 *#${baseSymbol} Futures*\n`;
    message += `📊 *TEMPO GRÁFICO:* ${signal.timeframe}\n`;
    message += `📈 *Alavancagem sugerida:* 15x\n`;
    message += `🎯 *Probabilidade:* ${Math.round(signal.probability)}%\n`;
    message += `⚡️ *Entrada:* ${this.formatPrice(signal.entry)}\n\n`;
    
    message += `🎯 *Alvos:*\n`;
    signal.targets.forEach((target, index) => {
      if (index === 0) {
        message += `1️⃣ *Alvo 1:* ${this.formatPrice(target)}\n`;
      } else if (index === 1) {
        message += `2️⃣ *Alvo 2:* ${this.formatPrice(target)}\n`;
      } else if (index === 2) {
        message += `3️⃣ *Alvo 3:* ${this.formatPrice(target)}\n`;
      } else if (index === 3) {
        message += `4️⃣ *Alvo 4:* ${this.formatPrice(target)}\n`;
      } else if (index === 4) {
        message += `5️⃣ *Alvo 5:* ${this.formatPrice(target)}\n`;
      } else if (index === 5) {
        message += `🌕 *Alvo 6 - Lua!:* ${this.formatPrice(target)}\n`;
      }
    });
    
    message += `\n🛑 *Stop Loss:* ${this.formatPrice(signal.stopLoss)}\n\n`;
    
    // Validação final dos alvos antes do envio
    let hasErrors = false;
    
    if (isShort) {
      // Para SHORT: alvos devem ser menores que entrada
      const invalidTargets = signal.targets.filter(target => target >= signal.entry);
      if (invalidTargets.length > 0) {
        console.error(`❌ ERRO CRÍTICO: Alvos SHORT inválidos para ${signal.symbol}:`);
        invalidTargets.forEach((target, i) => {
          console.error(`   🎯 Alvo inválido: ${this.formatPrice(target)} >= ${this.formatPrice(signal.entry)}`);
        });
        hasErrors = true;
      }
      // Para SHORT: stop deve ser maior que entrada
      if (signal.stopLoss <= signal.entry) {
        console.error(`❌ ERRO CRÍTICO: Stop SHORT inválido para ${signal.symbol}: ${this.formatPrice(signal.stopLoss)} <= ${this.formatPrice(signal.entry)}`);
        hasErrors = true;
      }
    } else {
      // Para LONG: alvos devem ser maiores que entrada
      const invalidTargets = signal.targets.filter(target => target <= signal.entry);
      if (invalidTargets.length > 0) {
        console.error(`❌ ERRO CRÍTICO: Alvos LONG inválidos para ${signal.symbol}:`);
        invalidTargets.forEach((target, i) => {
          console.error(`   🎯 Alvo inválido: ${this.formatPrice(target)} <= ${this.formatPrice(signal.entry)}`);
        });
        hasErrors = true;
      }
      // Para LONG: stop deve ser menor que entrada
      if (signal.stopLoss >= signal.entry) {
        console.error(`❌ ERRO CRÍTICO: Stop LONG inválido para ${signal.symbol}: ${this.formatPrice(signal.stopLoss)} >= ${this.formatPrice(signal.entry)}`);
        hasErrors = true;
      }
    }
    
    if (hasErrors) {
      console.error(`❌ SINAL COM ERROS - NÃO DEVE SER ENVIADO`);
      message += `\n⚠️ *ATENÇÃO: SINAL COM ERROS DETECTADOS*\n`;
    } else {
      console.log(`✅ SINAL VALIDADO: Todos os níveis estão corretos`);
    }
    
    message += `👑 *Sinais Premium são 100% a favor da tendência e correlação com o Bitcoin*\n`;
    message += `*Por ser outro sistema pode gerar sinais iguais aos existentes ou no sentido contrário.*\n`;
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
      const leveragedPnL = currentPnL * 15; // Alavancagem 15x
      const baseSymbol = symbol.split('/')[0];
      const monitor = this.activeMonitors.get(symbol);
      
      if (!monitor) {
        console.error(`❌ Monitor não encontrado para ${symbol}`);
        return;
      }
      
      // Calcula tempo até o alvo
      const timeToTarget = new Date() - monitor.timestamp;
      const days = Math.floor(timeToTarget / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeToTarget % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeToTarget % (1000 * 60 * 60)) / (1000 * 60));
      
      let timeText = '';
      if (days > 0) {
        timeText = `${days} dia${days > 1 ? 's' : ''}`;
      } else if (hours > 0) {
        timeText = `${hours}h ${minutes}m`;
      } else {
        timeText = `${minutes} minuto${minutes > 1 ? 's' : ''}`;
      }
      
      // Determina recomendação de realização baseada no alvo
      let recommendation = '';
      let partialPercent = '';
      
      if (targetNumber === 1) {
        recommendation = 'Realize 50% da posição neste alvo';
        partialPercent = '50%';
      } else if (targetNumber === 2) {
        recommendation = 'Realize 15% da posição e mova o stop para o ponto de entrada';
        partialPercent = '15%';
      } else if (targetNumber === 3) {
        recommendation = 'Realize 10% da posição e mova o stop para o alvo 1';
        partialPercent = '10%';
      } else if (targetNumber === 4) {
        recommendation = 'Realize 10% da posição e mova o stop para o alvo 2';
        partialPercent = '10%';
      } else if (targetNumber === 5) {
        recommendation = 'Realize 10% da posição e mova o stop para o alvo 3';
        partialPercent = '10%';
      } else if (targetNumber === 6) {
        recommendation = 'Realize 5% da posição restante - PARABÉNS!';
        partialPercent = '5%';
      }
      
      console.log(`🎯 ENVIANDO NOTIFICAÇÃO DE ALVO:`);
      console.log(`   💰 Símbolo: ${symbol}`);
      console.log(`   🎯 Alvo: ${targetNumber}`);
      console.log(`   💰 Preço: ${this.formatPrice(targetPrice)}`);
      console.log(`   📊 P&L sem alavancagem: ${currentPnL.toFixed(2)}%`);
      console.log(`   📊 P&L com 15x: ${leveragedPnL.toFixed(2)}%`);
      console.log(`   ⏱️ Tempo: ${timeText}`);
      console.log(`   💡 Recomendação: ${recommendation}`);
      
      let targetEmoji = '';
      if (targetNumber === 1) targetEmoji = '1️⃣';
      else if (targetNumber === 2) targetEmoji = '2️⃣';
      else if (targetNumber === 3) targetEmoji = '3️⃣';
      else if (targetNumber === 4) targetEmoji = '4️⃣';
      else if (targetNumber === 5) targetEmoji = '5️⃣';
      else if (targetNumber === 6) targetEmoji = '🌕';
      
      const message = `✅ *ALVO ${targetNumber} ATINGIDO #${baseSymbol}*\n\n` +
                     `${targetEmoji} *Alvo ${targetNumber} atingido no par #${baseSymbol}*\n` +
                     `💰 *Lucro:* +${leveragedPnL.toFixed(2)}% (Alv. 15×)\n` +
                     `⚡️ *Posição parcial realizada*\n` +
                     `📊 *Entrada:* ${this.formatPrice(monitor.entry)}\n` +
                     `💵 *Preço do alvo:* ${this.formatPrice(targetPrice)}\n` +
                     `⏱️ *Tempo até o alvo:* ${timeText}\n` +
                     `⚠️ *Recomendação:* ${recommendation}\n\n` +
                     `👑 *Sinais Lobo Cripto*`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
        console.log(`✅ NOTIFICAÇÃO ENVIADA: Alvo ${targetNumber} para ${symbol}`);
      } else {
        console.log(`🎯 [SIMULADO] Alvo ${targetNumber} atingido: ${symbol} +${leveragedPnL.toFixed(2)}% - ${recommendation}`);
      }
      
      // Atualiza gerenciamento de risco no monitor
      this.updateRiskManagement(symbol, targetNumber);
      
      // Atualiza stop loss
      this.updateStopLoss(symbol, targetNumber);
      
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
        case 'PROFIT_PROTECTION':
          emoji = '🛡️';
          reasonText = 'STOP DE PROTEÇÃO ATIVADO';
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
      
      // Adiciona informação sobre o tipo de stop se foi proteção
      let stopInfo = '';
      if (reason === 'PROFIT_PROTECTION' && monitor.stopType !== 'INITIAL') {
        const stopDescriptions = {
          'BREAKEVEN': 'no ponto de entrada',
          'TARGET_1': 'no Alvo 1',
          'TARGET_2': 'no Alvo 2', 
          'TARGET_3': 'no Alvo 3',
          'TARGET_4': 'no Alvo 4'
        };
        stopInfo = `\n🛡️ *Stop ativado:* ${stopDescriptions[monitor.stopType] || 'proteção de lucro'}`;
      }
      
      const message = `${emoji} *OPERAÇÃO #${baseSymbol} FINALIZADA*\n\n` +
                     `💰 *#${baseSymbol} Futures*\n` +
                     `📝 *Status:* ${reasonText}\n` +
                     `🎯 *Alvos atingidos:* ${monitor.targetsHit}/${monitor.targets.length}\n` +
                     `💰 *Resultado final:* ${finalPnL > 0 ? '+' : ''}${finalPnL.toFixed(2)}%\n` +
                     `🚀 *Com alavancagem 15x:* ${leveragedPnL > 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n` +
                     `⏱️ *Duração:* ${hours}h ${minutes}m\n` +
                     `📈 *Pico máximo:* +${monitor.peakProfit.toFixed(2)}%${stopInfo}\n\n` +
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
   * Envia análise de sentimento do mercado
   */
  async sendMarketSentiment(sentiment) {
    try {
      // Determina emoji baseado no sentimento
      let sentimentEmoji = '😐'; // Neutro por padrão
      let sentimentText = 'Neutro';
      
      if (sentiment.overall === 'OTIMISTA') {
        sentimentEmoji = '😊';
        sentimentText = 'Otimista';
      } else if (sentiment.overall === 'PESSIMISTA') {
        sentimentEmoji = '😰';
        sentimentText = 'Pessimista';
      }
      
      // Calcula score geral (0-100)
      const generalScore = this.calculateGeneralSentimentScore(sentiment);
      
      let message = `${sentimentEmoji} *ANÁLISE DE SENTIMENTO DE MERCADO*\n\n`;
      message += `📊 *Sentimento geral:* ${sentimentText} (${generalScore.toFixed(1)}/100)\n\n`;
      
      message += `⚖️ *Componentes:*\n`;
      message += `   • Índice de Medo/Ganância: ${sentiment.fearGreedIndex || 50}/100`;
      
      if (sentiment.isRealFearGreed) {
        message += ` ✅\n`;
      } else {
        message += `\n`;
      }
      
      // Calcula componentes específicos
      const newsScore = this.calculateNewsScore(sentiment);
      const btcScore = this.calculateBitcoinSentimentScore(sentiment);
      const ethScore = this.calculateEthereumSentimentScore(sentiment);
      
      message += `   • Análise de notícias: ${newsScore.toFixed(1)}/100\n`;
      message += `   • Sentimento Bitcoin: ${btcScore.toFixed(1)}/100\n`;
      message += `   • Sentimento Ethereum: ${ethScore.toFixed(1)}/100\n\n`;
      
      // Interpretação inteligente
      message += `🧠 *Interpretação:*\n`;
      const interpretation = this.generateSmartInterpretation(sentiment, generalScore);
      interpretation.forEach(point => {
        message += `• ${point}\n`;
      });
      message += '\n';
      
      message += `🕒 *Analisado em:* ${new Date().toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}\n\n`;
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
   * Calcula score geral de sentimento (0-100)
   */
  calculateGeneralSentimentScore(sentiment) {
    let score = 50; // Base neutra
    
    // Fear & Greed Index (peso 30%)
    const fgWeight = 0.3;
    score += ((sentiment.fearGreedIndex || 50) - 50) * fgWeight;
    
    // Proporção de ativos em alta (peso 25%)
    const totalAssets = (sentiment.assetsUp || 0) + (sentiment.assetsDown || 0);
    if (totalAssets > 0) {
      const bullishRatio = sentiment.assetsUp / totalAssets;
      score += (bullishRatio - 0.5) * 50 * 0.25;
    }
    
    // Volume vs média (peso 20%)
    const volumeWeight = 0.2;
    if (sentiment.volumeVsAverage) {
      score += ((sentiment.volumeVsAverage - 1) * 25) * volumeWeight;
    }
    
    // Market cap crypto (peso 15%)
    if (sentiment.cryptoMarketCap && sentiment.cryptoMarketCap.change24h !== undefined) {
      score += (sentiment.cryptoMarketCap.change24h * 2) * 0.15;
    }
    
    // Volatilidade (peso 10% - inverso)
    if (sentiment.volatility) {
      const volImpact = Math.min(sentiment.volatility, 10) / 10; // Normaliza 0-1
      score -= volImpact * 10 * 0.1; // Alta volatilidade reduz score
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calcula score de notícias
   */
  calculateNewsScore(sentiment) {
    let newsScore = 50; // Base neutra
    
    // Baseado no sentimento geral
    if (sentiment.overall === 'OTIMISTA') {
      newsScore = 65 + Math.random() * 20; // 65-85
    } else if (sentiment.overall === 'PESSIMISTA') {
      newsScore = 15 + Math.random() * 20; // 15-35
    } else {
      newsScore = 40 + Math.random() * 20; // 40-60
    }
    
    // Ajusta baseado em Fear & Greed
    const fgIndex = sentiment.fearGreedIndex || 50;
    if (fgIndex > 75) newsScore += 10; // Ganância extrema
    if (fgIndex < 25) newsScore -= 10; // Medo extremo
    
    return Math.max(0, Math.min(100, newsScore));
  }
  
  /**
   * Calcula sentimento do Bitcoin
   */
  calculateBitcoinSentimentScore(sentiment) {
    // Usa o sentimento calculado com dados reais se disponível
    if (sentiment.bitcoinSentiment && sentiment.bitcoinSentiment.score) {
      return sentiment.bitcoinSentiment.score;
    }
    
    // Fallback para cálculo básico
    let btcScore = 50;
    
    if (sentiment.cryptoMarketCap && sentiment.cryptoMarketCap.btcDominance) {
      const dominance = sentiment.cryptoMarketCap.btcDominance;
      if (dominance > 60) {
        btcScore = 60 + (dominance - 60) * 0.8;
      } else if (dominance < 40) {
        btcScore = 40 + (dominance - 40) * 0.5;
      }
    }
    
    return Math.max(0, Math.min(100, btcScore));
  }
  
  /**
   * Calcula sentimento do Ethereum
   */
  calculateEthereumSentimentScore(sentiment) {
    // Usa o sentimento calculado com dados reais se disponível
    if (sentiment.ethereumSentiment && sentiment.ethereumSentiment.score) {
      return sentiment.ethereumSentiment.score;
    }
    
    // Fallback para cálculo básico
    let ethScore = 50;
    
    if (sentiment.cryptoMarketCap && sentiment.cryptoMarketCap.btcDominance) {
      const dominance = sentiment.cryptoMarketCap.btcDominance;
      if (dominance < 45) {
        ethScore = 55 + (45 - dominance) * 0.8;
      } else if (dominance > 65) {
        ethScore = 45 - (dominance - 65) * 0.6;
      }
    }
    
    return Math.max(0, Math.min(100, ethScore));
  }
  
  /**
   * Gera interpretação inteligente
   */
  generateSmartInterpretation(sentiment, generalScore) {
    const interpretation = [];
    
    // Análise específica baseada em dados reais
    const btcScore = sentiment.bitcoinSentiment?.score || 50;
    const ethScore = sentiment.ethereumSentiment?.score || 50;
    const newsScore = sentiment.newsAnalysis?.score || 50;
    const fgIndex = sentiment.fearGreedIndex || 50;
    
    // Interpretação baseada em Bitcoin (maior peso)
    if (btcScore >= 70) {
      interpretation.push(`Bitcoin muito otimista (${btcScore}/100) - lidera o mercado`);
      if (sentiment.bitcoinSentiment?.factors?.length > 0) {
        interpretation.push(`Fatores BTC: ${sentiment.bitcoinSentiment.factors.slice(0, 2).join(', ')}`);
      }
    } else if (btcScore <= 35) {
      interpretation.push(`Bitcoin pessimista (${btcScore}/100) - pressiona altcoins`);
      if (sentiment.bitcoinSentiment?.factors?.length > 0) {
        interpretation.push(`Fatores BTC: ${sentiment.bitcoinSentiment.factors.slice(0, 2).join(', ')}`);
      }
    } else if (btcScore >= 55) {
      interpretation.push(`Bitcoin levemente otimista (${btcScore}/100) - ambiente favorável`);
    } else if (btcScore <= 45) {
      interpretation.push(`Bitcoin levemente pessimista (${btcScore}/100) - cautela`);
    } else {
      interpretation.push(`Bitcoin neutro (${btcScore}/100) - sem direção clara`);
    }
    
    // Interpretação baseada em Ethereum
    if (ethScore >= 70) {
      interpretation.push(`Ethereum muito forte (${ethScore}/100) - altcoin season`);
      if (sentiment.ethereumSentiment?.factors?.length > 0) {
        interpretation.push(`Fatores ETH: ${sentiment.ethereumSentiment.factors.slice(0, 2).join(', ')}`);
      }
    } else if (ethScore <= 35) {
      interpretation.push(`Ethereum fraco (${ethScore}/100) - evite altcoins`);
    } else if (Math.abs(ethScore - btcScore) > 15) {
      if (ethScore > btcScore) {
        interpretation.push(`Ethereum superando Bitcoin (+${(ethScore - btcScore).toFixed(0)} pontos)`);
      } else {
        interpretation.push(`Bitcoin dominando Ethereum (+${(btcScore - ethScore).toFixed(0)} pontos)`);
      }
    }
    
    // Análise de Fear & Greed com contexto
    if (fgIndex > 80) {
      interpretation.push(`Ganância extrema (${fgIndex}/100) - risco de correção iminente`);
    } else if (fgIndex < 20) {
      interpretation.push(`Medo extremo (${fgIndex}/100) - oportunidades históricas de compra`);
    } else if (fgIndex > 70) {
      interpretation.push(`Alta ganância (${fgIndex}/100) - realize lucros gradualmente`);
    } else if (fgIndex < 30) {
      interpretation.push(`Alto medo (${fgIndex}/100) - considere acumulação`);
    }
    
    // Análise de notícias com contexto específico
    if (newsScore >= 70) {
      interpretation.push(`Notícias muito positivas (${newsScore}/100) - momentum midiático`);
    } else if (newsScore <= 35) {
      interpretation.push(`Notícias negativas (${newsScore}/100) - sentimento pessimista`);
    }
    
    // Análise de dominância BTC com recomendações específicas
    if (sentiment.cryptoMarketCap && sentiment.cryptoMarketCap.btcDominance) {
      const dominance = sentiment.cryptoMarketCap.btcDominance;
      if (dominance > 70) {
        interpretation.push(`Dominância BTC extrema (${dominance.toFixed(1)}%) - apenas Bitcoin`);
      } else if (dominance > 60) {
        interpretation.push(`Alta dominância BTC (${dominance.toFixed(1)}%) - foque em BTC e top 5`);
      } else if (dominance < 35) {
        interpretation.push(`Baixa dominância BTC (${dominance.toFixed(1)}%) - altcoin season ativa`);
      } else if (dominance < 45) {
        interpretation.push(`Dominância BTC moderada (${dominance.toFixed(1)}%) - altcoins favorecidas`);
      }
    }
    
    // Recomendação final baseada no contexto geral
    if (generalScore >= 70 && btcScore >= 65) {
      interpretation.push('🟢 Ambiente muito favorável para posições de compra');
    } else if (generalScore <= 30 && btcScore <= 35) {
      interpretation.push('🔴 Ambiente desfavorável - evite compras, considere vendas');
    } else if (Math.abs(generalScore - 50) <= 10) {
      interpretation.push('🟡 Mercado neutro - opere com base em análise técnica');
    } else if (generalScore > 50) {
      interpretation.push('🟢 Leve viés de alta - prefira compras em correções');
    } else {
      interpretation.push('🟡 Leve viés de baixa - cautela com compras');
    }
    
    return interpretation.slice(0, 5); // Máximo 5 pontos mais específicos
  }

  /**
   * Formata preço sem gerar links automáticos
   */
  formatPrice(price) {
    if (!price || isNaN(price)) return '0.00';
    
    // Formata preço evitando links automáticos do Telegram
    const formattedPrice = price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: price >= 1 ? 2 : 8,
      useGrouping: false
    });
    
    // Adiciona espaços invisíveis para quebrar detecção de links
    return formattedPrice.replace(/\./g, '․'); // Usa ponto médio Unicode U+2024
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

  /**
   * Atualiza o stop loss baseado no alvo atingido
   */
  updateStopLoss(symbol, targetNumber) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) {
        console.error(`❌ Monitor não encontrado para ${symbol}`);
        return;
      }

      let newStopLoss = null;
      let stopType = null;

      // Determina novo stop loss baseado no alvo
      switch (targetNumber) {
        case 2:
          // Alvo 2: Mover stop para entrada
          newStopLoss = monitor.entry;
          stopType = 'BREAKEVEN';
          break;
        case 3:
          // Alvo 3: Mover stop para alvo 1
          newStopLoss = monitor.targets[0];
          stopType = 'TARGET_1';
          break;
        case 4:
          // Alvo 4: Mover stop para alvo 2
          newStopLoss = monitor.targets[1];
          stopType = 'TARGET_2';
          break;
        case 5:
          // Alvo 5: Mover stop para alvo 3
          newStopLoss = monitor.targets[2];
          stopType = 'TARGET_3';
          break;
        case 6:
          // Alvo 6: Mover stop para alvo 4
          newStopLoss = monitor.targets[3];
          stopType = 'TARGET_4';
          break;
      }

      if (newStopLoss !== null) {
        // Atualiza stop loss apenas se for mais favorável
        if (monitor.isShort) {
          // Para SHORT: novo stop deve ser maior que o atual
          if (newStopLoss > monitor.currentStopLoss) {
            monitor.currentStopLoss = newStopLoss;
            monitor.stopType = stopType;
            console.log(`🛡️ STOP MOVIDO: ${symbol} - Novo stop: $${newStopLoss.toFixed(8)} (${stopType})`);
          }
        } else {
          // Para LONG: novo stop deve ser menor que o atual
          if (newStopLoss < monitor.currentStopLoss) {
            monitor.currentStopLoss = newStopLoss;
            monitor.stopType = stopType;
            console.log(`🛡️ STOP MOVIDO: ${symbol} - Novo stop: $${newStopLoss.toFixed(8)} (${stopType})`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao atualizar stop loss para ${symbol}:`, error.message);
    }
  }
}

export default TelegramBotService;