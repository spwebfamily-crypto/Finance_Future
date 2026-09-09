import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

interface ScrollStoryPortalProps {
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
 * Transição em scroll: o ícone da app cresce até ocupar o ecrã e revelar
 * uma demonstração concreta do produto.
 */
export function ScrollStoryPortal({
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
        section.style.setProperty("--story-hero", "0");
        section.style.setProperty("--story-hint", "0");
        section.style.setProperty("--story-mark", "0");
        section.style.setProperty("--story-scale", "1");
        section.style.setProperty("--story-reveal", "1");
        section.dataset.entered = "true";
        section.dataset.heroLive = "false";
        return;
      }

      const bounds = section.getBoundingClientRect();
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = clamp(-bounds.top / travel);

      // Hero some → ícone aparece → cresce até preencher → dissolve no painel.
      const hero = 1 - smooth(0, 0.2, progress);
      const markIn = smooth(0.2, 0.34, progress);
      const zoom = smooth(0.34, 0.6, progress);
      const markOut = 1 - smooth(0.54, 0.7, progress);
      const reveal = smooth(0.62, 0.84, progress);

      section.style.setProperty("--story-hero", hero.toFixed(4));
      section.style.setProperty("--story-hint", hero.toFixed(4));
      section.style.setProperty("--story-mark", (markIn * markOut).toFixed(4));
      // Ícone ~11.5rem: scale ~6–7 já preenche o pin; 16–20× deixava um blob.
      section.style.setProperty("--story-scale", String(1 + zoom * 6.2));
      section.style.setProperty("--story-reveal", reveal.toFixed(4));
      section.dataset.entered = String(progress >= 0.78);
      section.dataset.heroLive = String(hero > 0.12);
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

        <div className="scroll-story__mark" aria-hidden="true">
          <svg
            className="scroll-story__zoom"
            viewBox="0 0 128 128"
            focusable="false"
          >
            <rect className="scroll-story__mark-tile" width="128" height="128" rx="28" />
            <g className="scroll-story__mark-ink">
              <path d="M39 22H29a7 7 0 0 0-7 7v10M89 22h10a7 7 0 0 1 7 7v10M22 89v10a7 7 0 0 0 7 7h10M106 89v10a7 7 0 0 1-7 7H89" />
              <path d="M45 91V44a8 8 0 0 1 8-8h22a8 8 0 0 1 8 8v47l-9-5-10 6-10-6z" />
            </g>
            <path className="scroll-story__mark-core" d="M64 52a14 14 0 1 0 14 14H64Z" />
          </svg>
        </div>

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
