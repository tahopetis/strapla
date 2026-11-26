CREATE TYPE "public"."carry_over_origin" AS ENUM('close', 'opening', 'manual');--> statement-breakpoint
CREATE TABLE "close_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"annual_plan_id" uuid NOT NULL,
	"entity_type" "carry_over_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"component" "component" NOT NULL,
	"available" bigint NOT NULL,
	"carried" bigint NOT NULL,
	"not_carried" bigint NOT NULL,
	"not_carried_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "close_snapshots_amounts_non_negative" CHECK ("close_snapshots"."available" >= 0 AND "close_snapshots"."carried" >= 0 AND "close_snapshots"."not_carried" >= 0),
	CONSTRAINT "close_snapshots_balanced" CHECK ("close_snapshots"."available" = "close_snapshots"."carried" + "close_snapshots"."not_carried")
);
--> statement-breakpoint
ALTER TABLE "carry_over_entries" ALTER COLUMN "source_annual_plan_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ALTER COLUMN "source_entity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ALTER COLUMN "approval_reference" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ADD COLUMN "origin" "carry_over_origin" DEFAULT 'close' NOT NULL;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "carry_over_entries" ADD COLUMN "source_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "close_snapshots" ADD CONSTRAINT "close_snapshots_annual_plan_id_annual_plans_id_fk" FOREIGN KEY ("annual_plan_id") REFERENCES "public"."annual_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "close_snapshots_plan_entity_component_idx" ON "close_snapshots" USING btree ("annual_plan_id","entity_type","entity_id","component");--> statement-breakpoint
CREATE INDEX "close_snapshots_plan_idx" ON "close_snapshots" USING btree ("annual_plan_id");--> statement-breakpoint
ALTER TABLE "carry_over_entries" ADD CONSTRAINT "carry_over_entries_source_entry_id_carry_over_entries_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "public"."carry_over_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill (#113 / ADR-0006 §2–3): existing carry_in_* columns were written by
-- the close, the program/allocation forms and the opening import. Where such a
-- column exceeds the sum the existing ledger already carries for that entity and
-- component, the difference becomes an opening-balance receipt. Existing ledger
-- rows keep origin 'close' (the new column default). The comparison makes this
-- safe on a populated database and idempotent: a re-run finds no positive
-- difference. Recurring ops carry-in is out of scope and gets no entries.
INSERT INTO "carry_over_entries" (
	"target_annual_plan_id",
	"entity_type",
	"target_entity_id",
	"component",
	"amount",
	"origin",
	"reason"
)
SELECT
	r."annual_plan_id",
	r."entity_type",
	r."entity_id",
	r."component",
	(r."column_amount" - COALESCE(l."ledger_amount", 0))::bigint,
	'opening'::"carry_over_origin",
	'Opening balance migration'
FROM (
	SELECT
		p."annual_plan_id",
		'program'::"carry_over_entity_type" AS "entity_type",
		p."id" AS "entity_id",
		c."component",
		c."amount" AS "column_amount"
	FROM "annual_programs" p
	CROSS JOIN LATERAL (
		VALUES
			('capex'::"component", p."carry_in_capex"),
			('opex'::"component", p."carry_in_opex")
	) AS c("component", "amount")
	UNION ALL
	SELECT
		a."annual_plan_id",
		'allocation'::"carry_over_entity_type",
		a."id",
		c."component",
		c."amount"
	FROM "project_year_allocations" a
	CROSS JOIN LATERAL (
		VALUES
			('capex'::"component", a."carry_in_capex"),
			('opex'::"component", a."carry_in_opex")
	) AS c("component", "amount")
) AS r
LEFT JOIN LATERAL (
	SELECT SUM(e."amount") AS "ledger_amount"
	FROM "carry_over_entries" e
	WHERE e."entity_type" = r."entity_type"
		AND e."target_entity_id" = r."entity_id"
		AND e."component" = r."component"
) AS l ON true
WHERE r."column_amount" > COALESCE(l."ledger_amount", 0);