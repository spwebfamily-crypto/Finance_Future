import "dotenv/config";
import { z } from "zod";

const frontendOriginsSchema = z
  .string()
  .default("http://localhost:5173")
  .transform((raw) =>
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  .pipe(
    z
      .array(
        z
          .string()
          .url()
          .transform((value) => new URL(value).origin),
      )
      .min(1, "FRONTEND_ORIGIN tem de incluir pelo menos uma origem."),
  );

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    FRONTEND_ORIGIN: frontendOriginsSchema,
    UPLOAD_DIR: z.string().min(1).default("uploads"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).optional(),
    RECEIPT_QUOTA_MB_PER_USER: z.coerce.number().int().min(10).max(10_000).default(100),
    RECEIPT_TOTAL_QUOTA_MB: z.coerce.number().int().min(50).max(100_000).default(500),
    // Limitador global por IP para toda a API; os limiters específicos de auth e
    // mutações de despesas continuam a aplicar-se por cima deste.
    RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10_000).default(300),
    RENDER: z.enum(["true", "false"]).optional(),
    // Brevo (emails transacionais). Sem chave, os emails são apenas registados
    // no log — útil em desenvolvimento e testes, nunca envia nada para fora.
    BREVO_API_KEY: z.preprocess(
      (value) => (value === "" || value === undefined ? undefined : value),
      z.string().min(1).optional(),
    ),
    EMAIL_FROM_ADDRESS: z.string().email().default("noreply@expensesnap.app"),
    EMAIL_FROM_NAME: z.string().min(1).default("ExpenseSnap"),
  })
  .superRefine((data, context) => {
    if (data.NODE_ENV !== "production") return;
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
      if (data[key].startsWith("change-me")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} não pode começar por "change-me" em produção.`,
        });
      }
    }
  });

const parsedEnv = environmentSchema.parse(process.env);
const { FRONTEND_ORIGIN: frontendOrigins, ...parsedRest } = parsedEnv;

export const env = {
  ...parsedRest,
  // Primeiro valor: origem canónica (emails, redirects). A lista completa
  // alimenta o CORS (apex, www, previews).
  FRONTEND_ORIGIN: frontendOrigins[0]!,
  FRONTEND_ORIGINS: frontendOrigins,
  // Render encaminha o tráfego pelo edge e pelo load balancer. O valor pode
  // ser substituído sem alterar código se a topologia do deploy mudar.
  TRUST_PROXY_HOPS: parsedRest.TRUST_PROXY_HOPS ?? (parsedRest.RENDER === "true" ? 2 : 0),
};
