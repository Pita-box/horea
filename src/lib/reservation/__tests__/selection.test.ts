import { describe, expect, it } from 'vitest';

import { toggleService } from '../selection';

describe('toggleService', () => {
  it('přidá dosud nevybranou službu na konec seznamu (R1.2)', () => {
    expect(toggleService(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('odebere již vybranou službu (R1.3)', () => {
    expect(toggleService(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('dvojí toggle téže služby je identita', () => {
    const list = ['a', 'b'];
    expect(toggleService(toggleService(list, 'c'), 'c')).toEqual(list);
  });

  it('nevytváří duplicity a nemutuje vstupní pole', () => {
    const list = ['a'];
    const result = toggleService(list, 'a');

    expect(result).toEqual([]);
    expect(list).toEqual(['a']);
  });

  it('toggle do prázdného seznamu přidá jedinou službu', () => {
    expect(toggleService([], 'a')).toEqual(['a']);
  });
});
