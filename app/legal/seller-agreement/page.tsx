import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Seller Agreement' };

export default function SellerAgreementPage() {
  return (
    <main className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-black">Seller Agreement</h1>
      <p className="text-slate-500 text-sm"><em>Last updated: {new Date().getFullYear()}</em></p>
      <p className="text-slate-700">This Seller Agreement governs your use of FlupFlap as a seller. By activating a seller account, you agree to these terms in addition to our <a href="/legal/terms" className="text-blue-600 hover:underline">Terms of Service</a>.</p>

      <section>
        <h2 className="text-xl font-bold mb-2">1. Eligibility</h2>
        <p className="text-slate-700">You must be at least 18 years old and legally authorized to sell the items you list. You are responsible for obtaining all necessary licenses or permits for your products.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">2. Listing Requirements</h2>
        <ul className="list-disc pl-6 text-slate-700 space-y-1">
          <li>Listings must accurately describe the item, its condition, and any defects.</li>
          <li>Photos and image URLs must represent the actual item being sold.</li>
          <li>Prices must be in USD and include any mandatory fees.</li>
          <li>Prohibited items (illegal goods, counterfeit items, stolen property) may not be listed.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">3. Fulfillment Obligations</h2>
        <p className="text-slate-700">Upon a completed purchase, you must ship the item within your stated handling time (default: 3 business days). You must provide a valid tracking number once shipped. Failure to fulfill may result in order cancellation and account suspension.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">4. Fees and Payouts</h2>
        <p className="text-slate-700">FlupFlap deducts a 7% platform commission from each sale. That commission is stored on the paid order item alongside the seller net amount, and payouts are processed via Stripe Connect to your connected bank account. You must complete Stripe onboarding before receiving payouts.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">5. Returns and Refunds</h2>
        <p className="text-slate-700">You must honor our <a href="/legal/refund" className="text-blue-600 hover:underline">Refund Policy</a>. If a buyer files a dispute that is upheld, the payout may be reversed.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">6. Account Suspension</h2>
        <p className="text-slate-700">FlupFlap reserves the right to suspend or permanently ban seller accounts for policy violations, excessive disputes, fraudulent activity, or any other reason at our sole discretion.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">7. Taxes</h2>
        <p className="text-slate-700">You are responsible for reporting and paying all applicable taxes on your sales. FlupFlap may issue 1099-K forms as required by law for qualifying sellers.</p>
      </section>

      <p className="text-xs text-slate-400 border-t pt-4">This is a starter seller agreement. Have an attorney review it before going live.</p>
    </main>
  );
}
