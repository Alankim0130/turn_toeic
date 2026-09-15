"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = new Set(["new", "read", "replied"]);

export async function updateContactStatus(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? "/admin/contacts");
  const returnTo = back.startsWith("/admin/contacts") ? back : "/admin/contacts";
  const sep = returnTo.includes("?") ? "&" : "?";

  if (!id || !STATUSES.has(status)) redirect(`${returnTo}${sep}error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
  if (error) {
    const { error: e2 } = await createAdminClient().from("contact_messages").update({ status }).eq("id", id);
    if (e2) redirect(`${returnTo}${sep}error=save`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/contacts");
  redirect(`${returnTo}${sep}ok=${id}`);
}
