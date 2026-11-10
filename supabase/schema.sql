-- 사용자 프로필은 Supabase Auth 계정과 같은 수명 주기로 관리합니다.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  diet_preference text not null default '',
  default_servings smallint not null default 2 check (default_servings between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 저장 레시피는 소유 사용자별로 중복을 막고 JSON 스냅샷을 보관합니다.
create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_hash text not null check (length(recipe_hash) = 64),
  title text not null,
  recipe jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_hash)
);

-- 프로필과 저장 레시피의 최신 데이터를 빠르게 불러옵니다.
create index if not exists saved_recipes_user_created_idx
  on public.saved_recipes (user_id, created_at desc);

-- API 서버 외의 클라이언트가 개인 테이블을 직접 조회하지 못하도록 RLS를 켭니다.
alter table public.profiles enable row level security;
alter table public.saved_recipes enable row level security;

-- 가입 즉시 기본 프로필을 생성해 프로필 화면이 비어 있지 않게 합니다.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 신규 Auth 계정 생성 때 기본 프로필 트리거를 실행합니다.
drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

-- 프로필·레시피 테이블은 서버의 service_role로만 관리합니다.
revoke all on public.profiles from anon, authenticated;
revoke all on public.saved_recipes from anon, authenticated;
grant all on public.profiles to service_role;
grant all on public.saved_recipes to service_role;
