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
      options: [...PERFUME_SIZE_OPTIONS],
    };
  });
}
