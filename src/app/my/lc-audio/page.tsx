import { studentGate } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { BookCover } from "@/components/lc/BookCover";
import { getSessionProfile, isStaff } from "@/lib/auth";
import { cn, todayKST } from "@/lib/utils";
import { BOOK_SET_LABEL, BOOK_SET_MONTHS, BOOK_SETS, bookLabel, bookSetForMonth, coverSrc, pickBook, pickLevel, sortBooks, sortTracks } from "@/lib/lc-audio";
import { getMyLcAudio, getMyOrders, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = {
  title: "LC 음원듣기",
  robots: { index: false },
};

export default async function LcAudioPage({ searchParams }: { searchParams: Promise<{ level?: string; book?: string }> }) {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("lc-audio");
  if (locked) return locked;

  const [sp, { profile }, { levels, books: bookRows, tracks }, orders] = await Promise.all([searchParams, getSessionProfile(), getMyLcAudio(), getMyOrders()]);
  const header = <PageHeader icon="headphones" title="LC 음원듣기" description="내 레벨의 교재를 골라 LC 음원을 들어요. 표지를 보고 지금 쓰는 교재를 찾으면 쉬워요." />;

  const { accessTerms } = await getMyStudyEligibility(orders);
  if (accessTerms.size === 0 && !isStaff(profile?.role)) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="headphones" title="수강 중인 수강생만 들을 수 있어요" description="등업신청이 승인되고 개강일이 되면 LC 음원이 열려요." action={{ href: "/my/verify", label: "등업신청 확인하기" }} />
      </div>
    );
  }

  const today = todayKST();
  const month = Number(today.slice(5, 7));
  const currentSet = bookSetForMonth(month);
  const books = sortBooks(bookRows);
  const bookById = new Map(books.map((b) => [b.id, b]));
  const countByBook = new Map<number, number>();
  for (const t of tracks) if (t.book_id) countByBook.set(t.book_id, (countByBook.get(t.book_id) ?? 0) + 1);

  // 기본 레벨: 지금 듣는 강좌의 목표 점수 → 음원이 있는 첫 레벨 → 첫 레벨
  const myScores = orders
    .filter((o) => o.status === "active")
    .flatMap((o) => o.enrollments)
    .filter((e) => e.status === "active" && e.section && today <= e.section.closes_at)
    .map((e) => e.section!.course?.target_score)
    .filter((s): s is number => typeof s === "number");
  const levelWithTracks = levels.find((l) => tracks.some((t) => t.book_id && bookById.get(t.book_id)?.level === l));
  const level = pickLevel(sp.level, levels, myScores.find((s) => levels.includes(s)) ?? levelWithTracks ?? null);

  if (level === null) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="headphones" title="아직 올라온 교재가 없어요" description="강사가 교재와 음원을 올리면 여기에서 바로 들을 수 있어요." />
      </div>
    );
  }

  const levelBooks = books.filter((b) => b.level === level);
  const selected = pickBook(sp.book, levelBooks, currentSet);
  const selectedTracks = selected ? sortTracks(tracks.filter((t) => t.book_id === selected.id)) : [];

  return (
    <div className="space-y-8">
      {header}

      {/* 레벨 고르기 */}
      <nav aria-label="레벨 선택">
        <ul className="grid grid-cols-3 gap-3 sm:gap-4">
          {levels.map((l) => {
            const lb = books.filter((b) => b.level === l);
            const cover = lb.find((b) => b.book_set === currentSet && b.cover_name) ?? lb.find((b) => b.cover_name);
            const count = lb.reduce((sum, b) => sum + (countByBook.get(b.id) ?? 0), 0);
            const active = l === level;
            return (
              <li key={l}>
                <Link
                  href={`/my/lc-audio?level=${l}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "card flex h-full flex-col items-center gap-2 p-2.5 text-center transition sm:flex-row sm:gap-4 sm:p-4 sm:text-left",
                    active ? "border-brand-400 ring-2 ring-brand-300" : "hover:-translate-y-0.5 hover:border-brand-300",
                  )}
                >
                  <span className="w-full max-w-[4.5rem] shrink-0 sm:w-16">
                    <BookCover size="sm" src={cover ? coverSrc(cover, 200) : null} alt={`${l} 교재 표지`} />
                  </span>
                  <span>
                    <span className={cn("block text-2xl font-black tabular-nums sm:text-3xl", active ? "text-brand-600" : "text-ink")}>{l}</span>
                    <span className="block text-xs font-semibold text-slate">
                      교재 {lb.length}권 · 음원 {count}개
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="flex items-start gap-2 text-sm text-slate">
        <Icon name="calendar" size={18} className="mt-0.5" />
        <span>
          이번 달({month}월)은 <strong className="text-brand-600">{BOOK_SET_LABEL[currentSet]} 교재</strong>로 수업해요. 교재를 누르면 아래에 음원이 열려요.
        </span>
      </p>

      {/* A반 · B반 교재 */}
      {BOOK_SETS.map((set) => {
        const setBooks = levelBooks.filter((b) => b.book_set === set);
        if (setBooks.length === 0) return null;
        const current = set === currentSet;
        return (
          <section
            key={set}
            aria-labelledby={`set-${set}`}
            className={cn("rounded-xl3 border p-5 sm:p-8", current ? "border-brand-200 bg-gradient-to-br from-brand-50 via-paper to-paper" : "border-line bg-paper")}
          >
            <div className="grid gap-6 lg:grid-cols-[12rem_1fr] lg:gap-10">
              <header className="lg:pt-2">
                <p className="text-[11px] font-black tracking-[0.25em] text-brand-600">SET {set}</p>
                <h2 id={`set-${set}`} className="mt-1 text-2xl font-black tracking-tight text-ink">
                  {BOOK_SET_LABEL[set]} 교재
                </h2>
                <p className="mt-1 text-sm text-slate">{BOOK_SET_MONTHS[set]}</p>
                {current && <span className="mt-4 inline-flex rounded-full bg-brand-500 px-3 py-1 text-xs font-black text-white shadow-pink">이번 달 교재</span>}
              </header>

              <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-8 lg:max-w-[42rem]">
                {setBooks.map((b) => {
                  const isSelected = b.id === selected?.id;
                  const count = countByBook.get(b.id) ?? 0;
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/my/lc-audio?level=${level}&book=${b.id}#tracks`}
                        aria-current={isSelected ? "true" : undefined}
                        className="group block rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                      >
                        <BookCover
                          src={b.cover_name ? coverSrc(b, 640) : null}
                          alt={`${level} ${bookLabel(b)} 표지`}
                          selected={isSelected}
                          className="group-hover:-translate-y-1.5 group-hover:shadow-[0_32px_56px_-24px_rgba(255,46,136,0.45)]"
                        />
                        <div className="mt-4">
                          <p className="text-[11px] font-black tracking-[0.18em] text-brand-600">
                            {BOOK_SET_LABEL[b.book_set]} · {b.volume}권
                          </p>
                          <h3 className="mt-1 text-base font-black leading-snug text-ink sm:text-lg">{b.title || bookLabel(b)}</h3>
                          {b.description && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate">{b.description}</p>}
                          <span
                            className={cn(
                              "mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition",
                              isSelected ? "bg-brand-500 text-white ring-brand-500" : "bg-paper text-ink-soft ring-line group-hover:text-brand-600",
                            )}
                          >
                            <Icon name="headphones" size={14} className={cn(isSelected && "brightness-0 invert")} />
                            음원 {count}개
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        );
      })}

      {/* 고른 교재의 음원 */}
      {selected && (
        <section id="tracks" aria-labelledby="tracks-title" className="card scroll-mt-24 overflow-hidden">
          <div className="flex items-center gap-4 border-b border-line bg-brand-50/60 px-5 py-4">
            <div className="w-11 shrink-0">
              <BookCover size="sm" src={selected.cover_name ? coverSrc(selected, 160) : null} alt="" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-[0.18em] text-brand-600">
                {level} · {bookLabel(selected)}
              </p>
              <h2 id="tracks-title" className="truncate font-black text-ink">
                {selected.title || bookLabel(selected)} 음원
              </h2>
            </div>
            <span className="ml-auto shrink-0 text-sm font-semibold text-slate">{selectedTracks.length}개</span>
          </div>
          {selectedTracks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate">이 교재의 음원이 아직 없어요. 강사가 올리면 여기에서 바로 들을 수 있어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {selectedTracks.map((t) => (
                <li key={t.id} className="grid gap-3 px-5 py-4 md:grid-cols-[16rem_1fr] md:items-center">
                  <p className="min-w-0 font-bold text-ink">{t.title}</p>
                  <audio controls preload="none" src={`/files/audio/${t.id}`} className="w-full">
                    브라우저가 음원 재생을 지원하지 않아요.
                  </audio>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-xs text-mist">음원과 교재 이미지는 수강생 본인만 이용할 수 있습니다. 파일을 외부에 공유하지 마세요.</p>
    </div>
  );
}
