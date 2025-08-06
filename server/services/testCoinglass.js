/**
 * Arquivo de teste para verificar integração da API do Coinglass
 */
import dotenv from 'dotenv';
import CoinglassConfigManager from './coinglassConfigManager.js';
import CoinglassValidator from './coinglassValidator.js';
import { CoinglassAnalytics } from './coinglassAnalytics.js';
import { CoinglassHealthMonitor } from './coinglassHealthMonitor.js';

dotenv.config();

// Configuração do serviço
const configManager = new CoinglassConfigManager();
const validator = new CoinglassValidator();
const analytics = new CoinglassAnalytics();
const healthMonitor = new CoinglassHealthMonitor();

async function testCoinglassIntegration() {
  try {
    console.log('🚀 Iniciando teste de integração do Coinglass...');
    
    // Verifica configuração
    const config = configManager.getConfig();
    console.log('✅ Configuração carregada com sucesso');
    console.log(`API URL: ${config.api.baseUrl}`);
    console.log(`Timeout: ${config.api.timeout}ms`);

    // Valida símbolos
    const validSymbols = ['BTC', 'ETH'];
    for (const symbol of validSymbols) {
      const isValid = await validator.validateSymbol(symbol);
      console.log(`✅ Símbolo ${symbol} é válido: ${isValid}`);
    }

    // Testa análise de dados
    console.log('\n📊 Iniciando análise de dados...');
    const analysis = await analytics.analyzeSymbol('BTC');
    console.log('Análise completa:', analysis);

    // Testa monitoramento de saúde
    console.log('\n❤️  Iniciando monitoramento de saúde...');
    healthMonitor.start();
    console.log('Monitoramento de saúde iniciado');

    console.log('\n✅ Teste de integração concluído com sucesso!');
  } catch (error) {
    console.error('❌ Erro no teste de integração:', error);
    process.exit(1);
  }
}

// Executa o teste
if (require.main === module) {
  testCoinglassIntegration();
}
