export const PERFUME_SIZE_OPTIONS = [
  '15ml',
  '30ml',
  '50ml',
  '60ml',
  '75ml',
  '80ml',
  '90ml',
  '100ml',
  '120ml',
  '150ml',
  '200ml',
  '250ml',
  '300ml',
  '400ml',
  '500ml',
] as const;

type CategoryAttributeField = {
  name?: string;
  label?: string;
  type?: string;
  options?: string[];
};

/**
 * Validates and normalizes a size_ml value.
 * Accepts a positive number optionally followed by "ml" (case-insensitive).
 * Returns the normalized "Xml" string on success, or null if invalid.
 */
export function normalizeSizeMlValue(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim().toLowerCase();
  const numStr = str.endsWith('ml') ? str.slice(0, -2).trim() : str;
  // Reject if the numeric part contains any non-numeric characters (spaces, letters, etc.)
  if (!/^\d+(\.\d+)?$/.test(numStr)) return null;
  const num = parseFloat(numStr);
  if (isNaN(num) || !isFinite(num) || num <= 0) return null;
  return `${num}ml`;
}

function parseAttributeSchema(attributeSchema: unknown) {
  if (typeof attributeSchema === 'string') {
    try {
      return JSON.parse(attributeSchema);
    } catch {
      return attributeSchema;
    }
  }

  return attributeSchema;
}

export function normalizePerfumeAttributeSchema(attributeSchema: unknown) {
  const parsed = parseAttributeSchema(attributeSchema);

  if (!Array.isArray(parsed)) {
    return parsed;
  }

  return parsed.map((field) => {
    if (!field || typeof field !== 'object') {
      return field;
    }

    const nextField = field as CategoryAttributeField;
    if (nextField.name !== 'size_ml') {
      return nextField;
    }

    return {
      ...nextField,
      type: 'combobox',
      options: [...PERFUME_SIZE_OPTIONS],
    };
  });
}
