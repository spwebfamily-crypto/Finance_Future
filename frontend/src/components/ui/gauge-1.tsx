import { useEffect, useId, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

interface GaugeProps {
  value: number;
  size?: number;
  gradient?: boolean;
  primary?: "success" | "warning" | "danger";
  tickMarks?: boolean;
  label?: string;
  transition?: { length?: number; delay?: number };
  className?: string;
}

const toneColor = {
  success: "var(--accent)",
  warning: "var(--warning)",
  danger: "var(--danger)",
} as const;

export function Gauge({
  value,
  size = 200,
  gradient = true,
  primary = "success",
  tickMarks = true,
  label = "Progress",
  transition = { length: 1200, delay: 200 },
  className = "",
}: GaugeProps) {
  const reduceMotion = useReducedMotion();
  const safeValue = Math.min(100, Math.max(0, value));
  const [displayValue, setDisplayValue] = useState(reduceMotion ? safeValue : 0);
  const gradientId = `gauge-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (reduceMotion) {
      setDisplayValue(safeValue);
      return;
    }
    let frame = 0;
    const delay = window.setTimeout(() => {
      const startedAt = performance.now();
      const length = Math.max(1, transition.length ?? 1200);
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / length);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(safeValue * eased);
        if (progress < 1) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    }, transition.delay ?? 0);
    return () => {
      window.clearTimeout(delay);
      cancelAnimationFrame(frame);
    };
  }, [reduceMotion, safeValue, transition.delay, transition.length]);

  const ticks = Array.from({ length: 19 }, (_, index) => {
    const angle = 135 + index * 15;
    const active = index / 18 <= displayValue / 100;
    return <i key={angle} className={active ? "is-active" : ""} style={{ "--tick-angle": `${angle}deg` } as CSSProperties} />;
  });

  return (
    <div
      className={`gauge gauge--${primary} ${className}`.trim()}
      style={{ width: size, height: size } as CSSProperties}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
    >
      {tickMarks && <span className="gauge__ticks" aria-hidden="true">{ticks}</span>}
      <svg className="gauge__dial" viewBox="0 0 120 120" aria-hidden="true">
        {gradient && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--brand)" />
              <stop offset="0.55" stopColor={toneColor[primary]} />
              <stop offset="1" stopColor="var(--chart-1)" />
            </linearGradient>
          </defs>
        )}
        <circle className="gauge__track" cx="60" cy="60" r="45" pathLength="100" />
        <circle
          className="gauge__value"
          cx="60"
          cy="60"
          r="45"
          pathLength="100"
          stroke={gradient ? `url(#${gradientId})` : toneColor[primary]}
          style={{ strokeDasharray: `${displayValue * 0.75} 100` }}
        />
      </svg>
      <span className="gauge__content">
        <strong>{Math.round(displayValue)}%</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

export default Gauge;
