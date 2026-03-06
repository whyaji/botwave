import fs from 'fs';
import path from 'path';
import pino from 'pino';

import env from '@/src/config/env';

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'storage/logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const today = new Date().toISOString().split('T')[0];
const logFile = `./storage/logs/app-${today}.log`;
const logLevel = env.LOG_LEVEL || 'info';

const targets: pino.TransportTargetOptions[] = [
  {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
    level: logLevel,
  },
  {
    target: 'pino-pretty',
    options: {
      destination: logFile,
      translateTime: 'SYS:standard',
      colorize: false,
    },
    level: logLevel,
  },
];

if (env.NODE_ENV === 'development') {
  targets.push({
    target: 'pino-pretty',
    options: {
      destination: 1,
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'hostname',
    },
    level: logLevel,
  });
}

const transport = pino.transport({ targets });

const logger = pino.pino({ level: logLevel }, transport);

export { logger };
