import {
  ankiReadingText,
  hasAnkiMarkup,
  parseAnkiMarkup,
  stripAnkiMarkup,
} from '../vocabulary/anki-markup';
import type {
  ConversationLine,
  ConversationSpeech,
  ParsedConversationScript,
} from './conversation.types';

/** Nombre de la etapa usada cuando aparecen líneas antes de la primera `@`. */
const DEFAULT_STAGE_NAME = 'General';

/**
 * Convierte un fragmento de diálogo en texto, segmentos ruby y lectura.
 *
 * El formato se detecta por celda, igual que en vocabulario: con marcado
 * Anki se generan segmentos y texto fonético; sin él se conserva el texto.
 *
 * @param value Valor crudo de hablante o japonés.
 * @returns Datos derivados listos para renderizar y buscar.
 */
function buildSpeech(value: string): ConversationSpeech {
  const hasAnki = hasAnkiMarkup(value);
  return {
    text: hasAnki ? stripAnkiMarkup(value) : value,
    segments: hasAnki ? parseAnkiMarkup(value) : null,
    reading: hasAnki ? ankiReadingText(value) : null,
  };
}

/**
 * Parsea la celda multilínea `guion` de una conversación.
 *
 * Formato esperado:
 *
 * - `@...` inicia una etapa con ese nombre exacto. No hay etapas fijas.
 * - El resto de líneas son `hablante|japonés|traducción|nota`.
 * - Traducción y nota son opcionales.
 *
 * El parser es puro y nunca lanza. Las líneas malformadas se reportan con
 * su número de línea y se omiten; las líneas previas a la primera etapa se
 * agrupan bajo `General` y también se reportan.
 *
 * @param raw Contenido de la celda `guion`.
 * @returns Etapas ordenadas y avisos de líneas problemáticas.
 *
 * @example
 * parseConversationScript('@Inicio\n妻[つま]|今日[きょう]はいい天気|Hoy hace buen tiempo');
 */
export function parseConversationScript(raw: string): ParsedConversationScript {
  const stages: { name: string; lines: ConversationLine[] }[] = [];
  const issues: { lineNumber: number; reason: string }[] = [];

  let current: { name: string; lines: ConversationLine[] } | null = null;
  const sourceLines = raw.split(/\r?\n/);

  for (const [index, sourceLine] of sourceLines.entries()) {
    const lineNumber = index + 1;
    const line = sourceLine.trim();
    if (line === '') continue;

    if (line.startsWith('@')) {
      const name = line.slice(1).trim();
      if (name === '') {
        issues.push({ lineNumber, reason: 'etapa sin nombre; se ignora' });
        continue;
      }
      current = { name, lines: [] };
      stages.push(current);
      continue;
    }

    const parts = line.split('|').map((part) => part.trim());
    if (parts.length > 4) {
      issues.push({
        lineNumber,
        reason: 'demasiados campos; se esperan como máximo 4 separados por |',
      });
      continue;
    }

    const speakerRaw = parts[0] ?? '';
    const japaneseRaw = parts[1] ?? '';
    if (speakerRaw === '' || japaneseRaw === '') {
      issues.push({
        lineNumber,
        reason: 'faltan el hablante o el texto japonés',
      });
      continue;
    }

    if (current === null) {
      current = { name: DEFAULT_STAGE_NAME, lines: [] };
      stages.push(current);
      issues.push({
        lineNumber,
        reason: `línea antes de la primera etapa; se agrupó en "${DEFAULT_STAGE_NAME}"`,
      });
    }

    const parsedLine: ConversationLine = {
      speaker: buildSpeech(speakerRaw),
      japanese: buildSpeech(japaneseRaw),
      translation: (parts[2] ?? '') === '' ? null : (parts[2] ?? ''),
      note: (parts[3] ?? '') === '' ? null : (parts[3] ?? ''),
    };
    current.lines.push(parsedLine);
  }

  return { stages, issues };
}
