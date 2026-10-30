import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeAppleTokens } from "@/lib/apple-auth";

/**
 * 회원 탈퇴 — 계정과 기록을 **전부** 지운다 (2026-10-30 Alan "전부 지우기" · App Store 심사 5.1.1(v) — 앱에서 계정을 만들면 앱에서 지울 수도 있어야 한다).
 * 학생 · 회원 · 졸업생만 스스로 탈퇴한다 — 강사 · 관리자 · 조교 계정은 여기서 지우지 않는다(진짜 등급으로 본다).
 *
 * 무엇이 지워지나 (재생 DB 로 외래 키를 다 훑어 봤다 — `account-deletion.test.ts`):
 * - 계정(auth.users)을 지우면 프로필(profiles)과 학생 기록이 **모두 함께** 지워진다 (on delete cascade) —
 *   숙제 · 비대면 인증 · 출석 · 등업신청(수강증 판정 기록) · 등록 · 반 배정 · 스터디 · 특강 신청 · 교재주문 · 알림함 · 알림 기기 · 수강생 설문 · 계정 합치기 신청 · Apple 토큰
 * - 그렇지 않은 둘은 여기서 따로 지운다:
 *   ① 연락하기 문의(`contact_messages.user_id` 는 on delete set null — 이름 · 연락처 · 글이 남는다)
 *   ② **나에게 합쳐진 옛 계정**(`profiles.merged_into` 도 set null — 남겨 두면 그 옛 계정이 다시 로그인되는 계정이 된다). 그 계정의 파일 · 기록도 함께
 * - 저장소 파일은 지운 행을 따라 지워지지 않는다 — 학생 파일이 있는 버킷 넷(`USER_FILE_BUCKETS`)의 `{계정 id}/` 아래를 다 지운다
 *   (합쳐 온 숙제 · 인증 파일은 옛 계정 폴더에 그대로 있어서 옛 계정 폴더도 본다 — 도메인 규칙 3-1)
 * - Apple 로 로그인한 계정은 애플 연결도 끊는다 (애플 설정의 'Apple ID 를 사용하는 앱' 에서 빠진다)
 *
 * 순서가 중요하다 — **되돌릴 수 없는 것을 뒤로**: 계정 고르기 → 애플 끊기 → 파일 지우기(실패하면 멈춘다 — 계정이 남아 다시 해 볼 수 있다) →
 * 문의 지우기 → 옛 계정부터 계정 지우기. 계정을 지우는 중간에 멈추면 남은 계정으로 다시 하면 된다.
 */

/** 학생이 올린 파일이 있는 버킷 — 저장소 정책이 본인 폴더(`{계정 id}/…`)에만 올리게 한다 */
export const USER_FILE_BUCKETS = ["receipts", "homework", "study-checkins", "avatars"] as const;

/** 스스로 탈퇴할 수 없는 등급 — 강사 · 관리자 · 조교 (`profiles.role` 진짜 등급) */
export const NON_DELETABLE_ROLES: readonly string[] = ["admin", "instructor", "assistant"];

type Admin = SupabaseClient;

export type DeletionResult = { ok: true; accounts: number; files: number } | { ok: false; reason: "staff" | "merged" | "read" | "files" | "rows" | "account" };

/** 나 + 나에게 합쳐진 옛 계정(합치기가 이어졌으면 끝까지). 못 읽으면 null — 모른 채 지우지 않는다 */
export async function mergedChain(admin: Admin, userId: string): Promise<{ id: string; role: string; merged_into: string | null }[] | null> {
  const { data: me, error } = await admin.from("profiles").select("id, role, merged_into").eq("id", userId).maybeSingle();
  if (error || !me) return null;
  const chain = [me as { id: string; role: string; merged_into: string | null }];
  let frontier = [userId];
  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const { data, error: e } = await admin.from("profiles").select("id, role, merged_into").in("merged_into", frontier);
    if (e) return null;
    const fresh = ((data ?? []) as typeof chain).filter((p) => !chain.some((c) => c.id === p.id));
    chain.push(...fresh);
    frontier = fresh.map((p) => p.id);
  }
  return chain;
}

/** 버킷의 한 폴더 아래 파일 경로 전부 (하위 폴더까지). 못 읽으면 null */
export async function listFolderFiles(admin: Admin, bucket: string, folder: string, depth = 0): Promise<string[] | null> {
  if (depth > 4) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error) return null;
    const items = data ?? [];
    for (const item of items) {
      const path = `${folder}/${item.name}`;
      // 폴더는 id 가 없다 (Supabase 저장소의 list 가 하위 폴더를 이렇게 돌려준다)
      if (item.id === null || item.id === undefined) {
        const inner = await listFolderFiles(admin, bucket, path, depth + 1);
        if (inner === null) return null;
        out.push(...inner);
      } else out.push(path);
    }
    if (items.length < 1000) break;
  }
  return out;
}

/** 계정들의 저장소 파일을 모두 지운다 — 하나라도 못 읽거나 못 지우면 null (지운 개수를 모른 채 넘어가지 않는다) */
export async function removeUserFiles(admin: Admin, userIds: readonly string[]): Promise<number | null> {
  let removed = 0;
  for (const bucket of USER_FILE_BUCKETS) {
    for (const id of userIds) {
      const paths = await listFolderFiles(admin, bucket, id);
      if (paths === null) return null;
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) return null;
        removed += Math.min(100, paths.length - i);
      }
    }
  }
  return removed;
}

/**
 * 한 학생의 탈퇴. admin = 서비스 롤 (계정을 지우려면 필요하다 — **부르는 쪽이 로그인 서버에 물어 본인임을 확인한 뒤에만** 부른다).
 */
export async function deleteAccount(admin: Admin, userId: string): Promise<DeletionResult> {
  const chain = await mergedChain(admin, userId);
  if (!chain) return { ok: false, reason: "read" };
  if (chain[0].merged_into) return { ok: false, reason: "merged" };
  if (chain.some((p) => NON_DELETABLE_ROLES.includes(p.role))) return { ok: false, reason: "staff" };
  const ids = chain.map((p) => p.id);

  // 애플 연결 끊기 — 못 끊어도 탈퇴는 이어 간다 (애플 쪽은 사용자가 설정에서 지울 수 있다. 로그에 남긴다)
  const apple = await revokeAppleTokens(ids);
  if (apple.failed > 0) console.error("[account-deletion] 애플 연결을 다 끊지 못했어요", apple);

  const files = await removeUserFiles(admin, ids);
  if (files === null) return { ok: false, reason: "files" };

  const { error: contactError } = await admin.from("contact_messages").delete().in("user_id", ids);
  if (contactError) return { ok: false, reason: "rows" };

  // 옛 계정부터 — 나를 먼저 지우면 옛 계정의 merged_into 가 비어 그 사이 로그인되는 계정이 된다
  for (const id of [...ids.slice(1).reverse(), userId]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      console.error("[account-deletion] 계정을 지우지 못했어요", id, error.message);
      return { ok: false, reason: "account" };
    }
  }
  return { ok: true, accounts: ids.length, files };
}

export const DELETION_ERROR: Record<Exclude<DeletionResult, { ok: true }>["reason"], string> = {
  staff: "강사 · 관리자 · 조교 계정은 여기서 탈퇴할 수 없어요. 계정을 없애려면 관리자에게 말씀해 주세요.",
  merged: "이미 다른 계정으로 합쳐진 계정이에요. 남긴 계정으로 로그인해서 탈퇴해 주세요.",
  read: "계정 정보를 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
  files: "올린 파일을 다 지우지 못해 탈퇴를 멈췄어요. 계정은 그대로 있어요 — 잠시 후 다시 시도해 주세요.",
  rows: "기록을 다 지우지 못해 탈퇴를 멈췄어요. 계정은 그대로 있어요 — 잠시 후 다시 시도해 주세요.",
  account: "계정을 지우지 못했어요. 잠시 후 다시 시도해 주세요. 계속 안 되면 연락하기로 알려 주세요.",
};
