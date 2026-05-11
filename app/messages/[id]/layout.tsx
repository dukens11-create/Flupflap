import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Conversation',
  description: 'Securely message buyers and sellers on FlupFlap.',
  noIndex: true,
});

export default function ConversationLayout({ children }: { children: ReactNode }) {
  return children;
}
