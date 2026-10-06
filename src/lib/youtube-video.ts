import { isYoutubeUrl } from "./live-links";

/**
 * 유튜브 영상 주소 읽기 (2026-10-06 — 수업자료실 링크. Alan "수업 자료실에 유튜브 링크를 한번씩 올릴 수도 있어").
 * 학생 화면이 영상을 그 자리에서 틀 수 있는지(영상 하나를 가리키는 주소인지)와 시작 위치만 본다.
 * 채널 · 재생목록 · 검색 주소는 영상이 아니다 → null (그런 링크는 새 창으로 연다).
 * 유튜브 주소인지는 `isYoutubeUrl`(live-links.ts — DB `private.is_youtube_url` 과 같은 규칙) 한곳이 정한다.
 * (강사 채널 연결 · 방송 조회는 `youtube.ts` — 서버 전용이라 화면에서 부르는 이 파일과 나눴다)
 */

/** 영상 id — 유튜브가 쓰는 11자. 이 꼴만 받아서 embed · 그림 주소에 그대로 넣어도 안전하다 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type YoutubeVideo = {
  id: string;
  /** 시작 위치(초) — 주소의 `t` · `start` (`?t=90` · `?t=1m30s`). 없으면 null */
  start: number | null;
};

export function youtubeVideo(url: string | null | undefined): YoutubeVideo | null {
  if (!url || !isYoutubeUrl(url)) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let id: string | null;
  if (u.hostname.toLowerCase() === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (u.pathname === "/watch") id = u.searchParams.get("v");
  else id = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1] ?? null;
  if (!id || !VIDEO_ID.test(id)) return null;
  return { id, start: startSeconds(u.searchParams.get("t") ?? u.searchParams.get("start")) };
}

/** `90` · `90s` · `1m30s` · `1h2m3s` → 초. 못 읽거나 0이면 null (처음부터) */
export function startSeconds(t: string | null | undefined): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) > 0 ? Number(t) : null;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return null;
  const s = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return s > 0 ? s : null;
}

/**
 * 그 자리에서 트는 주소 — `youtube-nocookie.com` (랜딩 소개 영상 · 다시보기와 같다). 누른 뒤에만 그리므로 autoplay 로 바로 튼다.
 * `playsinline` — 아이폰이 누르자마자 전체 화면으로 튀어 나가지 않게
 */
export function youtubeEmbedSrc(v: YoutubeVideo): string {
  return `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1${v.start ? `&start=${v.start}` : ""}`;
}

/** 작은 미리보기 그림 (320×180, 16:9 — 모든 영상에 있다). 영상이 지워졌으면 404 라 화면이 그림을 치운다 */
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
