const FALLBACK_DEFAULT_PERCENT = 7;
const DEFAULT_MIN_PERCENT = 6;
const DEFAULT_MAX_PERCENT = 8;

export function dollars(cents:number){ return `$${(cents/100).toFixed(2)}`; }
export function cents(amount:string|number){ return Math.round(Number(amount) * 100); }

function defaultCommissionRateBps() {
  const rawPercent = Number(process.env.PLATFORM_FEE_PERCENT ?? FALLBACK_DEFAULT_PERCENT);
  const percent = Number.isFinite(rawPercent)
    ? Math.min(DEFAULT_MAX_PERCENT, Math.max(DEFAULT_MIN_PERCENT, rawPercent))
    : FALLBACK_DEFAULT_PERCENT;
  return Math.round(percent * 100);
}

export function platformFee(cents:number, commissionRateBps:number = defaultCommissionRateBps()){ return Math.round((cents * commissionRateBps) / 10_000); }
export function sellerPayout(cents:number, commissionRateBps:number = defaultCommissionRateBps()){ return cents - platformFee(cents, commissionRateBps); }
