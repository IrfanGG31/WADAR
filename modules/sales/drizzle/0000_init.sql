CREATE SCHEMA "sales";
--> statement-breakpoint
CREATE TYPE "sales"."payment_method" AS ENUM('cash', 'transfer', 'qris', 'ewallet');--> statement-breakpoint
CREATE TYPE "sales"."sales_channel" AS ENUM('pos', 'whatsapp', 'shopee', 'tiktok', 'tokopedia', 'other');--> statement-breakpoint
CREATE TABLE "sales"."channel_settings" (
	"tenant_id" uuid NOT NULL,
	"channel" "sales"."sales_channel" NOT NULL,
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_settings_tenant_id_channel_pk" PRIMARY KEY("tenant_id","channel")
);
--> statement-breakpoint
ALTER TABLE "sales"."channel_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales"."order_counters" (
	"tenant_id" uuid NOT NULL,
	"day_key" text NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "order_counters_tenant_id_day_key_pk" PRIMARY KEY("tenant_id","day_key")
);
--> statement-breakpoint
ALTER TABLE "sales"."order_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales"."order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"line_discount" bigint NOT NULL,
	"discount" bigint NOT NULL,
	"net_amount" bigint NOT NULL,
	"unit_cost" bigint NOT NULL,
	"commission" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales"."order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales"."order_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "sales"."payment_method" NOT NULL,
	"amount" bigint NOT NULL,
	"tendered" bigint,
	"wallet_id" uuid,
	"external_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales"."order_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales"."order_voids" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"voided_by" text NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales"."order_voids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"channel" "sales"."sales_channel" NOT NULL,
	"idempotency_key" text NOT NULL,
	"customer_id" uuid,
	"note" text,
	"gross" bigint NOT NULL,
	"discount" bigint NOT NULL,
	"net" bigint NOT NULL,
	"cost" bigint NOT NULL,
	"commission" bigint NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales"."orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales"."order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."order_voids" ADD CONSTRAINT "order_voids_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_lines_tenant_order_idx" ON "sales"."order_lines" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_payments_tenant_order_idx" ON "sales"."order_payments" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_external_payment_idx" ON "sales"."order_payments" USING btree ("external_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_voids_order_idx" ON "sales"."order_voids" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_idempotency_key_idx" ON "sales"."orders" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_order_number_idx" ON "sales"."orders" USING btree ("tenant_id","order_number");--> statement-breakpoint
CREATE INDEX "orders_tenant_completed_at_idx" ON "sales"."orders" USING btree ("tenant_id","completed_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales"."channel_settings" AS PERMISSIVE FOR ALL TO public USING ("sales"."channel_settings"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("sales"."channel_settings"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales"."order_counters" AS PERMISSIVE FOR ALL TO public USING ("sales"."order_counters"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("sales"."order_counters"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales"."order_lines" AS PERMISSIVE FOR ALL TO public USING ("sales"."order_lines"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("sales"."order_lines"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales"."order_payments" AS PERMISSIVE FOR ALL TO public USING ("sales"."order_payments"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("sales"."order_payments"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales"."order_voids" AS PERMISSIVE FOR ALL TO public USING ("sales"."order_voids"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("sales"."order_voids"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales"."orders" AS PERMISSIVE FOR ALL TO public USING ("sales"."orders"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("sales"."orders"."tenant_id" = current_setting('app.tenant_id')::uuid);