/**
 * Scheduler SM-2 propio con tres calificaciones (0 Otra vez, 3 Bien,
 * 5 Fácil), al estilo de los «deltas suaves» de Anki.
 *
 * Es puro y determinista: no lee el reloj ni toca `localStorage`. El día
 * de la sesión (`today`) y la marca de la respuesta (`reviewedAt`) los
 * aporta quien llama, lo que hace la planificación reproducible y fácil
 * de testear.
 */

import { addDays } from '../../shared/local-date';
import {
  DEFAULT_STUDY_SETTINGS,
  type Grade,
  type StudyCardState,
  type StudyPhase,
  type StudySettings,
} from './study.types';

/** Factor de facilidad inicial de una tarjeta nueva. */
export const INITIAL_EASE = 2.5;

/** Penalización de facilidad al fallar (Otra vez). */
const EASE_PENALTY = 0.2;

/** Bonificación de facilidad al acertar con Fácil. */
const EASE_BONUS = 0.15;

/** Opciones de {@link gradeCard}. */
export interface GradeOptions {
  /**
   * Marca ISO de la respuesta. Si se omite se conserva la de la tarjeta;
   * el dominio no fabrica relojes.
   */
  readonly reviewedAt?: string | null;
  /** Ajustes del scheduler; por defecto los del proyecto. */
  readonly settings?: StudySettings;
}

/**
 * Crea el estado de una tarjeta nunca estudiada.
 *
 * @param id Id de la palabra en la hoja.
 * @example
 * createNewCard('42') // → fase 'new', ef 2.5, due null
 */
export function createNewCard(id: string): StudyCardState {
  return {
    id,
    introducedOn: null,
    ef: INITIAL_EASE,
    intervalDays: 0,
    streak: 0,
    reps: 0,
    lapses: 0,
    due: null,
    lastReviewedAt: null,
  };
}

/**
 * Indica si un valor es una calificación válida.
 *
 * Útil para validar entradas externas (query de la sesión, JSON) antes
 * de pasarlas a {@link gradeCard}.
 */
export function isGrade(value: unknown): value is Grade {
  return value === 0 || value === 3 || value === 5;
}

/**
 * Fase de una tarjeta según su estado local.
 *
 * La madurez manda sobre la hoja: una tarjeta es madura cuando su
 * intervalo alcanza `matureDays`.
 */
export function getStudyPhase(
  card: StudyCardState,
  settings: StudySettings = DEFAULT_STUDY_SETTINGS,
): StudyPhase {
  if (card.introducedOn === null) return 'new';
  return card.intervalDays >= settings.matureDays ? 'mature' : 'review';
}

/** Redondea a un número fijo de decimales (evita arrastrar error binario). */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Aplica una respuesta y devuelve la tarjeta resultante (sin mutar la
 * original).
 *
 * - **Nueva**: cualquier respuesta la introduce; Otra vez la deja a 0
 *   días y debida hoy, Bien a 1 día y Fácil a `graduationEasyDays`.
 *   El factor de facilidad no cambia.
 * - **En repaso / madura**: Otra vez baja la facilidad, reinicia la racha
 *   y deja el intervalo en 1 día (debida hoy para reencolar); Bien
 *   encadena 1 → 6 → `round(I × EF)`; Fácil multiplica por `I × EF` y
 *   sube la facilidad. Un fallo devuelve la tarjeta madura a joven.
 *
 * @param card Estado actual.
 * @param grade Calificación de la respuesta.
 * @param today Día local de la sesión (`YYYY-MM-DD`), fijado al inicio.
 * @param options Marca de la respuesta y ajustes del scheduler.
 * @throws {TypeError} Si `today` no es un día local válido.
 * @example
 * const next = gradeCard(createNewCard('42'), 3, '2026-11-13');
 * // → introducedOn: '2026-11-13', intervalDays: 1, due: '2026-11-14'
 */
export function gradeCard(
  card: StudyCardState,
  grade: Grade,
  today: string,
  options: GradeOptions = {},
): StudyCardState {
  const settings = options.settings ?? DEFAULT_STUDY_SETTINGS;
  const reviewedAt =
    options.reviewedAt === undefined ? card.lastReviewedAt : options.reviewedAt;

  if (card.introducedOn === null) {
    const intervalDays =
      grade === 5
        ? settings.graduationEasyDays
        : grade === 3
          ? 1
          : 0;
    return {
      ...card,
      introducedOn: today,
      intervalDays,
      streak: grade === 0 ? 0 : 1,
      reps: card.reps + 1,
      due: addDays(today, intervalDays),
      lastReviewedAt: reviewedAt,
    };
  }

  if (grade === 0) {
    return {
      ...card,
      ef: Math.max(settings.efMin, roundTo(card.ef - EASE_PENALTY, 2)),
      intervalDays: 1,
      streak: 0,
      reps: card.reps + 1,
      lapses: card.lapses + 1,
      due: today,
      lastReviewedAt: reviewedAt,
    };
  }

  const streak = card.streak + 1;
  if (grade === 3) {
    const intervalDays =
      streak === 1
        ? 1
        : streak === 2
          ? 6
          : Math.max(1, Math.round(card.intervalDays * card.ef));
    return {
      ...card,
      intervalDays,
      streak,
      reps: card.reps + 1,
      due: addDays(today, intervalDays),
      lastReviewedAt: reviewedAt,
    };
  }

  const intervalDays = Math.max(
    1,
    Math.round(
      Math.max(card.intervalDays + 1, card.intervalDays * card.ef) *
        settings.easyBonus,
    ),
  );
  return {
    ...card,
    ef: Math.min(settings.efMax, roundTo(card.ef + EASE_BONUS, 2)),
    intervalDays,
    streak,
    reps: card.reps + 1,
    due: addDays(today, intervalDays),
    lastReviewedAt: reviewedAt,
  };
}
