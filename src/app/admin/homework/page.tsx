import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { HomeworkList, type HomeworkRow } from "@/components/admin/homework/HomeworkList";
import { classDayLabel, HOMEWORK_SUBJECTS, type HomeworkSubject, homeworkLabel, isSubject, SUBJECT_LABEL } from "@/lib/homework";
import { isImageType } from "@/lib/upload";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "숙제점검", robots: { index: false } };

const LIMIT = 300;

export default async function HomeworkAdminPage({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string; done?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  const me = await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  /**
   * **상태는 줄이 아니라 체크박스다** (2026-09-22 Alan — "버튼채우기가 검은색이고 3개가 연속으로 있으니 너무 정신없어").
   * 상태는 `점검 대기` · `점검 완료` 둘뿐이라 세 번째 칸(`전체`)은 그 둘의 합일 뿐이었고, 버튼 줄이 셋이면
   * 어디를 먼저 봐야 할지 없이 전부 소리친다. 지금은 **기본이 미점검**이고 체크 한 번으로 점검완료까지 함께 본다.
   */
  const done = sp.done === "1";

  const { data: levelRows } = await supabase.from("lc_levels").select("level").order("sort_order").order("level");
  const levels = (levelRows ?? []).map((l) => l.level);
  /**
   * **`모든 레벨` · `RC · LC 전체` 칸은 없다** (2026-09-22 Alan — "'전체' '모든레벨' 이 버튼은 없애줘" ·
   * "RC, LC 전체는 아직도 있어"). 그래서 늘 한 과목 · 한 레벨을 보고 있다.
   * 그 대신 **칸마다 미점검 건수를 적는다** — 650 을 보는 동안 750 에 숙제가 쌓여도 숫자가 보이면 놓치지 않는다.
   * 숫자가 없으면 "점검할 숙제가 없어요" 가 이 칸에만 해당하는 말인데 전부 끝난 것처럼 읽혀 **조용히 빠뜨린다.**
   * 레벨 목록을 못 읽으면(levels 가 비면) 레벨로 거르지 않고 그 줄도 그리지 않는다 (FilterTabs).
   */
  const level = levels.includes(Number(sp.level)) ? Number(sp.level) : (levels[0] ?? null);
  /**
   * **강사별로 가른다 = 과목으로 가른다** (2026-09-22 Alan 요청 "강사별로 나눌수 있게 해줘").
   * 역전토익은 강사가 둘이고 **과목이 고정**이라(`profiles.subject`: 이혜영 lc · 이영수 rc)
   * "강사" 축과 "과목" 축이 같은 집합이다 — 줄을 하나 더 만들면 같은 목록이 두 군데 생기므로
   * 과목 탭에 **강사 이름을 붙이고**(`RC · 이영수`), 강사가 처음 들어오면 **자기 과목부터** 보여 준다.
   * 이름은 DB 에서 읽는다 (작업 원칙 4 — 코드에 강사 이름을 적지 않는다).
   * 관리자(알런)는 과목이 없어 첫 과목부터 본다 — 전체를 한 번에 보는 칸은 더 이상 없다.
   */
  const mySubject = me.profile.subject && isSubject(me.profile.subject) ? me.profile.subject : null;
  const subject: HomeworkSubject = (sp.subject && isSubject(sp.subject) ? sp.subject : null) ?? mySubject ?? HOMEWORK_SUBJECTS[0];
  const defaulted = !sp.subject;

  // 레벨·과목 필터를 공통으로 걸고, 탭 숫자는 따로 센다
  const scoped = <T extends { eq: (col: string, v: string | number) => T }>(q: T) => {
    let r = q;
    if (level) r = r.eq("level", level);
    return r.eq("subject", subject);
  };
  /** 탭 숫자 = **그 칸에 남은 미점검 건수** (다른 축은 지금 보고 있는 값 그대로) */
  const pending = (opts: { subject?: HomeworkSubject; level?: number | null }) => {
    let q = supabase.from("homework_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted");
    if (opts.subject) q = q.eq("subject", opts.subject);
    if (opts.level) q = q.eq("level", opts.level);
    return q;
  };

  let listQuery = scoped(
    supabase
      .from("homework_submissions")
      .select(
        "id, level, subject, class_date, question, feedback, status, created_at, checked_at, user:profiles!homework_submissions_user_id_fkey(name, phone), checker:profiles!homework_submissions_checked_by_fkey(name), homework_files(id, file_name, content_type, created_at)",
      ),
  );
  if (!done) listQuery = listQuery.eq("status", "submitted");

  const [{ data: subs }, checkedCount, { data: instructors }, levelCounts, subjectCounts] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).limit(LIMIT),
    scoped(supabase.from("homework_submissions").select("id", { count: "exact", head: true }).eq("status", "checked")),
    supabase.from("profiles").select("name, subject").in("subject", [...HOMEWORK_SUBJECTS]),
    Promise.all(levels.map(async (l) => [l, (await pending({ subject, level: l })).count ?? 0] as const)),
    Promise.all(HOMEWORK_SUBJECTS.map(async (s) => [s, (await pending({ subject: s, level })).count ?? 0] as const)),
  ]);
  const byLevel = new Map(levelCounts);
  const bySubject = new Map(subjectCounts);
  // 이 조회가 실패해도 탭은 그대로 뜬다 — 이름만 빠진다 (강사 가입 전에도 화면이 살아 있어야 한다)
  const nameOf = new Map((instructors ?? []).flatMap((i) => (i.subject && i.name ? [[i.subject, i.name] as const] : [])));
  const subjectTab = (s: HomeworkSubject) => (nameOf.get(s) ? `${SUBJECT_LABEL[s]} · ${nameOf.get(s)}` : SUBJECT_LABEL[s]);

  const waiting = level ? (byLevel.get(level) ?? 0) : (bySubject.get(subject) ?? 0);
  const finished = checkedCount.count ?? 0;

  /** 목록 한 줄에 들어갈 글자는 **서버가 다 만든다** (클라이언트에서 날짜 문구를 다시 짓지 않는다) */
  const rows: HomeworkRow[] = (subs ?? []).map((s) => {
    const files = [...(s.homework_files ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    const images = files.filter((f) => isImageType(f.content_type));
    const others = files.filter((f) => !isImageType(f.content_type));
    const at = formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const parts = [
      s.class_date ? `${classDayLabel(s.class_date)} 수업` : null,
      images.length ? `사진 ${images.length}장` : null,
      others.length ? `첨부 ${others.length}개` : null,
    ].filter(Boolean) as string[];
    const checked = s.status === "checked";
    return {
      id: s.id,
      name: s.user?.name || "이름 없음",
      phone: s.user?.phone ?? null,
      label: s.level != null && s.subject ? homeworkLabel(s.level, s.subject) : null,
      sub: parts.join(" · ") || "올린 파일 없음",
      at,
      meta: [
        ...parts,
        `${at} 제출`,
        checked ? `점검완료${s.checker?.name ? ` · ${s.checker.name}` : ""}${s.checked_at ? ` · ${formatDate(s.checked_at, { month: "numeric", day: "numeric" })}` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      checked,
      question: s.question,
      feedback: s.feedback,
      photos: images.map((f) => ({ id: f.id, name: f.file_name })),
      files: others.map((f) => ({ id: f.id, name: f.file_name })),
    };
  });

  const keep = { level: level ? String(level) : undefined, subject, done: done ? "1" : undefined };

  return (
    <>
      <PageHeader
        icon="homework"
        title="숙제점검"
        description="정규 수업 숙제입니다 (비대면 스터디 인증은 스터디 신청자 화면에 있어요). 강사(과목) → 레벨로 좁힌 뒤, 학생 줄을 누르면 숙제 사진을 넘겨 보면서 질문에 답하고 점검완료할 수 있어요."
      />

      {/* **과목이 먼저, 그 안에서 레벨** (2026-09-19 Alan — "RC와 LC가 구분되어 있고 과목안에서도 레벨까지만 구분이 되면 좋겠어").
          날짜로는 나누지 않는다 — 날짜는 학생이 찾는 길이고, 강사는 과목 × 레벨로 훑는다.
          **무게를 달리한다** — 과목은 채운 세그먼트, 레벨은 테두리 알약 (줄이 둘 다 꽉 차면 정신없다) */}
      <FilterTabs
        basePath="/admin/homework"
        paramKey="subject"
        current={subject}
        keep={{ level: keep.level, done: keep.done }}
        tabs={HOMEWORK_SUBJECTS.map((s) => ({ value: s, label: subjectTab(s), count: bySubject.get(s) ?? 0 }))}
      />
      <FilterTabs
        basePath="/admin/homework"
        paramKey="level"
        current={level ? String(level) : ""}
        keep={{ subject: keep.subject, done: keep.done }}
        variant="outline"
        tabs={levels.map((l) => ({ value: String(l), label: `${l}`, count: byLevel.get(l) ?? 0 }))}
      />

      {/* 몇 건을 보고 있는지 + 점검완료까지 함께 볼지 (첫토익과 같은 자리) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-bold text-ink-soft">
          미점검 <span className="text-ink tabular-nums">{waiting}</span>건{done && <span className="text-mist"> · 점검완료 {finished}건</span>}
        </p>
        <Link
          href={`/admin/homework?subject=${subject}${level ? `&level=${level}` : ""}${done ? "" : "&done=1"}`}
          className="flex items-center gap-2 text-sm font-bold text-ink-soft transition hover:text-brand-600"
        >
          <span
            aria-hidden
            className={cn("flex size-5 items-center justify-center rounded-md border-2 transition", done ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper")}
          >
            {done && (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[3.5]">
                <path d="m5 13 5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          점검완료 포함
          <span className="sr-only">{done ? " — 지금 켜짐, 누르면 끕니다" : " — 지금 꺼짐, 누르면 켭니다"}</span>
        </Link>
      </div>

      {/* 기본값으로 걸린 필터는 **말해 준다** — 안 그러면 반대 과목 숙제가 사라진 것처럼 보인다 */}
      {defaulted && (
        <p className="-mt-2 mb-4 text-xs text-mist">
          {subjectTab(subject)} 숙제부터 보여 주고 있어요. 위에서 과목·레벨을 바꿀 수 있고, 칸의 숫자가 그쪽에 남은 미점검 건수예요.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="homework"
          title={done ? "해당하는 숙제가 없어요" : "점검할 숙제가 없어요"}
          description="수강생이 숙제업로드에서 사진을 올리면 여기에 모여요. 다른 과목·레벨 칸의 숫자도 확인해 보세요."
        />
      ) : (
        <>
          <HomeworkList rows={rows} />
          {rows.length >= LIMIT && <p className="mt-4 text-center text-xs text-mist">최근 {LIMIT}건만 보여요. 과목·레벨로 좁혀 주세요.</p>}
        </>
      )}
    </>
  );
}
