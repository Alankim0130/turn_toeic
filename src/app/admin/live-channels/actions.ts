"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeToken } from "@/lib/youtube";

/** 내 유튜브 채널 연결 끊기 — 구글 쪽 권한도 거둔다. **본인 연결만** 끊는다 */
export async function disconnectYoutube() {
  const { user } = await requireStaff();
  const admin = createAdminClient();
  const { data: row } = await admin.from("youtube_channels").select("refresh_token").eq("user_id", user.id).maybeSingle();
  if (row?.refresh_token) await revokeToken(row.refresh_token);
  const { error } = await admin.from("youtube_channels").delete().eq("user_id", user.id);
  revalidatePath("/admin/live-channels");
  redirect(`/admin/live-channels?${error ? "error=save" : "ok=unlinked"}`);
}
