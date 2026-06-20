import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/analytics/AnalyticsKpis';

import type { TopEmployee } from '../settings/employee-actions';

const MUTED = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

/** Celkový čas v minutách → české „X hod. Y min." (vynechá nulové části). */
function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} hod.`);
  }
  if (minutes > 0 || hours === 0) {
    parts.push(`${minutes} min.`);
  }
  return parts.join(' ');
}

/** České skloňování „služba/služby/služeb". */
function pluralServices(count: number): string {
  if (count === 1) {
    return 'služba';
  }
  if (count >= 2 && count <= 4) {
    return 'služby';
  }
  return 'služeb';
}

/**
 * Žebříček „TOP zaměstnanci" — efektivita dle obsazenosti tento měsíc (řazeno
 * sestupně). Každý řádek: pořadí, jméno, počet služeb + celkový čas (tlumeně) a
 * vpravo procentuální obsazenost (Action Violet). Seznam je scrollovatelný.
 */
export function TopEmployees({ employees }: { employees: TopEmployee[] }) {
  return (
    <Card
      as="section"
      className="flex max-h-full flex-col border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">TOP zaměstnanci</h2>
          <p className={`text-sm ${MUTED}`}>Podíl na odvedené práci tento měsíc.</p>
        </div>
        <InfoTooltip text="Podíl na odvedené práci = čas rezervací zaměstnance ÷ čas rezervací všech zaměstnanců tento měsíc. Např. Jana odbavila 10 h z celkových 50 h týmu → 20 %. U rezervace s více lidmi se čas započítá každému." />
      </div>

      {employees.length === 0 ? (
        <p className={`mt-4 text-sm ${MUTED}`}>Zatím žádní zaměstnanci.</p>
      ) : (
        <ol className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {employees.map((employee, index) => (
            <li
              key={employee.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`shrink-0 text-sm font-semibold ${MUTED}`}>{index + 1}.</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-slate-text)]">
                    {employee.name}
                  </p>
                  <p className={`text-xs ${MUTED}`}>
                    {employee.serviceCount} {pluralServices(employee.serviceCount)}, celkem{' '}
                    {formatDuration(employee.totalMinutes)}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-[var(--color-action-violet)]">
                {employee.sharePct} %
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
