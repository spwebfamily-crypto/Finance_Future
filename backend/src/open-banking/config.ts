import { createHash } from "node:crypto";
import { z } from "zod";
import { env } from "../config.js";
import type { ProviderName } from "./contracts.js";

export const OPEN_BANKING_COUNTRIES = [
  "PT",
  "ES",
  "FR",
  "DE",
  "IT",
  "NL",
  "BE",
  "IE",
  "FI",
  "AT",
] as const;

export const OPEN_BANKING_PSU_TYPES = ["personal", "business"] as const;

/** Caminhos internos permitidos para o redirecionamento pós-callback. */
export const OPEN_BANKING_RETURN_PATHS = [
  "/accounts",
  "/accounts/connections",
  "/privacy",
] as const;

export const OPEN_BANKING_RETURN_PATH_DEFAULT = "/accounts";

const CALLBACK_PATH = "/api/open-banking/callback";

const rawSchema = z.object({
  OPEN_BANKING_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OPEN_BANKING_PROVIDER: z.enum(["enable_banking", "fake"]).default("fake"),
  OPEN_BANKING_DEFAULT_COUNTRY: z
    .string()
    .trim()
    .length(2)
    .toUpperCase()
    .default("PT")
    .refine(
      (value): value is (typeof OPEN_BANKING_COUNTRIES)[number] =>
        (OPEN_BANKING_COUNTRIES as readonly string[]).includes(value),
      "País fora da allowlist de Open Banking.",
    ),
  OPEN_BANKING_CALLBACK_URL: z.string().trim().default(""),
  OPEN_BANKING_DATA_KEY_B64: z.string().trim().default(""),
  OPEN_BANKING_CRON_SECRET: z.string().default(""),
  OPEN_BANKING_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(15).max(10_080).default(360),
  ENABLE_BANKING_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  ENABLE_BANKING_APP_ID: z.string().trim().default(""),
  ENABLE_BANKING_PRIVATE_KEY_B64: z.string().trim().default(""),
});

export interface EnableBankingSettings {
  environment: "sandbox" | "production";
  appId: string;
  /** PEM da chave privada RSA, descodificada apenas no backend. */
  privateKey: string;
}

export interface OpenBankingConfig {
  enabled: boolean;
  provider: ProviderName;
  defaultCountry: (typeof OPEN_BANKING_COUNTRIES)[number];
  /** URL canónica de callback registada no provedor. */
  callbackUrl: string;
  /** Chave de 32 bytes para cifrar dados sensíveis em repouso (AES-256-GCM). */
  dataKey: Buffer;
  cronSecret: string;
  syncIntervalMinutes: number;
  /** Origem exata do frontend (Netlify), sem barra final. */
  redirectOrigin: string;
  enableBanking: EnableBankingSettings | null;
}

let cached: OpenBankingConfig | null = null;

class OpenBankingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenBankingConfigError";
  }
}

function invalid(message: string): never {
  throw new OpenBankingConfigError(`Open Banking: ${message}`);
}

function decodeDataKey(raw: string): Buffer {
  // A chave tem de representar exatamente 32 bytes (AES-256) e de ser base64
  // canónico, para não aceitar silenciosamente um valor truncado ou inválido.
  const withoutPadding = (value: string) => value.replace(/=+$/, "");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32 || withoutPadding(decoded.toString("base64")) !== withoutPadding(raw)) {
    invalid("OPEN_BANKING_DATA_KEY_B64 tem de ser base64 canónico de exatamente 32 bytes.");
  }
  return decoded;
}

/**
 * Em testes não se usam segredos reais: a chave é derivada de forma determinística
 * a partir do segredo de JWT do ambiente de teste e nunca sai do processo.
 */
function ephemeralTestKey(): Buffer {
  return createHash("sha256").update(`open-banking-test|${env.JWT_ACCESS_SECRET}`).digest();
}

function normalizeOrigin(raw: string, variable: string, requireHttps: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid(`${variable} tem de ser um URL absoluto.`);
  }
  if (requireHttps && url.protocol !== "https:") {
    return invalid(`${variable} tem de usar HTTPS em produção.`);
  }
  if (!requireHttps && url.protocol !== "https:" && url.protocol !== "http:") {
    return invalid(`${variable} tem de usar HTTP ou HTTPS.`);
  }
  if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    return invalid(`${variable} tem de ser apenas a origem, sem caminho, query ou fragmento.`);
  }
  return url.origin;
}

function normalizeCallbackUrl(raw: string, requireHttps: boolean): string {
  if (!raw)
    return invalid("OPEN_BANKING_CALLBACK_URL é obrigatório quando Open Banking está ativo.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid("OPEN_BANKING_CALLBACK_URL tem de ser um URL absoluto.");
  }
  if (requireHttps && url.protocol !== "https:") {
    return invalid("OPEN_BANKING_CALLBACK_URL tem de usar HTTPS em produção.");
  }
  if (url.search || url.hash) {
    return invalid("OPEN_BANKING_CALLBACK_URL não pode ter query nem fragmento.");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== CALLBACK_PATH) {
    return invalid(`OPEN_BANKING_CALLBACK_URL tem de terminar em ${CALLBACK_PATH}.`);
  }
  return `${url.origin}${CALLBACK_PATH}`;
}

function load(): OpenBankingConfig {
  const parsed = rawSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    return invalid(`configuração inválida em ${fields}.`);
  }

  const raw = parsed.data;
  const isProduction = env.NODE_ENV === "production";

  if (!raw.OPEN_BANKING_ENABLED) {
    return {
      enabled: false,
      provider: raw.OPEN_BANKING_PROVIDER,
      defaultCountry: raw.OPEN_BANKING_DEFAULT_COUNTRY,
      callbackUrl: "",
      dataKey: Buffer.alloc(0),
      cronSecret: "",
      syncIntervalMinutes: raw.OPEN_BANKING_SYNC_INTERVAL_MINUTES,
      redirectOrigin: "",
      enableBanking: null,
    };
  }

  const redirectOrigin = normalizeOrigin(env.FRONTEND_ORIGIN, "FRONTEND_ORIGIN", isProduction);
  const callbackUrl = normalizeCallbackUrl(raw.OPEN_BANKING_CALLBACK_URL, isProduction);

  let dataKey: Buffer;
  if (raw.OPEN_BANKING_DATA_KEY_B64) {
    dataKey = decodeDataKey(raw.OPEN_BANKING_DATA_KEY_B64);
  } else if (env.NODE_ENV === "test") {
    dataKey = ephemeralTestKey();
  } else {
    return invalid(
      "OPEN_BANKING_DATA_KEY_B64 é obrigatório quando Open Banking está ativo e tem de ter exatamente 32 bytes em base64.",
    );
  }

  if (!raw.OPEN_BANKING_CRON_SECRET) {
    return invalid("OPEN_BANKING_CRON_SECRET é obrigatório quando Open Banking está ativo.");
  }
  if (raw.OPEN_BANKING_CRON_SECRET.length < 32) {
    return invalid("OPEN_BANKING_CRON_SECRET tem de ter pelo menos 32 caracteres.");
  }

  if (raw.ENABLE_BANKING_ENV === "production" && !isProduction) {
    return invalid("ENABLE_BANKING_ENV=production só é permitido com NODE_ENV=production.");
  }

  let enableBanking: EnableBankingSettings | null = null;
  if (raw.OPEN_BANKING_PROVIDER === "enable_banking") {
    if (!raw.ENABLE_BANKING_APP_ID) {
      return invalid("ENABLE_BANKING_APP_ID é obrigatório quando o provedor é enable_banking.");
    }
    let privateKey = "";
    if (raw.ENABLE_BANKING_PRIVATE_KEY_B64) {
      privateKey = Buffer.from(raw.ENABLE_BANKING_PRIVATE_KEY_B64, "base64").toString("utf8");
      if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey)) {
        return invalid(
          "ENABLE_BANKING_PRIVATE_KEY_B64 tem de conter uma chave privada PEM em base64.",
        );
      }
    } else if (isProduction) {
      return invalid(
        "ENABLE_BANKING_PRIVATE_KEY_B64 é obrigatório em produção quando o provedor é enable_banking.",
      );
    }
    enableBanking = {
      environment: raw.ENABLE_BANKING_ENV,
      appId: raw.ENABLE_BANKING_APP_ID,
      privateKey,
    };
  }

  return {
    enabled: true,
    provider: raw.OPEN_BANKING_PROVIDER,
    defaultCountry: raw.OPEN_BANKING_DEFAULT_COUNTRY,
    callbackUrl,
    dataKey,
    cronSecret: raw.OPEN_BANKING_CRON_SECRET,
    syncIntervalMinutes: raw.OPEN_BANKING_SYNC_INTERVAL_MINUTES,
    redirectOrigin,
    enableBanking,
  };
}

export function getOpenBankingConfig(): OpenBankingConfig {
  cached ??= load();
  return cached;
}

/** Usado nos testes para reler variáveis de ambiente entre casos. */
export function resetOpenBankingConfigCache() {
  cached = null;
}

export function isOpenBankingEnabled() {
  return getOpenBankingConfig().enabled;
}

/**
 * Constrói o redirecionamento final do callback. O caminho vem de uma allowlist
 * interna e a origem é sempre a configurada em FRONTEND_ORIGIN, pelo que o
 * callback nunca pode ser usado como open redirect.
 */
export function buildFrontendRedirectUrl(returnPath: string): string {
  const config = getOpenBankingConfig();
  const path = (OPEN_BANKING_RETURN_PATHS as readonly string[]).includes(returnPath)
    ? returnPath
    : OPEN_BANKING_RETURN_PATH_DEFAULT;
  return `${config.redirectOrigin}${path}`;
}
