-- #98: the per-transaction treatment of a spend that settles a commitment
-- from a closed annual plan. Null means no closed-year split is in play.
CREATE TYPE "public"."post_close_treatment" AS ENUM('charge_current_year', 'charge_closed_year_reserve');--> statement-breakpoint
ALTER TABLE "spend_entries" ADD COLUMN "post_close_treatment" "post_close_treatment";