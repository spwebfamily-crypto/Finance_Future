const RESERVED_CATEGORY_NAMES = new Set(["outros"]);

/** Normalizes a user-facing category name for product rules, not for storage. */
export function normalizeCategoryName(name: string | null | undefined) {
  return (name ?? "").trim().toLocaleLowerCase("pt-PT");
}

export function isReservedCategoryName(name: string | null | undefined) {
  return RESERVED_CATEGORY_NAMES.has(normalizeCategoryName(name));
}

export const RESERVED_CATEGORY_ERROR = {
  code: "CATEGORY_RESERVED",
  message: 'A categoria "Outros" deixou de existir. Escolha outra categoria.',
} as const;
