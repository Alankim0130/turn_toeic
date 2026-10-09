import { loadGated } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { BookCover } from "@/components/lc/BookCover";
import { cn, formatDate, todayKST, TRACK_LABEL } from "@/lib/utils";
import { BOOK_SET_LABEL, bookLabel, bookSectionsByLevel, bookTimesLabel, coverSrc, DAYS, lessonRangeLabel, sortBooks } from "@/lib/lc-audio";
import { cellLevels, isRoundOpen, roundKey } from "@/lib/class-rounds";
import { shortDay } from "@/lib/study-rounds";
import { getMyAccessibleSections, getMyLcAudio, getMyOrders, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = { title: "LC 음원듣기", robots: { index: false } };

export default async function LcAudioPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다 — 잠금 판정과 데이터를 함께 받는다 (loadGated)
  const g = await loadGated("lc-audio", () => Promise.all([searchParams, getMyLcAudio(), getMyOrders(), getMyAccessibleSections()]));
  if (g.locked) return g.locked;
  const [sp, { levels, cells, dates, books: bookRows, tracks }, orders, mySections] = g.data;
  const header = (
    <PageHeader icon="headphones" title="LC 음원듣기" description="내 교재를 누르면 수업 날짜에 맞춰 음원이 열려요. 수업일 전 강의는 잠겨 있어요." />
  );

  /**
   * **개강일부터 종강일까지만 열린다 — 스태프도 학생 모드에서는 같다** (2026-10-02 Alan "개강을 안하면 아직 LC음원을 보여주면 안되지!
   * 뭐든 권한이 개강일에 맞춰서 오픈되고 종강일에 맞춰서 취소가 되는건데").
   * 그전에는 스태프에게 배정이 없어도 전체 교재를 보여 줬다 — 10월 반에 배정된 관리자가 개강 전에 "반 배정이 없어 모든 교재" 를 봤다.
   * 개강 전 배정이 있으면 그 날짜를 적어 준다. `my_section_ids()` 가 비어 있으면(RLS 와 같은 판정) 역시 닫힌 것으로 본다.
   */
  const { accessTerms, opensOn } = await getMyStudyEligibility(orders);
  if (accessTerms.size === 0 || mySections.length === 0) {
    const opens = [...opensOn.values()].sort()[0];
    return (
      <div className="space-y-8">
        {header}
        {opens ? (
          <EmptyState
            icon="headphones"
            title="개강일부터 들을 수 있어요"
            description={`${formatDate(opens)} 개강부터 내 레벨 교재의 LC 음원이 열려요.`}
            action={{ href: "/my", label: "내 등록 현황 보기" }}
          />
        ) : (
          <EmptyState
            icon="headphones"
            title="수강 중인 수강생만 들을 수 있어요"
            description="등업신청이 승인되고 개강일이 되면 LC 음원이 열려요."
            action={{ href: "/my/verify", label: "등업신청 확인하기" }}
          />
        )}
      </div>
    );
  }

  /**
   * **내 LC 과정 칸의 교재만** 보여 준다 (2026-09-16 Alan → 2026-10-05 수업 날짜에 맞춰 — "LC음원듣기와 자료게시판도 수업날짜에 맞춰서 오픈").
   * 칸 = 레벨 × A/B — 그 교재 과정을 쓰는 내 LC 반이 있어야 한다 (`getMyLcAudio`, DB `private.my_round_cells`). 650 반이면 650 교재만,
   * 주5일 120분은 한 시간은 A, 다른 시간은 B 라 두 권, 스파르타반은 함께 듣는 반의 LC 과정까지. **전체를 보여 주는 길은 없다** (2026-10-02 Alan — 위).
   * 음원은 **그 강의 내 수업일부터** 열린다 — 목록에는 열린 강 수와 다음에 열리는 날을 적는다.
   */
  const mine = cellLevels(cells, "lc");

  /**
   * **RC 단과 학생에게는 LC 음원이 없다** (2026-10-05 Alan — "RC단과 학생들은 음원파일과 LC수업자료실에 접근 안되는거 맞지?").
   * 내 수업이 전부 RC 시간이면(주3일 60분 RC 등) LC 칸이 없어 DB 도 LC 교재 · 음원 · 표지를 하나도 열지 않는다.
   * 등업신청 안내를 띄우면 틀린 말이 된다 — 수강 중인데 과목이 RC 일 뿐이다. RC 자료는 수업자료실에 있다.
   * RC 칸이 실제로 있을 때만 이렇게 말한다 — 둘 다 비면(과정이 아직 안 정해진 반) 아래 "내 교재가 아직 없어요" 로 간다 (없는 까닭을 지어내지 않는다).
   */
  if (mine.length === 0 && cellLevels(cells, "rc").length > 0) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon="headphones"
          title="LC 음원은 LC 수업 수강생에게 열려요"
          description="지금 듣는 수업이 RC라 LC 교재 · 음원이 없어요. RC 수업 자료는 수업자료실에서 받을 수 있어요."
          action={{ href: "/my/materials", label: "수업자료실 가기" }}
        />
      </div>
    );
  }

  const books = sortBooks(bookRows);
  const countByBook = new Map<number, number>();
  for (const t of tracks) if (t.book_id) countByBook.set(t.book_id, (countByBook.get(t.book_id) ?? 0) + 1);
  const today = todayKST();
  /** 다음에 열리는 강 — 그 교재의 내 수업일 중 오늘 뒤 첫 날 (없으면 null) */
  const nextLesson = (b: (typeof books)[number]) => {
    for (const day of DAYS) {
      const date = dates.get(roundKey(b.level, "lc", b.book_set, day));
      if (date && !isRoundOpen(date, today)) return { lessonNo: (b.lesson_offset ?? 0) + day, date };
    }
    return null;
  };
  const myLevels = levels.filter((l) => mine.includes(l));
  /**
   * 그 교재를 쓰는 **내 시간**(카드 문구). 교재는 달이 아니라 시간대 · 트랙으로 정해진다
   * (2026-09-16 편성표, 2026-09-19 Alan 재지적) — 같은 9월에도 650 화목금 10:00 은 A, 월수금 11:10 은 B 다.
   * **레벨마다 따로 모은다** — 스파르타 650 학생은 650 과 850 에서 서로 다른 교재를 쓸 수 있다.
   */
  const myBooks = bookSectionsByLevel(mySections);

  const shownLevels = myLevels;
  const level = shownLevels.includes(Number(sp.level)) ? Number(sp.level) : (shownLevels[0] ?? null);

  // 내 LC 칸이 없다 — 과정(A/B)이 아직 안 정해진 반이거나 교재 레벨 목록에 그 레벨이 없을 때. 다른 레벨로 메우지 않는다
  if (level === null) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="headphones" title="내 교재가 아직 없어요" description="강사님이 내 반의 교재 과정을 정하면 수업 날짜에 맞춰 여기에서 들을 수 있어요." />
      </div>
    );
  }

  /** 내 시간에 쓰는 교재만 (2026-09-19 Alan "학생 권한에 맞는 책을 보여주면 좋겠어") — 위에서 칸으로 이미 걸렀다 */
  const mySetsHere = myBooks.get(level);
  const levelBooks = books.filter((b) => b.level === level);

  return (
    <div className="space-y-6">
      {header}

      {/* 레벨이 여러 개일 때만 고르게 한다 (내 반이 정해져 있으면 한 개뿐이라 숨긴다) */}
      {shownLevels.length > 1 && (
        <nav aria-label="레벨" className="flex flex-wrap gap-2">
          {shownLevels.map((l) => (
            <Link
              key={l}
              href={`/my/lc-audio?level=${l}`}
              aria-current={l === level ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-black tabular-nums transition",
                l === level ? "bg-brand-500 text-white shadow-pink" : "bg-surface text-slate ring-1 ring-line hover:text-brand-600",
              )}
            >
              {l}
            </Link>
          ))}
        </nav>
      )}

      {/* 교재는 달이 아니라 내가 LC 를 듣는 시간이 정한다 — 홀수달/짝수달이라고 적지 말 것 (2026-09-19 Alan).
          flex 로 늘어놓지 않고 한 문단으로 흘린다 — 칸으로 나누면 굵은 글자 뒤에서 줄이 꺾여 "…교재 / 예요" 로 읽힌다 */}
      <p className="text-sm text-slate">
        <Icon name="calendar" size={16} className="mr-1.5 inline-block align-text-bottom" />
        <strong className="text-brand-600">내가 LC 를 듣는 시간의 교재</strong>예요. 강마다 <strong className="text-ink">그 수업일</strong>에 음원이 열려요.
        <span className="text-mist"> · 내 반 {level}</span>
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {levelBooks.map((b) => {
          // 이 교재를 쓰는 **내 시간** — 카드에 달 대신 이것을 적는다 (주5일로 합치지 않는다)
          const when = bookTimesLabel(mySetsHere?.get(b.book_set as "A" | "B") ?? [], TRACK_LABEL);
          const count = countByBook.get(b.id) ?? 0;
          const next = nextLesson(b);
          return (
            <li key={b.id}>
              <Link
                href={`/my/lc-audio/${b.id}`}
                className={cn(
                  "group flex h-full gap-4 rounded-xl3 border p-4 transition sm:flex-col sm:gap-3 sm:p-5",
                  when ? "border-brand-200 bg-gradient-to-br from-brand-50 via-paper to-paper" : "border-line bg-paper hover:border-brand-200",
                )}
              >
                <div className="w-24 shrink-0 sm:mx-auto sm:w-40">
                  <BookCover src={b.cover_name ? coverSrc(b, 480) : null} alt={`${b.level} ${BOOK_SET_LABEL[b.book_set]} 교재 표지`} />
                </div>
                <div className="min-w-0 flex-1 sm:text-center">
                  {when && (
                    <span className="mb-1 inline-flex rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-black text-white shadow-pink">내 교재</span>
                  )}
                  <p className="truncate text-base font-black text-ink">{b.title || `${b.level} ${bookLabel(b)}`}</p>
                  {/* 왜 이 책인지 — 달이 아니라 내가 이 교재로 수업하는 요일·시간이다 */}
                  <p className="mt-0.5 text-xs font-bold text-brand-700">{when || BOOK_SET_LABEL[b.book_set]}</p>
                  <p className="mt-0.5 text-xs text-mist">{lessonRangeLabel(b.lesson_offset ?? 0)}</p>
                  {b.description && <p className="mt-1.5 line-clamp-2 text-xs text-slate">{b.description}</p>}
                  <span
                    className={cn(
                      "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition",
                      count ? "bg-paper text-ink-soft ring-line group-hover:text-brand-600" : "bg-surface text-mist ring-line",
                    )}
                  >
                    <Icon name="headphones" size={14} />
                    {count ? `열린 음원 ${count}개` : next ? "첫 수업일에 열려요" : "준비 중"}
                  </span>
                  {/* 다음에 열리는 강 — 수업일 전 강의는 잠겨 있다 (2026-10-05 Alan "해당 날짜가 안되면 잠금") */}
                  {next && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-slate sm:justify-center">
                      <Icon name="lock" size={12} />
                      {next.lessonNo}강 · {shortDay(next.date)} 수업일에 열려요
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-mist">음원과 교재 이미지는 수강생 본인만 이용할 수 있습니다. 파일을 외부에 공유하지 마세요.</p>
    </div>
  );
}
