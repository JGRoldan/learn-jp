import { describe, expect, it } from 'vitest';
import {
  buildNewQueue,
  buildReviewQueue,
  countNewAvailable,
  remainingNewToday,
  requeueAfterAgain,
  shuffle,
  type StudyQueueWord,
} from './study.queue';
import { createNewCard, gradeCard } from './sm2';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudyCardState,
} from './study.types';

const TODAY = '2026-11-13';

function reviewCard(
  id: string,
  overrides: Partial<StudyCardState> = {},
): StudyCardState {
  return {
    ...createNewCard(id),
    introducedOn: '2026-11-01',
    intervalDays: 6,
    due: TODAY,
    ...overrides,
  };
}

function word(id: string, categoryId: string | null): StudyQueueWord {
  return { id, categoryId };
}

/** Generador que devuelve siempre el mismo valor. */
const constantRng = (value: number) => () => value;

describe('shuffle', () => {
  it('mezcla sin mutar la lista original', () => {
    const input = [1, 2, 3];
    const result = shuffle(input, constantRng(0));
    expect(result).toEqual([2, 3, 1]);
    expect(input).toEqual([1, 2, 3]);
  });

  it('es determinista con el mismo generador', () => {
    const makeRng = () => {
      const values = [0.1, 0.7, 0.4, 0.9, 0.2];
      let index = 0;
      return () => values[index++ % values.length]!;
    };
    expect(shuffle([1, 2, 3, 4, 5], makeRng())).toEqual(
      shuffle([1, 2, 3, 4, 5], makeRng()),
    );
  });

  it('acota un generador que devuelve 1', () => {
    expect(shuffle([1, 2, 3], constantRng(1))).toEqual([1, 2, 3]);
  });

  it('maneja listas vacías y de un elemento', () => {
    expect(shuffle([], constantRng(0))).toEqual([]);
    expect(shuffle(['a'], constantRng(0))).toEqual(['a']);
  });
});

describe('buildReviewQueue', () => {
  it('incluye vencidas y de hoy, y excluye futuras y nuevas', () => {
    const cards = {
      overdue: reviewCard('overdue', { due: '2026-11-01' }),
      today: reviewCard('today', { due: TODAY }),
      future: reviewCard('future', { due: '2026-11-20' }),
      fresh: createNewCard('fresh'),
      noDue: {
        ...reviewCard('noDue'),
        due: null,
        introducedOn: null,
      },
    };
    const queue = buildReviewQueue({ cards, today: TODAY, rng: constantRng(1) });
    expect(new Set(queue)).toEqual(new Set(['overdue', 'today']));
  });

  it('devuelve una cola vacía si no hay nada vencido', () => {
    const cards = { future: reviewCard('future', { due: '2026-12-01' }) };
    expect(
      buildReviewQueue({ cards, today: TODAY, rng: constantRng(0) }),
    ).toEqual([]);
  });

  it('mezcla entre categorías (sin agrupar)', () => {
    const cards = {
      a: reviewCard('a'),
      b: reviewCard('b'),
      c: reviewCard('c'),
    };
    expect(
      buildReviewQueue({ cards, today: TODAY, rng: constantRng(0) }),
    ).toEqual(['b', 'c', 'a']);
  });
});

describe('remainingNewToday', () => {
  it('resta las tarjetas introducidas hoy', () => {
    const cards = {
      a: { ...reviewCard('a'), introducedOn: TODAY },
      b: { ...reviewCard('b'), introducedOn: TODAY },
      old: { ...reviewCard('old'), introducedOn: '2026-11-12' },
      fresh: createNewCard('fresh'),
    };
    expect(remainingNewToday(cards, TODAY)).toBe(8);
  });

  it('no baja de 0', () => {
    const cards = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `w${index}`,
        { ...reviewCard(`w${index}`), introducedOn: TODAY },
      ]),
    );
    expect(remainingNewToday(cards, TODAY)).toBe(0);
  });

  it('respeta un cupo configurado', () => {
    const settings = { ...DEFAULT_STUDY_SETTINGS, newPerDay: 3 };
    expect(remainingNewToday({}, TODAY, settings)).toBe(3);
  });
});

describe('countNewAvailable', () => {
  const words = [word('a', 'cat1'), word('b', 'cat1'), word('c', 'cat2')];

  it('cuenta solo las nuevas de la categoría', () => {
    const cards = { a: reviewCard('a'), b: createNewCard('b') };
    expect(countNewAvailable(words, cards, 'cat1')).toBe(1);
    expect(countNewAvailable(words, {}, 'cat1')).toBe(2);
  });

  it('trata la ausencia de categoría como «Sin categoría»', () => {
    const uncategorized = [word('x', null), word('y', null)];
    expect(countNewAvailable(uncategorized, {}, null)).toBe(2);
    expect(countNewAvailable(uncategorized, {}, 'cat1')).toBe(0);
  });
});

describe('buildNewQueue', () => {
  const words = [
    word('a', 'cat1'),
    word('b', 'cat1'),
    word('c', 'cat1'),
    word('d', 'cat2'),
    word('e', null),
  ];

  it('incluye solo palabras nuevas de la categoría elegida', () => {
    const cards = { a: reviewCard('a'), d: createNewCard('d') };
    const queue = buildNewQueue({
      cards,
      words,
      categoryId: 'cat1',
      today: TODAY,
      rng: constantRng(1),
    });
    expect(new Set(queue)).toEqual(new Set(['b', 'c']));
  });

  it('incluye palabras sin estado local', () => {
    const queue = buildNewQueue({
      cards: {},
      words,
      categoryId: 'cat1',
      today: TODAY,
      rng: constantRng(1),
    });
    expect(new Set(queue)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('recorta la cola al cupo diario restante', () => {
    const settings = { ...DEFAULT_STUDY_SETTINGS, newPerDay: 2 };
    const queue = buildNewQueue({
      cards: {},
      words,
      categoryId: 'cat1',
      today: TODAY,
      settings,
      rng: constantRng(1),
    });
    expect(queue).toHaveLength(2);
  });

  it('descuenta las nuevas introducidas hoy en cualquier categoría', () => {
    const settings = { ...DEFAULT_STUDY_SETTINGS, newPerDay: 2 };
    const cards = {
      other: { ...reviewCard('other'), introducedOn: TODAY },
    };
    const queue = buildNewQueue({
      cards,
      words,
      categoryId: 'cat1',
      today: TODAY,
      settings,
      rng: constantRng(1),
    });
    expect(queue).toHaveLength(1);
  });

  it('devuelve vacío cuando el cupo está agotado', () => {
    const settings = { ...DEFAULT_STUDY_SETTINGS, newPerDay: 1 };
    const cards = { other: { ...reviewCard('other'), introducedOn: TODAY } };
    expect(
      buildNewQueue({
        cards,
        words,
        categoryId: 'cat1',
        today: TODAY,
        settings,
      }),
    ).toEqual([]);
  });

  it('usa «Sin categoría» con categoryId null', () => {
    const queue = buildNewQueue({
      cards: {},
      words,
      categoryId: null,
      today: TODAY,
      rng: constantRng(1),
    });
    expect(queue).toEqual(['e']);
  });

  it('es determinista y no muta las entradas', () => {
    const cards = {};
    const first = buildNewQueue({
      cards,
      words,
      categoryId: 'cat1',
      today: TODAY,
      rng: constantRng(0),
    });
    const second = buildNewQueue({
      cards,
      words,
      categoryId: 'cat1',
      today: TODAY,
      rng: constantRng(0),
    });
    expect(first).toEqual(second);
    expect(words).toHaveLength(5);
  });
});

describe('requeueAfterAgain', () => {
  it('la primera vez reencola al final', () => {
    const result = requeueAfterAgain(
      { queue: ['b', 'c'], requeuedIds: new Set() },
      'a',
    );
    expect(result).toEqual({
      queue: ['b', 'c', 'a'],
      requeuedIds: new Set(['a']),
      leftSession: false,
    });
  });

  it('la segunda vez la saca de la sesión', () => {
    const result = requeueAfterAgain(
      { queue: ['b', 'a'], requeuedIds: new Set(['a']) },
      'a',
    );
    expect(result.queue).toEqual(['b']);
    expect(result.leftSession).toBe(true);
  });

  it('no duplica si la tarjeta sigue en la cola', () => {
    const result = requeueAfterAgain(
      { queue: ['a', 'b'], requeuedIds: new Set() },
      'a',
    );
    expect(result.queue).toEqual(['b', 'a']);
  });

  it('no muta el estado recibido', () => {
    const queue = ['b'];
    const requeuedIds = new Set<string>();
    requeueAfterAgain({ queue, requeuedIds }, 'a');
    expect(queue).toEqual(['b']);
    expect(requeuedIds.size).toBe(0);
  });
});

describe('integración con el scheduler', () => {
  it('una tarjeta calificada Otra vez sigue debida hoy', () => {
    const card = reviewCard('a');
    const next = gradeCard(card, 0, TODAY);
    const queue = buildReviewQueue({
      cards: { a: next },
      today: TODAY,
      rng: constantRng(1),
    });
    expect(queue).toEqual(['a']);
  });

  it('una tarjeta nueva calificada Bien sale del cupo y no de repaso', () => {
    const next = gradeCard(createNewCard('a'), 3, TODAY);
    expect(remainingNewToday({ a: next }, TODAY)).toBe(9);
    expect(
      buildReviewQueue({ cards: { a: next }, today: TODAY }),
    ).toEqual([]);
  });
});
