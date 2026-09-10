import React from "react";
import { cn } from "../../lib/utils";

interface DoubleChevronProps {
  index: number;
  dotColor: string;
}

function DoubleChevron({ index, dotColor }: DoubleChevronProps) {
  const base = index * 0.12;
  const dots = [
    { cx: 2, cy: 2, d: 0 },
    { cx: 5, cy: 5, d: 0.05 },
    { cx: 8, cy: 8, d: 0.1 },
    { cx: 5, cy: 11, d: 0.15 },
    { cx: 2, cy: 14, d: 0.2 },
    { cx: 6, cy: 2, d: 0.05 },
    { cx: 9, cy: 5, d: 0.1 },
    { cx: 12, cy: 8, d: 0.15 },
    { cx: 9, cy: 11, d: 0.2 },
    { cx: 6, cy: 14, d: 0.25 },
  ];

  return (
    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" focusable="false" className="anti-metal-button__chevron">
      <g fill={dotColor}>
        {dots.map((point, index) => (
          <circle key={index} cx={point.cx} cy={point.cy} r="1" className="anti-metal-button__dot" style={{ animationDelay: `${base + point.d}s` }} />
        ))}
      </g>
    </svg>
  );
}

export interface AntiMetalButtonProps {
  children?: React.ReactNode;
  label?: React.ReactNode;
  href?: string;
  className?: string;
  accentFrom?: string;
  accentTo?: string;
  dotColor?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  type?: "button" | "submit" | "reset";
  ariaLabel?: string;
}

export const AntiMetalButton = React.forwardRef<HTMLElement, AntiMetalButtonProps>(
  ({ className, children, label, href, accentFrom = "#caff4a", accentTo = "#a9dc2d", dotColor = "#172018", onClick, type = "button", ariaLabel }, ref) => {
    const content = label ?? children ?? "Começar grátis";
    const classes = cn("anti-metal-button", className);
    const style = { "--anti-accent-from": accentFrom, "--anti-accent-to": accentTo } as React.CSSProperties;
    const shared = { className: classes, style, "aria-label": ariaLabel, onClick };

    const contentMarkup = (
      <>
        <span className="anti-metal-button__label">{content}</span>
        <span aria-hidden="true" className="anti-metal-button__signal">
          {[0, 1, 2, 3, 4].map((index) => <DoubleChevron key={index} index={index} dotColor={dotColor} />)}
        </span>
      </>
    );

    if (href) {
      return <a {...shared} ref={ref as React.Ref<HTMLAnchorElement>} href={href} rel="noreferrer">{contentMarkup}</a>;
    }

    return <button {...shared} ref={ref as React.Ref<HTMLButtonElement>} type={type}>{contentMarkup}</button>;
  },
);

AntiMetalButton.displayName = "AntiMetalButton";

export default AntiMetalButton;
