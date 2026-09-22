/**
 * 유튜브 방송 → 불라방 회차 매칭 (2026-09-21 Alan — "두 강사가 각자 유튜브 채널에서 일부공개로 새 방송을 킬꺼야.
 * 해당시간 5~10분 전후로 방송이 올라오면 그 시간대에 불라방 링크가 들어가면 되고").
 *
 * 규칙 (순수 함수 — `live-detect.test.ts`):
 * - **방송이 시작한 시각** 이 수업 시작 ±`LIVE_MATCH_MINUTES` 분이면 그 회차다. 감지한 시각이 아니라 시작 시각으로 본다 —
 *   크론이 잠깐 늦게 돌아도 같은 답이 나오고, 앞 교시 방송을 켜 둔 채 다음 교시가 되어도 그 방송이 다음 교시로 가지 않는다.
 * - 채널 주인 = 그 반의 담당 강사. 같은 강사·같은 시각 회차가 둘이면(합반) 둘 다 같은 방송을 받는다.
 * - 한 방송은 한 시각에만 — 두 교시를 한 방송으로 이어 가면 뒤 교시는 채워지지 않는다 (강사가 교시마다 새 방송을 켠다).
 */

export const LIVE_MATCH_MINUTES = 10;

export type LiveCandidate = { session_date_id: number; section_id: number; instructor_id: string; starts_at: string; label: string };
export type Broadcast = { id: string; startedAt: string | null; lifeCycleStatus: string | null };

/** 유튜브 영상 id 모양 (11자가 보통이지만 넉넉히) — DB 함수도 같은 모양만 받는다 */
export const isVideoId = (id: string) => /^[A-Za-z0-9_-]{6,20}$/.test(id);
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** liveBroadcasts.list 의 item → 우리가 쓰는 모양. 모양이 이상한 것은 버린다 */
export function toBroadcasts(json: unknown): Broadcast[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((raw) => {
      const it = raw as { id?: unknown; snippet?: { actualStartTime?: unknown }; status?: { lifeCycleStatus?: unknown } };
      return {
        id: typeof it.id === "string" ? it.id : "",
        startedAt: typeof it.snippet?.actualStartTime === "string" ? it.snippet.actualStartTime : null,
        lifeCycleStatus: typeof it.status?.lifeCycleStatus === "string" ? it.status.lifeCycleStatus : null,
      };
    })
    .filter((b) => isVideoId(b.id));
}

/**
 * 한 강사의 방송들을 그 강사의 회차에 맞춘다. 돌려주는 것: 방송마다 넣을 회차 목록 (비어 있으면 넣을 곳이 없다).
 * `now` 는 방송 시작 시각이 비어 있을 때만 쓴다 (막 시작해 아직 안 찍힌 경우).
 */
export function matchBroadcasts(
  candidates: LiveCandidate[],
  broadcasts: Broadcast[],
  now: Date,
  minutes = LIVE_MATCH_MINUTES,
): { broadcast: Broadcast; sessions: LiveCandidate[] }[] {
  const live = broadcasts.filter((b) => b.lifeCycleStatus === "live");
  const used = new Set<number>();
  const out: { broadcast: Broadcast; sessions: LiveCandidate[] }[] = [];
  for (const b of live) {
    const started = b.startedAt ? new Date(b.startedAt).getTime() : now.getTime();
    if (Number.isNaN(started)) continue;
    const sessions = candidates.filter(
      (c) => !used.has(c.session_date_id) && Math.abs(new Date(c.starts_at).getTime() - started) <= minutes * 60_000,
    );
    // 창이 겹치면(드물다) 시작 시각이 가장 가까운 시각의 회차만 — 한 방송이 두 교시로 가지 않게
    if (sessions.length > 1) {
      const gap = (c: LiveCandidate) => Math.abs(new Date(c.starts_at).getTime() - started);
      const best = Math.min(...sessions.map(gap));
      const bestStart = sessions.find((c) => gap(c) === best)!.starts_at;
      sessions.splice(0, sessions.length, ...sessions.filter((c) => new Date(c.starts_at).getTime() === new Date(bestStart).getTime()));
    }
    for (const s of sessions) used.add(s.session_date_id);
    out.push({ broadcast: b, sessions });
  }
  return out;
}
