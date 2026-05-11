'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const mobile = /android|iphone|ipad|ipod/.test(ua);
    const ios = /iphone|ipad|ipod/.test(ua);
    const safari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);

    setIsMobile(mobile);
    const standalone = isStandaloneMode();
    setIsStandalone(standalone);
    setIsIosSafari(ios && safari && !standalone);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isStandalone) return;
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isStandalone]);

  const shouldShow = useMemo(() => {
    if (dismissed || !isMobile || isStandalone) return false;
    return Boolean(deferredPrompt) || isIosSafari;
  }, [deferredPrompt, dismissed, isIosSafari, isMobile, isStandalone]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome !== 'accepted') setDismissed(true);
    setDeferredPrompt(null);
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <p className="text-sm font-semibold text-slate-900">Install FlupFlap App</p>
      {isIosSafari ? (
        <p className="mt-2 text-xs text-slate-600">Tap Share → Add to Home Screen.</p>
      ) : (
        <button type="button" onClick={() => void handleInstall()} className="btn-brand mt-3 w-full">
          Install FlupFlap App
        </button>
      )}
      <button type="button" onClick={() => setDismissed(true)} className="mt-3 w-full text-xs font-semibold text-slate-500">
        Not now
      </button>
    </div>
  );
}
