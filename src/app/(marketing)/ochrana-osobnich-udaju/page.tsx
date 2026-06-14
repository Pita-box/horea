import type { Metadata } from 'next';

import { LegalToc, type TocItem } from '@/components/landing/LegalToc';

export const metadata: Metadata = {
  title: 'Zásady ochrany osobních údajů | Horea',
  description:
    'Zásady ochrany osobních údajů platformy horea.cz — jak zpracováváme údaje Partnerů (GDPR), role správce/zpracovatel, práva subjektů údajů a zabezpečení.',
};

/** Datum účinnosti zobrazené v záhlaví i v závěrečných ustanoveních. */
const EFFECTIVE_DATE = '9. června 2026';

const TOC: TocItem[] = [
  { id: 'sekce-1', label: 'Základní informace' },
  { id: 'sekce-2', label: 'Rozsah a účel zpracování' },
  { id: 'sekce-3', label: 'Práva subjektů údajů' },
  { id: 'sekce-4', label: 'Zabezpečení dat a příjemci' },
  { id: 'sekce-5', label: 'Závěrečná ustanovení' },
];

const sectionClass = 'flex scroll-mt-28 flex-col gap-4';
const headingClass =
  'font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-rich-violet)]';
const subHeadingClass =
  'font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-rich-violet)]';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';
const listClass = 'flex list-disc flex-col gap-2 pl-6';

export default function OchranaOsobnichUdajuPage() {
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
              Zásady ochrany osobních údajů
            </h1>
            <p className={`text-base ${mutedClass}`}>Platformy horea.cz · účinné od {EFFECTIVE_DATE}</p>
          </header>

          <section className="mb-[40px] flex flex-col gap-4 rounded-[var(--radius-buttons)] bg-[var(--color-soft-gray-fill)] p-6">
            <p>
              Platforma Horea si plně uvědomuje význam ochrany soukromí a osobních údajů. Tyto
              Zásady ochrany osobních údajů (dále jen „Zásady“) obsahují důležité informace o tom,
              jakým způsobem zpracováváme osobní údaje našich Partnerů (podniků) a jak technicky
              nakládáme s daty jejich koncových klientů.
            </p>
            <p>
              Veškeré zpracování osobních údajů probíhá v přísném souladu s Nařízením Evropského
              parlamentu a Rady (EU) 2016/679 ze dne 27. 4. 2016 (obecné nařízení o ochraně osobních
              údajů neboli „GDPR“) a souvisejícími českými právními předpisy.
            </p>
          </section>

          <div className="flex flex-col gap-[40px]">
            <section id="sekce-1" className={sectionClass}>
              <h2 className={headingClass}>I. Základní informace</h2>
              <ul className={listClass}>
                <li>
                  <strong>Správce osobních údajů:</strong> Petr Mai, podnikající pod obchodní značkou Horea, IČO: 17384605, se sídlem Tatarkova
                  24, Praha Háje, 149 00, kontaktní e-mail:{' '}
                  <a
                    href="mailto:info@horea.cz"
                    className="font-semibold text-[var(--color-action-violet)] hover:underline"
                  >
                    info@horea.cz
                  </a>{' '}
                  (dále jen „Poskytovatel“).
                </li>
                <li>
                  <strong>Pověřenec pro ochranu osobních údajů:</strong> Nebyl jmenován, neboť
                  Poskytovatel není povinnou osobou ve smyslu článku 37 GDPR.
                </li>
                <li>
                  <strong>Předávání údajů do třetích zemí:</strong> Data jsou primárně ukládána na
                  zabezpečených serverech v rámci Evropské unie. Pokud Poskytovatel využívá globální
                  SaaS nástroje (např. pro rozesílání systémových e-mailů nebo provoz zákaznického
                  chatu) se sídlem v USA, děje se tak výhradně za splnění podmínek článků 44 a násl.
                  GDPR (Standardní smluvní doložky nebo rámec Data Privacy Framework).
                </li>
                <li>
                  <strong>Automatizované rozhodování:</strong> Poskytovatel neprovádí profilování ani
                  automatizované individuální rozhodování ve smyslu článku 22 GDPR.
                </li>
              </ul>
            </section>

            <section id="sekce-2" className={sectionClass}>
              <h2 className={headingClass}>II. Rozsah a účel zpracování osobních údajů</h2>
              <p>
                V rámci provozu rezervačního systému vystupuje Platforma Horea ve dvou různých
                právních rolích: jako <strong>Správce</strong> a jako <strong>Zpracovatel</strong>.
              </p>

              <h3 className={subHeadingClass}>A. Horea v roli Správce (vztah k Partnerům – podnikům)</h3>
              <p>
                V této pozici zpracováváme osobní údaje fyzických osob podnikatelů nebo zástupců
                právnických osob, které se na horea.cz registrují k odběru Služby.
              </p>
              <ul className={listClass}>
                <li>
                  <strong>Plnění smlouvy a účetní povinnosti</strong> — zpracovávané údaje: jméno,
                  příjmení, název podniku, IČO, DIČ, sídlo/místo podnikání, telefonní číslo, e-mailová
                  adresa, platební údaje (transakce přes GoPay/QR). Právní titul: čl. 6 odst. 1 písm.
                  b) GDPR (plnění smlouvy) a písm. c) (zákonné povinnosti — zákon o účetnictví a DPH).
                  Součástí plnění je zasílání systémových a edukačních e-mailů (návody, tipy,
                  upozornění na nové funkce) bez reklamy třetích stran.
                </li>
                <li>
                  <strong>Oprávněný zájem (přímý marketing)</strong> — zpracovávané údaje: e-mailová
                  adresa, telefonní číslo. Právní titul: čl. 6 odst. 1 písm. f) GDPR. Partner se může
                  z odběru kdykoli bezplatně odhlásit.
                </li>
                <li>
                  <strong>Doba uchování:</strong> po dobu trvání předplatného a následně 10 let od
                  konce účetního období z důvodu daňových a archivačních zákonů.
                </li>
              </ul>

              <h3 className={subHeadingClass}>
                B. Horea v roli Zpracovatele (vztah ke Koncovým zákazníkům Partnera)
              </h3>
              <p>
                Partner využívá platformu horea.cz k ukládání dat o svých vlastních klientech
                (Koncových zákaznících). <strong>Správcem těchto dat je sám Partner.</strong> Horea je
                pouze technickým Zpracovatelem poskytujícím bezpečný cloudový prostor.
              </p>
              <div className="rounded-[var(--radius-buttons)] border border-[color-mix(in_srgb,var(--color-neon-pink)_35%,white)] bg-[color-mix(in_srgb,var(--color-neon-pink)_8%,white)] p-4">
                <p className="font-semibold text-[var(--color-rich-violet)]">
                  ⚠️ Upozornění pro Koncové zákazníky
                </p>
                <p className={`mt-1 ${mutedClass}`}>
                  Pokud jste koncovým klientem podniku, který využívá náš systém k rezervacím, vaše
                  data poskytujete tomuto podniku. S dotazy ohledně výkonu svých práv (např. žádost o
                  smazání z databáze) se obracejte přímo na daný podnik (Partnera), který je správcem
                  vašich údajů.
                </p>
              </div>
              <ul className={listClass}>
                <li>
                  <strong>Nakládání s daty:</strong> Poskytovatel neprovádí s daty Koncových
                  zákazníků žádné operace vyjma technického uložení, zprostředkování
                  e-mailových/SMS notifikací o rezervaci a zobrazení v administraci Partnera. Do dat
                  nenahlíží, nepozměňuje je, neprodává ani nevyužívá pro vlastní komerční účely.
                </li>
                <li>
                  <strong>Rozsah dat:</strong> pouze údaje vyplněné do rezervačního formuláře —
                  typicky jméno, příjmení, e-mail, telefon, čas a typ služby, případně poznámka.
                </li>
                <li>
                  <strong>Doba uchování a ochranná lhůta:</strong> data jsou zpracovávána po dobu
                  trvání vztahu s Partnerem. Po ukončení předplatného jsou držena v ochranné lhůtě{' '}
                  <strong>90 dnů</strong> pro případnou obnovu účtu; po jejím uplynutí jsou trvale a
                  nevratně smazána (v souladu se Všeobecnými obchodními podmínkami).
                </li>
              </ul>

              <h3 className={subHeadingClass}>C. Osobní údaje návštěvníků webu (cookies a logy)</h3>
              <ul className={listClass}>
                <li>
                  <strong>Log soubory:</strong> IP adresa, typ prohlížeče, operační systém, čas
                  přístupu, odkazující URL — pro zajištění síťové bezpečnosti a stability systému
                  (oprávněný zájem).
                </li>
                <li>
                  <strong>Soubory cookie:</strong> nezbytné (pro přihlášení a funkčnost rezervace) a
                  se souhlasem analytické a marketingové. Nastavení lze kdykoli změnit přes cookies
                  lištu.
                </li>
              </ul>

              <h3 className={subHeadingClass}>Využívané nástroje třetích stran</h3>
              <p>
                Na našem webu využíváme následující analytické, marketingové a technické nástroje
                třetích stran, které mohou ukládat soubory cookie do vašeho zařízení (pouze pokud k
                tomu udělíte aktivní souhlas v cookie liště):
              </p>
              <ul className={listClass}>
                <li>
                  <strong>Google Analytics:</strong> nástroj od společnosti Google Ireland Limited
                  (Irsko). Slouží k anonymnímu sběru dat o návštěvnosti, chování uživatelů v aplikaci
                  a měření výkonu webu. (Spadá pod analytické cookies.)
                </li>
                <li>
                  <strong>Google Tag Manager:</strong> nástroj od společnosti Google Ireland Limited
                  (Irsko). Technický nástroj, který nám pomáhá efektivně spravovat a nasazovat měřicí
                  kódy na webu. (Spadá pod nezbytné / technické cookies.)
                </li>
                <li>
                  <strong>Facebook Pixel (Meta Pixel):</strong> nástroj od společnosti Meta Platforms
                  Ireland Limited (Irsko). Slouží k měření úspěšnosti našich reklam na sociálních
                  sítích (Facebook, Instagram) a k přesnějšímu cílení marketingových kampaní podle
                  toho, jaké akce na našem webu provedete. (Spadá pod marketingové cookies.)
                </li>
              </ul>
            </section>

            <section id="sekce-3" className={sectionClass}>
              <h2 className={headingClass}>III. Práva subjektů údajů</h2>
              <p>
                V souladu s GDPR máte jako subjekt údajů (ve vztahu k údajům, kde je Horea v roli
                Správce) následující práva:
              </p>
              <ul className={listClass}>
                <li>
                  <strong>Právo na přístup (čl. 15):</strong> vědět, jaké údaje o vás zpracováváme, a
                  získat jejich kopii.
                </li>
                <li>
                  <strong>Právo na opravu (čl. 16):</strong> oprava nepřesných nebo doplnění
                  neúplných údajů.
                </li>
                <li>
                  <strong>Právo na výmaz (čl. 17):</strong> smazání údajů, pokud již nejsou potřebné
                  pro účely smlouvy či zákona.
                </li>
                <li>
                  <strong>Právo na omezení zpracování (čl. 18):</strong> dočasné omezení (např. při
                  popírání přesnosti dat).
                </li>
                <li>
                  <strong>Právo na přenositelnost (čl. 20):</strong> získat data ve strojově čitelném
                  formátu a předat je jinému správci.
                </li>
                <li>
                  <strong>Právo vznést námitku (čl. 21):</strong> kdykoli namítat zpracování založené
                  na oprávněném zájmu nebo pro přímý marketing.
                </li>
                <li>
                  <strong>Právo podat stížnost:</strong> u Úřadu pro ochranu osobních údajů (Pplk.
                  Sochora 27, 170 00 Praha 7,{' '}
                  <a
                    href="mailto:posta@uoou.cz"
                    className="font-semibold text-[var(--color-action-violet)] hover:underline"
                  >
                    posta@uoou.cz
                  </a>
                  ).
                </li>
              </ul>
              <p>
                Veškerá svá práva můžete uplatnit zasláním e-mailu na adresu:{' '}
                <a
                  href="mailto:info@horea.cz"
                  className="font-semibold text-[var(--color-action-violet)] hover:underline"
                >
                  info@horea.cz
                </a>
                .
              </p>
            </section>

            <section id="sekce-4" className={sectionClass}>
              <h2 className={headingClass}>IV. Zabezpečení dat a příjemci</h2>
              <p>
                4.1. <strong>Opatření:</strong> Poskytovatel zavedl moderní technická a organizační
                opatření k zamezení úniku, zneužití či ztrátě dat. Veškerá komunikace mezi uživatelem
                a serverem je šifrována pomocí protokolu HTTPS (SSL/TLS). Data v databázích jsou
                šifrována a zálohována. Přístupy zaměstnanců k infrastruktuře jsou přísně řízeny a
                podléhají mlčenlivosti.
              </p>
              <p>
                4.2. <strong>Příjemci dat:</strong> Osobní údaje neprodáváme ani nesdílíme s jinými
                správci. Pro zajištění chodu platformy využíváme prověřené zpracovatele, kteří
                zpracovávají data výhradně na základě našich pokynů:
              </p>
              <ul className={listClass}>
                <li>Poskytovatelé cloudové infrastruktury a serverového hostingu v EU.</li>
                <li>Externí účetní společnost (pro zpracování fakturace Partnerů).</li>
                <li>Provozovatel platební brány GoPay (GOPAY s.r.o.) zpracovávající platby za předplatné.</li>
                <li>Poskytovatelé e-mailových a SMS služeb pro doručování systémových notifikací.</li>
              </ul>
            </section>

            <section id="sekce-5" className={sectionClass}>
              <h2 className={headingClass}>V. Závěrečná ustanovení</h2>
              <p>
                5.1. Tyto Zásady jsou průběžně aktualizovány, aby odpovídaly reálnému stavu vývoje
                platformy a legislativě. Aktuální znění je vždy dostupné v patičce webu horea.cz.
              </p>
              <p>5.2. Tyto Zásady nabývají platnosti a účinnosti dnem {EFFECTIVE_DATE}.</p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
