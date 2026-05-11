import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Account settings',
  description: 'Manage your FlupFlap account settings, security, payouts, and profile details.',
  path: '/account',
  noIndex: true,
});

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
