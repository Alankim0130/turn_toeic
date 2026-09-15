"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyStaff } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export type TextbookState = { ok?: boolean; error?: string; values?: Record<string, string> };

export async function submitTextbookOrder(_prev: TextbookState, formData: FormData): Promise<TextbookState> {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const values = {
    section_id: v("section_id"),
    recipient_name: v("recipient_name"),
    phone: v("phone").replace(/[^\d]/g, ""),
    postal_code: v("postal_code").replace(/[^\d]/g, ""),
    address: v("address"),
    address_detail: v("address_detail"),
    quantity: v("quantity") || "1",
    memo: v("memo"),
  };

  const sectionId = Number(values.section_id);
  const quantity = Number(values.quantity);
  if (!Number.isInteger(sectionId) || sectionId <= 0) return { error: "신청할 반을 선택해 주세요.", values };
  if (values.recipient_name.length < 2) return { error: "받는 분 이름을 입력해 주세요.", values };
  if (!/^01\d{8,9}$/.test(values.phone)) return { error: "휴대폰 번호를 확인해 주세요.", values };
  if (values.address.length < 5) return { error: "배송 주소를 입력해 주세요.", values };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) return { error: "수량은 1~5권 사이로 선택해 주세요.", values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다.", values };

  // 같은 반에 아직 처리 중인 신청이 있으면 중복 방지
  const { count } = await supabase
    .from("textbook_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("section_id", sectionId)
    .in("status", ["requested", "confirmed"]);
  if ((count ?? 0) > 0) return { error: "이 반에는 이미 처리 중인 교재신청이 있어요.", values };

  const { error } = await supabase.from("textbook_orders").insert({
    user_id: user.id,
    section_id: sectionId,
    recipient_name: values.recipient_name,
    phone: values.phone,
    postal_code: values.postal_code || null,
    address: values.address,
    address_detail: values.address_detail || null,
    quantity,
    memo: values.memo || null,
    status: "requested",
  });

  if (error) {
    // RLS: 불라방 활성 등록이 없으면 insert 가 거부된다
    return { error: "신청할 수 없어요. 불라방으로 등록된 반만 교재를 신청할 수 있습니다.", values };
  }

  after(() =>
    notifyStaff("textbook_order", {
      title: "새 교재주문",
      body: `${values.recipient_name}님 · ${quantity}권 배송 신청`,
      url: "/admin/textbook-orders",
    }),
  );

  revalidatePath("/my/textbook");
  return { ok: true };
}

export async function cancelTextbookOrder(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const supabase = await createClient();
  await supabase.from("textbook_orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "requested");
  revalidatePath("/my/textbook");
}
