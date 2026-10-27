"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { liveHint, liveRead } from "@/lib/tracking-label";
import { cn } from "@/lib/utils";
import { makeFrameReader } from "./label-camera-reader";

/**
 * 송장번호 칸의 **QR 찍기** 카메라 (2026-10-27 Alan — "사진을 찍어서 올리는게 아니라 그냥 카메라를 틀어서 qr이 인식이되면 카메라가 꺼지면서
 * 바로 송장번호가 기입되는걸로"). 출석 카메라(`AttendanceCamera`)와 같은 길이다.
 *
 * - 열리자마자 뒷면 카메라를 켜고 GS 편의점 택배 접수증의 QR 을 찾는다. 찾으면 **카메라를 끄고** 번호를 칸에 넣는다(`onFound`) — 저장(배송완료)은 조교가 누른다
 * - 네모 둘레만 읽는다 — 책상의 다른 접수증 QR 이 화면 가장자리에 걸려도 읽지 않는다. 접수증 QR 이 둘 보이면(번호가 다르면) 넣지 않는다
 * - 다른 QR 이면 알려 주고 계속 비추게 한다. 한참 못 읽으면 한 뼘쯤 떨어져 보라고 (너무 가까우면 아이폰 카메라가 초점을 못 맞춘다), 그래도 안 되면 사진으로
 * - 카메라를 못 켜면(권한 · 카메라 없음) 까닭을 적고 **사진으로 읽기**(예전 길 — 휴대폰 카메라 앱으로 찍어 읽는다)를 권한다
 * - 영상은 이 기기 안에서만 읽는다. 다른 앱으로 가면 카메라를 끈다
 */

type Phase = "starting" | "scanning" | "paused" | "denied" | "unsupported" | "error";

/** 화면이 보여 주는 가운데 정사각형을 넉넉한 화질로 받는다 — 접수증 QR 은 작아서 (출석 포스터와 다르다) */
const VIDEO: MediaTrackConstraints = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
/** 한 장 읽고 다음 장까지 */
const GAP_MS = 150;
/** 이만큼 못 읽으면 거리를 바꿔 보라고 한다 */
const SLOW_MS = 8000;
/** 다른 QR 안내는 그 QR 이 화면에서 빠지고 이만큼 지나면 거둔다 */
const HINT_MS = 2500;

export function LabelCamera({
  recipient,
  onFound,
  onPhoto,
}: {
  /** 이 주문의 받는 분 — 어느 접수증을 비출지 */
  recipient: string;
  onFound: (tracking: string) => void;
  /** 사진으로 읽기 — 카메라를 닫고 사진 고르기를 연다 (누른 그 자리에서 불러야 휴대폰이 사진 창을 연다) */
  onPhoto: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [hint, setHint] = useState<"other" | "many" | null>(null);
  const [slow, setSlow] = useState(false);
  const [run, setRun] = useState(0);
  /** 읽힌 때의 최신 함수를 부른다 — 카메라를 켠 때의 것을 부르지 않게 */
  const foundRef = useRef(onFound);
  useEffect(() => {
    foundRef.current = onFound;
  });

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let slowTimer: number | undefined;
    let stream: MediaStream | null = null;
    const stop = () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      if (slowTimer) window.clearTimeout(slowTimer);
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
      setHint(null);
      setSlow(false);
      setPhase("starting");
      if (!navigator.mediaDevices?.getUserMedia) return setPhase("unsupported");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });
      } catch (e) {
        if (stopped) return;
        const name = e instanceof DOMException ? e.name : "";
        return setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "unsupported" : "error");
      }
      const video = videoRef.current;
      if (stopped || !video) {
        // 켜지는 사이 창을 닫았다 — 늦게 켜진 카메라를 바로 끈다
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const read = await makeFrameReader().catch(() => null);
      if (stopped) return;
      if (!read) {
        // QR 판독기를 못 불러왔으면 카메라도 바로 끈다 — 켜 둔 채로 두지 않는다
        stop();
        return setPhase("error");
      }
      setPhase("scanning");
      slowTimer = window.setTimeout(() => setSlow(true), SLOW_MS);

      let tick = 0;
      let hintAt = 0;
      const step = async () => {
        if (stopped) return;
        let texts: string[] = [];
        try {
          texts = await read(video, tick++);
        } catch {
          // 한 장 못 읽은 것은 넘긴다
        }
        if (stopped) return;
        const r = liveRead(texts);
        if (r.kind === "ok") {
          stop();
          navigator.vibrate?.(60);
          foundRef.current(r.tracking);
          return;
        }
        if (r.kind === "other" || r.kind === "many") {
          hintAt = Date.now();
          setHint(r.kind);
        } else if (hintAt && Date.now() - hintAt > HINT_MS) {
          hintAt = 0;
          setHint(null);
        }
        timer = window.setTimeout(step, GAP_MS);
      };
      void step();
    })();

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      stop();
    };
  }, [run]);

  const live = phase === "starting" || phase === "scanning";

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-slate">
        <b className="text-ink">{recipient}</b> 님 접수증의 <b className="text-ink">오른쪽 위 QR</b> 을 네모 안에 비춰 주세요. 읽히면 카메라가 꺼지고 송장번호가 들어가요.
      </p>
      {/* 영상은 늘 붙여 둔다 — 다시 켤 때 요소가 없어서 스트림을 못 붙이는 일이 없게 */}
      <div className={cn("relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-ink", !live && "hidden")}>
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" aria-label="접수증 QR 을 비추는 카메라 화면" />
        <div aria-hidden className="pointer-events-none absolute inset-[14%] rounded-2xl border-4 border-white/90 shadow-[0_0_0_999px_rgba(23,18,31,0.35)]" />
        <p role="status" className="absolute inset-x-0 bottom-3 px-4 text-center text-sm font-bold text-white drop-shadow">
          {phase === "starting" ? "카메라를 켜는 중…" : "오른쪽 위 QR 을 네모 안에"}
        </p>
      </div>
      {phase === "scanning" && hint && <p className="text-center text-xs font-bold leading-snug text-amber-800">{liveHint(hint)}</p>}
      {phase === "scanning" && !hint && slow && (
        <p className="text-center text-xs leading-snug text-slate">
          잘 안 읽히면 한 뼘쯤 떨어져서 비춰 보세요. 너무 가까우면 초점이 안 맞아요. 그래도 안 되면 아래 사진으로 읽기를 눌러 주세요.
        </p>
      )}
      {live && (
        <button type="button" onClick={onPhoto} className="mx-auto block text-xs font-bold text-slate underline decoration-line underline-offset-2 hover:text-ink">
          잘 안 되면 사진으로 읽기
        </button>
      )}

      {!live && (
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
            {phase === "denied" ? "브라우저(또는 휴대폰 설정)에서 이 사이트의 카메라를 허용한 뒤 다시 켜 주세요. " : ""}
            접수증을 사진으로 찍어서 읽을 수도 있어요.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {phase !== "unsupported" && (
              <button type="button" onClick={() => setRun((n) => n + 1)} className="btn-primary w-full">
                <Icon name="camera" size={18} />
                카메라 다시 켜기
              </button>
            )}
            <button type="button" onClick={onPhoto} className="btn-secondary w-full">
              사진으로 읽기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
