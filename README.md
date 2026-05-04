# FlupFlap Marketplace — Full Starter Build

FlupFlap is a marketplace starter app like a small eBay: FlupFlap can sell items, public sellers can list new/used items, buyers can shop, and FlupFlap keeps a 3% marketplace commission.

## Included now
- Public home page and product browsing
- Product detail pages
- Search and filters: keyword, category, condition, min/max price
- Customer/seller signup and login with NextAuth Credentials
- Seller listing form
- Seller dashboard
- Admin dashboard to approve/reject products
- LocalStorage multi-item cart
- Buy-now checkout
- Stripe Checkout payment routes
- Stripe Connect Express onboarding route for seller payouts
- 3% platform fee calculation
- Stripe webhook route to mark orders paid and products sold
- Shipping price fields, order tracking fields, and mark-shipped form
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

## Demo accounts
- Admin: `admin@flupflap.com`
- Seller: `seller@flupflap.com`
- Password: `password123`

## Deploying to Render

This is a **server-rendered Next.js app** with dynamic routes, API routes, auth, Stripe webhooks, and middleware. It must be deployed as a **Web Service**, not a Static Site. Do **not** set a publish directory (e.g. `dist`) — Next.js server output lives in `.next`, not a static folder.

### Using render.yaml (recommended)

A `render.yaml` is included in the repository. To use it:

1. Push this repo to GitHub.
2. In [Render](https://render.com), click **New → Blueprint** and connect your repo.
3. Render will detect `render.yaml` and create the Web Service automatically.
4. Set the required environment variables in the Render dashboard (see below).

### Manual setup in Render

If you prefer to create the service manually:

| Setting | Value |
|---|---|
| **Service type** | Web Service |
| **Runtime** | Node |
| **Build command** | `npm install && npm run build` |
| **Start command** | `npm run start` |
| **Publish directory** | *(leave blank — do not set this)* |

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
| `PLATFORM_FEE_PERCENT` | Commission percentage (default `3`) |

### Why the build succeeded but deployment failed

`next build` completes successfully and generates a `.next` directory. The failure `Publish directory dist does not exist!` happens only when Render is mistakenly configured as a **Static Site** (which looks for a `dist` folder). The fix is simply to use a **Web Service** deployment, which runs `npm run start` instead of serving a static directory.

## Stripe webhook setup
After deploying or while using Stripe CLI locally, point Stripe webhooks to:

```text
/api/stripe/webhook
```

Listen for:
- `checkout.session.completed`

## Commission
The platform commission is controlled by:

```env
PLATFORM_FEE_PERCENT="3"
```

## Image uploads
This build supports image URLs by default. For production, connect Cloudinary, UploadThing, S3, or Vercel Blob and store the returned URL in `imageUrl`.

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
