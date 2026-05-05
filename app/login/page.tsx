"use client";
import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Two-step seller flow
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [maskedPhone, setMaskedPhone] = useState('');
  // Hold credentials for the second step
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');

  /** Step 1 — validate credentials; send OTP to sellers. */
  async function submitCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = form.get('email') as string;
    const password = form.get('password') as string;

    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Invalid email or password.');
      return;
    }

    if (data.step === 'otp') {
      // Seller: show OTP form
      setPendingEmail(email);
      setPendingPassword(password);
      setMaskedPhone(data.maskedPhone ?? '');
      setStep('otp');
    } else {
      // Non-seller: sign in directly
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Invalid email or password.');
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    }
  }

  /** Step 2 — submit OTP code; complete the seller sign-in. */
  async function submitOtp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const otp = form.get('otp') as string;

    const result = await signIn('credentials', {
      email: pendingEmail,
      password: pendingPassword,
      otp,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid or expired code. Please try again.');
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  /** Allow the seller to request a fresh code. */
  async function resendOtp() {
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, password: pendingPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'Failed to resend code.');
    } else {
      setError('');
    }
  }

  function handleBackToCredentials() {
    setStep('credentials');
    setError('');
  }

  if (step === 'otp') {
    return (
      <form onSubmit={submitOtp} className="card p-6 mt-6 space-y-4">
        <p className="text-sm text-slate-600">
          We sent a 6-digit verification code to{' '}
          <span className="font-semibold">{maskedPhone}</span>. Enter it below to
          complete sign-in.
        </p>
        <div>
          <label className="label">Verification code</label>
          <input
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            className="input tracking-widest text-center text-xl"
            placeholder="123456"
            autoComplete="one-time-code"
            required
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? 'Verifying…' : 'Verify & Sign in'}
        </button>
        <div className="flex justify-between text-sm text-slate-500">
          <button
            type="button"
            className="hover:text-blue-600"
            onClick={resendOtp}
            disabled={loading}
          >
            Resend code
          </button>
          <button
            type="button"
            className="hover:text-blue-600"
            onClick={handleBackToCredentials}
          >
            Back
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="card p-6 mt-6 space-y-4">
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" className="input" placeholder="you@example.com" required />
      </div>
      <div>
        <label className="label">Password</label>
        <input name="password" type="password" className="input" placeholder="Password" required />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button className="btn-primary w-full" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="text-center">
        <Link href="/forgot-password" className="text-sm text-slate-500 hover:text-blue-600">
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-black">Sign in</h1>
      <Suspense fallback={<div className="card p-6 mt-6 h-48 animate-pulse bg-slate-100 rounded-2xl" />}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-slate-500 mt-4">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-blue-600 hover:underline">Sign up</Link>
      </p>
    </main>
  );
}
