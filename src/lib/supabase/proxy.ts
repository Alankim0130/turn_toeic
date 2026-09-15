import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 요청마다 Supabase 세션 쿠키를 갱신하고, 로그인 필요 경로를 보호한다.
 * (역할 검사는 DB 조회가 필요하므로 각 레이아웃에서 수행)
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() 는 토큰을 서버에서 검증한다. 세션 갱신 목적이므로 반드시 호출.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const needsAuth = pathname.startsWith("/my") || pathname.startsWith("/admin");
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!user && needsAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/my";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // /admin 은 렌더링 전에 역할을 확인한다. (레이아웃의 redirect 는 페이지 세그먼트의
  // 병렬 렌더링을 막지 못하므로, 진짜 307 은 여기서 내려야 한다.)
  if (user && pathname.startsWith("/admin")) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = profile?.role as string | undefined;
    if (role !== "instructor" && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/my";
      url.search = "?denied=admin";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
