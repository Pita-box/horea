alter table public.businesses
  add column if not exists phone text,
  add column if not exists contact_email text,
  add column if not exists address text;

create or replace function public.commit_onboarding(uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  draft public.onboarding_drafts%rowtype;
  business_id uuid;
  type_value text;
  slug_value text;
  name_value text;
  description_value text;
  phone_value text;
  email_value text;
  address_value text;
  service_item jsonb;
  service_name text;
  service_duration integer;
  service_price numeric(10, 2);
  service_count integer := 0;
  hour_item jsonb;
  hour_day integer;
  hour_is_open boolean;
  hour_opens time;
  hour_closes time;
  open_hour_count integer := 0;
begin
  if uid is null or auth.uid() is null or uid <> auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select *
  into draft
  from public.onboarding_drafts
  where user_id = uid
  for update;

  if not found then
    raise exception 'draft_missing' using errcode = '22023';
  end if;

  if draft.current_step < 5 then
    raise exception 'draft_incomplete' using errcode = '22023';
  end if;

  if jsonb_typeof(draft.type_data) is distinct from 'object' then
    raise exception 'type_data_invalid' using errcode = '22023';
  end if;

  type_value := draft.type_data ->> 'type';
  if type_value not in ('kadernik', 'nehtove_studio', 'bistro', 'masazni_salon', 'spa', 'beauty', 'ostatni') then
    raise exception 'type_data_invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(draft.slug_data) is distinct from 'object' then
    raise exception 'slug_data_invalid' using errcode = '22023';
  end if;

  slug_value := btrim(draft.slug_data ->> 'slug');
  if slug_value is null
    or slug_value !~ '^[a-z0-9-]{3,50}$'
    or slug_value like '-%'
    or slug_value like '%-'
    or slug_value like '%--%'
    or slug_value = any(array[
      'admin', 'api', 'login', 'register', 'logout', 'dashboard', 'app', 'www', 'mail',
      'verify-email', 'forgot-password', 'reset-password', 'onboarding', 'settings', 'billing',
      'components', 'support', 'help'
    ]) then
    raise exception 'slug_data_invalid' using errcode = '22023';
  end if;

  if exists (select 1 from public.businesses where slug = slug_value) then
    raise unique_violation using message = 'slug_taken';
  end if;

  if jsonb_typeof(draft.profile_data) is distinct from 'object' then
    raise exception 'profile_data_invalid' using errcode = '22023';
  end if;

  name_value := nullif(btrim(draft.profile_data ->> 'name'), '');
  description_value := nullif(btrim(draft.profile_data ->> 'description'), '');
  phone_value := nullif(btrim(draft.profile_data ->> 'phone'), '');
  email_value := nullif(lower(btrim(draft.profile_data ->> 'email')), '');
  address_value := nullif(btrim(draft.profile_data ->> 'address'), '');

  if name_value is null
    or description_value is null
    or phone_value is null
    or email_value is null
    or position('@' in email_value) < 2 then
    raise exception 'profile_data_invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(draft.services_data) is distinct from 'array' then
    raise exception 'services_data_invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(draft.hours_data) is distinct from 'array' then
    raise exception 'hours_data_invalid' using errcode = '22023';
  end if;

  insert into public.businesses (
    owner_user_id,
    slug,
    name,
    type,
    description,
    phone,
    contact_email,
    address,
    is_published
  ) values (
    uid,
    slug_value,
    name_value,
    type_value::public.business_type,
    description_value,
    phone_value,
    email_value,
    address_value,
    false
  ) returning id into business_id;

  for service_item in select value from jsonb_array_elements(draft.services_data)
  loop
    if jsonb_typeof(service_item) is distinct from 'object' then
      raise exception 'services_data_invalid' using errcode = '22023';
    end if;

    service_name := nullif(btrim(service_item ->> 'name'), '');
    service_duration := (service_item ->> 'durationMinutes')::integer;
    service_price := (service_item ->> 'priceCzk')::numeric(10, 2);

    if service_name is null or service_duration <= 0 or service_price < 0 then
      raise exception 'services_data_invalid' using errcode = '22023';
    end if;

    insert into public.services (business_id, name, duration_minutes, price_czk)
    values (business_id, service_name, service_duration, service_price);

    service_count := service_count + 1;
  end loop;

  if service_count = 0 then
    raise exception 'services_data_invalid' using errcode = '22023';
  end if;

  for hour_item in select value from jsonb_array_elements(draft.hours_data)
  loop
    if jsonb_typeof(hour_item) is distinct from 'object' then
      raise exception 'hours_data_invalid' using errcode = '22023';
    end if;

    hour_is_open := coalesce((hour_item ->> 'isOpen')::boolean, false);

    if hour_is_open then
      hour_day := (hour_item ->> 'dayOfWeek')::integer;
      hour_opens := (hour_item ->> 'opensAt')::time;
      hour_closes := (hour_item ->> 'closesAt')::time;

      if hour_day < 0 or hour_day > 6 or hour_opens >= hour_closes then
        raise exception 'hours_data_invalid' using errcode = '22023';
      end if;

      insert into public.opening_hours (business_id, day_of_week, opens_at, closes_at)
      values (business_id, hour_day, hour_opens, hour_closes);

      open_hour_count := open_hour_count + 1;
    end if;
  end loop;

  if open_hour_count = 0 then
    raise exception 'hours_data_invalid' using errcode = '22023';
  end if;

  insert into public.subscriptions (business_id, status)
  values (business_id, 'free');

  delete from public.onboarding_drafts
  where user_id = uid;

  return business_id;
end;
$$;

revoke all on function public.commit_onboarding(uuid) from public;
grant execute on function public.commit_onboarding(uuid) to authenticated;

comment on function public.commit_onboarding(uuid) is 'Atomically converts an authenticated user onboarding draft into a free unpublished business profile.';
