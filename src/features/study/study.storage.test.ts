import { describe, expect, it } from 'vitest';
import { addDays } from '../../shared/local-date';
import {
  createEmptyStudyStore,
  loadStudyStore,
  parseStudyBackup,
  pruneStudyCards,
  saveStudyStore,
  seedStudyCards,
  serializeStudyBackup,
  STUDY_STORE_KEY,
  type KeyValueStorage,
  type StudySeedEntry,
} from './study.storage';
import {
  DEFAULT_STUDY_SETTINGS,
  type StudyCardState,
  type StudyStore,
} from './study.types';

const TODAY = '2026-11-13';

/** Almacenamiento en memoria con el API mínimo que usa el módulo. */
class MemoryStorage implements KeyValueStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function sampleCard(overrides: Partial<StudyCardState> = {}): StudyCardState {
  return {
    id: 'w1',
    introducedOn: '2026-11-01',
    ef: 2.5,
    intervalDays: 6,
    streak: 2,
    reps: 3,
    lapses: 1,
    due: '2026-11-13',
    lastReviewedAt: '2026-11-07T10:00:00.000Z',
    ...overrides,
  };
}

function sampleStore(card: StudyCardState = sampleCard()): StudyStore {
  return {
    version: 1,
    cards: { [card.id]: card },
    settings: DEFAULT_STUDY_SETTINGS,
  };
}

function seedEntry(overrides: Partial<StudySeedEntry> = {}): StudySeedEntry {
  return {
    id: 'w1',
    aprendido: false,
    vecesRepaso: null,
    rachaAciertos: null,
    factorFacilidad: null,
    intervaloDias: null,
    proximoRepaso: null,
    ...overrides,
  };
}

function seedOne(entry: StudySeedEntry, store = createEmptyStudyStore()) {
  return seedStudyCards(store, [entry], TODAY).cards[entry.id]!;
}

describe('createEmptyStudyStore', () => {
  it('crea un store vacío con los ajustes por defecto', () => {
    expect(createEmptyStudyStore()).toEqual({
      version: 1,
      cards: {},
      settings: DEFAULT_STUDY_SETTINGS,
    });
  });

  it('acepta ajustes distintos', () => {
    const settings = { ...DEFAULT_STUDY_SETTINGS, newPerDay: 5 };
    expect(createEmptyStudyStore(settings).settings.newPerDay).toBe(5);
  });
});

describe('loadStudyStore', () => {
  it('devuelve empty cuando no hay nada guardado', () => {
    expect(loadStudyStore(new MemoryStorage())).toEqual({
      store: createEmptyStudyStore(),
      status: 'empty',
    });
  });

  it('trata una cadena vacía como empty', () => {
    const storage = new MemoryStorage();
    storage.setItem(STUDY_STORE_KEY, '   ');
    expect(loadStudyStore(storage).status).toBe('empty');
  });

  it('carga un store válido', () => {
    const storage = new MemoryStorage();
    storage.setItem(STUDY_STORE_KEY, JSON.stringify(sampleStore()));
    const result = loadStudyStore(storage);
    expect(result.status).toBe('loaded');
    expect(result.store.cards.w1).toEqual(sampleCard());
  });

  it('nunca lanza con JSON corrupto y devuelve un store vacío', () => {
    const storage = new MemoryStorage();
    storage.setItem(STUDY_STORE_KEY, '{no es json');
    expect(loadStudyStore(storage)).toEqual({
      store: createEmptyStudyStore(),
      status: 'corrupt',
    });
  });

  it('rechaza versiones desconocidas', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STUDY_STORE_KEY,
      JSON.stringify({ ...sampleStore(), version: 2 }),
    );
    expect(loadStudyStore(storage).status).toBe('corrupt');
  });

  it('rechaza tarjetas que incumplen el esquema', () => {
    const invalidCards = [
      sampleCard({ ef: 5 }),
      sampleCard({ ef: 1.1 }),
      sampleCard({ intervalDays: -1 }),
      sampleCard({ reps: 1.5 }),
      sampleCard({ due: '2026-02-30' }),
      sampleCard({ introducedOn: null }),
      sampleCard({ due: null }),
      sampleCard({ lastReviewedAt: 'ayer' }),
    ];
    for (const card of invalidCards) {
      const storage = new MemoryStorage();
      storage.setItem(STUDY_STORE_KEY, JSON.stringify(sampleStore(card)));
      expect(loadStudyStore(storage).status).toBe('corrupt');
    }
  });

  it('rechaza tarjetas cuya clave no coincide con su id', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STUDY_STORE_KEY,
      JSON.stringify({ ...sampleStore(), cards: { otro: sampleCard() } }),
    );
    expect(loadStudyStore(storage).status).toBe('corrupt');
  });

  it('rechaza ajustes inválidos', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STUDY_STORE_KEY,
      JSON.stringify({
        ...sampleStore(),
        settings: { ...DEFAULT_STUDY_SETTINGS, newPerDay: 0 },
      }),
    );
    expect(loadStudyStore(storage).status).toBe('corrupt');
  });

  it('trata un error de lectura como corrupt', () => {
    const storage: KeyValueStorage = {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {},
    };
    expect(loadStudyStore(storage).status).toBe('corrupt');
  });
});

describe('saveStudyStore', () => {
  it('guarda un store válido y se puede volver a cargar', () => {
    const storage = new MemoryStorage();
    expect(saveStudyStore(sampleStore(), storage)).toBe(true);
    expect(loadStudyStore(storage)).toEqual({
      store: sampleStore(),
      status: 'loaded',
    });
  });

  it('no escribe un store inválido', () => {
    const storage = new MemoryStorage();
    const invalid = sampleStore(sampleCard({ ef: 5 }));
    expect(saveStudyStore(invalid, storage)).toBe(false);
    expect(storage.getItem(STUDY_STORE_KEY)).toBeNull();
  });

  it('devuelve false si el almacenamiento rechaza la escritura', () => {
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem() {
        throw new Error('cuota');
      },
    };
    expect(saveStudyStore(sampleStore(), storage)).toBe(false);
  });
});

describe('seedStudyCards', () => {
  it('con columnas vacías crea tarjetas nuevas', () => {
    expect(seedOne(seedEntry())).toEqual({
      id: 'w1',
      introducedOn: null,
      ef: 2.5,
      intervalDays: 0,
      streak: 0,
      reps: 0,
      lapses: 0,
      due: null,
      lastReviewedAt: null,
    });
  });

  it('mapea todos los datos de repaso de la hoja', () => {
    const card = seedOne(
      seedEntry({
        aprendido: true,
        vecesRepaso: 5,
        rachaAciertos: 2,
        factorFacilidad: 2.3,
        intervaloDias: 10,
        proximoRepaso: '2026-11-20',
      }),
    );
    expect(card).toMatchObject({
      introducedOn: addDays('2026-11-20', -10),
      ef: 2.3,
      intervalDays: 10,
      streak: 2,
      reps: 5,
      lapses: 0,
      due: '2026-11-20',
    });
  });

  it('si hay progreso sin fecha la deja debida hoy', () => {
    const card = seedOne(
      seedEntry({ aprendido: true, intervaloDias: 10, vecesRepaso: 3 }),
    );
    expect(card.due).toBe(TODAY);
    expect(card.introducedOn).toBe(addDays(TODAY, -10));
  });

  it('aprendido sin más datos la introduce debida hoy', () => {
    const card = seedOne(seedEntry({ aprendido: true }));
    expect(card.introducedOn).toBe(TODAY);
    expect(card.due).toBe(TODAY);
    expect(card.intervalDays).toBe(0);
  });

  it('acota el factor de facilidad', () => {
    expect(seedOne(seedEntry({ factorFacilidad: 5 })).ef).toBe(3);
    expect(seedOne(seedEntry({ factorFacilidad: 0.2 })).ef).toBe(1.3);
    expect(seedOne(seedEntry({ factorFacilidad: 2.47 })).ef).toBe(2.47);
  });

  it('sanea contadores negativos y decimales', () => {
    const card = seedOne(
      seedEntry({
        vecesRepaso: -3,
        rachaAciertos: 2.7,
        intervaloDias: 1.4,
      }),
    );
    expect(card.reps).toBe(0);
    expect(card.streak).toBe(3);
    expect(card.intervalDays).toBe(1);
  });

  it('ignora fechas de la hoja que no son días locales válidos', () => {
    expect(seedOne(seedEntry({ proximoRepaso: '13/11/2026' })).due).toBeNull();
    const withProgress = seedOne(
      seedEntry({ aprendido: true, proximoRepaso: '2026-02-30' }),
    );
    expect(withProgress.due).toBe(TODAY);
  });

  it('no sobrescribe tarjetas con estado local', () => {
    const existing = sampleStore();
    const result = seedStudyCards(
      existing,
      [seedEntry({ id: 'w1', aprendido: true, intervaloDias: 30 })],
      TODAY,
    );
    expect(result.cards.w1).toBe(existing.cards.w1);
    expect(result).toBe(existing);
  });

  it('es idempotente', () => {
    const seeded = seedStudyCards(
      createEmptyStudyStore(),
      [seedEntry(), seedEntry({ id: 'w2' })],
      TODAY,
    );
    expect(
      seedStudyCards(seeded, [seedEntry(), seedEntry({ id: 'w2' })], TODAY),
    ).toBe(seeded);
  });

  it('no muta el store de entrada', () => {
    const store = createEmptyStudyStore();
    const before = JSON.stringify(store);
    seedStudyCards(store, [seedEntry()], TODAY);
    expect(JSON.stringify(store)).toBe(before);
  });

  it('rechaza un día de sesión inválido', () => {
    expect(() =>
      seedStudyCards(createEmptyStudyStore(), [seedEntry()], '2026-02-30'),
    ).toThrow(TypeError);
  });
});

describe('pruneStudyCards', () => {
  it('elimina huérfanas y conserva el resto', () => {
    const store: StudyStore = {
      ...createEmptyStudyStore(),
      cards: {
        w1: sampleCard({ id: 'w1' }),
        w2: sampleCard({ id: 'w2' }),
      },
    };
    const pruned = pruneStudyCards(store, new Set(['w2']));
    expect(Object.keys(pruned.cards)).toEqual(['w2']);
    expect(pruned.cards.w2).toBe(store.cards.w2);
  });

  it('devuelve el mismo store si no hay huérfanas', () => {
    const store = sampleStore();
    expect(pruneStudyCards(store, new Set(['w1']))).toBe(store);
  });

  it('no muta el store de entrada', () => {
    const store = sampleStore();
    pruneStudyCards(store, new Set());
    expect(store.cards.w1).toBeDefined();
  });
});

describe('respaldo JSON', () => {
  it('serializa y vuelve a leer sin pérdidas', () => {
    const store = sampleStore();
    const raw = serializeStudyBackup(store);
    const parsed = parseStudyBackup(raw);
    expect(parsed).toEqual({ ok: true, store, cardCount: 1 });
  });

  it('rechaza JSON inválido con un mensaje genérico', () => {
    expect(parseStudyBackup('no json')).toEqual({
      ok: false,
      message: 'El archivo no contiene JSON válido.',
    });
  });

  it('rechaza respaldos con esquema desconocido', () => {
    for (const raw of [
      JSON.stringify({ version: 2, cards: {}, settings: DEFAULT_STUDY_SETTINGS }),
      JSON.stringify({ version: 1, cards: {} }),
    ]) {
      const parsed = parseStudyBackup(raw);
      expect(parsed.ok).toBe(false);
    }
  });
});
