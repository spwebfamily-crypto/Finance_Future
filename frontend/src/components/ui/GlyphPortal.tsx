/**
 * Glyph Portal concept © 2026 Christian Katzmann. MIT.
 * Adapted for ExpenseSnap from the component supplied by the user.
 */
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

interface GlyphPortalProps {
  word: string;
  front: ReactNode;
  children: ReactNode;
  scrollLength?: number;
  enterLabel?: string;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smooth(start: number, end: number, value: number) {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export function GlyphPortal({
  word,
  front,
  children,
  scrollLength = 2.15,
  enterLabel = "Conhecer o ExpenseSnap",
}: GlyphPortalProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const contentId = `glyph-portal-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const paint = () => {
      frame = 0;
      if (reducedMotion?.matches) {
        section.style.setProperty("--portal-progress", "1");
        section.style.setProperty("--portal-scale", "1");
        return;
      }

      const bounds = section.getBoundingClientRect();
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = clamp(-bounds.top / travel);
      const zoom = smooth(0.06, 0.77, progress);
      const reveal = smooth(0.68, 0.86, progress);

      section.style.setProperty("--portal-progress", progress.toFixed(4));
      section.style.setProperty("--portal-scale", String(1 + zoom * 24));
      section.style.setProperty("--portal-reveal", reveal.toFixed(4));
      section.dataset.entered = String(progress >= 0.82);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reducedMotion?.addEventListener("change", paint);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion?.removeEventListener("change", paint);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="glyph-portal"
      style={{ "--portal-length": scrollLength } as React.CSSProperties}
      aria-label={`${word}: apresentação do ExpenseSnap`}
    >
      <div className="glyph-portal__pin">
        <div className="glyph-portal__front">{front}</div>

        <svg
          className="glyph-portal__type"
          viewBox="0 0 1200 620"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id={`${contentId}-clip`}>
              <text x="600" y="390" textAnchor="middle">
                {word}
              </text>
            </clipPath>
          </defs>
          <g className="glyph-portal__zoom">
            <rect
              x="0"
              y="0"
              width="1200"
              height="620"
              clipPath={`url(#${contentId}-clip)`}
              fill="#176747"
            />
            <g clipPath={`url(#${contentId}-clip)`} className="glyph-portal__grid">
              {Array.from({ length: 14 }, (_, index) => (
                <line key={`v-${index}`} x1={index * 96} y1="0" x2={index * 96} y2="620" />
              ))}
              {Array.from({ length: 8 }, (_, index) => (
                <line key={`h-${index}`} x1="0" y1={index * 88} x2="1200" y2={index * 88} />
              ))}
            </g>
          </g>
        </svg>

        <div className="glyph-portal__field" aria-hidden="true" />
        <div className="glyph-portal__hint">
          <span>Deslize para entrar</span>
          <a href={`#${contentId}`}>
            {enterLabel} <span aria-hidden="true">↘</span>
          </a>
        </div>
        <div className="glyph-portal__content" id={contentId} tabIndex={-1}>
          {children}
        </div>
      </div>
    </section>
  );
}
