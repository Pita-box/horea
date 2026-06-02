import { describe, expect, it } from 'vitest';
import { fromPragueInput, toPragueDisplay } from '@/lib/datetime';

describe('toPragueDisplay', () => {
  it('zobrazí zimní UTC čas v pásmu Prague (UTC+1)', () => {
    // 15.01.2024 12:30 UTC → 13:30 Prague (CET, +1)
    expect(toPragueDisplay('2024-01-15T12:30:00Z')).toBe('15.01.2024 13:30');
  });

  it('zobrazí letní UTC čas v pásmu Prague (UTC+2, DST)', () => {
    // 15.07.2024 12:30 UTC → 14:30 Prague (CEST, +2)
    expect(toPragueDisplay('2024-07-15T12:30:00Z')).toBe('15.07.2024 14:30');
  });

  it('přijme Date instanci stejně jako ISO řetězec', () => {
    expect(toPragueDisplay(new Date('2024-07-15T12:30:00Z'))).toBe('15.07.2024 14:30');
  });

  it('vyhodí chybu pro neplatné datum', () => {
    expect(() => toPragueDisplay('nesmysl')).toThrow();
  });
});

describe('fromPragueInput', () => {
  it('převede zimní lokální čas (UTC+1) na správné UTC', () => {
    // 15.01.2024 13:30 Prague (CET) → 12:30 UTC
    expect(fromPragueInput('2024-01-15T13:30').toISOString()).toBe('2024-01-15T12:30:00.000Z');
  });

  it('převede letní lokální čas (UTC+2, DST) na správné UTC', () => {
    // 15.07.2024 14:30 Prague (CEST) → 12:30 UTC
    expect(fromPragueInput('2024-07-15T14:30').toISOString()).toBe('2024-07-15T12:30:00.000Z');
  });

  it('vyhodí chybu pro neplatný formát', () => {
    expect(() => fromPragueInput('15.01.2024 13:30')).toThrow();
  });
});

describe('round-trip Prague ↔ UTC', () => {
  it('zachová zimní nástěnný čas (UTC+1)', () => {
    const utc = fromPragueInput('2024-01-15T13:30');
    expect(toPragueDisplay(utc)).toBe('15.01.2024 13:30');
  });

  it('zachová letní nástěnný čas (UTC+2, DST)', () => {
    const utc = fromPragueInput('2024-07-15T14:30');
    expect(toPragueDisplay(utc)).toBe('15.07.2024 14:30');
  });
});
