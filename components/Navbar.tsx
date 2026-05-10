"use client";
import Image from 'next/image';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingCart, Package, LogIn, UserPlus, LogOut, User, MessageCircle, Bell, Menu, X } from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import { useI18n } from '@/components/I18nProvider';
import { useEffect, useState } from 'react';
import { getRoleNavigation, normalizeExperienceRole } from '@/lib/role-experience';
import { usePathname } from 'next/navigation';

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
  const role = session?.user?.role ?? null;
  const experienceRole = normalizeExperienceRole(role);
  const roleNavigation = getRoleNavigation(role);
  const pathname = usePathname();
  const cartCount = useCartCount();
  const unreadMessages = useUnreadMessages(!!session?.user);
  const unreadNotifications = useUnreadNotifications(!!session?.user);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useI18n();
  const navLinkClass = 'rounded-full px-3 py-2 transition-colors hover:bg-slate-100 link-hover-navy';
  const actionLinkClass = 'relative flex items-center gap-1 rounded-full px-3 py-2 transition-colors hover:bg-slate-100 link-hover-navy';

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
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-slate-600 md:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle mobile menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          <div className="hidden flex-1 flex-col gap-3 md:flex lg:flex-row lg:items-center">
            <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
              {roleNavigation.map((item) => (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={navLinkClass}
                  aria-label={item.label}
                  aria-current={pathname === item.href.split('#')[0] ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2 text-sm font-medium lg:ml-auto">
              <LanguageSelector />
              {session?.user ? (
                <>
                  {experienceRole === 'buyer' && (
                    <>
                      <Link href="/cart" className={actionLinkClass}>
                        <ShoppingCart size={16} /> {t('nav.cart')}
                        {cartCount > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
                            {cartCount}
                          </span>
                        )}
                      </Link>
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
                    </>
                  )}
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
        {mobileOpen && (
          <div className={`mt-4 rounded-2xl border p-3 md:hidden ${
            experienceRole === 'admin'
              ? 'border-slate-700 bg-slate-900 text-white'
              : experienceRole === 'seller'
                ? 'border-indigo-200 bg-indigo-50'
                : 'border-emerald-200 bg-emerald-50'
          }`}>
            <nav className="flex flex-col gap-1 text-sm font-medium">
              {roleNavigation.map((item) => (
                <Link
                  key={`mobile-${item.href}-${item.label}`}
                  href={item.href}
                  className={`rounded-lg px-3 py-2.5 ${
                    experienceRole === 'admin'
                      ? 'text-slate-100 hover:bg-white/10'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                  onClick={() => setMobileOpen(false)}
                  aria-label={item.label}
                  aria-current={pathname === item.href.split('#')[0] ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
              {session?.user ? (
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className={`rounded-lg px-3 py-2.5 text-left ${
                    experienceRole === 'admin'
                      ? 'text-red-400 hover:bg-white/10'
                      : 'text-slate-700 hover:bg-white/80 hover:text-red-600'
                  }`}
                >
                  {t('nav.logout')}
                </button>
              ) : (
                <>
                  <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-white/80 text-slate-700" onClick={() => setMobileOpen(false)}>
                    {t('nav.login')}
                  </Link>
                  <Link href="/signup" className="rounded-lg px-3 py-2 hover:bg-white/80 text-slate-700" onClick={() => setMobileOpen(false)}>
                    {t('nav.signUp')}
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
