import Link from "next/link";
import type { CSSProperties } from "react";
import { Alert } from "@/components/ui/Alert";
import { PdfDownloadButton } from "@/components/admin/PdfDownloadButton";
import { columnDetail, columnHeading, marksText, ROSTER_MARKS, toneOf, type ClassRoster } from "@/lib/class-roster";
import { cn } from "@/lib/utils";

/**
 * 학생명단의 **반별 명단** (2026-10-14 Alan — 종이 명단 사진을 보내며 "Pc모드에서는 지금 올린 이미지처럼 한페이지에서 구분이 가능하면 좋겠어").
 * 칸 하나 = 한 레벨의 수업 시간 한 칸(`650B 10:00~11:00` — 월수금 · 화목금을 합친다, 둘째 줄 `월 RC · 화 LC`), 레벨마다 종이와 같은 색,
 * 아래로 이름 가나다순 · 이름 뒤 `(불/RC)`. LC · RC 를 나누지 않는다 (같은 날 저녁 Alan "lc, rc구분하지말고 합쳐서"). 계산은 `src/lib/class-roster.ts`,
 * 인쇄용은 같은 결과를 그린 PDF(`/admin/students/roster-pdf`)다.
 * - PC 는 레벨 묶음을 옆으로 늘어놓고 자리가 모자라면 레벨째 다음 줄로 내린다 (레벨 안의 칸은 갈라지지 않는다).
 *   휴대폰은 레벨마다 한 덩어리에 칸 두 줄(넓으면 셋)이다 — 휴대폰 기본은 카드라 `반별 명단` 을 눌렀을 때만 보인다.
 * - 이름은 검은 글자 (디자인 원칙 — 명단의 사람 이름) · 누르면 학생 관리.
 * - 색은 종이 명단의 엑셀 연한 색 그대로다 (`ROSTER_TONES`) — 관리자 모드(토스 파랑)에서도 레벨을 가르는 색이라 바꾸지 않는다.
 */
export function ClassRosterView({
  roster,
  ok,
  heading,
  period,
  terms,
  pdfHref,
  pdfName,
}: {
  roster: ClassRoster;
  ok: boolean;
  /** "10월 반별 명단" */
  heading: string;
  /** "10/6 개강 ~ 11/3 종강" */
  period: string;
  /** 고를 수 있는 달 — 둘 이상일 때만 칩을 그린다 */
  terms: { key: string; label: string; href: string; active: boolean }[];
  pdfHref: string;
  /** 저장 이름 — `역전토익_반별명단_2026-10.pdf` (응답 머리에서 못 읽을 때) */
  pdfName: string;
}) {
  return (
    <section aria-labelledby="class-roster-title" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="class-roster-title" className="text-lg font-black text-ink">
            {heading}
          </h2>
          <p className="mt-0.5 text-xs text-slate">
            {[period, `학생 ${roster.total}명`, "반마다 이름 가나다순"].filter(Boolean).join(" · ")}
          </p>
        </div>
        {/* 라우트가 attachment 로 내려 준다 — Link 로 두면 화면에 미리 받아 둔다(PDF 를 만든다). A4 세로 · 레벨마다 새 쪽 (2026-10-14 Alan).
            아이폰 · 아이패드는 attachment 를 무시하고 화면에 띄우기만 해서 저장 창(파일에 저장 · 프린트)을 연다 — PdfDownloadButton */}
        <PdfDownloadButton href={pdfHref} fileName={pdfName} align="end" className="btn-primary !px-4 !py-2 text-sm" title="A4 세로 · 레벨마다 새 쪽에서 시작해요">
          PDF 받기
        </PdfDownloadButton>
      </div>

      {terms.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="달">
          {terms.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold ring-1 transition",
                t.active ? "bg-ink text-white ring-ink" : "bg-paper text-ink-soft ring-line hover:text-brand-600 hover:ring-brand-300",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate">
        <span className="font-bold text-ink-soft">표시</span>
        {ROSTER_MARKS.map((m) => (
          <span key={m.mark} className="whitespace-nowrap">
            <b className="text-ink">({m.mark})</b> {m.label}
          </span>
        ))}
      </p>

      {!ok && (
        <Alert kind="warning" title="명단을 다 불러오지 못했어요" className="mt-3">
          빠진 학생이 있을 수 있어요. 새로고침해 주세요.
        </Alert>
      )}

      {roster.levels.length === 0 ? (
        <p className="mt-4 rounded-xl2 bg-surface px-4 py-6 text-center text-sm text-slate">이 달 반에 배정된 학생이 없어요.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          {roster.levels.map((level) => {
            const tone = toneOf(level.tone);
            const n = level.columns.length;
            const vars = { "--cols": n, "--m": Math.min(2, n), "--s": Math.min(3, n), flexGrow: n } as CSSProperties;
            return (
              <div key={level.key} className="min-w-0 basis-full lg:basis-[calc(var(--cols)*7.5rem)]" style={vars}>
                <p className="mb-1 text-xs font-black text-ink">
                  {level.label} <span className="font-bold text-mist">· {level.count}명</span>
                </p>
                {/* 칸마다 머리 · 이름 두 줄을 subgrid 로 맞춘다 — 한 칸만 시간이 이름 아래로 내려가도 같은 줄의 칸 머리 높이가 같아 이름이 같은 높이에서 시작한다 */}
                <div className="grid overflow-hidden rounded-xl [grid-template-columns:repeat(var(--m),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--s),minmax(0,1fr))] lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]">
                  {level.columns.map((col) => (
                    <div key={col.key} className="row-span-2 grid min-w-0 grid-rows-subgrid border-b border-r border-white">
                      {/* @container 는 칸이 아니라 칸 머리에 둔다 — 칸에 두면(크기 격리) subgrid 가 풀려 머리 높이가 어긋난다 */}
                      <div className="@container px-2 py-1.5" style={{ background: tone.head }}>
                        {/* 칸이 좁으면(PC 의 750 · 850 이 한 줄에 설 때 · 320px) 시간이 이름 아래 줄로 내려간다 — 잘라 내지 않는다.
                            칸 폭으로 정해서(@container) 같은 줄의 칸이 다 같이 바뀐다 */}
                        <p className="text-sm font-black" style={{ color: tone.ink }} title={`${columnHeading(col)} · ${columnDetail(col)}`}>
                          {col.title}
                          {col.time && <span className="block whitespace-nowrap text-[11px] font-bold tabular-nums @[8.75rem]:ml-1 @[8.75rem]:inline">{col.time}</span>}
                        </p>
                        {/* 사람 수는 오른쪽 끝에 붙여 둔다 — 좁은 칸(320px · 칸 넷인 레벨)에서는 시간 쪽이 먼저 줄어든다 */}
                        <p className="flex min-w-0 items-baseline gap-1 text-[11px] font-semibold text-ink-soft">
                          <span className="min-w-0 truncate">{columnDetail(col)}</span>
                          <span className="ml-auto shrink-0 tabular-nums">{col.students.length}명</span>
                        </p>
                      </div>
                      <ol className="px-2 py-1" style={{ background: tone.body }}>
                        {col.students.map((st) => (
                          <li key={st.id} className="flex min-w-0 items-baseline gap-1 py-[3px] text-[13px] leading-tight">
                            <Link href={`/admin/students/${st.id}`} className="min-w-0 truncate font-bold text-ink hover:underline">
                              {st.name || "이름 없음"}
                            </Link>
                            {st.marks.length > 0 && <span className="shrink-0 text-[11px] font-bold text-slate">{marksText(st.marks)}</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(roster.unplaced > 0 || roster.empty.length > 0) && (
        <div className="mt-3 space-y-1 text-xs text-slate">
          {roster.unplaced > 0 && (
            <p>
              칸을 찾지 못한 학생 {roster.unplaced}명 — 배정된 반이 품을 시간 반(60 · 70분)이 이 달에 아직 열리지 않았어요. 카드 보기에서 확인해 주세요.
            </p>
          )}
          {roster.empty.length > 0 && (
            <p>
              학생이 없는 시간 {roster.empty.length}개 — {roster.empty.map((c) => `${columnHeading(c)} (${columnDetail(c)})`).join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * 반별 명단 ↔ 카드. **고르지 않으면 PC 는 반별 명단 · 휴대폰은 카드** — 같은 페이지에 둘 다 그리고 화면 폭으로 하나를 숨긴다
 * (서버는 기기를 모른다). 누르면 `?view=` 로 그 화면에 고정된다.
 */
export function RosterViewSwitch({ view, href }: { view: "classes" | "cards" | null; href: Record<"classes" | "cards", string> }) {
  const base = "rounded-full px-3 py-1.5 text-xs font-black transition";
  const on = "bg-brand-500 text-white";
  const off = "text-slate hover:text-brand-600";
  const classes = view === "classes" ? on : view === "cards" ? off : "text-slate hover:text-brand-600 lg:bg-brand-500 lg:text-white lg:hover:text-white";
  const cards = view === "cards" ? on : view === "classes" ? off : "bg-brand-500 text-white lg:bg-transparent lg:text-slate lg:hover:text-brand-600";
  return (
    <span className="flex gap-1 rounded-full bg-surface p-1 ring-1 ring-line" role="group" aria-label="보기">
      <Link href={href.classes} aria-current={view === "classes" ? "page" : undefined} className={cn(base, classes)}>
        반별 명단
      </Link>
      <Link href={href.cards} aria-current={view === "cards" ? "page" : undefined} className={cn(base, cards)}>
        카드
      </Link>
    </span>
  );
}
