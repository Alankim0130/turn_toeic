import { describe, expect, it } from "vitest";
import { startSeconds, youtubeEmbedSrc, youtubeThumb, youtubeVideo } from "./youtube-video";

/** 수업자료실 링크 — 유튜브 영상이면 학생 화면이 그 자리에서 튼다 (2026-10-06 Alan "유튜브 링크를 한번씩 올릴 수도 있어") */
describe("youtubeVideo — 영상 하나를 가리키는 주소만", () => {
  const id = "dQw4w9WgXcQ";

  it("공유 · 시청 · 쇼츠 · 라이브 · 임베드 · 모바일 주소", () => {
    for (const url of [
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=Abc123`,
      `https://www.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/watch?v=${id}&list=PL123&index=2`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}?feature=share`,
      `https://www.youtube.com/embed/${id}`,
      `http://youtube.com/watch?v=${id}`,
    ]) {
      expect(youtubeVideo(url), url).toEqual({ id, start: null });
    }
  });

  it("시작 위치 — t · start (초 · 1m30s)", () => {
    expect(youtubeVideo(`https://youtu.be/${id}?t=90`)).toEqual({ id, start: 90 });
    expect(youtubeVideo(`https://www.youtube.com/watch?v=${id}&t=1m30s`)).toEqual({ id, start: 90 });
    expect(youtubeVideo(`https://www.youtube.com/embed/${id}?start=75`)).toEqual({ id, start: 75 });
    expect(startSeconds("1h2m3s")).toBe(3723);
    expect(startSeconds("45s")).toBe(45);
    expect(startSeconds("0")).toBeNull();
    expect(startSeconds("abc")).toBeNull();
    expect(startSeconds("")).toBeNull();
  });

  it("영상이 아닌 주소 · 다른 사이트 · 이상한 id 는 null (새 창으로 연다)", () => {
    for (const url of [
      "https://www.youtube.com/@winnertoeic",
      "https://www.youtube.com/playlist?list=PL123",
      "https://www.youtube.com/results?search_query=toeic",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload",
      "https://youtu.be/",
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://vimeo.com/123456",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(youtubeVideo(url), String(url)).toBeNull();
    }
  });

  it("그 자리에서 트는 주소는 youtube-nocookie · 그림은 i.ytimg.com", () => {
    expect(youtubeEmbedSrc({ id, start: null })).toBe(`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`);
    expect(youtubeEmbedSrc({ id, start: 90 })).toBe(`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&start=90`);
    expect(youtubeThumb(id)).toBe(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
  });
});
