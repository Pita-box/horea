'use client';

import { useState } from 'react';

import { Icon } from './Icon';

type FaqItem = {
  question: string;
  answer: string;
};

const DEFAULT_ITEMS: FaqItem[] = [
  {
    question: 'Je potřeba instalovat nějaký program?',
    answer:
      'Ne, Horea běží kompletně ve webovém prohlížeči. Stačí se přihlásit z jakéhokoliv zařízení s připojením k internetu.',
  },
  {
    question: 'Mohu si Horea vyzkoušet zdarma?',
    answer:
      'Ano, nabízíme zkušební období, během kterého si můžete bez závazků vyzkoušet všechny funkce, než si vyberete jeden z tarifů Start, Pokročilý nebo Max.',
  },
  {
    question: 'Jak klienti platí za rezervace?',
    answer:
      'V současné době klienti platí standardně až na místě u vás. V budoucnu plánujeme integraci online platebních bran.',
  },
  {
    question: 'Lze propojit Horea s mým stávajícím webem?',
    answer:
      'Ano, můžete snadno vložit odkaz na rezervační stránku Horea na váš web nebo sociální sítě jako tlačítko „Rezervovat“.',
  },
];

export function FaqAccordion({ items = DEFAULT_ITEMS }: { items?: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-[16px]">
      {items.map((item, index) => {
        const isOpen = index === openIndex;
        return (
          <div
            key={item.question}
            className="overflow-hidden rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)]"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-content-${index}`}
              id={`faq-button-${index}`}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className={[
                'flex min-h-[44px] w-full items-center justify-between gap-[16px] p-6 text-left transition-colors duration-200',
                isOpen
                  ? 'bg-[var(--color-sunset-pink)]'
                  : 'hover:bg-[var(--color-sunset-pink)]',
              ].join(' ')}
            >
              <span className="font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-rich-violet)]">
                {item.question}
              </span>
              <Icon
                name={isOpen ? 'minus' : 'plus'}
                className="h-6 w-6 shrink-0 text-[var(--color-rich-violet)]"
              />
            </button>
            <div
              id={`faq-content-${index}`}
              role="region"
              aria-labelledby={`faq-button-${index}`}
              className={[
                'grid transition-all duration-300 ease-out',
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              ].join(' ')}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-6 pt-4 font-[var(--font-plus-jakarta-sans)]">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
