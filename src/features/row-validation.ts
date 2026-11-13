import type { z } from 'zod';
import type { NumberedRecord } from '../infrastructure/google-sheets/columns';

/** Fila de la hoja descartada por no pasar la validación. */
export interface InvalidRowReport {
  /** Tab al que pertenece la fila ("words" / "categories"). */
  readonly label: string;
  /** Número de fila en la hoja; la fila 1 es el encabezado. */
  readonly rowNumber: number;
  /** Motivo legible del descarte. */
  readonly reason: string;
}

/** Fila válida junto a su número de fila en la hoja. */
export interface ValidRowEntry<T> {
  readonly data: T;
  readonly rowNumber: number;
}

/** Resultado de validar las filas de un tab. */
export interface RowValidationResult<T> {
  readonly valid: readonly ValidRowEntry<T>[];
  readonly invalid: readonly InvalidRowReport[];
}

/**
 * Valida los registros crudos de un tab contra un esquema Zod, fila a fila.
 *
 * Una fila inválida nunca rompe el resto: se descarta y se reporta con su
 * número de fila y el motivo. Las filas válidas conservan su número de fila
 * para poder reportar problemas posteriores (p. ej. ids duplicados).
 *
 * @param records Registros crudos numerados leídos de la hoja.
 * @param schema Esquema Zod que valida y normaliza una fila.
 * @param label Etiqueta del tab, incluida en los reportes de filas inválidas.
 * @returns Filas válidas (tipadas, con su fila) y reporte de filas inválidas.
 */
export function validateRows<S extends z.ZodType>(
  records: readonly NumberedRecord[],
  schema: S,
  label: string,
): RowValidationResult<z.output<S>> {
  const valid: ValidRowEntry<z.output<S>>[] = [];
  const invalid: InvalidRowReport[] = [];

  for (const record of records) {
    const result = schema.safeParse(record.values);
    if (result.success) {
      valid.push({ data: result.data, rowNumber: record.rowNumber });
    } else {
      const reason = result.error.issues
        .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
        .join('; ');
      invalid.push({ label, rowNumber: record.rowNumber, reason });
    }
  }

  return { valid, invalid };
}

/**
 * Registra en la consola del servidor las filas inválidas descartadas,
 * para que el dueño de la hoja pueda corregirlas sin adivinar.
 *
 * @param invalidRows Reportes de filas descartadas.
 */
export function logInvalidRows(invalidRows: readonly InvalidRowReport[]): void {
  for (const row of invalidRows) {
    console.warn(
      `[google-sheets] Fila descartada en "${row.label}" (fila ${row.rowNumber} de la hoja): ${row.reason}`,
    );
  }
}
