/**
 * Servicio de estudio del lado del servidor.
 *
 * - Traduce el vocabulario ya validado a un pool compacto que el cliente
 *   usa para sembrar el store y montar las tarjetas.
 * - Valida los parámetros de la sesión (`modo`, `categoria`, `limite`)
 *   antes de que el cliente construya ninguna cola.
 */

import { z } from 'zod';
import type { Category } from '../categories/categories.types';
import type { AnkiSegment } from '../vocabulary/anki-markup';
import type { ExampleView, VocabularyLoadSuccess } from '../vocabulary/vocabulary.types';
import type { StudySeedEntry } from './study.storage';
import { UNCATEGORIZED_CATEGORY_PARAM } from './study.types';

/** Palabra del pool: datos de tarjeta + columnas semilla de la hoja. */
export interface StudyPoolWord extends StudySeedEntry {
  readonly palabra: string;
  readonly wordSegments: readonly AnkiSegment[] | null;
  readonly readings: readonly string[];
  readonly significado: string | null;
  readonly examples: readonly ExampleView[];
  readonly categoryId: string | null;
  readonly categoryName: string | null;
}

/** Respuesta correcta de `/api/study/pool.json`. */
export interface StudyPoolSuccess {
  readonly ok: true;
  readonly words: readonly StudyPoolWord[];
  readonly categories: readonly Category[];
}

/** Respuesta de error del pool (mensaje apto para el usuario). */
export interface StudyPoolFailure {
  readonly ok: false;
  readonly message: string;
}

/** Respuesta del endpoint del pool. */
export type StudyPoolResponse = StudyPoolSuccess | StudyPoolFailure;

/**
 * Convierte el vocabulario de la vista en el pool de estudio.
 *
 * Se omiten los textos de búsqueda (solo los usa la lista) y se
 * conservan la palabra renderizable, los ejemplos y las columnas de
 * repaso como semilla.
 */
export function toStudyPool(result: VocabularyLoadSuccess): StudyPoolSuccess {
  return {
    ok: true,
    categories: result.categories,
    words: result.entries.map((entry) => ({
      id: entry.id,
      palabra: entry.palabra,
      wordSegments: entry.wordSegments,
      readings: entry.readings,
      significado: entry.significado,
      examples: entry.examples,
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      aprendido: entry.aprendido,
      vecesRepaso: entry.vecesRepaso,
      rachaAciertos: entry.rachaAciertos,
      factorFacilidad: entry.factorFacilidad,
      intervaloDias: entry.intervaloDias,
      proximoRepaso: entry.proximoRepaso,
    })),
  };
}

/** Modo de sesión ya validado. */
export interface StudySessionParams {
  readonly mode: 'review' | 'new';
  /** Categoría elegida para nuevas; `null` = «Sin categoría». */
  readonly categoryId: string | null;
  /** Tope opcional de tarjetas para esta sesión. */
  readonly limit: number | null;
}

/** Resultado de validar la query de la sesión. */
export type StudySessionParamsResult =
  | { readonly ok: true; readonly params: StudySessionParams }
  | { readonly ok: false; readonly message: string };

const sessionParamsSchema = z.object({
  modo: z.enum(['repaso', 'nuevas']),
  categoria: z.string().trim().min(1).max(200).optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Valida la query de `/estudiar/sesion`.
 *
 * `modo` es obligatorio; `categoria` es obligatoria para `nuevas` y se
 * ignora en `repaso`; `limite` es un entero opcional entre 1 y 500.
 * Nunca lanza y no expone detalles internos en el mensaje.
 */
export function parseSessionParams(
  searchParams: URLSearchParams,
): StudySessionParamsResult {
  const parsed = sessionParamsSchema.safeParse(
    Object.fromEntries(searchParams.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Los parámetros de la sesión no son válidos. Vuelve a la pantalla de estudio.',
    };
  }

  if (parsed.data.modo === 'repaso') {
    return {
      ok: true,
      params: { mode: 'review', categoryId: null, limit: null },
    };
  }

  const { categoria, limite } = parsed.data;
  if (categoria === undefined) {
    return {
      ok: false,
      message: 'Elige una categoría para aprender palabras nuevas.',
    };
  }

  return {
    ok: true,
    params: {
      mode: 'new',
      categoryId:
        categoria === UNCATEGORIZED_CATEGORY_PARAM ? null : categoria,
      limit: limite ?? null,
    },
  };
}
