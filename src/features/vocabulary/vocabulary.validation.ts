import { z } from 'zod';
import {
  validateRows,
  type InvalidRowReport,
  type RowValidationResult,
  type ValidRowEntry,
} from '../row-validation';
import type { NumberedRecord } from '../../infrastructure/google-sheets/columns';
import { isLocalDate } from '../../shared/local-date';

/** Valores interpretados como `true` en la columna `aprendido`, en minúsculas. */
const TRUTHY_VALUES = new Set(['true', 'verdadero', 'sí', 'si', 'yes', '1', 'x', 'v']);

/**
 * Interpreta la columna `aprendido` como booleano.
 *
 * Acepta `TRUE`/`FALSE` sin distinguir mayúsculas y equivalentes acordados
 * (`verdadero`, `sí`, `si`, `yes`, `1`, `x`, `v` / `falso`, `no`, `0`, `f`).
 * Un valor vacío o no reconocido se considera no aprendido.
 */
function parseAprendido(value: string): boolean {
  return TRUTHY_VALUES.has(value.toLowerCase());
}

/**
 * Interpreta una columna numérica opcional de forma segura.
 *
 * Vacío → `null`. Se tolera la coma decimal (locale español de la hoja).
 * Cualquier valor que no sea un número finito → `null`, nunca `NaN`.
 */
function parseOptionalNumber(value: string): number | null {
  if (value === '') return null;
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const withDotDecimal = Number(value.replace(',', '.'));
  return Number.isFinite(withDotDecimal) ? withDotDecimal : null;
}

/**
 * Normaliza la fecha de `proximo_repaso` a día local `YYYY-MM-DD`.
 *
 * Se conserva la celda tal cual (sin pasar por `Date`, que interpretaría
 * una fecha sin hora como UTC y podría desplazar el día en husos
 * negativos). Vacío o fecha malformada → `null`.
 */
function parseOptionalLocalDate(value: string): string | null {
  if (value === '') return null;
  return isLocalDate(value) ? value : null;
}

/** Convierte un campo de texto opcional: vacío → `null`. */
function parseOptionalText(value: string): string | null {
  return value === '' ? null : value;
}

/**
 * Esquema de una fila del tab "words".
 *
 * Solo `id` y `palabra` son obligatorios (la fila-cabecera de la lista):
 * una fila sin palabra se descarta. Todo lo demás — lecturas,
 * significados, ejemplos, categoría, `aprendido` y las columnas de
 * repaso — puede estar vacío y se normaliza a `null` / `false`.
 *
 * Las columnas de repaso (`veces repaso`, `racha_aciertos`,
 * `factor_facibilidad`, `intervalo_dias`, `proximo_repaso`) y `aprendido` son
 * semilla/exportación del estado local de estudio (AGENTS §17): la web las
 * lee para sembrar tarjetas sin progreso propio, pero nunca las escribe.
 */
const vocabularyRowSchema = z.object({
  id: z.string().min(1, 'el id es obligatorio'),
  palabra: z.string().min(1, 'la palabra es obligatoria'),
  lectura: z.string().transform(parseOptionalText),
  significado: z.string().transform(parseOptionalText),
  ejemplos: z.string().transform(parseOptionalText),
  lecturaEjemplos: z.string().transform(parseOptionalText),
  significadoEjemplos: z.string().transform(parseOptionalText),
  categoriaId: z.string().transform(parseOptionalText),
  aprendido: z.string().transform(parseAprendido),
  vecesRepaso: z.string().transform(parseOptionalNumber),
  rachaAciertos: z.string().transform(parseOptionalNumber),
  factorFacilidad: z.string().transform(parseOptionalNumber),
  intervaloDias: z.string().transform(parseOptionalNumber),
  proximoRepaso: z.string().transform(parseOptionalLocalDate),
});

/** Fila de "words" validada y normalizada. */
export type ValidatedVocabularyRow = z.output<typeof vocabularyRowSchema>;

/**
 * Valida y normaliza los registros crudos del tab "words".
 *
 * Una fila inválida se descarta y se reporta; nunca rompe el resto.
 * Los ids duplicados se descartan conservando la primera aparición, y el
 * duplicado se reporta como fila inválida.
 *
 * @param rows Registros crudos numerados del tab.
 * @returns Entradas válidas (id único, con su fila) y filas descartadas
 *   con motivo.
 */
export function validateVocabularyRows(
  rows: readonly NumberedRecord[],
): RowValidationResult<ValidatedVocabularyRow> {
  const { valid, invalid } = validateRows(rows, vocabularyRowSchema, 'words');

  const seenIds = new Set<string>();
  const unique: ValidRowEntry<ValidatedVocabularyRow>[] = [];
  const duplicateReports: InvalidRowReport[] = [];

  for (const row of valid) {
    if (seenIds.has(row.data.id)) {
      duplicateReports.push({
        label: 'words',
        rowNumber: row.rowNumber,
        reason: `id duplicado "${row.data.id}"; se conserva la primera aparición`,
      });
      continue;
    }
    seenIds.add(row.data.id);
    unique.push(row);
  }

  return { valid: unique, invalid: [...invalid, ...duplicateReports] };
}
