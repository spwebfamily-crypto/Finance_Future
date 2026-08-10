import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).optional(),
  RECEIPT_QUOTA_MB_PER_USER: z.coerce.number().int().min(10).max(10_000).default(100),
  RECEIPT_TOTAL_QUOTA_MB: z.coerce.number().int().min(50).max(100_000).default(500),
  RENDER: z.enum(['true', 'false']).optional(),
});

const parsedEnv = environmentSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  // Render encaminha o tráfego pelo edge e pelo load balancer. O valor pode
  // ser substituído sem alterar código se a topologia do deploy mudar.
  TRUST_PROXY_HOPS: parsedEnv.TRUST_PROXY_HOPS ?? (parsedEnv.RENDER === 'true' ? 2 : 0),
};
