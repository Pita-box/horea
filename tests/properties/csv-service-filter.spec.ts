// Feature: multi-service-reservations, Property 14: CSV filtr služby je test
// neprázdného průniku — rezervace je zahrnuta do exportu právě tehdy, když je
// její business_id rovno podniku majitele A ZÁROVEŇ je průnik jejího
// Reservation_Service_Set s vyfiltrovanými službami neprázdný (resp. filtr
// služeb není aktivní).
//
/**
 * Property test (čistý predikát) — predikát zahrnutí CSV exportu pro filtr služby
 * (R14.2, R14.3, R14.4), feature `multi-service-reservations`, task 7.6.
 *
 * `CSV_Exporter` (`src/server/CsvExporter.ts`) implementuje filtr služby ve dvou
 * krocích, které dohromady tvoří predikát zahrnutí:
 *  - hlavní dotaz omezí řádky na podnik majitele přes `.eq('business_id', …)`
 *    (R14.4 — izolace na podnik majitele);
 *  - `collectServiceFilterReservationIds` posbírá `reservation_id` rezervací,
 *    jejichž `Reservation_Service_Set` má neprázdný průnik s vyfiltrovanými
 *    službami (`.in('service_id', serviceIds)`), a hlavní dotaz se na ně omezí
 *    přes `.in('id', …)` — ale POUZE když je filtr aktivní (`serviceIds.length > 0`).
 *    Je-li filtr neaktivní, žádné omezení podle služby se neaplikuje (R14.3).
 *
 * Tento test extrahuje tuto logiku do ČISTÉHO predikátu `includedInExport`
 * (dokumentuje Property 14, jak navrhuje zadání tasku — „predikát zahrnutí") a
 * ověřuje ho proti NEZÁVISLE spočítané množinové definici (skutečný průnik
 * `Set`ů) napříč náhodnými vstupy. Je čistý (bez DB), takže doplňuje integrační
 * `tests/integration/csv-scope.test.ts`, který stejné chování ověřuje proti
 * reálnému Postgresu pro R17.4/R17.5.
 *
 * _Requirements: 14.2, 14.3, 14.4_
 * _Properties: 14_
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

const NUM_RUNS = 200;

/** Rezervace zjednodušená na to, co predikát zahrnutí potřebuje. */
type ReservationLike = {
  businessId: string;
  /** service_id všech služeb v Reservation_Service_Set rezervace. */
  serviceIds: string[];
};

/**
 * Čistý predikát zahrnutí, který zrcadlí logiku `CSV_Exporter`u:
 * rezervace je zahrnuta právě tehdy, když patří podniku majitele A ZÁROVEŇ
 * (filtr služby je neaktivní NEBO se některá její služba shoduje s filtrem).
 *
 * Zrcadlí implementaci přes `Array.prototype.some` — záměrně jiný výpočet než
 * množinový orákulum níže.
 */
function includedInExport(
  reservation: ReservationLike,
  ownerBusinessId: string,
  filterServiceIds: string[],
): boolean {
  if (reservation.businessId !== ownerBusinessId) {
    return false;
  }
  const serviceFilterActive = filterServiceIds.length > 0;
  if (!serviceFilterActive) {
    return true;
  }
  return reservation.serviceIds.some((id) => filterServiceIds.includes(id));
}

/**
 * Nezávislé orákulum stejné vlastnosti spočítané přes skutečný průnik `Set`ů —
 * `business_id` se musí rovnat podniku majitele A (filtr neaktivní NEBO je
 * průnik množin neprázdný).
 */
function oracleIncluded(
  reservation: ReservationLike,
  ownerBusinessId: string,
  filterServiceIds: string[],
): boolean {
  const businessMatches = reservation.businessId === ownerBusinessId;
  const filterActive = filterServiceIds.length > 0;
  if (!filterActive) {
    return businessMatches;
  }
  const filterSet = new Set(filterServiceIds);
  const intersectionNonEmpty = reservation.serviceIds.some((id) => filterSet.has(id));
  return businessMatches && intersectionNonEmpty;
}

const OWNER_BUSINESS_ID = 'owner-business';
const FOREIGN_BUSINESS_IDS = ['foreign-a', 'foreign-b', 'foreign-c'];

/** Malý vesmír service_id, aby měly náhodné průniky reálnou šanci být neprázdné. */
const SERVICE_UNIVERSE = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];

const serviceIdArb = fc.constantFrom(...SERVICE_UNIVERSE);

const businessIdArb = fc.constantFrom(OWNER_BUSINESS_ID, ...FOREIGN_BUSINESS_IDS);

/** Reservation_Service_Set má 1..10 služeb (D3), bez duplicit. */
const serviceSetArb = fc.uniqueArray(serviceIdArb, { minLength: 1, maxLength: 8 });

const reservationArb: fc.Arbitrary<ReservationLike> = fc.record({
  businessId: businessIdArb,
  serviceIds: serviceSetArb,
});

/** Filtr služby: prázdný (neaktivní) i neprázdný (aktivní), bez duplicit. */
const filterArb = fc.uniqueArray(serviceIdArb, { minLength: 0, maxLength: SERVICE_UNIVERSE.length });

describe('Property 14: CSV filtr služby je test neprázdného průniku', () => {
  it('predikát zahrnutí se shoduje s množinovou definicí (business scope ∧ neprázdný průnik / filtr neaktivní)', () => {
    fc.assert(
      fc.property(reservationArb, filterArb, (reservation, filter) => {
        expect(includedInExport(reservation, OWNER_BUSINESS_ID, filter)).toBe(
          oracleIncluded(reservation, OWNER_BUSINESS_ID, filter),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('filtr neaktivní → zahrnuta právě tehdy, když business_id odpovídá podniku majitele (R14.4)', () => {
    fc.assert(
      fc.property(reservationArb, (reservation) => {
        expect(includedInExport(reservation, OWNER_BUSINESS_ID, [])).toBe(
          reservation.businessId === OWNER_BUSINESS_ID,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('cizí podnik → vždy vyloučena bez ohledu na filtr (R14.4)', () => {
    fc.assert(
      fc.property(
        fc.record({
          businessId: fc.constantFrom(...FOREIGN_BUSINESS_IDS),
          serviceIds: serviceSetArb,
        }),
        filterArb,
        (reservation, filter) => {
          expect(includedInExport(reservation, OWNER_BUSINESS_ID, filter)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('vlastní podnik + neprázdný průnik s aktivním filtrem → zahrnuta (R14.3)', () => {
    fc.assert(
      fc.property(
        serviceSetArb,
        fc.subarray(SERVICE_UNIVERSE, { minLength: 1 }),
        serviceIdArb,
        (extraServices, filter, sharedFromFilter) => {
          // Garantujeme neprázdný průnik: do množiny služeb přidáme jednu službu z filtru.
          const shared = filter.includes(sharedFromFilter) ? sharedFromFilter : filter[0];
          const reservation: ReservationLike = {
            businessId: OWNER_BUSINESS_ID,
            serviceIds: Array.from(new Set([...extraServices, shared])),
          };
          expect(includedInExport(reservation, OWNER_BUSINESS_ID, filter)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('vlastní podnik + prázdný průnik s aktivním filtrem → vyloučena (R14.3)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(serviceIdArb, { minLength: 1, maxLength: SERVICE_UNIVERSE.length }),
        (allServices) => {
          // Rozdělíme vesmír na disjunktní množinu služeb rezervace a filtr.
          fc.pre(allServices.length >= 2 && allServices.length < SERVICE_UNIVERSE.length + 1);
          const reservationServices = allServices;
          const filter = SERVICE_UNIVERSE.filter((id) => !reservationServices.includes(id));
          fc.pre(filter.length > 0); // filtr je aktivní a disjunktní
          const reservation: ReservationLike = {
            businessId: OWNER_BUSINESS_ID,
            serviceIds: reservationServices,
          };
          expect(includedInExport(reservation, OWNER_BUSINESS_ID, filter)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
