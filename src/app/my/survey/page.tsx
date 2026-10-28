import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { getStudentAccess, isCrew, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { programRank } from "@/lib/timetable";
import { termKeyOf } from "@/lib/enroll-options";
import { nextMonthLabel, scoreLine, SURVEY_PATH } from "@/lib/student-survey";
import { getMySurvey, getMyVerifications } from "../_lib/queries";
import { mySurveyTerm, nextClassSections, nextMonthOf } from "./_lib/next-class";
import { SurveyForm } from "./SurveyForm";

export const metadata: Metadata = {
  title: "수강생 설문",
  robots: { index: false },
};

/**
 * 수강생 설문 (2026-10-28 Alan — OT 첫날 종이 설문을 웹으로. "등업직후 바로 진행. 다 작성해야지 진행할 수 있도록 해줘. 설문조사는 처음 한번만 진행.
 * 볼 수 있는사람은 관리자, 강사만"). 등업을 마친 학생(지금 수강 중 · 개강 전 등록)이 설문 전이면 마이페이지의 다른 화면이 여기로 보낸다 (`SurveyGate`).
 * 강사 · 관리자 · 조교 계정은 학생이 보는 그대로 미리 보기만 한다 (내기는 서버 · DB 가 막는다).
 */
export default async function SurveyPage() {
  const [{ user, profile }, access, survey, verifications] = await Promise.all([
    requireUser(SURVEY_PATH),
    getStudentAccess(),
    getMySurvey(),
    getMyVerifications(),
  ]);
  const preview = isCrew(profile?.role);

  const header = (
    <PageHeader
      icon="verify"
      title="수강생 설문"
      description="처음 한 번만 하는 설문이에요. 선생님이 수업과 숙제 관리에 참고해요."
    />
  );

  // 이미 냈다 — 다시 하지 않는다 (지금 점수 · 목표는 마이페이지 맨 위에서 고친다)
  if (survey.row) {
    return (
      <div className="space-y-6">
        {header}
        <section className="card mx-auto max-w-lg p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
            <Icon name="success" size={34} />
          </span>
          <h2 className="mt-4 text-lg font-black text-ink">설문을 마쳤어요</h2>
          <p className="mt-2 text-sm text-slate">
            지금 점수 <b className="text-ink">{scoreLine(survey.row.now_total, survey.row.now_lc, survey.row.now_rc)}</b> · 목표{" "}
            <b className="text-ink">{survey.row.now_target}점</b>
          </p>
          <p className="mt-1 text-sm text-slate">점수와 목표는 마이페이지 맨 위에서 언제든 고칠 수 있어요.</p>
          <Link href="/my" className="btn-primary mt-5 w-full sm:w-auto">
            마이페이지로
          </Link>
        </section>
      </div>
    );
  }

  // 등업 전 — 수강생이 되면 그때 한다 (미리 보기는 예외)
  if (!preview && !access.enrollee) {
    return (
      <div className="space-y-6">
        {header}
        <section className="card mx-auto max-w-lg p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
            <Icon name="verify" size={34} />
          </span>
          <h2 className="mt-4 text-lg font-black text-ink">등업을 마친 뒤에 하는 설문이에요</h2>
          <p className="mt-2 text-sm text-slate">수강증을 올려 등업하면 처음 한 번 설문을 해요.</p>
          <Link href="/my/verify" className="btn-primary mt-5 w-full sm:w-auto">
            등업신청하러 가기
          </Link>
        </section>
      </div>
    );
  }

  const supabase = await createClient();
  const today = todayKST();
  const term = await mySurveyTerm(supabase, user.id, today);
  const next = nextMonthOf(term, today);
  const [sections, { data: courseRows }] = await Promise.all([
    nextClassSections(supabase, next),
    supabase.from("courses").select("id, name, program, target_score").eq("is_active", true),
  ]);
  // 다음 달 시간표가 하나도 없을 때(처음 여는 계절 · 읽기 실패) 고르는 레벨 — 점수보장반 → 속성반 → 2주완성, 그 안은 점수 순
  const courses = (courseRows ?? [])
    .slice()
    .sort((a, b) => programRank(a.program) - programRank(b.program) || (a.target_score ?? 0) - (b.target_score ?? 0) || a.id - b.id)
    .map((c) => ({ id: c.id, name: c.name }));
  // 이름 · 전화번호 확인이 아직이면 알려 준다 (막지는 않는다 — 확인은 등업신청 화면에 있다)
  const needsIdentity = !preview && verifications.length > 0 && !profile?.identity_confirmed_at;

  return (
    <div className="space-y-6">
      {header}

      {preview && (
        <Alert kind="info" title="미리 보기예요">
          강사 · 관리자 · 조교 계정은 학생이 보는 설문을 그대로 볼 수만 있어요. 답을 내지는 않아요.
        </Alert>
      )}

      {needsIdentity && (
        <Alert kind="warning" title="이름 · 전화번호 확인이 아직이에요">
          같은 이름의 수강생과 헷갈리지 않게{" "}
          <Link href="/my/verify" className="font-bold underline">
            등업신청 화면
          </Link>
          에서 먼저 확인해 주세요.
        </Alert>
      )}

      <section className="card border-brand-200 bg-brand-50/50 p-4 text-sm text-slate sm:p-5">
        <p className="font-bold text-ink">모든 질문에 답하면 바로 수강생 화면이 열려요.</p>
        <p className="mt-1">
          답은 <b className="text-ink">강사 · 관리자만</b> 보고 수업과 숙제 관리에 써요. 직장명 · LC · RC 점수 · 소개해 준 분 이름은 비워도 돼요.
        </p>
      </section>

      <SurveyForm
        sections={sections}
        courses={courses}
        nextLabel={nextMonthLabel(next, today)}
        termKey={termKeyOf({ year: next.y, month: next.m })}
        preview={preview}
      />
    </div>
  );
}
