import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: { default: 'FlupFlap Marketplace', template: '%s | FlupFlap' },
  description: 'Buy and sell new & used items on FlupFlap Marketplace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        <Providers>
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
          <footer className="mt-16 border-t border-slate-200 bg-white text-sm text-slate-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-wrap gap-4">
              <span className="font-bold text-slate-700">FlupFlap</span>
              <a href="/legal/terms" className="hover:underline">Terms</a>
              <a href="/legal/privacy" className="hover:underline">Privacy</a>
              <a href="/legal/seller-agreement" className="hover:underline">Seller Agreement</a>
              <a href="/legal/refund" className="hover:underline">Refund Policy</a>
              <span className="ml-auto">© {new Date().getFullYear()} FlupFlap</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
