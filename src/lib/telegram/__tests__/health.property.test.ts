import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  aggregateHealth,
  buildHealthReport,
  type MonitoredService,
  type ServiceHealth,
  type ServiceStatus,
} from '../health';

// Sledovaných šest služeb (R11.2) — pořadí odpovídá očekávanému pokrytí reportu.
const MONITORED_SERVICES: ReadonlyArray<MonitoredService> = [
  'supabase',
  'resend',
  'smtp2go',
  'gopay',
  'r2',
  'google',
];

// Český label pro každou službu (čistě pro vstupní data; obsah labelu není tajemství).
const SERVICE_LABELS: Record<MonitoredService, string> = {
  supabase: 'Supabase',
  resend: 'Resend',
  smtp2go: 'SMTP2GO',
  gopay: 'GoPay',
  r2: 'Cloudflare R2',
  google: 'Google',
};

const statusArb: fc.Arbitrary<ServiceStatus> = fc.constantFrom(
  'ok',
  'degraded',
  'down',
);

// Smart generátor: pro každou ze šesti služeb vygeneruje právě jeden ServiceHealth
// s náhodným stavem. Drží se přesně vstupního prostoru (žádné duplicity, žádné
// neznámé služby) — stejně jako reálné výsledky probe.
const servicesArb: fc.Arbitrary<ServiceHealth[]> = fc
  .tuple(...MONITORED_SERVICES.map(() => statusArb))
  .map((statuses) =>
    MONITORED_SERVICES.map((service, i) => ({
      service,
      label: SERVICE_LABELS[service],
      status: statuses[i],
    })),
  );

// Referenční agregace nezávislá na implementaci — precedence down > degraded > ok.
function expectedAggregate(
  statuses: ReadonlyArray<ServiceStatus>,
): ServiceStatus {
  if (statuses.includes('down')) return 'down';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

describe('buildHealthReport — property', () => {
  // Feature: telegram-operator-notifications, Property 6: Report zdraví pokrývá všech šest služeb bez tajemství
  // Validates: Requirements 11.2, 11.5, 11.6
  it('Property 6: report pokrývá všech šest služeb, agregát dodržuje precedenci a neobsahuje tajemství', () => {
    fc.assert(
      fc.property(servicesArb, (services) => {
        const report = buildHealthReport(services);

        // Pokrytí: report obsahuje právě těchto šest sledovaných služeb (R11.2).
        const reportedServices = report.services.map((s) => s.service);
        expect(reportedServices).toHaveLength(MONITORED_SERVICES.length);
        expect(new Set(reportedServices)).toEqual(new Set(MONITORED_SERVICES));

        // Agregát odpovídá precedenci down > degraded > ok (R11.5).
        expect(report.aggregate).toBe(
          expectedAggregate(services.map((s) => s.status)),
        );

        // Bez tajemství: žádný prvek nemá jiná pole než service/label/status (R11.6).
        for (const item of report.services) {
          expect(Object.keys(item).sort()).toEqual([
            'label',
            'service',
            'status',
          ]);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('aggregateHealth — property', () => {
  // Feature: telegram-operator-notifications, Property 5: Agregace zdraví dodržuje precedenci down > degraded > ok
  // Validates: Requirements 11.3, 11.4
  it('Property 5: agregace dodržuje precedenci down > degraded > ok', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<ServiceStatus>('ok', 'degraded', 'down')),
        (statuses) => {
          const result = aggregateHealth(statuses);

          if (statuses.includes('down')) {
            // Aspoň jeden `down` → agregát je `down` (R11.3).
            expect(result).toBe('down');
          } else if (statuses.includes('degraded')) {
            // Žádný `down`, aspoň jeden `degraded` → `degraded` (R11.3).
            expect(result).toBe('degraded');
          } else {
            // Samé `ok` (i prázdný vstup) → `ok` (R11.4).
            expect(result).toBe('ok');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Prázdný vstup → `ok` (R11.4).
  it('prázdný vstup agreguje na ok', () => {
    expect(aggregateHealth([])).toBe('ok');
  });
});
