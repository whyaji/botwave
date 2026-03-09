ALTER TABLE "apps" ADD COLUMN "command_allowed_groups" jsonb;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "command_allowed_users" jsonb;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "command_web_hook" varchar(255);--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "command_list" jsonb;