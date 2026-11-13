import { describe, expect, it } from 'vitest';
import { isDue } from './study.dates';

describe('isDue', () => {
  it('vence cuando due es hoy o anterior', () => {
    expect(isDue('2026-11-13', '2026-11-13')).toBe(true);
    expect(isDue('2026-11-12', '2026-11-13')).toBe(true);
    expect(isDue('2026-11-14', '2026-11-13')).toBe(false);
  });

  it('una tarjeta sin due nunca está vencida', () => {
    expect(isDue(null, '2026-11-13')).toBe(false);
  });
});
