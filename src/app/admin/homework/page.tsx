import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { TermChips } from "@/components/admin/TermChips";
import { HomeworkCheckButton } from "@/components/admin/studies/HomeworkCheckButton";
import { labelKo } from "@/components/admin/sections/dates";
import { formatBytes, termParam } from "@/lib/study";
import { isImageType } from "@/lib/upload";
import { pickTerm, termLabel } from "../_lib/queries";

export const metadata: Metadata = { title: "숙제점검", robots: { index: false } };

const STATUS_TABS = [
  { value: "submitted", label: "점검 대기" },
  { value: "checked", label: "점검 완료" },
  { value: "all", label: "전체" },
];

export default async function HomeworkAdminPage({ searchParams }: { searchParams: Promise<{ term?: string; date?: string; status?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();
  const status = STATUS_TABS.some((t) => t.value === sp.status) ? (sp.status as string) : "submitted";

  // 비대면스터디가 있는 기수
  const { data: online } = await supabase.from("studies").select("id, term:terms(id, year, month)").eq("kind", "online");
  const studyByTerm = new Map<number, number>();
  const terms: { id: number; year: number; month: number }[] = [];
  for (const s of online ?? []) {
    if (!s.term) continue;
    studyByTerm.set(s.term.id, s.id);
    terms.push(s.term);
  }
  terms.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const term = pickTerm(terms, sp.term, today);

  const header = <PageHeader icon="homework" title="숙제점검" description="비대면스터디 수강생이 날짜별 자료를 풀고 올린 숙제입니다. 확인한 뒤 점검완료를 눌러 주세요." />;

  if (!term) {
    return (
      <>
        {header}
        <EmptyState icon="homework" title="아직 비대면스터디가 없어요" description="반 편성 화면에서 그 달 비대면스터디를 열고 자료를 올리면, 제출된 숙제가 여기에 모여요." action={{ href: "/admin/sections", label: "스터디 열기" }} />
      </>
    );
  }

  const termKey = termParam(term.year, term.month);
  const studyId = studyByTerm.get(term.id)!;
  const [{ data: materials }, { data: signups }] = await Promise.all([
    supabase.from("study_materials").select("id, date, title").eq("study_id", studyId).order("date", { ascending: false }),
    supabase.from("study_signups").select("user_id, user:profiles!study_signups_user_id_fkey(name)").eq("study_id", studyId),
  ]);

  const materialList = materials ?? [];
  const selected = materialList.find((m) => m.date === sp.date) ?? null;
  const targetIds = selected ? [selected.id] : materialList.map((m) => m.id);

  const { data: subs } = targetIds.length
    ? await supabase
        .from("homework_submissions")
        .select(
          "id, material_id, user_id, status, created_at, checked_at, user:profiles!homework_submissions_user_id_fkey(name, phone), checker:profiles!homework_submissions_checked_by_fkey(name), homework_files(id, file_name, content_type, file_size, created_at)",
        )
        .in("material_id", targetIds)
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  const all = subs ?? [];
  const list = status === "all" ? all : all.filter((s) => s.status === status);
  const counts: Record<string, number> = {
    submitted: all.filter((s) => s.status === "submitted").length,
    checked: all.filter((s) => s.status === "checked").length,
    all: all.length,
  };
  const materialById = new Map(materialList.map((m) => [m.id, m]));
  const submittedPerMaterial = new Map<number, number>();
  if (!selected) for (const s of all) submittedPerMaterial.set(s.material_id, (submittedPerMaterial.get(s.material_id) ?? 0) + 1);

  // 선택한 날짜의 미제출자
  const submittedUsers = new Set(all.map((s) => s.user_id));
  const missing = selected ? (signups ?? []).filter((g) => !submittedUsers.has(g.user_id)) : [];

  return (
    <>
      {header}
      <TermChips basePath="/admin/homework" terms={terms} current={termKey} keep={{ status }} />

      {materialList.length === 0 ? (
        <EmptyState icon="online" title={`${termLabel(term)} 비대면 자료가 아직 없어요`} description="자료를 올리면 수강생이 풀고 숙제를 제출할 수 있어요." action={{ href: `/admin/study-materials?term=${termKey}`, label: "자료 올리기" }} />
      ) : (
        <>
          <FilterTabs
            basePath="/admin/homework"
            paramKey="date"
            current={selected?.date ?? "all"}
            keep={{ term: termKey, status }}
            tabs={[
              { value: "all", label: "모든 날짜" },
              ...materialList.map((m) => ({ value: m.date, label: `${Number(m.date.slice(5, 7))}/${Number(m.date.slice(8, 10))}` })),
            ]}
          />
          <FilterTabs
            basePath="/admin/homework"
            paramKey="status"
            current={status}
            keep={{ term: termKey, date: selected?.date }}
            tabs={STATUS_TABS.map((t) => ({ ...t, count: counts[t.value] }))}
          />

          {selected && (
            <section className="card mb-5 p-4 text-sm">
              <p className="font-black text-ink">
                {labelKo(selected.date)} {selected.title && <span className="font-semibold text-slate">· {selected.title}</span>}
              </p>
              <p className="mt-1 text-slate">
                제출 <strong className="text-brand-600">{all.length}</strong> / 신청 {signups?.length ?? 0}명
                {missing.length > 0 && (
                  <>
                    {" "}· 미제출 {missing.length}명: <span className="text-ink">{missing.map((g) => g.user?.name || "이름 없음").join(", ")}</span>
                  </>
                )}
              </p>
            </section>
          )}

          {list.length === 0 ? (
            <EmptyState icon="homework" title={status === "submitted" ? "점검할 숙제가 없어요" : "해당하는 숙제가 없어요"} />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {list.map((s) => {
                const m = materialById.get(s.material_id);
                const files = [...(s.homework_files ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
                const images = files.filter((f) => isImageType(f.content_type));
                const others = files.filter((f) => !isImageType(f.content_type));
                const checked = s.status === "checked";
                return (
                  <li key={s.id} className={cn("card flex flex-col p-4 sm:p-5", checked && "border-brand-200")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-black text-ink">{s.user?.name || "이름 없음"}</p>
                        <p className="text-xs text-slate">
                          {m ? labelKo(m.date) : "자료"}
                          {m?.title ? ` · ${m.title}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-mist">
                          {formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 제출 · 파일 {files.length}개
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {checked && (
                          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">
                            점검완료{s.checker?.name ? ` · ${s.checker.name}` : ""}
                          </span>
                        )}
                        <HomeworkCheckButton id={s.id} checked={checked} />
                      </div>
                    </div>

                    {images.length > 0 && (
                      <ul className="mt-3 grid grid-cols-3 gap-2">
                        {images.map((f) => (
                          <li key={f.id}>
                            <a href={`/files/homework/${f.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line bg-surface" title={`${f.file_name} 크게 보기`}>
                              {/* 비공개 서명 URL 로 리다이렉트되는 썸네일이라 next/image 최적화를 쓰지 않는다 */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/files/homework/${f.id}?w=400`} alt={`${s.user?.name ?? "수강생"} 숙제 사진`} loading="lazy" className="aspect-square w-full object-cover" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {others.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {others.map((f) => (
                          <li key={f.id}>
                            <a href={`/files/homework/${f.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-brand-300">
                              <Icon name="textbook" size={18} />
                              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{f.file_name}</span>
                              <span className="text-xs text-mist">{formatBytes(f.file_size)}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!selected && m && (
                      <Link href={`/admin/homework?term=${termKey}&date=${m.date}&status=${status}`} className="mt-3 self-start text-xs font-bold text-brand-600 hover:underline">
                        이 날짜만 보기 ({submittedPerMaterial.get(m.id) ?? 0}건) →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
