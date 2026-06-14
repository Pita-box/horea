export const BUSINESS_TYPES = [
  'kadernik',
  'nehtove_studio',
  'bistro',
  'masazni_salon',
  'spa',
  'beauty',
  'ostatni',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  kadernik: 'Kadeřnictví',
  nehtove_studio: 'Nehtové studio',
  bistro: 'Bistro',
  masazni_salon: 'Masážní salon',
  spa: 'Spa',
  beauty: 'Beauty služby',
  ostatni: 'Ostatní',
};

export function isBusinessType(value: string): value is BusinessType {
  return BUSINESS_TYPES.includes(value as BusinessType);
}
