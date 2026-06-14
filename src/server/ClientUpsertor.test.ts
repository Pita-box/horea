import { describe, expect, it } from 'vitest';

import {
  computeClientPatch,
  matchClient,
  normalizePhone,
  type ClientCandidate,
} from './ClientUpsertor';

describe('normalizePhone', () => {
  it('odstraní mezery, pomlčky, závorky a úvodní +', () => {
    expect(normalizePhone('+420 777 888 999')).toBe('420777888999');
    expect(normalizePhone('420777888999')).toBe('420777888999');
    expect(normalizePhone('(420) 777-888-999')).toBe('420777888999');
  });

  it('vrátí prázdný řetězec pro prázdný/nedefinovaný vstup', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('odstraní pouze úvodní + (ne vnitřní)', () => {
    expect(normalizePhone('+420')).toBe('420');
  });
});

describe('matchClient', () => {
  const candidates: ClientCandidate[] = [
    { id: 'c1', name: 'Jan', phone: '+420 777 888 999', email: 'jan@example.cz' },
    { id: 'c2', name: 'Petr', phone: null, email: 'Petr@Example.CZ' },
  ];

  it('telefon má prioritu před e-mailem (R15.2)', () => {
    const match = matchClient(candidates, '420777888999', 'petr@example.cz');
    expect(match?.id).toBe('c1');
  });

  it('padá zpět na e-mail (case-insensitive), když telefon nesedí', () => {
    const match = matchClient(candidates, '111000111', 'PETR@example.cz');
    expect(match?.id).toBe('c2');
  });

  it('padá na e-mail, když je telefon prázdný', () => {
    const match = matchClient(candidates, '', 'jan@example.cz');
    expect(match?.id).toBe('c1');
  });

  it('vrátí null, když nic nesedí', () => {
    expect(matchClient(candidates, '000', 'nikdo@nikde.cz')).toBeNull();
  });
});

describe('computeClientPatch', () => {
  it('aktualizuje name a doplní chybějící kontakt, vyplněné nepřepisuje (R15.3)', () => {
    const existing: ClientCandidate = { id: 'c1', name: 'Stare', phone: '420777', email: null };
    const patch = computeClientPatch(existing, 'Nove', '420999', 'novy@example.cz');
    expect(patch).toEqual({ name: 'Nove', email: 'novy@example.cz' });
  });

  it('vrátí prázdný patch, když rezervace nepřináší nic nového', () => {
    const existing: ClientCandidate = {
      id: 'c1',
      name: 'Jan',
      phone: '420777',
      email: 'jan@example.cz',
    };
    expect(computeClientPatch(existing, 'Jan', '420777', 'jan@example.cz')).toEqual({});
  });
});
