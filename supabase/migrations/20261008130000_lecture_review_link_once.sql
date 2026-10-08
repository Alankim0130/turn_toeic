-- ============================================================================
-- 후기 링크는 한 번만 — 다른 학생이 쓴 링크 · 다른 달에 쓴 내 링크로는 신청이 안 된다
--   (2026-10-08 Alan — "실제로 그 학생이 후기를 적었는지, 다른학생 링크를 넣은건지도 파악가능할까?" → "후기막기 진행해주고")
--
--   * YBM 후기 링크(https://www.ybmedu.com/mypage/lessonView/<토큰>)의 토큰이 곧 후기 한 편이다 — 같은 토큰 = 같은 후기.
--     그래서 신청을 넣을 때 트리거가 **토큰으로** 견준다 (private.review_link_key — 대소문자 · 끝의 = 는 가리지 않는다.
--     주소 앞자리(www. · m.) · ? # 꼬리가 달라도 같은 후기다. 앱 reviewLinkKey(src/lib/lecture.ts)와 같은 규칙 — 바꾸면 둘 다):
--       - 다른 학생이 이미 쓴 링크 → review_link_taken (어느 특강 · 어느 달이든 — 친구 후기 링크를 붙여 넣은 것)
--       - 내가 **다른 달(기수)** 특강 신청에 쓴 링크 → review_link_reused (그 달 후기를 새로 쓰는 것이 조건이다)
--       - 같은 달의 다른 특강에 쓴 내 링크는 받는다 (한 달에 후기 링크가 필요한 특강이 둘이어도 후기 하나로)
--   * 취소한 신청의 링크는 다시 쓸 수 있다 (신청 줄이 지워진다) — 강사가 남의 링크로 들어온 신청을 취소하면 진짜 주인이 쓴다.
--   * 같은 링크로 둘이 동시에 신청해도 하나만 들어간다 — 링크마다 advisory lock 으로 줄을 세운다 (트랜잭션이 끝나면 풀린다).
--   * 그 후기를 **누가 썼는지**는 여전히 모른다 — 이 작업 환경에서 YBM 페이지를 열어 볼 수 없다. 먼저 올린 학생이 그 링크를 갖는다.
--   * 이미 들어간 신청은 건드리지 않는다 (넣을 때만 본다). 계정 합치기(private.merge_accounts)는 UPDATE 라 이 트리거를 거치지 않는다.
-- ============================================================================

-- 후기 한 편을 가리키는 키 — lessonView 뒤 토큰(첫 번째), 소문자, 끝의 = 는 뗀다. 토큰이 없으면 null
create or replace function private.review_link_key(p_url text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(lower(rtrim((regexp_match(p_url, 'lessonview/([a-z0-9_=-]{10,})', 'i'))[1], '=')), '')
$$;
comment on function private.review_link_key(text) is
  'YBM 수강후기 링크의 후기 키 — lessonView 뒤 토큰을 소문자로, 끝의 = 는 떼고. 같은 키 = 같은 후기. 앱 reviewLinkKey 와 같은 규칙 (2026-10-08)';
revoke all on function private.review_link_key(text) from public, anon, authenticated;

-- 신청을 넣을 때 — 링크가 필요한 특강인데 없으면 막고(20261008100000 그대로), 있으면 한 번만 쓰게 한다
create or replace function private.lecture_signups_review_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if new.review_url is null then
    if private.lecture_needs_review(new.lecture_id) then
      raise exception 'review_link_required'
        using errcode = 'P0001', detail = '이 특강은 YBM 수강후기 링크를 올려야 신청할 수 있습니다.';
    end if;
    return new;
  end if;

  v_key := private.review_link_key(new.review_url);
  if v_key is null then
    return new; -- 링크의 꼴은 표의 check 제약(20261008110000)이 본다
  end if;

  -- 같은 링크로 동시에 둘이 신청해도 하나만 — 링크마다 줄을 세운다. 앞 사람이 끝난 뒤 아래 조회가 그 줄을 본다
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lecture_review_link:' || v_key, 0));

  if exists (
    select 1
      from public.lecture_signups s
     where s.review_url is not null
       and s.user_id <> new.user_id
       and private.review_link_key(s.review_url) = v_key
  ) then
    raise exception 'review_link_taken'
      using errcode = 'P0001', detail = '다른 학생이 이미 특강 신청에 쓴 YBM 수강후기 링크입니다.';
  end if;

  if exists (
    select 1
      from public.lecture_signups s
      join public.special_lectures l on l.id = s.lecture_id
      join public.special_lectures n on n.id = new.lecture_id
     where s.review_url is not null
       and s.user_id = new.user_id
       and l.term_id <> n.term_id
       and private.review_link_key(s.review_url) = v_key
  ) then
    raise exception 'review_link_reused'
      using errcode = 'P0001', detail = '다른 달 특강 신청에 쓴 YBM 수강후기 링크입니다. 그 달 후기를 새로 써야 합니다.';
  end if;

  return new;
end;
$$;
revoke execute on function private.lecture_signups_review_check() from public, anon, authenticated;
