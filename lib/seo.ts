import type { Metadata } from 'next';

const FALLBACK_SITE_URL = 'https://www.flupflap.com';
const FALLBACK_DEV_SITE_URL = 'http://localhost:3000';
export const BRAND_LOGO_PATH = '/flupflap_logo_brand.png';
export const MARKETPLACE_CURRENCY = process.env.NEXT_PUBLIC_MARKETPLACE_CURRENCY ?? 'USD';

export const DEFAULT_SEO_DESCRIPTION =
  'Buy and sell everyday items on FlupFlap with verified sellers, low fees, and secure checkout.';

function getDefaultSiteUrl() {
  return process.env.NODE_ENV === 'production' ? FALLBACK_SITE_URL : FALLBACK_DEV_SITE_URL;
}

export function getSiteUrl(): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? getDefaultSiteUrl();
  const normalized = configuredUrl.startsWith('http://') || configuredUrl.startsWith('https://')
    ? configuredUrl
    : `https://${configuredUrl}`;

  try {
    return new URL(normalized);
  } catch {
    return new URL(getDefaultSiteUrl());
  }
}

export function absoluteUrl(path = '/'): string {
  return new URL(path, getSiteUrl()).toString();
}

type MetadataOptions = {
  title: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
};

export function createPageMetadata({
  title,
  description = DEFAULT_SEO_DESCRIPTION,
  path,
  noIndex = false,
}: MetadataOptions): Metadata {
  const canonicalPath = noIndex ? undefined : path;

  return {
    title,
    description,
    alternates: canonicalPath ? { canonical: canonicalPath } : undefined,
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: 'website',
      siteName: 'FlupFlap',
      images: [{ url: BRAND_LOGO_PATH }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [BRAND_LOGO_PATH],
    },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
  };
}
