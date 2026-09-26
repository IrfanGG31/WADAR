CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE TABLE "catalog"."categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog"."categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog"."channel_prices" (
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"price" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_prices_variant_id_channel_pk" PRIMARY KEY("variant_id","channel")
);
--> statement-breakpoint
ALTER TABLE "catalog"."channel_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog"."products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"photo_path" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "catalog"."products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog"."variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"sku" text,
	"barcode" text,
	"price" bigint NOT NULL,
	"cost" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "catalog"."variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog"."channel_prices" ADD CONSTRAINT "channel_prices_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog"."variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "catalog"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_id_name_idx" ON "catalog"."categories" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "products_tenant_id_name_idx" ON "catalog"."products" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "variants_tenant_id_product_id_idx" ON "catalog"."variants" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_tenant_id_sku_idx" ON "catalog"."variants" USING btree ("tenant_id",lower("sku")) WHERE "catalog"."variants"."sku" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "variants_tenant_id_barcode_idx" ON "catalog"."variants" USING btree ("tenant_id","barcode") WHERE "catalog"."variants"."barcode" is not null;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "catalog"."categories" AS PERMISSIVE FOR ALL TO public USING ("catalog"."categories"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("catalog"."categories"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "catalog"."channel_prices" AS PERMISSIVE FOR ALL TO public USING ("catalog"."channel_prices"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("catalog"."channel_prices"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "catalog"."products" AS PERMISSIVE FOR ALL TO public USING ("catalog"."products"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("catalog"."products"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "catalog"."variants" AS PERMISSIVE FOR ALL TO public USING ("catalog"."variants"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("catalog"."variants"."tenant_id" = current_setting('app.tenant_id')::uuid);