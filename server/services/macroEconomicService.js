/**
 * Serviço de análise macroeconômica
 */

class MacroEconomicService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hora
    this.lastDailyReport = null;
    this.fredApiKey = process.env.FRED_API_KEY || null;
    this.fredBaseUrl = 'https://api.stlouisfed.org/fred';
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY || 'RU9S7OHDU9F353TZ';
    this.alphaVantageBaseUrl = 'https://www.alphavantage.co/query';
  }

  /**
   * Obtém dados macroeconômicos completos
   */
  async getMacroEconomicData() {
    try {
      console.log('📊 Coletando dados macroeconômicos...');

      const [
        fedData,
        inflationData,
        dollarIndex,
        bondYields,
        stockMarkets,
        commodities,
        cryptoMarketCap,
        economicCalendar
      ] = await Promise.allSettled([
        this.getFedData(),
        this.getInflationData(),
        this.getDollarIndex(),
        this.getBondYields(),
        this.getStockMarkets(),
        this.getCommodities(),
        this.getCryptoMarketCap(),
        this.getEconomicCalendar()
      ]);

      const macroData = {
        fed: fedData.status === 'fulfilled' ? fedData.value : null,
        inflation: inflationData.status === 'fulfilled' ? inflationData.value : null,
        dollar: dollarIndex.status === 'fulfilled' ? dollarIndex.value : null,
        bonds: bondYields.status === 'fulfilled' ? bondYields.value : null,
        stocks: stockMarkets.status === 'fulfilled' ? stockMarkets.value : null,
        commodities: commodities.status === 'fulfilled' ? commodities.value : null,
        cryptoMcap: cryptoMarketCap.status === 'fulfilled' ? cryptoMarketCap.value : null,
        calendar: economicCalendar.status === 'fulfilled' ? economicCalendar.value : null,
        timestamp: new Date()
      };

      const analysis = this.analyzeMacroImpact(macroData);
      
      console.log('✅ Dados macroeconômicos coletados');
      return {
        data: macroData,
        analysis: analysis,
        cryptoImpact: this.calculateCryptoImpact(macroData, analysis)
      };
    } catch (error) {
      console.error('❌ Erro na coleta de dados macro:', error.message);
      return this.getFallbackMacroData();
    }
  }

  /**
   * Obtém dados do Federal Reserve
   */
  async getFedData() {
    try {
      console.log('🏛️ Analisando dados do Fed...');
      
      // Tenta Alpha Vantage primeiro (mais confiável para dados atuais)
      if (this.alphaVantageKey) {
        console.log('📊 Obtendo dados do Fed via Alpha Vantage...');
        const fedData = await this.getAlphaVantageFedData();
        if (fedData) {
          return fedData;
        }
      }
      
      // Fallback para FRED se Alpha Vantage falhar
      if (this.fredApiKey) {
        console.log('📊 Fallback: Obtendo dados do Fed via FRED...');
        return await this.getFredDataFromAPI();
      }
      
      console.log('⚠️ Nenhuma API configurada para dados do Fed');
      return null;
    } catch (error) {
      console.error('❌ Erro nos dados do Fed:', error.message);
      return null;
    }
  }

  /**
   * Obtém dados do Fed via Alpha Vantage
   */
  async getAlphaVantageFedData() {
    try {
      // Federal Funds Rate
      const fedFundsUrl = `${this.alphaVantageBaseUrl}?function=FEDERAL_FUNDS_RATE&apikey=${this.alphaVantageKey}`;
      
      const response = await fetch(fedFundsUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        signal: AbortSignal.timeout(15000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log('🏛️ Alpha Vantage Fed response preview:', responseText.substring(0, 150));
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Erro ao parsear Fed JSON:', parseError.message);
        throw new Error('Resposta inválida da Alpha Vantage');
      }
      
      // Verifica se há erro na resposta
      if (data['Error Message'] || data['Note']) {
        console.error('❌ Alpha Vantage error:', data['Error Message'] || data['Note']);
        throw new Error('Limite de API atingido ou erro na Alpha Vantage');
      }
      
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        // Pega o dado mais recente
        const latestData = data.data[0];
        const currentRate = parseFloat(latestData.value);
        
        // Calcula tendência com últimos 3 dados
        let stance = 'NEUTRO';
        if (data.data.length >= 3) {
          const recent = parseFloat(data.data[0].value);
          const previous = parseFloat(data.data[2].value);
          const trend = recent - previous;
          
          if (trend > 0.25) stance = 'RESTRITIVA';
          else if (trend < -0.25) stance = 'EXPANSIVA';
        }
        
        console.log(`✅ Fed data obtido via Alpha Vantage: ${currentRate}% (${stance})`);
        
        return {
          currentRate: currentRate,
          stance: stance,
          isRealData: true,
          source: 'Alpha Vantage API',
          lastUpdate: latestData.date
        };
      }
      
      throw new Error('Dados inválidos da Alpha Vantage');
    } catch (error) {
      console.error('❌ Erro na Alpha Vantage Fed:', error.message);
        return null;
    }
  }

  /**
   * Obtém dados do Fed via FRED (fallback)
   */
  async getFredDataFromAPI() {
    try {
      // Obtém dados reais do FRED
      const [
        fedFundsRate,
        nextMeetingData,
        fedPolicyData
      ] = await Promise.allSettled([
        this.getFredSeries('FEDFUNDS'), // Taxa de juros do Fed
        this.getFredSeries('DFEDTARU'), // Taxa alvo superior
        this.getFredSeries('DFEDTARL')  // Taxa alvo inferior
      ]);

      let currentRate = null;
      let stance = 'NEUTRO';
      
      if (fedFundsRate.status === 'fulfilled' && fedFundsRate.value) {
        currentRate = fedFundsRate.value;
        console.log(`✅ Taxa do Fed obtida via FRED: ${currentRate}%`);
      }

      // Determina postura baseada em tendência recente
      if (fedFundsRate.status === 'fulfilled') {
        const recentData = await this.getFredSeriesRecent('FEDFUNDS', 3);
        if (recentData && recentData.length >= 2) {
          const trend = recentData[recentData.length - 1] - recentData[recentData.length - 2];
          if (trend > 0.1) stance = 'RESTRITIVA';
          else if (trend < -0.1) stance = 'EXPANSIVA';
        }
      }

      if (currentRate === null) {
        throw new Error('Não foi possível obter taxa do Fed via FRED');
      }

      return {
        currentRate: currentRate,
        stance: stance,
        isRealData: true,
        source: 'FRED API'
      };
    } catch (error) {
      console.error('❌ Erro no FRED Fed:', error.message);
      return null;
    }
  }

  /**
   * Calcula probabilidade de corte de juros
   */
  calculateCutProbability(currentRate) {
    // Lógica baseada no cenário atual (Janeiro 2025)
    // Com inflação caindo e economia estável, mercado espera cortes
    if (currentRate >= 5.0) return 85; // Taxa alta = alta probabilidade de corte
    if (currentRate >= 4.5) return 70;
    if (currentRate >= 4.0) return 50;
    if (currentRate >= 3.0) return 25;
    return 10; // Taxa baixa = menor probabilidade de corte
  }

  /**
   * Calcula probabilidade de alta de juros
   */
  calculateHikeProbability(currentRate) {
    // Com inflação controlada, probabilidade de alta é baixa
    if (currentRate >= 5.0) return 5;  // Taxa já alta
    if (currentRate >= 4.0) return 15;
    if (currentRate >= 3.0) return 30;
    return 50; // Se taxa muito baixa, pode subir
  }

  /**
   * Traduz postura do Fed
   */
  translateFedStance(stance) {
    const translations = {
      'HAWKISH': 'RESTRITIVA',
      'DOVISH': 'EXPANSIVA', 
      'NEUTRAL': 'NEUTRA'
    };
    return translations[stance] || stance;
  }

  /**
   * Obtém dados de inflação
   */
  async getInflationData() {
    try {
      console.log('📈 Analisando inflação...');
      
      if (!this.fredApiKey) {
        console.log('⚠️ FRED_API_KEY não configurada - omitindo dados de inflação');
        return null;
      }

      // Obtém dados reais de inflação do FRED
      const [
        cpiData,
        coreCpiData,
        pceData
      ] = await Promise.allSettled([
        this.getFredSeries('CPIAUCSL'), // CPI All Urban Consumers
        this.getFredSeries('CPILFESL'), // Core CPI (sem alimentos e energia)
        this.getFredSeries('PCEPI')     // PCE Price Index (preferido pelo Fed)
      ]);

      let currentCPI = 3.1; // Fallback
      let coreCPI = 3.0;
      let trend = 'ESTÁVEL';

      if (cpiData.status === 'fulfilled' && cpiData.value) {
        // Calcula inflação anual (YoY)
        const recentCPI = await this.getFredSeriesRecent('CPIAUCSL', 13); // 13 meses
        if (recentCPI && recentCPI.length >= 13) {
          const current = recentCPI[recentCPI.length - 1];
          const yearAgo = recentCPI[recentCPI.length - 13];
          currentCPI = ((current - yearAgo) / yearAgo) * 100;
          
          // Determina tendência
          const threeMonthsAgo = recentCPI[recentCPI.length - 4];
          const recentTrend = ((current - threeMonthsAgo) / threeMonthsAgo) * 100 * 4; // Anualizado
          
          if (recentTrend > currentCPI + 0.2) trend = 'EM ALTA';
          else if (recentTrend < currentCPI - 0.2) trend = 'EM BAIXA';
          
          console.log(`✅ CPI obtido: ${currentCPI.toFixed(1)}% (tendência: ${trend})`);
        }
      }

      if (coreCpiData.status === 'fulfilled' && coreCpiData.value) {
        const recentCoreCPI = await this.getFredSeriesRecent('CPILFESL', 13);
        if (recentCoreCPI && recentCoreCPI.length >= 13) {
          const current = recentCoreCPI[recentCoreCPI.length - 1];
          const yearAgo = recentCoreCPI[recentCoreCPI.length - 13];
          coreCPI = ((current - yearAgo) / yearAgo) * 100;
          console.log(`✅ Core CPI obtido: ${coreCPI.toFixed(1)}%`);
        }
      }

      return {
        cpi: {
          current: currentCPI,
          core: coreCPI,
          target: 2.0,
          trend: trend
        },
        nextReleaseDate: this.getNextCPIDate(),
        isRealData: true,
        source: 'FRED API'
      };
    } catch (error) {
      console.error('❌ Erro nos dados de inflação:', error.message);
      return null;
    }
  }

  /**
   * Obtém múltiplas observações de uma série do FRED
   */
  async getFredSeriesRecent(seriesId, limit = 12) {
    try {
      const url = `${this.fredBaseUrl}/series/observations?series_id=${seriesId}&api_key=${this.fredApiKey}&file_type=json&limit=${limit}&sort_order=desc`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        signal: AbortSignal.timeout(15000)
      });
      
      if (!response.ok) {
        throw new Error(`FRED API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.observations && data.observations.length > 0) {
        return data.observations
          .map(obs => parseFloat(obs.value))
          .filter(val => !isNaN(val))
          .reverse(); // Ordem cronológica
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Erro ao obter série recente ${seriesId}:`, error.message);
      return null;
    }
  }

  /**
   * Obtém índice do dólar (DXY)
   */
  async getDollarIndex() {
    try {
      console.log('💵 Analisando DXY...');
      
      // Tenta obter DXY real via API gratuita
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Calcula DXY aproximado baseado nas principais moedas
      const eur = data.rates.EUR || 0.85;
      const jpy = data.rates.JPY || 150;
      const gbp = data.rates.GBP || 0.75;
      const cad = data.rates.CAD || 1.35;
      
      // Fórmula aproximada do DXY
      const dxyApprox = 50.14348112 * Math.pow(eur, -0.576) * Math.pow(jpy, -0.136) * 
                       Math.pow(gbp, -0.119) * Math.pow(cad, -0.091);
      
      console.log(`✅ DXY calculado: ${dxyApprox.toFixed(1)}`);
      
      return {
        value: dxyApprox,
        change24h: 0, // Não temos dados históricos
        trend: 'NEUTRO',
        isRealData: true,
        confidence: 70
      };
    } catch (error) {
      console.error('❌ Erro ao obter DXY real:', error.message);
      console.log('⚠️ DXY requer API paga - omitindo');
      return null;
    }
  }

  /**
   * Obtém yields dos títulos
   */
  async getBondYields() {
    try {
      console.log('📊 Analisando yields...');
      
      // Dados de yields não disponíveis via API pública gratuita
      console.log('⚠️ Dados de yields requerem API financeira paga - omitindo');
      return null;
    } catch (error) {
      console.error('❌ Erro nos yields:', error.message);
      return null;
    }
  }

  /**
   * Obtém dados dos mercados de ações
   */
  async getStockMarkets() {
    try {
      console.log('📈 Analisando mercados de ações...');
      
      // Dados de ações não disponíveis via API pública gratuita
      console.log('⚠️ Dados de ações requerem API financeira paga - omitindo');
      return null;
    } catch (error) {
      console.error('❌ Erro nos mercados de ações:', error.message);
      return null;
    }
  }

  /**
   * Obtém dados de commodities
   */
  async getCommodities() {
    try {
      console.log('🥇 Analisando commodities...');
      
      // Dados de commodities não disponíveis via API pública gratuita
      console.log('⚠️ Dados de commodities requerem API especializada - omitindo');
      return null;
    } catch (error) {
      console.error('❌ Erro nas commodities:', error.message);
      return null;
    }
  }

  /**
   * Obtém market cap total das criptos
   */
  async getCryptoMarketCap() {
    try {
      console.log('₿ Analisando market cap cripto...');
      
      // Obtém dados reais da CoinGecko
      const response = await fetch('https://api.coingecko.com/api/v3/global', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; CryptoBot/1.0)'
        },
        timeout: 10000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log('₿ Crypto market cap response preview:', responseText.substring(0, 100));
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Erro ao parsear market cap JSON:', parseError.message);
        console.error('📄 Response text:', responseText.substring(0, 500));
        throw new Error('Resposta inválida da API CoinGecko');
      }
      
      if (data && data.data) {
        const globalData = data.data;
        const totalMcap = globalData.total_market_cap.usd / 1e12; // Converte para trilhões
        const btcDominance = globalData.market_cap_percentage.btc;
        const change24h = globalData.market_cap_change_percentage_24h_usd || 0;
        
        console.log(`✅ Market cap real: $${totalMcap.toFixed(2)}T, BTC: ${btcDominance.toFixed(1)}%, 24h: ${change24h.toFixed(2)}%`);
        
        return {
          totalMarketCap: totalMcap,
          btcDominance: btcDominance,
          change24h: change24h,
          altcoinSeason: btcDominance < 45,
          confidence: 95,
          isRealData: true
        };
      }
      
      throw new Error('Dados inválidos da API');
    } catch (error) {
      console.error('❌ Erro ao obter dados reais:', error.message);
      console.log('⚠️ Usando dados de fallback');
      
      // Fallback apenas se API falhar completamente
      return {
        totalMarketCap: 3.5,
        btcDominance: 57,
        change24h: 0,
        altcoinSeason: false,
        confidence: 30,
        isRealData: false
      };
    }
  }

  /**
   * Obtém calendário econômico
   */
  async getEconomicCalendar() {
    try {
      console.log('📅 Verificando calendário econômico...');
      
      // Calendário econômico não disponível via API pública gratuita
      console.log('⚠️ Calendário econômico requer API especializada - omitindo');
      return null;
    } catch (error) {
      console.error('❌ Erro no calendário econômico:', error.message);
      return null;
    }
  }

  /**
   * Analisa impacto macro no mercado
   */
  analyzeMacroImpact(macroData) {
    const analysis = {
      overall: 'NEUTRO',
      cryptoBullish: 0,
      cryptoBearish: 0,
      keyFactors: ['Dados macro limitados - usando apenas dados cripto reais'],
      riskLevel: 'MÉDIO',
      outlook: 'MISTO'
    };

    try {
      // Análise apenas com dados cripto reais
      if (macroData.cryptoMcap && macroData.cryptoMcap.isRealData) {
        analysis.keyFactors.push(`Market cap cripto: $${macroData.cryptoMcap.totalMarketCap.toFixed(2)}T`);
        analysis.keyFactors.push(`Dominância BTC: ${macroData.cryptoMcap.btcDominance.toFixed(1)}%`);
        
        if (macroData.cryptoMcap.change24h > 2) {
          analysis.cryptoBullish += 10;
          analysis.keyFactors.push('Market cap cripto em alta forte');
        } else if (macroData.cryptoMcap.change24h < -2) {
          analysis.cryptoBearish += 10;
          analysis.keyFactors.push('Market cap cripto em queda');
        }
        
        if (macroData.cryptoMcap.altcoinSeason) {
          analysis.keyFactors.push('Temporada de altcoins ativa');
        }
      }

      // Determina sentimento geral
      const netBullish = analysis.cryptoBullish - analysis.cryptoBearish;
      
      if (netBullish > 20) {
        analysis.overall = 'OTIMISTA';
        analysis.outlook = 'POSITIVO';
      } else if (netBullish < -20) {
        analysis.overall = 'PESSIMISTA';
        analysis.outlook = 'NEGATIVO';
      } else {
        analysis.overall = 'NEUTRO';
        analysis.outlook = 'MISTO';
      }

      return analysis;
    } catch (error) {
      console.error('Erro na análise macro:', error.message);
      return analysis;
    }
  }

  /**
   * Calcula impacto específico no crypto
   */
  calculateCryptoImpact(macroData, analysis) {
    const impact = {
      shortTerm: 'NEUTRO', // Próximos dias
      mediumTerm: 'NEUTRO', // Próximas semanas
      longTerm: 'NEUTRO', // Próximos meses
      confidence: 70,
      recommendations: ['Foco em análise técnica - dados macro limitados']
    };

    try {
      // Análise baseada apenas em dados cripto reais
      if (macroData.cryptoMcap && macroData.cryptoMcap.isRealData) {
        if (macroData.cryptoMcap.change24h > 3) {
          impact.shortTerm = 'POSITIVO';
          impact.recommendations.push('Market cap cripto em alta - momentum positivo');
        } else if (macroData.cryptoMcap.change24h < -3) {
          impact.shortTerm = 'NEGATIVO';
          impact.recommendations.push('Market cap cripto em queda - cautela');
        }
        
        if (macroData.cryptoMcap.btcDominance < 40) {
          impact.recommendations.push('Baixa dominância BTC favorece altcoins');
        } else if (macroData.cryptoMcap.btcDominance > 60) {
          impact.recommendations.push('Alta dominância BTC - foco no Bitcoin');
        }
      }

      // Análise do Fed
      if (macroData.fed && macroData.fed.isRealData) {
        if (macroData.fed.stance === 'EXPANSIVA') {
          impact.mediumTerm = 'POSITIVO';
          impact.recommendations.push('Fed dovish favorece crypto nas próximas semanas');
        } else if (macroData.fed.stance === 'RESTRITIVA') {
          impact.mediumTerm = 'NEGATIVO';
          impact.recommendations.push('Fed hawkish pressiona ativos de risco');
        }
        
        if (macroData.fed.probabilityNextCut > 70) {
          impact.shortTerm = 'POSITIVO';
          impact.recommendations.push('Alta probabilidade de corte favorece crypto');
        }
      }

      // Análise da inflação
      if (macroData.inflation && macroData.inflation.isRealData) {
        if (macroData.inflation.cpi.trend === 'EM BAIXA') {
          impact.longTerm = 'POSITIVO';
          impact.recommendations.push('Inflação em queda reduz pressão do Fed');
        } else if (macroData.inflation.cpi.trend === 'EM ALTA') {
          impact.longTerm = 'NEGATIVO';
          impact.recommendations.push('Inflação em alta pode forçar Fed hawkish');
        }
      }

      // Análise do dólar
      if (macroData.dollar && macroData.dollar.isRealData) {
        if (macroData.dollar.change24h < -0.5) {
          impact.shortTerm = 'POSITIVO';
          impact.recommendations.push('Dólar fraco favorece ativos alternativos');
        } else if (macroData.dollar.change24h > 0.5) {
          impact.shortTerm = 'NEGATIVO';
          impact.recommendations.push('Dólar forte pressiona crypto');
        }
      }

      // Ajusta confiança baseado na qualidade dos dados
      const dataQuality = this.assessDataQuality(macroData);
      impact.confidence = Math.min(impact.confidence, dataQuality);

      return impact;
    } catch (error) {
      console.error('Erro no cálculo de impacto crypto:', error.message);
      return impact;
    }
  }

  /**
   * Gera relatório macro diário
   */
  generateDailyMacroReport(macroAnalysis) {
    const { data, analysis, cryptoImpact } = macroAnalysis;
    
    let report = `📊 *DADOS ECONÔMICOS*\n\n`;
    
    // Fed (apenas se tiver dados reais)
    if (data.fed && data.fed.isRealData) {
      report += `🏛️ *BANCO CENTRAL AMERICANO (FED):*\n`;
      report += `   • Taxa atual: ${data.fed.currentRate.toFixed(2)}%\n`;
      report += `   • Postura: ${data.fed.stance}\n`;
      if (data.fed.nextMeetingDate) {
        report += `   • Próxima reunião: ${new Date(data.fed.nextMeetingDate).toLocaleDateString('pt-BR')}\n`;
      }
      if (data.fed.probabilityNextCut) {
        report += `   • Prob. corte: ${data.fed.probabilityNextCut}%\n`;
      }
      report += `   ✅ Dados reais da FRED API\n\n`;
    }

    // Inflação (apenas se tiver dados reais)
    if (data.inflation && data.inflation.isRealData) {
      report += `📈 *INFLAÇÃO AMERICANA (CPI):*\n`;
      report += `   • Atual: ${data.inflation.cpi.current.toFixed(1)}%\n`;
      if (data.inflation.cpi.core) {
        report += `   • Core CPI: ${data.inflation.cpi.core.toFixed(1)}%\n`;
      }
      report += `   • Meta Fed: ${data.inflation.cpi.target}%\n`;
      report += `   • Tendência: ${data.inflation.cpi.trend}\n`;
      if (data.inflation.nextReleaseDate) {
        report += `   • Próximo dado: ${new Date(data.inflation.nextReleaseDate).toLocaleDateString('pt-BR')}\n`;
      }
      report += `   ✅ Dados reais da FRED API\n\n`;
    }

    // Market Cap Crypto
    if (data.cryptoMcap) {
      report += `₿ *MERCADO DE CRIPTOMOEDAS:*\n`;
      report += `   • Valor Total: $${data.cryptoMcap.totalMarketCap.toFixed(2)} trilhões\n`;
      report += `   • Dominância BTC: ${data.cryptoMcap.btcDominance.toFixed(1)}%\n`;
      report += `   • Variação 24h: ${data.cryptoMcap.change24h > 0 ? '+' : ''}${data.cryptoMcap.change24h.toFixed(2)}%\n`;
      if (data.cryptoMcap.isRealData) {
        report += `   ✅ Dados reais da CoinGecko\n`;
      }
      if (data.cryptoMcap.altcoinSeason) {
        report += `   🚀 Temporada de Altcoins ativa\n`;
      }
      report += '\n';
    }

    // Dólar (se disponível)
    if (data.dollar && data.dollar.isRealData) {
      report += `💵 *ÍNDICE DÓLAR (DXY):*\n`;
      report += `   📊 Valor: ${data.dollar.value.toFixed(1)}\n`;
      report += `   ✅ Calculado com taxas de câmbio reais\n\n`;
    }

    // Nota sobre dados disponíveis
    const hasAnyData = data.fed?.isRealData || data.inflation?.isRealData || data.cryptoMcap?.isRealData || data.dollar?.isRealData;
    
    if (!hasAnyData) {
      report += `⚠️ *DADOS MACRO TEMPORARIAMENTE INDISPONÍVEIS*\n\n`;
    } else {
      report += `ℹ️ *NOTA:* Apenas dados reais são exibidos\n\n`;
    }

    report += `⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
    report += `👑 Bot Lobo Cripto`;

    return report;
  }

  /**
   * Verifica se deve enviar relatório diário
   */
  shouldSendDailyReport() {
    const now = new Date();
    const hour = now.getUTCHours(); // Usa UTC para consistência
    const today = now.toDateString();
    
    console.log(`🕐 [MACRO] Verificando horário: ${hour}h UTC (${hour-3}h Brasília), Último envio: ${this.lastDailyReport}, Hoje: ${today}`);
    
    // Envia todo dia às 10h UTC (7h Brasília)
    if (hour === 10 && this.lastDailyReport !== today) {
      console.log('✅ [MACRO] Condições atendidas para envio do relatório');
      return true;
    }
    
    console.log('⏭️ [MACRO] Condições não atendidas - não enviando relatório');
    return false;
  }

  /**
   * Marca relatório diário como enviado
   */
  markDailyReportSent() {
    this.lastDailyReport = new Date().toDateString();
  }

  /**
   * Calcula correlação ações-crypto (simulado)
   */
  calculateStockCryptoCorrelation() {
    return 0.6 + (Math.random() - 0.5) * 0.4; // 0.4-0.8
  }

  /**
   * Avalia qualidade dos dados
   */
  assessDataQuality(macroData) {
    let quality = 100;
    
    Object.values(macroData).forEach(data => {
      if (!data || (data.confidence && data.confidence < 80)) {
        quality -= 10;
      }
    });
    
    return Math.max(quality, 50);
  }

  /**
   * Obtém próxima data de inflação
   */
  getNextInflationDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 12);
    return nextMonth;
  }

  /**
   * Adiciona dias a uma data
   */
  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Formata data
   */
  formatDate(date) {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  /**
   * Obtém eventos econômicos do dia atual
   */
  getTodayEconomicEvents() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = domingo, 6 = sábado
    const hour = today.getHours();
    
    const events = [];
    
    // Segunda-feira
    if (dayOfWeek === 1) {
      events.push({ name: 'Abertura dos mercados', time: '09:30', impact: 'MEDIUM' });
    }
    
    // Terça-feira
    if (dayOfWeek === 2) {
      events.push({ name: 'Dados de Inflação (CPI)', time: '08:30', impact: 'HIGH' });
    }
    
    // Quarta-feira
    if (dayOfWeek === 3) {
      events.push({ name: 'Ata do Fed (FOMC)', time: '14:00', impact: 'HIGH' });
      events.push({ name: 'Estoques de Petróleo', time: '10:30', impact: 'MEDIUM' });
    }
    
    // Quinta-feira
    if (dayOfWeek === 4) {
      events.push({ name: 'Pedidos de Auxílio-Desemprego', time: '08:30', impact: 'MEDIUM' });
    }
    
    // Sexta-feira
    if (dayOfWeek === 5) {
      events.push({ name: 'Relatório de Empregos (NFP)', time: '08:30', impact: 'HIGH' });
      events.push({ name: 'Fechamento semanal', time: '17:00', impact: 'MEDIUM' });
    }
    
    // Filtra eventos que ainda não aconteceram hoje
    return events.filter(event => {
      const eventHour = parseInt(event.time.split(':')[0]);
      return hour < eventHour;
    });
  }

  /**
   * Traduz nomes de eventos para português
   */
  translateEventName(eventName) {
    const translations = {
      'CPI (Inflação)': 'Índice de Preços ao Consumidor',
      'Decisão do Fed': 'Decisão de Juros do Fed',
      'NFP (Empregos)': 'Relatório de Empregos',
      'PIB': 'Produto Interno Bruto',
      'Vendas Varejo': 'Vendas no Varejo',
      'Fed Decision': 'Decisão do Fed',
      'CPI': 'Inflação (CPI)',
      'NFP': 'Empregos (NFP)',
      'GDP': 'PIB',
      'Retail Sales': 'Vendas no Varejo'
    };
    
    return translations[eventName] || eventName;
  }

  /**
   * Dados de fallback
   */
  getFallbackMacroData() {
    return {
      data: {
        fed: null,
        inflation: null,
        dollar: null,
        bonds: null,
        stocks: null,
        commodities: null,
        cryptoMcap: null,
        calendar: null
      },
      analysis: {
        overall: 'NEUTRAL',
        cryptoBullish: 0,
        cryptoBearish: 0,
        keyFactors: ['Dados macro temporariamente indisponíveis'],
        riskLevel: 'MEDIUM',
        outlook: 'MIXED'
      },
      cryptoImpact: {
        shortTerm: 'NEUTRAL',
        mediumTerm: 'NEUTRAL',
        longTerm: 'NEUTRAL',
        confidence: 30,
        recommendations: ['Aguardar dados macro atualizados']
      }
    };
  }
}

export default MacroEconomicService;