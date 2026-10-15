"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushToUser } from "@/lib/push";
import { deleteSubscription, ownsSubscription, saveSubscription, type SubscriptionInput } from "@/lib/push-subscription";

/**
 * 학생 휴대폰 알림 켜기 · 끄기 · 테스트 (2026-10-15 Alan — 숙제 미제출 · 불라방 시작을 푸시로).
 * 로그인한 사람의 **자기 기기만** 저장 · 지운다 (`push-subscription.ts` 가 관리자 알림과 같은 규칙으로).
 * 학생 계정이면 받는 알림은 학생 알림함의 두 종류뿐이다 — 이 기기를 켰다고 관리자 알림이 오지 않는다(`notifyStaff` 는 강사 · 관리자 계정만 고른다).
 * 강사 · 관리자가 학생 모드에서 켜면 그 계정의 기기라 관리자 알림도 온다 (관리자 알림 설정에서 켠 것과 같다).
 */

export type StudentPushResult = { ok: true; message?: string } | { ok: false; error: string };

async function sessionUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function saveStudentPushSubscription(input: SubscriptionInput): Promise<StudentPushResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "로그인이 필요해요." };
  const result = await saveSubscription(userId, input);
  if (!result.ok) return result;
  revalidatePath("/my/notifications");
  return { ok: true };
}

export async function deleteStudentPushSubscription(endpoint: string): Promise<StudentPushResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "로그인이 필요해요." };
  await deleteSubscription(userId, endpoint);
  revalidatePath("/my/notifications");
  return { ok: true };
}

/** 브라우저가 기억하는 이 기기의 구독이 지금 계정의 것인가 (같은 휴대폰을 다른 계정이 켰으면 아니다 — push-subscription.ts) */
export async function ownsStudentPushDevice(endpoint: string): Promise<boolean> {
  if (!(await sessionUserId())) return false;
  return ownsSubscription(endpoint);
}

export async function sendStudentTestPush(): Promise<StudentPushResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "로그인이 필요해요." };
  const result = await pushToUser(userId, {
    title: "역전토익 테스트 알림",
    body: "이 휴대폰에서 불라방 시작 · 숙제 미제출 알림을 받을 수 있어요.",
    url: "/my/notifications",
    tag: "student-test",
  });
  if (result.sent === 0) {
    return {
      ok: false,
      error: result.removed ? "만료된 기기라 지웠어요. '이 휴대폰에서 알림 받기' 를 다시 눌러 주세요." : "알림을 받을 기기가 없어요.",
    };
  }
  return { ok: true, message: "테스트 알림을 보냈어요. 휴대폰 알림을 확인해 보세요." };
}
