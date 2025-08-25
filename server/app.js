/**
 * Bot Lobo Cripto - Sistema completo de trading
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import schedule from 'node-schedule';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuração de ambiente
dotenv.config();

// Importa serviços
import BinanceService from './services/binanceService.js';
import technicalAnalysis from './services/technicalAnalysis.js';
import PatternDetectionService from './services/patternDetection.js';
import SignalScoringService from './services/signalScoring.js';
import MachineLearningService from './services/machineLearning.js';
import TelegramBotService from './services/telegramBot.js';
import MarketAnalysisService from './services/marketAnalysis.js';
import BacktestingService from './services/backtesting.js';
import ChartGeneratorService from './services/chartGenerator.js';
import RiskManagementService from './services/riskManagement.js';
import PerformanceTrackerService from './services/performanceTracker.js';
import AdaptiveScoringService from './services/adaptiveScoring.js';
import AlertSystemService from './services/alertSystem.js';
import MacroEconomicService from './services/macroEconomicService.js';
import SocialSentimentService from './services/socialSentimentService.js';
import BitcoinCorrelationService from './services/bitcoinCorrelationService.js';
import MarketRegimeService from './services/marketRegimeService.js';

// Importa configurações
import { CRYPTO_SYMBOLS, TIMEFRAMES, TRADING_CONFIG, SCHEDULE_CONFIG } from './config/constants.js';

// Importa rotas
import binanceRoutes from './routes/binance.js';
import signalRoutes from './routes/signals.js';
import coinglassStatus from './routes/coinglassStatus.js';

// Configuração ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicialização dos serviços
const binanceService = new BinanceService();
const patternDetection = new PatternDetectionService();
const signalScoring = new SignalScoringService();
const machineLearning = new MachineLearningService();
const telegramBot = new TelegramBotService();
const marketAnalysis = new MarketAnalysisService(binanceService, technicalAnalysis);
const backtesting = new BacktestingService();
const chartGenerator = new ChartGeneratorService();
const riskManagement = new RiskManagementService();
const performanceTracker = new PerformanceTrackerService();
const adaptiveScoring = new AdaptiveScoringService();
const alertSystem = new AlertSystemService(telegramBot);
const macroEconomic = new MacroEconomicService();
const socialSentiment = new SocialSentimentService();
const bitcoinCorrelation = new BitcoinCorrelationService(binanceService, technicalAnalysis);
const marketRegimeService = new MarketRegimeService(binanceService, technicalAnalysis);

// Conecta adaptive scoring ao signal scoring
signalScoring.adaptiveScoring = adaptiveScoring;

// Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Adiciona serviços ao app para acesso global
app.binanceService = binanceService;
app.technicalAnalysis = technicalAnalysis;
app.patternDetection = patternDetection;
app.signalScoring = signalScoring;
app.machineLearning = machineLearning;
app.telegramBot = telegramBot;
app.marketAnalysis = marketAnalysis;
app.backtesting = backtesting;
app.chartGenerator = chartGenerator;
app.riskManagement = riskManagement;
app.performanceTracker = performanceTracker;
app.adaptiveScoring = adaptiveScoring;
app.alertSystem = alertSystem;
app.macroEconomic = macroEconomic;
app.socialSentiment = socialSentiment;
app.bitcoinCorrelation = bitcoinCorrelation;
app.marketRegimeService = marketRegimeService;

// Estado global
let isAnalyzing = false;
let lastAnalysisTime = null;
let analysisCount = 0;

/**
 * Função principal de análise de sinais
 */
export async function analyzeSignals() {
  if (isAnalyzing) {
    console.log('⏭️ Análise já em andamento - pulando...');
    return;
  }

  try {
    isAnalyzing = true;
    analysisCount++;
    lastAnalysisTime = new Date();
    
    console.log(`\n🚀 ===== ANÁLISE DE SINAIS #${analysisCount} =====`);
    console.log(`⏰ Iniciada em: ${lastAnalysisTime.toLocaleString('pt-BR')}`);
    console.log(`📊 Analisando ${CRYPTO_SYMBOLS.length} símbolos em ${TIMEFRAMES.length} timeframes`);

    let bestSignal = null;
    let bestScore = 0;
    let totalAnalyzed = 0;
    let validSignals = 0;

    // Analisa cada símbolo em cada timeframe
    for (const symbol of CRYPTO_SYMBOLS) {
      // Verifica se já tem monitor ativo
      if (telegramBot.hasActiveMonitor(symbol)) {
        console.log(`⏭️ ${symbol}: Monitor ativo - pulando análise`);
        continue;
      }

      for (const timeframe of TIMEFRAMES) {
        try {
          totalAnalyzed++;
          console.log(`\n🔍 ANALISANDO: ${symbol} ${timeframe} (${totalAnalyzed}/${CRYPTO_SYMBOLS.length * TIMEFRAMES.length})`);

          // Obtém dados históricos
          const data = await binanceService.getOHLCVData(symbol, timeframe, 200);
          
          if (!data || !data.close || data.close.length < 50) {
            console.log(`❌ ${symbol} ${timeframe}: Dados insuficientes (${data?.close?.length || 0} < 50)`);
            continue;
          }

          const currentPrice = data.close[data.close.length - 1];
          console.log(`💰 ${symbol}: Preço atual $${currentPrice.toFixed(8)}`);

          // Análise técnica
          const indicators = technicalAnalysis.calculateIndicators(data);
          if (!indicators || Object.keys(indicators).length === 0) {
            console.log(`❌ ${symbol} ${timeframe}: Falha nos indicadores`);
            continue;
          }

          // Detecção de padrões
          const patterns = patternDetection.detectPatterns(data);

          // Previsão ML
          const mlProbability = await machineLearning.predict(symbol, data, indicators);

          // Análise de correlação com Bitcoin
          const signalTrend = signalScoring.detectSignalTrend(indicators, patterns);
          const btcCorrelation = await bitcoinCorrelation.analyzeCorrelation(symbol, signalTrend, data);

          // Pontuação adaptativa
          const scoring = adaptiveScoring.calculateAdaptiveScore(
            data, indicators, patterns, mlProbability, signalTrend, symbol, btcCorrelation
          );
          
          // Define timeframe atual no scoring para análise contra-tendência
          signalScoring.setCurrentTimeframe(timeframe);

          console.log(`📊 ${symbol} ${timeframe}: Score ${scoring.totalScore.toFixed(1)}% (${scoring.isValid ? 'VÁLIDO' : 'INVÁLIDO'})`);

          if (scoring.isValid) {
            validSignals++;
            console.log(`✅ Sinal válido encontrado: ${symbol} ${timeframe} (${scoring.totalScore.toFixed(1)}%)`);
          }

          // Verifica se é o melhor sinal
          if (scoring.isValid && scoring.totalScore > bestScore) {
            // Verifica gestão de risco
            const riskCheck = riskManagement.canOpenTrade(symbol, telegramBot.activeMonitors);
            
            if (riskCheck.allowed) {
              console.log(`🔍 QUALIDADE DO SINAL ${symbol}:`);
              console.log(`   📊 Score: ${scoring.totalScore.toFixed(1)}%`);
              console.log(`   ✅ Confirmações: ${scoring.confirmations || 0}`);
              console.log(`   🎯 Filtros: ${scoring.details.qualityCheck?.reason || 'Aprovado'}`);
              
              bestSignal = {
                symbol,
                timeframe,
                entry: currentPrice,
                probability: scoring.totalScore,
                totalScore: scoring.totalScore,
                trend: signalTrend,
                indicators,
                patterns,
                mlProbability,
                isMLDriven: scoring.isMLDriven,
                adaptiveDetails: scoring.details,
                bitcoinCorrelation: btcCorrelation,
                signalId: `${symbol.replace('/', '')}_${Date.now()}`
              };
              bestScore = scoring.totalScore;
              console.log(`🏆 NOVO MELHOR SINAL: ${symbol} ${timeframe} (${scoring.totalScore.toFixed(1)}%)`);
            } else {
              console.log(`🚫 ${symbol}: Bloqueado pela gestão de risco - ${riskCheck.reason}`);
            }
          }

          // Pausa para rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error) {
          console.error(`❌ Erro ao analisar ${symbol} ${timeframe}:`, error.message);
          continue;
        }
      }
    }

    console.log(`\n📊 RESUMO DA ANÁLISE #${analysisCount}:`);
    console.log(`   🔍 Total analisado: ${totalAnalyzed}`);
    console.log(`   ✅ Sinais válidos: ${validSignals}`);
    console.log(`   🏆 Melhor score: ${bestScore.toFixed(1)}%`);
    console.log(`   📊 Operações ativas: ${telegramBot.activeMonitors.size}`);

    // Processa melhor sinal
    if (bestSignal) {
      console.log(`\n🎯 PROCESSANDO MELHOR SINAL: ${bestSignal.symbol} ${bestSignal.timeframe}`);
      await processBestSignal(bestSignal);
    } else {
      console.log(`\n⚠️ Nenhum sinal válido encontrado nesta análise`);
      console.log(`💡 Aguardando próxima análise em 2 horas...`);
    }

  } catch (error) {
    console.error('❌ ERRO CRÍTICO na análise de sinais:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    isAnalyzing = false;
    console.log(`✅ Análise #${analysisCount} concluída em ${new Date().toLocaleString('pt-BR')}\n`);
  }
}

/**
 * Processa o melhor sinal encontrado
 */
async function processBestSignal(signal) {
  try {
    console.log(`\n🎯 ===== PROCESSANDO SINAL ${signal.symbol} =====`);
    
    // Calcula níveis de trading
    const levels = signalScoring.calculateTradingLevels(signal.entry, signal.trend);
    
    console.log(`💰 NÍVEIS CALCULADOS:`);
    console.log(`   🎯 Entrada: $${levels.entry.toFixed(8)}`);
    console.log(`   🎯 Alvos: ${levels.targets.map(t => '$' + t.toFixed(8)).join(', ')}`);
    console.log(`   🛑 Stop: $${levels.stopLoss.toFixed(8)}`);
    console.log(`   📊 R/R: ${levels.riskRewardRatio.toFixed(2)}:1`);

    // Prepara dados do sinal
    const signalData = {
      ...signal,
      ...levels,
      timestamp: new Date().toISOString()
    };

    // Registra sinal
    const signalId = performanceTracker.recordSignal(signalData);
    signalData.signalId = signalId;

    // Gera gráfico
    const chartData = await chartGenerator.generatePriceChart(
      signal.symbol, 
      { close: [signal.entry], timestamp: [Date.now()], volume: [0] }, 
      signal.indicators, 
      signal.patterns, 
      signalData
    );

    console.log(`📊 VERIFICAÇÃO FINAL ${signal.symbol}: Monitor ativo = ${telegramBot.hasActiveMonitor(signal.symbol)}`);

    // Cria monitor ANTES de enviar sinal
    const monitor = telegramBot.createMonitor(
      signal.symbol, 
      levels.entry, 
      levels.targets, 
      levels.stopLoss, 
      signalId,
      signal.trend
    );

    if (!monitor) {
      console.error(`❌ Falha ao criar monitor para ${signal.symbol}`);
      return;
    }

    // Envia sinal
    const sendResult = await sendSignalWithRegime(signalData, marketRegimeService.getCurrentRegime());
    console.log(`📤 Resultado do envio para ${signal.symbol}: ${sendResult ? 'SUCESSO' : 'FALHA'}`);

    if (sendResult) {
      console.log(`✅ Sinal processado com sucesso para ${signal.symbol}`);
      
      // Inicia monitoramento em tempo real
      await telegramBot.startPriceMonitoring(
        signal.symbol, 
        levels.entry, 
        levels.targets, 
        levels.stopLoss, 
        binanceService, 
        signalData, 
        app, 
        adaptiveScoring
      );
      
      console.log(`📤 Sinal enviado e monitoramento iniciado para ${signal.symbol}`);
      console.log(`✅ Sinal enviado: ${signal.symbol} ${signal.timeframe} (${signal.probability.toFixed(1)}%)`);
    } else {
      // Remove monitor se envio falhou
      telegramBot.removeMonitor(signal.symbol, 'SEND_FAILED');
      console.error(`❌ Falha no envio - monitor removido para ${signal.symbol}`);
    }

  } catch (error) {
    console.error(`❌ Erro ao processar sinal ${signal.symbol}:`, error.message);
    console.error('Stack trace:', error.stack);
    
    // Remove monitor em caso de erro
    telegramBot.removeMonitor(signal.symbol, 'ERROR');
  }
}

/**
 * Envia sinal com o regime de mercado atual
 */
async function sendSignalWithRegime(signal, regime) {
  try {
    return await telegramBot.sendTradingSignal(signal, regime);
  } catch (error) {
    console.error('Erro ao enviar sinal com regime:', error);
    return false;
  }
}

/**
 * Análise de sentimento do mercado
 */
async function analyzeMarketSentiment() {
  try {
    console.log('\n🌍 ===== ANÁLISE DE SENTIMENTO =====');
    
    const sentiment = await marketAnalysis.analyzeMarketSentiment();
    
    if (sentiment) {
      await telegramBot.sendMarketSentiment(sentiment);
      console.log(`✅ Sentimento enviado: ${sentiment.overall} (F&G: ${sentiment.fearGreedIndex})`);
      
      // Verifica condições para alertas
      await alertSystem.checkMarketConditions(sentiment);
    }

  } catch (error) {
    console.error('❌ Erro na análise de sentimento:', error.message);
  }
}

/**
 * Envia relatório semanal se necessário
 */
async function checkWeeklyReport() {
  try {
    if (performanceTracker.shouldSendWeeklyReport()) {
      console.log('\n📊 ===== RELATÓRIO SEMANAL =====');
      
      const report = performanceTracker.generateWeeklyReport();
      
      if (report.hasData) {
        let message = `📊 *RELATÓRIO SEMANAL DE SINAIS LOBO PREMIUM*\n\n`;
        message += `📅 *Período:* ${report.period.start.toLocaleDateString('pt-BR')} - ${report.period.end.toLocaleDateString('pt-BR')}\n\n`;
        message += `🎯 *Resumo:*\n`;
        message += `   • Sinais: ${report.summary.totalSignals}\n`;
        message += `   • Taxa de acerto: ${report.summary.winRate}%\n`;
        message += `   • Lucro total: ${report.summary.totalPnL}% (Alav. 15x)\n`;
        message += `   • Média por trade: ${report.summary.avgPnL}% (Alav. 15x)\n\n`;
        
        if (report.mlPerformance.signals > 0) {
          message += `🤖 *Machine Learning:*\n`;
          message += `   • Sinais ML: ${report.mlPerformance.signals} (${report.mlPerformance.percentage}%)\n`;
          message += `   • Taxa ML: ${report.mlPerformance.winRate}%\n\n`;
        }
        
        if (report.insights.length > 0) {
          message += `💡 *Insights:*\n`;
          report.insights.forEach(insight => {
            message += `   • ${insight}\n`;
          });
          message += `\n`;
        }
        
        message += `⚡️ *Nota:* Resultados calculados com alavancagem 15x\n`;
        message += `📊 *Frequência:* Relatório enviado semanalmente aos domingos\n\n`;
        message += `👑 Sinais Lobo Cripto`;
        
        if (telegramBot.isEnabled) {
          await telegramBot.bot.sendMessage(telegramBot.chatId, message, { parse_mode: 'Markdown' });
        }
        
        performanceTracker.markWeeklyReportSent();
        console.log('✅ Relatório semanal enviado');
      }
    }
  } catch (error) {
    console.error('❌ Erro no relatório semanal:', error.message);
  }
}

// ===== ROTAS DA API =====

// Status do bot
app.get('/api/status', (req, res) => {
  try {
    const status = {
      status: 'running',
      timestamp: new Date().toISOString(),
      activeMonitors: telegramBot.activeMonitors.size,
      isTraining: machineLearning.isTraining(),
      activeSymbols: telegramBot.getActiveSymbols(),
      lastAnalysis: lastAnalysisTime,
      analysisCount: analysisCount,
      machineLearning: machineLearning.getTrainingStats(),
      adaptiveStats: {
        marketRegime: marketRegimeService.getCurrentRegime(),
        blacklistedSymbols: adaptiveScoring.getBlacklistedSymbols().length,
        indicatorPerformance: Object.keys(adaptiveScoring.getIndicatorPerformanceReport()).length
      }
    };
    res.json(status);
  } catch (error) {
    console.error('Erro na rota /api/status:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Últimos sinais
app.get('/api/signals/latest', (req, res) => {
  try {
    const performance = performanceTracker.generatePerformanceReport();
    const signals = performance.recentSignals || [];
    res.json(signals);
  } catch (error) {
    console.error('Erro na rota /api/signals/latest:', error.message);
    res.json([]);
  }
});

// Sentimento do mercado
app.get('/api/market/sentiment', async (req, res) => {
  try {
    const sentiment = await marketAnalysis.analyzeMarketSentiment();
    res.json(sentiment);
  } catch (error) {
    console.error('Erro na rota /api/market/sentiment:', error.message);
    res.status(500).json({ error: 'Erro ao obter sentimento do mercado' });
  }
});

// Dados macroeconômicos
app.get('/api/macro/data', async (req, res) => {
  try {
    const macroData = await macroEconomic.getMacroEconomicData();
    res.json(macroData);
  } catch (error) {
    console.error('Erro na rota /api/macro/data:', error.message);
    res.status(500).json({ error: 'Erro ao obter dados macro' });
  }
});

// Resultados de backtesting
app.get('/api/backtest/results', (req, res) => {
  try {
    const report = backtesting.generateReport();
    const bestPerformers = backtesting.getBestPerformers();
    
    res.json({
      report,
      bestPerformers
    });
  } catch (error) {
    console.error('Erro na rota /api/backtest/results:', error.message);
    res.json({ report: 'Erro ao gerar relatório', bestPerformers: [] });
  }
});

// Executar backtesting
app.post('/api/backtest/run/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`🧪 Executando backtesting para ${symbol}...`);
    
    const data = await binanceService.getOHLCVData(symbol, '1h', 1000);
    
    if (data && data.close && data.close.length >= 500) {
      const result = await backtesting.runBacktest(symbol, data, technicalAnalysis, signalScoring, machineLearning);
      res.json(result);
    } else {
      res.status(400).json({ error: 'Dados insuficientes para backtesting' });
    }
  } catch (error) {
    console.error(`Erro no backtesting de ${req.params.symbol}:`, error.message);
    res.status(500).json({ error: 'Erro no backtesting' });
  }
});

// Alertas de volatilidade
app.get('/api/volatility/alerts', async (req, res) => {
  try {
    const alerts = await marketAnalysis.detectHighVolatility();
    res.json(alerts || []);
  } catch (error) {
    console.error('Erro na rota /api/volatility/alerts:', error.message);
    res.json([]);
  }
});

// Teste do Telegram
app.post('/api/telegram/test', async (req, res) => {
  try {
    if (!telegramBot.isEnabled) {
      return res.status(400).json({ error: 'Telegram não configurado' });
    }

    const testSignal = {
      symbol: 'BTC/USDT',
      entry: 95000,
      targets: [96425, 97850, 99275, 100700, 102125, 103550],
      stopLoss: 90725,
      probability: 85,
      trend: 'BULLISH',
      timeframe: '1h'
    };

    await telegramBot.sendTradingSignal(testSignal);
    res.json({ success: true, message: 'Sinal de teste enviado' });
  } catch (error) {
    console.error('Erro no teste do Telegram:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Rota catch-all para React
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Rotas
app.use('/api/binance', binanceRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/coinglass', coinglassStatus);

// ===== AGENDAMENTO =====

// Análise de sinais a cada 2 horas
schedule.scheduleJob(SCHEDULE_CONFIG.SIGNAL_ANALYSIS, () => {
  console.log('\n⏰ Agendamento: Iniciando análise de sinais...');
  analyzeSignals();
});

// Análise de sentimento a cada 12 horas
schedule.scheduleJob(SCHEDULE_CONFIG.MARKET_SENTIMENT, () => {
  console.log('\n⏰ Agendamento: Iniciando análise de sentimento...');
  analyzeMarketSentiment();
});

// Relatório semanal (verifica todo domingo às 20h)
schedule.scheduleJob('0 20 * * 0', () => {
  console.log('\n⏰ Agendamento: Verificando relatório semanal...');
  checkWeeklyReport();
});

// Cleanup de WebSockets órfãos a cada 5 minutos
setInterval(() => {
  try {
    binanceService.cleanupOrphanedWebSockets();
  } catch (error) {
    console.error('Erro no cleanup de WebSockets:', error.message);
  }
}, 5 * 60 * 1000);

// ===== INICIALIZAÇÃO =====

async function initializeMarketRegime() {
  try {
    console.log('🌐 Inicializando serviço de regime de mercado...');
    const regime = await marketRegimeService.identifyMarketRegime();
    console.log(`✅ Regime de mercado inicial: ${regime}`);
    
    // Atualiza o regime a cada hora
    setInterval(async () => {
      await marketRegimeService.identifyMarketRegime();
    }, 60 * 60 * 1000); // A cada hora
    
    return regime;
  } catch (error) {
    console.error('❌ Erro ao inicializar regime de mercado:', error);
    return 'NORMAL';
  }
}

async function startBot() {
  try {
    console.log('\n🚀 ===== INICIANDO BOT LOBO CRIPTO =====');
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);
    
    // Verifica conectividade com Binance
    const serverTime = await binanceService.getServerTime();
    console.log(`✅ Binance conectado - Server time: ${new Date(serverTime).toLocaleString('pt-BR')}`);
    
    // Inicializa Machine Learning
    await machineLearning.initialize();
    
    // Verifica Telegram
    if (telegramBot.isEnabled) {
      console.log('✅ Telegram Bot ativo');
    } else {
      console.log('⚠️ Telegram Bot em modo simulado');
    }
    
    console.log(`📊 Monitorando ${CRYPTO_SYMBOLS.length} símbolos`);
    console.log(`⏰ Análise automática a cada 2 horas`);
    console.log(`🎯 Threshold mínimo: ${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY}%`);
    
    await initializeMarketRegime();
    
    // Executa primeira análise após 30 segundos
    setTimeout(() => {
      console.log('\n🎯 Executando primeira análise...');
      analyzeSignals();
    }, 30000);
    
    console.log('\n✅ Bot Lobo Cripto iniciado com sucesso!');
    
  } catch (error) {
    console.error('❌ ERRO CRÍTICO na inicialização:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Recebido SIGINT - Encerrando bot...');
  
  try {
    // Para todas as conexões WebSocket
    binanceService.closeAllWebSockets();
    
    // Para agendamentos
    schedule.gracefulShutdown();
    
    console.log('✅ Bot encerrado graciosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro no shutdown:', error.message);
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Recebido SIGTERM - Encerrando bot...');
  
  try {
    binanceService.closeAllWebSockets();
    schedule.gracefulShutdown();
    console.log('✅ Bot encerrado graciosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro no shutdown:', error.message);
    process.exit(1);
  }
});

// Inicia servidor Express
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  startBot();
});

export default app;