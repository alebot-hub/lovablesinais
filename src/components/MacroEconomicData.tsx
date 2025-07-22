import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Building2, AlertCircle, Calendar, Target } from 'lucide-react';

interface MacroData {
  data: {
    fed?: {
      currentRate: number;
      stance: string;
      nextMeetingDate: string;
      probabilityNextCut: number;
      probabilityNextHike: number;
    };
    inflation?: {
      cpi: {
        current: number;
        target: number;
        trend: string;
      };
      nextReleaseDate: string;
    };
    dollar?: {
      value: number;
      change24h: number;
      trend: string;
    };
    bonds?: {
      treasury10y: number;
      curveStatus: string;
      recessionSignal: boolean;
    };
    stocks?: {
      sp500: { change: number; trend: string };
      nasdaq: { change: number; trend: string };
      vix: { value: number; level: string };
    };
    cryptoMcap?: {
      totalMarketCap: number;
      btcDominance: number;
      change24h: number;
      altcoinSeason: boolean;
    };
    calendar?: {
      upcomingEvents: Array<{
        name: string;
        impact: string;
        daysUntil: number;
      }>;
    };
  };
  analysis: {
    overall: string;
    keyFactors: string[];
    riskLevel: string;
  };
  cryptoImpact: {
    shortTerm: string;
    mediumTerm: string;
    longTerm: string;
    recommendations: string[];
  };
}

const MacroEconomicData: React.FC = () => {
  const [macroData, setMacroData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMacroData();
    const interval = setInterval(fetchMacroData, 4 * 60 * 60 * 1000); // A cada 4 horas
    return () => clearInterval(interval);
  }, []);

  const fetchMacroData = async () => {
    try {
      const response = await fetch('/api/macro/data');
      const data = await response.json();
      setMacroData(data);
    } catch (error) {
      console.error('Erro ao buscar dados macro:', error);
    } finally {
      setLoading(false);
    }
  };

  const getOverallColor = (overall: string) => {
    switch (overall) {
      case 'BULLISH':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'BEARISH':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'POSITIVE':
        return 'text-green-600';
      case 'NEGATIVE':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW':
        return 'text-green-600 bg-green-50';
      case 'HIGH':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-yellow-600 bg-yellow-50';
    }
  };

  const getStanceColor = (stance: string) => {
    switch (stance) {
      case 'DOVISH':
        return 'text-green-600 bg-green-50';
      case 'HAWKISH':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-blue-600 bg-blue-50';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-500">Carregando dados macroeconômicos...</p>
      </div>
    );
  }

  if (!macroData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-500">Erro ao carregar dados macroeconômicos</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">
        Análise Macroeconômica
      </h2>

      {/* Resumo Executivo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Cenário Geral</h3>
            <Building2 className="w-5 h-5 text-gray-400" />
          </div>
          <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${getOverallColor(macroData.analysis.overall)}`}>
            {macroData.analysis.overall}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Impacto Crypto</h3>
            <Target className="w-5 h-5 text-gray-400" />
          </div>
          <div className={`text-lg font-bold ${getImpactColor(macroData.cryptoImpact.shortTerm)}`}>
            {macroData.cryptoImpact.shortTerm}
          </div>
          <p className="text-sm text-gray-500 mt-1">Curto prazo</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Nível de Risco</h3>
            <AlertCircle className="w-5 h-5 text-gray-400" />
          </div>
          <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(macroData.analysis.riskLevel)}`}>
            {macroData.analysis.riskLevel}
          </div>
        </div>
      </div>

      {/* Dados do Federal Reserve */}
      {macroData.data.fed && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <span>Federal Reserve</span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Taxa Atual</p>
              <p className="text-xl font-bold text-gray-900">{macroData.data.fed.currentRate.toFixed(2)}%</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Postura</p>
              <div className={`inline-flex px-2 py-1 rounded text-sm font-medium ${getStanceColor(macroData.data.fed.stance)}`}>
                {macroData.data.fed.stance}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Próxima Reunião</p>
              <p className="text-lg font-semibold text-gray-900">{formatDate(macroData.data.fed.nextMeetingDate)}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Prob. Corte</p>
              <p className="text-lg font-semibold text-green-600">{macroData.data.fed.probabilityNextCut}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Dados de Inflação e Mercados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inflação */}
        {macroData.data.inflation && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <span>Inflação (CPI)</span>
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Atual</span>
                <span className="text-lg font-bold text-gray-900">{macroData.data.inflation.cpi.current.toFixed(1)}%</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Meta Fed</span>
                <span className="text-lg font-semibold text-blue-600">{macroData.data.inflation.cpi.target}%</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Tendência</span>
                <div className="flex items-center space-x-1">
                  {macroData.data.inflation.cpi.trend === 'RISING' ? (
                    <TrendingUp className="w-4 h-4 text-red-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-green-600" />
                  )}
                  <span className={`text-sm font-medium ${
                    macroData.data.inflation.cpi.trend === 'RISING' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {macroData.data.inflation.cpi.trend}
                  </span>
                </div>
              </div>
              
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Próximo dado: {formatDate(macroData.data.inflation.nextReleaseDate)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mercados Financeiros */}
        {(macroData.data.dollar || macroData.data.bonds) && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              <span>Mercados Financeiros</span>
            </h3>
            
            <div className="space-y-4">
              {macroData.data.dollar && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">DXY</span>
                  <div className="text-right">
                    <span className="text-lg font-bold text-gray-900">{macroData.data.dollar.value.toFixed(1)}</span>
                    <span className={`ml-2 text-sm ${
                      macroData.data.dollar.change24h > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {macroData.data.dollar.change24h > 0 ? '+' : ''}{macroData.data.dollar.change24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}
              
              {macroData.data.bonds && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Treasury 10Y</span>
                    <span className="text-lg font-bold text-gray-900">{macroData.data.bonds.treasury10y.toFixed(2)}%</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Curva</span>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      macroData.data.bonds.curveStatus === 'INVERTED' ? 'text-red-600 bg-red-50' :
                      macroData.data.bonds.curveStatus === 'FLAT' ? 'text-yellow-600 bg-yellow-50' :
                      'text-green-600 bg-green-50'
                    }`}>
                      {macroData.data.bonds.curveStatus}
                    </div>
                  </div>
                  
                  {macroData.data.bonds.recessionSignal && (
                    <div className="bg-red-50 border border-red-200 rounded p-2">
                      <p className="text-xs text-red-700 font-medium">⚠️ Sinal de recessão ativo</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Market Cap Crypto */}
      {macroData.data.cryptoMcap && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Mercado Cripto
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Market Cap Total</p>
              <p className="text-xl font-bold text-gray-900">${macroData.data.cryptoMcap.totalMarketCap.toFixed(2)}T</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Dominância BTC</p>
              <p className="text-xl font-bold text-orange-600">{macroData.data.cryptoMcap.btcDominance.toFixed(1)}%</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Variação 24h</p>
              <p className={`text-xl font-bold ${
                macroData.data.cryptoMcap.change24h > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {macroData.data.cryptoMcap.change24h > 0 ? '+' : ''}{macroData.data.cryptoMcap.change24h.toFixed(2)}%
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Status</p>
              {macroData.data.cryptoMcap.altcoinSeason ? (
                <p className="text-lg font-bold text-purple-600">🚀 Altcoin Season</p>
              ) : (
                <p className="text-lg font-bold text-blue-600">₿ Bitcoin Season</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendário Econômico */}
      {macroData.data.calendar && macroData.data.calendar.upcomingEvents.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            <span>Eventos Importantes</span>
          </h3>
          
          <div className="space-y-3">
            {macroData.data.calendar.upcomingEvents.slice(0, 5).map((event, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    event.impact === 'HIGH' ? 'bg-red-500' :
                    event.impact === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'
                  }`} />
                  <span className="font-medium text-gray-900">{event.name}</span>
                </div>
                <span className="text-sm text-gray-600">
                  {event.daysUntil} dia{event.daysUntil !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fatores-Chave e Recomendações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fatores-Chave */}
        {macroData.analysis.keyFactors.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Fatores-Chave
            </h3>
            <div className="space-y-3">
              {macroData.analysis.keyFactors.map((factor, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700">{factor}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recomendações */}
        {macroData.cryptoImpact.recommendations.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Recomendações
            </h3>
            <div className="space-y-3">
              {macroData.cryptoImpact.recommendations.map((rec, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-gray-700">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Impacto por Prazo */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h4 className="text-sm font-semibold text-blue-900 mb-3">
          Impacto no Mercado Cripto por Prazo
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-sm text-blue-700">Curto Prazo</p>
            <p className={`text-lg font-bold ${getImpactColor(macroData.cryptoImpact.shortTerm)}`}>
              {macroData.cryptoImpact.shortTerm}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-blue-700">Médio Prazo</p>
            <p className={`text-lg font-bold ${getImpactColor(macroData.cryptoImpact.mediumTerm)}`}>
              {macroData.cryptoImpact.mediumTerm}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-blue-700">Longo Prazo</p>
            <p className={`text-lg font-bold ${getImpactColor(macroData.cryptoImpact.longTerm)}`}>
              {macroData.cryptoImpact.longTerm}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MacroEconomicData;