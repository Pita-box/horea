// Čisté funkce mapování a agregace stavu služeb (bez I/O, deterministické).
// Tento modul je přímo pokrytý property-based testy (úkoly 1.2/1.3).
// Záměrně neobsahuje žádné `server-only`, síťové pingy ani čtení `process.env`.

/** Stav jedné služby po health checku (R3.2, R3.3). */
export type ServiceStatus = 'ok' | 'degraded' | 'down';

/** Agregovaný stav přes všechny služby (R5). Stejná doména jako ServiceStatus. */
export type AggregateStatus = ServiceStatus;

/** Surový výsledek běhu jedné probe (před mapováním na status). */
export type ProbeOutcome =
  | { kind: 'success'; latencyMs: number }
  | { kind: 'error'; latencyMs: number }
  | { kind: 'timeout' };

export type StatusThresholds = {
  /** Měkká hranice latence v ms; nad ni je úspěch degradovaný (R5.3). */
  degradedLatencyMs: number;
};

/**
 * Mapuje surový výsledek probe na ServiceStatus (R3.2, R3.3, R4.2, R5.3):
 *  - success & latency <= práh → 'ok'
 *  - success & latency >  práh → 'degraded'
 *  - error | timeout           → 'down'
 */
export function mapProbeStatus(
  outcome: ProbeOutcome,
  thresholds: StatusThresholds,
): ServiceStatus {
  if (outcome.kind === 'success') {
    return outcome.latencyMs <= thresholds.degradedLatencyMs ? 'ok' : 'degraded';
  }
  // error i timeout → služba je nedostupná.
  return 'down';
}

/**
 * Agreguje per-service statusy s precedencí down > degraded > ok (R5.1–R5.3):
 *  - jakýkoli 'down'          → 'down'
 *  - jinak jakýkoli 'degraded' → 'degraded'
 *  - jinak (i prázdné pole)    → 'ok'
 */
export function aggregateStatus(statuses: ServiceStatus[]): AggregateStatus {
  if (statuses.includes('down')) {
    return 'down';
  }
  if (statuses.includes('degraded')) {
    return 'degraded';
  }
  return 'ok';
}
