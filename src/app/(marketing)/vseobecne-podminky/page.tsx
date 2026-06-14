import type { Metadata } from 'next';

import { LegalToc, type TocItem } from '@/components/landing/LegalToc';

export const metadata: Metadata = {
  title: 'Všeobecné obchodní podmínky | Horea',
  description:
    'Všeobecné obchodní podmínky platformy horea.cz (B2B) — předplatné, platby přes GoPay, výmaz dat, omezení odpovědnosti a zpracování osobních údajů (DPA).',
};

/** Datum účinnosti zobrazené v záhlaví i v závěrečných ustanoveních. */
const EFFECTIVE_DATE = '9. června 2026';

const TOC: TocItem[] = [
  { id: 'sekce-1', label: 'Úvodní ustanovení a definice' },
  { id: 'sekce-2', label: 'Registrace, účet a slug' },
  { id: 'sekce-3', label: 'Platební podmínky a změny cen' },
  { id: 'sekce-4', label: 'Deaktivace a výmaz dat' },
  { id: 'sekce-5', label: 'Omezení odpovědnosti' },
  { id: 'sekce-6', label: 'Duševní vlastnictví a obsah' },
  { id: 'sekce-7', label: 'Zpracování osobních údajů (DPA)' },
  { id: 'sekce-8', label: 'Závěrečná ustanovení' },
];

const sectionClass = 'flex scroll-mt-28 flex-col gap-4';
const headingClass =
  'font-[var(--font-polysans)] text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--color-rich-violet)]';
const subHeadingClass =
  'font-[var(--font-plus-jakarta-sans)] text-xl font-semibold text-[var(--color-rich-violet)]';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';
const listClass = 'flex list-disc flex-col gap-2 pl-6';

export default function VseobecnePodminkyPage() {
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
              Všeobecné obchodní podmínky
            </h1>
            <p className={`text-base ${mutedClass}`}>
              Platformy horea.cz (B2B) · účinné od {EFFECTIVE_DATE}
            </p>
          </header>

          <section className="mb-[40px] flex flex-col gap-4 rounded-[var(--radius-buttons)] bg-[var(--color-soft-gray-fill)] p-6">
            <p>
              Tyto všeobecné obchodní podmínky (dále jen „Podmínky“) upravují práva a povinnosti mezi
              smluvními stranami:
            </p>
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-[var(--color-rich-violet)]">Horea</p>
              <p className={mutedClass}>Petr Mai, podnikající pod obchodní značkou Horea</p>
              <p className={mutedClass}>se sídlem: Tatarkova 24, Praha Háje, 149 00</p>
              <p className={mutedClass}>IČO: 17384605</p>
              <p className={mutedClass}>
                zapsaný v živnostenském rejstříku vedeném Úřadem městské části Praha 11
              </p>
              <p className={mutedClass}>
                e-mail:{' '}
                <a
                  href="mailto:info@horea.cz"
                  className="font-semibold text-[var(--color-action-violet)] hover:underline"
                >
                  info@horea.cz
                </a>
              </p>
              <p className={mutedClass}>(dále jen „Poskytovatel“)</p>
            </div>
            <p>
              a Vámi, jakožto podnikatelem (fyzickou podnikající osobou nebo právnickou osobou),
              který využívá služby platformy horea.cz v rámci své samostatné výdělečné či
              podnikatelské činnosti (dále jen „Partner“).
            </p>
          </section>

          <div className="flex flex-col gap-[40px]">
            <section id="sekce-1" className={sectionClass}>
              <h2 className={headingClass}>1. Úvodní ustanovení a definice</h2>
              <p>
                1.1. <strong>Služba:</strong> Platforma horea.cz (dále jen „Služba“ nebo „Software“)
                je poskytována formou softwaru jako služby (SaaS). Služba zahrnuje zejména:
              </p>
              <ul className={listClass}>
                <li>
                  Zřízení a hosting veřejné webové rezervační stránky pro Partnera (využívající
                  unikátní odkaz – slug).
                </li>
                <li>Nástroje pro správu rezervací a klientský kalendář.</li>
                <li>Správu databáze koncových klientů a zaměstnanců Partnera.</li>
                <li>Přehledy analytických a provozních statistik v dashboardu.</li>
                <li>
                  Možnost integrace rezervačního formuláře (embed kód / widget) na webové stránky
                  třetích stran.
                </li>
              </ul>
              <p>
                1.2. <strong>B2B doložka:</strong> Tyto Podmínky jsou uzavírány výhradně v režimu B2B
                (Business-to-Business). Služba je určena pouze pro osoby jednající v rámci své
                podnikatelské činnosti. Registrovaný Partner prohlašuje a garantuje, že Službu
                neobjednává jako spotřebitel. Na tento smluvní vztah se nevztahují ustanovení
                právních předpisů na ochranu spotřebitele.
              </p>
              <p>
                1.3. <strong>Koncový zákazník:</strong> Znamená osobu (spotřebitele i podnikatele),
                která si objednává či rezervuje služby nebo termíny u Partnera prostřednictvím
                rezervačního systému Služby.
              </p>
              <p>
                1.4. <strong>Administrace a Účet:</strong> Znamená webové rozhraní chráněné
                přístupovými údaji, ve kterém Partner spravuje svůj profil, nastavení rezervačního
                systému, data a předplatné.
              </p>
              <p>
                1.5. <strong>Souhlas s Podmínkami:</strong> Používáním Služby, registrací nebo
                kliknutím na tlačítko stvrzující souhlas vyjadřuje Partner plný a bezvýhradný souhlas
                s těmito Podmínkami. Pokud s Podmínkami nesouhlasíte, nejste oprávněni Službu
                využívat.
              </p>
              <p>
                1.6. <strong>Změny Podmínek:</strong> Poskytovatel si vyhrazuje právo Podmínky
                kdykoli jednostranně měnit či doplňovat (např. z důvodu legislativních změn či
                technických inovací). Nové znění Podmínek bude zveřejněno na webu a Partner o něm
                bude informován e-mailem alespoň 15 kalendářních dnů před účinností. Pokud Partner se
                změnou nesouhlasí, má právo smluvní vztah vypovědět. Pokud Službu využívá i po nabytí
                účinnosti změn, má se za to, že s novým zněním souhlasí.
              </p>
            </section>

            <section id="sekce-2" className={sectionClass}>
              <h2 className={headingClass}>2. Registrace, účet a generování odkazu (slug)</h2>
              <p>
                2.1. <strong>Pravdivost údajů:</strong> Při registraci je Partner povinen uvést
                správné, pravdivé a úplné identifikační údaje (včetně IČO). Jakoukoli změnu údajů je
                Partner povinen bezodkladně aktualizovat v Administraci. Poskytovatel neodpovídá za
                škody vzniklé uvedením nesprávných údajů.
              </p>
              <p>
                2.2. <strong>Zabezpečení účtu:</strong> Partner je povinen chránit své přístupové
                údaje (jméno a heslo) a zamezit přístupu třetích neoprávněných osob k účtu. Účet je
                nepřenosný. Poskytovatel neodpovídá za zneužití účtu způsobené nedbalostí Partnera.
              </p>
              <p>
                2.3. <strong>Vytvoření slugu:</strong> Na základě názvu podniku zadaného Partnerem
                vygeneruje systém unikátní koncovku internetové adresy (tzv. slug), pod kterou bude
                dostupná veřejná rezervační stránka podniku (např. horea.cz/nazev-podniku). Adresa je
                Partnerovi plně zpřístupněna a aktivována až po úspěšném dokončení registrace,
                ověření názvu a úhradě předplatného.
              </p>
            </section>

            <section id="sekce-3" className={sectionClass}>
              <h2 className={headingClass}>3. Platební podmínky, subscription plans a změny cen</h2>
              <p>
                3.1. <strong>Předplatné:</strong> Přístup ke Službě a jejím funkcím je zpoplatněn
                formou pravidelného měsíčního předplatného na základě zvoleného balíčku služeb
                (Subscription plan). Ceny jsou uvedeny v Ceníku. K cenám bude vždy připočteno DPH v
                zákonné výši.
              </p>
              <p>
                3.2. <strong>Platební metody:</strong> Předplatné se hradí předem na nadcházející
                zúčtovací období (kalendářní měsíc). Platby jsou realizovány prostřednictvím:
              </p>
              <ul className={listClass}>
                <li>Platební brány GoPay (platba kartou, online bankovní převod).</li>
                <li>QR kódu vygenerovaného v Administraci nebo zaslaného na e-mail.</li>
              </ul>
              <p>
                Partner bere na vědomí, že platební transakce podléhají obchodním podmínkám
                provozovatele platební brány GoPay a Poskytovatel neodpovídá za případné technické
                výpadky na straně této brány.
              </p>
              <p>
                3.3. <strong>Elektronická fakturace:</strong> Partner souhlasí s vystavováním
                daňových dokladů (faktur) v elektronické podobě. Faktury budou Partnerovi k dispozici
                ke stažení přímo v Administraci.
              </p>
              <p>
                3.4. <strong>Právo na úpravu balíčků a cen:</strong> Poskytovatel má právo kdykoli
                změnit cenu předplatného nebo upravit obsah, funkce a limity jednotlivých balíčků
                (Subscription plans). O těchto změnách bude Partner informován e-mailem alespoň 15
                dní před zúčtovacím obdobím, ve kterém mají změny nabýt účinnosti. Změna se nikdy
                nedotkne již předplaceného období. Pokud Partner se změnou nesouhlasí, má právo
                předplatné na další měsíc neprodloužit.
              </p>
              <p>
                3.5. <strong>Politika nevracení peněz (No-Refund):</strong> Vzhledem k tomu, že
                Služba představuje digitální plnění poskytované v B2B režimu a Software je kompletně
                zpřístupněn ihned po připsání platby, Poskytovatel neposkytuje žádné refundace ani
                nevrací peníze za již zaplacené měsíční předplatné. To platí i v případě, že Partner
                Službu v průběhu zúčtovacího období z jakéhokoliv důvodu nevyužíval, nebo se rozhodl
                svůj účet zrušit před koncem předplaceného měsíce.
              </p>
            </section>

            <section id="sekce-4" className={sectionClass}>
              <h2 className={headingClass}>4. Deaktivace služby, rezerva a trvalý výmaz dat</h2>
              <p>
                4.1. <strong>Omezení při nezaplacení:</strong> Pokud Partner neuhradí předplatné na
                další zúčtovací období, bude jeho přístup do Administrace Služby automaticky omezen a
                jeho veřejná rezervační stránka (horea.cz/slug) bude deaktivována.
              </p>
              <p>
                4.2. <strong>Ochranná lhůta 90 dní:</strong> Poskytovatel respektuje kontinuitu
                podnikání svých Partnerů. Pro případ, že Partner předplatné neprodlouží (např. z
                důvodu sezónnosti, technického pochybení nebo dočasného přerušení provozu), uchovává
                Poskytovatel veškerá data účtu (historii rezervací, databázi klientů, nastavení
                zaměstnanců) po dobu 90 kalendářních dnů od vypršení posledního placeného období.
                Během této doby se může Partner k plnému využívání Služby vrátit uhrazením
                předplatného.
              </p>
              <p>
                4.3. <strong>Trvalý výmaz dat:</strong> Pokud Partner neobnoví své předplatné do 90
                kalendářních dnů od jeho vypršení, veškerá data podniku, zaměstnanců, nastavení a
                osobní údaje Koncových zákazníků budou trvale, nevratně a automaticky smazána ze všech
                serverů a databází Poskytovatele. Poskytovatel nenese žádnou odpovědnost za ztrátu
                dat, škodu nebo ušlý zisk vzniklý Partnerovi v důsledku tohoto smazání po uplynutí
                ochranné lhůty.
              </p>
            </section>

            <section id="sekce-5" className={sectionClass}>
              <h2 className={headingClass}>5. Omezení odpovědnosti a kvalita služby</h2>
              <p>
                5.1. <strong>Poskytování „As Is“:</strong> Služba je vyvíjena a poskytována na bázi
                „as is“ (tak, jak stojí a leží) a „best effort“. Poskytovatel vynakládá maximální
                úsilí na zajištění stability softwaru, avšak nezaručuje nepřetržitou dostupnost Služby
                (100% uptime), její bezchybnost, absolutní zabezpečení proti kybernetickým útokům ani
                okamžité odstranění provozních chyb.
              </p>
              <p>
                5.2. <strong>Vyloučení odpovědnosti za škodu a ušlý zisk:</strong> Poskytovatel
                nenese vůči Partnerovi ani třetím osobám žádnou odpovědnost za přímé, nepřímé či
                náhodné škody, ušlý zisk, ztrátu klientských zakázek, přerušení provozu podniku nebo
                ztrátu dat, které vznikly v důsledku:
              </p>
              <ul className={listClass}>
                <li>Dočasného výpadku, údržby, technické chyby či nedostupnosti Služby.</li>
                <li>Ztráty nebo zneužití přístupových hesel ze strany Partnera.</li>
                <li>
                  Zásahu vyšší moci (výpadky internetové sítě, dodávek energie, vládní opatření,
                  kybernetické útoky).
                </li>
              </ul>
              <p>
                5.3. <strong>Odpovědnost za Embed kód:</strong> Služba umožňuje vygenerování embed
                kódu (widgetu) pro vložení rezervačního formuláře přímo na vlastní webové stránky
                Partnera. Poskytovatel nenese žádnou odpovědnost za funkčnost tohoto řešení,
                bezpečnost, kompatibilitu ani za jakýkoli negativní vliv (např. narušení vzhledu,
                zpomalení) embed kódu na webové stránky třetích stran. Partner vkládá tento kód na
                své vlastní riziko.
              </p>
              <p>
                5.4. <strong>Odstávky systému:</strong> Poskytovatel je oprávněn provádět plánované
                odstávky systému za účelem údržby a aktualizací (zpravidla v nočních hodinách). V
                případě neplánovaných kritických výpadků je Poskytovatel oprávněn omezit provoz
                Služby na dobu nezbytně nutnou k opravě, aniž by byl povinen o tom Partnera předem
                informovat. Nárok na úhradu předplatného není těmito odstávkami dotčen.
              </p>
            </section>

            <section id="sekce-6" className={sectionClass}>
              <h2 className={headingClass}>6. Duševní vlastnictví a obsah</h2>
              <p>
                6.1. <strong>Vlastnictví softwaru:</strong> Poskytovatel je jediným a výlučným
                vlastníkem veškerých majetkových a autorských práv k platformě horea.cz, zdrojovému
                kódu, grafickému rozhraní, databázím a ochranným známkám. Partnerovi je registrací
                udělena pouze omezená, nevýhradní a nepřenosná licence k užívání Služby v souladu s
                těmito Podmínkami.
              </p>
              <p>
                6.2. <strong>Zákaz reverzního inženýrství:</strong> Partner není oprávněn Software
                kopírovat, upravovat, dekompilovat, pokoušet se extrahovat zdrojový kód, vytvářet
                odvozená díla ani obcházet technická omezení a limity balíčků. Jakýkoli automatizovaný
                sběr dat (scraping, data mining) z platformy horea.cz bez písemného souhlasu
                Poskytovatele je přísně zakázán.
              </p>
              <p>
                6.3. <strong>Obsah Partnera:</strong> Partner nese plnou právní odpovědnost za texty,
                loga, fotografie a informace, které nahraje na svou veřejnou rezervační stránku (dále
                jen „Obsah Partnera“). Obsah Partnera nesmí porušovat autorská práva třetích osob,
                dobré mravy ani právní předpisy ČR (zákaz nelegálního, pornografického, urážlivého či
                diskriminačního obsahu). Poskytovatel si vyhrazuje právo závadný obsah bez varování
                smazat nebo účet zablokovat.
              </p>
            </section>

            <section id="sekce-7" className={sectionClass}>
              <h2 className={headingClass}>7. Smlouva o zpracování osobních údajů (DPA)</h2>
              <p className={`italic ${mutedClass}`}>
                (Tato část tvoří nedílnou součást Všeobecných obchodních podmínek v souladu s čl. 28
                Obecného nařízení o ochraně osobních údajů – Nařízení Evropského parlamentu a Rady
                (EU) 2016/679, dále jen „GDPR“.)
              </p>

              <h3 className={subHeadingClass}>7.1. Postavení smluvních stran</h3>
              <p>
                Partner vystupuje vůči svým koncovým klientům (Koncovým zákazníkům) a svým
                zaměstnancům v roli <strong>Správce osobních údajů</strong>. Partner určuje účel a
                prostředky zpracování a plně odpovídá za to, že disponuje platným právním titulem pro
                sběr a zpracování dat těchto osob.
              </p>
              <p>
                Poskytovatel (definovaný v úvodu těchto Podmínek jako konkrétní fyzická osoba
                podnikající) vystupuje v roli <strong>Zpracovatele osobních údajů</strong>.
                Poskytovatel Partnerovi poskytuje výhradně technické úložiště, cloudovou
                infrastrukturu a softwarové nástroje pro uložení a správu dat v rámci platformy
                horea.cz.
              </p>

              <h3 className={subHeadingClass}>7.2. Předmět, rozsah, účel a doba zpracování</h3>
              <ul className={listClass}>
                <li>
                  <strong>Předmět zpracování:</strong> Osobní údaje, které Koncoví zákazníci zadají do
                  rezervačního formuláře Služby, nebo které o nich a o svých zaměstnancích vloží sám
                  Partner do Administrace.
                </li>
                <li>
                  <strong>Kategorie zpracovávaných údajů:</strong> Jméno, příjmení, telefonní číslo,
                  e-mailová adresa, poznámky k rezervaci, historie objednaných služeb u Partnera,
                  jména a pracovní plány zaměstnanců Partnera. Služba není určena ke zpracování
                  zvláštních kategorií osobních údajů (citlivých údajů) ve smyslu čl. 9 GDPR.
                </li>
                <li>
                  <strong>Účel zpracování:</strong> Výhradně technické zajištění provozu rezervačního
                  systému, správa kalendáře, evidence termínů a automatické odesílání potvrzovacích
                  e-mailů či notifikací pro potřeby Partnera.
                </li>
                <li>
                  <strong>Doba zpracování:</strong> Po dobu trvání smluvního vztahu (aktivního
                  předplatného) a následně po dobu 90 kalendářních dnů v rámci ochranné lhůty pro
                  uchování dat podle článku 4.2 těchto Podmínek.
                </li>
              </ul>

              <h3 className={subHeadingClass}>
                7.3. Povinnosti Poskytovatele jako Zpracovatele
              </h3>
              <p>
                Poskytovatel se zavazuje plnit povinnosti podle čl. 28 odst. 3 GDPR, zejména:
              </p>
              <ul className={listClass}>
                <li>
                  <strong>Pokyny správce:</strong> Zpracovávat osobní údaje pouze na základě
                  doložených pokynů Partnera (včetně pokynů vyplývajících z povahy užívání Služby a
                  těchto Podmínek).
                </li>
                <li>
                  <strong>Mlčenlivost:</strong> Zajistit, aby se osoby oprávněné zpracovávat osobní
                  údaje u Poskytovatele (např. externí vývojáři nebo technická podpora) zavázaly k
                  mlčenlivosti, která trvá i po skončení jejich spolupráce s Poskytovatelem.
                </li>
                <li>
                  <strong>Technické zabezpečení:</strong> Přijmout s přihlédnutím ke stavu techniky,
                  nákladům na provedení a povaze zpracování odpovídající technická a organizační
                  opatření k zabezpečení dat v souladu s čl. 32 GDPR (zejména šifrování dat při
                  přenosu i na úložištích, kontrola přístupů a pravidelné zálohování).
                </li>
                <li>
                  <strong>Součinnost při právech subjektů:</strong> Být Partnerovi nápomocen
                  prostřednictvím vhodných technických a organizačních opatření při plnění Partnerovy
                  povinnosti reagovat na žádosti o výkon práv subjektů údajů (Koncových zákazníků a
                  zaměstnanců) stanovených v kapitole III GDPR.
                </li>
                <li>
                  <strong>Součinnost při zabezpečení:</strong> Být Partnerovi nápomocen při
                  zajišťování souladu s povinnostmi podle článků 32 až 36 GDPR, a to s přihlédnutím k
                  povaze zpracování a informacím, které má Poskytovatel k dispozici.
                </li>
                <li>
                  <strong>Hlášení incidentů:</strong> Bez zbytečného odkladu ohlásit Partnerovi
                  jakékoli zjištěné porušení zabezpečení osobních údajů, které by mohlo mít vliv na
                  data jeho klientů.
                </li>
                <li>
                  <strong>Trvalý výmaz:</strong> Po ukončení poskytování služeb a uplynutí 90denní
                  ochranné lhůty veškerá data trvale a nevratně vymazat ze svých serverů a databází.
                </li>
              </ul>

              <h3 className={subHeadingClass}>
                7.4. Zapojení dalších zpracovatelů (Subdodavatelů)
              </h3>
              <p>
                Partner uděluje Poskytovateli všeobecné povolení zapojit do zpracování další
                zpracovatele – subdodavatele (např. poskytovatele cloudového hostingu v EU,
                poskytovatele e-mailových serverů pro doručování notifikací, provozovatele platební
                brány GoPay).
              </p>
              <p>
                Poskytovatel je povinen uložit těmto subdodavatelům v technických smlouvách stejné
                povinnosti k ochraně osobních údajů, jaké jsou uvedeny v tomto článku.
              </p>
              <p>
                Poskytovatel je povinen informovat Partnera o jakémkoli záměru zapojit nového
                subdodavatele nebo jej nahradit, a to e-mailem nebo oznámením v Administraci nejméně
                10 kalendářních dní předem. Partner má právo vyjádřit vůči těmto změnám námitky. Pokud
                Partner námitku nevznese, má se za to, že se zapojením subdodavatele souhlasí.
              </p>

              <h3 className={subHeadingClass}>7.5. Audity a inspekce</h3>
              <p>
                Poskytovatel poskytne Partnerovi na jeho písemnou žádost veškeré informace potřebné k
                doložení splnění povinností stanovených v tomto článku a v článku 28 GDPR.
              </p>
              <p>
                Poskytovatel umožní audity nebo inspekce prováděné přímo Partnerem nebo nezávislým
                auditorem, kterého Partner pověří. Podmínkou provedení auditu je předchozí dohoda o
                termínu (minimálně 30 dní předem) a závazek mlčenlivosti auditora vůči technickému
                know-how Poskytovatele. Veškeré náklady spojené s provedením takového auditu nese v
                plné výši Partner.
              </p>

              <h3 className={subHeadingClass}>
                7.6. Prohlášení o nakládání s daty a provozní telemetrie
              </h3>
              <p>
                Poskytovatel výslovně prohlašuje, že do databází klientů Partnera aktivně nenahlíží,
                data nečte, neprodává ani je neposkytuje žádným třetím stranám pro jejich komerční
                účely.
              </p>
              <p>
                Partner bere na vědomí a souhlasí, že platforma horea.cz automaticky sbírá, agreguje
                a vyhodnocuje systémová, provozní a anonymizovaná telemetrická data za účelem
                technické optimalizace Služby a generování statistik v dashboardu Partnera.
              </p>
              <p>
                Tento sběr zahrnuje výhradně provozní metriky (počet aktivních uživatelů a uložených
                klientů, celkový počet a frekvence rezervací, zdroje rezervací – Booking sources,
                výkonnost služeb, produktivita týmu, údaje o stavu platformy jako aktivní předplatná,
                MRR, statistiky tržeb a statistiky technické podpory). Tato data jsou zpracovávána v
                agregované a plně anonymizované formě, nemají povahu osobních údajů konkrétních
                koncových klientů a neslouží k jejich identifikaci.
              </p>
            </section>

            <section id="sekce-8" className={sectionClass}>
              <h2 className={headingClass}>8. Závěrečná ustanovení</h2>
              <p>
                8.1. <strong>Oddělitelnost ustanovení:</strong> Pokud by se jakékoli ustanovení
                těchto Podmínek stalo neplatným, nezákonným nebo nevynutitelným, nemá to vliv na
                platnost a vynutitelnost ostatních ustanovení Podmínek. Neplatné ustanovení bude
                nahrazeno ujednáním, které se svým smyslem nejvíce blíží původnímu ekonomickému a
                právnímu účelu.
              </p>
              <p>
                8.2. <strong>Započtení a postoupení:</strong> Partner není oprávněn bez předchozího
                písemného souhlasu Poskytovatele postoupit svá práva a závazky plynoucí z těchto
                Podmínek na třetí osobu. Poskytovatel je oprávněn práva a povinnosti ze smlouvy
                postoupit na třetí osobu (např. při prodeji závodu či fúzi) i bez souhlasu Partnera.
                Poskytovatel je oprávněn započíst své splatné i nesplatné pohledávky vůči pohledávkám
                Partnera.
              </p>
              <p>
                8.3. <strong>Rozhodné právo a jurisdikce:</strong> Tyto Podmínky a veškeré právní
                vztahy mezi Poskytovatelem a Partnerem se řídí výhradně právním řádem České
                republiky, zejména zákonem č. 89/2012 Sb., občanský zákoník, v platném znění. Smluvní
                strany výslovně sjednávají, že pro řešení případných soudních sporů je místně a věcně
                příslušný obecný soud Poskytovatele v České republice.
              </p>
              <p>
                8.4. <strong>Účinnost:</strong> Tyto Podmínky nabývají platnosti a účinnosti dnem{' '}
                {EFFECTIVE_DATE}.
              </p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
