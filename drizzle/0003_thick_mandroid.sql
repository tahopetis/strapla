CREATE TYPE "public"."settlement_kind" AS ENUM('current', 'prior_year_opening');--> statement-breakpoint
CREATE TABLE "commitment_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_year_allocation_id" uuid,
	"recurring_ops_item_id" uuid,
	"component" "component" NOT NULL,
	"amount" bigint NOT NULL,
	"commitment_date" date NOT NULL,
	"reference" text,
	"description" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitment_entries_amount_positive" CHECK ("commitment_entries"."amount" > 0),
	CONSTRAINT "commitment_entries_one_parent" CHECK ((
        ("commitment_entries"."project_year_allocation_id" IS NOT NULL AND "commitment_entries"."recurring_ops_item_id" IS NULL)
        OR ("commitment_entries"."project_year_allocation_id" IS NULL AND "commitment_entries"."recurring_ops_item_id" IS NOT NULL)
      )),
	CONSTRAINT "commitment_entries_recurring_opex_only" CHECK ("commitment_entries"."recurring_ops_item_id" IS NULL OR "commitment_entries"."component" = 'opex')
);
--> statement-breakpoint
CREATE TABLE "commitment_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spend_entry_id" uuid NOT NULL,
	"commitment_entry_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitment_settlements_amount_positive" CHECK ("commitment_settlements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "spend_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_year_allocation_id" uuid,
	"recurring_ops_item_id" uuid,
	"component" "component" NOT NULL,
	"amount" bigint NOT NULL,
	"spent_on" date NOT NULL,
	"category_id" uuid,
	"vendor" text,
	"reference" text,
	"description" text,
	"settlement_kind" "settlement_kind" DEFAULT 'current' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_entries_amount_positive" CHECK ("spend_entries"."amount" > 0),
	CONSTRAINT "spend_entries_one_parent" CHECK ((
        ("spend_entries"."project_year_allocation_id" IS NOT NULL AND "spend_entries"."recurring_ops_item_id" IS NULL)
        OR ("spend_entries"."project_year_allocation_id" IS NULL AND "spend_entries"."recurring_ops_item_id" IS NOT NULL)
      )),
	CONSTRAINT "spend_entries_recurring_opex_only" CHECK ("spend_entries"."recurring_ops_item_id" IS NULL OR "spend_entries"."component" = 'opex')
);
--> statement-breakpoint
ALTER TABLE "commitment_entries" ADD CONSTRAINT "commitment_entries_project_year_allocation_id_project_year_allocations_id_fk" FOREIGN KEY ("project_year_allocation_id") REFERENCES "public"."project_year_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_entries" ADD CONSTRAINT "commitment_entries_recurring_ops_item_id_recurring_ops_items_id_fk" FOREIGN KEY ("recurring_ops_item_id") REFERENCES "public"."recurring_ops_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_entries" ADD CONSTRAINT "commitment_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_entries" ADD CONSTRAINT "commitment_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_settlements" ADD CONSTRAINT "commitment_settlements_spend_entry_id_spend_entries_id_fk" FOREIGN KEY ("spend_entry_id") REFERENCES "public"."spend_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_settlements" ADD CONSTRAINT "commitment_settlements_commitment_entry_id_commitment_entries_id_fk" FOREIGN KEY ("commitment_entry_id") REFERENCES "public"."commitment_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_settlements" ADD CONSTRAINT "commitment_settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_project_year_allocation_id_project_year_allocations_id_fk" FOREIGN KEY ("project_year_allocation_id") REFERENCES "public"."project_year_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_recurring_ops_item_id_recurring_ops_items_id_fk" FOREIGN KEY ("recurring_ops_item_id") REFERENCES "public"."recurring_ops_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_category_id_spend_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."spend_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitment_entries_allocation_idx" ON "commitment_entries" USING btree ("project_year_allocation_id");--> statement-breakpoint
CREATE INDEX "commitment_entries_recurring_idx" ON "commitment_entries" USING btree ("recurring_ops_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_settlements_pair_idx" ON "commitment_settlements" USING btree ("spend_entry_id","commitment_entry_id");--> statement-breakpoint
CREATE INDEX "commitment_settlements_commitment_idx" ON "commitment_settlements" USING btree ("commitment_entry_id");--> statement-breakpoint
CREATE INDEX "spend_entries_allocation_idx" ON "spend_entries" USING btree ("project_year_allocation_id");--> statement-breakpoint
CREATE INDEX "spend_entries_recurring_idx" ON "spend_entries" USING btree ("recurring_ops_item_id");