import env from './env';

export const bullConnection = {
  host: env.REDIS_HOST,
  port: Number(env.REDIS_PORT),
  ...(env.REDIS_PASSWORD && env.REDIS_PASSWORD.length > 0 && { password: env.REDIS_PASSWORD }),
  maxRetriesPerRequest: null,
} as const;
