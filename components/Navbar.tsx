"use client";
import Image from 'next/image';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { ShoppingCart, LogIn, UserPlus, LogOut, User, MessageCircle, Bell, Menu, X, ChevronDown } from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import { useI18n } from '@/components/I18nProvider';
import { useEffect, useState } from 'react';
import { getRoleNavigation, normalizeExperienceRole } from '@/lib/role-experience';
import { usePathname } from 'next/navigation';
import { CULTURAL_MARKETPLACES } from '@/lib/cultural-marketplaces';

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
  const [cultureMenuOpen, setCultureMenuOpen] = useState(false);
  const { t } = useI18n();
  const navLinkClass = 'rounded-full px-3 py-2 transition-colors hover:bg-slate-100 link-hover-navy';
  const actionLinkClass = 'relative flex items-center gap-1 rounded-full px-3 py-2 transition-colors hover:bg-slate-100 link-hover-navy';
  const iconButtonClass = 'relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-all hover:bg-slate-100 active:scale-[0.98] link-hover-navy';
  const iconBadgeClass = 'absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white';
  const callbackPathname = pathname && pathname !== '/' ? pathname : null;
  const loginHref = callbackPathname ? `/login?callbackUrl=${encodeURIComponent(callbackPathname)}` : '/login';
  const signupHref = callbackPathname ? `/signup?callbackUrl=${encodeURIComponent(callbackPathname)}` : '/signup';
  const localSellersHref = '/?pickup=1';
  const formatBadgeCount = (count: number) => (count > 99 ? '99+' : String(count));

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
                className="h-10 w-auto sm:h-12"
              />
            </Link>
            <div className="flex items-center gap-1 md:hidden">
              {session?.user && experienceRole === 'buyer' && (
                <>
                  <Link href="/cart" className={iconButtonClass} aria-label={t('nav.cart')}>
                    <ShoppingCart size={17} />
                    {cartCount > 0 && (
                      <span className={`${iconBadgeClass} bg-amber-500`}>
                        {formatBadgeCount(cartCount)}
                      </span>
                    )}
                  </Link>
                  <Link href="/messages" className={iconButtonClass} aria-label={t('nav.messages')}>
                    <MessageCircle size={17} />
                    {unreadMessages > 0 && (
                      <span className={`${iconBadgeClass} bg-emerald-500`}>
                        {formatBadgeCount(unreadMessages)}
                      </span>
                    )}
                  </Link>
                  <Link href="/notifications" className={iconButtonClass} aria-label={t('nav.notifications')}>
                    <Bell size={17} />
                    {unreadNotifications > 0 && (
                      <span className={`${iconBadgeClass} bg-emerald-500`}>
                        {formatBadgeCount(unreadNotifications)}
                      </span>
                    )}
                  </Link>
                </>
              )}
              <button
                type="button"
                className={iconButtonClass}
                onClick={() => setMobileOpen((open) => !open)}
                aria-label="Toggle mobile menu"
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
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
              
              {/* Shop by Culture Dropdown */}
              {CULTURAL_MARKETPLACES.length > 0 && (
                <div className="relative"
                  onMouseEnter={() => setCultureMenuOpen(true)}
                  onMouseLeave={() => setCultureMenuOpen(false)}
                >
                  <button
                    className={`${navLinkClass} flex items-center gap-1`}
                    onClick={() => setCultureMenuOpen(!cultureMenuOpen)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setCultureMenuOpen(false);
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setCultureMenuOpen(true);
                      }
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCultureMenuOpen(!cultureMenuOpen);
                      }
                    }}
                    aria-expanded={cultureMenuOpen}
                    aria-haspopup="true"
                    aria-label={t('nav.shopByCulture')}
                  >
                    {t('nav.shopByCulture')}
                    <ChevronDown size={14} className={`transition-transform ${cultureMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {cultureMenuOpen && (
                    <div 
                      className="absolute left-0 top-full z-50 mt-1 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
                      role="menu"
                      aria-label="Cultural marketplace categories"
                    >
                      <div className="space-y-1">
                        {CULTURAL_MARKETPLACES.map((marketplace) => (
                          <Link
                            key={marketplace.slug}
                            href={`/category/${marketplace.slug}`}
                            className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--ff-primary-navy)] focus:ring-offset-2"
                            onClick={() => setCultureMenuOpen(false)}
                            role="menuitem"
                          >
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 text-base">{marketplace.icon}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">{marketplace.name}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {marketplace.subcategories.slice(0, 3).map((sub) => sub.name).join(' • ')}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))}
                        <Link
                          href={localSellersHref}
                          className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--ff-primary-navy)] focus:ring-offset-2"
                          onClick={() => setCultureMenuOpen(false)}
                          role="menuitem"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-base">📍</span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{t('nav.localSellers')}</p>
                              <p className="text-xs text-slate-500">{t('nav.localSellersSubtitle')}</p>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </nav>

            <div className="flex flex-wrap items-center gap-2 text-sm font-medium lg:ml-auto">
              <LanguageSelector />
              {session?.user ? (
                <>
                  {experienceRole === 'buyer' && (
                    <>
                      <Link href="/cart" className={iconButtonClass} aria-label={t('nav.cart')}>
                        <ShoppingCart size={17} />
                        {cartCount > 0 && (
                          <span className={`${iconBadgeClass} bg-amber-500`}>
                            {formatBadgeCount(cartCount)}
                          </span>
                        )}
                      </Link>
                      <Link href="/messages" className={iconButtonClass} aria-label={t('nav.messages')}>
                        <MessageCircle size={17} />
                        {unreadMessages > 0 && (
                          <span className={`${iconBadgeClass} bg-emerald-500`}>
                            {formatBadgeCount(unreadMessages)}
                          </span>
                        )}
                      </Link>
                      <Link href="/notifications" className={iconButtonClass} aria-label={t('nav.notifications')}>
                        <Bell size={17} />
                        {unreadNotifications > 0 && (
                          <span className={`${iconBadgeClass} bg-emerald-500`}>
                            {formatBadgeCount(unreadNotifications)}
                          </span>
                        )}
                      </Link>
                      <Link href="/account" className={iconButtonClass} aria-label={t('nav.account')}>
                        <User size={17} />
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
                  <Link href={loginHref} className={actionLinkClass}>
                    <LogIn size={16} /> {t('nav.login')}
                  </Link>
                  <Link href={signupHref} className="btn-brand">
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
                  <Link href={loginHref} className="rounded-lg px-3 py-2 hover:bg-white/80 text-slate-700" onClick={() => setMobileOpen(false)}>
                    {t('nav.login')}
                  </Link>
                  <Link href={signupHref} className="rounded-lg px-3 py-2 hover:bg-white/80 text-slate-700" onClick={() => setMobileOpen(false)}>
                    {t('nav.signUp')}
                  </Link>
                </>
              )}

              {CULTURAL_MARKETPLACES.length > 0 && (
                <div className={`mt-2 border-t pt-2 ${
                  experienceRole === 'admin' ? 'border-white/15' : 'border-slate-200'
                }`}>
                  <p className={`px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                    experienceRole === 'admin' ? 'text-slate-300' : 'text-slate-500'
                  }`}>
                    {t('nav.shopByCulture')}
                  </p>
                  {CULTURAL_MARKETPLACES.map((marketplace) => (
                    <Link
                      key={`mobile-category-${marketplace.slug}`}
                      href={`/category/${marketplace.slug}`}
                      className={`rounded-lg px-3 py-2.5 ${
                        experienceRole === 'admin'
                          ? 'text-slate-100 hover:bg-white/10'
                          : 'text-slate-700 hover:bg-white/80'
                      }`}
                      onClick={() => setMobileOpen(false)}
                    >
                      {marketplace.icon} {marketplace.name}
                    </Link>
                  ))}
                  <Link
                    href={localSellersHref}
                    className={`rounded-lg px-3 py-2.5 ${
                      experienceRole === 'admin'
                        ? 'text-slate-100 hover:bg-white/10'
                        : 'text-slate-700 hover:bg-white/80'
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    📍 {t('nav.localSellers')}
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
