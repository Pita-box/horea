'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { Notice } from '@/components/ui';
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
};

const NO_SERVICES_MESSAGE = 'Tento podnik zatím nemá žádné rezervovatelné služby';

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
}: ReservationFormControllerProps) {
  const today = useMemo(() => todayInPrague(), []);

  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
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

  // Klíč posledního dokončeného/probíhajícího fetch slotů (`serviceId|date`) a
  // token pro zahození zastaralých odpovědí při rychlé změně data/služby.
  const lastFetchKeyRef = useRef<string | null>(null);
  const fetchTokenRef = useRef(0);
  // Synchronní guard proti dvojkliku na „Odeslat rezervaci" (R8.4) — drží se
  // mimo React state, protože setState není synchronní vůči dalšímu kliku.
  const submittingRef = useRef(false);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  const fetchSlots = useCallback(
    async (serviceId: string, dateISO: string) => {
      const key = `${serviceId}|${dateISO}`;
      lastFetchKeyRef.current = key;
      const token = ++fetchTokenRef.current;

      setSlotsState('loading');
      setSlotsError(null);
      setSlots([]);
      setTime('');

      const result = await getAvailableSlots({ slug, date: dateISO, serviceId });

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
        setSlotsState('empty');
        return;
      }

      setSlots([...result.slots].sort());
      setSlotsState('loaded');
    },
    [slug],
  );

  // Načtení termínů pro aktuální kombinaci (služba, datum) při zobrazení kroku 2.
  // Reaguje i na změnu služby (klíč se změní) a vyhne se duplicitnímu fetchi pro
  // už načtenou kombinaci (zachování dat při návratu — R8.2).
  useEffect(() => {
    if (step !== 2 || !selectedServiceId || !date || date < today) {
      return;
    }
    const key = `${selectedServiceId}|${date}`;
    if (key === lastFetchKeyRef.current) {
      return;
    }
    void fetchSlots(selectedServiceId, date);
  }, [step, selectedServiceId, date, today, fetchSlots]);

  function selectService(serviceId: string) {
    if (serviceId === selectedServiceId) {
      return;
    }
    // Změna služby zneplatní dříve načtené termíny i vybraný čas (R8.2 zachovává
    // jen logicky platná data — sloty jsou závislé na službě).
    setSelectedServiceId(serviceId);
    setSelectedEmployeeId('');
    setTime('');
    setSlots([]);
    setSlotsState('idle');
    lastFetchKeyRef.current = null;
    // Změna služby zneplatní navštívené kroky dál — návrat na krok 1.
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
    // (R8.4) Synchronní guard: i kdyby uživatel klikl dvakrát rychle po sobě,
    // druhý klik se zde zastaví ještě před zahájením requestu.
    if (submittingRef.current) {
      return;
    }
    const service = selectedService;
    if (!service || !date || !time) {
      return;
    }

    submittingRef.current = true;
    setSubmitError(null);
    setSubmitState('pending'); // (R8.5) drží tlačítko disabled po dobu zpracování

    void createReservation({
      slug,
      serviceId: service.id,
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
            selectedServiceId={selectedServiceId}
            onSelect={selectService}
            onNext={() => goToStep(2)}
            afterServices={
              allowEmployeeSelection && selectedServiceId ? (
                <EmployeeCarousel
                  employees={serviceEmployees[selectedServiceId] ?? []}
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
            onDateChange={handleDateChange}
            onNext={() => goToStep(3)}
            onBack={() => goBackToStep(1)}
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

        {step === 5 && selectedService ? (
          <Step5Summary
            service={selectedService}
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
