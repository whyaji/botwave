import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { logger } from '../common/utils/logger';
import env from '../config/env';
import * as schema from './schema/schema';

const log = logger.child({ module: 'db' });

// PostgreSQL connection pool
const postgresPool = new Pool({
  connectionString: env.DB_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

postgresPool.on('error', (err) => {
  log.error({ err }, 'PostgreSQL pool error');
});

log.info('Database connection pools initialized');

// Drizzle instances with schemas for type inference
export const db = drizzle(postgresPool, { schema: schema });

// Export pools for direct access if needed
export { postgresPool };

// Graceful shutdown
export const closeConnections = async () => {
  log.info('Closing database connections...');
  await postgresPool.end();
  log.info('Database connections closed');
};

process.on('SIGINT', async () => {
  log.info('SIGINT received, closing database connections...');
  await closeConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.info('SIGTERM received, closing database connections...');
  await closeConnections();
  process.exit(0);
});
