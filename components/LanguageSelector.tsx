"use client";

import { useRouter } from 'next/navigation';
import { SUPPORTED_LOCALES } from '@/lib/i18n/shared';
import { useI18n } from '@/components/I18nProvider';

const LANGUAGE_LABELS = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
} as const;

export default function LanguageSelector() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="flex items-center gap-1 text-xs text-slate-500">
      <span className="hidden sm:inline">{t('nav.language')}:</span>
      <select
        className="border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-700"
        aria-label={t('nav.language')}
        value={locale}
        onChange={(event) => {
          setLocale(event.target.value as (typeof SUPPORTED_LOCALES)[number]);
          router.refresh();
        }}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
