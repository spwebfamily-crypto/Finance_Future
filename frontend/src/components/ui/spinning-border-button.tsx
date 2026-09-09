import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

interface SpinningBorderButtonProps {
  children?: ReactNode;
  href: string;
  className?: string;
  ariaLabel?: string;
}

export default function SpinningBorderButton({
  children = "Começar",
  href,
  className = "",
  ariaLabel,
}: SpinningBorderButtonProps) {
  return (
    <a
      className={`spinning-border-button ${className}`.trim()}
      href={href}
      aria-label={ariaLabel}
      rel="noreferrer"
    >
      <span className="spinning-border-button__label">
        {children}
        <ArrowRight aria-hidden="true" />
      </span>
    </a>
  );
}
