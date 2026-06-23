export const INTIMATE_WELLNESS_CATEGORY = {
  id: 'health-wellness-intimate-wellness',
  slug: 'health-wellness-intimate-wellness',
  name: 'Intimate Wellness',
  aliases: [
    'intimate wellness',
    'adult wellness',
    'sexual wellness',
    'sex toys',
    'personal massagers',
    'couples wellness',
  ],
  moderationLabel: '18+ review',
  sellerGuidance: 'Use discreet thumbnails, professional descriptions, and wellness-focused product details. Listings in this category are reviewed before going live.',
  buyerNotice: '18+ wellness item. Images and descriptions must stay discreet and professional.',
  adminGuidance: 'Confirm the listing uses discreet imagery, wellness-focused copy, and complies with prohibited-item rules before approval.',
} as const;

function normalizeCategoryTerm(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isAdultWellnessCategory(input: {
  categoryId?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  categoryPath?: string | null;
}) {
  const directTerms = [
    input.categoryId,
    input.categorySlug,
    input.categoryName,
  ].map((value) => normalizeCategoryTerm(value));
  const path = normalizeCategoryTerm(input.categoryPath);
  const aliases = [
    INTIMATE_WELLNESS_CATEGORY.id,
    INTIMATE_WELLNESS_CATEGORY.slug,
    INTIMATE_WELLNESS_CATEGORY.name,
    ...INTIMATE_WELLNESS_CATEGORY.aliases,
  ].map((value) => normalizeCategoryTerm(value));

  if (directTerms.some((term) => aliases.includes(term))) {
    return true;
  }

  return aliases.some((term) => term && path.includes(term));
}
