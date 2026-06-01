import type { Metadata } from 'next';
import DriverDashboardRealtime from '@/components/DriverDashboardRealtime';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Driver Dashboard',
  description: 'Realtime driver operations dashboard backed by Firebase Realtime Database.',
};

export default function DriverDashboardPage() {
  return <DriverDashboardRealtime />;
}
