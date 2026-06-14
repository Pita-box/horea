/**
 * Katalog funkcí podniku (entitlements). Slouží jako master seznam, který bude
 * admin v budoucnu gateovat per tarif. Výchozí stav: všechny funkce povolené pro
 * všechny tarify (chybějící řádek v `plan_features` = povoleno). Matici z DB
 * načítá `lib/plans/feature-matrix.ts`.
 */
export type BusinessFeatureKey =
  | 'public_profile'
  | 'online_reservations'
  | 'reservation_management'
  | 'auto_approve'
  | 'parallel_slots'
  | 'services'
  | 'opening_hours'
  | 'clients'
  | 'client_search'
  | 'email_notifications'
  | 'invoices';

export type BusinessFeature = {
  key: BusinessFeatureKey;
  label: string;
  description: string;
};

export const BUSINESS_FEATURES: BusinessFeature[] = [
  {
    key: 'public_profile',
    label: 'Veřejný rezervační profil',
    description: 'Vlastní stránka podniku na horea.cz/váš-slug, kterou sdílíte s klienty.',
  },
  {
    key: 'online_reservations',
    label: 'Online rezervace 24/7',
    description: 'Klienti si rezervují termíny kdykoliv přes rezervační formulář.',
  },
  {
    key: 'reservation_management',
    label: 'Správa rezervací',
    description: 'Přehled, schvalování, úpravy a stavy rezervací v dashboardu.',
  },
  {
    key: 'auto_approve',
    label: 'Automatické schvalování',
    description: 'Rezervace se potvrzují automaticky bez ručního zásahu.',
  },
  {
    key: 'parallel_slots',
    label: 'Paralelní termíny',
    description: 'Více současně probíhajících rezervací ve stejném čase.',
  },
  {
    key: 'services',
    label: 'Služby a ceník',
    description: 'Správa nabízených služeb, jejich délky a cen.',
  },
  {
    key: 'opening_hours',
    label: 'Otevírací doba',
    description: 'Nastavení otevíracích hodin pro jednotlivé dny.',
  },
  {
    key: 'clients',
    label: 'Databáze klientů',
    description: 'Evidence klientů a jejich historie rezervací.',
  },
  {
    key: 'client_search',
    label: 'Vyhledávání klientů',
    description: 'Rychlé hledání klientů podle jména, e-mailu nebo telefonu.',
  },
  {
    key: 'email_notifications',
    label: 'E-mailové notifikace',
    description: 'Automatická potvrzení a upozornění na rezervace e-mailem.',
  },
  {
    key: 'invoices',
    label: 'Faktury k předplatnému',
    description: 'Automatické generování faktur za předplatné.',
  },
];

const ALL_FEATURE_KEYS: ReadonlySet<BusinessFeatureKey> = new Set(
  BUSINESS_FEATURES.map((feature) => feature.key),
);

/** Pole feature keys v pořadí katalogu. */
export const BUSINESS_FEATURE_KEYS: BusinessFeatureKey[] = [...ALL_FEATURE_KEYS];

