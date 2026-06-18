"use client";

import { useEffect } from 'react';

export default function FloatingToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timeoutId = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [message, onDismiss]);

  if (!message) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-50 max-w-sm rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg" role="alert" aria-live="assertive">
      <div className="flex items-start gap-3">
        <span className="text-base leading-none">⚠️</span>
        <div className="min-w-0 flex-1">{message}</div>
        <button
          type="button"
          onClick={onDismiss}
          className="font-bold leading-none text-red-400 hover:text-red-600"
          aria-label="Dismiss error message"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
