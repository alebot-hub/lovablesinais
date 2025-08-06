/**
 * Rota para verificar status da API do Coinglass
 */
import express from 'express';
import CoinglassHealthMonitor from '../services/coinglassHealthMonitor.js';

const router = express.Router();
const healthMonitor = new CoinglassHealthMonitor();

// Inicia monitoramento ao carregar o módulo
healthMonitor.start();

/**
 * Endpoint para verificar status da API do Coinglass
 */
router.get('/api/coinglass/status', async (req, res) => {
  try {
    const status = await healthMonitor.getStatus();
    res.json({
      status: 'success',
      data: {
        health: status.status,
        lastCheck: status.lastCheck,
        stats: status.stats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Erro ao verificar status da API do Coinglass',
      error: error.message
    });
  }
});

export default router;
