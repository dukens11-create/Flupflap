# FlupFlap Marketplace — Full Starter Build

FlupFlap is a marketplace starter app like a small eBay: FlupFlap can sell items, public sellers can list new/used items, buyers can shop, and FlupFlap keeps a fixed 7% marketplace commission on each paid seller item.

## Included now
- Public home page and product browsing
- Multilingual UI support (English, Español, Français) with language selector
- Product detail pages
- Search and filters: keyword, category, condition, min/max price
- Buyer/seller messaging inbox with photo attachments, unread notifications, and seller response-rate trust signals
- Customer/seller signup and login with NextAuth Credentials
- Seller listing form
- Seller dashboard
- Admin dashboard to approve/reject products
- LocalStorage multi-item cart
- Buy-now checkout
- Stripe Checkout payment routes
- Stripe Connect Express onboarding route for seller payouts
- Configurable seller commission with Stripe Connect fee splitting
- Stripe webhook route to mark orders paid and products sold
- Garage sale pricing + Stripe checkout (standard/featured, add-ons, live calculator)
- Garage sale payment activation, expiration/archive flow, and one-click repost checkout
- Admin garage sale pricing controls (dynamic pricing, add-on toggles, first-listing-free)
- Shippo shipping labels (live rates, label PDFs, auto tracking, buyer tracking links)
- Order dashboard
- Prisma PostgreSQL schema with users, products, orders, order items, addresses, auth sessions
- Starter legal pages: Terms, Privacy, Seller Agreement, Refund Policy
- Demo seed data

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with your real database and Stripe keys.

```bash
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

`npm run prisma:push` only runs schema push when `DATABASE_URL` is set; otherwise it skips with a message.

Open: http://localhost:3000

## Language support

- Supported languages: `en`, `es`, `fr`
- Default language: English (`en`)
- Users can switch language from the header selector
- Selected language is persisted in localStorage and a cookie (`flupflap_locale`)

## Demo accounts
- Admin: `admin@flupflap.com`
- Seller: `seller@flupflap.com`
- Password: `password123`

## Deploying to Render

> **⚠️ IMPORTANT — Web Service only, no publish directory**
>
> This is a **server-rendered Next.js app** (dynamic routes, API routes, NextAuth, Stripe webhooks, Prisma). It **must** be deployed as a **Render Web Service**. Do **not** deploy it as a Static Site and do **not** set a publish directory such as `dist`. `next build` produces a `.next` server bundle that is started with `npm run start` (`next start`) — it does not produce a static `dist` folder. Setting a publish directory will cause the deployment to fail with `Publish directory dist does not exist!` even when the build itself succeeds.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for a full step-by-step deployment guide.

### Quick setup (recommended — uses render.yaml Blueprint)

1. Push this repo to GitHub.
2. In [Render](https://render.com), click **New → Blueprint** and connect your repo.
3. Render will detect `render.yaml` and create the **Web Service** automatically.
4. Set the required environment variables in the Render dashboard (see below).

### Manual setup in Render

If you prefer to create the service manually, use **exactly** these settings:

| Setting | Value |
|---|---|
| **Service type** | **Web Service** (not Static Site) |
| **Runtime** | Node |
| **Node version** | `20` |
| **Build command** | `npm install && npm run build` |
| **Pre-Deploy command** | `if [ -n "$DATABASE_URL" ] && [ -d prisma/migrations ]; then npx prisma migrate deploy; else echo "Skipping Prisma migrate deploy — prisma/migrations not yet initialized. See DEPLOYMENT.md."; fi` |
| **Start command** | `npm run start` |
| **Publish directory** | *(leave completely blank — do not enter anything here)* |

### Required environment variables

Set these in **Environment → Environment Variables** in the Render dashboard:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for NextAuth (use "Generate" in Render) |
| `NEXTAUTH_URL` | Full public URL of your Render service (e.g. `https://flupflap.onrender.com`) |
| `NEXT_PUBLIC_APP_URL` | Same as `NEXTAUTH_URL` |
| `NEXT_PUBLIC_SITE_URL` | Primary public site URL used for redirects and absolute links (e.g. `https://www.flupflap.com`) |
| `NEXT_PUBLIC_API_URL` | Optional API base for external/mobile integrations; set to your backend URL if different from the site domain |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API key — used client-side for seller signup, seller login phone OTP, and seller dashboard phone verification |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain (e.g. `your-project.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `FIREBASE_API_KEY` | Server-side Firebase API key for validating phone-verified ID tokens (can be the same value as `NEXT_PUBLIC_FIREBASE_API_KEY`; if omitted, the public key is used as fallback) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Secret from your Stripe webhook endpoint |
| `SHIPPO_API_TOKEN` | Shippo API token for shipping rates + label purchase |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Public Mapbox token used for map experiences (checkout address autocomplete and garage sale map view) |
| `PLATFORM_FEE_PERCENT` | Legacy bootstrap env var (the app normalizes commission snapshots to `7`) |

URL precedence for app redirects/absolute links: `NEXT_PUBLIC_SITE_URL` → `NEXT_PUBLIC_APP_URL` → `NEXTAUTH_URL`.

### Legacy scheduled-listing publisher job

New listing scheduling is currently disabled. The Render cron service (`flupflap-scheduled-listing-publisher`) remains only as a backward-compatibility safety net for any legacy rows already stored with `SCHEDULED` status.

### Why the build succeeds but deployment fails

`next build` completes and generates a `.next` directory — the **build is not broken**. The error `Publish directory dist does not exist!` appears only when Render is mistakenly configured as a **Static Site**, which expects a `dist` output folder. The fix is to use a **Web Service**, which runs `npm run start` to serve the Next.js server instead of looking for a static directory.

## Stripe webhook setup
After deploying or while using Stripe CLI locally, point Stripe webhooks to:

```text
/api/stripe/webhook
```

Listen for:
- `checkout.session.completed`
- `checkout.session.expired`
- `account.updated`
- `identity.verification_session.processing`
- `identity.verification_session.verified`
- `identity.verification_session.requires_input`
- `identity.verification_session.canceled`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Seller KYC providers

FlupFlap now supports provider-based seller KYC with admin fallback review:

- Default provider: **Stripe Connect + Stripe Identity**
- Alternate provider: **Persona**
- Manual fallback: sellers can submit secure document uploads for admin review if automated/provider checks are incomplete or rejected.

Set:

- `KYC_PROVIDER` (`stripe`, `persona`, or `manual`; default `stripe`)
- `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, and `PERSONA_WEBHOOK_SECRET` when using Persona

Webhook endpoints:

- Stripe: `/api/stripe/webhook`
- Persona: `/api/kyc/webhook/persona`

## Seller subscription

FlupFlap uses a seller-only Stripe subscription for listing eligibility:

- Price: **$4.99/month**
- Billing: monthly recurring Stripe subscription
- Access rule: only sellers with an active subscription can create new listings
- If subscription becomes inactive (`past_due`, cancelled, expired, unpaid), new listing creation is blocked
- Existing listings remain visible even if subscription later lapses
- After Stripe Checkout returns to `/seller?subscribed=1`, FlupFlap runs a server-side Stripe recovery sync for the signed-in seller if DB status is stale (webhook delay/miss fallback)
- Free trial: none

## Commission
The initial default platform commission is bootstrapped from:

```env
PLATFORM_FEE_PERCENT="7"
```

Each checkout stores commission snapshots on order items so seller earnings, Stripe Connect fee splits, and reporting stay consistent even if listing prices change later.

## Image uploads
Seller listing media uses Cloudinary direct upload with AI-enhanced image variants:

- Up to 12 images + optional 1 video per listing
- Image enhancement pipeline: background removal, sharpening, auto brightness/contrast, auto crop/centering, optional HD upscale
- Sellers can preview and choose original vs enhanced image before submit
- Optimized transformed URLs + thumbnails are stored alongside originals

## Taxes
A placeholder `taxCents` field exists. For launch, connect Stripe Tax or TaxJar/Avalara because tax rules depend on state, city, nexus, product type, and seller location.

## Important production checklist
- Add email verification and password reset emails
- Add real seller identity/KYC rules through Stripe Connect
- Add prohibited item policy and fraud review
- Add seller-specific shipping/refund rules
- Add automated tax calculation
- Add production file upload provider
- Add rate limiting and bot protection
- Have an attorney review all legal pages
- Test Stripe webhooks before accepting real payments
- Configure Sentry for production error monitoring (see `DEPLOYMENT.md` → *Error monitoring with Sentry*)
- Run through the full [pre-deploy QA checklist](docs/QA_CHECKLIST.md) before every release
