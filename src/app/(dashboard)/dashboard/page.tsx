import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  IconBriefcase,
  IconCalendarEvent,
  IconHourglassEmpty,
  IconLayoutDashboard,
  type IconProps,
} from '@tabler/icons-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ComponentType } from 'react';

type CountLabel = 'businesses' | 'reservations' | 'subscriptions' | 'users';

type Business = {
  id: string;
  slug: string;
  name: string;
  is_published: boolean;
  auto_approve_reservations: boolean;
  allow_parallel_slots: boolean;
};

type Subscription = {
  plan: string | null;
  status: string;
  current_period_end: string | null;
};

const subscriptionLabels: Record<string, string> = {
  active: 'Aktivní',
  deleted_data: 'Data smazána',
  expired: 'Vypršelo',
  free: 'Free',
  grace_period: 'Grace period',
};

function formatCount(value: number | null): string {
  return value === null ? '-' : new Intl.NumberFormat('cs-CZ').format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Bez expirace';
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

async function getCount(table: CountLabel): Promise<number | null> {
  const adminClient = createAdminClient();
  const { count, error } = await adminClient.from(table).select('id', {
    count: 'exact',
    head: true,
  });

  return error ? null : count;
}

async function getBusinessDashboard(userId: string) {
  const adminClient = createAdminClient();
  const { data: business } = await adminClient
    .from('businesses')
    .select('id,slug,name,is_published,auto_approve_reservations,allow_parallel_slots')
    .eq('owner_user_id', userId)
    .maybeSingle<Business>();

  if (!business) {
    redirect('/onboarding/1');
  }

  const [{ data: subscription }, servicesCount, reservationsCount] = await Promise.all([
    adminClient
      .from('subscriptions')
      .select('plan,status,current_period_end')
      .eq('business_id', business.id)
      .maybeSingle<Subscription>(),
    getCountForBusiness('services', business.id),
    getCountForBusiness('reservations', business.id),
  ]);

  return {
    business,
    subscription,
    servicesCount,
    reservationsCount,
  };
}

async function getCountForBusiness(table: 'reservations' | 'services', businessId: string) {
  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);

  return error ? null : count;
}

async function getProfile(userId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('users')
    .select('email,is_admin')
    .eq('id', userId)
    .maybeSingle<{ email: string; is_admin: boolean }>();

  return data;
}

async function AdminDashboard({ email }: { email: string }) {
  const [usersCount, businessesCount, subscriptionsCount, reservationsCount] = await Promise.all([
    getCount('users'),
    getCount('businesses'),
    getCount('subscriptions'),
    getCount('reservations'),
  ]);

  return (
    <DashboardShell email={email}>
      <Notice>
        Admin přehled běží přes stejnou cestu /dashboard. Detailní správa platformy bude navazovat v
        admin-dashboard feature bez samostatné /admin cesty.
      </Notice>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Uživatelé" value={formatCount(usersCount)} />
        <MetricCard label="Podniky" value={formatCount(businessesCount)} />
        <MetricCard label="Předplatná" value={formatCount(subscriptionsCount)} />
        <MetricCard label="Rezervace" value={formatCount(reservationsCount)} />
      </div>
    </DashboardShell>
  );
}

async function BusinessDashboard({ email, userId }: { email: string; userId: string }) {
  const { business, subscription, servicesCount, reservationsCount } =
    await getBusinessDashboard(userId);
  const status = subscription?.status ?? 'free';

  return (
    <DashboardShell email={email} profileSlug={business.slug}>
      {status === 'free' ? (
        <Notice>
          Účet je ve free režimu. Veřejné publikování a placené funkce zapneme po dokončení platební
          části.
        </Notice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Stav"
          value={subscriptionLabels[status] ?? status}
          icon={IconLayoutDashboard}
          bg="var(--color-sunset-pink)"
          href="/dashboard/subscription"
        />
        <MetricCard
          label="Služby"
          value={formatCount(servicesCount)}
          icon={IconBriefcase}
          bg="var(--color-lush-green)"
          href="/dashboard/services"
        />
        <MetricCard
          label="Rezervace"
          value={formatCount(reservationsCount)}
          icon={IconCalendarEvent}
          bg="var(--color-slate-violet)"
          href="/dashboard/reservations"
        />
        <MetricCard
          label="Platnost"
          value={formatDate(subscription?.current_period_end ?? null)}
          icon={IconHourglassEmpty}
          bg="var(--color-air-blue)"
          href="/dashboard/subscription"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
          <div className="space-y-2">
            <Badge>Profil</Badge>
            <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
              Veřejný profil
            </h2>
            <p className="text-sm leading-6 text-[var(--color-slate-text)]">
              Slug profilu je /{business.slug}. Profil bude veřejný po zapnutí publikování.
            </p>
          </div>
          <div className="text-sm font-semibold text-[var(--color-slate-text)]">
            {business.is_published ? (
              <Link
                className="text-[var(--color-action-violet)] hover:underline"
                href={`/${business.slug}`}
              >
                Otevřít veřejný profil
              </Link>
            ) : (
              'Profil zatím není publikovaný'
            )}
          </div>
        </Card>

        <StatusCard
          label="Rezervace"
          title="Schvalování"
          value={
            business.auto_approve_reservations ? 'Automatické schvalování' : 'Ruční schvalování'
          }
        />
        <StatusCard
          label="Dostupnost"
          title="Paralelní termíny"
          value={business.allow_parallel_slots ? 'Povoleno' : 'Zakázáno'}
        />
      </div>
    </DashboardShell>
  );
}

function DashboardShell({
  children,
  email,
  profileSlug,
}: {
  children: React.ReactNode;
  email: string;
  profileSlug?: string;
}) 

  {
  return (
    
    <div className="ahoj flex flex-col gap-[var(--section-gap)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
          Přihlášený účet: {email}
        </p>

        {profileSlug ? (
          <a
            href={`/${profileSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center text-sm font-normal leading-none transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-0 text-[var(--color-canvas-white)] hover:brightness-95 focus-visible:outline-[var(--color-action-violet)] w-full sm:w-auto"
          >
            Zobrazit profil
          </a>
        ) : null}
      </div>

      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  href,
  bg,
  icon: Icon,
}: {
  label: string;
  value: string;
  href?: string;
  bg?: string;
  icon?: ComponentType<IconProps>;
}) {
  const card = (
    <Card
      style={bg ? { backgroundColor: bg } : undefined}
      className={[
        'space-y-2 p-[var(--card-padding)]',
        bg ? 'border border-transparent' : 'border border-[var(--color-border-vychozi)]',
        href ? 'h-full transition-colors' : '',
        href ? 'hover:border-[var(--color-action-violet)]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-slate-text)]">{label}</p>
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-canvas-white)_55%,transparent)] text-[var(--color-rich-violet)]">
            <Icon size={18} stroke={2} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="font-[var(--font-polysans)] text-2xl font-semibold text-[var(--color-rich-violet)]">
        {value}
      </p>
    </Card>
  );

  if (!href) {
    return card;
  }

  return (
    <Link
      href={href}
      className="block rounded-[var(--radius-cards)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
    >
      {card}
    </Link>
  );
}

function StatusCard({ label, title, value }: { label: string; title: string; value: string }) {
  return (
    <Card className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
      <div className="space-y-2">
        <Badge>{label}</Badge>
        <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
          {title}
        </h2>
      </div>
      <p className="text-sm leading-6 text-[var(--color-slate-text)]">{value}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getProfile(user.id);

  if (!profile) {
    redirect('/error');
  }

  if (profile.is_admin) {
    return <AdminDashboard email={profile.email} />;
  }

  return <BusinessDashboard email={profile.email} userId={user.id} />;
}
