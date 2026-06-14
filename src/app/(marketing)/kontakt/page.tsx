import { IconMail, IconMapPin, IconPhone } from '@tabler/icons-react';
import type { Metadata } from 'next';

import { ContactForm } from '@/components/landing/ContactForm';
import { FaqAccordion } from '@/components/landing/FaqAccordion';

export const metadata: Metadata = {
  title: 'Kontaktní údaje a podpora | Horea',
  description:
    'Spojte se s podporou Horea — e-mail, telefon, adresa sídla, kontaktní formulář a často kladené otázky.',
};

const cardClass =
  'flex flex-col gap-[24px] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)]';
const cardHeadingClass =
  'font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-rich-violet)]';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

const CONTACT_FAQ = [
  {
    question: 'Jak mohu změnit svůj tarif?',
    answer:
      'Tarif lze změnit kdykoliv ve vašem dashboardu v sekci „Předplatné“. Změna se projeví podle pravidel zvoleného tarifu.',
  },
  {
    question: 'Je potřeba instalovat nějaký program?',
    answer:
      'Ne, Horea běží kompletně ve webovém prohlížeči. Stačí se přihlásit z jakéhokoliv zařízení s připojením k internetu.',
  },
  {
    question: 'Nabízíte vrácení peněz?',
    answer:
      'Za již zaplacené měsíční předplatné refundace neposkytujeme — služba je digitální plnění v režimu B2B. Předplatné však můžete kdykoliv zrušit a na další měsíc se vám již nestrhne. Pro vyzkoušení slouží zkušební období.',
  },
  {
    question: 'Jak propojím Horea s vlastním webem?',
    answer:
      'Na svůj web nebo sociální sítě můžete vložit odkaz na rezervační stránku Horea, případně samotný rezervační formulář pomocí embed widgetu.',
  },
];

const CONTACT_METHODS = [
  {
    icon: IconMail,
    label: 'Emailová podpora',
    value: 'info@horea.cz',
    href: 'mailto:info@horea.cz',
  },
  {
    icon: IconPhone,
    label: 'Telefonická podpora (Po–Pá, 9–17)',
    value: '+420 704 344 177',
    href: 'tel:+420704344177',
  },
  {
    icon: IconMapPin,
    label: 'Adresa sídla',
    value: 'Tatarkova 24, 149 00 Praha',
    href: null,
  },
] as const;

export default function KontaktPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-[48px] md:py-[60px]">
      {/* Hero */}
      <header className="mx-auto mb-[40px] flex max-w-2xl flex-col items-center gap-4 text-center">
        <h1 className="font-[var(--font-polysans)] text-[38px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)] md:text-[58px]">
          Jak vám můžeme pomoci?
        </h1>
        <p className={`font-[var(--font-plus-jakarta-sans)] text-xl ${mutedClass}`}>
          Jsme tu pro vás. Vyberte si způsob, jakým nás chcete kontaktovat, nebo si prohlédněte často
          kladené otázky.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-[var(--section-gap)] lg:grid-cols-12">
        {/* Levý sloupec — kontakt + formulář */}
        <div className="flex flex-col gap-[var(--section-gap)] lg:col-span-5">
          <section className={cardClass}>
            <h2 className={cardHeadingClass}>Kontaktní údaje</h2>
            <div className="flex flex-col gap-[16px]">
              {CONTACT_METHODS.map(({ icon: Icon, label, value, href }) => (
                <div
                  key={label}
                  className="flex items-center gap-[16px] rounded-[var(--radius-buttons)] bg-[var(--color-cloud-mist)] p-4"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-canvas-white)] text-[var(--color-action-violet)]">
                    <Icon size={22} stroke={2} aria-hidden="true" />
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-[var(--font-plus-jakarta-sans)] text-sm ${mutedClass}`}>
                      {label}
                    </span>
                    {href ? (
                      <a
                        href={href}
                        className="font-[var(--font-plus-jakarta-sans)] text-lg font-semibold text-[var(--color-action-violet)] transition-colors hover:opacity-80"
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="font-[var(--font-plus-jakarta-sans)] text-lg font-semibold text-[var(--color-rich-violet)]">
                        {value}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className={cardHeadingClass}>Napište nám</h2>
            <ContactForm />
          </section>
        </div>

        {/* Pravý sloupec — FAQ */}
        <div className="flex flex-col gap-[var(--section-gap)] lg:col-span-7">
          <section className={cardClass}>
            <h2 className={cardHeadingClass}>Často kladené otázky</h2>
            <FaqAccordion items={CONTACT_FAQ} />
          </section>

          <section className={cardClass}>
            <h2 className={cardHeadingClass}>Provozovatel platformy horea.cz</h2>
            <div className="flex flex-col gap-3">
              <p className="font-semibold text-[var(--color-rich-violet)]">Petr Mai – Horea</p>
              <div className={`flex flex-col gap-1 font-[var(--font-plus-jakarta-sans)] ${mutedClass}`}>
                <p>Sídlo: Tatarkova 24, Praha Háje, 149 00</p>
                <p>IČO: 17384605</p>
                <p>
                  Podnikatel je zapsán v živnostenském rejstříku vedeném Úřadem městské části Praha
                  11.
                </p>
              </div>
              <div className="flex flex-col gap-1 font-[var(--font-plus-jakarta-sans)]">
                <p className={mutedClass}>
                  E-mail:{' '}
                  <a
                    href="mailto:info@horea.cz"
                    className="font-semibold text-[var(--color-action-violet)] hover:opacity-80"
                  >
                    info@horea.cz
                  </a>
                </p>
                <p className={mutedClass}>
                  Telefon:{' '}
                  <a
                    href="tel:+420704344177"
                    className="font-semibold text-[var(--color-action-violet)] hover:opacity-80"
                  >
                    +420 704 344 177
                  </a>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
