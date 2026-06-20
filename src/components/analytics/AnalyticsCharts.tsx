import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/analytics/AnalyticsKpis';
import { buildSmoothPath } from '@/lib/reservations/occupancy';
import {
  formatCzk,
  type ClientMix,
  type RevenuePoint,
  type StatusBreakdown,
} from '@/lib/analytics/analytics';

const MUTED = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';
const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;

/** České skloňování slova „rezervace" podle počtu. */
function reservationsWord(count: number): string {
  return count >= 5 || count === 0 ? 'rezervací' : 'rezervace';
}

function SectionCard({
  title,
  info,
  children,
  id,
}: {
  title: string;
  info?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <Card
      id={id}
      className={[
        'flex flex-col gap-4 border border-[var(--color-border-vychozi)] p-[var(--spacing-24)]',
        id ? 'scroll-mt-20' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-[var(--font-polysans)] text-base font-semibold text-[var(--color-rich-violet)]">
          {title}
        </h2>
        {info ? <InfoTooltip text={info} /> : null}
      </div>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Koláč stavů rezervací
// ---------------------------------------------------------------------------

const STATUS_SEGMENTS: { key: keyof StatusBreakdown; label: string; color: string }[] = [
  { key: 'attended', label: 'Uskutečněné', color: 'var(--color-electric-green)' },
  { key: 'noShow', label: 'Propadlé', color: 'var(--color-red)' },
  { key: 'cancelled', label: 'Zrušené', color: 'color-mix(in srgb, var(--color-slate-text) 35%, white)' },
  { key: 'upcoming', label: 'Naplánované', color: 'var(--color-action-violet)' },
];

export function StatusDonut({
  breakdown,
  info,
  id,
}: {
  breakdown: StatusBreakdown;
  info?: string;
  id?: string;
}) {
  const total = STATUS_SEGMENTS.reduce((sum, segment) => sum + breakdown[segment.key], 0);

  let acc = 0;
  const stops = STATUS_SEGMENTS.filter((segment) => breakdown[segment.key] > 0).map((segment) => {
    const start = (acc / total) * 360;
    acc += breakdown[segment.key];
    const end = (acc / total) * 360;
    return `${segment.color} ${start}deg ${end}deg`;
  });

  return (
    <SectionCard title="Stav rezervací" info={info} id={id}>
      {total === 0 ? (
        <p className={`text-sm ${MUTED}`}>V tomto období nejsou žádné rezervace.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div
            className="relative h-36 w-36 shrink-0 rounded-full"
            style={{ background: `conic-gradient(${stops.join(', ')})` }}
            aria-hidden="true"
          >
            <div className="absolute inset-[18%] rounded-full bg-[var(--color-canvas-white)]" />
          </div>
          <ul className="flex flex-1 flex-col gap-2">
            {STATUS_SEGMENTS.map((segment) => {
              const value = breakdown[segment.key];
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return (
                <li key={segment.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                    aria-hidden="true"
                  />
                  <span className="text-[var(--color-slate-text)]">{segment.label}</span>
                  <span className={`ml-auto font-medium ${MUTED}`}>
                    {value} · {pct} %
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Heatmapa vytížení (den × hodina)
// ---------------------------------------------------------------------------

export function UtilizationHeatmap({
  grid,
  info,
  id,
}: {
  grid: number[][];
  info?: string;
  id?: string;
}) {
  // Zobrazujeme jen rozsah hodin s daty (rozšířený na 8–18 pro kontext).
  let minHour = 8;
  let maxHour = 18;
  let maxCount = 0;
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const count = grid[weekday][hour];
      if (count > 0) {
        minHour = Math.min(minHour, hour);
        maxHour = Math.max(maxHour, hour + 1);
        maxCount = Math.max(maxCount, count);
      }
    }
  }
  const hours = Array.from({ length: maxHour - minHour }, (_, index) => minHour + index);

  return (
    <SectionCard title="Špičky vytížení" info={info} id={id}>
      {maxCount === 0 ? (
        <p className={`text-sm ${MUTED}`}>V tomto období nejsou žádné rezervace.</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: hours.length * 44 + 32 }}>
            <div className="flex">
              <div className="w-8 shrink-0" aria-hidden="true" />
              <div
                className="grid flex-1"
                style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
              >
                {hours.map((hour) => (
                  <span key={hour} className={`text-center text-[11px] ${MUTED}`}>
                    {hour}:00
                  </span>
                ))}
              </div>
            </div>
            {WEEKDAYS.map((label, weekday) => (
              <div key={label} className="mt-1 flex items-center">
                <span className={`w-8 shrink-0 text-xs font-medium ${MUTED}`}>{label}</span>
                <div
                  className="grid flex-1 gap-1"
                  style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }}
                >
                  {hours.map((hour) => {
                    const count = grid[weekday][hour];
                    const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                    return (
                      <div key={hour} className="group relative">
                        <div
                          className="aspect-square rounded-[4px]"
                          style={{
                            backgroundColor:
                              count === 0
                                ? 'var(--color-soft-gray-fill)'
                                : `color-mix(in srgb, var(--color-action-violet) ${Math.max(12, pct)}%, white)`,
                          }}
                        />
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-lg)] bg-[var(--color-rich-violet)] px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block"
                        >
                          {label} {hour}:00 · {count} {reservationsWord(count)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Vývoj tržeb v čase
// ---------------------------------------------------------------------------

export function RevenueTrendChart({
  points,
  info,
  id,
}: {
  points: RevenuePoint[];
  info?: string;
  id?: string;
}) {
  const width = 720;
  const height = 200;
  const maxRevenue = Math.max(1, ...points.map((point) => point.revenue));
  const total = points.reduce((sum, point) => sum + point.revenue, 0);
  const values = points.map((point) => (point.revenue / maxRevenue) * 100);
  const { line, area } = buildSmoothPath(values, { width, height, padTop: 10, padBottom: 10 });

  const firstDate = points[0]?.dateISO;
  const lastDate = points[points.length - 1]?.dateISO;
  const csDate = (iso?: string) => {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${Number(d)}. ${Number(m)}.`;
  };

  return (
    <SectionCard title="Vývoj tržeb v čase" info={info} id={id}>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm ${MUTED}`}>Tržby z uskutečněných rezervací</span>
        <span className="font-[var(--font-polysans)] text-lg font-semibold text-[var(--color-rich-violet)]">
          {formatCzk(total)}
        </span>
      </div>
      {total === 0 ? (
        <p className={`text-sm ${MUTED}`}>V tomto období nejsou žádné tržby.</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-48 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label="Graf vývoje tržeb"
          >
            <defs>
              <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-action-violet)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--color-action-violet)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#revenue-fill)" />
            <path
              d={line}
              fill="none"
              stroke="var(--color-action-violet)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className={`flex justify-between text-xs ${MUTED}`}>
            <span>{csDate(firstDate)}</span>
            <span>max {formatCzk(maxRevenue)}</span>
            <span>{csDate(lastDate)}</span>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Žebříček (služby / zaměstnanci / klienti)
// ---------------------------------------------------------------------------

export type RankingRow = {
  id: string;
  primary: string;
  secondary: string;
  value: string;
  barPct: number;
};

export function RankingList({
  title,
  rows,
  emptyText,
  info,
  id,
}: {
  title: string;
  rows: RankingRow[];
  emptyText: string;
  info?: string;
  id?: string;
}) {
  return (
    <SectionCard title={title} info={info} id={id}>
      {rows.length === 0 ? (
        <p className={`text-sm ${MUTED}`}>{emptyText}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3">
              <span className={`w-5 shrink-0 text-sm font-semibold ${MUTED}`}>{index + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-[var(--color-slate-text)]">
                    {row.primary}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--color-action-violet)]">
                    {row.value}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-soft-gray-fill)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-action-violet)]"
                    style={{ width: `${Math.max(2, Math.round(row.barPct * 100))}%` }}
                  />
                </div>
                <p className={`mt-1 text-xs ${MUTED}`}>{row.secondary}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Noví vs. vracející se klienti
// ---------------------------------------------------------------------------

export function ClientMixCard({ mix, info, id }: { mix: ClientMix; info?: string; id?: string }) {
  const total = mix.newClients + mix.returningClients;
  const returningPct = total > 0 ? Math.round((mix.returningClients / total) * 100) : 0;
  const newPct = total > 0 ? 100 - returningPct : 0;

  return (
    <SectionCard title="Noví vs. vracející se klienti" info={info} id={id}>
      {total === 0 ? (
        <p className={`text-sm ${MUTED}`}>V tomto období nejsou žádní klienti.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-[var(--color-soft-gray-fill)]">
            <div
              className="h-full bg-[var(--color-action-violet)]"
              style={{ width: `${returningPct}%` }}
            />
            <div className="h-full bg-[var(--color-air-blue)]" style={{ width: `${newPct}%` }} />
          </div>
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[var(--color-action-violet)]" aria-hidden="true" />
              <span className="text-[var(--color-slate-text)]">
                Vracející se: <strong>{mix.returningClients}</strong> ({returningPct} %)
              </span>
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[var(--color-air-blue)]" aria-hidden="true" />
              <span className="text-[var(--color-slate-text)]">
                Noví: <strong>{mix.newClients}</strong> ({newPct} %)
              </span>
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}
