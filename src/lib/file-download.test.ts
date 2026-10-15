import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rosterDisposition, rosterFileName } from "./class-roster";
import { posterDisposition, posterFileName } from "./attendance-poster";
import { DOWNLOAD_TEXT, downloadText, FILE_KINDS, MESSAGE_MAX, fileNameFromDisposition, messageText, prefersShareSheet, responseKind, shareFailure } from "./file-download";

/**
 * 아이폰에서 PDF 받기 (2026-10-14 Alan — 반별 명단 `PDF 받기` 를 누르고 "모바일에서 보는거는되는데 실제로 다운을 안 받아져").
 * 아이폰 · 아이패드는 attachment 를 무시하고 PDF 를 화면에 띄우기만 한다 — 공유 시트(파일에 저장 · 프린트)로 받는다.
 * 2026-10-15 학생명단 Word 받기도 같은 버튼(`FileDownloadButton`, 전 이름 `PdfDownloadButton`)이다.
 * 되돌려도 PC 에서는 멀쩡해서 늦게 발견된다 — 규칙과 버튼 · 쓰는 곳을 못박는다.
 */

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  // 홈 화면 앱(standalone)은 Safari · Version 이 빠진다
  iphoneHomeScreen: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1",
  iphoneKakao: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.8.0",
  // 아이패드OS 사파리는 맥인 척한다
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

describe("공유 시트로 받는 기기 (prefersShareSheet)", () => {
  it("아이폰 — 사파리 · 홈 화면 앱 · 크롬 · 카카오톡 모두", () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneHomeScreen, UA.iphoneChrome, UA.iphoneKakao]) {
      expect(prefersShareSheet({ userAgent: ua, platform: "iPhone", maxTouchPoints: 5 }), ua).toBe(true);
    }
  });

  it("아이패드 — 맥인 척해도 터치로 가른다", () => {
    expect(prefersShareSheet({ userAgent: UA.ipadDesktop, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
  });

  it("맥 · 안드로이드 · 윈도는 아니다 — 링크가 그대로 받는다", () => {
    expect(prefersShareSheet({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(prefersShareSheet({ userAgent: UA.android, platform: "Linux armv81", maxTouchPoints: 5 })).toBe(false);
    expect(prefersShareSheet({ userAgent: UA.samsung, platform: "Linux armv81", maxTouchPoints: 5 })).toBe(false);
    expect(prefersShareSheet({ userAgent: UA.windows, platform: "Win32", maxTouchPoints: 0 })).toBe(false);
    expect(prefersShareSheet({ userAgent: UA.mac })).toBe(false);
  });
});

describe("저장 이름 (fileNameFromDisposition)", () => {
  it("우리 라우트의 머리에서 한글 이름을 그대로 읽는다 — 반별 명단(PDF · Word) · 출석 포스터", () => {
    expect(fileNameFromDisposition(rosterDisposition({ year: 2026, month: 10 }), "x.pdf")).toBe(rosterFileName({ year: 2026, month: 10 }));
    expect(fileNameFromDisposition(rosterDisposition({ year: 2026, month: 10 }), "x.pdf")).toBe("역전토익_반별명단_2026-10.pdf");
    expect(fileNameFromDisposition(rosterDisposition({ year: 2026, month: 10 }, "track", "docx"), "x.docx", "docx")).toBe("역전토익_레벨별명단_2026-10.docx");
    const iso = "2026-10-14T12:05:00.000Z";
    expect(fileNameFromDisposition(posterDisposition(iso), "x.pdf")).toBe(posterFileName(iso));
    expect(fileNameFromDisposition(posterDisposition(null), "x.pdf")).toBe("역전토익_출석QR포스터.pdf");
  });

  it("filename* 가 없으면 filename (따옴표 · 따옴표 없음 · 이스케이프)", () => {
    expect(fileNameFromDisposition('attachment; filename="roster.pdf"', "x.pdf")).toBe("roster.pdf");
    expect(fileNameFromDisposition("attachment; filename=plain.pdf", "x.pdf")).toBe("plain.pdf");
    expect(fileNameFromDisposition('attachment; filename="a \\"b\\".pdf"', "x.pdf")).toBe("a b.pdf");
  });

  it("언어 표시 · 소문자 utf-8 도 읽는다", () => {
    expect(fileNameFromDisposition("attachment; filename*=utf-8'ko'%ED%95%9C.pdf", "x.pdf")).toBe("한.pdf");
  });

  it("%가 깨진 filename* 는 filename 으로, 둘 다 없으면 fallback 으로", () => {
    expect(fileNameFromDisposition("attachment; filename=\"ok.pdf\"; filename*=UTF-8''%E0%A4%A.pdf", "x.pdf")).toBe("ok.pdf");
    expect(fileNameFromDisposition("attachment", "명단.pdf")).toBe("명단.pdf");
    expect(fileNameFromDisposition(null, "명단.pdf")).toBe("명단.pdf");
    expect(fileNameFromDisposition(undefined, "")).toBe("download.pdf");
    expect(fileNameFromDisposition(undefined, "", "docx")).toBe("download.docx");
  });

  it("경로 · 못 쓰는 글자 · 제어 문자는 지운다 (저장 창이 폴더를 만들거나 깨진 이름으로 저장하지 않게)", () => {
    const name = fileNameFromDisposition("attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpa%3Cs%3Esw%0A%00d.pdf", "x.pdf");
    expect(name).not.toMatch(/[/\\<>:*?"|\u0000-\u001f]/);
    expect(name).toBe("....etcpasswd.pdf");
  });
});

describe("받은 응답 다루기 (responseKind · messageText)", () => {
  it("바라던 파일이면 저장 창 — PDF 버튼은 PDF, Word 버튼은 Word 만", () => {
    expect(responseKind({ ok: true, contentType: "application/pdf" })).toBe("file");
    expect(responseKind({ ok: true, contentType: "application/pdf", redirected: false })).toBe("file");
    expect(responseKind({ ok: true, contentType: FILE_KINDS.docx.mime }, "docx")).toBe("file");
    expect(responseKind({ ok: true, contentType: "application/pdf" }, "docx")).toBe("error");
    expect(responseKind({ ok: true, contentType: FILE_KINDS.docx.mime }, "pdf")).toBe("error");
  });

  it("우리 라우트의 글 오류(400 · 404 · 503 text/plain)는 그 글을 보여 준다", () => {
    for (const status of [400, 404, 503]) {
      expect(responseKind({ ok: status < 400, contentType: "text/plain; charset=utf-8" }), String(status)).toBe("message");
    }
  });

  it("로그인 화면 · 권한 없음으로 튕기면(redirect 뒤 HTML) 지금 화면을 다시 연다", () => {
    expect(responseKind({ ok: true, contentType: "text/html; charset=utf-8", redirected: true })).toBe("reload");
  });

  it("그 밖(서버 오류 화면 · 모르는 형식)은 일반 안내", () => {
    expect(responseKind({ ok: false, contentType: "text/html; charset=utf-8" })).toBe("error");
    expect(responseKind({ ok: true, contentType: "text/html" })).toBe("error");
    expect(responseKind({ ok: false, contentType: "application/pdf" })).toBe("error");
    expect(responseKind({ ok: true, contentType: null })).toBe("error");
  });

  it("버튼 글 — PDF 와 Word 는 이름만 다르다 (PDF 글은 예전 그대로)", () => {
    expect(DOWNLOAD_TEXT).toEqual(downloadText("pdf"));
    expect(DOWNLOAD_TEXT.loading).toBe("PDF 만드는 중…");
    expect(DOWNLOAD_TEXT.failed).toBe("PDF 를 받지 못했어요. 잠시 뒤 다시 받아 주세요.");
    expect(downloadText("docx").loading).toBe("Word 만드는 중…");
    expect(downloadText("docx").ready).toContain("Word 앱");
    expect(downloadText("docx").again).toBe(DOWNLOAD_TEXT.again);
  });

  it("글 오류는 줄여 보여 주고, 비었으면 일반 안내", () => {
    expect(messageText("  포스터 QR 을\n받지 못했어요.  ")).toBe("포스터 QR 을 받지 못했어요.");
    expect(messageText("")).toBe(DOWNLOAD_TEXT.failed);
    const long = messageText("가".repeat(500));
    expect(long.length).toBe(MESSAGE_MAX + 1);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("저장 창이 던진 것 (shareFailure)", () => {
  it("닫음 · 누른 지 오래됨 · 이미 열림 · 그 밖", () => {
    expect(shareFailure(new DOMException("closed", "AbortError"))).toBe("cancelled");
    expect(shareFailure(new DOMException("not allowed", "NotAllowedError"))).toBe("needs-tap");
    expect(shareFailure(new DOMException("busy", "InvalidStateError"))).toBe("busy");
    expect(shareFailure(new TypeError("files"))).toBe("failed");
    expect(shareFailure({ name: "DataError" })).toBe("failed");
    expect(shareFailure("x")).toBe("failed");
    expect(shareFailure(null)).toBe("failed");
  });
});

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
/** 주석을 뺀 코드 */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("파일 받기 버튼 (src/components/admin/FileDownloadButton.tsx)", () => {
  const src = code("src/components/admin/FileDownloadButton.tsx");

  it("아이폰 · 아이패드가 아니면 링크를 막지 않는다 — 판정이 preventDefault 보다 먼저", () => {
    expect(src).toMatch(/if \(!shareSheetReady\(kind\)\) return;[^\n]*\n\s*e\.preventDefault\(\);/);
    expect(src).toMatch(/prefersShareSheet\(\{ userAgent: navigator\.userAgent, platform: navigator\.platform, maxTouchPoints: navigator\.maxTouchPoints \}\)/);
    expect(src).toMatch(/navigator\.canShare\(\{ files: \[new File\(/);
  });

  it("저장 창에는 파일만 넘긴다 (제목 · 글을 같이 넘기면 아이폰이 글 파일을 만들기도 한다)", () => {
    expect(src).toMatch(/navigator\.share\(\{ files: \[file\] \}\)/);
    expect(src).not.toMatch(/navigator\.share\(\{[^}]*\b(title|text|url):/);
  });

  it("누른 순간이 지나 막히면 만든 PDF 를 들고 한 번 더 누르게 한다", () => {
    expect(src).toMatch(/failure === "needs-tap"\) setPhase\(first \? \{ kind: "ready", file/);
    expect(src).toMatch(/else void openSheet\(phase\.file, false\);/);
  });

  it("링크에 download 속성을 두지 않는다 — 로그인 화면 · 글 오류를 파일로 받아 버린다", () => {
    const anchors = src.match(/<a\b[^>]*>/g) ?? [];
    expect(anchors.length).toBe(1);
    expect(anchors[0]).not.toMatch(/\bdownload\b/);
  });
});

describe("PDF · Word 를 받는 곳은 FileDownloadButton 으로", () => {
  it("반별 명단(PDF · Word) · 출석 포스터", () => {
    const roster = code("src/components/admin/students/ClassRosterView.tsx");
    expect(roster).toMatch(/<FileDownloadButton href=\{pdfHref\} fileName=\{pdfName\}/);
    expect(roster).toMatch(/<FileDownloadButton\s+href=\{docxHref\}\s+fileName=\{docxName\}\s+kind="docx"/);
    expect(code("src/app/admin/attendance/poster/page.tsx")).toMatch(/<FileDownloadButton href="\/admin\/attendance\/poster\/download" fileName=\{posterFileName\(createdAt\)\}/);
    // 옛 이름이 남지 않는다
    expect(fs.existsSync(path.join(process.cwd(), "src/components/admin/PdfDownloadButton.tsx"))).toBe(false);
  });

  it("파일 라우트로 가는 맨 링크(a · Link)가 없다 — 아이폰에서 다시 '보기만 되고 저장이 안 되는' 버튼이 된다", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".tsx")) files.push(p);
      }
    };
    walk(path.join(process.cwd(), "src"));
    const bad: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const tag of src.match(/<(?:a|Link)\b[^>]*>/g) ?? []) {
        if (/roster-pdf|roster-docx|poster\/download/.test(tag)) bad.push(`${path.relative(process.cwd(), f)}: ${tag.replace(/\s+/g, " ")}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
