import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sdílený fake Supabase klient pro unit testy čtecí vrstvy admin dashboardu.
 *
 * V duchu existujících testů (`src/lib/subscription/__tests__/`) jde o jednoduchý
 * chainable builder, který ale navíc **opravdu aplikuje** filtry `eq`/`in`/`gte`/
 * `lte` a řazení `order` nad poskytnutými řádky — díky tomu lze smysluplně ověřit
 * chování závislé na období a na filtrech bez reálné DB.
 *
 * Builder je „thenable" (má `.then`), takže `await query` vrátí `{ data, count,
 * error }`; `maybeSingle()` vrátí první řádek nebo `null`. Sloupcové řetězce v
 * `select(...)` (vč. vložených relací) se ignorují — řádky se předávají rovnou ve
 * tvaru, jaký produkční kód očekává (vč. zanořených `users`/`subscriptions`/
 * `payments`).
 */

export type FakeRow = Record<string, unknown>;

/** Mapa název tabulky → řádky. */
export type FakeTables = Record<string, FakeRow[]>;

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function makeBuilder(rows: FakeRow[], errorFor: string | null, table: string) {
  let working = [...rows];
  let orderCol: string | null = null;
  let orderAsc = true;

  const error = errorFor === table ? { message: `simulovaná chyba (${table})` } : null;

  const builder: Record<string, unknown> = {
    select() {
      // Sloupcové řetězce i volby (count/head) ignorujeme — count odvodíme z délky.
      return builder;
    },
    eq(column: string, value: unknown) {
      working = working.filter((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      working = working.filter((row) => values.includes(row[column]));
      return builder;
    },
    gte(column: string, value: unknown) {
      working = working.filter((row) => compareValues(row[column], value) >= 0);
      return builder;
    },
    lte(column: string, value: unknown) {
      working = working.filter((row) => compareValues(row[column], value) <= 0);
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderCol = column;
      orderAsc = options?.ascending ?? true;
      return builder;
    },
    maybeSingle() {
      if (error) {
        return Promise.resolve({ data: null, error });
      }
      return Promise.resolve({ data: working[0] ?? null, error: null });
    },
    then(resolve: (value: { data: FakeRow[] | null; count: number; error: unknown }) => unknown) {
      if (error) {
        return resolve({ data: null, count: 0, error });
      }
      let data = working;
      if (orderCol) {
        const column = orderCol;
        const direction = orderAsc ? 1 : -1;
        data = [...data].sort((a, b) => direction * compareValues(a[column], b[column]));
      }
      return resolve({ data, count: working.length, error: null });
    },
  };

  return builder;
}

/**
 * Vytvoří fake Supabase klient nad danými tabulkami.
 *
 * @param tables Mapa název tabulky → řádky.
 * @param errorTable Volitelný název tabulky, jejíž dotaz má vrátit chybu (test chyb).
 */
export function makeFakeSupabase(tables: FakeTables, errorTable: string | null = null): SupabaseClient {
  return {
    from: (table: string) => makeBuilder(tables[table] ?? [], errorTable, table),
  } as unknown as SupabaseClient;
}
