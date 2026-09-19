import { studentGate } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { BookCover } from "@/components/lc/BookCover";
import { effectiveRole, getSessionProfile, isStaff } from "@/lib/auth";
import { cn, TRACK_LABEL } from "@/lib/utils";
import {
  BOOK_SET_LABEL,
  bookLabel,
  bookSectionsByLevel,
  bookTimesLabel,
  coverSrc,
  lessonRangeLabel,
  sortBooks,
} from "@/lib/lc-audio";
import { getMyAccessibleSections, getMyLcAudio, getMyOrders, getMyStudyEligibility } from "../_lib/queries";

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
  // 테스트 등급을 켠 테스터는 학생처럼 내 반 레벨만 본다
  const staff = isStaff(effectiveRole(profile));
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

  const books = sortBooks(bookRows);
  const countByBook = new Map<number, number>();
  for (const t of tracks) if (t.book_id) countByBook.set(t.book_id, (countByBook.get(t.book_id) ?? 0) + 1);

  /**
   * 내 수업 등급에 맞는 레벨만 보여 준다 (2026-09-16 Alan 요청).
   * 650 반이면 650 교재 두 권만 나온다. 스태프와 배정이 없는 경우에만 전체를 보여 준다.
   * **스파르타반은 함께 듣는 레벨이 모두 열린다** (650+ 중급속성 = 650 + 850) — 접근 가능한 반은 DB 가 정한다.
   */
  const mySections = await getMyAccessibleSections();
  const myLevels = [
    ...new Set(
      mySections
        .flatMap((s) => [s.course?.target_score, ...(s.course?.includes_levels ?? [])])
        .filter((l): l is number => typeof l === "number" && levels.includes(l)),
    ),
  ];
  /**
   * 내가 **LC 를 듣는 시간**과 거기서 쓰는 교재(A/B). 교재는 달이 아니라 시간대 · 트랙으로 정해진다
   * (2026-09-16 편성표, 2026-09-19 Alan 재지적) — 같은 9월에도 650 화목금 10:00 은 A, 월수금 11:10 은 B 다.
   * 교재는 LC 시간 단위 반에만 붙어 있고 묶음 반(120분) · RC 시간 · 스파르타 반은 비어 있다.
   * **레벨마다 따로 모은다** — 스파르타 650 학생은 650 과 850 에서 서로 다른 교재를 쓸 수 있다.
   */
  const myBooks = bookSectionsByLevel(mySections);

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

  /**
   * **내 시간에 쓰는 교재만 보여 준다** (2026-09-19 Alan "학생 권한에 맞는 책을 보여주면 좋겠어").
   * 주5일 120분 학생은 두 권이 다 나오는 것이 맞다 — 한 시간은 A, 다음 시간은 B 를 쓴다.
   * 이 레벨에 내 교재가 하나도 없으면(전부 RC 시간이거나 편성에 교재가 안 들어간 반) 막지 않고 전체를 보여 준다 —
   * 열람 자체는 수강 중이면 열려 있다 (도메인 규칙 7). 그때는 왜 전체인지 한 줄로 밝힌다.
   */
  const mySetsHere = myBooks.get(level);
  const allBooks = books.filter((b) => b.level === level);
  const levelBooks = mySetsHere ? allBooks.filter((b) => mySetsHere.has(b.book_set as "A" | "B")) : allBooks;

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
        {mySetsHere ? (
          <>
            <strong className="text-brand-600">내가 LC 를 듣는 시간의 교재</strong>예요. 요일·시간대마다 교재가 달라요.
          </>
        ) : (
          // 까닭이 둘이다 — 그 레벨이 내 시간엔 전부 RC 이거나(스파르타), 편성에 교재가 아직 안 들어갔거나.
          // 어느 쪽인지 단정하지 않는다. 열람 자체는 수강 중이면 열려 있다 (도메인 규칙 7)
          <>{staff ? "반 배정이 없어 모든 교재를 보여 줘요." : "이 레벨은 내 시간에 쓰는 교재가 정해져 있지 않아 전체를 보여 줘요."}</>
        )}
        {myLevels.length > 0 && <span className="text-mist"> · 내 반 {level}</span>}
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {levelBooks.map((b) => {
          // 이 교재를 쓰는 **내 시간** — 카드에 달 대신 이것을 적는다 (주5일로 합치지 않는다)
          const when = bookTimesLabel(mySetsHere?.get(b.book_set as "A" | "B") ?? [], TRACK_LABEL);
          const count = countByBook.get(b.id) ?? 0;
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
