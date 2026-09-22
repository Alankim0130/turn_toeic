"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scanAttendance } from "@/app/my/attendance/actions";
import { AttendanceResult } from "@/components/my/AttendanceResult";
import { Icon } from "@/components/ui/Icon";
import { tokenFromQr, type ScanResult } from "@/lib/attendance";
import { cn } from "@/lib/utils";

/**
 * 앱 안 출석 카메라 (2026-09-22 Alan — "출석을 누르면 카메라를 바로 실행해서 촬영할 수 있는 기능이 나오면 좋겠어!").
 *
 * - 화면이 열리면 **바로 뒷면 카메라를 켜고** 강의실 앞 출석 QR 을 찾는다. 찾으면 카메라를 끄고 그 자리에서 출석을 찍는다
 *   (`scanAttendance` — 판정은 DB 함수 `attendance_scan`). 로그인한 앱 안에서 찍으므로, 휴대폰 기본 카메라로 찍을 때처럼
 *   아이폰에서 사파리 로그인을 따로 할 일이 없다.
 * - QR 읽기: 안드로이드 크롬 등은 브라우저의 `BarcodeDetector`, 없으면(아이폰 사파리) `jsqr` 을 그때 불러온다.
 * - 사이트 응답 헤더가 카메라를 우리 사이트에만 연다 (`next.config.ts` Permissions-Policy `camera=(self)`).
 * - 권한을 거절했거나 카메라가 없으면 이유를 적고, 휴대폰 기본 카메라로 찍는 길을 안내한다 (그 길도 그대로 된다).
 * - 다른 탭으로 가거나 화면을 끄면 카메라를 끈다 — 켜 둔 채로 두지 않는다.
 */

type Phase = "starting" | "scanning" | "checking" | "done" | "paused" | "denied" | "unsupported" | "error";
type Detect = (video: HTMLVideoElement) => Promise<string | null>;
type BarcodeDetectorCtor = {
  new (opts: { formats: string[] }): { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
  getSupportedFormats?: () => Promise<string[]>;
};

async function makeDetector(): Promise<Detect> {
  const BD = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (BD) {
    try {
      const formats = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
      if (formats.includes("qr_code")) {
        const detector = new BD({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // 지원한다고 해 놓고 실패하는 브라우저가 있다 — jsqr 로 간다
    }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!ctx || !w || !h) return null;
    // 긴 변 720px 로 줄여 읽는다 — 포스터 QR 은 커서 이 정도면 충분하고, 휴대폰이 뜨거워지지 않는다
    const k = Math.min(1, 720 / Math.max(w, h));
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

export function AttendanceCamera() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let stream: MediaStream | null = null;
    const stop = () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden" && !stopped) {
        stop();
        setPhase("paused");
      }
    };
    document.addEventListener("visibilitychange", onHidden);

    (async () => {
      setResult(null);
      setHint(null);
      setPhase("starting");
      if (!navigator.mediaDevices?.getUserMedia) return setPhase("unsupported");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        if (stopped) return;
        const name = e instanceof DOMException ? e.name : "";
        return setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "unsupported" : "error");
      }
      const video = videoRef.current;
      if (stopped || !video) return stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const detect = await makeDetector().catch(() => null);
      if (stopped) return;
      if (!detect) {
        // QR 판독기를 못 불러왔으면(오래된 앱 화면 등) 카메라도 바로 끈다 — 켜 둔 채로 두지 않는다
        stop();
        return setPhase("error");
      }
      setPhase("scanning");

      const tick = async () => {
        if (stopped) return;
        let text: string | null = null;
        try {
          text = await detect(video);
        } catch {
          // 한 장 못 읽은 것은 넘긴다
        }
        if (stopped) return;
        const token = text ? tokenFromQr(text) : null;
        if (text && !token) setHint("출석 QR 이 아니에요 — 강의실 앞에 붙은 출석 QR 을 비춰 주세요.");
        if (!token) {
          timer = window.setTimeout(tick, 250);
          return;
        }
        stop();
        setPhase("checking");
        navigator.vibrate?.(60);
        const r = await scanAttendance(token).catch((): ScanResult => ({ action: "error" }));
        setResult(r);
        setPhase("done");
        router.refresh();
      };
      void tick();
    })();

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      stop();
    };
  }, [run, router]);

  const live = phase === "starting" || phase === "scanning" || phase === "checking";
  const retry = (
    <button type="button" onClick={() => setRun((n) => n + 1)} className="btn-primary w-full">
      <Icon name="camera" size={18} />
      {phase === "done" ? "다시 찍기" : "카메라 켜기"}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* 영상은 늘 붙여 둔다 — 다시 켤 때 요소가 없어서 스트림을 못 붙이는 일이 없게 */}
      <div className={cn("relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-ink", !live && "hidden")}>
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" aria-label="출석 QR 을 비추는 카메라 화면" />
        <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-2xl border-4 border-white/90 shadow-[0_0_0_999px_rgba(23,18,31,0.35)]" />
        <p role="status" className="absolute inset-x-0 bottom-3 px-4 text-center text-sm font-bold text-white drop-shadow">
          {phase === "starting" ? "카메라를 켜는 중…" : phase === "checking" ? "출석을 확인하는 중…" : "강의실 앞 출석 QR 을 네모 안에 비춰 주세요"}
        </p>
      </div>
      {phase === "scanning" && hint && <p className="text-center text-sm font-bold text-amber-800">{hint}</p>}

      {phase === "done" && result && (
        <>
          <AttendanceResult result={result} />
          {retry}
        </>
      )}

      {(phase === "denied" || phase === "unsupported" || phase === "error" || phase === "paused") && (
        <div className="rounded-2xl bg-surface px-5 py-5 text-center">
          <p className="text-sm font-black text-ink">
            {phase === "denied"
              ? "카메라 권한이 꺼져 있어요"
              : phase === "unsupported"
                ? "이 기기에서는 카메라를 켤 수 없어요"
                : phase === "paused"
                  ? "카메라를 껐어요"
                  : "카메라를 켜지 못했어요"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {phase === "denied"
              ? "브라우저(또는 휴대폰 설정)에서 이 사이트의 카메라를 허용한 뒤 다시 켜 주세요. "
              : ""}
            휴대폰 기본 카메라로 강의실 앞 QR 을 찍어도 출석돼요.
          </p>
          <div className="mt-3">{retry}</div>
        </div>
      )}
    </div>
  );
}
