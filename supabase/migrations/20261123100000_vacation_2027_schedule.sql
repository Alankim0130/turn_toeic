-- 2027년 겨울방학(1월 · 2월) 반 편성 달력 · 시간표 넣기 (2026-11-23 Alan — "역전토익 방학스케쥴이야. 확인하고 난 뒤에 스케쥴 추가하는 곳에 너가 추가쫌 부탁해")
--
-- Alan 이 준 것: 1월 · 2월 달력 그림(월수금 노랑 · 화목금 초록 · 특강) + "2027년 겨울방학 계획" 시간표(워드). 같은 날 물어서 정한 것:
--   - 2/13(토) 은 화목금 수업일, 2/9(대체휴일) 도 수업 — 두 달 모두 월수금 9 · 화목금 9.
--   - 개강일 = 첫 수업일(1/4 · 2/1), 종강일 = 그 달 말일(1/31 · 2/28) — LC특강(1/29 · 2/26)이 마지막 수업일 다음 날이다.
--   - 특강 강사: RC특강 = RC 선생님 · LC특강 = LC 선생님. 모의고사는 달마다 번갈아 — "11월달에 1차 이혜영이라면 12월달에는 1차가 이영수,
--     그럼 1월달에는 1차가 이혜영 이렇게 교차로 해줘. 그럼 이번달에 1차가 누구인지 보고 판단해줘" → 가장 최근 달의 1차(2차)에서 달 수만큼 번갈아 센다.
--   - 시간표의 600 · 700 · 800 = 사이트 650 · 750 · 850. 과목 순서는 "11월, 12월의 기점으로 계산해서" — 가장 최근 평달 시간표에서 그 레벨 첫 시간의 과목
--     (월수금 · 화목금)을 통짜 반의 앞 교시 과목으로 쓴다 (평달과 같은 배치, 저녁 · 12:30 통짜도 같다).
--   - 1월 850(15:40~17:00) 의 과목 · 과정, 속성반 · 650+750반 · 850 2주완성은 "쌤들한테 물어봐야" — 850 은 시간만 넣고 칸은 비우며, 나머지 반은 넣지 않는다.
--
-- 넣는 길은 화면과 같다 — 달력은 `public.save_term_schedule`(반 편성 달력의 '전체 저장'), 시간표는 `timetable_slots` 의 달 줄(시간표 설정의 줄).
-- 방학달이라 반은 열지 않는다 (강사가 새 반 개설에서 연다 — d1-schedule.md "반 편성 달력 동작 10").
--
-- **운영 DB 를 이 작업 환경에서 못 보므로 비어 있을 때만 넣는다** — 그 달 달력(개강 · 종강 · 수업일 · 특강 · 반)이 하나라도 있으면 달력은 건너뛰고,
-- 그 달 시간표 줄이 하나라도 있으면 시간표는 건너뛴다. 달마다 · 달력/시간표마다 따로 되돌린다(넣다 실패하면 그 부분만 없던 일) — 배포를 막지 않는다.
--
-- 통짜 반의 과정(LC 교재 글자)은 **두 트랙의 LC 시간 글자가 같을 때만** 적는다. 평달처럼 월수금 · 화목금의 과목 순서가 반대면
-- (예: 1월 650 10:00 A · 11:10 B — 월수금은 11:10 LC 라 B, 화목금은 10:00 LC 라 A) 통짜 반 한 줄에 글자 하나로는 둘 다 맞출 수 없어 비워 둔다
-- (시간표 설정에 주황 '안 고름') — 쌤들에게 물어 정한다.

do $vacation$
declare
  v_months jsonb := $json$
  [
    {
      "year": 2027, "month": 1, "opens": "2027-01-04", "closes": "2027-01-31",
      "mwf": ["2027-01-04","2027-01-06","2027-01-11","2027-01-13","2027-01-18","2027-01-20","2027-01-22","2027-01-25","2027-01-27"],
      "ttf": ["2027-01-05","2027-01-07","2027-01-08","2027-01-12","2027-01-14","2027-01-19","2027-01-21","2027-01-26","2027-01-28"],
      "lectures": [
        {"date": "2027-01-15", "kind": "mock1"},
        {"date": "2027-01-16", "kind": "rc"},
        {"date": "2027-01-23", "kind": "mock2"},
        {"date": "2027-01-29", "kind": "lc"}
      ],
      "slots": [
        {"level": 650, "start": "10:00", "end": "12:10", "second": "11:10", "sets": ["A","B"], "recorded": false},
        {"level": 650, "start": "12:30", "end": "14:40", "second": "13:40", "sets": ["A","B"], "recorded": false},
        {"level": 650, "start": "18:30", "end": "20:40", "second": "19:40", "sets": ["A","B"], "recorded": true},
        {"level": 750, "start": "10:00", "end": "12:10", "second": "11:10", "sets": ["A","B"], "recorded": false},
        {"level": 750, "start": "12:30", "end": "14:40", "second": "13:40", "sets": ["A","B"], "recorded": false},
        {"level": 750, "start": "18:30", "end": "20:40", "second": "19:40", "sets": ["A","B"], "recorded": true},
        {"level": 850, "start": "15:40", "end": "17:00", "second": null, "sets": null, "recorded": false}
      ]
    },
    {
      "year": 2027, "month": 2, "opens": "2027-02-01", "closes": "2027-02-28",
      "mwf": ["2027-02-01","2027-02-03","2027-02-05","2027-02-10","2027-02-12","2027-02-15","2027-02-17","2027-02-19","2027-02-22"],
      "ttf": ["2027-02-02","2027-02-04","2027-02-09","2027-02-11","2027-02-13","2027-02-16","2027-02-18","2027-02-23","2027-02-25"],
      "lectures": [
        {"date": "2027-02-06", "kind": "mock1"},
        {"date": "2027-02-20", "kind": "rc"},
        {"date": "2027-02-24", "kind": "mock2"},
        {"date": "2027-02-26", "kind": "lc"}
      ],
      "slots": [
        {"level": 650, "start": "10:00", "end": "12:10", "second": "11:10", "sets": ["B","A"], "recorded": false},
        {"level": 650, "start": "18:30", "end": "20:40", "second": "19:40", "sets": ["B","A"], "recorded": true},
        {"level": 750, "start": "10:00", "end": "12:10", "second": "11:10", "sets": ["B","A"], "recorded": false},
        {"level": 750, "start": "12:30", "end": "14:40", "second": "13:40", "sets": ["B","A"], "recorded": false},
        {"level": 750, "start": "18:30", "end": "20:40", "second": "19:40", "sets": ["B","A"], "recorded": true},
        {"level": 850, "start": "12:30", "end": "14:40", "second": "13:40", "sets": ["B","A"], "recorded": false}
      ]
    }
  ]
  $json$;
  m            jsonb;
  s            jsonb;
  k            jsonb;
  v_year       int;
  v_month      int;
  v_key        int;
  v_term       bigint;
  v_staff      uuid;
  v_rc         bigint;
  v_lc         bigint;
  v_base       bigint;
  v_base_key   int;
  v_mock       jsonb;
  v_lecturer   bigint;
  v_lectures   jsonb;
  v_result     jsonb;
  v_first_mwf  text;
  v_first_ttf  text;
  v_mwf_lc     text;
  v_ttf_lc     text;
  v_rows       int;
begin
  for m in select * from jsonb_array_elements(v_months) loop
    v_year  := (m ->> 'year')::int;
    v_month := (m ->> 'month')::int;
    v_key   := v_year * 12 + v_month;

    -- ─── 반 편성 달력 (개강 · 종강 · 월수금 · 화목금 · 특강) ─────────────────
    begin
      select t.id into v_term from public.terms t where t.year = v_year and t.month = v_month;
      if v_term is not null and (
           exists (select 1 from public.terms t where t.id = v_term and (t.enrollment_opens_at is not null or t.closes_at is not null))
        or exists (select 1 from public.term_class_dates d where d.term_id = v_term)
        or exists (select 1 from public.special_lectures l where l.term_id = v_term)
        or exists (select 1 from public.class_sections c where c.term_id = v_term)
      ) then
        raise notice '%년 %월 달력은 이미 있어 건너뜀', v_year, v_month;
      else
        -- 특강 강사 = 과목 선생님 (반 편성 달력의 강사 목록 `lecturers` 와 이름으로 잇는다)
        select l.id into v_rc from public.lecturers l join public.profiles p on p.name = l.name where p.id = private.subject_teacher('rc');
        select l.id into v_lc from public.lecturers l join public.profiles p on p.name = l.name where p.id = private.subject_teacher('lc');
        if v_rc is null or v_lc is null or v_rc = v_lc then
          raise exception 'subject_lecturer_missing';
        end if;

        -- 모의고사 강사 — 가장 최근 달의 같은 모의고사 강사에서 달 수만큼 번갈아 (2차가 없으면 그 달 1차의 반대)
        v_lectures := '[]'::jsonb;
        v_mock := '{}'::jsonb;
        for k in select * from jsonb_array_elements(m -> 'lectures') loop
          v_lecturer := null;
          if k ->> 'kind' = 'rc' then
            v_lecturer := v_rc;
          elsif k ->> 'kind' = 'lc' then
            v_lecturer := v_lc;
          else
            select l.lecturer_id, t.year * 12 + t.month
              into v_base, v_base_key
              from public.special_lectures l
              join public.terms t on t.id = l.term_id
             where (k ->> 'kind') = any(l.kinds)
               and t.year * 12 + t.month < v_key
               and l.lecturer_id in (v_rc, v_lc)
             order by t.year desc, t.month desc, l.date desc, l.id desc
             limit 1;
            if v_base is not null then
              v_lecturer := case when (v_key - v_base_key) % 2 = 0 then v_base
                                 when v_base = v_rc then v_lc else v_rc end;
            elsif k ->> 'kind' = 'mock2' and v_mock ? 'mock1' then
              v_lecturer := case when (v_mock ->> 'mock1')::bigint = v_rc then v_lc else v_rc end;
            end if;
            v_base := null;
            v_base_key := null;
          end if;
          if v_lecturer is null then
            raise exception 'mock_lecturer_unknown: %', k ->> 'kind';
          end if;
          v_mock := v_mock || jsonb_build_object(k ->> 'kind', v_lecturer);
          v_lectures := v_lectures || jsonb_build_array(jsonb_build_object(
            'date', k ->> 'date', 'lecturer_id', v_lecturer, 'kinds', jsonb_build_array(k ->> 'kind')));
        end loop;

        -- 반 편성 달력의 '전체 저장' 과 같은 함수 — 강사 · 관리자만 부를 수 있어 그 계정으로 (이 트랜잭션 안에서만)
        select p.id into v_staff
          from public.profiles p
         where coalesce(p.test_role, p.role) in ('admin', 'instructor')
           and p.merged_into is null
         order by (p.role = 'admin') desc, p.created_at
         limit 1;
        if v_staff is null then
          raise exception 'staff_missing';
        end if;
        perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);

        v_result := public.save_term_schedule(
          v_year, v_month,
          (m ->> 'opens')::date, (m ->> 'closes')::date,
          array(select jsonb_array_elements_text(m -> 'mwf')::date),
          array(select jsonb_array_elements_text(m -> 'ttf')::date),
          v_lectures,
          null
        );
        perform set_config('request.jwt.claims', '{}', true);
        raise notice '%년 %월 달력: %', v_year, v_month, v_result;
      end if;
    exception when others then
      raise notice '%년 %월 달력은 넣지 못함: % (%)', v_year, v_month, sqlerrm, sqlstate;
    end;

    -- ─── 시간표 (그 달 줄) ──────────────────────────────────────────────────
    begin
      if exists (select 1 from public.timetable_slots t where t.year = v_year and t.month = v_month) then
        raise notice '%년 %월 시간표는 이미 있어 건너뜀', v_year, v_month;
      else
        v_rows := 0;
        for s in select * from jsonb_array_elements(m -> 'slots') loop
          v_first_mwf := null;
          v_first_ttf := null;
          if s ->> 'second' is not null then
            -- 그 레벨의 가장 최근 평달 시간표 첫 시간(시간 단위 줄)의 과목 — "11월, 12월의 기점으로"
            select t.subject_mwf, t.subject_ttf
              into v_first_mwf, v_first_ttf
              from public.timetable_slots t
             where t.year is not null
               and t.month not in (1, 2, 7, 8)
               and t.year * 12 + t.month < v_key
               and t.program = 'score'
               and t.level = (s ->> 'level')::int
               and t.subject_mwf is not null
               and t.subject_ttf is not null
               and t.end_time - t.start_time <= interval '90 minutes'
             order by t.year desc, t.month desc, t.start_time
             limit 1;
          end if;
          -- 트랙마다 LC 시간의 글자 — 둘이 같을 때만 과정(LC 교재)으로 적는다
          v_mwf_lc := case v_first_mwf when 'lc' then s -> 'sets' ->> 0 when 'rc' then s -> 'sets' ->> 1 end;
          v_ttf_lc := case v_first_ttf when 'lc' then s -> 'sets' ->> 0 when 'rc' then s -> 'sets' ->> 1 end;

          insert into public.timetable_slots
            (year, month, level, program, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf, first_mwf, first_ttf, second_start)
          values (
            v_year, v_month, (s ->> 'level')::int, 'score',
            (s ->> 'start')::time, (s ->> 'end')::time, (s ->> 'recorded')::boolean,
            case when v_mwf_lc = v_ttf_lc then v_mwf_lc end,
            null, null,
            v_first_mwf, v_first_ttf,
            (s ->> 'second')::time
          );
          v_rows := v_rows + 1;
        end loop;
        raise notice '%년 %월 시간표 %줄', v_year, v_month, v_rows;
      end if;
    exception when others then
      raise notice '%년 %월 시간표는 넣지 못함: % (%)', v_year, v_month, sqlerrm, sqlstate;
    end;
  end loop;
end
$vacation$;
