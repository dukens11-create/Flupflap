"use client";
import { SessionProvider } from 'next-auth/react';
import { I18nProvider } from '@/components/I18nProvider';
import type { Locale } from '@/lib/i18n/shared';

export default function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  return (
    <SessionProvider>
      <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
    </SessionProvider>
  );
}
