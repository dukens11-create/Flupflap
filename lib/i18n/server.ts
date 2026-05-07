import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, Locale, LOCALE_COOKIE_KEY, normalizeLocale, translate } from '@/lib/i18n/shared';

export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE_KEY)?.value ?? DEFAULT_LOCALE);
}

export async function getServerTranslations() {
  const locale = await getServerLocale();
  return {
    locale,
    t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
  };
}
