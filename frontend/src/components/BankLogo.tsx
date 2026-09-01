import { Landmark } from "lucide-react";
import { useState } from "react";

/**
 * Mostra a marca devolvida pelo provedor de Open Banking. O fallback é apenas
 * visual: nunca tenta adivinhar ou atribuir a marca de outro banco.
 */
export function BankLogo({
  logoUrl,
  className = "",
}: {
  logoUrl?: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <span className={`bank-logo${className ? ` ${className}` : ""}`} aria-hidden="true">
      {logoUrl && failedUrl !== logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(logoUrl)}
        />
      ) : (
        <Landmark aria-hidden="true" />
      )}
    </span>
  );
}
