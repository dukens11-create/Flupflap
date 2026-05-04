"use client";
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Something went wrong.');
      }
    } catch {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">Forgot password</h1>

      {submitted ? (
        <div className="card p-6 mt-6 space-y-4 text-center">
          <p className="text-4xl">📧</p>
          <p className="font-semibold">Check your email</p>
          <p className="text-sm text-slate-500">
            If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link.
            Check your inbox (and spam folder).
          </p>
          <p className="text-xs text-slate-400 border-t pt-3">
            Note: Email delivery requires configuration in production.
            If you don&apos;t receive an email, ask an administrator for assistance.
          </p>
          <Link href="/login" className="btn-outline block">Back to sign in</Link>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className="card p-6 mt-6 space-y-4">
            <p className="text-sm text-slate-500">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <p className="text-center text-sm text-slate-500 mt-4">
            Remember your password?{' '}
            <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
          </p>
        </>
      )}
    </main>
  );
}
