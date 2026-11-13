import type { APIRoute } from 'astro';
import {
  toStudyPool,
  type StudyPoolResponse,
} from '../../../features/study/study.service';
import { loadVocabulary } from '../../../features/vocabulary/vocabulary.service';

export const prerender = false;

/**
 * Pool de estudio para el cliente: palabras renderizables, categorías y
 * columnas de repaso como semilla del store local.
 *
 * Se lee la hoja en cada petición (con la caché corta de
 * `loadVocabulary`) y nunca se cachea la respuesta en el navegador.
 */
export const GET: APIRoute = async () => {
  const result = await loadVocabulary();

  const body: StudyPoolResponse = result.ok
    ? toStudyPool(result)
    : { ok: false, message: result.message };

  return new Response(JSON.stringify(body), {
    status: result.ok ? 200 : 502,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
