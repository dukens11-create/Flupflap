-- Corrective, idempotent follow-up for failed migration:
-- 20260521153000_backfill_live_chat_and_reactions_schema
--
-- Goals:
-- 1) Safely converge GarageSale live chat/reaction schema on partial databases.
-- 2) Avoid re-failing when objects already exist.
-- 3) Keep all operations non-destructive.

-- live_sessions equivalent in this codebase is GarageSale live state.
ALTER TABLE "GarageSale"
  ADD COLUMN IF NOT EXISTS "isLive" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "liveStartedAt" TIMESTAMP(3);

UPDATE "GarageSale"
SET "isLive" = false
WHERE "isLive" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSale'
      AND column_name = 'isLive'
  ) THEN
    ALTER TABLE "GarageSale"
      ALTER COLUMN "isLive" SET DEFAULT false;

    IF NOT EXISTS (
      SELECT 1
      FROM "GarageSale"
      WHERE "isLive" IS NULL
      LIMIT 1
    ) THEN
      ALTER TABLE "GarageSale"
        ALTER COLUMN "isLive" SET NOT NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GarageSale_isLive_idx" ON "GarageSale"("isLive");

-- live_messages equivalent: GarageSaleChat
CREATE TABLE IF NOT EXISTS "GarageSaleChat" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "userId" TEXT,
  "sellerId" TEXT,
  "guestName" TEXT,
  "message" VARCHAR(500) NOT NULL,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GarageSaleChat_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GarageSaleChat"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "sellerId" TEXT,
  ADD COLUMN IF NOT EXISTS "guestName" TEXT,
  ADD COLUMN IF NOT EXISTS "message" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "GarageSaleChat"
SET "isHidden" = false
WHERE "isHidden" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSaleChat'
      AND column_name = 'message'
  ) THEN
    UPDATE "GarageSaleChat"
    SET "message" = ''
    WHERE "message" IS NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM "GarageSaleChat"
      WHERE "message" IS NULL
      LIMIT 1
    ) THEN
      ALTER TABLE "GarageSaleChat"
        ALTER COLUMN "message" SET NOT NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSaleChat'
      AND column_name = 'isHidden'
  ) THEN
    ALTER TABLE "GarageSaleChat"
      ALTER COLUMN "isHidden" SET DEFAULT false;

    IF NOT EXISTS (
      SELECT 1
      FROM "GarageSaleChat"
      WHERE "isHidden" IS NULL
      LIMIT 1
    ) THEN
      ALTER TABLE "GarageSaleChat"
        ALTER COLUMN "isHidden" SET NOT NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSaleChat'
      AND column_name = 'createdAt'
  ) THEN
    UPDATE "GarageSaleChat"
    SET "createdAt" = CURRENT_TIMESTAMP
    WHERE "createdAt" IS NULL;

    ALTER TABLE "GarageSaleChat"
      ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

    IF NOT EXISTS (
      SELECT 1
      FROM "GarageSaleChat"
      WHERE "createdAt" IS NULL
      LIMIT 1
    ) THEN
      ALTER TABLE "GarageSaleChat"
        ALTER COLUMN "createdAt" SET NOT NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_idx" ON "GarageSaleChat"("saleId");
CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_sellerId_idx" ON "GarageSaleChat"("saleId", "sellerId");
CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_isHidden_idx" ON "GarageSaleChat"("saleId", "isHidden");
CREATE INDEX IF NOT EXISTS "GarageSaleChat_createdAt_idx" ON "GarageSaleChat"("createdAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSaleChat'
      AND column_name = 'saleId'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'GarageSaleChat_saleId_fkey'
      AND n.nspname = 'public'
      AND t.relname = 'GarageSaleChat'
  ) THEN
    ALTER TABLE "GarageSaleChat"
      ADD CONSTRAINT "GarageSaleChat_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'GarageSaleChat_saleId_fkey'
      AND n.nspname = 'public'
      AND t.relname = 'GarageSaleChat'
      AND c.convalidated = false
  ) AND NOT EXISTS (
    SELECT 1
    FROM "GarageSaleChat" c
    LEFT JOIN "GarageSale" s ON s."id" = c."saleId"
    WHERE c."saleId" IS NOT NULL
      AND s."id" IS NULL
    LIMIT 1
  ) THEN
    ALTER TABLE "GarageSaleChat"
      VALIDATE CONSTRAINT "GarageSaleChat_saleId_fkey";
  END IF;
END $$;

-- live_reactions equivalent: GarageSaleReaction
CREATE TABLE IF NOT EXISTS "GarageSaleReaction" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "userId" TEXT,
  "guestId" TEXT,
  "type" TEXT NOT NULL DEFAULT 'like',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GarageSaleReaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GarageSaleReaction"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "guestId" TEXT,
  ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT 'like',
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "GarageSaleReaction"
SET "type" = 'like'
WHERE "type" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSaleReaction'
      AND column_name = 'type'
  ) THEN
    ALTER TABLE "GarageSaleReaction"
      ALTER COLUMN "type" SET DEFAULT 'like';

    IF NOT EXISTS (
      SELECT 1
      FROM "GarageSaleReaction"
      WHERE "type" IS NULL
      LIMIT 1
    ) THEN
      ALTER TABLE "GarageSaleReaction"
        ALTER COLUMN "type" SET NOT NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSaleReaction'
      AND column_name = 'createdAt'
  ) THEN
    UPDATE "GarageSaleReaction"
    SET "createdAt" = CURRENT_TIMESTAMP
    WHERE "createdAt" IS NULL;

    ALTER TABLE "GarageSaleReaction"
      ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

    IF NOT EXISTS (
      SELECT 1
      FROM "GarageSaleReaction"
      WHERE "createdAt" IS NULL
      LIMIT 1
    ) THEN
      ALTER TABLE "GarageSaleReaction"
        ALTER COLUMN "createdAt" SET NOT NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GarageSaleReaction_saleId_createdAt_idx" ON "GarageSaleReaction"("saleId", "createdAt");
CREATE INDEX IF NOT EXISTS "GarageSaleReaction_saleId_type_idx" ON "GarageSaleReaction"("saleId", "type");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GarageSaleReaction'
      AND column_name = 'saleId'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'GarageSaleReaction_saleId_fkey'
      AND n.nspname = 'public'
      AND t.relname = 'GarageSaleReaction'
  ) THEN
    ALTER TABLE "GarageSaleReaction"
      ADD CONSTRAINT "GarageSaleReaction_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "GarageSale"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'GarageSaleReaction_saleId_fkey'
      AND n.nspname = 'public'
      AND t.relname = 'GarageSaleReaction'
      AND c.convalidated = false
  ) AND NOT EXISTS (
    SELECT 1
    FROM "GarageSaleReaction" r
    LEFT JOIN "GarageSale" s ON s."id" = r."saleId"
    WHERE r."saleId" IS NOT NULL
      AND s."id" IS NULL
    LIMIT 1
  ) THEN
    ALTER TABLE "GarageSaleReaction"
      VALIDATE CONSTRAINT "GarageSaleReaction_saleId_fkey";
  END IF;
END $$;

-- Compatibility guardrails for legacy object names if they exist in production.
DO $$
BEGIN
  IF to_regclass('"live_messages"') IS NOT NULL AND
     EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'live_messages'
         AND column_name = 'createdAt'
     ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "live_messages_createdAt_idx" ON "live_messages"("createdAt")';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"live_reactions"') IS NOT NULL AND
     EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'live_reactions'
         AND column_name = 'createdAt'
     ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "live_reactions_createdAt_idx" ON "live_reactions"("createdAt")';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"live_sessions"') IS NOT NULL AND
     EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'live_sessions'
         AND column_name = 'id'
     ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "live_sessions_id_idx" ON "live_sessions"("id")';
  END IF;
END $$;
