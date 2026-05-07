import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-black">Terms of Service</h1>
      <p className="text-slate-500 text-sm"><em>Last updated: {new Date().getFullYear()}</em></p>

      <section>
        <h2 className="text-xl font-bold mb-2">1. Acceptance of Terms</h2>
        <p className="text-slate-700">By accessing or using FlupFlap (&quot;the platform&quot;), you agree to these Terms of Service. If you do not agree, do not use the platform.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">2. Platform Role</h2>
        <p className="text-slate-700">FlupFlap is a marketplace connecting buyers and sellers. We are not a party to transactions between buyers and sellers and do not take title to any products listed on the platform.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">3. Accounts</h2>
        <p className="text-slate-700">You must provide accurate information when creating an account. You are responsible for maintaining the security of your credentials. You may not use another person&apos;s account without authorization.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">4. Prohibited Items</h2>
        <p className="text-slate-700">You may not list items that are illegal, counterfeit, stolen, hazardous, or that violate intellectual property rights. FlupFlap reserves the right to remove any listing at its discretion.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">5. Fees and Commission</h2>
        <p className="text-slate-700">FlupFlap charges a 6% platform commission on each completed sale. This fee is deducted from the seller payout and stored with paid order items for audit and payout reporting.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">6. Payments</h2>
        <p className="text-slate-700">All payments are processed through Stripe. By making a purchase you agree to Stripe&apos;s Terms of Service. FlupFlap does not store full payment card details.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">7. Refunds and Disputes</h2>
        <p className="text-slate-700">Please refer to our <a href="/legal/refund" className="text-blue-600 hover:underline">Refund Policy</a>. Disputes between buyers and sellers should first be resolved directly. FlupFlap may intervene at its discretion.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">8. Limitation of Liability</h2>
        <p className="text-slate-700">FlupFlap is provided &quot;as is&quot; without warranties of any kind. To the fullest extent permitted by law, FlupFlap shall not be liable for any indirect, incidental, or consequential damages.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">9. Changes</h2>
        <p className="text-slate-700">We may update these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">10. Contact</h2>
        <p className="text-slate-700">For questions, contact us at legal@flupflap.com.</p>
      </section>

      <p className="text-xs text-slate-400 border-t pt-4">This is a starter legal page. Have an attorney review it before going live.</p>
    </main>
  );
}
