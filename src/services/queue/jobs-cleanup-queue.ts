import { Queue } from 'bullmq';

import { bullConnection } from '@/src/config/bull-redis';

export const JOBS_CLEANUP_QUEUE_NAME = 'jobs-cleanup';

/** Cron: 1st of every month at 2:00 AM (minute hour day-of-month month day-of-week). */
const CRON_PATTERN = '0 2 1 * *';

export const jobsCleanupQueue = new Queue(JOBS_CLEANUP_QUEUE_NAME, {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
  },
});

const JOBS_CLEANUP_SCHEDULER_ID = 'jobs-cleanup-monthly';

/**
 * Schedules the monthly jobs cleanup repeatable job.
 * Call once on server startup. Idempotent: skips if this scheduler already exists.
 */
export async function scheduleJobsCleanup(): Promise<void> {
  const existing = await jobsCleanupQueue.getJobScheduler(JOBS_CLEANUP_SCHEDULER_ID);
  if (existing) return;
  await jobsCleanupQueue.upsertJobScheduler(
    JOBS_CLEANUP_SCHEDULER_ID,
    { pattern: CRON_PATTERN },
    { name: 'cleanup-old-jobs', data: {}, opts: {} }
  );
}
