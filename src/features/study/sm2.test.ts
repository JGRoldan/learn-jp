import { describe, expect, it } from 'vitest';
import { addDays } from '../../shared/local-date';
import {
  createNewCard,
  getStudyPhase,
  gradeCard,
  INITIAL_EASE,
  isGrade,
} from './sm2';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudyCardState,
} from './study.types';

const TODAY = '2026-11-13';

/** Tarjeta ya introducida, en repaso, con valores cómodos de partida. */
function reviewCard(
  overrides: Partial<StudyCardState> = {},
): StudyCardState {
  return {
    ...createNewCard('w1'),
    introducedOn: '2026-01-01',
    ef: 2.5,
    intervalDays: 10,
    streak: 3,
    reps: 5,
    due: TODAY,
    lastReviewedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('createNewCard', () => {
  it('crea una tarjeta nueva con los valores iniciales', () => {
    expect(createNewCard('42')).toEqual({
      id: '42',
      introducedOn: null,
      ef: INITIAL_EASE,
      intervalDays: 0,
      streak: 0,
      reps: 0,
      lapses: 0,
      due: null,
      lastReviewedAt: null,
    });
  });

  it('considera nueva cualquier tarjeta sin palabra introducida', () => {
    expect(getStudyPhase(createNewCard('42'))).toBe('new');
  });
});

describe('isGrade', () => {
  it('acepta solo 0, 3 y 5', () => {
    expect([0, 3, 5].every(isGrade)).toBe(true);
    expect([1, 2, 4, 6, -1, 3.5, '3', null, undefined].some(isGrade)).toBe(
      false,
    );
  });
});

describe('getStudyPhase', () => {
  it('es joven por debajo de matureDays y madura al alcanzarlo', () => {
    expect(getStudyPhase(reviewCard({ intervalDays: 20 }))).toBe('review');
    expect(getStudyPhase(reviewCard({ intervalDays: 21 }))).toBe('mature');
  });

  it('respeta un umbral de madurez distinto', () => {
    const settings = { ...DEFAULT_STUDY_SETTINGS, matureDays: 30 };
    expect(getStudyPhase(reviewCard({ intervalDays: 21 }), settings)).toBe(
      'review',
    );
    expect(getStudyPhase(reviewCard({ intervalDays: 30 }), settings)).toBe(
      'mature',
    );
  });

  it('trata como nueva una tarjeta sin introducedOn aunque tenga intervalo', () => {
    expect(
      getStudyPhase(reviewCard({ introducedOn: null, intervalDays: 30 })),
    ).toBe('new');
  });
});

describe('gradeCard · tarjeta nueva', () => {
  it('Otra vez la introduce y la deja debida hoy', () => {
    const next = gradeCard(createNewCard('w1'), 0, TODAY);
    expect(next).toMatchObject({
      introducedOn: TODAY,
      intervalDays: 0,
      streak: 0,
      reps: 1,
      lapses: 0,
      due: TODAY,
      ef: INITIAL_EASE,
    });
  });

  it('Bien la introduce a 1 día', () => {
    const next = gradeCard(createNewCard('w1'), 3, TODAY);
    expect(next).toMatchObject({
      introducedOn: TODAY,
      intervalDays: 1,
      streak: 1,
      reps: 1,
      due: addDays(TODAY, 1),
    });
  });

  it('Fácil la introduce a graduationEasyDays', () => {
    const next = gradeCard(createNewCard('w1'), 5, TODAY);
    expect(next).toMatchObject({
      introducedOn: TODAY,
      intervalDays: DEFAULT_STUDY_SETTINGS.graduationEasyDays,
      streak: 1,
      reps: 1,
      due: addDays(TODAY, DEFAULT_STUDY_SETTINGS.graduationEasyDays),
    });
  });

  it('no altera el factor de facilidad de una tarjeta nueva', () => {
    const seeded = reviewCard({ introducedOn: null, intervalDays: 0, ef: 1.8 });
    for (const grade of [0, 3, 5] as const) {
      expect(gradeCard(seeded, grade, TODAY).ef).toBe(1.8);
    }
  });

  it('acepta un graduationEasyDays distinto', () => {
    const next = gradeCard(createNewCard('w1'), 5, TODAY, {
      settings: { ...DEFAULT_STUDY_SETTINGS, graduationEasyDays: 7 },
    });
    expect(next.intervalDays).toBe(7);
    expect(next.due).toBe(addDays(TODAY, 7));
  });
});

describe('gradeCard · en repaso', () => {
  it('Otra vez baja la facilidad, reinicia racha e intervalo', () => {
    const next = gradeCard(reviewCard(), 0, TODAY);
    expect(next).toMatchObject({
      ef: 2.3,
      intervalDays: 1,
      streak: 0,
      reps: 6,
      lapses: 1,
      due: TODAY,
    });
  });

  it('Otra vez no baja la facilidad por debajo de efMin', () => {
    expect(gradeCard(reviewCard({ ef: 1.4 }), 0, TODAY).ef).toBe(1.3);
    expect(gradeCard(reviewCard({ ef: 1.3 }), 0, TODAY).ef).toBe(1.3);
  });

  it('Bien incrementa la racha y usa 1 → 6 → I × EF', () => {
    const first = gradeCard(reviewCard({ intervalDays: 1, streak: 1 }), 3, TODAY);
    expect(first.intervalDays).toBe(6);
    expect(first.streak).toBe(2);

    const later = gradeCard(reviewCard({ intervalDays: 6, streak: 2 }), 3, TODAY);
    expect(later.intervalDays).toBe(15);
    expect(later.streak).toBe(3);

    const following = gradeCard(reviewCard({ intervalDays: 15 }), 3, TODAY);
    expect(following.intervalDays).toBe(38);
    expect(following.streak).toBe(4);
  });

  it('Bien recalcula sobre el intervalo actual y el EF real', () => {
    const next = gradeCard(
      reviewCard({ intervalDays: 10, ef: 2 }),
      3,
      TODAY,
    );
    expect(next.intervalDays).toBe(20);
    expect(next.ef).toBe(2);
  });

  it('Bien fija el próximo repaso a hoy + intervalo', () => {
    const next = gradeCard(reviewCard({ intervalDays: 6, streak: 2 }), 3, TODAY);
    expect(next.due).toBe(addDays(TODAY, 15));
  });

  it('Fácil sube la facilidad y aplica el bonus', () => {
    const next = gradeCard(reviewCard({ intervalDays: 10 }), 5, TODAY);
    // round(max(11, 10 × 2.5) × 1.3) = round(32.5) = 33
    expect(next.intervalDays).toBe(33);
    expect(next.ef).toBe(2.65);
    expect(next.streak).toBe(4);
    expect(next.due).toBe(addDays(TODAY, 33));
  });

  it('Fácil no supera efMax', () => {
    expect(gradeCard(reviewCard({ ef: 2.95 }), 5, TODAY).ef).toBe(3);
    expect(gradeCard(reviewCard({ ef: 3 }), 5, TODAY).ef).toBe(3);
  });

  it('la secuencia de Bien es 1 → 6 → 15 → 38 → 95 días', () => {
    let card = createNewCard('w1');
    let day = TODAY;
    const intervals: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      card = gradeCard(card, 3, day);
      intervals.push(card.intervalDays);
      day = card.due!;
    }
    expect(intervals).toEqual([1, 6, 15, 38, 95]);
  });
});

describe('gradeCard · tarjeta madura', () => {
  it('Otra vez la devuelve a joven y debida hoy', () => {
    const card = reviewCard({ intervalDays: 30 });
    expect(getStudyPhase(card)).toBe('mature');

    const next = gradeCard(card, 0, TODAY);
    expect(getStudyPhase(next)).toBe('review');
    expect(next).toMatchObject({
      ef: 2.3,
      intervalDays: 1,
      streak: 0,
      lapses: 1,
      due: TODAY,
    });
  });

  it('Bien la mantiene madura si el nuevo intervalo sigue por encima', () => {
    const next = gradeCard(reviewCard({ intervalDays: 30 }), 3, TODAY);
    expect(next.intervalDays).toBe(75);
    expect(getStudyPhase(next)).toBe('mature');
  });
});

describe('gradeCard · invariantes', () => {
  it('incrementa reps en cada respuesta y nunca toca id', () => {
    const card = reviewCard({ reps: 7 });
    for (const grade of [0, 3, 5] as const) {
      const next = gradeCard(card, grade, TODAY);
      expect(next.reps).toBe(8);
      expect(next.id).toBe(card.id);
    }
  });

  it('solo incrementa lapses al fallar en repaso', () => {
    const freshAgain = gradeCard(createNewCard('w1'), 0, TODAY);
    expect(freshAgain.lapses).toBe(0);
    expect(gradeCard(reviewCard({ lapses: 2 }), 3, TODAY).lapses).toBe(2);
    expect(gradeCard(reviewCard({ lapses: 2 }), 5, TODAY).lapses).toBe(2);
    expect(gradeCard(reviewCard({ lapses: 2 }), 0, TODAY).lapses).toBe(3);
  });

  it('no muta la tarjeta original', () => {
    const card = Object.freeze(reviewCard());
    const next = gradeCard(card, 3, TODAY);
    expect(next).not.toBe(card);
    expect(card).toEqual(reviewCard());
  });

  it('conserva lastReviewedAt si no se aporta y lo reemplaza si se aporta', () => {
    const card = reviewCard();
    expect(gradeCard(card, 3, TODAY).lastReviewedAt).toBe(
      '2026-11-01T10:00:00.000Z',
    );
    expect(
      gradeCard(card, 3, TODAY, {
        reviewedAt: '2026-11-13T09:30:00.000Z',
      }).lastReviewedAt,
    ).toBe('2026-11-13T09:30:00.000Z');
    expect(
      gradeCard(card, 3, TODAY, { reviewedAt: null }).lastReviewedAt,
    ).toBeNull();
  });
});
