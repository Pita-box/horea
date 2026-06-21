import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { BUSINESS_TYPE_LABELS } from '@/lib/onboarding/business-types';
import {
  parseHoursData,
  parseProfileData,
  parseServicesData,
  parseSlugData,
  parseTypeData,
  validateHours,
  validateProfile,
  validateServices,
  WEEK_DAYS,
  type HoursDraft,
} from '@/lib/onboarding/data';
import { requireOnboardingStep } from '@/lib/onboarding/steps';
import { IconFileText, IconInfoCircle } from '@tabler/icons-react';
import type { Metadata } from 'next';

import { CommitForm } from './CommitForm';

export const metadata: Metadata = {
  title: 'Souhrn onboardingu | Horea',
  description: 'Šestý krok onboarding wizardu Horea.',
};

type MissingStep = {
  step: number;
  label: string;
};

const currencyFormatter = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]';

function getDayLabel(dayOfWeek: number): string {
  return WEEK_DAYS.find((day) => day.dayOfWeek === dayOfWeek)?.label ?? 'Den';
}

/** Seskupí po sobě jdoucí otevřené dny se shodnými časy do rozsahů (např. „Pondělí – Pátek (09:00 – 17:00)"). */
function groupHours(hours: HoursDraft[]): string[] {
  const result: string[] = [];
  let runStart: HoursDraft | null = null;
  let runEnd: HoursDraft | null = null;

  const flush = () => {
    if (!runStart || !runEnd) {
      return;
    }
    const range =
      runStart.dayOfWeek === runEnd.dayOfWeek
        ? getDayLabel(runStart.dayOfWeek)
        : `${getDayLabel(runStart.dayOfWeek)} – ${getDayLabel(runEnd.dayOfWeek)}`;
    result.push(`${range} (${runStart.opensAt} – ${runStart.closesAt})`);
    runStart = null;
    runEnd = null;
  };

  for (const day of WEEK_DAYS) {
    const item = hours.find((h) => h.dayOfWeek === day.dayOfWeek);

    if (item && item.isOpen) {
      if (
        runStart &&
        runEnd &&
        runEnd.dayOfWeek === item.dayOfWeek - 1 &&
        runStart.opensAt === item.opensAt &&
        runStart.closesAt === item.closesAt
      ) {
        runEnd = item;
      } else {
        flush();
        runStart = item;
        runEnd = item;
      }
    } else {
      flush();
    }
  }

  flush();
  return result;
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-[var(--color-border-vychozi)] py-4 last:border-b-0">
      <span className={`text-sm ${mutedClass}`}>{label}</span>
      <div className="text-right font-semibold text-[var(--color-rich-violet)]">{children}</div>
    </div>
  );
}

function MissingStepsNotice({ steps }: { steps: MissingStep[] }) {
  const firstStep = steps[0];

  return (
    <div className="space-y-4">
      <Notice role="alert" variant="error">
        Onboarding draft není kompletní. Doplňte chybějící krok a vraťte se zpět na souhrn.
      </Notice>
      <ul className="space-y-2 text-sm font-medium">
        {steps.map((step) => (
          <li key={step.step}>
            <a className="text-[var(--color-action-violet)]" href={`/onboarding/${step.step}`}>
              Krok {step.step}: {step.label}
            </a>
          </li>
        ))}
      </ul>
      {firstStep ? (
        <a
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-0 text-sm font-normal leading-none text-[var(--color-canvas-white)] transition-colors hover:brightness-95"
          href={`/onboarding/${firstStep.step}`}
        >
          Doplnit krok {firstStep.step}
        </a>
      ) : null}
    </div>
  );
}

export default async function OnboardingSummaryPage() {
  const { draft } = await requireOnboardingStep(6);
  const type = parseTypeData(draft?.type_data ?? null);
  const slug = parseSlugData(draft?.slug_data ?? null);
  const profile = parseProfileData(draft?.profile_data ?? null);
  const services = draft?.services_data ? parseServicesData(draft.services_data) : [];
  const hours = draft?.hours_data ? parseHoursData(draft.hours_data) : [];
  const profileResult = profile ? validateProfile(profile) : null;
  const servicesResult = validateServices(services);
  const hoursResult = hours.length > 0 ? validateHours(hours) : null;
  const missingSteps: MissingStep[] = [];

  if (!type) {
    missingSteps.push({ step: 1, label: 'typ podniku' });
  }

  if (!slug) {
    missingSteps.push({ step: 2, label: 'URL podniku' });
  }

  if (!profileResult?.ok) {
    missingSteps.push({ step: 3, label: 'profil podniku' });
  }

  if (!servicesResult.ok) {
    missingSteps.push({ step: 4, label: 'služby' });
  }

  if (!hoursResult?.ok) {
    missingSteps.push({ step: 5, label: 'otevírací doba' });
  }

  if (!type || !slug || !profileResult?.ok || !servicesResult.ok || !hoursResult?.ok) {
    return (
      <Card
        as="section"
        className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
      >
        <div className="space-y-[var(--element-gap)]">
          <p className="text-sm font-semibold text-[var(--color-action-violet)]">Krok 6</p>
          <h2 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
            Zkontrolujte souhrn
          </h2>
          <p className="text-base leading-7">
            Po potvrzení vznikne neveřejný profil podniku ve stavu free. Publikace přijde až po
            aktivaci předplatného.
          </p>
        </div>

        <MissingStepsNotice steps={missingSteps} />
      </Card>
    );
  }

  const profileData = profileResult.data;
  const hourLines = groupHours(hoursResult.data);

  return (
    <div className="space-y-[var(--section-gap)]">
      <div className="space-y-2 text-center">
        <h2 className="font-[var(--font-polysans)] text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)]">
          Vše je připraveno
        </h2>
        <p className={`mx-auto max-w-md leading-relaxed ${mutedClass}`}>
          Po potvrzení vznikne neveřejný profil podniku ve stavu free. Publikace přijde až po
          aktivaci předplatného.
        </p>
      </div>

      <Card
        as="section"
        className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
      >
        <div className="flex items-center gap-2">
          <IconFileText
            size={22}
            stroke={2}
            aria-hidden="true"
            className="text-[var(--color-action-violet)]"
          />
          <h3 className="text-lg font-semibold text-[var(--color-rich-violet)]">Souhrn údajů</h3>
        </div>

        <div>
          <SummaryRow label="Typ podniku">{BUSINESS_TYPE_LABELS[type.type]}</SummaryRow>
          <SummaryRow label="Název podniku">{profileData.name}</SummaryRow>
          <SummaryRow label="Webová adresa">
            <span className={mutedClass}>horea.cz/</span>
            <span className="text-[var(--color-action-violet)]">{slug.slug}</span>
          </SummaryRow>
          <SummaryRow label="Kontakt">
            <div>{profileData.email}</div>
            <div className={`font-medium ${mutedClass}`}>{profileData.phone}</div>
          </SummaryRow>
          <SummaryRow label="Adresa">
            {profileData.address ? (
              profileData.address
            ) : (
              <span className={`font-medium ${mutedClass}`}>Neuvedeno</span>
            )}
          </SummaryRow>
          <SummaryRow label={servicesResult.data.length > 1 ? 'Služby' : 'Služba'}>
            {servicesResult.data.map((service) => (
              <div key={`${service.name}-${service.durationMinutes}-${service.priceCzk}`}>
                {service.name} ({currencyFormatter.format(service.priceCzk)})
              </div>
            ))}
          </SummaryRow>
          <SummaryRow label="Otevírací doba">
            {hourLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </SummaryRow>
        </div>

        <div className="flex items-start gap-3 rounded-[var(--radius-buttons)] border border-[color-mix(in_srgb,var(--color-aqua-blue)_40%,white)] bg-[color-mix(in_srgb,var(--color-aqua-blue)_12%,white)] p-4">
          <IconInfoCircle
            size={20}
            stroke={2}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--color-action-violet)]"
          />
          <p className="text-sm leading-6 text-[var(--color-slate-text)]">
            Váš profil bude připraven k editaci. Jakmile kliknete na dokončení, získáte přístup do
            administrace vašeho profilu.
          </p>
        </div>

        <CommitForm />
      </Card>
    </div>
  );
}
