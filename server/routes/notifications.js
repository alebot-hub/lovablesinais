/**
 * Rotas para sistema de notificações avançadas
 */
import { Router } from 'express';

const router = Router();

// Configurações de notificação
router.get('/settings', (req, res) => {
  try {
    const settings = {
      telegram: {
        enabled: !!process.env.TELEGRAM_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID ? 'Configurado' : 'Não configurado'
      },
      alerts: {
        volatility: true,
        performance: true,
        systemHealth: true,
        marketSentiment: true
      },
      frequency: {
        signals: 'Tempo real',
        sentiment: 'A cada 12h',
        performance: 'Semanal',
        health: 'A cada hora'
      }
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Erro ao obter configurações:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Histórico de notificações
router.get('/history', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Implementar busca no histórico de notificações
    const history = []; // Placeholder
    
    res.json(history);
  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Enviar notificação de teste
router.post('/test', async (req, res) => {
  try {
    const { type = 'general' } = req.body;
    
    if (req.app.telegramBot?.isEnabled) {
      const message = `🧪 *TESTE DE NOTIFICAÇÃO*\n\n` +
                     `Tipo: ${type}\n` +
                     `Timestamp: ${new Date().toLocaleString('pt-BR')}\n\n` +
                     `✅ Sistema de notificações funcionando corretamente!\n\n` +
                     `👑 Bot Lobo Cripto`;
      
      await req.app.telegramBot.bot.sendMessage(
        req.app.telegramBot.chatId, 
        message, 
        { parse_mode: 'Markdown' }
      );
      
      res.json({ success: true, message: 'Notificação de teste enviada' });
    } else {
      res.json({ success: false, message: 'Telegram não configurado' });
    }
  } catch (error) {
    console.error('Erro ao enviar teste:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;