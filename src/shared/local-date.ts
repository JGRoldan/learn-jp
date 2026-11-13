/**
 * Utilidades de **día natural local** (`YYYY-MM-DD`).
 *
 * Compartidas por el vocabulario (normalización de la columna
 * `proximo_repaso`) y el estudio. No se usan horas ni conversión a UTC:
 * «mañana» es el siguiente día del calendario del usuario, no 24 horas
 * después. Comparar cadenas en ese formato equivale a comparar fechas
 * (ISO ordena lexicográficamente).
 */

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte una fecha a día local `YYYY-MM-DD` usando sus componentes
 * locales (nunca UTC).
 *
 * @example
 * toLocalDateString(new Date(2026, 10, 13)) // → '2026-11-13'
 */
export function toLocalDateString(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Interpreta un día local y comprueba que la fecha exista de verdad
 * (rechaza `2026-02-30` y similares que `Date` normalizaría en silencio).
 *
 * @throws {TypeError} Si el formato o la fecha son inválidos.
 */
function parseLocalDate(value: string): Date {
  const match = LOCAL_DATE_RE.exec(value);
  if (match === null) {
    throw new TypeError(`fecha local inválida: "${value}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const isValidCalendarDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!isValidCalendarDate) {
    throw new TypeError(`fecha local inválida: "${value}"`);
  }
  return date;
}

/**
 * Indica si un texto es un día local válido (`YYYY-MM-DD` y fecha real).
 *
 * @example
 * isLocalDate('2028-02-29') // → true
 * isLocalDate('2026-02-30') // → false
 */
export function isLocalDate(value: string): boolean {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Suma (o resta, con valores negativos) días de calendario a un día
 * local.
 *
 * Usa aritmética de componentes locales, así que meses, años bisiestos y
 * cambios de horario no alteran el día resultante.
 *
 * @param localDate Día de partida (`YYYY-MM-DD`).
 * @param days Días a sumar; puede ser negativo.
 * @throws {TypeError} Si `localDate` no es un día local válido.
 * @example
 * addDays('2026-01-31', 1) // → '2026-02-01'
 * addDays('2028-02-28', 1) // → '2028-02-29'
 */
export function addDays(localDate: string, days: number): string {
  const date = parseLocalDate(localDate);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}
