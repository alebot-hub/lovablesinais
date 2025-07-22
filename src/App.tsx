import React from 'react';
import Dashboard from './components/Dashboard';

function App() {
  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: '100vh' }}>
      <React.Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando Bot Lobo Cripto...</p>
          </div>
        </div>
      }>
        <Dashboard />
      </React.Suspense>
    </div>
  );
}

export default App;
