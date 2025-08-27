import React, { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, Clock, Zap } from 'lucide-react';

interface VolatilityAlert {
  symbol: string;
  change: number;
  currentPrice: number;
  timeframe: string;
  timestamp: Date;
}

const VolatilityAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<VolatilityAlert[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // Atualiza a cada minuto
    return () => clearInterval(interval);
  }, []);

  const fetchAlerts = async () => {
    try {
      if (alerts.length === 0) {
        setLoading(true);
      }
      setLoading(true);
      console.log('🔥 Buscando alertas de volatilidade...');
      const response = await fetch('/api/volatility/alerts');
      console.log('📊 Volatility alerts response:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Alertas obtidos:', data);
      setAlerts(data);
    } catch (error) {
      console.error('Erro ao buscar alertas de volatilidade:', error);
      // Define array vazio como fallback
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600 bg-green-50 border-green-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4" />;
    return <TrendingDown className="w-4 h-4" />;
  };

  const getVolatilityLevel = (change: number) => {
    const absChange = Math.abs(change);
    if (absChange >= 10) return { level: 'Extrema', color: 'text-red-600' };
    if (absChange >= 7) return { level: 'Alta', color: 'text-orange-600' };
    if (absChange >= 5) return { level: 'Moderada', color: 'text-yellow-600' };
    return { level: 'Baixa', color: 'text-green-600' };
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatPrice = (price: number) => {
    if (!price || isNaN(price)) return '0.0000';
    if (price >= 1) return price.toFixed(4);
    if (price >= 0.01) return price.toFixed(6);
    return price.toFixed(8);
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-500">Verificando volatilidade do mercado...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Alertas de Volatilidade
        </h2>
        
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <Clock className="w-4 h-4" />
          <span>Atualizado há {loading ? '...' : 'poucos segundos'}</span>
        </div>
      </div>

      {/* Resumo de Volatilidade */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Alertas Ativos</p>
              <p className="text-2xl font-bold text-gray-900">{alerts.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-orange-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Maior Variação</p>
              <p className="text-2xl font-bold text-red-600">
                {alerts.length > 0 ? 
                  `${Math.max(...alerts.map(a => Math.abs(a.change || 0))).toFixed(1)}%` : 
                  '0%'
                }
              </p>
            </div>
            <Zap className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Timeframe</p>
              <p className="text-2xl font-bold text-blue-600">15m</p>
            </div>
            <Clock className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Lista de Alertas */}
      {alerts.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Movimentos de Alta Volatilidade
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Variações superiores a 5% em 15 minutos
            </p>
          </div>
          
          <div className="divide-y divide-gray-200">
            {alerts.map((alert, index) => {
              const volatility = getVolatilityLevel(alert.change);
              
              return (
                <div key={index} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-sm">
                          {alert.symbol.split('/')[0]}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold text-gray-900">{alert.symbol}</h4>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-sm text-gray-500">
                            ${formatPrice(alert.currentPrice)}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(alert.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className={`flex items-center space-x-1 ${getChangeColor(alert.change)} px-2 py-1 rounded-full border text-sm font-medium`}>
                          {getChangeIcon(alert.change)}
                          <span>{(alert.change || 0) > 0 ? '+' : ''}{(alert.change || 0).toFixed(2)}%</span>
                        </div>
                        <div className="mt-1">
                          <span className={`text-xs font-medium ${volatility.color}`}>
                            {volatility.level}
                          </span>
                        </div>
                      </div>

                      <div className="w-16 text-center">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              Math.abs(alert.change || 0) >= 10 ? 'bg-red-500' :
                              Math.abs(alert.change || 0) >= 7 ? 'bg-orange-500' :
                              Math.abs(alert.change || 0) >= 5 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(Math.abs(alert.change || 0) * 10, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 mt-1 block">
                          {alert.timeframe}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Nenhum alerta de volatilidade ativo</p>
          <p className="text-sm text-gray-400">
            O mercado está operando com volatilidade normal
          </p>
        </div>
      )}

      {/* Informações sobre Alertas */}
      <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-200">
        <h4 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Sobre os Alertas de Volatilidade</span>
        </h4>
        <div className="text-sm text-yellow-800 space-y-1">
          <p>• Monitora variações superiores a 5% em períodos de 15 minutos</p>
          <p>• Identifica oportunidades de swing trading e breakouts</p>
          <p>• Atualização em tempo real dos principais ativos</p>
          <p>• Útil para identificar momentum e reversões de tendência</p>
        </div>
      </div>
    </div>
  );
};

export default VolatilityAlerts;