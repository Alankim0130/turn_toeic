-- ============================================================================
-- DB 크론이 우리 서버(API)를 부르는 길 (2026-09-21 — 첫토익 기능 이식)
--
--   네이버 예약 확인(10분마다)과 유튜브 불라방 감지(30초마다)는 **우리 서버에서** 돈다.
--   네이버·유튜브를 부르고 강사에게 웹 푸시(VAPID 암호화)를 보내는 일은 DB 가 못 하기 때문이다.
--   그래서 pg_cron 이 pg_net 으로 우리 API 를 부른다.
--     - Vercel 크론은 요금제에 따라 하루 한 번만 돌 수 있어 10분·30초 간격을 맡길 수 없다.
--     - Edge Function 은 저장소에 하나도 없다 — 배포 길을 하나 더 만들지 않는다.
--
--   * 부르는 주소: private.app_config 의 site_url. **도메인을 바꾸면 이 한 줄을 고친다** (docs/HANDOVER.md).
--       update private.app_config set value = 'https://새주소' where key = 'site_url';
--   * 비밀: Vault 의 app_cron_secret. **이 마이그레이션이 DB 안에서 새로 만든다** —
--     파일·저장소·환경변수 어디에도 값이 없다. API 는 service_role 로 public.app_cron_secret() 을 읽어
--     x-app-cron-secret 헤더와 비교한다 (timingSafeEqual, src/lib/cron-auth.ts).
--   * pg_net 은 비동기다. cron.job_run_details 의 '성공' 은 "요청을 줄 세웠다" 일 뿐 결과가 아니다.
--     실제 결과는 net._http_response(6시간 보관)와 기능마다의 상태 표(마지막 성공 시각)로 본다
--     (첫토익 문서 공통 원칙 6 — 크론 '성공' 기록을 믿지 말 것).
-- ============================================================================

create extension if not exists pg_net;

-- ─── 1. 부르는 주소 ────────────────────────────────────────────────────────
create table if not exists private.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table private.app_config is
  'DB 가 알아야 하는 앱 설정 (2026-09-21). site_url = pg_cron 이 부르는 우리 사이트 주소 — 도메인을 옮기면 고친다';

insert into private.app_config (key, value)
values ('site_url', 'https://winnertoeic.com')
on conflict (key) do nothing;

revoke all on table private.app_config from public, anon, authenticated;

-- ─── 2. 비밀 — DB 안에서 만든다 ────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'app_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'app_cron_secret',
      'pg_cron 이 우리 API 를 부를 때 붙이는 비밀 (x-app-cron-secret 헤더). 마이그레이션 20260921100500 이 만들었다'
    );
  end if;
end;
$$;

-- 우리 API 가 헤더를 확인할 때 읽는다. **service_role 만** 부를 수 있다
create or replace function public.app_cron_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'app_cron_secret' limit 1
$$;

comment on function public.app_cron_secret() is
  'pg_cron → 우리 API 호출의 비밀. service_role 전용 (API 가 x-app-cron-secret 과 비교한다)';

revoke all on function public.app_cron_secret() from public, anon, authenticated;
grant execute on function public.app_cron_secret() to service_role;

-- ─── 3. 우리 API 부르기 ────────────────────────────────────────────────────
-- 비동기로 POST 한다. 주소나 비밀이 없으면 부르지 않는다 (경고만 남긴다)
create or replace function private.call_app(p_path text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select c.value into v_url from private.app_config c where c.key = 'site_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'app_cron_secret' limit 1;
  if v_url is null or v_secret is null then
    raise warning 'private.call_app: site_url 또는 app_cron_secret 이 없어 % 를 부르지 않았어요', p_path;
    return null;
  end if;
  return net.http_post(
    url                  := rtrim(v_url, '/') || p_path,
    body                 := p_body,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'x-app-cron-secret', v_secret),
    -- 첫 호출은 서버가 깨어나는 시간까지 걸린다. 너무 짧으면 멀쩡한 호출이 끊긴다
    timeout_milliseconds := 30000
  );
end;
$$;

comment on function private.call_app(text, jsonb) is
  'pg_cron 이 우리 API(site_url + 경로)를 비밀 헤더와 함께 비동기로 부른다. 결과는 net._http_response';

revoke all on function private.call_app(text, jsonb) from public, anon, authenticated;

-- ─── 4. 크론 기록 정리 ─────────────────────────────────────────────────────
-- 30초 크론이 생기면 하루 3천 줄 가까이 쌓인다 (첫토익 문서 E2). 7일치만 남긴다. 매일 03:40 KST
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-history-cleanup' loop
    perform cron.unschedule(r.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'cron-history-cleanup',
  '40 18 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);
