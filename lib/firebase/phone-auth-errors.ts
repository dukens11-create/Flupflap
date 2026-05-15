function getFirebaseErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

export function getFirebasePhoneAuthErrorMessage(error: unknown) {
  const code = getFirebaseErrorCode(error);

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
