-- ============================================================================
-- 문의에 답변하는 자리 (2026-09-30 Alan — "이주은 이라는 학생이 문의를 해줬는데, 강사가 직접 답변을 해주는 공간이 없어.
--   혹시 비회원이라서 답변장소가 없는건가? 만약 그렇다면, 회원가입을 하면 답변을 여기로 바로 받을 수 있다고 안내도 같이")
--
--   * 지금까지는 회원·비회원 가릴 것 없이 **답변 칸 자체가 없었다** — 상태(새 문의 · 읽음 · 답변 완료)만 바꿨다.
--   * contact_messages 에 답변(reply) · 답변한 때 · 답변한 사람을 둔다. 스태프만 쓴다 (정책 "contact: 스태프 처리" 그대로).
--   * **회원 문의**(user_id 가 있음)는 답변이 학생 알림함(student_messages, kind 'contact_reply')으로 간다.
--     **비회원 문의**는 이 사이트로 전할 길이 없다 — 남긴 연락처로 직접 답하고, 답한 내용을 기록으로만 남긴다.
--   * 답변 길이는 알림함 본문 상한(1,000자)과 같다 — 그대로 알림으로 보낸다.
--   * 2026-09-30 운영 DB: 문의 2건 모두 비회원 문의였다.
-- ============================================================================

alter table public.contact_messages
  add column if not exists reply      text check (reply is null or char_length(reply) between 1 and 1000),
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references public.profiles (id) on delete set null;

create index if not exists contact_messages_replied_by_idx on public.contact_messages (replied_by);

comment on column public.contact_messages.reply is
  '스태프 답변 (2026-09-30). 회원 문의면 같은 글이 학생 알림함(student_messages, contact_reply)으로 간다. 비회원 문의는 기록만';

-- ─── 알림 종류에 contact_reply 를 더한다 ─────────────────────────────────────
-- 이름을 찍어 drop 하면 이름이 다를 때 조용히 지나가고 옛 제약이 그대로 막는다 (20260919150000 과 같은 방식)
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class     rel on rel.oid = con.conrelid
      join pg_namespace ns  on ns.oid  = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'student_messages'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%live_start%'
  loop
    execute format('alter table public.student_messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked', 'live_start', 'contact_reply'));

comment on column public.student_messages.kind is
  'general(그냥 알림) | study_checkin(비대면 인증 독촉) | homework_checked(숙제 점검완료) | live_start(불라방 수업 시작) | contact_reply(문의 답변). 서로 다른 일이다';
