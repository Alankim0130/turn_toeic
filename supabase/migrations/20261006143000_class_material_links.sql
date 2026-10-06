-- ============================================================================
-- 수업자료실 — 자료 하나에 링크 여러 개 (2026-10-06 Alan — "수업 자료실에 유튜브 링크를 한번씩 올릴 수도 있어.
-- 그래서 링크를 올릴 수 있는 공간도 있으면 좋겠어. 그리고 링크를 여러개 올릴 수 있도록 설정부탁해.")
--
--   * 자료 한 건 = 제목 + 안내 · 스크립트 + 파일 0 ~ 20개 + **링크 0 ~ 20개** (게시판 글 하나).
--     링크는 class_materials.links(jsonb 배열)에 둔다 — [{"url": "https://youtu.be/…", "label": "1강 해설 영상" | null}, …].
--     파일과 달리 저장소가 없어 표를 따로 두지 않는다: 자료 행과 한 번에 저장되고(나눠 쓰다 실패해 되돌릴 일이 없다),
--     조회는 자료 행의 정책을 그대로 탄다 — 학생에게는 그 회차 수업일부터(private.my_open_rounds), 강사·관리자는 전부.
--   * 쓰기도 자료 행 그대로 강사·관리자 (class_materials 정책). 표 grant 가 표 단위라 새 칸도 함께 열린다.
--   * 유튜브 영상은 학생 화면이 그 자리에서 재생하고(youtube-nocookie), 다른 링크는 새 창으로 연다 — 판정은 앱 (src/lib/youtube.ts).
--   * check — 배열 · 20개 이하 · 링크마다 {url: http(s) 로 시작하고 공백 없는 2,000자 이하 문자열, label: 없거나 100자 이하 문자열}.
--     앱의 parseMaterialLinks 와 같은 상한이다 (class-materials.test.ts 가 본다). 학생 화면에 `javascript:` 같은 주소가 서지 않게 DB 도 막는다.
--   * 두 번 돌아도 된다 (if not exists · drop … if exists).
-- ============================================================================

create or replace function private.class_material_links_ok(p_links jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_links) is distinct from 'array' then false
    else jsonb_array_length(p_links) <= 20
      and not exists (
        select 1
          from jsonb_array_elements(p_links) as e(v)
         where jsonb_typeof(e.v) is distinct from 'object'
            or jsonb_typeof(e.v -> 'url') is distinct from 'string'
            or (e.v ->> 'url') !~* '^https?://[^[:space:]]+$'
            or char_length(e.v ->> 'url') > 2000
            or coalesce(jsonb_typeof(e.v -> 'label'), 'null') not in ('string', 'null')
            or char_length(coalesce(e.v ->> 'label', '')) > 100
      )
  end
$$;

comment on function private.class_material_links_ok(jsonb) is
  '수업자료실 링크 check (2026-10-06) — 배열 · 20개 이하 · {url: http(s) 2,000자 이하, label: 100자 이하}. 앱 parseMaterialLinks 와 같은 상한';

-- check 는 저장하는 사람(강사·관리자 세션)의 권한으로 이 함수를 부른다
revoke all on function private.class_material_links_ok(jsonb) from public, anon;
grant execute on function private.class_material_links_ok(jsonb) to authenticated, service_role;

alter table public.class_materials add column if not exists links jsonb not null default '[]'::jsonb;

alter table public.class_materials drop constraint if exists class_materials_links_check;
alter table public.class_materials add constraint class_materials_links_check check (private.class_material_links_ok(links));

comment on column public.class_materials.links is
  '링크 0 ~ 20개 (2026-10-06) — [{"url": "https://…", "label": 이름|null}]. 유튜브 영상은 학생 화면에서 바로 재생, 그 밖은 새 창';
comment on table public.class_materials is
  '수업자료실 — 레벨(lc_levels) × 과목(rc|lc) × 과정(A|B) × 회차 자료(제목 · 안내 · 링크). 파일은 class_material_files 에 0 ~ N개. 학생은 내 반의 그 회차 수업일부터(private.my_open_rounds), 쓰기는 강사·관리자 (2026-10-05 · 10-06)';
