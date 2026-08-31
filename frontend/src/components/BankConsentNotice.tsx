import { ShieldCheck } from "lucide-react";

/**
 * Explicação do consentimento. Deixa claro que a palavra-passe do banco nunca
 * passa pela aplicação.
 */
export function BankConsentNotice({ institutionName }: { institutionName?: string }) {
  return (
    <aside className="consent-notice" aria-label="O que vai autorizar">
      <p className="consent-notice__title">
        <ShieldCheck aria-hidden="true" /> O que vai autorizar
      </p>
      <ul>
        <li>
          Ler o saldo contabilístico e o saldo disponível
          {institutionName ? ` do ${institutionName}` : ""}.
        </li>
        <li>Ler os movimentos das contas que escolher, incluindo os pendentes.</li>
        <li>Renovar o consentimento quando o banco o exigir (por regra a cada 90 dias).</li>
      </ul>
      <p className="consent-notice__security">
        O Finance Future <strong>nunca</strong> recebe nem guarda a sua palavra-passe do banco: a
        autorização é feita no ambiente seguro do próprio banco. Pode desligar o banco e apagar os
        dados importados quando quiser.
      </p>
    </aside>
  );
}
