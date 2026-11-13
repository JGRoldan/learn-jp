/**
 * Interacción cliente de la fase 2: resumen de estudio y sesión.
 *
 * Todo el contenido de la hoja se inserta con `createElement` y
 * `textContent`; nunca con `innerHTML`/`set:html`. El progreso vive en
 * `localStorage` y se guarda tras cada respuesta.
 */

import { toLocalDateString } from '../shared/local-date';
import { createNewCard, gradeCard, isGrade } from '../features/study/sm2';
import {
  buildNewQueue,
  buildReviewQueue,
  countNewAvailable,
  remainingNewToday,
  requeueAfterAgain,
} from '../features/study/study.queue';
import {
  createEmptyStudyStore,
  getBrowserStorage,
  loadStudyStore,
  parseStudyBackup,
  pruneStudyCards,
  saveStudyStore,
  seedStudyCards,
  serializeStudyBackup,
  STUDY_UPDATED_EVENT,
  type KeyValueStorage,
} from '../features/study/study.storage';
import {
  UNCATEGORIZED_CATEGORY_PARAM,
  type StudyStore,
} from '../features/study/study.types';
import type {
  StudyPoolResponse,
  StudyPoolWord,
} from '../features/study/study.service';
import type { AnkiSegment } from '../features/vocabulary/anki-markup';
import type { ExampleView } from '../features/vocabulary/vocabulary.types';

const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\u3005\u3006\u30F6]/;

const STORAGE_UNAVAILABLE_MESSAGE =
  'Este navegador no permite guardar el progreso; la sesión funciona, pero no se conservará.';

const STORAGE_WRITE_MESSAGE =
  'No se pudo guardar el progreso en este navegador.';

const CORRUPT_STORE_MESSAGE =
  'No se pudo leer el progreso guardado; se empieza de cero.';

function getElement<T extends HTMLElement>(
  id: string,
  constructor: new () => T,
): T | null {
  const element = document.getElementById(id);
  return element instanceof constructor ? element : null;
}

async function fetchPool(): Promise<StudyPoolResponse> {
  try {
    const response = await fetch('/api/study/pool.json', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        ok: false,
        message: 'No se pudo cargar el vocabulario. Inténtalo de nuevo en unos minutos.',
      };
    }
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('ok' in body)) {
      return { ok: false, message: 'El servidor devolvió una respuesta inesperada.' };
    }
    return body as StudyPoolResponse;
  } catch {
    return {
      ok: false,
      message: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    };
  }
}

/** Carga el store local y devuelve el aviso que deba mostrarse, si hay. */
function loadProgress(storage: KeyValueStorage | null): {
  readonly store: StudyStore;
  readonly notice: string | null;
} {
  if (storage === null) {
    return { store: createEmptyStudyStore(), notice: STORAGE_UNAVAILABLE_MESSAGE };
  }
  const result = loadStudyStore(storage);
  return {
    store: result.store,
    notice: result.status === 'corrupt' ? CORRUPT_STORE_MESSAGE : null,
  };
}

function createRuby(base: string, reading: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'jp-ruby';
  wrapper.lang = 'ja';
  const ruby = document.createElement('ruby');
  ruby.append(document.createTextNode(base));
  const rt = document.createElement('rt');
  rt.textContent = reading;
  ruby.append(rt);
  wrapper.append(ruby);
  return wrapper;
}

function createSegments(segments: readonly AnkiSegment[]): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'jp-ruby';
  wrapper.lang = 'ja';
  for (const segment of segments) {
    if (segment.type === 'ruby') {
      wrapper.append(createRuby(segment.base, segment.reading));
    } else {
      wrapper.append(document.createTextNode(segment.text));
    }
  }
  return wrapper;
}

/** Renderiza la palabra como en la lista (Anki, ruby completo o apilado). */
function createWordContent(word: StudyPoolWord): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const wordElement = document.createElement('span');
  wordElement.className = 'word';
  wordElement.lang = 'ja';

  if (word.wordSegments !== null) {
    wordElement.append(createSegments(word.wordSegments));
    fragment.append(wordElement);
    return fragment;
  }

  const useRuby =
    word.palabra.length > 1 &&
    word.readings.length === 1 &&
    KANJI_RE.test(word.palabra);

  if (useRuby) {
    wordElement.append(createRuby(word.palabra, word.readings[0]!));
  } else {
    wordElement.textContent = word.palabra;
  }
  fragment.append(wordElement);

  if (!useRuby && word.readings.length > 0) {
    const stack = document.createElement('span');
    stack.className = 'reading-stack';
    stack.lang = 'ja';
    for (const reading of word.readings) {
      const line = document.createElement('span');
      line.className = 'reading-line';
      line.textContent = reading;
      stack.append(line);
    }
    fragment.append(stack);
  }

  return fragment;
}

function createExamples(examples: readonly ExampleView[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const example of examples) {
    const item = document.createElement('li');
    const text = document.createElement('span');
    text.className = 'example-text';
    text.lang = 'ja';

    const exampleHasKanji = KANJI_RE.test(example.text);
    if (example.segments !== null) {
      text.append(createSegments(example.segments));
    } else if (example.reading !== null && exampleHasKanji) {
      text.append(createRuby(example.text, example.reading));
    } else {
      text.textContent = example.text;
    }
    item.append(text);

    if (
      example.reading !== null &&
      example.segments === null &&
      !exampleHasKanji
    ) {
      const readingLine = document.createElement('span');
      readingLine.className = 'reading-line';
      readingLine.lang = 'ja';
      readingLine.textContent = example.reading;
      item.append(readingLine);
    }

    if (example.meaning !== null) {
      const meaning = document.createElement('span');
      meaning.className = 'example-meaning';
      meaning.textContent = example.meaning;
      item.append(meaning);
    }

    fragment.append(item);
  }
  return fragment;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Resumen (/estudiar)                                                 */
/* ------------------------------------------------------------------ */

/** Inicializa el resumen de estudio si la página lo contiene. */
export function initStudySummary(): void {
  const root = getElement('study-summary', HTMLElement);
  if (root === null) return;
  void runStudySummary();
}

async function runStudySummary(): Promise<void> {
  const notice = getElement('study-notice', HTMLParagraphElement);
  const dueCount = getElement('due-count', HTMLElement);
  const newCount = getElement('new-count', HTMLElement);
  const allowance = getElement('new-allowance', HTMLElement);
  const select = getElement('study-category', HTMLSelectElement);
  const newButton = getElement('new-button', HTMLButtonElement);
  const reviewLink = getElement('review-link', HTMLAnchorElement);
  const newPerDayInput = getElement('new-per-day', HTMLInputElement);
  const exportButton = getElement('backup-export', HTMLButtonElement);
  const importButton = getElement('backup-import-button', HTMLButtonElement);
  const backupFile = getElement('backup-file', HTMLInputElement);
  if (
    notice === null ||
    dueCount === null ||
    newCount === null ||
    allowance === null ||
    select === null ||
    newButton === null ||
    reviewLink === null ||
    newPerDayInput === null ||
    exportButton === null ||
    importButton === null ||
    backupFile === null
  ) {
    return;
  }

  const showNotice = (message: string): void => {
    notice.textContent = message;
    notice.hidden = false;
  };

  const storage = getBrowserStorage();
  const loaded = loadProgress(storage);
  if (loaded.notice !== null) showNotice(loaded.notice);

  const pool = await fetchPool();
  if (!pool.ok) {
    showNotice(pool.message);
    return;
  }

  const today = toLocalDateString(new Date());
  const validIds = new Set(pool.words.map((word) => word.id));
  let store = seedStudyCards(loaded.store, pool.words, today);
  if (store !== loaded.store && storage !== null) {
    if (saveStudyStore(store, storage)) {
      window.dispatchEvent(new Event(STUDY_UPDATED_EVENT));
    } else {
      showNotice(STORAGE_WRITE_MESSAGE);
    }
  }

  newPerDayInput.value = String(store.settings.newPerDay);
  let remaining = 0;

  const syncNewButton = (): void => {
    newButton.disabled = select.value === '' || remaining === 0;
  };

  const render = (): void => {
    const previousCategory = select.value;

    dueCount.textContent = String(
      buildReviewQueue({ cards: store.cards, today }).length,
    );
    remaining = remainingNewToday(store.cards, today, store.settings);
    allowance.textContent = String(remaining);

    const options = pool.categories.map((category) => ({
      id: category.id,
      name: category.name,
      count: countNewAvailable(pool.words, store.cards, category.id),
    }));
    const uncategorized = countNewAvailable(pool.words, store.cards, null);
    if (uncategorized > 0) {
      options.push({
        id: UNCATEGORIZED_CATEGORY_PARAM,
        name: 'Sin categoría',
        count: uncategorized,
      });
    }
    const totalNew = options.reduce((total, option) => total + option.count, 0);
    newCount.textContent = String(totalNew);

    select.replaceChildren();
    let firstAvailable = '';
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = `${option.name} (${option.count})`;
      element.disabled = option.count === 0;
      select.append(element);
      if (firstAvailable === '' && option.count > 0) {
        firstAvailable = option.id;
      }
    }

    if (options.length === 0) {
      const element = document.createElement('option');
      element.textContent = 'Sin categorías';
      select.append(element);
      select.disabled = true;
    } else {
      select.disabled = false;
      const keepPrevious = options.some(
        (option) => option.id === previousCategory && option.count > 0,
      );
      select.value = keepPrevious ? previousCategory : firstAvailable;
    }

    const due = buildReviewQueue({ cards: store.cards, today }).length;
    if (due === 0) {
      reviewLink.setAttribute('aria-disabled', 'true');
    } else {
      reviewLink.removeAttribute('aria-disabled');
    }

    syncNewButton();
  };

  select.addEventListener('change', syncNewButton);

  newButton.addEventListener('click', () => {
    const category = select.value;
    if (category === '' || remaining === 0) return;
    location.href = `/estudiar/sesion?modo=nuevas&categoria=${encodeURIComponent(category)}`;
  });

  reviewLink.addEventListener('click', (event) => {
    if (reviewLink.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
    }
  });

  newPerDayInput.addEventListener('change', () => {
    const value = Number(newPerDayInput.value);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      newPerDayInput.value = String(store.settings.newPerDay);
      showNotice('El cupo diario debe ser un número entero entre 1 y 100.');
      return;
    }
    if (value === store.settings.newPerDay) return;

    store = { ...store, settings: { ...store.settings, newPerDay: value } };
    if (storage === null || !saveStudyStore(store, storage)) {
      showNotice(STORAGE_WRITE_MESSAGE);
    } else {
      window.dispatchEvent(new Event(STUDY_UPDATED_EVENT));
    }
    render();
  });

  exportButton.addEventListener('click', () => {
    const blob = new Blob([serializeStudyBackup(store)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `jp-study-backup-${today}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

  importButton.addEventListener('click', () => backupFile.click());

  backupFile.addEventListener('change', () => {
    const file = backupFile.files?.[0];
    backupFile.value = '';
    if (file === undefined) return;

    if (file.size > MAX_BACKUP_BYTES) {
      showNotice('El archivo es demasiado grande para ser un respaldo válido.');
      return;
    }

    void file
      .text()
      .then((raw) => {
        const parsed = parseStudyBackup(raw);
        if (!parsed.ok) {
          showNotice(parsed.message);
          return;
        }

        store = pruneStudyCards(parsed.store, validIds);
        const cardCount = Object.keys(store.cards).length;
        if (storage === null || !saveStudyStore(store, storage)) {
          showNotice(
            'El respaldo es válido, pero este navegador no permite guardarlo.',
          );
          return;
        }

        window.dispatchEvent(new Event(STUDY_UPDATED_EVENT));
        showNotice(
          `Respaldo restaurado: ${cardCount} ${cardCount === 1 ? 'tarjeta' : 'tarjetas'}.`,
        );
        newPerDayInput.value = String(store.settings.newPerDay);
        render();
      })
      .catch(() => {
        showNotice('No se pudo leer el archivo seleccionado.');
      });
  });

  render();
}

/* ------------------------------------------------------------------ */
/* Sesión (/estudiar/sesion)                                           */
/* ------------------------------------------------------------------ */

/** Inicializa la sesión de estudio si la página la contiene. */
export function initStudySession(): void {
  const root = getElement('study-session', HTMLElement);
  if (root === null) return;
  void runStudySession(root);
}

async function runStudySession(root: HTMLElement): Promise<void> {
  const mode = root.dataset.mode === 'new' ? 'new' : 'review';
  const rawCategory = root.dataset.category ?? '';
  const categoryId = rawCategory === '' ? null : rawCategory;
  const rawLimit = root.dataset.limit ?? '';
  const limit = rawLimit === '' ? null : Number(rawLimit);

  const notice = getElement('session-notice', HTMLParagraphElement);
  const empty = getElement('session-empty', HTMLParagraphElement);
  const progress = getElement('session-progress', HTMLParagraphElement);
  const context = getElement('session-context', HTMLParagraphElement);
  const card = getElement('study-card', HTMLElement);
  const front = getElement('card-front', HTMLDivElement);
  const back = getElement('card-back', HTMLDivElement);
  const meaning = getElement('card-meaning', HTMLParagraphElement);
  const examples = getElement('card-examples', HTMLUListElement);
  const revealButton = getElement('reveal-button', HTMLButtonElement);
  const gradeGroup = getElement('study-grade', HTMLDivElement);
  const hintFront = getElement('hint-front', HTMLElement);
  const hintBack = getElement('hint-back', HTMLElement);
  const summary = getElement('session-summary', HTMLElement);
  const summaryTitle = getElement('session-summary-title', HTMLElement);
  const statCards = getElement('stat-cards', HTMLElement);
  const statAccuracy = getElement('stat-accuracy', HTMLElement);
  const statAgain = getElement('stat-again', HTMLElement);
  const statTime = getElement('stat-time', HTMLElement);

  if (
    notice === null ||
    empty === null ||
    progress === null ||
    context === null ||
    card === null ||
    front === null ||
    back === null ||
    meaning === null ||
    examples === null ||
    revealButton === null ||
    gradeGroup === null ||
    hintFront === null ||
    hintBack === null ||
    summary === null ||
    summaryTitle === null ||
    statCards === null ||
    statAccuracy === null ||
    statAgain === null ||
    statTime === null
  ) {
    return;
  }

  let warningShown = false;
  const showNotice = (message: string): void => {
    if (warningShown) return;
    warningShown = true;
    notice.textContent = message;
    notice.hidden = false;
  };

  const storage = getBrowserStorage();
  const loaded = loadProgress(storage);
  if (loaded.notice !== null) showNotice(loaded.notice);

  const pool = await fetchPool();
  if (!pool.ok) {
    showNotice(pool.message);
    empty.textContent = pool.message;
    empty.hidden = false;
    return;
  }

  const byId = new Map(pool.words.map((word) => [word.id, word]));
  const today = toLocalDateString(new Date());
  let store = seedStudyCards(loaded.store, pool.words, today);
  if (store !== loaded.store && storage !== null) {
    if (saveStudyStore(store, storage)) {
      window.dispatchEvent(new Event(STUDY_UPDATED_EVENT));
    } else {
      showNotice(STORAGE_WRITE_MESSAGE);
    }
  }

  context.textContent =
    mode === 'review'
      ? 'Todas las categorías'
      : (pool.categories.find((entry) => entry.id === categoryId)?.name ??
        'Sin categoría');

  let queue: string[] =
    mode === 'review'
      ? [...buildReviewQueue({ cards: store.cards, today })]
      : [
          ...buildNewQueue({
            cards: store.cards,
            words: pool.words,
            categoryId,
            today,
            settings: store.settings,
          }),
        ];

  if (mode === 'new' && limit !== null) {
    queue = queue.slice(0, limit);
  }

  const initialTotal = queue.length;
  let currentId: string | null = null;
  let revealed = false;
  let requeuedIds: ReadonlySet<string> = new Set<string>();
  let answered = 0;
  let correct = 0;
  let againCount = 0;
  const startedAt = Date.now();

  const saveProgress = (): void => {
    if (storage === null) return;
    if (!saveStudyStore(store, storage)) {
      showNotice(STORAGE_WRITE_MESSAGE);
      return;
    }
    window.dispatchEvent(new Event(STUDY_UPDATED_EVENT));
  };

  const updateProgress = (): void => {
    const remainingUnique = new Set(queue).size + (currentId === null ? 0 : 1);
    const finished = Math.max(0, initialTotal - remainingUnique);
    progress.textContent = `${finished} / ${initialTotal}`;
  };

  const setRevealed = (value: boolean): void => {
    revealed = value;
    back.hidden = !value;
    gradeGroup.hidden = !value;
    revealButton.hidden = value;
    hintFront.hidden = value;
    hintBack.hidden = !value;
  };

  const finish = (): void => {
    currentId = null;
    card.hidden = true;
    summary.hidden = false;
    progress.textContent = `${initialTotal} / ${initialTotal}`;

    statCards.textContent = String(initialTotal);
    statAccuracy.textContent =
      answered === 0 ? '—' : `${Math.round((correct / answered) * 100)} %`;
    statAgain.textContent = String(againCount);
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    statTime.textContent = formatDuration(seconds);
    summaryTitle.focus();
  };

  const showCard = (word: StudyPoolWord): void => {
    currentId = word.id;
    setRevealed(false);
    card.hidden = false;
    empty.hidden = true;

    front.replaceChildren(createWordContent(word));
    meaning.textContent = word.significado ?? '';
    meaning.hidden = word.significado === null;
    examples.replaceChildren(createExamples(word.examples));
    examples.hidden = word.examples.length === 0;

    updateProgress();
    revealButton.focus();
  };

  const showNext = (): void => {
    const id = queue.shift();
    if (id === undefined) {
      finish();
      return;
    }
    const word = byId.get(id);
    if (word === undefined) {
      showNext();
      return;
    }
    showCard(word);
  };

  const submit = (grade: 0 | 3 | 5): void => {
    if (!revealed || currentId === null) return;
    const id = currentId;
    const cardState = store.cards[id] ?? createNewCard(id);
    store = {
      ...store,
      cards: {
        ...store.cards,
        [id]: gradeCard(cardState, grade, today, {
          reviewedAt: new Date().toISOString(),
        }),
      },
    };
    saveProgress();

    answered += 1;
    if (grade === 0) {
      againCount += 1;
      const result = requeueAfterAgain({ queue, requeuedIds }, id);
      queue = [...result.queue];
      requeuedIds = result.requeuedIds;
    } else {
      correct += 1;
    }

    currentId = null;
    if (queue.length === 0) {
      finish();
      return;
    }
    showNext();
  };

  revealButton.addEventListener('click', () => {
    setRevealed(true);
    card.focus();
    updateProgress();
  });

  for (const button of gradeGroup.querySelectorAll<HTMLButtonElement>('.grade-button')) {
    button.addEventListener('click', () => {
      const grade = Number(button.dataset.grade);
      if (isGrade(grade)) submit(grade);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (card.hidden || currentId === null) return;

    if (!revealed) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setRevealed(true);
        card.focus();
        updateProgress();
      }
      return;
    }

    if (event.key === '1') {
      event.preventDefault();
      submit(0);
    } else if (event.key === '2') {
      event.preventDefault();
      submit(3);
    } else if (event.key === '3') {
      event.preventDefault();
      submit(5);
    }
  });

  if (initialTotal === 0) {
    empty.textContent =
      mode === 'review'
        ? 'No hay repasos pendientes hoy.'
        : 'No quedan palabras nuevas disponibles en esta categoría (o ya agotaste el cupo de hoy).';
    empty.hidden = false;
    empty.tabIndex = -1;
    empty.focus();
    return;
  }

  updateProgress();
  showNext();
}
