import { describe, expect, it } from 'vitest';

import {
  clearEmployeeIfOutsideSelection,
  employeesForSelection,
  type ServiceEmployeeMapping,
} from '../employees';

describe('employeesForSelection', () => {
  it('vrací průnik zaměstnanců přes vybrané služby', () => {
    const mapping: ServiceEmployeeMapping = {
      s1: ['a', 'b', 'c'],
      s2: ['b', 'c', 'd'],
    };

    expect(employeesForSelection(mapping, ['s1', 's2'])).toEqual(['b', 'c']);
  });

  it('službu bez řádku považuje za „umí ji všichni" (nevnáší omezení)', () => {
    const mapping: ServiceEmployeeMapping = {
      s1: ['a', 'b'],
      // s2 nemá řádek → umí ji všichni
    };

    expect(employeesForSelection(mapping, ['s1', 's2'])).toEqual(['a', 'b']);
  });

  it('vrací celý vesmír zaměstnanců, když žádná vybraná služba neomezuje', () => {
    const mapping: ServiceEmployeeMapping = {
      s1: ['a', 'b'],
      s2: ['c'],
    };

    // s3 i s4 jsou bez řádku → žádné omezení → celý vesmír.
    expect(employeesForSelection(mapping, ['s3', 's4'])).toEqual(['a', 'b', 'c']);
  });

  it('vrací celý vesmír pro prázdný výběr (průnik přes prázdnou množinu)', () => {
    const mapping: ServiceEmployeeMapping = {
      s1: ['a', 'b'],
      s2: ['b'],
    };

    expect(employeesForSelection(mapping, [])).toEqual(['a', 'b']);
  });

  it('vrací prázdný seznam při disjunktních množinách', () => {
    const mapping: ServiceEmployeeMapping = {
      s1: ['a'],
      s2: ['b'],
    };

    expect(employeesForSelection(mapping, ['s1', 's2'])).toEqual([]);
  });

  it('výsledek je deduplikovaný a v pořadí prvního výskytu', () => {
    const mapping: ServiceEmployeeMapping = {
      s1: ['b', 'a', 'b'],
    };

    expect(employeesForSelection(mapping, ['s1'])).toEqual(['b', 'a']);
  });
});

describe('clearEmployeeIfOutsideSelection', () => {
  const mapping: ServiceEmployeeMapping = {
    s1: ['a', 'b', 'c'],
    s2: ['b', 'c'],
  };

  it('zachová zaměstnance, je-li stále v průniku', () => {
    expect(clearEmployeeIfOutsideSelection(mapping, ['s1', 's2'], 'b')).toBe('b');
  });

  it('zruší zaměstnance, který vypadl z průniku (R8.3)', () => {
    // 'a' umí s1, ale neumí s2 → po přidání s2 musí být výběr zrušen.
    expect(clearEmployeeIfOutsideSelection(mapping, ['s1', 's2'], 'a')).toBeNull();
  });

  it('vrací null, když není nic vybráno', () => {
    expect(clearEmployeeIfOutsideSelection(mapping, ['s1'], null)).toBeNull();
  });
});
