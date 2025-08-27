/**
 * Bot Lobo Cripto - Sistema completo de trading
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import schedule from 'node-schedule';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

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

import { CRYPTO_SYMBOLS, TIMEFRAMES, TRADING_CONFIG, SCHEDULE_CONFIG } from './config/constants.js';

import binanceRoutes from './routes/binance.js';
import signalRoutes from './routes/signals.js';
import systemRoutes from './routes/system.js';
import notificationRoutes from './routes/notifications.js';

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
const bitcoinCorrelation = new BitcoinCorrelationService(binanceService);
const marketRegimeService = new MarketRegimeService(binanceService);

signalScoring.adaptiveScoring = adaptiveScoring;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

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

let isAnalyzing = false;
let lastAnalysisTime = null;
let analysisCount = 0;

export async function analyzeSignals() {
  if (isAnalyzing) {
    console.log('⏭️ Análise já em andamento - pulando...');
    return;
  }

  try {
    isAnalyzing = true;
    analysisCount++;
    lastAnalysisTime = new Date();
    
    console.log(`\n🚀 ANÁLISE #${analysisCount} - ${lastAnalysisTime.toLocaleString('pt-BR')}`);
    console.log(`📊 ${CRYPTO_SYMBOLS.length} símbolos x ${TIMEFRAMES.length} timeframes`);

    let bestSignal = null;
    let bestScore = 0;
    let totalAnalyzed = 0;
    let validSignals = 0;
    let errors = [];

    for (const symbol of CRYPTO_SYMBOLS) {
      if (telegramBot.hasActiveMonitor(symbol)) {
        console.log(`⏭️ ${symbol}: Monitor ativo`);
        continue;
      }

      for (const timeframe of TIMEFRAMES) {
        const logPrefix = `[${symbol} ${timeframe}]`;
        totalAnalyzed++;
        
        try {
          const data = await binanceService.getOHLCVData(symbol, timeframe, 200);
          if (!data?.close?.length || data.close.length < 50) {
            throw new Error(`Dados insuficientes (${data?.close?.length || 0})`);
          }

          const indicators = await technicalAnalysis.calculateIndicators(data, symbol, timeframe);
          if (!indicators || Object.keys(indicators).length === 0) {
            throw new Error('Falha nos indicadores');
          }

          const patterns = patternDetection.detectPatterns(data);
          const mlProbability = await machineLearning.predict(symbol, data, indicators).catch(() => 0);
          
          const signalTrend = signalScoring.detectSignalTrend(indicators, patterns);
          const btcCorrelation = await bitcoinCorrelation.analyzeCorrelation(symbol, signalTrend, data).catch(() => ({}));
          
          signalScoring.setCurrentTimeframe(timeframe);
          const scoring = adaptiveScoring.calculateAdaptiveScore(
            data, indicators, patterns, mlProbability, signalTrend, symbol, btcCorrelation
          );

          console.log(`📊 ${logPrefix} Score: ${scoring.totalScore.toFixed(1)}% (${scoring.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'})`);

          if (scoring.isValid) {
            validSignals++;
            if (scoring.totalScore > bestScore) {
              const riskCheck = riskManagement.canOpenTrade(symbol, telegramBot.activeMonitors);
              if (riskCheck.allowed) {
                bestSignal = {
                  symbol,
                  timeframe,
                  entry: data.close[data.close.length - 1],
                  probability: scoring.totalScore,
                  trend: signalTrend,
                  indicators,
                  patterns,
                  btcCorrelation,
                  regime: adaptiveScoring.marketRegime,
                  riskCheck,
                  timestamp: new Date()
                };
                bestScore = scoring.totalScore;
                console.log(`✅ ${logPrefix} NOVO MELHOR SINAL (${bestScore.toFixed(1)}%)`);
              }
            }
          }
          
        } catch (error) {
          errors.push(`${symbol} ${timeframe}: ${error.message}`);
          console.error(`❌ ${logPrefix} ${error.message}`);
        }
      }
    }

    console.log(`\n📊 RESUMO #${analysisCount}:`);
    console.log(`✅ ${validSignals} sinais válidos`);
    console.log(`❌ ${errors.length} erros`);

    if (bestSignal) {
      console.log(`\n🎯 MELHOR SINAL: ${bestSignal.symbol} ${bestSignal.timeframe} (${bestSignal.probability.toFixed(1)}%)`);
      await processBestSignal(bestSignal);
    } else {
      console.log('\nℹ️ Nenhum sinal válido encontrado');
    }

  } catch (error) {
    console.error('❌ ERRO NA ANÁLISE:', error);
  } finally {
    isAnalyzing = false;
    console.log(`\n🏁 Análise #${analysisCount} concluída`);
  }
}

async function processBestSignal(signal) {
  try {
    console.log(`\n🎯 ===== PROCESSANDO SINAL ${signal.symbol} =====`);
    
    const levels = signalScoring.calculateTradingLevels(signal.entry, signal.trend);
    
    console.log(`💰 NÍVEIS CALCULADOS:`);
    console.log(`   🎯 Entrada: $${levels.entry.toFixed(8)}`);
    console.log(`   🎯 Alvos: ${levels.targets.map(t => '$' + t.toFixed(8)).join(', ')}`);
    console.log(`   🛑 Stop: $${levels.stopLoss.toFixed(8)}`);

    const signalData = {
      ...signal,
      ...levels,
      timestamp: new Date().toISOString()
    };

    const signalId = performanceTracker.recordSignal(signalData);
    signalData.signalId = signalId;

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

    const sendResult = await telegramBot.sendTradingSignal(signalData);
    console.log(`📤 Resultado do envio para ${signal.symbol}: ${sendResult ? 'SUCESSO' : 'FALHA'}`);

    if (sendResult) {
      console.log(`✅ Sinal processado com sucesso para ${signal.symbol}`);
      
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
      
      console.log(`✅ Sinal enviado: ${signal.symbol} ${signal.timeframe} (${signal.probability.toFixed(1)}%)`);
    } else {
      telegramBot.removeMonitor(signal.symbol, 'SEND_FAILED');
      console.error(`❌ Falha no envio - monitor removido para ${signal.symbol}`);
    }

  } catch (error) {
    console.error(`❌ Erro ao processar sinal ${signal.symbol}:`, error.message);
    telegramBot.removeMonitor(signal.symbol, 'ERROR');
  }
}

async function analyzeMarketSentiment() {
  try {
    console.log('\n🌍 ===== ANÁLISE DE SENTIMENTO =====');
    
    const sentiment = await marketAnalysis.analyzeMarketSentiment();
    
    if (sentiment) {
      console.log(`✅ Sentimento analisado: ${sentiment.overall} (F&G: ${sentiment.fearGreedIndex})`);
      await alertSystem.checkMarketConditions(sentiment);
    }

  } catch (error) {
    console.error('❌ Erro na análise de sentimento:', error.message);
  }
}

// ===== ROTAS DA API =====

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

app.get('/api/market/sentiment', async (req, res) => {
  try {
    const sentiment = await Promise.race([
      marketAnalysis.analyzeMarketSentiment(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na análise de sentimento')), 15000)
      )
    ]);
    res.json(sentiment);
  } catch (error) {
    console.error('Erro na rota /api/market/sentiment:', error.message);
    
    const fallbackSentiment = {
      overall: 'NEUTRO',
      fearGreedIndex: 50,
      fearGreedLabel: 'Neutro',
      isRealFearGreed: false,
      totalVolume: 0,
      volatility: 2,
      assetsUp: 35,
      assetsDown: 35,
      volumeVsAverage: 1,
      analysis: ['Dados temporariamente indisponíveis - usando fallback'],
      timestamp: new Date().toISOString()
    };
    
    res.json(fallbackSentiment);
  }
});

app.get('/api/macro/data', async (req, res) => {
  try {
    const macroData = await macroEconomic.getMacroEconomicData();
    res.json(macroData);
  } catch (error) {
    console.error('Erro na rota /api/macro/data:', error.message);
    res.status(500).json({ error: 'Erro ao obter dados macro' });
  }
});

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

app.get('/api/volatility/alerts', async (req, res) => {
  try {
    const alerts = await marketAnalysis.detectHighVolatility();
    res.json(alerts || []);
  } catch (error) {
    console.error('Erro na rota /api/volatility/alerts:', error.message);
    res.json([]);
  }
});

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.use('/api/binance', binanceRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/notifications', notificationRoutes);

schedule.scheduleJob(SCHEDULE_CONFIG.SIGNAL_ANALYSIS, () => {
  console.log('\n⏰ Agendamento: Iniciando análise de sinais...');
  analyzeSignals();
});

schedule.scheduleJob(SCHEDULE_CONFIG.MARKET_SENTIMENT, () => {
  console.log('\n⏰ Agendamento: Iniciando análise de sentimento...');
  analyzeMarketSentiment();
});

setInterval(() => {
  try {
    binanceService.cleanupOrphanedWebSockets();
  } catch (error) {
    console.error('Erro no cleanup de WebSockets:', error.message);
  }
}, 5 * 60 * 1000);

async function startBot() {
  try {
    console.log('\n🚀 ===== INICIANDO BOT LOBO CRIPTO =====');
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);
    
    const serverTime = await binanceService.getServerTime();
    const formattedTime = serverTime ? new Date(parseInt(serverTime)).toLocaleString('pt-BR') : 'Não disponível';
    console.log(`✅ Binance conectado - Server time: ${formattedTime}`);
    
    if (!machineLearning.isInitialized) {
      await machineLearning.initialize();
    } else {
      console.log('✅ Machine Learning já inicializado');
    }
    
    if (telegramBot.isEnabled) {
      console.log('✅ Telegram Bot ativo');
    } else {
      console.log('⚠️ Telegram Bot em modo simulado');
    }
    
    console.log(`📊 Monitorando ${CRYPTO_SYMBOLS.length} símbolos`);
    console.log(`⏰ Análise automática a cada 2 horas`);
    console.log(`🎯 Threshold mínimo: ${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY}%`);
    
    setTimeout(() => {
      console.log('\n🎯 Executando primeira análise...');
      analyzeSignals();
    }, 30000);
    
    console.log('\n✅ Bot Lobo Cripto iniciado com sucesso!');
    
  } catch (error) {
    console.error('❌ ERRO CRÍTICO na inicialização:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n🛑 Recebido SIGINT - Encerrando bot...');
  
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

app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  startBot();
});

export default app;