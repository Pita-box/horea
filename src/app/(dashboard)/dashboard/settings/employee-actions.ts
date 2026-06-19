'use server';

import 'server-only';

import { revalidatePublicPage } from '@/lib/revalidate';
import { fromPragueInput } from '@/lib/datetime';
import { todayPragueDate } from '@/lib/reservations/calendar';
import {
  buildMonthGrid,
  openMinutesByWeekday,
  pragueWeekdayIndex,
} from '@/lib/reservations/occupancy';
import { processImageToWebp } from '@/lib/media/process-image';
import { r2DeleteObject, r2PublicUrl, r2PutObject } from '@/lib/storage/r2';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';
const BUSINESS_MISSING_ERROR = 'Nejdřív dokončete onboarding podniku.';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type Employee = {
  id: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
};

export type TeamSettings = {
  showTeamPublic: boolean;
  allowEmployeeSelection: boolean;
};

export type EmployeesResult =
  | { ok: true; employees: Employee[]; settings: TeamSettings }
  | { ok: false; message: string };

export type MutationResult = { ok: true } | { ok: false; message: string };

type OwnerBusiness = { id: string; slug: string };

async function getOwnerBusiness(): Promise<
  { ok: true; business: OwnerBusiness } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: 'Přihlaste se prosím znovu.' };
  }

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id,slug,show_team_public,allow_employee_selection')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string; slug: string }>();

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!business) {
    return { ok: false, message: BUSINESS_MISSING_ERROR };
  }

  return { ok: true, business };
}

type EmployeeRow = { id: string; name: string; role: string | null; photo_url: string | null };

export async function getEmployees(): Promise<EmployeesResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return owner;
  }

  const admin = createAdminClient();
  const [{ data: rows, error }, { data: biz }] = await Promise.all([
    admin
      .from('employees')
      .select('id,name,role,photo_url')
      .eq('business_id', owner.business.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<EmployeeRow[]>(),
    admin
      .from('businesses')
      .select('show_team_public,allow_employee_selection')
      .eq('id', owner.business.id)
      .maybeSingle<{ show_team_public: boolean; allow_employee_selection: boolean }>(),
  ]);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  return {
    ok: true,
    employees: (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      photoUrl: r.photo_url,
    })),
    settings: {
      showTeamPublic: biz?.show_team_public ?? false,
      allowEmployeeSelection: biz?.allow_employee_selection ?? false,
    },
  };
}

/** Ověří, že zaměstnanec patří podniku přihlášeného majitele. */
async function assertEmployeeOwnership(employeeId: string, businessId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('business_id', businessId)
    .maybeSingle<{ id: string }>();
  return Boolean(data);
}

export async function createEmployeeAction(formData: FormData): Promise<MutationResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();

  if (!name) {
    return { ok: false, message: 'Zadejte jméno zaměstnance.' };
  }
  if (name.length > 80 || role.length > 80) {
    return { ok: false, message: 'Jméno a pozice mohou mít nejvýše 80 znaků.' };
  }

  const { error } = await createAdminClient()
    .from('employees')
    .insert({ business_id: owner.business.id, name, role: role || null });

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}

export async function updateEmployeeAction(
  employeeId: string,
  formData: FormData,
): Promise<MutationResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }
  if (!(await assertEmployeeOwnership(employeeId, owner.business.id))) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  if (!name) {
    return { ok: false, message: 'Zadejte jméno zaměstnance.' };
  }
  if (name.length > 80 || role.length > 80) {
    return { ok: false, message: 'Jméno a pozice mohou mít nejvýše 80 znaků.' };
  }

  const { error } = await createAdminClient()
    .from('employees')
    .update({ name, role: role || null })
    .eq('id', employeeId);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}

export async function deleteEmployeeAction(employeeId: string): Promise<MutationResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }
  if (!(await assertEmployeeOwnership(employeeId, owner.business.id))) {
    return { ok: false, message: GENERIC_ERROR };
  }

  // Foto z R2 (best-effort) + řádek z DB. reservations.employee_id → NULL (FK).
  try {
    await r2DeleteObject(`${owner.business.id}/employee-${employeeId}.webp`);
  } catch {
    // ignore
  }

  const { error } = await createAdminClient().from('employees').delete().eq('id', employeeId);
  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}

export async function uploadEmployeePhotoAction(
  employeeId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }
  if (!(await assertEmployeeOwnership(employeeId, owner.business.id))) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Vyberte prosím obrázek.' };
  }
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return { ok: false, message: 'Povolené formáty jsou JPG, PNG a WebP.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'Maximální velikost obrázku je 5 MB.' };
  }

  const key = `${owner.business.id}/employee-${employeeId}.webp`;
  try {
    const webp = await processImageToWebp(await file.arrayBuffer(), 'logo');
    await r2PutObject(key, webp, 'image/webp');
  } catch {
    return { ok: false, message: GENERIC_ERROR };
  }

  const url = `${r2PublicUrl(key)}?v=${Date.now()}`;
  const { error } = await createAdminClient()
    .from('employees')
    .update({ photo_url: url })
    .eq('id', employeeId);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true, url };
}

export async function setTeamSettingAction(
  key: 'showTeamPublic' | 'allowEmployeeSelection',
  value: boolean,
): Promise<MutationResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const column = key === 'showTeamPublic' ? 'show_team_public' : 'allow_employee_selection';
  const { error } = await createAdminClient()
    .from('businesses')
    .update({ [column]: value })
    .eq('id', owner.business.id);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}

export type ServiceAssignment = { id: string; name: string; employeeIds: string[] };

export type ServiceAssignmentsResult =
  | { ok: true; services: ServiceAssignment[] }
  | { ok: false; message: string };

export async function getServiceAssignments(): Promise<ServiceAssignmentsResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return owner;
  }

  const admin = createAdminClient();
  const { data: services, error } = await admin
    .from('services')
    .select('id,name')
    .eq('business_id', owner.business.id)
    .order('name', { ascending: true })
    .returns<{ id: string; name: string }[]>();

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const serviceIds = (services ?? []).map((s) => s.id);
  const byService = new Map<string, string[]>();
  if (serviceIds.length > 0) {
    const { data: links } = await admin
      .from('service_employees')
      .select('service_id,employee_id')
      .in('service_id', serviceIds)
      .returns<{ service_id: string; employee_id: string }[]>();
    for (const link of links ?? []) {
      const list = byService.get(link.service_id) ?? [];
      list.push(link.employee_id);
      byService.set(link.service_id, list);
    }
  }

  return {
    ok: true,
    services: (services ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      employeeIds: byService.get(s.id) ?? [],
    })),
  };
}

export async function setServiceEmployeesAction(
  serviceId: string,
  employeeIds: string[],
): Promise<MutationResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const admin = createAdminClient();

  // Služba musí patřit podniku majitele.
  const { data: service } = await admin
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('business_id', owner.business.id)
    .maybeSingle<{ id: string }>();
  if (!service) {
    return { ok: false, message: GENERIC_ERROR };
  }

  // Validace: jen zaměstnanci téhož podniku.
  let validIds: string[] = [];
  if (employeeIds.length > 0) {
    const { data: emps } = await admin
      .from('employees')
      .select('id')
      .eq('business_id', owner.business.id)
      .in('id', employeeIds)
      .returns<{ id: string }[]>();
    validIds = (emps ?? []).map((e) => e.id);
  }

  // Replace: smaž stávající vazby služby a vlož novou množinu.
  const { error: delError } = await admin
    .from('service_employees')
    .delete()
    .eq('service_id', serviceId);
  if (delError) {
    return { ok: false, message: GENERIC_ERROR };
  }

  if (validIds.length > 0) {
    const { error: insError } = await admin
      .from('service_employees')
      .insert(validIds.map((employeeId) => ({ service_id: serviceId, employee_id: employeeId })));
    if (insError) {
      return { ok: false, message: GENERIC_ERROR };
    }
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}

/** Položka žebříčku „TOP zaměstnanci" — efektivita dle obsazenosti tento měsíc. */
export type TopEmployee = {
  id: string;
  name: string;
  /** Počet služeb napříč přiřazenými rezervacemi tohoto měsíce. */
  serviceCount: number;
  /** Celkový rezervovaný čas v minutách (součet délek přiřazených rezervací). */
  totalMinutes: number;
  /** Obsazenost v procentech = rezervovaný čas / otevírací doba měsíce (cap 100). */
  occupancyPct: number;
};

export type TopEmployeesResult =
  | { ok: true; employees: TopEmployee[] }
  | { ok: false; message: string };

/**
 * Žebříček zaměstnanců podle obsazenosti (efektivity) v AKTUÁLNÍM měsíci
 * (Europe/Prague). Obsazenost = součet délek aktivních rezervací (pending/approved)
 * přiřazených zaměstnanci / otevírací doba podniku za měsíc, v procentech (cap 100).
 * Přiřazení se čte z `reservation_employees` (více lidí na rezervaci) s fallbackem
 * na denormalizovaný `reservations.employee_id`. Řadí sestupně dle obsazenosti.
 */
export async function getTopEmployees(): Promise<TopEmployeesResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return owner;
  }

  const admin = createAdminClient();
  const grid = buildMonthGrid(todayPragueDate());
  const firstDay = grid.monthDates[0];
  const lastDay = grid.monthDates[grid.monthDates.length - 1];
  const fromIso = fromPragueInput(`${firstDay}T00:00:00`).toISOString();
  const toIso = fromPragueInput(`${lastDay}T23:59:59`).toISOString();

  const [employeesRes, hoursRes, reservationsRes] = await Promise.all([
    admin
      .from('employees')
      .select('id,name')
      .eq('business_id', owner.business.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<{ id: string; name: string }[]>(),
    admin
      .from('opening_hours')
      .select('day_of_week,opens_at,closes_at')
      .eq('business_id', owner.business.id)
      .returns<{ day_of_week: number; opens_at: string; closes_at: string }[]>(),
    admin
      .from('reservations')
      .select('id,starts_at,ends_at,employee_id')
      .eq('business_id', owner.business.id)
      .gte('starts_at', fromIso)
      .lte('starts_at', toIso)
      .in('status', ['pending', 'approved'])
      .returns<{ id: string; starts_at: string; ends_at: string; employee_id: string | null }[]>(),
  ]);

  if (employeesRes.error || reservationsRes.error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const employees = employeesRes.data ?? [];
  const reservations = reservationsRes.data ?? [];

  // Otevírací doba měsíce = součet otevřených minut přes všechny dny měsíce.
  const openMin = openMinutesByWeekday(hoursRes.data ?? []);
  const monthOpenMinutes = grid.monthDates.reduce(
    (sum, dateISO) => sum + (openMin[pragueWeekdayIndex(dateISO)] ?? 0),
    0,
  );

  const reservationIds = reservations.map((r) => r.id);

  // Přiřazení zaměstnanci na rezervaci (více lidí na jednu rezervaci).
  const assignedByReservation = new Map<string, string[]>();
  if (reservationIds.length > 0) {
    const { data: links } = await admin
      .from('reservation_employees')
      .select('reservation_id,employee_id')
      .in('reservation_id', reservationIds)
      .returns<{ reservation_id: string; employee_id: string }[]>();
    for (const link of links ?? []) {
      const list = assignedByReservation.get(link.reservation_id) ?? [];
      list.push(link.employee_id);
      assignedByReservation.set(link.reservation_id, list);
    }
  }

  // Počet služeb na rezervaci (řádky reservation_services).
  const serviceCountByReservation = new Map<string, number>();
  if (reservationIds.length > 0) {
    const { data: serviceRows } = await admin
      .from('reservation_services')
      .select('reservation_id')
      .in('reservation_id', reservationIds)
      .returns<{ reservation_id: string }[]>();
    for (const row of serviceRows ?? []) {
      serviceCountByReservation.set(
        row.reservation_id,
        (serviceCountByReservation.get(row.reservation_id) ?? 0) + 1,
      );
    }
  }

  const aggregate = new Map<string, { minutes: number; services: number }>();
  for (const reservation of reservations) {
    let assigned = assignedByReservation.get(reservation.id);
    if ((!assigned || assigned.length === 0) && reservation.employee_id) {
      assigned = [reservation.employee_id];
    }
    if (!assigned || assigned.length === 0) {
      continue;
    }
    const minutes = Math.max(
      0,
      Math.round(
        (new Date(reservation.ends_at).getTime() - new Date(reservation.starts_at).getTime()) /
          60_000,
      ),
    );
    const services = serviceCountByReservation.get(reservation.id) ?? 1;
    for (const employeeId of assigned) {
      const current = aggregate.get(employeeId) ?? { minutes: 0, services: 0 };
      current.minutes += minutes;
      current.services += services;
      aggregate.set(employeeId, current);
    }
  }

  const ranked: TopEmployee[] = employees
    .map((employee) => {
      const agg = aggregate.get(employee.id) ?? { minutes: 0, services: 0 };
      const occupancyPct =
        monthOpenMinutes > 0 ? Math.min(100, Math.round((agg.minutes / monthOpenMinutes) * 100)) : 0;
      return {
        id: employee.id,
        name: employee.name,
        serviceCount: agg.services,
        totalMinutes: agg.minutes,
        occupancyPct,
      };
    })
    .sort(
      (a, b) =>
        b.occupancyPct - a.occupancyPct ||
        b.totalMinutes - a.totalMinutes ||
        a.name.localeCompare(b.name, 'cs'),
    );

  return { ok: true, employees: ranked };
}
