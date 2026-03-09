import { RedisClient } from 'bun';

import { logger } from '@/src/common/utils/logger';

import env from './env';

const redisClient = new RedisClient(`redis://${env.REDIS_HOST}:${env.REDIS_PORT}`);

redisClient.onconnect = () => {
  logger.info('Redis client connected');
};

redisClient.onclose = (error) => {
  logger.error(error, 'Redis client closed');
};

export { redisClient };
