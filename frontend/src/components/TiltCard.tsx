import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

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
 * Adapta o Tilt Card do Spell UI ao CSS existente do projeto. O movimento é
 * apenas decorativo e fica automaticamente desativado com reduced-motion.
 */
export function TiltCard({
  tiltLimit = 7,
  scale = 1.012,
  perspective = 1200,
  effect = "gravitate",
  spotlight = true,
  className = "",
  style,
  children,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [transform, setTransform] = useState(
    `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
  );
  const [spotlightPosition, setSpotlightPosition] = useState({ x: 50, y: 50 });
  const [hovered, setHovered] = useState(false);

  const reset = useCallback(() => {
    setTransform(`perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`);
    setHovered(false);
  }, [perspective]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduceMotion || event.pointerType === "touch") return;
      const element = cardRef.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      const direction = effect === "evade" ? -1 : 1;
      const rotateX = (y - 0.5) * tiltLimit * 2 * direction;
      const rotateY = (x - 0.5) * -tiltLimit * 2 * direction;
      setTransform(
        `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`,
      );
      if (spotlight) setSpotlightPosition({ x: x * 100, y: y * 100 });
    },
    [effect, perspective, reduceMotion, scale, spotlight, tiltLimit],
  );

  return (
    <div
      ref={cardRef}
      className={`tilt-card ${className}`.trim()}
      style={{
        ...style,
        transform: reduceMotion ? undefined : transform,
        transition: hovered ? "transform 80ms linear" : "transform 260ms var(--ease-out)",
      }}
      onPointerEnter={(event) => {
        if (!reduceMotion && event.pointerType !== "touch") setHovered(true);
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
    >
      {children}
      {spotlight && !reduceMotion && (
        <span
          className="tilt-card__spotlight"
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at ${spotlightPosition.x}% ${spotlightPosition.y}%, rgb(255 255 255 / 22%), transparent 38%)`,
            opacity: hovered ? 1 : 0,
          }}
        />
      )}
    </div>
  );
}
