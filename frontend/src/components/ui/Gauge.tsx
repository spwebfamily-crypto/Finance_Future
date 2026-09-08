import { motion, useReducedMotion } from "framer-motion";

interface GaugeProps {
  value: number;
  label: string;
  detail: string;
}

export function Gauge({ value, label, detail }: GaugeProps) {
  const reduceMotion = useReducedMotion();
  const safeValue = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 44;

  return (
    <figure className="landing-gauge" aria-label={`${label}: ${safeValue}%`}>
      <div className="landing-gauge__visual">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="landing-gauge__track" cx="50" cy="50" r="44" />
          <motion.circle
            className="landing-gauge__value"
            cx="50"
            cy="50"
            r="44"
            strokeDasharray={circumference}
            initial={reduceMotion ? false : { strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - safeValue / 100) }}
            transition={{ duration: reduceMotion ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <strong>{safeValue}%</strong>
      </div>
      <figcaption>
        <strong>{label}</strong>
        <span>{detail}</span>
      </figcaption>
    </figure>
  );
}
