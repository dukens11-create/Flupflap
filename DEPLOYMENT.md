# Deploying FlupFlap to Render

## ⚠️ Critical: Web Service — not Static Site

FlupFlap is a **server-rendered Next.js application**. It uses:
- Dynamic API routes (auth, Stripe, Prisma)
- NextAuth session handling
- Stripe webhooks
- Middleware / proxy for protected routes
- Prisma PostgreSQL ORM

This means it **must** run as a live Node.js process. It cannot be deployed as a static site.

**Common failure:** `Publish directory dist does not exist!`

This error does **not** mean the build is broken. The Next.js build (`next build`) always succeeds and produces a `.next/` directory. This error only appears when Render is configured as a **Static Site** looking for a `dist` folder that does not exist. The fix is to deploy as a **Web Service**.

---

## Option 1 — Blueprint (recommended)

This repo includes a `render.yaml` file that tells Render exactly how to deploy the app as a Web Service.

1. Push this repo to GitHub (or fork it).
2. Open [Render](https://render.com) and click **New → Blueprint**.
3. Connect your GitHub account and select this repository.
4. Render reads `render.yaml` and automatically creates a **Web Service** with the correct build and start commands.
5. Fill in the environment variables (see below).
6. Click **Apply** — Render will build and deploy.

---

## Option 2 — Manual service creation

If you do not want to use the Blueprint approach, create a new service manually.

### Step 1 — Choose the right service type

In the Render dashboard, click **New** and select **Web Service**.

> ❌ Do **not** choose Static Site.  
> ❌ Do **not** choose any option that asks for a publish directory.

### Step 2 — Connect your repository

Connect your GitHub account and select this repository.

### Step 3 — Configure the service

Set these values exactly:

| Field | Value |
|---|---|
| **Name** | `flupflap` (or any name you choose) |
| **Region** | Your preferred region |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start` |
| **Publish Directory** | *(leave completely empty)* |

> **Why no publish directory?**  
> `next build` outputs a server bundle to `.next/`. The server is started with `next start`, which reads that directory automatically. There is no static `dist` folder — setting a publish directory will break the deployment.

### Step 4 — Add environment variables

In the **Environment** tab, add:

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. from Render Postgres, Supabase, or Neon) |
| `NEXTAUTH_SECRET` | Click **Generate** next to this field in Render |
| `NEXTAUTH_URL` | The full public URL Render assigns you, e.g. `https://flupflap.onrender.com` |
| `NEXT_PUBLIC_APP_URL` | Same value as `NEXTAUTH_URL` |
| `STRIPE_SECRET_KEY` | From your Stripe dashboard → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | From your Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | From Stripe → Webhooks → your endpoint → Signing secret |
| `PLATFORM_FEE_PERCENT` | `3` (or your desired commission %) |

### Step 5 — Deploy

Click **Create Web Service**. Render will:
1. Clone the repository
2. Install npm dependencies
3. Run `prisma generate && next build`
4. Start the server with `next start`

A successful deploy shows the app live at your Render URL.

---

## Stripe webhook configuration

After deploying, register a webhook endpoint in the Stripe dashboard:

- **Endpoint URL:** `https://<your-render-url>/api/stripe/webhook`
- **Events to listen for:** `checkout.session.completed`

Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` in Render.

---

## Database

This app requires a PostgreSQL database. Options:
- [Render PostgreSQL](https://render.com/docs/databases) — easiest if you are already on Render
- [Supabase](https://supabase.com) — generous free tier
- [Neon](https://neon.tech) — serverless Postgres with a free tier

After creating the database, copy the connection string into the `DATABASE_URL` environment variable.

### Automatic schema setup (Blueprint / render.yaml)

When `DATABASE_URL` is set in the Render environment before the deploy runs, the build
command automatically applies the Prisma schema:

```bash
npm install && npm run build && \
  if [ -n "$DATABASE_URL" ]; then npx prisma db push --skip-generate; fi
```

`prisma db push` is **non-destructive and idempotent** — it creates any missing tables
without dropping or resetting existing data, so it is safe to run on every deploy.
If `DATABASE_URL` is not set at build time the `db push` step is skipped automatically.

### Manual schema setup (first deploy without Blueprint, or DATABASE_URL added after build)

If you added `DATABASE_URL` after the first build already ran (so the automatic step was
skipped), run the schema push manually once:

```bash
npx prisma db push
```

You can do this from:
- A **Shell** / **Exec** tab inside your Render Web Service (if your plan provides one)
- Your local machine, with `DATABASE_URL` set to the **External Database URL** from Render

### Seed demo data (optional)

To populate the database with demo products and accounts:

```bash
npm run seed
```

Demo accounts created by seed:
- Admin: `admin@flupflap.com` / `password123`
- Seller: `seller@flupflap.com` / `password123`

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Publish directory dist does not exist!` | Service is configured as Static Site | Delete the service and recreate it as a Web Service, or change the service type in Settings |
| `PrismaClientInitializationError` | `DATABASE_URL` is missing or wrong | Set `DATABASE_URL` in Render → Environment |
| Homepage shows "Database schema not yet initialized" | `DATABASE_URL` was added after the first build ran, so `prisma db push` was skipped | Trigger a new deploy (the build will now run `prisma db push` automatically), or run it manually |
| NextAuth errors / redirect loop | `NEXTAUTH_SECRET` or `NEXTAUTH_URL` missing | Set both env vars; `NEXTAUTH_URL` must match the public Render URL |
| Stripe webhook `400` errors | `STRIPE_WEBHOOK_SECRET` missing or wrong | Re-copy the signing secret from Stripe and update the env var |
| App loads but images are broken | Image host not in `next.config.js` | Add the hostname to `remotePatterns` in `next.config.js` |
