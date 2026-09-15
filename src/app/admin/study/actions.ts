"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = new Set(["pending", "contacted", "confirmed", "closed"]);

export async function updateStudyStatus(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? "/admin/study");
  const returnTo = back.startsWith("/admin/study") ? back : "/admin/study";
  const sep = returnTo.includes("?") ? "&" : "?";

  if (!id || !STATUSES.has(status)) redirect(`${returnTo}${sep}error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.from("study_applications").update({ status }).eq("id", id);
  if (error) {
    const { error: e2 } = await createAdminClient().from("study_applications").update({ status }).eq("id", id);
    if (e2) redirect(`${returnTo}${sep}error=save`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/study");
  redirect(`${returnTo}${sep}ok=${id}`);
}
