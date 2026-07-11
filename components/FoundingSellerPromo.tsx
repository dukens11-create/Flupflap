'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PromoState {
  isOpen: boolean;
  loading: boolean;
}

export function FoundingSellerPromo() {
  const { data: session, status } = useSession();
  const [promo, setPromo] = useState<PromoState>({
    isOpen: false,
    loading: true,
  });
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  // Check if program is still open
  useEffect(() => {
    const checkProgram = async () => {
      try {
        const res = await fetch('/api/founding-seller/enroll');
        const data = await res.json();
        setPromo({ isOpen: data.isOpen, loading: false });
      } catch (error) {
        console.error('Failed to check program status:', error);
        setPromo({ isOpen: false, loading: false });
      }
    };

    checkProgram();
  }, []);

  const handleEnroll = async () => {
    if (!session?.user?.id) return;

    setEnrolling(true);
    try {
      const res = await fetch('/api/founding-seller/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (data.ok) {
        setEnrolled(true);
      } else {
        alert(data.error || 'Failed to enroll');
      }
    } catch (error) {
      console.error('Enrollment error:', error);
      alert('An error occurred during enrollment');
    } finally {
      setEnrolling(false);
    }
  };

  if (status === 'loading' || promo.loading) {
    return null;
  }

  // Don't show if program is closed and user is not enrolled
  if (!promo.isOpen && !enrolled) {
    return null;
  }

  if (enrolled) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-2xl mx-auto">
        <h3 className="text-xl font-bold text-green-900 mb-2">🎉 Welcome to Founding Seller Program!</h3>
        <p className="text-green-800 mb-4">
          You're now a founding member of FlupFlap Marketplace. Enjoy your free seller subscription for the next 12 months!
        </p>
        <Link href="/seller">
          <Button className="bg-green-600 hover:bg-green-700">Go to Seller Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-8 max-w-2xl mx-auto">
      <div className="flex items-start gap-4">
        <div className="text-4xl">🚀</div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">FlupFlap Founding Seller Program</h2>
          <p className="text-gray-700 mb-4 font-semibold">SELL FREE FOR 1 FULL YEAR</p>
          <p className="text-gray-700 mb-6">
            Join FlupFlap Marketplace as one of our first 1,000 Founding Sellers and receive your seller subscription FREE for 12 months.
          </p>

          <ul className="space-y-2 mb-6 text-gray-800">
            <li className="flex items-center gap-2">
              <span className="text-green-600 font-bold">✓</span> No subscription payment for 1 year
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600 font-bold">✓</span> No credit card required to start
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600 font-bold">✓</span> List and sell products
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600 font-bold">✓</span> Host Garage Sales
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600 font-bold">✓</span> Go Live with Garage Sales Live
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600 font-bold">✓</span> Access your Seller Dashboard
            </li>
          </ul>

          <p className="text-sm text-gray-600 mb-4">
            <strong>7% selling fee</strong> charged only when you successfully make a sale.
          </p>

          {!promo.isOpen ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-yellow-800 text-sm">
              ⏳ The Founding Seller Program has reached its 1,000 seller limit! New enrollment is now closed.
            </div>
          ) : null}

          {session?.user?.id && promo.isOpen ? (
            <Button
              onClick={handleEnroll}
              disabled={enrolling}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-lg"
            >
              {enrolling ? 'Enrolling...' : 'BECOME A FOUNDING SELLER'}
            </Button>
          ) : session?.user?.id ? null : (
            <p className="text-sm text-gray-600 italic">
              <Link href="/auth/signin" className="text-blue-600 hover:underline">
                Sign in
              </Link>
              {' '}to enroll as a founding seller.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
