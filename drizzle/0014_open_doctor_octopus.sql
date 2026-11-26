ALTER TABLE "close_snapshots" ADD CONSTRAINT "close_snapshots_reason_required" CHECK ("close_snapshots"."not_carried" = 0 OR length(btrim("close_snapshots"."not_carried_reason")) > 0);
-- ADR-0006 §2–3 (#113): after 0012 backfilled the ledger, repair the guarded
-- carry_in_* cache for every program and allocation so it equals the ledger sum.
-- This covers both the usual opening/manual shortfall (column > ledger) and the
-- case that motivated the ledger (a column edited below the ledger). From here
-- on recomputeCarryCache is the only writer, and the close asserts the invariant.
UPDATE "annual_programs" AS p SET
	"carry_in_capex" = COALESCE((
		SELECT SUM(e."amount") FROM "carry_over_entries" e
		WHERE e."entity_type" = 'program' AND e."target_entity_id" = p."id" AND e."component" = 'capex'
	), 0)::bigint,
	"carry_in_opex" = COALESCE((
		SELECT SUM(e."amount") FROM "carry_over_entries" e
		WHERE e."entity_type" = 'program' AND e."target_entity_id" = p."id" AND e."component" = 'opex'
	), 0)::bigint;--> statement-breakpoint
UPDATE "project_year_allocations" AS a SET
	"carry_in_capex" = COALESCE((
		SELECT SUM(e."amount") FROM "carry_over_entries" e
		WHERE e."entity_type" = 'allocation' AND e."target_entity_id" = a."id" AND e."component" = 'capex'
	), 0)::bigint,
	"carry_in_opex" = COALESCE((
		SELECT SUM(e."amount") FROM "carry_over_entries" e
		WHERE e."entity_type" = 'allocation' AND e."target_entity_id" = a."id" AND e."component" = 'opex'
	), 0)::bigint;
