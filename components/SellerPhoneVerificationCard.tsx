'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConfirmationResult } from 'firebase/auth';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { getFirebaseClientAuth } from '@/lib/firebase/client';
import { normalizePhone } from '@/lib/phone';

const OTP_CODE_LENGTH = 6;

function getFirebaseErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function mapFirebasePhoneAuthError(code?: string) {
  if (code === 'auth/missing-phone-number') {
    return 'Please enter your phone number before requesting a code.';
  }
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
  if (code === 'auth/quota-exceeded') {
    return 'SMS quota exceeded right now. Please try again later.';
  }
  if (code === 'auth/captcha-check-failed' || code === 'auth/invalid-app-credential') {
    return 'Security check failed. Please refresh and try again.';
  }
  if (code === 'firebase/not-configured') {
    return 'Phone verification is not configured right now. Please contact support.';
  }
  if (!code) {
    return 'Phone verification is unavailable right now. Please check your connection and try again.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Phone sign-in is not enabled for this app. Please contact support.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for phone sign-in. Please contact support.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your connection and try again.';
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

  function resetRecaptchaVerifier() {
    if (!recaptchaRef.current) return;
    recaptchaRef.current.clear();
    recaptchaRef.current = null;
  }

  useEffect(() => {
    return () => {
      resetRecaptchaVerifier();
    };
  }, []);

  async function sendCode() {
    if (loading) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const normalizedPhoneForFirebase = normalizePhone(phone);
      if (!normalizedPhoneForFirebase) {
        setError('Invalid phone number. Please include your country code (e.g. +1 for US/Canada).');
        setLoading(false);
        return;
      }
      const auth = getFirebaseClientAuth();
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, 'seller-verification-recaptcha', {
          size: 'invisible',
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, normalizedPhoneForFirebase, recaptchaRef.current);
      confirmationResultRef.current = confirmation;
      setOtpSent(true);
    } catch (err: unknown) {
      setError(mapFirebasePhoneAuthError(getFirebaseErrorCode(err)));
      resetRecaptchaVerifier();
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
      const normalizedOtpCode = otpCode.replace(/\s+/g, '');
      if (normalizedOtpCode.length !== OTP_CODE_LENGTH) {
        setError(`Enter the ${OTP_CODE_LENGTH}-digit code sent to your phone.`);
        setLoading(false);
        return;
      }
      const confirmation = await confirmationResultRef.current.confirm(normalizedOtpCode);
      const idToken = await confirmation.user.getIdToken(true);
      await getFirebaseClientAuth().signOut().catch((signOutErr) => {
        console.error('[seller-phone-verify] Firebase signOut failed after OTP confirmation', signOutErr);
      });
      const res = await fetch('/api/seller/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          firebaseIdToken: idToken,
        }),
      });
      let data: { error?: string } | null = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error('[seller-phone-verify] failed to parse API response', parseErr);
      }
      if (!res.ok) {
        setError(data?.error ?? 'Unable to save verified phone number.');
        return;
      }
      setSuccess('Phone number verified and saved.');
      setOtpSent(false);
      setOtpCode('');
      router.refresh();
    } catch (err: unknown) {
      setError(mapFirebasePhoneAuthError(getFirebaseErrorCode(err)));
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
        <div id="seller-verification-recaptcha" className="hidden" />
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
              onChange={(e) => setOtpCode(e.target.value.replace(/\s+/g, ''))}
              maxLength={OTP_CODE_LENGTH}
              disabled={loading}
            />
            <div className="flex gap-2">
              <button type="button" className="btn-primary text-sm" onClick={verifyCode} disabled={loading || otpCode.trim().length !== OTP_CODE_LENGTH}>
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
