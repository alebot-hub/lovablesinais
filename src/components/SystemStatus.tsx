import React from 'react';
import { CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';

interface SystemStatusProps {
  botStatus: any;
}

const SystemStatus: React.FC<SystemStatusProps> = ({ botStatus }) => {
  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'text-green-600 bg-green-50 border-green-200';
      case 'BEAR': return 'text-red-600 bg-red-50 border-red-200';
      case 'VOLATILE': return 'text-purple-600 bg-purple-50 border-purple-200';
      default: return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'BULL': return '🐂';
      case 'BEAR': return '🐻';
      case 'VOLATILE': return '⚡';
      default: return '⚖️';
    }
  };

  const getRegimeDescription = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'Mercado em tendência de alta';
      case 'BEAR': return 'Mercado em tendência de baixa';
      case 'VOLATILE': return 'Mercado com alta volatilidade';
      default: return 'Mercado em condições normais';
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <span>Status do Sistema</span>
        </h3>
        
        <div className="flex items-center space-x-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Regime de Mercado */}
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-2xl">{getRegimeIcon(botStatus?.adaptiveStats?.marketRegime || 'NORMAL')}</span>
            <div>
              <p className="text-sm text-gray-600">Regime de Mercado</p>
              <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${getRegimeColor(botStatus?.adaptiveStats?.marketRegime || 'NORMAL')}`}>
                {botStatus?.adaptiveStats?.marketRegime || 'NORMAL'}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {getRegimeDescription(botStatus?.adaptiveStats?.marketRegime || 'NORMAL')}
          </p>
        </div>

        {/* Machine Learning */}
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="text-sm text-gray-600">Sistema ML</p>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  botStatus?.machineLearning?.training ? 'bg-orange-500 animate-pulse' : 'bg-green-500'
                }`} />
                <span className="text-xs font-medium text-gray-700">
                  {botStatus?.machineLearning?.training ? 'Treinando' : 'Ativo'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            TensorFlow.js com otimização CPU
          </p>
        </div>

        {/* Monitoramento */}
        <div className="bg-white rounded-lg p-4 border border-gray-100">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-sm text-gray-600">Monitoramento</p>
              <p className="text-lg font-bold text-gray-900">72 símbolos</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Análise a cada 2 horas
          </p>
        </div>
      </div>

      {/* Próxima Análise */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Próxima análise automática:</span>
          </div>
          <span className="font-medium text-gray-900">
            {new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SystemStatus;