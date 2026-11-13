import { describe, expect, it } from 'vitest';
import type { VocabularyLoadSuccess } from '../vocabulary/vocabulary.types';
import { parseSessionParams, toStudyPool } from './study.service';

describe('parseSessionParams', () => {
  it('acepta una sesión de repaso sin más parámetros', () => {
    const result = parseSessionParams(new URLSearchParams('modo=repaso'));
    expect(result).toEqual({
      ok: true,
      params: { mode: 'review', categoryId: null, limit: null },
    });
  });

  it('ignora categoria y limite en una sesión de repaso', () => {
    const result = parseSessionParams(
      new URLSearchParams('modo=repaso&categoria=12&limite=5'),
    );
    expect(result).toEqual({
      ok: true,
      params: { mode: 'review', categoryId: null, limit: null },
    });
  });

  it('acepta una sesión de nuevas con categoría y límite', () => {
    const result = parseSessionParams(
      new URLSearchParams('modo=nuevas&categoria=12&limite=5'),
    );
    expect(result).toEqual({
      ok: true,
      params: { mode: 'new', categoryId: '12', limit: 5 },
    });
  });

  it('traduce sin-categoria a null', () => {
    const result = parseSessionParams(
      new URLSearchParams('modo=nuevas&categoria=sin-categoria'),
    );
    expect(result).toEqual({
      ok: true,
      params: { mode: 'new', categoryId: null, limit: null },
    });
  });

  it('rechaza nuevas sin categoría', () => {
    const result = parseSessionParams(new URLSearchParams('modo=nuevas'));
    expect(result.ok).toBe(false);
  });

  it('rechaza un modo desconocido o ausente', () => {
    expect(parseSessionParams(new URLSearchParams('')).ok).toBe(false);
    expect(parseSessionParams(new URLSearchParams('modo=otro')).ok).toBe(false);
  });

  it.each(['0', '501', 'abc', '1.5'])(
    'rechaza el límite inválido %s',
    (limite) => {
      const result = parseSessionParams(
        new URLSearchParams(`modo=nuevas&categoria=12&limite=${limite}`),
      );
      expect(result.ok).toBe(false);
    },
  );
});

describe('toStudyPool', () => {
  it('convierte las entradas de vista en palabras del pool', () => {
    const loaded: VocabularyLoadSuccess = {
      ok: true,
      invalidRowCount: 0,
      categories: [{ id: '12', name: 'Verbos', description: null, active: true }],
      entries: [
        {
          id: '42',
          palabra: '父親',
          readings: ['ちちおや'],
          wordSegments: [
            { type: 'ruby', base: '父', reading: 'ちち' },
            { type: 'ruby', base: '親', reading: 'おや' },
          ],
          significado: 'padre',
          examples: [],
          categoryId: '12',
          categoryName: 'Verbos',
          aprendido: true,
          vecesRepaso: 4,
          rachaAciertos: 2,
          factorFacilidad: 2.5,
          intervaloDias: 6,
          proximoRepaso: '2026-11-20',
          searchWord: '父親',
          searchReading: 'ちちおや',
          searchMeaning: 'padre',
        },
      ],
    };

    const pool = toStudyPool(loaded);

    expect(pool.ok).toBe(true);
    expect(pool.categories).toBe(loaded.categories);
    expect(pool.words).toEqual([
      {
        id: '42',
        palabra: '父親',
        wordSegments: loaded.entries[0]!.wordSegments,
        readings: ['ちちおや'],
        significado: 'padre',
        examples: [],
        categoryId: '12',
        categoryName: 'Verbos',
        aprendido: true,
        vecesRepaso: 4,
        rachaAciertos: 2,
        factorFacilidad: 2.5,
        intervaloDias: 6,
        proximoRepaso: '2026-11-20',
      },
    ]);
  });
});
