-- 2027년 겨울방학 시간표 — 2시간 반을 시간마다 A/B 로 (2026-11-23 Alan — 시간표 사진을 다시 보내며 "AB반 표시되어있는데?" ·
-- "800은 AB빼고해줘 쌤들이 매달 다르게 직접 넣을거야")
--
-- 20261123100000 은 2시간 반(650 · 750 · 2월 850)을 통짜 줄 하나로 넣었다. 통짜 줄에는 과정 글자가 하나뿐인데 시간표는 **시간마다** A/B 가 있고
-- (1월 650 10:00 A · 11:10 B), 평달 배치(같은 시간에 월수금 · 화목금 과목이 반대)라 같은 반의 월수금 · 화목금 학생 LC 교재가 다르다 — 그래서 비워 뒀다.
-- 평달과 같은 모양으로 바꾼다: **시간 단위 줄 둘(시간마다 과정 + 트랙별 과목) + 그 둘을 품는 2시간 줄(한달완성)**.
-- 2시간 수강증(10:00~12:10)은 한달완성 반에, 그 반이 두 시간 반의 권한 · 교재 · 다시보기를 받는다 — 평달 한달완성과 같은 길이고 방송도 시간 반마다(각자 방송).
--   - 과목: 첫 시간 = 가장 최근 평달 시간표에서 그 레벨 첫 시간 줄의 월수금 · 화목금 과목(Alan "11월, 12월의 기점으로"), 둘째 시간 = 반대(평달 "11:10 … 과목은 반대").
--   - 과정: 650 · 750 은 시간표 글자 그대로. **850 은 비운다** — 쌤들이 달마다 시간표 설정에서 넣는다. 1월 850(15:40~17:00, 80분 한 시간)은 그대로 둔다.
--   - 저녁(18:30~20:40)은 시간 줄 둘과 2시간 줄 모두 화목금 인강.
-- **앞 마이그레이션이 넣은 그대로일 때만** 바꾼다 — 그 달 시간표가 한 칸이라도 달라졌거나(강사가 고침) 그 달 반이 열렸으면 건너뛴다. 달마다 따로 되돌리고 배포를 막지 않는다.

do $vacation_hours$
declare
  v_months jsonb := $json$
  [
    {
      "year": 2027, "month": 1,
      "expect": [
        [650, "10:00", "12:10", false], [650, "12:30", "14:40", false], [650, "18:30", "20:40", true],
        [750, "10:00", "12:10", false], [750, "12:30", "14:40", false], [750, "18:30", "20:40", true],
        [850, "15:40", "17:00", false]
      ],
      "packages": [
        {"level": 650, "start": "10:00", "end": "12:10", "recorded": false, "hours": [["10:00", "11:00", "A"], ["11:10", "12:10", "B"]]},
        {"level": 650, "start": "12:30", "end": "14:40", "recorded": false, "hours": [["12:30", "13:30", "A"], ["13:40", "14:40", "B"]]},
        {"level": 650, "start": "18:30", "end": "20:40", "recorded": true,  "hours": [["18:30", "19:30", "A"], ["19:40", "20:40", "B"]]},
        {"level": 750, "start": "10:00", "end": "12:10", "recorded": false, "hours": [["10:00", "11:00", "A"], ["11:10", "12:10", "B"]]},
        {"level": 750, "start": "12:30", "end": "14:40", "recorded": false, "hours": [["12:30", "13:30", "A"], ["13:40", "14:40", "B"]]},
        {"level": 750, "start": "18:30", "end": "20:40", "recorded": true,  "hours": [["18:30", "19:30", "A"], ["19:40", "20:40", "B"]]}
      ]
    },
    {
      "year": 2027, "month": 2,
      "expect": [
        [650, "10:00", "12:10", false], [650, "18:30", "20:40", true],
        [750, "10:00", "12:10", false], [750, "12:30", "14:40", false], [750, "18:30", "20:40", true],
        [850, "12:30", "14:40", false]
      ],
      "packages": [
        {"level": 650, "start": "10:00", "end": "12:10", "recorded": false, "hours": [["10:00", "11:00", "B"], ["11:10", "12:10", "A"]]},
        {"level": 650, "start": "18:30", "end": "20:40", "recorded": true,  "hours": [["18:30", "19:30", "B"], ["19:40", "20:40", "A"]]},
        {"level": 750, "start": "10:00", "end": "12:10", "recorded": false, "hours": [["10:00", "11:00", "B"], ["11:10", "12:10", "A"]]},
        {"level": 750, "start": "12:30", "end": "14:40", "recorded": false, "hours": [["12:30", "13:30", "B"], ["13:40", "14:40", "A"]]},
        {"level": 750, "start": "18:30", "end": "20:40", "recorded": true,  "hours": [["18:30", "19:30", "B"], ["19:40", "20:40", "A"]]},
        {"level": 850, "start": "12:30", "end": "14:40", "recorded": false, "hours": [["12:30", "13:30", null], ["13:40", "14:40", null]]}
      ]
    }
  ]
  $json$;
  m        jsonb;
  p        jsonb;
  h        jsonb;
  v_year   int;
  v_month  int;
  v_key    int;
  v_mwf    text;
  v_ttf    text;
  v_idx    int;
  v_rows   int;
begin
  for m in select * from jsonb_array_elements(v_months) loop
    v_year  := (m ->> 'year')::int;
    v_month := (m ->> 'month')::int;
    v_key   := v_year * 12 + v_month;
    begin
      if exists (
        select 1 from public.class_sections c join public.terms t on t.id = c.term_id
         where t.year = v_year and t.month = v_month
      ) then
        raise notice '%년 %월 반이 이미 열려 있어 시간표를 건너뜀', v_year, v_month;
        continue;
      end if;

      -- 앞 마이그레이션이 넣은 줄 그대로인가 (레벨 · 시간 · 인강 · 점수보장반 · 과정 · 과목 비어 있음 — 앞 교시는 DB 에서 셌으니 보지 않는다)
      if (select count(*) from public.timetable_slots t where t.year = v_year and t.month = v_month) <> jsonb_array_length(m -> 'expect')
         or exists (
           select 1
             from jsonb_array_elements(m -> 'expect') as e(v)
            where not exists (
              select 1 from public.timetable_slots t
               where t.year = v_year and t.month = v_month
                 and t.program = 'score'
                 and t.level = (e.v ->> 0)::int
                 and t.start_time = (e.v ->> 1)::time
                 and t.end_time = (e.v ->> 2)::time
                 and t.ttf_recorded = (e.v ->> 3)::boolean
                 and t.book_set is null and t.subject_mwf is null and t.subject_ttf is null
            )
         ) then
        raise notice '%년 %월 시간표가 앞서 넣은 모양과 달라 건너뜀', v_year, v_month;
        continue;
      end if;

      v_rows := 0;
      for p in select * from jsonb_array_elements(m -> 'packages') loop
        -- 그 레벨의 가장 최근 평달 첫 시간 과목 (첫 시간 = 그대로, 둘째 시간 = 반대)
        v_mwf := null;
        v_ttf := null;
        select t.subject_mwf, t.subject_ttf
          into v_mwf, v_ttf
          from public.timetable_slots t
         where t.year is not null
           and t.month not in (1, 2, 7, 8)
           and t.year * 12 + t.month < v_key
           and t.program = 'score'
           and t.level = (p ->> 'level')::int
           and t.subject_mwf is not null
           and t.subject_ttf is not null
           and t.end_time - t.start_time <= interval '90 minutes'
         order by t.year desc, t.month desc, t.start_time
         limit 1;

        -- 2시간 줄은 한달완성이 된다 — 통짜 칸(과정 · 앞 교시 · 뒤 교시)을 비운다 (한달완성 줄에는 두지 않는다 — fieldsFor)
        update public.timetable_slots t
           set book_set = null, first_mwf = null, first_ttf = null, second_start = null
         where t.year = v_year and t.month = v_month and t.program = 'score'
           and t.level = (p ->> 'level')::int
           and t.start_time = (p ->> 'start')::time
           and t.end_time = (p ->> 'end')::time;

        v_idx := 0;
        for h in select * from jsonb_array_elements(p -> 'hours') loop
          insert into public.timetable_slots
            (year, month, level, program, start_time, end_time, ttf_recorded, book_set, subject_mwf, subject_ttf)
          values (
            v_year, v_month, (p ->> 'level')::int, 'score',
            (h ->> 0)::time, (h ->> 1)::time, (p ->> 'recorded')::boolean,
            h ->> 2,
            case when v_idx = 0 then v_mwf else case v_mwf when 'lc' then 'rc' when 'rc' then 'lc' end end,
            case when v_idx = 0 then v_ttf else case v_ttf when 'lc' then 'rc' when 'rc' then 'lc' end end
          );
          v_idx := v_idx + 1;
          v_rows := v_rows + 1;
        end loop;
      end loop;
      raise notice '%년 %월 시간 줄 %개를 넣어 2시간 반을 한달완성으로', v_year, v_month, v_rows;
    exception when others then
      raise notice '%년 %월 시간표는 바꾸지 못함: % (%)', v_year, v_month, sqlerrm, sqlstate;
    end;
  end loop;
end
$vacation_hours$;
