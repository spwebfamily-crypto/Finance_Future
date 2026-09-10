import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type Align = "left" | "center" | "right";

export interface GradientWaveTextProps {
  children?: ReactNode;
  className?: string;
  align?: Align;
  speed?: number;
  paused?: boolean;
  delay?: number;
  repeat?: boolean;
  inView?: boolean;
  once?: boolean;
  radial?: boolean;
  bottomOffset?: number;
  bandGap?: number;
  bandCount?: number;
  customColors?: string[];
  ariaLabel?: string;
  onClick?: (event: MouseEvent<HTMLSpanElement>) => void;
  onMouseEnter?: (event: MouseEvent<HTMLSpanElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLSpanElement>) => void;
}

const defaultColors = ["#f4f5ed", "#d7e7aa", "#bbf451", "#198266", "#bbf451", "#f4f5ed"];

/** Vite-compatible adaptation of Spell UI's Gradient Wave Text. */
export function GradientWaveText({
  children,
  className,
  align = "center",
  speed = 1,
  paused = false,
  delay = 0,
  repeat = false,
  inView = false,
  once = true,
  radial = true,
  bottomOffset = 20,
  bandGap = 4,
  bandCount = 8,
  customColors,
  ariaLabel,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: GradientWaveTextProps) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef(0);
  const startedRef = useRef(false);
  const hasPlayedRef = useRef(false);
  const [isInView, setIsInView] = useState(!inView);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!inView) {
      setIsInView(true);
      return;
    }

    const node = elementRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (!once || !hasPlayedRef.current)) {
          hasPlayedRef.current = true;
          setIsInView(true);
        } else if (!once) {
          setIsInView(false);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, once]);

  const colors = customColors?.length ? customColors : defaultColors;
  const gradient = useMemo(() => {
    const base = "var(--gradient-wave-base, #f4f5ed)";
    const stops = [base + " calc((var(--gradient-wave-index) + 0) * 1%)"];
    for (let index = 0; index < bandCount && index < colors.length * 2; index += 1) {
      stops.push(`${colors[index % colors.length]} calc((var(--gradient-wave-index) + ${(index + 2) * bandGap}) * 1%)`);
    }
    stops.push(`${base} calc((var(--gradient-wave-index) + ${(bandCount + 2) * bandGap}) * 1%)`);
    return radial ? `radial-gradient(circle at 50% bottom, ${stops.join(", ")})` : `linear-gradient(0deg, ${stops.join(", ")})`;
  }, [bandCount, bandGap, colors, radial]);

  useEffect(() => {
    const node = elementRef.current;
    if (!node || !isInView) return;

    node.style.setProperty("--gradient-wave-index", "-25");
    if (paused || reduceMotion) return;

    const startAt = performance.now() + Math.max(0, delay) * 1000;
    const range = 200;
    let last = startAt;
    let value = -25;

    const animate = (now: number) => {
      if (now < startAt) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }
      if (!startedRef.current) {
        startedRef.current = true;
        last = now;
      }
      const elapsed = Math.min(64, now - last);
      last = now;
      value += (elapsed * Math.max(0.1, speed)) / 16.6667;
      if (value >= range) {
        if (!repeat) {
          node.style.setProperty("--gradient-wave-index", String(range));
          return;
        }
        value %= range;
      }
      node.style.setProperty("--gradient-wave-index", String(value));
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [delay, isInView, paused, reduceMotion, repeat, speed]);

  const justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const handleClick = useCallback((event: MouseEvent<HTMLSpanElement>) => onClick?.(event), [onClick]);
  const handleMouseEnter = useCallback((event: MouseEvent<HTMLSpanElement>) => onMouseEnter?.(event), [onMouseEnter]);
  const handleMouseLeave = useCallback((event: MouseEvent<HTMLSpanElement>) => onMouseLeave?.(event), [onMouseLeave]);

  return (
    <span
      ref={elementRef}
      className={cn("gradient-wave-text", className)}
      style={{ display: "inline-flex", width: "100%", justifyContent, "--gradient-wave-index": -25 } as CSSProperties}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        aria-hidden={ariaLabel ? true : undefined}
        style={{
          textAlign: align,
          backgroundImage: gradient,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          display: "inline-block",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          paddingBottom: `${bottomOffset}%`,
          marginBottom: `-${bottomOffset}%`,
          paddingInline: 2,
        }}
      >
        {children}
      </span>
    </span>
  );
}

export default GradientWaveText;
