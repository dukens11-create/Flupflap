import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const correctiveMigrationPath =
  'prisma/migrations/20260522025500_recover_live_chat_reactions_after_p3009/migration.sql';
const failedMigrationPath =
  'prisma/migrations/20260521153000_backfill_live_chat_and_reactions_schema/migration.sql';
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
  const rolledBackCommand =
    'prisma migrate resolve --rolled-back 20260521153000_backfill_live_chat_and_reactions_schema';
  const deployCommand = 'prisma migrate deploy';
  const appliedCommand =
    'prisma migrate resolve --applied 20260521153000_backfill_live_chat_and_reactions_schema';

  assert.ok(runbook.includes(rolledBackCommand));
  assert.ok(runbook.includes(deployCommand));
  assert.ok(runbook.includes(appliedCommand));

  const rolledBackIndex = runbook.indexOf(rolledBackCommand);
  const deployIndex = runbook.indexOf(deployCommand);
  const appliedIndex = runbook.indexOf(appliedCommand);

  assert.ok(rolledBackIndex >= 0);
  assert.ok(deployIndex > rolledBackIndex);
  assert.ok(appliedIndex > deployIndex);
  assert.match(runbook, /Do \*\*not\*\* use `--applied` as the default recovery action/);
});

test('failed backfill migration guards isHidden before indexing', () => {
  const sql = readFileSync(failedMigrationPath, 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN DEFAULT false/);
  assert.match(sql, /column_name = 'isHidden'/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "GarageSaleChat_saleId_isHidden_idx"/);
});
