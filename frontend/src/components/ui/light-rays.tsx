import { useMemo, type CSSProperties } from "react";
import { cn } from "../../lib/utils";

type AnimationConfig = {
  animate: boolean;
  speed: number;
};

type RaysColorConfig =
  | { mode: "single"; color: string }
  | { mode: "multi"; color1: string; color2: string }
  | { mode: "random" };

export interface LightRaysProps {
  intensity?: number;
  rays?: number;
  reach?: number;
  position?: number;
  radius?: string;
  backgroundColor?: string;
  animation?: AnimationConfig;
  raysColor?: RaysColorConfig;
  style?: CSSProperties;
  className?: string;
}

function colorToRgb(color: string): string {
  const value = color.trim();
  if (value.startsWith("rgba(") || value.startsWith("rgb(")) {
    return value.slice(value.indexOf("(") + 1, -1).split(",").slice(0, 3).map((part) => part.trim()).join(" ");
  }

  const hex = value.startsWith("#") ? value.slice(1) : value;
  if (hex.length === 3) {
    return [hex[0] + hex[0], hex[1] + hex[1], hex[2] + hex[2]]
      .map((channel) => Number.parseInt(channel, 16))
      .join(" ");
  }
  if (hex.length >= 6) {
    return [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]
      .map((channel) => Number.parseInt(channel, 16))
      .join(" ");
  }
  return "255 255 255";
}

function randomGreenPair(): [string, string] {
  const hue = 126 + Math.random() * 38;
  return [`hsl(${hue} 82% 66%)`, `hsl(${hue + 14} 78% 48%)`];
}

/**
 * Decorative CSS-only rays. Keeping this layer out of WebGL means the landing
 * stays available on low-power devices and when optional graphics packages are
 * not present in a local checkout.
 */
export default function Rays({
  intensity = 13,
  rays = 32,
  reach = 16,
  position = 50,
  radius = "0px",
  backgroundColor = "transparent",
  animation = { animate: true, speed: 10 },
  raysColor = { mode: "single", color: "#639AFF" },
  style,
  className,
}: LightRaysProps) {
  const colors = useMemo<[string, string]>(() => {
    if (raysColor.mode === "single") return [raysColor.color, raysColor.color];
    if (raysColor.mode === "multi") return [raysColor.color1, raysColor.color2];
    return randomGreenPair();
  }, [raysColor]);

  const normalizedIntensity = Math.min(1, Math.max(0.35, intensity / 18));
  const normalizedDensity = Math.min(1, Math.max(0.2, rays / 40));
  const normalizedReach = Math.min(0.9, Math.max(0.12, reach / 100));
  const variables = {
    "--light-rays-color-1": colors[0],
    "--light-rays-color-2": colors[1],
    "--light-rays-color-1-rgb": colorToRgb(colors[0]),
    "--light-rays-color-2-rgb": colorToRgb(colors[1]),
    "--light-rays-position": `${position}%`,
    "--light-rays-intensity": String(normalizedIntensity),
    "--light-rays-density": String(normalizedDensity),
    "--light-rays-reach": String(normalizedReach),
    "--light-rays-duration": `${Math.max(8, 22 - animation.speed)}s`,
    "--light-rays-play-state": animation.animate ? "running" : "paused",
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={cn("light-rays", className)}
      style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, backgroundColor, pointerEvents: "none", ...variables, ...style }}
    >
      <span className="light-rays__fallback" />
      <span className="light-rays__beam light-rays__beam--one" />
      <span className="light-rays__beam light-rays__beam--two" />
      <span className="light-rays__beam light-rays__beam--three" />
      <span className="light-rays__beam light-rays__beam--four" />
      <span className="light-rays__beam light-rays__beam--five" />
    </div>
  );
}
