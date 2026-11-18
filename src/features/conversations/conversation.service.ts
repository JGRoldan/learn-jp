import { logInvalidRows, type InvalidRowReport } from '../row-validation';
import { normalizeReadingForSearch } from '../vocabulary/readings';
import { readConversationRecords } from '../../infrastructure/google-sheets/conversations.repository';
import { SheetUnavailableError } from '../../infrastructure/google-sheets/sheet-csv.client';
import { MissingColumnsError } from '../../infrastructure/google-sheets/columns';
import { EnvironmentValidationError } from '../../config/env';
import { parseConversationScript } from './conversation-script';
import { validateConversationRows } from './conversation.validation';
import type {
  ConversationEntry,
  ConversationLoadResult,
  ConversationStage,
  ValidatedConversationRow,
} from './conversation.types';

/**
 * Construye los textos derivados de búsqueda de una conversación.
 *
 * El cliente normaliza estos valores igual que en vocabulario. Las
 * lecturas ya pasan por {@link normalizeReadingForSearch} para encontrar
 * katakana, guiones de okurigana y espacios de la misma forma.
 */
function buildSearchFields(
  row: ValidatedConversationRow,
  stages: readonly ConversationStage[],
): {
  searchTitle: string;
  searchTopic: string;
  searchLevel: string;
  searchText: string;
  searchReading: string;
  searchMeaning: string;
} {
  const japaneseTexts: string[] = [];
  const readings: string[] = [];
  const meanings: string[] = [];

  for (const stage of stages) {
    japaneseTexts.push(stage.name);
    for (const line of stage.lines) {
      japaneseTexts.push(line.speaker.text, line.japanese.text);
      if (line.speaker.reading !== null) readings.push(line.speaker.reading);
      if (line.japanese.reading !== null) readings.push(line.japanese.reading);
      if (line.translation !== null) meanings.push(line.translation);
      if (line.note !== null) meanings.push(line.note);
    }
  }

  return {
    searchTitle: row.titulo,
    searchTopic: row.topico ?? '',
    searchLevel: row.nivel ?? '',
    searchText: japaneseTexts.join('\n'),
    searchReading: readings
      .map(normalizeReadingForSearch)
      .filter((value) => value !== '')
      .join('\n'),
    searchMeaning: meanings.join('\n'),
  };
}

/** Convierte errores de carga en un mensaje seguro para la interfaz. */
function toUserMessage(error: unknown): string {
  console.error('[conversaciones] Error al cargar la hoja:', error);
  if (error instanceof SheetUnavailableError) return error.message;
  if (error instanceof MissingColumnsError) {
    return `La hoja de conversaciones no tiene la estructura esperada: ${error.message}. Corrige los encabezados en Google Sheets.`;
  }
  if (error instanceof EnvironmentValidationError) {
    return 'El sitio no está configurado correctamente. Revisa la consola del servidor.';
  }
  return 'No se pudieron cargar las conversaciones. Inténtalo de nuevo más tarde.';
}

/**
 * Carga las conversaciones de la hoja listas para la vista.
 *
 * Lee el tab en servidor con la caché corta habitual, valida las filas,
 * parsea cada guion y deriva los textos de búsqueda. Las líneas malformadas
 * del guion se reportan pero no impiden mostrar el resto de la conversación.
 *
 * @returns Conversaciones, temas y niveles disponibles; o un mensaje de error.
 */
export async function loadConversations(): Promise<ConversationLoadResult> {
  try {
    const records = await readConversationRecords();
    const { valid, invalid } = validateConversationRows(records);
    const invalidRows: InvalidRowReport[] = [...invalid];
    const entries: ConversationEntry[] = [];

    for (const { data: row, rowNumber } of valid) {
      const parsed = parseConversationScript(row.guion);
      for (const issue of parsed.issues) {
        invalidRows.push({
          label: 'conversaciones',
          rowNumber,
          reason: `guion, línea ${issue.lineNumber}: ${issue.reason}`,
        });
      }

      const lineCount = parsed.stages.reduce(
        (total, stage) => total + stage.lines.length,
        0,
      );
      if (lineCount === 0) {
        invalidRows.push({
          label: 'conversaciones',
          rowNumber,
          reason: 'el guion no contiene ninguna línea de diálogo válida',
        });
        continue;
      }

      entries.push({
        id: row.id,
        titulo: row.titulo,
        topico: row.topico,
        nivel: row.nivel,
        stages: parsed.stages,
        ...buildSearchFields(row, parsed.stages),
      });
    }

    logInvalidRows(invalidRows);

    const topics = [...new Set(entries.map((entry) => entry.topico).filter(
      (value): value is string => value !== null,
    ))].toSorted((a, b) => a.localeCompare(b, 'es'));

    const levels = [...new Set(entries.map((entry) => entry.nivel).filter(
      (value): value is string => value !== null,
    ))].toSorted((a, b) => a.localeCompare(b, 'es', { numeric: true }));

    return {
      ok: true,
      entries,
      topics,
      levels,
      invalidRowCount: invalidRows.length,
    };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
