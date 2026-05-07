import Link from 'next/link';
import type { Metadata } from 'next';
import { getServerTranslations } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Page Not Found' };

export default async function NotFound() {
  const { t } = await getServerTranslations();
  return (
    <main className="max-w-md mx-auto text-center py-20">
      <p className="text-6xl mb-4">🔍</p>
      <h1 className="text-3xl font-black mb-2">{t('notFound.title')}</h1>
      <p className="text-slate-500 mb-8">
        {t('notFound.description')}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/" className="btn-primary">{t('notFound.goMarketplace')}</Link>
        <Link href="/cart" className="btn-outline">{t('notFound.viewCart')}</Link>
      </div>
    </main>
  );
}
