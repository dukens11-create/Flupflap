import { logError } from '@/lib/logger';

type FirebaseLookupResponse = {
  users?: Array<{
    phoneNumber?: string;
  }>;
  error?: {
    message?: string;
  };
};

export type FirebasePhoneVerificationResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; error: 'missing_config' | 'invalid_token' | 'lookup_failed' };

function getFirebaseApiKey() {
  return process.env.FIREBASE_API_KEY?.trim() ?? '';
}

export async function verifyFirebasePhoneIdToken(idToken: string): Promise<FirebasePhoneVerificationResult> {
  const apiKey = getFirebaseApiKey();
  if (!apiKey) return { ok: false, error: 'missing_config' };

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        cache: 'no-store',
      },
    );

    const data = (await response
      .json()
      .catch((err) => {
        logError('Failed to parse Firebase phone lookup response JSON.', err, {
          tag: 'lib/firebase/phone-verification',
        });
        return null;
      })) as FirebaseLookupResponse | null;
    if (!data) {
      return { ok: false, error: 'lookup_failed' };
    }
    const phoneNumber = data?.users?.[0]?.phoneNumber?.trim();
    if (!response.ok || !phoneNumber) {
      const message = data?.error?.message ?? '';
      if (response.status === 400 || message.includes('INVALID_ID_TOKEN') || message.includes('TOKEN_EXPIRED')) {
        return { ok: false, error: 'invalid_token' };
      }
      return { ok: false, error: 'lookup_failed' };
    }

    return { ok: true, phoneNumber };
  } catch (err) {
    logError('Firebase phone lookup request failed.', err, {
      tag: 'lib/firebase/phone-verification',
    });
    return { ok: false, error: 'lookup_failed' };
  }
}
