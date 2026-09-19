function monetaryAmount(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  // Intl can render tiny negative IEEE-754 values as “-0,00 €”. Financial
  // displays should never communicate a negative zero.
  return Number.isFinite(amount) && Math.abs(amount) >= 0.005 ? amount : 0;
}

export function formatCurrency(value: string | number, currency = "EUR", locale = "pt-PT") {
  const amount = monetaryAmount(value);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

/** Formats a financial result with a visible sign, while keeping zero neutral. */
export function formatSignedCurrency(value: string | number, currency = "EUR", locale = "pt-PT") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    signDisplay: "exceptZero",
  }).format(monetaryAmount(value));
}

/** Parses the grouped decimal notation used by the Portuguese form fields. */
export function parseMoney(value: string) {
  const raw = value.trim().replace(/\u00a0/g, " ");
  if (!raw || !/^\d+(?:[ .,]\d+)*$/.test(raw)) return Number.NaN;

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  let decimalSeparator: "," | "." | null = null;
  if (commaCount && dotCount) {
    decimalSeparator = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
  } else {
    const separator = commaCount ? "," : dotCount ? "." : null;
    const count = commaCount || dotCount;
    if (separator && count === 1) {
      const decimalLength = raw.length - raw.lastIndexOf(separator) - 1;
      if (decimalLength <= 2) decimalSeparator = separator;
      else if (decimalLength !== 3) return Number.NaN;
    }
  }

  const decimalIndex = decimalSeparator ? raw.lastIndexOf(decimalSeparator) : -1;
  const integerPart = decimalIndex >= 0 ? raw.slice(0, decimalIndex) : raw;
  const fraction = decimalIndex >= 0 ? raw.slice(decimalIndex + 1) : "";
  if (decimalSeparator && !/^\d{1,2}$/.test(fraction)) return Number.NaN;

  const groupingCharacters = [...new Set(integerPart.replace(/\d/g, "").split("").filter(Boolean))];
  if (groupingCharacters.length > 1 || groupingCharacters[0] === decimalSeparator)
    return Number.NaN;
  const groups = groupingCharacters.length
    ? integerPart.split(groupingCharacters[0])
    : [integerPart];
  if (
    !/^\d+$/.test(groups[0]) ||
    (groups.length > 1 &&
      (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))))
  ) {
    return Number.NaN;
  }

  const normalized = `${groups.join("")}${fraction ? `.${fraction}` : ""}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseSignedMoney(value: string) {
  const raw = value.trim();
  const negative = raw.startsWith("-");
  const parsed = parseMoney(negative ? raw.slice(1) : raw);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : Number.NaN;
}

export function formatDate(
  value: string | Date,
  locale = "pt-PT",
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
) {
  const rawValue = value instanceof Date ? value : value;
  const datePart = typeof rawValue === "string" ? rawValue.slice(0, 10) : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(datePart)
    ? new Date(`${datePart}T12:00:00`)
    : rawValue instanceof Date
      ? rawValue
      : new Date(rawValue);

  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function toDateInputValue(value: string) {
  return value ? value.slice(0, 10) : "";
}

export function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
