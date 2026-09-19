CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."system_role_key" AS ENUM('owner', 'manager', 'cashier', 'chat_admin', 'warehouse');--> statement-breakpoint
CREATE TYPE "public"."tenant_timezone" AS ENUM('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura');--> statement-breakpoint
CREATE TABLE "identity"."invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text,
	"phone" text,
	"role_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."outlets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."outlets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" "system_role_key" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity"."tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" "tenant_timezone" DEFAULT 'Asia/Jakarta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "identity"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "identity"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."outlets" ADD CONSTRAINT "outlets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "identity"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "identity"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_tenant_id_idx" ON "identity"."invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_idx" ON "identity"."invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "memberships_tenant_id_idx" ON "identity"."memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_idx" ON "identity"."memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "outlets_tenant_id_idx" ON "identity"."outlets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "roles_tenant_id_idx" ON "identity"."roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_id_key_idx" ON "identity"."roles" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."invitations" AS PERMISSIVE FOR ALL TO public USING ("identity"."invitations"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("identity"."invitations"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "invitation_token_lookup" ON "identity"."invitations" AS PERMISSIVE FOR SELECT TO public USING ("identity"."invitations"."token" = current_setting('app.invitation_lookup_token', true));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."memberships" AS PERMISSIVE FOR ALL TO public USING ("identity"."memberships"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("identity"."memberships"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."outlets" AS PERMISSIVE FOR ALL TO public USING ("identity"."outlets"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("identity"."outlets"."tenant_id" = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "identity"."roles" AS PERMISSIVE FOR ALL TO public USING ("identity"."roles"."tenant_id" = current_setting('app.tenant_id')::uuid) WITH CHECK ("identity"."roles"."tenant_id" = current_setting('app.tenant_id')::uuid);