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
| **Node Version** | `20` |
| **Build Command** | `npm install && npm run build` |
| **Pre-Deploy Command** | `if [ -n "$DATABASE_URL" ] && [ -d prisma/migrations ]; then npx prisma migrate deploy; else echo "Skipping Prisma migrate deploy — prisma/migrations not yet initialized. See DEPLOYMENT.md."; fi` |
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
| `NEXT_PUBLIC_SITE_URL` | Primary public site URL used for redirects/absolute links, e.g. `https://www.flupflap.com` |
| `NEXT_PUBLIC_API_URL` | Optional API base for external/mobile integrations; set only when API host differs from the site URL |
| `STRIPE_SECRET_KEY` | From your Stripe dashboard → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | From your Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | From Stripe → Webhooks → your endpoint → Signing secret |
| `PLATFORM_FEE_PERCENT` | Legacy bootstrap env var; the app normalizes seller commission to `7` |
| `CLOUDINARY_CLOUD_NAME` | From your Cloudinary dashboard — Settings → API Keys |
| `CLOUDINARY_API_KEY` | From your Cloudinary dashboard — Settings → API Keys |
| `CLOUDINARY_API_SECRET` | From your Cloudinary dashboard — Settings → API Keys |
| `CLOUDINARY_PRODUCT_MEDIA_FOLDER` | Optional Cloudinary folder for seller product images (defaults to `flupflap/products`) |
| `CLOUDINARY_PRODUCT_VIDEO_FOLDER` | Optional Cloudinary folder for seller product videos (defaults to `flupflap/videos`) |
| `NEXT_PUBLIC_TURN_URL` | Metered TURN URLs as a comma-separated list (see Metered credential instructions) |
| `NEXT_PUBLIC_TURN_USERNAME` | Metered TURN username for your generated credential |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | Metered TURN credential/password for the same Metered credential |
| `TWILIO_ACCOUNT_SID` | From your Twilio Console — Account SID |
| `TWILIO_AUTH_TOKEN` | From your Twilio Console — Auth Token |
| `TWILIO_FROM_NUMBER` | Your Twilio phone number (e.g. `+15005550006`) |

URL precedence for app redirects/absolute links: `NEXT_PUBLIC_SITE_URL` → `NEXT_PUBLIC_APP_URL` → `NEXTAUTH_URL`.

### Step 5 — Deploy

Click **Create Web Service**. Render will:
1. Clone the repository
2. Install npm dependencies
3. Run `prisma generate && next build`
4. Run the pre-deploy command — applies committed Prisma migrations with `prisma migrate deploy` when `DATABASE_URL` is set and `prisma/migrations` exists; **skips safely** when migrations are absent (no `prisma/migrations` directory)
5. Start the server with `next start`

A successful deploy shows the app live at your Render URL.

---

## Distributed rate limiting (Redis)

FlupFlap enforces per-endpoint throttle limits on all write-sensitive API routes
(checkout, offers, messages, refund requests, reports, AI generation, seller
listing creation, and garage-sale chat). These limits protect against abuse and
credential-stuffing in multi-instance deployments.

### How it works

| `REDIS_URL` set? | Behavior |
|---|---|
| **Yes** | Counters are stored in Redis — shared across all instances. A single request threshold applies regardless of how many Node processes are running. |
| **No** | Falls back to an in-memory counter per process. Suitable for single-instance and development deployments; limits are enforced per-process only. |

When Redis is temporarily unavailable (network blip, restart) the app logs a
`[WARN]` and falls back to in-memory automatically — **requests are not silently
passed through**.

### Setting `REDIS_URL`

Add `REDIS_URL` to your environment variables. Any `redis://` or `rediss://` URL
works (Render Redis, Redis Cloud, Upstash, etc.):

```
REDIS_URL=redis://default:your-password@your-redis-host:6379
```

For TLS-enabled providers (recommended in production), use `rediss://`:

```
REDIS_URL=rediss://default:your-password@your-redis-host:6380
```

**Render Redis** — add a new Redis instance from the Render dashboard and copy
the **External URL** into the `REDIS_URL` environment variable of your web
service.

### Rate-limit policies

| Endpoint | Window | Max requests | Identity key |
|---|---|---|---|
| `POST /api/checkout/buynow` | 1 min | 10 | user ID |
| `POST /api/checkout/cart` | 1 min | 10 | user ID |
| `POST /api/offers` | 1 min | 20 | user ID |
| `POST /api/orders/*/refund-request` | 1 hour | 5 | user ID |
| `POST /api/messages` | 1 min | 20 | user ID |
| `POST /api/messages/*` (reply) | 1 min | 20 | user ID |
| `POST /api/products/*/report` | 1 min | 10 | user ID |
| `POST /api/sellers/*/report` | 1 min | 10 | user ID |
| `POST /api/ai/generate-listing` | 1 min | 10 | user ID / IP |
| `POST /api/seller/products` | 1 min | 20 | user ID |
| `POST /api/garage-sales` | 1 min | 5 | user ID |
| `POST /api/garage-sales/*/chat` | 1 min | 30 | user ID / IP |

When a limit is exceeded, the endpoint returns **HTTP 429** with a
`Retry-After: <seconds>` header. The response body is a plain JSON error object
with no internal details:

```json
{ "error": "Too many checkout attempts. Please wait before trying again." }
```

The auth routes (`/api/auth/signup`, `/api/auth/forgot-password`,
`/api/auth/reset-password`, `/api/auth/otp/*`) retain their own independent
limits defined in their respective route handlers.

---

## Metered TURN relay for live garage sales

Live garage sale video uses a static Metered TURN configuration from browser
environment variables:

- `NEXT_PUBLIC_TURN_URL`
- `NEXT_PUBLIC_TURN_USERNAME`
- `NEXT_PUBLIC_TURN_CREDENTIAL`

Set `NEXT_PUBLIC_TURN_URL` to the full comma-separated Metered URL list, for
example:

```bash
NEXT_PUBLIC_TURN_URL="turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp"
NEXT_PUBLIC_TURN_USERNAME="your-metered-username"
NEXT_PUBLIC_TURN_CREDENTIAL="your-metered-credential"
```

If these variables are omitted, the app falls back to
`stun:stun.l.google.com:19302` for development/LAN testing, but production
cross-network calls should be verified with Metered enabled.

Manual verification:

1. Start a live garage sale from one device/network and join from another.
2. Open `chrome://webrtc-internals` during the call.
3. Confirm the selected candidate pair includes a `relay` candidate when TURN
   is required.

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
| Product image folder (optional) | `CLOUDINARY_PRODUCT_MEDIA_FOLDER` |
| Product video folder (optional) | `CLOUDINARY_PRODUCT_VIDEO_FOLDER` |

### Step 3 — Add the variables to Render

In your Render **Web Service → Environment**, add the three variables above.
Redeploy once to pick up the new values.

### How it works

When a seller picks files on the **List Item** or **Edit Listing** page, the
browser requests a signed upload from `/api/upload/product-media`, then uploads
the image/video directly to Cloudinary from the browser. The hosted URLs are
stored in the listing form and submitted with the rest of the product data.
For images, the client also calls `/api/upload/product-media/enhance` to
generate AI-enhanced variants (background removal, sharpening, brightness /
contrast auto-enhancement, auto-crop/centering, optional HD upscale,
optimized delivery URL, and thumbnail URL). Sellers can preview and choose
original vs enhanced before submitting.

- Accepted image formats: JPEG, PNG, WebP, GIF (1–12 images, up to 10 MB each)
- Accepted video formats: MP4, MOV, WebM (optional, 1 video, up to 200 MB)
- Product images are stored under `CLOUDINARY_PRODUCT_MEDIA_FOLDER` (defaults to
  `flupflap/products`) and videos under `CLOUDINARY_PRODUCT_VIDEO_FOLDER`
  (defaults to `flupflap/videos`)
- This direct-to-Cloudinary flow avoids writing permanent files to
  `/public/uploads`, which is important for Vercel/serverless deployments

> **Without Cloudinary configured** the file-picker upload returns a 503 error
> and the seller UI shows a friendly configuration error instead of uploading.

---

## Firebase Phone Auth (seller signup + seller login + seller dashboard phone verification)

Firebase Phone Authentication is used during **seller account creation**, every
seller **login**, and seller dashboard (`/seller`) phone verification. The same
Firebase project, web app credentials, invisible reCAPTCHA, and SMS delivery
setup power all of those flows.

### How the flow works

1. Seller enters a phone number (signup / seller dashboard) or email + password
   first (seller login).
2. Firebase sends OTP using `signInWithPhoneNumber` + invisible reCAPTCHA.
3. The page stores `confirmationResult` and the seller enters the 6-digit code.
4. The app confirms the code, gets a short-lived Firebase ID token, and submits
   that token to the server.
5. The server verifies that token before persisting phone verification or
   granting seller sign-in.

### Step 1 — Create / configure a Firebase project

1. Go to <https://console.firebase.google.com> and create (or select) a project.
2. In **Authentication → Sign-in method**, enable **Phone**.
3. In **Authentication → Settings → Authorized domains**, add every hostname that
   serves signup/seller pages (e.g. `localhost`, Render domain, custom domain).

> If the domain is missing, OTP send fails with `auth/unauthorized-domain`.

### Step 2 — Get web app credentials

1. Open **Project Settings → General**.
2. Under **Your apps**, create/select a **Web app**.
3. Copy values from `firebaseConfig`.

### Step 3 — Set environment variables

Add these to your hosting environment (Render → Environment) and local env:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `firebaseConfig.apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `firebaseConfig.authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `firebaseConfig.projectId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `firebaseConfig.appId` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `firebaseConfig.messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `firebaseConfig.measurementId` (optional; Analytics only) |
| `FIREBASE_API_KEY` | Same value as `NEXT_PUBLIC_FIREBASE_API_KEY` for server-side ID token verification (falls back to public key if omitted) |

Redeploy after setting variables.

### Testing locally

Firebase test phone numbers let you verify OTP flows without sending real SMS:

1. Firebase Console → **Authentication → Sign-in method → Phone → Phone numbers for testing**.
2. Add a phone number (e.g. `+15005550005`) with a fixed code (e.g. `123456`).
3. Use that number/code in signup, seller login, or seller dashboard verification.

### Troubleshooting Firebase Phone Auth

| Symptom | Likely cause | Fix |
|---|---|---|
| "This domain is not authorized for phone sign-in" | Hostname not in authorized domains | Add domain in Firebase Authentication settings |
| "Phone sign-in is not enabled for this app" | Phone provider disabled | Enable Phone provider |
| "Phone verification is unavailable" | Missing/incorrect Firebase env vars | Verify all `NEXT_PUBLIC_FIREBASE_*` variables and redeploy |
| "Security check failed" | reCAPTCHA blocked | Disable blockers, allow Google domains, retry in clean browser session |
| No SMS on real number | Provider not enabled, domain not authorized, or quota/billing issue | Verify provider/domain and Firebase SMS quota/billing |
| Server rejects token / "expired" | ID token expired or project mismatch | Request new OTP; ensure `FIREBASE_API_KEY` matches the same Firebase project |

---

## Seller login phone verification

When a seller signs in, FlupFlap validates email + password first and then uses
Firebase Phone Authentication to send a 6-digit code to the seller's registered
mobile number. They must enter this code before the authenticated session is
granted. The feature is **scoped to SELLER accounts only** — buyers and admins
use the normal single-factor login.

### How it works

1. Seller enters their email and password on the login page.
2. The client calls a lightweight server endpoint to determine whether the user
   is a seller and whether a phone number needs to be added first.
3. The login page creates one invisible `RecaptchaVerifier` and calls
   `signInWithPhoneNumber(auth, phoneNumber, appVerifier)`.
4. The page stores `confirmationResult`, confirms the 6-digit code, and submits
   the resulting Firebase ID token with the normal credentials sign-in.
5. The server verifies that Firebase token before creating the seller session.

### Testing seller sign-in locally

1. Create a seller account (`role: SELLER`) via the signup page, or use an
   existing seller account with a mobile number on file.
2. Sign in with the seller's email and password.
3. If using Firebase test numbers, enter the configured fixed code. Otherwise
   use the real SMS code sent by Firebase.
4. Enter that 6-digit code on the verification screen to complete sign-in.

---

## Seller dashboard — earnings and balance

Sellers have a dedicated dashboard at `/seller` that shows:

- **Earnings Summary** — aggregated stats from all completed orders:
  - Items sold (total quantity across paid/shipped/delivered orders)
  - Orders completed (count of distinct orders)
  - Gross sales (sum of item prices before commission)
  - Platform fees deducted (using stored commission snapshots)
  - Net earnings (gross minus commission)
- **Stripe Balance** (only shown when the seller has completed Stripe Connect
  onboarding):
  - Available balance — funds ready for payout
  - Pending balance — funds not yet settled (typically 2-7 business days)
  - A link to the seller's Stripe Express dashboard for full payout history
- **Sold Items table** — line-item list of every sold product with title, date,
  quantity, item price, commission fee, net payout, and order status.
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

## Stripe webhook configuration

After deploying, register a webhook endpoint in the Stripe dashboard:

- **Endpoint URL:** `https://<your-render-url>/api/stripe/webhook`
- **Events to listen for:** `checkout.session.completed`, `account.updated`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` in Render.

---

## Database

This app requires a PostgreSQL database. Options:
- [Render PostgreSQL](https://render.com/docs/databases) — easiest if you are already on Render
- [Supabase](https://supabase.com) — generous free tier
- [Neon](https://neon.tech) — serverless Postgres with a free tier

After creating the database, copy the connection string into the `DATABASE_URL` environment variable.

### Automatic schema setup (Blueprint / render.yaml)

Prisma migrations are now initialized in this repository (`prisma/migrations/` is present).
The pre-deploy command in `render.yaml` automatically runs `prisma migrate deploy` when
`DATABASE_URL` is set:

```bash
if [ -n "$DATABASE_URL" ] && [ -d prisma/migrations ]; then \
  npx prisma migrate deploy; \
else \
  echo "Skipping Prisma migrate deploy — DATABASE_URL not set or prisma/migrations absent."; \
fi
```

If `DATABASE_URL` is missing, migration deployment is skipped automatically (exits 0, deploy
continues). Otherwise each committed migration is applied in order on every deploy.

> **⚠️ First deploy against a pre-existing database (no `_prisma_migrations` table)**
>
> If your production database was previously managed with `prisma db push` (no migration
> history), run the following once to apply the committed migrations to production:
>
> ```bash
> npx prisma migrate deploy
> ```
>
> This will create the `_prisma_migrations` tracking table and apply any unapplied
> migrations (e.g. the `20260516173216_add_profile_image_url_to_user` migration that adds
> `User.profileImageUrl`). Subsequent deploys apply only new migrations automatically.

### Manual schema setup (first deploy without Blueprint, or DATABASE_URL added after build)

If you added `DATABASE_URL` after the first build already ran (so the automatic step was
skipped), run migration deployment manually:

```bash
npx prisma migrate deploy
```

You can run migration deployment from:
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
| Pre-deploy fails with `P3005` / "No migrations found" | `prisma migrate deploy` ran against a non-empty DB whose `_prisma_migrations` table is out of sync | Run `npx prisma migrate resolve --applied <migration_name>` to mark the baseline as applied, or use the guarded pre-deploy command from `render.yaml`. |
| `/api/auth/otp/send` returns 500 / `The column User.profileImageUrl does not exist` | Production DB is missing the `profileImageUrl` column — migration not yet applied | Run `npx prisma migrate deploy` against the production DB (or trigger a fresh deploy so the pre-deploy command runs it automatically). |
| Homepage shows "Database schema not yet initialized" | `DATABASE_URL` was added after the first build ran, or committed migrations are missing | Trigger a new deploy (the pre-deploy command applies migrations when migrations exist), or run `npx prisma migrate deploy` manually |
| NextAuth errors / redirect loop | `NEXTAUTH_SECRET` or `NEXTAUTH_URL` missing | Set both env vars; `NEXTAUTH_URL` must match the public Render URL |
| Stripe webhook `400` errors | `STRIPE_WEBHOOK_SECRET` missing or wrong | Re-copy the signing secret from Stripe and update the env var |
| App loads but images are broken | Image host not in `next.config.js` | Add the hostname to `remotePatterns` in `next.config.js` |
| Image upload returns "not configured" error | Cloudinary env vars missing or app not redeployed after adding them | Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in Render → Environment, redeploy, and verify logs contain `Cloudinary config exists` with all values `true` |
| **Firebase phone OTP (signup / seller login / seller dashboard)** | | |
| "This domain is not authorized for phone sign-in" at seller signup, login, or seller dashboard | Deployment domain not in Firebase authorized domains | Add the domain in Firebase Console → Authentication → Settings → Authorized domains |
| "Phone sign-in is not enabled" at seller signup or login | Phone provider disabled in Firebase | Enable Phone in Firebase Console → Authentication → Sign-in method |
| Firebase OTP sends successfully but seller creation fails with "Phone verification has expired" | Client and server Firebase vars point at different projects | Set `FIREBASE_API_KEY` to the same value as `NEXT_PUBLIC_FIREBASE_API_KEY` |
| Seller login returns `step: "signin"` from `/api/auth/otp/send` | Account is not a seller | Check the user's role in the database / admin UI |
| Seller login returns `step: "add_phone"` from `/api/auth/otp/send` | Seller account has no phone on file | Complete `/api/auth/otp/setup-phone`; logs show `[otp/send] Seller requires phone setup before OTP` |
| Seller OTP send returns 400 invalid phone | Saved seller phone fails normalization | Update seller phone in E.164 format; logs include `[otp/send] Seller phone on file is invalid for Firebase login` |
| Seller OTP code never arrives | Firebase phone provider disabled, domain not authorized, or SMS quota/billing issue | Verify Firebase Phone auth setup, authorized domains, and SMS quota/billing |
| Seller OTP verify fails after entering the code | `confirmationResult` expired or stale, or the wrong code was entered | Request a new OTP, then enter the latest code exactly as received |

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

---

## Product reporting and moderation

Authenticated users can report product listings they believe are fake,
counterfeit, misleading, prohibited, fraudulent, or otherwise problematic.
Admins can review those reports and take moderation action on the listing
and/or the seller.

### User-facing reporting flow

1. Any signed-in user (who is **not** the seller of the listing) sees a
   **"Report item"** link at the bottom of the product detail page.
2. Clicking it opens an inline form where the user selects a reason and
   optionally provides details.
3. Report reasons:
   - Fake / counterfeit item
   - Misleading description
   - Misleading photos
   - Prohibited item
   - Scam / fraud
   - Item unavailable / deceptive availability
   - Other
4. Submitting a report calls `POST /api/products/[id]/report`.
5. Duplicate suppression: one open report per **reporter / product / reason**
   combination is enforced at the database level (`@@unique` constraint).
   If the same reporter re-submits an identical reason, the notes are updated
   rather than creating a second record.
6. Reporters are not identified to the seller. Admin notes are private.

### Admin moderation queue

The queue is at `/admin/reports` and is linked from the Admin Dashboard.
The dashboard nav highlights the Reports button in red when open reports exist.

Admins can filter by status: **Open** / **Dismissed** / **Resolved**.

For each open report, the admin sees:
- Report reason and reporter-supplied notes
- Product title, image, current status, and a link to view the listing
- Seller name, email, and current seller status
- Reporter name and email

Admins can take the following actions:

| Action | Effect |
|---|---|
| **Dismiss** | Marks report DISMISSED; no product/seller change |
| **Mark resolved** | Marks report RESOLVED; no additional change |
| **Hide / remove listing** | Sets `product.status = HIDDEN`; listing disappears from browse |
| **Warn seller** | Logs a WARNED entry in `SellerModerationLog`; no status change |
| **Suspend seller** | Sets `sellerStatus = SUSPENDED` + audit log |
| **Ban seller** | Sets `sellerStatus = BANNED` (permanent) + audit log |

All actions record the acting admin, timestamp, action taken, and any admin notes
in the report record. Seller-level actions also appear in `SellerModerationLog`.

### Product HIDDEN status

`HIDDEN` is a new `ProductStatus` value used when a listing is removed via
moderation. Hidden listings:
- Are not shown in the browse/search product grid (only `APPROVED` listings appear).
- Return a 404 on the product detail page, identical to rejected listings.
- Are distinguishable from `REJECTED` (rejected during initial review) in the
  admin database for audit purposes.

### Schema additions

- `ProductStatus` enum: added `HIDDEN` value.
- `ReportStatus` enum: `OPEN | DISMISSED | RESOLVED`.
- `ProductReport` model: stores product, seller (denormalized), reporter, reason,
  notes, status, admin resolution fields, and timestamps.
- `@@unique([reporterId, productId, reason])` enforces duplicate suppression.

### Limitations

- Evidence file attachments are not supported (text-based reporting only).
  Cloudinary upload could be added in a future iteration.
- Rate limiting beyond the per-reporter/product/reason uniqueness constraint is
  not implemented. A Redis-based rate limiter could be added if abuse is observed.
- Anonymous (unauthenticated) reporting is not supported; authentication is
  required to submit a report.

---

## Local pickup and buyer-to-seller distance

Sellers can mark individual listings as available for local pickup. Buyers can
see pickup availability, the seller's approximate location, and their distance
from the seller.

### How it works

#### For sellers
1. When creating or editing a listing, check **"This item is available for local pickup"**.
2. Enter a **city**, **state**, and **ZIP / postal code** for the pickup location.
   - Only city and state are shown publicly. The postal code is used only for
     approximate distance calculation and is never displayed to buyers.

#### For buyers
- The product listing card shows a **"🏠 Pickup in City, State"** badge if pickup is available.
- The product detail page shows a **green pickup widget** with:
  - The seller's city and state.
  - A **"Show distance from me"** button that uses the browser's Geolocation API
    (with the buyer's consent) to calculate the approximate distance in miles.
- At checkout, items with pickup available show a **"Pick up in City, State"** toggle.
  Choosing pickup removes the shipping fee for that item and does not collect a
  shipping address from Stripe.
- The product page also shows a **"🏠 Buy now — Pick up locally"** button that
  creates a pickup-only Stripe checkout session (no shipping address, no shipping fee).

### Distance calculation

Distance is calculated with the Haversine formula using:
- **Buyer location**: browser Geolocation API (requires permission from the buyer).
- **Seller location**: the seller's postal code is geocoded via the free
  [zippopotam.us](https://api.zippopotam.us) service (no API key required).

This gives city-level accuracy. If the buyer denies location access or the
postal code cannot be geocoded, the distance widget shows a friendly error.

**Limitation**: distance is approximate (city-level, not street-level) and
requires the buyer to grant location permission in their browser. Exact pickup
addresses are never stored or displayed; sellers should exchange precise
address details with buyers privately after an order is placed.

### Pickup orders

- Pickup orders are stored with `isPickup = true` on the `Order` record.
- The order detail page shows a green **"Local Pickup Order"** banner with the
  seller's city and state, and a prompt to contact the seller to arrange a
  pickup time and confirm the exact location.
- Shipping tracking is not applicable for pickup orders.
- No shipping address is collected from Stripe for pure pickup orders.

### Schema changes

The following columns were added to support pickup:

| Table | Column | Type | Purpose |
|---|---|---|---|
| `Product` | `pickupAvailable` | `Boolean` | Whether pickup is offered |
| `Product` | `pickupCity` | `String?` | Seller pickup city |
| `Product` | `pickupState` | `String?` | Seller pickup state/region |
| `Product` | `pickupPostalCode` | `String?` | Used for distance geocoding (not shown to buyers) |
| `Order` | `isPickup` | `Boolean` | Whether this order is a pickup order |
| `Order` | `pickupCity` | `String?` | Pickup city snapshot on order |
| `Order` | `pickupState` | `String?` | Pickup state snapshot on order |

No new environment variables are required for the pickup feature.
The geocoding proxy (`/api/geo/zip`) calls `api.zippopotam.us` from the server;
no API key or account is needed.

---

## Pickup handoff confirmation

When a buyer places a pickup order, a **6-digit pickup confirmation code** is
automatically generated and stored with the order.

### How it works

1. After successful payment, the Stripe webhook creates the order and generates
   a random 6-digit pickup code (stored as `pickupCode` on the `Order` record).
2. The buyer can view their pickup code on the **Order Detail** page
   (`/orders/[id]`). It is displayed prominently so the buyer can show it to
   the seller at the handoff.
3. The seller opens the order in their **Seller Dashboard** (`/seller`) and
   enters the buyer's 6-digit code in the "Confirm Pickup" form.
4. If the code matches, the order status is updated to **PICKED\_UP** and the
   `pickupConfirmedAt` timestamp is recorded.
5. The order detail page then shows a confirmation message instead of the code.

### Order statuses for pickup flow

| Status | Meaning |
|---|---|
| `PAID` | Payment confirmed; pickup code generated and visible to buyer |
| `READY_FOR_PICKUP` | (Optional) Seller can manually mark when item is ready |
| `PICKED_UP` | Seller verified the buyer's code; handoff complete |

### Schema additions for pickup confirmation

| Table | Column | Type | Purpose |
|---|---|---|---|
| `Order` | `pickupCode` | `String?` | Plaintext 6-digit code shown to buyer |
| `Order` | `pickupConfirmedAt` | `DateTime?` | When the pickup was confirmed |
| `Order` | `pickupConfirmedById` | `String?` | Seller user ID who confirmed the pickup |

### Anti-fraud protections

- The pickup code is order-specific and single-use (matched by exact string).
- Only sellers who own an item in the order can verify the code.
- Restricted (suspended/banned) sellers cannot verify pickup codes.
- Pickup confirmation events can be reviewed by admins via the admin user
  detail page.

---

## Phone number management for existing accounts

Buyers and sellers who created accounts without a phone number can add or
update their phone number from the **Account Settings** page (`/account`).

### How it works

1. User navigates to `/account` and sees the **Phone number** section.
2. If no phone is set, a link "Add phone" appears. If a phone is set, an
   "Update" link is shown alongside the current number and its verification
   status.
3. User clicks Add/Update → enters their phone number → clicks **Send code**.
4. A 6-digit verification code is sent by SMS (or logged to the console in dev
   mode).
5. User enters the code → clicks **Verify**. The phone is saved and marked as
   verified.

### Seller login without a phone number (migration flow)

If a seller who does not yet have a phone number tries to sign in:

1. After entering correct credentials, the login page shows a **phone capture
   step** instead of the OTP step.
2. The seller enters their phone number and clicks **Send verification code**.
3. An OTP is sent to that phone. The phone number is saved (unverified) to the
   seller's account.
4. The seller enters the OTP to complete sign-in. On success, the phone is
   automatically marked as verified (`phoneVerified = true`).
5. All future sign-ins use the normal OTP flow.

This ensures existing sellers can migrate to the required 2FA phone setup
without being locked out of their accounts.

### Schema additions

| Table | Column | Type | Purpose |
|---|---|---|---|
| `User` | `phoneVerified` | `Boolean` | Whether the phone has been verified via OTP |
| `User` | `phoneVerifiedAt` | `DateTime?` | When the phone was verified |
| `PhoneVerificationToken` | (new model) | — | Stores pending OTP for account phone updates |

The `PhoneVerificationToken` model uses the same security measures as
`SellerOtp`: bcrypt-hashed code (cost 8), 10-minute expiry, 5-attempt limit,
and 60-second resend cooldown.

### Troubleshooting

| Symptom | Fix |
|---|---|
| Phone code never arrives | Check Twilio env vars; dev mode logs code to console |
| Seller login shows "Add phone" step | Normal for sellers without a phone — they complete the phone setup flow on first login |

---

## Admin user management and support access

Admins can view and manage buyer and seller accounts from the admin panel at
`/admin/users`.

### What admins can see

- **User list** (`/admin/users`): searchable/filterable list of all buyers and
  sellers with name, email, role, order count, and joined date.
- **User detail** (`/admin/users/[id]`): full account information including:
  - Profile details (name, email, role, phone, phone verification status)
  - Seller status and moderation state (for seller accounts)
  - Stripe Connect status (for seller accounts)
  - Recent orders (as buyer or as seller)
  - Listings with status (for seller accounts)
  - Moderation history (for seller accounts)

### What admins cannot see

- Password hashes (deliberately excluded from all admin queries)
- Raw authentication secrets or tokens
- Full payment card data (handled by Stripe, never stored)

### Audit trail

Every admin access to a user detail page creates an `AdminAccessLog` entry
recording:

| Field | Value |
|---|---|
| `adminId` | The admin who accessed the account |
| `targetId` | The user whose account was accessed |
| `action` | `view_account` |
| `createdAt` | Timestamp of access |

This provides a complete audit trail of admin account access for security
and compliance review.

### Schema additions

| Model | Purpose |
|---|---|
| `AdminAccessLog` | Audit trail for admin access to user accounts |

### Navigating to user management

From the **Admin Dashboard** (`/admin`):
- Click **"Users →"** to open the user list.
- Click **"View →"** next to any user to open their detail page.
- From a seller's detail page, click **"Seller Moderation →"** to go directly
  to the moderation panel for that seller.

---

## Error monitoring with Sentry

FlupFlap supports [Sentry](https://sentry.io) for production error monitoring. Sentry captures:
- Unhandled exceptions in Next.js Server Components and API routes
- Client-side JavaScript errors caught by the global `error.tsx` boundary
- Errors in edge middleware

### Setting up Sentry

1. Create a free Sentry project at [sentry.io](https://sentry.io).
2. In **Settings → Client Keys (DSN)**, copy the DSN.
3. Add these environment variables in Render → Environment:

| Variable | Description |
|---|---|
| `SENTRY_DSN` | Server-side DSN (used by API routes and Server Components) |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side DSN (same value; safe to expose to browsers) |
| `SENTRY_ENVIRONMENT` | Environment label, e.g. `production` or `staging` |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Same value for the browser SDK |
| `SENTRY_ORG` | Your Sentry organization slug (required for source-map upload) |
| `SENTRY_PROJECT` | Your Sentry project slug (required for source-map upload) |
| `SENTRY_AUTH_TOKEN` | Auth token from **Settings → Auth Tokens** (required for source-map upload) |

4. Redeploy the service. Sentry will start capturing errors immediately.

> **Note:** The app runs normally without Sentry configured — all errors continue to appear in Render logs. Sentry is a supplementary observability layer, not a hard dependency.

### Structured server logs

All critical server errors (checkout, webhooks, shipping, etc.) are emitted as structured JSON log lines via `lib/logger.ts`. Lines follow this format:

```
[ERROR] [checkout/cart] Stripe cart checkout session failed {"errName":"Error","errMessage":"...","action":"createCheckoutSession"}
[WARN]  [stripe/webhook] Stripe webhook signature verification failed {"message":"No signatures found..."}
```

Use Render's **Logs** tab and filter by `[ERROR]` or a specific tag (e.g. `[checkout`) to quickly isolate failures.

---

## Pre-deploy QA checklist

Before every production deploy, run through the checklist in [`docs/QA_CHECKLIST.md`](docs/QA_CHECKLIST.md). It covers:

- Login / logout (buyer, seller OTP, admin)
- Buyer checkout (cart + buy-now)
- Seller listing create / edit / delete
- Image upload
- Shipping rate calculation
- Stripe checkout and webhooks
- Admin approve / reject (KYC and listings)
- Error monitoring and observability
