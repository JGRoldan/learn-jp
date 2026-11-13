import { z } from 'zod';
import { validateRows, type RowValidationResult } from '../row-validation';
import type { NumberedRecord } from '../../infrastructure/google-sheets/columns';

/**
 * Valores interpretados como `false` en la columna `active`, en minúsculas.
 * Cualquier otro valor (vacío incluido) cuenta como categoría activa.
 */
const FALSY_CATEGORY_VALUES = new Set(['false', 'falso', 'no', '0', 'f']);

/**
 * Esquema de una fila del tab "categories".
 *
 * - `id` y `name` son obligatorios: una fila sin ellos se descarta.
 * - `description` vacía se normaliza a `null`.
 * - `active` interpreta equivalentes de FALSE (sin distinguir mayúsculas).
 */
const categoryRowSchema = z.object({
  id: z.string().min(1, 'el id es obligatorio'),
  name: z.string().min(1, 'el nombre es obligatorio'),
  description: z.string().transform((value) => (value === '' ? null : value)),
  active: z
    .string()
    .transform((value) => !FALSY_CATEGORY_VALUES.has(value.toLowerCase())),
});

/** Fila de "categories" validada y normalizada. */
export type ValidatedCategoryRow = z.output<typeof categoryRowSchema>;

/**
 * Valida y normaliza los registros crudos del tab "categories".
 *
 * Una fila inválida se descarta y se reporta; nunca rompe el resto.
 *
 * @param rows Registros crudos numerados del tab.
 * @returns Categorías válidas (sin deduplicar) y filas descartadas.
 */
export function validateCategoryRows(
  rows: readonly NumberedRecord[],
): RowValidationResult<ValidatedCategoryRow> {
  return validateRows(rows, categoryRowSchema, 'categories');
}
