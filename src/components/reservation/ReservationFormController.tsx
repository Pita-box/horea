'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { Notice } from '@/components/ui';
import { combinedDuration } from '@/lib/reservation/combine';
import {
  clearEmployeeIfOutsideSelection,
  employeesForSelection,
  type ServiceEmployeeMapping,
} from '@/lib/reservation/employees';
import { MAX_SERVICES_PER_RESERVATION } from '@/lib/reservation/limits';
import { toggleService } from '@/lib/reservation/selection';
import { createReservation } from '@/server/ReservationCreator';
import { getAvailableSlots } from '@/server/AvailableSlotsService';

import { Step1ServicePicker } from './Step1ServicePicker';
import { Step2DatePicker } from './Step2DatePicker';
import { Step3TimePicker } from './Step3TimePicker';
import { Step4ContactForm } from './Step4ContactForm';
import { Step5Summary } from './Step5Summary';
import { StepIndicator } from './StepIndicator';
import type { ContactValues, ReservationService, SlotsState, SubmitState } from './types';

/**
 * Hlavní controller pětikrokového rezervačního formuláře (R8.2, R14.3, R14.4, R17.1).
 *
 * Drží veškerý stav formuláře v paměti (žádné localStorage/cookies, žádný přímý
 * DB call). Veškerá business logika žije na serveru — controller je čistě
 * prezentační/UX vrstva nad dvěma server actions (`getAvailableSlots`,
 * `createReservation`). Navigace vpřed/zpět zachovává hodnoty ostatních kroků
 * (R8.2); přechod dál je podmíněn validitou aktuálního kroku.
 */
type ReservationFormControllerProps = {
  slug: string;
  /** Služby seřazené dle `created_at` vzestupně (předává routa). */
  services: ReservationService[];
  /** Dostupní zaměstnanci per služba (id služby → seznam); jen když je výběr povolen. */
  serviceEmployees?: Record<string, { id: string; name: string; photoUrl: string | null }[]>;
  /** Povolit výběr zaměstnance při rezervaci. */
  allowEmployeeSelection?: boolean;
  /**
   * Náhledový režim pro majitele nepublikovaného profilu (free účet): formulář
   * lze proklikat, ale dokončení rezervace je zakázané (R: „zakázat dokončit
   * rezervaci"). Skutečné odeslání se neprovede.
   */
  preview?: boolean;
};

const NO_SERVICES_MESSAGE = 'Tento podnik zatím nemá žádné rezervovatelné služby';

/** Hláška v náhledovém režimu, když se majitel pokusí dokončit rezervaci. */
const PREVIEW_BLOCKED_MESSAGE =
  'Toto je náhled vašeho profilu. Rezervace bude možná po aktivaci tarifu a publikování profilu.';

/** Krátké popisky pro vodorovný indikátor kroků. */
const STEP_TITLES = ['Služba', 'Datum', 'Čas', 'Údaje', 'Souhrn'] as const;

const EMPTY_CONTACT: ContactValues = {
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  note: '',
};

/** Dnešní kalendářní datum v Europe/Prague ve tvaru `YYYY-MM-DD` (R5.1, R5.2). */
function todayInPrague(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return `${map.year}-${map.month}-${map.day}`;
}

export function ReservationFormController({
  slug,
  services,
  serviceEmployees = {},
  allowEmployeeSelection = false,
  preview = false,
}: ReservationFormControllerProps) {
  const today = useMemo(() => todayInPrague(), []);

  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  // `Selected_Service_List` — uspořádaná množina vybraných služeb v pořadí výběru
  // (R1.1–R1.3). První služba = `position 0` = primary.
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsState, setSlotsState] = useState<SlotsState>('idle');
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactValues>(EMPTY_CONTACT);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservationStatus, setReservationStatus] = useState<'pending' | 'approved' | null>(null);

  // Klíč posledního dokončeného/probíhajícího fetch slotů (`serviceIds.join(',')|date`)
  // a token pro zahození zastaralých odpovědí při rychlé změně data/množiny služeb (R6.1).
  const lastFetchKeyRef = useRef<string | null>(null);
  const fetchTokenRef = useRef(0);
  // Synchronní guard proti dvojkliku na „Odeslat rezervaci" (R8.4) — drží se
  // mimo React state, protože setState není synchronní vůči dalšímu kliku.
  const submittingRef = useRef(false);

  // Vybrané služby v pořadí výběru (`position`) — zdroj pro souhrn (krok 5) i
  // pro průběžné kombinované součty.
  const selectedServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => services.find((service) => service.id === id))
        .filter((service): service is ReservationService => service != null),
    [services, selectedServiceIds],
  );

  // Combined_Duration vybraných služeb — pro hlášku „blok se do dne nevejde" (R6.2).
  const combinedDurationMinutes = useMemo(
    () => combinedDuration(selectedServices),
    [selectedServices],
  );

  // Mapování služba → ID zaměstnanců (tvar pro helper `employeesForSelection`).
  // Služba bez řádku = „umí ji všichni" (R8.2).
  const employeeMapping = useMemo<ServiceEmployeeMapping>(() => {
    const mapping: Record<string, string[]> = {};
    for (const [serviceId, employees] of Object.entries(serviceEmployees)) {
      mapping[serviceId] = employees.map((employee) => employee.id);
    }
    return mapping;
  }, [serviceEmployees]);

  // Vyhledávací mapa zaměstnanec → objekt (pro carousel) napříč všemi službami.
  const employeeById = useMemo(() => {
    const map = new Map<string, { id: string; name: string; photoUrl: string | null }>();
    for (const employees of Object.values(serviceEmployees)) {
      for (const employee of employees) {
        if (!map.has(employee.id)) {
          map.set(employee.id, employee);
        }
      }
    }
    return map;
  }, [serviceEmployees]);

  // Nabídnutelní zaměstnanci = PRŮNIK přes všechny vybrané služby (R8.2, R8.3).
  const offeredEmployees = useMemo(() => {
    if (!allowEmployeeSelection || selectedServiceIds.length === 0) {
      return [];
    }
    return employeesForSelection(employeeMapping, selectedServiceIds)
      .map((id) => employeeById.get(id))
      .filter((employee): employee is { id: string; name: string; photoUrl: string | null } =>
        employee != null,
      );
  }, [allowEmployeeSelection, selectedServiceIds, employeeMapping, employeeById]);

  const fetchSlots = useCallback(
    async (serviceIds: string[], dateISO: string) => {
      const key = `${serviceIds.join(',')}|${dateISO}`;
      lastFetchKeyRef.current = key;
      const token = ++fetchTokenRef.current;

      setSlotsState('loading');
      setSlotsError(null);
      setSlots([]);
      setTime('');

      const result = await getAvailableSlots({ slug, date: dateISO, serviceIds });

      // Zahodíme odpověď, pokud mezitím proběhl novější požadavek.
      if (token !== fetchTokenRef.current) {
        return;
      }

      if (!result.ok) {
        setSlotsState('error');
        setSlotsError(result.message);
        return;
      }

      if (result.slots.length === 0) {
        // Prázdno kvůli příliš dlouhému kombinovanému bloku → klient má odebrat
        // služby (R6.2); jinak běžné „v tento den nic" (plno/zavřeno).
        setSlotsState(result.durationExceedsDay ? 'too_long' : 'empty');
        return;
      }

      setSlots([...result.slots].sort());
      setSlotsState('loaded');
      // Auto-přechod: jakmile jsou pro vybrané datum dostupné termíny, pošli
      // klienta rovnou na krok 3 (výběr času). Návrat zpět na krok 2 už
      // nerefetchuje (klíč `serviceIds|date` sedí), takže k opětovnému
      // auto-skoku nedojde a klient může datum v klidu změnit. Prázdný/chybový
      // výsledek auto-skok nespustí — krok 2 zůstane s příslušnou hláškou.
      setSubmitError(null);
      setStep(3);
      setMaxStep((current) => Math.max(current, 3));
    },
    [slug],
  );

  // Načtení termínů pro aktuální kombinaci (množina služeb, datum) při zobrazení
  // kroku 2. Reaguje i na změnu množiny služeb (klíč `serviceIds.join(',')|date`
  // se změní) a vyhne se duplicitnímu fetchi pro už načtenou kombinaci (R8.2).
  useEffect(() => {
    if (step !== 2 || selectedServiceIds.length === 0 || !date || date < today) {
      return;
    }
    const key = `${selectedServiceIds.join(',')}|${date}`;
    if (key === lastFetchKeyRef.current) {
      return;
    }
    void fetchSlots(selectedServiceIds, date);
  }, [step, selectedServiceIds, date, today, fetchSlots]);

  // Toggle výběru služby přes čistý reducer (R1.1–R1.3) s pojistkou horního
  // limitu (R1.6 — picker drží stejný strop). Změna MNOŽINY služeb zneplatní
  // dříve načtené termíny i vybraný čas a vrátí formulář na krok 1 (sloty jsou
  // závislé na množině služeb — R6.1).
  function handleToggleService(serviceId: string) {
    const isSelected = selectedServiceIds.includes(serviceId);
    // Pojistka horního limitu: přidání 11. služby ignorujeme (R1.6).
    if (!isSelected && selectedServiceIds.length >= MAX_SERVICES_PER_RESERVATION) {
      return;
    }

    const next = toggleService(selectedServiceIds, serviceId);
    setSelectedServiceIds(next);

    // Vybraný zaměstnanec mimo nový průnik se zruší (R8.3).
    setSelectedEmployeeId(
      (current) =>
        clearEmployeeIfOutsideSelection(employeeMapping, next, current || null) ?? '',
    );

    setTime('');
    setSlots([]);
    setSlotsState('idle');
    lastFetchKeyRef.current = null;
    // Změna množiny služeb zneplatní navštívené kroky dál — návrat na krok 1.
    setMaxStep(1);
  }

  function handleDateChange(value: string) {
    setDate(value);
    setTime('');
    setSlots([]);
    setSlotsError(null);
    lastFetchKeyRef.current = null;
    // Změna data zneplatní čas a navazující kroky — ponecháme nejvýše krok 2.
    setMaxStep((current) => Math.min(current, 2));
    // Minulé datum (defenzivně proti ručnímu vstupu i přes `min`) nenačítáme a
    // přechod dál zůstane zablokovaný (R5.2).
    setSlotsState(!value || value < today ? 'idle' : 'loading');
  }

  function selectTime(value: string) {
    setTime(value);
    setConflictMessage(null);
  }

  function updateContact(patch: Partial<ContactValues>) {
    setContact((current) => ({ ...current, ...patch }));
  }

  // Dopředná navigace (tlačítka „Pokračovat") — posune krok a zvýší dosažený
  // krok (odemkne ho v indikátoru pro pozdější návrat).
  function goToStep(target: number) {
    setSubmitError(null);
    setStep(target);
    setMaxStep((current) => Math.max(current, target));
  }

  // Návrat na už navštívený krok přes indikátor / tlačítka „Zpět".
  function goBackToStep(target: number) {
    setSubmitError(null);
    setStep(target);
  }

  function handleSubmit() {
    // Náhledový režim majitele: dokončení rezervace je zakázané (R: free účet).
    if (preview) {
      setSubmitError(PREVIEW_BLOCKED_MESSAGE);
      setSubmitState('error');
      return;
    }

    // (R8.4) Synchronní guard: i kdyby uživatel klikl dvakrát rychle po sobě,
    // druhý klik se zde zastaví ještě před zahájením requestu.
    if (submittingRef.current) {
      return;
    }
    if (selectedServiceIds.length === 0 || !date || !time) {
      return;
    }

    submittingRef.current = true;
    setSubmitError(null);
    setSubmitState('pending'); // (R8.5) drží tlačítko disabled po dobu zpracování

    void createReservation({
      slug,
      serviceIds: selectedServiceIds,
      date,
      time,
      clientName: contact.clientName,
      clientPhone: contact.clientPhone,
      clientEmail: contact.clientEmail,
      note: contact.note.trim() ? contact.note : null,
      employeeId: selectedEmployeeId || null,
    })
      .then((result) => {
        if (result.ok) {
          setReservationStatus(result.status);
          setSubmitState('success');
          return;
        }

        if (result.code === 409) {
          // Termín byl mezitím obsazen — obnovíme nabídku a vrátíme do kroku 3 (R9.4).
          const freshSlots = result.slots ?? [];
          setSlots([...freshSlots].sort());
          setSlotsState(freshSlots.length > 0 ? 'loaded' : 'empty');
          setTime('');
          setConflictMessage(result.message);
          setSubmitState('idle');
          setStep(3);
          return;
        }

        if (result.code === 400) {
          // Validační chyba na serveru — zpět do kroku 4 (R7.7).
          setSubmitError(result.message);
          setSubmitState('error');
          setStep(4);
          return;
        }

        // 404 (podnik/služba nedostupné) i 500 (obecná chyba) — hláška u souhrnu.
        setSubmitError(result.message);
        setSubmitState('error');
      })
      .finally(() => {
        submittingRef.current = false;
      });
  }

  // Defenzivní stav (R4.5): bez služeb krok 1 nezpřístupníme.
  if (services.length === 0) {
    return <Notice>{NO_SERVICES_MESSAGE}</Notice>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-[16px]">
      <StepIndicator
        steps={STEP_TITLES}
        current={step}
        maxReached={maxStep}
        onStepClick={goBackToStep}
      />

      {/* Klíč = krok → každý přechod re-mountuje obsah a spustí enter animaci,
          aby bylo jasně vidět, že se obsah změnil (lepší UX při změně kroku). */}
      <div key={step} className="animate-step-enter">
        {step === 1 ? (
          <Step1ServicePicker
            services={services}
            selectedServiceIds={selectedServiceIds}
            onToggle={handleToggleService}
            onNext={() => goToStep(2)}
            afterServices={
              allowEmployeeSelection && selectedServiceIds.length > 0 ? (
                <EmployeeCarousel
                  employees={offeredEmployees}
                  selectedEmployeeId={selectedEmployeeId}
                  onToggle={(id) => setSelectedEmployeeId((current) => (current === id ? '' : id))}
                />
              ) : null
            }
          />
        ) : null}

        {step === 2 ? (
          <Step2DatePicker
            date={date}
            today={today}
            slotsState={slotsState}
            errorMessage={slotsError}
            combinedDurationMinutes={combinedDurationMinutes}
            serviceCount={selectedServiceIds.length}
            onDateChange={handleDateChange}
            onNext={() => goToStep(3)}
            onBack={() => goBackToStep(1)}
            onAdjustServices={() => goBackToStep(1)}
          />
        ) : null}

        {step === 3 ? (
          <Step3TimePicker
            slots={slots}
            time={time}
            conflictMessage={conflictMessage}
            onSelect={selectTime}
            onNext={() => goToStep(4)}
            onBack={() => goBackToStep(2)}
          />
        ) : null}

        {step === 4 ? (
          <Step4ContactForm
            values={contact}
            submitError={submitError}
            onChange={updateContact}
            onNext={() => goToStep(5)}
            onBack={() => goBackToStep(3)}
          />
        ) : null}

        {step === 5 && selectedServices.length > 0 ? (
          <Step5Summary
            services={selectedServices}
            date={date}
            time={time}
            contact={contact}
            submitState={submitState}
            submitError={submitError}
            reservationStatus={reservationStatus}
            onEditStep={goBackToStep}
            onBack={() => goBackToStep(4)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </div>
    </div>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Carousel (1 řádek) dostupných zaměstnanců pod výpisem služeb. Výběr je
 * volitelný — klik na vybraného zaměstnance výběr zruší.
 */
function EmployeeCarousel({
  employees,
  selectedEmployeeId,
  onToggle,
}: {
  employees: { id: string; name: string; photoUrl: string | null }[];
  selectedEmployeeId: string;
  onToggle: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Změří, zda lze scrollovat doleva/doprava, a podle toho zobrazí šipky i
  // okrajové fade-gradienty. Tolerance 1px kvůli sub-pixelovému zaokrouhlení.
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < maxScroll - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, employees.length]);

  const scrollByDir = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    // Posuneme o ~80 % viditelné šířky, ať zůstane drobný překryv pro orientaci.
    const amount = Math.round(el.clientWidth * 0.8) * (dir === 'left' ? -1 : 1);
    el.scrollBy({ left: amount, behavior: 'smooth' });
  }, []);

  if (employees.length === 0) {
    return null;
  }

  const showNav = canScrollLeft || canScrollRight;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex h-8 items-center">
        <p className="text-[14px] font-medium text-[var(--color-slate-text)]">
          Zaměstnanec <span className="opacity-70">(nepovinné)</span>
        </p>
        {showNav ? (
          <div className="absolute right-0 top-0 flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollByDir('left')}
              disabled={!canScrollLeft}
              aria-label="Předchozí zaměstnanci"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)] transition-colors enabled:hover:border-[var(--color-action-violet)] disabled:opacity-40"
            >
              <IconChevronLeft size={18} stroke={2} />
            </button>
            <button
              type="button"
              onClick={() => scrollByDir('right')}
              disabled={!canScrollRight}
              aria-label="Další zaměstnanci"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)] transition-colors enabled:hover:border-[var(--color-action-violet)] disabled:opacity-40"
            >
              <IconChevronRight size={18} stroke={2} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <ul
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {employees.map((employee) => {
            const active = employee.id === selectedEmployeeId;
            return (
              <li key={employee.id} className="w-[calc((100%-48px)/5)] shrink-0">
                <button
                  type="button"
                  onClick={() => onToggle(employee.id)}
                  aria-pressed={active}
                  title={employee.name}
                  className={[
                    'flex w-full flex-col items-center gap-1 rounded-[var(--radius-cards)] border p-2 text-center transition-colors',
                    active
                      ? 'border-[var(--color-action-violet)] bg-[color-mix(in_srgb,var(--color-action-violet)_8%,white)]'
                      : 'border-[var(--color-border-vychozi)] hover:border-[var(--color-action-violet)]',
                  ].join(' ')}
                >
                  <span className="h-14 w-14 overflow-hidden rounded-full bg-[var(--color-air-blue)]">
                    {employee.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- lehký náhled v carouselu
                      <img
                        src={employee.photoUrl}
                        alt={employee.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--color-rich-violet)]">
                        {initial(employee.name)}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 block h-[2.4em] text-[12px] leading-[1.2] text-[var(--color-slate-text)]">
                    {employee.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Okrajové fade-gradienty naznačují, že obsah pokračuje mimo viditelnou oblast. */}
        {canScrollLeft ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--color-canvas-white)] to-transparent" />
        ) : null}
        {canScrollRight ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--color-canvas-white)] to-transparent" />
        ) : null}
      </div>
    </div>
  );
}
