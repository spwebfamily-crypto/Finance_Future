import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { SessionLoadingOverlay } from './components/SessionLoadingOverlay';
import './styles.css';

if ('serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
        <AuthProvider>
          <App />
          <SessionLoadingOverlay />
        </AuthProvider>
      </MotionConfig>
    </BrowserRouter>
  </StrictMode>,
);
