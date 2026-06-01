import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Driver Dashboard | FlupFlap',
  description: 'Driver mode – accept and manage ride requests.',
};

export default function DriverDashboardLayout({ children }: { children: React.ReactNode }) {
  // Intentionally omits the main site Navbar and footer so the driver dashboard
  // is a focused, full-screen experience.
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {children}
    </div>
  );
}
