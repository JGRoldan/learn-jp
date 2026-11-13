import { getEnv } from '../../config/env';
import {
  mapTableToRecords,
  WORDS_COLUMN_MAP,
  type NumberedRecord,
} from './columns';
import { getSheetTable } from './sheet-csv.client';

/**
 * Lee los registros crudos del tab "words" de la hoja.
 *
 * Los valores siguen siendo strings sin normalizar: la validación y el
 * tipado ocurren en la capa de features (`vocabulary.validation`).
 *
 * @returns Registros numerados (fila de la hoja → valores de celda).
 * @throws {SheetUnavailableError} si la hoja no puede leerse y no hay caché.
 * @throws {MissingColumnsError} si faltan columnas esperadas.
 */
export async function readWordRecords(): Promise<NumberedRecord[]> {
  const { wordsGid } = getEnv();
  const table = await getSheetTable(wordsGid, 'words');
  return mapTableToRecords(table, WORDS_COLUMN_MAP);
}
