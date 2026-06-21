import { describe, it } from 'vitest';
import fc from 'fast-check';

import {
  mapProbeStatus,
  aggregateStatus,
  type ProbeOutcome,
  type ServiceStatus,
  type StatusThresholds,
} from '../status';

describe('status — property testy', () => {
  // Feature: admin-system-tools, Property 1: Mapování výsledku probe na Service_Status
  // Validates: Requirements 3.2, 3.3, 4.2, 5.3
  it('mapuje výsledek probe na ServiceStatus dle latence a typu výsledku', () => {
    // Generátor jednoho ProbeOutcome napříč všemi třemi variantami.
    const outcomeArb: fc.Arbitrary<ProbeOutcome> = fc.oneof(
      fc.record({ kind: fc.constant<'success'>('success'), latencyMs: fc.nat() }),
      fc.record({ kind: fc.constant<'error'>('error'), latencyMs: fc.nat() }),
      fc.record({ kind: fc.constant<'timeout'>('timeout') }),
    );
    const thresholdsArb: fc.Arbitrary<StatusThresholds> = fc.record({
      degradedLatencyMs: fc.nat(),
    });

    fc.assert(
      fc.property(outcomeArb, thresholdsArb, (outcome, thresholds) => {
        const status = mapProbeStatus(outcome, thresholds);

        if (outcome.kind === 'success') {
          // success & latency ≤ práh → ok; success & latency > práh → degraded.
          const expected: ServiceStatus =
            outcome.latencyMs <= thresholds.degradedLatencyMs ? 'ok' : 'degraded';
          return status === expected;
        }

        if (outcome.kind === 'timeout') {
          // U timeoutu ověříme i diskriminant varianty.
          return outcome.kind === 'timeout' && status === 'down';
        }

        // error → down.
        return status === 'down';
      }),
      { numRuns: 100 },
    );
  });

  // Feature: admin-system-tools, Property 2: Precedence agregovaného stavu (down > degraded > ok)
  // Validates: Requirements 5.1, 5.2, 5.3
  it('agreguje stavy s precedencí down > degraded > ok (prázdné pole → ok)', () => {
    const statusArb = fc.constantFrom<ServiceStatus>('ok', 'degraded', 'down');

    fc.assert(
      fc.property(fc.array(statusArb), (statuses) => {
        const result = aggregateStatus(statuses);

        // Očekávaný výsledek podle precedence: down > degraded > ok (prázdné → ok).
        const expected: ServiceStatus = statuses.includes('down')
          ? 'down'
          : statuses.includes('degraded')
            ? 'degraded'
            : 'ok';

        return result === expected;
      }),
      { numRuns: 100 },
    );
  });
});
