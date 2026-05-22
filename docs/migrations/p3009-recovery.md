# P3009 Recovery Runbook (`20260521153000_backfill_live_chat_and_reactions_schema`)

Use this runbook when deploy is blocked with Prisma `P3009` because migration
`20260521153000_backfill_live_chat_and_reactions_schema` is marked failed in
`_prisma_migrations`.

## Why this happened

The failed migration mixes schema backfill + constraints. In partially applied
production states, strict `ALTER COLUMN ... SET NOT NULL` / FK steps can fail
and leave `_prisma_migrations` in a failed state.

This repository now includes a fix-forward, idempotent corrective migration:

- `20260522025500_recover_live_chat_reactions_after_p3009`

## Production recovery steps (exact order)

1. Mark the failed migration as rolled back in Prisma metadata:

```bash
npx prisma migrate resolve --rolled-back 20260521153000_backfill_live_chat_and_reactions_schema
```

2. Deploy migrations (this applies the corrective migration):

```bash
npx prisma migrate deploy
```

3. Verify:
   - Deploy no longer stops at `P3009`
   - Live chat/reactions tables and indexes exist
   - Application live chat/reactions endpoints are healthy

## When to use `--applied` (and when not to)

Use:

```bash
npx prisma migrate resolve --applied 20260521153000_backfill_live_chat_and_reactions_schema
```

**Only** if you have manually verified the database already matches the intended
schema/data effects for that migration and you intentionally want to mark it as
already applied without executing it.

Do **not** use `--applied` as the default recovery action for this incident.
For this specific failure, prefer `--rolled-back` + `prisma migrate deploy` so
the idempotent corrective migration executes safely.
