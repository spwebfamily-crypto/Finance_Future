import { afterEach, beforeEach, vi } from "vitest";
import { resetOpenBankingConfigCache } from "./config.js";

/**
 * Ativa a feature flag num ambiente de teste controlado: provedor fake,
 * callback local e chaves descartáveis (derivadas do segredo de JWT de teste).
 */
export function useTestOpenBankingConfig(overrides: Record<string, string> = {}) {
  vi.stubEnv("OPEN_BANKING_ENABLED", "true");
  vi.stubEnv("OPEN_BANKING_PROVIDER", "fake");
  vi.stubEnv("OPEN_BANKING_DEFAULT_COUNTRY", "PT");
  vi.stubEnv("OPEN_BANKING_CALLBACK_URL", "http://localhost:3000/api/open-banking/callback");
  vi.stubEnv("OPEN_BANKING_CRON_SECRET", "test-cron-secret-with-at-least-32-characters");
  // Vazio de propósito: em testes a chave é derivada do segredo de JWT.
  vi.stubEnv("OPEN_BANKING_DATA_KEY_B64", "");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
  resetOpenBankingConfigCache();
}

export function restoreOpenBankingConfig() {
  vi.unstubAllEnvs();
  resetOpenBankingConfigCache();
}

/** Aplica a configuração de teste antes de cada teste e repõe o ambiente no fim. */
export function installTestOpenBankingConfig(overrides: Record<string, string> = {}) {
  beforeEach(() => useTestOpenBankingConfig(overrides));
  afterEach(() => restoreOpenBankingConfig());
}
