"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toBroadcasts } from "@/lib/live-detect";
import { activeBroadcasts, channelAccessToken, revokeToken, youtubeConfigured, type ChannelRow } from "@/lib/youtube";

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

export type BroadcastCheckState = {
  checkedAt?: string;
  error?: string;
  /** 지금 내 채널에서 진행 중인 방송 — 제목 · 시작 시각 · 공개 범위 (영상 주소는 담지 않는다) */
  broadcasts?: { title: string; startedAt: string | null; privacy: string | null; live: boolean }[];
};

/**
 * "지금 내 방송 확인" (2026-10-01 Alan — "쌤들이 본인 노트북으로 본인 유튜브에 로그인해서 테스트를 진행해볼 수 있지 않을까").
 * 수업 시간이 아니어도 Zoom → 유튜브 송출이 내 채널에 잡히는지 그 자리에서 본다 — 크론과 **같은 조회**(`activeBroadcasts`)라
 * 여기서 보이면 수업 시간에도 잡힌다. **본인 채널만** 본다.
 */
// useActionState 가 (이전 상태, FormData) 를 넘기지만 둘 다 쓰지 않는다 — 본인 세션만 보면 된다
export async function checkMyBroadcasts(): Promise<BroadcastCheckState> {
  const { user } = await requireStaff();
  if (!youtubeConfigured()) return { error: "아직 구글 설정이 안 끝나 확인할 수 없어요." };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("youtube_channels")
    .select("user_id, channel_title, refresh_token, access_token, access_token_expires_at, last_error")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return { error: "아직 유튜브 채널을 연결하지 않았어요. 위의 연결 버튼부터 눌러 주세요." };

  const ch = row as ChannelRow;
  let token = await channelAccessToken(ch);
  if (!token) return { error: ch.last_error ?? "구글에서 권한을 받지 못했어요. 다시 연결해 주세요." };
  let res = await activeBroadcasts(token);
  if (res.status === 401 || res.status === 403) {
    token = await channelAccessToken(ch, true);
    if (!token) return { error: ch.last_error ?? "구글에서 권한을 받지 못했어요. 다시 연결해 주세요." };
    res = await activeBroadcasts(token);
  }
  if (res.status !== 200) return { error: `유튜브 조회에 실패했어요 (HTTP ${res.status}). 잠시 뒤 다시 눌러 주세요.` };

  const now = new Date().toISOString();
  await admin.from("youtube_channels").update({ last_checked_at: now, last_error: null, last_error_at: null }).eq("user_id", user.id);
  revalidatePath("/admin/live-channels");
  return {
    checkedAt: now,
    broadcasts: toBroadcasts(res.json).map((b) => ({ title: b.title, startedAt: b.startedAt, privacy: b.privacy, live: b.lifeCycleStatus === "live" })),
  };
}
