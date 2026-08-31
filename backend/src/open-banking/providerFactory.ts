import { ApiError } from "../middleware.js";
import { getOpenBankingConfig } from "./config.js";
import type { OpenBankingProvider, ProviderName } from "./contracts.js";
import { EnableBankingProvider } from "./enableBankingProvider.js";
import { FakeOpenBankingProvider } from "./fakeOpenBankingProvider.js";

/**
 * Registo dos adaptadores disponíveis. Um novo provedor (ex.: Salt Edge) entra
 * aqui e em `contracts.ts`, sem alterar rotas, Prisma ou frontend.
 */
const registry = new Map<ProviderName, () => OpenBankingProvider>();

export function registerOpenBankingProvider(
  name: ProviderName,
  factory: () => OpenBankingProvider,
) {
  registry.set(name, factory);
}

registerOpenBankingProvider("fake", () => new FakeOpenBankingProvider());
registerOpenBankingProvider("enable_banking", () => {
  const { enableBanking } = getOpenBankingConfig();
  if (!enableBanking?.privateKey) {
    throw new ApiError(
      503,
      "BANK_PROVIDER_UNAVAILABLE",
      "A ligação bancária não está configurada corretamente.",
    );
  }
  return new EnableBankingProvider({
    appId: enableBanking.appId,
    privateKey: enableBanking.privateKey,
  });
});

export function createOpenBankingProvider(): OpenBankingProvider {
  const { provider } = getOpenBankingConfig();
  const factory = registry.get(provider);
  if (!factory) {
    throw new ApiError(
      503,
      "BANK_PROVIDER_UNAVAILABLE",
      "A ligação bancária não está disponível de momento.",
    );
  }
  return factory();
}
