import type { SheetTable } from './sheet-csv.client';

/**
 * Especificación de una columna esperada.
 *
 * - `header`: nombre de columna en la hoja.
 * - `optional`: si es `true`, la ausencia de la columna no es error; el
 *   campo llega como valor vacío en todos los registros.
 */
export interface ColumnSpec {
  readonly header: string;
  readonly optional?: boolean;
}

/**
 * Definición de un mapeo de columnas: campo canónico → header esperado
 * (string) o especificación completa (ColumnSpec).
 */
export type ColumnMap = Readonly<Record<string, string | ColumnSpec>>;

/** Fila cruda ya normalizada: campo canónico → valor de celda (recortado). */
export type SheetRecord = Readonly<Record<string, string>>;

/**
 * Registro con su número de fila en la hoja (la fila 1 es el encabezado).
 * Permite reportar filas inválidas señalando dónde están en la hoja.
 */
export interface NumberedRecord {
  readonly rowNumber: number;
  readonly values: SheetRecord;
}

/**
 * Mapeo entre campo canónico y nombre de columna esperado en la pestaña
 * "words". Único lugar del código donde se declaran los headers: si la hoja
 * renombra una columna, el cambio es de una línea aquí.
 *
 * - `id` y `palabra` son obligatorios.
 * - `significado` (significado de la palabra misma) es opcional: si la
 *   columna no existe todavía, el campo llega vacío (`null` tras validar).
 * - Las listas paralelas (`ejemplos`, `lectura_ejemplos`,
 *   `significado_ejemplos`) se separan por `|` y se emparejan por posición.
 */
export const WORDS_COLUMN_MAP = {
  id: 'id',
  palabra: 'palabra',
  lectura: 'lectura',
  significado: { header: 'significado', optional: true },
  ejemplos: 'ejemplos',
  lecturaEjemplos: 'lectura_ejemplos',
  significadoEjemplos: 'significado_ejemplos',
  categoriaId: 'categoria_id',
  aprendido: 'aprendido',
  vecesRepaso: 'veces repaso',
  rachaAciertos: 'racha_aciertos',
  factorFacilidad: 'factor_facibilidad',
  intervaloDias: 'intervalo_dias',
  proximoRepaso: 'proximo_repaso',
} as const satisfies Record<string, string | ColumnSpec>;

/**
 * Mapeo entre campo canónico y nombre de columna esperado en la pestaña
 * "categories".
 *
 * - `id` y `nombre` son obligatorios.
 * - `description` y `active` son opcionales: si la columna no existe, el
 *   campo llega como vacío (descripción `null`, categoría activa). Si se
 *   añaden a la hoja más adelante, sus funciones se activan solas.
 */
export const CATEGORIES_COLUMN_MAP = {
  id: 'id',
  name: 'nombre',
  description: { header: 'description', optional: true },
  active: { header: 'active', optional: true },
} as const satisfies Record<string, string | ColumnSpec>;

/**
 * Error lanzado cuando al header de la hoja le faltan columnas esperadas.
 * Indica un desajuste entre la estructura real de la hoja y el mapeo.
 */
export class MissingColumnsError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`Faltan columnas esperadas en la hoja: ${missing.join(', ')}`);
    this.name = 'MissingColumnsError';
    this.missing = missing;
  }
}

/** Normaliza un header para comparación: recorte, minúsculas, espacios únicos. */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resuelve el índice de columna de cada campo a partir de los headers
 * reales de la tabla, comparando por nombre normalizado (no por posición).
 *
 * Las columnas opcionales ausentes no se incluyen en el resultado: el
 * campo se tratará como vacío al construir los registros.
 *
 * @param headers Headers leídos de la primera fila del CSV.
 * @param columnMap Mapeo campo canónico → header o especificación.
 * @returns Campo canónico → índice de columna en cada fila.
 * @throws {MissingColumnsError} si algún header obligatorio no aparece.
 */
function resolveColumnIndexes(
  headers: readonly string[],
  columnMap: ColumnMap,
): Record<string, number> {
  const indexByNormalizedHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!indexByNormalizedHeader.has(key)) {
      indexByNormalizedHeader.set(key, index);
    }
  });

  const indexByField: Record<string, number> = {};
  const missing: string[] = [];
  for (const [field, spec] of Object.entries(columnMap)) {
    const expectedHeader = typeof spec === 'string' ? spec : spec.header;
    const isOptional = typeof spec !== 'string' && spec.optional === true;
    const index = indexByNormalizedHeader.get(normalizeHeader(expectedHeader));
    if (index === undefined) {
      if (!isOptional) missing.push(expectedHeader);
    } else {
      indexByField[field] = index;
    }
  }

  if (missing.length > 0) {
    throw new MissingColumnsError(missing);
  }
  return indexByField;
}

/**
 * Convierte una tabla CSV en registros con campos canónicos.
 *
 * - Las columnas se resuelven por nombre de header, no por posición.
 * - Los valores de celda se recortan de espacios sobrantes.
 * - Las columnas opcionales ausentes producen valor vacío, no error.
 * - Las filas totalmente vacías se omiten.
 * - Las columnas extra de la hoja se ignoran.
 * - Cada registro lleva su número de fila en la hoja (encabezado = fila 1).
 *
 * @param table Tabla cruda leída de la hoja (primera fila = headers).
 * @param columnMap Mapeo campo canónico → header o especificación.
 * @returns Registros numerados con las claves de `columnMap`.
 * @throws {MissingColumnsError} si falta alguna columna obligatoria.
 */
export function mapTableToRecords(
  table: SheetTable,
  columnMap: ColumnMap,
): NumberedRecord[] {
  const indexByField = resolveColumnIndexes(table.headers, columnMap);
  const records: NumberedRecord[] = [];

  for (const [rowIndex, row] of table.rows.entries()) {
    const record: Record<string, string> = {};
    let hasAnyValue = false;
    for (const field of Object.keys(columnMap)) {
      const index = indexByField[field];
      // Columna opcional ausente (index undefined) → valor vacío:
      // todo campo canónico existe siempre como string, nunca undefined.
      const cell = index === undefined ? '' : (row[index] ?? '');
      const value = cell.trim();
      record[field] = value;
      if (value !== '') hasAnyValue = true;
    }
    if (hasAnyValue) {
      records.push({ rowNumber: rowIndex + 2, values: record });
    }
  }

  return records;
}
