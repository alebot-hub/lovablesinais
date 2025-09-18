import React, { useState } from 'react';
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

const SignalCard = ({ signal }: SignalCardProps) => {
  const [showChart, setShowChart] = useState<boolean>(false);
  
  const safeScore: number = typeof signal.score === 'number' && !isNaN(signal.score) ? signal.score : 0;
  const safeEntry: number = typeof signal.entry === 'number' && !isNaN(signal.entry) ? signal.entry : 0;
  
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
        return React.createElement(TrendingUp, { className: "w-5 h-5 text-green-600" });
      case 'BEARISH':
        return React.createElement(TrendingDown, { className: "w-5 h-5 text-red-600" });
      default:
        return React.createElement(Target, { className: "w-5 h-5 text-gray-600" });
    }
  };

  const getTrendColor = (trend: string): string => {
    switch (trend) {
      case 'BULLISH':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'BEARISH':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleChartToggle = () => {
    setShowChart(!showChart);
  };

  return React.createElement('div', {
    className: "bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
  }, [
    React.createElement('div', {
      key: 'header',
      className: "flex items-center justify-between mb-4"
    }, [
      React.createElement('div', {
        key: 'symbol-info',
        className: "flex items-center space-x-3"
      }, [
        React.createElement('div', {
          key: 'icon',
          className: "w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"
        }, 
          React.createElement('span', {
            className: "text-blue-600 font-bold text-sm"
          }, signal.symbol.split('/')[0])
        ),
        React.createElement('div', { key: 'details' }, [
          React.createElement('h3', {
            key: 'title',
            className: "font-semibold text-gray-900"
          }, signal.symbol),
          React.createElement('div', {
            key: 'timestamp',
            className: "flex items-center space-x-2 mt-1"
          }, [
            React.createElement(Clock, {
              key: 'clock-icon',
              className: "w-4 h-4 text-gray-400"
            }),
            React.createElement('span', {
              key: 'time',
              className: "text-sm text-gray-500"
            }, formatTimestamp(signal.timestamp))
          ])
        ])
      ]),
      React.createElement('div', {
        key: 'score',
        className: `px-3 py-1 rounded-full text-sm font-medium ${getScoreColor(safeScore)}`
      }, `${safeScore.toFixed(1)}%`)
    ]),

    React.createElement('div', {
      key: 'metrics',
      className: "grid grid-cols-2 gap-4"
    }, [
      React.createElement('div', {
        key: 'entry',
        className: "space-y-2"
      }, [
        React.createElement('div', {
          key: 'entry-label',
          className: "flex items-center space-x-2"
        }, [
          React.createElement(DollarSign, {
            key: 'dollar-icon',
            className: "w-4 h-4 text-gray-400"
          }),
          React.createElement('span', {
            key: 'entry-text',
            className: "text-sm text-gray-600"
          }, 'Entrada')
        ]),
        React.createElement('p', {
          key: 'entry-value',
          className: "text-lg font-semibold text-gray-900"
        }, `$${safeEntry.toFixed(4)}`)
      ]),

      React.createElement('div', {
        key: 'trend',
        className: "space-y-2"
      }, [
        React.createElement('div', {
          key: 'trend-label',
          className: "flex items-center space-x-2"
        }, [
          getTrendIcon(signal.trend),
          React.createElement('span', {
            key: 'trend-text',
            className: "text-sm text-gray-600"
          }, 'Tendência')
        ]),
        React.createElement('div', {
          key: 'trend-badge',
          className: `inline-flex px-2 py-1 rounded-full text-sm font-medium border ${getTrendColor(signal.trend)}`
        }, signal.trend)
      ])
    ]),

    React.createElement('div', {
      key: 'footer',
      className: "mt-4 pt-4 border-t border-gray-100"
    }, [
      React.createElement('div', {
        key: 'probability',
        className: "flex items-center justify-between text-sm"
      }, [
        React.createElement('span', {
          key: 'prob-label',
          className: "text-gray-500"
        }, 'Probabilidade de sucesso'),
        React.createElement('div', {
          key: 'prob-bar',
          className: "flex items-center space-x-2"
        }, [
          React.createElement('div', {
            key: 'bar-bg',
            className: "w-20 bg-gray-200 rounded-full h-2"
          },
            React.createElement('div', {
              className: `h-2 rounded-full ${
                safeScore >= 80 ? 'bg-green-500' : 
                safeScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              }`,
              style: { width: `${safeScore}%` }
            })
          ),
          React.createElement('span', {
            key: 'prob-value',
            className: "font-medium text-gray-900"
          }, `${safeScore.toFixed(0)}%`)
        ])
      ]),
      
      React.createElement('div', {
        key: 'chart-toggle',
        className: "mt-3 pt-3 border-t border-gray-100"
      },
        React.createElement('button', {
          onClick: handleChartToggle,
          className: "w-full flex items-center justify-center space-x-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm"
        }, [
          React.createElement(TrendingUp, {
            key: 'chart-icon',
            className: "w-4 h-4"
          }),
          React.createElement('span', {
            key: 'chart-text'
          }, showChart ? 'Ocultar Gráfico' : 'Ver Gráfico em Tempo Real')
        ])
      )
    ]),
    
    showChart && React.createElement('div', {
      key: 'chart',
      className: "mt-4 pt-4 border-t border-gray-100"
    },
      React.createElement(RealTimeChart, {
        symbol: signal.symbol,
        height: 200
      })
    )
  ].filter(Boolean));
};

export default SignalCard;