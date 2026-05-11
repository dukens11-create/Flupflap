import type { Metadata } from 'next';

const FALLBACK_SITE_URL = 'https://www.flupflap.com';

export const DEFAULT_SEO_DESCRIPTION =
  'Buy and sell everyday items on FlupFlap with verified sellers, low fees, and secure checkout.';

export function getSiteUrl(): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? FALLBACK_SITE_URL;
  const normalized = configuredUrl.startsWith('http://') || configuredUrl.startsWith('https://')
    ? configuredUrl
    : `https://${configuredUrl}`;

  try {
    return new URL(normalized);
  } catch {
    return new URL(FALLBACK_SITE_URL);
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
  return {
    title,
    description,
    alternates: path ? { canonical: path } : undefined,
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
      siteName: 'FlupFlap',
      images: [{ url: '/flupflap_logo_brand.png' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/flupflap_logo_brand.png'],
    },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
  };
}
