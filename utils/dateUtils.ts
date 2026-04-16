// Siempre usa el timezone local del dispositivo para evitar bugs UTC vs MX.
// NO uses `new Date().toISOString().split('T')[0]` en ninguna parte — usa los helpers de aquí.

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function getTodayString(): string {
  return toLocalDateString(new Date());
}

/** Suma/resta días a una fecha (inmutable) y devuelve la nueva Date. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Fecha local de mañana en formato YYYY-MM-DD. */
export function getTomorrowString(): string {
  return toLocalDateString(addDays(new Date(), 1));
}

/** Fecha local a N días en formato YYYY-MM-DD. Útil para ventanas semanales. */
export function getDateStringDaysFromNow(days: number): string {
  return toLocalDateString(addDays(new Date(), days));
}

/** Primer día del mes especificado (o actual) en formato YYYY-MM-DD. */
export function getMonthStartString(year?: number, month?: number): string {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth();
  return toLocalDateString(new Date(y, m, 1));
}

/** Último día del mes especificado (o actual) en formato YYYY-MM-DD. */
export function getMonthEndString(year?: number, month?: number): string {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth();
  return toLocalDateString(new Date(y, m + 1, 0));
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
