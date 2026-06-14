import { Card } from '@/components/ui/card';
import { parseProfileData, parseSlugData, type ProfileDraft } from '@/lib/onboarding/data';
import { requireOnboardingStep } from '@/lib/onboarding/steps';
import type { Metadata } from 'next';

import { ProfileForm } from './ProfileForm';

export const metadata: Metadata = {
  title: 'Profil podniku | Horea',
  description: 'Třetí krok onboarding wizardu Horea.',
};

const EMPTY_PROFILE: ProfileDraft = {
  name: '',
  description: '',
  phone: '',
  email: '',
  address: '',
};

export default async function OnboardingProfilePage() {
  const { draft } = await requireOnboardingStep(3);
  const profileData = parseProfileData(draft?.profile_data ?? null);
  const slugData = parseSlugData(draft?.slug_data ?? null);
  const initialProfile = {
    ...EMPTY_PROFILE,
    ...profileData,
    name: profileData?.name || slugData?.businessName || '',
  };

  return (
    <Card
      as="section"
      className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
    >
      <div className="space-y-[var(--element-gap)]">
        <p className="text-sm font-semibold text-[var(--color-action-violet)]">Krok 3</p>
        <h2 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
          Doplňte profil
        </h2>
        <p className="text-base leading-7">
          Tyto údaje se zobrazí klientům na veřejné stránce podniku po aktivaci předplatného.
        </p>
      </div>

      <ProfileForm initialProfile={initialProfile} />
    </Card>
  );
}
