/**
 * FlupFlap Founding Seller Program Types
 */

export interface FoundingSellerStatus {
  isFoundingSeller: boolean;
  registeredAt: Date;
  freeYearExpiresAt: Date;
  isInFreeYear: boolean;
  monthsRemaining: number;
}

export interface FoundingSellerBenefit {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  monthlyPrice: number;
  currency: string;
  description: string;
  features?: string[];
  isActive?: boolean;
}

export interface SellingFeeStructure {
  percentage: number;
  applicableWhen: 'on_successful_sale' | 'always';
  description: string;
}

export interface FoundingSellerConfig {
  name: string;
  description: string;
  freeYearMonths: number;
  limitedToSellerCount: number;
  benefits: string[];
  sellingFee: SellingFeeStructure;
  monthlySubscriptionFee: {
    year1: number; // Should be 0 (free)
    year2Plus: number | null; // Optional
  };
  subscriptionTiers: SubscriptionTier[];
  callToAction: string;
  tagline: string;
}

export interface FreeYearInfo {
  freeMonthsTotal: number;
  freeMonthsUsed: number;
  freeMonthsRemaining: number;
  status: 'active' | 'expired' | 'about_to_expire';
  expiryDate: Date;
}

export interface SellerSubscriptionStatus {
  type: 'free_year' | 'paid' | 'expired' | 'inactive';
  tier?: SubscriptionTier;
  freeYearInfo?: FreeYearInfo;
  autoRenew: boolean;
  nextBillingDate?: Date;
}

export interface SellingFeeCalculation {
  saleAmount: number;
  feePercentage: number;
  feeAmount: number;
  netAmount: number;
}

export interface FoundingSellerRegistration {
  sellerId: string;
  registeredAt: Date;
  tier: 'founding_seller';
  status: 'active' | 'inactive' | 'suspended';
  currentSubscription: SellerSubscriptionStatus;
}