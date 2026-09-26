CREATE SCHEMA "inventory";
--> statement-breakpoint
CREATE TYPE "inventory"."stock_movement_reason" AS ENUM('opening', 'sale', 'void', 'adjustment', 'purchase', 'return', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TABLE "inventory"."forecasts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"daily_rate_milli" integer NOT NULL,
	"days_left" integer,
	"reorder_qty" integer DEFAULT 0 NOT NULL,
	"low_alerted_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory"."forecasts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inventory"."stock_levels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"avg_cost" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory"."stock_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inventory"."stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "inventory"."stock_movement_reason" NOT NULL,
	"unit_cost" bigint,
	"balance_after" integer NOT NULL,
	"avg_cost_after" bigint,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory"."stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "forecasts_tenant_outlet_variant_idx" ON "inventory"."forecasts" USING btree ("tenant_id","outlet_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_levels_tenant_outlet_variant_idx" ON "inventory"."stock_levels" USING btree ("tenant_id","outlet_id","variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_variant_idx" ON "inventory"."stock_movements" USING btree ("tenant_id","variant_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_outlet_created_idx" ON "inventory"."stock_movements" USING btree ("tenant_id","outlet_id","created_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory"."forecasts" AS PERMISSIVE FOR ALL TO public USING ("inventory"."forecasts"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("inventory"."forecasts"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory"."stock_levels" AS PERMISSIVE FOR ALL TO public USING ("inventory"."stock_levels"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("inventory"."stock_levels"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inventory"."stock_movements" AS PERMISSIVE FOR ALL TO public USING ("inventory"."stock_movements"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("inventory"."stock_movements"."tenant_id" = current_setting('app.tenant_id')::uuid);