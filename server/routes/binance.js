/**
 * Rotas relacionadas ao Binance
 */
import { Router } from 'express';
import BinanceService from '../services/binanceService.js';
import { Logger } from '../services/logger.js';

const logger = new Logger('BinanceRoutes');
const router = Router();
const binanceService = new BinanceService();

// Middleware de autenticação
router.use((req, res, next) => {
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    return res.status(401).json({ error: 'API Key do Binance não configurada' });
  }
  next();
});

// Rota para obter informações de um símbolo
router.get('/symbol/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const info = await binanceService.getSymbolInfo(symbol);
    res.json(info);
  } catch (error) {
    logger.error(`Erro ao obter informações do símbolo ${req.params.symbol}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para obter dados de candles
router.get('/candles/:symbol/:interval', async (req, res) => {
  try {
    const { symbol, interval } = req.params;
    const candles = await binanceService.getCandles(symbol, interval);
    res.json(candles);
  } catch (error) {
    logger.error(`Erro ao obter candles para ${symbol}/${interval}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para obter ordens do mercado
router.get('/orders/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    const orders = await binanceService.getMarketOrders(symbol);
    res.json(orders);
  } catch (error) {
    logger.error(`Erro ao obter ordens do mercado para ${symbol}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para obter informações de conta
router.get('/account', async (req, res) => {
  try {
    const accountInfo = await binanceService.getAccountInfo();
    res.json(accountInfo);
  } catch (error) {
    logger.error('Erro ao obter informações de conta:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
