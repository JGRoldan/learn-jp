import { describe, expect, it } from 'vitest';
import { parseConversationScript } from './conversation-script';

describe('parseConversationScript', () => {
  it('parsea etapas dinámicas y conserva marcado Anki separado del texto', () => {
    const result = parseConversationScript(
      '@Inicio\r\n' +
        '妻[つま]|今日[きょう]の夜[よ]ご飯[はん]どうする？|Oye, ¿qué cenamos?|Algo sencillo\r\n' +
        '夫[おっと]|うーん|Mmm',
    );

    expect(result.issues).toEqual([]);
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0]?.name).toBe('Inicio');
    expect(result.stages[0]?.lines).toHaveLength(2);

    const first = result.stages[0]?.lines[0];
    expect(first?.speaker.text).toBe('妻');
    expect(first?.japanese.text).toBe('今日の夜ご飯どうする？');
    expect(first?.japanese.reading).toBe('きょうのよごはんどうする？');
    expect(first?.japanese.segments).toEqual([
      { type: 'ruby', base: '今日', reading: 'きょう' },
      { type: 'plain', text: 'の' },
      { type: 'ruby', base: '夜', reading: 'よ' },
      { type: 'plain', text: 'ご' },
      { type: 'ruby', base: '飯', reading: 'はん' },
      { type: 'plain', text: 'どうする？' },
    ]);
    expect(first?.translation).toBe('Oye, ¿qué cenamos?');
    expect(first?.note).toBe('Algo sencillo');

    expect(result.stages[0]?.lines[1]?.note).toBeNull();
  });

  it('acepta texto plano sin Anki y-etapas sin nombre propio', () => {
    const result = parseConversationScript(
      '@Cena\nA|こんにちは|Hola\n@Despedida\nB|またね|Hasta luego',
    );

    expect(result.issues).toEqual([]);
    expect(result.stages.map((stage) => stage.name)).toEqual([
      'Cena',
      'Despedida',
    ]);
    expect(result.stages[0]?.lines[0]?.japanese.segments).toBeNull();
    expect(result.stages[0]?.lines[0]?.japanese.text).toBe('こんにちは');
    expect(result.stages[0]?.lines[0]?.japanese.reading).toBeNull();
  });

  it('reporta líneas previas a la primera etapa y las agrupa en General', () => {
    const result = parseConversationScript('A|やあ|Hola\n@Inicio\nB|おはよう|Buenos días');

    expect(result.stages.map((stage) => stage.name)).toEqual([
      'General',
      'Inicio',
    ]);
    expect(result.stages[0]?.lines).toHaveLength(1);
    expect(result.issues).toEqual([
      {
        lineNumber: 1,
        reason: 'línea antes de la primera etapa; se agrupó en "General"',
      },
    ]);
  });

  it('omite líneas malformadas sin lanzar', () => {
    const result = parseConversationScript(
      '@\n' +
        'A||Sin japonés\n' +
        'B|こんにちは|Hola|nota|extra\n' +
        '@Valida\n' +
        'C|さようなら|Adiós',
    );

    expect(result.stages.map((stage) => stage.name)).toEqual(['Valida']);
    expect(result.stages[0]?.lines).toHaveLength(1);
    expect(result.issues.map((issue) => issue.lineNumber)).toEqual([1, 2, 3]);
  });

  it('devuelve sin etapas para un guion vacío', () => {
    expect(parseConversationScript('\n  \r\n')).toEqual({
      stages: [],
      issues: [],
    });
  });
});
