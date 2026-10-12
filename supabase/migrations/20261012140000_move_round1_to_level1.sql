-- ============================================================================
-- 비대면 자료 1회차를 공통(모든 레벨) → 레벨 1 로 옮긴다 (2026-10-12 Alan — 관리자 비대면 자료 화면의 공통 1회차(안내가 "Lv1에서는 …")를 보고
-- "여기에 올라가 있는 1회차 내용을 레벨 1 1회차로 올려줘").
--
-- 레벨(20261012100000)이 생기기 전에 올린 자료는 전부 공통(0)으로 잡혔다. 1회차는 안내 글 · 파일 이름이 Lv1 자료라 레벨 1 칸으로 옮긴다.
--   * 옮기는 것은 **1회차 · 공통 자료 하나**이고, 글 · 파일 이름 · 안내 어디에도 Lv1 표시가 없으면(다른 자료가 그 자리에 있다) 옮기지 않는다.
--     1회차 레벨 1 칸에 이미 자료가 있으면(그 사이 Alan 이 올렸다) 옮기지 않는다 — 회차 × 레벨이 한 칸이다.
--   * **그 달 적용분(study_materials)의 공통 1회차 줄도 함께 레벨 1 로 옮긴다** — 자료의 레벨만 바꾸면 sync_online_materials 가
--     레벨 1 줄을 새로 만들고 공통 줄은 인증이 붙어 있을 때 남겨서(인증을 지키려고), 오늘(1회차 수업일) 이미 인증한 학생이 있으면
--     같은 자료가 공통 · 레벨 1 두 줄로 서고 인증은 공통 줄에 남는다. 줄을 옮기면 인증이 그 줄을 따라 레벨 1 1회차로 간다.
--     (적용분 레벨 1 1회차 줄이 따로 있으면 — 지운 레벨 1 자료의 인증이 남은 경우 — 공통 줄은 두고 동기화에 맡긴다.)
--   * 자료의 레벨을 바꾸면 자료실 트리거가 sync_online_materials 를 돌려 나머지(끝나지 않은 달의 적용분)를 맞춘다.
--   * 레벨을 아직 안 고른 10월 학생은 레벨 1 을 고른 뒤에 1회차를 본다 — 공통 자료는 더 이상 없다 (Alan 이 안다).
--   * 옮길 것이 없으면 알림만 남기고 배포를 막지 않는다. 다시 돌려도 같다.
-- ============================================================================

do $$
declare
  v_item   public.study_material_items%rowtype;
  v_taken  int;
  v_text   text;
  v_moved  int := 0;
  r        record;
begin
  select * into v_item from public.study_material_items where seq = 1 and level = 0;
  if not found then
    raise notice '공통 1회차 자료가 없다 — 이미 옮겼거나 지웠다';
    return;
  end if;

  v_text := coalesce(v_item.title, '') || ' ' || coalesce(v_item.file_name, '') || ' ' || coalesce(v_item.note, '');
  if v_text !~* '(lv\.? ?1|level ?1|레벨 ?1)' then
    raise notice '공통 1회차 자료(#%)에 Lv1 표시가 없어 옮기지 않았다 — 제목 "%"', v_item.id, coalesce(v_item.title, '');
    return;
  end if;

  select count(*) into v_taken from public.study_material_items where seq = 1 and level = 1;
  if v_taken > 0 then
    raise notice '1회차 레벨 1 자료가 이미 있어 공통 1회차(#%)를 옮기지 않았다', v_item.id;
    return;
  end if;

  -- 그 달 적용분의 공통 1회차 줄 → 레벨 1 (인증이 그 줄을 따라간다). 레벨 1 줄이 이미 있는 달은 두고 동기화에 맡긴다
  for r in
    select m.id, m.study_id
      from public.study_materials m
     where m.seq = 1 and m.level = 0 and m.item_id = v_item.id
       and not exists (select 1 from public.study_materials x where x.study_id = m.study_id and x.seq = 1 and x.level = 1)
  loop
    update public.study_materials set level = 1, updated_at = now() where id = r.id;
    v_moved := v_moved + 1;
  end loop;

  -- 자료실 행 — 이 UPDATE 의 트리거(study_material_items_sync)가 sync_online_materials 를 돌린다
  update public.study_material_items set level = 1, updated_at = now() where id = v_item.id;

  raise notice '1회차 공통 자료(#%)를 레벨 1 로 옮겼다 — 적용분 % 줄 함께', v_item.id, v_moved;
exception when others then
  raise notice '1회차 자료를 옮기지 못했다 (%) — 관리자 화면에서 레벨 1 에 다시 올린다', sqlerrm;
end $$;
