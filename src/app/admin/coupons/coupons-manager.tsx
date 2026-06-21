'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/DatePicker';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import type { CouponManagerRecord } from '@/lib/admin/coupon-manager';
import type { CouponType } from '@/lib/coupons/validate';

import {
  createCouponAction,
  deactivateCouponAction,
  deleteCouponAction,
  updateCouponAction,
  type CouponFormInput,
} from './actions';

/**
 * Interaktivní správa kupónů (`/admin/coupons`, feature `admin-dashboard`,
 * task 14.2). Client komponenta nad server actions — formulář pro vytvoření /
 * úpravu a akce deaktivace / smazání nad seznamem. Validace a auditní zápis žijí
 * v server actions / CouponManageru; tato vrstva pouze sbírá vstup a zobrazuje
 * českou hlášku z výsledku (např. duplicitní kód, percent mimo 0–100).
 */

type CouponsManagerProps = {
  coupons: CouponManagerRecord[];
};

const TYPE_OPTIONS: ReadonlyArray<{ value: CouponType; label: string }> = [
  { value: 'percent', label: 'Procentuální sleva' },
  { value: 'fixed', label: 'Pevná sleva (Kč)' },
  { value: 'free_trial_days', label: 'Zkušební dny' },
  { value: 'comp', label: 'Comp účet' },
];

const TYPE_LABELS: Record<CouponType, string> = {
  percent: 'Procentuální sleva',
  fixed: 'Pevná sleva (Kč)',
  free_trial_days: 'Zkušební dny',
  comp: 'Comp účet',
};

const EMPTY_FORM: CouponFormInput = {
  code: '',
  type: 'percent',
  discountValue: '',
  validUntil: '',
  maxUses: '',
};

function recordToForm(coupon: CouponManagerRecord): CouponFormInput {
  return {
    code: coupon.code,
    type: coupon.type,
    discountValue: coupon.discountValue === null ? '' : String(coupon.discountValue),
    // `valid_until` z DB je ISO timestamp; pro <input type="date"> bereme datovou část.
    validUntil: coupon.validUntil ? coupon.validUntil.slice(0, 10) : '',
    maxUses: coupon.maxUses === null ? '' : String(coupon.maxUses),
  };
}

export function CouponsManager({ coupons }: CouponsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponFormInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEditing = editingId !== null;

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(coupon: CouponManagerRecord) {
    setEditingId(coupon.id);
    setForm(recordToForm(coupon));
    setError(null);
    setSuccess(null);
  }

  function runAction(action: () => Promise<{ ok: true } | { ok: false; message: string }>, okMessage: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setSuccess(okMessage);
        resetForm();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEditing && editingId) {
      runAction(() => updateCouponAction(editingId, form), 'Kupón byl upraven.');
    } else {
      runAction(() => createCouponAction(form), 'Kupón byl vytvořen.');
    }
  }

  const selectClass =
    'h-10 w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] text-base leading-[1.1] text-[var(--color-slate-text)] outline-none transition-colors focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)]';

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice variant="error" role="alert">{error}</Notice> : null}
      {success ? <Notice role="status">{success}</Notice> : null}

      <Card
        as="section"
        className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label={isEditing ? 'Úprava kupónu' : 'Vytvoření kupónu'}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            {isEditing ? 'Upravit kupón' : 'Nový kupón'}
          </h2>
          <InfoTooltip text="Vytvoř nebo uprav slevový kupón: zadej kód, typ slevy (procenta, pevná částka v Kč, zkušební dny nebo comp účet), hodnotu, platnost do a maximální počet použití. Hodnota se u comp účtu nepoužívá; max. použití prázdné znamená neomezeně." />
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:items-end">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">Kód</span>
            <Input
              type="text"
              required
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="napr. LETO2025"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">Typ</span>
            <select
              className={selectClass}
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, type: event.target.value as CouponType }))
              }
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">
              Hodnota
              {form.type === 'comp' ? ' (nepoužije se)' : ''}
            </span>
            <Input
              type="number"
              inputMode="numeric"
              value={form.discountValue}
              disabled={form.type === 'comp'}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, discountValue: event.target.value }))
              }
              placeholder={form.type === 'percent' ? '0–100' : ''}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">
              Platnost do
            </span>
            <DatePicker
              value={form.validUntil}
              onChange={(next) => setForm((prev) => ({ ...prev, validUntil: next }))}
              allowClear
              placeholder="Platnost do"
              aria-label="Platnost do"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">
              Max. použití
            </span>
            <Input
              type="number"
              inputMode="numeric"
              value={form.maxUses}
              onChange={(event) => setForm((prev) => ({ ...prev, maxUses: event.target.value }))}
              placeholder="neomezeně"
            />
          </label>

          <div className="flex items-center gap-3 md:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={isPending}>
              {isEditing ? 'Uložit změny' : 'Vytvořit kupón'}
            </Button>
            {isEditing ? (
              <Button type="button" variant="ghost" onClick={resetForm} disabled={isPending}>
                Zrušit úpravu
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {coupons.length === 0 ? (
        <Notice role="status">Zatím nejsou žádné kupóny.</Notice>
      ) : (
        <Card
          as="section"
          className="overflow-hidden border border-[var(--color-border-vychozi)]"
          aria-label="Seznam kupónů"
        >
          <div className="flex items-start justify-between gap-2 px-4 py-3">
            <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
              Seznam kupónů
            </h2>
            <InfoTooltip text="Přehled všech kupónů: kód, typ a hodnota slevy, počet použití (a limit, pokud je nastaven) a stav (aktivní/neaktivní). U každého kupónu můžeš spustit úpravu, deaktivaci nebo smazání." />
          </div>
          <div className="overflow-x-auto">
            <table data-no-row-hover className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-vychozi)] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                  <th className="px-4 py-3 font-medium">Kód</th>
                  <th className="px-4 py-3 font-medium">Typ</th>
                  <th className="px-4 py-3 font-medium">Hodnota</th>
                  <th className="px-4 py-3 font-medium">Použití</th>
                  <th className="px-4 py-3 font-medium">Stav</th>
                  <th className="px-4 py-3 font-medium">Akce</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr
                    key={coupon.id}
                    className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-slate-text)]">
                      {coupon.code}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-slate-text)]">
                      {TYPE_LABELS[coupon.type]}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-slate-text)]">
                      {coupon.discountValue === null ? '—' : coupon.discountValue}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-slate-text)]">
                      {coupon.usedCount}
                      {coupon.maxUses === null ? '' : ` / ${coupon.maxUses}`}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-slate-text)]">
                      {coupon.isActive ? 'Aktivní' : 'Neaktivní'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => startEdit(coupon)}
                          disabled={isPending}
                        >
                          Upravit
                        </Button>
                        {coupon.isActive ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              runAction(
                                () => deactivateCouponAction(coupon.id),
                                'Kupón byl deaktivován.',
                              )
                            }
                            disabled={isPending}
                          >
                            Deaktivovat
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            runAction(() => deleteCouponAction(coupon.id), 'Kupón byl smazán.')
                          }
                          disabled={isPending}
                        >
                          Smazat
                        </Button>
                      </div>
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
