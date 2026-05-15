'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConfirmationResult } from 'firebase/auth';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { getFirebaseClientAuth } from '@/lib/firebase/client';

function mapFirebasePhoneAuthError(code?: string) {
  if (code === 'auth/invalid-verification-code') {
    return 'Invalid OTP code. Please check the code and try again.';
  }
  if (code === 'auth/code-expired') {
    return 'This OTP has expired. Please request a new code.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment before trying again.';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Invalid phone number. Please include your country code (e.g. +1).';
  }
  return 'Phone verification failed. Please try again.';
}

export default function SellerPhoneVerificationCard() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  async function sendCode() {
    if (loading) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const auth = getFirebaseClientAuth();
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, 'seller-verification-recaptcha', {
          size: 'invisible',
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, phone, recaptchaRef.current);
      confirmationResultRef.current = confirmation;
      setOtpSent(true);
    } catch (err: any) {
      setError(mapFirebasePhoneAuthError(err?.code));
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (loading) return;
    if (!confirmationResultRef.current) {
      setError('Please request an OTP first.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const confirmation = await confirmationResultRef.current.confirm(otpCode.trim());
      const idToken = await confirmation.user.getIdToken(true);
      const res = await fetch('/api/seller/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          firebaseIdToken: idToken,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Unable to save verified phone number.');
        return;
      }
      setSuccess('Phone number verified and saved.');
      setOtpSent(false);
      setOtpCode('');
      await getFirebaseClientAuth().signOut().catch(() => null);
      router.refresh();
    } catch (err: any) {
      setError(mapFirebasePhoneAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Phone verification required</p>
      <p className="mt-1 text-sm text-amber-800">
        Verify your mobile number to continue seller identity verification.
      </p>
      <div className="mt-3 space-y-2">
        <input
          type="text"
          inputMode="tel"
          autoComplete="tel"
          className="input"
          placeholder="+1 555 000 1234"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
          required
        />
        <div id="seller-verification-recaptcha" />
        {!otpSent ? (
          <button type="button" className="btn-primary text-sm" onClick={sendCode} disabled={loading || !phone.trim()}>
            {loading ? 'Sending…' : 'Send Code'}
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              inputMode="numeric"
              className="input tracking-widest text-center text-xl"
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              maxLength={6}
              disabled={loading}
            />
            <div className="flex gap-2">
              <button type="button" className="btn-primary text-sm" onClick={verifyCode} disabled={loading || otpCode.trim().length !== 6}>
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>
              <button type="button" className="btn-outline text-sm" onClick={sendCode} disabled={loading || !phone.trim()}>
                Resend
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-700">{error}</p>}
        {success && <p className="text-xs text-green-700">{success}</p>}
      </div>
    </div>
  );
}
