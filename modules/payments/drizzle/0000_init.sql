CREATE SCHEMA "payments";
--> statement-breakpoint
CREATE TYPE "payments"."incoming_method" AS ENUM('cash', 'transfer', 'qris', 'ewallet');--> statement-breakpoint
CREATE TYPE "payments"."intent_status" AS ENUM('pending', 'paid', 'expired');--> statement-breakpoint
CREATE TABLE "payments"."incoming_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"intent_id" uuid,
	"order_id" uuid,
	"amount" bigint NOT NULL,
	"method" "payments"."incoming_method" NOT NULL,
	"source" text NOT NULL,
	"reference" text,
	"provider_event_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments"."incoming_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments"."payment_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid,
	"amount" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"qr_string" text NOT NULL,
	"status" "payments"."intent_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments"."payment_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments"."provider_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments"."provider_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "incoming_payments_tenant_received_idx" ON "payments"."incoming_payments" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "incoming_payments_intent_idx" ON "payments"."incoming_payments" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "payment_intents_tenant_order_idx" ON "payments"."payment_intents" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payments"."payment_intents" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_events_provider_event_idx" ON "payments"."provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payments"."incoming_payments" AS PERMISSIVE FOR ALL TO public USING ("payments"."incoming_payments"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("payments"."incoming_payments"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payments"."payment_intents" AS PERMISSIVE FOR ALL TO public USING ("payments"."payment_intents"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("payments"."payment_intents"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payments"."provider_events" AS PERMISSIVE FOR ALL TO public USING ("payments"."provider_events"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("payments"."provider_events"."tenant_id" = current_setting('app.tenant_id')::uuid);