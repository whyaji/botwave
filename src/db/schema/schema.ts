import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['superadmin', 'admin', 'user']);

export const instanceStatusEnum = pgEnum('instance_status', [
  'disconnected',
  'connecting',
  'connected',
  'qr_required',
]);

export const messageLogTypeEnum = pgEnum('message_log_type', ['text', 'file']);
export const messageLogStatusEnum = pgEnum('message_log_status', ['queued', 'sent', 'failed']);

export const jobStatusEnum = pgEnum('job_status', [
  'Pending',
  'Processing',
  'Completed',
  'Failed',
  'Cancelled',
]);

/**
 * Users table – panel login and user management
 */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: userRoleEnum('role').notNull().default('user'),
    isActive: integer('is_active').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('idx_users_email').on(table.email)]
);

/**
 * Instances table – WA device/session per Baileys connection
 */
export const instances = pgTable(
  'instances',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: instanceStatusEnum('status').notNull().default('disconnected'),
    authStatePath: varchar('auth_state_path', { length: 512 }),
    lastConnectedAt: timestamp('last_connected_at'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_instances_status').on(table.status),
    index('idx_instances_createdBy').on(table.createdBy),
  ]
);

/**
 * Apps table – external clients with API key (x-api-key)
 */
export const apps = pgTable(
  'apps',
  {
    id: serial('id').primaryKey(),
    appId: varchar('app_id', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    instanceId: integer('instance_id').notNull(),
    apiKeyHash: text('api_key_hash').notNull(),
    isActive: integer('is_active').notNull().default(1),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_apps_app_id').on(table.appId),
    index('idx_apps_instance_id').on(table.instanceId),
  ]
);

/**
 * Message logs – audit trail for sent messages
 */
export const messageLogs = pgTable(
  'message_logs',
  {
    id: serial('id').primaryKey(),
    appId: integer('app_id').notNull(),
    instanceId: integer('instance_id').notNull(),
    targetJid: varchar('target_jid', { length: 128 }).notNull(),
    type: messageLogTypeEnum('type').notNull(),
    status: messageLogStatusEnum('status').notNull().default('queued'),
    jobId: integer('job_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_message_logs_app_id').on(table.appId),
    index('idx_message_logs_created_at').on(table.createdAt),
  ]
);

/**
 * Jobs table (queue)
 * Stores background jobs; type e.g. send_wa_message, payload has instanceId, to[], text?, fileUrl?, etc.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: serial('id').primaryKey(),
    type: varchar('type', { length: 64 }).notNull(),
    payload: jsonb('payload'),
    status: jobStatusEnum('status').notNull().default('Pending'),
    result: jsonb('result'),
    createdBy: integer('created_by'),
    createdByName: varchar('created_by_name', { length: 100 }),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('idx_jobs_status').on(table.status),
    index('idx_jobs_type').on(table.type),
    index('idx_jobs_createdBy').on(table.createdBy),
  ]
);
