import { AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FullPageLoader } from './States';

const LOADER_REVEAL_DELAY_MS = 140;

export function SessionLoadingOverlay() {
  const { isInitializing } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isInitializing) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), LOADER_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isInitializing]);

  return (
    <AnimatePresence>
      {visible && <FullPageLoader key="session-loader" label="A recuperar a sua sessão" />}
    </AnimatePresence>
  );
}
