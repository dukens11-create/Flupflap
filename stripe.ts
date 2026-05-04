import Stripe from 'stripe';
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_missing', { apiVersion: '2024-06-20' as any });
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
