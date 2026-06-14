import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';

import { listOpeningHours } from './actions';
import { OpeningHoursForm } from './OpeningHoursForm';

export default async function OpeningHoursPage() {
  const result = await listOpeningHours();

  return (
    <div className="flex flex-col gap-6">
      {result.ok ? (
        <Card
          as="section"
          className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        >
          <OpeningHoursForm initialWeek={result.week} />
        </Card>
      ) : (
        <Notice role="alert" variant="error">
          {result.message}
        </Notice>
      )}
    </div>
  );
}
