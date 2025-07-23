/**
 * Serviço de análise macroeconômica
 */

class MacroEconomicService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hora
    this.lastDailyReport = null;
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
      
      // Simula dados do Fed (em produção, usar FRED API)
      const fedFundsRate = 5.25 + (Math.random() - 0.5) * 0.5; // 5.0-5.5%
      const lastMeeting = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 dias atrás
      const nextMeeting = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 dias
      
      const scenarios = ['HAWKISH', 'NEUTRAL', 'DOVISH'];
      const stance = scenarios[Math.floor(Math.random() * scenarios.length)];
      
      return {
        currentRate: fedFundsRate,
        previousRate: fedFundsRate - 0.25,
        nextMeetingDate: nextMeeting,
        lastMeetingDate: lastMeeting,
        stance: this.translateFedStance(stance),
        probabilityNextHike: stance === 'HAWKISH' ? 75 : stance === 'NEUTRAL' ? 25 : 5,
        probabilityNextCut: stance === 'DOVISH' ? 70 : stance === 'NEUTRAL' ? 30 : 10,
        qeStatus: 'REDUZINDO', // EXPANDINDO, REDUZINDO, NEUTRO
        balanceSheet: 8.2, // Trilhões USD
        confidence: 85
      };
    } catch (error) {
      console.error('❌ Erro nos dados do Fed:', error.message);
      return null;
    }
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
      
      // Simula dados de inflação (em produção, usar APIs oficiais)
      const cpiCurrent = 3.2 + (Math.random() - 0.5) * 0.8; // 2.8-3.6%
      const cpiPrevious = cpiCurrent + (Math.random() - 0.5) * 0.3;
      const cpiTarget = 2.0;
      
      return {
        cpi: {
          current: cpiCurrent,
          previous: cpiPrevious,
          target: cpiTarget,
          trend: cpiCurrent > cpiPrevious ? 'SUBINDO' : 'CAINDO'
        },
        pce: {
          current: cpiCurrent - 0.3,
          target: 2.0
        },
        nextReleaseDate: this.getNextInflationDate(),
        aboveTarget: cpiCurrent > cpiTarget,
        confidence: 90
      };
    } catch (error) {
      console.error('❌ Erro nos dados de inflação:', error.message);
      return null;
    }
  }

  /**
   * Obtém índice do dólar (DXY)
   */
  async getDollarIndex() {
    try {
      console.log('💵 Analisando DXY...');
      
      // Simula DXY (em produção, usar APIs financeiras)
      const dxyValue = 103.5 + (Math.random() - 0.5) * 4; // 101.5-105.5
      const dxyChange = (Math.random() - 0.5) * 2; // -1% a +1%
      
      return {
        value: dxyValue,
        change24h: dxyChange,
        trend: dxyChange > 0 ? 'FORTALECENDO' : 'ENFRAQUECENDO',
        resistance: 106.0,
        support: 101.0,
        confidence: 80
      };
    } catch (error) {
      console.error('❌ Erro no DXY:', error.message);
      return null;
    }
  }

  /**
   * Obtém yields dos títulos
   */
  async getBondYields() {
    try {
      console.log('📊 Analisando yields...');
      
      // Simula yields (em produção, usar APIs financeiras)
      const yield10y = 4.2 + (Math.random() - 0.5) * 0.6; // 3.9-4.5%
      const yield2y = 4.8 + (Math.random() - 0.5) * 0.4; // 4.6-5.0%
      const yieldCurve = yield10y - yield2y; // Curva invertida se negativo
      
      return {
        treasury10y: yield10y,
        treasury2y: yield2y,
        yieldCurve: yieldCurve,
        curveStatus: yieldCurve < 0 ? 'INVERTIDA' : yieldCurve < 0.5 ? 'PLANA' : 'NORMAL',
        recessionSignal: yieldCurve < -0.5,
        confidence: 85
      };
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
      
      // Simula dados de ações (em produção, usar APIs financeiras)
      const sp500Change = (Math.random() - 0.5) * 3; // -1.5% a +1.5%
      const nasdaqChange = (Math.random() - 0.5) * 4; // -2% a +2%
      const vixValue = 18 + Math.random() * 12; // 18-30
      
      return {
        sp500: {
          change: sp500Change,
          trend: sp500Change > 0 ? 'ALTA' : 'BAIXA'
        },
        nasdaq: {
          change: nasdaqChange,
          trend: nasdaqChange > 0 ? 'ALTA' : 'BAIXA'
        },
        vix: {
          value: vixValue,
          level: vixValue < 20 ? 'BAIXO' : vixValue < 30 ? 'MODERADO' : 'ALTO'
        },
        correlation: this.calculateStockCryptoCorrelation(),
        confidence: 75
      };
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
      
      // Simula commodities (em produção, usar APIs especializadas)
      const goldChange = (Math.random() - 0.5) * 2; // -1% a +1%
      const oilChange = (Math.random() - 0.5) * 4; // -2% a +2%
      
      return {
        gold: {
          change: goldChange,
          trend: goldChange > 0 ? 'SUBINDO' : 'CAINDO',
          safeHaven: true
        },
        oil: {
          change: oilChange,
          trend: oilChange > 0 ? 'SUBINDO' : 'CAINDO'
        },
        confidence: 70
      };
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
      
      const today = new Date();
      const events = [];
      
      // Simula eventos importantes (em produção, usar APIs de calendário)
      const eventTypes = [
        { name: 'CPI (Inflação)', impact: 'HIGH', date: this.addDays(today, 2) },
        { name: 'Decisão do Fed', impact: 'HIGH', date: this.addDays(today, 8) },
        { name: 'NFP (Empregos)', impact: 'MEDIUM', date: this.addDays(today, 5) },
        { name: 'PIB', impact: 'MEDIUM', date: this.addDays(today, 12) },
        { name: 'Vendas Varejo', impact: 'LOW', date: this.addDays(today, 3) }
      ];
      
      // Adiciona eventos dos próximos 14 dias
      eventTypes.forEach(event => {
        if (event.date <= this.addDays(today, 14)) {
          events.push({
            ...event,
            daysUntil: Math.ceil((event.date - today) / (1000 * 60 * 60 * 24))
          });
        }
      });
      
      return {
        upcomingEvents: events.sort((a, b) => a.daysUntil - b.daysUntil),
        highImpactEvents: events.filter(e => e.impact === 'HIGH').length,
        confidence: 100
      };
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
      keyFactors: [],
      riskLevel: 'MÉDIO',
      outlook: 'MISTO'
    };

    try {
      // Análise do Fed
      if (macroData.fed) {
        if (macroData.fed.stance === 'EXPANSIVA') {
          analysis.cryptoBullish += 25;
          analysis.keyFactors.push('Fed dovish - favorece ativos de risco');
        } else if (macroData.fed.stance === 'RESTRITIVA') {
          analysis.cryptoBearish += 20;
          analysis.keyFactors.push('Fed hawkish - pressiona ativos de risco');
        }
        
        if (macroData.fed.probabilityNextCut > 50) {
          analysis.cryptoBullish += 15;
          analysis.keyFactors.push('Alta probabilidade de corte de juros');
        }
      }

      // Análise da inflação
      if (macroData.inflation) {
        if (macroData.inflation.cpi.trend === 'CAINDO' && macroData.inflation.cpi.current > 3) {
          analysis.cryptoBullish += 20;
          analysis.keyFactors.push('Inflação em queda - reduz pressão do Fed');
        } else if (macroData.inflation.cpi.trend === 'SUBINDO') {
          analysis.cryptoBearish += 15;
          analysis.keyFactors.push('Inflação subindo - pode endurecer política monetária');
        }
      }

      // Análise do dólar
      if (macroData.dollar) {
        if (macroData.dollar.trend === 'ENFRAQUECENDO') {
          analysis.cryptoBullish += 15;
          analysis.keyFactors.push('Dólar enfraquecendo - favorece crypto');
        } else if (macroData.dollar.trend === 'FORTALECENDO') {
          analysis.cryptoBearish += 10;
          analysis.keyFactors.push('Dólar fortalecendo - pressiona crypto');
        }
      }

      // Análise dos yields
      if (macroData.bonds) {
        if (macroData.bonds.curveStatus === 'INVERTIDA') {
          analysis.cryptoBearish += 15;
          analysis.keyFactors.push('Curva de juros invertida - sinal de recessão');
          analysis.riskLevel = 'ALTO';
        }
        
        if (macroData.bonds.treasury10y > 4.5) {
          analysis.cryptoBearish += 10;
          analysis.keyFactors.push('Yields altos competem com crypto');
        }
      }

      // Análise das ações
      if (macroData.stocks) {
        if (macroData.stocks.sp500.trend === 'ALTA' && macroData.stocks.nasdaq.trend === 'ALTA') {
          analysis.cryptoBullish += 10;
          analysis.keyFactors.push('Mercado de ações em alta - risk-on');
        }
        
        if (macroData.stocks.vix.level === 'ALTO') {
          analysis.cryptoBearish += 15;
          analysis.keyFactors.push('VIX alto - aversão ao risco');
          analysis.riskLevel = 'ALTO';
        }
      }

      // Análise de commodities
      if (macroData.commodities) {
        if (macroData.commodities.gold.trend === 'SUBINDO') {
          analysis.cryptoBullish += 5;
          analysis.keyFactors.push('Ouro subindo - busca por reserva de valor');
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
      recommendations: []
    };

    try {
      const netScore = analysis.cryptoBullish - analysis.cryptoBearish;
      
      // Impacto de curto prazo
      if (netScore > 15) {
        impact.shortTerm = 'POSITIVO';
        impact.recommendations.push('Ambiente macro favorável para posições long');
      } else if (netScore < -15) {
        impact.shortTerm = 'NEGATIVO';
        impact.recommendations.push('Cautela com posições long - macro desfavorável');
      }

      // Impacto de médio prazo
      if (macroData.fed && macroData.fed.stance === 'EXPANSIVA') {
        impact.mediumTerm = 'POSITIVO';
        impact.recommendations.push('Fed dovish favorece crypto nas próximas semanas');
      } else if (macroData.bonds && macroData.bonds.recessionSignal) {
        impact.mediumTerm = 'NEGATIVO';
        impact.recommendations.push('Sinais de recessão podem pressionar crypto');
      }

      // Impacto de longo prazo
      if (macroData.inflation && macroData.inflation.cpi.current > 4) {
        impact.longTerm = 'POSITIVO';
        impact.recommendations.push('Inflação alta favorece Bitcoin como reserva de valor');
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
    
    // Resumo executivo
    const overallEmoji = analysis.overall === 'BULLISH' ? '🟢' : 
                        analysis.overall === 'BEARISH' ? '🔴' : '🟡';
    
    const overallText = analysis.overall === 'BULLISH' ? 'OTIMISTA' : 
                       analysis.overall === 'BEARISH' ? 'PESSIMISTA' : 'NEUTRO';
    
    const impactText = cryptoImpact.shortTerm === 'POSITIVE' ? 'POSITIVO' : 
                      cryptoImpact.shortTerm === 'NEGATIVE' ? 'NEGATIVO' : 'NEUTRO';
    
    const riskText = analysis.riskLevel === 'HIGH' ? 'ALTO' : 
                    analysis.riskLevel === 'LOW' ? 'BAIXO' : 'MÉDIO';
    
    report += `${overallEmoji} *Cenário Geral:* ${overallText}\n`;
    report += `📊 *Impacto Cripto:* ${impactText}\n`;
    report += `⚠️ *Nível de Risco:* ${riskText}\n\n`;

    // Eventos econômicos do dia
    const todayEvents = this.getTodayEconomicEvents();
    if (todayEvents.length > 0) {
      report += `📅 *EVENTOS HOJE:*\n`;
      todayEvents.forEach(event => {
        const impactEmoji = event.impact === 'HIGH' ? '🔴' : 
                           event.impact === 'MEDIUM' ? '🟡' : '🟢';
        report += `   ${impactEmoji} ${event.name}: ${event.time}\n`;
      });
      report += '\n';
    }

    // Dados do Fed
    if (data.fed) {
      report += `🏛️ *BANCO CENTRAL AMERICANO (FED):*\n`;
      report += `   • Taxa atual: ${data.fed.currentRate.toFixed(2)}%\n`;
      
      const stanceText = data.fed.stance === 'DOVISH' ? 'DOVISH (Favorável a cortes)' : 
                        data.fed.stance === 'HAWKISH' ? 'HAWKISH (Favorável a altas)' : 'NEUTRO';
      report += `   • Postura: ${stanceText}\n`;
      report += `   • Próxima reunião: ${this.formatDate(data.fed.nextMeetingDate)}\n`;
      if (data.fed.probabilityNextCut > 30) {
        report += `   • Prob. corte: ${data.fed.probabilityNextCut}%\n`;
      }
      if (data.fed.probabilityNextHike > 30) {
        report += `   • Prob. alta: ${data.fed.probabilityNextHike}%\n`;
      }
      report += '\n';
    }

    // Inflação
    if (data.inflation) {
      const inflationEmoji = data.inflation.cpi.trend === 'FALLING' ? '📉' : '📈';
      const trendText = data.inflation.cpi.trend === 'FALLING' ? 'EM QUEDA' : 'EM ALTA';
      report += `${inflationEmoji} *INFLAÇÃO AMERICANA (CPI):*\n`;
      report += `   • Atual: ${data.inflation.cpi.current.toFixed(1)}%\n`;
      report += `   • Meta Fed: ${data.inflation.cpi.target}%\n`;
      report += `   • Tendência: ${trendText}\n`;
      report += `   • Próximo dado: ${this.formatDate(data.inflation.nextReleaseDate)}\n\n`;
    }

    // Dólar e Yields
    if (data.dollar || data.bonds) {
      report += `💵 *MERCADOS TRADICIONAIS:*\n`;
      
      if (data.dollar) {
        const dxyEmoji = data.dollar.trend === 'STRENGTHENING' ? '📈' : '📉';
        const trendText = data.dollar.trend === 'STRENGTHENING' ? 'Fortalecendo' : 'Enfraquecendo';
        report += `   ${dxyEmoji} Índice Dólar: ${data.dollar.value.toFixed(1)} (${data.dollar.change24h > 0 ? '+' : ''}${data.dollar.change24h.toFixed(2)}%) - ${trendText}\n`;
      }
      
      if (data.bonds) {
        const curveEmoji = data.bonds.curveStatus === 'INVERTED' ? '🔴' : 
                          data.bonds.curveStatus === 'FLAT' ? '🟡' : '🟢';
        const curveText = data.bonds.curveStatus === 'INVERTED' ? 'INVERTIDA' : 
                         data.bonds.curveStatus === 'FLAT' ? 'PLANA' : 'NORMAL';
        report += `   📊 Títulos 10 anos: ${data.bonds.treasury10y.toFixed(2)}%\n`;
        report += `   ${curveEmoji} Curva de juros: ${curveText}\n`;
        if (data.bonds.recessionSignal) {
          report += `   ⚠️ Sinal de recessão ativo\n`;
        }
      }
      report += '\n';
    }

    // Ações e VIX
    if (data.stocks) {
      report += `📈 *BOLSAS AMERICANAS:*\n`;
      const sp500Emoji = data.stocks.sp500.trend === 'BULLISH' ? '🟢' : '🔴';
      const nasdaqEmoji = data.stocks.nasdaq.trend === 'BULLISH' ? '🟢' : '🔴';
      
      report += `   ${sp500Emoji} S&P 500: ${data.stocks.sp500.change > 0 ? '+' : ''}${data.stocks.sp500.change.toFixed(2)}%\n`;
      report += `   ${nasdaqEmoji} Nasdaq: ${data.stocks.nasdaq.change > 0 ? '+' : ''}${data.stocks.nasdaq.change.toFixed(2)}%\n`;
      
      const vixEmoji = data.stocks.vix.level === 'HIGH' ? '🔴' : 
                      data.stocks.vix.level === 'MODERATE' ? '🟡' : '🟢';
      const vixText = data.stocks.vix.level === 'HIGH' ? 'ALTO' : 
                     data.stocks.vix.level === 'MODERATE' ? 'MODERADO' : 'BAIXO';
      report += `   ${vixEmoji} Índice do Medo (VIX): ${data.stocks.vix.value.toFixed(1)} (${vixText})\n\n`;
    }

    // Market Cap Crypto
    if (data.cryptoMcap) {
      report += `₿ *MERCADO DE CRIPTOMOEDAS:*\n`;
      report += `   • Valor Total: $${data.cryptoMcap.totalMarketCap.toFixed(2)} trilhões\n`;
      report += `   • Dominância BTC: ${data.cryptoMcap.btcDominance.toFixed(1)}%\n`;
      report += `   • Variação 24h: ${data.cryptoMcap.change24h > 0 ? '+' : ''}${data.cryptoMcap.change24h.toFixed(2)}%\n`;
      if (data.cryptoMcap.altcoinSeason) {
        report += `   🚀 Temporada de Altcoins ativa\n`;
      }
      report += '\n';
    }

    // Calendário econômico
    if (data.calendar && data.calendar.upcomingEvents.length > 0) {
      report += `📅 *PRÓXIMOS EVENTOS:*\n`;
      data.calendar.upcomingEvents.slice(0, 3).forEach(event => {
        const impactEmoji = event.impact === 'HIGH' ? '🔴' : 
                           event.impact === 'MEDIUM' ? '🟡' : '🟢';
        const eventName = this.translateEventName(event.name);
        report += `   ${impactEmoji} ${eventName}: ${event.daysUntil} dia${event.daysUntil !== 1 ? 's' : ''}\n`;
      });
      report += '\n';
    }

    // Fatores-chave
    if (analysis.keyFactors.length > 0) {
      report += `🔍 *PRINCIPAIS FATORES:*\n`;
      analysis.keyFactors.slice(0, 4).forEach(factor => {
        report += `   • ${factor}\n`;
      });
      report += '\n';
    }

    // Recomendações
    if (cryptoImpact.recommendations.length > 0) {
      report += `💡 *ESTRATÉGIAS SUGERIDAS:*\n`;
      cryptoImpact.recommendations.forEach(rec => {
        report += `   • ${rec}\n`;
      });
      report += '\n';
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
    const hour = now.getHours();
    const today = now.toDateString();
    
    // Envia todo dia às 7h da manhã
    if (hour === 7 && this.lastDailyReport !== today) {
      return true;
    }
    
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