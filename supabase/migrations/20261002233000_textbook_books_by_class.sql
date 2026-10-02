-- ============================================================================
-- 불라방 교재비 안내 — 내 반에 맞춘 교재 (2026-10-02 Alan — "불라방 교재비 입금 계좌번호 … 배송비는 4500 원. 그리고 주5일은 4권이라서
--   4만원이고, 주3일과 주5일 60분이면 2권이야. 수강증 업로드를 하고 나면 거기에 맞춰서 교재비 안내가 나가면 편할것 같아!")
--
--   * 교재 한 권 = 레벨 × 과목(LC · RC) × 과정(A · B). 시간 단위 반(60 · 70분)의 과목(class_sections.subject)과 과정(book_set)이
--     그 시간의 교재 한 권을 정한다. 그래서 **권수를 어디에도 적지 않는다** — 학생이 듣는 시간 단위 반에서 나온다:
--     주5일 120분 = 4권(월수금 · 화목금 × 두 시간) · 주3일 120분 = 2권 · 주5일 60분 = 2권(같은 과정의 RC · LC).
--     속성반은 함께 듣는 850 시간까지 (품는 관계는 term_section_includes). 계산은 앱 src/lib/textbook.ts 의 booksForSections 한곳.
--   * textbook_items 에 과목 · 과정 칸을 더한다. 둘 다 고른 교재는 그 시간을 듣는 불라방 학생에게 미리 골라지고 교재비 안내에 들어간다.
--     비워 두면 예전처럼 학생이 직접 고르는 교재다 (단어장 같은 것).
--   * 처음 값 — 교재가 하나도 없을 때만 레벨마다 4권(LC A · LC B · RC A · RC B)을 권당 10,000원("4권이라서 4만원")으로 넣는다.
--     이름 · 가격은 /admin/textbook-orders/setup 에서 고친다. 배송비가 0원이면 4,500원으로.
--     **입금 계좌는 넣지 않는다** — 이 저장소는 공개라 파일에 적은 계좌번호는 그대로 드러난다. 강사가 설정 화면에서 넣는다
--     (계좌는 강사·관리자·조교와 불라방 학생만 읽는다 — 첫토익 12 "계좌를 전체 공개로 열었던 사고").
--   * 학생 알림함에 '교재비 안내'(kind textbook) — 수강증이 불라방으로 승인되면 그 달에 한 번 간다 (앱 src/lib/textbook-guide.ts).
-- ============================================================================

alter table public.textbook_items
  add column if not exists subject  text check (subject in ('lc', 'rc')),
  add column if not exists book_set text check (book_set in ('A', 'B'));

comment on column public.textbook_items.subject is
  '이 교재를 쓰는 과목 (lc | rc). book_set 과 함께 고르면 그 시간 단위 반을 듣는 불라방 학생에게 미리 골라진다 (2026-10-02)';
comment on column public.textbook_items.book_set is
  '이 교재의 과정 (A | B) — class_sections.book_set 과 같은 글자';

-- 과목만 · 과정만 고른 교재는 어느 시간의 교재인지 알 수 없다 — 둘 다 고르거나 둘 다 비운다. 고르면 레벨도 있어야 한다
alter table public.textbook_items drop constraint if exists textbook_items_book_key_check;
alter table public.textbook_items add constraint textbook_items_book_key_check
  check ((subject is null and book_set is null) or (subject is not null and book_set is not null and level is not null));

-- 처음 값 — 강사가 아직 교재를 하나도 등록하지 않았을 때만 (이미 있으면 강사가 과목 · 과정만 골라 주면 된다)
insert into public.textbook_items (name, level, subject, book_set, price, sort_order)
select format('%s %s %s과정', l.level, upper(s.subject), b.book_set),
       l.level, s.subject, b.book_set, 10000,
       (row_number() over (order by l.sort_order, l.level, s.ord, b.book_set))::int - 1
  from public.lc_levels l
 cross join (values ('lc', 1), ('rc', 2)) as s (subject, ord)
 cross join (values ('A'), ('B')) as b (book_set)
 where not exists (select 1 from public.textbook_items);

update public.textbook_settings
   set shipping_fee = 4500, updated_at = now()
 where id and shipping_fee = 0;

-- ─── 알림 종류 textbook (교재비 안내) ──────────────────────────────────────
alter table public.student_messages drop constraint if exists student_messages_kind_check;
alter table public.student_messages
  add constraint student_messages_kind_check
  check (kind in ('general', 'study_checkin', 'homework_checked', 'live_start', 'contact_reply', 'attendance', 'merge_choice', 'textbook'));
