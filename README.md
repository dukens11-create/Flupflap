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
