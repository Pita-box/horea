'use server';

import 'server-only';

import { revalidatePublicPage } from '@/lib/revalidate';
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
