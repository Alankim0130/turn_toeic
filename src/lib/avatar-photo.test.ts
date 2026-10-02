import { describe, expect, it } from "vitest";
import { isOwnAvatarPath, pickPhoto, profilePhotoUrl, safePhotoUrl } from "./avatar";

/** 프로필 사진 (2026-10-02 Alan — 카카오 사진이 한 장도 안 보이던 것 · 학생이 올린 사진) */
describe("safePhotoUrl / profilePhotoUrl — 카카오의 http 주소", () => {
  it("카카오가 주는 http:// 주소는 https:// 로 바꿔 쓴다 (2026-10-02 까지는 떨어져서 사진이 안 보였다)", () => {
    expect(profilePhotoUrl({ avatar_url: "http://k.kakaocdn.net/dn/abc/img_640x640.jpg" })).toBe("https://k.kakaocdn.net/dn/abc/img_640x640.jpg");
    expect(safePhotoUrl("http://img1.kakaocdn.net/thumb/R640x640.q70/?fname=x")).toBe("https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=x");
  });

  it("https 는 그대로, 그 밖의 것은 받지 않는다", () => {
    expect(safePhotoUrl("https://lh3.googleusercontent.com/a")).toBe("https://lh3.googleusercontent.com/a");
    expect(safePhotoUrl("javascript:alert(1)")).toBe(null);
    expect(safePhotoUrl("data:image/png;base64,AAA")).toBe(null);
    expect(safePhotoUrl("")).toBe(null);
    expect(safePhotoUrl(null)).toBe(null);
  });
});

describe("pickPhoto — 올린 사진이 카카오·구글 사진보다 앞선다", () => {
  it("올린 사진 → 소셜 사진 → 없음", () => {
    expect(pickPhoto("https://signed/me.jpg", "https://k.kakaocdn.net/x")).toBe("https://signed/me.jpg");
    expect(pickPhoto(null, "https://k.kakaocdn.net/x")).toBe("https://k.kakaocdn.net/x");
    expect(pickPhoto(null, null)).toBe(null);
  });
});

describe("isOwnAvatarPath — 본인 폴더만", () => {
  const uid = "11111111-2222-3333-4444-555555555555";
  it("본인 폴더의 파일만 받는다", () => {
    expect(isOwnAvatarPath(`${uid}/1.jpg`, uid)).toBe(true);
    expect(isOwnAvatarPath(`${uid}/`, uid)).toBe(false);
    expect(isOwnAvatarPath(`other/1.jpg`, uid)).toBe(false);
    expect(isOwnAvatarPath(`${uid}/../x.jpg`, uid)).toBe(false);
    expect(isOwnAvatarPath(null, uid)).toBe(false);
  });
});
