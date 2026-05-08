'use client';

import { useEffect } from 'react';

export default function VisitorTracker() {
  useEffect(() => {
    void fetch('/api/traffic/hit', {
      method: 'POST',
      keepalive: true,
    }).catch(() => null);
  }, []);

  return null;
}
