import { getEnv } from '../../config/env';
import {
  mapTableToRecords,
  CATEGORIES_COLUMN_MAP,
  type NumberedRecord,
} from './columns';
import { getSheetTable } from './sheet-csv.client';

/**
 * Lee los registros crudos del tab "categories" de la hoja.
 *
 * Los valores siguen siendo strings sin normalizar: la validación y el
 * tipado ocurren en la capa de features (`categories.validation`).
 *
 * @returns Registros numerados (fila de la hoja → valores de celda).
 * @throws {SheetUnavailableError} si la hoja no puede leerse y no hay caché.
 * @throws {MissingColumnsError} si faltan columnas esperadas.
 */
export async function readCategoryRecords(): Promise<NumberedRecord[]> {
  const { categoriesGid } = getEnv();
  const table = await getSheetTable(categoriesGid, 'categories');
  return mapTableToRecords(table, CATEGORIES_COLUMN_MAP);
}
