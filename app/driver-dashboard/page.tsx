import type { Metadata } from 'next';
import DriverDashboardExperience from '@/components/DriverDashboardExperience';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Driver Dashboard',
  description: 'Modern mobile-first driver dashboard experience.',
};

export default function DriverDashboardPage() {
  return <DriverDashboardExperience />;
}
