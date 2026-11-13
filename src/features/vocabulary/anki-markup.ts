/**
 * Parser del marcado Anki de furigana: una lectura entre corchetes
 * inmediatamente después del kanji al que pertenece.
 *
 * La hoja mezcla dos formatos de fila:
 *
 * - **Kanji suelto** (formato plano): `lectura` y `lectura_ejemplos`
 *   contienen lecturas separadas por espacio, sin corchetes.
 * - **Palabra completa** (formato Anki): `lectura` y `lectura_ejemplos`
 *   contienen el texto con marcado, p. ej. `父[ちち]親[おや]`.
 *
 * Este módulo solo se ocupa del segundo formato. Es puro, determinista y
 * nunca lanza: las partes malformadas se muestran como texto crudo.
 */

/**
 * Segmento de texto ya interpretado.
 *
 * - `plain`: texto sin furigana (kana, puntuación, latín…).
 * - `ruby`: run de kanji (`base`) con su lectura (`reading`).
 */
export type AnkiSegment =
  | { readonly type: 'plain'; readonly text: string }
  | { readonly type: 'ruby'; readonly base: string; readonly reading: string };

/**
 * Clase de caracteres kanji: CJK Unified Ideographs, Extensión A y
 * kanji-like frecuentes (`々`, `〆`, `ヶ`).
 */
const KANJI_CLASS = '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\u3005\\u3006\\u30F6]';

/**
 * Token de marcado Anki: un espacio opcional (artefacto de exportación
 * que no debe filtrarse a la salida), un run de kanji y una lectura no
 * vacía entre corchetes. La lectura admite cualquier carácter salvo
 * corchetes (se toleran katakana y signos de prolongación).
 */
const ANKI_TOKEN_RE = new RegExp(` ?(${KANJI_CLASS}+)\\[([^\\[\\]]+)\\]`, 'g');

/** Detección rápida: ¿contiene el valor al menos un token Anki? */
const HAS_ANKI_RE = new RegExp(`${KANJI_CLASS}\\[[^\\[\\]]+\\]`);

/**
 * Indica si un valor de celda usa marcado Anki (kanji + `[lectura]`).
 *
 * Se usa para decidir, por fila, entre el formato plano (lecturas
 * separadas por espacio) y el formato Anki (furigana por kanji).
 *
 * @example
 * hasAnkiMarkup('父[ちち]親[おや]') // → true
 * hasAnkiMarkup('チュウ') // → false
 */
export function hasAnkiMarkup(value: string | null): boolean {
  if (value === null) return false;
  return HAS_ANKI_RE.test(value);
}

/**
 * Divide un texto con marcado Anki en segmentos ordenados.
 *
 * El texto fuera de los tokens (kana, puntuación, latín) llega como
 * segmentos `plain`. Un corchete sin kanji precedente, una lectura
 * vacía u otros casos malformados nunca lanzan: quedan como texto
 * crudo dentro del segmento `plain` correspondiente.
 *
 * @param value Texto con marcado Anki (p. ej. la columna `lectura`).
 * @returns Segmentos en orden; `[]` para un valor vacío.
 * @example
 * parseAnkiMarkup('食[た]べる') // → [{ ruby: 食/た }, { plain: 'べる' }]
 */
export function parseAnkiMarkup(value: string): readonly AnkiSegment[] {
  const segments: AnkiSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(ANKI_TOKEN_RE)) {
    const index = match.index ?? 0;
    // El gap antes del token es texto plano; el espacio opcional del
    // token se descarta para no filtrar separadores espurios (artefacto
    // de exportación de Anki).
    if (index > cursor) {
      segments.push({ type: 'plain', text: value.slice(cursor, index) });
    }
    segments.push({
      type: 'ruby',
      base: match[1]!,
      reading: match[2]!,
    });
    cursor = index + match[0].length;
  }

  if (cursor < value.length) {
    segments.push({ type: 'plain', text: value.slice(cursor) });
  }
  return segments;
}

/**
 * Texto plano sin lecturas: cada token se sustituye por su base.
 *
 * @example
 * stripAnkiMarkup('父[ちち]親[おや]は') // → '父親は'
 */
export function stripAnkiMarkup(value: string): string {
  let result = '';
  for (const segment of parseAnkiMarkup(value)) {
    result += segment.type === 'ruby' ? segment.base : segment.text;
  }
  return result;
}

/**
 * Texto fonético: cada token se sustituye por su lectura y el texto
 * plano se conserva, de modo que el resultado es la frase completa en
 * kana.
 *
 * @example
 * ankiReadingText('父[ちち]親[おや]は') // → 'ちちおやは'
 */
export function ankiReadingText(value: string): string {
  let result = '';
  for (const segment of parseAnkiMarkup(value)) {
    result += segment.type === 'ruby' ? segment.reading : segment.text;
  }
  return result;
}
