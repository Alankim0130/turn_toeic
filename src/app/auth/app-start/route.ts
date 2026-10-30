import { NextResponse, type NextRequest } from "next/server";
import { appLoginTarget } from "@/lib/app-login";

/**
 * 아이폰 앱의 카카오 · 구글 로그인 창이 처음 여는 주소 (2026-10-30 — `src/lib/app-login.ts`).
 * 하는 일은 Supabase 의 로그인 주소로 넘기는 것뿐이다 — 아이폰이 묻는 창에 Supabase 주소 대신 우리 주소가 뜨게.
 * 넘길 곳은 우리 Supabase 의 카카오 · 구글 로그인 주소만 (`appLoginTarget`).
 */
export function GET(request: NextRequest) {
  const target = appLoginTarget(request.nextUrl.searchParams.get("to"), process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!target) return new NextResponse("로그인 주소가 올바르지 않아요. 앱에서 다시 시도해 주세요.", { status: 400 });
  return NextResponse.redirect(target, 302);
}
