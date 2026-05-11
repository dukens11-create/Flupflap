import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Create account',
  description: 'Create a FlupFlap account to start buying and selling in a safer low-fee marketplace.',
  path: '/signup',
  noIndex: true,
});

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
