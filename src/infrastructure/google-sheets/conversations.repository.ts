import { getEnv } from '../../config/env';
import {
  CONVERSATIONS_COLUMN_MAP,
  mapTableToRecords,
  type NumberedRecord,
} from './columns';
import { getSheetTable } from './sheet-csv.client';

/**
 * Lee los registros crudos del tab "conversaciones" de la hoja.
 *
 * Los valores siguen siendo strings sin normalizar: la validación y el
 * parseo del guion ocurren en la capa de features.
 *
 * @returns Registros numerados (fila de la hoja → valores de celda).
 * @throws {SheetUnavailableError} si la hoja no puede leerse y no hay caché.
 * @throws {MissingColumnsError} si faltan columnas esperadas.
 */
export async function readConversationRecords(): Promise<NumberedRecord[]> {
  const { conversationsGid } = getEnv();
  const table = await getSheetTable(conversationsGid, 'conversaciones');
  return mapTableToRecords(table, CONVERSATIONS_COLUMN_MAP);
}
