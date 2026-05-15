type FirebaseLookupResponse = {
  users?: Array<{
    localId?: string;
    phoneNumber?: string;
  }>;
};

function getFirebaseApiKey(): string {
  return (
    process.env.FIREBASE_API_KEY?.trim()
    || process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
    || ''
  );
}

export async function verifyFirebasePhoneIdToken(idToken: string) {
  const apiKey = getFirebaseApiKey();
  if (!apiKey) {
    throw new Error('Firebase API key is not configured.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as FirebaseLookupResponse;
  const phoneNumber = payload.users?.[0]?.phoneNumber ?? null;
  if (!phoneNumber) {
    return null;
  }

  return { phoneNumber };
}
