import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Page Not Found' };

export default function NotFound() {
  return (
    <main className="max-w-md mx-auto text-center py-20">
      <p className="text-6xl mb-4">🔍</p>
      <h1 className="text-3xl font-black mb-2">Page not found</h1>
      <p className="text-slate-500 mb-8">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/" className="btn-primary">Go to marketplace</Link>
        <Link href="/cart" className="btn-outline">View your cart</Link>
      </div>
    </main>
  );
}
