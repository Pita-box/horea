import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Textový test migrace `0053_create_system_settings.sql`
 * (feature `admin-system-tools`, task 30.2 / R22.4).
 *
 * Migraci nelze v unit testu reálně spustit proti databázi, proto ověřujeme
 * její TVAR a bezpečnostní vrstvy čistě textově nad zdrojem SQL. Hlídáme:
 *   - tvar tabulky (PK `key`, sloupce `value` a `updated_at`),
 *   - zapnuté RLS,
 *   - admin SELECT policy přes `public.current_user_is_admin()`,
 *   - granty INSERT/UPDATE/SELECT výhradně pro `service_role`,
 *   - revoke all pro `public` i `anon`.
 *
 * Asserce jsou tolerantní k bílým znakům a velikosti písmen (case-insensitive
 * regexy), ale věrné reálnému SQL — případná změna migrace, která poruší
 * některou bezpečnostní vrstvu, test shodí.
 */

// SQL načítáme z reálného souboru migrace, ať test sleduje skutečný stav.
const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0053_create_system_settings.sql'),
  'utf8',
);

// Normalizovaná varianta: malá písmena + zploštělé bílé znaky pro tolerantní
// porovnávání víceslovných klauzulí (granty, revoke), kde nezáleží na zalomení.
const normalized = sql.toLowerCase().replace(/\s+/g, ' ');

describe('migrace 0053_create_system_settings — tvar a RLS', () => {
  it('vytváří tabulku public.system_settings', () => {
    expect(normalized).toContain('create table if not exists public.system_settings');
  });

  it('definuje primární klíč na sloupci key (text primary key)', () => {
    expect(normalized).toMatch(/key\s+text\s+primary\s+key/);
  });

  it('má sloupec value text not null', () => {
    expect(normalized).toMatch(/value\s+text\s+not\s+null/);
  });

  it('má sloupec updated_at typu timestamptz', () => {
    expect(normalized).toMatch(/updated_at\s+timestamptz/);
  });

  it('zapíná row level security na tabulce', () => {
    expect(normalized).toMatch(
      /alter\s+table\s+public\.system_settings\s+enable\s+row\s+level\s+security/,
    );
  });

  it('má admin SELECT policy přes current_user_is_admin()', () => {
    // Policy pro select rolí authenticated, jejíž using podmínka volá admin check.
    expect(normalized).toMatch(
      /create\s+policy\s+\w+\s+on\s+public\.system_settings\s+for\s+select/,
    );
    expect(normalized).toMatch(/using\s*\(\s*public\.current_user_is_admin\(\)\s*\)/);
  });

  it('uděluje service_role granty insert, update i select', () => {
    expect(normalized).toMatch(
      /grant\s+insert,\s*update,\s*select\s+on\s+public\.system_settings\s+to\s+service_role/,
    );
  });

  it('odebírá veškerá oprávnění roli public', () => {
    expect(normalized).toMatch(
      /revoke\s+all\s+on\s+public\.system_settings\s+from\s+public/,
    );
  });

  it('odebírá veškerá oprávnění roli anon', () => {
    expect(normalized).toMatch(
      /revoke\s+all\s+on\s+public\.system_settings\s+from\s+anon/,
    );
  });
});
