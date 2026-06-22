'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/DatePicker';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Notice } from '@/components/ui/notice';
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/admin/business-manager';

import {
  forceDeleteBusinessAction,
  grantCompAction,
  grantFreeTrialAction,
  overrideSubscriptionAction,
  resendInvoiceAction,
  suspendBusinessAction,
  type BusinessActionResult,
  type OverrideFormInput,
} from './actions';

/**
 * Interaktivní admin akce v detailu podniku (`/admin/businesses/[id]`, feature
 * `admin-dashboard`, task 17.1). Client komponenta nad server actions:
 * override předplatného (R5.1, R5.2), udělení Free_Trial (R5.3) a Comp_Ucet
 * (R5.4), pozastavení podniku (R5.5), vynucené smazání s explicitním
 * potvrzovacím dialogem (R6.1) a opětovné odeslání poslední faktury (R11.1).
 *
 * Ověření admina, atomicita a auditní zápis žijí v server actions / lib / DB;
 * tato vrstva pouze sbírá vstup, spouští akce a zobrazuje českou hlášku z
 * výsledku. Vynucené smazání je nevratné — provede se teprve po potvrzení v
 * dialogu, který serveru předá `confirmed: true`.
 */

type BusinessActionsProps = {
  businessId: string;
  /** Aktuální tarif předplatného pro předvyplnění override formuláře. */
  currentPlan: SubscriptionPlan | null;
  /** Aktuální stav předplatného pro předvyplnění override formuláře. */
  currentStatus: SubscriptionStatus | null;
  /** Aktuální konec období (ISO) pro předvyplnění override formuláře. */
  currentPeriodEnd: string | null;
};

const PLAN_OPTIONS: ReadonlyArray<{ value: '' | SubscriptionPlan; label: string }> = [
  { value: '', label: 'Bez tarifu (free)' },
  { value: 'start', label: 'Start' },
  { value: 'pokrocily', label: 'Pokročilý' },
  { value: 'max', label: 'Max' },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: SubscriptionStatus; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: 'active', label: 'Aktivní' },
  { value: 'grace_period', label: 'Grace period' },
  { value: 'expired', label: 'Vypršelo' },
  { value: 'deleted_data', label: 'Smazaná data' },
];

const SELECT_CLASS =
  'h-11 w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] text-base leading-[1.1] text-[var(--color-slate-text)] outline-none transition-colors focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)]';

const ACTION_BUTTON_CLASS = 'min-h-[44px]';

/** Jednoduchý modální rám konzistentní s ostatními dialogy v aplikaci. */
function Modal({
  titleId,
  title,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,22,76,0.72)] px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-[480px] flex-col gap-[var(--spacing-16)] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] text-[var(--color-slate-text)]"
      >
        <h2
          id={titleId}
          className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]"
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function toDateInputValue(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

export function BusinessActions({
  businessId,
  currentPlan,
  currentStatus,
  currentPeriodEnd,
}: BusinessActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [overrideForm, setOverrideForm] = useState<OverrideFormInput>({
    plan: currentPlan ?? '',
    status: currentStatus ?? 'active',
    currentPeriodEnd: toDateInputValue(currentPeriodEnd),
  });
  const [trialEnd, setTrialEnd] = useState('');

  function runAction(action: () => Promise<BusinessActionResult>, okMessage: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setSuccess(okMessage);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleOverrideSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runAction(
      () => overrideSubscriptionAction(businessId, overrideForm),
      'Předplatné bylo upraveno.',
    );
  }

  function handleFreeTrialSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runAction(
      () => grantFreeTrialAction(businessId, trialEnd),
      'Zkušební období bylo uděleno.',
    );
  }

  function handleForceDelete() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await forceDeleteBusinessAction(businessId);
      if (result.ok) {
        setConfirmDelete(false);
        router.push('/admin/businesses');
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card
      as="section"
      className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
      aria-label="Administrátorské akce"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            Administrátorské akce
          </h2>
          <InfoTooltip text="Citlivé administrátorské akce nad podnikem a jeho předplatným: úprava předplatného, zkušební období, comp účet, pozastavení, opětovné odeslání faktury a vynucené smazání. Každá akce se zapisuje do auditní stopy." />
        </div>
        <p className="text-sm leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Citlivé akce nad podnikem a jeho předplatným. Každá akce je zaznamenána do
          auditní stopy.
        </p>
      </div>

      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}
      {success ? <Notice role="status">{success}</Notice> : null}

      {/* Override předplatného (R5.1, R5.2). */}
      <form
        onSubmit={handleOverrideSubmit}
        className="space-y-4 border-t border-[var(--color-border-vychozi)] pt-6"
        aria-label="Úprava předplatného"
      >
        <h3 className="text-base font-semibold text-[var(--color-rich-violet)]">
          Úprava předplatného
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">Tarif</span>
            <select
              className={SELECT_CLASS}
              value={overrideForm.plan}
              onChange={(event) => {
                const nextPlan = event.target.value as '' | SubscriptionPlan;
                setOverrideForm((prev) => ({
                  ...prev,
                  plan: nextPlan,
                  // Provázání tarif → stav: udělení placeného tarifu na účtu ve
                  // stavu „free" účet aktivuje (jinak by zůstal Neplacené/Free
                  // i s tarifem). Zrušení tarifu (bez tarifu) vrací na „free".
                  // Jiný než „free" stav (grace/expired/…) se nepřepisuje —
                  // admin ho může nastavit ručně.
                  status:
                    nextPlan === ''
                      ? 'free'
                      : prev.status === 'free'
                        ? 'active'
                        : prev.status,
                }));
              }}
            >
              {PLAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">Stav</span>
            <select
              className={SELECT_CLASS}
              value={overrideForm.status}
              onChange={(event) =>
                setOverrideForm((prev) => ({
                  ...prev,
                  status: event.target.value as SubscriptionStatus,
                }))
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">
              Konec období
            </span>
            <DatePicker
              value={overrideForm.currentPeriodEnd}
              onChange={(next) =>
                setOverrideForm((prev) => ({ ...prev, currentPeriodEnd: next }))
              }
              allowClear
              placeholder="Konec období"
              aria-label="Konec období"
            />
          </label>
        </div>
        <Button type="submit" className={ACTION_BUTTON_CLASS} disabled={isPending}>
          Uložit předplatné
        </Button>
      </form>

      {/* Free_Trial (R5.3). */}
      <form
        onSubmit={handleFreeTrialSubmit}
        className="space-y-4 border-t border-[var(--color-border-vychozi)] pt-6"
        aria-label="Udělení zkušebního období"
      >
        <h3 className="text-base font-semibold text-[var(--color-rich-violet)]">
          Zkušební období (Free Trial)
        </h3>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-2 sm:max-w-xs">
            <span className="text-sm font-medium text-[var(--color-slate-text)]">
              Konec zkušebního období
            </span>
            <DatePicker
              value={trialEnd}
              onChange={setTrialEnd}
              placeholder="Konec zkušebního období"
              aria-label="Konec zkušebního období"
            />
          </label>
          <Button type="submit" className={ACTION_BUTTON_CLASS} disabled={isPending}>
            Udělit zkušební období
          </Button>
        </div>
      </form>

      {/* Comp_Ucet (R5.4). */}
      <div className="space-y-4 border-t border-[var(--color-border-vychozi)] pt-6">
        <h3 className="text-base font-semibold text-[var(--color-rich-violet)]">Comp účet</h3>
        <p className="text-sm leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Trvale aktivní účet bez plateb a bez automatického obnovení.
        </p>
        <Button
          type="button"
          variant="ghost"
          className={ACTION_BUTTON_CLASS}
          disabled={isPending}
          onClick={() => runAction(() => grantCompAction(businessId), 'Comp účet byl udělen.')}
        >
          Udělit comp účet
        </Button>
      </div>

      {/* Pozastavení (R5.5). */}
      <div className="space-y-4 border-t border-[var(--color-border-vychozi)] pt-6">
        <h3 className="text-base font-semibold text-[var(--color-rich-violet)]">
          Pozastavení podniku
        </h3>
        <p className="text-sm leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Skryje podnik z veřejnosti (nastaví jej jako nepublikovaný).
        </p>
        <Button
          type="button"
          variant="ghost"
          className={ACTION_BUTTON_CLASS}
          disabled={isPending}
          onClick={() =>
            runAction(() => suspendBusinessAction(businessId), 'Podnik byl pozastaven.')
          }
        >
          Pozastavit podnik
        </Button>
      </div>

      {/* Opětovné odeslání faktury (R11.1). */}
      <div className="space-y-4 border-t border-[var(--color-border-vychozi)] pt-6">
        <h3 className="text-base font-semibold text-[var(--color-rich-violet)]">
          Opětovné odeslání faktury
        </h3>
        <p className="text-sm leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Znovu odešle nejnovější zaplacenou fakturu na e-mail vlastníka.
        </p>
        <Button
          type="button"
          variant="ghost"
          className={ACTION_BUTTON_CLASS}
          disabled={isPending}
          onClick={() =>
            runAction(() => resendInvoiceAction(businessId), 'Faktura byla odeslána.')
          }
        >
          Znovu odeslat fakturu
        </Button>
      </div>

      {/* Vynucené smazání (R6.1) — nevratné, s potvrzovacím dialogem. */}
      <div className="space-y-4 border-t border-[color-mix(in_srgb,var(--color-neon-pink)_35%,white)] pt-6">
        <h3 className="text-base font-semibold text-[var(--color-rich-violet)]">
          Vynucené smazání podniku
        </h3>
        <p className="text-sm leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Nevratně smaže tenant data podniku (profil, služby, otevírací doby,
          rezervace, klienty). Historie plateb a předplatného zůstává zachována.
        </p>
        <Button
          type="button"
          variant="ghost"
          className={`${ACTION_BUTTON_CLASS} border-[color-mix(in_srgb,var(--color-neon-pink)_45%,white)] text-[var(--color-neon-pink)]`}
          disabled={isPending}
          onClick={() => {
            setError(null);
            setSuccess(null);
            setConfirmDelete(true);
          }}
        >
          Vynuceně smazat podnik
        </Button>
      </div>

      {confirmDelete ? (
        <Modal
          titleId="force-delete-title"
          title="Vynuceně smazat podnik?"
          onClose={() => setConfirmDelete(false)}
        >
          <p className="text-sm leading-6">
            Tato akce je <strong>nevratná</strong>. Veškerá tenant data podniku budou
            trvale odstraněna. Historie plateb a předplatného zůstane zachována pro
            účetní účely.
          </p>
          {error ? (
            <Notice role="alert" variant="error">
              {error}
            </Notice>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className={`${ACTION_BUTTON_CLASS} w-full sm:w-auto`}
              onClick={() => setConfirmDelete(false)}
              disabled={isPending}
            >
              Zrušit
            </Button>
            <Button
              type="button"
              className={`${ACTION_BUTTON_CLASS} w-full bg-[var(--color-neon-pink)] sm:w-auto`}
              onClick={handleForceDelete}
              disabled={isPending}
            >
              {isPending ? 'Mažu…' : 'Trvale smazat'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
