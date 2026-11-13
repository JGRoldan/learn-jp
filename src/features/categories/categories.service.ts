import { readCategoryRecords } from '../../infrastructure/google-sheets/categories.repository';
import type { Category, CategoriesResult } from './categories.types';
import { validateCategoryRows } from './categories.validation';
import { logInvalidRows } from '../row-validation';

/**
 * Carga las categorías desde la hoja, ya validadas y normalizadas.
 *
 * Las filas inválidas se descartan y se registran en la consola del
 * servidor (no rompen la página). No hay deduplicación de ids aquí:
 * quien consume el servicio decide cómo tratar los duplicados.
 *
 * @throws {SheetUnavailableError} si la hoja no puede leerse y no hay caché.
 * @throws {MissingColumnsError} si faltan columnas esperadas.
 */
export async function loadCategories(): Promise<CategoriesResult> {
  const rows = await readCategoryRecords();
  const { valid, invalid } = validateCategoryRows(rows);
  logInvalidRows(invalid);
  return {
    categories: valid.map(({ data }): Category => ({ ...data })),
    invalidRows: invalid,
  };
}
