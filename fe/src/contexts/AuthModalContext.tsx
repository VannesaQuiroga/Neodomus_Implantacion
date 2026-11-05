// Comparte qué formulario de autenticación debe mostrarse dentro del modal.
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

export type AuthStep =
  | 'ingresar'
  | 'registro'
  | 'recuperar'
  | 'verificar-codigo'
  | 'verificar-email'
  | 'restablecer';

export interface AuthModalParams {
  email?: string;
  token?: string;
}

interface AuthModalContextType {
  step: AuthStep | null;
  email: string;
  token: string;
  openAuth: (next: AuthStep, params?: AuthModalParams) => void;
  closeAuth: () => void;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export const AuthModalProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState<AuthStep | null>(null);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');

  const openAuth = useCallback((next: AuthStep, params?: AuthModalParams) => {
    if (params?.email !== undefined) setEmail(params.email);
    if (params?.token !== undefined) setToken(params.token);
    setStep(next);
  }, []);

  const closeAuth = useCallback(() => {
    setStep(null);
  }, []);

  return (
    <AuthModalContext.Provider value={{ step, email, token, openAuth, closeAuth }}>
      {children}
    </AuthModalContext.Provider>
  );
};

export const useAuthModal = () => {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within an AuthModalProvider');
  return ctx;
};