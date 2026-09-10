/**
 * Glyph Portal concept © 2026 Christian Katzmann. MIT.
 * Adapted for ExpenseSnap from the component supplied by the user.
 */
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type GlyphPortalStyle = CSSProperties & {
  "--gp-paper"?: string;
  "--gp-ink"?: string;
  "--gp-field"?: string;
  "--gp-foreground"?: string;
};

export interface GlyphPortalProps {
  word?: string;
  focusChar?: string;
  interactive?: boolean;
  background?: ReactNode;
  front?: ReactNode;
  children?: ReactNode;
  scrollLength?: number;
  fontFamily?: string;
  fontWeight?: number;
  annotations?: boolean;
  enterLabel?: string;
  enterHint?: string;
  chooseLetterLabel?: string;
  ariaLabel?: string;
  className?: string;
  style?: GlyphPortalStyle;
  onProgress?: (progress: number) => void;
}

type Ink = { x: number; y: number; radius: number; index: number };
type Letter = { index: number; x: number; y: number; width: number; height: number };

const DEFAULT_FONT = '"Arial Black", "Arial", sans-serif';
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (start: number, end: number, value: number) => {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
};

function interior(context: CanvasRenderingContext2D, char: string, font: string): Omit<Ink, "index"> | null {
  const canvas = context.canvas;
  context.font = font;
  const metrics = context.measureText(char);
  const pad = 8;
  const left = Math.ceil(metrics.actualBoundingBoxLeft);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
  canvas.width = Math.max(1, Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + pad * 2);
  canvas.height = Math.max(1, Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + pad * 2);
  context.font = font;
  context.fontKerning = "none";
  context.fillText(char, pad + left, pad + ascent);
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const rows = new Uint16Array(width + 1);
  let size = 0;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < height; y += 1) {
    let diagonal = 0;
    for (let x = 0; x < width; x += 1) {
      const above = rows[x + 1];
      rows[x + 1] = pixels[(y * width + x) * 4 + 3] > 245 ? Math.min(above, rows[x], diagonal) + 1 : 0;
      diagonal = above;
      if (rows[x + 1] > size) { size = rows[x + 1]; bx = x; by = y; }
    }
  }
  if (size < 3) return null;
  return { x: (bx + 1 - size / 2 - pad - left) / 3, y: (by + 1 - size / 2 - pad - ascent) / 3, radius: (size / 2 - 1) / 3 };
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (/(auto|scroll|hidden)/.test(overflow) && parent !== document.body && parent !== document.documentElement) return parent;
  }
  return null;
}

export function GlyphPortal({
  word = "EXPENSESNAP",
  focusChar,
  interactive = true,
  background,
  front,
  children,
  scrollLength = 2.3,
  fontFamily = "var(--font-display), Arial, sans-serif",
  fontWeight = 800,
  annotations = false,
  enterLabel = "Conhecer o ExpenseSnap",
  enterHint = "Deslize para entrar",
  chooseLetterLabel = "Escolha uma letra",
  ariaLabel,
  className,
  style,
  onProgress,
}: GlyphPortalProps) {
  const uid = `gp-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const clipId = `${uid}-clip`;
  const sectionRef = useRef<HTMLElement>(null);
  const progressRef = useRef(onProgress);
  const text = word.trim().normalize("NFC") || "EXPENSESNAP";
  const length = Number.isFinite(scrollLength) ? clamp(scrollLength, 1, 8) : 2.3;
  const weight = Number.isFinite(fontWeight) ? Math.min(1000, Math.max(1, fontWeight)) : 800;
  const characters = Array.from(text, (char, index) => ({ char, index }));

  useLayoutEffect(() => { progressRef.current = onProgress; }, [onProgress]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const pin = section.querySelector<HTMLElement>("[data-gp-pin]");
    const field = section.querySelector<HTMLElement>("[data-gp-field]");
    const art = section.querySelector<SVGSVGElement>("[data-gp-art]");
    const clip = section.querySelector<SVGClipPathElement>(`#${clipId}`);
    const glyph = section.querySelector<SVGTextElement>("[data-gp-glyph]");
    const marks = section.querySelector<SVGGElement>("[data-gp-marks]");
    const choices = section.querySelector<HTMLElement>("[data-gp-choices]");
    const picker = section.querySelector<HTMLSelectElement>("[data-gp-select]");
    if (!pin || !field || !art || !clip || !glyph || !marks || !choices || !picker) return undefined;

    const canUseCanvas = !/jsdom/i.test(window.navigator.userAgent);
    let context: CanvasRenderingContext2D | null = null;
    if (canUseCanvas) {
      try {
        context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      } catch {
        context = null;
      }
    }
    const root = scrollParent(section);
    const reducedMotion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : ({
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as unknown as MediaQueryList);
    const buttons = Array.from(choices.querySelectorAll<HTMLButtonElement>("button"));
    let disposed = false;
    let frame = 0;
    let browserFrameSeen = false;
    let ready = false;
    let active = true;
    let width = 1;
    let height = 1;
    let travel = 1;
    let startScale = 1;
    let endScale = 1;
    let center = { x: 0, y: 0 };
    let inkBounds = { width: 1, height: 1 };
    let target: Ink | null = null;
    let candidates: Ink[] = [];
    let letters: Letter[] = [];
    let lastProgress = -1;
    let stalled = false;
    const mountedAt = performance.now();

    const readInk = () => {
      if (!context) return false;
      const computed = getComputedStyle(glyph);
      const family = computed.fontFamily || DEFAULT_FONT;
      const scanFont = `${computed.fontWeight} 300px ${family}`;
      context.font = `${computed.fontWeight} 100px ${family}`;
      context.fontKerning = "none";
      const metrics = context.measureText(text);
      const advances = Array.from({ length: text.length }, (_, index) => context.measureText(text.slice(0, index)).width);
      const bounds = { x: -metrics.actualBoundingBoxLeft, y: -metrics.actualBoundingBoxAscent, width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent };
      if (!bounds.width || !bounds.height) return false;
      inkBounds = { width: bounds.width, height: bounds.height };
      center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const requested = focusChar ? text.indexOf(focusChar.normalize("NFC")) : -1;
      let offset = 0;
      candidates = [];
      letters = [];
      for (const char of Array.from(text)) {
        context.font = `${computed.fontWeight} 100px ${family}`;
        const metricsForChar = context.measureText(char);
        letters.push({ index: offset, x: advances[offset] - metricsForChar.actualBoundingBoxLeft, y: -metricsForChar.actualBoundingBoxAscent, width: metricsForChar.actualBoundingBoxLeft + metricsForChar.actualBoundingBoxRight, height: metricsForChar.actualBoundingBoxAscent + metricsForChar.actualBoundingBoxDescent });
        const found = interior(context, char, scanFont);
        if (found) candidates.push({ ...found, x: found.x + advances[offset], index: offset });
        offset += char.length;
      }
      target = candidates.find((candidate) => candidate.index === requested) ?? [...candidates].sort((a, b) => b.radius - a.radius)[0] ?? null;
      return Boolean(target);
    };

    const select = (next: Ink | null) => {
      target = next;
      endScale = target ? Math.max(startScale, Math.hypot(width, height) / (target.radius * 1.35)) : startScale;
      section.dataset.gpFocus = target ? Array.from(text.slice(target.index))[0] : "";
      section.dataset.gpFocusIndex = String(target?.index ?? -1);
      buttons.forEach((button) => {
        const selected = Number(button.dataset.gpLetter) === target?.index;
        button.disabled = !candidates.some((candidate) => candidate.index === Number(button.dataset.gpLetter));
        button.setAttribute("aria-checked", String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      picker.value = String(target?.index ?? -1);
    };

    const position = () => {
      const origin = root ? root.getBoundingClientRect().top + root.clientTop : 0;
      return clamp((origin - section.getBoundingClientRect().top) / travel);
    };

    const paint = (progress: number) => {
      const isStatic = reducedMotion.matches || !browserFrameSeen || stalled || !target;
      const visibleProgress = isStatic ? 0 : progress;
      const eased = smooth(0, 0.78, visibleProgress);
      const scale = Math.exp(Math.log(startScale) + Math.log(endScale / startScale) * eased);
      const blend = endScale === startScale ? 0 : (1 / scale - 1 / startScale) / (1 / endScale - 1 / startScale);
      const focus = target ?? center;
      const x = center.x + (focus.x - center.x) * blend;
      const y = center.y + (focus.y - center.y) * blend;
      const rotation = -4 * smooth(0.06, 0.5, eased) * (1 - smooth(0.62, 0.92, eased));
      const radians = rotation * Math.PI / 180;
      const translateX = width / 2 / scale;
      const translateY = (height * 0.46 + height * 0.04 * eased) / scale;
      clip.setAttribute("transform", `scale(${scale}) rotate(${rotation})`);
      glyph.setAttribute("transform", `translate(${Math.cos(radians) * translateX + Math.sin(radians) * translateY - x} ${-Math.sin(radians) * translateX + Math.cos(radians) * translateY - y})`);
      marks.setAttribute("transform", `translate(${width / 2} ${height * 0.46 + height * 0.04 * eased}) scale(${scale}) rotate(${rotation}) translate(${-x} ${-y})`);
      marks.style.opacity = String(1 - smooth(0.015, 0.17, visibleProgress));
      const choosing = interactive && !isStatic && visibleProgress < 0.04;
      choices.inert = !choosing;
      section.dataset.gpChoosing = String(choosing);
      field.style.clipPath = eased >= 1 ? "none" : `url(#${clipId})`;
      section.style.setProperty("--gp-caption", String(1 - smooth(0.01, 0.16, visibleProgress)));
      section.style.setProperty("--gp-reveal", String(reducedMotion.matches ? 1 : smooth(0.78, 0.9, visibleProgress)));
      section.dataset.gpEntered = String(visibleProgress >= 0.9);
      section.dataset.gpProgress = visibleProgress.toFixed(5);
      if (visibleProgress !== lastProgress) { lastProgress = visibleProgress; progressRef.current?.(visibleProgress); }
    };

    const layout = () => {
      if (!section.clientWidth) return;
      width = pin.clientWidth;
      const viewportProbe = section.querySelector<HTMLElement>("[data-gp-viewport]");
      const viewportHeight = Math.max(1, Math.min(root?.clientHeight ?? viewportProbe?.offsetHeight ?? window.innerHeight, viewportProbe?.offsetHeight || window.innerHeight));
      height = reducedMotion.matches ? Math.min(viewportHeight * 0.75, 480) : viewportHeight;
      section.style.setProperty("--gp-height", `${height}px`);
      travel = Math.max(1, height * length);
      art.setAttribute("viewBox", `0 0 ${width} ${height}`);
      ready = readInk();
      if (!ready) return;
      startScale = Math.min(width * 0.84 / inkBounds.width, height * 0.38 / inkBounds.height);
      select(target);
      letters.forEach((letter, index) => {
        const button = buttons[index];
        if (!button) return;
        Object.assign(button.style, { left: `${width / 2 + (letter.x - center.x) * startScale}px`, top: `${height * 0.46 + (letter.y - center.y) * startScale}px`, width: `${Math.max(1, letter.width * startScale)}px`, height: `${Math.max(44, letter.height * startScale)}px` });
      });
      section.dataset.gpReady = "true";
      section.dataset.gpMotion = !reducedMotion.matches && browserFrameSeen && target ? "on" : "off";
    };

    const frameCallback = (time?: number) => {
      frame = 0;
      if (disposed) return;
      if (time !== undefined && !browserFrameSeen) { browserFrameSeen = true; stalled = performance.now() - mountedAt > 2500; }
      layout();
      if (ready) paint(position());
    };
    const schedule = () => { if (!frame && active) frame = requestAnimationFrame(frameCallback); };
    const resize = () => { cancelAnimationFrame(frame); frame = 0; frameCallback(); };
    const choose = (event: Event) => {
      if (position() >= 0.04) return;
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-gp-letter]");
      const next = candidates.find((candidate) => candidate.index === Number(button?.dataset.gpLetter));
      if (next) { select(next); paint(position()); }
    };
    const navigate = (event: KeyboardEvent) => {
      if (section.dataset.gpChoosing !== "true" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = candidates.findIndex((candidate) => candidate.index === target?.index);
      const index = event.key === "Home" ? 0 : event.key === "End" ? candidates.length - 1 : (current + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + candidates.length) % candidates.length;
      buttons.find((button) => Number(button.dataset.gpLetter) === candidates[index]?.index)?.focus({ preventScroll: true });
    };
    const pick = () => {
      const next = candidates.find((candidate) => candidate.index === Number(picker.value));
      if (next) { select(next); paint(position()); }
    };

    choices.addEventListener("pointerover", choose);
    choices.addEventListener("click", choose);
    choices.addEventListener("focusin", choose);
    choices.addEventListener("keydown", navigate);
    picker.addEventListener("change", pick);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(section);
    if (root) resizeObserver?.observe(root);
    const visibilityObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      active = Boolean(entry?.isIntersecting);
      if (active) { resize(); schedule(); } else if (frame) { cancelAnimationFrame(frame); frame = 0; }
    }, { root, rootMargin: "100% 0px" });
    visibilityObserver?.observe(section);
    (root ?? window).addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    reducedMotion.addEventListener("change", resize);
    frameCallback();
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      (root ?? window).removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      reducedMotion.removeEventListener("change", resize);
      choices.removeEventListener("pointerover", choose);
      choices.removeEventListener("click", choose);
      choices.removeEventListener("focusin", choose);
      choices.removeEventListener("keydown", navigate);
      picker.removeEventListener("change", pick);
    };
  }, [clipId, focusChar, interactive, length, text]);

  return (
    <section ref={sectionRef} id={uid} className={className} aria-label={ariaLabel ?? `${text}: apresentação do ExpenseSnap`} style={{ "--gp-length": length, "--gp-characters": Array.from(text).length, ...style } as CSSProperties}>
      <style>{`
        #${uid}{--gp-paper:#fbfcf7;--gp-ink:#0c1212;--gp-field:#0b3b2a;--gp-foreground:#fbfbfa;position:relative;isolation:isolate;background:var(--gp-paper);color:var(--gp-ink);font-family:Arial,sans-serif;}
        #${uid}>[data-gp-viewport]{position:absolute;inset:0 auto auto 0;height:100vh;height:100svh;width:0;pointer-events:none;visibility:hidden;}
        #${uid} [data-gp-pin]{position:relative;height:var(--gp-height,100svh);overflow:clip;isolation:isolate;container-type:size;}
        #${uid} [data-gp-field]{position:absolute;inset:0;background:var(--gp-field);opacity:1;pointer-events:none;}
        #${uid} [data-gp-art]{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;}
        #${uid} [data-gp-marks]{fill:none;stroke:var(--gp-ink);opacity:.6;}
        #${uid} [data-gp-choices]{position:absolute;inset:0;visibility:hidden;pointer-events:none;}
        #${uid}[data-gp-choosing=true] [data-gp-choices]{visibility:visible;}
        #${uid} [data-gp-letter]{box-sizing:border-box;position:absolute;border:0;padding:0;margin:0;background:transparent;cursor:pointer;pointer-events:auto;touch-action:pan-y;}
        #${uid} [data-gp-letter]:focus-visible{outline:2px solid var(--gp-field);outline-offset:5px;}
        #${uid} [data-gp-touch-picker]{display:none;position:absolute;top:calc(var(--gp-word-bottom,50%) + 42px);left:50%;transform:translateX(-50%);font:12px/1.4 Arial,sans-serif;align-items:center;gap:12px;visibility:hidden;}
        #${uid}[data-gp-choosing=true] [data-gp-touch-picker]{visibility:visible;}
        #${uid} [data-gp-select]{min-height:44px;min-width:90px;border:1px solid #d8deda;border-radius:8px;background:var(--gp-paper);color:var(--gp-ink);padding:0 10px;font:inherit;}
        #${uid} [data-gp-select]:focus-visible{outline:2px solid var(--gp-field);outline-offset:4px;}
        @media(any-pointer:coarse){#${uid} [data-gp-touch-picker]{display:flex;}}
        #${uid} [data-gp-fallback]{position:absolute;inset:0;display:grid;place-items:center;font-size:min(calc(75cqw / var(--gp-characters)),28cqh);line-height:1;color:var(--gp-ink);}
        #${uid}[data-gp-ready] [data-gp-fallback]{visibility:hidden;}
        #${uid} [data-gp-caption]{position:absolute;inset:auto 8% 9%;display:flex;align-items:center;justify-content:space-between;gap:1rem;font:12px/1.4 Arial,sans-serif;opacity:var(--gp-caption,1);pointer-events:var(--gp-caption-hit,auto);}
        #${uid} [data-gp-front]{position:absolute;inset:0;opacity:var(--gp-caption,1);pointer-events:none;}
        #${uid} [data-gp-front] a,#${uid} [data-gp-front] button{pointer-events:var(--gp-caption-hit,auto);}
        #${uid} [data-gp-hint]{max-width:30ch;color:var(--gp-ink);}
        #${uid} [data-gp-enter]{display:inline-flex;align-items:center;gap:16px;min-height:44px;color:inherit;font:inherit;text-decoration:none;}
        #${uid} [data-gp-enter]:focus-visible{outline:2px solid currentColor;outline-offset:5px;}
        #${uid} [data-gp-content]{box-sizing:border-box;position:relative;min-height:var(--gp-height,100svh);padding:clamp(32px,7%,100px);display:grid;align-content:center;color:var(--gp-foreground);background:var(--gp-field);overflow-wrap:anywhere;}
        #${uid}[data-gp-motion=on] [data-gp-pin]{position:sticky;top:0;}
        #${uid}[data-gp-motion=on] [data-gp-content]{margin-top:calc((var(--gp-length) - 1) * var(--gp-height));background:transparent;opacity:var(--gp-reveal,0);pointer-events:none;}
        #${uid}[data-gp-motion=on][data-gp-entered=true] [data-gp-content]{pointer-events:auto;}
        #${uid}[data-gp-motion=on] [data-gp-content]:focus-within{opacity:1;pointer-events:auto;}
        #${uid}[data-gp-motion=off] [data-gp-pin]{height:auto;min-height:0;}
        #${uid}[data-gp-motion=off] [data-gp-content]{min-height:0;opacity:1;background:var(--gp-field);pointer-events:auto;}
        #${uid}:has([data-gp-content]:focus-within) [data-gp-caption],#${uid}:has([data-gp-content]:focus-within) [data-gp-marks]{opacity:0;}
        @media(prefers-reduced-motion:reduce){#${uid} [data-gp-pin]{position:relative!important;}#${uid} [data-gp-content]{margin-top:0!important;opacity:1!important;background:var(--gp-field)!important;min-height:0;padding-block:64px;}#${uid} [data-gp-caption]{opacity:1!important;}}
      `}</style>
      <div data-gp-viewport aria-hidden="true" />
      <div data-gp-pin>
        <div data-gp-field aria-hidden="true" inert>{background}</div>
        <svg data-gp-art aria-hidden="true" focusable="false"><defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><text data-gp-glyph x="0" y="0" style={{ fontFamily, fontWeight: weight, fontSize: 100, fontKerning: "none", fontVariantLigatures: "none" }}>{text}</text></clipPath></defs><g data-gp-marks style={{ visibility: annotations ? "visible" : "hidden" }}><path /></g></svg>
        <div data-gp-choices role="radiogroup" aria-label={chooseLetterLabel} inert>{characters.map(({ char, index }, characterIndex) => <button type="button" role="radio" aria-checked="false" tabIndex={-1} data-gp-letter={index} key={index} aria-label={`${char}, ${characterIndex + 1} de ${characters.length}`} />)}</div>
        <label data-gp-touch-picker><span className="sr-only">{chooseLetterLabel}</span><select data-gp-select defaultValue=""><option value="" disabled>{chooseLetterLabel}</option>{characters.map(({ char, index }, characterIndex) => <option key={index} value={index}>{characterIndex + 1} · {char}</option>)}</select></label>
        {front && <div data-gp-front>{front}</div>}
        <span data-gp-fallback aria-hidden="true" style={{ fontFamily, fontWeight: weight }}>{text}</span>
        <div data-gp-caption><span data-gp-hint aria-hidden="true">{interactive ? enterHint : ""}</span><a data-gp-enter href={`#${uid}-content`}>{enterLabel}<span aria-hidden="true">↘</span></a></div>
      </div>
      <div data-gp-content id={`${uid}-content`} tabIndex={-1}>{children}</div>
    </section>
  );
}
