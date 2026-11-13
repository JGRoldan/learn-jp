/**
 * Badge de repasos pendientes en la cabecera.
 *
 * Lee solo el store local (sin pedir el pool) y se actualiza cuando la
 * sesión guarda progreso, al volver a la pestaña y ante cambios de
 * `localStorage` en otras pestañas.
 */

import { toLocalDateString } from '../shared/local-date';
import { buildReviewQueue } from '../features/study/study.queue';
import {
  getBrowserStorage,
  loadStudyStore,
  STUDY_STORE_KEY,
  STUDY_UPDATED_EVENT,
} from '../features/study/study.storage';

/** Inicializa el badge si la cabecera lo contiene. */
export function initStudyBadge(): void {
  const badge = document.getElementById('due-badge');
  if (!(badge instanceof HTMLElement)) return;

  const render = (): void => {
    const storage = getBrowserStorage();
    if (storage === null) {
      badge.hidden = true;
      return;
    }

    const { store } = loadStudyStore(storage);
    const due = buildReviewQueue({
      cards: store.cards,
      today: toLocalDateString(new Date()),
    }).length;

    if (due === 0) {
      badge.hidden = true;
      badge.textContent = '0';
      badge.removeAttribute('aria-label');
      return;
    }

    badge.hidden = false;
    badge.textContent = due > 99 ? '99+' : String(due);
    badge.setAttribute(
      'aria-label',
      due === 1 ? '1 repaso pendiente' : `${due} repasos pendientes`,
    );
  };

  render();
  window.addEventListener(STUDY_UPDATED_EVENT, render);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === STUDY_STORE_KEY) render();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
}
