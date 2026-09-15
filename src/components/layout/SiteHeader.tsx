import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { NAV_MAIN } from "@/lib/site";
import { isStaff, type Profile } from "@/lib/auth";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { signOut } from "@/app/(auth)/actions";

export function SiteHeader({ profile, signedIn }: { profile: Profile | null; signedIn: boolean }) {
  const staff = isStaff(profile?.role);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 glass">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo height={30} priority />

        {/* 데스크톱 네비 */}
        <nav aria-label="주요 메뉴" className="hidden md:block">
          <NavLinks items={NAV_MAIN} />
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {staff && (
            <Link href="/admin" className="btn-primary !px-4 !py-2">
              <Icon name="admin" size={18} className="brightness-0 invert" />
              관리자
            </Link>
          )}
          {signedIn ? (
            <>
              <Link href="/my" className="btn-ghost !px-3 !py-2">
                <Icon name="profile" size={20} />
                {profile?.name ? `${profile.name}님` : "마이페이지"}
              </Link>
              <form action={signOut}>
                <button type="submit" className="btn-secondary !px-4 !py-2">
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !px-4 !py-2">
                로그인
              </Link>
              <Link href="/signup" className="btn-dark !px-4 !py-2">
                회원가입
              </Link>
            </>
          )}
        </div>

        {/* 모바일 메뉴 */}
        <MobileMenu signedIn={signedIn} staff={staff} name={profile?.name ?? null} />
      </div>
    </header>
  );
}
