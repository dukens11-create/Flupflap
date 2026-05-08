import { prisma } from './db';

const LOOKBACK_WINDOW_DAYS = 30;
const RAPID_POSTING_HOURS = 24;
const RISKY_LANGUAGE_PATTERN = /\b(whatsapp|telegram|cash\s?app|cashapp|wire transfer|friends?\s+and\s+family|gift card|crypto only|urgent sale|dm me)\b/i;

export type ListingRiskReason = {
  code: string;
  label: string;
  detail: string;
  score: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  duplicateProductIds?: string[];
};

export type ListingRiskAssessment = {
  score: number;
  level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: ListingRiskReason[];
};

export type ListingRiskCandidate = {
  id?: string;
  sellerId: string;
  title: string;
  description: string;
  priceCents: number;
  category: string;
  condition: string;
  imageUrl: string;
  createdAt?: Date;
};

export type ListingRiskContextListing = ListingRiskCandidate & {
  id: string;
  status?: string;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return [] as string[];
  return normalized.split(' ').filter(Boolean);
}

function overlapScore(a: string, b: string) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function dedupeReasons(reasons: ListingRiskReason[]) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.code}:${reason.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getListingRiskAssessment(
  candidate: ListingRiskCandidate,
  listings: ListingRiskContextListing[],
  sellerRecentListingCount: number,
) {
  const reasons: ListingRiskReason[] = [];
  const normalizedTitle = normalizeText(candidate.title);
  const normalizedDescription = normalizeText(candidate.description);
  const descriptionWords = tokenize(candidate.description);
  const others = listings.filter((listing) => listing.id !== candidate.id);

  const duplicateMatches = others
    .map((listing) => {
      const titleSimilarity = overlapScore(normalizedTitle, listing.title);
      const descriptionSimilarity = overlapScore(normalizedDescription, listing.description);
      const sameImage = listing.imageUrl === candidate.imageUrl;
      const samePriceBand =
        candidate.priceCents > 0 &&
        Math.abs(listing.priceCents - candidate.priceCents) / candidate.priceCents <= 0.15;

      let confidence = 0;
      if (sameImage && samePriceBand && titleSimilarity >= 0.45) {
        confidence = 95;
      } else if (titleSimilarity >= 0.92 && descriptionSimilarity >= 0.75) {
        confidence = 88;
      } else if (titleSimilarity >= 0.8 && descriptionSimilarity >= 0.82) {
        confidence = 72;
      } else if (listing.sellerId === candidate.sellerId && titleSimilarity >= 0.7 && samePriceBand) {
        confidence = 60;
      }

      return confidence > 0
        ? {
            id: listing.id,
            title: listing.title,
            sellerId: listing.sellerId,
            confidence,
          }
        : null;
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  if (duplicateMatches.length > 0) {
    const strongest = duplicateMatches[0];
    const crossSellerClone = duplicateMatches.some((match) => match.sellerId !== candidate.sellerId);
    reasons.push({
      code: 'duplicate_listing',
      label: 'Likely duplicate listing',
      detail: crossSellerClone
        ? 'This listing closely matches another seller listing in title, description, or photo.'
        : 'This listing closely matches another recent listing from the same seller.',
      score: crossSellerClone ? 70 : 60,
      severity: crossSellerClone ? 'HIGH' : 'MEDIUM',
      duplicateProductIds: duplicateMatches.map((match) => match.id),
    });

    if (strongest.confidence >= 90) {
      reasons.push({
        code: 'duplicate_image',
        label: 'Reused listing image',
        detail: 'A near-identical listing image and price were found in another recent listing.',
        score: 25,
        severity: 'MEDIUM',
        duplicateProductIds: duplicateMatches.map((match) => match.id),
      });
    }
  }

  const comparisonPrices = others
    .filter((listing) => listing.category === candidate.category)
    .map((listing) => listing.priceCents)
    .filter((value) => value > 0);
  const categoryMedian = comparisonPrices.length >= 5 ? median(comparisonPrices) : null;

  if (categoryMedian && candidate.priceCents < categoryMedian * 0.35) {
    reasons.push({
      code: 'price_outlier',
      label: 'Price far below category norm',
      detail: `The asking price is much lower than similar ${candidate.category.toLowerCase()} listings.`,
      score: 35,
      severity: 'HIGH',
    });
  }

  if (sellerRecentListingCount >= 3) {
    reasons.push({
      code: 'rapid_posting',
      label: 'Rapid posting pattern',
      detail: `Seller created ${sellerRecentListingCount} listings in the last ${RAPID_POSTING_HOURS} hours.`,
      score: 25,
      severity: 'MEDIUM',
    });
  }

  if (candidate.description.trim().length < 40 || descriptionWords.length < 8) {
    reasons.push({
      code: 'thin_description',
      label: 'Thin listing details',
      detail: 'The description is very short, which makes the listing harder to verify.',
      score: 20,
      severity: 'LOW',
    });
  }

  if (RISKY_LANGUAGE_PATTERN.test(`${candidate.title} ${candidate.description}`)) {
    reasons.push({
      code: 'risky_language',
      label: 'Off-platform payment or urgency language',
      detail: 'The listing mentions payment/contact terms often associated with scam attempts.',
      score: 25,
      severity: 'MEDIUM',
    });
  }

  const deduped = dedupeReasons(reasons);
  const score = Math.min(100, deduped.reduce((sum, reason) => sum + reason.score, 0));
  const level =
    score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : score >= 20 ? 'LOW' : 'NONE';

  return {
    score,
    level,
    reasons: deduped,
  } satisfies ListingRiskAssessment;
}

export async function getListingRiskAssessmentForCandidate(
  candidate: ListingRiskCandidate,
  excludeProductId?: string,
) {
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_WINDOW_DAYS);

  const rapidPostingStart = new Date();
  rapidPostingStart.setHours(rapidPostingStart.getHours() - RAPID_POSTING_HOURS);

  const [comparisonListings, sellerRecentListingCount] = await Promise.all([
    prisma.product.findMany({
      where: {
        id: excludeProductId ? { not: excludeProductId } : undefined,
        status: { in: ['PENDING', 'APPROVED', 'SOLD'] },
        createdAt: { gte: lookbackStart },
        OR: [
          { sellerId: candidate.sellerId },
          { category: candidate.category },
        ],
      },
      select: {
        id: true,
        sellerId: true,
        title: true,
        description: true,
        priceCents: true,
        category: true,
        condition: true,
        imageUrl: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 120,
    }),
    prisma.product.count({
      where: {
        sellerId: candidate.sellerId,
        createdAt: { gte: rapidPostingStart },
        ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      },
    }),
  ]);

  return getListingRiskAssessment(candidate, comparisonListings, sellerRecentListingCount);
}
