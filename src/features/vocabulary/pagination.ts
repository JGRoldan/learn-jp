/** Filas de vocabulario que se muestran por tanda. */
export const VOCABULARY_PAGE_SIZE = 20;

/**
 * Número de filas visibles al cargar la página.
 *
 * @param total Total de filas disponibles.
 * @returns El mínimo entre el tamaño de tanda y el total.
 */
export function getInitialVisibleCount(total: number): number {
  return Math.max(0, Math.min(VOCABULARY_PAGE_SIZE, total));
}

/**
 * Siguiente límite de filas visibles al pulsar «Cargar más».
 *
 * @param current Límite actual.
 * @param total Total de filas que cumplen los filtros.
 * @returns El nuevo límite, sin superar el total.
 */
export function nextVisibleLimit(current: number, total: number): number {
  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.max(0, current);
  return Math.min(safeTotal, safeCurrent + VOCABULARY_PAGE_SIZE);
}

/**
 * Texto del contador de resultados.
 *
 * @param visible Filas mostradas actualmente.
 * @param total Filas que cumplen los filtros.
 * @returns «20 palabras» cuando ya se ven todas o
 *   «Mostrando 20 de 549 palabras» mientras queden tandas.
 */
export function formatVisibleCount(visible: number, total: number): string {
  const safeTotal = Math.max(0, total);
  const safeVisible = Math.max(0, Math.min(visible, safeTotal));

  if (safeVisible >= safeTotal) {
    return safeTotal === 1 ? '1 palabra' : `${safeTotal} palabras`;
  }
  return `Mostrando ${safeVisible} de ${safeTotal} palabras`;
}
