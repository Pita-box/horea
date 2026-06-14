import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { CURRENT_DPA_VERSION } from '../version';
import { nextDpaAcceptanceState } from '../state';

describe('DPA acceptance properties', () => {
  it('is a no-op when current DPA version is already accepted', () => {
    fc.assert(
      fc.property(fc.date({ noInvalidDate: true }), (date) => {
        const acceptedAt = date.toISOString();
        const state = {
          dpa_version_accepted: CURRENT_DPA_VERSION,
          dpa_accepted_at: acceptedAt,
        };

        expect(nextDpaAcceptanceState(state, new Date().toISOString())).toEqual(state);
      }),
    );
  });

  it('requires re-acceptance when version differs', () => {
    const acceptedAt = '2026-06-03T00:00:00.000Z';

    expect(
      nextDpaAcceptanceState(
        { dpa_version_accepted: '2024-01-01', dpa_accepted_at: '2024-01-01T00:00:00.000Z' },
        acceptedAt,
      ),
    ).toEqual({ dpa_version_accepted: CURRENT_DPA_VERSION, dpa_accepted_at: acceptedAt });
  });
});
