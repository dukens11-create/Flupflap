const FIXED_COMMISSION_PERCENT = 6;

export function dollars(cents:number){ return `$${(cents/100).toFixed(2)}`; }
export function cents(amount:string|number){ return Math.round(Number(amount) * 100); }

function defaultCommissionRateBps() {
  return Math.round(FIXED_COMMISSION_PERCENT * 100);
}

export function platformFee(cents:number, commissionRateBps:number = defaultCommissionRateBps()){ return Math.round((cents * commissionRateBps) / 10_000); }
export function sellerPayout(cents:number, commissionRateBps:number = defaultCommissionRateBps()){ return cents - platformFee(cents, commissionRateBps); }
