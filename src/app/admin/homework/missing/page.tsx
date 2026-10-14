import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { TermChips } from "@/components/admin/TermChips";
import { MissingBoard, type MissingGroupView } from "@/components/admin/homework/MissingBoard";
import {
  buildMissingBoard,
  defaultPicks,
  HOMEWORK_DUE_LABEL,
  missingStudentCount,
  monthDay,
  onlyAlerted,
  shortDay,
  unalertedCount,
  weekdayOf,
  type MissingGroup,
} from "@/lib/homework-missing";
import { termParam } from "@/lib/study";
import { cn } from "@/lib/utils";
import { requireCrew } from "@/lib/auth";
import { pickTerm, termLabel, TERM_COLUMNS } from "../../_lib/queries";
import { groupClasses, loadMissingData, sectionSortKey } from "../_lib/missing";

export const metadata: Metadata = { title: "숙제 미제출 알림", robots: { index: false } };

/** 기수 칩 — 최근 기수 몇 개 (다음 달까지) */
const TERM_CHIPS = 6;

/**
 * **숙제 미제출 알림** (2026-10-08 Alan — "숙제제출 리스트를 볼 수 있으면 좋겠어. 안한사람은 일괄선택해서 알림메시지도 보낼 수 있으면 좋겠어.
 * 여기서 레벨별로도 선택할 수 있으면 좋겠어" → 첫토익 "숙제 미제출 알림" 화면을 보여 주며 "이렇게 표시해주면 좋겠어.
 * 날짜는 강사가 설정한 수업일수를 매달 참고하면 좋겠어" · 숙제는 "수업마다 꼭 있다" · 알림은 "조교도 보낸다").
 *
 * **조교도 쓴다.** 관리자 메뉴 `학습 → 숙제 미제출 알림`(숙제점검 바로 밑 — 같은 날 Alan "응 메뉴에 넣어줘", 아홉째 조교 화면)과
 * 숙제점검 머리의 `미제출 알림` 버튼으로 온다. 처음엔 버튼으로만 오는 숙제점검 아래 화면이었다 (그때는 입구 판정도 숙제점검을 따랐다).
 * 기수(월)를 고르고 레벨 탭(650 · 750 · 850, 숫자 = 안 낸 숙제가 있는 학생 수)을 고르면, 직접 배정된 반이 같은 학생끼리 카드 한 장 —
 * 열은 강사가 반 편성 달력에 정한 그 달 수업일(반의 회차)이고 칸은 그 날 RC · LC 숙제를 냈는지다. 세는 규칙은 `src/lib/homework-missing.ts`.
 * `전체` 레벨 칸은 두지 않는다 (숙제점검과 같다 — 2026-09-22 Alan "'전체' '모든레벨' 이 버튼은 없애줘").
 *
 * 2026-10-14 Alan — **'안 냄' 은 제출 기한(같은 트랙 다음 수업일 오후 5시)이 지난 숙제**이고, **명단은 숙제제출 화면에서 알림을 신청한 학생만**이다.
 * 신청하지 않은 학생은 `알림 신청 안 한 학생도 보기`(`?all=1` — 숙제점검의 `점검완료 포함` 과 같은 자리 · 같은 모양)로 볼 수만 있다 (고를 수 없다).
 * 미제출 전체선택은 마지막 알림 뒤에 새로 기한이 지난 숙제가 있는 학생을 고른다 (`defaultPicks`).
 */
export default async function HomeworkMissingPage({ searchParams }: { searchParams: Promise<{ term?: string; level?: string; all?: string }> }) {
  await requireCrew();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();
  const showAll = sp.all === "1";

  const [{ data: termRows }, { data: levelRows }] = await Promise.all([
    supabase.from("terms").select(TERM_COLUMNS).order("year", { ascending: false }).order("month", { ascending: false }).limit(24),
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
  ]);
  const allTerms = termRows ?? [];
  const term = pickTerm(allTerms, sp.term, today);
  const levels = (levelRows ?? []).map((l) => l.level);

  const header = (
    <PageHeader
      icon="homework"
      title="숙제 미제출 알림"
      description="강사님이 반 편성 달력에 정한 그 달 수업일마다 RC · LC 숙제를 냈는지 보여 줘요. 안 낸 학생을 골라 한 번에 알림을 보낼 수 있어요."
    >
      <Link href="/admin/homework" className="btn-secondary">
        <Icon name="homework" size={18} />
        숙제점검
      </Link>
    </PageHeader>
  );

  if (!term) {
    return (
      <>
        {header}
        <EmptyState icon="calendar" title="아직 편성한 달이 없어요" description="반 편성 달력에서 그 달 수업일을 정하고 반을 열면, 학생들이 낸 숙제가 수업일마다 여기에 보여요." />
      </>
    );
  }

  // 기수 칩 — 다음 달까지의 최근 기수 (고른 기수는 늘 넣는다)
  const [y, m] = today.split("-").map(Number);
  const nowKey = y * 12 + m;
  const chips = allTerms.filter((t) => t.year * 12 + t.month <= nowKey + 1).slice(0, TERM_CHIPS);
  if (!chips.some((t) => t.id === term.id)) chips.push(term);
  chips.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));

  const termKey = termParam(term.year, term.month);
  // 보낸 알림 기록은 격자 데이터를 기다릴 까닭이 없다 — 함께 묻는다 (2026-10-09 "숙제미제출 알림 페이지를 클릭하면 로딩시간이 오래걸려")
  const [data, { data: sentRows }] = await Promise.all([
    loadMissingData(supabase, term),
    supabase.rpc("homework_missing_notices", { p_term_id: term.id }),
  ]);
  const sortKeyOf = sectionSortKey(data.meta);
  const boards = new Map<number, MissingGroup[]>(levels.map((l) => [l, buildMissingBoard({ level: l, ...data, sortKeyOf })]));
  const level = levels.includes(Number(sp.level)) ? Number(sp.level) : (levels[0] ?? null);
  const full = level != null ? (boards.get(level) ?? []) : [];
  // 명단은 알림을 신청한 학생만 (2026-10-14 Alan "안 누른사람에게는 알림보내기 명단에서 빠지고") — 체크박스를 켜면 신청 안 한 학생도 볼 수만 있다
  const board = showAll ? full : onlyAlerted(full);
  const unalerted = unalertedCount(full);
  const alerted = new Set(full.flatMap((g) => g.rows.filter((r) => r.alerts).map((r) => r.id))).size;

  // 이 레벨에서 마지막으로 미제출 알림을 받은 때 — 그 뒤에 새로 기한이 지난 숙제가 없으면 '미제출 전체선택' 에서 뺀다 (같은 숙제로 거듭 가지 않게)
  const sentAt = new Map<string, string>();
  for (const r of sentRows ?? []) if (r.level === level && (!sentAt.has(r.user_id) || sentAt.get(r.user_id)! < r.sent_at)) sentAt.set(r.user_id, r.sent_at);
  const lastSent = new Map([...sentAt].map(([id, at]) => [id, Date.parse(at)] as const));
  const sentDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const sentTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  const sentLabel = (iso: string) => (sentDay(iso) === today ? `오늘 ${sentTime(iso)}` : shortDay(sentDay(iso)));

  const groups: MissingGroupView[] = board.map((g) => ({
    key: g.key,
    classes: groupClasses(data.meta, g.sectionIds),
    columns: g.columns.map((c) => ({
      ...c,
      md: monthDay(c.date),
      weekday: weekdayOf(c.date),
      isToday: c.date === today,
    })),
    rows: g.rows.map((r) => ({ ...r, sent: sentAt.has(r.id) ? sentLabel(sentAt.get(r.id)!) : null })),
  }));
  const flagged = missingStudentCount(full);
  const allHref = `/admin/homework/missing?term=${termKey}${level != null ? `&level=${level}` : ""}${showAll ? "" : "&all=1"}`;

  return (
    <>
      {header}

      <TermChips basePath="/admin/homework/missing" terms={chips} current={termKey} keep={{ level: level != null ? String(level) : undefined }} />
      <FilterTabs
        basePath="/admin/homework/missing"
        paramKey="level"
        current={level != null ? String(level) : ""}
        keep={{ term: termKey }}
        tabs={levels.map((l) => ({ value: String(l), label: `${l}`, count: missingStudentCount(boards.get(l) ?? []) }))}
      />

      {!data.ok && (
        <Alert kind="warning" title="숙제 기록을 다 읽지 못했어요">
          낸 숙제가 &lsquo;안 냄&rsquo; 으로 보이거나 이름이 비어 보일 수 있어요. 잠시 뒤 새로고침해 주세요.
        </Alert>
      )}

      {/* 몇 명을 보고 있는지 + 알림을 신청하지 않은 학생도 볼지 (숙제점검의 '점검완료 포함' 과 같은 자리 · 같은 모양) */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-bold text-ink-soft">
          {termLabel(term)} · {level ?? "-"} · 알림 신청 <span className="text-ink tabular-nums">{alerted}</span>명 중 기한 지난 숙제를 안 낸 학생{" "}
          <span className="text-ink tabular-nums">{flagged}</span>명
        </p>
        {(unalerted > 0 || showAll) && (
          <Link href={allHref} className="flex items-center gap-2 text-sm font-bold text-ink-soft transition hover:text-brand-600">
            <span
              aria-hidden
              className={cn("flex size-5 items-center justify-center rounded-md border-2 transition", showAll ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper")}
            >
              {showAll && (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[3.5]">
                  <path d="m5 13 5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            알림 신청 안 한 학생도 보기 <span className="tabular-nums text-mist">({unalerted}명)</span>
            <span className="sr-only">{showAll ? " — 지금 켜짐, 누르면 끕니다" : " — 지금 꺼짐, 누르면 켭니다"}</span>
          </Link>
        )}
      </div>
      <p className="mb-4 text-xs text-mist">
        숙제 기한은 같은 트랙의 다음 수업일 {HOMEWORK_DUE_LABEL}예요 (월수금 월요일 숙제는 수요일 5시, 금요일 숙제는 다음 주 첫 수업일 5시 · 화목금도 같고, 주5일은 두 트랙을
        따로 봐요). 그 시간이 지나도 안 냈으면 &lsquo;안 냄&rsquo; 이에요. 명단에는 숙제제출 화면에서 &lsquo;숙제 미제출 알림&rsquo; 을 신청한 학생만 나오고, 미제출 전체선택은 마지막
        알림 뒤에 새로 기한이 지난 숙제가 있는 학생을 골라요.
      </p>

      {full.length === 0 ? (
        <EmptyState
          icon="homework"
          title={`${level ?? ""} 숙제를 내는 반이 없어요`}
          description="이 달에 이 레벨 반에 배정된 학생이 없거나 수업일이 아직 없어요. 다른 레벨 칸을 눌러 보세요."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="bell"
          title="아직 알림을 신청한 학생이 없어요"
          description={`학생이 숙제제출 화면에서 '숙제 미제출 알림' 을 신청하면 여기에 나와요. 신청하지 않은 학생 ${unalerted}명은 위의 '알림 신청 안 한 학생도 보기' 로 볼 수 있어요.`}
        />
      ) : (
        <MissingBoard termId={term.id} level={level!} groups={groups} picks={defaultPicks(full, lastSent)} />
      )}
    </>
  );
}
