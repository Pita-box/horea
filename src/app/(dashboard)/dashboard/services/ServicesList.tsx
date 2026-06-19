'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ServiceRecord } from '@/lib/services/types';
import { useState } from 'react';

import { DeleteServiceDialog } from './DeleteServiceDialog';
import { ServiceForm } from './ServiceForm';

type ServicesListProps = {
  services: ServiceRecord[];
};

type FormState = { mode: 'create' } | { mode: 'edit'; service: ServiceRecord } | null;

const priceFormatter = new Intl.NumberFormat('cs-CZ', {
  maximumFractionDigits: 2,
});

function formatPrice(value: number): string {
  return value > 0 ? `${priceFormatter.format(value)} Kč` : '—';
}

export function ServicesList({ services }: ServicesListProps) {
  const [formState, setFormState] = useState<FormState>(null);
  const [deletingService, setDeletingService] = useState<ServiceRecord | null>(null);

  return (
    <div className="space-y-[var(--spacing-16)]">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setFormState({ mode: 'create' })}>
          Přidat službu
        </Button>
      </div>

      {formState ? (
        <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
          <ServiceForm
            service={formState.mode === 'edit' ? formState.service : undefined}
            onClose={() => setFormState(null)}
          />
        </Card>
      ) : null}

      <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        {services.length === 0 ? (
          <div className="space-y-2 text-center">
            <p className="text-base font-semibold text-[var(--color-slate-text)]">
              Zatím nemáte žádné služby.
            </p>
            <p className="text-sm leading-6 text-[var(--color-slate-text)]">
              Přidejte první službu tlačítkem „Přidat službu“.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table data-no-row-hover className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)]">
                  <th className="py-3 pr-4 font-semibold">Název</th>
                  <th className="py-3 pr-4 font-semibold">Trvání (min)</th>
                  <th className="py-3 pr-4 font-semibold">Cena (Kč)</th>
                  <th className="py-3 pr-4 font-semibold">Popis</th>
                  <th className="py-3 font-semibold">Akce</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr
                    key={service.id}
                    className="border-b border-[var(--color-border-vychozi)] align-top last:border-b-0"
                  >
                    <td className="py-3 pr-4 font-medium text-[var(--color-slate-text)]">
                      {service.name}
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-slate-text)]">
                      {service.durationMinutes}
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-slate-text)]">
                      {formatPrice(service.priceCzk)}
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-slate-text)]">
                      {service.description ?? '—'}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setFormState({ mode: 'edit', service })}
                        >
                          Upravit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setDeletingService(service)}
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
        )}
      </Card>

      {deletingService ? (
        <DeleteServiceDialog service={deletingService} onClose={() => setDeletingService(null)} />
      ) : null}
    </div>
  );
}
