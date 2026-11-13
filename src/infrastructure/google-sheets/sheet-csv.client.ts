import Papa from 'papaparse';
import { getEnv } from '../../config/env';

/** Tiempo máximo de espera para la descarga del CSV de un tab. */
const FETCH_TIMEOUT_MS = 10_000;

/** Vigencia de la copia en memoria de cada tab antes de volver a leerlo. */
const CACHE_TTL_MS = 30_000;

/** Tabla cruda leída de un tab: headers + filas de celdas. */
export interface SheetTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/**
 * Error cuando el CSV de la hoja no puede obtenerse en condiciones:
 * red caída, timeout, respuesta no-200, respuesta HTML (hoja no pública)
 * o respuesta que no es un CSV parseable.
 */
export class SheetUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SheetUnavailableError';
  }
}

interface CacheEntry {
  readonly table: SheetTable;
  readonly expiresAt: number;
}

/** Caché en memoria por gid: TTL corto + copia "stale" para fallos. */
const tableCache = new Map<string, CacheEntry>();

/**
 * Construye la URL del CSV publicado de un tab de la hoja.
 *
 * Formato: `https://docs.google.com/spreadsheets/d/e/<PUBLISHED_ID>/pub?gid=<GID>&single=true&output=csv`,
 * donde `PUBLISHED_ID` es el ID del documento publicado en la web (la parte
 * entre `/d/e/` y `/pub`, empieza por `2PACX-`) y `GID` el gid del tab.
 * Ambos provienen de variables de entorno; nunca se hardcodean.
 */
function buildCsvUrl(publishedId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(
    publishedId,
  )}/pub?gid=${encodeURIComponent(gid)}&single=true&output=csv`;
}

/** Descarga y parsea el CSV de un tab. Lanza {@link SheetUnavailableError}. */
async function fetchTable(gid: string): Promise<SheetTable> {
  const { publishedId } = getEnv();
  const url = buildCsvUrl(publishedId, gid);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'text/csv' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new SheetUnavailableError(
        'Tiempo de espera agotado al contactar Google Sheets.',
        { cause: error },
      );
    }
    throw new SheetUnavailableError(
      `No se pudo conectar con Google Sheets: ${
        error instanceof Error ? error.message : 'error desconocido'
      }`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new SheetUnavailableError(
      `Google Sheets respondió con estado ${response.status}. Revisa el ID del documento publicado y los gid de las pestañas.`,
    );
  }

  const body = await response.text();

  // Google puede devolver una página HTML (con estado 200) cuando el
  // documento no está publicado correctamente o el ID/gid es incorrecto.
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('html') || body.trimStart().startsWith('<')) {
    throw new SheetUnavailableError(
      'Google devolvió HTML en lugar de CSV. Revisa que el documento esté publicado en la web ("Compartir → Publicar en la web", formato CSV) y que el ID publicado y los gid de las pestañas sean correctos.',
    );
  }

  const parsed = Papa.parse<string[]>(body, { skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!;
    throw new SheetUnavailableError(
      `La respuesta de la hoja no es un CSV válido (${first.message}).`,
    );
  }

  const rows = parsed.data;
  if (rows.length === 0) {
    throw new SheetUnavailableError(
      'La pestaña está vacía o no contiene la fila de encabezados.',
    );
  }

  const [headers, ...dataRows] = rows;
  return { headers: headers ?? [], rows: dataRows };
}

/**
 * Obtiene la tabla de un tab de la hoja con caché en memoria.
 *
 * - Dentro del TTL (30 s) se sirve la copia en caché, para no descargar
 *   el CSV en cada request.
 * - Si el refresco falla pero existe una copia anterior (aunque caducada),
 *   se sirve esa copia y el fallo se registra en el log del servidor.
 * - Si no hay copia previa, el error se propaga.
 *
 * @param gid Identificador del tab a leer.
 * @param sheetLabel Etiqueta legible del tab ("words"/"categories"), solo
 *   para los mensajes de log.
 * @returns Tabla cruda del tab (primera fila = headers).
 * @throws {SheetUnavailableError} si la hoja no puede leerse y no hay caché.
 */
export async function getSheetTable(
  gid: string,
  sheetLabel: string,
): Promise<SheetTable> {
  const entry = tableCache.get(gid);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.table;
  }

  try {
    const table = await fetchTable(gid);
    tableCache.set(gid, { table, expiresAt: Date.now() + CACHE_TTL_MS });
    return table;
  } catch (error) {
    if (entry) {
      console.warn(
        `[google-sheets] Fallo al refrescar el tab "${sheetLabel}" (se sirve la última copia en caché): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return entry.table;
    }
    throw error;
  }
}
