"use client";
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingCart, Package, LayoutDashboard, LogIn, UserPlus, LogOut, User } from 'lucide-react';
import { useEffect, useState } from 'react';

function useCartCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function read() {
      try {
        const cart = JSON.parse(localStorage.getItem('flupflap_cart') || '[]') as { quantity: number }[];
        setCount(cart.reduce((s, i) => s + i.quantity, 0));
      } catch {
        setCount(0);
      }
    }
    read();
    window.addEventListener('storage', read);
    const id = setInterval(read, 1000);
    return () => {
      window.removeEventListener('storage', read);
      clearInterval(id);
    };
  }, []);

  return count;
}

export default function Navbar() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const cartCount = useCartCount();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
        <Link href="/" className="font-black text-xl text-blue-600 mr-2">FlupFlap</Link>

        <nav className="flex items-center gap-3 flex-1 text-sm font-medium text-slate-600">
          <Link href="/" className="hover:text-blue-600">Browse</Link>
          {role === 'SELLER' && (
            <>
              <Link href="/seller" className="hover:text-blue-600">Dashboard</Link>
              <Link href="/seller/new" className="hover:text-blue-600">List Item</Link>
            </>
          )}
          {role === 'ADMIN' && (
            <Link href="/admin" className="hover:text-blue-600 flex items-center gap-1">
              <LayoutDashboard size={14} /> Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href="/cart" className="relative flex items-center gap-1 hover:text-blue-600">
            <ShoppingCart size={16} /> Cart
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-blue-600 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </Link>
          {session?.user ? (
            <>
              <Link href="/orders" className="flex items-center gap-1 hover:text-blue-600">
                <Package size={16} /> Orders
              </Link>
              <Link href="/account" className="flex items-center gap-1 hover:text-blue-600">
                <User size={16} /> Account
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="flex items-center gap-1 hover:text-red-600"
              >
                <LogOut size={16} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="flex items-center gap-1 hover:text-blue-600">
                <LogIn size={16} /> Login
              </Link>
              <Link href="/signup" className="btn-primary flex items-center gap-1">
                <UserPlus size={14} /> Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
