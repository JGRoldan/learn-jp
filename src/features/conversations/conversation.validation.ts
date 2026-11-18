import { z } from 'zod';
import {
  validateRows,
  type InvalidRowReport,
  type RowValidationResult,
  type ValidRowEntry,
} from '../row-validation';
import type { NumberedRecord } from '../../infrastructure/google-sheets/columns';
import type { ValidatedConversationRow } from './conversation.types';

/** Convierte un campo de texto opcional: vacío → `null`. */
function parseOptionalText(value: string): string | null {
  return value === '' ? null : value;
}

/** Normaliza `nivel` a mayúsculas; vacío → `null`. */
function parseOptionalLevel(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return normalized === '' ? null : normalized;
}

/**
 * Esquema de una fila del tab "conversaciones".
 *
 * `titulo` y `guion` son obligatorios. `id` puede estar vacío mientras se
 * están pegando conversaciones: el validador genera uno estable a partir
 * del número de fila y lo avisa en la consola del servidor.
 */
const conversationRowSchema = z.object({
  id: z.string(),
  titulo: z.string().min(1, 'el título es obligatorio'),
  topico: z.string().transform(parseOptionalText),
  guion: z.string().min(1, 'el guion es obligatorio'),
  nivel: z.string().transform(parseOptionalLevel),
});

/**
 * Valida y normaliza los registros crudos del tab "conversaciones".
 *
 * Los ids duplicados se descartan conservando la primera aparición. Un id
 * vacío se sustituye por `conv-fila-<n>` para no perder la conversación.
 *
 * @param rows Registros crudos numerados del tab.
 * @returns Filas válidas y filas descartadas con motivo.
 */
export function validateConversationRows(
  rows: readonly NumberedRecord[],
): RowValidationResult<ValidatedConversationRow> {
  const { valid, invalid } = validateRows(
    rows,
    conversationRowSchema,
    'conversaciones',
  );

  const seenIds = new Set<string>();
  const unique: ValidRowEntry<ValidatedConversationRow>[] = [];
  const duplicateReports: InvalidRowReport[] = [];

  for (const row of valid) {
    let id = row.data.id;
    if (id === '') {
      id = `conv-fila-${row.rowNumber}`;
      console.warn(
        `[conversaciones] Fila ${row.rowNumber}: id vacío; se usa "${id}".`,
      );
    }

    if (seenIds.has(id)) {
      duplicateReports.push({
        label: 'conversaciones',
        rowNumber: row.rowNumber,
        reason: `id duplicado "${id}"; se conserva la primera aparición`,
      });
      continue;
    }

    seenIds.add(id);
    unique.push({ data: { ...row.data, id }, rowNumber: row.rowNumber });
  }

  return { valid: unique, invalid: [...invalid, ...duplicateReports] };
}
