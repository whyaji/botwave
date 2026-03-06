import { Queue } from 'bullmq';

import { bullConnection } from '@/src/config/bull-redis';

export type WaSendFileType = 'image' | 'video' | 'audio' | 'document';

export type WaSendJobPayload = {
  dbJobId: number;
  instanceId: number;
  appId: number;
  to: string[];
  text?: string;
  fileUrl?: string;
  caption?: string;
  fileName?: string;
  fileType?: WaSendFileType;
};

export const WA_SEND_QUEUE_NAME = 'wa-send';

export const waSendQueue = new Queue<WaSendJobPayload>(WA_SEND_QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
  },
});
