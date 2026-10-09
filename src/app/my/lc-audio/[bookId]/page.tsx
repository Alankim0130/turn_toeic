import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadGated } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { BookCover } from "@/components/lc/BookCover";
import { LessonCalendar, type LessonSlot, type LessonTrack } from "@/components/lc/LessonCalendar";
import { createClient } from "@/lib/supabase/server";
import { todayKST, TRACK_LABEL } from "@/lib/utils";
import { studentTrackLabel } from "@/lib/week5";
import { holidayNamesBetween } from "@/lib/holidays";
import { BOOK_SET_LABEL, DAYS, DAY_COUNT, bookLabel, bookTimeLabel, coverSrc, STUDENT_COVER_WIDTH, explicitBookSet, lessonRangeLabel, sortTracks } from "@/lib/lc-audio";
import { cellKey, isRoundOpen, roundCells, roundDates, roundKey } from "@/lib/class-rounds";
import { getMyAccessibleSections, getMySessions, getMyWeek5 } from "../../_lib/queries";
import { isContainerProgram } from "@/lib/two-week";

export const metadata: Metadata = { title: "LC 음원듣기", robots: { index: false } };

export default async function LcBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const id = Number(bookId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // 잠금 판정과 데이터를 함께 받는다 (loadGated)
  const supabase = await createClient();
  const g = await loadGated("lc-audio", () =>
    Promise.all([
      supabase.from("lc_books").select("id, level, book_set, title, description, cover_name, lesson_offset, updated_at").eq("id", id).maybeSingle(),
      supabase.from("lc_audio_tracks").select("id, day, kind, label, file_name, sort_order").eq("book_id", id),
      getMySessions(),
      getMyWeek5(),
      getMyAccessibleSections(),
    ]),
  );
  if (g.locked) return g.locked;
  const [{ data: book }, { data: trackRows }, sessions, week5, mySections] = g.data;
  if (!book) notFound();

  /**
   * **내 과정 칸의 교재만** (2026-10-02 Alan "본인의 레벨에 맞는 교재만 나와서 들을 수 있도록" → 2026-10-05 수업 날짜에 맞춰).
   * 목록이 보여 주지 않는 교재는 주소를 직접 쳐도 목록으로 돌려보낸다. 개강 전·종강 뒤·배정 없음(`my_section_ids()` 가 빈 경우)은
   * 목록이 "개강일부터" 안내를 보여 준다 — 스태프도 학생 모드에서는 같다.
   * 칸 = 레벨 × LC × A/B — 그 교재 과정을 쓰는 내 LC 반이 있어야 한다 (`roundCells` = DB `private.my_round_cells`, RC 단과 학생은 하나도 없다).
   * 학생에게는 DB 도 같은 칸만 연다 — 강사 · 관리자는 정책이 전부 열어 주므로 여기서 돌려보내는 것이 학생 모드의 막이다.
   */
  if (mySections.length === 0 || !roundCells(mySections).has(cellKey(book.level, "lc", book.book_set))) redirect("/my/lc-audio");

  /**
   * **n강은 그 강의 내 수업일부터 열린다** (2026-10-05 Alan — "해당 날짜가 안되면 잠금이고, 해당날짜 수업이 진행되면 하나씩 오픈").
   * n강 칸 = 이 교재 과정을 쓰는 내 반의 n회차 (`roundDates` — 두 반이 같은 회차를 주면 이른 날, DB `private.my_open_rounds` 와 같은 규칙).
   * 학생에게는 DB 가 잠긴 강의 음원 행을 아예 주지 않는다. 강사 · 관리자(학생 모드)에게는 정책이 전부 주므로 여기서 잠긴 강의 음원을 뺀다 —
   * 잠긴 칸에는 음원 주소를 싣지 않는다 (화면에 안 보여도 페이지에 실리면 열어 볼 수 있다).
   */
  const today = todayKST();
  const roundDate = roundDates(sessions);
  const dateOfDay = new Map<number, string | null>(DAYS.map((day) => [day, roundDate.get(roundKey(book.level, "lc", book.book_set, day)) ?? null]));
  const openDay = (day: number) => isRoundOpen(dateOfDay.get(day), today);

  const offset = book.lesson_offset ?? 0;
  const tracks = sortTracks(trackRows ?? []).filter((t) => openDay(t.day));
  const pick = (day: number, kind: string): LessonTrack[] =>
    tracks.filter((t) => t.day === day && (t.kind ?? "lesson") === kind).map((t) => ({ id: t.id, kind: t.kind, label: t.label, file_name: t.file_name }));

  /**
   * 머리말 문구 · 달력의 달 · 트랙 배지를 위한 **이 교재를 쓰는 내 반** 하나. 날짜는 위 `dateOfDay` 가 정한다.
   * 교재는 달이 아니라 **듣는 시간대 · 트랙**이 정한다 (2026-09-16 편성표, 2026-09-19 Alan 재지적) —
   * 반의 `book_set` 하나만 본다. **달 홀짝으로 짐작하지 않는다.**
   * 스파르타 반 · 2주완성 반 자체는 교재가 없다 — 함께 듣는 점수보장반(RLS 로 같이 내려온다)의 수업일을 쓴다.
   */
  const scoreSessions = sessions.filter((s) => s.section && !isContainerProgram(s.section.course?.program));
  const usable = scoreSessions.filter((s) => explicitBookSet(s.section) === book.book_set && s.section?.course?.target_score === book.level);

  // 여러 반(주5일)이면 회차가 많은 쪽을 쓴다
  const bySection = new Map<number, typeof usable>();
  for (const s of usable) {
    const sid = s.section?.id;
    if (sid == null) continue;
    bySection.set(sid, [...(bySection.get(sid) ?? []), s]);
  }
  const chosen = [...bySection.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const ordered = [...chosen].sort((a, b) => a.seq - b.seq).slice(0, DAY_COUNT);
  const section = ordered[0]?.section ?? null;

  const slots: LessonSlot[] = DAYS.map((day) => ({
    day,
    lessonNo: offset + day,
    date: dateOfDay.get(day) ?? null,
    locked: !openDay(day),
    lesson: pick(day, "lesson"),
    homework: pick(day, "homework"),
  }));

  const dates = slots.map((s) => s.date).filter((d): d is string => !!d);
  const year = section?.term?.year ?? null;
  const month = section?.term?.month ?? null;
  const names = dates.length ? holidayNamesBetween(dates[0], dates[dates.length - 1]) : new Map<string, string[]>();
  const holidays: Record<string, string> = {};
  for (const [d, list] of names) if (list.length) holidays[d] = list[0];

  const total = tracks.length;
  const openCount = slots.filter((s) => !s.locked).length;

  return (
    <div className="space-y-6">
      {/* 설명은 달(홀수/짝수)이 아니라 **이 교재로 수업하는 내 시간**이다 (2026-09-19 Alan) */}
      <PageHeader
        icon="headphones"
        title={`${book.level} ${bookLabel(book)}`}
        description={book.description || [section ? `${bookTimeLabel(section, TRACK_LABEL)} 수업` : null, lessonRangeLabel(offset)].filter(Boolean).join(" · ")}
      >
        <Link href="/my/lc-audio" className="btn-secondary">
          <Icon name="headphones" size={18} />
          다른 교재
        </Link>
      </PageHeader>

      <section className="flex items-center gap-4 rounded-xl3 border border-line bg-paper p-4">
        <div className="w-16 shrink-0 sm:w-20">
          <BookCover size="sm" src={book.cover_name ? coverSrc(book, STUDENT_COVER_WIDTH) : null} alt="" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.18em] text-brand-600">
            {book.level} · {BOOK_SET_LABEL[book.book_set]}
          </p>
          <h2 className="truncate text-lg font-black text-ink">{book.title || bookLabel(book)}</h2>
          <p className="mt-0.5 text-xs text-slate">
            열린 강 {openCount}개 · 음원 {total}개
            <span className="ml-1.5 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-black text-white">내 반 교재</span>
          </p>
        </div>
      </section>

      <LessonCalendar
        slots={slots}
        year={year}
        month={month}
        today={today}
        holidays={holidays}
        trackLabel={section ? studentTrackLabel(section, week5, TRACK_LABEL) : null}
      />

      <p className="text-xs text-mist">음원과 교재 이미지는 수강생 본인만 이용할 수 있습니다. 파일을 외부에 공유하지 마세요.</p>
    </div>
  );
}
