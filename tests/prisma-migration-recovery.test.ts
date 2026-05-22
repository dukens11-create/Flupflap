import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const correctiveMigrationPath =
  'prisma/migrations/20260522025500_recover_live_chat_reactions_after_p3009/migration.sql';
const runbookPath = 'docs/migrations/p3009-recovery.md';

test('corrective P3009 migration uses idempotent guard patterns', () => {
  const sql = readFileSync(correctiveMigrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS "GarageSaleChat"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "GarageSaleReaction"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "isLive"/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_idx"/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "GarageSaleReaction_saleId_createdAt_idx"/);
  assert.match(sql, /NOT VALID/);
  assert.match(sql, /WHERE "isHidden" IS NULL/);
  assert.match(sql, /WHERE "type" IS NULL/);
});

test('P3009 runbook includes required production recovery commands', () => {
  const runbook = readFileSync(runbookPath, 'utf8');

  assert.match(
    runbook,
    /prisma migrate resolve --rolled-back 20260521153000_backfill_live_chat_and_reactions_schema/
  );
  assert.match(runbook, /prisma migrate deploy/);
  assert.match(
    runbook,
    /prisma migrate resolve --applied 20260521153000_backfill_live_chat_and_reactions_schema/
  );
});
