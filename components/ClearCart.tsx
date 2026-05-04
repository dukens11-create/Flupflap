"use client";
import { useEffect } from 'react';

/** Clears the localStorage cart when rendered (used on checkout success page). */
export default function ClearCart() {
  useEffect(() => {
    localStorage.removeItem('flupflap_cart');
  }, []);
  return null;
}
