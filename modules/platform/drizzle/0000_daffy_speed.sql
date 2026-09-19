CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'published');--> statement-breakpoint
CREATE TABLE "platform"."audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."auto_approve_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"condition" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform"."pings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."processed_events" (
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);
--> statement-breakpoint
CREATE INDEX "audit_log_tenant_id_idx" ON "platform"."audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "auto_approve_rules_tenant_id_idx" ON "platform"."auto_approve_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_tenant_id_idx" ON "platform"."idempotency_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outbox_tenant_id_idx" ON "platform"."outbox" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "platform"."outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pings_tenant_id_idx" ON "platform"."pings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "processed_events_tenant_id_idx" ON "platform"."processed_events" USING btree ("tenant_id");