import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Sign in',
  description: 'Sign in to your FlupFlap account to buy, sell, and manage your marketplace activity.',
  path: '/login',
  noIndex: true,
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
