import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * service_role 클라이언트. RLS 를 우회하므로 서버 액션 안에서
 * 권한 검사를 마친 뒤에만 사용한다. 절대 클라이언트로 내보내지 말 것.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
