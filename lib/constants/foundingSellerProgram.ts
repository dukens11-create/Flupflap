/**
 * FlupFlap Founding Seller Program Constants
 */

export const FOUNDING_SELLER_PROGRAM = {
  // Program Details
  name: 'FlupFlap Founding Seller Program',
  description: 'Sell free for 1 full year as one of our first 1,000 founding sellers',
  freeYearMonths: 12,
  limitedToSellerCount: 1000,
  
  // Current Program Benefits (Year 1)
  benefits: [
    'No subscription payment for 1 year',
    'No credit card required to start',
    'List and sell products',
    'Host Garage Sales',
    'Go Live with Garage Sales Live',
    'Access your Seller Dashboard',
    'Keep building your business as FlupFlap grows',
  ],
  
  // Fees
  sellingFee: {
    percentage: 7,
    description: '7% selling fee only when you successfully make a sale',
    applicableWhen: 'on_successful_sale',
  },
  
  monthlySubscriptionFee: {
    year1: 0, // FREE
    year2Plus: null, // Optional after year 1
  },
  
  // Post Free Year Subscription Options
  subscriptionTiers: [
    {
      name: 'Garage Seller',
      monthlyPrice: 3.99,
      currency: 'USD',
      description: 'Perfect for selling from your garage',
    },
    {
      name: 'Regular Seller',
      monthlyPrice: 4.99,
      currency: 'USD',
      description: 'For established sellers',
    },
  ],
  
  // Important Notes
  important: {
    autoRenewal: false,
    requiresManualSubscription: true,
    creditCardRequired: false,
    cancellationPolicy: 'No automatic charges',
  },
  
  // CTA
  callToAction: 'BECOME A FOUNDING SELLER',
  tagline: 'JOIN FREE. LIST YOUR PRODUCTS. GO LIVE. START SELLING.',
};

/**
 * Get subscription pricing information
 */
export const getSubscriptionInfo = (monthAfterStart: number) => {
  const freeYear = FOUNDING_SELLER_PROGRAM.freeYearMonths;
  
  if (monthAfterStart <= freeYear) {
    return {
      price: 0,
      status: 'free',
      message: `Free subscription - ${freeYear - monthAfterStart} months remaining`,
    };
  }
  
  return {
    price: null,
    status: 'optional',
    message: 'Choose a subscription tier to continue selling',
    options: FOUNDING_SELLER_PROGRAM.subscriptionTiers,
  };
};

/**
 * Calculate selling fee for a transaction
 */
export const calculateSellingFee = (saleAmount: number): number => {
  const feePercentage = FOUNDING_SELLER_PROGRAM.sellingFee.percentage;
  return (saleAmount * feePercentage) / 100;
};

/**
 * Check if seller is still in free year
 */
export const isSellerInFreeYear = (createdAtDate: Date): boolean => {
  const freeYearMs = FOUNDING_SELLER_PROGRAM.freeYearMonths * 30 * 24 * 60 * 60 * 1000; // Approximate
  const expiryDate = new Date(createdAtDate.getTime() + freeYearMs);
  return new Date() <= expiryDate;
};
