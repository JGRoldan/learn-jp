import { z } from 'zod';

/**
 * Variables de entorno requeridas por la aplicación.
 *
 * - `GOOGLE_SHEETS_PUBLISHED_ID`: el ID del documento publicado en la web
 *   ("Compartir → Publicar en la web"), la parte de la URL publicada entre
 *   `/d/e/` y `/pub` (empieza por `2PACX-`).
 * - `GOOGLE_SHEETS_WORDS_GID`: gid del tab de palabras.
 * - `GOOGLE_SHEETS_CATEGORIES_GID`: gid del tab de categorías.
 */
export interface AppEnv {
  readonly publishedId: string;
  readonly wordsGid: string;
  readonly categoriesGid: string;
}

/** Error de configuración: falta una variable o tiene formato inválido. */
export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
}

const envSchema = z.object({
  GOOGLE_SHEETS_PUBLISHED_ID: z
    .string({ error: 'Falta GOOGLE_SHEETS_PUBLISHED_ID.' })
    .trim()
    .min(1, 'GOOGLE_SHEETS_PUBLISHED_ID está vacío.'),
  GOOGLE_SHEETS_WORDS_GID: z
    .string({ error: 'Falta GOOGLE_SHEETS_WORDS_GID.' })
    .trim()
    .regex(/^\d+$/, 'GOOGLE_SHEETS_WORDS_GID debe ser un gid numérico.'),
  GOOGLE_SHEETS_CATEGORIES_GID: z
    .string({ error: 'Falta GOOGLE_SHEETS_CATEGORIES_GID.' })
    .trim()
    .regex(/^\d+$/, 'GOOGLE_SHEETS_CATEGORIES_GID debe ser un gid numérico.'),
});

/**
 * Lee una variable de entorno desde `process.env` (runtime de producción)
 * con fallback a `import.meta.env` (dev, cargado por Vite desde `.env`).
 */
function readRawEnv(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (typeof fromProcess === 'string' && fromProcess.trim() !== '') {
    return fromProcess;
  }
  const viteEnv = import.meta.env as Record<string, unknown>;
  const fromVite = viteEnv?.[key];
  if (typeof fromVite === 'string' && fromVite.trim() !== '') {
    return fromVite;
  }
  return undefined;
}

let cachedEnv: AppEnv | null = null;

/**
 * Devuelve la configuración de entorno validada.
 *
 * Se valida una sola vez (el resultado se memoriza). Lanza un `Error` con
 * un mensaje claro que nombra las variables faltantes o inválidas, para que
 * el fallo sea evidente al arrancar la aplicación.
 *
 * @throws {Error} si alguna variable requerida falta o tiene formato inválido.
 */
export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse({
    GOOGLE_SHEETS_PUBLISHED_ID: readRawEnv('GOOGLE_SHEETS_PUBLISHED_ID'),
    GOOGLE_SHEETS_WORDS_GID: readRawEnv('GOOGLE_SHEETS_WORDS_GID'),
    GOOGLE_SHEETS_CATEGORIES_GID: readRawEnv('GOOGLE_SHEETS_CATEGORIES_GID'),
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `- ${issue.message}`)
      .join('\n');
    throw new EnvironmentValidationError(
      `Configuración de entorno inválida. Revisa tu archivo .env (ver .env.example):\n${details}`,
    );
  }

  cachedEnv = {
    publishedId: parsed.data.GOOGLE_SHEETS_PUBLISHED_ID,
    wordsGid: parsed.data.GOOGLE_SHEETS_WORDS_GID,
    categoriesGid: parsed.data.GOOGLE_SHEETS_CATEGORIES_GID,
  };
  return cachedEnv;
}
