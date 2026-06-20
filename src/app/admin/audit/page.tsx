import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import type { AuditActionType, AuditTargetType } from '@/lib/admin/audit-logger';
import { listAuditLog, type AuditLogFilters } from '@/lib/admin/audit-viewer';
import { toPragueDisplay } from '@/lib/datetime';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Prohlížení auditní stopy admin dashboardu `/admin/audit` (feature
 * `admin-dashboard`, Requirement 10, task 6.2).
 *
 * SSR, **výhradně čtecí** stránka napojená na {@link listAuditLog}. Zobrazuje
 * záznamy seřazené sestupně dle `created_at` (R10.1) a umožňuje filtrovat dle
 * typu akce (R10.2), časového rozsahu (R10.3) a cílového objektu — typ a/nebo id
 * (R10.4). Filtry se předávají přes `searchParams` z GET formuláře. Rozhraní
 * neumožňuje úpravu ani mazání záznamů.
 *
 * Přístup je chráněn Access_Guard middlewarem (`/admin/*`), proto stránka
 * předpokládá přihlášeného admina a čte cross-tenant data přes service-role
 * klienta.
 */

export const dynamic = 'force-dynamic';

type AuditPageProps = {
  searchParams: Promise<{
    akce?: string | string[];
    od?: string | string[];
    do?: string | string[];
    cilTyp?: string | string[];
    cilId?: string | string[];
  }>;
};

const ACTION_LABELS: Record<AuditActionType, string> = {
  subscription_override: 'Úprava předplatného',
  grant_free_trial: 'Udělení free trial',
  grant_comp: 'Udělení comp účtu',
  suspend_business: 'Pozastavení podniku',
  force_delete_business: 'Vynucené smazání podniku',
  coupon_create: 'Vytvoření kupónu',
  coupon_update: 'Úprava kupónu',
  coupon_deactivate: 'Deaktivace kupónu',
  coupon_delete: 'Smazání kupónu',
  payment_match: 'Spárování platby',
  plan_feature_update: 'Změna funkcí tarifu',
};

const TARGET_LABELS: Record<AuditTargetType, string> = {
  subscription: 'Předplatné',
  business: 'Podnik',
  coupon: 'Kupón',
  payment: 'Platba',
  plan_feature: 'Funkce tarifu',
};

const ACTION_VALUES = Object.keys(ACTION_LABELS) as AuditActionType[];
const TARGET_VALUES = Object.keys(TARGET_LABELS) as AuditTargetType[];

function getParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveAction(raw: string | undefined): AuditActionType | undefined {
  return ACTION_VALUES.includes(raw as AuditActionType) ? (raw as AuditActionType) : undefined;
}

function resolveTarget(raw: string | undefined): AuditTargetType | undefined {
  return TARGET_VALUES.includes(raw as AuditTargetType) ? (raw as AuditTargetType) : undefined;
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action as AuditActionType] ?? action;
}

function targetLabel(target: string): string {
  return TARGET_LABELS[target as AuditTargetType] ?? target;
}

export default async function AdminAuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams;
  const actionType = resolveAction(getParam(params.akce));
  const createdFrom = getParam(params.od);
  const createdTo = getParam(params.do);
  const targetType = resolveTarget(getParam(params.cilTyp));
  const targetId = getParam(params.cilId);

  const filters: AuditLogFilters = {
    actionType,
    // Datumové hranice interpretujeme jako celý den (od začátku, do konce).
    createdFrom: createdFrom ? `${createdFrom}T00:00:00` : undefined,
    createdTo: createdTo ? `${createdTo}T23:59:59` : undefined,
    targetType,
    targetId,
  };

  const supabase = createAdminClient();
  const records = await listAuditLog(supabase, filters);

  const selectClass =
    'h-10 w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] text-base leading-[1.1] text-[var(--color-slate-text)] outline-none transition-colors focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)]';

  return (
    <div className="flex flex-col gap-6">
      <Card
        as="section"
        className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Filtry auditní stopy"
      >
          <form method="get" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:items-end">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">Typ akce</span>
              <select name="akce" defaultValue={actionType ?? ''} className={selectClass}>
                <option value="">Všechny akce</option>
                {ACTION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {ACTION_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                Typ cílového objektu
              </span>
              <select name="cilTyp" defaultValue={targetType ?? ''} className={selectClass}>
                <option value="">Všechny typy</option>
                {TARGET_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {TARGET_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                ID cílového objektu
              </span>
              <Input type="text" name="cilId" defaultValue={targetId ?? ''} placeholder="UUID" />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">Od</span>
              <DatePicker name="od" defaultValue={createdFrom ?? ''} allowClear placeholder="Od" aria-label="Od" />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">Do</span>
              <DatePicker name="do" defaultValue={createdTo ?? ''} allowClear placeholder="Do" aria-label="Do" />
            </label>

            <div className="flex items-center gap-3 md:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 text-sm font-normal leading-none text-[var(--color-canvas-white)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
              >
                Filtrovat
              </button>
              <Link
                href="/admin/audit"
                className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
              >
                Zrušit filtry
              </Link>
            </div>
          </form>
        </Card>

        {records.length === 0 ? (
          <Notice role="status">Žádný auditní záznam neodpovídá zvoleným filtrům.</Notice>
        ) : (
          <Card
            as="section"
            className="overflow-hidden border border-[var(--color-border-vychozi)]"
            aria-label="Auditní záznamy"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-vychozi)] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                    <th className="px-5 py-3 font-medium">Čas</th>
                    <th className="px-5 py-3 font-medium">Akce</th>
                    <th className="px-5 py-3 font-medium">Cílový objekt</th>
                    <th className="px-5 py-3 font-medium">ID cíle</th>
                    <th className="px-5 py-3 font-medium">Administrátor</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-[var(--color-slate-text)]">
                        {toPragueDisplay(record.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-[var(--color-slate-text)]">
                        {actionLabel(record.actionType)}
                      </td>
                      <td className="px-5 py-3 text-[var(--color-slate-text)]">
                        {targetLabel(record.targetType)}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[var(--color-slate-text)]">
                        {record.targetId ?? '—'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[var(--color-slate-text)]">
                        {record.actorUserId ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
    </div>
  );
}
