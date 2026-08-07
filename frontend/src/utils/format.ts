export function formatCurrency(value: string | number, currency = 'EUR') {
  const amount = typeof value === 'number' ? value : Number(value);

  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDate(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function toDateInputValue(value: string) {
  return value ? value.slice(0, 10) : '';
}

export function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
