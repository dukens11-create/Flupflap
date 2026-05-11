/**
 * Returns a Tailwind CSS class string for a colored condition badge.
 *
 * "New with box" and "New without box" are intentionally styled differently
 * so buyers can distinguish them at a glance.
 */
export function conditionBadgeClass(condition: string | null | undefined): string {
  if (!condition) return 'bg-slate-100 text-slate-600';

  const c = condition.toLowerCase();

  if (c === 'new with box' || c === 'new sealed') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (c === 'new without box' || c === 'new with tags') {
    return 'bg-teal-100 text-teal-700';
  }
  if (c === 'new without tags' || c === 'open box') {
    return 'bg-cyan-100 text-cyan-700';
  }
  if (c === 'new' || c === 'refurbished') {
    return 'bg-blue-100 text-blue-700';
  }
  if (c === 'like new' || c === 'excellent') {
    return 'bg-indigo-100 text-indigo-700';
  }
  if (c === 'very good' || c === 'good') {
    return 'bg-amber-100 text-amber-700';
  }
  if (c === 'fair' || c === 'used' || c === 'pre-owned' || c === 'used (partially used)') {
    return 'bg-orange-100 text-orange-700';
  }
  if (c.startsWith('for parts')) {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-slate-100 text-slate-600';
}
