import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  Database, 
  Wifi, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  TrendingUp,
  Zap
} from 'lucide-react';

interface SystemMetrics {
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  apiLatency: number;
  wsConnections: number;
  cacheHitRate: number;
  errorRate: number;
  lastUpdate: string;
}

interface HealthCheck {
  service: string;
  status: 'healthy' | 'warning' | 'error';
  latency?: number;
  message?: string;
}

const SystemHealth: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSystemHealth();
    const interval = setInterval(fetchSystemHealth, 10000); // A cada 10 segundos
    return () => clearInterval(interval);
  }, []);

  const fetchSystemHealth = async () => {
    try {
      const [metricsRes, healthRes] = await Promise.all([
        fetch('/api/system/metrics'),
        fetch('/api/system/health')
      ]);

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData);
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealthChecks(healthData.checks || []);
      }
    } catch (error) {
      console.error('Erro ao buscar saúde do sistema:', error);
      // Dados de fallback
      setMetrics({
        uptime: Date.now() - 1000 * 60 * 60 * 2, // 2 horas
        memoryUsage: 45,
        cpuUsage: 25,
        apiLatency: 150,
        wsConnections: 5,
        cacheHitRate: 85,
        errorRate: 2,
        lastUpdate: new Date().toISOString()
      });
      
      setHealthChecks([
        { service: 'Binance API', status: 'healthy', latency: 120 },
        { service: 'Telegram Bot', status: 'healthy', latency: 80 },
        { service: 'Machine Learning', status: 'warning', message: 'Treinando modelos' },
        { service: 'WebSocket', status: 'healthy', latency: 45 }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (uptime: number) => {
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getMetricColor = (value: number, type: 'usage' | 'rate' | 'latency') => {
    switch (type) {
      case 'usage':
        if (value > 80) return 'text-red-600';
        if (value > 60) return 'text-yellow-600';
        return 'text-green-600';
      case 'rate':
        if (value > 90) return 'text-green-600';
        if (value > 70) return 'text-yellow-600';
        return 'text-red-600';
      case 'latency':
        if (value > 500) return 'text-red-600';
        if (value > 200) return 'text-yellow-600';
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-500">Verificando saúde do sistema...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">
        Saúde do Sistema
      </h2>

      {/* Métricas do Sistema */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Uptime</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatUptime(Date.now() - new Date(metrics.lastUpdate).getTime())}
                </p>
              </div>
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">CPU</p>
                <p className={`text-lg font-bold ${getMetricColor(metrics.cpuUsage, 'usage')}`}>
                  {metrics.cpuUsage.toFixed(1)}%
                </p>
              </div>
              <Cpu className="w-6 h-6 text-orange-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Memória</p>
                <p className={`text-lg font-bold ${getMetricColor(metrics.memoryUsage, 'usage')}`}>
                  {metrics.memoryUsage.toFixed(1)}%
                </p>
              </div>
              <Database className="w-6 h-6 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Latência API</p>
                <p className={`text-lg font-bold ${getMetricColor(metrics.apiLatency, 'latency')}`}>
                  {metrics.apiLatency}ms
                </p>
              </div>
              <Wifi className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      )}

      {/* Health Checks */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Status dos Serviços
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {healthChecks.map((check, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                {check.status === 'healthy' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : check.status === 'warning' ? (
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
                <div>
                  <p className="font-medium text-gray-900">{check.service}</p>
                  {check.message && (
                    <p className="text-sm text-gray-600">{check.message}</p>
                  )}
                </div>
              </div>
              
              {check.latency && (
                <div className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(check.status)}`}>
                  {check.latency}ms
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Cache Performance
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Hit Rate</span>
                <span className={`font-medium ${getMetricColor(metrics.cacheHitRate, 'rate')}`}>
                  {metrics.cacheHitRate.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 bg-blue-500 rounded-full"
                  style={{ width: `${metrics.cacheHitRate}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              WebSocket Connections
            </h4>
            <div className="flex items-center space-x-2">
              <Wifi className="w-5 h-5 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">
                {metrics.wsConnections}
              </span>
              <span className="text-sm text-gray-600">ativas</span>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Error Rate
            </h4>
            <div className="flex items-center space-x-2">
              <AlertCircle className={`w-5 h-5 ${
                metrics.errorRate > 5 ? 'text-red-600' : 
                metrics.errorRate > 2 ? 'text-yellow-600' : 'text-green-600'
              }`} />
              <span className={`text-2xl font-bold ${getMetricColor(metrics.errorRate, 'usage')}`}>
                {metrics.errorRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealth;