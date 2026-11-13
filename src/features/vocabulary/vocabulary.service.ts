import { loadCategories } from '../categories/categories.service';
import type { Category } from '../categories/categories.types';
import { readWordRecords } from '../../infrastructure/google-sheets/vocabulary.repository';
import { SheetUnavailableError } from '../../infrastructure/google-sheets/sheet-csv.client';
import { MissingColumnsError } from '../../infrastructure/google-sheets/columns';
import { EnvironmentValidationError } from '../../config/env';
import { logInvalidRows } from '../row-validation';
import {
  ankiReadingText,
  hasAnkiMarkup,
  parseAnkiMarkup,
} from './anki-markup';
import {
  normalizeReadingForSearch,
  splitPipeList,
  splitReadings,
} from './readings';
import { validateVocabularyRows } from './vocabulary.validation';
import type {
  ExampleView,
  VocabularyEntry,
  VocabularyLoadResult,
  VocabularyViewEntry,
} from './vocabulary.types';

/**
 * Construye la entrada de vista de una palabra válida.
 *
 * Las derivaciones de búsqueda y el emparejado de ejemplos se calculan
 * aquí, una sola vez en servidor; el cliente solo filtra sobre los
 * valores ya calculados.
 *
 * La hoja mezcla dos formatos por fila, detectados por celda:
 *
 * - **Plano** (kanji suelto): `lectura` con lecturas separadas por
 *   espacio; se apilan bajo la palabra y los ejemplos se leen enteros.
 * - **Anki** (palabra completa): `lectura` / `lectura_ejemplos` con
 *   marcado `父[ちち]親[おや]`; se renderiza furigana por kanji y la
 *   búsqueda usa los textos derivados (sin corchetes).
 *
 * Las listas paralelas de la hoja (`ejemplos` / `lectura_ejemplos` /
 * `significado_ejemplos`) se emparejan por posición. Si alguna lista
 * tiene más items que `ejemplos`, se registra un warning en la consola
 * del servidor y los items sobrantes se ignoran; los huecos se quedan
 * como `null` y no se muestran.
 */
function buildViewEntry(
  entry: VocabularyEntry,
  rowNumber: number,
  category: Category | null,
): VocabularyViewEntry {
  // Formato Anki: la lectura trae el marcado completo de la palabra.
  const wordIsAnki = hasAnkiMarkup(entry.lectura);
  const wordSegments = wordIsAnki && entry.lectura !== null
    ? parseAnkiMarkup(entry.lectura)
    : null;
  const readings = wordIsAnki && entry.lectura !== null
    ? [ankiReadingText(entry.lectura)]
    : splitReadings(entry.lectura);

  const exampleTexts = splitPipeList(entry.ejemplos);
  const exampleReadings = splitPipeList(entry.lecturaEjemplos);
  const exampleMeanings = splitPipeList(entry.significadoEjemplos);

  if (
    exampleReadings.length > exampleTexts.length ||
    exampleMeanings.length > exampleTexts.length
  ) {
    console.warn(
      `[vocabulary] Fila ${rowNumber} de la hoja: listas de ejemplos desalineadas (ejemplos=${exampleTexts.length}, lecturas=${exampleReadings.length}, significados=${exampleMeanings.length}); se emparejan por posición.`,
    );
  }

  const examples: ExampleView[] = exampleTexts.map((text, index) => {
    const rawReading = exampleReadings[index] ?? null;
    // Lectura con marcado Anki → furigana por kanji y texto fonético.
    if (rawReading !== null && hasAnkiMarkup(rawReading)) {
      return {
        text,
        reading: ankiReadingText(rawReading),
        meaning: exampleMeanings[index] ?? null,
        segments: parseAnkiMarkup(rawReading),
      };
    }
    return {
      text,
      reading: rawReading,
      meaning: exampleMeanings[index] ?? null,
      segments: null,
    };
  });

  const searchReading = [readings, ...examples.map((e) => e.reading)]
    .filter((value): value is string => value !== null)
    .map(normalizeReadingForSearch)
    .filter((value) => value !== '')
    .join('\n');

  const searchMeaning = [entry.significado, ...exampleMeanings]
    .filter((value): value is string => value !== null)
    .join('\n');

  return {
    id: entry.id,
    palabra: entry.palabra,
    readings,
    wordSegments,
    significado: entry.significado,
    examples,
    categoryId: entry.categoriaId,
    categoryName: category?.name ?? null,
    aprendido: entry.aprendido,
    vecesRepaso: entry.vecesRepaso,
    rachaAciertos: entry.rachaAciertos,
    factorFacilidad: entry.factorFacilidad,
    intervaloDias: entry.intervaloDias,
    proximoRepaso: entry.proximoRepaso,
    searchWord: [entry.palabra, ...exampleTexts].join('\n'),
    searchReading,
    searchMeaning,
  };
}

/**
 * Convierte cualquier error de carga en un mensaje apto para la interfaz,
 * sin exponer stack traces, valores de entorno ni respuestas crudas.
 * El error original siempre queda registrado en la consola del servidor.
 */
function toUserMessage(error: unknown): string {
  console.error('[vocabulary] Error al cargar la hoja:', error);
  if (error instanceof SheetUnavailableError) {
    return error.message;
  }
  if (error instanceof MissingColumnsError) {
    return `La hoja no tiene la estructura esperada: ${error.message}. Corrige los encabezados en Google Sheets.`;
  }
  if (error instanceof EnvironmentValidationError) {
    return 'El sitio no está configurado correctamente. Revisa la consola del servidor.';
  }
  return 'No se pudo cargar el vocabulario. Inténtalo de nuevo más tarde.';
}

/**
 * Carga el vocabulario completo listo para la página.
 *
 * - Lee los tabs "words" y "categories" en paralelo (con la caché corta de
 *   la infraestructura, las ediciones de la hoja aparecen sin redeploy).
 * - Descarta y reporta las filas inválidas de ambos tabs.
 * - Las palabras de categorías inactivas se ocultan; las que apuntan a una
 *   categoría desconocida se muestran sin nombre de categoría.
 * - El filtro de categorías lista solo las categorías activas, ordenadas
 *   por nombre.
 *
 * Nunca lanza: los fallos se devuelven como resultado `ok: false` con un
 * mensaje apto para el usuario.
 *
 * @returns Entradas, categorías activas y conteo de filas descartadas; o
 *   un mensaje de error.
 */
export async function loadVocabulary(): Promise<VocabularyLoadResult> {
  try {
    const [wordRecords, categoriesResult] = await Promise.all([
      readWordRecords(),
      loadCategories(),
    ]);

    const words = validateVocabularyRows(wordRecords);
    const invalidRows = [...words.invalid, ...categoriesResult.invalidRows];
    logInvalidRows(invalidRows);

    const categoryById = new Map(
      categoriesResult.categories.map((category) => [category.id, category]),
    );

    const entries: VocabularyViewEntry[] = [];
    for (const { data: entry, rowNumber } of words.valid) {
      const category =
        entry.categoriaId === null
          ? null
          : (categoryById.get(entry.categoriaId) ?? null);

      // Categoría inactiva → la palabra se oculta. Id de categoría
      // desconocido → se muestra igual, sin nombre de categoría.
      if (category !== null && !category.active) {
        continue;
      }
      entries.push(buildViewEntry(entry, rowNumber, category));
    }

    const activeCategories = categoriesResult.categories
      .filter((category) => category.active)
      .toSorted((a, b) => a.name.localeCompare(b.name, 'es'));

    return {
      ok: true,
      entries,
      categories: activeCategories,
      invalidRowCount: invalidRows.length,
    };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
