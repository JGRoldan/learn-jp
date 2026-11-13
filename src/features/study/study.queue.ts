/**
 * Construcción de colas de estudio (puras y deterministas).
 *
 * - **Repasar hoy**: tarjetas introducidas y vencidas (`due <= today`),
 *   de todas las categorías, mezcladas.
 * - **Aprender nuevas**: tarjetas sin introducir de una categoría,
 *   limitadas por el cupo diario global restante.
 *
 * Las funciones no tocan `localStorage` ni el reloj: reciben el día de
 * la sesión y, opcionalmente, un generador aleatorio inyectable para
 * hacer los tests reproducibles.
 */

import { isDue } from './study.dates';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudyCardState,
  type StudySettings,
} from './study.types';

/** Generador de números en `[0, 1)` tipo `Math.random`. */
export type Rng = () => number;

/** Datos mínimos de una palabra para construir colas. */
export interface StudyQueueWord {
  readonly id: string;
  /** Categoría de la hoja; `null` = «Sin categoría». */
  readonly categoryId: string | null;
}

/** Entrada de {@link buildReviewQueue}. */
export interface ReviewQueueInput {
  readonly cards: Readonly<Record<string, StudyCardState>>;
  /** Día local de la sesión (`YYYY-MM-DD`). */
  readonly today: string;
  readonly rng?: Rng;
}

/** Entrada de {@link buildNewQueue}. */
export interface NewQueueInput {
  readonly cards: Readonly<Record<string, StudyCardState>>;
  readonly words: readonly StudyQueueWord[];
  /** Categoría elegida; `null` = «Sin categoría». */
  readonly categoryId: string | null;
  readonly today: string;
  readonly settings?: StudySettings;
  readonly rng?: Rng;
}

/** Estado de reencolado dentro de una sesión. */
export interface RequeueState {
  /** Ids que quedan por responder (el actual ya se desencoló). */
  readonly queue: readonly string[];
  /** Ids que ya se reencolaron una vez en esta sesión. */
  readonly requeuedIds: ReadonlySet<string>;
}

/** Resultado de aplicar un «Otra vez» al final de la cola. */
export interface AgainResult extends RequeueState {
  /** `true` si la tarjeta falló por segunda vez y sale de la sesión. */
  readonly leftSession: boolean;
}

/**
 * Mezcla una lista con Fisher-Yates sin mutar la original.
 *
 * @param items Elementos a mezclar.
 * @param rng Generador inyectable; por defecto `Math.random`.
 * @example
 * shuffle([1, 2, 3], () => 0) // → [2, 3, 1]
 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    // Se acota el índice por si un generador inyectado devolviera 1.
    const randomIndex = Math.min(
      index,
      Math.max(0, Math.floor(rng() * (index + 1))),
    );
    const current = result[index]!;
    result[index] = result[randomIndex]!;
    result[randomIndex] = current;
  }
  return result;
}

/** Una palabra es nueva si no tiene estado local o nunca se introdujo. */
function isNewCard(card: StudyCardState | undefined): boolean {
  return card === undefined || card.introducedOn === null;
}

/**
 * Cola de repaso: ids de tarjetas introducidas y vencidas, mezclados
 * entre todas las categorías.
 *
 * Las tarjetas nuevas quedan fuera; entran por «Aprender nuevas».
 */
export function buildReviewQueue({
  cards,
  today,
  rng,
}: ReviewQueueInput): readonly string[] {
  const dueIds = Object.values(cards)
    .filter((card) => card.introducedOn !== null && isDue(card.due, today))
    .map((card) => card.id);
  return shuffle(dueIds, rng);
}

/**
 * Cupo de tarjetas nuevas que quedan hoy: `newPerDay` menos las
 * introducidas en el día de la sesión. Nunca es negativo.
 */
export function remainingNewToday(
  cards: Readonly<Record<string, StudyCardState>>,
  today: string,
  settings: StudySettings = DEFAULT_STUDY_SETTINGS,
): number {
  const introducedToday = Object.values(cards).filter(
    (card) => card.introducedOn === today,
  ).length;
  return Math.max(0, settings.newPerDay - introducedToday);
}

/**
 * Número de palabras nuevas disponibles en una categoría (`null` =
 * «Sin categoría»), sin aplicar el cupo diario.
 */
export function countNewAvailable(
  words: readonly StudyQueueWord[],
  cards: Readonly<Record<string, StudyCardState>>,
  categoryId: string | null,
): number {
  return words.filter(
    (word) => word.categoryId === categoryId && isNewCard(cards[word.id]),
  ).length;
}

/**
 * Cola de nuevas: ids nuevos de la categoría elegida, mezclados y
 * recortados al cupo diario restante.
 *
 * Devuelve `[]` cuando el cupo ya se agotó.
 */
export function buildNewQueue({
  cards,
  words,
  categoryId,
  today,
  settings = DEFAULT_STUDY_SETTINGS,
  rng,
}: NewQueueInput): readonly string[] {
  const remaining = remainingNewToday(cards, today, settings);
  if (remaining === 0) return [];

  const candidates = words
    .filter(
      (word) => word.categoryId === categoryId && isNewCard(cards[word.id]),
    )
    .map((word) => word.id);
  return shuffle(candidates, rng).slice(0, remaining);
}

/**
 * Aplica un «Otra vez» a la sesión actual.
 *
 * La primera vez reencola la tarjeta al final (máximo una); la segunda
 * la saca de la sesión y queda debida según el scheduler. No muta el
 * estado recibido.
 *
 * @example
 * requeueAfterAgain({ queue: ['b'], requeuedIds: new Set() }, 'a')
 * // → { queue: ['b', 'a'], requeuedIds: Set { 'a' }, leftSession: false }
 */
export function requeueAfterAgain(
  state: RequeueState,
  id: string,
): AgainResult {
  const queueWithoutId = state.queue.filter((queuedId) => queuedId !== id);

  if (state.requeuedIds.has(id)) {
    return {
      queue: queueWithoutId,
      requeuedIds: state.requeuedIds,
      leftSession: true,
    };
  }

  const requeuedIds = new Set(state.requeuedIds);
  requeuedIds.add(id);
  return {
    queue: [...queueWithoutId, id],
    requeuedIds,
    leftSession: false,
  };
}
