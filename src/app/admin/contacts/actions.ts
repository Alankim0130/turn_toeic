"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contactReplyError, contactReplyMessage } from "@/lib/contact-reply";

const STATUSES = new Set(["new", "read", "replied"]);

export async function updateContactStatus(formData: FormData) {
  await requireStaff();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? "/admin/contacts");
  const returnTo = back.startsWith("/admin/contacts") ? back : "/admin/contacts";
  const sep = returnTo.includes("?") ? "&" : "?";

  if (!id || !STATUSES.has(status)) redirect(`${returnTo}${sep}error=invalid`);

  // 로그인한 사람의 세션으로만 바꾼다 — RLS("contact: 스태프 처리")가 한 번 더 막는다. 막히면 서비스 롤로 다시 쓰지 않는다
  // (2026-10-09 보안 검토 — 그전에는 세션이 막히면 서비스 롤로 다시 써서, 테스트 등급을 켠 스태프처럼 RLS 가 막은 경우를 그대로 비껴갔다)
  const supabase = await createClient();
  const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
  if (error) redirect(`${returnTo}${sep}error=save`);

  revalidatePath("/admin");
  revalidatePath("/admin/contacts");
  redirect(`${returnTo}${sep}ok=${id}`);
}

/**
 * 문의에 답변 (2026-09-30 Alan — "강사가 직접 답변을 해주는 공간이 없어").
 * 답변을 저장하고 상태를 `답변 완료` 로 바꾼다. **회원 문의면 같은 글이 학생 알림함으로 간다** (`contact_reply`).
 * 비회원 문의는 전할 길이 없다 — 기록만 남기고, 화면이 남긴 연락처로 직접 답하라고 안내한다.
 * 알림을 못 보내도 답변 기록은 남긴다 (숙제 점검과 같은 규칙) — 화면이 "알림은 못 보냈어요" 라고 말한다.
 * 고쳐서 다시 보내면 알림이 한 번 더 간다 (이미 보낸 알림은 그대로 둔다 — 학생이 본 것을 없애지 않는다).
 */
export async function replyContact(formData: FormData) {
  const { user, profile } = await requireStaff();
  const id = Number(formData.get("id"));
  const reply = String(formData.get("reply") ?? "").trim();
  const back = String(formData.get("back") ?? "/admin/contacts");
  const returnTo = back.startsWith("/admin/contacts") ? back : "/admin/contacts";
  const sep = returnTo.includes("?") ? "&" : "?";

  if (!Number.isInteger(id) || id <= 0) redirect(`${returnTo}${sep}error=invalid`);
  if (contactReplyError(reply)) redirect(`${returnTo}${sep}error=reply&id=${id}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .update({ reply, replied_at: new Date().toISOString(), replied_by: user.id, status: "replied" })
    .eq("id", id)
    .select("id, user_id, message");
  if (error || !data?.length) redirect(`${returnTo}${sep}error=save`);

  const m = data[0];
  let sent = "none"; // 비회원 — 알림함이 없다
  if (m.user_id) {
    const msg = contactReplyMessage({ question: m.message, reply });
    const { error: sendError } = await supabase.from("student_messages").insert({
      user_id: m.user_id,
      sender_id: user.id,
      sender_name: profile.name,
      title: msg.title,
      body: msg.body,
      kind: "contact_reply",
      related: { contactId: m.id },
    });
    sent = sendError ? "failed" : "inbox";
  }

  revalidatePath("/admin");
  revalidatePath("/admin/contacts");
  redirect(`${returnTo}${sep}replied=${id}&sent=${sent}`);
}
