/**
 * Tipos y valores por defecto del dominio de estudio (SM-2).
 *
 * El estado de una tarjeta es un dato puro e inmutable: cada respuesta
 * produce una tarjeta nueva. La persistencia (`localStorage`) y la
 * validación con Zod viven en `study.storage.ts`.
 */

/** Calificación de una respuesta: 0 Otra vez, 3 Bien, 5 Fácil. */
export type Grade = 0 | 3 | 5;

/**
 * Valor del parámetro `categoria` para las palabras sin `categoria_id`.
 *
 * Los ids reales de la hoja son numéricos, así que este centinela no
 * puede colisionar con una categoría.
 */
export const UNCATEGORIZED_CATEGORY_PARAM = 'sin-categoria';

/**
 * Fase de una tarjeta.
 *
 * - `new`: nunca estudiada.
 * - `review`: introducida y todavía joven (`intervalDays < matureDays`).
 * - `mature`: aprendida; se exporta como `aprendido=TRUE`.
 */
export type StudyPhase = 'new' | 'review' | 'mature';

/** Estado de estudio de una palabra, indexado por su id de la hoja. */
export interface StudyCardState {
  /** Id de la palabra en la hoja; clave única del store. */
  readonly id: string;
  /** Día local (`YYYY-MM-DD`) en que se introdujo; `null` si es nueva. */
  readonly introducedOn: string | null;
  /** Factor de facilidad, en `[efMin, efMax]`. */
  readonly ef: number;
  /** Intervalo actual en días; `0` hasta la primera respuesta. */
  readonly intervalDays: number;
  /** Racha de respuestas Bien/Fácil; se reinicia con Otra vez. */
  readonly streak: number;
  /** Número total de respuestas. */
  readonly reps: number;
  /** Fallos en repaso; reservado para leeches futuros. */
  readonly lapses: number;
  /** Próximo repaso como día local (`YYYY-MM-DD`); `null` si es nueva. */
  readonly due: string | null;
  /** Marca ISO de la última respuesta; informativa. */
  readonly lastReviewedAt: string | null;
}

/**
 * Ajustes del estudio.
 *
 * Solo `newPerDay` es configurable en la UI; el resto son las constantes
 * que el plan fija para el scheduler y se guardan para hacer el store
 * autoexplicativo y el respaldo comprensible.
 */
export interface StudySettings {
  /** Cupo diario global de tarjetas nuevas. */
  readonly newPerDay: number;
  /** Multiplicador de intervalo al calificar Fácil. */
  readonly easyBonus: number;
  /** Factor de facilidad mínimo. */
  readonly efMin: number;
  /** Factor de facilidad máximo. */
  readonly efMax: number;
  /** Intervalo (en días) a partir del cual la tarjeta es madura. */
  readonly matureDays: number;
  /** Intervalo (en días) al calificar Fácil una tarjeta nueva. */
  readonly graduationEasyDays: number;
}

/** Ajustes por defecto del estudio. */
export const DEFAULT_STUDY_SETTINGS: StudySettings = Object.freeze({
  newPerDay: 10,
  easyBonus: 1.3,
  efMin: 1.3,
  efMax: 3.0,
  matureDays: 21,
  graduationEasyDays: 4,
});

/** Contenido persistido en `localStorage` bajo `jp-study:srs:v1`. */
export interface StudyStore {
  /** Versión del esquema; permite migraciones futuras. */
  readonly version: 1;
  /** Estado por id de palabra. */
  readonly cards: Readonly<Record<string, StudyCardState>>;
  /** Ajustes vigentes. */
  readonly settings: StudySettings;
}
