import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('8080'),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_URL: z.string().default('http://localhost:8080'),

  DB_URL: z.string(),

  JWT_SECRET: z.string(),
  JWT_EXPS: z.string(),
  JWT_REFRESH_EXPS: z.string(),
  HASH_SALT: z.string().optional().default('10'),

  REDIS_HOST: z.string(),
  REDIS_PORT: z.string(),
  REDIS_PASSWORD: z.string(),

  ACCESS_PRIVATE_KEY: z.string(),

  SUPERADMIN_EMAIL: z.string().optional().default('admin@botwave.local'),
  SUPERADMIN_PASSWORD: z.string().optional().default('SuperAdmin123!'),
});

const env = envSchema.parse(process.env);

export default env;
