'use client';
import { useEffect } from 'react';

/**
 * Fires a view-tracking request for the given product once per browser session.
 * Uses sessionStorage to deduplicate repeated page refreshes within the same tab session.
 * Seller/admin deduplication is handled server-side in the API route.
 */
export default function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    const key = `ff_viewed_${productId}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;

    fetch(`/api/products/${productId}/view`, { method: 'POST' })
      .then((res) => {
        if (res.ok && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(key, '1');
        }
      })
      .catch(() => {
        // Non-critical; swallow errors silently
      });
  }, [productId]);

  return null;
}
