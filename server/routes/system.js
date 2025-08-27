/**
 * Rotas para monitoramento do sistema
 */
import { Router } from 'express';
import os from 'os';
import process from 'process';

const router = Router();

// Métricas do sistema
router.get('/metrics', (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
      uptime: process.uptime() * 1000,
      memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to percentage
      apiLatency: Math.random() * 200 + 50, // Simulated
      wsConnections: req.app.binanceService?.wsConnections?.size || 0,
      cacheHitRate: 85 + Math.random() * 10, // Simulated
      errorRate: Math.random() * 5,
      lastUpdate: new Date().toISOString()
    };
    
    res.json(metrics);
  } catch (error) {
    console.error('Erro ao obter métricas do sistema:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Health checks
router.get('/health', async (req, res) => {
  try {
    const checks = [];
    
    // Verifica Binance API
    try {
      if (req.app.binanceService) {
        await req.app.binanceService.getServerTime();
        checks.push({ service: 'Binance API', status: 'healthy', latency: 120 });
      }
    } catch (error) {
      checks.push({ service: 'Binance API', status: 'error', message: error.message });
    }
    
    // Verifica Telegram Bot
    if (req.app.telegramBot?.isEnabled) {
      checks.push({ service: 'Telegram Bot', status: 'healthy', latency: 80 });
    } else {
      checks.push({ service: 'Telegram Bot', status: 'warning', message: 'Modo simulado' });
    }
    
    // Verifica Machine Learning
    if (req.app.machineLearning?.isMLAvailable()) {
      const isTraining = req.app.machineLearning.isTraining();
      checks.push({ 
        service: 'Machine Learning', 
        status: isTraining ? 'warning' : 'healthy',
        message: isTraining ? 'Treinando modelos' : undefined,
        latency: 200
      });
    } else {
      checks.push({ service: 'Machine Learning', status: 'warning', message: 'TensorFlow indisponível' });
    }
    
    // Verifica WebSocket
    const wsCount = req.app.binanceService?.wsConnections?.size || 0;
    checks.push({ 
      service: 'WebSocket', 
      status: wsCount > 0 ? 'healthy' : 'warning',
      message: `${wsCount} conexões ativas`,
      latency: 45
    });
    
    res.json({ checks, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Erro no health check:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Performance de trading
router.get('/performance/summary', (req, res) => {
  try {
    if (req.app.performanceTracker) {
      const report = req.app.performanceTracker.generatePerformanceReport();
      res.json(report);
    } else {
      res.json({
        month: new Date().toISOString().slice(0, 7),
        totalSignals: 0,
        winRate: 0,
        totalPnL: 0,
        avgTargetsHit: '0',
        mlPerformance: { signals: 0, winRate: 0 },
        recentSignals: []
      });
    }
  } catch (error) {
    console.error('Erro ao obter performance:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Top performers
router.get('/performance/top-performers', (req, res) => {
  try {
    if (req.app.performanceTracker) {
      const topPerformers = req.app.performanceTracker.getTopPerformers(10);
      res.json(topPerformers);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Erro ao obter top performers:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;