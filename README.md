# Sistema Full-Stack de Trading Bot para Criptomoedas

Um sistema completo de bot de trading para criptomoedas com análise técnica avançada, machine learning e integração com Telegram.

## 🚀 Características Principais

### 📊 Análise Técnica Avançada
- **Indicadores**: RSI, MACD, Ichimoku Cloud, Médias Móveis, Bandas de Bollinger, VWAP
- **Padrões Gráficos**: Rompimentos, Triângulos, Bandeiras, Cunhas, Topo/Fundo Duplo, Cabeça e Ombros
- **Detecção de Divergências**: RSI e outros indicadores
- **Níveis de Fibonacci**: Retracement automático

### 🤖 Machine Learning
- Modelos de previsão usando TensorFlow.js
- Treinamento automático com dados históricos
- Integração da previsão ML na pontuação de sinais
- Avaliação contínua de performance

### 📱 Integração Telegram
- Envio automático de sinais de trading
- Monitoramento em tempo real de alvos e stop-loss
- Análises periódicas do Bitcoin e sentimento de mercado
- Alertas de alta volatilidade

### 📈 Sistema de Pontuação
- Algoritmo proprietário de pontuação (0-100%)
- Combinação de indicadores técnicos, padrões e ML
- Envio apenas de sinais com alta probabilidade (>70%)
- Cálculo automático de risk/reward ratio

### 🔄 Backtesting
- Teste de estratégias em dados históricos
- Métricas detalhadas: win rate, profit factor, drawdown
- Comparação de performance entre ativos
- Validação de sinais antes da implementação

## 🛠️ Tecnologias Utilizadas

### Backend
- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **ccxt** - Integração com exchanges
- **TensorFlow.js** - Machine Learning
- **technicalindicators** - Análise técnica
- **node-telegram-bot-api** - Bot do Telegram
- **Chart.js + Canvas** - Geração de gráficos

### Frontend
- **React** - Interface do usuário
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **Lucide React** - Ícones

### APIs e Serviços
- **Binance Futures API Pública** - Dados de mercado em tempo real
- **WebSocket Binance Futures** - Monitoramento em tempo real
- **Telegram Bot API** - Notificações

## 📦 Instalação e Configuração

### 1. Clone o repositório
```bash
git clone <repository-url>
cd crypto-trading-bot
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
Copie o arquivo `.env.example` para `.env` e configure:

```env
# Telegram Bot
TELEGRAM_TOKEN=seu_token_do_bot_telegram
TELEGRAM_CHAT_ID=seu_chat_id

# Servidor
PORT=3000
NODE_ENV=development
```

### 4. Execute o sistema
```bash
# Apenas frontend
npm run dev

# Apenas backend
npm run dev:server

# Desenvolvimento (frontend + backend) - RECOMENDADO
npm run dev:full
```

## 🔧 Configuração do Telegram Bot

1. Crie um bot no Telegram:
   - Envie `/newbot` para @BotFather
   - Escolha um nome e username
   - Copie o token fornecido

2. Obtenha seu Chat ID:
   - Envie uma mensagem para seu bot
   - Acesse: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Copie o `chat.id` da resposta

3. Configure as variáveis no `.env`

## 📊 Dados da Binance Futures

O sistema utiliza apenas endpoints públicos da Binance Futures:
- **WebSocket**: `wss://fstream.binance.com/ws/` para dados em tempo real
- **API REST**: Endpoints públicos para dados históricos
- **Sem necessidade de API Keys**: Funciona apenas com dados públicos

## 📊 Funcionalidades do Sistema

### Análise Automática
- **A cada hora**: Análise de todos os ativos e envio do melhor sinal
- **A cada 4 horas**: Análise detalhada do Bitcoin
- **A cada 6 horas**: Análise de sentimento do mercado
- **A cada 15 minutos**: Verificação de alta volatilidade

### Interface Web
- Dashboard em tempo real
- Visualização de sinais ativos
- Análise de sentimento do mercado
- Resultados de backtesting
- Alertas de volatilidade

### Monitoramento
- Acompanhamento automático de alvos e stop-loss
- Notificações instantâneas via Telegram
- Histórico de performance
- Métricas de precisão

## 🎯 Estratégia de Trading

### Critérios de Sinal
- **RSI**: Sobrevendido (<30) ou sobrecomprado (>70)
- **MACD**: Cruzamentos bullish/bearish
- **Ichimoku**: Sinais de tendência
- **Padrões**: Rompimentos e reversões
- **Volume**: Confirmação acima da média
- **ML**: Previsão de direção do preço

### Gestão de Risco
- **6 alvos**: +1.5%, +3%, +4.5%, +6%, +7.5%, +9%
- **Stop-loss**: -4.5%
- **Risk/Reward**: Mínimo 1:1, ideal >2:1
- **Probabilidade mínima**: 70%

## 📈 Métricas e Performance

### Indicadores de Sucesso
- **Win Rate**: Taxa de acerto dos sinais
- **Profit Factor**: Relação lucro/prejuízo
- **Sharpe Ratio**: Retorno ajustado ao risco
- **Maximum Drawdown**: Maior perda consecutiva

### Monitoramento Contínuo
- Avaliação diária dos modelos ML
- Ajuste automático de parâmetros
- Backtesting contínuo
- Otimização de estratégias

## 🚀 Deploy

### Render.com
1. Conecte seu repositório GitHub
2. Configure as variáveis de ambiente
3. Deploy automático a cada push

### Variáveis de Ambiente Necessárias
```
TELEGRAM_TOKEN
TELEGRAM_CHAT_ID
PORT
NODE_ENV
```

## 📚 Documentação da API

### Endpoints Principais
- `GET /api/status` - Status do bot
- `GET /api/signals/latest` - Últimos sinais
- `GET /api/market/sentiment` - Sentimento do mercado
- `GET /api/backtest/results` - Resultados de backtesting
- `POST /api/backtest/run/:symbol` - Executar backtesting
- `GET /api/volatility/alerts` - Alertas de volatilidade

## 🔒 Segurança

- API keys armazenadas como variáveis de ambiente
- Validação de entrada em todas as rotas
- Rate limiting para APIs externas
- Logs de segurança e auditoria

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## ⚠️ Disclaimer

Este sistema é para fins educacionais e de pesquisa. Trading de criptomoedas envolve riscos significativos. Sempre faça sua própria pesquisa e considere consultar um consultor financeiro antes de tomar decisões de investimento.

## 📞 Suporte

Para dúvidas e suporte:
- Abra uma issue no GitHub
- Entre em contato via Telegram
- Consulte a documentação

---

**Desenvolvido com ❤️ para a comunidade de trading de criptomoedas**