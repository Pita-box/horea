import { IconArrowUpRight } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { JsonLdLocalBusiness } from '@/components/JsonLdLocalBusiness';
import { LockedBusinessProfile } from '@/components/business/LockedBusinessProfile';
import {
  PublicProfileRenderer,
  type PublicProfileBusiness,
  type PublicProfileEmployee,
  type PublicProfileOpeningHours,
  type PublicProfileService,
} from '@/components/PublicProfileRenderer';
import { ReservationFormController } from '@/components/reservation/ReservationFormController';
import type { ReservationService } from '@/components/reservation/types';
import { isBusinessOpenNow } from '@/lib/business/open-status';
import { isReservedSlug, normalizeRouteSlug } from '@/lib/slug/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';

/**
 * Veřejná stránka podniku `/{slug}` (úkol 3.2) + SEO metadata (úkol 4.1).
 *
 * Routa je generována s ISR (R15.2): po revalidaci (on-demand z
 * `services-and-availability` nebo fallback TTL) se při dalším requestu
 * přerenderuje. Čtení běží výhradně pod anon Supabase klíčem bez cookies
 * (`createPublicClient`), takže routa zůstává staticky cachovatelná (R15.3).
 *
 * Stavy stránky se rozhodují deterministicky podle designu „404 vs nepublikovaný
 * profil": rezervovaný slug → 404, neexistující business → 404, existující ale
 * nepublikovaný → 200 jen s názvem + hláškou (noindex), publikovaný → plný
 * profil + JSON-LD + OG tagy.
 */

/** Fallback ISR TTL 60 s (R15.2 / design „ISR strategie"). */
export const revalidate = 60;

/** Slugy nejsou předgenerované — generují se on-demand při prvním requestu. */
export const dynamicParams = true;

/** Kanonická produkční doména (shodná s `app/sitemap.ts` a `JsonLdLocalBusiness`). */
const SITE_URL = 'https://www.horea.cz';

/** Maximální délka `<meta name="description">` (R12.1). */
const META_DESCRIPTION_LIMIT = 155;

type RouteParams = { slug: string };

/** Bezpečný stav z RPC `get_public_business_state` (bez citlivých polí). */
type BusinessState = {
  id: string;
  name: string;
  published: boolean;
};

type PublishedProfile = {
  business: PublicProfileBusiness;
  services: PublicProfileService[];
  openingHours: PublicProfileOpeningHours[];
  employees: PublicProfileEmployee[];
  serviceEmployees: Record<string, { id: string; name: string; photoUrl: string | null }[]>;
  allowEmployeeSelection: boolean;
};

/** Řádky tak, jak je vrací Supabase (snake_case) — mapují se na camelCase props. */
type BusinessRow = {
  name: string;
  type: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  cover_position: number | null;
  phone: string | null;
  contact_email: string | null;
  address: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  google_url: string | null;
  show_team_public: boolean | null;
  allow_employee_selection: boolean | null;
};

type EmployeeRow = { id: string; name: string; role: string | null; photo_url: string | null };

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_czk: number;
  description: string | null;
  created_at: string;
};

type OpeningHoursRow = {
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

/**
 * Detekce stavu profilu (404 / nepublikováno / publikováno) přes SECURITY DEFINER
 * RPC, která nevrací citlivá pole nepublikovaného podniku.
 *
 * Obaleno `cache()`, aby `Page` i `generateMetadata` v rámci jednoho requestu
 * sdílely jediné volání (Next dedupe by POST RPC sám nepokryl).
 */
const getBusinessState = cache(async (slug: string): Promise<BusinessState | null> => {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .rpc('get_public_business_state', { p_slug: slug })
    .maybeSingle<BusinessState>();

  // Chyba RPC při detekci stavu je skutečná serverová chyba (ne 404) — necháme
  // ji probublat do error boundary, ať se nemaskuje jako neexistující stránka.
  if (error) {
    throw error;
  }

  return data;
});

/**
 * Načte plný profil publikovaného podniku (anon RLS vrací jen publikované řádky).
 * Vrací `null`, pokud business mezitím zmizel z dosahu anon klíče (race s
 * odpublikováním) → volající použije `notFound()` defenzivně.
 *
 * Obaleno `cache()`: `generateMetadata` potřebuje název/popis/logo a `Page`
 * potřebuje celý profil — díky cache se třízdrojový load provede jen jednou.
 */
const loadProfileWith = async (
  supabase: ReturnType<typeof createPublicClient>,
  businessId: string,
): Promise<PublishedProfile | null> => {
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select(
      'name, type, description, logo_url, cover_url, cover_position, phone, contact_email, address, facebook_url, instagram_url, youtube_url, google_url, show_team_public, allow_employee_selection',
    )
    .eq('id', businessId)
    .maybeSingle<BusinessRow>();

  if (businessError) {
    throw businessError;
  }
  if (!business) {
    return null;
  }

  const { data: serviceRows, error: servicesError } = await supabase
    .from('services')
    .select('id, name, duration_minutes, price_czk, description, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })
    .returns<ServiceRow[]>();

  if (servicesError) {
    throw servicesError;
  }

  const { data: hoursRows, error: hoursError } = await supabase
    .from('opening_hours')
    .select('day_of_week, opens_at, closes_at')
    .eq('business_id', businessId)
    .returns<OpeningHoursRow[]>();

  if (hoursError) {
    throw hoursError;
  }

  // Tým („Náš tým") a/nebo výběr zaměstnance — načteme zaměstnance, když je
  // potřeba alespoň jedno; anon RLS pustí jen publikované podniky.
  const wantEmployees = Boolean(business.show_team_public) || Boolean(business.allow_employee_selection);
  let allEmployees: EmployeeRow[] = [];
  if (wantEmployees) {
    const { data: employeeRows } = await supabase
      .from('employees')
      .select('id, name, role, photo_url')
      .eq('business_id', businessId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<EmployeeRow[]>();
    allEmployees = employeeRows ?? [];
  }

  // Tým na profilu jen když je zapnuté zobrazení; výběr v rezervaci nezávisle.
  const employees: PublicProfileEmployee[] = business.show_team_public
    ? allEmployees.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        photoUrl: row.photo_url,
      }))
    : [];

  // Per-služba dostupní zaměstnanci pro výběr v rezervaci (jen když je povolen).
  // Bez přiřazení u služby → všichni zaměstnanci.
  const serviceEmployees: Record<string, { id: string; name: string; photoUrl: string | null }[]> =
    {};
  if (business.allow_employee_selection && allEmployees.length > 0) {
    const serviceIds = (serviceRows ?? []).map((row) => row.id);
    const assignedByService = new Map<string, Set<string>>();
    if (serviceIds.length > 0) {
      const { data: links } = await supabase
        .from('service_employees')
        .select('service_id, employee_id')
        .in('service_id', serviceIds)
        .returns<{ service_id: string; employee_id: string }[]>();
      for (const link of links ?? []) {
        const set = assignedByService.get(link.service_id) ?? new Set<string>();
        set.add(link.employee_id);
        assignedByService.set(link.service_id, set);
      }
    }
    for (const id of serviceIds) {
      const assigned = assignedByService.get(id);
      const list = assigned ? allEmployees.filter((e) => assigned.has(e.id)) : allEmployees;
      serviceEmployees[id] = list.map((e) => ({ id: e.id, name: e.name, photoUrl: e.photo_url }));
    }
  }

  return {
    business: {
      name: business.name,
      type: business.type,
      description: business.description,
      logoUrl: business.logo_url,
      coverUrl: business.cover_url,
      coverPosition: business.cover_position ?? 50,
      phone: business.phone,
      contactEmail: business.contact_email,
      address: business.address,
      facebookUrl: business.facebook_url,
      instagramUrl: business.instagram_url,
      youtubeUrl: business.youtube_url,
      googleUrl: business.google_url,
    },
    services: (serviceRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      durationMinutes: row.duration_minutes,
      priceCzk: row.price_czk,
      description: row.description,
      createdAt: row.created_at,
    })),
    openingHours: (hoursRows ?? []).map((row) => ({
      dayOfWeek: row.day_of_week,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
    })),
    employees,
    serviceEmployees,
    allowEmployeeSelection: Boolean(business.allow_employee_selection),
  };
};

/**
 * Profil publikovaného podniku přes anon klienta (RLS pustí jen publikované).
 * `cache()` sdílí jediné volání mezi `generateMetadata` a `Page`.
 */
const loadPublishedProfile = cache(
  (businessId: string): Promise<PublishedProfile | null> =>
    loadProfileWith(createPublicClient(), businessId),
);

/**
 * Plný profil pro PŘIHLÁŠENÉHO MAJITELE jeho NEPUBLIKOVANÉHO podniku přes admin
 * klienta (service role, jen server). Bez cache — owner render je dynamický
 * (čte session) a nikdy se necachuje.
 */
const loadOwnerProfile = (businessId: string): Promise<PublishedProfile | null> =>
  loadProfileWith(createAdminClient() as unknown as ReturnType<typeof createPublicClient>, businessId);

/** Teaser pole nepublikovaného podniku pro „zamčený" veřejný náhled (server-only). */
type BusinessTeaser = {
  type: string;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string | null;
  openingHours: { dayOfWeek: number; opensAt: string; closesAt: string }[];
};

async function loadBusinessTeaser(businessId: string): Promise<BusinessTeaser> {
  const supabase = createAdminClient();
  const { data: business } = await supabase
    .from('businesses')
    .select('type, logo_url, cover_url, phone')
    .eq('id', businessId)
    .maybeSingle<{ type: string; logo_url: string | null; cover_url: string | null; phone: string | null }>();
  const { data: hours } = await supabase
    .from('opening_hours')
    .select('day_of_week, opens_at, closes_at')
    .eq('business_id', businessId)
    .returns<OpeningHoursRow[]>();

  return {
    type: business?.type ?? 'ostatni',
    logoUrl: business?.logo_url ?? null,
    coverUrl: business?.cover_url ?? null,
    phone: business?.phone ?? null,
    openingHours: (hours ?? []).map((row) => ({
      dayOfWeek: row.day_of_week,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
    })),
  };
}

/**
 * Vrací `true`, pokud je aktuálně přihlášený uživatel majitelem daného podniku.
 * Čte session přes cookies (zdynamičtí render — ale jen ve větvi „nepublikováno",
 * která je stejně noindex). Vlastnictví ověří admin klientem proti `owner_user_id`.
 */
async function viewerOwnsBusiness(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from('businesses')
    .select('owner_user_id')
    .eq('id', businessId)
    .maybeSingle<{ owner_user_id: string }>();
  return data?.owner_user_id === user.id;
}

/** Metadata pro nepublikovaný profil i 404: pouze noindex, žádné OG/JSON-LD (R2.3, R3.3, R12.4). */
const NOINDEX_METADATA: Metadata = {
  robots: { index: false, follow: false },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const slug = normalizeRouteSlug((await params).slug);

  // Rezervovaný slug se chová jako 404 (R3.2, R3.3).
  if (isReservedSlug(slug)) {
    return NOINDEX_METADATA;
  }

  const state = await getBusinessState(slug);

  // 404 (žádný řádek) i nepublikovaný profil → noindex (R2.3, R3.3, R12.4).
  if (!state || !state.published) {
    return NOINDEX_METADATA;
  }

  const profile = await loadPublishedProfile(state.id);

  // Race s odpublikováním mezi detekcí stavu a načtením profilu → noindex.
  if (!profile) {
    return NOINDEX_METADATA;
  }

  const { business } = profile;
  const canonical = `${SITE_URL}/${slug}`;
  const title = `${business.name} — rezervace online`;
  const description = (business.description ?? '').slice(0, META_DESCRIPTION_LIMIT);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      // og:image jen pokud má podnik logo (R12.2).
      ...(business.logoUrl ? { images: [{ url: business.logoUrl }] } : {}),
    },
  };
}

export default async function Page({ params }: { params: Promise<RouteParams> }) {
  const slug = normalizeRouteSlug((await params).slug);

  // Rezervovaný slug nikdy nesmí maskovat systémovou routu profilem (R3.2).
  if (isReservedSlug(slug)) {
    notFound();
  }

  const state = await getBusinessState(slug);

  // Business s daným slugem neexistuje → 404 (R3.1).
  if (!state) {
    notFound();
  }

  // Nepublikovaný profil (noindex zajišťuje `generateMetadata`):
  //  - přihlášený MAJITEL → plný profil v náhledu + výzva k aktivaci tarifu + vypnutá rezervace,
  //  - ostatní (nepřihlášení / cizí) → „zamčený" teaser.
  if (!state.published) {
    if (await viewerOwnsBusiness(state.id)) {
      const ownerProfile = await loadOwnerProfile(state.id);
      if (ownerProfile) {
        const {
          business,
          services,
          openingHours,
          employees,
          serviceEmployees,
          allowEmployeeSelection,
        } = ownerProfile;
        const reservationServices: ReservationService[] = services.map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          priceCzk: service.priceCzk,
          description: service.description,
        }));
        return (
          <>
            <PublicProfileRenderer
              business={business}
              services={services}
              openingHours={openingHours}
              employees={employees}
              isOpenNow={isBusinessOpenNow(openingHours)}
              reservationForm={
                <ReservationFormController
                  slug={slug}
                  services={reservationServices}
                  serviceEmployees={serviceEmployees}
                  allowEmployeeSelection={allowEmployeeSelection}
                  preview
                />
              }
            />
            <OwnerUpgradeBanner />
          </>
        );
      }
    }

    const teaser = await loadBusinessTeaser(state.id);
    return (
      <LockedBusinessProfile
        slug={slug}
        name={state.name}
        type={teaser.type}
        logoUrl={teaser.logoUrl}
        coverUrl={teaser.coverUrl}
        phone={teaser.phone}
        openingHours={teaser.openingHours}
      />
    );
  }

  const profile = await loadPublishedProfile(state.id);

  // Defenzivně: profil mezitím přestal být publikovaný (race s odpublikováním).
  if (!profile) {
    notFound();
  }

  const { business, services, openingHours, employees, serviceEmployees, allowEmployeeSelection } =
    profile;

  // Mapování na minimální tvar, který potřebuje rezervační formulář.
  const reservationServices: ReservationService[] = services.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.durationMinutes,
    priceCzk: service.priceCzk,
    description: service.description,
  }));

  return (
    <>
      {/* JSON-LD LocalBusiness jen pro publikovaný profil (R12.3, R12.4). */}
      <JsonLdLocalBusiness
        slug={slug}
        name={business.name}
        logoUrl={business.logoUrl}
        address={business.address}
        phone={business.phone}
        contactEmail={business.contactEmail}
        openingHours={openingHours}
      />
      <PublicProfileRenderer
        business={business}
        services={services}
        openingHours={openingHours}
        employees={employees}
        isOpenNow={isBusinessOpenNow(openingHours)}
        reservationForm={
          <ReservationFormController
            slug={slug}
            services={reservationServices}
            serviceEmployees={serviceEmployees}
            allowEmployeeSelection={allowEmployeeSelection}
          />
        }
      />
    </>
  );
}

/**
 * Plovoucí obdélníkový banner vpravo dole pro majitele v náhledu nepublikovaného
 * profilu — proklik na výběr tarifu (`/dashboard/plans`).
 */
function OwnerUpgradeBanner() {
  return (
    <Link
      href="/dashboard/plans"
      className="fixed bottom-5 right-5 z-50 flex max-w-[320px] items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--color-action-violet)] bg-[var(--color-action-violet)] px-5 py-4 text-[var(--color-canvas-white)] shadow-lg transition-opacity hover:opacity-90"
    >
      <IconArrowUpRight size={22} stroke={2} aria-hidden="true" className="mt-[2px] shrink-0" />
      <span className="flex flex-col gap-[2px]">
        <span className="text-[16px] font-semibold leading-[1.2]">Profil je zatím skrytý</span>
        <span className="text-[14px] leading-[1.3] text-[color-mix(in_srgb,var(--color-canvas-white)_88%,transparent)]">
          Aktivujte tarif a zveřejněte profil zákazníkům.
        </span>
      </span>
    </Link>
  );
}
