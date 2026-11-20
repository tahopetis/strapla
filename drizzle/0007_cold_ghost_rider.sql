-- Issue #76: an optional example value on the registry, shown in the
-- administration row and used as the opening-import template example. It is a
-- display hint only and never stored on a record or used in money rules.
ALTER TABLE "custom_fields" ADD COLUMN "example" text DEFAULT '' NOT NULL;