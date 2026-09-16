import { studentGate } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { BookCover } from "@/components/lc/BookCover";
import { getSessionProfile, isStaff } from "@/lib/auth";
import { cn, todayKST } from "@/lib/utils";
import {
  BOOK_SET_LABEL,
  BOOK_SET_MONTHS,
  bookLabel,
  bookSetForMonth,
  bookSetOfSection,
  type BookSet,
  coverSrc,
  lessonLabel,
  DAY_COUNT,
  sortBooks,
} from "@/lib/lc-audio";
import { getMyLcAudio, getMyOrders, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = { title: "LC 음원듣기", robots: { index: false } };

export default async function LcAudioPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("lc-audio");
  if (locked) return locked;

  const [sp, { profile }, { levels, books: bookRows, tracks }, orders] = await Promise.all([
    searchParams,
    getSessionProfile(),
    getMyLcAudio(),
    getMyOrders(),
  ]);
  const staff = isStaff(profile?.role);
  const header = (
    <PageHeader icon="headphones" title="LC 음원듣기" description="내 교재를 누르면 수업 날짜에 맞춰 음원이 열려요." />
  );

  const { accessTerms } = await getMyStudyEligibility(orders);
  if (accessTerms.size === 0 && !staff) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon="headphones"
          title="수강 중인 수강생만 들을 수 있어요"
          description="등업신청이 승인되고 개강일이 되면 LC 음원이 열려요."
          action={{ href: "/my/verify", label: "등업신청 확인하기" }}
        />
      </div>
    );
  }

  const today = todayKST();
  const month = Number(today.slice(5, 7));
  const books = sortBooks(bookRows);
  const countByBook = new Map<number, number>();
  for (const t of tracks) if (t.book_id) countByBook.set(t.book_id, (countByBook.get(t.book_id) ?? 0) + 1);

  /**
   * 내 수업 등급에 맞는 레벨만 보여 준다 (2026-09-16 Alan 요청).
   * 650 반이면 650 교재 두 권만 나온다. 스태프와 배정이 없는 경우에만 전체를 보여 준다.
   */
  const myLevels = [
    ...new Set(
      orders
        .filter((o) => o.status === "active")
        .flatMap((o) => o.enrollments)
        .filter((e) => e.status === "active" && e.section && today <= e.section.closes_at)
        .map((e) => e.section!.course?.target_score)
        .filter((s): s is number => typeof s === "number" && levels.includes(s)),
    ),
  ];
  /**
   * 내 반이 쓰는 교재 반(A/B). 교재는 달이 아니라 **듣는 시간대**로 정해진다 (2026-09-16 Alan 확인) —
   * 같은 9월에도 10:00 반은 A, 11:10 반은 B 다. 반에 지정이 없으면 달 홀짝으로 짐작한다.
   */
  const mySets = new Set(
    orders
      .filter((o) => o.status === "active")
      .flatMap((o) => o.enrollments)
      .filter((e) => e.status === "active" && e.section && today <= e.section.closes_at)
      .map((e) => bookSetOfSection(e.section))
      .filter((b): b is BookSet => b !== null),
  );
  const guessedSet = bookSetForMonth(month);

  const shownLevels = myLevels.length ? myLevels : levels;
  const level = shownLevels.includes(Number(sp.level)) ? Number(sp.level) : (shownLevels[0] ?? null);

  if (level === null) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="headphones" title="아직 올라온 교재가 없어요" description="강사가 교재와 음원을 올리면 여기에서 바로 들을 수 있어요." />
      </div>
    );
  }

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

      <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate">
        <Icon name="calendar" size={16} />
        {mySets.size > 0 ? (
          <>
            내 반은 <strong className="text-brand-600">{[...mySets].sort().map((b) => BOOK_SET_LABEL[b]).join(" · ")} 교재</strong>로 수업해요.
          </>
        ) : (
          <>
            이번 달({month}월)은 <strong className="text-brand-600">{BOOK_SET_LABEL[guessedSet]} 교재</strong>일 거예요.
          </>
        )}
        {myLevels.length > 0 && <span className="text-mist">· 내 반 {level}</span>}
        {staff && myLevels.length === 0 && <span className="text-mist">· 강사는 모든 레벨이 보여요</span>}
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {levelBooks.map((b) => {
          const current = mySets.size > 0 ? mySets.has(b.book_set as BookSet) : b.book_set === guessedSet;
          const count = countByBook.get(b.id) ?? 0;
          return (
            <li key={b.id}>
              <Link
                href={`/my/lc-audio/${b.id}`}
                className={cn(
                  "group flex h-full gap-4 rounded-xl3 border p-4 transition sm:flex-col sm:gap-3 sm:p-5",
                  current ? "border-brand-200 bg-gradient-to-br from-brand-50 via-paper to-paper" : "border-line bg-paper hover:border-brand-200",
                )}
              >
                <div className="w-24 shrink-0 sm:mx-auto sm:w-40">
                  <BookCover src={b.cover_name ? coverSrc(b, 480) : null} alt={`${b.level} ${BOOK_SET_LABEL[b.book_set]} 교재 표지`} />
                </div>
                <div className="min-w-0 flex-1 sm:text-center">
                  {current && (
                    <span className="mb-1 inline-flex rounded-full bg-brand-500 px-2.5 py-0.5 text-[11px] font-black text-white shadow-pink">이번 달 교재</span>
                  )}
                  <p className="truncate text-base font-black text-ink">{b.title || `${b.level} ${bookLabel(b)}`}</p>
                  <p className="mt-0.5 text-xs text-slate">{BOOK_SET_MONTHS[b.book_set]}</p>
                  <p className="mt-0.5 text-xs text-mist">
                    {lessonLabel(1, b.lesson_offset ?? 0)} ~ {lessonLabel(DAY_COUNT, b.lesson_offset ?? 0)}
                  </p>
                  {b.description && <p className="mt-1.5 line-clamp-2 text-xs text-slate">{b.description}</p>}
                  <span
                    className={cn(
                      "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition",
                      count ? "bg-paper text-ink-soft ring-line group-hover:text-brand-600" : "bg-surface text-mist ring-line",
                    )}
                  >
                    <Icon name="headphones" size={14} />
                    {count ? `음원 ${count}개` : "준비 중"}
                  </span>
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
