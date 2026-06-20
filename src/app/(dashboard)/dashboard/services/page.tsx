import { Notice } from '@/components/ui/notice';

import { listServices } from './actions';
import { ServicesList } from './ServicesList';

export default async function ServicesPage() {
  const result = await listServices();

  return (
    <div id="seznam-sluzeb" className="flex flex-col gap-6 scroll-mt-20">
      {result.ok ? (
        <ServicesList services={result.services} />
      ) : (
        <Notice role="alert" variant="error">
          {result.message}
        </Notice>
      )}
    </div>
  );
}
