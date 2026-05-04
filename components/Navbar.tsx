"use client";
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingCart, Package, LayoutDashboard, LogIn, UserPlus, LogOut, User } from 'lucide-react';

export default function Navbar() {
  const { data: session } = useSession();
  const role = session?.user?.role;

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
          <Link href="/cart" className="flex items-center gap-1 hover:text-blue-600">
            <ShoppingCart size={16} /> Cart
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
