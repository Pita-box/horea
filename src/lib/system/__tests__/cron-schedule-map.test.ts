// Feature: admin-system-tools — ochrana proti driftu deklarace cron rozvrhů.
//
// Načte skutečný `vercel.json` (sekce `crons`) a ověří, že `CRON_SCHEDULE_MAP`
// přesně odpovídá deklarovaným rozvrhům. Kontrola je obousměrná: každý job v
// `CRON_SCHEDULE_MAP` má odpovídající záznam ve `vercel.json` se shodným
// rozvrhem a naopak (žádný navíc/chybějící). Tím se chytí jakýkoli drift mezi
// deklarací rozvrhů ve `vercel.json` a monitorovací mapou v kódu (R24.3).
// Validates: Requirements 24.3

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CRON_SCHEDULE_MAP } from '@/lib/system/cron-schedule';

// Tvar jednoho cron záznamu ve `vercel.json`.
type VercelCron = { path: string; schedule: string };

// Načti skutečný `vercel.json` z kořene projektu (ne kopii) — test tak hlídá
// reálný deploy artefakt.
const vercelConfig = JSON.parse(
  readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
) as { crons?: VercelCron[] };

const crons = vercelConfig.crons ?? [];

// Z cesty `/api/cron/<job>` odvoď název jobu (poslední segment cesty).
function jobFromPath(path: string): string {
  return path.replace(/^\/api\/cron\//, '');
}

// Rozvrhy z `vercel.json` namapované na název jobu.
const configuredSchedules: Record<string, string> = Object.fromEntries(
  crons.map((cron) => [jobFromPath(cron.path), cron.schedule]),
);

describe('CRON_SCHEDULE_MAP vs vercel.json — drift deklarace (R24.3)', () => {
  it('vercel.json obsahuje sekci crons s alespoň jedním záznamem', () => {
    expect(Array.isArray(vercelConfig.crons)).toBe(true);
    expect(crons.length).toBeGreaterThan(0);
  });

  it('každý job z vercel.json má cestu ve tvaru /api/cron/<job>', () => {
    for (const cron of crons) {
      expect(cron.path).toMatch(/^\/api\/cron\/[a-z-]+$/);
    }
  });

  it('CRON_SCHEDULE_MAP a vercel.json mají stejnou množinu jobů (žádný navíc/chybějící)', () => {
    const mapJobs = Object.keys(CRON_SCHEDULE_MAP).sort();
    const vercelJobs = Object.keys(configuredSchedules).sort();
    expect(mapJobs).toEqual(vercelJobs);
  });

  it('rozvrhy se shodují obousměrně (mapa → vercel.json)', () => {
    for (const [job, schedule] of Object.entries(CRON_SCHEDULE_MAP)) {
      expect(configuredSchedules[job]).toBe(schedule);
    }
  });

  it('rozvrhy se shodují obousměrně (vercel.json → mapa)', () => {
    for (const [job, schedule] of Object.entries(configuredSchedules)) {
      expect(CRON_SCHEDULE_MAP[job as keyof typeof CRON_SCHEDULE_MAP]).toBe(schedule);
    }
  });

  it('CRON_SCHEDULE_MAP přesně odpovídá očekávaným rozvrhům', () => {
    // Explicitní očekávané hodnoty (dvojitá pojistka proti tichému přepisu obou stran).
    expect(CRON_SCHEDULE_MAP).toEqual({
      billing: '0 3 * * *',
      warnings: '30 3 * * *',
      cleanup: '0 4 * * *',
      'email-retry': '*/15 * * * *',
    });
  });
});
