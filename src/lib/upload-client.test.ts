import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `uploadFile` — **저장소에 적히는 형식은 파일에 붙은 형식이다** (2026-10-07 숙제 음성 파일을 열며 확인).
 * storage-js 는 File 을 multipart 로 보내고 `contentType` 옵션을 쓰지 않아서, 브라우저가 형식을 비워 준 파일은
 * application/octet-stream 으로 올라가 형식을 제한한 버킷이 튕겼다. 정한 형식을 붙인 File 로 감싸 보내는지 본다.
 */
const sent: { bucket: string; path: string; body: Blob }[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Blob) => {
          sent.push({ bucket, path, body });
          return { error: null };
        },
      }),
    },
  }),
}));

const { uploadFile } = await import("./upload-client");

beforeEach(() => {
  sent.length = 0;
});

describe("uploadFile — 정한 형식을 파일에 붙여 보낸다", () => {
  it("브라우저가 형식을 비워 준 녹음 파일은 정한 형식(audio/…)을 붙인다 — 이름 · 내용은 그대로", async () => {
    const file = new File(["voice"], "새로운 녹음.m4a", { type: "" });
    const out = await uploadFile("homework", "u/650-lc/a.m4a", file, "audio/mp4");
    expect(sent[0].body.type).toBe("audio/mp4");
    expect((sent[0].body as File).name).toBe("새로운 녹음.m4a");
    expect(await sent[0].body.text()).toBe("voice");
    expect(out).toEqual({ path: "u/650-lc/a.m4a", name: "새로운 녹음.m4a", size: 5, type: "audio/mp4" });
  });

  it("형식이 이미 같으면 그 파일을 그대로 보낸다", async () => {
    const file = new File(["jpg"], "page.jpg", { type: "image/jpeg" });
    await uploadFile("homework", "u/650-rc/p.jpg", file);
    expect(sent[0].body).toBe(file);
  });

  it("형식을 안 주면 확장자로 채운 형식을 붙인다 (hwp 처럼 브라우저가 모르는 파일)", async () => {
    const file = new File(["x"], "자료.hwp", { type: "" });
    const out = await uploadFile("class-materials", "650-rc/x.hwp", file);
    expect(sent[0].body.type).toBe("application/x-hwp");
    expect(out.type).toBe("application/x-hwp");
  });
});
