"use client";
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get('email') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!email || !token) {
    return (
      <div className="card p-6 mt-6 text-center space-y-4">
        <p className="text-4xl">⚠️</p>
        <p className="font-semibold">Invalid reset link</p>
        <p className="text-sm text-slate-500">
          This password reset link is missing required information. Please request a new one.
        </p>
        <Link href="/forgot-password" className="btn-primary block">Request new link</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push('/login'), 3000);
      } else {
        setError(data.error || 'Password reset failed.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="card p-6 mt-6 text-center space-y-4">
        <p className="text-4xl">✅</p>
        <p className="font-semibold">Password reset!</p>
        <p className="text-sm text-slate-500">
          Your password has been updated. Redirecting you to sign in…
        </p>
        <Link href="/login" className="btn-primary block">Sign in now</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6 mt-6 space-y-4">
      <p className="text-sm text-slate-500">
        Resetting password for <strong>{email}</strong>.
      </p>
      <div>
        <label className="label">New password</label>
        <input
          type={showPasswords ? 'text' : 'password'}
          className="input"
          placeholder="Minimum 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input
          type={showPasswords ? 'text' : 'password'}
          className="input"
          placeholder="Repeat your new password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <label className="inline-flex items-center gap-2 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={showPasswords}
          onChange={(e) => setShowPasswords(e.target.checked)}
          aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
        />
        {showPasswords ? 'Hide passwords' : 'Show passwords'}
      </label>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button className="btn-primary w-full" disabled={loading}>
        {loading ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">Reset password</h1>
      <Suspense fallback={<div className="card p-6 mt-6 h-48 animate-pulse bg-slate-100 rounded-2xl" />}>
        <ResetForm />
      </Suspense>
      <p className="text-center text-sm text-slate-500 mt-4">
        <Link href="/login" className="text-blue-600 hover:underline">Back to sign in</Link>
      </p>
    </main>
  );
}
