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
});

export const env = environmentSchema.parse(process.env);
