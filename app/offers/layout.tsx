import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Offers',
  description: 'Review and manage your sent and received marketplace offers on FlupFlap.',
  path: '/offers',
  noIndex: true,
});

export default function OffersLayout({ children }: { children: ReactNode }) {
  return children;
}
