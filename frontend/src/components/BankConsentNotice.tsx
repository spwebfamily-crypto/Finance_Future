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
        <li>Ler saldo e movimentos{institutionName ? ` do ${institutionName}` : ""}.</li>
        <li>Transformar cada gasto contabilizado numa despesa da aplicação.</li>
        <li>Renovar o consentimento quando o banco o pedir (em regra a cada 90 dias).</li>
      </ul>
      <p className="consent-notice__security">
        O ExpenseSnap <strong>nunca</strong> recebe nem guarda a sua palavra-passe do banco: a
        autorização é feita no ambiente seguro do próprio banco. Pode desligar o banco e apagar os
        dados importados quando quiser.
      </p>
    </aside>
  );
}
