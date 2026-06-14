import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';

import { getSettings } from './actions';
import { getProfileImages, getProfileInfo, getSocialLinks } from './profile-actions';
import { ProfileImagesForm } from './ProfileImagesForm';
import { ProfileInfoForm } from './ProfileInfoForm';
import { SocialLinksForm } from './SocialLinksForm';
import { SettingsForm } from './SettingsForm';

export default async function SettingsPage() {
  const result = await getSettings();
  const info = await getProfileInfo();
  const images = await getProfileImages();
  const social = await getSocialLinks();

  return (
    <div className="flex flex-col gap-6">
      {info.ok ? (
        <Card
          as="section"
          className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        >
          <ProfileInfoForm initialInfo={info.info} />
        </Card>
      ) : null}

      {images.ok ? (
        <Card
          as="section"
          className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        >
          <ProfileImagesForm initialImages={images.images} businessName={images.businessName} />
        </Card>
      ) : null}

      {social.ok ? (
        <Card
          as="section"
          className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        >
          <SocialLinksForm initialLinks={social.links} />
        </Card>
      ) : null}

      {result.ok ? (
        <Card
          as="section"
          className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        >
          <SettingsForm initialSettings={result.settings} />
        </Card>
      ) : (
        <Notice role="alert" variant="error">
          {result.message}
        </Notice>
      )}
    </div>
  );
}
