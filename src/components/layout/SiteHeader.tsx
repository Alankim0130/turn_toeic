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

        {/* 데스크톱 네비 — 메뉴가 많아 넓은 화면(xl)에서만 한 줄로, 그보다 좁으면 햄버거 메뉴 */}
        <nav aria-label="주요 메뉴" className="hidden xl:block">
          <NavLinks items={NAV_MAIN} />
        </nav>

        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          {staff && (
            <Link href="/admin" className="btn-primary whitespace-nowrap !px-4 !py-2">
              <Icon name="admin" size={18} className="brightness-0 invert" />
              관리자
            </Link>
          )}
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
