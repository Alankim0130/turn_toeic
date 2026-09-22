import { NextResponse, type NextRequest } from "next/server";
import { authorizedAppCall } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/push";
import { matchBroadcasts, toBroadcasts, watchUrl, type LiveCandidate } from "@/lib/live-detect";
import { activeBroadcasts, channelAccessToken, youtubeConfigured, type ChannelRow } from "@/lib/youtube";

/**
 * 유튜브 불라방 감지 (2026-09-21). DB 크론 `live-detect` 가 **감지할 회차가 있을 때만** 30초마다 부른다
 * (`private.live_detect_due` → `private.call_app`, 마이그레이션 20260921120500).
 *
 * 1. 지금 감지할 회차 (오늘 · 시간 단위 반 · 인강 아님 · 담당 강사가 채널 연결 · 링크 없음 · 수업 시작 −10분 ~ +30분)
 * 2. 담당 강사마다 그 채널의 진행 중 방송을 조회 (강사 토큰 — 일부공개도 보인다)
 * 3. 방송 **시작 시각** 이 수업 시작 ±10분이면 그 회차에 링크를 넣는다 (`register_detected_live`, 손으로 넣은 링크는 건드리지 않는다)
 *    → DB 트리거가 그 순간 불라방 학생 알림을 넣는다. 오전반은 수업이 끝나면 같은 주소가 다시보기가 된다 (promote_live_replays).
 * 4. 넣었으면 그 강사에게 확인 푸시 (알림 설정의 "내 불라방 자동 연결").
 *
 * **응답에 영상 id·주소를 담지 않는다** — 일부공개 영상은 주소가 곧 시청권이다 (첫토익 D5).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await authorizedAppCall(req))) return NextResponse.json({ ok: false }, { status: 401 });
  if (!youtubeConfigured()) return NextResponse.json({ ok: true, skipped: "not configured" });

  const admin = createAdminClient();
  const { data: rows, error } = await admin.rpc("live_detect_candidates");
  if (error) {
    console.error("[live-detect] candidates", error.message);
    return NextResponse.json({ ok: false, error: "candidates" }, { status: 500 });
  }
  const candidates = (rows ?? []) as LiveCandidate[];
  if (candidates.length === 0) return NextResponse.json({ ok: true, candidates: 0 });

  const byInstructor = new Map<string, LiveCandidate[]>();
  for (const c of candidates) byInstructor.set(c.instructor_id, [...(byInstructor.get(c.instructor_id) ?? []), c]);

  const { data: channels } = await admin
    .from("youtube_channels")
    .select("user_id, channel_title, refresh_token, access_token, access_token_expires_at, last_error")
    .in("user_id", [...byInstructor.keys()]);

  let registered = 0;
  for (const ch of (channels ?? []) as ChannelRow[]) {
    const now = new Date();
    let token = await channelAccessToken(ch);
    if (!token) continue; // 연결이 끊겼다 — 오류를 남기고 강사에게 한 번 알렸다
    let res = await activeBroadcasts(token);
    if (res.status === 401 || res.status === 403) {
      token = await channelAccessToken(ch, true);
      if (!token) continue;
      res = await activeBroadcasts(token);
    }
    if (res.status !== 200) {
      const reason = `유튜브 조회 실패 (HTTP ${res.status})`;
      console.error("[live-detect]", ch.user_id, reason);
      await admin.from("youtube_channels").update({ last_checked_at: now.toISOString(), last_error: reason, last_error_at: now.toISOString() }).eq("user_id", ch.user_id);
      continue;
    }

    let found = false;
    for (const m of matchBroadcasts(byInstructor.get(ch.user_id) ?? [], toBroadcasts(res.json), now)) {
      if (m.sessions.length === 0) continue;
      const { data: ids, error: regError } = await admin.rpc("register_detected_live", {
        p_session_date_ids: m.sessions.map((s) => s.session_date_id),
        p_url: watchUrl(m.broadcast.id),
      });
      if (regError) {
        console.error("[live-detect] register", regError.message);
        continue;
      }
      const inserted = new Set((ids ?? []) as number[]);
      if (inserted.size === 0) continue; // 그 사이 강사가 손으로 넣었다 — 알리지 않는다
      found = true;
      registered += inserted.size;
      const labels = m.sessions.filter((s) => inserted.has(s.session_date_id)).map((s) => s.label);
      await notifyUser(ch.user_id, "live_detected", {
        title: "불라방 링크가 자동으로 들어갔어요",
        body: `${labels.join(" · ")} — 불라방 학생에게 시작 알림이 갔어요.`,
        url: `/admin/sections/${m.sessions[0].section_id}`,
        tag: `live-detected-${m.sessions[0].session_date_id}`,
      });
    }

    await admin
      .from("youtube_channels")
      .update({ last_checked_at: now.toISOString(), last_error: null, last_error_at: null, ...(found ? { last_live_at: now.toISOString() } : {}) })
      .eq("user_id", ch.user_id);
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, registered });
}
