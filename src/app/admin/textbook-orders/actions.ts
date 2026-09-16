"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = new Set(["requested", "confirmed", "shipped", "cancelled"]);

/** 교재주문 상태 변경 (확인 / 발송+송장 / 취소) */
export async function updateTextbookOrder(formData: FormData) {
  await requireCrew();
  const id = Number(formData.get("order_id"));
  const status = String(formData.get("status") ?? "");
  const trackingNo = String(formData.get("tracking_no") ?? "").trim() || null;
  const back = String(formData.get("back") ?? "/admin/textbook-orders");
  const returnTo = back.startsWith("/admin/textbook-orders") ? back : "/admin/textbook-orders";

  if (!id || !STATUSES.has(status)) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=invalid`);

  const patch = { status, tracking_no: status === "shipped" ? trackingNo : trackingNo, updated_at: new Date().toISOString() };

  // 스태프 RLS 로 먼저 시도, 막히면 service_role
  const supabase = await createClient();
  const { error } = await supabase.from("textbook_orders").update(patch).eq("id", id);
  if (error) {
    const admin = createAdminClient();
    const { error: e2 } = await admin.from("textbook_orders").update(patch).eq("id", id);
    if (e2) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=save`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/textbook-orders");
  revalidatePath("/my/textbook");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ok=${id}`);
}
