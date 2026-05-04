/**
 * VYLTA — Tipos de Negocio
 *
 * Fuente única de verdad para la lista de tipos de negocio que aparecen
 * en el formulario de registro inicial (setup) y en Ajustes → Mi Negocio.
 *
 * REGLAS:
 * - Lista ordenada alfabéticamente (excepto 'Otro' que siempre va al final)
 * - 'Otro' permite al usuario escribir su tipo de negocio personalizado
 * - Si necesitas agregar nuevos tipos, hazlo aquí y se actualizan ambas pantallas
 *
 * Cuando el usuario selecciona 'Otro', el valor que se guarda en
 * business_profiles.business_type es el texto libre que escribió,
 * NO la palabra 'Otro' literal. Esto permite ver en BD/reportes
 * los tipos reales (ej: 'Especialista Parasitólogo').
 */

export const BUSINESS_TYPE_OTHER = 'Otro';

// Lista principal — ordenada alfabéticamente (excepto 'Otro' al final)
export const BUSINESS_TYPES: string[] = [
  'Barbería',
  'Cardiología',
  'Cejas y pestañas',
  'Centro de bronceado',
  'Centro de depilación láser',
  'Centro de masajes',
  'Coaching personal',
  'Consultorio médico general',
  'Dermatología',
  'Endocrinología',
  'Estética facial',
  'Estilismo / Peluquería',
  'Fisioterapia',
  'Fotografía',
  'Ginecología',
  'Maquillaje profesional',
  'Nutriología',
  'Odontología',
  'Oftalmología',
  'Ortopedia',
  'Pediatría',
  'Psicología',
  'Psiquiatría',
  'Quiropráctico',
  'Salón de belleza',
  'Spa',
  'Tatuajes y piercing',
  'Terapia ocupacional',
  'Tutorías',
  'Uñas',
  'Veterinaria',
  BUSINESS_TYPE_OTHER, // siempre al final
];

/**
 * Determina si el valor guardado en business_type corresponde a un tipo personalizado
 * (es decir, no está en la lista oficial). Esto se usa al cargar el perfil para
 * decidir si mostrar el dropdown con 'Otro' seleccionado y el input de texto libre.
 */
export function isCustomBusinessType(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  return !BUSINESS_TYPES.includes(value);
}

/**
 * Validación del texto libre cuando el usuario selecciona 'Otro'.
 * - Mínimo 3 caracteres no-espacio
 * - Máximo 50 caracteres
 * - No solo espacios
 */
export function validateCustomBusinessType(value: string): { valid: boolean; error?: string } {
  const trimmed = (value || '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Escribe tu tipo de negocio para continuar' };
  }
  if (trimmed.length < 3) {
    return { valid: false, error: 'Mínimo 3 caracteres' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'Máximo 50 caracteres' };
  }
  return { valid: true };
}
