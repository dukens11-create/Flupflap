import type { Metadata } from 'next';
import DriverVerificationWizard from '@/components/DriverVerificationWizard';

export const metadata: Metadata = {
  title: 'Driver Verification',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function DriverVerificationPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <DriverVerificationWizard />
    </main>
  );
}
