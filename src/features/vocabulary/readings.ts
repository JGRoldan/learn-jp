/**
 * Utilidades puras para lecturas japonesas y listas separadas por `|`.
 *
 * La hoja guarda las lecturas en columnas propias (sin marcado de
 * furigana): las lecturas de una palabra se separan por espacios y las
 * listas paralelas de ejemplos (texto / lectura / significado) se
 * separan por `|`, emparejándose por posición.
 */

/**
 * Run de kanji admitido: CJK Unified Ideographs (`\u4E00-\u9FFF`),
 * Extensión A (`\u3400-\u4DBF`) y caracteres kanji-like frecuentes:
 * marca de iteración `々` (U+3005), `〆` (U+3006) y 小ヶ (U+30F6).
 */
const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\u3005\u3006\u30F6]/;

/**
 * Indica si el texto contiene al menos un kanji.
 *
 * Decide cómo se renderiza una lectura: un texto con kanji puede llevar
 * furigana (`<ruby>`); un texto sin kanji (kana puro, estructuras
 * gramaticales, latín) se muestra como texto plano.
 *
 * @example
 * containsKanji('水曜日') // → true
 * containsKanji('〜について') // → false
 */
export function containsKanji(text: string): boolean {
  return KANJI_RE.test(text);
}

/**
 * Divide una lista separada por `|` (columnas `ejemplos`,
 * `lectura_ejemplos`, `significado_ejemplos`).
 *
 * Recorta espacios de cada item, colapsa separadores repetidos e ignora
 * items vacíos. El `|` permite espacios dentro de cada item (a diferencia
 * del separador por espacio), lo que hace viable la lista de significados
 * en español.
 *
 * @param value Contenido crudo de la celda; `null` si la fila no tiene valor.
 * @returns Items en su orden original; `[]` si no hay contenido.
 * @example
 * splitPipeList('駐車 | 駐車場 | 駐在') // → ['駐車', '駐車場', '駐在']
 * splitPipeList('Gratis | | Sin días libres') // → ['Gratis', 'Sin días libres']
 */
export function splitPipeList(value: string | null): string[] {
  if (value === null) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * Divide las lecturas de una palabra (columna `lectura`).
 *
 * Las lecturas se separan por espacio (ASCII y de ancho completo); el
 * guion es parte de la lectura (marca okurigana, p. ej. `な-い` en 無).
 *
 * @param value Contenido crudo de la celda; `null` si la fila no tiene valor.
 * @returns Lecturas individuales en su orden original; `[]` si no hay.
 * @example
 * splitReadings('ム ブ な-い') // → ['ム', 'ブ', 'な-い']
 */
export function splitReadings(value: string | null): string[] {
  if (value === null) return [];
  return value
    .split(/[\s\u3000]+/)
    .map((reading) => reading.trim())
    .filter((reading) => reading !== '');
}

/**
 * Convierte katakana estándar a hiragana (desplazamiento de bloque
 * `0x60`). Los caracteres sin contraparte directa — el chōonpu `ー`
 * y el punto medio `・` — pasan sin cambios.
 */
function katakanaToHiragana(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    const isShiftableKatakana =
      code >= 0x30a1 &&
      code <= 0x30f6 &&
      code !== 0x30fb &&
      code !== 0x30fc;
    result += isShiftableKatakana
      ? String.fromCodePoint(code - 0x60)
      : char;
  }
  return result;
}

/**
 * Normaliza una lectura para búsqueda: katakana → hiragana y sin
 * guiones ni espacios.
 *
 * Así una misma lectura se encuentra escribiéndola en cualquier silabario
 * o con la marca de okurigana (`な-い` ≡ `ない`, `チュウ` ≡ `ちゅう`).
 *
 * @example
 * normalizeReadingForSearch('チュウ') // → 'ちゅう'
 * normalizeReadingForSearch('な-い') // → 'ない'
 * normalizeReadingForSearch('ニホンゴ') // → 'にほんご'
 */
export function normalizeReadingForSearch(value: string): string {
  return katakanaToHiragana(value).replace(/[-\s\u3000]+/g, '');
}
