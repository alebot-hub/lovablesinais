/**
 * Bot Lobo Cripto - Sistema completo de trading
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import schedule from 'node-schedule';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

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
const socialSentiment = new SocialSentimentService();
const bitcoinCorrelation = new BitcoinCorrelationService(binanceService);
const marketRegimeService = new MarketRegimeService(binanceService);

signalScoring.adaptiveScoring = adaptiveScoring;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de logging para debug
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

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
app.socialSentiment = socialSentiment;
app.bitcoinCorrelation = bitcoinCorrelation;
app.marketRegimeService = marketRegimeService;

let isAnalyzing = false;
let lastAnalysisTime = null;
let analysisCount = 0;
let lastSignalTime = null;
let signalsThisHour = 0;

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

    const allSignals = []; // Coleta TODOS os sinais válidos
    let totalAnalyzed = 0;
    let validSignals = 0;
    let errors = [];
    
    // Verifica se deve enviar o melhor sinal da hora
    const hourlyCheck = checkIfShouldSendBestSignal();
    const currentThreshold = hourlyCheck.shouldSend ? hourlyCheck.threshold : TRADING_CONFIG.MIN_SIGNAL_PROBABILITY;
    
    if (hourlyCheck.shouldSend) {
      console.log(`🎯 MODO SELEÇÃO DO MELHOR: Threshold ${currentThreshold}% (${hourlyCheck.reason})`);
    } else {
      console.log(`🎯 MODO PADRÃO: Threshold ${currentThreshold}% (aguardando horário de envio)`);
    }

    for (const symbol of CRYPTO_SYMBOLS) {
      if (telegramBot.hasActiveMonitor(symbol)) {
        console.log(`⏭️ ${symbol}: Monitor ativo`);
        continue;
      }

      for (const timeframe of TIMEFRAMES) {
        const logPrefix = `[${symbol} ${timeframe}]`;
        totalAnalyzed++;
        
        try {
          console.log(`${logPrefix} 📊 Detectando tendência do sinal...`);
          console.log(`🔍 ${logPrefix} Iniciando análise...`);
        
          // Log da correlação com Bitcoin
          const btcCorrelation = await bitcoinCorrelation.analyzeCorrelation(symbol, 'BULLISH', {}).catch(() => ({}));
          if (btcCorrelation.btcTrend) {
            console.log(`${logPrefix} ₿ Bitcoin: ${btcCorrelation.btcTrend} (força: ${btcCorrelation.btcStrength || 0})`);
            console.log(`${logPrefix} 🔗 Alinhamento: ${btcCorrelation.alignment || 'NEUTRAL'}`);
          }
          
          const signalTrend = 'BULLISH';
          console.log(`${logPrefix} 🎯 Tendência detectada: ${signalTrend}`);
          
          // Timeout para evitar travamentos
          const analysisPromise = analyzeSymbolTimeframe(symbol, timeframe, logPrefix);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout na análise')), 30000)
          );
          
          const result = await Promise.race([analysisPromise, timeoutPromise]);
          
          if (result && result.isValid) {
            validSignals++;
            if (result.totalScore >= currentThreshold) {
              const riskCheck = riskManagement.canOpenTrade(symbol, telegramBot.activeMonitors);
              if (riskCheck.allowed) {
                const signal = {
                  symbol,
                  timeframe,
                  entry: result.entry,
                  probability: result.totalScore,
                  trend: result.trend,
                  indicators: result.indicators,
                  patterns: result.patterns,
                  btcCorrelation: result.btcCorrelation,
                  regime: adaptiveScoring.marketRegime,
                  riskCheck,
                  timestamp: new Date()
                };
                allSignals.push(signal);
                console.log(`✅ ${logPrefix} SINAL VÁLIDO COLETADO (${result.totalScore.toFixed(1)}%)`);
              }
            }
          }
          
          console.log(`✅ ${logPrefix} Análise concluída`);
          
        } catch (error) {
          errors.push(`${symbol} ${timeframe}: ${error.message}`);
          console.error(`❌ ${logPrefix} ${error.message}`);
        }
      }
    }

    console.log(`\n📊 RESUMO #${analysisCount}:`);
    console.log(`✅ ${validSignals} sinais válidos encontrados`);
    console.log(`🎯 ${allSignals.length} sinais coletados para seleção`);
    console.log(`❌ ${errors.length} erros`);

    // Seleciona o MELHOR sinal se deve enviar nesta hora
    if (hourlyCheck.shouldSend && allSignals.length > 0) {
      // Ordena por qualidade (score + fatores de qualidade)
      const bestSignal = selectBestQualitySignal(allSignals);
      const bestSignal = selectBestQualitySignal(allSignals);
      
      console.log(`\n🏆 MELHOR SINAL SELECIONADO: ${bestSignal.symbol} ${bestSignal.timeframe} (${bestSignal.probability.toFixed(1)}%)`);
      console.log(`📊 Selecionado entre ${allSignals.length} sinais válidos`);
      console.log(`🎯 Threshold usado: ${currentThreshold}% (${hourlyCheck.reason})`);
      
      await processBestSignal(bestSignal);
      
      // Registra sinal enviado
      lastSignalTime = new Date();
      signalsThisHour++;
    } else if (hourlyCheck.shouldSend) {
      console.log(`\n⚠️ NENHUM SINAL ENCONTRADO para envio (threshold: ${currentThreshold}%)`);
      console.log(`📊 ${validSignals} sinais válidos, mas nenhum atingiu o threshold mínimo`);
    } else {
      console.log(`\n⏰ AGUARDANDO HORÁRIO DE ENVIO (${allSignals.length} sinais coletados)`);
      if (allSignals.length > 0) {
        const topSignal = allSignals.sort((a, b) => b.probability - a.probability)[0];
        console.log(`🎯 Melhor sinal atual: ${topSignal.symbol} (${topSignal.probability.toFixed(1)}%) - aguardando horário`);
      }
    }

  } catch (error) {
    console.error('❌ ERRO NA ANÁLISE:', error);
  } finally {
    isAnalyzing = false;
    console.log(`\n🏁 Análise #${analysisCount} concluída`);
  }
}

/**
 * Verifica se deve enviar o melhor sinal da hora (qualidade máxima)
 */
function checkIfShouldSendBestSignal() {
  const now = new Date();
  const currentMinute = now.getMinutes();
  
  // Envia sinal aos 55 minutos de cada hora (dá tempo para análise completa)
  const shouldSendNow = currentMinute >= 55;
  
  // Verifica se já enviou sinal nesta hora
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const alreadySentThisHour = lastSignalTime && lastSignalTime > oneHourAgo;
  
  if (shouldSendNow && !alreadySentThisHour) {
    // Determina threshold baseado no tempo sem sinais
    const minutesSinceLastSignal = lastSignalTime ? 
      Math.floor((now - lastSignalTime) / (1000 * 60)) : 120;
      
    let threshold = TRADING_CONFIG.HOURLY_SIGNAL_CONFIG.MIN_QUALITY_THRESHOLD; // 70%
    let reason = 'Qualidade máxima';
    
    if (minutesSinceLastSignal >= 120) {
      threshold = TRADING_CONFIG.HOURLY_SIGNAL_CONFIG.EMERGENCY_THRESHOLD; // 50%
      reason = 'Emergência - 2h sem sinais';
    } else if (minutesSinceLastSignal >= 90) {
      threshold = TRADING_CONFIG.HOURLY_SIGNAL_CONFIG.FALLBACK_THRESHOLD; // 60%
      reason = 'Fallback - 1.5h sem sinais';
    }
    
    return {
      shouldSend: true,
      threshold,
      reason,
      forceBest: true
    };
  }
  
  return { shouldSend: false };
}

/**
 * Seleciona o melhor sinal baseado em múltiplos critérios de qualidade
 */
function selectBestQualitySignal(signals) {
  console.log(`\n🏆 SELECIONANDO MELHOR ENTRE ${signals.length} SINAIS:`);
  
  // Ordena por critérios de qualidade
  const rankedSignals = signals.map(signal => {
    let qualityScore = signal.probability; // Score base
    
    // Bônus por correlação com Bitcoin
    if (signal.btcCorrelation?.alignment === 'ALIGNED') {
      qualityScore += 5;
      console.log(`  ${signal.symbol}: +5 (alinhado com BTC)`);
    }
    
    // Bônus por timeframe mais confiável
    const timeframeBonus = {
      '1d': 8, '4h': 6, '1h': 4, '15m': 2, '5m': 0
    };
    qualityScore += timeframeBonus[signal.timeframe] || 0;
    
    // Bônus por regime de mercado favorável
    if (signal.regime === 'BULL' && signal.trend === 'BULLISH') {
      qualityScore += 3;
    } else if (signal.regime === 'BEAR' && signal.trend === 'BEARISH') {
      qualityScore += 3;
    }
    
    // Penalidade por sinais contra-tendência (mesmo que válidos)
    if (signal.btcCorrelation?.alignment === 'AGAINST') {
      qualityScore -= 2;
    }
    
    console.log(`  ${signal.symbol} ${signal.timeframe}: ${signal.probability.toFixed(1)}% → ${qualityScore.toFixed(1)}% (qualidade)`);
    
    return { ...signal, qualityScore };
  }).sort((a, b) => b.qualityScore - a.qualityScore);
  
  const bestSignal = rankedSignals[0];
  console.log(`\n🥇 VENCEDOR: ${bestSignal.symbol} ${bestSignal.timeframe}`);
  console.log(`📊 Score original: ${bestSignal.probability.toFixed(1)}%`);
  console.log(`🏆 Score de qualidade: ${bestSignal.qualityScore.toFixed(1)}%`);
  
  return bestSignal;
}

async function analyzeSymbolTimeframe(symbol, timeframe, logPrefix) {
  try {
    console.log(`${logPrefix} 📊 Obtendo dados...`);
    const data = await binanceService.getOHLCVData(symbol, timeframe, 200);
    
    if (!data?.close?.length || data.close.length < 50) {
      throw new Error(`Dados insuficientes (${data?.close?.length || 0})`);
    }
    
    console.log(`${logPrefix} 📈 Calculando indicadores...`);
    const indicators = await technicalAnalysis.calculateIndicators(data, symbol, timeframe);
    
    if (!indicators || Object.keys(indicators).length === 0) {
      throw new Error('Falha nos indicadores');
    }
    
    console.log(`${logPrefix} 🔍 Detectando padrões...`);
    const patterns = patternDetection.detectPatterns(data);
    
    console.log(`${logPrefix} 🤖 Previsão ML...`);
    const mlProbability = await machineLearning.predict(symbol, data, indicators).catch(() => 0);
    
    console.log(`${logPrefix} 📊 Detectando tendência...`);
    const signalTrend = signalScoring.detectSignalTrend(indicators, patterns);
    
    console.log(`${logPrefix} ₿ Analisando correlação BTC...`);
    const btcCorrelation = await bitcoinCorrelation.analyzeCorrelation(symbol, signalTrend, data).catch(error => {
      console.warn(`${logPrefix} ⚠️ Erro na correlação BTC: ${error.message}`);
      return {
        btcTrend: 'NEUTRAL',
        btcStrength: 0,
        correlation: 'NEUTRAL',
        bonus: 0,
        penalty: 0,
        alignment: 'NEUTRAL'
      };
    });
    
    console.log(`${logPrefix} 🎯 Calculando score...`);
    signalScoring.setCurrentTimeframe(timeframe);
    const scoring = adaptiveScoring.calculateAdaptiveScore(
      data, indicators, patterns, mlProbability, signalTrend, symbol, btcCorrelation
    );

    console.log(`${logPrefix} Score: ${scoring.totalScore.toFixed(1)}% (${scoring.isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'})`);
    
    return {
      ...scoring,
      entry: data.close[data.close.length - 1],
      trend: signalTrend,
      indicators,
      patterns,
      btcCorrelation
    };
    
  } catch (error) {
    console.error(`${logPrefix} ❌ Erro na análise: ${error.message}`);
    throw error;
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
    const activeMonitors = Array.from(telegramBot.activeMonitors.entries()).map(([symbol, monitor]) => ({
      symbol,
      entry: monitor.entry,
      targetsHit: monitor.targetsHit,
      targetsRemaining: monitor.targets.length,
      stopLoss: monitor.stopLoss,
      trend: monitor.trend,
      startTime: monitor.startTime,
      status: monitor.status
    }));

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
      },
      monitoringDetails: activeMonitors
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

// Relatório semanal - Todo domingo às 20h (horário de Brasília)
schedule.scheduleJob('0 23 * * 0', async () => {
  console.log('\n⏰ Agendamento: Gerando relatório semanal...');
  try {
    if (performanceTracker.shouldSendWeeklyReport()) {
      const weeklyReport = performanceTracker.generateWeeklyReport();
      
      if (weeklyReport.hasData && telegramBot.isEnabled) {
        const message = formatWeeklyReportMessage(weeklyReport);
        await telegramBot.bot.sendMessage(telegramBot.chatId, message, { parse_mode: 'Markdown' });
        performanceTracker.markWeeklyReportSent();
        console.log('✅ Relatório semanal enviado');
      } else {
        console.log('ℹ️ Relatório semanal não enviado - dados insuficientes ou Telegram desabilitado');
      }
    }
  } catch (error) {
    console.error('❌ Erro ao enviar relatório semanal:', error.message);
  }
});

/**
 * Formata mensagem do relatório semanal
 */
function formatWeeklyReportMessage(report) {
  const { summary, performance, insights } = report;
  
  return `📊 *RELATÓRIO SEMANAL SINAIS LOBO PREMIUM*

📅 *Período:* ${new Date(report.period.start).toLocaleDateString('pt-BR')} - ${new Date(report.period.end).toLocaleDateString('pt-BR')}

📈 *PERFORMANCE GERAL:*
• Total de operações: ${summary.totalTrades}
• Taxa de acerto: ${summary.winRate}%
• P&L total: ${summary.totalRiskAdjustedPnL > 0 ? '+' : ''}${summary.totalRiskAdjustedPnL}%
• Lucro realizado: ${summary.realizedProfit}%
• Média de alvos: ${summary.avgTargetsHit}

🛡️ *GESTÃO DE RISCO:*
• Stop móvel ativado: ${report.stopMobileActivations || 0} vezes
• Média alvos no stop móvel: ${(report.stopMobileAvgTargets || 0).toFixed(1)}
• Taxa de realização: ${summary.profitRealizationRatio}

🏆 *MELHOR OPERAÇÃO:*
${performance.bestTrade ? `• ${performance.bestTrade.symbol}: ${performance.bestTrade.pnl} (${performance.bestTrade.targetsHit}/6 alvos)` : '• Nenhuma operação concluída'}

💡 *INSIGHTS:*
${insights.map(insight => `• ${insight}`).join('\n')}

👑 *Sinais Lobo Cripto - Relatório Automático*
⏰ ${new Date().toLocaleString('pt-BR')}`;
}

setInterval(async () => {
  try {
    await binanceService.cleanupOrphanedWebSockets();
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
    console.log(`⏰ Análise automática a cada 1 hora`);
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

// Cria servidor HTTP com tratamento de erro
const server = createServer(app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${PORT} já está em uso. Tentando porta alternativa...`);
    const alternativePort = PORT + 1;
    server.listen(alternativePort, () => {
      console.log(`🌐 Servidor rodando na porta alternativa ${alternativePort}`);
      startBot();
    });
  } else {
    console.error('❌ Erro no servidor:', error);
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
  startBot();
});

export default app;