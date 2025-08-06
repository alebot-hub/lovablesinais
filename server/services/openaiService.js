/**
 * Serviço de integração com a API da OpenAI
 */
import { Logger } from './logger.js';
import OpenAI from 'openai';

const logger = new Logger('OpenAIService');

export default class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Gera análise detalhada usando GPT
   */
  async generateAnalysis(prompt) {
    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4",
        messages: [{
          role: "user",
          content: prompt
        }],
        temperature: 0.7,
        max_tokens: 1000
      });

      // Extrair e formatar a resposta
      const analysis = this.parseResponse(response.choices[0].message.content);
      return analysis;
    } catch (error) {
      logger.error('Erro ao gerar análise com OpenAI:', error);
      throw error;
    }
  }

  /**
   * Parseia a resposta do GPT para o formato desejado
   */
  parseResponse(content) {
    // Implementar lógica de parsing da resposta
    // A resposta do GPT deve seguir um formato específico
    // que será extraído e formatado aqui
    
    // Exemplo de formato esperado:
    return {
      summary: this.extractSummary(content),
      recommendations: this.extractRecommendations(content),
      marketContext: this.extractMarketContext(content),
      riskAssessment: this.extractRiskAssessment(content)
    };
  }

  /**
   * Extrai o resumo da resposta
   */
  extractSummary(content) {
    // Implementar lógica de extração do resumo
    return content.split('### Summary:')[1]?.split('###')[0]?.trim() || 'N/A';
  }

  /**
   * Extrai as recomendações da resposta
   */
  extractRecommendations(content) {
    // Implementar lógica de extração das recomendações
    return content.split('### Recommendations:')[1]?.split('###')[0]?.trim() || 'N/A';
  }

  /**
   * Extrai o contexto do mercado da resposta
   */
  extractMarketContext(content) {
    // Implementar lógica de extração do contexto
    return content.split('### Market Context:')[1]?.split('###')[0]?.trim() || 'N/A';
  }

  /**
   * Extrai a avaliação de risco da resposta
   */
  extractRiskAssessment(content) {
    // Implementar lógica de extração da avaliação de risco
    return content.split('### Risk Assessment:')[1]?.split('###')[0]?.trim() || 'N/A';
  }
}
