"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/components/lc/AudioPlayer";
import { getInstallEnv } from "@/components/pwa/install-store";
import {
  baseAudioType,
  downmix,
  encodeWav,
  isNearlySilent,
  micErrorMessage,
  pickRecordType,
  RECORD_MAX_SECONDS,
  RECORD_MIN_SECONDS,
  recordingExt,
  WAV_RATE,
} from "@/lib/homework-recorder";
import { cn } from "@/lib/utils";

/**
 * 숙제 **바로 녹음하기** (2026-10-08 Alan — "파일을 업로드 할 수 도 있고, 홈페이지에서 바로 녹음하기 기능도 있으면 좋겠어").
 *
 * 누르면 마이크를 켜고 녹음한다 → `녹음 끝내기` 를 누르면 마이크를 바로 끄고, 녹음을 **WAV 로 바꿔** 숙제 음성 목록에 넣는다
 * (왜 WAV 인지는 `homework-recorder.ts` 머리말 — 안드로이드 녹음을 아이폰이 못 트는 일을 막는다). 목록에 들어간 녹음은
 * 고른 파일과 똑같이 미리 듣고 · 빼고 · 제출한다. **녹음은 제출할 때까지 이 기기 밖으로 나가지 않는다.**
 *
 * - 한 번에 10분까지(`RECORD_MAX_SECONDS`) — 넘으면 거기까지 담는다. 1초 미만은 담지 않는다
 * - `취소` 는 녹음을 버린다. 화면을 닫아도(다른 날짜 · 과목을 고르면) 버리고 마이크를 끈다 — 켜 둔 채로 두지 않는다
 * - 전화가 오거나 다른 앱이 마이크를 가져가 녹음이 끊기면 거기까지 담는다
 * - 마이크를 못 켜면 까닭을 적고, 녹음 앱으로 녹음한 파일을 고르는 길(옆 칸)을 안내한다
 * - 응답 헤더가 마이크를 우리 사이트에만 연다 (`next.config.ts` Permissions-Policy `microphone=(self)`)
 *
 * 녹음 버튼의 동그라미 · 멈춤 네모는 도형(인라인 SVG)이다 — LC 플레이어의 재생 버튼과 같은 예외 (이모지 · PNG 아이콘이 아니다).
 */

/** 녹음 한 개 — 폼이 이름(`녹음 N`)을 붙여 고른 음성 목록에 넣는다 */
export type Recording = { blob: Blob; type: string; ext: string; quiet: boolean };

type Phase = "idle" | "starting" | "recording" | "saving" | "problem";
type Problem = { title: string; body: string; pick?: boolean };
type Session = {
  rec: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  type: string;
  startedAt: number;
  timer: number;
  discard: boolean;
  auto: boolean;
  finished: boolean;
};

const TOO_SHORT: Problem = { title: "녹음이 너무 짧아요", body: `${RECORD_MIN_SECONDS}초 넘게 녹음해 주세요.` };

/** 카카오톡 · 인스타그램 같은 앱 안 브라우저는 마이크를 안 주기도 한다 */
function inAppHint() {
  try {
    return getInstallEnv().inApp ? " 카카오톡 같은 앱 안에서 열었다면 사파리나 크롬으로 열어 다시 해 주세요." : "";
  } catch {
    return "";
  }
}

const unsupported = (): Problem => ({ title: "이 브라우저에서는 바로 녹음할 수 없어요", body: `사파리나 크롬에서 다시 해 주세요.${inAppHint()}`, pick: true });

/** 녹음기가 준 것 → 숙제 음성 한 개 (WAV). 이 브라우저가 제 녹음을 못 풀면 원래 녹음 그대로 — 녹음을 잃는 것보다 낫다 */
async function toRecording(raw: Blob, elapsed: number): Promise<Recording | Problem> {
  if (raw.size === 0) return { title: "녹음된 소리가 없어요", body: "다시 녹음해 주세요." };
  try {
    const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctx) throw new Error("no OfflineAudioContext");
    // 풀면서 WAV_RATE 로 다시 표본을 뜬다 (풀이는 그 오디오 문맥의 표본 빈도로 나온다)
    const decoded = await new Ctx(1, 1, WAV_RATE).decodeAudioData(await raw.arrayBuffer());
    if (decoded.duration < RECORD_MIN_SECONDS) return TOO_SHORT;
    const mono = downmix(Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)));
    return { blob: new Blob([encodeWav(mono, decoded.sampleRate)], { type: "audio/wav" }), type: "audio/wav", ext: ".wav", quiet: isNearlySilent(mono) };
  } catch {
    const type = baseAudioType(raw.type);
    const ext = type ? recordingExt(type) : "";
    if (!type || !ext) return { title: "녹음을 담지 못했어요", body: "잠시 뒤 다시 녹음해 주세요.", pick: true };
    if (elapsed < RECORD_MIN_SECONDS) return TOO_SHORT;
    return { blob: raw.type === type ? raw : new Blob([raw], { type }), type, ext, quiet: false };
  }
}

/** 녹음기와 마이크를 멈춘다 — 녹음기가 멈추며 onstop 이 올 것이면 true, 이미 멈췄거나 멈추지 못했으면 false */
function halt(s: Session): boolean {
  window.clearInterval(s.timer);
  let stopping = false;
  if (s.rec.state !== "inactive") {
    try {
      s.rec.stop(); // 마지막 조각을 넘기고 onstop
      stopping = true;
    } catch {
      // 이미 멈춘 녹음기
    }
  }
  // 마이크는 바로 끈다 — 켜 둔 채면 아이폰이 미리 듣기 소리를 수화기로 작게 낸다
  s.stream.getTracks().forEach((t) => t.stop());
  return stopping;
}

/** 녹음 버튼 — 흰 고리 안의 분홍 동그라미 (음성 메모의 녹음 버튼 모양) */
function RecordGlyph() {
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden focusable="false" style={{ width: 36, height: 36 }} className="text-brand-500">
      <circle cx="18" cy="18" r="16" fill="white" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2.5" />
      <circle cx="18" cy="18" r="9.5" fill="currentColor" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden focusable="false" fill="currentColor" style={{ width: 16, height: 16 }}>
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  );
}

export function HomeworkRecorder({
  disabled,
  onRecorded,
  onActiveChange,
}: {
  disabled: boolean;
  onRecorded: (recording: Recording) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const mounted = useRef(false);
  /** 마이크 허락을 기다리는 동안 취소하면 늘어난다 — 늦게 켜진 마이크는 바로 끈다 */
  const startToken = useRef(0);
  /** 녹음이 끝나는 때의 최신 함수를 부른다 — 녹음을 시작한 때의 것을 부르면 그 사이 바뀐 목록을 못 본다 */
  const recordedRef = useRef(onRecorded);
  useEffect(() => {
    recordedRef.current = onRecorded;
  });

  const active = phase === "starting" || phase === "recording" || phase === "saving";
  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // 화면을 닫으면(다른 날짜 · 과목) 녹음을 버리고 마이크를 끈다
      mounted.current = false; // 마이크 허락을 기다리던 중이면 늦게 켜진 마이크를 start 가 끈다
      const s = session.current;
      if (s) {
        s.discard = true;
        halt(s);
      }
    };
  }, []);

  /** 녹음을 끝낸다 — 녹음기가 onstop 을 주면 거기서, 못 주면 여기서 담는다 */
  function stopRecording(s: Session) {
    if (!halt(s)) void finish(s);
  }

  async function finish(s: Session) {
    if (s.finished) return;
    s.finished = true;
    window.clearInterval(s.timer);
    s.stream.getTracks().forEach((t) => t.stop());
    if (session.current === s) session.current = null;
    if (!mounted.current) return;
    if (s.discard) {
      setSeconds(0);
      setPhase("idle");
      return;
    }
    setPhase("saving");
    const elapsed = (performance.now() - s.startedAt) / 1000;
    const raw = new Blob(s.chunks, { type: s.rec.mimeType || s.type || s.chunks[0]?.type || "" });
    const result = await toRecording(raw, elapsed);
    if (!mounted.current) return;
    setSeconds(0);
    if (!("blob" in result)) {
      setProblem(result);
      setPhase("problem");
      return;
    }
    recordedRef.current(result);
    setNotice(s.auto ? `${RECORD_MAX_SECONDS / 60}분이 되어 녹음을 멈추고 담았어요. 더 할 말이 있으면 한 번 더 녹음해 주세요.` : null);
    setPhase("idle");
  }

  async function start() {
    if (disabled || session.current || phase === "starting" || phase === "saving") return;
    setProblem(null);
    setNotice(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setProblem(unsupported());
      setPhase("problem");
      return;
    }
    const token = ++startToken.current;
    setPhase("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      if (token !== startToken.current || !mounted.current) return;
      const p = micErrorMessage((e as { name?: string } | null)?.name ?? "");
      setProblem({ ...p, body: p.body + inAppHint(), pick: true });
      setPhase("problem");
      return;
    }
    if (token !== startToken.current || !mounted.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const wanted = pickRecordType((t) => MediaRecorder.isTypeSupported(t), /Apple/i.test(navigator.vendor ?? ""));
    let rec: MediaRecorder;
    try {
      rec = wanted ? new MediaRecorder(stream, { mimeType: wanted }) : new MediaRecorder(stream);
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        setProblem(unsupported());
        setPhase("problem");
        return;
      }
    }
    const s: Session = { rec, stream, chunks: [], type: rec.mimeType || wanted, startedAt: performance.now(), timer: 0, discard: false, auto: false, finished: false };
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) s.chunks.push(e.data);
    };
    rec.onstop = () => void finish(s);
    // 전화가 오거나 다른 앱이 마이크를 가져가면 거기까지 담는다
    stream.getAudioTracks().forEach((t) => t.addEventListener("ended", () => stopRecording(s)));
    try {
      rec.start();
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setProblem({ title: "녹음을 시작하지 못했어요", body: "잠시 뒤 다시 눌러 주세요.", pick: true });
      setPhase("problem");
      return;
    }
    session.current = s;
    setSeconds(0);
    setPhase("recording");
    s.timer = window.setInterval(() => {
      const sec = (performance.now() - s.startedAt) / 1000;
      setSeconds(sec);
      if (sec >= RECORD_MAX_SECONDS) {
        s.auto = true;
        stopRecording(s);
      }
    }, 250);
  }

  function cancel() {
    const s = session.current;
    if (s) {
      s.discard = true;
      stopRecording(s);
      return;
    }
    // 마이크 허락을 기다리는 중이면 — 늦게 켜지는 마이크는 start 가 끈다
    startToken.current++;
    setPhase("idle");
  }

  if (active) {
    return (
      <div role="group" aria-label="바로 녹음" className="rounded-xl2 border-2 border-brand-300 bg-brand-50 px-4 py-5 text-center">
        <p role="status" className="flex items-center justify-center gap-2 text-sm font-black text-ink">
          <span aria-hidden className="relative flex h-3 w-3">
            {phase === "recording" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:hidden" />}
            <span className={cn("relative inline-flex h-3 w-3 rounded-full", phase === "recording" ? "bg-brand-500" : "bg-brand-200")} />
          </span>
          {phase === "starting" ? "마이크를 켜는 중…" : phase === "saving" ? "녹음을 담는 중…" : "녹음 중"}
        </p>
        <p role="timer" className="mt-1 text-4xl font-black tabular-nums text-ink">
          {formatTime(seconds)}
        </p>
        <p className="text-xs font-medium text-mist">한 번에 최대 {RECORD_MAX_SECONDS / 60}분</p>
        {phase === "starting" && <p className="mt-3 text-xs font-bold text-slate">마이크를 써도 되는지 물으면 ‘허용’ 을 눌러 주세요.</p>}
        {/* 끝내기가 크고 취소는 작다 — 녹음을 버리는 쪽을 실수로 누르지 않게 (320px 에서도 한 줄) */}
        {phase === "recording" && (
          <button type="button" onClick={() => session.current && stopRecording(session.current)} className="btn-primary mt-4 w-full whitespace-nowrap">
            <StopGlyph />
            녹음 끝내기
          </button>
        )}
        {phase !== "saving" && (
          <button
            type="button"
            onClick={cancel}
            className="mt-2 inline-flex px-3 py-2 text-xs font-bold text-slate underline decoration-line underline-offset-4 transition hover:text-ink"
          >
            {phase === "recording" ? "취소하고 버리기" : "취소"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {phase === "problem" && problem && (
        <div role="alert" className="rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-left">
          <p className="text-sm font-black text-amber-900">{problem.title}</p>
          <p className="mt-0.5 text-xs font-medium text-amber-900">
            {problem.body}
            {problem.pick && " 녹음 앱으로 녹음한 파일을 골라 올려도 돼요."}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled}
        className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed border-brand-300 bg-brand-50/60 px-4 py-6 text-center text-sm font-bold text-ink transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RecordGlyph />
        {phase === "problem" ? "다시 녹음하기" : "바로 녹음하기"}
        <span className="text-xs font-medium text-mist">이 화면에서 바로 녹음해요 · 한 번에 최대 {RECORD_MAX_SECONDS / 60}분</span>
      </button>
      {notice && (
        <p role="status" className="text-xs font-bold text-brand-700">
          {notice}
        </p>
      )}
    </div>
  );
}
