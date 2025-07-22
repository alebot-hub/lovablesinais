import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign, 
  BarChart3, 
  AlertTriangle,
  Bot,
  Zap,
  Target,
  Shield,
  Building2
} from 'lucide-react';
import SignalCard from './SignalCard';
import MarketSentiment from './MarketSentiment';
import BacktestResults from './BacktestResults';
import VolatilityAlerts from './VolatilityAlerts';
import MacroEconomicData from './MacroEconomicData';

interface Signal {
  symbol: string;
  score: number;
  trend: string;
  entry: number;
  timestamp: string;
}

interface BotStatus {
  status: string;
  timestamp: string;
  activeMonitors: number;
  isTraining: boolean;
  activeSymbols: string[];
  adaptiveStats?: {
    marketRegime: string;
    blacklistedSymbols: number;
    indicatorPerformance: number;
  };
}

const Dashboard: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [activeTab, setActiveTab] = useState('signals');
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Atualiza a cada 30 segundos
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [statusRes, signalsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/signals/latest')
      ]);

      if (statusRes.ok) {
        const status = await statusRes.json();
        setBotStatus(status);
      }

      if (signalsRes.ok) {
        const signalsData = await signalsRes.json();
        setSignals(Array.isArray(signalsData) ? signalsData : []);
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendTestSignal = async () => {
    try {
      setSendingTest(true);
      const response = await fetch('/api/telegram/test', {
        method: 'POST'
      });
      
      if (response.ok) {
        alert('Sinal de teste enviado com sucesso para o Telegram! 🚀');
      } else {
        const error = await response.json();
        alert(`Erro ao enviar sinal: ${error.error}`);
      }
    } catch (error) {
      alert(`Erro ao enviar sinal: ${error.message}`);
    } finally {
      setSendingTest(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-yellow-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return 'Online';
      case 'error': return 'Erro';
      default: return 'Carregando';
    }
  };

  const tabs = [
    { id: 'signals', label: 'Sinais', icon: Target },
    { id: 'sentiment', label: 'Sentimento', icon: Activity },
    { id: 'macro', label: 'Macro', icon: Building2 },
    { id: 'backtest', label: 'Backtesting', icon: BarChart3 },
    { id: 'volatility', label: 'Volatilidade', icon: AlertTriangle }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Bot className="w-16 h-16 text-blue-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Carregando dados do bot...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <Bot className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                Bot Lobo Cripto Oficial V.10
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {botStatus && (
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    botStatus.status === 'running' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className={`text-sm font-medium ${getStatusColor(botStatus.status)}`}>
                    {getStatusText(botStatus.status)}
                  </span>
                </div>
              )}
              
              {botStatus?.isTraining && (
                <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1 rounded-full">
                  <Zap className="w-4 h-4 text-blue-600 animate-pulse" />
                  <span className="text-sm text-blue-700 font-medium">Treinando ML</span>
                </div>
              )}
              
              <button
                onClick={sendTestSignal}
                disabled={sendingTest}
                className="flex items-center space-x-2 px-3 py-1 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Target className="w-4 h-4" />
                <span>{sendingTest ? 'Enviando...' : 'Teste Telegram'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Sinais Ativos</p>
                <p className="text-2xl font-bold text-gray-900">{signals.length}</p>
              </div>
              <Target className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monitoramentos</p>
                <p className="text-2xl font-bold text-gray-900">{botStatus?.activeMonitors || 0}</p>
              </div>
              <Shield className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Regime de Mercado</p>
                <p className="text-2xl font-bold text-purple-600">
                  {botStatus?.adaptiveStats?.marketRegime || 'NORMAL'}
                </p>
              </div>
              <Activity className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Sistema ML</p>
                <p className="text-2xl font-bold text-orange-600">
                  {botStatus?.isTraining ? 'Treinando' : 'Ativo'}
                </p>
              </div>
              <Bot className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Active Symbols */}
        {botStatus?.activeSymbols && botStatus.activeSymbols.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Operações Ativas ({botStatus.activeSymbols.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {botStatus.activeSymbols.map((symbol, index) => (
                <div key={index} className="flex items-center space-x-2 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-green-700">{symbol}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'signals' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">
                  Sinais de Trading Recentes
                </h2>
                {signals.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {signals.map((signal, index) => (
                      <SignalCard key={index} signal={signal} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-2">Nenhum sinal disponível no momento</p>
                    <p className="text-sm text-gray-400">
                      O bot está analisando o mercado em busca de oportunidades
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'sentiment' && <MarketSentiment />}
            {activeTab === 'macro' && <MacroEconomicData />}
            {activeTab === 'backtest' && <BacktestResults />}
            {activeTab === 'volatility' && <VolatilityAlerts />}
          </div>
        </div>

        {/* System Info */}
        <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
          <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center space-x-2">
            <Bot className="w-4 h-4" />
            <span>Informações do Sistema</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
            <div>
              <p className="font-medium">Análise Técnica:</p>
              <p>RSI, MACD, Ichimoku, Médias Móveis, Bollinger, VWAP</p>
            </div>
            <div>
              <p className="font-medium">Machine Learning:</p>
              <p>Modelos TensorFlow.js com 500+ períodos históricos</p>
            </div>
            <div>
              <p className="font-medium">Gestão de Risco:</p>
              <p>6 alvos automáticos + stop loss dinâmico</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;