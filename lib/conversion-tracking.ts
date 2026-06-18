import type { ConversionEventName } from '@/lib/conversion-events';
import { isConversionEventName } from '@/lib/conversion-events';

type ConversionEventPayload = Record<string, string | number | boolean | null | undefined>;

function sanitizePayload(payload?: ConversionEventPayload) {
  if (!payload) return {};
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}

export function trackConversionEvent(name: ConversionEventName, payload?: ConversionEventPayload) {
  if (typeof window === 'undefined' || !isConversionEventName(name)) {
    return;
  }

  const safePayload = sanitizePayload(payload);

  try {
    const gtagFn = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtagFn === 'function') {
      gtagFn('event', name, safePayload);
    }

    const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer;
    if (Array.isArray(dataLayer)) {
      dataLayer.push({ event: name, ...safePayload });
    }
  } catch {
    // Non-fatal analytics failures must never block user flows.
  }

  const body = JSON.stringify({ event: name, payload: safePayload });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics/conversion', body);
      return;
    }
  } catch {
    // Fall back to fetch below.
  }

  void fetch('/api/analytics/conversion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => null);
}
