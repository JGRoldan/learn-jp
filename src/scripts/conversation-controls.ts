/**
 * Controles client-side de la página de conversaciones:
 * búsqueda con debounce, filtros por tema y nivel, y carga progresiva.
 *
 * La lista ya viene renderizada por el servidor; el script solo oculta
 * filas y calcula las coincidencias sobre textos derivados.
 */

const SEARCH_DEBOUNCE_MS = 150;

interface ConversationSearchFields {
  readonly title: string;
  readonly topic: string;
  readonly level: string;
  readonly text: string;
  readonly reading: string;
  readonly meaning: string;
}

interface ConversationControlItem {
  readonly details: HTMLDetailsElement;
  readonly listItem: HTMLLIElement;
  readonly topic: string;
  readonly level: string;
  readonly title: string;
  readonly text: string;
  readonly reading: string;
  readonly meaning: string;
  searchFields: ConversationSearchFields | null;
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
 * Inicializa búsqueda, filtros y carga progresiva de conversaciones.
 *
 * Si faltan elementos (p. ej. pantalla de error), no hace nada.
 */
export function initConversationControls(): void {
  const searchInput = document.getElementById('conversation-search-input');
  const topicSelect = document.getElementById('conversation-topic-select');
  const levelSelect = document.getElementById('conversation-level-select');
  const resultCount = document.getElementById('conversation-result-count');
  const noResults = document.getElementById('conversation-no-results');
  const loadMore = document.getElementById('conversation-load-more');
  const items = document.querySelectorAll<HTMLDetailsElement>(
    'details.conversation-item',
  );

  if (
    !(searchInput instanceof HTMLInputElement) ||
    !(topicSelect instanceof HTMLSelectElement) ||
    !(levelSelect instanceof HTMLSelectElement) ||
    !(resultCount instanceof HTMLElement) ||
    !(noResults instanceof HTMLElement) ||
    !(loadMore instanceof HTMLButtonElement) ||
    items.length === 0
  ) {
    return;
  }

  const indexedItems = Array.from(items).flatMap((details) => {
    const listItem = details.closest('li');
    if (!(listItem instanceof HTMLLIElement)) return [];

    return [
      {
        details,
        listItem,
        topic: details.dataset.topic ?? '',
        level: details.dataset.level ?? '',
        title: details.dataset.searchTitle ?? '',
        text: details.dataset.searchText ?? '',
        reading: details.dataset.searchReading ?? '',
        meaning: details.dataset.searchMeaning ?? '',
        searchFields: null,
      } satisfies ConversationControlItem,
    ];
  });

  let visibleLimit = 20;
  let matchingItems: ConversationControlItem[] = [];
  let visibleItems: ConversationControlItem[] = indexedItems.filter((item) =>
    item.listItem.classList.contains('is-visible'),
  );

  const matchesQuery = (item: ConversationControlItem, query: string): boolean => {
    if (query === '') return true;

    item.searchFields ??= {
      title: normalizeForSearch(item.title),
      topic: normalizeForSearch(item.topic),
      level: normalizeForSearch(item.level),
      text: normalizeForSearch(item.text),
      reading: normalizeForSearch(item.reading),
      meaning: normalizeForSearch(item.meaning),
    };

    return Object.values(item.searchFields).some((value) =>
      value.includes(query),
    );
  };

  const updateChunk = (): void => {
    const shown = Math.min(visibleLimit, matchingItems.length);

    for (const item of visibleItems) {
      item.listItem.classList.remove('is-visible');
    }

    visibleItems = matchingItems.slice(0, shown);
    for (const item of visibleItems) {
      item.listItem.classList.add('is-visible');
    }

    const plural = matchingItems.length === 1 ? 'conversación' : 'conversaciones';
    resultCount.textContent =
      shown < matchingItems.length
        ? `Mostrando ${shown} de ${matchingItems.length} ${plural}`
        : `${matchingItems.length} ${plural}`;

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
    const topic = topicSelect.value;
    const level = levelSelect.value;
    matchingItems = [];

    for (const item of indexedItems) {
      const matchesTopic = topic === 'all' || item.topic === topic;
      const matchesLevel = level === 'all' || item.level === level;
      const matches =
        matchesTopic && matchesLevel && matchesQuery(item, query);

      if (item.listItem.hidden === matches) {
        item.listItem.hidden = !matches;
      }
      if (matches) matchingItems.push(item);
    }

    visibleLimit = 20;
    updateChunk();
  };

  const showMore = (): void => {
    if (loadMore.hidden) return;
    visibleLimit = Math.min(
      visibleLimit + 20,
      matchingItems.length,
    );
    updateChunk();
  };

  loadMore.addEventListener('click', showMore);

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
  topicSelect.addEventListener('change', applyFilters);
  levelSelect.addEventListener('change', applyFilters);

  applyFilters();
}
