-- 운동앱 초기 스키마 (정의서 6장 데이터 모델 초안 기준)
-- 원칙: 모든 사용자 테이블은 RLS로 auth.uid() = user_id 인 행만 보인다.
--       MCP 서버(Edge Function)도 사용자 토큰으로 접근하므로 같은 정책이 그대로 적용된다.
--
-- 설계 메모: 세션의 운동·세트는 jsonb(exercises)로 한 행에 저장한다.
--   앱 오프라인 동기화를 단순하게 하기 위함. 분석·MCP 조회용으로 세트를 행으로 펼친 뷰(session_sets)를 둔다.

-- ---------------------------------------------------------------
-- 공통: updated_at 자동 갱신
-- ---------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  -- 마지막 수정 시각 우선(LWW, 5.2): 앱이 보낸 updated_at이 서버 값보다 오래됐으면 갱신하지 않는다
  if new.updated_at is null then
    new.updated_at := now();
  elsif tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------
-- 운동 라이브러리 (공용, 읽기 전용)
-- ---------------------------------------------------------------
create table public.exercise_library (
  id text primary key,
  name_ko text not null,
  name_en text not null,
  body_parts text[] not null,
  equipment text not null,
  type text not null check (type in ('weighted', 'bodyweight', 'cardio')),
  default_rest_sec int
);
alter table public.exercise_library enable row level security;
create policy "누구나 라이브러리 조회" on public.exercise_library for select to authenticated using (true);

-- ---------------------------------------------------------------
-- 프로필
-- ---------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12 and nickname ~ '^[가-힣A-Za-z0-9_]+$'),
  goal text not null check (goal in ('muscle', 'strength', 'fat_loss', 'health')),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  weekly_freq int not null check (weekly_freq between 1 and 7),
  equipment text[] not null default '{}',
  -- 키·체중은 별도 선택 동의(consent_body) 시에만 저장 (5.7)
  consent_body boolean not null default false,
  height_cm numeric(5, 1),
  weight_kg numeric(5, 1),
  unit text not null default 'kg' check (unit in ('kg', 'lb')),
  default_rest_sec int not null default 90 check (default_rest_sec between 10 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, -- 탈퇴 요청 시각. 30일 뒤 영구 삭제 (5.1)
  constraint body_needs_consent check (consent_body or (height_cm is null and weight_kg is null))
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 커스텀 운동
-- ---------------------------------------------------------------
create table public.custom_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name_ko text not null check (char_length(name_ko) between 1 and 40),
  name_en text not null default '',
  body_parts text[] not null,
  equipment text not null,
  type text not null check (type in ('weighted', 'bodyweight', 'cardio')),
  default_rest_sec int,
  updated_at timestamptz not null default now()
);
create trigger custom_exercises_touch before update on public.custom_exercises
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 루틴 (Claude 제안은 status = 'proposed'로 들어오고, 앱에서 승인해야 active)
-- ---------------------------------------------------------------
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  source text not null check (source in ('manual', 'template', 'claude')),
  status text not null check (status in ('proposed', 'active', 'archived')),
  -- [{ exerciseId, targetSets, targetReps, targetWeight?, restSec? }]
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_user_idx on public.routines (user_id, updated_at desc);
create trigger routines_touch before update on public.routines
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- 세션
-- ---------------------------------------------------------------
create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete set null,
  started_at timestamptz not null check (started_at <= now() + interval '1 minute'), -- 미래 날짜 불가 (5.2)
  ended_at timestamptz,
  end_reason text check (end_reason in ('manual', 'auto')),
  memo text check (char_length(memo) <= 1000),
  -- [{ id, exerciseId, restSec?, sets: [{ id, kind, weight, reps, durationSec?, rpe?, completedAt?, restActualSec? }] }]
  exercises jsonb not null default '[]' check (jsonb_typeof(exercises) = 'array'),
  updated_at timestamptz not null default now()
);
create index sessions_user_started_idx on public.sessions (user_id, started_at desc);
create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();

-- 세트를 행으로 펼친 뷰 (RLS는 security_invoker로 원본 테이블 정책을 따른다)
create view public.session_sets with (security_invoker = true) as
select
  s.user_id,
  s.id as session_id,
  s.started_at,
  e ->> 'exerciseId' as exercise_id,
  (x ->> 'kind') as kind,
  (x ->> 'weight')::numeric as weight_kg,
  (x ->> 'reps')::int as reps,
  (x ->> 'rpe')::numeric as rpe,
  (x ->> 'restActualSec')::int as rest_actual_sec
from public.sessions s
cross join lateral jsonb_array_elements(s.exercises) e
cross join lateral jsonb_array_elements(e -> 'sets') x
where s.ended_at is not null;

-- ---------------------------------------------------------------
-- 개인 기록 (PR)
-- ---------------------------------------------------------------
create table public.personal_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null,
  type text not null check (type in ('max_weight', 'e1rm', 'volume')),
  value numeric not null,
  session_id uuid,
  set_id uuid,
  achieved_at timestamptz not null,
  primary key (user_id, exercise_id, type)
);

-- ---------------------------------------------------------------
-- Claude(MCP) 연결 상태와 감사 로그 (5.5)
-- ---------------------------------------------------------------
create table public.mcp_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  first_connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.mcp_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool text not null,
  is_write boolean not null default false,
  ok boolean not null,
  detail text,
  called_at timestamptz not null default now()
);
create index mcp_audit_user_idx on public.mcp_audit_log (user_id, called_at desc);

-- ---------------------------------------------------------------
-- RLS: 본인 행만
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'custom_exercises', 'routines', 'sessions', 'personal_records', 'mcp_connections', 'mcp_audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "본인 데이터만" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;

-- 감사 로그는 사용자가 지우거나 고칠 수 없게: 조회·추가만 허용
drop policy "본인 데이터만" on public.mcp_audit_log;
create policy "본인 로그 조회" on public.mcp_audit_log for select to authenticated using ((select auth.uid()) = user_id);
create policy "본인 로그 추가" on public.mcp_audit_log for insert to authenticated with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- MCP 헬퍼 함수 (사용자 권한으로 실행: security invoker)
-- ---------------------------------------------------------------

-- 연결 기록 + 호출 제한 확인을 한 번에. 제한 초과 시 예외 (분당 60회, 쓰기 일 50회)
create or replace function public.mcp_begin_call(p_tool text, p_is_write boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  per_min int;
  writes_today int;
begin
  insert into mcp_connections (user_id) values (auth.uid())
  on conflict (user_id) do update set last_seen_at = now();

  select count(*) into per_min from mcp_audit_log
   where user_id = auth.uid() and called_at > now() - interval '1 minute';
  if per_min >= 60 then
    raise exception 'rate_limited: 분당 호출 한도(60회)를 넘었어요' using errcode = 'P0429';
  end if;

  if p_is_write then
    select count(*) into writes_today from mcp_audit_log
     where user_id = auth.uid() and is_write and ok and called_at > now() - interval '1 day';
    if writes_today >= 50 then
      raise exception 'rate_limited: 쓰기 일일 한도(50회)를 넘었어요' using errcode = 'P0429';
    end if;
  end if;
end $$;

-- 탈퇴 요청: 즉시 비활성화(deleted_at), Claude 연결 기록 제거
create or replace function public.request_account_deletion()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update profiles set deleted_at = now() where user_id = auth.uid();
  delete from mcp_connections where user_id = auth.uid();
end $$;

-- 30일 지난 탈퇴 계정 영구 삭제 (service_role / pg_cron 에서 실행)
create or replace function public.purge_deleted_accounts()
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare n int;
begin
  with gone as (
    delete from auth.users u
     using public.profiles p
     where p.user_id = u.id and p.deleted_at < now() - interval '30 days'
    returning u.id
  )
  select count(*) into n from gone;
  return n;
end $$;
revoke all on function public.purge_deleted_accounts() from public, anon, authenticated;

-- pg_cron 확장을 켰다면 매일 새벽 4시(UTC 19시)에 실행:
-- select cron.schedule('purge-deleted-accounts', '0 19 * * *', $$select public.purge_deleted_accounts()$$);

-- 닉네임 중복 확인 (RLS로 남의 프로필은 안 보이므로 definer 함수로 존재 여부만 알려준다)
create or replace function public.nickname_taken(p_nickname text, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where nickname = p_nickname and user_id is distinct from p_except);
$$;
revoke all on function public.nickname_taken(text, uuid) from public, anon;
grant execute on function public.nickname_taken(text, uuid) to authenticated;
