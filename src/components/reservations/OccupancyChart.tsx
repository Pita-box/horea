'use client';

import { useState } from 'react';

import { buildSmoothPath, type OccupancyPoint } from '@/lib/reservations/occupancy';

type OccupancyChartProps = {
  points: OccupancyPoint[];
  /** Vybraný rozsah (`YYYY-MM-DD`) ke zvýraznění; oba `null` = bez zvýraznění. */
  selection: { start: string | null; end: string | null };
};

const WIDTH = 720;
const HEIGHT = 240;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

const INNER_WIDTH = WIDTH - PAD_LEFT - PAD_RIGHT;
const INNER_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;
const Y_TICKS = [0, 25, 50, 75, 100];

function dayLabel(dateISO: string): string {
  const [, , day] = dateISO.split('-');
  return String(Number(day));
}

/** „16. června" — popisek dne pro tooltip. */
function tooltipDate(dateISO: string): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dateISO}T00:00:00Z`));
}

/** X souřadnice bodu s indexem `i` v rámci vnitřní plochy (SVG souřadnice). */
function xAt(index: number, count: number): number {
  if (count <= 1) {
    return PAD_LEFT + INNER_WIDTH / 2;
  }
  return PAD_LEFT + (index / (count - 1)) * INNER_WIDTH;
}

function yAt(pct: number): number {
  return PAD_TOP + INNER_HEIGHT * (1 - pct / 100);
}

/**
 * Graf denní obsazenosti (%) — plynulá SVG křivka s výplní, osa Y 0–100 % a
 * řídké popisky dnů. Vybraný den/rozsah z kalendáře se zvýrazní svislým pásem.
 * Při najetí myší ukáže tooltip s datem, obsazeností a počtem rezervací daného
 * dne (HTML overlay nad vnitřní plochou grafu). Barvy z design systému.
 */
export function OccupancyChart({ points, selection }: OccupancyChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
        Pro tento měsíc nejsou žádná data.
      </p>
    );
  }

  const values = points.map((point) => point.occupancyPct);
  const { line, area } = buildSmoothPath(values, {
    width: INNER_WIDTH,
    height: HEIGHT,
    padTop: PAD_TOP,
    padBottom: PAD_BOTTOM,
  });

  // Řídké popisky dnů na ose X (cca 8 ticků), aby se nepřekrývaly.
  const tickStep = Math.max(1, Math.ceil(points.length / 8));
  const tickIndexes = points
    .map((_, index) => index)
    .filter((index) => index % tickStep === 0 || index === points.length - 1);

  // Zvýraznění vybraného rozsahu (svislý pás).
  const startIdx = selection.start
    ? points.findIndex((point) => point.dateISO === selection.start)
    : -1;
  const endIdx = selection.end
    ? points.findIndex((point) => point.dateISO === selection.end)
    : startIdx;
  const hasBand = startIdx >= 0;
  const bandLo = hasBand ? Math.min(startIdx, endIdx >= 0 ? endIdx : startIdx) : 0;
  const bandHi = hasBand ? Math.max(startIdx, endIdx >= 0 ? endIdx : startIdx) : 0;

  // Overlay (pro hover) leží přesně nad vnitřní plochou grafu → procenta z šířky/výšky.
  const leftPct = (PAD_LEFT / WIDTH) * 100;
  const rightPct = (PAD_RIGHT / WIDTH) * 100;

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
    setHover(index);
  }

  const hoverPoint = hover != null ? points[hover] : null;
  const hoverLeftPct = hover != null && points.length > 1 ? (hover / (points.length - 1)) * 100 : 50;
  const hoverTopPct = hoverPoint ? (yAt(hoverPoint.occupancyPct) / HEIGHT) * 100 : 0;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label="Graf denní obsazenosti v procentech"
        preserveAspectRatio="none"
      >
        {/* Y mřížka + popisky */}
        {Y_TICKS.map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="var(--color-cloud-mist)"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] text-[11px]"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Zvýraznění vybraného dne/rozsahu */}
        {hasBand ? (
          <rect
            x={Math.max(PAD_LEFT, xAt(bandLo, points.length) - (bandLo === bandHi ? 10 : 0))}
            y={PAD_TOP}
            width={
              bandLo === bandHi
                ? 20
                : Math.max(2, xAt(bandHi, points.length) - xAt(bandLo, points.length))
            }
            height={INNER_HEIGHT}
            fill="color-mix(in srgb, var(--color-action-violet) 10%, white)"
          />
        ) : null}

        {/* Výplň pod křivkou + křivka */}
        <g transform={`translate(${PAD_LEFT}, 0)`}>
          <path d={area} fill="color-mix(in srgb, var(--color-action-violet) 12%, white)" />
          <path d={line} fill="none" stroke="var(--color-action-violet)" strokeWidth={2.5} />
        </g>

        {/* Zvýrazněný bod při hoveru */}
        {hoverPoint ? (
          <circle
            cx={xAt(hover as number, points.length)}
            cy={yAt(hoverPoint.occupancyPct)}
            r={4}
            fill="var(--color-action-violet)"
            stroke="white"
            strokeWidth={2}
          />
        ) : null}

        {/* X popisky (dny) */}
        {tickIndexes.map((index) => (
          <text
            key={points[index].dateISO}
            x={xAt(index, points.length)}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="fill-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] text-[11px]"
          >
            {dayLabel(points[index].dateISO)}
          </text>
        ))}
      </svg>

      {/* Hover vrstva nad vnitřní plochou grafu */}
      <div
        className="absolute top-0 bottom-0"
        style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {hoverPoint ? (
          <>
            {/* Svislé vodítko */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 w-px -translate-x-1/2 bg-[color-mix(in_srgb,var(--color-action-violet)_35%,white)]"
              style={{ left: `${hoverLeftPct}%`, bottom: `${(PAD_BOTTOM / HEIGHT) * 100}%` }}
            />
            {/* Tooltip */}
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] px-3 py-2 text-center shadow-sm"
              style={{ left: `${hoverLeftPct}%`, top: `${hoverTopPct}%` }}
            >
              <p className="text-[12px] font-medium text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                {tooltipDate(hoverPoint.dateISO)}
              </p>
              <p className="text-[15px] font-semibold text-[var(--color-rich-violet)]">
                {hoverPoint.occupancyPct} %
              </p>
              <p className="text-[12px] text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                Rezervace: {hoverPoint.reservationCount}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
