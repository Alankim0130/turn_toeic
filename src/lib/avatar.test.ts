import { describe, expect, it } from "vitest";
import { profilePhotoUrl } from "./avatar";

describe("profilePhotoUrl", () => {
  it("카카오·구글이 넣어 주는 avatar_url 을 먼저 쓴다", () => {
    expect(profilePhotoUrl({ avatar_url: "https://k.kakaocdn.net/a.jpg", picture: "https://lh3.google.com/b.jpg" })).toBe(
      "https://k.kakaocdn.net/a.jpg",
    );
  });

  it("avatar_url 이 없으면 구글 picture · 카카오 profile_image_url 순으로 본다", () => {
    expect(profilePhotoUrl({ picture: "https://lh3.google.com/b.jpg" })).toBe("https://lh3.google.com/b.jpg");
    expect(profilePhotoUrl({ profile_image_url: "https://k.kakaocdn.net/c.jpg" })).toBe("https://k.kakaocdn.net/c.jpg");
  });

  it("앞뒤 공백은 떼고 본다", () => {
    expect(profilePhotoUrl({ avatar_url: "  https://k.kakaocdn.net/a.jpg  " })).toBe("https://k.kakaocdn.net/a.jpg");
  });

  /** user_metadata 는 본인이 바꿀 수 있는 칸이라 아무 문자열이나 들어올 수 있다 */
  it("https 가 아니면 쓰지 않는다", () => {
    expect(profilePhotoUrl({ avatar_url: "javascript:alert(1)" })).toBeNull();
    expect(profilePhotoUrl({ avatar_url: "data:image/png;base64,AAAA" })).toBeNull();
    expect(profilePhotoUrl({ avatar_url: "http://k.kakaocdn.net/a.jpg" })).toBeNull();
    expect(profilePhotoUrl({ avatar_url: "//k.kakaocdn.net/a.jpg" })).toBeNull();
    expect(profilePhotoUrl({ avatar_url: "https://" })).toBeNull();
    expect(profilePhotoUrl({ avatar_url: "" })).toBeNull();
  });

  it("값이 없거나 문자열이 아니면 null", () => {
    expect(profilePhotoUrl(null)).toBeNull();
    expect(profilePhotoUrl(undefined)).toBeNull();
    expect(profilePhotoUrl({})).toBeNull();
    expect(profilePhotoUrl({ avatar_url: 42 })).toBeNull();
  });

  /** 이메일 가입자는 사진이 없다 — 이름 첫 글자 동그라미로 돌아간다 */
  it("이메일 가입 계정은 사진이 없다", () => {
    expect(profilePhotoUrl({ name: "김민수", phone: "01012345678" })).toBeNull();
  });
});
