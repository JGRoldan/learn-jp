/**
 * Controles client-side de vocabulario:
 *
 * - Búsqueda en vivo (con debounce) sobre palabra, lectura y significado.
 *   Se busca sobre los textos derivados (`data-word`, `data-reading`,
 *   `data-meaning`), nunca sobre el marcado Anki crudo.
 * - Filtros combinables por categoría y estado de aprendizaje.
 * - Contador de resultados y estado vacío.
 * - Alternar furigana (clase en <html> + localStorage), compartido por
 *   todas las páginas desde `BaseLayout`.
 *
 * Sin frameworks: vanilla TypeScript sobre el DOM ya renderizado.
 */

import { getStudyPhase } from '../features/study/sm2';
import {
  getBrowserStorage,
  loadStudyStore,
} from '../features/study/study.storage';
import {
  VOCABULARY_PAGE_SIZE,
  formatVisibleCount,
  nextVisibleLimit,
} from '../features/vocabulary/pagination';

const FURIGANA_STORAGE_KEY = 'jp-study:furigana';
const SEARCH_DEBOUNCE_MS = 150;

/**
 * Datos de una fila cacheados al inicializar los controles.
 *
 * Evita repetir `closest` y lecturas de `dataset` en cada cambio de
 * filtro. La normalización de búsqueda se calcula al primer uso para
 * no penalizar los cambios de categoría.
 */
interface VocabularyControlItem {
  readonly details: HTMLDetailsElement;
  readonly listItem: HTMLLIElement;
  readonly word: string;
  readonly reading: string;
  readonly meaning: string;
  readonly categoryId: string;
  searchFields: VocabularySearchFields | null;
}

interface VocabularySearchFields {
  readonly word: string;
  readonly reading: string;
  readonly meaning: string;
}

/** Normaliza texto para búsqueda: sin espacios, minúsculas y sin diacríticos. */
function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Inicializa los controles de la lista de vocabulario.
 *
 * El botón de furigana se inicializa desde {@link initFuriganaToggle}
 * en el layout base (aparece en todas las páginas); aquí solo se
 * conectan la búsqueda y los filtros. Si no existen los elementos
 * esperados (p. ej. pantalla de error), no hace nada.
 */
export function initVocabularyControls(): void {
  initSearchAndFilters();
}

/**
 * Configura el botón de furigana y su estado persistido.
 *
 * Alterna la clase `hide-furigana` en `<html>` (el CSS oculta los
 * `<rt>` y las lecturas apiladas) sin tocar los datos. Se llama desde
 * `BaseLayout` porque el botón vive en la cabecera de todas las páginas.
 */
export function initFuriganaToggle(): void {
  const toggle = document.getElementById('furigana-toggle');
  if (!(toggle instanceof HTMLButtonElement)) return;

  const isHidden = document.documentElement.classList.contains('hide-furigana');
  toggle.setAttribute('aria-pressed', String(!isHidden));

  toggle.addEventListener('click', () => {
    const nowHidden = document.documentElement.classList.toggle('hide-furigana');
    toggle.setAttribute('aria-pressed', String(!nowHidden));
    try {
      localStorage.setItem(FURIGANA_STORAGE_KEY, nowHidden ? 'off' : 'on');
    } catch {
      /* sin localStorage: la preferencia no persiste */
    }
  });
}

/** Configura la búsqueda en vivo, los filtros y la carga progresiva. */
function initSearchAndFilters(): void {
  const searchInput = document.getElementById('search-input');
  const categorySelect = document.getElementById('category-select');
  const learnedSelect = document.getElementById('learned-select');
  const resultCount = document.getElementById('result-count');
  const noResults = document.getElementById('no-results');
  const loadMore = document.getElementById('load-more');
  const items = document.querySelectorAll<HTMLDetailsElement>('details.vocabulary-item');

  if (
    !(searchInput instanceof HTMLInputElement) ||
    !(categorySelect instanceof HTMLSelectElement) ||
    !(learnedSelect instanceof HTMLSelectElement) ||
    !(resultCount instanceof HTMLElement) ||
    !(noResults instanceof HTMLElement) ||
    !(loadMore instanceof HTMLButtonElement) ||
    items.length === 0
  ) {
    return;
  }

  applyLocalLearnedState(items);

  const indexedItems = Array.from(items).flatMap((details) => {
    const listItem = details.closest('li');
    if (!(listItem instanceof HTMLLIElement)) return [];

    return [
      {
        details,
        listItem,
        word: details.dataset.word ?? '',
        reading: details.dataset.reading ?? '',
        meaning: details.dataset.meaning ?? '',
        categoryId: details.dataset.categoryId ?? '',
        searchFields: null,
      } satisfies VocabularyControlItem,
    ];
  });

  let visibleLimit = VOCABULARY_PAGE_SIZE;
  let matchingItems: VocabularyControlItem[] = [];
  let visibleItems: VocabularyControlItem[] = indexedItems.filter((item) =>
    item.listItem.classList.contains('is-visible'),
  );

  const matchesQuery = (item: VocabularyControlItem, query: string): boolean => {
    if (query === '') return true;

    item.searchFields ??= {
      word: normalizeForSearch(item.word),
      reading: normalizeForSearch(item.reading),
      meaning: normalizeForSearch(item.meaning),
    };

    return (
      item.searchFields.word.includes(query) ||
      item.searchFields.reading.includes(query) ||
      item.searchFields.meaning.includes(query)
    );
  };

  /**
   * Aplica el límite de filas visibles sobre las coincidencias actuales.
   * Solo toca las filas que estaban visibles y las que pasan a estarlo;
   * nunca recorre las 1600 filas para cambiar clases.
   */
  const updateChunk = (): void => {
    const shown = Math.min(visibleLimit, matchingItems.length);

    for (const item of visibleItems) {
      item.listItem.classList.remove('is-visible');
    }

    visibleItems = matchingItems.slice(0, shown);
    for (const item of visibleItems) {
      item.listItem.classList.add('is-visible');
    }

    resultCount.textContent = formatVisibleCount(shown, matchingItems.length);
    noResults.hidden = matchingItems.length !== 0;

    if (shown < matchingItems.length) {
      loadMore.hidden = false;
      return;
    }

    const hadFocus = document.activeElement === loadMore;
    loadMore.hidden = true;
    if (hadFocus) {
      const lastSummary = matchingItems.at(-1)?.details.querySelector('summary');
      if (lastSummary instanceof HTMLElement) lastSummary.focus();
    }
  };

  const applyFilters = (): void => {
    const query = normalizeForSearch(searchInput.value);
    const category = categorySelect.value;
    const learned = learnedSelect.value;
    const learnedValue = learned === 'learned' ? 'true' : 'false';
    matchingItems = [];

    for (const item of indexedItems) {
      const matchesCategory = category === 'all' || item.categoryId === category;
      const matchesLearned =
        learned === 'all' || item.details.dataset.learned === learnedValue;
      const matches = matchesCategory && matchesLearned && matchesQuery(item, query);

      if (item.listItem.hidden === matches) {
        item.listItem.hidden = !matches;
      }
      if (matches) matchingItems.push(item);
    }

    visibleLimit = VOCABULARY_PAGE_SIZE;
    updateChunk();
  };

  const showMore = (): void => {
    if (loadMore.hidden) return;
    visibleLimit = nextVisibleLimit(visibleLimit, matchingItems.length);
    updateChunk();
  };

  loadMore.addEventListener('click', showMore);

  // Auto-carga solo al desplazarse, nunca al aplicar filtros: así un
  // filtro con pocos resultados no salta de golpe a la segunda tanda.
  window.addEventListener(
    'scroll',
    () => {
      if (loadMore.hidden) return;
      const rect = loadMore.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 200 && rect.bottom >= 0) {
        showMore();
      }
    },
    { passive: true },
  );

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
  });
  categorySelect.addEventListener('change', applyFilters);
  learnedSelect.addEventListener('change', applyFilters);

  applyFilters();
}

/**
 * Recalcula el estado aprendido desde el progreso local (mejora
 * progresiva): una tarjeta es madura cuando su intervalo alcanza
 * `matureDays`. Las palabras sin estado local conservan el valor de la
 * columna `aprendido` de la hoja como respaldo.
 *
 * También sincroniza la insignia visible para que el filtro y la
 * etiqueta no se contradigan.
 */
function applyLocalLearnedState(
  items: NodeListOf<HTMLDetailsElement>,
): void {
  const storage = getBrowserStorage();
  if (storage === null) return;

  const { store } = loadStudyStore(storage);
  for (const item of items) {
    const id = item.dataset.id;
    if (id === undefined) continue;

    const card = store.cards[id];
    if (card === undefined) continue;

    const learned = getStudyPhase(card, store.settings) === 'mature';
    item.dataset.learned = learned ? 'true' : 'false';

    const badge = item.querySelector('.badge');
    if (badge instanceof HTMLElement) {
      badge.className = learned ? 'badge badge-learned' : 'badge badge-pending';
      badge.textContent = learned ? 'Aprendida' : 'Pendiente';
    }
  }
}
