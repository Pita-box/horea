import { Notice } from '@/components/ui/notice';
import {
  ClientMixCard,
  RankingList,
  RevenueTrendChart,
  StatusDonut,
  UtilizationHeatmap,
  type RankingRow,
} from '@/components/analytics/AnalyticsCharts';
import { KpiCard, PeriodTabs } from '@/components/analytics/AnalyticsKpis';
import {
  computeClientMix,
  computeHeatmap,
  computeKpis,
  computeRevenueSeries,
  computeStatusBreakdown,
  daysBetween,
  employeePerformance,
  formatCzk,
  formatPercent,
  relativeChange,
  topClientsBySpend,
  topServicesByRevenue,
} from '@/lib/analytics/analytics';

import { loadAnalytics } from './load';

type AnalyticsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const raw = await searchParams;
  const result = await loadAnalytics(firstParam(raw.period));

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Notice role="alert" variant="error">
          {result.message}
        </Notice>
      </div>
    );
  }

  const { period, current, previous, historyBefore, employeeNames } = result.data;

  const kpis = computeKpis(current);
  const prevKpis = computeKpis(previous);

  const breakdown = computeStatusBreakdown(current);
  const heatmap = computeHeatmap(current);
  const revenueSeries = computeRevenueSeries(current, daysBetween(period.from, period.to));

  const services = topServicesByRevenue(current).slice(0, 8);
  const maxServiceRevenue = Math.max(1, ...services.map((service) => service.revenue));
  const serviceRows: RankingRow[] = services.map((service) => ({
    id: service.serviceId,
    primary: service.name,
    secondary: `${service.count}× provedeno`,
    value: formatCzk(service.revenue),
    barPct: service.revenue / maxServiceRevenue,
  }));

  const employees = employeePerformance(current).slice(0, 8);
  const maxEmployeeRevenue = Math.max(1, ...employees.map((employee) => employee.revenue));
  const employeeRows: RankingRow[] = employees.map((employee) => ({
    id: employee.employeeId,
    primary: employeeNames[employee.employeeId] ?? 'Neznámý zaměstnanec',
    secondary: `${employee.count} rezervací`,
    value: formatCzk(employee.revenue),
    barPct: employee.revenue / maxEmployeeRevenue,
  }));

  const clients = topClientsBySpend(current).slice(0, 10);
  const maxClientSpend = Math.max(1, ...clients.map((client) => client.spend));
  const clientRows: RankingRow[] = clients.map((client) => ({
    id: client.clientKey,
    primary: client.name,
    secondary: `${client.visits}× návštěva`,
    value: formatCzk(client.spend),
    barPct: client.spend / maxClientSpend,
  }));

  const clientMix = computeClientMix(current, historyBefore);

  return (
    <div className="flex flex-col gap-6">
      <PeriodTabs period={period} />

      {/* 4 KPI karty */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Tržby z rezervací"
          value={formatCzk(kpis.revenue)}
          delta={relativeChange(kpis.revenue, prevKpis.revenue)}
          comparisonLabel={period.comparisonLabel}
          info="Součet cen služeb z rezervací, které se opravdu uskutečnily (klient dorazil). Ceny se berou v okamžiku rezervace."
        />
        <KpiCard
          label="Počet rezervací"
          value={kpis.count.toString()}
          delta={relativeChange(kpis.count, prevKpis.count)}
          comparisonLabel={period.comparisonLabel}
          info="Kolik rezervací v tomto období vzniklo — počítají se všechny stavy (čekající, schválené, zrušené i propadlé)."
        />
        <KpiCard
          label="Průměrná hodnota rezervace"
          value={formatCzk(kpis.avgValue)}
          delta={relativeChange(kpis.avgValue, prevKpis.avgValue)}
          comparisonLabel={period.comparisonLabel}
          info="Kolik průměrně utratí klient za jednu uskutečněnou návštěvu (tržby ÷ počet uskutečněných). Roste, když si klienti objednávají víc služeb najednou."
        />
        <KpiCard
          label="Míra propadnutí"
          value={formatPercent(kpis.noShowRate, 0)}
          delta={relativeChange(kpis.noShowRate, prevKpis.noShowRate)}
          higherIsBetter={false}
          comparisonLabel={period.comparisonLabel}
          info="Podíl neúspěšných rezervací (klient nedorazil nebo se zrušila) ze všech vyřízených. Čím nižší, tím spolehlivější kalendář."
        />
      </div>

      {/* Široký graf vývoje tržeb */}
      <RevenueTrendChart
        points={revenueSeries}
        info="Jak se den po dni vyvíjely tržby z uskutečněných rezervací. Pomáhá poznat silné a slabé dny."
      />

      {/* Vytížení + stav rezervací */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <UtilizationHeatmap
          grid={heatmap}
          info="Kdy se nejvíc rezervuje. Čím tmavší políčko, tím víc rezervací v daný den a hodinu — tmavá místa praskají ve švech, světlá jsou volná."
        />
        <StatusDonut
          breakdown={breakdown}
          info="Rozložení rezervací podle výsledku: uskutečněné, propadlé (nedorazil), zrušené a teprve naplánované. Ukazuje spolehlivost kalendáře."
        />
      </div>

      {/* Spodní mřížka: služby / zaměstnanci / klienti */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <RankingList
          title="Nejvýdělečnější služby"
          rows={serviceRows}
          emptyText="Zatím žádné uskutečněné služby."
          info="Služby seřazené podle toho, kolik peněz celkem vydělaly (ne podle počtu). Jedna dražší služba může být cennější než pět levných."
        />
        <RankingList
          title="Výkonnost zaměstnanců"
          rows={employeeRows}
          emptyText="Zatím žádné přiřazené rezervace."
          info="Kolik tržeb vygeneroval každý zaměstnanec a kolik odbavil rezervací. U rezervace s více lidmi se tržba počítá každému z nich."
        />
        <div className="flex flex-col gap-6">
          <ClientMixCard
            mix={clientMix}
            info="Poměr nových klientů (první návštěva) k vracejícím se (byli tu i dřív). Ukazuje, jestli podnik roste náborem, nebo si drží stálou klientelu."
          />
          <RankingList
            title="TOP klienti"
            rows={clientRows}
            emptyText="Zatím žádní klienti s útratou."
            info="Klienti s nejvyšší celkovou útratou za období. Hodí se třeba pro poděkování nebo věrnostní slevu."
          />
        </div>
      </div>
    </div>
  );
}
