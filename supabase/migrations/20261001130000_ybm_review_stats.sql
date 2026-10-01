-- ============================================================================
-- YBM 공식 페이지의 수강후기 통계 (2026-10-01 Alan — "누적 수강후기 이런 것들, YBM 홈페이지에서 실제 데이터를 매일 한 번씩
-- 가지고 와서. 8개 항목의 숫자를 다 가지고 와서 반영")
--
--   * 한 줄짜리 표다 — 총 후기 수(`total`)와 후기 태그 8개(`tags` = [{key:'w01', label:'커리큘럼이 탄탄해요', count:1041}, …]).
--     `https://www.ybmedu.com/seomyon/winnertoeic` 의 후기 탭(#tab_area06)에서 Vercel Cron(`/api/cron/ybm-stats`, 매일 04:10 KST)이
--     읽어 와 갈아 끼운다 (앱 `src/lib/ybm-stats.ts` 의 `parseYbmReviewStats`).
--   * **못 읽으면 숫자는 그대로 두고 `last_error` 만 적는다** — 페이지가 바뀌어 못 읽는 날 0 이 되면 랜딩이 거짓말을 한다.
--   * 랜딩(비회원 포함)이 읽으므로 조회는 모두에게 열고, 쓰기는 서버(service_role)만 한다.
--   * 처음 값은 2026-10-01 에 실제 페이지에서 읽은 숫자다 — 크론이 돌기 전에도 랜딩에 빈칸이 없게.
-- ============================================================================

create table if not exists public.ybm_review_stats (
  id              boolean primary key default true check (id),        -- 한 줄만
  total           integer not null check (total >= 0),                -- 누적 수강후기 수
  tags            jsonb not null default '[]'::jsonb,                 -- [{key, label, count}] 8개, 페이지 순서 그대로
  fetched_at      timestamptz not null default now(),                 -- 이 숫자를 읽은 시각
  source_url      text not null,
  last_attempt_at timestamptz,                                        -- 마지막으로 읽으려 한 시각 (성공·실패 모두)
  last_error      text,                                               -- 마지막 실패 사유. 성공하면 비운다
  last_error_at   timestamptz
);

comment on table public.ybm_review_stats is 'YBM 공식 페이지 수강후기 통계 한 줄 — 매일 크론이 갱신. 못 읽은 날은 숫자를 두고 last_error 만 적는다';

insert into public.ybm_review_stats (id, total, tags, fetched_at, source_url)
values (
  true,
  7359,
  '[
    {"key":"w01","label":"커리큘럼이 탄탄해요","count":1041},
    {"key":"w02","label":"피드백이 상세해요","count":254},
    {"key":"w03","label":"목표 달성에 도움이 돼요","count":558},
    {"key":"w04","label":"시험 트렌드에 적합해요","count":187},
    {"key":"w05","label":"실력이 빠르게 늘어요","count":402},
    {"key":"w06","label":"실전 대비가 잘돼요","count":269},
    {"key":"w07","label":"추천하고 싶은 강의에요","count":514},
    {"key":"w08","label":"수업 분위기가 좋아요","count":229}
  ]'::jsonb,
  '2026-10-01 03:30:00+09',
  'https://www.ybmedu.com/seomyon/winnertoeic#tab_area06'
)
on conflict (id) do nothing;

alter table public.ybm_review_stats enable row level security;

grant select on public.ybm_review_stats to anon, authenticated;
grant all on public.ybm_review_stats to service_role;

create policy "ybm_review_stats: 누구나 조회" on public.ybm_review_stats
  for select to anon, authenticated using (true);
