/**
 * Bot de Trading de Criptomoedas - Servidor Principal
 * Sistema completo com análise técnica, ML e Telegram
 */

import express from 'express';
import cors from 'cors';
import schedule from 'node-schedule';
import dotenv from 'dotenv';
import path from 'path';

// Importa serviços
import BinanceService from './services/binanceService.js';
import TechnicalAnalysisService from './services/technicalAnalysis.js';
import PatternDetectionService from './services/patternDetection.js';
import SignalScoringService from './services/signalScoring.js';
import MachineLearningService from './services/machineLearning.js';
import TelegramBotService from './services/telegramBot.js';
import ChartGeneratorService from './services/chartGenerator.js';
import MarketAnalysisService from './services/marketAnalysis.js';
import BacktestingService from './services/backtesting.js';
import RiskManagementService from './services/riskManagement.js';
import AdaptiveScoringService from './services/adaptiveScoring.js';
import PerformanceTrackerService from './services/performanceTracker.js';
import MacroEconomicService from './services/macroEconomicService.js';
import SocialSentimentService from './services/socialSentimentService.js';
import AlertSystemService from './services/alertSystem.js';

// Configurações
import { CRYPTO_SYMBOLS, TIMEFRAMES, TRADING_CONFIG, SCHEDULE_CONFIG } from './config/constants.js';

// Carrega variáveis de ambiente
dotenv.config();

class TradingBotApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    
    // Inicializa serviços
    this.binanceService = new BinanceService();
    this.technicalAnalysis = new TechnicalAnalysisService();
    this.patternDetection = new PatternDetectionService();
    this.signalScoring = new SignalScoringService();
    this.machineLearning = new MachineLearningService();
    this.telegramBot = new TelegramBotService();
    this.chartGenerator = new ChartGeneratorService();
    this.backtesting = new BacktestingService();
    this.riskManagement = new RiskManagementService();
    this.adaptiveScoring = new AdaptiveScoringService();
    this.performanceTracker = new PerformanceTrackerService();
    this.macroEconomic = new MacroEconomicService();
    this.socialSentiment = new SocialSentimentService();
    this.alertSystem = new AlertSystemService(this.telegramBot);
    
    // Market Analysis com Social Sentiment
    this.marketAnalysis = new MarketAnalysisService(
      this.binanceService, 
      this.technicalAnalysis,
      this.socialSentiment
    );
    
    // Estado do bot
    this.isRunning = false;
    this.lastAnalysisTime = null;
    this.analysisCount = 0;
    this.signalsGenerated = 0;
    
    // Configuração do Express
  }

  /**
   * Configura Express
   */
  async setupExpress() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Configurações de segurança
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
    
    // Importa módulos necessários
    const pathModule = await import('path');
    const fsModule = await import('fs');
    const distPath = pathModule.join(process.cwd(), 'dist');
    
    // Serve arquivos estáticos se existir a pasta dist
    if (fsModule.existsSync(distPath)) {
      this.app.use(express.static('dist'));
      console.log('✅ Servindo arquivos estáticos da pasta dist');
    } else {
      console.log('⚠️ Pasta dist não encontrada - apenas API ativa');
      
      // Fallback: serve uma página simples se não tiver build
      this.app.get('/', (req, res) => {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Bot Lobo Cripto - API</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
              .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .status { padding: 15px; background: #e8f5e8; border-left: 4px solid #4caf50; margin: 20px 0; }
              .api-link { display: inline-block; padding: 10px 20px; background: #2196f3; color: white; text-decoration: none; border-radius: 5px; margin: 5px; }
              .api-link:hover { background: #1976d2; }
              h1 { color: #333; }
              h2 { color: #666; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🤖 Bot Lobo Cripto Oficial V.10</h1>
              <div class="status">
                ✅ <strong>Bot está ONLINE e funcionando!</strong>
              </div>
              
              <h2>📊 APIs Disponíveis:</h2>
              <a href="/api/status" class="api-link">📈 Status do Bot</a>
              <a href="/api/signals/latest" class="api-link">🎯 Últimos Sinais</a>
              <a href="/api/market/sentiment" class="api-link">🌍 Sentimento do Mercado</a>
              <a href="/api/volatility/alerts" class="api-link">🔥 Alertas de Volatilidade</a>
              <a href="/api/macro/data" class="api-link">🏛️ Dados Macroeconômicos</a>
              
              <h2>⚙️ Configuração:</h2>
              <p>Configure as variáveis de ambiente no Render:</p>
              <ul>
                <li><code>TELEGRAM_TOKEN</code> - Token do seu bot</li>
                <li><code>TELEGRAM_CHAT_ID</code> - ID do seu chat</li>
              </ul>
              
              <h2>🚀 Funcionalidades Ativas:</h2>
              <ul>
                <li>✅ Análise técnica automática (a cada hora)</li>
                <li>✅ Análise do Bitcoin (a cada 4 horas)</li>
                <li>✅ Sentimento do mercado (a cada 6 horas)</li>
                <li>✅ Alertas de volatilidade (a cada 15 minutos)</li>
                <li>✅ Machine Learning integrado</li>
                <li>✅ Monitoramento em tempo real</li>
              </ul>
              
              <p><strong>Desenvolvido com ❤️ para a comunidade de trading</strong></p>
            </div>
          </body>
          </html>
        `);
      });
    }
  }

  /**
   * Configura rotas da API
   */
  setupRoutes() {
    // Status do bot
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: this.isRunning ? 'running' : 'stopped',
        timestamp: new Date().toISOString(),
        lastAnalysisTime: this.lastAnalysisTime,
        analysisCount: this.analysisCount,
        signalsGenerated: this.signalsGenerated,
        activeMonitors: this.telegramBot.getActiveSymbols().length,
        isTraining: this.machineLearning.isMLAvailable(),
        activeSymbols: this.telegramBot.getActiveSymbols(),
        adaptiveStats: {
          marketRegime: this.adaptiveScoring.marketRegime,
          blacklistedSymbols: this.adaptiveScoring.getBlacklistedSymbols().length,
          indicatorPerformance: Object.keys(this.adaptiveScoring.getIndicatorPerformanceReport()).length
        },
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
      });
    });

    // Últimos sinais
    this.app.get('/api/signals/latest', (req, res) => {
      const performanceData = this.performanceTracker.generatePerformanceReport();
      res.json(performanceData.recentSignals || []);
    });

    // Sentimento do mercado
    this.app.get('/api/market/sentiment', async (req, res) => {
      try {
        const sentiment = await this.marketAnalysis.analyzeMarketSentiment();
        res.json(sentiment);
      } catch (error) {
        console.error('Erro ao obter sentimento:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
      }
    });

    // Dados macroeconômicos
    this.app.get('/api/macro/data', async (req, res) => {
      try {
        const macroData = await this.macroEconomic.getMacroEconomicData();
        res.json(macroData);
      } catch (error) {
        console.error('Erro ao obter dados macro:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
      }
    });

    // Resultados de backtesting
    this.app.get('/api/backtest/results', (req, res) => {
      const report = this.backtesting.generateReport();
      const bestPerformers = this.backtesting.getBestPerformers();
      
      res.json({
        report,
        bestPerformers
      });
    });

    // Executar backtesting
    this.app.post('/api/backtest/run/:symbol', async (req, res) => {
      try {
        const { symbol } = req.params;
        const data = await this.binanceService.getOHLCVData(symbol, '1h', 1000);
        
        const result = await this.backtesting.runBacktest(
          symbol,
          data,
          this.technicalAnalysis,
          this.signalScoring,
          this.machineLearning
        );
        
        res.json(result);
      } catch (error) {
        console.error('Erro no backtesting:', error.message);
        res.status(500).json({ error: 'Erro ao executar backtesting' });
      }
    });

    // Alertas de volatilidade
    this.app.get('/api/volatility/alerts', async (req, res) => {
      try {
        const alerts = await this.marketAnalysis.detectHighVolatility();
        res.json(alerts);
      } catch (error) {
        console.error('Erro ao obter alertas:', error.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
      }
    });

    // Teste do Telegram
    this.app.post('/api/telegram/test', async (req, res) => {
      try {
        if (!this.telegramBot.isEnabled) {
          return res.status(400).json({ 
            error: 'Telegram não configurado. Configure TELEGRAM_TOKEN e TELEGRAM_CHAT_ID no arquivo .env' 
          });
        }

        // Cria sinal de teste
        const testSignal = {
          symbol: 'BTC/USDT',
          probability: 85.5,
          entry: 43250.67,
          targets: [43899.43, 44548.19, 45196.95, 45845.71, 46494.47, 47143.23],
          stopLoss: 41294.39,
          riskRewardRatio: 1.85,
          trend: 'BULLISH',
          timeframe: '1h',
          isMLDriven: true,
          mlContribution: 25.8,
          details: {
            indicators: {
              rsi: { value: 28.5, score: 25, reason: 'RSI sobrevendido' },
              macd: { score: 30, reason: 'Cruzamento bullish' }
            },
            patterns: {
              breakout: { score: 25, reason: 'Rompimento de resistência' }
            },
            volume: 20,
            machineLearning: 25.8
          },
          indicators: {
            rsi: 28.5,
            macd: { MACD: 125.45, signal: 98.32 },
            ma21: 42890.45,
            ma200: 41200.30
          }
        };

        // Envia sinal de teste
        await this.telegramBot.sendTradingSignal(testSignal, null);
        
        res.json({ 
          success: true, 
          message: 'Sinal de teste enviado com sucesso!' 
        });
      } catch (error) {
        console.error('Erro ao enviar sinal de teste:', error.message);
        res.status(500).json({ 
          error: `Erro ao enviar sinal: ${error.message}` 
        });
      }
    });

    // Rota catch-all para SPA
    // Fallback para SPA - serve index.html para rotas não encontradas (apenas se dist existir)
    const pathModule = await import('path');
    const fsModule = await import('fs');
    const distPath = pathModule.join(process.cwd(), 'dist');
    const indexPath = pathModule.join(distPath, 'index.html');
    
    if (fsModule.existsSync(indexPath)) {
      this.app.use((req, res, next) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(indexPath);
        } else {
          next();
        }
      });
    }
  }

  /**
   * Configura tarefas agendadas
   */
  setupScheduledTasks() {
    // Análise principal a cada hora
    schedule.scheduleJob(SCHEDULE_CONFIG.SIGNAL_ANALYSIS, () => {
      this.runMainAnalysis();
    });

    // Análise do Bitcoin a cada 4 horas
    schedule.scheduleJob(SCHEDULE_CONFIG.BITCOIN_ANALYSIS, () => {
      this.analyzeBitcoin();
    });

    // Análise de sentimento a cada 6 horas
    schedule.scheduleJob(SCHEDULE_CONFIG.MARKET_SENTIMENT, () => {
      this.analyzeMarketSentiment();
    });

    // Verificação de volatilidade a cada 15 minutos
    schedule.scheduleJob(SCHEDULE_CONFIG.VOLATILITY_CHECK, () => {
      this.checkVolatility();
    });

    // Relatório semanal (domingos às 20h)
    schedule.scheduleJob('0 20 * * 0', () => {
      this.sendWeeklyReport();
    });

    // Relatório macro diário (7h da manhã)
    schedule.scheduleJob('0 7 * * *', () => {
      this.sendDailyMacroReport();
    });

    console.log('✅ Tarefas agendadas configuradas');
  }

  /**
   * Análise principal - busca o melhor sinal
   */
  async runMainAnalysis() {
    if (!this.isRunning) return;

    try {
      console.log('\n🔍 Iniciando análise principal...');
      this.lastAnalysisTime = new Date().toISOString();
      this.analysisCount++;

      let bestSignal = null;
      let bestScore = 0;
      let totalAnalyzed = 0;
      let validSignals = 0;

      // Analisa todos os símbolos e timeframes
      for (const symbol of CRYPTO_SYMBOLS) {
        for (const timeframe of TIMEFRAMES) {
          try {
            const signal = await this.analyzeSymbol(symbol, timeframe);
            totalAnalyzed++;

            if (signal && signal.isValid) {
              validSignals++;
              
              if (signal.totalScore > bestScore) {
                bestScore = signal.totalScore;
                bestSignal = {
                  ...signal,
                  symbol,
                  timeframe
                };
              }
            }

            // Pausa para evitar rate limit
            await this.sleep(100);
          } catch (error) {
            console.error(`Erro ao analisar ${symbol} ${timeframe}:`, error.message);
          }
        }
      }

      console.log(`📊 Análise concluída:`);
      console.log(`   • Total analisado: ${totalAnalyzed} combinações símbolo/timeframe`);
      console.log(`   • Sinais válidos encontrados: ${validSignals}`);
      console.log(`   • Operações ativas: ${this.telegramBot.getActiveSymbols().length}`);
      console.log(`   • Símbolos ativos: ${this.telegramBot.getActiveSymbols().join(', ') || 'Nenhum'}`);
      console.log(`🎯 Melhor score: ${bestScore.toFixed(1)}% (threshold: ${TRADING_CONFIG.MIN_SIGNAL_PROBABILITY}%)`);

      // Envia melhor sinal se encontrado
      if (bestSignal && bestScore >= TRADING_CONFIG.MIN_SIGNAL_PROBABILITY) {
        await this.sendTradingSignal(bestSignal);
        this.signalsGenerated++;
        console.log(`✅ Sinal enviado: ${bestSignal.symbol} ${bestSignal.timeframe} (${bestScore.toFixed(1)}%)`);
      } else {
        console.log('❌ Nenhum sinal encontrado nesta análise');
      }

    } catch (error) {
      console.error('Erro na análise principal:', error.message);
    }
  }

  /**
   * Analisa um símbolo específico
   */
  async analyzeSymbol(symbol, timeframe) {
    try {
      console.log(`🔍 Analisando ${symbol} ${timeframe}...`);

      // Obtém dados históricos
      const data = await this.binanceService.getOHLCVData(symbol, timeframe, 200);
      
      if (!data || !data.close || data.close.length < 50) {
        console.log(`⚠️ ${symbol} ${timeframe}: Dados insuficientes`);
        return null;
      }

      // Validação crítica dos dados
      const lastPrice = data.close[data.close.length - 1];
      console.log(`📊 ${symbol} ${timeframe}: Último preço = $${lastPrice.toFixed(6)}`);
      
      // Validação específica por tipo de ativo
      let isValidPrice = true;
      if (symbol.includes('BTC')) {
        // Bitcoin: $1k - $1M
        if (lastPrice < 1000 || lastPrice > 1000000) {
          isValidPrice = false;
        }
      } else if (symbol.includes('ETH')) {
        // Ethereum: $1 - $50k
        if (lastPrice < 1 || lastPrice > 50000) {
          isValidPrice = false;
        }
      } else {
        // Outros ativos: $0.000001 - $100k
        if (lastPrice < 0.000001 || lastPrice > 100000) {
          isValidPrice = false;
        }
      }
      
      if (!isValidPrice) {
        console.error(`❌ ERRO: Preço fora da faixa válida para ${symbol}: $${lastPrice}`);
        console.error('🔧 Possível problema na API da Binance ou conversão de dados');
        return null;
      }

      // Análise técnica
      const indicators = this.technicalAnalysis.calculateIndicators(data);
      
      // Validação crítica dos indicadores

      // Detecção de padrões
      const patterns = this.patternDetection.detectPatterns(data);

      // Previsão ML
      const mlProbability = await this.machineLearning.predict(symbol, data, indicators);

      // Detecta tendência do mercado
      const marketTrend = this.technicalAnalysis.detectTrend(indicators);

      // Calcula pontuação (com sistema adaptativo se disponível)
      let scoring;
      if (this.adaptiveScoring) {
        scoring = this.adaptiveScoring.calculateAdaptiveScore(
          data, indicators, patterns, mlProbability, marketTrend, symbol
        );
      } else {
        scoring = this.signalScoring.calculateSignalScore(
          data, indicators, patterns, mlProbability, marketTrend
        );
      }

      console.log(`📊 ${symbol} ${timeframe}: Score ${scoring.totalScore.toFixed(1)}% - ${scoring.isValid ? 'VÁLIDO' : 'INVÁLIDO'}`);

      if (!scoring.isValid) {
        console.log(`❌ ${symbol} ${timeframe}: Score ${scoring.totalScore.toFixed(1)}% abaixo do mínimo`);
        return null;
      }

      // Calcula níveis de trading
      const levels = this.signalScoring.calculateTradingLevels(lastPrice, marketTrend);

      // Verifica gestão de risco
      const riskCheck = this.riskManagement.canOpenTrade(symbol, this.telegramBot.activeMonitors);
      if (!riskCheck.allowed) {
        console.log(`🚫 ${symbol}: ${riskCheck.reason}`);
        return null;
      }

      // Verifica se já existe operação ativa para este símbolo
      if (this.telegramBot.hasActiveMonitor(symbol)) {
        console.log(`🚫 ${symbol}: Operação já ativa - aguardando finalização`);
        return null;
      }
      return {
        ...scoring,
        ...levels,
        probability: scoring.totalScore,
        trend: marketTrend,
        indicators,
        patterns,
        marketTrend,
        timeframe
      };

    } catch (error) {
      console.error(`Erro ao analisar ${symbol} ${timeframe}:`, error.message);
      return null;
    }
  }

  /**
   * Envia sinal de trading
   */
  async sendTradingSignal(signal) {
    try {
      // Gera gráfico
      const chart = await this.chartGenerator.generatePriceChart(
        signal.symbol,
        { close: [signal.entry], timestamp: [Date.now()], volume: [1000] },
        signal.indicators,
        signal.patterns,
        signal
      );

      // Registra sinal no performance tracker
      const signalId = this.performanceTracker.recordSignal(signal);

      // Envia via Telegram
      await this.telegramBot.sendTradingSignal(signal, chart);

      // Inicia monitoramento de preço
      this.telegramBot.startPriceMonitoring(
        signal.symbol,
        signal.entry,
        signal.targets,
        signal.stopLoss,
        this.binanceService,
        signal,
        this,
        this.adaptiveScoring
      );

      console.log(`📤 Sinal enviado e monitoramento iniciado para ${signal.symbol}`);
      
    } catch (error) {
      console.error('Erro ao enviar sinal:', error.message);
    }
  }

  /**
   * Analisa Bitcoin
   */
  async analyzeBitcoin() {
    try {
      console.log('₿ Iniciando análise do Bitcoin...');
      
      // Analisa múltiplos timeframes
      const timeframes = ['1h', '4h', '1d'];
      const timeframeAnalysis = [];
      
      let mainData = null;
      let mainIndicators = null;
      let mainPatterns = null;
      let mainTrend = null;

      for (const timeframe of timeframes) {
        try {
          const data = await this.binanceService.getOHLCVData('BTC/USDT', timeframe, 100);
          
          if (!data || !data.close || data.close.length < 20) {
            console.log(`⚠️ Dados insuficientes para BTC ${timeframe}`);
            continue;
          }

          // Validação crítica do preço do Bitcoin
          const currentPrice = data.close[data.close.length - 1];
          
          // Validação mais flexível para Bitcoin - permite até $500k
          if (currentPrice < 1000 || currentPrice > 500000) {
            console.error(`❌ ERRO: Preço do Bitcoin extremamente anômalo em ${timeframe}: $${currentPrice}`);
            continue;
          }

          const indicators = this.technicalAnalysis.calculateIndicators(data);
          const patterns = this.patternDetection.detectPatterns(data);
          const trend = this.technicalAnalysis.detectTrend(indicators);

          // Calcula força da tendência
          let strength = 50;
          if (indicators.rsi) {
            if (trend === 'BULLISH' && indicators.rsi > 60) strength += 20;
            if (trend === 'BEARISH' && indicators.rsi < 40) strength += 20;
          }
          if (indicators.macd && indicators.macd.MACD > indicators.macd.signal) {
            strength += 15;
          }

          // Adiciona à análise de timeframes
          timeframeAnalysis.push({
            timeframe,
            trend,
            strength,
            rsi: indicators.rsi,
            macdBullish: indicators.macd && indicators.macd.MACD > indicators.macd.signal
          });

          // Usa 4h como timeframe principal
          if (timeframe === '4h') {
            mainData = data;
            mainIndicators = indicators;
            mainPatterns = patterns;
            mainTrend = trend;
          }

          // Pausa para evitar rate limit
          await this.sleep(200);
        } catch (error) {
          console.error(`Erro ao analisar BTC ${timeframe}:`, error.message);
        }
      }

      // Se não conseguiu dados do 4h, usa o primeiro disponível
      if (!mainData && timeframeAnalysis.length > 0) {
        const firstAnalysis = timeframeAnalysis[0];
        const data = await this.binanceService.getOHLCVData('BTC/USDT', firstAnalysis.timeframe, 100);
        mainData = data;
        mainIndicators = this.technicalAnalysis.calculateIndicators(data);
        mainPatterns = this.patternDetection.detectPatterns(data);
        mainTrend = firstAnalysis.trend;
      }

      if (!mainData || timeframeAnalysis.length === 0) {
        console.log('⚠️ Não foi possível obter dados suficientes para análise do Bitcoin');
        return;
      }

      const currentPrice = mainData.close[mainData.close.length - 1];
      const mainStrength = timeframeAnalysis.find(t => t.timeframe === '4h')?.strength || 
                          timeframeAnalysis[0]?.strength || 50;

      const analysis = {
        currentPrice,
        trend: mainTrend,
        strength: mainStrength,
        support: mainPatterns.support,
        resistance: mainPatterns.resistance,
        rsi: mainIndicators.rsi,
        volume: mainData.volume[mainData.volume.length - 1],
        volumeAvg: mainData.volume.reduce((a, b) => a + b, 0) / mainData.volume.length,
        timeframes: timeframeAnalysis,
        smartInterpretation: this.generateBitcoinInterpretation(mainTrend, mainIndicators, mainPatterns, mainStrength)
      };

      await this.telegramBot.sendBitcoinAnalysis(analysis);
      console.log('✅ Análise do Bitcoin enviada');

    } catch (error) {
      console.error('Erro na análise do Bitcoin:', error.message);
    }
  }

  /**
   * Gera interpretação inteligente do Bitcoin
   */
  generateBitcoinInterpretation(trend, indicators, patterns, strength) {
    const interpretation = [];

    // Análise de tendência
    if (trend === 'BULLISH') {
      if (strength > 70) {
        interpretation.push('🚀 Tendência de alta muito forte - momentum bullish consolidado');
        interpretation.push('💡 Favorece operações LONG em timeframes menores');
        interpretation.push('⚠️ Possíveis correções são oportunidades de compra');
      } else {
        interpretation.push('📈 Tendência de alta moderada - cautela com reversões');
        interpretation.push('💡 Aguardar confirmação em rompimentos');
      }
    } else if (trend === 'BEARISH') {
      if (strength > 70) {
        interpretation.push('📉 Tendência de baixa muito forte - pressão vendedora');
        interpretation.push('💡 Favorece operações SHORT em timeframes menores');
        interpretation.push('⚠️ Possíveis altas são oportunidades de venda');
      } else {
        interpretation.push('🔻 Tendência de baixa moderada - possível reversão');
        interpretation.push('💡 Monitorar níveis de suporte importantes');
      }
    } else {
      interpretation.push('🟡 Mercado lateral - aguardar definição de direção');
      interpretation.push('💡 Operar rompimentos com confirmação de volume');
    }

    // Análise de RSI
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        interpretation.push('🟢 RSI em zona de sobrevendido - possível reversão de alta');
      } else if (indicators.rsi > 70) {
        interpretation.push('🔴 RSI em zona de sobrecomprado - possível correção');
      }
    }

    // Análise de suporte/resistência
    if (patterns.support && patterns.resistance) {
      const currentPrice = indicators.ma21 || 50000; // Fallback
      const supportDistance = ((currentPrice - patterns.support) / patterns.support) * 100;
      const resistanceDistance = ((patterns.resistance - currentPrice) / currentPrice) * 100;

      if (supportDistance < 2) {
        interpretation.push('🛡️ Preço próximo ao suporte - zona de compra potencial');
      }
      if (resistanceDistance < 2) {
        interpretation.push('🚧 Preço próximo à resistência - zona de venda potencial');
      }
    }

    return interpretation;
  }

  /**
   * Analisa sentimento do mercado
   */
  async analyzeMarketSentiment() {
    try {
      console.log('🌍 Analisando sentimento do mercado...');
      
      const sentiment = await this.marketAnalysis.analyzeMarketSentiment();
      
      if (sentiment) {
        await this.telegramBot.sendMarketSentiment(sentiment);
        
        // Verifica condições para alertas
        await this.alertSystem.checkMarketConditions(sentiment);
        
        console.log('✅ Análise de sentimento enviada');
      }
    } catch (error) {
      console.error('Erro na análise de sentimento:', error.message);
    }
  }

  /**
   * Verifica volatilidade
   */
  async checkVolatility() {
    try {
      const alerts = await this.marketAnalysis.detectHighVolatility();
      
      for (const alert of alerts) {
        await this.telegramBot.sendVolatilityAlert(
          alert.symbol,
          alert.change,
          alert.timeframe
        );
      }
      
      if (alerts.length > 0) {
        console.log(`🔥 ${alerts.length} alertas de volatilidade enviados`);
      }
    } catch (error) {
      console.error('Erro na verificação de volatilidade:', error.message);
    }
  }

  /**
   * Envia relatório semanal
   */
  async sendWeeklyReport() {
    try {
      if (this.performanceTracker.shouldSendWeeklyReport()) {
        const report = this.performanceTracker.generateWeeklyReport();
        
        if (report.hasData) {
          let message = `📊 *RELATÓRIO SEMANAL*\n\n`;
          message += `📅 Período: ${report.period.start.toLocaleDateString('pt-BR')} - ${report.period.end.toLocaleDateString('pt-BR')}\n\n`;
          
          message += `📈 *PERFORMANCE GERAL:*\n`;
          message += `   • Sinais enviados: ${report.summary.totalSignals}\n`;
          message += `   • Taxa de acerto: ${report.summary.winRate}%\n`;
          message += `   • P&L total: ${report.summary.totalPnL}% (Alv. 15×)\n`;
          message += `   • Média por trade: ${report.summary.avgPnL}%\n`;
          message += `   • Alvos médios: ${report.summary.avgTargetsHit}/6\n\n`;
          
          if (report.mlPerformance.signals > 0) {
            message += `🤖 *MACHINE LEARNING:*\n`;
            message += `   • Sinais IA: ${report.mlPerformance.signals} (${report.mlPerformance.percentage}%)\n`;
            message += `   • Taxa de acerto IA: ${report.mlPerformance.winRate}%\n\n`;
          }
          
          if (Object.keys(report.timeframes).length > 0) {
            message += `⏰ *POR TIMEFRAME:*\n`;
            Object.entries(report.timeframes).forEach(([tf, data]) => {
              message += `   • ${tf}: ${data.signals} sinais (${data.winRate}%)\n`;
            });
            message += '\n';
          }
          
          if (report.bestTrade) {
            message += `🏆 *MELHOR TRADE:*\n`;
            message += `   • ${report.bestTrade.symbol}: +${report.bestTrade.pnl.toFixed(2)}%\n`;
            message += `   • Alvos: ${report.bestTrade.targetsHit}/6\n\n`;
          }
          
          if (report.insights.length > 0) {
            message += `💡 *INSIGHTS:*\n`;
            report.insights.forEach(insight => {
              message += `   • ${insight}\n`;
            });
            message += '\n';
          }
          
          message += `👑 Sinais Lobo Cripto`;
          
          await this.telegramBot.bot.sendMessage(this.telegramBot.chatId, message, {
            parse_mode: 'Markdown'
          });
          
          this.performanceTracker.markWeeklyReportSent();
          console.log('📊 Relatório semanal enviado');
        }
      }
    } catch (error) {
      console.error('Erro ao enviar relatório semanal:', error.message);
    }
  }

  /**
   * Envia relatório macro diário
   */
  async sendDailyMacroReport() {
    try {
      if (this.macroEconomic.shouldSendDailyReport()) {
        const macroAnalysis = await this.macroEconomic.getMacroEconomicData();
        const report = this.macroEconomic.generateDailyMacroReport(macroAnalysis);
        
        await this.telegramBot.bot.sendMessage(this.telegramBot.chatId, report, {
          parse_mode: 'Markdown'
        });
        
        this.macroEconomic.markDailyReportSent();
        console.log('🌍 Relatório macro diário enviado');
      }
    } catch (error) {
      console.error('Erro ao enviar relatório macro:', error.message);
    }
  }

  /**
   * Função auxiliar para pausas
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Inicia o bot
   */
  async start() {
    try {
      console.log('🚀 Iniciando Bot de Trading de Criptomoedas...');
      
      // Verifica configuração do Telegram
      if (!this.telegramBot.isEnabled) {
        console.log('⚠️ Telegram não configurado - rodando em modo de desenvolvimento');
        console.log('💡 Configure TELEGRAM_TOKEN e TELEGRAM_CHAT_ID no arquivo .env para ativar');
      } else {
        console.log('✅ Telegram configurado e ativo');
      }

      // Configura Express (async)
      await this.setupExpress();
      this.setupRoutes();
      this.setupScheduledTasks();

      // Inicia servidor
      this.app.listen(this.port, () => {
        console.log(`🌐 Servidor rodando na porta ${this.port}`);
        console.log(`📱 Interface: http://localhost:${this.port}`);
      });

      // Marca como rodando
      this.isRunning = true;
      
      // Executa análise inicial após 30 segundos
      setTimeout(() => {
        console.log('🔍 Executando análise inicial...');
        this.runMainAnalysis();
      }, 30000);

      console.log('✅ Bot iniciado com sucesso!');
      console.log('📊 Análises automáticas agendadas:');
      console.log('   • Sinais: A cada hora');
      console.log('   • Bitcoin: A cada 4 horas');
      console.log('   • Sentimento: A cada 6 horas');
      console.log('   • Volatilidade: A cada 15 minutos');

    } catch (error) {
      console.error('❌ Erro ao iniciar bot:', error.message);
      process.exit(1);
    }
  }

  /**
   * Para o bot graciosamente
   */
  async stop() {
    console.log('🛑 Parando bot...');
    this.isRunning = false;
    
    // Fecha conexões WebSocket
    this.binanceService.closeAllWebSockets();
    
    console.log('✅ Bot parado');
    process.exit(0);
  }
}

// Inicia o bot
const bot = new TradingBotApp();
bot.start();

// Manipula sinais de sistema
process.on('SIGINT', () => bot.stop());
process.on('SIGTERM', () => bot.stop());

// Manipula erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

export default TradingBotApp;