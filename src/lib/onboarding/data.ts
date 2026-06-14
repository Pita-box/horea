import { validateEmail } from '@/lib/auth/email';

import { isBusinessType, type BusinessType } from './business-types';
import type { OnboardingJson } from './draft';

type JsonRecord = { [key: string]: OnboardingJson };

export type TypeDraft = {
  type: BusinessType;
};

export type SlugDraft = {
  slug: string;
  businessName: string;
};

export type ProfileDraft = {
  name: string;
  description: string;
  phone: string;
  email: string;
  address: string;
};

export type ServiceDraft = {
  name: string;
  durationMinutes: number;
  priceCzk: number;
};

export type HoursDraft = {
  dayOfWeek: number;
  isOpen: boolean;
  opensAt: string;
  closesAt: string;
};

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export const WEEK_DAYS = [
  { dayOfWeek: 0, label: 'Pondělí' },
  { dayOfWeek: 1, label: 'Úterý' },
  { dayOfWeek: 2, label: 'Středa' },
  { dayOfWeek: 3, label: 'Čtvrtek' },
  { dayOfWeek: 4, label: 'Pátek' },
  { dayOfWeek: 5, label: 'Sobota' },
  { dayOfWeek: 6, label: 'Neděle' },
] as const;

const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '17:00';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function getRecord(value: OnboardingJson): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value;
}

function readString(record: JsonRecord, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function readNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(record: JsonRecord, key: string): boolean | null {
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

function toMinutes(value: string): number | null {
  if (!TIME_PATTERN.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function parseTypeData(value: OnboardingJson): TypeDraft | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }

  const type = readString(record, 'type');
  return isBusinessType(type) ? { type } : null;
}

export function parseSlugData(value: OnboardingJson): SlugDraft | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }

  const slug = readString(record, 'slug').trim();
  const businessName = readString(record, 'businessName').trim() || slug;
  return slug ? { slug, businessName } : null;
}

export function parseProfileData(value: OnboardingJson): ProfileDraft | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }

  return {
    name: readString(record, 'name'),
    description: readString(record, 'description'),
    phone: readString(record, 'phone'),
    email: readString(record, 'email'),
    address: readString(record, 'address'),
  };
}

export function parseServicesData(value: OnboardingJson): ServiceDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = getRecord(item);
    if (!record) {
      return [];
    }

    const name = readString(record, 'name');
    const durationMinutes = readNumber(record, 'durationMinutes');
    const priceCzk = readNumber(record, 'priceCzk');

    if (!name || durationMinutes === null || priceCzk === null) {
      return [];
    }

    return [{ name, durationMinutes, priceCzk }];
  });
}

export function defaultHoursData(): HoursDraft[] {
  return WEEK_DAYS.map(({ dayOfWeek }) => ({
    dayOfWeek,
    isOpen: dayOfWeek < 5,
    opensAt: DEFAULT_OPEN_TIME,
    closesAt: DEFAULT_CLOSE_TIME,
  }));
}

export function parseHoursData(value: OnboardingJson): HoursDraft[] {
  if (!Array.isArray(value)) {
    return defaultHoursData();
  }

  const byDay = new Map<number, HoursDraft>();

  value.forEach((item) => {
    const record = getRecord(item);
    if (!record) {
      return;
    }

    const dayOfWeek = readNumber(record, 'dayOfWeek');
    if (dayOfWeek === null || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return;
    }

    byDay.set(dayOfWeek, {
      dayOfWeek,
      isOpen: readBoolean(record, 'isOpen') ?? false,
      opensAt: readString(record, 'opensAt') || DEFAULT_OPEN_TIME,
      closesAt: readString(record, 'closesAt') || DEFAULT_CLOSE_TIME,
    });
  });

  return defaultHoursData().map((fallback) => byDay.get(fallback.dayOfWeek) ?? fallback);
}

export function validateProfile(input: ProfileDraft): ValidationResult<ProfileDraft> {
  const data = {
    name: input.name.trim(),
    description: input.description.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    address: input.address.trim(),
  };
  const fieldErrors: Record<string, string> = {};

  if (!data.name) {
    fieldErrors.name = 'Zadejte název podniku.';
  }

  if (!data.description) {
    fieldErrors.description = 'Zadejte krátký popis podniku.';
  } else if (data.description.length > 400) {
    fieldErrors.description = 'Popis může mít nejvýše 400 znaků.';
  }

  if (!data.phone) {
    fieldErrors.phone = 'Zadejte telefon.';
  } else if (!/^\d{9}$/.test(data.phone)) {
    fieldErrors.phone = 'Telefon musí mít přesně 9 číslic.';
  }

  if (!data.email) {
    fieldErrors.email = 'Zadejte kontaktní email.';
  } else if (!validateEmail(data.email)) {
    fieldErrors.email = 'Zadejte platný email.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: Object.values(fieldErrors)[0] ?? 'Zkontrolujte profilové údaje.',
      fieldErrors,
    };
  }

  return { ok: true, data };
}

export function validateServices(input: ServiceDraft[]): ValidationResult<ServiceDraft[]> {
  const normalized: ServiceDraft[] = [];

  for (const service of input) {
    const name = service.name.trim();
    const hasAnyValue = Boolean(name || service.durationMinutes || service.priceCzk);

    if (!hasAnyValue) {
      continue;
    }

    if (!name) {
      return { ok: false, message: 'Zadejte název služby.' };
    }

    if (!Number.isInteger(service.durationMinutes) || service.durationMinutes <= 0) {
      return { ok: false, message: 'Doba trvání musí být kladné celé číslo minut.' };
    }

    if (!Number.isFinite(service.priceCzk) || service.priceCzk < 0) {
      return { ok: false, message: 'Cena musí být nezáporné číslo v Kč.' };
    }

    normalized.push({
      name,
      durationMinutes: service.durationMinutes,
      priceCzk: Math.round(service.priceCzk * 100) / 100,
    });
  }

  if (normalized.length === 0) {
    return { ok: false, message: 'Vyplňte alespoň jednu službu.' };
  }

  return { ok: true, data: normalized };
}

export function validateHours(input: HoursDraft[]): ValidationResult<HoursDraft[]> {
  const normalized = defaultHoursData().map((fallback) => {
    const value = input.find((item) => item.dayOfWeek === fallback.dayOfWeek);
    return value ?? fallback;
  });

  let hasOpenDay = false;

  for (const item of normalized) {
    if (!item.isOpen) {
      continue;
    }

    hasOpenDay = true;

    const opensAt = toMinutes(item.opensAt);
    const closesAt = toMinutes(item.closesAt);
    const dayLabel = WEEK_DAYS[item.dayOfWeek]?.label ?? 'Vybraný den';

    if (opensAt === null || closesAt === null || closesAt <= opensAt) {
      return {
        ok: false,
        message: `${dayLabel}: čas zavření musí být pozdější než čas otevření.`,
      };
    }
  }

  if (!hasOpenDay) {
    return { ok: false, message: 'Nastavte otevírací dobu alespoň pro jeden den.' };
  }

  return { ok: true, data: normalized };
}
