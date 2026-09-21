import { type CSSProperties, type ReactNode } from "react";

export interface TiltCardProps {
  tiltLimit?: number;
  scale?: number;
  perspective?: number;
  effect?: "gravitate" | "evade";
  spotlight?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * A superfície de revisão financeira não deve mover-se sob o cursor: mantém a
 * API do componente, mas oferece uma moldura estável e legível.
 */
export function TiltCard({
  tiltLimit: _tiltLimit = 0,
  scale: _scale = 1,
  perspective: _perspective = 0,
  effect: _effect = "gravitate",
  spotlight: _spotlight = false,
  className = "",
  style,
  children,
}: TiltCardProps) {
  return (
    <div
      className={`tilt-card ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
