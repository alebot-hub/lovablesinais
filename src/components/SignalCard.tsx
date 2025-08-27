import React from 'react';
import { TrendingUp, TrendingDown, Target, DollarSign, Clock } from 'lucide-react';
import RealTimeChart from './RealTimeChart';

interface Signal {
  symbol: string;
  score: number;
  trend: string;
  entry: number;
  timestamp: string;
}

interface SignalCardProps {
  signal: Signal;
}

const SignalCard: React.FC<SignalCardProps> = ({ signal }) => {
  const [showChart, setShowChart] = useState(false);
  
  // Garante que score é um número válido
  const safeScore = typeof signal.score === 'number' && !isNaN(signal.score) ? signal.score : 0;
  const safeEntry = typeof signal.entry === 'number' && !isNaN(signal.entry) ? signal.entry : 0;
  
  console.log('🎯 SignalCard renderizando:', {
    symbol: signal.symbol,
    score: signal.score,
    safeScore: safeScore,
    entry: signal.entry,
    safeEntry: safeEntry,
    trend: signal.trend
  });
  
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'BULLISH':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'BEARISH':
        return <TrendingDown className="w-5 h-5 text-red-600" />;
      default:
        return <Target className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'BULLISH':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'BEARISH':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getScoreColor = (score: number) => {
    if (safeScore >= 80) return 'text-green-600 bg-green-50';
    if (safeScore >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">
              {signal.symbol.split('/')[0]}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{signal.symbol}</h3>
            <div className="flex items-center space-x-2 mt-1">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">
                {formatTimestamp(signal.timestamp)}
              </span>
            </div>
          </div>
        </div>

        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(signal.score)}`}>
          {safeScore.toFixed(1)}%
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">Entrada</span>
          </div>
          <p className="text-lg font-semibold text-gray-900">
            ${safeEntry.toFixed(4)}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            {getTrendIcon(signal.trend)}
            <span className="text-sm text-gray-600">Tendência</span>
          </div>
          <div className={`inline-flex px-2 py-1 rounded-full text-sm font-medium border ${getTrendColor(signal.trend)}`}>
            {signal.trend}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Probabilidade de sucesso</span>
          <div className="flex items-center space-x-2">
            <div className="w-20 bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  safeScore >= 80 ? 'bg-green-500' : 
                  safeScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${safeScore}%` }}
              />
            </div>
            <span className="font-medium text-gray-900">{safeScore.toFixed(0)}%</span>
          </div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setShowChart(!showChart)}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm"
          >
            <TrendingUp className="w-4 h-4" />
            <span>{showChart ? 'Ocultar' : 'Ver'} Gráfico em Tempo Real</span>
          </button>
        </div>
      </div>
      
      {showChart && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <RealTimeChart symbol={signal.symbol} height={200} />
        </div>
      )}
    </div>
  );
};

export default SignalCard;