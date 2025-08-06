/**
 * Exemplo de uso do serviço de análise de sentimento integrado
 */
import dotenv from 'dotenv';
import CoinglassSentimentAnalyzer from './coinglassSentimentAnalyzer.js';

dotenv.config();

async function analyzeIntegratedSentiment() {
  try {
    const analyzer = new CoinglassSentimentAnalyzer();
    
    // Analisa BTC como exemplo
    const symbol = 'BTC';
    const analysis = await analyzer.analyzeIntegratedSentiment(symbol);

    console.log('\n📊 Relatório de Análise Integrada para', symbol);
    console.log('----------------------------------------');
    
    // Exibe métricas do Coinglass
    console.log('\n📊 Métricas do Coinglass:');
    console.log('Taxa de Funding:', analysis.coinglassMetrics.fundingRate.magnitude.toFixed(2), '%');
    console.log('Ratio Long/Short:', analysis.coinglassMetrics.longShortRatio.magnitude.toFixed(2), '%');
    console.log('Open Interest:', analysis.coinglassMetrics.openInterest.change.toFixed(2), '%');
    console.log('Volume:', analysis.coinglassMetrics.volume.change.toFixed(2), '%');

    // Exibe sentimento social
    console.log('\n👥 Sentimento Social:');
    console.log('Sentimento Geral:', analysis.socialSentiment.overallSentiment.toFixed(2), '/100');
    console.log('Twitter:', analysis.socialSentiment.twitter?.sentiment.toFixed(2), '/100');
    console.log('Reddit:', analysis.socialSentiment.reddit?.sentiment.toFixed(2), '/100');

    // Exibe sentimento integrado
    console.log('\n🎯 Sentimento Integrado:', analysis.integratedSentiment.toFixed(2), '/100');

    // Exibe insights
    console.log('\n💡 Insights:');
    analysis.insights.forEach((insight, index) => {
      console.log(`${index + 1}. ${insight}`);
    });

  } catch (error) {
    console.error('❌ Erro ao gerar relatório:', error.message);
  }
}

// Executa análise quando o arquivo é executado diretamente
if (require.main === module) {
  analyzeIntegratedSentiment();
}
