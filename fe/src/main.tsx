// Monta la aplicación web y sus proveedores en el elemento raíz del documento.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '@contexts/AuthContext';
import { AuthModalProvider } from '@contexts/AuthModalContext';
import { CartProvider } from '@contexts/CartContext';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import App from './App';
import { GOOGLE_CLIENT_ID } from '@utils/google';
import './styles/navbar.css'

const GOOGLE_CLIENT_ID_CONFIG = GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID_CONFIG}>
        <IdiomaProvider>
          <AuthProvider>
            <AuthModalProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </AuthModalProvider>
          </AuthProvider>
        </IdiomaProvider>
      </GoogleOAuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);