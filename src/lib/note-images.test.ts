import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeNoteImagesIfUnused } from "./note-images";

/**
 * 글에서 빠진 그림 지우기 (2026-10-22 오류 점검) — 같은 표의 다른 글이 아직 가리키는 그림은 남긴다.
 * 서버 액션에 본문을 직접 보내면 다른 글의 그림 경로를 적을 수 있어서, 그 글을 고치거나 지우면 남의 그림이 사라졌다.
 */
function fakeSupabase(refs: Record<string, number | "error">) {
  const likes: { table: string; column: string; pattern: string }[] = [];
  const removed: { bucket: string; paths: string[] }[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        like: async (column: string, pattern: string) => {
          likes.push({ table, column, pattern });
          const path = pattern.replace(/^%\[img=/, "").replace(/%$/, "");
          const n = refs[path] ?? 0;
          return n === "error" ? { count: null, error: { message: "boom" } } : { count: n, error: null };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { data: [], error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, likes, removed };
}

describe("removeNoteImagesIfUnused", () => {
  it("다른 글이 가리키는 그림 · 세지 못한 그림은 남기고 나머지만 지운다", async () => {
    const { client, likes, removed } = fakeSupabase({ "images/shared.png": 1, "images/unknown.png": "error" });
    await removeNoteImagesIfUnused(client, { bucket: "staff-board", table: "staff_posts" }, [
      "images/gone.png",
      "images/shared.png",
      "images/unknown.png",
      "images/gone.png",
    ]);
    expect(removed).toEqual([{ bucket: "staff-board", paths: ["images/gone.png"] }]);
    // 한 그림은 한 번만 센다 · 글 본문에서 그림 꼴로
    expect(likes).toEqual([
      { table: "staff_posts", column: "body", pattern: "%[img=images/gone.png%" },
      { table: "staff_posts", column: "body", pattern: "%[img=images/shared.png%" },
      { table: "staff_posts", column: "body", pattern: "%[img=images/unknown.png%" },
    ]);
  });

  it("그림 폴더 밖의 경로는 세지도 지우지도 않는다 (다른 폴더 파일을 글로 끌어와 지우지 못하게)", async () => {
    const { client, likes, removed } = fakeSupabase({});
    await removeNoteImagesIfUnused(client, { bucket: "class-notices", table: "class_notices" }, ["files/a.pdf", "images/../x.png", "images/a/b.png"]);
    expect(likes).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("모두 다른 글이 가리키면 저장소를 부르지 않는다", async () => {
    const { client, removed } = fakeSupabase({ "images/a.png": 2 });
    await removeNoteImagesIfUnused(client, { bucket: "class-notices", table: "class_notices" }, ["images/a.png"]);
    expect(removed).toEqual([]);
  });
});
