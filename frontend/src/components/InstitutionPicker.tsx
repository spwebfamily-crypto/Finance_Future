import { Building2 } from "lucide-react";
import type { BankInstitution } from "../types";

/** Escolha do banco: pesquisa local sobre a lista devolvida pelo backend. */
export function InstitutionPicker({
  institutions,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  disabled = false,
}: {
  institutions: BankInstitution[];
  query: string;
  onQueryChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (institution: BankInstitution) => void;
  disabled?: boolean;
}) {
  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? institutions.filter((institution) => institution.name.toLowerCase().includes(normalized))
    : institutions;

  return (
    <div className="institution-picker">
      <label className="field">
        <span>Pesquisar banco</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Ex.: Banco"
          disabled={disabled}
        />
      </label>

      <ul className="institution-list" aria-label="Bancos disponíveis">
        {visible.map((institution) => {
          const isSelected = institution.id === selectedId;
          return (
            <li key={institution.id}>
              <button
                type="button"
                className={`institution-item${isSelected ? " institution-item--selected" : ""}`}
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onSelect(institution)}
              >
                <span className="institution-item__logo" aria-hidden="true">
                  {institution.logoUrl ? (
                    <img src={institution.logoUrl} alt="" loading="lazy" />
                  ) : (
                    <Building2 aria-hidden="true" />
                  )}
                </span>
                <span className="institution-item__name">{institution.name}</span>
                <span className="institution-item__meta">{institution.country}</span>
              </button>
            </li>
          );
        })}
        {!visible.length && <li className="institution-empty">Nenhum banco encontrado.</li>}
      </ul>
    </div>
  );
}
