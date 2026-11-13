/**
 * Persistencia del progreso de estudio en el navegador.
 *
 * Todo el estado vive en `localStorage` bajo una única clave, se valida
 * con Zod al leer y nunca se envía a un servidor. Un store ausente,
 * corrupto o de una versión desconocida no rompe la aplicación: se
 * devuelve un store vacío con el estado `corrupt` para que la UI avise
 * (el respaldo JSON permite recuperar el progreso).
 *
 * La hoja solo siembra tarjetas que aún no tienen estado local; una vez
 * que existe una entrada en el navegador, esta manda (AGENTS §17).
 */

import { z } from 'zod';
import { addDays, isLocalDate } from '../../shared/local-date';
import { INITIAL_EASE } from './sm2';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudyCardState,
  type StudySettings,
  type StudyStore,
} from './study.types';

/** Clave de `localStorage` donde se guarda el store completo. */
export const STUDY_STORE_KEY = 'jp-study:srs:v1';

/**
 * Evento de ventana que se emite tras guardar el store, para que otros
 * componentes de la misma página (p. ej. el badge de repasos) se
 * actualicen sin recargar.
 */
export const STUDY_UPDATED_EVENT = 'jp-study:updated';

/** Acceso mínimo a almacenamiento clave-valor (compatible con `Storage`). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Datos de una palabra necesarios para sembrar su tarjeta desde la hoja.
 *
 * `VocabularyEntry` es asignable a este tipo; se mantiene aquí para no
 * acoplar la persistencia del estudio al modelo de la vista.
 */
export interface StudySeedEntry {
  readonly id: string;
  readonly aprendido: boolean;
  readonly vecesRepaso: number | null;
  readonly rachaAciertos: number | null;
  readonly factorFacilidad: number | null;
  readonly intervaloDias: number | null;
  /** Día local `YYYY-MM-DD`; cualquier otro valor se ignora. */
  readonly proximoRepaso: string | null;
}

/** Resultado de leer el store: `empty` y `corrupt` devuelven uno vacío. */
export interface StudyStoreLoadResult {
  readonly store: StudyStore;
  readonly status: 'empty' | 'loaded' | 'corrupt';
}

/** Resultado de validar un respaldo importado. */
export type StudyBackupParseResult =
  | {
      readonly ok: true;
      readonly store: StudyStore;
      readonly cardCount: number;
    }
  | { readonly ok: false; readonly message: string };

const localDateSchema = z
  .string()
  .refine(isLocalDate, { message: 'día local inválido (YYYY-MM-DD)' });

const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'fecha ISO inválida',
  });

const studyCardStateSchema = z
  .object({
    id: z.string().min(1),
    introducedOn: localDateSchema.nullable(),
    ef: z
      .number()
      .min(DEFAULT_STUDY_SETTINGS.efMin)
      .max(DEFAULT_STUDY_SETTINGS.efMax),
    intervalDays: z.number().int().min(0),
    streak: z.number().int().min(0),
    reps: z.number().int().min(0),
    lapses: z.number().int().min(0),
    due: localDateSchema.nullable(),
    lastReviewedAt: isoDateTimeSchema.nullable(),
  })
  .superRefine((card, context) => {
    if ((card.introducedOn === null) !== (card.due === null)) {
      context.addIssue({
        code: 'custom',
        message: 'introducedOn y due deben ser ambos nulos o ambos días',
      });
    }
  });

const studySettingsSchema = z
  .object({
    newPerDay: z.number().int().min(1),
    easyBonus: z.number().min(1),
    efMin: z.number().min(1),
    efMax: z.number().min(1),
    matureDays: z.number().int().min(1),
    graduationEasyDays: z.number().int().min(1),
  })
  .refine((settings) => settings.efMin <= settings.efMax, {
    message: 'efMin no puede superar efMax',
  });

const cardsSchema = z
  .record(z.string().min(1), studyCardStateSchema)
  .refine(
    (cards) => Object.entries(cards).every(([id, card]) => card.id === id),
    { message: 'la clave del mapa debe coincidir con el id de la tarjeta' },
  );

const studyStoreSchema = z.object({
  version: z.literal(1),
  cards: cardsSchema,
  settings: studySettingsSchema,
});

/** Store vacío listo para usar (primera visita o store corrupto). */
export function createEmptyStudyStore(
  settings: StudySettings = DEFAULT_STUDY_SETTINGS,
): StudyStore {
  return { version: 1, cards: {}, settings };
}

/**
 * Accede a `localStorage` si el navegador lo expone y permite usarlo
 * (puede lanzar en modo privado o con cookies bloqueadas).
 */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Lee y valida el store.
 *
 * Nunca lanza: un valor ausente produce `empty`, y un JSON inválido, un
 * esquema desconocido o un almacenamiento ilegible producen `corrupt`
 * con un store vacío.
 */
export function loadStudyStore(storage: KeyValueStorage): StudyStoreLoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STUDY_STORE_KEY);
  } catch {
    return { store: createEmptyStudyStore(), status: 'corrupt' };
  }

  if (raw === null || raw.trim() === '') {
    return { store: createEmptyStudyStore(), status: 'empty' };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { store: createEmptyStudyStore(), status: 'corrupt' };
  }

  const parsed = studyStoreSchema.safeParse(value);
  if (!parsed.success) {
    return { store: createEmptyStudyStore(), status: 'corrupt' };
  }
  return { store: parsed.data, status: 'loaded' };
}

/**
 * Guarda el store validándolo antes.
 *
 * Si el store no cumple el esquema no se escribe nada (evita persistir
 * un estado roto que luego se descartaría al leer). Devuelve `false`
 * también cuando el almacenamiento rechaza la escritura (cuota, modo
 * privado).
 */
export function saveStudyStore(
  store: StudyStore,
  storage: KeyValueStorage,
): boolean {
  if (!studyStoreSchema.safeParse(store).success) return false;
  try {
    storage.setItem(STUDY_STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** Redondea a dos decimales para no arrastrar error binario en `ef`. */
function roundEf(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Convierte un valor numérico de la hoja en un contador entero ≥ 0. */
function toCount(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

/**
 * Construye la tarjeta sembrada de una palabra sin estado local.
 *
 * - Sin datos de repaso en la hoja → tarjeta NUEVA (EF 2.5, `due` nulo).
 * - Con datos → tarjeta introducida: `introducedOn` se aproxima como
 *   `due − intervalo` (o el propio día si el intervalo es 0); si hay
 *   progreso pero no fecha, la tarjeta queda debida hoy para que entre
 *   en el primer repaso.
 * - EF se acota a `[efMin, efMax]`; contadores se redondean y no bajan
 *   de 0; fechas inválidas se ignoran.
 */
function seedCard(
  entry: StudySeedEntry,
  settings: StudySettings,
  today: string,
): StudyCardState {
  const reps = toCount(entry.vecesRepaso);
  const intervalDays = toCount(entry.intervaloDias);
  const streak = toCount(entry.rachaAciertos);
  const ef = roundEf(
    Math.min(
      settings.efMax,
      Math.max(
        settings.efMin,
        entry.factorFacilidad === null ? INITIAL_EASE : entry.factorFacilidad,
      ),
    ),
  );
  const sheetDue =
    entry.proximoRepaso !== null && isLocalDate(entry.proximoRepaso)
      ? entry.proximoRepaso
      : null;
  const hasProgress =
    entry.aprendido ||
    reps > 0 ||
    streak > 0 ||
    intervalDays > 0 ||
    sheetDue !== null;
  const due = sheetDue ?? (hasProgress ? today : null);
  const introducedOn =
    due === null
      ? null
      : intervalDays > 0
        ? addDays(due, -intervalDays)
        : due;

  return {
    id: entry.id,
    introducedOn,
    ef,
    intervalDays,
    streak,
    reps,
    lapses: 0,
    due,
    lastReviewedAt: null,
  };
}

/**
 * Siembra las tarjetas que aún no tienen estado local.
 *
 * Las palabras con entrada local nunca se sobrescriben: el progreso del
 * navegador manda. Devuelve el mismo store si no había nada que sembrar.
 *
 * @param today Día local de la carga (`YYYY-MM-DD`), usado como fecha de
 *   introducción cuando la hoja tiene progreso pero no fechas.
 * @throws {TypeError} Si `today` no es un día local válido.
 */
export function seedStudyCards(
  store: StudyStore,
  entries: readonly StudySeedEntry[],
  today: string,
): StudyStore {
  if (!isLocalDate(today)) {
    throw new TypeError(`fecha local inválida: "${today}"`);
  }

  let changed = false;
  const cards: Record<string, StudyCardState> = { ...store.cards };
  for (const entry of entries) {
    if (cards[entry.id] !== undefined) continue;
    cards[entry.id] = seedCard(entry, store.settings, today);
    changed = true;
  }
  return changed ? { ...store, cards } : store;
}

/**
 * Elimina tarjetas cuyo id ya no existe en la hoja.
 *
 * Se ejecuta antes de guardar para no acumular estado huérfano. Devuelve
 * el mismo store si no había nada que eliminar.
 */
export function pruneStudyCards(
  store: StudyStore,
  validIds: ReadonlySet<string>,
): StudyStore {
  const entries = Object.entries(store.cards);
  const kept = entries.filter(([id]) => validIds.has(id));
  if (kept.length === entries.length) return store;

  const cards: Record<string, StudyCardState> = {};
  for (const [id, card] of kept) {
    cards[id] = card;
  }
  return { ...store, cards };
}

/** Serializa el store como respaldo JSON legible (dos espacios). */
export function serializeStudyBackup(store: StudyStore): string {
  return JSON.stringify(store, null, 2);
}

/**
 * Valida un respaldo JSON antes de restaurarlo.
 *
 * Los mensajes son genéricos a propósito: no se exponen detalles del
 * esquema ni del contenido del archivo.
 */
export function parseStudyBackup(raw: string): StudyBackupParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      message: 'El archivo no contiene JSON válido.',
    };
  }

  const parsed = studyStoreSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      message: 'El respaldo no tiene el formato esperado o está dañado.',
    };
  }
  return {
    ok: true,
    store: parsed.data,
    cardCount: Object.keys(parsed.data.cards).length,
  };
}
