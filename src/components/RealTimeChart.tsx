import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, Maximize2 } from 'lucide-react';

interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  timestamp: number;
}

interface ChartProps {
  symbol: string;
  height?: number;
}

const RealTimeChart: React.FC<ChartProps> = ({ symbol, height = 300 }) => {
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [currentPrice, setCurrentPrice] = useState<PriceData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [symbol]);

  useEffect(() => {
    if (priceData.length > 0) {
      drawChart();
    }
  }, [priceData]);

  const connectWebSocket = () => {
    try {
      const binanceSymbol = symbol.replace('/', '').toLowerCase();
      const wsUrl = `wss://fstream.binance.com/ws/${binanceSymbol}@ticker`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log(`WebSocket conectado para ${symbol}`);
        setIsConnected(true);
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          const newPrice: PriceData = {
            symbol: data.s,
            price: parseFloat(data.c),
            change24h: parseFloat(data.P),
            volume: parseFloat(data.v),
            timestamp: Date.now()
          };
          
          setCurrentPrice(newPrice);
          
          setPriceData(prev => {
            const updated = [...prev, newPrice];
            return updated.slice(-100); // Mantém últimos 100 pontos
          });
        } catch (error) {
          console.error('Erro ao processar dados WebSocket:', error);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log(`WebSocket fechado para ${symbol}`);
        setIsConnected(false);
        
        // Reconecta após 5 segundos
        setTimeout(connectWebSocket, 5000);
      };
      
      wsRef.current.onerror = (error) => {
        console.error(`Erro WebSocket ${symbol}:`, error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('Erro ao conectar WebSocket:', error);
    }
  };

  const drawChart = () => {
    const canvas = chartRef.current;
    if (!canvas || priceData.length < 2) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    
    // Limpa canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calcula escala
    const prices = priceData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    if (priceRange === 0) return;
    
    // Desenha grid
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    
    // Linhas horizontais
    for (let i = 0; i <= 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Linhas verticais
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Desenha linha de preço
    ctx.strokeStyle = priceData[priceData.length - 1].change24h >= 0 ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    priceData.forEach((data, index) => {
      const x = (width / (priceData.length - 1)) * index;
      const y = height - ((data.price - minPrice) / priceRange) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Desenha pontos
    ctx.fillStyle = priceData[priceData.length - 1].change24h >= 0 ? '#10b981' : '#ef4444';
    priceData.forEach((data, index) => {
      const x = (width / (priceData.length - 1)) * index;
      const y = height - ((data.price - minPrice) / priceRange) * height;
      
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
    
    // Labels de preço
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + (priceRange / 5) * (5 - i);
      const y = (height / 5) * i + 4;
      ctx.fillText(price.toFixed(4), width - 5, y);
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1) return price.toFixed(4);
    if (price >= 0.01) return price.toFixed(6);
    return price.toFixed(8);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-blue-600 font-bold text-sm">
              {symbol.split('/')[0]}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{symbol}</h3>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>
        
        {currentPrice && (
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">
              ${formatPrice(currentPrice.price)}
            </p>
            <div className="flex items-center space-x-1">
              {currentPrice.change24h >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${
                currentPrice.change24h >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {currentPrice.change24h >= 0 ? '+' : ''}{currentPrice.change24h.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>
      
      <div className="relative">
        <canvas
          ref={chartRef}
          width={600}
          height={height}
          className="w-full border border-gray-100 rounded-lg"
        />
        
        {!isConnected && (
          <div className="absolute inset-0 bg-gray-50 bg-opacity-75 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Activity className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Conectando...</p>
            </div>
          </div>
        )}
      </div>
      
      {currentPrice && (
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Volume 24h:</span>
            <span className="ml-2 font-medium text-gray-900">
              {currentPrice.volume.toLocaleString('pt-BR')}
            </span>
          </div>
          <div>
            <span className="text-gray-600">Última atualização:</span>
            <span className="ml-2 font-medium text-gray-900">
              {new Date(currentPrice.timestamp).toLocaleTimeString('pt-BR')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealTimeChart;