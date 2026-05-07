import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';
import { getServerTranslations } from '@/lib/i18n/server';
import FlupFlapLogo from '@/components/FlupFlapLogo';

export const metadata: Metadata = {
  title: { default: 'FlupFlap Marketplace', template: '%s | FlupFlap' },
  description: 'Buy and sell new & used items on FlupFlap Marketplace.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getServerTranslations();
  return (
    <html lang={locale}>
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        <Providers initialLocale={locale}>
          <Navbar />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>

          {/* Footer */}
          <footer className="mt-16 bg-slate-900 text-slate-300">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

              {/* Top row: logo + columns */}
              <div className="flex flex-col md:flex-row gap-10 mb-10 pb-10 border-b border-slate-700">

                {/* Brand block */}
                <div className="md:w-56 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-3">
                    <FlupFlapLogo size="sm" dark />
                    <span className="text-slate-400 font-semibold text-sm">Marketplace</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    The Smarter Way to Buy and Sell
                  </p>
                </div>

                {/* Link columns */}
                <div className="flex flex-wrap gap-8 flex-1">
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-3">Shop</h3>
                    <ul className="space-y-2 text-sm">
                      <li><a href="/" className="hover:text-white transition-colors">Browse All</a></li>
                      <li><a href="/?category=Electronics" className="hover:text-white transition-colors">Electronics</a></li>
                      <li><a href="/?category=Clothing" className="hover:text-white transition-colors">Clothing</a></li>
                      <li><a href="/?category=Furniture" className="hover:text-white transition-colors">Furniture</a></li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-3">Sell</h3>
                    <ul className="space-y-2 text-sm">
                      <li><a href="/seller/new" className="hover:text-white transition-colors">List an Item</a></li>
                      <li><a href="/seller" className="hover:text-white transition-colors">Seller Dashboard</a></li>
                      <li><a href="/legal/seller-agreement" className="hover:text-white transition-colors">{t('footer.sellerAgreement')}</a></li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-3">Support</h3>
                    <ul className="space-y-2 text-sm">
                      <li><a href="/legal/refund" className="hover:text-white transition-colors">{t('footer.refundPolicy')}</a></li>
                      <li><a href="/legal/terms" className="hover:text-white transition-colors">{t('footer.terms')}</a></li>
                      <li><a href="/legal/privacy" className="hover:text-white transition-colors">{t('footer.privacy')}</a></li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm mb-3">Company</h3>
                    <ul className="space-y-2 text-sm">
                      <li><a href="/" className="hover:text-white transition-colors">About Us</a></li>
                      <li><a href="/signup" className="hover:text-white transition-colors">Get Started</a></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Bottom row */}
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
                <span>© {new Date().getFullYear()} FlupFlap. All rights reserved.</span>
                <div className="flex flex-wrap gap-4">
                  <a href="/legal/terms" className="hover:text-slate-300 transition-colors">{t('footer.terms')}</a>
                  <a href="/legal/privacy" className="hover:text-slate-300 transition-colors">{t('footer.privacy')}</a>
                  <a href="/legal/refund" className="hover:text-slate-300 transition-colors">Returns</a>
                  <a href="/#products" className="hover:text-slate-300 transition-colors">Sitemap</a>
                </div>
              </div>
            </div>
          </footer>

        </Providers>
      </body>
    </html>
  );
}
