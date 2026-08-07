import { Link } from 'react-router-dom';

interface BrandProps {
  compact?: boolean;
  linked?: boolean;
}

export function Brand({ compact = false, linked = true }: BrandProps) {
  const content = (
    <span className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="ExpenseSnap">
      <span className="brand__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand__word">expense<span>snap</span></span>
    </span>
  );

  return linked ? <Link to="/expenses" className="brand-link">{content}</Link> : content;
}
