'use client';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');

  const [changingPassword, setChangingPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  if (status === 'loading') {
    return (
      <main className="max-w-md mx-auto">
        <div className="card p-8 animate-pulse bg-slate-100 rounded-2xl h-64" />
      </main>
    );
  }

  if (!session?.user) {
    router.push('/login');
    return null;
  }

  const { email, role, stripeOnboardingComplete } = session.user;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError('');
    setNameSuccess('');
    setNameLoading(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.error || 'Update failed.');
      } else {
        // Refresh session to pick up the new name from the server
        await update();
        setNameSuccess('Name updated!');
        setEditingName(false);
        router.refresh();
      }
    } catch {
      setNameError('Network error. Please try again.');
    }
    setNameLoading(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || 'Password change failed.');
      } else {
        setPwSuccess('Password updated successfully.');
        setChangingPassword(false);
        setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      }
    } catch {
      setPwError('Network error. Please try again.');
    }
    setPwLoading(false);
  }

  return (
    <main className="max-w-md mx-auto">
      <h1 className="text-3xl font-black mb-6">My Account</h1>

      <div className="card p-6 space-y-5 mb-6">
        {/* Name */}
        <div>
          <p className="label">Name</p>
          {editingName ? (
            <form onSubmit={saveName} className="flex gap-2 mt-1">
              <input
                className="input flex-1"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                minLength={1}
                maxLength={100}
                autoFocus
              />
              <button className="btn-primary text-sm" disabled={nameLoading}>
                {nameLoading ? '…' : 'Save'}
              </button>
              <button type="button" className="btn-outline text-sm" onClick={() => setEditingName(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium">{session.user.name}</p>
              <button
                onClick={() => { setName(session.user.name ?? ''); setEditingName(true); setNameError(''); setNameSuccess(''); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Edit
              </button>
            </div>
          )}
          {nameError && <p className="text-red-600 text-xs mt-1">{nameError}</p>}
          {nameSuccess && <p className="text-green-600 text-xs mt-1">{nameSuccess}</p>}
        </div>

        {/* Email */}
        <div>
          <p className="label">Email</p>
          <p className="font-medium">{email}</p>
        </div>

        {/* Role */}
        <div>
          <p className="label">Role</p>
          <p className="font-medium capitalize">{role?.toLowerCase()}</p>
        </div>

        {/* Stripe (sellers) */}
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

        {/* Password change */}
        <div>
          <p className="label">Password</p>
          {changingPassword ? (
            <form onSubmit={savePassword} className="space-y-2 mt-1">
              <input
                type="password"
                className="input"
                placeholder="Current password"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                required
                autoFocus
              />
              <input
                type="password"
                className="input"
                placeholder="New password (min 8 chars)"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                required
                minLength={8}
              />
              <input
                type="password"
                className="input"
                placeholder="Confirm new password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                required
                minLength={8}
              />
              {pwError && <p className="text-red-600 text-xs">{pwError}</p>}
              <div className="flex gap-2">
                <button className="btn-primary text-sm" disabled={pwLoading}>
                  {pwLoading ? 'Saving…' : 'Change password'}
                </button>
                <button type="button" className="btn-outline text-sm" onClick={() => { setChangingPassword(false); setPwError(''); }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-500">••••••••</p>
              <button
                onClick={() => { setChangingPassword(true); setPwSuccess(''); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Change
              </button>
            </div>
          )}
          {pwSuccess && <p className="text-green-600 text-xs mt-1">{pwSuccess}</p>}
        </div>
      </div>

      <div className="space-y-3">
        {role === 'SELLER' && (
          <Link href="/seller" className="btn-primary block text-center">Seller Dashboard</Link>
        )}
        {role === 'ADMIN' && (
          <Link href="/admin" className="btn-dark block text-center">Admin Dashboard</Link>
        )}
        <Link href="/orders" className="btn-outline block text-center">My Orders</Link>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="w-full text-center text-sm text-slate-500 hover:text-red-600 py-2"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
