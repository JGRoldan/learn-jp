import type { Category } from '../categories/categories.types';
import type { AnkiSegment } from './anki-markup';

/** Entrada de vocabulario leída de la hoja, ya validada. */
export interface VocabularyEntry {
  readonly id: string;
  readonly palabra: string;
  readonly lectura: string | null;
  readonly significado: string | null;
  readonly ejemplos: string | null;
  readonly lecturaEjemplos: string | null;
  readonly significadoEjemplos: string | null;
  readonly categoriaId: string | null;
  readonly aprendido: boolean;
  readonly vecesRepaso: number | null;
  readonly rachaAciertos: number | null;
  readonly factorFacilidad: number | null;
  readonly intervaloDias: number | null;
  /** Día local `YYYY-MM-DD` de `proximo_repaso`; `null` si está vacío. */
  readonly proximoRepaso: string | null;
}

/**
 * Ejemplo de uso: texto emparejado por posición con su lectura y su
 * significado (las tres listas de la hoja se separan por `|`).
 * Los campos que falten en la posición correspondiente son `null`.
 *
 * Cuando la lectura de ese ejemplo usa marcado Anki, `segments` contiene
 * el ejemplo con furigana por kanji y `reading` su texto fonético
 * derivado; si el formato es plano, `segments` es `null`.
 */
export interface ExampleView {
  readonly text: string;
  readonly reading: string | null;
  readonly meaning: string | null;
  readonly segments: readonly AnkiSegment[] | null;
}

/**
 * Entrada lista para la vista: datos validados + derivaciones de
 * búsqueda precalculadas en servidor (textos normalizados).
 */
export interface VocabularyViewEntry {
  readonly id: string;
  readonly palabra: string;
  /**
   * Lecturas individuales de la palabra (formato plano) o su texto
   * fonético completo derivado del marcado Anki (p. ej. `ちちおや`).
   */
  readonly readings: readonly string[];
  /**
   * Palabra con furigana por kanji cuando `lectura` usa marcado Anki;
   * `null` en formato plano.
   */
  readonly wordSegments: readonly AnkiSegment[] | null;
  readonly significado: string | null;
  readonly examples: readonly ExampleView[];
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly aprendido: boolean;
  /**
   * Columnas de repaso de la hoja, semilla del estado local de estudio
   * (AGENTS §17). La web nunca las escribe.
   */
  readonly vecesRepaso: number | null;
  readonly rachaAciertos: number | null;
  readonly factorFacilidad: number | null;
  readonly intervaloDias: number | null;
  readonly proximoRepaso: string | null;
  readonly searchWord: string;
  readonly searchReading: string;
  readonly searchMeaning: string;
}

/** Resultado de carga correcta: datos listos para la página. */
export interface VocabularyLoadSuccess {
  readonly ok: true;
  readonly entries: readonly VocabularyViewEntry[];
  readonly categories: readonly Category[];
  readonly invalidRowCount: number;
}

/** Resultado de carga fallida: mensaje apto para mostrar al usuario. */
export interface VocabularyLoadFailure {
  readonly ok: false;
  readonly message: string;
}

/** Resultado de {@link loadVocabulary}. */
export type VocabularyLoadResult =
  | VocabularyLoadSuccess
  | VocabularyLoadFailure;
