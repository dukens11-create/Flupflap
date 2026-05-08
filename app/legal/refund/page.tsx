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
        <h2 className="text-xl font-bold mb-2">2. Return windows</h2>
        <p className="text-slate-700">Each listing now shows whether the seller accepts routine returns and, if so, the number of days in that return window. The window begins when an order is marked delivered or picked up. If a seller does not offer routine returns, buyers still keep platform protection for item-not-received and item-condition issues.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">3. Refund process</h2>
        <p className="text-slate-700">Buyers can open a return, refund, or dispute request directly from the order details page. Sellers review new cases first and can either approve the refund or send the case to FlupFlap for review. Approved refunds are returned to the original payment method.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">4. Dispute center</h2>
        <p className="text-slate-700">Buyers and sellers can track cases in the Dispute Center. Buyers see request status, seller responses, and final platform decisions. Sellers manage order issues from the same shared queue, and admins review escalated cases in the admin dispute center.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">5. Evidence upload</h2>
        <p className="text-slate-700">When a dispute needs proof, buyers can upload image evidence such as damage photos, wrong-item photos, or packaging issues. We currently accept common image formats up to 10 MB each and show uploaded evidence inside the dispute thread for seller and admin review.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">6. Item not received</h2>
        <p className="text-slate-700">If you do not receive your item within 14 business days of the expected delivery date, contact the seller first. If unresolved, open a dispute from your order page. FlupFlap may review the case and approve a refund.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">7. Item significantly not as described</h2>
        <p className="text-slate-700">If the item you receive is materially different from the listing description, you may request a return or refund within the seller&apos;s posted return window. Photo evidence is strongly recommended and may be required for a final decision.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">8. Contact</h2>
        <p className="text-slate-700">If you cannot access the in-app dispute tools, email support@flupflap.com with your order number and a description of the issue.</p>
      </section>

      <p className="text-xs text-slate-400 border-t pt-4">This is a starter refund policy. Have an attorney review it before going live.</p>
    </main>
  );
}
