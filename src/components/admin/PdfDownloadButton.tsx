"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { DOWNLOAD_TEXT, fileNameFromDisposition, messageText, prefersShareSheet, responseKind, shareFailure } from "@/lib/file-download";
import { cn } from "@/lib/utils";

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; file: File; at: number } | { kind: "error"; text: string };

/** 만든 PDF 를 들고 있는 시간 — 그보다 지나 누르면 지금 명단으로 새로 만든다 (그 사이 반 배정이 바뀌었을 수 있다) */
const READY_FOR_MS = 2 * 60 * 1000;

/**
 * 아이폰 · 아이패드이고 이 브라우저가 PDF 파일을 공유 시트로 넘길 수 있나 — 누른 순간에 본다 (서버는 기기를 모른다).
 * 아이폰 iOS 15 아래처럼 파일을 못 넘기면 거짓 → 예전처럼 링크 그대로.
 */
function shareSheetReady(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  if (!prefersShareSheet({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints })) return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array([37])], "check.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

/**
 * 화면에서 만든 PDF 를 받는 버튼 (2026-10-14 Alan — 아이폰에서 반별 명단 `PDF 받기` 를 누르니 "보는거는되는데 실제로 다운을 안 받아져").
 * - **PC · 안드로이드**: 평범한 링크다. 라우트가 `attachment` 로 주므로 그대로 받아진다 (이 버튼은 아무것도 하지 않는다).
 * - **아이폰 · 아이패드**: 아이폰은 attachment 를 무시하고 PDF 를 화면에 띄우기만 한다 — 홈 화면 앱은 띄운 PDF 에서 저장할 길도 돌아갈 길도 없다.
 *   그래서 누르면 PDF 를 받아 **공유 시트**(파일에 저장 · 프린트 · 카카오톡)를 연다. PDF 를 만드는 동안 '누른 순간' 이 지나가면
 *   브라우저가 시트를 막으므로(NotAllowedError) 만든 PDF 를 들고 `저장 · 인쇄 창 열기` 로 바꿔 **한 번 더 누르게** 한다.
 * - 글 오류(400 · 404 · 503)는 버튼 아래에 그 글을, 로그인 · 권한으로 튕겼으면 지금 화면을 다시 연다 (그쪽으로 간다).
 * 규칙은 `src/lib/file-download.ts` (`file-download.test.ts`). 서버가 그리는 첫 모양은 늘 링크라 기기 판정이 하이드레이션을 어긋내지 않는다.
 */
export function PdfDownloadButton({
  href,
  fileName,
  className,
  title,
  align = "start",
  children,
}: {
  /** PDF 라우트 (attachment 로 준다) */
  href: string;
  /** 응답 머리에서 이름을 못 읽을 때의 저장 이름 */
  fileName: string;
  className: string;
  title?: string;
  /** 안내 글을 버튼 아래 어느 쪽에 붙일지 — 오른쪽 끝 버튼이면 end */
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const working = useRef(false);
  // 만드는 동안 다른 화면으로 가면 그 화면에서 저장 창이 불쑥 뜨지 않게
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** 공유 시트 — 동기적으로 부른다 (await 앞이라 '누른 순간' 안이다). first = PDF 를 막 받아 이어서 연 것 */
  async function openSheet(file: File, first: boolean) {
    try {
      // 제목 · 글을 함께 넘기면 아이폰이 '파일에 저장' 에 글 파일을 만들기도 해서 파일만 넘긴다
      await navigator.share({ files: [file] });
      setPhase({ kind: "idle" });
    } catch (error) {
      const failure = shareFailure(error);
      if (failure === "cancelled") setPhase({ kind: "idle" });
      else if (failure === "needs-tap") setPhase(first ? { kind: "ready", file, at: Date.now() } : { kind: "error", text: DOWNLOAD_TEXT.failed });
      else if (failure === "failed") window.location.assign(href); // 예전처럼 화면에 띄운다 — 보는 것은 됐다
      // busy: 저장 창이 이미 열려 있다 — 그대로 둔다
    }
  }

  /** PDF 를 받아 File 로 — 실패하면 그 까닭을 버튼 아래에 적고 null */
  async function fetchPdf(): Promise<File | null> {
    let res: Response;
    try {
      res = await fetch(href, { credentials: "same-origin", cache: "no-store" });
    } catch {
      setPhase({ kind: "error", text: DOWNLOAD_TEXT.offline });
      return null;
    }
    if (!alive.current) return null;
    const kind = responseKind({ ok: res.ok, contentType: res.headers.get("content-type"), redirected: res.redirected });
    if (kind === "reload") {
      window.location.reload();
      return null;
    }
    if (kind === "message") {
      setPhase({ kind: "error", text: messageText(await res.text().catch(() => "")) });
      return null;
    }
    if (kind === "error") {
      setPhase({ kind: "error", text: DOWNLOAD_TEXT.failed });
      return null;
    }
    try {
      return new File([await res.blob()], fileNameFromDisposition(res.headers.get("content-disposition"), fileName), { type: "application/pdf" });
    } catch {
      setPhase({ kind: "error", text: DOWNLOAD_TEXT.offline });
      return null;
    }
  }

  async function fetchAndShare() {
    if (working.current) return;
    working.current = true;
    setPhase({ kind: "loading" });
    let file: File | null = null;
    try {
      file = await fetchPdf();
    } finally {
      working.current = false;
    }
    if (!file || !alive.current) return;
    // 저장 창이 떠 있는 동안은 처음 모양으로 둔다 — 아이폰이 결과를 끝내 알려 주지 않아도 버튼이 '만드는 중' 에 묶이지 않게
    setPhase({ kind: "idle" });
    await openSheet(file, true);
  }

  function onLinkClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!shareSheetReady()) return; // PC · 안드로이드 · 옛 아이폰 — 링크 그대로 받는다
    e.preventDefault();
    void fetchAndShare();
  }

  function onReadyClick() {
    if (phase.kind !== "ready") return;
    if (Date.now() - phase.at > READY_FOR_MS) void fetchAndShare();
    else void openSheet(phase.file, false);
  }

  const note = phase.kind === "ready" ? DOWNLOAD_TEXT.ready : phase.kind === "error" ? phase.text : "";

  return (
    <span className={cn("inline-flex max-w-full flex-col", align === "end" ? "items-end text-right" : "items-start")}>
      {phase.kind === "ready" ? (
        <button type="button" onClick={onReadyClick} className={className}>
          {DOWNLOAD_TEXT.again}
        </button>
      ) : (
        // download 속성은 두지 않는다 — 로그인이 풀려 로그인 화면으로 튕기거나 글 오류(503)가 오면 그것을 파일로 받아 버린다.
        // PDF 는 라우트의 attachment 가 받게 한다
        <a
          href={href}
          onClick={onLinkClick}
          title={title}
          aria-busy={phase.kind === "loading" || undefined}
          className={cn(className, phase.kind === "loading" && "pointer-events-none opacity-70")}
        >
          {phase.kind === "loading" ? DOWNLOAD_TEXT.loading : children}
        </a>
      )}
      {/* 알림 칸은 늘 그려 둔다 (숨겼다 보이면 화면 낭독기가 못 읽는다) — 글이 없으면 높이 0 */}
      <span role="status" aria-live="polite" className={cn("max-w-72 text-xs leading-snug", note && "mt-1.5", phase.kind === "error" ? "font-bold text-amber-700" : "text-slate")}>
        {note}
      </span>
    </span>
  );
}
