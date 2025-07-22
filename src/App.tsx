import React from 'react';

// Componente de loading simples
const LoadingFallback = () => (
  <div style={{
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #e5e7eb',
        borderTop: '4px solid #2563eb',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 1rem'
      }} />
      <p style={{ color: '#6b7280', fontSize: '1rem' }}>
        Carregando Bot Lobo Cripto...
      </p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  </div>
);

// Lazy load do Dashboard com fallback
const Dashboard = React.lazy(() => {
  console.log('📊 Carregando componente Dashboard...');
  return import('./components/Dashboard').catch(error => {
    console.error('❌ Erro ao carregar Dashboard:', error);
    // Retorna componente de erro como fallback
    return {
      default: () => (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '2rem',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626', marginBottom: '1rem' }}>
              Erro ao Carregar Dashboard
            </h1>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Não foi possível carregar o componente principal.
            </p>
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              🔄 Tentar Novamente
            </button>
          </div>
        </div>
      )
    };
  });
});

function App() {
  console.log('🚀 App component renderizando...');
  
  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: '100vh' }}>
      <React.Suspense fallback={<LoadingFallback />}>
        <Dashboard />
      </React.Suspense>
    </div>
  );
}

export default App;