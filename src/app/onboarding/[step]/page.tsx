import { getDraft } from '@/lib/onboarding/draft';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { notFound, redirect } from 'next/navigation';

const STEP_COUNT = 6;

type OnboardingStepPageProps = {
  params: Promise<{
    step: string;
  }>;
};

function parseStep(value: string): number | null {
  const step = Number(value);

  if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
    return null;
  }

  return step;
}

function getAllowedStep(currentStep: number | null | undefined): number {
  if (typeof currentStep !== 'number') {
    return 1;
  }

  return Math.min(currentStep + 1, STEP_COUNT);
}

export default async function OnboardingStepPage({ params }: OnboardingStepPageProps) {
  const { step: rawStep } = await params;
  const step = parseStep(rawStep);

  if (!step) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const draft = await getDraft(user.id);
  const allowedStep = getAllowedStep(draft?.current_step);

  if (step > allowedStep) {
    redirect(`/onboarding/${allowedStep}`);
  }

  return (
    <Card
      as="section"
      className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
    >
      <p className="text-sm font-semibold text-[var(--color-action-violet)]">Krok {step}</p>
      <h2 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
        Připravujeme váš podnik
      </h2>
      <p className="text-base leading-7">
        Tento krok je připravený pro napojení formuláře. Rozpracovaný stav se bude ukládat do vašeho
        onboarding draftu.
      </p>
    </Card>
  );
}
