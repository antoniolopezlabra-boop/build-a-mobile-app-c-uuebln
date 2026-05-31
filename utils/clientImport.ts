// ══════════════════════════════════════════════════════════════════
// clientImport.ts — Lógica PURA del import de clientes desde Excel/CSV.
//
// No importa nada de React Native a propósito: así se puede testear en
// Node y reusar desde la pantalla. La pantalla (import-excel.tsx) se
// encarga de leer el archivo y de llamar a estas funciones.
//
// Reglas de negocio (acordadas con Antonio):
//   • Obligatorios: Nombre + Teléfono. Email y Fecha de nacimiento opcionales.
//   • Teléfono se normaliza a "+52 ##########" (mismo formato que el alta
//     manual) — el usuario lo escribe como quiera.
//   • Duplicados por teléfono (últimos 10 dígitos): se SALTAN, no se duplican.
//   • Un campo opcional inválido (email sin @, fecha ilegible) NO descarta la
//     fila: se importa sin ese campo y se anota.
// ══════════════════════════════════════════════════════════════════

export interface ParsedClient {
  name: string;
  phone: string;            // canónico: "+52 ##########"
  email?: string;
  birthday?: string;        // "YYYY-MM-DD"
}

export type RowStatus = 'ok' | 'invalid' | 'duplicate_existing' | 'duplicate_file';

export interface RowResult {
  row: number;              // número de fila en el archivo (1-based, sin contar encabezado)
  rawName: string;
  rawPhone: string;
  status: RowStatus;
  reasons: string[];        // motivos legibles en español
  client?: ParsedClient;    // presente cuando status === 'ok'
  key?: string;             // últimos 10 dígitos (para dedup)
}

export interface ImportAnalysis {
  results: RowResult[];
  okResults: RowResult[];
  okCount: number;
  invalidCount: number;
  dupExistingCount: number;
  dupFileCount: number;
  total: number;            // filas con algún dato (excluye filas vacías)
}

export interface ColumnMap {
  name: number;
  phone: number;
  email: number;
  birthday: number;
}

// ── Helpers de texto ────────────────────────────────────────
function norm(s: any): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[^a-z0-9]/g, '');        // solo alfanumérico
}

// ── Teléfono ────────────────────────────────────────────
export function digitsOnly(raw: any): string {
  return String(raw ?? '').replace(/[^0-9]/g, '');
}

/** Clave de dedup: últimos 10 dígitos (ignora prefijo de país). */
export function normalizePhoneKey(raw: any): string {
  let d = digitsOnly(raw);
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3); // 52 + 1 (móvil viejo)
  if (d.length > 10) d = d.slice(-10);
  return d;
}

/** Formato canónico de guardado: "+52 ##########". null si no son 10 dígitos. */
export function canonicalPhone(raw: any): string | null {
  const key = normalizePhoneKey(raw);
  if (key.length !== 10) return null;
  return '+52 ' + key;
}

// ── Fecha de nacimiento ────────────────────────────────────
// Devuelve "YYYY-MM-DD" | null (vacío) | 'invalid' (presente pero ilegible).
export function parseBirthday(raw: any): string | null | 'invalid' {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;

  // SheetJS con cellDates:true puede entregar un Date
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return fmt(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }

  const s = String(raw).trim();

  // YYYY-MM-DD o YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return validate(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY o DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return validate(+m[3], +m[2], +m[1]);

  return 'invalid';

  function fmt(y: number, mo: number, d: number): string {
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function validate(y: number, mo: number, d: number): string | 'invalid' {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return 'invalid';
    if (y < 1900 || y > new Date().getFullYear()) return 'invalid';
    return fmt(y, mo, d);
  }
}

// ── Email ─────────────────────────────────────────────
export function isValidEmail(raw: any): boolean {
  const s = String(raw ?? '').trim();
  return s.length > 0 && s.includes('@') && s.includes('.');
}

// ── Mapeo de columnas (tolerante a acentos/mayúsculas/sinónimos) ──
export function matchColumns(headers: any[]): ColumnMap {
  const map: ColumnMap = { name: -1, phone: -1, email: -1, birthday: -1 };
  headers.forEach((h, i) => {
    const n = norm(h);
    if (map.name === -1 && n.includes('nombre')) map.name = i;
    else if (map.phone === -1 && (n.includes('telefono') || n.includes('celular') || n.includes('whatsapp') || n.includes('movil') || n === 'tel' || n.includes('numero'))) map.phone = i;
    else if (map.email === -1 && (n.includes('correo') || n.includes('email') || n.includes('mail'))) map.email = i;
    else if (map.birthday === -1 && (n.includes('nacimiento') || n.includes('cumple') || n.includes('fecha'))) map.birthday = i;
  });
  return map;
}

// ── Análisis principal ────────────────────────────────────
// matrix: array de filas; la PRIMERA fila son los encabezados.
// existingPhones: teléfonos ya guardados (en cualquier formato).
export function analyzeRows(matrix: any[][], existingPhones: string[]): ImportAnalysis {
  const results: RowResult[] = [];
  const existingKeys = new Set<string>();
  for (const p of existingPhones) {
    const k = normalizePhoneKey(p);
    if (k) existingKeys.add(k);
  }
  const seenInFile = new Set<string>();

  const headers = matrix.length > 0 ? matrix[0] : [];
  const cols = matchColumns(headers);

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const rawName  = cols.name     >= 0 ? String(r[cols.name]     ?? '').trim() : '';
    const rawPhone = cols.phone    >= 0 ? String(r[cols.phone]    ?? '').trim() : '';
    const rawEmail = cols.email    >= 0 ? String(r[cols.email]    ?? '').trim() : '';
    const rawBday  = cols.birthday >= 0 ? r[cols.birthday]                       : '';

    // Fila completamente vacía → se ignora en silencio.
    if (!rawName && !rawPhone && !rawEmail && (rawBday === '' || rawBday == null)) continue;

    // Fila de ejemplo de la plantilla (si el usuario olvidó borrarla) → se ignora.
    if (norm(rawName).includes('ejemplo')) continue;

    const rowNum = i; // 1-based respecto a filas de datos
    const reasons: string[] = [];

    const phone = canonicalPhone(rawPhone);
    let invalid = false;
    if (!rawName) { reasons.push('Falta el nombre'); invalid = true; }
    if (!phone)   { reasons.push('Teléfono inválido (deben ser 10 dígitos)'); invalid = true; }

    if (invalid) {
      results.push({ row: rowNum, rawName, rawPhone, status: 'invalid', reasons });
      continue;
    }

    const key = normalizePhoneKey(rawPhone);

    if (existingKeys.has(key)) {
      results.push({ row: rowNum, rawName, rawPhone, status: 'duplicate_existing', reasons: ['Ya existe en tu lista'], key });
      continue;
    }
    if (seenInFile.has(key)) {
      results.push({ row: rowNum, rawName, rawPhone, status: 'duplicate_file', reasons: ['Repetido dentro del archivo'], key });
      continue;
    }
    seenInFile.add(key);

    const client: ParsedClient = { name: rawName, phone: phone as string };

    if (rawEmail) {
      if (isValidEmail(rawEmail)) client.email = rawEmail;
      else reasons.push('Correo ignorado (formato inválido)');
    }

    const bday = parseBirthday(rawBday);
    if (bday === 'invalid') reasons.push('Fecha de nacimiento ignorada (formato inválido)');
    else if (bday) client.birthday = bday;

    results.push({ row: rowNum, rawName, rawPhone, status: 'ok', reasons, client, key });
  }

  const okResults = results.filter(r => r.status === 'ok');
  return {
    results,
    okResults,
    okCount: okResults.length,
    invalidCount: results.filter(r => r.status === 'invalid').length,
    dupExistingCount: results.filter(r => r.status === 'duplicate_existing').length,
    dupFileCount: results.filter(r => r.status === 'duplicate_file').length,
    total: results.length,
  };
}
