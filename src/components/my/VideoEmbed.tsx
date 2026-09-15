import { Icon } from "@/components/ui/Icon";

/** 유튜브/비메오 링크는 임베드, 그 외는 새 창 링크 */
export function toEmbed(url: string): { kind: "youtube" | "vimeo"; src: string } | { kind: "link" } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };
    }
    if (host === "youtube.com") {
      if (u.pathname === "/watch" && u.searchParams.get("v")) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}` };
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
      if (m) return { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = u.pathname.match(/(\d+)/);
      if (m) return { kind: "vimeo", src: `https://player.vimeo.com/video/${m[1]}` };
    }
  } catch {
    // 잘못된 URL 은 링크로 처리
  }
  return { kind: "link" };
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const e = toEmbed(url);
  if (e.kind === "link") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary">
        <Icon name="replay" size={20} className="brightness-0 invert" />
        영상 열기
      </a>
    );
  }
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-ink" style={{ aspectRatio: "16 / 9" }}>
      <iframe
        src={e.src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
