import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

interface ScrollStoryPortalProps {
  word: string;
  ariaLabel: string;
  hint: string;
  actionLabel: string;
  front: ReactNode;
  children: ReactNode;
  scrollLength?: number;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smooth(start: number, end: number, value: number) {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

/**
 * Recupera o portal de scroll da primeira landing page, com uma transição
 * progressiva entre a promessa do hero e uma demonstração concreta do produto.
 */
export function ScrollStoryPortal({
  word,
  ariaLabel,
  hint,
  actionLabel,
  front,
  children,
  scrollLength = 2.35,
}: ScrollStoryPortalProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const contentId = `scroll-story-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const paint = () => {
      frame = 0;
      if (reducedMotion?.matches) {
        section.style.setProperty("--story-progress", "1");
        section.style.setProperty("--story-scale", "1");
        section.style.setProperty("--story-reveal", "1");
        return;
      }

      const bounds = section.getBoundingClientRect();
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = clamp(-bounds.top / travel);
      const zoom = smooth(0.08, 0.7, progress);
      const reveal = smooth(0.58, 0.82, progress);

      section.style.setProperty("--story-progress", progress.toFixed(4));
      section.style.setProperty("--story-scale", String(1 + zoom * 20));
      section.style.setProperty("--story-reveal", reveal.toFixed(4));
      section.dataset.entered = String(progress >= 0.78);
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
      className="scroll-story"
      style={{ "--story-length": scrollLength } as CSSProperties}
      aria-label={ariaLabel}
    >
      <div className="scroll-story__pin">
        <div className="scroll-story__front">{front}</div>

        <svg
          className="scroll-story__word"
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
          <g className="scroll-story__zoom">
            <rect
              x="0"
              y="0"
              width="1200"
              height="620"
              clipPath={`url(#${contentId}-clip)`}
            />
            <g clipPath={`url(#${contentId}-clip)`} className="scroll-story__grid">
              {Array.from({ length: 14 }, (_, index) => (
                <line key={`v-${index}`} x1={index * 96} y1="0" x2={index * 96} y2="620" />
              ))}
              {Array.from({ length: 8 }, (_, index) => (
                <line key={`h-${index}`} x1="0" y1={index * 88} x2="1200" y2={index * 88} />
              ))}
            </g>
          </g>
        </svg>

        <div className="scroll-story__field" aria-hidden="true" />
        <div className="scroll-story__hint">
          <span>{hint}</span>
          <a href={`#${contentId}`}>
            {actionLabel} <span aria-hidden="true">↘</span>
          </a>
        </div>
        <div className="scroll-story__content" id={contentId} tabIndex={-1}>
          {children}
        </div>
      </div>
    </section>
  );
}
