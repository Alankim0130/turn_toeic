import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { homeworkAudioType, homeworkFilesError, MAX_AUDIO_MB } from "./homework";
import {
  baseAudioType,
  downmix,
  encodeWav,
  isNearlySilent,
  micErrorMessage,
  peakLevel,
  pickRecordType,
  RECORD_MAX_SECONDS,
  recordingExt,
  recordingName,
  WAV_RATE,
  wavByteLength,
} from "./homework-recorder";
import { MB } from "./upload";

/** 브라우저마다 MediaRecorder.isTypeSupported 가 참인 형식 (2026-10 조사 — 실제 기기로 확인한 것은 크로미움뿐이다) */
const supports = (...types: string[]) => (t: string) => types.includes(t);

describe("pickRecordType — 이 브라우저가 녹음할 형식", () => {
  it("아이폰 사파리(18.4 전) — mp4 만 녹음한다 → mp4", () => {
    expect(pickRecordType(supports("audio/mp4"), true)).toBe("audio/mp4");
  });

  it("아이폰 사파리(18.4 부터) — WebM 도 녹음하지만 AAC mp4 가 먼저다 (아이폰은 WebM 을 잘 못 튼다)", () => {
    expect(pickRecordType(supports("audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"), true)).toBe(
      "audio/mp4;codecs=mp4a.40.2",
    );
    // 코덱까지 적은 형식을 모른다고 하는 사파리여도 WebM 보다 mp4 가 먼저다
    expect(pickRecordType(supports("audio/mp4", "audio/webm;codecs=opus", "audio/webm"), true)).toBe("audio/mp4");
  });

  it("안드로이드 크롬 · 삼성 인터넷 — mp4 도 녹음하지만(크롬 126+) WebM(Opus)이 먼저다", () => {
    expect(pickRecordType(supports("audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=opus"), false)).toBe(
      "audio/webm;codecs=opus",
    );
  });

  it("파이어폭스 — WebM 이 없으면 Ogg(Opus)", () => {
    expect(pickRecordType(supports("audio/ogg;codecs=opus"), false)).toBe("audio/ogg;codecs=opus");
  });

  it("하나도 못 받거나 묻는 것조차 던지면 \"\" — 브라우저가 고르게 둔다", () => {
    expect(pickRecordType(() => false, false)).toBe("");
    expect(
      pickRecordType(() => {
        throw new Error("boom");
      }, true),
    ).toBe("");
  });
});

describe("baseAudioType · recordingExt · recordingName — 녹음 파일의 형식 · 이름", () => {
  it("코덱 꼬리를 떼고 소문자로", () => {
    expect(baseAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseAudioType("Audio/MP4; codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(baseAudioType("audio/ogg; codecs=opus")).toBe("audio/ogg");
  });

  it("소리만 녹음했는데 video/webm 이라고 알려 주면 audio/webm 으로", () => {
    expect(baseAudioType("video/webm;codecs=vp8,opus")).toBe("audio/webm");
  });

  it("형식을 모르면 null — 모르는 채로 올리지 않는다", () => {
    expect(baseAudioType("")).toBeNull();
    expect(baseAudioType(null)).toBeNull();
    expect(baseAudioType("application/octet-stream")).toBeNull();
  });

  it("확장자 — 아이폰 녹음은 .m4a, 크롬 녹음은 .webm, 바꾼 녹음은 .wav", () => {
    expect(recordingExt("audio/mp4")).toBe(".m4a");
    expect(recordingExt("audio/webm")).toBe(".webm");
    expect(recordingExt("audio/ogg")).toBe(".ogg");
    expect(recordingExt("audio/wav")).toBe(".wav");
    expect(recordingExt("audio/x-unknown")).toBe("");
    expect(recordingName(2, ".wav")).toBe("녹음 2.wav");
  });

  it("녹음 파일은 숙제 음성 파일 규칙을 그대로 통과한다 — 고른 파일과 같은 길로 올라간다", () => {
    for (const type of ["audio/wav", "audio/mp4", "audio/webm", "audio/ogg"]) {
      const name = recordingName(1, recordingExt(type));
      expect(homeworkAudioType({ name, type })).toBe(type);
      expect(homeworkFilesError([{ type, size: 3 * MB }])).toBeNull();
    }
  });
});

describe("WAV 로 바꾸기 — 어느 기기나 트는 형식", () => {
  it("스테레오는 평균으로 모노 — 길이가 다르면 짧은 쪽", () => {
    const mono = downmix([new Float32Array([0.5, -0.5, 1]), new Float32Array([0.1, 0.1])]);
    expect(Array.from(mono).map((v) => Math.round(v * 100) / 100)).toEqual([0.3, -0.2]);
    const one = new Float32Array([0.2]);
    expect(downmix([one])).toBe(one);
    expect(downmix([])).toHaveLength(0);
  });

  it("머리 — RIFF · WAVE · PCM · 모노 · 16비트 · 표본 빈도 · 길이", () => {
    const wav = new DataView(encodeWav(new Float32Array(10), WAV_RATE));
    const text = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(o + i)));
    expect(wav.byteLength).toBe(44 + 20);
    expect(text(0)).toBe("RIFF");
    expect(wav.getUint32(4, true)).toBe(36 + 20);
    expect(text(8)).toBe("WAVE");
    expect(text(12)).toBe("fmt ");
    expect(wav.getUint32(16, true)).toBe(16);
    expect(wav.getUint16(20, true)).toBe(1); // PCM
    expect(wav.getUint16(22, true)).toBe(1); // 모노
    expect(wav.getUint32(24, true)).toBe(WAV_RATE);
    expect(wav.getUint32(28, true)).toBe(WAV_RATE * 2);
    expect(wav.getUint16(32, true)).toBe(2);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(text(36)).toBe("data");
    expect(wav.getUint32(40, true)).toBe(20);
  });

  it("표본 — -1~1 을 16비트로, 넘치면 자르고 숫자가 아니면 0", () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1, 0.5, 1.7, -3, Number.NaN]), 16000));
    const at = (i: number) => wav.getInt16(44 + i * 2, true);
    expect([at(0), at(1), at(2), at(3), at(4), at(5), at(6)]).toEqual([0, 32767, -32768, 16384, 32767, -32768, 0]);
  });

  it("10분 녹음이 숙제 음성 한 개 한도(50MB) 안에 든다 — 한도를 줄이면 녹음 길이도 줄일 것", () => {
    const bytes = wavByteLength(WAV_RATE * RECORD_MAX_SECONDS);
    expect(bytes).toBeLessThan(MAX_AUDIO_MB * MB);
    expect(Math.round(bytes / MB)).toBe(25); // 1분에 약 2.5MB
  });

  it("거의 소리가 없는 녹음을 가린다 (-40dB 밑)", () => {
    expect(peakLevel(new Float32Array([0.1, -0.4, 0.2]))).toBeCloseTo(0.4);
    expect(isNearlySilent(new Float32Array(1000))).toBe(true);
    expect(isNearlySilent(new Float32Array([0.002, -0.004, 0.003]))).toBe(true);
    expect(isNearlySilent(new Float32Array([0.002, -0.2, 0.003]))).toBe(false);
  });
});

describe("마이크를 못 켰을 때", () => {
  it("권한 거절 · 마이크 없음 · 다른 앱이 쓰는 중 · 그 밖", () => {
    expect(micErrorMessage("NotAllowedError").title).toBe("마이크 권한이 꺼져 있어요");
    expect(micErrorMessage("SecurityError").title).toBe("마이크 권한이 꺼져 있어요");
    expect(micErrorMessage("NotFoundError").title).toBe("마이크를 찾지 못했어요");
    expect(micErrorMessage("NotReadableError").title).toBe("다른 앱이 마이크를 쓰고 있어요");
    expect(micErrorMessage("TypeError").title).toBe("녹음을 시작하지 못했어요");
  });

  it("응답 헤더가 마이크를 우리 사이트에만 연다 — 끄면 바로 녹음이 늘 '권한이 꺼져 있어요' 가 된다", () => {
    const config = readFileSync("next.config.ts", "utf8");
    const policy = config.match(/key: "Permissions-Policy", value: "([^"]+)"/)?.[1] ?? "";
    expect(policy.split(/,\s*/)).toEqual(["camera=(self)", "microphone=(self)", "geolocation=()", "payment=()"]);
  });
});
