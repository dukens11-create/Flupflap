const CATEGORY_ALIAS_GROUPS = [
  {
    keys: ['perfume fragrance', 'perfume and fragrance', 'perfume', 'fragrance'],
    aliases: ['perfume', 'parfum', 'fragrance', 'cologne', 'spray'],
  },
  {
    keys: ['fashion', 'clothing'],
    aliases: ['fashion', 'clothes', 'clothing', 'apparel', 'outfit', 'wear'],
  },
  {
    keys: ['t shirt', 't shirts', 'tshirts', 'tshirt', 'tee shirt'],
    aliases: ['tshirt', 't shirt', 't-shirt', 'tee', 'tee shirt', 'shirt'],
  },
  {
    keys: ['shoes', 'shoe', 'footwear'],
    aliases: ['shoes', 'sneakers', 'footwear', 'kicks', 'boots', 'sandals'],
  },
  {
    keys: ['electronics', 'electronic'],
    aliases: ['electronics', 'phone', 'cellphone', 'laptop', 'computer', 'charger', 'headphones'],
  },
  {
    keys: ['beauty'],
    aliases: ['beauty', 'makeup', 'cosmetics', 'skincare', 'lotion', 'cream'],
  },
  {
    keys: ['intimate wellness', 'adult wellness', 'sexual wellness', 'sex toys'],
    aliases: ['intimate wellness', 'adult wellness', 'sexual wellness', 'sex toys', 'personal massager', 'couples wellness'],
  },
] as const;

const COMMON_TYPO_REDIRECTS: Record<string, string[]> = {
  tshit: ['tshirt', 'shirt'],
  't shit': ['tshirt', 'shirt'],
};

export function normalizeSearchText(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function compact(value: string) {
  return value.replace(/\s+/g, '');
}

function singularizeWord(word: string) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function pluralizeWord(word: string) {
  if (word.endsWith('y') && word.length > 2) return `${word.slice(0, -1)}ies`;
  if (word.endsWith('s')) return word;
  return `${word}s`;
}

function getTokenVariants(token: string) {
  const singular = singularizeWord(token);
  const plural = pluralizeWord(singular);
  return unique([token, singular, plural]);
}

function getCategoryAliasTerms(seedTerms: string[]) {
  const normalizedSeed = seedTerms.map((term) => normalizeSearchText(term)).filter(Boolean);
  const seedText = ` ${normalizedSeed.join(' ')} `;
  const compactSeedText = compact(seedText);
  const aliases: string[] = [];

  for (const group of CATEGORY_ALIAS_GROUPS) {
    const hasMatch = group.keys.some((key) => {
      const normalizedKey = normalizeSearchText(key);
      return seedText.includes(` ${normalizedKey} `) || compactSeedText.includes(compact(normalizedKey));
    });
    if (hasMatch) aliases.push(...group.aliases);
  }

  return unique(aliases.map((alias) => normalizeSearchText(alias)).filter(Boolean));
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function parseTextValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[;,|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return unique(value.flatMap((item) => parseTextValues(item)));
  }
  return [];
}

export function getSearchVariants(rawQuery: string | null | undefined): string[] {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return [];

  const typoExpansions = COMMON_TYPO_REDIRECTS[normalizedQuery] ?? [];
  const seeds = unique([normalizedQuery, ...typoExpansions.map((item) => normalizeSearchText(item))]);

  const variants = new Set<string>();
  for (const seed of seeds) {
    variants.add(seed);
    variants.add(compact(seed));

    const tokens = seed.split(' ').filter(Boolean);
    const tokenVariants = tokens.flatMap((token) => getTokenVariants(token));
    for (const token of tokenVariants) {
      variants.add(token);
      variants.add(compact(token));
    }
    if (tokens.length > 1) {
      variants.add(tokens.join(' '));
      variants.add(tokens.join(''));
    }
  }

  const aliasTerms = getCategoryAliasTerms(seeds);
  for (const alias of aliasTerms) {
    variants.add(alias);
    variants.add(compact(alias));
  }

  return [...variants].filter(Boolean);
}

export function buildProductSearchableText(input: {
  title?: string | null;
  description?: string | null;
  brand?: string | null;
  condition?: string | null;
  categoryName?: string | null;
  categoryPath?: string | null;
  tags?: unknown;
  keywords?: unknown;
}): string {
  const seedValues = unique([
    normalizeSearchText(input.title),
    normalizeSearchText(input.description),
    normalizeSearchText(input.brand),
    normalizeSearchText(input.condition),
    normalizeSearchText(input.categoryName),
    normalizeSearchText(input.categoryPath),
    ...parseTextValues(input.tags).map((item) => normalizeSearchText(item)),
    ...parseTextValues(input.keywords).map((item) => normalizeSearchText(item)),
  ]);

  const aliasTerms = getCategoryAliasTerms(seedValues);
  const tokenTerms = seedValues
    .flatMap((value) => value.split(' ').filter(Boolean))
    .flatMap((token) => getTokenVariants(token));

  return unique([
    ...seedValues,
    ...seedValues.map((value) => compact(value)),
    ...aliasTerms,
    ...aliasTerms.map((alias) => compact(alias)),
    ...tokenTerms,
  ]).join(' ');
}

export function searchTextMatchesQuery(searchableText: string, query: string): boolean {
  const normalizedSearchableText = normalizeSearchText(searchableText);
  if (!normalizedSearchableText) return false;

  const searchVariants = getSearchVariants(query);
  if (searchVariants.length === 0) return true;

  const compactSearchableText = compact(normalizedSearchableText);
  const exact = searchVariants.some((variant) => {
    if (!variant) return false;
    return normalizedSearchableText.includes(variant) || compactSearchableText.includes(compact(variant));
  });
  if (exact) return true;

  const searchableTokens = unique(normalizedSearchableText.split(' ').filter(Boolean));
  return searchVariants.some((variant) => {
    if (variant.length < 4) return false;
    const normalizedVariant = normalizeSearchText(variant);
    if (!normalizedVariant) return false;
    return searchableTokens.some((token) => {
      if (Math.abs(token.length - normalizedVariant.length) > 2) return false;
      return levenshteinDistance(token, normalizedVariant) <= 1;
    });
  });
}

export function searchTextMatchesQueryWithoutFuzzy(searchableText: string, query: string): boolean {
  const normalizedSearchableText = normalizeSearchText(searchableText);
  if (!normalizedSearchableText) return false;

  const searchVariants = getSearchVariants(query);
  if (searchVariants.length === 0) return true;

  const compactSearchableText = compact(normalizedSearchableText);
  return searchVariants.some((variant) => {
    if (!variant) return false;
    return normalizedSearchableText.includes(variant) || compactSearchableText.includes(compact(variant));
  });
}
