-- ============================================================================
-- 불라방은 우리가 정한 모든 수업 시간에 — 저녁 반도 유튜브 송출을 잡아 불라방 링크로 넣는다 (2026-10-04 Alan)
--
--   "불라방은 우리가 설정한 매시간 진행되어야해"
--
--   20261001140000 의 감지 후보는 `live_to_replay` 가 켜진 반(오전 · 주간)만이었다 — 송출을 **다시보기용**으로만 잡던 때의 조건이
--   20261001150000 에서 불라방 링크까지 넣게 된 뒤에도 그대로 남아, **저녁 월수금(현장 · 불라방) 수업은 송출을 켜도 불라방 링크가 안 들어갔다.**
--   이제 후보에서 그 조건을 뺀다. 다시보기로 올리는 일은 그대로 `live_to_replay` 반만이다 (private.promote_live_replays 가 두 갈래 모두 그 칸을 본다) —
--   저녁 학생은 오전 짝 반의 녹화본을 다시보기로 보므로(private.recorded_source_section) 저녁 송출까지 올리면 두 벌이 된다.
--
--   남는 조건: 오늘 · 시간 단위 반(점수보장반, 묶음 아님) · **인강 반 아님**(저녁 화목금은 라이브가 없다 — 오전 녹화본을 본다) ·
--   담당 강사가 채널 연결 · 송출·다시보기 아직 없음 · 수업 시작 −10 ~ +30분. 감지 뒤 흐름(session_streams → 비어 있는 불라방 링크 → 학생 알림)은 같다.
--
--   돌려주는 칸에 live_to_replay 를 더했다 — 강사 푸시가 "끝나면 다시보기로" 와 "다시보기 없음" 을 가른다 (/api/cron/live-detect).
--   돌려주는 모양이 바뀌므로 지우고 다시 만든다. private.live_detect_due() 는 이 함수를 이름으로 부르므로(sql 본문) 그대로 따라온다.
-- ============================================================================

drop function if exists public.live_detect_candidates();

create function public.live_detect_candidates()
returns table (session_date_id bigint, section_id bigint, instructor_id uuid, starts_at timestamptz, label text, live_to_replay boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id,
         s.id,
         s.instructor_id,
         (d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul',
         concat_ws(' ', t.month || '월', c.name, case s.track when 'mwf' then '월수금' else '화목금' end, s.time_block, d.seq || '회차'),
         s.live_to_replay
    from public.session_dates d
    join public.class_sections s on s.id = d.section_id
    join public.courses c on c.id = s.course_id
    join public.terms t on t.id = s.term_id
    join public.youtube_channels y on y.user_id = s.instructor_id
   where d.date = private.today_kst()
     and s.status <> 'draft'
     and not s.recorded                        -- 인강 반은 라이브가 없다 (오전 수업 녹화본을 본다)
     and c.program = 'score'
     and not private.is_package_section(s.id)
     and private.time_block_start(s.time_block) is not null
     and private.today_kst() <= s.closes_at
     and not exists (select 1 from public.session_streams st where st.session_date_id = d.id)
     and not exists (select 1 from public.replays r where r.session_date_id = d.id)
     and now() between ((d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul') - interval '10 minutes'
                   and ((d.date + private.time_block_start(s.time_block)) at time zone 'Asia/Seoul') + interval '30 minutes'
$$;

comment on function public.live_detect_candidates() is
  '지금 유튜브에서 방송을 찾아볼 회차 — 송출·다시보기가 아직 없는 시간 단위 반, 저녁 반 포함 (2026-10-04). 다시보기 승격은 live_to_replay 반만. service_role 전용 (/api/cron/live-detect)';

revoke all on function public.live_detect_candidates() from public, anon, authenticated;
grant execute on function public.live_detect_candidates() to service_role;
