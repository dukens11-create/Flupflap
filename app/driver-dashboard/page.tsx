import type { Metadata } from 'next';
import DriverDashboardExperience from '@/components/DriverDashboardExperience';

export const metadata: Metadata = {
  title: 'Driver Dashboard',
  description: 'Real-time driver ride request dashboard with queue management and notifications.',
};

export const dynamic = 'force-dynamic';

export default function DriverDashboardPage() {
  return <DriverDashboardExperience />;
}
