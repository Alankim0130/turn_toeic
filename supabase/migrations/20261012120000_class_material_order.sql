-- ============================================================================
-- 수업자료실 — 회차 안 자료(게시물) 순서 (2026-10-12 Alan — "자료가 잘못올라가서 지우고 새로 올렸을때 원래 위치로 조정을 못하고 있어.
-- 그래서 게시물 순서를 조정할 수 있으면 좋겠어")
--
--  * class_materials.sort_order — 같은 칸(레벨 × 과목 × 과정) · 같은 회차 안의 순서. 관리자 · 학생 화면 모두 (sort_order, created_at, id) 순.
--    지금까지 올린 자료는 올린 순서대로 0, 1, 2 … 를 매긴다. 새 자료는 서버 액션이 그 회차의 끝 번호 + 1 을 넣는다.
--  * public.move_class_material(자료, 위로?) — 강사 · 관리자만. 같은 회차의 이웃과 자리를 바꾸고 그 회차 번호를 0 부터 다시 매긴다 (한 트랜잭션).
--    파일 순서(class_material_files.sort_order)는 수정 폼이 fileOrder 로 보내고 서버 액션이 그대로 적는다 — 함수 없음.
-- ============================================================================

alter table public.class_materials add column if not exists sort_order int not null default 0;
comment on column public.class_materials.sort_order is '같은 칸 · 같은 회차 안의 순서 (0 부터). 관리자 · 학생 화면이 (sort_order, created_at, id) 로 정렬한다 (2026-10-12)';
create index if not exists class_materials_cell_order_idx on public.class_materials (level, subject, book_set, seq, sort_order, created_at, id);

with ranked as (
  select m.id, row_number() over (partition by m.level, m.subject, m.book_set, m.seq order by m.created_at, m.id) - 1 as n
    from public.class_materials m
)
update public.class_materials m
   set sort_order = r.n
  from ranked r
 where r.id = m.id
   and m.sort_order <> r.n;

create or replace function public.move_class_material(p_id bigint, p_up boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level int;
  v_subject text;
  v_set text;
  v_seq int;
  v_ids bigint[];
  v_pos int;
  v_swap int;
  v_tmp bigint;
begin
  if not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select m.level, m.subject, m.book_set, m.seq into v_level, v_subject, v_set, v_seq
    from public.class_materials m
   where m.id = p_id
     for update;
  if not found then
    raise exception 'material_not_found' using errcode = '22023';
  end if;

  -- 같은 칸 · 같은 회차의 자료를 잠그고(두 사람이 동시에 옮겨도 번호가 엉키지 않게) 지금 순서대로 (과정 · 회차가 비어 있는 옛 자료는 그들끼리)
  perform m.id
     from public.class_materials m
    where m.level = v_level
      and m.subject = v_subject
      and m.book_set is not distinct from v_set
      and m.seq is not distinct from v_seq
      for update;
  select array_agg(m.id order by m.sort_order, m.created_at, m.id) into v_ids
    from public.class_materials m
   where m.level = v_level
     and m.subject = v_subject
     and m.book_set is not distinct from v_set
     and m.seq is not distinct from v_seq;

  v_pos := array_position(v_ids, p_id);
  v_swap := case when p_up then v_pos - 1 else v_pos + 1 end;
  if v_swap < 1 or v_swap > array_length(v_ids, 1) then
    return; -- 이미 맨 위 · 맨 아래
  end if;

  v_tmp := v_ids[v_pos];
  v_ids[v_pos] := v_ids[v_swap];
  v_ids[v_swap] := v_tmp;

  update public.class_materials m
     set sort_order = x.n - 1
    from unnest(v_ids) with ordinality as x(id, n)
   where m.id = x.id
     and m.sort_order is distinct from x.n - 1;
end;
$$;
comment on function public.move_class_material(bigint, boolean) is
  '수업자료실 자료를 같은 회차 안에서 한 칸 위 · 아래로 (강사 · 관리자). 그 회차 번호를 0 부터 다시 매긴다 (2026-10-12)';
revoke all on function public.move_class_material(bigint, boolean) from public, anon;
grant execute on function public.move_class_material(bigint, boolean) to authenticated, service_role;
