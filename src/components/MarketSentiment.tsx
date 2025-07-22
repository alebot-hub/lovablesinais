import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, Volume2, AlertCircle } from 'lucide-react';

interface MarketSentiment {
  overall: string;
  fearGreedIndex: number;
  totalVolume: number;
  volatility: number;
  assetsUp: number;
  assetsDown: number;
  volumeVsAverage: number;
  topMovers?: Array<{
    symbol: string;
    change: number;
    volume: number;
  }>;
  analysis?: string[];
}

const MarketSentiment: React.FC = () => {
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSentiment();
    const interval = setInterval(fetchSentiment, 300000); // Atualiza a cada 5 minutos
    return () => clearInterval(interval);
  }, []);

  const fetchSentiment = async () => {
    try {
      const response = await fetch('/api/market/sentiment');
      const data = await response.json();
      setSentiment(data);
    } catch (error) {
      console.error('Erro ao buscar sentimento:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (overall: string) => {
    switch (overall) {
      case 'BULLISH':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'BEARISH':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const getFearGreedColor = (index: number) => {
    if (index >= 75) return 'text-red-600 bg-red-50';
    if (index >= 55) return 'text-yellow-600 bg-yellow-50';
    if (index >= 45) return 'text-blue-600 bg-blue-50';
    if (index >= 25) return 'text-orange-600 bg-orange-50';
    return 'text-green-600 bg-green-50';
  };

  const getFearGreedLabel = (index: number) => {
    if (index >= 75) return 'Extrema Ganância';
    if (index >= 55) return 'Ganância';
    if (index >= 45) return 'Neutro';
    if (index >= 25) return 'Medo';
    return 'Extremo Medo';
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(2)}K`;
    return volume.toFixed(2);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-500">Carregando análise de sentimento...</p>
      </div>
    );
  }

  if (!sentiment) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-500">Erro ao carregar dados de sentimento</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">
        Análise de Sentimento do Mercado
      </h2>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Sentimento Geral</h3>
            {sentiment.overall === 'BULLISH' ? (
              <TrendingUp className="w-5 h-5 text-green-600" />
            ) : sentiment.overall === 'BEARISH' ? (
              <TrendingDown className="w-5 h-5 text-red-600" />
            ) : (
              <Activity className="w-5 h-5 text-yellow-600" />
            )}
          </div>
          <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${getSentimentColor(sentiment.overall)}`}>
            {sentiment.overall}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Fear & Greed Index</h3>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-900">{sentiment.fearGreedIndex}</span>
              <div className={`px-2 py-1 rounded text-xs font-medium ${getFearGreedColor(sentiment.fearGreedIndex)}`}>
                {getFearGreedLabel(sentiment.fearGreedIndex)}
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="h-2 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                style={{ width: `${sentiment.fearGreedIndex}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-600">Volume Total</h3>
            <Volume2 className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-bold text-gray-900">
              ${formatVolume(sentiment.totalVolume)}
            </p>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">vs média:</span>
              <span className={`text-sm font-medium ${
                sentiment.volumeVsAverage > 1 ? 'text-green-600' : 'text-red-600'
              }`}>
                {sentiment.volumeVsAverage > 1 ? '+' : ''}{((sentiment.volumeVsAverage - 1) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Market Cap Crypto */}
      {sentiment.cryptoMarketCap && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Mercado Cripto Global {sentiment.cryptoMarketCap.isRealData && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full ml-2">
                DADOS REAIS
              </span>
            )}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">Market Cap Total</p>
              <p className="text-2xl font-bold text-gray-900">
                ${sentiment.cryptoMarketCap.totalMarketCap.toFixed(2)}T
              </p>
              <p className="text-xs text-gray-500">
                {sentiment.cryptoMarketCap.isRealData ? 'CoinGecko API' : 'Estimativa'}
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Dominância BTC</p>
              <p className="text-2xl font-bold text-orange-600">
                {sentiment.cryptoMarketCap.btcDominance.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500">
                Atualizado em tempo real
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-600">Variação 24h</p>
              <p className={`text-2xl font-bold ${
                sentiment.cryptoMarketCap.change24h > 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {sentiment.cryptoMarketCap.change24h > 0 ? '+' : ''}{sentiment.cryptoMarketCap.change24h.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500">
                Market cap global
              </p>
            </div>
          </div>
          
          {sentiment.cryptoMarketCap.altcoinSeason && (
            <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-purple-800 font-medium">🚀 Altcoin Season Ativa</p>
              <p className="text-purple-600 text-sm">Dominância do Bitcoin abaixo de 45%</p>
            </div>
          )}
        </div>
      )}

      {/* Estatísticas Detalhadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Distribuição de Ativos
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-600">Em alta</span>
              </div>
              <span className="text-lg font-semibold text-green-600">
                {sentiment.assetsUp}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingDown className="w-4 h-4 text-red-600" />
                <span className="text-sm text-gray-600">Em baixa</span>
              </div>
              <span className="text-lg font-semibold text-red-600">
                {sentiment.assetsDown}
              </span>
            </div>
            <div className="pt-2">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="h-3 bg-green-500 rounded-l-full"
                  style={{ 
                    width: `${(sentiment.assetsUp / (sentiment.assetsUp + sentiment.assetsDown)) * 100}%` 
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{((sentiment.assetsUp / (sentiment.assetsUp + sentiment.assetsDown)) * 100).toFixed(1)}% Alta</span>
                <span>{((sentiment.assetsDown / (sentiment.assetsUp + sentiment.assetsDown)) * 100).toFixed(1)}% Baixa</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Volatilidade do Mercado
          </h3>
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {sentiment.volatility.toFixed(2)}%
              </div>
              <div className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                sentiment.volatility > 5 ? 'text-red-600 bg-red-50' :
                sentiment.volatility > 3 ? 'text-yellow-600 bg-yellow-50' :
                'text-green-600 bg-green-50'
              }`}>
                {sentiment.volatility > 5 ? 'Alta' :
                 sentiment.volatility > 3 ? 'Média' : 'Baixa'}
              </div>
            </div>
            <div className="text-center text-sm text-gray-500">
              Volatilidade média das últimas 24h
            </div>
          </div>
        </div>
      </div>

      {/* Análise Textual */}
      {sentiment.analysis && sentiment.analysis.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Análise Detalhada
          </h3>
          <div className="space-y-3">
            {sentiment.analysis.map((point, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-gray-700">{point}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketSentiment;