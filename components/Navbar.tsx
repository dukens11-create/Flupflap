"use client";
import Image from 'next/image';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingCart, Package, LayoutDashboard, LogIn, UserPlus, LogOut, User, MessageCircle, Bell, Search } from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import { useI18n } from '@/components/I18nProvider';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');

  const navLinkClass = 'rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-amber-50 hover:text-amber-700';
  const actionLinkClass = 'relative flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100 hover:text-amber-700';

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchValue.trim();
    if (q) {
      router.push(`/?q=${encodeURIComponent(q)}`);
    } else {
      router.push('/');
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Primary row: Logo | Search | Actions ── */}
        <div className="flex items-center gap-3 py-3">
          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center" aria-label="FlupFlap home">
            <Image
              src="/flupflap_logo_brand.png"
              alt="FlupFlap"
              width={614}
              height={255}
              priority
              className="h-10 w-auto sm:h-12"
            />
          </Link>

          {/* Search – hidden on mobile, shown on sm+ */}
          <form
            onSubmit={handleSearch}
            className="mx-2 hidden flex-1 sm:flex"
          >
            <div className="relative flex w-full max-w-xl items-center">
              <Search size={16} className="pointer-events-none absolute left-3 text-slate-400" />
              <input
                type="search"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                placeholder={t('filters.searchPlaceholder')}
                className="input w-full pl-9 pr-4"
                aria-label={t('filters.searchPlaceholder')}
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-1 text-slate-600">
            <LanguageSelector />
            <Link href="/cart" className={actionLinkClass}>
              <ShoppingCart size={16} />
              <span className="hidden sm:inline">{t('nav.cart')}</span>
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>
            {session?.user ? (
              <>
                <Link href="/orders" className={actionLinkClass}>
                  <Package size={16} />
                  <span className="hidden lg:inline">{t('nav.orders')}</span>
                </Link>
                <Link href="/messages" className={actionLinkClass}>
                  <MessageCircle size={16} />
                  <span className="hidden lg:inline">{t('nav.messages')}</span>
                  {unreadMessages > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-xs font-bold text-white">
                      {unreadMessages}
                    </span>
                  )}
                </Link>
                <Link href="/notifications" className={actionLinkClass}>
                  <Bell size={16} />
                  <span className="hidden lg:inline">{t('nav.notifications')}</span>
                  {unreadNotifications > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-xs font-bold text-white">
                      {unreadNotifications}
                    </span>
                  )}
                </Link>
                <Link href="/account" className={actionLinkClass}>
                  <User size={16} />
                  <span className="hidden lg:inline">{t('nav.account')}</span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="hidden items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors hover:bg-red-50 hover:text-red-600 lg:flex"
                >
                  <LogOut size={16} /> {t('nav.logout')}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={`${actionLinkClass} hidden sm:flex`}>
                  <LogIn size={16} /> {t('nav.login')}
                </Link>
                <Link href="/signup" className="btn-brand hidden sm:inline-flex">
                  <UserPlus size={14} /> {t('nav.signUp')}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* ── Mobile search row ── */}
        <form onSubmit={handleSearch} className="pb-3 sm:hidden">
          <div className="relative flex items-center">
            <Search size={16} className="pointer-events-none absolute left-3 text-slate-400" />
            <input
              type="search"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              placeholder={t('filters.searchPlaceholder')}
              className="input w-full pl-9 pr-4"
              aria-label={t('filters.searchPlaceholder')}
            />
          </div>
        </form>

        {/* ── Secondary nav row: role-based links ── */}
        {(role === 'SELLER' || role === 'ADMIN') && (
          <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 py-2 text-slate-600">
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
          </div>
        )}
      </div>
    </header>
  );
}
