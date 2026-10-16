import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { cn, formatDate, lectureWayLabel, lectureWaysOf, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { TermChips } from "@/components/admin/TermChips";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { CancelLectureSignupButton } from "@/components/admin/lectures/CancelLectureSignupButton";
import { LectureOpenButton } from "@/components/admin/lectures/LectureOpenButton";
import { toneOf } from "@/lib/class-roster";
import {
  isYbmReviewUrl,
  LECTURE_STATE_CLASS,
  LECTURE_STATE_LABEL,
  lectureCondition,
  lectureConditionOf,
  lectureState,
  lectureTitle,
  reviewLinkKey,
  snsFollowShort,
} from "@/lib/lecture";
import { termParam } from "@/lib/study";
import { pickTerm } from "../_lib/queries";
import {
  getLectureTerms,
  getTermLectures,
  getTermLevels,
  lectureTypeOf,
  lectureTypeTabs,
  MEMO_TYPE,
  pickLectureType,
  type SignupLevel,
} from "./_lib/lectures";

export const metadata: Metadata = { title: "특강 신청", robots: { index: false } };

/**
 * **특강 신청 — 종류 버튼 → 방식 버튼 → 신청자 명단** (2026-10-16 Alan — "관리자모드에서 특강신청페이지를 누르면 아래로 쭉 내려야해서 신청자 인원파악이 너무 어려워.
 * 맨 위에 특강 종류 버튼을 만들어서 해당 버튼을 클릭하면 구분해서 보이도록 해줘. 예를들어, 모의고사를 누르면 아래에 추가적으로 전체, 현장, 시험지수령, pdf수령의 버튼이
 * 또 나오고 거기를 누르면 해당 학생들이 보이도록해줘").
 * - 첫째 줄(solid) = 그 달에 있는 종류 — RC특강 · LC특강 · 1차 모의고사 · 2차 모의고사 (메모만 있는 특강은 `특강`). 숫자 = 신청 수.
 * - 둘째 줄(outline) = 전체 + 그 종류의 신청 방식 (현장 · 수업영상 받기 / 현장 · 시험지 수령 · PDF 수령).
 * - 특강마다 **신청 받기 ↔ 신청 받기 취소** 버튼 — 누르는 순간 학생 화면에 서거나 빠진다 (7일 전 자동 열림은 없앴다. 같은 날 Alan
 *   "신청 받는 중 이라고 나와있는데, 취소하는버튼이 없어" — 그전 이름 `신청 마감` 은 날짜가 지난 특강의 상태 이름과 같아 되돌리는 버튼으로 읽히지 않았다).
 * - 신청자 줄은 이름 · 방식 · **레벨** · 신청 시각 (같은 날 Alan "전화번호말고, 학생 본인의 레벨이 나오도록해줘" — **전화번호는 읽지도 않는다**.
 *   레벨은 그 기수에 배정된 반의 강좌 — `getTermLevels`, 색은 반별 명단의 레벨 색).
 * - **강사 · 관리자 시험 신청은 숫자 · 명단에 넣지 않는다** (같은 날 Alan — "강사가 테스트로 특강신청을 눌러본거는 집계에서 빼줘. 이혜영, 이영수, 알런").
 *   종류 · 방식 숫자와 명단은 학생 신청만, 시험 신청은 특강마다 아래에 흐리게 따로 적고 거기서 지운다 (`StaffTestSignups` — DB 의 `staff_test`).
 * - 방식 · 조건 · 정원 · 안내는 **특강 설정**(`/admin/lectures/settings`)에서, 날짜 · 강사 · 무슨 특강은 반 편성 달력에서.
 */
export default async function AdminLecturesPage({ searchParams }: { searchParams: Promise<{ term?: string; type?: string; way?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  const terms = await getLectureTerms(supabase);
  const term = pickTerm(terms, sp.term, today);
  if (!term) {
    return (
      <>
        <PageHeader icon="bolt" title="특강 신청" description="특강마다 신청을 받고, 종류 · 신청 방식별로 신청자를 확인해요." />
        <EmptyState
          icon="calendar"
          title="아직 만든 특강이 없어요"
          description="반 편성 달력에서 [특강] 을 고르고 날짜를 누르면 여기에 나타납니다."
          action={{ href: "/admin/sections", label: "반 편성에서 특강 만들기" }}
        />
      </>
    );
  }

  const termKey = termParam(term.year, term.month);
  const { lectures, error } = await getTermLectures(supabase, term.id);
  const [allSignups, termLevels] = lectures.length
    ? await Promise.all([getSignups(supabase, lectures.map((l) => l.id)), getTermLevels(supabase, term.id)])
    : [[], null];
  // 강사 · 관리자 시험 신청은 숫자 · 명단에 넣지 않고 특강마다 따로 적는다 (2026-10-16 Alan — "강사가 테스트로 특강신청을 눌러본거는 집계에서 빼줘").
  // 방식 칩 · 신청 받기 취소의 수(applied_count)는 DB 가 이미 학생만 센다 — 여기 탭 숫자도 같은 집합이어야 한다
  const signups = allSignups.filter((s) => !s.staff_test);
  const testSignups = allSignups.filter((s) => s.staff_test);
  const typeOfLecture = new Map(lectures.map((l) => [l.id, lectureTypeOf(l)]));

  const type = pickLectureType(lectures, sp.type, today);
  const ofType = lectures.filter((l) => lectureTypeOf(l) === type);
  const typeSignups = signups.filter((s) => typeOfLecture.get(s.lecture_id) === type);
  const ways = lectureWaysOf(type === MEMO_TYPE ? null : type);
  const way = sp.way && (ways as string[]).includes(sp.way) ? sp.way : "all";
  const typeTabs = lectureTypeTabs(lectures, (t) => signups.filter((s) => typeOfLecture.get(s.lecture_id) === t).length);
  const wayTabs = [
    { value: "all", label: "전체", count: typeSignups.length },
    ...ways.map((w) => ({ value: w as string, label: lectureWayLabel(w), count: typeSignups.filter((s) => s.way === w).length })),
  ];
  const settingsHref = `/admin/lectures/settings?term=${termKey}${type ? `&type=${type}` : ""}`;

  return (
    <>
      <PageHeader icon="bolt" title="특강 신청" description="종류와 신청 방식을 골라 신청자를 봐요. 신청 받기 · 취소는 특강마다, 방식 · 조건 · 정원 · 안내는 특강 설정에서.">
        <Link href={settingsHref} className="btn-primary">
          <Icon name="admin" size={18} />
          특강 설정
        </Link>
        <Link href={`/admin/sections?term=${termKey}`} className="btn-secondary">
          <Icon name="calendar" size={18} />
          반 편성
        </Link>
      </PageHeader>

      {error && (
        <Alert kind="warning" title="특강을 읽지 못했어요" className="mb-4">
          <p>데이터베이스 업데이트가 아직 적용되지 않았거나 잠깐 연결이 끊겼어요. 잠시 뒤 새로고침해 주세요.</p>
        </Alert>
      )}

      {termLevels && !termLevels.ok && (
        <Alert kind="warning" className="mb-4">
          학생 레벨을 다 읽지 못했어요. 잠시 뒤 새로고침해 주세요.
        </Alert>
      )}

      <TermChips basePath="/admin/lectures" terms={terms} current={termKey} />

      {type && (
        <>
          <FilterTabs basePath="/admin/lectures" paramKey="type" current={type} tabs={typeTabs} keep={{ term: termKey }} />
          <FilterTabs basePath="/admin/lectures" paramKey="way" current={way} tabs={wayTabs} keep={{ term: termKey, type }} variant="outline" />
        </>
      )}

      <div className="space-y-4">
        {ofType.map((l) => {
          const state = lectureState(l, l.ways, today);
          const rows = typeSignups.filter((s) => s.lecture_id === l.id);
          const shownRows = way === "all" ? rows : rows.filter((s) => s.way === way);
          const tests = testSignups.filter((s) => s.lecture_id === l.id && (way === "all" || s.way === way));
          const waysOf = new Map(l.ways.map((w) => [w.way, w]));
          // 구독 · 팔로우 조건 방식의 인스타그램 새로 · 기존 (2026-10-15) — 지금 보는 방식의 명단으로 센다
          const follows = { new: shownRows.filter((r) => r.sns_follow === "new").length, existing: shownRows.filter((r) => r.sns_follow === "existing").length };
          // 후기 조건이면 같은 후기(키 — `reviewLinkKey`)를 낸 학생을 짚는다 — 2026-10-08 저녁부터 DB 가 다른 학생의 링크를 막으므로 그 전에 들어온 신청에만 붙을 수 있다
          const linkCount = new Map<string, number>();
          for (const r of rows) {
            const key = reviewLinkKey(r.review_url);
            if (key) linkCount.set(key, (linkCount.get(key) ?? 0) + 1);
          }
          return (
            <section key={l.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-violet-50/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-black text-ink">{lectureTitle(l)}</p>
                  <p className="mt-0.5 text-sm text-slate">
                    {formatDate(l.date)}
                    {l.lecturer?.name && <span className="ml-2 font-bold text-violet-700">{l.lecturer.name}</span>}
                  </p>
                </div>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", LECTURE_STATE_CLASS[state])}>{LECTURE_STATE_LABEL[state]}</span>
                  <LectureOpenButton lectureId={l.id} open={l.signup} past={l.date < today} signups={l.applied_count} />
                </span>
              </div>

              {/* 방식마다 신청 수 · 정원 · 조건 — 꺼진 방식은 흐리게 */}
              <ul className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5 text-xs">
                {l.ways.map((w) => {
                  const condition = lectureCondition(w.signup_condition);
                  return (
                    <li
                      key={w.way}
                      className={cn("rounded-full px-2.5 py-1 font-bold", w.enabled ? "bg-brand-50 text-brand-700" : "bg-line text-slate line-through decoration-slate/60")}
                      title={w.enabled ? undefined : "받지 않는 방식"}
                    >
                      {lectureWayLabel(w.way)} {w.applied_count}
                      {w.capacity !== null && ` / ${w.capacity}`}명
                      {condition !== "none" && <span className="font-semibold"> · {lectureConditionOf(condition).short}</span>}
                    </li>
                  );
                })}
                {l.ways.length === 0 && <li className="text-mist">신청 방식이 없어요</li>}
                {follows.new + follows.existing > 0 && (
                  <li className="rounded-full bg-line px-2.5 py-1 font-bold text-slate">
                    인스타 새로 팔로우 {follows.new} · 기존 {follows.existing}
                  </li>
                )}
              </ul>

              {shownRows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-mist">
                  {rows.length > 0 ? `${lectureWayLabel(way)} 로 신청한 수강생이 없어요.` : l.signup ? "아직 신청한 수강생이 없어요. 학생 특강 신청 화면에 보이고 있어요." : "신청을 받기 전이에요. '신청 받기' 를 누르면 학생 화면에 나타나요."}
                </p>
              ) : (
                <ol className="divide-y divide-line">
                  {shownRows.map((s, i) => {
                    const condition = lectureCondition(waysOf.get(s.way)?.signup_condition);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                        <span className="w-6 font-black tabular-nums text-mist">{i + 1}</span>
                        <span className="font-bold text-ink">{s.student?.name ?? "이름 없음"}</span>
                        {way === "all" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{lectureWayLabel(s.way)}</span>}
                        {termLevels?.ok && <LevelChips levels={termLevels.byStudent.get(s.user_id) ?? []} order={termLevels.levels} />}
                        <span className="text-xs text-mist">{formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 신청</span>
                        <span className="ml-auto">
                          <CancelLectureSignupButton id={s.id} name={s.student?.name ?? "수강생"} />
                        </span>
                        {(condition === "review" || s.review_url) && (
                          <ReviewLinkLine url={s.review_url} shared={(linkCount.get(reviewLinkKey(s.review_url) ?? "") ?? 0) > 1} />
                        )}
                        {(condition === "sns" || s.sns_follow) && <SnsFollowLine follow={s.sns_follow} />}
                      </li>
                    );
                  })}
                </ol>
              )}

              {tests.length > 0 && <StaffTestSignups rows={tests} showWay={way === "all"} />}
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * 신청 명단 — 방식 · 후기 링크 · 인스타그램 팔로우 · 시험 신청 표시와 함께. 전화번호는 읽지 않는다 (2026-10-16 — 줄에는 레벨을 적는다).
 * 시험 신청 칸(`staff_test`)은 마이그레이션 20261016130000 에서 생겼다 — 못 읽으면(배포 사이) 그 칸 없이 읽고 모두 학생 신청으로 본다 (명단이 비지 않게)
 */
async function getSignups(supabase: Awaited<ReturnType<typeof createClient>>, ids: number[]) {
  const withTest = await supabase
    .from("lecture_signups")
    .select("id, lecture_id, user_id, way, created_at, review_url, sns_follow, staff_test, student:profiles(name)")
    .in("lecture_id", ids)
    .order("created_at");
  if (!withTest.error) return withTest.data ?? [];
  const { data } = await supabase
    .from("lecture_signups")
    .select("id, lecture_id, user_id, way, created_at, review_url, sns_follow, student:profiles(name)")
    .in("lecture_id", ids)
    .order("created_at");
  return (data ?? []).map((s) => ({ ...s, staff_test: false }));
}

/**
 * **강사 · 관리자 시험 신청** — 신청 수 · 정원에 세지 않는다 (2026-10-16 Alan — "강사가 테스트로 특강신청을 눌러본거는 집계에서 빼줘. 이혜영, 이영수, 알런").
 * 시험 신청인지는 DB 가 신청을 넣을 때 **진짜 등급**(강사 · 관리자)으로 정해 둔 `staff_test` 다 — 이름으로 가르지 않는다 (조교 신청은 센다).
 * 학생 명단 아래에 흐리게 따로 적고 여기서 지운다 (특강 종류를 바꾸거나 반 편성 달력에서 빼면 DB 가 함께 지운다).
 */
function StaffTestSignups({
  rows,
  showWay,
}: {
  rows: readonly { id: number; way: string; created_at: string; student: { name: string } | null }[];
  showWay: boolean;
}) {
  return (
    <div className="border-t border-dashed border-line bg-surface/70 px-4 py-2.5">
      <p className="text-xs font-bold text-slate">
        강사 · 관리자 시험 신청 {rows.length}건 <span className="font-semibold text-mist">· 신청 수 · 정원에 세지 않아요</span>
      </p>
      <ul className="mt-1 divide-y divide-line/70">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
            <span className="font-semibold text-slate">{s.student?.name ?? "이름 없음"}</span>
            {showWay && <span className="rounded-full bg-line px-2 py-0.5 text-xs font-bold text-slate">{lectureWayLabel(s.way)}</span>}
            <span className="text-xs text-mist">{formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 신청</span>
            <span className="ml-auto">
              <CancelLectureSignupButton id={s.id} name={s.student?.name ?? "강사"} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 신청자 레벨 — `650` · `650 중급속성` · `850 2주완성` (그 기수에 배정된 반의 강좌, 두 레벨이면 둘). 색은 학생명단 반별 명단과 같은 레벨 색
 * (레벨 숫자를 그 기수 레벨 중 작은 것부터 센 자리 — 650 살구 · 750 노랑 · 850 하늘). 그 기수 배정이 없으면 '반 미배정'.
 */
function LevelChips({ levels, order }: { levels: readonly SignupLevel[]; order: readonly number[] }) {
  if (levels.length === 0) return <span className="text-xs font-semibold text-mist">반 미배정</span>;
  return (
    <>
      {levels.map((l) => {
        const rank = l.level != null ? order.indexOf(l.level) : -1;
        const tone = rank >= 0 ? toneOf(rank) : null;
        return (
          <span
            key={l.label}
            className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold", !tone && "bg-line text-slate")}
            style={tone ? { background: tone.head, color: tone.ink } : undefined}
          >
            {l.label}
          </span>
        );
      })}
    </>
  );
}

/**
 * 학생이 올린 YBM 수강후기 링크 — 눌러 열어 보고 후기가 아니면 신청을 취소한다.
 * 같은 후기(`reviewLinkKey`)를 다른 학생도 냈으면 표시한다 (친구 후기를 그대로 붙여 넣은 것일 수 있다) —
 * 2026-10-08 저녁부터는 DB 가 그런 신청을 아예 막으므로(20261008130000) 그 전에 들어온 신청에만 붙는다.
 * 신청은 YBM 후기 링크 꼴만 받지만(2026-10-08 — `YBM_REVIEW_LINK_RE`) 꼴을 좁히기 전 몇 분 동안 들어온 신청이 있을 수 있어 그 꼴이 아니면 표시한다.
 * 조건이 생기기 전 신청은 링크가 없다.
 */
function ReviewLinkLine({ url, shared }: { url: string | null; shared: boolean }) {
  if (!url) return <p className="basis-full pl-9 text-xs font-semibold text-amber-700">후기 링크 없음</p>;
  return (
    <p className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 pl-9 text-xs">
      <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-semibold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
        {url}
      </a>
      {!isYbmReviewUrl(url) && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">YBM 후기 링크 아님</span>}
      {shared && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">다른 학생과 같은 링크</span>}
    </p>
  );
}

/** 유튜브 구독 · 인스타그램 팔로우 조건 방식의 신청자 줄 — 학생이 고른 새로 · 기존 (그림의 "기존 팔로우는 기존으로 표기"). 조건이 생기기 전 신청은 비어 있다 */
function SnsFollowLine({ follow }: { follow: string | null }) {
  const label = snsFollowShort(follow);
  if (!label) return <p className="basis-full pl-9 text-xs font-semibold text-amber-700">구독 · 팔로우 확인 없음 (조건을 정하기 전 신청)</p>;
  return (
    <p className="basis-full pl-9 text-xs">
      <span className={follow === "new" ? "rounded-full bg-brand-500 px-2 py-0.5 font-bold text-white" : "rounded-full bg-line px-2 py-0.5 font-bold text-slate"}>
        유튜브 구독 · 인스타 {label}
      </span>
    </p>
  );
}
