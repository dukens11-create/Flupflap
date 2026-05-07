"use client";

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALE_COOKIE_KEY, LOCALE_STORAGE_KEY, Locale, normalizeLocale, translate } from '@/lib/i18n/shared';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const persisted = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
      if (persisted !== locale) setLocaleState(persisted);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore storage errors
    }
    document.cookie = `${LOCALE_COOKIE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale: Locale) => setLocaleState(normalizeLocale(nextLocale)),
      t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
