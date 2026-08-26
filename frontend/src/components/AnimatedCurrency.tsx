import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { formatCurrency } from "../utils/format";

interface AnimatedCurrencyProps {
  value: number;
  currency: string;
  duration?: number;
}

// Conta de zero (ou do valor anterior) até ao valor final. Sem animação quando
// o utilizador prefere movimento reduzido.
export function AnimatedCurrency({ value, currency, duration = 700 }: AnimatedCurrencyProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);
  const previousValue = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const startValue = Math.abs(value - previousValue.current) < 0.005 ? 0 : previousValue.current;
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // easeOutCubic: arranque rápido, assentamento suave.
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(startValue + (value - startValue) * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    previousValue.current = value;
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration, reduceMotion]);

  return <span aria-live="off">{formatCurrency(reduceMotion ? value : display, currency)}</span>;
}
