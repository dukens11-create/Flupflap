import type { Metadata, Viewport } from 'next';
import './globals.css';
import Image from 'next/image';
import Link from 'next/link';
import Providers from '@/components/Providers';
import Navbar from '@/components/Navbar';
import { getServerTranslations } from '@/lib/i18n/server';
import VisitorTracker from '@/components/VisitorTracker';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import { absoluteUrl, BRAND_LOGO_PATH, DEFAULT_SEO_DESCRIPTION, getSiteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: 'FlupFlap Marketplace', template: '%s | FlupFlap' },
  description: DEFAULT_SEO_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'FlupFlap',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/icons/flupflap_pwa_icon_logo.png',
    icon: [
      { url: '/icons/flupflap_pwa_icon_logo.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': 'FlupFlap',
  },
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-video-preview': -1,
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: 'FlupFlap Marketplace',
    description: DEFAULT_SEO_DESCRIPTION,
    url: '/',
    siteName: 'FlupFlap',
    type: 'website',
    images: [{ url: BRAND_LOGO_PATH }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlupFlap Marketplace',
    description: DEFAULT_SEO_DESCRIPTION,
    images: [BRAND_LOGO_PATH],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B2341',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getServerTranslations();
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FlupFlap',
    url: absoluteUrl('/'),
    logo: absoluteUrl(BRAND_LOGO_PATH),
  };

  return (
    <html lang={locale}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Providers initialLocale={locale}>
          <VisitorTracker />
          <ServiceWorkerRegistration />
          <PwaInstallPrompt />
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <div className="w-full flex-1">
              <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </div>
            <footer className="mt-16 border-t border-slate-200 bg-white text-sm text-slate-500">
              <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.5fr_repeat(3,minmax(0,1fr))] lg:px-8">
                <div className="space-y-4">
                  <Link href="/" className="flex items-center">
                    <Image
                      src="/flupflap_logo_brand.png"
                      alt="FlupFlap"
                      width={614}
                      height={255}
                      className="h-14 w-auto"
                    />
                  </Link>
                  <p className="max-w-sm text-sm leading-6 text-slate-500">{t('footer.description')}</p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{t('home.trustBadges.verifiedSellers.title')}</span>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">{t('home.trustBadges.securePayments.title')}</span>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900">{t('footer.marketplace')}</p>
                  <div className="mt-4 space-y-3">
                    <Link href="/" className="block link-hover-navy">{t('nav.browse')}</Link>
                    <Link href="/cart" className="block link-hover-navy">{t('footer.cart')}</Link>
                    <Link href="/orders" className="block link-hover-navy">{t('footer.orders')}</Link>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900">{t('footer.sell')}</p>
                  <div className="mt-4 space-y-3">
                    <Link href="/signup" className="block link-hover-navy">{t('home.startSelling')}</Link>
                    <Link href="/seller/listings/new" className="block link-hover-navy">{t('nav.listItem')}</Link>
                    <Link href="/messages" className="block link-hover-navy">{t('nav.messages')}</Link>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900">{t('footer.support')}</p>
                  <div className="mt-4 space-y-3">
                    <Link href="/legal/terms" className="block link-hover-navy">{t('footer.terms')}</Link>
                    <Link href="/legal/privacy" className="block link-hover-navy">{t('footer.privacy')}</Link>
                    <Link href="/legal/seller-agreement" className="block link-hover-navy">{t('footer.sellerAgreement')}</Link>
                    <Link href="/legal/refund" className="block link-hover-navy">{t('footer.refundPolicy')}</Link>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
                  <span>© {new Date().getFullYear()} FlupFlap</span>
                  <span>{t('footer.tagline')}</span>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
