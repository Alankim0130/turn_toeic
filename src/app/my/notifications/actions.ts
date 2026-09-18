"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** 알림함을 열면 안 읽은 것을 전부 읽음으로. RLS 가 본인 행의 read_at 만 바꾸게 한다 */
export async function markMessagesRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("student_messages").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/my", "layout");
}
