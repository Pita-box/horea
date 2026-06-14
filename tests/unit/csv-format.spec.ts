import { describe, expect, it } from 'vitest';

import { toPragueIso } from '@/lib/datetime';
import {
  CSV_COLUMNS,
  UTF8_BOM,
  encodeCsvField,
  generateCsvLines,
  reservationToCsvRow,
} from '@/server/CsvExporter';

/**
 * Příkladový test formátu CSV exportu (úkol 11.4 — R17.2, R17.3).
 *
 * Testuje exportované čisté funkce `CsvExporter`u bez DB: přesné pořadí a názvy
 * sloupců hlavičky, ISO 8601 časová pole v Europe/Prague s offsetem a přítomnost
 * UTF-8 BOM. Round-trip RFC 4180 escapingu pokrývá Property 6 (úkol 11.2).
 */

/** Surový DB řádek shodný se strukturou, kterou `CsvExporter` čte z Postgresu. */
const sampleRow = {
  id: 'res-1',
  // Léto (CEST, UTC+2): 12:00Z → 14:00+02:00.
  starts_at: '2024-07-15T12:00:00.000Z',
  ends_at: '2024-07-15T13:00:00.000Z',
  status: 'approved' as const,
  attendance: null,
  client_name: 'Jan Novák',
  client_phone: '+420777888999',
  client_email: 'jan@example.cz',
  note: null,
  // Zima (CET, UTC+1): 08:30Z → 09:30+01:00.
  created_at: '2024-01-10T08:30:00.000Z',
  services: { name: 'Stříhání' },
};

describe('CSV hlavička (R17.3)', () => {
  it('má přesně očekávané sloupce ve správném pořadí', () => {
    expect(CSV_COLUMNS).toEqual([
      'id',
      'starts_at',
      'ends_at',
      'service_name',
      'client_name',
      'client_phone',
      'client_email',
      'note',
      'status',
      'attendance',
      'created_at',
    ]);
  });

  it('první vygenerovaný řádek je hlavička oddělená čárkami', () => {
    const [header] = Array.from(generateCsvLines([]));
    expect(header).toBe(
      'id,starts_at,ends_at,service_name,client_name,client_phone,client_email,note,status,attendance,created_at',
    );
  });
});

describe('Časová pole v ISO 8601 Europe/Prague s offsetem (R17.3)', () => {
  it('serializuje starts_at, ends_at a created_at přes toPragueIso s offsetem', () => {
    const row = reservationToCsvRow(sampleRow);
    const fields = row.split(',');

    // Letní offset +02:00 pro starts_at/ends_at, zimní +01:00 pro created_at.
    expect(fields[1]).toBe('2024-07-15T14:00:00+02:00');
    expect(fields[2]).toBe('2024-07-15T15:00:00+02:00');
    expect(fields[10]).toBe('2024-01-10T09:30:00+01:00');

    // Soulad s utilitou toPragueIso (zdroj pravdy o offsetu).
    expect(fields[1]).toBe(toPragueIso(sampleRow.starts_at));
    expect(fields[10]).toBe(toPragueIso(sampleRow.created_at));
  });

  it('prázdná docházka i poznámka se serializují jako prázdné pole', () => {
    const fields = reservationToCsvRow(sampleRow).split(',');
    expect(fields[7]).toBe(''); // note = null
    expect(fields[9]).toBe(''); // attendance = null
    expect(encodeCsvField(null)).toBe('');
  });
});

describe('UTF-8 BOM (R17.2)', () => {
  it('BOM konstanta je znak U+FEFF', () => {
    expect(UTF8_BOM).toBe('\uFEFF');
    expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});
