/**
 * Rota para verificar status da API do Coinglass
 * 
 * Este endpoint está desativado, pois o serviço Coinglass não está disponível no momento.
 * Para ativá-lo, certifique-se de que o serviço Coinglass está configurado corretamente.
 */
import express from 'express';
import { Logger } from '../services/logger.js';

const router = express.Router();
const logger = new Logger('CoinglassStatus');

// Serviço desativado - não há instância de healthMonitor
const healthMonitor = null;

/**
 * Endpoint para verificar status da API do Coinglass
 * 
 * Retorna um status 501 (Not Implemented) com informações sobre a indisponibilidade do serviço
 */
router.get('/api/coinglass/status', async (req, res) => {
  logger.warn('Tentativa de acessar o serviço Coinglass, que não está disponível');
  
  res.status(501).json({
    status: 'not_implemented',
    message: 'O serviço Coinglass não está disponível no momento',
    details: 'Este serviço requer configurações adicionais que não foram fornecidas',
    documentation: 'Consulte a documentação para obter instruções sobre como configurar o serviço Coinglass'
  });
});

export default router;
