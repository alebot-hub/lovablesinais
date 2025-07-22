import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Target, AlertCircle, Play } from 'lucide-react';

interface BacktestResult {
  symbol: string;
  winRate: number;
  profitFactor: number;
  totalProfit: number;
}

interface BacktestData {
  report: string;
  bestPerformers: BacktestResult[];
}

const BacktestResults: React.FC = () => {
  const [backtestData, setBacktestData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [runningBacktest, setRunningBacktest] = useState(false);

  useEffect(() => {
    fetchBacktestResults();
  }, []);

  const fetchBacktestResults = async () => {
    try {
      if (!backtestData) {
        setLoading(true);
      }
      setLoading(true);
      console.log('📊 Buscando resultados de backtesting...');
      const response = await fetch('/api/backtest/results');
      console.log('📊 Backtest response:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Backtest obtido:', data);
      setBacktestData(data);
    } catch (error) {
      console.error('Erro ao buscar resultados de backtesting:', error);
      // Define dados de fallback
      setBacktestData({
        report: 'Dados de backtesting temporariamente indisponíveis',
        bestPerformers: []
      });
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    if (!selectedSymbol) return;

    try {
      setRunningBacktest(true);
      const response = await fetch(`/api/backtest/run/${selectedSymbol}`, {
        method: 'POST'
      });
      const result = await response.json();
      
      if (result) {
        // Atualiza os resultados
        await fetchBacktestResults();
      }
    } catch (error) {
      console.error('Erro ao executar backtesting:', error);
    } finally {
      setRunningBacktest(false);
    }
  };

  const symbols = [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT',
    'DOGE/USDT', 'SOL/USDT', 'DOT/USDT', 'MATIC/USDT', 'LTC/USDT'
  ];

  const getPerformanceColor = (value: number, type: 'winRate' | 'profitFactor' | 'profit') => {
    switch (type) {
      case 'winRate':
        if (value >= 70) return 'text-green-600';
        if (value >= 50) return 'text-yellow-600';
        return 'text-red-600';
      case 'profitFactor':
        if (value >= 2) return 'text-green-600';
        if (value >= 1) return 'text-yellow-600';
        return 'text-red-600';
      case 'profit':
        if (value > 0) return 'text-green-600';
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-500">Carregando resultados de backtesting...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Resultados de Backtesting
        </h2>
        
        <div className="flex items-center space-x-3">
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Selecionar símbolo</option>
            {symbols.map(symbol => (
              <option key={symbol} value={symbol}>{symbol}</option>
            ))}
          </select>
          
          <button
            onClick={runBacktest}
            disabled={!selectedSymbol || runningBacktest}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>{runningBacktest ? 'Executando...' : 'Executar Backtest'}</span>
          </button>
        </div>
      </div>

      {/* Melhores Performers */}
      {backtestData?.bestPerformers && backtestData.bestPerformers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <Target className="w-5 h-5 text-green-600" />
            <span>Melhores Performers</span>
          </h3>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Símbolo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Taxa de Acerto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profit Factor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lucro Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Performance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {backtestData.bestPerformers.map((result, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                          <span className="text-blue-600 font-bold text-xs">
                            {result.symbol.split('/')[0]}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {result.symbol}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getPerformanceColor(result.winRate, 'winRate')}`}>
                        {result.winRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getPerformanceColor(result.profitFactor, 'profitFactor')}`}>
                        {result.profitFactor.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getPerformanceColor(result.totalProfit, 'profit')}`}>
                        {result.totalProfit > 0 ? '+' : ''}{result.totalProfit.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className={`h-2 rounded-full ${
                              result.winRate >= 70 ? 'bg-green-500' :
                              result.winRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(result.winRate, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {result.winRate >= 70 ? 'Excelente' :
                           result.winRate >= 50 ? 'Bom' : 'Ruim'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Relatório Detalhado */}
      {backtestData?.report && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span>Relatório Detalhado</span>
          </h3>
          
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
              {backtestData.report}
            </pre>
          </div>
        </div>
      )}

      {/* Estado Vazio */}
      {(!backtestData || (!backtestData.bestPerformers?.length && !backtestData.report)) && (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Nenhum resultado de backtesting disponível</p>
          <p className="text-sm text-gray-400">
            Execute um backtest selecionando um símbolo acima
          </p>
        </div>
      )}

      {/* Informações sobre Backtesting */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">
          Sobre o Backtesting
        </h4>
        <div className="text-sm text-blue-800 space-y-1">
          <p>• Testa estratégias em dados históricos de 1000 períodos</p>
          <p>• Utiliza análise técnica, padrões gráficos e machine learning</p>
          <p>• Calcula métricas como taxa de acerto, profit factor e drawdown</p>
          <p>• Simula execução real com alvos e stop-loss</p>
        </div>
      </div>
    </div>
  );
};

export default BacktestResults;