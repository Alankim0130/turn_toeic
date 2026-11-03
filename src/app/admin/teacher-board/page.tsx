import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { AddFolderForm, FolderControls } from "@/components/admin/teacher-board/FolderTools";
import { FolderUses, type TermOption } from "@/components/admin/teacher-board/FolderUses";
import { TeacherItemsPanel } from "@/components/admin/teacher-board/TeacherItemsPanel";
import { readAll } from "@/lib/read-all";
import { BOARD_LABEL, groupItemsBySeq, folderUseLabel, type TeacherItemRow } from "@/lib/teacher-board";
import type { RoundSubject } from "@/lib/class-rounds";
import { todayKST, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "강사 자료 게시판", robots: { index: false } };

/**
 * **강사 자료 게시판** (2026-11-03 Alan — "850반 자료는 매달 바뀌기 때문에 한번에 정리를 쫙 해놓고 원하는 과정의 자료를 오픈하는 형태 …
 * 폴더를 여러개 만들고 한 폴더를 클릭해서 수업자료를 여러개 만들어 놓고, 그걸 몇월 수업자료로 사용하고 싶다고 하면 그 자료들이 학생들에게 오픈").
 * 위 줄 RC 강사게시판 · LC 강사게시판(`?subject=`), 왼쪽 폴더 목록, 오른쪽 고른 폴더(`?folder=`) — 이름 · 위치 · 지우기, **몇월 수업자료로 쓰기**,
 * 회차별 자료. 휴대폰은 폴더를 고르면 목록 대신 그 폴더만 보인다 (`← 폴더 목록`).
 * 강사 · 관리자만 — 조교 화면이 아니다 (등급 체계 9-1). 규칙은 `src/lib/teacher-board.ts`.
 */
export default async function TeacherBoardPage({ searchParams }: { searchParams: Promise<{ subject?: string; folder?: string }> }) {
  const { profile } = await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();
  const testing = !!profile.test_role;

  const [{ data: folders, error: foldersError }, { data: useRows, error: usesError }, { data: termRows }, { data: levelRows }, counts] = await Promise.all([
    supabase.from("teacher_folders").select("id, subject, name, sort_order").order("sort_order").order("id"),
    supabase.from("teacher_folder_uses").select("id, folder_id, term_id, level, subject, book_set, term:terms(year, month, closes_at)"),
    supabase.from("terms").select("id, year, month, closes_at").order("year", { ascending: false }).order("month", { ascending: false }).limit(24),
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    readAll<{ folder_id: number }>((from, to, count) =>
      supabase.from("teacher_folder_items").select("folder_id", count ? { count: "exact" } : undefined).order("id").range(from, to),
    ),
  ]);

  // 처음 여는 게시판 — 강사는 자기 과목(이혜영 LC · 이영수 RC), 관리자는 RC (수업자료실과 같은 규칙)
  const subject: RoundSubject = sp.subject === "rc" || sp.subject === "lc" ? sp.subject : profile.subject === "lc" ? "lc" : "rc";
  const all = folders ?? [];
  const list = all.filter((f) => f.subject === subject);
  const folder = list.find((f) => f.id === Number(sp.folder)) ?? null;
  const itemCount = new Map<number, number>();
  for (const r of counts.rows) itemCount.set(r.folder_id, (itemCount.get(r.folder_id) ?? 0) + 1);
  const uses = (useRows ?? []).map((u) => ({ ...u, term: u.term as { year: number; month: number; closes_at: string | null } | null }));
  const usesOf = (id: number) => uses.filter((u) => u.folder_id === id).sort((a, b) => (b.term?.year ?? 0) * 12 + (b.term?.month ?? 0) - ((a.term?.year ?? 0) * 12 + (a.term?.month ?? 0)));

  const { data: itemRows, error: itemsError } = folder
    ? await supabase
        .from("teacher_folder_items")
        .select("id, folder_id, seq, title, note, links, sort_order, created_at, updated_at, files:teacher_folder_files(id, file_name, file_size, content_type, sort_order)")
        .eq("folder_id", folder.id)
    : { data: [] as TeacherItemRow[], error: null };

  // 쓸 수 있는 달 — 아직 종강하지 않은 기수 (지난 달 칸은 학생에게 이미 닫혔다)
  const termOptions: TermOption[] = (termRows ?? [])
    .filter((t) => !t.closes_at || t.closes_at >= today)
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month))
    .map((t) => ({ id: t.id, label: `${t.year}년 ${t.month}월` }));
  const levels = (levelRows ?? []).map((l) => l.level);
  const listHref = (id?: number) => `/admin/teacher-board?subject=${subject}${id ? `&folder=${id}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="download"
        title="강사 자료 게시판"
        description="폴더에 수업자료를 정리해 두고, 몇월 · 어느 과정 자료로 쓸지 고르면 그 반 학생에게 회차 수업일마다 열려요. 강사 · 관리자만 봐요."
      >
        <Link href="/admin/class-materials" className="btn-secondary">
          <Icon name="download" size={18} />
          수업자료실
        </Link>
      </PageHeader>

      <FilterTabs
        basePath="/admin/teacher-board"
        paramKey="subject"
        current={subject}
        tabs={(["rc", "lc"] as const).map((s) => ({ value: s, label: BOARD_LABEL[s], count: all.filter((f) => f.subject === s).length }))}
      />

      {testing && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          테스트 등급을 켠 동안에는 강사 자료 게시판이 보이지 않아요. 위 띠에서 테스트를 끝낸 뒤 열어 주세요.
        </p>
      )}
      {(foldersError || usesError) && !testing && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          강사 자료 게시판을 다 읽지 못했어요. 데이터베이스 업데이트가 아직 적용되지 않았거나 잠깐 연결이 끊겼어요. 잠시 뒤 새로고침해 주세요.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        {/* 폴더 목록 — 휴대폰에서는 폴더를 고르면 숨는다 */}
        <aside className={cn("space-y-3", folder && "hidden lg:block")} aria-label={`${BOARD_LABEL[subject]} 폴더`}>
          <ul className="card divide-y divide-line overflow-hidden">
            {list.map((f) => {
              const fu = usesOf(f.id);
              const active = f.id === folder?.id;
              return (
                <li key={f.id}>
                  <Link
                    href={listHref(f.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-3 px-4 py-3 transition hover:bg-surface", active && "bg-brand-50")}
                  >
                    <Icon name="download" size={20} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block font-bold leading-snug text-ink [overflow-wrap:anywhere]", active && "text-brand-700")}>{f.name}</span>
                      <span className="mt-0.5 block text-xs text-slate">
                        자료 {itemCount.get(f.id) ?? 0}개
                        {fu.length > 0 && <> · {fu.map((u) => `${u.term?.month ?? "?"}월 ${u.level} ${u.book_set}`).join(" · ")}</>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate">아직 폴더가 없어요. 아래에서 폴더를 더해 주세요.</li>}
          </ul>
          {!testing && <AddFolderForm key={subject} subject={subject} label={BOARD_LABEL[subject]} />}
        </aside>

        <section className="min-w-0 space-y-4">
          {folder ? (
            <>
              <Link href={listHref()} className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline lg:hidden">
                ← 폴더 목록
              </Link>
              <div className="card space-y-3 p-4 sm:p-5">
                <p className="text-xs font-bold text-slate">{BOARD_LABEL[subject]}</p>
                <FolderControls
                  key={folder.id}
                  folder={{ id: folder.id, name: folder.name }}
                  first={list[0]?.id === folder.id}
                  last={list[list.length - 1]?.id === folder.id}
                  itemCount={itemCount.get(folder.id) ?? 0}
                  useCount={usesOf(folder.id).length}
                  backHref={listHref()}
                  disabled={testing}
                />
              </div>
              <FolderUses
                key={`uses-${folder.id}`}
                folderId={folder.id}
                subject={subject}
                uses={usesOf(folder.id).map((u) => ({ id: u.id, label: folderUseLabel(u, u.term), ended: !!u.term?.closes_at && u.term.closes_at < today }))}
                terms={termOptions}
                levels={levels}
                disabled={testing}
              />
              {itemsError ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">폴더 안 자료를 읽지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
              ) : (
                <TeacherItemsPanel key={`items-${folder.id}`} folderId={folder.id} groups={groupItemsBySeq(itemRows as TeacherItemRow[] | null)} disabled={testing} />
              )}
            </>
          ) : (
            <div className="card hidden flex-col items-center gap-2 p-10 text-center lg:flex">
              <Icon name="download" size={44} />
              <p className="font-bold text-ink">왼쪽에서 폴더를 골라 주세요</p>
              <p className="text-sm text-slate">폴더 안에 회차별 수업자료를 올리고, 몇월 · 어느 과정 자료로 쓸지 정해요.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
