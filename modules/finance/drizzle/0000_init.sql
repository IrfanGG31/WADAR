CREATE SCHEMA "finance";
--> statement-breakpoint
CREATE TYPE "finance"."account_kind" AS ENUM('wallet', 'receivable', 'inventory', 'payable', 'equity', 'revenue', 'contra_revenue', 'cogs', 'commission', 'expense', 'other_income');--> statement-breakpoint
CREATE TYPE "finance"."wallet_default_for" AS ENUM('cash', 'transfer', 'qris');--> statement-breakpoint
CREATE TYPE "finance"."wallet_type" AS ENUM('cash', 'bank', 'ewallet', 'qris', 'marketplace');--> statement-breakpoint
CREATE TABLE "finance"."accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "finance"."account_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finance"."category_rules" (
	"tenant_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"category" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_rules_tenant_id_keyword_pk" PRIMARY KEY("tenant_id","keyword")
);
--> statement-breakpoint
ALTER TABLE "finance"."category_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finance"."expense_voids" (
	"expense_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"voided_by" text NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."expense_voids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finance"."expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"category" text NOT NULL,
	"wallet_id" uuid NOT NULL,
	"note" text,
	"receipt_photo_path" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"entry_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finance"."journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"description" text NOT NULL,
	"reversal_of" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance"."journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finance"."journal_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" bigint DEFAULT 0 NOT NULL,
	"credit" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "journal_lines_one_side" CHECK (("finance"."journal_lines"."debit" = 0) <> ("finance"."journal_lines"."credit" = 0) and "finance"."journal_lines"."debit" >= 0 and "finance"."journal_lines"."credit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "finance"."journal_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finance"."wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "finance"."wallet_type" NOT NULL,
	"default_for" "finance"."wallet_default_for",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "finance"."wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finance"."expense_voids" ADD CONSTRAINT "expense_voids_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "finance"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."expenses" ADD CONSTRAINT "expenses_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "finance"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "finance"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "finance"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance"."wallets" ADD CONSTRAINT "wallets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "finance"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_tenant_code_idx" ON "finance"."accounts" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "expenses_tenant_occurred_idx" ON "finance"."expenses" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_idx" ON "finance"."journal_entries" USING btree ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_entries_tenant_occurred_idx" ON "finance"."journal_entries" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "journal_lines_tenant_entry_idx" ON "finance"."journal_lines" USING btree ("tenant_id","entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_tenant_account_idx" ON "finance"."journal_lines" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_account_idx" ON "finance"."wallets" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_tenant_default_idx" ON "finance"."wallets" USING btree ("tenant_id","default_for") WHERE "finance"."wallets"."default_for" is not null;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finance"."accounts" AS PERMISSIVE FOR ALL TO public USING ("finance"."accounts"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("finance"."accounts"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finance"."category_rules" AS PERMISSIVE FOR ALL TO public USING ("finance"."category_rules"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("finance"."category_rules"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finance"."expense_voids" AS PERMISSIVE FOR ALL TO public USING ("finance"."expense_voids"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("finance"."expense_voids"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finance"."expenses" AS PERMISSIVE FOR ALL TO public USING ("finance"."expenses"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("finance"."expenses"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finance"."journal_entries" AS PERMISSIVE FOR ALL TO public USING ("finance"."journal_entries"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("finance"."journal_entries"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finance"."journal_lines" AS PERMISSIVE FOR ALL TO public USING ("finance"."journal_lines"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("finance"."journal_lines"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "finance"."wallets" AS PERMISSIVE FOR ALL TO public USING ("finance"."wallets"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("finance"."wallets"."tenant_id" = current_setting('app.tenant_id')::uuid);