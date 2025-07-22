import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App.tsx';
import './index.css';

// Error boundary mais robusto
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
            <div style={{
              fontSize: '3rem',
              marginBottom: '1rem'
            }}>🤖</div>
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
            <details style={{ marginTop: '1rem', textAlign: 'left' }}>
              <summary style={{ 
                cursor: 'pointer', 
                fontSize: '0.875rem', 
                color: '#6b7280',
                marginBottom: '0.5rem'
              }}>
                🔍 Detalhes técnicos do erro
              </summary>
              <div style={{
                fontSize: '0.75rem',
                color: '#dc2626',
                backgroundColor: '#fef2f2',
                padding: '1rem',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '200px',
                fontFamily: 'monospace'
              }}>
                <strong>Erro:</strong><br/>
                {this.state.error?.toString()}<br/><br/>
                <strong>Stack:</strong><br/>
                {this.state.error?.stack}<br/><br/>
                <strong>Component Stack:</strong><br/>
                {this.state.errorInfo?.componentStack}
              </div>
            </details>
            <div style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: '#6b7280'
            }}>
              Se o problema persistir, verifique o console do navegador (F12)
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Função de inicialização com logs detalhados
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
    
    // Fallback manual se React falhar completamente
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

// Aguarda DOM estar pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Captura erros globais não tratados
window.addEventListener('error', (event) => {
  console.error('❌ Erro global capturado:', event.error);
  console.error('❌ Arquivo:', event.filename);
  console.error('❌ Linha:', event.lineno);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Promise rejeitada não tratada:', event.reason);
});