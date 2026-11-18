import type { AnkiSegment } from '../vocabulary/anki-markup';

/** Texto japonés de una parte del diálogo, con o sin furigana. */
export interface ConversationSpeech {
  /** Texto sin marcado Anki, listo para mostrar si no hay segmentos. */
  readonly text: string;
  /** Segmentos ruby cuando la celda usa marcado Anki; `null` en texto plano. */
  readonly segments: readonly AnkiSegment[] | null;
  /** Texto fonético derivado del marcado Anki; `null` en texto plano. */
  readonly reading: string | null;
}

/** Una intervención dentro de una etapa de la conversación. */
export interface ConversationLine {
  readonly speaker: ConversationSpeech;
  readonly japanese: ConversationSpeech;
  readonly translation: string | null;
  readonly note: string | null;
}

/** Grupo de intervenciones bajo un nombre de etapa dinámico. */
export interface ConversationStage {
  readonly name: string;
  readonly lines: readonly ConversationLine[];
}

/** Problema detectado al parsear una línea del guion. */
export interface ConversationScriptIssue {
  /** Número de línea dentro de la celda `guion` (empieza en 1). */
  readonly lineNumber: number;
  /** Motivo legible del problema. */
  readonly reason: string;
}

/** Fila del tab validada y normalizada antes de parsear el guion. */
export interface ValidatedConversationRow {
  readonly id: string;
  readonly titulo: string;
  readonly topico: string | null;
  readonly guion: string;
  readonly nivel: string | null;
}

/** Resultado de parsear la celda `guion` de una conversación. */
export interface ParsedConversationScript {
  readonly stages: readonly ConversationStage[];
  readonly issues: readonly ConversationScriptIssue[];
}

/** Conversación lista para la vista. */
export interface ConversationEntry {
  readonly id: string;
  readonly titulo: string;
  readonly topico: string | null;
  readonly nivel: string | null;
  readonly stages: readonly ConversationStage[];
  readonly searchTitle: string;
  readonly searchTopic: string;
  readonly searchLevel: string;
  readonly searchText: string;
  readonly searchReading: string;
  readonly searchMeaning: string;
}

/** Resultado correcto de {@link loadConversations}. */
export interface ConversationLoadSuccess {
  readonly ok: true;
  readonly entries: readonly ConversationEntry[];
  readonly topics: readonly string[];
  readonly levels: readonly string[];
  readonly invalidRowCount: number;
}

/** Resultado fallido de {@link loadConversations}. */
export interface ConversationLoadFailure {
  readonly ok: false;
  readonly message: string;
}

/** Resultado de {@link loadConversations}. */
export type ConversationLoadResult =
  | ConversationLoadSuccess
  | ConversationLoadFailure;
