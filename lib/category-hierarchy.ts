import { LEGACY_CATEGORY_ALIAS_FALLBACK } from '@/lib/category-aliases';

export interface CategoryHierarchyNode {
  id: string;
  name: string;
  slug: string;
  aliases?: string[] | null;
  parentId: string | null;
  level: number;
}

type NormalizedPath = {
  root: CategoryHierarchyNode;
  branch: CategoryHierarchyNode | null;
  leaf: CategoryHierarchyNode;
  path: CategoryHierarchyNode[];
};

type ValidationError = {
  ok: false;
  message: string;
};

type ValidationSuccess = {
  ok: true;
  categoryId: string;
  subcategoryId: string | null;
  displayName: string;
  path: CategoryHierarchyNode[];
};

export type CategorySelectionValidationResult = ValidationError | ValidationSuccess;

export type LegacyCategoryResolution = {
  categoryId: string | null;
  subcategoryId: string | null;
  displayName: string | null;
  path: CategoryHierarchyNode[];
  stale: boolean;
  repaired: boolean;
  reason: string | null;
};

function normalizeTerm(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getLookup(categories: CategoryHierarchyNode[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

function getNodeTerms(node: CategoryHierarchyNode): string[] {
  return [
    node.name,
    node.slug,
    ...(Array.isArray(node.aliases) ? node.aliases : []),
    ...(LEGACY_CATEGORY_ALIAS_FALLBACK[node.slug.toLowerCase()] ?? []),
  ]
    .map((value) => normalizeTerm(value))
    .filter(Boolean);
}

function getPathToRoot(
  node: CategoryHierarchyNode | null,
  lookup: Map<string, CategoryHierarchyNode>,
): CategoryHierarchyNode[] | null {
  if (!node) return null;

  const path: CategoryHierarchyNode[] = [];
  const seen = new Set<string>();
  let current: CategoryHierarchyNode | null = node;

  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    path.push(current);
    current = current.parentId ? (lookup.get(current.parentId) ?? null) : null;
  }

  path.reverse();
  if (path.length === 0 || path[0]?.level !== 0) return null;
  for (let index = 1; index < path.length; index += 1) {
    if (path[index]?.parentId !== path[index - 1]?.id) return null;
  }
  return path;
}

function getNormalizedPath(
  node: CategoryHierarchyNode | null,
  lookup: Map<string, CategoryHierarchyNode>,
): NormalizedPath | null {
  const path = getPathToRoot(node, lookup);
  if (!path || path.length === 0) return null;

  const root = path[0];
  const branch = path.find((entry) => entry.level === 1) ?? null;
  const leaf = path[path.length - 1];

  if (!root || !leaf) return null;

  return { root, branch, leaf, path };
}

function formatPath(path: Array<string | null | undefined>) {
  return path.filter(Boolean).join(' > ');
}

function resolveLabelMatch(
  categoryLabel: string | null | undefined,
  categories: CategoryHierarchyNode[],
  lookup: Map<string, CategoryHierarchyNode>,
  hints?: {
    rootId?: string | null;
    branchId?: string | null;
  },
): CategoryHierarchyNode | null {
  const normalizedLabel = normalizeTerm(categoryLabel ?? '');
  if (!normalizedLabel) return null;

  let matches = categories.filter((node) => getNodeTerms(node).includes(normalizedLabel));
  if (hints?.rootId) {
    matches = matches.filter((node) => getNormalizedPath(node, lookup)?.root.id === hints.rootId);
  }
  if (hints?.branchId) {
    matches = matches.filter((node) => getNormalizedPath(node, lookup)?.branch?.id === hints.branchId);
  }

  if (matches.length === 1) return matches[0];

  const exactNameMatches = matches.filter((node) => normalizeTerm(node.name) === normalizedLabel);
  if (exactNameMatches.length === 1) return exactNameMatches[0];

  return null;
}

function pickLeafFromIds(
  nodes: CategoryHierarchyNode[],
  lookup: Map<string, CategoryHierarchyNode>,
): CategoryHierarchyNode | null {
  if (nodes.length === 0) return null;

  const ranked = [...nodes].sort((a, b) => b.level - a.level);
  return ranked.find((candidate) => {
    const path = getNormalizedPath(candidate, lookup)?.path ?? [];
    const pathIds = new Set(path.map((entry) => entry.id));
    return nodes.every((node) => pathIds.has(node.id));
  }) ?? null;
}

export function validateCategorySelection(
  categories: CategoryHierarchyNode[],
  input: {
    categoryId?: string | null;
    subcategoryId?: string | null;
    parentCategoryId?: string | null;
    categoryLabel?: string | null;
  },
): CategorySelectionValidationResult {
  const lookup = getLookup(categories);
  const categoryId = input.categoryId?.trim() ?? '';
  const subcategoryId = input.subcategoryId?.trim() ?? '';
  const parentCategoryId = input.parentCategoryId?.trim() ?? '';
  const categoryLabel = input.categoryLabel?.trim() ?? '';

  if (!categoryId) {
    return { ok: false, message: 'Please select a category.' };
  }

  const root = lookup.get(categoryId);
  if (!root) {
    return {
      ok: false,
      message: `Invalid category path: ${formatPath([categoryLabel || categoryId])}. The selected main category is no longer valid.`,
    };
  }

  if (root.level !== 0) {
    const path = getNormalizedPath(root, lookup)?.path.map((entry) => entry.name) ?? [root.name];
    return {
      ok: false,
      message: `Invalid category path: ${formatPath(path)}. "${root.name}" is not a main category.`,
    };
  }

  if (!subcategoryId) {
    return {
      ok: true,
      categoryId: root.id,
      subcategoryId: null,
      displayName: root.name,
      path: [root],
    };
  }

  const leaf = lookup.get(subcategoryId);
  if (!leaf) {
    return {
      ok: false,
      message: `Invalid category path: ${formatPath([root.name, categoryLabel || subcategoryId])}. The selected subcategory is no longer valid.`,
    };
  }

  const normalizedLeaf = getNormalizedPath(leaf, lookup);
  if (!normalizedLeaf || normalizedLeaf.root.id !== root.id) {
    const submittedParent = parentCategoryId ? lookup.get(parentCategoryId)?.name ?? parentCategoryId : null;
    const attemptedPath = formatPath([root.name, submittedParent, leaf.name]);
    const actualPath = normalizedLeaf?.path.map((entry) => entry.name) ?? [leaf.name];
    return {
      ok: false,
      message: `Invalid category path: ${attemptedPath || formatPath([root.name, ...actualPath.slice(1)])}. "${leaf.name}" does not belong under "${root.name}".`,
    };
  }

  if (parentCategoryId) {
    const parent = lookup.get(parentCategoryId);
    if (!parent) {
      return {
        ok: false,
        message: `Invalid category path: ${formatPath([root.name, leaf.name])}. The selected parent category is no longer valid.`,
      };
    }

    const immediateParent = normalizedLeaf.path[normalizedLeaf.path.length - 2] ?? null;
    if (!immediateParent || immediateParent.id !== parent.id) {
      return {
        ok: false,
        message: `Invalid category path: ${formatPath([root.name, parent.name, leaf.name])}. "${leaf.name}" does not belong under "${parent.name}".`,
      };
    }
  }

  return {
    ok: true,
    categoryId: root.id,
    subcategoryId: leaf.level > 0 ? leaf.id : null,
    displayName: leaf.name,
    path: normalizedLeaf.path,
  };
}

export function resolveLegacyCategorySelection(
  categories: CategoryHierarchyNode[],
  input: {
    categoryId?: string | null;
    subcategoryId?: string | null;
    categoryLabel?: string | null;
  },
): LegacyCategoryResolution {
  const lookup = getLookup(categories);
  const resolvedNodes = [input.categoryId, input.subcategoryId]
    .map((id) => id?.trim() ?? '')
    .filter(Boolean)
    .map((id) => lookup.get(id))
    .filter((node): node is CategoryHierarchyNode => Boolean(node));

  const leafFromIds = pickLeafFromIds(resolvedNodes, lookup);
  const normalizedFromIds = getNormalizedPath(leafFromIds, lookup);

  let leaf = normalizedFromIds?.leaf ?? null;
  let reason: string | null = null;

  const labelMatch = resolveLabelMatch(
    input.categoryLabel,
    categories,
    lookup,
    {
      rootId: normalizedFromIds?.root.id ?? null,
      branchId: normalizedFromIds?.branch?.id ?? null,
    },
  );
  const normalizedFromLabel = getNormalizedPath(labelMatch, lookup);

  if (normalizedFromLabel) {
    if (!leaf) {
      leaf = normalizedFromLabel.leaf;
      reason = 'Matched legacy category label to the current category tree.';
    } else if (normalizedFromLabel.path.length > (normalizedFromIds?.path.length ?? 0)) {
      leaf = normalizedFromLabel.leaf;
      reason = 'Extended the stored category path using the saved category label.';
    }
  } else if (resolvedNodes.length > 0 && !leafFromIds) {
    reason = 'Stored category IDs no longer form a valid hierarchy.';
  }

  const normalized = getNormalizedPath(leaf, lookup);
  if (!normalized) {
    return {
      categoryId: null,
      subcategoryId: null,
      displayName: input.categoryLabel?.trim() || null,
      path: [],
      stale: Boolean((input.categoryId ?? input.subcategoryId ?? input.categoryLabel)?.trim()),
      repaired: false,
      reason: reason ?? 'Unable to resolve the stored category selection.',
    };
  }

  const nextCategoryId = normalized.root.id;
  const nextSubcategoryId = normalized.leaf.level > 0 ? normalized.leaf.id : null;
  const nextDisplayName = normalized.leaf.name;
  const repaired =
    nextCategoryId !== (input.categoryId?.trim() || null)
    || nextSubcategoryId !== (input.subcategoryId?.trim() || null)
    || nextDisplayName !== (input.categoryLabel?.trim() || null);

  return {
    categoryId: nextCategoryId,
    subcategoryId: nextSubcategoryId,
    displayName: nextDisplayName,
    path: normalized.path,
    stale: false,
    repaired,
    reason,
  };
}
