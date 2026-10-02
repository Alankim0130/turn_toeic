import Link from "next/link";
import { isCrew, type StudentAccess } from "@/lib/auth";
import type { StudentFeature } from "@/lib/site";
import { formatDate } from "@/lib/utils";

/** 수강생전용 기능이 왜 잠겼는지. crew = 강사·관리자·조교가 학생 모드에서 반 배정 없이 들어옴 (2026-10-02 — 스태프도 배정으로 판정) */
export type UnlockState = "open" | "guest" | "member" | "preliminary" | "alumni" | "crew";

export function unlockState(access: StudentAccess): UnlockState {
  if (access.active) return "open";
  if (!access.signedIn) return "guest";
  if (access.opensOn) return "preliminary";
  if (access.role && isCrew(access.role)) return "crew";
  if (access.role === "alumni") return "alumni";
  return "member";
}

function opensOnLabel(access: StudentAccess) {
  return access.opensOn ? formatDate(access.opensOn, { month: "long", day: "numeric" }) : "개강일";
}

/** 잠긴 카드 아래에 붙는 짧은 상태 문구 */
export function lockedHint(access: StudentAccess) {
  switch (unlockState(access)) {
    case "guest":
      return "로그인하고 등업하면 열려요";
    case "preliminary":
      return `${opensOnLabel(access)} 개강일부터 열려요`;
    case "alumni":
      return "다시 등록하고 수강증을 올리면 열려요";
    case "crew":
      return "반에 배정되면 학생 화면 그대로 열려요";
    default:
      return "수강증을 올려 등업하면 바로 열려요";
  }
}

/** 잠금 화면 제목 */
export function lockedHeadline(access: StudentAccess) {
  switch (unlockState(access)) {
    case "guest":
      return "로그인하고 등업하면 이용할 수 있어요";
    case "preliminary":
      return `${opensOnLabel(access)} 개강일부터 열려요`;
    case "alumni":
      return "지난 수강 기간이 끝났어요";
    case "crew":
      return "강사·조교 계정은 반에 배정돼야 학생 화면이 열려요";
    default:
      return "수강증을 올려 등업하면 바로 열려요";
  }
}

/** 상태별 다음 행동 버튼 */
export function UnlockActions({ access, feature }: { access: StudentAccess; feature?: StudentFeature }) {
  const state = unlockState(access);
  if (state === "open") return null;

  if (state === "guest") {
    const next = feature?.href ?? "/student";
    return (
      <>
        <Link href="/signup" className="btn-primary">
          회원가입하고 시작하기
        </Link>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-secondary">
          로그인
        </Link>
      </>
    );
  }

  if (state === "preliminary") {
    return (
      <Link href="/my" className="btn-secondary">
        내 등록 현황 보기
      </Link>
    );
  }

  // 스태프·조교 — 학생명단에서 자기 계정을 반에 배정하면 그 학생과 똑같이 열린다 (테스터)
  if (state === "crew") {
    return (
      <Link href="/admin/students" className="btn-secondary">
        학생명단에서 반 배정하기
      </Link>
    );
  }

  return (
    <Link href="/my/verify" className="btn-primary">
      {state === "alumni" ? "다시 등록하고 수강증 올리기" : "수강증 올리고 등업하기"}
    </Link>
  );
}
