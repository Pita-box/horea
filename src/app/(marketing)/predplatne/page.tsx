import type { Metadata } from 'next';

import { LegalToc, type TocItem } from '@/components/landing/LegalToc';

export const metadata: Metadata = {
  title: 'Předplatné a opakované platby | Horea',
  description:
    'Jak funguje automatické měsíční předplatné horea.cz — opakované platby přes GoPay, tokenizace, změny cen, neúspěšné platby a zrušení předplatného.',
};

const TOC: TocItem[] = [
  { id: 'sekce-1', label: 'Jak automatické předplatné funguje' },
  { id: 'sekce-2', label: 'Maximální bezpečnost (tokenizace)' },
  { id: 'sekce-3', label: 'Změna cen nebo parametrů balíčků' },
  { id: 'sekce-4', label: 'Když se platba nepovede' },
  { id: 'sekce-5', label: 'Jak předplatné kdykoli zrušit' },
];

const sectionClass = 'flex scroll-mt-28 flex-col gap-4';
const headingClass =
  'font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-rich-violet)]';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';
const listClass = 'flex list-disc flex-col gap-2 pl-6';

export default function PredplatnePage() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-[48px] md:py-[60px]">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        {/* Postranní obsah */}
        <aside className="lg:sticky lg:top-[104px] lg:w-64 lg:shrink-0">
          <div className="rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-6">
            <LegalToc items={TOC} />
          </div>
        </aside>

        {/* Obsah dokumentu */}
        <article className="flex-1 rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-6 md:p-[48px]">
          <header className="mb-[40px] flex flex-col gap-3">
            <h1 className="font-[var(--font-polysans)] text-[38px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-action-violet)] md:text-[48px]">
              Předplatné
            </h1>
          </header>

          <section className="mb-[40px] flex flex-col gap-4 rounded-[var(--radius-buttons)] bg-[var(--color-soft-gray-fill)] p-6">
            <p>
              Abychom vám ušetřili čas a nemuseli jste každý měsíc ručně zadávat příkazy k úhradě
              nebo hlídat e-maily s fakturami, využívá platforma horea.cz systém automatického
              měsíčního předplatného.
            </p>
            <p>
              Níže naleznete jasné a srozumitelné informace o tom, jak tyto opakované platby fungují,
              jak jsou zabezpečené a jak je můžete spravovat.
            </p>
          </section>

          <div className="flex flex-col gap-[40px]">
            <section id="sekce-1" className={sectionClass}>
              <h2 className={headingClass}>1. Jak automatické předplatné funguje?</h2>
              <ul className={listClass}>
                <li>
                  <strong>Založení služby:</strong> Při první platbě v aplikaci zadáte údaje své
                  platební karty přes zabezpečenou bránu GoPay a zaškrtnutím políčka udělíte souhlas
                  s opakovanou platbou. Tato první platba slouží jako „mateřská“ — ověří vaši kartu a
                  spustí předplatné.
                </li>
                <li>
                  <strong>Automatické strhávání:</strong> Následující platby za váš zvolený balíček
                  (Subscription plan) se již strhávají zcela automaticky, a to vždy v první den
                  nového zúčtovacího období (každých 30 kalendářních dnů).
                </li>
                <li>
                  <strong>Výše částky:</strong> Strhávána je vždy fixní částka podle vašeho aktuálního
                  balíčku, kterou vidíte v nákupním košíku před potvrzením objednávky.
                </li>
              </ul>
            </section>

            <section id="sekce-2" className={sectionClass}>
              <h2 className={headingClass}>2. Maximální bezpečnost (tokenizace)</h2>
              <p>
                Bezpečnost vašich peněz je pro nás prioritou. Horea{' '}
                <strong>nikdy neukládá, nevidí a nezpracovává celá čísla vašich platebních karet</strong>{' '}
                ani žádné citlivé kódy.
              </p>
              <div className="rounded-[var(--radius-buttons)] border-l-4 border-[var(--color-action-violet)] bg-[var(--color-soft-gray-fill)] p-4">
                <p className={mutedClass}>
                  Vše probíhá na pozadí šifrované platební brány GoPay. Ta nám pro účely předplatného
                  poskytuje pouze tzv. „bezpečný platební token“ — unikátní šifrovaný kód, kterým náš
                  systém dává bance pokyn ke stržení předplatného, aniž by kdokoli mohl údaje o kartě
                  zneužít.
                </p>
              </div>
            </section>

            <section id="sekce-3" className={sectionClass}>
              <h2 className={headingClass}>3. Změna cen nebo parametrů balíčků</h2>
              <p>
                Pokud by v budoucnu docházelo ke změně ceny vašeho balíčku nebo úpravě jeho funkcí,
                budeme vás o tom informovat e-mailem <strong>nejméně 15 dní předem</strong>. Nikdy
                vám nestrhneme vyšší částku bez vašeho vědomí. Pokud se změnou nebudete souhlasit,
                máte plné právo předplatné před dalším stržením zrušit.
              </p>
            </section>

            <section id="sekce-4" className={sectionClass}>
              <h2 className={headingClass}>4. Co se stane, když se platba nepovede?</h2>
              <p>
                Pokud na kartě zrovna nebudete mít dostatek peněz, nebo vám platnost karty vyprší, váš
                rezervační systém hned nevypneme.
              </p>
              <ul className={listClass}>
                <li>Systém se pokusí platbu zopakovat (celkem 3× v průběhu jednoho týdne).</li>
                <li>
                  O neúspěšné platbě vás ihned informujeme e-mailem a varovným bannerem v
                  administraci.
                </li>
                <li>
                  V administraci v sekci <em>Fakturace</em> můžete kdykoli jednoduše zadat údaje z
                  nové platební karty, aby vaše rezervační stránka běžela dál bez přerušení.
                </li>
              </ul>
            </section>

            <section id="sekce-5" className={sectionClass}>
              <h2 className={headingClass}>5. Jak předplatné kdykoli zrušit?</h2>
              <p>
                Máte nad svými financemi plnou kontrolu. Nechceme vás držet žádnými skrytými háčky.
              </p>
              <ul className={listClass}>
                <li>
                  <strong>Jednoduché zrušení:</strong> Předplatné můžete kdykoli sami ukončit v
                  Administraci — stačí jít do sekce <em>Fakturace</em> a kliknout na tlačítko „Zrušit
                  předplatné“.
                </li>
                <li>
                  <strong>Dojezd období:</strong> Po zrušení vám rezervační systém zůstane plně
                  aktivní až do konce již zaplaceného měsíčního období. Další platba se již nestrhne a
                  po uplynutí lhůty se účet uzamkne.
                </li>
                <li>
                  <strong>Upozornění:</strong> V souladu s našimi Všeobecnými obchodními podmínkami se
                  již zaplacené předplatné za rozběhnutý měsíc nevrací (uplatňujeme politiku
                  no-refund).
                </li>
              </ul>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
