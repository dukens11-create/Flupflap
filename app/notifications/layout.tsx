import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Notifications',
  description: 'See your latest FlupFlap notifications for offers, orders, messages, and shipping updates.',
  path: '/notifications',
  noIndex: true,
});

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return children;
}
