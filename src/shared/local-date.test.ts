import { describe, expect, it } from 'vitest';
import {
  addDays,
  isLocalDate,
  toLocalDateString,
} from './local-date';

describe('toLocalDateString', () => {
  it('usa componentes locales con mes y día a dos dígitos', () => {
    expect(toLocalDateString(new Date(2026, 10, 13))).toBe('2026-11-13');
    expect(toLocalDateString(new Date(2027, 0, 5))).toBe('2027-01-05');
  });
});

describe('isLocalDate', () => {
  it('acepta días reales', () => {
    expect(isLocalDate('2026-11-13')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
  });

  it('rechaza formatos y fechas inexistentes', () => {
    for (const invalid of [
      '2026-1-1',
      '2026-02-30',
      '2027-02-29',
      '2026-13-01',
      '2026-00-10',
      '',
      'hoy',
    ]) {
      expect(isLocalDate(invalid)).toBe(false);
    }
  });
});

describe('addDays', () => {
  it('suma días dentro del mes', () => {
    expect(addDays('2026-11-13', 1)).toBe('2026-11-14');
    expect(addDays('2026-11-13', 0)).toBe('2026-11-13');
    expect(addDays('2026-11-13', -1)).toBe('2026-11-12');
  });

  it('cruza cambios de mes y de año', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-13', 90)).toBe('2027-02-11');
  });

  it('respeta años bisiestos', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('mantiene el día de calendario a través de cambios de horario', () => {
    // Cambios de hora en la UE (último domingo de marzo/octubre); como se
    // opera con componentes locales, el día resultado no se desplaza.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
  });

  it('rechaza días locales mal formados o inexistentes', () => {
    for (const invalid of ['2026-1-1', '2026-02-30', '2026-13-01', '', 'hoy']) {
      expect(() => addDays(invalid, 1)).toThrow(TypeError);
    }
  });
});
