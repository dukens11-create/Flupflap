import DriverDashboardClient from './DriverDashboardClient';

export default function DriverDashboardPage() {
  return <DriverDashboardClient mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''} />;
}
