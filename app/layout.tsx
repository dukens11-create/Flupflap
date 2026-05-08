import type { Metadata } from 'next';
import './globals.css';
import Image from 'next/image';
import Link from 'next/link';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';
import { getServerTranslations } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: { default: 'FlupFlap Marketplace', template: '%s | FlupFlap' },
  description: 'A safer marketplace with low fees, verified sellers, and a simpler way to buy and sell everyday items.',
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
          <footer className="mt-16 border-t border-slate-200 bg-white text-sm text-slate-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-wrap items-center gap-4">
              <Link href="/" className="flex items-center" aria-label="FlupFlap home">
                <Image
                  src="/flupflap_logo_brand.png"
                  alt="FlupFlap"
                  width={614}
                  height={255}
                  className="h-14 w-auto"
                />
              </Link>
              <a href="/legal/terms" className="hover:underline">{t('footer.terms')}</a>
              <a href="/legal/privacy" className="hover:underline">{t('footer.privacy')}</a>
              <a href="/legal/seller-agreement" className="hover:underline">{t('footer.sellerAgreement')}</a>
              <a href="/legal/refund" className="hover:underline">{t('footer.refundPolicy')}</a>
              <span className="ml-auto">© {new Date().getFullYear()} FlupFlap</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
