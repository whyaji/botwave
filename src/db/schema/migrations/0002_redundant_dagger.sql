CREATE TYPE "public"."instance_mode" AS ENUM('baileys', 'webjs');--> statement-breakpoint
ALTER TABLE "instances" ADD COLUMN "mode" "instance_mode" DEFAULT 'baileys' NOT NULL;