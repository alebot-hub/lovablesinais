/**
 * Serviço do Bot do Telegram
 */

import TelegramBot from 'node-telegram-bot-api';
import { Logger } from './logger.js';

const logger = new Logger('TelegramBot');

class TelegramBotService {
  constructor() {
    this.token = process.env.TELEGRAM_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.isEnabled = !!(this.token && this.chatId);
    this.activeMonitors = new Map();
    
    if (this.isEnabled) {
      this.bot = new TelegramBot(this.token, { polling: false });
      console.log('✅ Telegram Bot inicializado');
    } else {
      console.log('⚠️ Telegram Bot em modo simulado (variáveis não configuradas)');
    }
  }

  /**
   * Envia sinal de trading formatado
   */
  async sendTradingSignal(signalData) {
    try {
      if (!this.isEnabled) {
        console.log('📱 [SIMULADO] Sinal enviado:', signalData.symbol);
        return true;
      }

      const message = this.formatTradingSignal(signalData);
      
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });

      console.log(`✅ Sinal enviado via Telegram: ${signalData.symbol}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar sinal:', error.message);
      return false;
    }
  }

  /**
   * Formata sinal de trading para Telegram
   */
  formatTradingSignal(signal) {
    const isLong = signal.trend === 'BULLISH';
    const direction = isLong ? 'COMPRA' : 'VENDA';
    const emoji = isLong ? '🟢' : '🔴';
    const animal = isLong ? '🐂' : '🐻';
    
    // Formata fatores-chave específicos e únicos
    const factors = this.generateSpecificFactors(signal, isLong);
    const factorsText = factors.map(f => `   • ${f}`).join('\n');

    // Calcula alvos baseados na direção
    const targets = signal.targets.map((target, index) => {
      const targetNum = index + 1;
      const emoji = targetNum === 6 ? '🌕' : `${targetNum}️⃣`;
      const label = targetNum === 6 ? 'Alvo 6 - Lua!' : `Alvo ${targetNum}`;
      return `${emoji} *${label}:* ${target.toFixed(2).replace('.', '․')}`;
    }).join('\n');

    // Determina regime visual
    const regimeEmoji = this.getRegimeEmoji(signal.regime);
    
    // Aviso de correlação Bitcoin se necessário
    let bitcoinWarning = '';
    if (signal.btcCorrelation && signal.btcCorrelation.alignment === 'AGAINST') {
      const btcTrend = signal.btcCorrelation.btcTrend === 'BULLISH' ? 'ALTA' : 'BAIXA';
      const operationType = isLong ? 'COMPRA' : 'VENDA';
      bitcoinWarning = `\n\n⚠️ *ATENÇÃO:* O Bitcoin está em tendência de *${btcTrend}*. Operações *${operationType}* podem ter risco elevado.`;
    }

    return `🚨 *LOBO PREMIUM #${signal.symbol.split('/')[0]} ${emoji} ${direction} ${animal}*

💰 *#${signal.symbol.split('/')[0]} Futures*
📊 *TEMPO GRÁFICO:* ${signal.timeframe}
🌐 *REGIME:* ${signal.regime} ${regimeEmoji}
📈 *Alavancagem sugerida:* 15x
🎯 *Probabilidade:* ${signal.probability.toFixed(3)}%

💡 *Interpretação:* ${this.getInterpretation(signal, isLong)}
🔍 *Fatores-chave:*
${factorsText}

⚡️ *Entrada:* ${signal.entry.toFixed(2).replace('.', '․')}

🎯 *ALVOS (15x):*
${targets}

🛑 *Stop Loss:* ${signal.stopLoss.toFixed(2).replace('.', '․')}

${bitcoinWarning}

👑 *Sinais Premium são 100% a favor da tendência e correlação com o Bitcoin*
⏰ ${new Date().toLocaleString('pt-BR')}`;
  }

  /**
   * Gera fatores específicos e únicos baseados no sinal
   */
  generateSpecificFactors(signal, isLong) {
    const factors = [];
    const indicators = signal.indicators || {};
    const patterns = signal.patterns || {};
    const btcCorrelation = signal.btcCorrelation || {};

    // RSI - específico por direção
    if (indicators.rsi !== undefined) {
      if (isLong && indicators.rsi < 30) {
        factors.push('RSI em sobrevenda favorável para compra');
      } else if (!isLong && indicators.rsi > 70) {
        factors.push('RSI em sobrecompra extrema (oportunidade de venda)');
      } else if (indicators.rsi < 40) {
        factors.push('RSI em zona de compra');
      } else if (indicators.rsi > 60) {
        factors.push('RSI em zona de venda');
      }
    }

    // MACD - específico por direção
    if (indicators.macd && indicators.macd.histogram !== undefined) {
      if (isLong && indicators.macd.histogram > 0) {
        factors.push('MACD com momentum bullish confirmado');
      } else if (!isLong && indicators.macd.histogram < 0) {
        factors.push('MACD com momentum bearish confirmado');
      } else if (indicators.macd.histogram > 0) {
        factors.push('MACD indicando força compradora');
      } else {
        factors.push('MACD indicando pressão vendedora');
      }
    }

    // Volume - específico por direção
    if (indicators.volume && indicators.volume.volumeRatio > 1.2) {
      if (isLong) {
        factors.push('Volume alto confirmando movimento de compra');
      } else {
        factors.push('Volume alto confirmando pressão vendedora');
      }
    } else if (indicators.volume) {
      factors.push('Volume moderado sustentando o movimento');
    }

    // Padrões - específico por tipo
    if (patterns.breakout) {
      if (patterns.breakout.type === 'BULLISH_BREAKOUT') {
        factors.push('Rompimento bullish de resistência confirmado');
      } else if (patterns.breakout.type === 'BEARISH_BREAKOUT') {
        factors.push('Rompimento bearish de suporte confirmado');
      }
    }

    if (patterns.candlestick && patterns.candlestick.length > 0) {
      const pattern = patterns.candlestick[0];
      if (pattern.bias === 'BULLISH') {
        factors.push(`Padrão ${pattern.type.toLowerCase()} detectado (bullish)`);
      } else if (pattern.bias === 'BEARISH') {
        factors.push(`Padrão ${pattern.type.toLowerCase()} detectado (bearish)`);
      }
    }

    // Divergência RSI
    if (indicators.rsiDivergence) {
      factors.push('Divergência RSI detectada (sinal de reversão)');
    }

    // Correlação Bitcoin - específico por alinhamento
    if (btcCorrelation.alignment === 'ALIGNED') {
      const btcTrend = btcCorrelation.btcTrend === 'BULLISH' ? 'bullish' : 'bearish';
      factors.push(`Alinhado com tendência ${btcTrend} do Bitcoin`);
    } else if (btcCorrelation.alignment === 'AGAINST') {
      factors.push('Operação contra tendência do Bitcoin (risco elevado)');
    }

    // Médias móveis
    if (indicators.ma21 && indicators.ma200) {
      if (isLong && indicators.ma21 > indicators.ma200) {
        factors.push('Médias móveis em configuração bullish');
      } else if (!isLong && indicators.ma21 < indicators.ma200) {
        factors.push('Médias móveis em configuração bearish');
      }
    }

    // Remove duplicatas e limita a 4 fatores principais
    const uniqueFactors = [...new Set(factors)];
    return uniqueFactors.slice(0, 4);
  }

  /**
   * Gera interpretação específica baseada no sinal
   */
  getInterpretation(signal, isLong) {
    const indicators = signal.indicators || {};
    
    // Interpretação baseada no indicador mais forte
    if (indicators.rsi < 25 && isLong) {
      return 'RSI em sobrevenda extrema favorável para compra';
    } else if (indicators.rsi > 75 && !isLong) {
      return 'RSI em sobrecompra extrema favorável para venda';
    } else if (indicators.macd && Math.abs(indicators.macd.histogram) > 0.001) {
      const direction = isLong ? 'compra' : 'venda';
      return `MACD com forte momentum favorável para ${direction}`;
    } else if (signal.btcCorrelation && signal.btcCorrelation.alignment === 'ALIGNED') {
      return 'Análise técnica alinhada com tendência do Bitcoin';
    } else {
      const direction = isLong ? 'compra' : 'venda';
      return `Análise técnica favorável para ${direction}`;
    }
  }

  /**
   * Obtém emoji do regime de mercado
   */
  getRegimeEmoji(regime) {
    switch (regime) {
      case 'BULL': return '🐂';
      case 'BEAR': return '🐻';
      case 'VOLATILE': return '⚡';
      default: return '⚖️';
    }
  }

  /**
   * Obtém descrição do regime de mercado
   */
  getRegimeDescription(regime) {
    switch (regime) {
      case 'BULL': return 'Mercado em alta';
      case 'BEAR': return 'Mercado em baixa';
      case 'VOLATILE': return 'Mercado volátil';
      default: return 'Mercado em condições normais';
    }
  }

  /**
   * Cria monitor para um símbolo
   */
  createMonitor(symbol, entry, targets, stopLoss, signalId, trend) {
    try {
      if (this.activeMonitors.has(symbol)) {
        console.log(`⚠️ Monitor já existe para ${symbol} - substituindo`);
        this.removeMonitor(symbol, 'REPLACED');
      }

      const monitor = {
        symbol,
        entry,
        targets: [...targets],
        originalTargets: [...targets],
        stopLoss,
        signalId,
        trend,
        startTime: new Date(),
        targetsHit: 0,
        status: 'ACTIVE',
        lastUpdate: new Date()
      };

      this.activeMonitors.set(symbol, monitor);
      console.log(`✅ Monitor criado para ${symbol} (${targets.length} alvos)`);
      
      return monitor;
    } catch (error) {
      console.error(`❌ Erro ao criar monitor para ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Remove monitor
   */
  removeMonitor(symbol, reason = 'COMPLETED') {
    if (this.activeMonitors.has(symbol)) {
      const monitor = this.activeMonitors.get(symbol);
      this.activeMonitors.delete(symbol);
      console.log(`🗑️ Monitor removido: ${symbol} (${reason})`);
      return monitor;
    }
    return null;
  }

  /**
   * Verifica se tem monitor ativo
   */
  hasActiveMonitor(symbol) {
    return this.activeMonitors.has(symbol);
  }

  /**
   * Obtém símbolos ativos
   */
  getActiveSymbols() {
    return Array.from(this.activeMonitors.keys());
  }

  /**
   * Inicia monitoramento de preços
   */
  async startPriceMonitoring(symbol, entry, targets, stopLoss, binanceService, signalData, app, adaptiveScoring) {
    try {
      console.log(`📊 Iniciando monitoramento de ${symbol}...`);
      
      const monitor = this.activeMonitors.get(symbol);
      if (!monitor) {
        console.error(`❌ Monitor não encontrado para ${symbol}`);
        return;
      }

      // Conecta WebSocket para monitoramento em tempo real
      await binanceService.connectWebSocket(symbol, '1m', async (candleData) => {
        try {
          if (!candleData.isClosed) return; // Só processa candles fechados
          
          const currentPrice = candleData.close;
          const currentMonitor = this.activeMonitors.get(symbol);
          
          if (!currentMonitor || currentMonitor.status !== 'ACTIVE') {
            console.log(`⏭️ Monitor inativo para ${symbol} - parando WebSocket`);
            binanceService.stopWebSocketForSymbol(symbol, '1m');
            return;
          }

          // Verifica stop loss
          const hitStopLoss = signal.trend === 'BULLISH' ? 
            currentPrice <= currentMonitor.stopLoss :
            currentPrice >= currentMonitor.stopLoss;

          if (hitStopLoss) {
            await this.handleStopLoss(symbol, currentPrice, currentMonitor, app);
            return;
          }

          // Verifica alvos
          await this.checkTargets(symbol, currentPrice, currentMonitor, app);

        } catch (error) {
          console.error(`❌ Erro no monitoramento ${symbol}:`, error.message);
        }
      });

    } catch (error) {
      console.error(`❌ Erro ao iniciar monitoramento ${symbol}:`, error.message);
      this.removeMonitor(symbol, 'ERROR');
    }
  }

  /**
   * Verifica se alvos foram atingidos
   */
  async checkTargets(symbol, currentPrice, monitor, app) {
    try {
      const isLong = monitor.trend === 'BULLISH';
      
      // Verifica se atingiu o próximo alvo
      const targetHit = isLong ? 
        currentPrice >= monitor.targets[0] :
        currentPrice <= monitor.targets[0];

      if (targetHit && monitor.targets.length > 0) {
        const targetNumber = monitor.originalTargets.length - monitor.targets.length + 1;
        const targetPrice = monitor.targets[0];
        
        // Remove alvo atingido
        monitor.targets.shift();
        monitor.targetsHit++;
        monitor.lastUpdate = new Date();

        // Calcula lucro
        const pnlPercent = isLong ? 
          ((targetPrice - monitor.entry) / monitor.entry) * 100 :
          ((monitor.entry - targetPrice) / monitor.entry) * 100;

        // Envia notificação
        await this.sendTargetHitNotification(symbol, targetNumber, targetPrice, pnlPercent);

        // Registra no performance tracker
        if (app.performanceTracker) {
          app.performanceTracker.recordTrade(symbol, pnlPercent, true);
        }

        // Se atingiu todos os alvos
        if (monitor.targets.length === 0) {
          await this.handleAllTargetsHit(symbol, monitor, app);
        } else {
          // Move stop loss para entrada após primeiro alvo (stop móvel)
          if (targetNumber === 1) {
            monitor.stopLoss = monitor.entry;
            await this.sendStopMovedNotification(symbol, monitor.entry);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Erro ao verificar alvos ${symbol}:`, error.message);
    }
  }

  /**
   * Trata stop loss atingido
   */
  async handleStopLoss(symbol, currentPrice, monitor, app) {
    try {
      const isLong = monitor.trend === 'BULLISH';
      const pnlPercent = isLong ?
        ((currentPrice - monitor.entry) / monitor.entry) * 100 :
        ((monitor.entry - currentPrice) / monitor.entry) * 100;

      // Registra resultado
      if (app.performanceTracker) {
        app.performanceTracker.recordTrade(symbol, pnlPercent, false);
        app.performanceTracker.updateSignalResult(symbol, monitor.targetsHit, pnlPercent, 'STOP_LOSS');
      }

      // Registra no sistema adaptativo
      if (app.adaptiveScoring) {
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, false, pnlPercent);
      }

      // Envia notificação
      await this.sendStopLossNotification(symbol, currentPrice, monitor, pnlPercent);

      // Remove monitor e para WebSocket
      this.removeMonitor(symbol, 'STOP_LOSS');
      app.binanceService.stopWebSocketForSymbol(symbol, '1m');

    } catch (error) {
      console.error(`❌ Erro ao tratar stop loss ${symbol}:`, error.message);
    }
  }

  /**
   * Trata todos os alvos atingidos
   */
  async handleAllTargetsHit(symbol, monitor, app) {
    try {
      const finalTarget = monitor.originalTargets[monitor.originalTargets.length - 1];
      const isLong = monitor.trend === 'BULLISH';
      const totalPnlPercent = isLong ?
        ((finalTarget - monitor.entry) / monitor.entry) * 100 :
        ((monitor.entry - finalTarget) / monitor.entry) * 100;

      // Registra resultado final
      if (app.performanceTracker) {
        app.performanceTracker.updateSignalResult(symbol, 6, totalPnlPercent, 'ALL_TARGETS');
      }

      // Registra no sistema adaptativo
      if (app.adaptiveScoring) {
        app.adaptiveScoring.recordTradeResult(symbol, monitor.indicators || {}, true, totalPnlPercent);
      }

      // Envia notificação de lua
      await this.sendAllTargetsHitNotification(symbol, monitor, totalPnlPercent);

      // Remove monitor e para WebSocket
      this.removeMonitor(symbol, 'ALL_TARGETS');
      app.binanceService.stopWebSocketForSymbol(symbol, '1m');

    } catch (error) {
      console.error(`❌ Erro ao tratar todos alvos ${symbol}:`, error.message);
    }
  }

  /**
   * Envia notificação de alvo atingido
   */
  async sendTargetHitNotification(symbol, targetNumber, targetPrice, pnlPercent) {
    try {
      const leveragedPnL = pnlPercent * 15; // Alavancagem 15x
      
      const message = `✅ *ALVO ${targetNumber} ATINGIDO #${symbol.split('/')[0]}*

🔍 *Alvo ${targetNumber} atingido no par #${symbol.split('/')[0]}*
💰 *Lucro atual:* +${leveragedPnL.toFixed(1)}% (Alv. 15×)
⚡️ *Posição parcial realizada*
📊 *Entrada:* ${targetPrice.toFixed(2).replace('.', '․')}
💵 *Preço do alvo:* ${targetPrice.toFixed(2).replace('.', '․')}
⏱️ *Tempo até o alvo:* ${this.calculateDuration(new Date())}
🛡️ *Stop ativado:* ${targetNumber === 1 ? 'no ponto de entrada' : 'stop móvel'}

💰 *Recomendação:* ${this.getTargetRecommendation(targetNumber)}

👑 *Sinais Premium são 100% a favor da tendência e correlação com o Bitcoin*`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      }
      
      console.log(`✅ Notificação alvo ${targetNumber} enviada: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar notificação alvo:`, error.message);
    }
  }

  /**
   * Envia notificação de stop loss
   */
  async sendStopLossNotification(symbol, currentPrice, monitor, pnlPercent) {
    try {
      const leveragedPnL = pnlPercent * 15;
      const duration = this.calculateDuration(monitor.startTime);
      
      let message;
      
      if (monitor.targetsHit === 0) {
        // Stop loss sem alvos atingidos
        message = `❌ *#${symbol.split('/')[0]} - OPERAÇÃO FINALIZADA* ❌

📊 *Resultado:* 🔴
⚡ *Alavancado (15x):* 🔴 ${leveragedPnL.toFixed(1)}%

📌 *Motivo:* STOP LOSS ATIVADO

📈 *Alvos atingidos:* Nenhum
🛑 *Stop loss:* ${currentPrice.toFixed(2).replace('.', '․')}
📅 *Duração:* ${duration}

💡 *GERENCIAMENTO DE RISCO:*
- Stop loss ativado sem alvos atingidos
- Perda limitada conforme estratégia
- Gestão de risco protegeu o capital total
- Aguarde próxima oportunidade
- Mantenha disciplina!

📊 *ANÁLISE:*
- Mercado se moveu contra nossa operação
- Stop loss protegeu de perdas maiores
- Próxima operação pode ser mais favorável

👑 Sinais Lobo Cripto
⏰ ${new Date().toLocaleString('pt-BR')}`;
      } else {
        // Stop loss após alguns alvos
        message = `❌ *#${symbol.split('/')[0]} - OPERAÇÃO FINALIZADA* ❌

📊 *Resultado:* 🔴
⚡ *Alavancado (15x):* 🔴 ${leveragedPnL.toFixed(1)}%

📌 *Motivo:* STOP LOSS ATIVADO APÓS ALVO ${monitor.targetsHit}

📈 *Alvos atingidos:* ${monitor.targetsHit}
🛑 *Stop loss:* ${currentPrice.toFixed(2).replace('.', '․')}
📅 *Duração:* ${duration}

💡 *GERENCIAMENTO DE RISCO:*
- Stop loss ativado após realização parcial no Alvo ${monitor.targetsHit}
- ${monitor.targetsHit > 0 ? '50% da posição foi realizada com lucro' : 'Perda limitada conforme estratégia'}
- Perda reduzida na posição restante
- Estratégia de proteção funcionou
- Aguarde próxima oportunidade

📊 *ANÁLISE:*
- Mercado reverteu após atingir o${monitor.targetsHit > 1 ? 's' : ''} primeiro${monitor.targetsHit > 1 ? 's' : ''} alvo${monitor.targetsHit > 1 ? 's' : ''}
- Realização parcial garantiu lucro na operação
- Stop móvel protegeu os ganhos parciais

👑 Sinais Lobo Cripto
⏰ ${new Date().toLocaleString('pt-BR')}`;
      }

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      }
      
      console.log(`❌ Stop loss enviado: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar stop loss:`, error.message);
    }
  }

  /**
   * Envia notificação de todos alvos atingidos
   */
  async sendAllTargetsHitNotification(symbol, monitor, totalPnlPercent) {
    try {
      const leveragedPnL = totalPnlPercent * 15;
      const duration = this.calculateDuration(monitor.startTime);
      
      const message = `🌕 *#${symbol.split('/')[0]} - OPERAÇÃO FINALIZADA* 🌕

📊 *Resultado:* 🟢 +${totalPnlPercent.toFixed(1)}%
⚡ *Alavancado (15x):* 🟢 +${leveragedPnL.toFixed(1)}%

📌 *Motivo:* TODOS OS ALVOS ATINGIDOS - LUA!

📈 *Alvos atingidos:* 6/6
🛑 *Stop loss:* ${monitor.stopLoss.toFixed(2).replace('.', '․')}
📅 *Duração:* ${duration}

👑 *Sinais Lobo Cripto*
⏰ ${new Date().toLocaleString('pt-BR')}`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      }
      
      console.log(`🌕 Lua enviada: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar lua:`, error.message);
    }
  }

  /**
   * Envia notificação de stop móvel
   */
  async sendStopMovedNotification(symbol, newStopPrice) {
    try {
      const message = `🛡️ *STOP MÓVEL ATIVADO #${symbol.split('/')[0]}*

✅ *Stop loss movido para ponto de entrada*
🛡️ *Novo stop:* ${newStopPrice.toFixed(2).replace('.', '․')}
💰 *Operação protegida contra perdas*

👑 *Gestão de risco ativa*`;

      if (this.isEnabled) {
        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      }
      
      console.log(`🛡️ Stop móvel enviado: ${symbol}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar stop móvel:`, error.message);
    }
  }

  /**
   * Calcula duração da operação
   */
  calculateDuration(startTime) {
    const now = new Date();
    const diff = now - startTime;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days} dias ${hours}h ${minutes}m`;
    } else {
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Obtém recomendação por alvo
   */
  getTargetRecommendation(targetNumber) {
    switch (targetNumber) {
      case 1: return 'Realize 50% da posição e mova o stop para o ponto de entrada';
      case 2: return 'Mantenha posição e monitore próximo alvo';
      case 3: return 'Considere realizar mais 25% da posição';
      case 4: return 'Posição em excelente lucro - mantenha disciplina';
      case 5: return 'Próximo do alvo final - prepare-se para realização total';
      case 6: return 'PARABÉNS! Todos os alvos atingidos!';
      default: return 'Continue seguindo a estratégia';
    }
  }
}

export default TelegramBotService;