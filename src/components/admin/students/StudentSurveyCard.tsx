import { formatDate } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";
import {
  goalMonthsLabel,
  HISTORY,
  labelOf,
  MANAGE_STYLES,
  NEXT_PLANS,
  OCCUPATIONS,
  REASONS,
  scoreLine,
  SOURCES,
} from "@/lib/student-survey";

export type StudentSurveyRow = Database["public"]["Tables"]["student_surveys"]["Row"];

const labels = (list: Parameters<typeof labelOf>[0], keys: readonly string[]) => keys.map((k) => labelOf(list, k)).join(" · ");

/**
 * 학생 관리의 **수강생 설문** 칸 (2026-10-28 Alan "볼 수 있는사람은 관리자, 강사만") — 이 화면은 강사 · 관리자만 연다 (조교 아님 — 학생 정보는 이름만).
 * 설문 답은 처음 한 번 그대로이고, 지금 점수 · 목표만 학생이 마이페이지에서 고친다 — 둘이 다르면 설문 때 값을 아래에 함께 적는다.
 * 숙제 관리 방식은 설문 때 고른 것과 **지금 숙제 미제출 알림 스위치**를 함께 보여 준다 (학생이 숙제제출 화면에서 바꿀 수 있다).
 *
 * @param alertsOn 지금 숙제 미제출 알림을 받는가 (`homework_missing_optouts` 에 줄이 없으면 받는다). 못 읽었으면 null
 */
export function StudentSurveyCard({ survey, alertsOn }: { survey: StudentSurveyRow | null; alertsOn: boolean | null }) {
  if (!survey) {
    return (
      <p className="rounded-xl bg-surface px-4 py-5 text-sm text-slate">
        아직 설문을 하지 않았어요. 등업을 마친 학생은 마이페이지를 열면 설문부터 해요.
        {alertsOn != null && <span className="mt-1 block text-xs text-mist">숙제 미제출 알림 · 지금 {alertsOn ? "켜짐" : "꺼짐"}</span>}
      </p>
    );
  }

  const nowLine = `${scoreLine(survey.now_total, survey.now_lc, survey.now_rc)} · 목표 ${survey.now_target}점`;
  const thenLine = `${scoreLine(survey.score_total, survey.score_lc, survey.score_rc)} · 목표 ${survey.target_score}점`;
  const nextMonth =
    survey.next_year && survey.next_month
      ? survey.next_year === Number(survey.created_at.slice(0, 4))
        ? `${survey.next_month}월`
        : `${survey.next_year}년 ${survey.next_month}월`
      : "다음 달";
  const nextClass = survey.next_class as { label?: string } | null;
  const nextLine =
    survey.next_plan === "yes"
      ? `${labelOf(NEXT_PLANS, "yes")} · ${nextClass?.label ?? "반 미정"}`
      : survey.next_plan === "no"
        ? `${labelOf(NEXT_PLANS, "no")} · ${survey.next_reason ?? ""}`
        : labelOf(NEXT_PLANS, survey.next_plan);
  const manage = MANAGE_STYLES.find((m) => m.key === survey.manage_style);

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "지금 하는 일",
      value: survey.workplace ? `${labelOf(OCCUPATIONS, survey.occupation)} · ${survey.workplace}` : labelOf(OCCUPATIONS, survey.occupation),
    },
    {
      label: "점수",
      value: (
        <>
          <span className="font-bold">{nowLine}</span>
          {/* 목표 기간은 설문 때 답이다 — 학생이 목표를 고쳤으면 설문 때 줄에 함께 둔다 */}
          {nowLine === thenLine ? (
            <span className="text-slate"> · {goalMonthsLabel(survey.goal_months)} 안에</span>
          ) : (
            <span className="mt-0.5 block text-xs text-mist">
              설문 때 {thenLine} · {goalMonthsLabel(survey.goal_months)} 안에
            </span>
          )}
        </>
      ),
    },
    {
      label: "공부 이유",
      value: survey.reason_other ? `${labels(REASONS, survey.reasons)} (${survey.reason_other})` : labels(REASONS, survey.reasons),
    },
    {
      label: "공부 이력",
      value: (
        <>
          {labels(HISTORY, survey.history)}
          {survey.history_where && <span className="mt-0.5 block text-slate">들은 수업 · {survey.history_where}</span>}
        </>
      ),
    },
    { label: `${nextMonth} 수강`, value: nextLine },
    {
      label: "숙제 관리",
      value: (
        <>
          {manage?.title ?? survey.manage_style}
          {alertsOn != null && <span className="mt-0.5 block text-xs text-slate">숙제 미제출 알림 · 지금 {alertsOn ? "켜짐" : "꺼짐"}</span>}
        </>
      ),
    },
    {
      label: "수강 계기",
      value: (
        <>
          {labels(SOURCES, survey.sources)}
          {survey.referrer_name && <span className="text-slate"> · 소개 {survey.referrer_name}</span>}
          <span className="mt-1 block whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-slate [overflow-wrap:anywhere]">{survey.source_story}</span>
        </>
      ),
    },
  ];

  return (
    <>
      <p className="mb-3 text-xs text-mist">
        {formatDate(survey.created_at, { year: "numeric", month: "long", day: "numeric" })}에 설문함
        {/* 학생이 마이페이지에서 점수를 고쳤으면 그날 */}
        {Date.parse(survey.now_updated_at) - Date.parse(survey.created_at) > 60_000 &&
          ` · 점수는 ${formatDate(survey.now_updated_at, { month: "long", day: "numeric" })}에 고침`}
      </p>
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="grid gap-1 py-2.5 text-sm sm:grid-cols-[7rem_1fr] sm:gap-3">
            <dt className="font-bold text-slate">{r.label}</dt>
            <dd className="min-w-0 text-ink [overflow-wrap:anywhere]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
