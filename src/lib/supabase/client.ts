"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** 브라우저(클라이언트 컴포넌트)용. 파일 업로드 등 직접 호출에 사용 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
