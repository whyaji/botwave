CREATE TYPE "public"."instance_status" AS ENUM('disconnected', 'connecting', 'connected', 'qr_required');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('Pending', 'Processing', 'Completed', 'Failed', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_log_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_log_type" AS ENUM('text', 'file');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'admin', 'user');--> statement-breakpoint
CREATE TABLE "apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"instance_id" integer NOT NULL,
	"api_key_hash" text NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "apps_app_id_unique" UNIQUE("app_id")
);
--> statement-breakpoint
CREATE TABLE "instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "instance_status" DEFAULT 'disconnected' NOT NULL,
	"auth_state_path" varchar(512),
	"last_connected_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" jsonb,
	"status" "job_status" DEFAULT 'Pending' NOT NULL,
	"result" jsonb,
	"created_by" integer,
	"created_by_name" varchar(100),
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"instance_id" integer NOT NULL,
	"target_jid" varchar(128) NOT NULL,
	"type" "message_log_type" NOT NULL,
	"status" "message_log_status" DEFAULT 'queued' NOT NULL,
	"job_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "idx_apps_app_id" ON "apps" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "idx_apps_instance_id" ON "apps" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_instances_status" ON "instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_instances_createdBy" ON "instances" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_type" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_jobs_createdBy" ON "jobs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_message_logs_app_id" ON "message_logs" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "idx_message_logs_created_at" ON "message_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");