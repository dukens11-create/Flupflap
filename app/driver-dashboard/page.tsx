import type { Metadata } from 'next';
import DriverNavigationMode from '@/components/driver/DriverNavigationMode';

export const metadata: Metadata = {
  title: 'Driver Navigation',
  robots: { index: false, follow: false },
};

export default function DriverDashboardPage() {
  return <DriverNavigationMode />;
}
