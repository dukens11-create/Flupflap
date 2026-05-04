import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-black">Privacy Policy</h1>
      <p className="text-slate-500 text-sm"><em>Last updated: {new Date().getFullYear()}</em></p>

      <section>
        <h2 className="text-xl font-bold mb-2">1. Information We Collect</h2>
        <p className="text-slate-700">We collect information you provide when you create an account (name, email, password hash), when you list or purchase products, and when you communicate with us. We also collect usage data such as IP addresses, browser type, and pages visited.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">2. How We Use Your Information</h2>
        <ul className="list-disc pl-6 text-slate-700 space-y-1">
          <li>To operate and improve the platform</li>
          <li>To process transactions and send related communications</li>
          <li>To verify seller identity through Stripe Connect</li>
          <li>To comply with legal obligations</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">3. Sharing Your Information</h2>
        <p className="text-slate-700">We share your information with Stripe (payment processing and seller payouts) and other service providers necessary to operate FlupFlap. We do not sell your personal information to third parties.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">4. Cookies</h2>
        <p className="text-slate-700">We use cookies for session management (NextAuth) and to remember your preferences. You can disable cookies in your browser settings, but some features may not work correctly.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">5. Data Retention</h2>
        <p className="text-slate-700">We retain your account data for as long as your account is active or as required by law. You may request deletion of your account by contacting us.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">6. Security</h2>
        <p className="text-slate-700">We use industry-standard practices to protect your data, including bcrypt password hashing and HTTPS. No system is 100% secure; use a strong, unique password.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">7. Your Rights</h2>
        <p className="text-slate-700">Depending on your jurisdiction, you may have rights to access, correct, delete, or port your personal data. Contact us at privacy@flupflap.com to exercise these rights.</p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-2">8. Changes</h2>
        <p className="text-slate-700">We may update this policy. We will notify you of material changes via email or a notice on the platform.</p>
      </section>

      <p className="text-xs text-slate-400 border-t pt-4">This is a starter privacy policy. Have an attorney review it before going live.</p>
    </main>
  );
}

