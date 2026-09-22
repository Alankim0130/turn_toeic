import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { HomeworkCheckForm } from "@/components/admin/homework/HomeworkCheckForm";
import { HomeworkPhotos } from "@/components/admin/homework/HomeworkPhotos";
import { classDayLabel, HOMEWORK_SUBJECTS, type HomeworkSubject, homeworkLabel, isSubject, SUBJECT_LABEL } from "@/lib/homework";
import { isImageType } from "@/lib/upload";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "숙제점검", robots: { index: false } };

const STATUS_TABS = [
  { value: "submitted", label: "점검 대기" },
  { value: "checked", label: "점검 완료" },
  { value: "all", label: "전체" },
];
const LIMIT = 300;

export default async function HomeworkAdminPage({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string; status?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  const me = await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const status = STATUS_TABS.some((t) => t.value === sp.status) ? (sp.status as string) : "submitted";

  const { data: levelRows } = await supabase.from("lc_levels").select("level").order("sort_order").order("level");
  const levels = (levelRows ?? []).map((l) => l.level);
  const level = levels.includes(Number(sp.level)) ? Number(sp.level) : null;
  /**
   * **강사별로 가른다 = 과목으로 가른다** (2026-09-22 Alan 요청 "강사별로 나눌수 있게 해줘").
   * 역전토익은 강사가 둘이고 **과목이 고정**이라(`profiles.subject`: 이혜영 lc · 이영수 rc)
   * "강사" 축과 "과목" 축이 같은 집합이다 — 줄을 하나 더 만들면 같은 목록이 두 군데 생기므로
   * 과목 탭에 **강사 이름을 붙이고**(`RC · 이영수`), 강사가 처음 들어오면 **자기 과목부터** 보여 준다.
   * 이름은 DB 에서 읽는다 (작업 원칙 4 — 코드에 강사 이름을 적지 않는다). 관리자(알런)는 과목이 없어 전체부터 본다.
   */
  const mySubject = me.profile.subject && isSubject(me.profile.subject) ? me.profile.subject : null;
  // 칸이 아예 없을 때만 기본값을 쓴다 — `RC · LC 전체`(?subject=all) 를 누른 것은 그대로 존중한다
  const subject = sp.subject ? (isSubject(sp.subject) ? sp.subject : null) : mySubject;
  const defaulted = !sp.subject && !!mySubject;

  // 레벨·과목 필터를 공통으로 걸고, 상태별 건수는 따로 센다 (탭 숫자용)
  const scoped = <T extends { eq: (col: string, v: string | number) => T }>(q: T) => {
    let r = q;
    if (level) r = r.eq("level", level);
    if (subject) r = r.eq("subject", subject);
    return r;
  };
  const count = (s: string) => scoped(supabase.from("homework_submissions").select("id", { count: "exact", head: true }).eq("status", s));

  let listQuery = scoped(
    supabase
      .from("homework_submissions")
      .select(
        "id, level, subject, class_date, question, feedback, status, created_at, checked_at, user:profiles!homework_submissions_user_id_fkey(name, phone), checker:profiles!homework_submissions_checked_by_fkey(name), homework_files(id, file_name, content_type, created_at)",
      ),
  );
  if (status !== "all") listQuery = listQuery.eq("status", status);

  const [{ data: subs }, submitted, checked, { data: instructors }] = await Promise.all([
    listQuery.order("created_at", { ascending: false }).limit(LIMIT),
    count("submitted"),
    count("checked"),
    supabase.from("profiles").select("name, subject").in("subject", [...HOMEWORK_SUBJECTS]),
  ]);
  // 이 조회가 실패해도 탭은 그대로 뜬다 — 이름만 빠진다 (강사 가입 전에도 화면이 살아 있어야 한다)
  const nameOf = new Map((instructors ?? []).flatMap((i) => (i.subject && i.name ? [[i.subject, i.name] as const] : [])));
  const subjectTab = (s: HomeworkSubject) => (nameOf.get(s) ? `${SUBJECT_LABEL[s]} · ${nameOf.get(s)}` : SUBJECT_LABEL[s]);
  const list = subs ?? [];
  const counts: Record<string, number> = {
    submitted: submitted.count ?? 0,
    checked: checked.count ?? 0,
    all: (submitted.count ?? 0) + (checked.count ?? 0),
  };
  const keep = { level: level ? String(level) : undefined, subject: subject ?? undefined, status };

  return (
    <>
      <PageHeader icon="homework" title="숙제점검" description="정규 수업 숙제입니다 (비대면 스터디 인증은 스터디 신청자 화면에 있어요). 강사(과목) → 레벨로 훑어보고, 사진을 눌러 넘겨 보면서 질문에 답하거나 코멘트를 적어 점검완료를 누르면 학생 알림함으로 갑니다." />

      {/* **과목이 먼저, 그 안에서 레벨** (2026-09-19 Alan — "RC와 LC가 구분되어 있고 과목안에서도 레벨까지만 구분이 되면 좋겠어").
          날짜로는 나누지 않는다 — 강사는 과목 × 레벨로 훑는다 */}
      <FilterTabs
        basePath="/admin/homework"
        paramKey="subject"
        current={subject ?? "all"}
        keep={{ level: keep.level, status }}
        tabs={[{ value: "all", label: "RC · LC 전체" }, ...HOMEWORK_SUBJECTS.map((s) => ({ value: s, label: subjectTab(s) }))]}
      />
      {/* 기본값으로 걸린 필터는 **말해 준다** — 안 그러면 반대 과목 숙제가 사라진 것처럼 보인다 */}
      {defaulted && subject && (
        <p className="-mt-3 mb-5 text-xs text-mist">
          {subjectTab(subject)} 숙제부터 보여 주고 있어요. <b className="text-ink-soft">RC · LC 전체</b> 를 누르면 다 보입니다.
        </p>
      )}
      <FilterTabs
        basePath="/admin/homework"
        paramKey="level"
        current={level ? String(level) : "all"}
        keep={{ subject: keep.subject, status }}
        tabs={[{ value: "all", label: "모든 레벨" }, ...levels.map((l) => ({ value: String(l), label: `${l}` }))]}
      />
      <FilterTabs basePath="/admin/homework" paramKey="status" current={status} keep={{ level: keep.level, subject: keep.subject }} tabs={STATUS_TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {list.length === 0 ? (
        <EmptyState icon="homework" title={status === "submitted" ? "점검할 숙제가 없어요" : "해당하는 숙제가 없어요"} description="수강생이 숙제업로드에서 사진을 올리면 여기에 모여요." />
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.map((s) => {
              const files = [...(s.homework_files ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
              const images = files.filter((f) => isImageType(f.content_type));
              const others = files.filter((f) => !isImageType(f.content_type));
              const isChecked = s.status === "checked";
              return (
                <li key={s.id} className={cn("card flex flex-col p-4 sm:p-5", isChecked && "border-brand-200")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-black text-ink">{s.user?.name || "이름 없음"}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {s.level != null && s.subject && <span className="rounded-full bg-ink px-2.5 py-0.5 font-black text-white">{homeworkLabel(s.level, s.subject)}</span>}
                        {s.class_date && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 font-black text-brand-700">{classDayLabel(s.class_date)} 수업</span>}
                        {s.user?.phone && (
                          <a href={`tel:${s.user.phone}`} className="text-brand-600 hover:underline">
                            {s.user.phone}
                          </a>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-mist">
                        {formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 제출 · 사진 {files.length}장
                      </p>
                    </div>
                    {isChecked && (
                      <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">
                        점검완료{s.checker?.name ? ` · ${s.checker.name}` : ""}
                      </span>
                    )}
                  </div>

                  {s.question && (
                    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm">
                      <p className="text-xs font-bold text-brand-700">학생 질문</p>
                      <p className="whitespace-pre-line text-ink">{s.question}</p>
                    </div>
                  )}

                  {/* 사진은 **팝업에서 넘겨 본다** — 그전에는 링크라 새 화면이 떠서 한 장마다 뒤로 가야 했다 (2026-09-22 Alan) */}
                  <HomeworkPhotos
                    photos={images.map((f) => ({ id: f.id, name: f.file_name }))}
                    student={s.user?.name || "수강생"}
                    label={s.level != null && s.subject ? homeworkLabel(s.level, s.subject) : null}
                    checkedNote={isChecked ? `점검완료${s.checker?.name ? ` · ${s.checker.name}` : ""}${s.checked_at ? ` · ${formatDate(s.checked_at, { month: "numeric", day: "numeric" })}` : ""} · 학생에게 알림 발송됨` : null}
                  />
                  {others.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {others.map((f) => (
                        <li key={f.id}>
                          <a href={`/files/homework/${f.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-brand-300">
                            <Icon name="camera" size={18} />
                            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{f.file_name}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* 코멘트·질문 답변을 적고 점검완료하면 학생 알림함으로 간다 */}
                  <div className="mt-auto">
                    <HomeworkCheckForm id={s.id} checked={isChecked} question={s.question} feedback={s.feedback} />
                  </div>
                </li>
              );
            })}
          </ul>
          {list.length >= LIMIT && <p className="mt-4 text-center text-xs text-mist">최근 {LIMIT}건만 보여요. 과목·레벨·상태로 좁혀 주세요.</p>}
        </>
      )}
    </>
  );
}
