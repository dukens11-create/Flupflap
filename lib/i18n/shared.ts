import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

export const SUPPORTED_LOCALES = ['en', 'es', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE_KEY = 'flupflap_locale';
export const LOCALE_STORAGE_KEY = 'flupflap_locale';

type TranslationDict = typeof en;

const DICTIONARIES: Record<Locale, TranslationDict> = { en, es, fr };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const code = value.toLowerCase().split('-')[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(code)
    ? (code as Locale)
    : DEFAULT_LOCALE;
}

export function getDictionary(locale: Locale): TranslationDict {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dictionary = getDictionary(locale);
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (!isRecord(acc)) return undefined;
    return acc[part];
  }, dictionary);

  const base = typeof value === 'string' ? value : key;
  if (!vars) return base;

  return Object.entries(vars).reduce(
    (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
    base,
  );
}
