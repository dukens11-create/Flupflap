import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DriverDashboardHtmlAliasPage() {
  redirect('/driver-dashboard');
}
