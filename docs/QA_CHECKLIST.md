# FlupFlap Pre-Deploy QA Checklist

Use this checklist before every production deploy (or after a significant code change) to verify that all critical user flows are working correctly. Tick each item manually or automate it in your CI pipeline.

---

## Environment prerequisites

- [ ] All required environment variables are set in Render (see `DEPLOYMENT.md` and `.env.example`)
- [ ] `DATABASE_URL` points to the correct production Postgres instance
- [ ] `NEXTAUTH_URL` matches the live Render URL exactly (no trailing slash)
- [ ] Stripe keys are **live** keys (`sk_live_...` / `pk_live_...`), not test keys
- [ ] `STRIPE_WEBHOOK_SECRET` is the **production** Stripe webhook signing secret
- [ ] `SHIPPO_API_TOKEN` is set to a live token (not a test/sandbox token)
- [ ] Cloudinary env vars are set (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- [ ] Twilio env vars are set and `ENABLE_SMS_OTP` is `"true"` (seller 2FA active)
- [ ] `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set (transactional emails enabled)
- [ ] Sentry DSN is set (`SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`) — errors will surface in Sentry dashboard
- [ ] `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` are set to the live URL (no localhost references)

---

## 1. Login / Logout

- [ ] **Buyer login** — log in with an existing buyer account; session persists across page reload
- [ ] **Seller login with OTP** — log in as a seller; verify the SMS OTP code is delivered and accepted
- [ ] **Admin login** — log in as admin; `/admin` dashboard loads without error
- [ ] **Logout** — click logout; session is cleared and user is redirected to `/login`
- [ ] **Forgot-password flow** — request a reset email; verify the link in the email works and the password can be reset
- [ ] No `localhost` URLs appear in emails or redirects

---

## 2. Buyer Checkout

### Cart checkout
- [ ] Add one or more products to the cart (`/cart`)
- [ ] Enter a valid shipping address; live shipping rates appear (if any item uses calculated shipping)
- [ ] Click **Checkout** — Stripe hosted checkout page opens
- [ ] Complete payment with a test card (`4242 4242 4242 4242` on Stripe test mode) or live card in production
- [ ] After payment, redirect back to the site shows an order-confirmation page
- [ ] Order appears in `/orders` for the buyer
- [ ] Seller receives an order notification
- [ ] Stripe webhook (`checkout.session.completed`) is received and logged without error — check Render logs and Sentry

### Buy-now
- [ ] Click **Buy Now** on a product page
- [ ] Stripe checkout page opens with a single item
- [ ] Complete payment; order is created correctly

---

## 3. Seller — Listing Create / Edit

- [ ] Log in as a verified seller
- [ ] Navigate to `/seller/new`; all required fields (title, price, category, condition) validate before submission
- [ ] Upload at least one product image — verify it appears (Cloudinary or base64 fallback)
- [ ] Submit the form — listing appears in the seller dashboard (`/seller`)
- [ ] Edit an existing listing — change title/price; verify the update saves and reflects on the product page
- [ ] Delete a listing — product is removed and no longer appears in search

---

## 4. Image Upload

- [ ] Upload a product image from the listing create/edit form
- [ ] Upload progress indicator is shown; image preview appears after upload
- [ ] Uploaded image URL resolves (no broken image icon on product page)
- [ ] Uploading an invalid file type (e.g. `.txt`) shows an error without crashing the form
- [ ] Check Render logs — no `[cloudinary]` errors; confirm `Cloudinary config exists` log line shows all fields `true`

---

## 5. Shipping Calculation

- [ ] In cart checkout, enter a US shipping address for a product with **calculated shipping**
- [ ] Shipping rates are fetched from Shippo; at least one rate appears in the UI
- [ ] Selecting a rate updates the order total correctly
- [ ] Submit checkout with calculated shipping — the selected rate is saved on the order
- [ ] Check Render logs for `[shipping]` entries — no uncaught errors

---

## 6. Stripe Checkout & Webhook

- [ ] Stripe checkout session is created (no console errors; `url` returned by `/api/checkout/cart`)
- [ ] Stripe webhook endpoint (`/api/stripe/webhook`) returns `200` for all event types — verify in Stripe Dashboard → Webhooks → event log
- [ ] `checkout.session.completed` event triggers order creation in the database
- [ ] Seller payout / transfer appears in Stripe when `payouts_enabled` is true for their Connect account
- [ ] Subscription webhooks (`customer.subscription.updated`, etc.) update `subscriptionStatus` correctly
- [ ] Check Sentry — no new errors after a checkout cycle

---

## 7. Admin — Approve / Reject

- [ ] Log in as admin; `/admin` dashboard loads with correct KYC counts
- [ ] Navigate to a pending seller KYC submission
- [ ] **Approve** — seller `kycStatus` changes to `APPROVED`; seller receives a notification
- [ ] **Reject** — seller `kycStatus` changes to `REJECTED`; seller receives a notification
- [ ] Admin product moderation — approve or reject a flagged listing; status updates correctly
- [ ] No server errors in Render logs during these actions

---

## 8. Monitoring & Observability

- [ ] Trigger a 404 by visiting `/nonexistent-page` — `not-found.tsx` is shown (not a blank page)
- [ ] Trigger the global error boundary by accessing a route with no database (or broken DB URL in test) — `error.tsx` is shown
- [ ] Check Sentry dashboard — the triggered error appears as a new issue with the correct `boundary: GlobalError` tag
- [ ] Check Render logs — structured `[ERROR]` log lines appear for server-side errors (format: `[ERROR] [tag] message {...}`)
- [ ] Verify no secrets (API keys, tokens, passwords) appear in Render logs or Sentry payloads

---

## 9. General Resilience

- [ ] Open the site in an incognito window — homepage loads without authentication
- [ ] Load a product page (`/products/[id]`) — SEO metadata and product details are correct
- [ ] Submit the checkout form with a missing required field — validation error is shown inline; no page crash
- [ ] Rate-limit check: rapid clicks on a submit button do not create duplicate orders (button disables after first click)
- [ ] Mobile responsive check: key pages (home, product, cart, checkout) display correctly on a 375 px viewport

---

## Sign-off

| Tester | Date | Environment | Outcome |
|--------|------|-------------|---------|
|        |      | Production  |  Pass / Fail |

> **Tip:** Run through this checklist in a staging environment first, then re-run the critical paths (checkout, webhook, admin) on production after deploy.
