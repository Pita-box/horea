import type { Metadata } from 'next';
import Link from 'next/link';

import { FaqAccordion } from '@/components/landing/FaqAccordion';
import { FeatureTabs } from '@/components/landing/FeatureTabs';
import { Icon, type IconName } from '@/components/landing/Icon';

export const metadata: Metadata = {
  title: 'Horea | Rezervační systém pro malé podniky',
  description:
    'Vytvořte si profesionální rezervační profil během několika minut. Ideální pro kadeřnictví, kosmetické salony a malá bistra.',
};

const WHY_CARDS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'timer',
    title: 'Online profil za pár minut',
    body: 'Nastavení vašeho rezervačního profilu je otázkou chvilky. Nepotřebujete žádné IT znalosti, stačí vyplnit základní údaje a můžete přijímat první klienty.',
  },
  {
    icon: 'user',
    title: 'Bez registrace pro klienty',
    body: 'Vaši zákazníci si mohou zarezervovat termín ihned, bez zdlouhavého vytváření účtu. Zvyšuje to konverzi a spokojenost s rezervačním procesem.',
  },
  {
    icon: 'grid',
    title: 'Vše na jednom méstě',
    body: 'Získejte dokonalý přehled o celém svém podnikání. Kromě přijímání schůzek získáte např. podrobné statistiky, chytrou správu zaměstnanců, evidenci tržeb a databázi potenciálních klientů...',
  },
];

const BUSINESS_TYPES: {
  icon: IconName;
  label: string;
  circleClass: string;
  iconClass: string;
}[] = [
  {
    icon: 'scissors',
    label: 'Kadeřnictví',
    circleClass: 'bg-[color-mix(in_srgb,var(--color-air-blue)_20%,white)]',
    iconClass: 'text-[var(--color-aqua-blue)]',
  },
  {
    icon: 'hand',
    label: 'Nehtová studia',
    circleClass: 'bg-[color-mix(in_srgb,var(--color-sunset-pink)_20%,white)]',
    iconClass: 'text-[var(--color-neon-pink)]',
  },
  {
    icon: 'leaf',
    label: 'Masážní salóny',
    circleClass: 'bg-[color-mix(in_srgb,var(--color-lush-green)_30%,white)]',
    iconClass: 'text-[var(--color-rich-violet)]',
  },
  {
    icon: 'restaurant',
    label: 'Bistra',
    circleClass: 'bg-[color-mix(in_srgb,var(--color-action-violet)_20%,white)]',
    iconClass: 'text-[var(--color-action-violet)]',
  },
  {
    icon: 'droplet',
    label: 'Spa',
    circleClass: 'bg-[color-mix(in_srgb,var(--color-air-blue)_20%,white)]',
    iconClass: 'text-[var(--color-aqua-blue)]',
  },
  {
    icon: 'sparkles',
    label: 'Ostatní',
    circleClass: 'bg-[color-mix(in_srgb,var(--color-sunset-pink)_20%,white)]',
    iconClass: 'text-[var(--color-neon-pink)]',
  },
];

const STATS: { icon: IconName; title: string; caption: string }[] = [
  {
    icon: 'hourglass',
    title: 'Více času na práci',
    caption: 'Automatizace šetří hodiny týdně.',
  },
  {
    icon: 'calendar-check',
    title: 'Žádné ztracené rezervace',
    caption: 'Přijímejte objednávky 24/7.',
  },
];

const headingClass =
  'font-[var(--font-polysans)] text-[38px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-rich-violet)]';
const mutedTextClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-[100px] px-[16px] py-[48px] md:px-10 md:py-[100px]">
        {/* 1. Hero */}
        <section
          id="domu"
          className="mx-auto flex max-w-4xl scroll-mt-24 flex-col items-center gap-6 text-center"
        >
          <h1 className="font-[var(--font-polysans)] text-[44px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)] md:text-[68px]">
            Rezervační systém, který pracuje za vás
          </h1>
          <p className={`max-w-2xl font-[var(--font-plus-jakarta-sans)] text-xl ${mutedTextClass}`}>
            Vytvořte si profesionální rezervační profil během několika minut. Ideální pro
            kadeřnictví, kosmetické salony a malá bistra. Začněte přijímat rezervace online a získejte
            více času na svou práci.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-[16px]">
            <Link
              href="/register"
              className="flex min-h-[44px] items-center gap-[5px] rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-[32px] py-[16px] font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-canvas-white)] shadow-sm transition-opacity hover:opacity-90"
            >
              Vyzkoušet zdarma
              <Icon name="arrow-right" className="h-6 w-6" />
            </Link>
            <a
              href="#funkce"
              className="flex min-h-[44px] items-center rounded-[var(--radius-buttons)] bg-[var(--color-lush-green)] px-[32px] py-[16px] font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-electric-green)]"
            >
              Jak to funguje?
            </a>
          </div>

          {/* Hero vizuál — stylový placeholder blok v rámci tokenů (žádný externí obrázek) */}
          <div
            className="relative mt-[48px] flex aspect-video w-full max-w-5xl items-center justify-center overflow-hidden rounded-[40px] border border-[var(--color-border-vychozi)] bg-gradient-to-br from-[color-mix(in_srgb,var(--color-action-violet)_18%,white)] via-[var(--color-canvas-white)] to-[color-mix(in_srgb,var(--color-sunset-pink)_22%,white)] shadow-sm"
            aria-hidden="true"
          >
            <Icon
              name="calendar-check"
              className="h-[96px] w-[96px] text-[var(--color-action-violet)] opacity-80"
            />
          </div>
        </section>

        {/* 2. Proč si vybrat Horea? */}
        <section id="vyhody" className="flex scroll-mt-24 flex-col gap-[48px]">
          <div className="text-center">
            <h2 className={headingClass}>Proč si vybrat Horea?</h2>
            <p className={`mt-2 font-[var(--font-plus-jakarta-sans)] text-lg ${mutedTextClass}`}>
              Jednoduchost a efektivita pro váš podnik.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-[var(--section-gap)] md:grid-cols-3">
            {WHY_CARDS.map((card) => (
              <article
                key={card.title}
                className="flex flex-col gap-[16px] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)]"
              >
                <div className="flex h-[48px] w-[48px] items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-cloud-mist)] text-[var(--color-action-violet)]">
                  <Icon name={card.icon} className="h-7 w-7" />
                </div>
                <h3 className="font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-rich-violet)]">
                  {card.title}
                </h3>
                <p className={`font-[var(--font-plus-jakarta-sans)] text-base ${mutedTextClass}`}>
                  {card.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* 3. Interaktivní funkce (taby) */}
        <section
          id="funkce"
          className="flex scroll-mt-24 flex-col gap-[48px] rounded-[40px] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] shadow-sm md:p-[48px]"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h2 className={headingClass}>Ušetřete čas díky chytré správě podnikání</h2>
            <p className={`mt-2 font-[var(--font-plus-jakarta-sans)] text-lg ${mutedTextClass}`}>
              Všechny nástroje, které potřebujete k růstu, na jednom místě.
            </p>
          </div>
          <FeatureTabs />
        </section>

        {/* 4. Pro jaké obory? */}
        <section id="obory" className="flex scroll-mt-24 flex-col gap-[48px]">
          <div className="text-center">
            <h2 className={headingClass}>Pro jaké obory?</h2>
            <p className={`mt-2 font-[var(--font-plus-jakarta-sans)] text-lg ${mutedTextClass}`}>
              Horea se přizpůsobí potřebám vašeho podnikání.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-[16px] md:grid-cols-3 lg:grid-cols-6">
            {BUSINESS_TYPES.map((type) => (
              <div
                key={type.label}
                className="flex flex-col items-center gap-[16px] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-6 text-center transition-shadow hover:shadow-md"
              >
                <div
                  className={`flex h-[64px] w-[64px] items-center justify-center rounded-full ${type.circleClass} ${type.iconClass}`}
                >
                  <Icon name={type.icon} className="h-7 w-7" />
                </div>
                <span className="font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-rich-violet)]">
                  {type.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Statistiky / soustřeďte se na důležité */}
        <section className="flex flex-col items-center justify-between gap-6 rounded-[40px] border border-[var(--color-border-vychozi)] bg-[var(--color-soft-gray-fill)] p-[var(--card-padding)] md:flex-row md:p-[48px]">
          <div className="flex-1 space-y-[16px]">
            <h2 className={headingClass}>Soustřeďte se na to důležité</h2>
            <p className={`font-[var(--font-plus-jakarta-sans)] text-xl ${mutedTextClass}`}>
              Nechte administrativu na nás. S Horea získáte zpět čas, který můžete věnovat svým
              klientům nebo rozvoji podnikání.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-[16px] sm:grid-cols-2">
            {STATS.map((stat) => (
              <div
                key={stat.title}
                className="flex flex-col gap-2 rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-6"
              >
                <Icon name={stat.icon} className="h-9 w-9 text-[var(--color-action-violet)]" />
                <h3 className="font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-rich-violet)]">
                  {stat.title}
                </h3>
                <p className={`font-[var(--font-plus-jakarta-sans)] text-sm ${mutedTextClass}`}>
                  {stat.caption}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Ceník */}
        <section id="cenik" className="flex scroll-mt-24 flex-col gap-[48px]">
          <div className="text-center">
            <h2 className={headingClass}>Ceník</h2>
            <p className={`mt-2 font-[var(--font-plus-jakarta-sans)] text-lg ${mutedTextClass}`}>
              Jednoduché a transparentní ceny pro každý podnik.
            </p>
          </div>
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
            {/* Tarif Start */}
            <div className="flex flex-col gap-6 rounded-[var(--radius-cards)] border-2 border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] transition-colors hover:border-[var(--color-air-blue)]">
              <div className="flex flex-col gap-2">
                <span className="font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-aqua-blue)]">
                  Start
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-[var(--font-polysans)] text-[38px] font-semibold tracking-[-0.02em] text-[var(--color-rich-violet)]">
                    199 Kč
                  </span>
                  <span className={`font-[var(--font-plus-jakarta-sans)] text-base ${mutedTextClass}`}>
                    / měsíc
                  </span>
                </div>
                <p className={`font-[var(--font-plus-jakarta-sans)] text-base ${mutedTextClass}`}>
                  Pro jednotlivce a začínající podniky.
                </p>
              </div>
              <ul className="flex flex-grow flex-col gap-[16px]">
                {['1 uživatel', 'Základní rezervační stránka', 'Omezený počet rezervací'].map(
                  (feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Icon
                        name="check-circle"
                        className="h-6 w-6 shrink-0 text-[var(--color-aqua-blue)]"
                      />
                      <span className="font-[var(--font-plus-jakarta-sans)] text-base text-[var(--color-slate-text)]">
                        {feature}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <Link
                href="/register"
                className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-buttons)] border-2 border-[var(--color-aqua-blue)] py-[16px] font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-aqua-blue)] transition-colors hover:bg-[var(--color-aqua-blue)] hover:text-[var(--color-rich-violet)]"
              >
                Zvolit Start
              </Link>
            </div>

            {/* Tarif Pokročilý (zvýrazněný) */}
            <div className="relative flex flex-col gap-6 rounded-[var(--radius-cards)] border-2 border-[var(--color-action-violet)] bg-[var(--color-action-violet)] p-[var(--card-padding)] shadow-lg md:-translate-y-[16px]">
              <div className="absolute -top-[16px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--color-lush-green)] px-[16px] py-1 font-[var(--font-plus-jakarta-sans)] text-sm font-bold text-[var(--color-rich-violet)]">
                Nejoblíbenější
              </div>
              <div className="flex flex-col gap-2 text-[var(--color-canvas-white)]">
                <span className="font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-lush-green)]">
                  Pokročilý
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-[var(--font-polysans)] text-[38px] font-semibold tracking-[-0.02em]">
                    299 Kč
                  </span>
                  <span className="font-[var(--font-plus-jakarta-sans)] text-base opacity-80">
                    / měsíc
                  </span>
                </div>
                <p className="font-[var(--font-plus-jakarta-sans)] text-base opacity-90">
                  Ideální pro rostoucí salony a studia.
                </p>
              </div>
              <ul className="flex flex-grow flex-col gap-[16px] text-[var(--color-canvas-white)]">
                {['Až 3 uživatelé', 'Neomezené rezervace', 'Vlastní doména', 'SMS upozornění'].map(
                  (feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Icon
                        name="check-circle"
                        className="h-6 w-6 shrink-0 text-[var(--color-lush-green)]"
                      />
                      <span className="font-[var(--font-plus-jakarta-sans)] text-base">
                        {feature}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <Link
                href="/register"
                className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-lush-green)] py-[16px] font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-rich-violet)] transition-opacity hover:opacity-90"
              >
                Zvolit Pokročilý
              </Link>
            </div>

            {/* Tarif Max */}
            <div className="flex flex-col gap-6 rounded-[var(--radius-cards)] border-2 border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] transition-colors hover:border-[var(--color-neon-pink)]">
              <div className="flex flex-col gap-2">
                <span className="font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-neon-pink)]">
                  Max
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="font-[var(--font-polysans)] text-[38px] font-semibold tracking-[-0.02em] text-[var(--color-rich-violet)]">
                    599 Kč
                  </span>
                  <span className={`font-[var(--font-plus-jakarta-sans)] text-base ${mutedTextClass}`}>
                    / měsíc
                  </span>
                </div>
                <p className={`font-[var(--font-plus-jakarta-sans)] text-base ${mutedTextClass}`}>
                  Pro větší týmy a náročné provozy.
                </p>
              </div>
              <ul className="flex flex-grow flex-col gap-[16px]">
                {['Neomezeně uživatelů', 'Pokročilé statistiky', 'API přístup', 'Prioritní podpora'].map(
                  (feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <Icon
                        name="check-circle"
                        className="h-6 w-6 shrink-0 text-[var(--color-neon-pink)]"
                      />
                      <span className="font-[var(--font-plus-jakarta-sans)] text-base text-[var(--color-slate-text)]">
                        {feature}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <Link
                href="/register"
                className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-buttons)] border-2 border-[var(--color-neon-pink)] py-[16px] font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-neon-pink)] transition-colors hover:bg-[var(--color-neon-pink)] hover:text-[var(--color-canvas-white)]"
              >
                Zvolit Max
              </Link>
            </div>
          </div>
        </section>

        {/* 7. FAQ */}
        <section id="faq" className="mx-auto flex w-full max-w-3xl scroll-mt-24 flex-col gap-[48px]">
          <div className="text-center">
            <h2 className={headingClass}>Často kladené otázky</h2>
          </div>
          <FaqAccordion />
        </section>

        {/* 8. Finální CTA */}
        <section className="flex flex-col items-center gap-6 rounded-[40px] bg-gradient-to-r from-[var(--color-action-violet)] to-[var(--color-sunset-pink)] p-[var(--card-padding)] text-center shadow-md md:p-[100px]">
          <h2 className="font-[var(--font-polysans)] text-[38px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-canvas-white)]">
            Jste připraveni posunout svůj podnik dál?
          </h2>
          <p className="max-w-2xl font-[var(--font-plus-jakarta-sans)] text-xl text-[color-mix(in_srgb,var(--color-canvas-white)_90%,transparent)]">
            Připojte se ke stovkám spokojených podnikatelů, kteří již šetří čas a získávají více
            klientů díky Horea.
          </p>
          <div className="mt-2">
            <Link
              href="/register"
              className="inline-flex min-h-[44px] items-center gap-[5px] rounded-[var(--radius-buttons)] bg-[var(--color-canvas-white)] px-10 py-5 font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-action-violet)] shadow-sm transition-colors hover:bg-[var(--color-cloud-mist)]"
            >
              Založit účet zdarma
              <Icon name="rocket" className="h-6 w-6" />
            </Link>
          </div>
        </section>
      </main>
  );
}
