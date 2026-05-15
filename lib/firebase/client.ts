'use client';

import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { Auth, getAuth } from 'firebase/auth';

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  measurementId?: string;
};

let analyticsInitializationPromise: Promise<void> | null = null;

function getFirebaseClientConfig(): FirebaseClientConfig {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? '';
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? '';
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? '';
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? '';
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '';
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim() ?? '';

  if (!apiKey || !authDomain || !projectId || !appId) {
    throw Object.assign(
      new Error(
        'Firebase phone auth is not configured. Set NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, and NEXT_PUBLIC_FIREBASE_APP_ID.',
      ),
      { code: 'firebase/not-configured' },
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

function initializeFirebaseAnalyticsIfEnabled(app: FirebaseApp) {
  if (typeof window === 'undefined') return;
  if (analyticsInitializationPromise) return;
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim()) return;
  analyticsInitializationPromise = isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch((err) => {
      console.warn('[firebase] Analytics initialization failed', err);
    });
}

function getFirebaseApp(): FirebaseApp {
  const app = getApps().length > 0 ? getApp() : initializeApp(getFirebaseClientConfig());
  initializeFirebaseAnalyticsIfEnabled(app);
  return app;
}

export function getFirebaseClientAuth(): Auth {
  return getAuth(getFirebaseApp());
}
