import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    console.error('React Error Boundary - Error caught:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary - Full error:', error);
    console.error('React Error Boundary - Error info:', errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '2rem',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            maxWidth: '500px',
            width: '90%'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#dc2626',
              marginBottom: '1rem'
            }}>Erro no Bot Lobo Cripto</h1>
            <p style={{
              color: '#6b7280',
              marginBottom: '1.5rem'
            }}>Ocorreu um erro inesperado no dashboard.</p>
            <button 
              onClick={() => {
                console.log('Recarregando página...');
                window.location.reload();
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
                marginBottom: '1rem'
              }}
            >
              🔄 Recarregar Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function initializeApp() {
  try {
    console.log('🚀 Inicializando Bot Lobo Cripto Dashboard...');
    
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error('Elemento root não encontrado no DOM');
    }
    
    console.log('✅ Elemento root encontrado');
    
    const root = createRoot(rootElement);
    console.log('✅ React root criado');
    
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    );
    
    console.log('✅ App renderizado com sucesso');
  } catch (error) {
    console.error('❌ Erro fatal na inicialização:', error);
    
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.innerHTML = `
        <div style="min-height: 100vh; background: #f9fafb; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🤖</div>
            <h1 style="font-size: 1.5rem; font-weight: bold; color: #dc2626; margin-bottom: 1rem;">Erro Crítico</h1>
            <p style="color: #6b7280; margin-bottom: 1.5rem;">Falha na inicialização do React</p>
            <button onclick="window.location.reload()" style="padding: 0.75rem 1.5rem; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer;">
              🔄 Recarregar Página
            </button>
            <div style="margin-top: 1rem; font-size: 0.75rem; color: #6b7280;">
              Erro: ${error.message}
            </div>
          </div>
        </div>
      `;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

window.addEventListener('error', (event) => {
  console.error('❌ Erro global capturado:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Promise rejeitada não tratada:', event.reason);
});