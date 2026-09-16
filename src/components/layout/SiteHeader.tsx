import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { isCrew, type Profile, type StudentAccess } from "@/lib/auth";
import { MobileMenu } from "./MobileMenu";
import { StaffModeSwitch } from "./StaffModeSwitch";
import { DesktopNav } from "./DesktopNav";
import { signOut } from "@/app/(auth)/actions";

export function SiteHeader({ profile, signedIn, access }: { profile: Profile | null; signedIn: boolean; access: StudentAccess }) {
  // 조교도 모드를 오간다 (2026-09-16 Alan)
  const staff = isCrew(profile?.role);
  const navAccess = { active: access.active, enrollee: access.enrollee };

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 glass">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo height={30} priority />

        {/* 데스크톱 메뉴 (lg 이상). 수강생전용 기능은 하위 메뉴로 묶었다 */}
        <nav aria-label="주요 메뉴" className="hidden lg:block">
          <DesktopNav access={navAccess} />
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {/* 스태프는 관리자 화면과 학생 화면을 여기서 오간다 (관리자 바로가기 겸용) */}
          {staff && <StaffModeSwitch role={profile?.role} />}
          {signedIn ? (
            <>
              <Link href="/my" className="btn-ghost whitespace-nowrap !px-3 !py-2">
                <Icon name="profile" size={20} />
                <span className="max-w-[7rem] truncate">{profile?.name ? `${profile.name}님` : "마이페이지"}</span>
              </Link>
              <form action={signOut}>
                <button type="submit" className="btn-secondary whitespace-nowrap !px-4 !py-2">
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost whitespace-nowrap !px-4 !py-2">
                로그인
              </Link>
              <Link href="/signup" className="btn-dark whitespace-nowrap !px-4 !py-2">
                회원가입
              </Link>
            </>
          )}
        </div>

        {/* 모바일·태블릿: 오른쪽 슬라이드 메뉴 */}
        <MobileMenu signedIn={signedIn} staff={staff} role={profile?.role ?? null} name={profile?.name ?? null} access={navAccess} />
      </div>
    </header>
  );
}
