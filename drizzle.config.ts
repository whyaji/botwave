import 'dotenv/config';

import type { Config } from 'drizzle-kit';

import env from './src/config/env';

export default {
  schema: './src/db/schema/schema.ts',
  out: './src/db/schema/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DB_URL,
  },
} satisfies Config;
