-- Add multi-role support while preserving the legacy single role column.
ALTER TABLE "User"
ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY['CUSTOMER']::"Role"[];

-- Backfill current records based on the existing role value.
UPDATE "User"
SET "roles" = ARRAY["role"]::"Role"[];
