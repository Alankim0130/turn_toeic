import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/** 서버 컴포넌트 · 서버 액션 · 라우트 핸들러용 (사용자 세션 쿠키 기반, RLS 적용) */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 서버 컴포넌트에서 호출된 경우 쿠키를 쓸 수 없다. proxy 가 세션을 갱신하므로 무시해도 된다.
          }
        },
      },
    },
  );
}
