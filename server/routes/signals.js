/**
 * Rotas relacionadas aos sinais de trading
 */
import { Router } from 'express';
import { Logger } from '../services/logger.js';
import { analyzeSignals } from '../app.js';

const logger = new Logger('SignalsRoutes');
const router = Router();

// Middleware de autenticação básica
router.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== process.env.API_AUTH_TOKEN) {
    return res.status(401).json({ error: 'Token de autenticação inválido' });
  }
  next();
});

// Rota para obter sinais atuais
router.get('/current', async (req, res) => {
  try {
    const signals = await analyzeSignals();
    res.json(signals);
  } catch (error) {
    logger.error('Erro ao obter sinais atuais:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para obter histórico de sinais
router.get('/history', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const history = await getSignalHistory(limit, offset);
    res.json(history);
  } catch (error) {
    logger.error('Erro ao obter histórico de sinais:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para executar análise manual
router.post('/analyze', async (req, res) => {
  try {
    const { symbol, timeframe } = req.body;
    if (!symbol || !timeframe) {
      return res.status(400).json({ error: 'Símbolo e timeframe são obrigatórios' });
    }

    const signal = await analyzeSignal(symbol, timeframe);
    res.json(signal);
  } catch (error) {
    logger.error('Erro ao analisar sinal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Função auxiliar para obter histórico de sinais
async function getSignalHistory(limit, offset) {
  // Implementação específica do banco de dados
  // Aqui seria chamada a função do serviço de histórico
  return [];
}

// Função auxiliar para análise manual de sinal
async function analyzeSignal(symbol, timeframe) {
  // Implementação específica da análise manual
  // Aqui seria chamada a função do serviço de análise
  return {};
}

export default router;
