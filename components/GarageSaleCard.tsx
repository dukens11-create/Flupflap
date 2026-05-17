'use client';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Calendar, Clock, Star, Tag } from 'lucide-react';

export type GarageSaleSummary = {
  id: string;
  title: string;
  saleType: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  startDate: string;
  endDate: string;
  photos: string[];
  categories: string[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  isFeatured: boolean;
  isLive: boolean;
  viewCount: number;
  latitude?: number | null;
  longitude?: number | null;
  seller: {
    id: string;
    name: string;
    shopName?: string | null;
    profileImageUrl?: string | null;
  };
  _count?: { favorites: number };
  distanceMiles?: number;
};

const SALE_TYPE_LABELS: Record<string, string> = {
  GARAGE_SALE: 'Garage Sale',
  YARD_SALE: 'Yard Sale',
  ESTATE_SALE: 'Estate Sale',
  MOVING_SALE: 'Moving Sale',
};

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (s.toDateString() === e.toDateString()) {
    return `${s.toLocaleDateString(undefined, opts)} · ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

function isOpenNow(startDate: string, endDate: string): boolean {
  const now = Date.now();
  return now >= new Date(startDate).getTime() && now <= new Date(endDate).getTime();
}

function isStartingSoon(startDate: string): boolean {
  const ms = new Date(startDate).getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
}

export default function GarageSaleCard({ sale }: { sale: GarageSaleSummary }) {
  const mainPhoto = sale.photos[0] ?? null;
  const openNow = isOpenNow(sale.startDate, sale.endDate);
  const startingSoon = !openNow && isStartingSoon(sale.startDate);
  const saleTypeLabel = SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType;  const priceRange = sale.priceRangeMin != null && sale.priceRangeMax != null
    ? `$${sale.priceRangeMin}–$${sale.priceRangeMax}`
    : sale.priceRangeMin != null
      ? `From $${sale.priceRangeMin}`
      : null;

  return (
    <div className={`group flex h-full flex-col overflow-hidden rounded-[28px] border bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${sale.isFeatured ? 'border-amber-200 ring-2 ring-amber-300 sm:scale-[1.01]' : 'border-slate-200'}`}>
      {/* Photo */}
      <div className={`relative flex items-center justify-center overflow-hidden bg-slate-100 ${sale.isFeatured ? 'h-52 sm:h-56' : 'h-44 sm:h-48'}`}>
        {mainPhoto ? (
          <Image
            src={mainPhoto}
            alt={sale.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="text-5xl select-none">🏠</span>
        )}
        {sale.isFeatured && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-amber-950 shadow-sm">
            ⭐ Featured
          </span>
        )}
        {sale.isLive && (
          <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm animate-pulse">
            🔴 LIVE NOW
          </span>
        )}
        {openNow && !sale.isLive && (
          <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
            Open Now
          </span>
        )}
        {startingSoon && !openNow && (
          <span className="absolute right-3 top-3 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
            Starting Soon
          </span>
        )}
        {sale.photos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white">
            +{sale.photos.length - 1} photos
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
            {saleTypeLabel}
          </span>
          {sale.categories.slice(0, 2).map((cat) => (
            <span key={cat} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              <Tag size={9} />
              {cat.replace('_', ' ')}
            </span>
          ))}
          {sale.categories.length > 2 && (
            <span className="text-[11px] text-slate-400">+{sale.categories.length - 2}</span>
          )}
        </div>

        <h3 className={`line-clamp-2 font-bold text-slate-900 ${sale.isFeatured ? 'text-base sm:text-lg' : 'text-sm sm:text-base'}`}>{sale.title}</h3>

        <div className="flex items-center gap-1 text-xs text-slate-500">
          <MapPin size={12} className="shrink-0 text-slate-400" />
          <span className="truncate">{sale.address}, {sale.city}, {sale.state} {sale.zipCode}</span>
        </div>

        {sale.distanceMiles != null && (
          <p className="text-xs font-semibold text-emerald-700">{sale.distanceMiles.toFixed(1)} mi away</p>
        )}

        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Calendar size={12} className="shrink-0 text-slate-400" />
          <span>{formatDateRange(sale.startDate, sale.endDate)}</span>
        </div>

        {priceRange && (
          <p className="text-sm font-black text-amber-600">{priceRange}</p>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Star size={12} className="text-slate-300" />
            <span>{sale._count?.favorites ?? 0} saved</span>
            <span className="mx-1">·</span>
            <Clock size={12} className="text-slate-300" />
            <span>{sale.viewCount} views</span>
          </div>
          <Link
            href={`/garage-sales/${sale.id}`}
            className="btn-brand py-1.5 text-xs"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}
