/**
 * 숙제 **바로 녹음** — 숙제 화면에서 바로 녹음해 음성 파일로 낸다
 * (2026-10-08 Alan — "파일을 업로드 할 수 도 있고, 홈페이지에서 바로 녹음하기 기능도 있으면 좋겠어").
 *
 * 브라우저가 녹음해 주는 형식이 기기마다 다르다 — 아이폰 사파리는 AAC(m4a), 안드로이드 크롬 · 삼성 인터넷은 WebM(Opus).
 * 그런데 **안드로이드에서 녹음한 WebM 을 아이폰 사파리가 못 틀 수 있다** (WebKit 버그 238546 — `<audio>` 가 WebM Opus 를 못 연다).
 * 강사가 아이폰으로 점검하면 학생 녹음을 못 듣는다. 그래서 녹음이 끝나면 **WAV(모노 · 22.05kHz · 16비트)로 바꿔서** 올린다 —
 * WAV 는 아이폰 · 안드로이드 · PC 가 다 틀고, 길이가 머리에 적혀 있어 플레이어의 시간 · 구간반복도 그대로 된다
 * (크롬이 녹음한 WebM 은 길이가 비어 있다).
 * 대신 1분에 약 2.5MB 라 **한 번에 10분까지** 녹음한다 (10분 = 약 25MB — 버킷 한도 50MB 안). 더 길면 나눠 녹음하거나 파일로 올린다.
 * 바꾸지 못하면(이 브라우저가 제 녹음을 못 풀면) 원래 녹음을 그대로 올린다 — 녹음을 잃는 것보다 낫다.
 *
 * 이 파일은 브라우저 없이 시험할 수 있는 규칙만 둔다. 마이크 · 녹음기 · 변환은 `HomeworkRecorder` 가 한다.
 */

/** 한 번에 녹음하는 최대 길이(초) — 넘으면 저절로 멈추고 거기까지 담는다 */
export const RECORD_MAX_SECONDS = 10 * 60;
/** 이보다 짧은 녹음은 담지 않는다 (잘못 눌러 바로 끈 것) */
export const RECORD_MIN_SECONDS = 1;
/** WAV 로 바꿀 때의 표본 빈도 — 말소리(치찰음까지)는 또렷하고 크기는 CD 음질의 1/4. 옛 사파리도 받는 가장 낮은 값이다 */
export const WAV_RATE = 22050;
/** 이보다 작게 녹음됐으면(가장 큰 소리가 -40dB 밑) 거의 소리가 없는 것이다 — 마이크가 막혔거나 다른 마이크가 잡혔다 */
export const QUIET_PEAK = 0.01;

/**
 * 녹음 형식 후보 — 앞에서부터 이 브라우저가 녹음할 수 있는 첫 형식을 쓴다.
 * 어느 것이든 녹음이 끝나면 WAV 로 바꾸므로, 여기서 고르는 것은 **이 브라우저가 제 녹음을 확실히 풀 수 있는 형식**이고
 * 바꾸지 못했을 때 그대로 올라가도 가장 많은 기기가 트는 형식이다.
 *  - 애플 엔진(아이폰의 모든 브라우저 · 맥 사파리)은 **mp4(AAC)** — 사파리가 처음부터 녹음해 온 형식이고 어느 기기나 튼다.
 *    사파리 18.4 부터 WebM 도 녹음하지만 아이폰은 WebM 을 잘 못 튼다.
 *  - 그 밖(크롬 · 삼성 인터넷 · 엣지 · 파이어폭스)은 **WebM(Opus)** — 크롬이 오래 녹음해 온 형식이다.
 *    크롬 126 부터 mp4 도 녹음하지만 조각난 mp4 에 Opus 라, 풀지 못하는 크로미움이 있고 아이폰이 튼다는 보장도 없다.
 */
export function recordTypeCandidates(apple: boolean): string[] {
  const aac = "audio/mp4;codecs=mp4a.40.2";
  return apple
    ? [aac, "audio/mp4", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", aac, "audio/mp4"];
}

/** 녹음할 형식 — 하나도 못 받으면 "" (브라우저가 고르게 둔다) */
export function pickRecordType(isSupported: (type: string) => boolean, apple: boolean): string {
  for (const type of recordTypeCandidates(apple)) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // 묻는 것조차 던지는 브라우저가 있다 — 다음 후보로
    }
  }
  return "";
}

/**
 * 녹음기가 알려 준 형식에서 저장할 형식만 — `audio/webm;codecs=opus` → `audio/webm`.
 * 소리만 녹음했는데 `video/webm` 이라고 알려 주는 브라우저가 있어 `audio/` 로 바꾼다. 형식을 모르면 null.
 */
export function baseAudioType(type: string | null | undefined): string | null {
  const base = (type ?? "").split(";")[0].trim().toLowerCase().replace(/^video\//, "audio/");
  return /^audio\/[a-z0-9.+-]+$/.test(base) ? base : null;
}

const RECORDED_EXT: Record<string, string> = {
  "audio/wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
};

/** 저장할 형식의 확장자 — 모르는 형식이면 "" */
export const recordingExt = (type: string) => RECORDED_EXT[type] ?? "";

/** 녹음 파일 이름 — `녹음 1.wav`. 번호는 이 화면에서 녹음한 순서다 (뺀 녹음의 번호를 다시 쓰지 않는다) */
export const recordingName = (n: number, ext: string) => `녹음 ${n}${ext}`;

/** 여러 채널을 한 채널로 (평균) — 말소리 숙제라 모노로 충분하고 크기가 절반이 된다 */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (const c of channels) for (let i = 0; i < length; i++) out[i] += c[i];
  for (let i = 0; i < length; i++) out[i] /= channels.length;
  return out;
}

/** 가장 큰 소리 (0 ~ 1) */
export function peakLevel(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

/** 거의 소리가 없는 녹음인가 — 막지는 않고 "들어 보고 다시 녹음해 주세요" 를 띄운다 */
export const isNearlySilent = (samples: Float32Array) => peakLevel(samples) < QUIET_PEAK;

/** WAV 크기 (바이트) — 머리 44바이트 + 표본마다 2바이트 */
export const wavByteLength = (sampleCount: number) => 44 + sampleCount * 2;

/** 모노 16비트 PCM WAV — 어느 기기 · 브라우저나 트는 가장 단순한 형식 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(wavByteLength(samples.length));
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  const dataBytes = samples.length * 2;
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 조각 크기
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 모노
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // 초당 바이트 (모노 · 16비트)
  view.setUint16(32, 2, true); // 표본 한 개의 바이트
  view.setUint16(34, 16, true); // 비트
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) {
    const v = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    view.setInt16(offset, v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff), true);
  }
  return buffer;
}

/** 마이크를 못 켰을 때 학생에게 보일 말 — 브라우저가 던진 오류 이름으로 고른다 */
export function micErrorMessage(name: string): { title: string; body: string } {
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      title: "마이크 권한이 꺼져 있어요",
      body: "브라우저(또는 휴대폰 설정)에서 이 사이트의 마이크를 허용한 뒤 다시 눌러 주세요.",
    };
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return { title: "마이크를 찾지 못했어요", body: "마이크가 있는 기기(휴대폰)에서 다시 해 주세요." };
  if (name === "NotReadableError" || name === "AbortError")
    return {
      title: "다른 앱이 마이크를 쓰고 있어요",
      body: "통화나 다른 녹음 앱을 끄고 다시 눌러 주세요.",
    };
  return { title: "녹음을 시작하지 못했어요", body: "잠시 뒤 다시 눌러 주세요." };
}
