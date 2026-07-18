import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, Star, Zap } from 'lucide-react';
import FoundingSellerPromo from '@/components/FoundingSellerPromo';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Founding Seller Program — Sell Free for 1 Year | FlupFlap',
  description:
    'Join FlupFlap as one of our first 1,000 Founding Sellers and receive your seller subscription FREE for 12 months. No credit card required.',
});

const FEATURES = [
  {
    icon: '🎉',
    title: 'Free for 1 Full Year',
    body: 'Your seller subscription is completely free for the first 12 months — no credit card required.',
  },
  {
    icon: '🏷️',
    title: '7% Selling Fee Only',
    body: 'FlupFlap charges a 7% fee only when you successfully sell an item. No listing fees, no monthly cost.',
  },
  {
    icon: '🔴',
    title: 'Go Live with Garage Sales',
    body: 'Host live garage sale events and reach local buyers in real time.',
  },
  {
    icon: '📦',
    title: 'Unlimited Listings',
    body: 'List as many products as you want with no per-listing charges during your founding year.',
  },
  {
    icon: '📊',
    title: 'Seller Dashboard',
    body: 'Manage orders, track earnings, and grow your shop from a dedicated seller workspace.',
  },
  {
    icon: '🏅',
    title: 'Founder Badge',
    body: 'Get recognized with a Founding Seller badge and your personal founder number displayed on your profile.',
  },
];

const PRICING_AFTER = [
  { plan: 'Garage Seller', price: '$3.99/month', description: 'Perfect for occasional sellers and garage-sale hosts.' },
  { plan: 'Regular Seller', price: '$4.99/month', description: 'For sellers looking to grow a full-time shop.' },
];

export default function FoundingSellerPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="mb-12 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-amber-600">
          Limited Time Offer
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
          🚀 FlupFlap Founding Seller Program
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Join FlupFlap Marketplace as one of our first{' '}
          <span className="font-semibold text-slate-900">1,000 Founding Sellers</span> and
          receive your seller subscription{' '}
          <span className="font-semibold text-slate-900">FREE for 12 months</span>.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          No credit card required · No subscription fees · Just sell
        </p>
      </section>

      {/* Promo widget */}
      <section className="mb-12 mx-auto max-w-md">
        <FoundingSellerPromo inlineEnroll />
      </section>

      {/* Features grid */}
      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold text-slate-900">What You Get as a Founding Seller</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <span className="text-2xl" role="img" aria-label={f.title}>
                {f.icon}
              </span>
              <h3 className="mt-2 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* After Year 1 pricing */}
      <section className="mb-12 rounded-[28px] border border-slate-200 bg-slate-50 p-6 sm:p-8">
        <h2 className="mb-1 text-xl font-bold text-slate-900">After Your Free Year</h2>
        <p className="mb-6 text-sm text-slate-600">
          Your paid subscription will{' '}
          <span className="font-semibold">not begin automatically</span> unless you choose
          to subscribe. You decide when you&apos;re ready to continue.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRICING_AFTER.map((p) => (
            <div
              key={p.plan}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {p.plan}
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900">{p.price}</p>
              <p className="mt-1 text-sm text-slate-600">{p.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ / details */}
      <section className="mb-12 space-y-6">
        <h2 className="text-2xl font-bold text-slate-900">Program Details</h2>

        <div className="space-y-4">
          {[
            {
              q: 'How do I enroll?',
              a: `Click "Become a Founding Seller" above. You'll need a FlupFlap account — signing up takes less than a minute.`,
            },
            {
              q: 'Is there a credit card required?',
              a: 'No. Your founding year is completely free. We will never charge you without your explicit consent.',
            },
            {
              q: 'What is the 7% selling fee?',
              a: 'FlupFlap charges 7% of the final sale price only when a buyer completes a purchase. There are no listing fees, no subscription fees during your founding year.',
            },
            {
              q: 'What happens after 1 year?',
              a: 'You choose whether to subscribe to a Garage Seller ($3.99/mo) or Regular Seller ($4.99/mo) plan. Your subscription does not renew automatically.',
            },
            {
              q: 'What is a founding seller number?',
              a: 'Every founding seller receives a unique sequential number (e.g., Founder #42 out of 1,000) displayed on your seller profile as a badge of honor.',
            },
            {
              q: 'What if all 1,000 spots are taken?',
              a: 'The program closes once 1,000 sellers have enrolled. Sign up early to guarantee your spot.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-900">{q}</h3>
              <p className="mt-1 text-sm text-slate-600">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="text-center">
        <p className="text-lg font-bold text-slate-900">
          JOIN FREE. LIST YOUR PRODUCTS. GO LIVE. START SELLING.
        </p>
        <p className="mt-1 text-sm text-slate-500">Limited to the first 1,000 founding sellers.</p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="btn-brand inline-flex items-center gap-2"
          >
            <Zap size={16} aria-hidden="true" />
            Create Your Free Account
          </Link>
          <Link href="/" className="text-sm text-slate-600 underline underline-offset-2">
            Browse the Marketplace
          </Link>
        </div>
      </section>
    </main>
  );
}
