'use client';

import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  measurementId?: string;
};

function getFirebaseClientConfig(): FirebaseClientConfig {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? '';
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? '';
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? '';
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? '';
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '';
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() ?? '';

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error(
      'Firebase phone auth is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, and NEXT_PUBLIC_FIREBASE_APP_ID.',
    );
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId: messagingSenderId || undefined,
    measurementId: measurementId || undefined,
  };
}

let analyticsInitPromise: Promise<void> | null = null;

function initializeFirebaseAnalyticsIfEnabled(app: FirebaseApp) {
  if (typeof window === 'undefined') return;
  if (analyticsInitPromise) return;
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() ?? '';
  if (!measurementId) return;

  analyticsInitPromise = (async () => {
    const analyticsModule = await import('firebase/analytics');
    const supported = await analyticsModule.isSupported();
    if (supported) {
      analyticsModule.getAnalytics(app);
    }
  })().catch(() => undefined);
}

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    const existing = getApp();
    initializeFirebaseAnalyticsIfEnabled(existing);
    return existing;
  }
  const app = initializeApp(getFirebaseClientConfig());
  initializeFirebaseAnalyticsIfEnabled(app);
  return app;
}

export function getFirebaseClientAuth(): Auth {
  return getAuth(getFirebaseApp());
}
