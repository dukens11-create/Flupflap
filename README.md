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
| **Build command** | `npm install && npm run build && if [ -n "$DATABASE_URL" ]; then npx prisma db push --skip-generate; fi` |
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
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Secret from your Stripe webhook endpoint |
| `SHIPPO_API_TOKEN` | Shippo API token for shipping rates + label purchase |
| `PLATFORM_FEE_PERCENT` | Legacy bootstrap env var (the app normalizes commission snapshots to `7`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (required for media uploads) |
| `CLOUDINARY_API_KEY` | Cloudinary API key (required for media uploads) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (required for media uploads) |
| `CLOUDINARY_PRODUCTS_FOLDER` | Product image folder (default `flupflap/products`) |
| `CLOUDINARY_VIDEOS_FOLDER` | Product video folder (default `flupflap/videos`) |
| `CLOUDINARY_USERS_FOLDER` | User media folder (default `flupflap/users`) |
| `CLOUDINARY_THUMBNAILS_FOLDER` | Generated thumbnail folder (default `flupflap/thumbnails`) |

### Why the build succeeds but deployment fails

`next build` completes and generates a `.next` directory — the **build is not broken**. The error `Publish directory dist does not exist!` appears only when Render is mistakenly configured as a **Static Site**, which expects a `dist` output folder. The fix is to use a **Web Service**, which runs `npm run start` to serve the Next.js server instead of looking for a static directory.

## Stripe webhook setup
After deploying or while using Stripe CLI locally, point Stripe webhooks to:

```text
/api/stripe/webhook
```

Listen for:
- `checkout.session.completed`
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
Seller listing uploads use Cloudinary with signed backend upload configuration.

- Originals are uploaded with Cloudinary backup enabled.
- Product images are stored in `flupflap/products` (configurable via `CLOUDINARY_PRODUCTS_FOLDER`).
- Product videos are stored in `flupflap/videos` (configurable via `CLOUDINARY_VIDEOS_FOLDER`).
- Generated thumbnails are stored in `flupflap/thumbnails` (configurable via `CLOUDINARY_THUMBNAILS_FOLDER`).
- Delivery URLs returned to the app use AI enhancement + sharpening + auto quality + WebP for images and auto quality + WebM optimization for videos.
- Listings support up to 6 images and 1 video.

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
