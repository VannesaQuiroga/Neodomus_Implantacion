// Componente reutilizable AuthRouteBridge para componer la interfaz de Neodomus.
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthModal, AuthStep } from '@contexts/AuthModalContext';

const AuthRouteBridge = ({ step }: { step: AuthStep }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openAuth } = useAuthModal();

  useEffect(() => {
    const email = searchParams.get('email') || undefined;
    const token = searchParams.get('token') || undefined;
    openAuth(step, { email, token });
    navigate('/', { replace: true });
    // Solo se ejecuta una vez al montar el puente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default AuthRouteBridge;
