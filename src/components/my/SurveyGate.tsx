"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { isSurveyFreePath, SURVEY_PATH } from "@/lib/student-survey";

/**
 * 수강생 설문을 마치기 전에는 마이페이지의 다른 화면을 열지 않는다 (2026-10-28 Alan "다 작성해야지 진행할 수 있도록 해줘").
 *
 * 레이아웃은 화면을 옮겨도 다시 그려지지 않으므로(하단 메뉴로 옮겨 가기) 주소를 보는 이 조각이 문을 지킨다. `pending` 은 서버가 정한다 —
 * 지금 수강 중이거나 개강 전 등록이 있는 학생(강사 · 관리자 · 조교 계정은 빼고)이 아직 설문을 안 했을 때. 설문을 내면 서버 액션이 레이아웃을 다시
 * 그려 `pending` 이 꺼진다. 설문 전에도 열리는 화면(등업신청 · 내 계정 · 내 정보 · 출석 찍기)은 `isSurveyFreePath`.
 * 보안 장치가 아니다 — 학생이 볼 권리가 있는 화면의 순서만 정한다 (데이터는 RLS 가 지킨다).
 */
export function SurveyGate({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const blocked = pending && !isSurveyFreePath(path);

  useEffect(() => {
    if (blocked) router.replace(SURVEY_PATH);
  }, [blocked, router]);

  if (!blocked) return <>{children}</>;
  // 옮겨 가는 사이에 보이는 한 장 — 자바스크립트가 늦어도 누를 곳이 있다
  return (
    <section className="card mx-auto max-w-md p-6 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
        <Icon name="verify" size={34} />
      </span>
      <h1 className="mt-4 text-lg font-black text-ink">수강생 설문을 먼저 해 주세요</h1>
      <p className="mt-2 text-sm text-slate">처음 한 번만 하는 설문이에요. 마치면 수강생 화면을 바로 쓸 수 있어요.</p>
      <Link href={SURVEY_PATH} className="btn-primary mt-5 w-full">
        설문하러 가기
      </Link>
    </section>
  );
}
