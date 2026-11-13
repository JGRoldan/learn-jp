/**
 * Semántica de vencimiento del dominio de estudio.
 *
 * Los cálculos de calendario (día local y suma de días) viven en
 * `src/shared/local-date.ts`, compartidos con el vocabulario.
 */

/**
 * Indica si un repaso está vencido: `due <= today` (ISO ordena como
 * fecha). Una tarjeta sin `due` (nueva) nunca está vencida.
 */
export function isDue(due: string | null, today: string): boolean {
  return due !== null && due <= today;
}
