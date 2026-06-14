/**
 * Sdílené typy pětikrokového rezervačního formuláře (`ReservationFormController`
 * a kroky Step1–Step5). Žádná business logika — jen tvary dat předávané mezi
 * controllerem a prezentačními kroky.
 */

/** Služba zobrazená v kroku 1 a v souhrnu (krok 5). Cena v Kč, trvání v minutách. */
export type ReservationService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCzk: number;
  /** Volitelný popis služby (zobrazí se v kroku 1). */
  description: string | null;
};

/** Kontaktní pole z kroku 4. Drží se jako prosté řetězce; server je re-validuje. */
export type ContactValues = {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  note: string;
};

/** Stav odesílání rezervace (krok 5). */
export type SubmitState = 'idle' | 'pending' | 'error' | 'success';

/**
 * Stav načítání dostupných termínů v kroku 2:
 * - `idle` — datum ještě nebylo vybráno (nebo je v minulosti),
 * - `loading` — probíhá serverové volání,
 * - `error` — volání selhalo,
 * - `empty` — server vrátil prázdný seznam termínů,
 * - `loaded` — k dispozici je neprázdný seznam termínů.
 */
export type SlotsState = 'idle' | 'loading' | 'error' | 'empty' | 'loaded';
