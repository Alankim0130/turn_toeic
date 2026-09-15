import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 정적 파일·이미지·아이콘·public 자산은 제외
    "/((?!_next/static|_next/image|api/|sw.js|favicon.ico|icon.png|apple-icon.png|og.png|brand/|icons/|illustrations/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
