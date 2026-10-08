-- ============================================================================
-- 특강 후기 링크는 YBM 수강후기 주소만 (2026-10-08 Alan — 7월 3주차 모의고사 특강 때 학생들이 올린 링크 화면을 보내 줬다.
--   일곱 개가 전부 https://www.ybmedu.com/mypage/lessonView/<토큰> 꼴이었다)
--
--   * 20261008100000 은 YBM 후기 주소의 모양을 몰라 http(s) 주소면 다 받았다. 이제 그 꼴만 받는다 —
--     ybmedu.com(www. · m. 같은 앞자리 포함) 의 경로 끝이 lessonView/<토큰>(10자 이상, 영문 · 숫자 · _ - =) 이고 뒤에 ? # / 꼬리만 붙을 수 있다.
--     앞의 경로(/mypage/)는 정하지 않는다 — 앱 화면에서 열면 앞자리가 다를 수 있어서다. 대소문자는 가리지 않는다.
--   * 앱 parseReviewLink · isYbmReviewUrl(src/lib/lecture.ts)의 YBM_REVIEW_LINK_RE 와 같은 정규식 — 바꾸면 둘 다
--     (lecture.test.ts 가 이 파일의 정규식을 JS 로 옮겨 같은 주소들에 같은 답을 내는지 본다).
--   * 이미 들어간 신청도 이 규칙으로 검사한다 (not valid 를 쓰지 않는다) — 20261008100000 이 올라간 지 몇 분이고 10/24 특강 신청은
--     10/17 에 열리므로 어긋나는 줄이 없을 것이다. 있으면 이 마이그레이션이 실패해 바로 드러난다 (조용히 남겨 두면 계정 합치기가 그 줄에서 막힌다).
-- ============================================================================

alter table public.lecture_signups drop constraint if exists lecture_signups_review_url_check;
alter table public.lecture_signups
  add constraint lecture_signups_review_url_check
  check (
    review_url is null
    or (
      char_length(review_url) <= 2000
      and review_url ~* '^https?://([a-z0-9-]+\.)*ybmedu\.com/([^[:space:]?#]*/)?lessonview/[a-z0-9_=-]{10,}([/?#][^[:space:]]*)?$'
    )
  );

comment on column public.lecture_signups.review_url is
  'YBM 수강후기 링크 (2026-10-08) — 3주차 모의고사 특강을 신청할 때 학생이 올린다 (private.lecture_needs_review). https://www.ybmedu.com/mypage/lessonView/<토큰> 꼴만. 그 밖의 특강은 비어 있다';
