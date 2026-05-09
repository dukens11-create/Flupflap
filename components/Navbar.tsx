"use client";
import Image from 'next/image';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingCart, Package, LayoutDashboard, LogIn, UserPlus, LogOut, User, MessageCircle, Bell } from 'lucide-react';
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
  unreadCount: number;
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
        const count = data.reduce((sum, conv) => sum + conv.unreadCount, 0);
        if (!cancelled) setUnread(count);
      } catch {
        // ignore
      }
    }
    load();
    // Poll every 60 seconds so the badge stays up to date without excessive API churn
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loggedIn]);

  return unread;
}

function useUnreadNotifications(loggedIn: boolean) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setUnread(data.unreadCount ?? 0);
      } catch {
        // ignore
      }
    }

    load();
    const interval = setInterval(load, 60_000);
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
  const unreadNotifications = useUnreadNotifications(!!session?.user);
  const { t } = useI18n();
  const navLinkClass = 'rounded-full px-3 py-2 transition-colors hover:bg-amber-50 hover:text-amber-700';
  const actionLinkClass = 'relative flex items-center gap-1 rounded-full px-3 py-2 transition-colors hover:bg-slate-100 hover:text-amber-700';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center shrink-0" aria-label="FlupFlap home">
              <Image
                src="/flupflap_logo_brand.png"
                alt="FlupFlap"
                width={614}
                height={255}
                priority
                className="h-14 w-auto sm:h-16"
              />
            </Link>
          </div>

          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
              <Link href="/" className={navLinkClass}>{t('nav.browse')}</Link>
              {role === 'SELLER' && (
                <>
                  <Link href="/seller" className={navLinkClass}>{t('nav.dashboard')}</Link>
                  <Link href="/seller/new" className={navLinkClass}>{t('nav.listItem')}</Link>
                  <Link href="/seller/tax-center" className={navLinkClass}>{t('nav.taxCenter')}</Link>
                </>
              )}
              {role === 'ADMIN' && (
                <Link href="/admin" className={`${navLinkClass} flex items-center gap-1`}>
                  <LayoutDashboard size={14} /> {t('nav.admin')}
                </Link>
              )}
            </nav>

            <div className="flex flex-wrap items-center gap-2 text-sm font-medium lg:ml-auto">
              <LanguageSelector />
              <Link href="/cart" className={actionLinkClass}>
                <ShoppingCart size={16} /> {t('nav.cart')}
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              {session?.user ? (
                <>
                  <Link href="/orders" className={actionLinkClass}>
                    <Package size={16} /> {t('nav.orders')}
                  </Link>
                  <Link href="/messages" className={actionLinkClass}>
                    <MessageCircle size={16} /> {t('nav.messages')}
                    {unreadMessages > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-xs font-bold text-white">
                        {unreadMessages}
                      </span>
                    )}
                  </Link>
                  <Link href="/notifications" className={actionLinkClass}>
                    <Bell size={16} /> {t('nav.notifications')}
                    {unreadNotifications > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-xs font-bold text-white">
                        {unreadNotifications}
                      </span>
                    )}
                  </Link>
                  <Link href="/account" className={actionLinkClass}>
                    <User size={16} /> {t('nav.account')}
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="flex items-center gap-1 rounded-full px-3 py-2 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <LogOut size={16} /> {t('nav.logout')}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className={actionLinkClass}>
                    <LogIn size={16} /> {t('nav.login')}
                  </Link>
                  <Link href="/signup" className="btn-brand">
                    <UserPlus size={14} /> {t('nav.signUp')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
