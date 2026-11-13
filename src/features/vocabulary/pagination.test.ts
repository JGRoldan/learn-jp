import { describe, expect, it } from 'vitest';
import {
  VOCABULARY_PAGE_SIZE,
  formatVisibleCount,
  getInitialVisibleCount,
  nextVisibleLimit,
} from './pagination';

describe('pagination', () => {
  it('muestra como máximo una tanda al cargar', () => {
    expect(VOCABULARY_PAGE_SIZE).toBe(20);
    expect(getInitialVisibleCount(0)).toBe(0);
    expect(getInitialVisibleCount(5)).toBe(5);
    expect(getInitialVisibleCount(20)).toBe(20);
    expect(getInitialVisibleCount(549)).toBe(20);
  });

  it('avanza de 20 en 20 sin pasarse del total', () => {
    expect(nextVisibleLimit(20, 549)).toBe(40);
    expect(nextVisibleLimit(540, 549)).toBe(549);
    expect(nextVisibleLimit(549, 549)).toBe(549);
    expect(nextVisibleLimit(20, 0)).toBe(0);
  });

  it('resume el contador cuando ya se ve todo', () => {
    expect(formatVisibleCount(0, 0)).toBe('0 palabras');
    expect(formatVisibleCount(1, 1)).toBe('1 palabra');
    expect(formatVisibleCount(20, 549)).toBe('Mostrando 20 de 549 palabras');
    expect(formatVisibleCount(549, 549)).toBe('549 palabras');
  });
});
