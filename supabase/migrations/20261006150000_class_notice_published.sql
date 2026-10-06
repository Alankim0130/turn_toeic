-- ============================================================================
-- 수업자료실 공지 내리기 · 다시 올리기 (2026-10-06 Alan — "공지가 달마다 바뀌는 경우가 있어. 이런 경우 공지를 등록했다가 내리기도 있으면 좋겠어.
--   그리고 내려간 게시글에 다시 공지사항올리기 토글을 하나 만들어주면 편할 것 같아").
--
--   * class_notices.published — 참이면 학생에게 보인다. 내리면(거짓) 글·사진은 그대로 두고 학생 화면에서만 빠진다 — 다음 달에 다시 올린다.
--   * 학생 조회 정책이 published 를 본다. 스태프는 내린 공지도 본다 (관리자 수업자료실의 "내린 공지" 묶음).
--     공지 그림(storage class-notices)의 조회 정책은 "그 그림을 품은 공지를 볼 수 있는 사람" 이라 공지 행이 안 보이면 그림도 안 보인다 — 손대지 않는다.
--   * 앱의 getMyClassNotices · getMyClassNotice 도 published 로 한 번 더 거른다 (스태프가 학생 모드로 볼 때 — 등급 체계 10).
--   * 두 번 돌아도 된다 (add column if not exists · drop policy if exists).
-- ============================================================================

alter table public.class_notices add column if not exists published boolean not null default true;
comment on column public.class_notices.published is '학생에게 보이는 공지인가. 내리면 false — 글·사진은 남고 다시 올릴 수 있다 (2026-10-06)';

create index if not exists class_notices_published_idx on public.class_notices (published, created_at desc);

drop policy if exists "class_notices: 범위 수강생·스태프 조회" on public.class_notices;
create policy "class_notices: 범위 수강생·스태프 조회" on public.class_notices
  for select to authenticated
  using (
    (select private.is_staff())
    or (
      published
      and (
        (
          cardinality(levels) = 0 and cardinality(subjects) = 0
          and (select private.has_term_access(null))
        )
        or exists (
          select 1
          from unnest((select private.my_round_cells())) as c(cell)
          where (cardinality(levels) = 0 or split_part(c.cell, ':', 1)::int = any (levels))
            and (cardinality(subjects) = 0 or split_part(c.cell, ':', 2) = any (subjects))
        )
      )
    )
  );
