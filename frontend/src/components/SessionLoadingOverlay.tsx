import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { FullPageLoader } from "./States";

const LOADER_REVEAL_DELAY_MS = 140;

export function SessionLoadingOverlay() {
  const { isInitializing } = useAuth();

  return (
    <AnimatePresence>
      {isInitializing && <DelayedSessionLoader key="session-loader" />}
    </AnimatePresence>
  );
}

function DelayedSessionLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), LOADER_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return visible ? <FullPageLoader label="A recuperar a sua sessão" /> : null;
}
