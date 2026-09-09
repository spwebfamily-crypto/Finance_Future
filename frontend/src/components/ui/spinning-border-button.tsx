import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface SpinningBorderButtonProps {
  children?: ReactNode;
  to?: string;
  className?: string;
  ariaLabel?: string;
}

export default function SpinningBorderButton({
  children = "Começar",
  to = "/register",
  className = "",
  ariaLabel,
}: SpinningBorderButtonProps) {
  return (
    <Link
      className={`spinning-border-button ${className}`.trim()}
      to={to}
      aria-label={ariaLabel}
    >
      <span className="spinning-border-button__label">
        {children}
        <ArrowRight aria-hidden="true" />
      </span>
    </Link>
  );
}
