// Unit testy (příkladové) pro buildery zpráv Telegram notifikací.
//
// Pokrývají task 4.4: nápověda a odpovědi na příkazy, reprezentativní příklady
// formátu CZK a zprávy o stavu systému. Property testy (CZK, notifikace) zůstávají
// v samostatných `*.property.test.ts` souborech a tento soubor je nenahrazuje.
//
// _Requirements: 11.1, 12.1, 12.2, 14.3_

import { describe, it, expect } from 'vitest';
import {
  buildHelpMessage,
  buildUnknownCommandMessage,
  formatCzk,
  buildHealthMessage,
} from '../messages';
import type { HealthReport } from '../health';

describe('buildHelpMessage', () => {
  it('obsahuje všechny dostupné příkazy', () => {
    const message = buildHelpMessage();

    // Každý podporovaný příkaz musí být v nápovědě vypsaný (R12.1).
    for (const command of ['/trzby', '/odhad', '/stav', '/start', '/help']) {
      expect(message).toContain(command);
    }
  });
});

describe('buildUnknownCommandMessage', () => {
  it('odkazuje na /help', () => {
    // Odpověď na neznámý text navádí uživatele na nápovědu (R12.2).
    expect(buildUnknownCommandMessage()).toContain('/help');
  });
});

describe('formatCzk', () => {
  // Tolerantní porovnání: ponecháme jen číslice, ať test nezávisí na konkrétním
  // znaku oddělovače tisíců (běžná / nezlomitelná / úzká nezlomitelná mezera).
  const digits = (value: string): string => value.replace(/\D/g, '');

  it('formátuje reprezentativní částky se sufixem „Kč"', () => {
    expect(formatCzk(0)).toBe('0 Kč');
    expect(formatCzk(199)).toBe('199 Kč');
  });

  it('používá oddělovač tisíců, ale číselný obsah odpovídá vstupu', () => {
    const thousand = formatCzk(1234);
    expect(thousand).toContain('Kč');
    expect(digits(thousand)).toBe('1234');

    const million = formatCzk(1_000_000);
    expect(million).toContain('Kč');
    expect(digits(million)).toBe('1000000');
  });

  it('zaokrouhluje desetinné částky bez desetinných míst', () => {
    expect(formatCzk(199.4)).toBe('199 Kč');
    expect(formatCzk(199.6)).toBe('200 Kč');
  });
});

describe('buildHealthMessage', () => {
  it('vypíše české labely služeb a agregovaný stav pro smíšené stavy', () => {
    const report: HealthReport = {
      services: [
        { service: 'supabase', label: 'Databáze', status: 'ok' },
        { service: 'resend', label: 'E-maily (Resend)', status: 'degraded' },
        { service: 'gopay', label: 'Platby (GoPay)', status: 'down' },
      ],
      aggregate: 'down',
    };

    const message = buildHealthMessage(report);

    // Agregovaný stav v hlavičce (R11.1) — při přítomnosti `down` → „nedostupné".
    expect(message).toContain('nedostupné');

    // Každá služba má svůj label a český popis stavu.
    expect(message).toContain('Databáze');
    expect(message).toContain('v pořádku');
    expect(message).toContain('E-maily (Resend)');
    expect(message).toContain('zhoršené');
    expect(message).toContain('Platby (GoPay)');
  });

  it('pro samé ok stavy hlásí agregovaný stav „v pořádku"', () => {
    const report: HealthReport = {
      services: [{ service: 'supabase', label: 'Databáze', status: 'ok' }],
      aggregate: 'ok',
    };

    expect(buildHealthMessage(report)).toContain('v pořádku');
  });
});
