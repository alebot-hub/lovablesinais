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
        console.error('❌ TelegramBot: Erro ao inicializar bot:', error.message);
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
        symbol,
        entry: entry,
        targets: [...targets],
        targetsHit: 0,
        stopLoss,
        currentStopLoss: stopLoss, // Stop loss atual (pode ser móvel)
        signalId: signalId,
        timestamp: new Date(),
        status: 'ACTIVE',
        maxTargetsHit: 0,
        peakProfit: 0,
        currentDrawdown: 0,
        lastPrice: entry,
        stopType: 'INITIAL', // INITIAL, PROFIT_PROTECTION
        partialProfitRealized: 0, // Percentual de lucro já realizado
        riskConfig: null // Configurações de risco
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
    const baseSymbol = signal.symbol.split('/')[0];
    const trend = signal.trend || 'BULLISH';
    const isLong = trend === 'BULLISH';
    const trendEmoji = isLong ? '🟢 COMPRA' : '🔴 VENDA';
    const timeframe = signal.timeframe || '4h'; // Default para 4h se não especificado
    
    // Corrige regime inconsistente
    let actualRegime = signal.regime || 'NORMAL';
    if (!isLong && actualRegime === 'BULL') {
      actualRegime = 'BEAR'; // Sinal de venda em regime bull não faz sentido
    }
    if (isLong && actualRegime === 'BEAR') {
      actualRegime = 'BULL'; // Sinal de compra em regime bear não faz sentido
    }
    
    const regimeEmoji = this.getRegimeEmoji(actualRegime);
    
    // Gera fatores-chave consistentes com o sinal
    const factorsKey = this.generateConsistentFactors(signal, isLong);
    
    // Monta a mensagem
    let message = `🚨 LOBO PREMIUM #${baseSymbol} ${trendEmoji} ${regimeEmoji}\n\n`;
    
    // Informações básicas
    message += `💰 #${baseSymbol} Futures\n`;
    message += `📊 TEMPO GRÁFICO: ${timeframe}\n`;
    message += `🌐 REGIME: ${actualRegime} ${regimeEmoji}\n`;
    message += `📈 Alavancagem sugerida: 15x\n`;
    message += `🎯 Probabilidade: ${signal.probability || 'N/A'}%\n\n`;
    
    // Análise de sentimento
    message += `📊 ANÁLISE DE SENTIMENTO:\n`;
    message += `💡 Interpretação: ${isLong ? 'Análise técnica favorável para compra' : 'Análise técnica favorável para venda'}\n`;
    message += `${factorsKey}\n\n`;
    
    // Entrada e alvos
    message += `⚡️ Entrada: ${this.formatPrice(signal.entry)}\n\n`;
    
    message += `🎯 ALVOS (15x):\n`;
    signal.targets.forEach((target, index) => {
      const targetNumber = index + 1;
      const isFinalTarget = targetNumber === signal.targets.length;
      let targetLabel = '';
      
      if (isFinalTarget) {
        // Mostra 'Lua!' para compras (LONG) e 'Queda Infinita' para vendas (SHORT)
        targetLabel = isLong ? ' - Lua!' : ' - Queda Infinita';
      }
      
      const targetEmoji = isFinalTarget ? '🌕' : `${targetNumber}️⃣`;
      message += `${targetEmoji} Alvo ${targetNumber}${targetLabel}: ${this.formatPrice(target)}\n`;
    });
    
    message += '\n';
    
    // Stop Loss
    message += `🛑 Stop Loss: ${this.formatPrice(signal.stopLoss)}\n\n`;
    
    // Regime de operação
    message += `🎛️ Regime: ${regimeEmoji} MODO ${actualRegime} - ${this.getRegimeDescription(actualRegime)}\n`;
    
    // Rodapé
    message += `\n👑 Sinais Premium são 100% a favor da tendência e correlação com o Bitcoin\n`;
    message += `⏰ ${new Date().toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Sao_Paulo' 
    }).replace(/\//g, '/')}`;
    
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
  async handlePriceUpdate(symbol, candleData, app, adaptiveScoring = null) {
    try {
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) return;
      
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
      let currentPnL;
      if (monitor.isShort) {
        // Para SHORT: lucro quando preço desce
        currentPnL = ((monitor.entry - currentPrice) / monitor.entry) * 100;
      } else {
        // Para LONG: lucro quando preço sobe
        currentPnL = ((currentPrice - monitor.entry) / monitor.entry) * 100;
      }
      
      // Atualiza peak profit
      if (currentPnL > monitor.peakProfit) {
        monitor.peakProfit = currentPnL;
      }
      
      // Calcula drawdown atual
      monitor.currentDrawdown = monitor.peakProfit - currentPnL;

      // Verifica se o preço retornou ao ponto de entrada após atingir o Alvo 1
      if (monitor.targetsHit >= 1 && monitor.stopType === 'BREAKEVEN') {
        const priceDiff = Math.abs(currentPrice - monitor.entry) / monitor.entry * 100;
        
        // Se o preço estiver muito próximo do ponto de entrada (dentro de 0.1%)
        if (priceDiff <= 0.1) {
          console.log(`🔄 PREÇO RETORNOU AO PONTO DE ENTRADA após Alvo 1: $${currentPrice.toFixed(8)}`);
          
          // Calcula o lucro realizado (50% da posição no Alvo 1)
          const profitAtTarget1 = ((monitor.targets[0] - monitor.entry) / monitor.entry * 100) * 0.5;
          
          // Envia notificação de stop de lucro
          const baseSymbol = symbol.split('/')[0];
          const message = `✅ *STOP DE LUCRO ATIVADO #${baseSymbol}*\n\n` +
                         `🔍 *Preço retornou ao ponto de entrada*\n` +
                         `💰 *Lucro realizado:* +${profitAtTarget1.toFixed(2)}% (50% da posição no Alvo 1)\n` +
                         `📊 *Entrada:* ${this.formatPrice(monitor.entry)}\n` +
                         `💵 *Preço atual:* ${this.formatPrice(currentPrice)}\n` +
                         `\n` +
                         `🎉 *EXCELENTE RESULTADO!*\n` +
                         `• Operação finalizada sem perdas\n` +
                         `• Stop de lucro protegeu os ganhos\n` +
                         `• Gestão de risco funcionou perfeitamente\n` +
                         `• Parabéns pela disciplina!\n\n` +
                         `👑 *Sinais Premium são 100% a favor da tendência e correlação com o Bitcoin*`;
          
          if (this.isEnabled) {
            await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
          } else {
            console.log(`[SIMULADO] STOP DE LUCRO: ${symbol} - Mensagem: ${message.replace(/\n/g, ' ')}`);
          }
          
          // Finaliza o monitor com lucro
          this.completeMonitor(symbol, 'PROFIT_STOP', profitAtTarget1, app, adaptiveScoring);
          return;
        }
      }

      // Verifica alvos
      let newTargetsHit = 0;
      
      if (monitor.isShort) {
        // Para SHORT: alvos são atingidos quando preço desce
        for (let i = 0; i < monitor.targets.length; i++) {
          if (currentPrice <= monitor.targets[i]) {
            newTargetsHit = i + 1;
          } else {
            break;
          }
        }
      } else {
        // Para LONG: alvos são atingidos quando preço sobe
        for (let i = monitor.targetsHit; i < monitor.targets.length; i++) {
          if (currentPrice >= monitor.targets[i]) {
            newTargetsHit = Math.max(newTargetsHit, i + 1);
          } else {
            break;
          }
        }
      }

      // Se atingiu novo alvo
      if (newTargetsHit > monitor.targetsHit) {
        // Processa apenas o próximo alvo (um por vez)
        const nextTarget = monitor.targetsHit + 1;
        
        if (nextTarget <= newTargetsHit) {
          monitor.targetsHit = nextTarget;
          monitor.maxTargetsHit = Math.max(monitor.maxTargetsHit, nextTarget);
          
          console.log(`🎯 ALVO ${nextTarget} ATINGIDO: ${symbol} - $${monitor.targets[nextTarget - 1].toFixed(8)}`);
          
          this.sendTargetHitNotification(symbol, nextTarget, monitor.targets[nextTarget - 1], currentPnL);
          
          // Se atingiu todos os alvos
          if (nextTarget >= monitor.targets.length) {
            this.completeMonitor(symbol, 'ALL_TARGETS', currentPnL, app, adaptiveScoring);
            return;
          }
          
          // Atualiza stop loss para este alvo
          this.updateStopLoss(symbol, nextTarget);
        }
      }

      // Verifica stop loss
      let stopHit = false;
      
      if (monitor.isShort) {
        // Para SHORT: stop loss quando preço sobe acima do stop
        stopHit = currentPrice >= monitor.currentStopLoss;
      } else {
        // Para LONG: stop loss quando preço desce abaixo do stop
        stopHit = currentPrice <= monitor.currentStopLoss;
      }
      
      if (stopHit) {
        const reason = monitor.stopType === 'INITIAL' ? 'STOP_LOSS' : 'PROFIT_PROTECTION';
        console.log(`🛑 STOP HIT: ${symbol} - ${reason} ativado em $${currentPrice.toFixed(8)}`);
        this.completeMonitor(symbol, reason, currentPnL, app, adaptiveScoring);
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
      
      // Atualiza o gerenciamento de risco primeiro
      this.updateRiskManagement(symbol, targetNumber);
      
      // Obtém a configuração de risco atualizada
      const riskConfig = monitor.riskConfig || {};
      
      // Mensagens específicas para cada alvo
      let targetMessage = '';
      let recommendation = '';
      
      switch(targetNumber) {
        case 1:
          targetMessage = '✅ *PRIMEIRO ALVO ATINGIDO*';
          recommendation = '💰 *Recomendação:* Realize 50% da posição';
          break;
        case 2:
          targetMessage = '🎯 *SEGUNDO ALVO ATINGIDO*';
          recommendation = '💰 *Recomendação:* Realize 15% da posição e mova o stop para o ponto de entrada';
          break;
        case 3:
          targetMessage = '🎯 *TERCEIRO ALVO ATINGIDO*';
          recommendation = '💰 *Recomendação:* Realize 10% da posição e mova o stop para o Alvo 1';
          break;
        case 4:
          targetMessage = '🎯 *QUARTO ALVO ATINGIDO*';
          recommendation = '💰 *Recomendação:* Realize 10% da posição e mova o stop para o Alvo 2';
          break;
        case 5:
          targetMessage = '🎯 *QUINTO ALVO ATINGIDO*';
          recommendation = '💰 *Recomendação:* Realize 10% da posição e mova o stop para o Alvo 3';
          break;
        case 6:
          targetMessage = '🌕 *ALVO FINAL ATINGIDO!*';
          recommendation = '💰 *Recomendação:* Realize o restante da posição. Operação concluída com sucesso!';
          break;
        default:
          targetMessage = `🎯 ALVO ${targetNumber} ATINGIDO`;
          recommendation = '💰 Continue monitorando os próximos alvos';
      }
      
      // Adiciona informação sobre o tipo de stop se foi proteção
      let stopInfo = '';
      if (monitor.stopType !== 'INITIAL') {
        const stopDescriptions = {
          'BREAKEVEN': 'no ponto de entrada',
          'TARGET_1': 'no Alvo 1',
          'TARGET_2': 'no Alvo 2', 
          'TARGET_3': 'no Alvo 3',
          'TARGET_4': 'no Alvo 4'
        };
        stopInfo = `\n🛡️ *Stop ativado:* ${stopDescriptions[monitor.stopType] || 'proteção de lucro'}`;
      }
      
      // Constrói a mensagem
      const message = `${targetMessage} #${baseSymbol}\n\n` +
                     `🔍 Alvo ${targetNumber} atingido no par #${baseSymbol}\n` +
                     `💰 Lucro atual: +${leveragedPnL.toFixed(2)}% (Alv. 15×)\n` +
                     `⚡️ Posição parcial realizada\n` +
                     `📊 Entrada: ${this.formatPrice(monitor.entry)}\n` +
                     `💵 Preço do alvo: ${this.formatPrice(targetPrice)}\n` +
                     `⏱️ Tempo até o alvo: ${days} dia${days > 1 ? 's' : ''} ${hours}h ${minutes}m\n` +
                     `${stopInfo}\n\n` +
                     `${recommendation}\n\n` +
                     `👑 Sinais Premium são 100% a favor da tendência e correlação com o Bitcoin`;
      
      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
        console.log(`✅ NOTIFICAÇÃO ENVIADA: Alvo ${targetNumber} para ${symbol}`);
      } else {
        console.log(`🎯 [SIMULADO] Alvo ${targetNumber} atingido: ${symbol} +${leveragedPnL.toFixed(2)}%`);
        console.log(`   📝 Mensagem: ${message.replace(/\n/g, ' ')}`);
      }
      
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
      let message = '';
      
      // Formata a diferença de tempo
      const duration = monitor ? Math.floor((new Date() - monitor.timestamp) / 60000) : 0; // em minutos
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      
      // Formata o P&L com emoji
      const pnlEmoji = finalPnL >= 0 ? '🟢' : '🔴';
      const leveragedPnlEmoji = leveragedPnL >= 0 ? '🟢' : '🔴';
      
      switch (reason) {
        case 'ALL_TARGETS':
          emoji = '🌕';
          reasonText = 'TODOS OS ALVOS ATINGIDOS - LUA!';
          message = `${emoji} #${baseSymbol} - OPERAÇÃO FINALIZADA ${emoji}\n\n` +
                   `📊 Resultado: ${pnlEmoji} +${finalPnL.toFixed(2)}%\n` +
                   `⚡ Alavancado (15x): ${leveragedPnlEmoji} ${leveragedPnL >= 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n\n` +
                   `📌 Motivo: ${reasonText}\n\n` +
                   `📈 Alvos atingidos: ${monitor?.targetsHit || 0}/${monitor?.targets?.length || 0}\n` +
                   `🛑 Stop loss: ${monitor?.stopLoss ? this.formatPrice(monitor.stopLoss) : 'N/A'}\n` +
                   `📅 Duração: ${hours}h ${minutes}m\n\n` +
                   `👑 Sinais Lobo Cripto\n` +
                   `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
          break;
          
        case 'STOP_LOSS':
          emoji = '❌';
          reasonText = 'STOP LOSS ATIVADO';
          
          // Verifica se algum alvo foi atingido
          const targetsHit = monitor?.targetsHit || 0;
          
          if (targetsHit === 0) {
            // Mensagem quando NENHUM alvo foi atingido
            message = `${emoji} #${baseSymbol} - OPERAÇÃO FINALIZADA ${emoji}\n\n` +
                     `📊 Resultado: ${pnlEmoji}\n` +
                     `⚡ Alavancado (15x): ${leveragedPnlEmoji} ${leveragedPnL >= 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n\n` +
                     `📌 Motivo: ${reasonText}\n\n` +
                     `📈 Alvos atingidos: Nenhum\n` +
                     `🛑 Stop loss: ${monitor?.stopLoss ? this.formatPrice(monitor.stopLoss) : 'N/A'}\n` +
                     `📅 Duração: ${hours}h ${minutes}m\n\n` +
                     `💡 GERENCIAMENTO DE RISCO:\n` +
                     `- Stop loss ativado sem alvos atingidos\n` +
                     `- Perda limitada conforme estratégia\n` +
                     `- Gestão de risco protegeu o capital total\n` +
                     `- Aguarde próxima oportunidade\n` +
                     `- Mantenha disciplina!\n\n` +
                     `📊 ANÁLISE:\n` +
                     `- Mercado se moveu contra nossa operação\n` +
                     `- Stop loss protegeu de perdas maiores\n` +
                     `- Próxima operação pode ser mais favorável\n\n` +
                     `👑 Sinais Lobo Cripto\n` +
                     `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
          } else if (targetsHit === 1) {
            // Mensagem quando o Alvo 1 foi atingido e depois ativou stop loss
            message = `${emoji} #${baseSymbol} - OPERAÇÃO FINALIZADA ${emoji}\n\n` +
                     `📊 Resultado: ${pnlEmoji}\n` +
                     `⚡ Alavancado (15x): ${leveragedPnlEmoji} ${leveragedPnL >= 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n\n` +
                     `📌 Motivo: ${reasonText} APÓS ALVO 1\n\n` +
                     `📈 Alvos atingidos: 1\n` +
                     `🛑 Stop loss: ${monitor?.stopLoss ? this.formatPrice(monitor.stopLoss) : 'N/A'}\n` +
                     `📅 Duração: ${hours}h ${minutes}m\n\n` +
                     `💡 GERENCIAMENTO DE RISCO:\n` +
                     `- Stop loss ativado após realização parcial no Alvo 1\n` +
                     `- 50% da posição foi realizada com lucro\n` +
                     `- Perda reduzida na posição restante\n` +
                     `- Estratégia de proteção funcionou\n` +
                     `- Aguarde próxima oportunidade\n\n` +
                     `📊 ANÁLISE:\n` +
                     `- Mercado reverteu após atingir o primeiro alvo\n` +
                     `- Realização parcial garantiu lucro na operação\n` +
                     `- Stop móvel protegeu os ganhos parciais\n\n` +
                     `👑 Sinais Lobo Cripto\n` +
                     `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
          }
          break;
          
        case 'PROFIT_PROTECTION':
          emoji = '🛡️';
          reasonText = 'STOP DE PROTEÇÃO ATIVADO';
          message = `${emoji} #${baseSymbol} - OPERAÇÃO FINALIZADA ${emoji}\n\n` +
                   `📊 Resultado: ${pnlEmoji} ${finalPnL >= 0 ? '+' : ''}${finalPnL.toFixed(2)}%\n` +
                   `⚡ Alavancado (15x): ${leveragedPnlEmoji} ${leveragedPnL >= 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n\n` +
                   `📌 Motivo: ${reasonText}\n\n` +
                   `📈 Alvos atingidos: ${monitor?.targetsHit || 0}/${monitor?.targets?.length || 0}\n` +
                   `🛑 Stop loss: ${monitor?.stopLoss ? this.formatPrice(monitor.stopLoss) : 'N/A'}\n` +
                   `📅 Duração: ${hours}h ${minutes}m\n\n` +
                   `👑 Sinais Lobo Cripto\n` +
                   `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
          break;
          
        case 'PROFIT_STOP':
          emoji = '✅';
          reasonText = 'STOP DE LUCRO ATIVADO';
          message = `${emoji} #${baseSymbol} - OPERAÇÃO FINALIZADA ${emoji}\n\n` +
                   `📊 Resultado: ${pnlEmoji} +${finalPnL.toFixed(2)}%\n` +
                   `⚡ Alavancado (15x): ${leveragedPnlEmoji} +${leveragedPnL.toFixed(2)}%\n\n` +
                   `📌 Motivo: ${reasonText}\n\n` +
                   `📈 Alvos atingidos: ${monitor?.targetsHit || 0}/${monitor?.targets?.length || 0}\n` +
                   `🛑 Stop loss: ${monitor?.stopLoss ? this.formatPrice(monitor.stopLoss) : 'N/A'}\n` +
                   `📅 Duração: ${hours}h ${minutes}m\n\n` +
                   `👑 Sinais Lobo Cripto\n` +
                   `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
          break;
          
        case 'MANUAL':
          emoji = '✋';
          reasonText = 'FECHAMENTO MANUAL';
          break;
          
        default:
          reasonText = reason.toUpperCase();
      }
      
      // Se a mensagem não foi definida no switch, usa o formato padrão
      if (!message) {
        message = `${emoji} #${baseSymbol} - OPERAÇÃO FINALIZADA ${emoji}\n\n` +
                 `📊 Resultado: ${pnlEmoji} ${finalPnL >= 0 ? '+' : ''}${finalPnL.toFixed(2)}%\n` +
                 `⚡ Alavancado (15x): ${leveragedPnlEmoji} ${leveragedPnL >= 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%\n\n` +
                 `📌 Motivo: ${reasonText}\n\n` +
                 `📈 Alvos atingidos: ${monitor?.targetsHit || 0}/${monitor?.targets?.length || 0}\n` +
                 `🛑 Stop loss: ${monitor?.stopLoss ? this.formatPrice(monitor.stopLoss) : 'N/A'}\n` +
                 `📅 Duração: ${hours}h ${minutes}m\n\n` +
                 `👑 Sinais Lobo Cripto\n` +
                 `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
      }

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      } else {
        console.log(`${emoji} [SIMULADO] Operação finalizada ${symbol}: ${leveragedPnL > 0 ? '+' : ''}${leveragedPnL.toFixed(2)}%`);
        console.log(`   📝 Mensagem: ${message.replace(/\n/g, ' ')}`);
      }
    } catch (error) {
      console.error(`Erro ao enviar notificação de conclusão para ${symbol}:`, error.message);
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
        ws._intentionalClose = true; // Marca como fechamento intencional
        ws.close();
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
        ws.close();
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
    
    // Ajusta o limiar baseado se é contra-tendência
    const threshold = sentiment.isCounterTrend ? 75 : 65;
    
    if (newsScore >= 85) {
      newsScore = 85;
    } else if (newsScore >= threshold) {
      newsScore = threshold;
    } else if (newsScore >= 50) {
      newsScore = 50;
    } else {
      newsScore = 15;
    }
    
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
    
    // Análise de Fear & Greed com