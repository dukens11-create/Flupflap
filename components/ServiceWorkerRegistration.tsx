'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch {
        // no-op: app should continue to work without service worker
      }
    };

    const onWindowLoad = () => {
      void registerServiceWorker();
    };

    if (document.readyState === 'complete') {
      void registerServiceWorker();
      return;
    }

    window.addEventListener('load', onWindowLoad, { once: true });

    return () => {
      window.removeEventListener('load', onWindowLoad);
    };
  }, []);

  return null;
}
