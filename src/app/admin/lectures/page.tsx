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
import { getLectureTerms, getTermLectures, lectureTypeOf, lectureTypeTabs, MEMO_TYPE, pickLectureType } from "./_lib/lectures";

export const metadata: Metadata = { title: "특강 신청", robots: { index: false } };

/**
 * **특강 신청 — 종류 버튼 → 방식 버튼 → 신청자 명단** (2026-10-16 Alan — "관리자모드에서 특강신청페이지를 누르면 아래로 쭉 내려야해서 신청자 인원파악이 너무 어려워.
 * 맨 위에 특강 종류 버튼을 만들어서 해당 버튼을 클릭하면 구분해서 보이도록 해줘. 예를들어, 모의고사를 누르면 아래에 추가적으로 전체, 현장, 시험지수령, pdf수령의 버튼이
 * 또 나오고 거기를 누르면 해당 학생들이 보이도록해줘").
 * - 첫째 줄(solid) = 그 달에 있는 종류 — RC특강 · LC특강 · 1차 모의고사 · 2차 모의고사 (메모만 있는 특강은 `특강`). 숫자 = 신청 수.
 * - 둘째 줄(outline) = 전체 + 그 종류의 신청 방식 (현장 · 수업영상 받기 / 현장 · 시험지 수령 · PDF 수령).
 * - 특강마다 **신청 받기 · 신청 마감** 버튼 — 누르는 순간 학생 화면에 서거나 빠진다 (7일 전 자동 열림은 없앴다).
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
  const signups = lectures.length ? await getSignups(supabase, lectures.map((l) => l.id)) : [];
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
      <PageHeader icon="bolt" title="특강 신청" description="종류와 신청 방식을 골라 신청자를 봐요. 신청 받기 · 마감은 특강마다, 방식 · 조건 · 정원 · 안내는 특강 설정에서.">
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
                  <LectureOpenButton lectureId={l.id} open={l.signup} past={l.date < today} />
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
                  {rows.length > 0 ? `${lectureWayLabel(way)} 로 신청한 수강생이 없어요.` : l.signup ? "아직 신청한 수강생이 없어요." : "신청을 받기 전이에요. '신청 받기' 를 누르면 학생 화면에 나타나요."}
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
                        {s.student?.phone && <span className="text-slate">{s.student.phone}</span>}
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
            </section>
          );
        })}
      </div>
    </>
  );
}

/** 신청 명단 — 방식 · 후기 링크 · 인스타그램 팔로우와 함께 */
async function getSignups(supabase: Awaited<ReturnType<typeof createClient>>, ids: number[]) {
  const { data } = await supabase
    .from("lecture_signups")
    .select("id, lecture_id, way, created_at, review_url, sns_follow, student:profiles(name, phone)")
    .in("lecture_id", ids)
    .order("created_at");
  return data ?? [];
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
