import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Checkout',
  description: 'Complete your FlupFlap order with secure checkout and optional local pickup.',
  path: '/checkout',
  noIndex: true,
});

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
