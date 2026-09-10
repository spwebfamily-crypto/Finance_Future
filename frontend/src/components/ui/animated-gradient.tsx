import { useMemo, type CSSProperties } from "react";
import { cn } from "../../lib/utils";

type PatternShape = "Checks" | "Stripes" | "Edge";

type CustomConfig = {
  preset: "custom";
  color1: string;
  color2: string;
  color3: string;
  rotation?: number;
  proportion?: number;
  scale?: number;
  speed?: number;
  distortion?: number;
  swirl?: number;
  swirlIterations?: number;
  softness?: number;
  offset?: number;
  shape?: PatternShape;
  shapeSize?: number;
};

type PresetName = "Prism" | "Pulse";
type GradientConfig = CustomConfig | { preset: PresetName; speed?: number };

export interface AnimatedGradientProps {
  config?: GradientConfig;
  noise?: { opacity: number; scale?: number };
  radius?: string;
  className?: string;
  style?: CSSProperties;
}

const presets = {
  Prism: { color1: "#10160f", color2: "#075440", color3: "#bbf451", rotation: -38, speed: 12, swirl: 36, scale: 0.42, offset: 0 },
  Pulse: { color1: "#10160f", color2: "#0b6a4d", color3: "#9ccd3a", rotation: -56, speed: 9, swirl: 28, scale: 0.36, offset: -12 },
} as const;

/**
 * Vite-compatible animated-gradient surface. It keeps Spell UI's config API
 * while using compositor-friendly gradient layers in the marketing hero.
 */
export default function AnimatedGradient({
  config = { preset: "Prism" },
  noise,
  radius = "0px",
  className,
  style,
}: AnimatedGradientProps) {
  const values = useMemo(() => {
    const base = config.preset === "custom" ? config : presets[config.preset];
    return {
      color1: base.color1,
      color2: base.color2,
      color3: base.color3,
      rotation: base.rotation ?? 0,
      speed: base.speed ?? 25,
      swirl: base.swirl ?? 50,
      scale: base.scale ?? 0.5,
      offset: base.offset ?? 0,
    };
  }, [config]);

  const cssVariables = {
    "--animated-gradient-color-1": values.color1,
    "--animated-gradient-color-2": values.color2,
    "--animated-gradient-color-3": values.color3,
    "--animated-gradient-rotation": `${values.rotation}deg`,
    "--animated-gradient-duration": `${Math.max(18, 130 - values.speed * 4)}s`,
    "--animated-gradient-delay": `${values.offset}s`,
    "--animated-gradient-scale": String(1 + values.scale),
    "--animated-gradient-swirl": `${16 + values.swirl * 0.42}%`,
    "--animated-gradient-noise": String(noise?.opacity ?? 0),
    "--animated-gradient-noise-size": `${(noise?.scale ?? 1) * 150}px`,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={cn("animated-gradient", className)}
      style={{ position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", borderRadius: radius, pointerEvents: "none", ...cssVariables, ...style }}
    >
      <span className="animated-gradient__field" />
      <span className="animated-gradient__orb animated-gradient__orb--one" />
      <span className="animated-gradient__orb animated-gradient__orb--two" />
      <span className="animated-gradient__noise" />
    </div>
  );
}
