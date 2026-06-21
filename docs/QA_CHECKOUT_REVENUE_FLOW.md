# Checkout + Revenue Flow Local Validation

- [ ] Start dependencies: `npm install`
- [ ] Generate Prisma client / build once: `npm run build`
- [ ] Start the app locally with Stripe + database env vars configured: `npm run dev`
- [ ] Sign in as a buyer and open a live approved listing with inventory > 0
- [ ] Add the item to cart from `/products/[id]` and confirm the cart badge updates
- [ ] Open `/cart`, click **Review order**, then continue from `/checkout`
- [ ] If the item uses calculated shipping, enter a full shipping address, fetch rates, and select one rate per seller
- [ ] Complete Stripe Checkout with test card `4242 4242 4242 4242`
- [ ] Confirm `/checkout/success` loads and `/orders` shows the new paid order
- [ ] Confirm the seller dashboard at `/seller` shows the new order/order-to-ship entry
- [ ] Confirm the purchased product inventory decreased in the seller dashboard
- [ ] If inventory reached 0, confirm the listing shows as sold/out of stock and is no longer active in marketplace results
- [ ] Confirm the order row in the database stores `platformFeeCents`, `sellerPayoutCents`, and order-item commission snapshot fields
- [ ] Confirm Stripe shows either direct destination charge payout data (single-seller cart) or transfer records (multi-seller cart)
- [ ] Confirm `/admin` updates Total Orders, Total Revenue, Platform Commission Earned, Items Sold, Gross Revenue This Week/Month, and Total Visitors (Last 12 Months)
- [ ] If checkout fails, confirm the buyer sees the new toast error and server logs include the `[checkout]`, `[checkout/cart]`, or `[webhook]` diagnostics
