// ═══════════════════════════════════════════════════════════════════════
// constants/mexicoStates.ts
//
// Lista oficial de los 32 estados de la República Mexicana.
// Usada en:
//   • app/settings/business.tsx (dropdown de selección de estado)
//   • components/setup-wizard.tsx (paso de captura de dirección)
//   • Control Center admin (mapeo SVG ↔ nombre de estado)
//
// IMPORTANTE: estos nombres deben coincidir EXACTAMENTE con los IDs/
// nombres usados en el SVG del mapa de México del CRM Web. Cualquier
// cambio aquí requiere actualizar también el componente <MexicoHeatmap />.
//
// Orden alfabético (Aguascalientes → Zacatecas) para mejor UX en el
// dropdown. La INE/INEGI usa este orden oficialmente.
// ═══════════════════════════════════════════════════════════════════════

export interface MexicoState {
  /** Nombre oficial del estado (UI + BD) */
  name: string;
  /** Abreviatura ISO 3166-2:MX usada para tracking analytics y SVG IDs */
  iso: string;
  /** Capital del estado — útil para sugerencia en el campo "Ciudad" */
  capital: string;
}

export const MEXICO_STATES: MexicoState[] = [
  { name: 'Aguascalientes',        iso: 'MX-AGU', capital: 'Aguascalientes' },
  { name: 'Baja California',        iso: 'MX-BCN', capital: 'Mexicali' },
  { name: 'Baja California Sur',    iso: 'MX-BCS', capital: 'La Paz' },
  { name: 'Campeche',               iso: 'MX-CAM', capital: 'San Francisco de Campeche' },
  { name: 'Chiapas',                iso: 'MX-CHP', capital: 'Tuxtla Gutiérrez' },
  { name: 'Chihuahua',              iso: 'MX-CHH', capital: 'Chihuahua' },
  { name: 'Ciudad de México',       iso: 'MX-CMX', capital: 'Ciudad de México' },
  { name: 'Coahuila',               iso: 'MX-COA', capital: 'Saltillo' },
  { name: 'Colima',                 iso: 'MX-COL', capital: 'Colima' },
  { name: 'Durango',                iso: 'MX-DUR', capital: 'Victoria de Durango' },
  { name: 'Estado de México',       iso: 'MX-MEX', capital: 'Toluca de Lerdo' },
  { name: 'Guanajuato',             iso: 'MX-GUA', capital: 'Guanajuato' },
  { name: 'Guerrero',               iso: 'MX-GRO', capital: 'Chilpancingo de los Bravo' },
  { name: 'Hidalgo',                iso: 'MX-HID', capital: 'Pachuca de Soto' },
  { name: 'Jalisco',                iso: 'MX-JAL', capital: 'Guadalajara' },
  { name: 'Michoacán',              iso: 'MX-MIC', capital: 'Morelia' },
  { name: 'Morelos',                iso: 'MX-MOR', capital: 'Cuernavaca' },
  { name: 'Nayarit',                iso: 'MX-NAY', capital: 'Tepic' },
  { name: 'Nuevo León',             iso: 'MX-NLE', capital: 'Monterrey' },
  { name: 'Oaxaca',                 iso: 'MX-OAX', capital: 'Oaxaca de Juárez' },
  { name: 'Puebla',                 iso: 'MX-PUE', capital: 'Heroica Puebla de Zaragoza' },
  { name: 'Querétaro',              iso: 'MX-QUE', capital: 'Santiago de Querétaro' },
  { name: 'Quintana Roo',           iso: 'MX-ROO', capital: 'Chetumal' },
  { name: 'San Luis Potosí',        iso: 'MX-SLP', capital: 'San Luis Potosí' },
  { name: 'Sinaloa',                iso: 'MX-SIN', capital: 'Culiacán Rosales' },
  { name: 'Sonora',                 iso: 'MX-SON', capital: 'Hermosillo' },
  { name: 'Tabasco',                iso: 'MX-TAB', capital: 'Villahermosa' },
  { name: 'Tamaulipas',             iso: 'MX-TAM', capital: 'Ciudad Victoria' },
  { name: 'Tlaxcala',               iso: 'MX-TLA', capital: 'Tlaxcala de Xicohténcatl' },
  { name: 'Veracruz',               iso: 'MX-VER', capital: 'Xalapa-Enríquez' },
  { name: 'Yucatán',                iso: 'MX-YUC', capital: 'Mérida' },
  { name: 'Zacatecas',              iso: 'MX-ZAC', capital: 'Zacatecas' },
];

/** Lista solo de nombres, útil para validaciones rápidas. */
export const MEXICO_STATE_NAMES: string[] = MEXICO_STATES.map(s => s.name);

/**
 * Valida si una cadena coincide con un estado oficial de México.
 * Útil tanto en frontend como en API endpoints.
 */
export function isValidMexicoState(value: string | null | undefined): boolean {
  if (!value) return false;
  return MEXICO_STATE_NAMES.includes(value.trim());
}

/**
 * Valida formato de código postal mexicano: 5 dígitos numéricos.
 * No valida que el CP exista geográficamente — eso requiere API SEPOMEX.
 */
export function isValidPostalCode(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{5}$/.test(value.trim());
}
