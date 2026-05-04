import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'My Account' };

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const { name, email, role, stripeOnboardingComplete } = session.user;

  return (
    <main className="max-w-md mx-auto">
      <h1 className="text-3xl font-black mb-6">My Account</h1>
      <div className="card p-6 space-y-4">
        <div>
          <p className="label">Name</p>
          <p className="font-medium">{name}</p>
        </div>
        <div>
          <p className="label">Email</p>
          <p className="font-medium">{email}</p>
        </div>
        <div>
          <p className="label">Role</p>
          <p className="font-medium capitalize">{role?.toLowerCase()}</p>
        </div>
        {role === 'SELLER' && (
          <div>
            <p className="label">Stripe Payouts</p>
            <p className="font-medium">
              {stripeOnboardingComplete ? (
                <span className="badge-green badge">Connected</span>
              ) : (
                <a href="/api/stripe/connect" className="text-blue-600 hover:underline">Connect Stripe →</a>
              )}
            </p>
          </div>
        )}
        {role === 'SELLER' && (
          <a href="/seller" className="btn-primary block text-center">Seller Dashboard</a>
        )}
        {role === 'ADMIN' && (
          <a href="/admin" className="btn-dark block text-center">Admin Dashboard</a>
        )}
        <a href="/orders" className="btn-outline block text-center">My Orders</a>
      </div>
    </main>
  );
}
