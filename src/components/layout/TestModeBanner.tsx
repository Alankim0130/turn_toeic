import Link from "next/link";
import { ROLE_LABEL, TEST_ROLES, type Profile } from "@/lib/auth";
import { endMyTest, switchMyTestRole } from "@/app/admin/students/tester-actions";

/**
 * 테스트 등급을 켠 테스터(강사·관리자)에게 모든 화면 맨 위에 띄운다 — 켜 둔 채 잊지 않도록.
 * 테스트 중에는 RLS 가 이 계정을 그 등급의 학생으로 보므로 관리자 화면의 데이터가 보이지 않는다.
 */
export function TestModeBanner({ profile }: { profile: Profile | null }) {
  if (!profile?.test_role) return null;
  return (
    <div role="status" className="border-b border-amber-300 bg-amber-50">
      <div className="container-x flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-sm">
        <p className="min-w-0 flex-1 text-amber-900">
          <strong className="font-black">테스트 중</strong> · 이 계정은 지금 <strong className="font-black">{ROLE_LABEL[profile.test_role]}</strong>으로 보여요.
          <span className="hidden sm:inline"> 관리자 화면의 데이터는 테스트를 끝내야 다시 보입니다.</span>{" "}
          <Link href={`/admin/students/${profile.id}`} className="font-bold underline underline-offset-2">
            반 배정 바꾸기
          </Link>
        </p>
        <form action={switchMyTestRole} className="flex items-center gap-1.5">
          <label htmlFor="test-mode-role" className="sr-only">테스트 등급</label>
          <select id="test-mode-role" name="test_role" defaultValue={profile.test_role} className="input !w-auto !py-1 !pl-2 !pr-7 text-xs font-bold">
            {TEST_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary !px-3 !py-1 text-xs">바꾸기</button>
        </form>
        <form action={endMyTest}>
          <button type="submit" className="btn-dark !px-3 !py-1.5 text-xs">테스트 끝내기</button>
        </form>
      </div>
    </div>
  );
}
