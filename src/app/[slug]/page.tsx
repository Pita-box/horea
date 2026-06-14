import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { JsonLdLocalBusiness } from '@/components/JsonLdLocalBusiness';
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
import { createPublicClient } from '@/lib/supabase/public';

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

const UNPUBLISHED_MESSAGE = 'Tento podnik zatím nepublikoval svůj profil.';

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
const loadPublishedProfile = cache(async (businessId: string): Promise<PublishedProfile | null> => {
  const supabase = createPublicClient();

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
});

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

  // Nepublikovaný profil: HTTP 200, jen název + hláška (R2.1, R2.2). noindex
  // zajišťuje `generateMetadata`.
  if (!state.published) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-[560px] flex-col items-center justify-center gap-[12px] px-[16px] py-[48px] text-center">
        <h1 className="text-[28px] font-semibold leading-[1.1] text-[var(--color-rich-violet)]">
          {state.name}
        </h1>
        <p className="text-[16px] text-[var(--color-slate-text)]">{UNPUBLISHED_MESSAGE}</p>
      </main>
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
