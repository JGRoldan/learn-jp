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

const FURIGANA_STORAGE_KEY = 'jp-study:furigana';
const SEARCH_DEBOUNCE_MS = 150;

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

/** Configura la búsqueda en vivo y los filtros combinables. */
function initSearchAndFilters(): void {
  const searchInput = document.getElementById('search-input');
  const categorySelect = document.getElementById('category-select');
  const learnedSelect = document.getElementById('learned-select');
  const resultCount = document.getElementById('result-count');
  const noResults = document.getElementById('no-results');
  const items = document.querySelectorAll<HTMLDetailsElement>('details.vocabulary-item');

  if (
    !(searchInput instanceof HTMLInputElement) ||
    !(categorySelect instanceof HTMLSelectElement) ||
    !(learnedSelect instanceof HTMLSelectElement) ||
    !(resultCount instanceof HTMLElement) ||
    !(noResults instanceof HTMLElement) ||
    items.length === 0
  ) {
    return;
  }

  applyLocalLearnedState(items);

  const matchesQuery = (item: HTMLDetailsElement, query: string): boolean => {
    if (query === '') return true;
    const word = normalizeForSearch(item.dataset.word ?? '');
    const reading = normalizeForSearch(item.dataset.reading ?? '');
    const meaning = normalizeForSearch(item.dataset.meaning ?? '');
    return word.includes(query) || reading.includes(query) || meaning.includes(query);
  };

  const applyFilters = (): void => {
    const query = normalizeForSearch(searchInput.value);
    const category = categorySelect.value;
    const learned = learnedSelect.value;
    let visibleCount = 0;

    for (const item of items) {
      const matchesCategory =
        category === 'all' || item.dataset.categoryId === category;
      const matchesLearned =
        learned === 'all' || item.dataset.learned === (learned === 'learned' ? 'true' : 'false');
      const matches = matchesCategory && matchesLearned && matchesQuery(item, query);

      item.hidden = !matches;
      if (matches) visibleCount += 1;
    }

    resultCount.textContent =
      visibleCount === 1 ? '1 palabra' : `${visibleCount} palabras`;
    noResults.hidden = visibleCount !== 0;
  };

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
  });
  categorySelect.addEventListener('change', applyFilters);
  learnedSelect.addEventListener('change', applyFilters);
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
