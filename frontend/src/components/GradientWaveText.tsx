import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";

interface GradientWaveTextProps {
  children: ReactNode;
  className?: string;
  speed?: number;
  repeat?: boolean;
  inView?: boolean;
  colors?: string[];
  ariaLabel?: string;
}

/**
 * Adaptação do Gradient Wave Text do Spell UI à stack CSS do ExpenseSnap.
 * A onda usa as cores da marca e respeita reduced-motion.
 */
export function GradientWaveText({
  children,
  className = "",
  speed = 0.72,
  repeat = true,
  inView = false,
  colors = ["var(--brand)", "var(--accent)", "var(--chart-2)", "var(--brand-dark)"],
  ariaLabel,
}: GradientWaveTextProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const colorStops = useMemo(() => {
    const stops = colors.flatMap((color, index) => {
      const start = 20 + index * 12;
      return [`${color} calc((var(--wave-progress) + ${start}) * 1%)`];
    });
    return [
      "var(--gradient-wave-base) calc(var(--wave-progress) * 1%)",
      ...stops,
      `var(--gradient-wave-base) calc((var(--wave-progress) + ${32 + colors.length * 12}) * 1%)`,
    ].join(", ");
  }, [colors]);

  useEffect(() => {
    const node = elementRef.current;
    if (!node || reduceMotion) return;

    let frame = 0;
    let progress = -70;
    let lastTime = performance.now();
    let playing = !inView;
    const observer = inView
      ? new IntersectionObserver(([entry]) => {
          playing = entry.isIntersecting;
        }, { threshold: 0.2 })
      : null;

    if (observer) observer.observe(node);

    const tick = (now: number) => {
      const elapsed = Math.min(64, now - lastTime);
      lastTime = now;
      if (playing) {
        progress += (elapsed * speed) / 16.6667;
        if (progress >= 150) {
          if (!repeat) {
            node.style.setProperty("--wave-progress", "150");
            return;
          }
          progress = -70;
        }
        node.style.setProperty("--wave-progress", String(progress));
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [inView, reduceMotion, repeat, speed]);

  return (
    <span
      ref={elementRef}
      className={`gradient-wave-text ${className}`.trim()}
      style={
        {
          "--wave-progress": reduceMotion ? 24 : -70,
          backgroundImage: `linear-gradient(95deg, ${colorStops})`,
        } as CSSProperties
      }
      aria-label={ariaLabel}
    >
      {children}
    </span>
  );
}
