export function dollars(cents:number){ return `$${(cents/100).toFixed(2)}`; }
export function cents(amount:string|number){ return Math.round(Number(amount) * 100); }

function defaultCommissionRateBps() {
  const rawPercent = Number(process.env.PLATFORM_FEE_PERCENT ?? 7);
  const percent = Number.isFinite(rawPercent) ? Math.min(8, Math.max(6, rawPercent)) : 7;
  return Math.round(percent * 100);
}

export function platformFee(cents:number, commissionRateBps:number = defaultCommissionRateBps()){ return Math.round((cents * commissionRateBps) / 10_000); }
export function sellerPayout(cents:number, commissionRateBps:number = defaultCommissionRateBps()){ return cents - platformFee(cents, commissionRateBps); }
