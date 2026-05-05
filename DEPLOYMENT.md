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
| **Build Command** | `npm install && npm run build && if [ -n "$DATABASE_URL" ]; then npx prisma db push --skip-generate; fi` |
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
| `CLOUDINARY_CLOUD_NAME` | From your Cloudinary dashboard — Settings → API Keys |
| `CLOUDINARY_API_KEY` | From your Cloudinary dashboard — Settings → API Keys |
| `CLOUDINARY_API_SECRET` | From your Cloudinary dashboard — Settings → API Keys |
| `TWILIO_ACCOUNT_SID` | From your Twilio Console — Account SID |
| `TWILIO_AUTH_TOKEN` | From your Twilio Console — Auth Token |
| `TWILIO_FROM_NUMBER` | Your Twilio phone number (e.g. `+15005550006`) |

### Step 5 — Deploy

Click **Create Web Service**. Render will:
1. Clone the repository
2. Install npm dependencies
3. Run `prisma generate && next build`
4. Apply the Prisma schema with `prisma db push` (if `DATABASE_URL` is set at build time)
5. Start the server with `next start`

A successful deploy shows the app live at your Render URL.

---

## Cloudinary (image uploads)

Sellers upload product images directly from their device. Images are stored on
[Cloudinary](https://cloudinary.com), which has a generous free tier and works
seamlessly with Render.

### Step 1 — Create a Cloudinary account

Sign up for free at <https://cloudinary.com>. No credit card required for the
free tier.

### Step 2 — Copy your credentials

Open the Cloudinary dashboard and go to **Settings → API Keys**. You need:

| Value | Environment variable |
|---|---|
| Cloud name | `CLOUDINARY_CLOUD_NAME` |
| API key | `CLOUDINARY_API_KEY` |
| API secret | `CLOUDINARY_API_SECRET` |

### Step 3 — Add the variables to Render

In your Render **Web Service → Environment**, add the three variables above.
Redeploy once to pick up the new values.

### How it works

When a seller picks a file on the **List Item** or **Edit Listing** page, the
browser posts it to `/api/upload`. That route verifies the seller session,
uploads the file to Cloudinary, and returns the hosted URL. The URL is placed
in the form's `imageUrl` field before the form is submitted, so the rest of the
product create/update flow is unchanged.

- Accepted formats: JPEG, PNG, WebP, GIF (up to 10 MB)
- Images are stored under the `flupflap/products/` folder in your Cloudinary
  account
- Sellers can also paste a direct image URL if they prefer not to upload

> **Without Cloudinary configured** the file-picker upload returns a 503 error
> and sellers can still paste a URL directly — backward compatibility is
> preserved.

---

## Seller two-factor authentication (phone OTP)

When a seller signs in, FlupFlap sends a 6-digit one-time code to their
registered mobile number.  They must enter this code before the authenticated
session is granted.  The feature is **scoped to SELLER accounts only** — buyers
and admins use the normal single-factor login.

### How it works

1. Seller enters their email and password on the login page.
2. The server validates the credentials and sends a 6-digit SMS code.
3. Seller enters the code on the second step of the login page.
4. The server verifies the code (10-minute expiry, 5-attempt limit, 60-second
   resend cooldown) and grants the session.

### Step 1 — Create a Twilio account

Sign up for free at <https://www.twilio.com>.  You will need:

- A **verified phone number** (Twilio trial) or a purchased number.
- The **Account SID** and **Auth Token** from the
  [Twilio Console](https://console.twilio.com).

### Step 2 — Get a Twilio phone number

In the Twilio Console go to **Phone Numbers → Manage → Buy a number** (or use
your trial number for testing).  Copy the number in E.164 format, e.g.
`+15005550006`.

### Step 3 — Add the variables to Render

| Variable | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | your auth token |
| `TWILIO_FROM_NUMBER` | your Twilio number in E.164 format, e.g. `+15005550006` |

Redeploy once after adding the variables.

### Dev / mock mode (no Twilio)

If any of the three Twilio variables are absent, the app runs in **mock mode**:
the OTP is logged to the server console (`[OTP DEV MODE]`) instead of being
sent by SMS.  This lets you develop and test locally without a Twilio account.

> **Important:** when `NODE_ENV=production` (which Render sets automatically),
> the app will throw a startup error if any `TWILIO_*` variable is missing,
> preventing sellers from bypassing the second factor.  Always set all three
> `TWILIO_*` variables in the Render environment before going live.

### Testing seller sign-in locally

1. Create a seller account (`role: SELLER`) via the signup page.  Supply any
   phone number.
2. Sign in with the seller's email and password.
3. Watch the server console for the line:

   ```
   [OTP DEV MODE] To: +15005550006  Message: Your FlupFlap verification code is: 123456. …
   ```

4. Enter that 6-digit code on the verification screen to complete sign-in.

---

## Seller dashboard — earnings and balance

Sellers have a dedicated dashboard at `/seller` that shows:

- **Earnings Summary** — aggregated stats from all completed orders:
  - Items sold (total quantity across paid/shipped/delivered orders)
  - Orders completed (count of distinct orders)
  - Gross sales (sum of item prices before platform fee)
  - Platform fees deducted (configurable via `PLATFORM_FEE_PERCENT`)
  - Net earnings (gross minus platform fees)
- **Stripe Balance** (only shown when the seller has completed Stripe Connect
  onboarding):
  - Available balance — funds ready for payout
  - Pending balance — funds not yet settled (typically 2-7 business days)
  - A link to the seller's Stripe Express dashboard for full payout history
- **Sold Items table** — line-item list of every sold product with title, date,
  quantity, amount, and order status.
- **Recent Orders** — full order view with a "Mark Shipped" action for orders
  in PAID status.

### Important notes

- Earnings figures are computed from your app's order/item data.  The Stripe
  balance reflects funds in the seller's connected Stripe account and may
  differ from calculated earnings if payouts have already been transferred to
  the seller's bank.
- If the Stripe balance API call fails (e.g. the connected account is not fully
  verified), the dashboard displays "Unavailable — check your Stripe dashboard"
  and falls back gracefully without an error page.
- Sellers without a Stripe Connect account see a prompt to connect and a note
  that balance data requires connection.

---

## Local pickup and buyer distance

Sellers can mark individual listings as available for local pickup when
creating or editing a product. When enabled:

- The seller enters their pickup **city**, **state**, and **ZIP/postal code**.
  These approximate coordinates are geocoded using the free
  [Nominatim / OpenStreetMap](https://nominatim.org) API (no API key required).
- Only the **city and state** are shown publicly to buyers — the seller's exact
  address is never displayed before purchase.
- On the product detail page, buyers see a **"Pickup available"** badge and,
  if they allow browser location access, their approximate **distance** to the
  seller (calculated client-side using the Haversine formula).
- At checkout, buyers can choose **"Ship it"** or **"Pick up locally"** using the
  "Buy Now" button. Pickup orders have no shipping cost.

**Current limitation:** pickup selection is supported via "Buy Now" only.
Cart checkout always uses shipping, because carts may contain items from
multiple sellers. Buyers who want to pick up an item should use the "Buy Now"
button on the product detail page.

### Geocoding notes

- Geocoding is performed server-side when a product is saved with pickup
  enabled. If the Nominatim request fails (network issue, address not found,
  rate limit), the product is saved without coordinates — the pickup badge
  still shows but distance is not calculated.
- Nominatim rate limit is 1 request/second, which is well within the expected
  product-save rate for a small marketplace.

---

## Pickup confirmation / receipt verification

When a buyer selects local pickup at checkout, the system generates a unique
**6-digit pickup code** tied to that order. This code is used to confirm the
item handoff.

### Pickup flow

1. **Payment complete** → Order status set to `READY_FOR_PICKUP`, 6-digit
   pickup code generated and stored (bcrypt-hashed in DB; plain text shown
   to buyer only).
2. **Buyer** views their order at `/orders/[id]` to see the pickup code.
3. **Buyer arrives at seller's location** and shows the 6-digit code.
4. **Seller** opens their dashboard at `/seller`, finds the order in
   "Recent Orders", and enters the code in the "Confirm pickup" field.
5. The code is verified server-side. On success:
   - Order status transitions to `PICKED_UP`.
   - `pickupConfirmedAt` timestamp is recorded.
   - A `PickupEvent` audit record is created (actor, time, event type).
6. Buyer sees "Pickup confirmed" in their order details.

### Order statuses for pickup

| Status | Meaning |
|---|---|
| `READY_FOR_PICKUP` | Payment confirmed; pickup code generated; awaiting handoff |
| `PICKED_UP` | Seller verified the pickup code; handoff complete |

### Security

- Pickup codes are 6 cryptographically random digits.
- Codes are bcrypt-hashed before storage; the plain code is only shown to the
  buyer in their order details.
- Sellers cannot view or copy the code — they must receive it from the buyer
  at handoff.
- A `PickupEvent` record provides an audit trail for dispute resolution by
  admins.
- Restricted (suspended/banned) sellers cannot verify pickup codes.

---



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
| Image upload returns "not configured" error | Cloudinary env vars missing | Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in Render → Environment and redeploy |
| Seller OTP code never arrives | Twilio env vars missing or wrong | Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` in Render → Environment and redeploy |
| Seller OTP arrives in server logs only | App running in mock/dev mode | Set all three `TWILIO_*` env vars in Render → Environment so real SMS is sent |
| Seller login returns "No phone number on file" | Seller account was created before phone 2FA was added | Ask the seller to contact support to add their phone number to the account |

---

## Admin seller moderation

Admins can suspend or permanently ban seller accounts from the admin panel at
`/admin/sellers`.

### How it works

1. Admin navigates to **Admin Dashboard → Seller Management** (or `/admin/sellers`).
2. Each seller card shows the current status (Active / Suspended / Banned) and
   listing count.
3. Expanding the **Moderation actions** section reveals a form to:
   - **Suspend** — temporary restriction while investigating.
   - **Ban** — permanent restriction.
   - **Reinstate** — lift a prior suspension or ban.
4. A reason category (required for suspend/ban) and optional internal notes are
   recorded with each action.
5. The action is written to the `SellerModerationLog` audit table, capturing who
   performed the action, when, the reason, and any notes.

### Reason categories

| Key | Label |
|---|---|
| `misconduct_to_customer` | Misconduct to customer |
| `fake_product` | Fake product |
| `unlawful_activity` | Unlawful activity |
| `fraud` | Fraud |
| `spam` | Spam |
| `policy_violation` | Policy violation |
| `other` | Other |

### What restrictions do for sellers

When a seller's status is **Suspended** or **Banned**:

- The seller dashboard shows a neutral restriction notice.
- The "New listing" button is hidden.
- Attempting to create or edit listings redirects to the seller dashboard.
- API routes for creating/editing/shipping listings return 403.
- The Stripe Connect payout link is blocked.

Restriction messaging to the seller is intentionally neutral:

> *"Your seller account has been restricted. If you believe this is an error,
> please contact support."*

### Audit trail

Every moderation action is stored in `SellerModerationLog` with:
- `sellerId` — the affected seller
- `adminId` — the admin who performed the action
- `action` — `SUSPENDED`, `BANNED`, or `REINSTATED`
- `reasonCategory` — one of the reason keys above
- `notes` — free-text internal notes (never shown to the seller)
- `createdAt` — timestamp

The last five log entries are shown in the seller card on `/admin/sellers`.
