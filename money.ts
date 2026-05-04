export function dollars(cents:number){ return `$${(cents/100).toFixed(2)}`; }
export function cents(amount:string|number){ return Math.round(Number(amount) * 100); }
export function platformFee(cents:number){ const pct = Number(process.env.PLATFORM_FEE_PERCENT || 3); return Math.round(cents * pct / 100); }
export function sellerPayout(cents:number){ return cents - platformFee(cents); }
