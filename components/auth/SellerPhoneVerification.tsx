'use client';

import { useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import type { ConfirmationResult } from 'firebase/auth';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { getFirebaseClientAuth } from '@/lib/firebase/client';
import { normalizePhone } from '@/lib/phone';

type SellerPhoneVerificationProps = {
  phone: string;
  onPhoneChange: (phone: string) => void;
  verifiedPhoneNumber: string;
  onVerified: (verifiedPhoneNumber: string, firebaseIdToken: string) => void;
  onResetVerification: () => void;
};

function getErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const value = (err as { code?: unknown }).code;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function getPhoneVerificationErrorMessage(err: unknown) {
  const code = getErrorCode(err);
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
  if (code === 'auth/operation-not-allowed') {
    return 'Phone sign-in is not enabled for this app. Please contact support.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for phone sign-in. Please contact support.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your connection and try again.';
  }
  if (code === 'firebase/not-configured') {
    return 'Phone verification is not configured right now. Please contact support.';
  }
  if (!code) {
    return 'Phone verification is unavailable right now. Please check your connection and try again.';
  }
  return 'Phone verification failed. Please try again.';
}

export default function SellerPhoneVerification({
  phone,
  onPhoneChange,
  verifiedPhoneNumber,
  onVerified,
  onResetVerification,
}: SellerPhoneVerificationProps) {
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerId = 'phone-verification-recaptcha';

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
    if (phoneOtpLoading) return;
    setPhoneOtpError('');
    setPhoneOtpLoading(true);
    try {
      const normalizedPhoneForFirebase = normalizePhone(phone);
      if (!normalizedPhoneForFirebase) {
        setPhoneOtpError('Invalid phone number. Please include your country code (e.g. +1 for US/Canada).');
        setPhoneOtpLoading(false);
        return;
      }
      const auth = getFirebaseClientAuth();
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, recaptchaContainerId, {
          size: 'invisible',
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, normalizedPhoneForFirebase, recaptchaRef.current);
      confirmationResultRef.current = confirmation;
      setOtpSent(true);
    } catch (err: unknown) {
      setPhoneOtpError(getPhoneVerificationErrorMessage(err));
      resetRecaptchaVerifier();
    } finally {
      setPhoneOtpLoading(false);
    }
  }

  async function verifyCode() {
    if (phoneOtpLoading) return;
    if (!confirmationResultRef.current) {
      setPhoneOtpError('Verification session expired. Please request a new code.');
      return;
    }
    setPhoneOtpError('');
    setPhoneOtpLoading(true);
    try {
      const confirmation = await confirmationResultRef.current.confirm(otpCode.trim());
      const idToken = await confirmation.user.getIdToken(true);
      const verifiedPhone = confirmation.user.phoneNumber ?? '';
      if (!verifiedPhone) {
        setPhoneOtpError('Unable to verify phone number. Please try again.');
        setPhoneOtpLoading(false);
        return;
      }
      onVerified(verifiedPhone, idToken);
      setOtpSent(false);
      setOtpCode('');
      await getFirebaseClientAuth().signOut().catch((signOutError) => {
        Sentry.captureException(signOutError, {
          tags: { area: 'auth', action: 'firebase_signout_after_phone_verify' },
          extra: {
            message: signOutError?.message ?? null,
            code: signOutError?.code ?? null,
          },
        });
      });
    } catch (err: unknown) {
      setPhoneOtpError(getPhoneVerificationErrorMessage(err));
    } finally {
      setPhoneOtpLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="label">Mobile phone number</label>
      <input
        type="text"
        inputMode="tel"
        autoComplete="tel"
        className="input"
        placeholder="+1 555 000 1234"
        required
        value={phone}
        onChange={(e) => {
          const nextPhone = e.target.value;
          onPhoneChange(nextPhone);
          if (verifiedPhoneNumber && nextPhone !== verifiedPhoneNumber) {
            onResetVerification();
          }
        }}
        disabled={!!verifiedPhoneNumber}
      />
      <div id={recaptchaContainerId} className="hidden" />
      {verifiedPhoneNumber ? (
        <div className="space-y-2">
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            Phone verified: {verifiedPhoneNumber}
          </p>
          <button
            type="button"
            className="btn-outline w-full text-sm sm:w-auto"
            onClick={onResetVerification}
          >
            Change phone number
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {otpSent && (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input"
              placeholder="Enter 6-digit code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              maxLength={6}
            />
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-outline text-sm"
              disabled={phoneOtpLoading || !phone.trim()}
              onClick={sendCode}
            >
              {phoneOtpLoading ? 'Sending…' : otpSent ? 'Resend Code' : 'Send Code'}
            </button>
            {otpSent && (
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={phoneOtpLoading || otpCode.trim().length !== 6}
                onClick={verifyCode}
              >
                {phoneOtpLoading ? 'Verifying…' : 'Verify Code'}
              </button>
            )}
          </div>
        </div>
      )}
      {phoneOtpError && <p className="text-xs text-red-600">{phoneOtpError}</p>}
      <p className="mt-1 text-xs text-slate-500">
        Use your mobile number with country code to receive a one-time verification code.
      </p>
    </div>
  );
}
