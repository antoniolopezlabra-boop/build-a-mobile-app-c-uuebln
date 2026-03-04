// Siempre usa el timezone local del dispositivo

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function getTodayString(): string {
  return toLocalDateString(new Date());
}

export function parseLocalDate(dateStr: string): Date {
  // Parsea YYYY-MM-DD sin conversión UTC
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function formatDisplayDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('es-MX', options || {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}
