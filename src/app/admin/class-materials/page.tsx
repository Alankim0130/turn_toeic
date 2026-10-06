import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { TermChips } from "@/components/admin/TermChips";
import { ClassMaterialRound } from "@/components/admin/class-materials/ClassMaterialRound";
import { ClassMaterialRow } from "@/components/admin/class-materials/ClassMaterialRow";
import { isMaterialSubject, MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";
import { isRoundSet, ROUND_SET_LABEL, ROUND_SETS, roundRowCount, type RoundSet } from "@/lib/class-rounds";
import { bookTimesLabel } from "@/lib/lc-audio";
import { termParam } from "@/lib/study";
import { shortDay } from "@/lib/study-rounds";
import { todayKST, TRACK_LABEL } from "@/lib/utils";
import { requireStaff } from "@/lib/auth";
import Link from "next/link";
import { NoticeList } from "@/components/class-materials/NoticeList";
import { noticeCovers, scopeLabel, scopeOf } from "@/lib/class-notices";
import { pickTerm, termLabel, TERM_COLUMNS } from "../_lib/queries";

export const metadata: Metadata = { title: "수업자료실", robots: { index: false } };

/** 둘째 줄 칸 = 과목 × 과정 (RC A과정 · RC B과정 · LC A과정 · LC B과정) — 버튼 줄을 셋 쌓지 않으려고 한 줄로 묶었다 (디자인 원칙) */
const cellValue = (s: MaterialSubject, set: RoundSet) => `${s}-${set}`;

/**
 * 수업자료실 (2026-10-05 Alan — "레벨별 구분과 RC, LC가 구분되어야해" → 같은 날 "수업자료실에 A/B 과정 전부다 나눠서 올릴 수 있도록 해야해!
 * RC, LC전부다" · "자료게시판도 일정표 기반으로 오픈 … 해당날짜 수업이 진행되면 하나씩 오픈", 고른 것 "과정 · 회차마다").
 * **레벨 → 과목 × 과정 → 회차.** 자료는 회차마다 올리고, 그 과정을 쓰는 반의 학생에게 **그 반의 N번째 수업일에** 열린다.
 * 한 번 올리면 그 과정이 돌아오는 달마다 다시 쓴다 (LC 음원과 같다 — 과정 글자는 달마다 시간대를 바꿔 돈다).
 * 위 달 칩은 "그 달엔 이 과정이 언제 어느 반에서 몇 회차까지인가" 를 미리 보는 것이다 — 자료를 달마다 따로 올리지 않는다.
 * 레벨은 교재 레벨 목록(lc_levels)에서 읽는다 (코드에 650 · 750 · 850 을 적지 않는다). 강사는 **자기 과목부터**(`profiles.subject`), 관리자는 RC 부터.
 * 강사·관리자만 — 조교 화면이 아니다 (관리자 화면 여섯 가지는 Alan 이 정했다).
 */
export default async function ClassMaterialsAdminPage({ searchParams }: { searchParams: Promise<{ level?: string; cell?: string; subject?: string; term?: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다
  const { profile } = await requireStaff();
  // 테스트 등급을 켜면 RLS 가 학생으로 본다 — 열린 회차만 보이고 올리기 · 고치기가 막힌다. 그대로 두되 까닭을 말한다
  const testing = profile.test_role != null;
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  const [{ data: levelRows }, { data: terms }] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    supabase.from("terms").select(TERM_COLUMNS).order("year", { ascending: false }).order("month", { ascending: false }).limit(24),
  ]);
  const levels = (levelRows ?? []).map((l) => l.level);
  const level = levels.includes(Number(sp.level)) ? Number(sp.level) : (levels[0] ?? null);
  const mySubject = isMaterialSubject(profile.subject) ? profile.subject : null;
  // ?cell=rc-A (예전 주소 ?subject=rc 도 받는다)
  const [cellSubject, cellSet] = (sp.cell ?? "").split("-");
  const subject: MaterialSubject = (isMaterialSubject(cellSubject) ? cellSubject : isMaterialSubject(sp.subject) ? sp.subject : null) ?? mySubject ?? MATERIAL_SUBJECTS[0];
  const set: RoundSet = isRoundSet(cellSet) ? cellSet : "A";
  const defaulted = !sp.cell && !sp.subject && mySubject !== null;
  const term = pickTerm(terms ?? [], sp.term, today);
  const termKey = term ? termParam(term.year, term.month) : undefined;

  const header = (
    <PageHeader
      icon="download"
      title="수업자료실"
      description="레벨 → 과목 · 과정을 고르고 회차마다 자료를 올려요. 그 과정을 듣는 학생에게 그 반의 회차 수업일에 하나씩 열려요."
    />
  );

  if (level === null) {
    return (
      <>
        {header}
        <EmptyState icon="warning" title="레벨 목록을 읽지 못했어요" description="잠시 뒤 새로고침해 주세요. 레벨은 LC 음원과 같은 교재 레벨 목록을 써요." />
      </>
    );
  }

  /** 칸 숫자 = 그 칸에 올라온 자료 수 (다른 축은 지금 보고 있는 값 그대로 — 숙제점검과 같은 규칙) */
  const count = async (l: number, s: MaterialSubject, b: RoundSet) =>
    (await supabase.from("class_materials").select("id", { count: "exact", head: true }).eq("level", l).eq("subject", s).eq("book_set", b)).count ?? 0;
  // 파일은 자료마다 0 ~ 20개 (class_material_files, 2026-10-06) — 줄이 순서대로 정렬한다
  const cols = "id, level, subject, book_set, seq, title, note, created_at, updated_at, files:class_material_files(id, file_name, file_size, content_type, sort_order)";

  const [{ data: rows, error }, { data: loose }, levelCounts, cellCounts, { data: sectionRows }, { data: noticeRows }] = await Promise.all([
    supabase.from("class_materials").select(cols).eq("level", level).eq("subject", subject).eq("book_set", set).order("seq").order("created_at"),
    // 과정 · 회차를 정하기 전에 올린 자료 (2026-10-05 오전 — 칸이 생기기 전). 학생에게 보이지 않는다
    supabase.from("class_materials").select(cols).eq("level", level).eq("subject", subject).is("book_set", null).order("created_at", { ascending: false }),
    Promise.all(levels.map(async (l) => [l, await count(l, subject, set)] as const)),
    Promise.all(MATERIAL_SUBJECTS.flatMap((s) => ROUND_SETS.map(async (b) => [cellValue(s, b), await count(level, s, b)] as const))),
    // 그 달 이 과정을 쓰는 반과 회차 — 시간 단위 반(과목 · 과정 일치)과 과목 칸이 빈 방학달 통짜 반
    term
      ? supabase
          .from("class_sections")
          .select("id, track, time_block, subject, book_set, course:courses!inner(target_score), session_dates(seq, date)")
          .eq("term_id", term.id)
          .eq("book_set", set)
          .eq("course.target_score", level)
          .or(`subject.is.null,subject.eq.${subject}`)
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("class_notices").select("id, title, levels, subjects, author_name, created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  // 공지 — 지금 보고 있는 레벨 · 과목 학생에게도 보이는 것 (전체 공지 포함). 다른 범위 공지는 그 레벨 · 과목에서 보인다
  const allNotices = noticeRows ?? [];
  const notices = allNotices.filter((n) => noticeCovers(scopeOf(n), level, subject)).map((n) => ({ ...n, scope: scopeLabel(scopeOf(n)) }));
  const byLevel = new Map(levelCounts);
  const byCell = new Map(cellCounts);
  const list = rows ?? [];
  const legacy = loose ?? [];
  const sections = sectionRows ?? [];

  // 회차 → 그 달 수업일 (반이 둘이면 이른 날 — 학생 화면 · DB 와 같은 규칙)
  const dateOfSeq = new Map<number, string>();
  for (const s of sections) {
    for (const d of s.session_dates ?? []) {
      const prev = dateOfSeq.get(d.seq);
      if (!prev || d.date < prev) dateOfSeq.set(d.seq, d.date);
    }
  }
  const termRounds = Math.max(0, ...dateOfSeq.keys());
  const maxUploaded = Math.max(0, ...list.map((m) => m.seq ?? 0));
  const roundCount = roundRowCount(termRounds, maxUploaded);
  const times = bookTimesLabel(sections, TRACK_LABEL);
  const cellLabel = `${level} ${MATERIAL_SUBJECT_LABEL[subject]} ${ROUND_SET_LABEL[set]}`;
  const keep = { level: String(level), cell: cellValue(subject, set), term: termKey };

  return (
    <>
      {header}

      {/* **레벨이 먼저, 그 안에서 과목 × 과정** (Alan 이 말한 순서 + A/B). 첫째 줄은 채운 세그먼트, 둘째 줄은 테두리 (FilterTabs 무게 규칙) */}
      <FilterTabs
        basePath="/admin/class-materials"
        paramKey="level"
        current={String(level)}
        keep={{ cell: keep.cell, term: termKey }}
        tabs={levels.map((l) => ({ value: String(l), label: `${l}`, count: byLevel.get(l) ?? 0 }))}
      />
      <FilterTabs
        basePath="/admin/class-materials"
        paramKey="cell"
        current={cellValue(subject, set)}
        keep={{ level: String(level), term: termKey }}
        variant="outline"
        tabs={MATERIAL_SUBJECTS.flatMap((s) =>
          ROUND_SETS.map((b) => ({ value: cellValue(s, b), label: `${MATERIAL_SUBJECT_LABEL[s]} ${ROUND_SET_LABEL[b]}`, count: byCell.get(cellValue(s, b)) ?? 0 })),
        )}
      />

      {/* 기본값으로 걸린 과목은 말해 준다 — 안 그러면 다른 과목 자료가 사라진 것처럼 보인다 */}
      {defaulted && <p className="-mt-1 mb-3 text-xs text-mist">내 과목({MATERIAL_SUBJECT_LABEL[subject]}) 자료부터 보여 주고 있어요. 위에서 레벨 · 과목 · 과정을 바꿀 수 있어요.</p>}

      {term && <TermChips basePath="/admin/class-materials" terms={terms ?? []} current={termKey ?? null} keep={{ level: String(level), cell: keep.cell }} />}

      <div className="space-y-4">
        <section className="card space-y-1 p-4 text-sm text-slate sm:p-5">
          <p>
            <span className="font-black text-ink">{cellLabel}</span> 자료 <strong className="text-brand-600">{list.length}</strong>개 · 회차마다 올리면 이 과정을 듣는 학생에게{" "}
            <strong className="text-ink">그 반의 회차 수업일</strong>에 하나씩 열려요. 한 번 올리면 이 과정이 돌아오는 달마다 다시 써요. 자료 하나에 파일을 여러 개
            붙여도 되고, 파일 없이 글(안내 · 스크립트)만 올려도 돼요.
          </p>
          {term &&
            (sections.length > 0 ? (
              <p>
                {termLabel(term)}에는 <strong className="text-ink">{times || "시간 미정"}</strong> 수업이 이 과정이에요 — 1~{termRounds}회차가 아래 날짜에 열려요.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-amber-800">
                <Icon name="warning" size={16} />
                {termLabel(term)}에는 이 과정의 {level} {MATERIAL_SUBJECT_LABEL[subject]} 반이 없어요 — 자료는 올려 두면 이 과정이 돌아오는 달에 열려요.
              </p>
            ))}
        </section>

        {testing && (
          <p className="card p-4 text-sm text-slate">
            테스트 등급을 켠 동안에는 학생처럼 <strong className="text-ink">내 반의 열린 회차 자료만</strong> 보이고 올리기 · 고치기를 할 수 없어요. 위 띠에서 테스트를 끝내면 돼요.
          </p>
        )}

        {/* 칸이 생기기 전에 올린 자료 — 과정 · 회차를 정해야 학생에게 열린다 */}
        {legacy.length > 0 && (
          <section className="space-y-3 rounded-xl2 border border-amber-200 bg-amber-50/60 p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-amber-900">
              <Icon name="warning" size={18} />
              과정 · 회차가 정해지지 않은 {level} {MATERIAL_SUBJECT_LABEL[subject]} 자료 {legacy.length}개 — 학생에게 보이지 않아요. 수정에서 과정과 회차를 골라 주세요.
            </p>
            <ul className="space-y-3">
              {legacy.map((m) => (
                <ClassMaterialRow key={`${m.id}-${m.updated_at}`} item={m} levels={levels} disabled={testing} />
              ))}
            </ul>
          </section>
        )}

        {/* 공지사항 — 1회차 앞 (2026-10-05 Alan "수업자료실에서 1회차 앞에 공지사항을 올릴 수 있는 곳 … 여러개") */}
        <section aria-labelledby="notice-head" className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 id="notice-head" className="text-base font-black text-ink">
              공지사항
            </h2>
            <span className="text-xs text-mist">
              {level} {MATERIAL_SUBJECT_LABEL[subject]} 학생에게 보이는 공지 {notices.length}개
              {allNotices.length > notices.length && <> · 다른 범위 {allNotices.length - notices.length}개</>}
            </span>
            {!testing && (
              <Link href={`/admin/class-materials/notices/new?${new URLSearchParams({ ...keep, term: termKey ?? "" }).toString()}`} className="btn-primary ml-auto !px-3 !py-1.5 text-sm">
                공지 올리기
              </Link>
            )}
          </div>
          {notices.length > 0 ? (
            <NoticeList items={notices} hrefOf={(id) => `/admin/class-materials/notices/${id}?${new URLSearchParams({ ...keep, term: termKey ?? "" }).toString()}`} />
          ) : (
            <p className="rounded-xl2 border border-dashed border-line px-4 py-3 text-sm text-mist">올린 공지가 없어요. 공지는 범위(전체 · 레벨 · RC/LC)를 골라 올리고, 학생 수업자료실 맨 위에 보여요.</p>
          )}
        </section>

        {error ? (
          <EmptyState icon="warning" title="자료를 불러오지 못했어요" description="잠시 뒤 새로고침해 주세요." />
        ) : (
          <ol className="space-y-3" aria-label={`${cellLabel} 회차`}>
            {Array.from({ length: roundCount }, (_, k) => k + 1).map((seq) => {
              const date = dateOfSeq.get(seq) ?? null;
              return (
                <ClassMaterialRound
                  key={`${level}-${subject}-${set}-${seq}`}
                  level={level}
                  subject={subject}
                  set={set}
                  seq={seq}
                  dateLabel={date ? `${shortDay(date)}${date <= today ? " 열림" : " 열림 예정"}` : term ? `${term.month}월엔 이 회차 수업이 없어요` : null}
                  opened={!!date && date <= today}
                  items={list.filter((m) => m.seq === seq)}
                  levels={levels}
                  disabled={testing}
                />
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}
