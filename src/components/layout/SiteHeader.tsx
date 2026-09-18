import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { effectiveRole, isCrew, ROLE_LABEL, type Profile, type StudentAccess } from "@/lib/auth";
import { MobileMenu } from "./MobileMenu";
import { StaffModeSwitch } from "./StaffModeSwitch";
import { DesktopNav } from "./DesktopNav";
import { Avatar } from "./Avatar";
import { signOut } from "@/app/(auth)/actions";

export function SiteHeader({ profile, signedIn, access }: { profile: Profile | null; signedIn: boolean; access: StudentAccess }) {
  // 조교도 모드를 오간다 (2026-09-16 Alan)
  const staff = isCrew(profile?.role);
  const navAccess = { active: access.active, enrollee: access.enrollee };
  const role = effectiveRole(profile);
  const name = profile?.name?.trim() || null;

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 glass">
      <div className="container-x flex h-16 items-center justify-between gap-3 lg:gap-4">
        {/* 왼쪽: 햄버거(lg 미만) + 로고 (2026-09-18 Alan — "햄버거바를 첫토익처럼 왼쪽으로") */}
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          <MobileMenu
            signedIn={signedIn}
            staff={staff}
            role={profile?.role ?? null}
            name={name}
            roleLabel={role ? ROLE_LABEL[role] : null}
            access={navAccess}
            until={access.until}
            opensOn={access.opensOn}
          />
          <Logo height={30} priority />
        </div>

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
                <span className="max-w-[7rem] truncate">{name ? `${name}님` : "마이페이지"}</span>
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

        {/* 오른쪽(lg 미만): 스태프 모드 전환 + 로그인 표시 (2026-09-18 Alan — "우측에는 로그인 표시").
            로그인했으면 이름 첫 글자 동그라미(400px 부터 이름도), 아니면 로그인 버튼 */}
        <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
          {staff && <StaffModeSwitch variant="compact" role={profile?.role} />}
          {signedIn ? (
            <Link
              href="/my"
              aria-label={name ? `${name}님 마이페이지` : "마이페이지"}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-paper p-0.5 ring-1 ring-line transition hover:ring-brand-300 min-[400px]:pr-3"
            >
              <Avatar name={name} size={32} />
              {name && <span className="hidden max-w-[5rem] truncate text-xs font-bold text-ink min-[400px]:inline">{name}님</span>}
            </Link>
          ) : (
            <Link href="/login" className="btn-dark whitespace-nowrap !px-3.5 !py-2 text-xs">
              <Icon name="login" size={16} className="brightness-0 invert" />
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
