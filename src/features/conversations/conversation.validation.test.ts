import { describe, expect, it, vi } from 'vitest';
import type { NumberedRecord } from '../../infrastructure/google-sheets/columns';
import { validateConversationRows } from './conversation.validation';

/** Construye un registro crudo con todos los campos de la pestaña. */
function row(
  rowNumber: number,
  values: Partial<Record<string, string>>,
): NumberedRecord {
  return {
    rowNumber,
    values: {
      id: '',
      titulo: '',
      topico: '',
      guion: '',
      nivel: '',
      ...values,
    },
  };
}

describe('validateConversationRows', () => {
  it('genera un id estable cuando la fila aún no lo tiene', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = validateConversationRows([
        row(2, {
          titulo: 'Cena',
          topico: 'Cena',
          guion: 'A|こんにちは|Hola',
          nivel: 'n4',
        }),
      ]);

      expect(result.invalid).toEqual([]);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0]?.data).toMatchObject({
        id: 'conv-fila-2',
        topico: 'Cena',
        nivel: 'N4',
      });
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('conserva la primera fila de un id duplicado', () => {
    const result = validateConversationRows([
      row(2, { id: 'c1', titulo: 'Primera', guion: 'A|やあ|Hola' }),
      row(3, { id: 'c1', titulo: 'Duplicada', guion: 'B|やあ|Hola' }),
    ]);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.data.titulo).toBe('Primera');
    expect(result.invalid).toEqual([
      {
        label: 'conversaciones',
        rowNumber: 3,
        reason: 'id duplicado "c1"; se conserva la primera aparición',
      },
    ]);
  });

  it('descarta filas sin título o sin guion', () => {
    const result = validateConversationRows([
      row(2, { guion: 'A|やあ|Hola' }),
      row(3, { titulo: 'Sin guion' }),
    ]);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toHaveLength(2);
    expect(result.invalid[0]?.reason).toContain('titulo');
    expect(result.invalid[1]?.reason).toContain('guion');
  });
});
