import type { InvalidRowReport } from '../row-validation';

/** Categoría de vocabulario leída de la hoja, ya validada. */
export interface Category {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly active: boolean;
}

/** Categorías válidas + reporte de filas de la hoja que no pasaron validación. */
export interface CategoriesResult {
  readonly categories: readonly Category[];
  readonly invalidRows: readonly InvalidRowReport[];
}
