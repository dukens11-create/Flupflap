import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Refund Policy' };

export default function RefundPage() {
  return (
    <main className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-black">Refund Policy</h1>
      <p className="text-slate-500 text-sm"><em>Last updated: {new Date().getFullYear()}</em></p>

      <section>
        <h2 className="text-xl font-bold mb-2">1. Overview</h2>
        <p className="text-slate-700">FlupFlap is a marketplace. Refund and return policies are primarily determined by individual sellers. This policy describes the platform-level minimum protections for buyers.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">2. Item Not Received</h2>
        <p className="text-slate-700">If you do not receive your item within 14 business days of the expected delivery date, contact the seller first. If unresolved within 3 days, open a dispute with FlupFlap support. We will investigate and may issue a full refund.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">3. Item Significantly Not as Described</h2>
        <p className="text-slate-700">If the item you receive is materially different from the listing description (e.g., wrong item, undisclosed major damage, counterfeit), you may request a return and refund within 7 days of delivery. You must provide photo evidence.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">4. Change of Mind</h2>
        <p className="text-slate-700">FlupFlap does not guarantee returns for change-of-mind purchases. Individual sellers may offer their own return policies, which will be noted on the listing if applicable.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">5. Refund Processing</h2>
        <p className="text-slate-700">Approved refunds are issued to your original payment method via Stripe. Processing times vary by bank but typically take 5–10 business days after approval.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">6. Digital Items</h2>
        <p className="text-slate-700">Sales of digital goods are generally final unless the item is not as described or cannot be delivered.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">7. Contact</h2>
        <p className="text-slate-700">To open a dispute or request a refund, email support@flupflap.com with your order number and a description of the issue.</p>
      </section>

      <p className="text-xs text-slate-400 border-t pt-4">This is a starter refund policy. Have an attorney review it before going live.</p>
    </main>
  );
}

