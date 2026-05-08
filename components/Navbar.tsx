"use client";
import Image from 'next/image';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingCart, Package, LayoutDashboard, LogIn, UserPlus, LogOut, User, MessageCircle } from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import { useI18n } from '@/components/I18nProvider';
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
    // storage fires for cross-tab changes; flupflap:cart-updated fires for same-tab changes
    window.addEventListener('storage', read);
    window.addEventListener('flupflap:cart-updated', read);
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('flupflap:cart-updated', read);
    };
  }, []);

  return count;
}

/** Shape of each conversation returned by GET /api/messages (only fields used here). */
type InboxConversation = {
  unread: boolean;
};

function useUnreadMessages(loggedIn: boolean) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/messages');
        if (!res.ok || cancelled) return;
        const data: InboxConversation[] = await res.json();
        const count = data.filter((conv) => conv.unread).length;
        if (!cancelled) setUnread(count);
      } catch {
        // ignore
      }
    }
    load();
    // Poll every 30 seconds so the badge stays up to date
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loggedIn]);

  return unread;
}

export default function Navbar() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const cartCount = useCartCount();
  const unreadMessages = useUnreadMessages(!!session?.user);
  const { t } = useI18n();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-32 sm:h-40 flex items-center gap-4">
        <Link href="/" className="mr-2 sm:mr-4 flex items-center shrink-0" aria-label="FlupFlap home">
          <Image
            src="/flupflap_logo_brand.png"
            alt="FlupFlap"
            width={614}
            height={255}
            priority
            className="h-28 sm:h-36 w-auto"
          />
        </Link>

        <nav className="flex items-center gap-3 flex-1 text-sm font-medium text-slate-600">
          <Link href="/" className="hover:text-blue-600">{t('nav.browse')}</Link>
          {role === 'SELLER' && (
            <>
              <Link href="/seller" className="hover:text-blue-600">{t('nav.dashboard')}</Link>
              <Link href="/seller/new" className="hover:text-blue-600">{t('nav.listItem')}</Link>
            </>
          )}
          {role === 'ADMIN' && (
            <Link href="/admin" className="hover:text-blue-600 flex items-center gap-1">
              <LayoutDashboard size={14} /> {t('nav.admin')}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 text-sm font-medium">
          <LanguageSelector />
          <Link href="/cart" className="relative flex items-center gap-1 hover:text-blue-600">
            <ShoppingCart size={16} /> {t('nav.cart')}
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-3 bg-blue-600 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </Link>
          {session?.user ? (
            <>
              <Link href="/orders" className="flex items-center gap-1 hover:text-blue-600">
                <Package size={16} /> {t('nav.orders')}
              </Link>
              <Link href="/messages" className="relative flex items-center gap-1 hover:text-blue-600">
                <MessageCircle size={16} /> {t('nav.messages')}
                {unreadMessages > 0 && (
                  <span className="absolute -top-2 -right-3 bg-blue-600 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {unreadMessages}
                  </span>
                )}
              </Link>
              <Link href="/account" className="flex items-center gap-1 hover:text-blue-600">
                <User size={16} /> {t('nav.account')}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="flex items-center gap-1 hover:text-red-600"
              >
                <LogOut size={16} /> {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="flex items-center gap-1 hover:text-blue-600">
                <LogIn size={16} /> {t('nav.login')}
              </Link>
              <Link href="/signup" className="btn-primary flex items-center gap-1">
                <UserPlus size={14} /> {t('nav.signUp')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
