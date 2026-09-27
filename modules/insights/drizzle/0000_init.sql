CREATE SCHEMA "insights";
--> statement-breakpoint
CREATE TABLE "insights"."alerts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "insights"."alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insights"."daily_cashflow_agg" (
	"tenant_id" uuid NOT NULL,
	"day" text NOT NULL,
	"money_in" bigint DEFAULT 0 NOT NULL,
	"money_out" bigint DEFAULT 0 NOT NULL,
	"sales" bigint DEFAULT 0 NOT NULL,
	"discounts" bigint DEFAULT 0 NOT NULL,
	"cogs" bigint DEFAULT 0 NOT NULL,
	"commission" bigint DEFAULT 0 NOT NULL,
	"expenses" bigint DEFAULT 0 NOT NULL,
	"other_income" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_cashflow_agg_tenant_id_day_pk" PRIMARY KEY("tenant_id","day")
);
--> statement-breakpoint
ALTER TABLE "insights"."daily_cashflow_agg" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insights"."daily_channel_agg" (
	"tenant_id" uuid NOT NULL,
	"day" text NOT NULL,
	"channel" text NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"net" bigint DEFAULT 0 NOT NULL,
	"cost" bigint DEFAULT 0 NOT NULL,
	"commission" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_channel_agg_tenant_id_day_channel_pk" PRIMARY KEY("tenant_id","day","channel")
);
--> statement-breakpoint
ALTER TABLE "insights"."daily_channel_agg" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insights"."daily_expense_agg" (
	"tenant_id" uuid NOT NULL,
	"day" text NOT NULL,
	"category" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_expense_agg_tenant_id_day_category_pk" PRIMARY KEY("tenant_id","day","category")
);
--> statement-breakpoint
ALTER TABLE "insights"."daily_expense_agg" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insights"."daily_product_agg" (
	"tenant_id" uuid NOT NULL,
	"day" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"net" bigint DEFAULT 0 NOT NULL,
	"cost" bigint DEFAULT 0 NOT NULL,
	"commission" bigint DEFAULT 0 NOT NULL,
	"qty_without_cost" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_product_agg_tenant_id_day_variant_id_pk" PRIMARY KEY("tenant_id","day","variant_id")
);
--> statement-breakpoint
ALTER TABLE "insights"."daily_product_agg" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insights"."daily_sales_agg" (
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"day" text NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	"gross" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"net" bigint DEFAULT 0 NOT NULL,
	"cost" bigint DEFAULT 0 NOT NULL,
	"commission" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_sales_agg_tenant_id_outlet_id_day_pk" PRIMARY KEY("tenant_id","outlet_id","day")
);
--> statement-breakpoint
ALTER TABLE "insights"."daily_sales_agg" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insights"."reconciliation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"day" text NOT NULL,
	"ok" boolean NOT NULL,
	"details" jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insights"."reconciliation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insights"."wallet_balances" (
	"tenant_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "wallet_balances_tenant_id_wallet_id_pk" PRIMARY KEY("tenant_id","wallet_id")
);
--> statement-breakpoint
ALTER TABLE "insights"."wallet_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_tenant_dedupe_idx" ON "insights"."alerts" USING btree ("tenant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "alerts_tenant_open_idx" ON "insights"."alerts" USING btree ("tenant_id","created_at") WHERE "insights"."alerts"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "reconciliation_runs_tenant_day_idx" ON "insights"."reconciliation_runs" USING btree ("tenant_id","day");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."alerts" AS PERMISSIVE FOR ALL TO public USING ("insights"."alerts"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."alerts"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."daily_cashflow_agg" AS PERMISSIVE FOR ALL TO public USING ("insights"."daily_cashflow_agg"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."daily_cashflow_agg"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."daily_channel_agg" AS PERMISSIVE FOR ALL TO public USING ("insights"."daily_channel_agg"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."daily_channel_agg"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."daily_expense_agg" AS PERMISSIVE FOR ALL TO public USING ("insights"."daily_expense_agg"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."daily_expense_agg"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."daily_product_agg" AS PERMISSIVE FOR ALL TO public USING ("insights"."daily_product_agg"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."daily_product_agg"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."daily_sales_agg" AS PERMISSIVE FOR ALL TO public USING ("insights"."daily_sales_agg"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."daily_sales_agg"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."reconciliation_runs" AS PERMISSIVE FOR ALL TO public USING ("insights"."reconciliation_runs"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."reconciliation_runs"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "insights"."wallet_balances" AS PERMISSIVE FOR ALL TO public USING ("insights"."wallet_balances"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("insights"."wallet_balances"."tenant_id" = current_setting('app.tenant_id')::uuid);