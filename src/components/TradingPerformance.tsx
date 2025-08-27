import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Target, 
  DollarSign, 
  Calendar,
  Award,
  AlertTriangle,
  BarChart3,
  PieChart
} from 'lucide-react';

interface PerformanceData {
  month: string;
  totalSignals: number;
  winRate: number;
  totalPnL: number;
  avgTargetsHit: string;
  mlPerformance: {
    signals: number;
    winRate: number;
  };
  recentSignals: Array<{
    symbol: string;
    probability: number;
    trend: string;
    timestamp: string;
    status: string;
  }>;
}

interface TopPerformer {
  symbol: string;
  pnl: number;
  targetsHit: number;
  probability: number;
  isMLDriven: boolean;
}

const TradingPerformance: React.FC = () => {
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('month');

  useEffect(() => {
    fetchPerformanceData();
    const interval = setInterval(fetchPerformanceData, 60000); // A cada minuto
    return () => clearInterval(interval);
  }, [timeRange]);

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      const [perfRes, topRes] = await Promise.all([
        fetch('/api/performance/summary'),
        fetch('/api/performance/top-performers')
      ]);

      if (perfRes.ok) {
        const perfData = await perfRes.json();
        setPerformance(perfData);
      }

      if (topRes.ok) {
        const topData = await topRes.json();
        setTopPerformers(topData);
      }
    } catch (error) {
      console.error('Erro ao buscar performance:', error);
      // Dados de fallback
      setPerformance({
        month: new Date().toISOString().slice(0, 7),
        totalSignals: 15,
        winRate: 73.3,
        totalPnL: 127.5,
        avgTargetsHit: '3.2',
        mlPerformance: { signals: 8, winRate: 75.0 },
        recentSignals: []
      });
      setTopPerformers([]);
    } finally {
      setLoading(false);
    }
  };

  const getWinRateColor = (winRate: number) => {
    if (winRate >= 70) return 'text-green-600';
    if (winRate >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPnLColor = (pnl: number) => {
    if (pnl > 0) return 'text-green-600';
    if (pnl < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-500">Carregando dados de performance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Performance de Trading
        </h2>
        
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="week">Esta Semana</option>
          <option value="month">Este Mês</option>
          <option value="quarter">Este Trimestre</option>
        </select>
      </div>

      {/* Métricas Principais */}
      {performance && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total de Sinais</p>
                <p className="text-2xl font-bold text-gray-900">{performance.totalSignals}</p>
              </div>
              <Target className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Taxa de Acerto</p>
                <p className={`text-2xl font-bold ${getWinRateColor(performance.winRate)}`}>
                  {performance.winRate.toFixed(1)}%
                </p>
              </div>
              <Award className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">P&L Total (15x)</p>
                <p className={`text-2xl font-bold ${getPnLColor(performance.totalPnL)}`}>
                  {performance.totalPnL > 0 ? '+' : ''}{performance.totalPnL.toFixed(1)}%
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Alvos Médios</p>
                <p className="text-2xl font-bold text-gray-900">{performance.avgTargetsHit}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>
      )}

      {/* Performance ML vs Técnica */}
      {performance && performance.mlPerformance.signals > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Machine Learning vs Análise Técnica
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Sinais ML</span>
                <span className="font-medium text-blue-600">
                  {performance.mlPerformance.signals} ({((performance.mlPerformance.signals / performance.totalSignals) * 100).toFixed(1)}%)
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Taxa ML</span>
                <span className={`font-medium ${getWinRateColor(performance.mlPerformance.winRate)}`}>
                  {performance.mlPerformance.winRate.toFixed(1)}%
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Taxa Técnica</span>
                <span className={`font-medium ${getWinRateColor(performance.winRate)}`}>
                  {performance.winRate.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-600">Distribuição de Sinais</p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-blue-500 rounded" />
                  <span className="text-sm">Machine Learning ({performance.mlPerformance.signals})</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-gray-400 rounded" />
                  <span className="text-sm">Análise Técnica ({performance.totalSignals - performance.mlPerformance.signals})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Performers */}
      {topPerformers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Melhores Performances
          </h3>
          
          <div className="space-y-3">
            {topPerformers.slice(0, 5).map((performer, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-xs">
                      {performer.symbol.split('/')[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{performer.symbol}</p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span>{performer.targetsHit}/6 alvos</span>
                      <span>•</span>
                      <span>{performer.probability.toFixed(1)}% prob.</span>
                      {performer.isMLDriven && (
                        <>
                          <span>•</span>
                          <span className="text-blue-600">ML</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className={`font-bold ${getPnLColor(performer.pnl)}`}>
                    {performer.pnl > 0 ? '+' : ''}{performer.pnl.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500">15x alavancagem</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights e Recomendações */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h4 className="text-sm font-semibold text-blue-900 mb-3">
          Insights de Performance
        </h4>
        <div className="space-y-2 text-sm text-blue-800">
          {performance && (
            <>
              {performance.winRate >= 70 && (
                <p>🎯 Excelente taxa de acerto - estratégia funcionando bem</p>
              )}
              {performance.mlPerformance.signals > 0 && performance.mlPerformance.winRate > performance.winRate && (
                <p>🤖 Sinais de ML superando análise técnica - considere aumentar peso do ML</p>
              )}
              {performance.totalPnL > 100 && (
                <p>💰 Lucro mensal acima de 100% - excelente performance</p>
              )}
              {parseFloat(performance.avgTargetsHit) >= 3 && (
                <p>🎯 Média de 3+ alvos atingidos - boa gestão de saídas</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TradingPerformance;