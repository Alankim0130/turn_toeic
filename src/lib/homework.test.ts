import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classDayLabel,
  HOMEWORK_AUDIO_ACCEPT,
  homeworkAudioType,
  homeworkCheckedMessage,
  homeworkFileKind,
  homeworkFilesError,
  homeworkFilesLabel,
  homeworkLabel,
  levelsOfDay,
  MAX_AUDIO_MB,
  MAX_AUDIOS,
  MAX_PHOTO_MB,
  MAX_PHOTOS,
} from "./homework";
import { MB } from "./upload";

describe("levelsOfDay — 달력에서 고른 날 낼 수 있는 레벨", () => {
  it("점수보장반은 그 레벨 하나", () => {
    expect(levelsOfDay([{ target_score: 650, includes_levels: [] }])).toEqual([650]);
  });

  it("중급속성(스파르타 650)은 650·850 두 레벨이 다 나온다", () => {
    expect(levelsOfDay([{ target_score: 650, includes_levels: [850] }])).toEqual([650, 850]);
  });

  it("실전속성(스파르타 750)은 750·850", () => {
    expect(levelsOfDay([{ target_score: 750, includes_levels: [850] }])).toEqual([750, 850]);
  });

  it("같은 날 여러 반이면 합치고 중복은 없앤다", () => {
    expect(levelsOfDay([{ target_score: 650 }, { target_score: 650 }, { target_score: 850 }])).toEqual([650, 850]);
  });

  it("오름차순으로 준다 — 버튼 순서가 날마다 흔들리면 안 된다", () => {
    expect(levelsOfDay([{ target_score: 850 }, { target_score: 650 }])).toEqual([650, 850]);
  });

  it("강좌를 못 읽은 반은 건너뛴다 (짐작해서 레벨을 만들지 않는다)", () => {
    expect(levelsOfDay([null, undefined, { target_score: null }])).toEqual([]);
  });
});

describe("점검완료 알림 문구", () => {
  it("강사 코멘트가 있으면 그대로 싣는다", () => {
    const m = homeworkCheckedMessage({ level: 650, subject: "rc", classDate: "2026-09-17", feedback: "3번 문제 다시 보세요" });
    expect(m.title).toBe("9월 17일 650 · RC 숙제 점검이 끝났어요");
    expect(m.body).toBe("3번 문제 다시 보세요");
  });

  it("코멘트가 없으면 기본 안내", () => {
    const m = homeworkCheckedMessage({ level: 750, subject: "lc", classDate: "2026-09-17", feedback: "   " });
    expect(m.body).toContain("확인했어요");
  });

  it("날짜가 없는 옛 제출도 문구가 자연스럽다", () => {
    const m = homeworkCheckedMessage({ level: 850, subject: "rc", classDate: null });
    expect(m.title).toBe("850 · RC 숙제 점검이 끝났어요");
  });
});

describe("라벨", () => {
  it("homeworkLabel 은 레벨 · 과목", () => {
    expect(homeworkLabel(650, "lc")).toBe("650 · LC");
  });
  it("classDayLabel 은 월·일", () => {
    expect(classDayLabel("2026-09-03")).toBe("9월 3일");
  });
});

describe("음성 파일 (2026-10-07 Alan — 숙제에 음성 파일도)", () => {
  it("브라우저가 audio/… 로 알려 주면 그 형식 그대로", () => {
    expect(homeworkAudioType({ name: "새로운 녹음 3.m4a", type: "audio/x-m4a" })).toBe("audio/x-m4a");
    expect(homeworkAudioType({ name: "a.mp3", type: "audio/mpeg" })).toBe("audio/mpeg");
  });

  it("형식을 비워 주거나 엉뚱하게 알려 주면 녹음 앱 확장자로 정한다", () => {
    expect(homeworkAudioType({ name: "녹음.m4a", type: "" })).toBe("audio/mp4");
    expect(homeworkAudioType({ name: "녹음.M4A", type: "" })).toBe("audio/mp4");
    expect(homeworkAudioType({ name: "voice.mp3", type: "application/octet-stream" })).toBe("audio/mpeg");
    expect(homeworkAudioType({ name: "Voice 001.3ga", type: "" })).toBe("audio/3gpp");
    expect(homeworkAudioType({ name: "rec.amr", type: "" })).toBe("audio/amr");
  });

  it("영상일 수도 있는 확장자(.mp4 · .3gp · .webm)와 사진은 음성으로 보지 않는다", () => {
    expect(homeworkAudioType({ name: "clip.mp4", type: "video/mp4" })).toBeNull();
    expect(homeworkAudioType({ name: "clip.3gp", type: "video/3gpp" })).toBeNull();
    expect(homeworkAudioType({ name: "clip.webm", type: "" })).toBeNull();
    expect(homeworkAudioType({ name: "page.jpg", type: "image/jpeg" })).toBeNull();
    expect(homeworkAudioType({ name: "notes.pdf", type: "application/pdf" })).toBeNull();
  });

  it("고르기 칸의 accept 는 audio/* 와 녹음 확장자", () => {
    const parts = HOMEWORK_AUDIO_ACCEPT.split(",");
    expect(parts[0]).toBe("audio/*");
    expect(parts).toContain(".m4a");
    expect(parts).not.toContain(".mp4");
  });

  it("저장된 파일 가르기 — 사진 · 음성 · 그 밖(옛 첨부)", () => {
    expect(homeworkFileKind("image/jpeg")).toBe("photo");
    expect(homeworkFileKind("audio/mp4")).toBe("audio");
    expect(homeworkFileKind("audio/x-m4a")).toBe("audio");
    expect(homeworkFileKind("application/pdf")).toBe("other");
    expect(homeworkFileKind(null)).toBe("other");
  });

  it("건수 문구는 학생 카드 · 강사 목록이 같은 말을 쓴다", () => {
    const f = (content_type: string) => ({ content_type });
    expect(homeworkFilesLabel([f("image/jpeg"), f("image/png"), f("audio/mp4")])).toBe("사진 2장 · 음성 1개");
    expect(homeworkFilesLabel([f("audio/mpeg")])).toBe("음성 1개");
    expect(homeworkFilesLabel([f("image/jpeg")])).toBe("사진 1장");
    expect(homeworkFilesLabel([f("application/pdf")])).toBe("첨부 1개");
    expect(homeworkFilesLabel([])).toBe("");
  });
});

describe("homeworkFilesError — 폼과 서버 액션이 같은 규칙", () => {
  const photo = (size = 1000) => ({ type: "image/jpeg", size });
  const audio = (size = 1000) => ({ type: "audio/mp4", size });

  it("하나도 없으면 막는다 — 사진이든 음성이든 하나는 있어야 한다", () => {
    expect(homeworkFilesError([])).toContain("하나 이상");
  });

  it("음성만, 사진만, 섞어서 모두 낼 수 있다", () => {
    expect(homeworkFilesError([audio()])).toBeNull();
    expect(homeworkFilesError([photo()])).toBeNull();
    expect(homeworkFilesError([...Array.from({ length: MAX_PHOTOS }, () => photo()), ...Array.from({ length: MAX_AUDIOS }, () => audio())])).toBeNull();
  });

  it("사진 한도는 예전 그대로 10장 — 음성은 따로 센다", () => {
    expect(MAX_PHOTOS).toBe(10);
    expect(homeworkFilesError(Array.from({ length: MAX_PHOTOS + 1 }, () => photo()))).toContain(`${MAX_PHOTOS}장까지`);
    expect(homeworkFilesError(Array.from({ length: MAX_AUDIOS + 1 }, () => audio()))).toContain(`${MAX_AUDIOS}개까지`);
  });

  it("크기 — 사진 20MB · 음성 50MB (끝값은 들어간다)", () => {
    expect(homeworkFilesError([photo(MAX_PHOTO_MB * MB)])).toBeNull();
    expect(homeworkFilesError([photo(MAX_PHOTO_MB * MB + 1)])).toContain(`${MAX_PHOTO_MB}MB`);
    expect(homeworkFilesError([audio(MAX_AUDIO_MB * MB)])).toBeNull();
    expect(homeworkFilesError([audio(MAX_AUDIO_MB * MB + 1)])).toContain(`${MAX_AUDIO_MB}MB`);
    expect(homeworkFilesError([audio(0)])).toContain(`${MAX_AUDIO_MB}MB`);
  });

  it("사진 · 음성이 아닌 형식은 받지 않는다 (영상 · 문서)", () => {
    expect(homeworkFilesError([photo(), { type: "video/mp4", size: 1000 }])).toBe("사진이나 음성 파일만 올릴 수 있어요.");
    expect(homeworkFilesError([{ type: "application/pdf", size: 1000 }])).toBe("사진이나 음성 파일만 올릴 수 있어요.");
    expect(homeworkFilesError([{ type: null, size: 1000 }])).toBe("사진이나 음성 파일만 올릴 수 있어요.");
  });
});

describe("homework 버킷 — 마이그레이션과 같은 값", () => {
  const dir = "supabase/migrations";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  /** 버킷 설정을 바꾸는 마지막 파일(한 문장 안에 storage.buckets 와 'homework')이 이 값을 정한다 — 나중 파일이 또 바꾸면 이 테스트를 함께 고친다 */
  const touching = files.filter((f) => /storage\.buckets[^;]*'homework'/.test(readFileSync(`${dir}/${f}`, "utf8")));
  const last = readFileSync(`${dir}/${touching.at(-1)}`, "utf8");

  it("마지막으로 바꾼 파일은 사진 형식을 목록으로 좁힌 20261009120000 이다 (음성은 20261007120000 이 열었다)", () => {
    expect(touching.at(-1)).toBe("20261009120000_student_bucket_image_types.sql");
  });

  it("사진 형식 목록 + 음성(audio/*) — image/* 로 되돌리지 말 것 (SVG 가 들어온다, 2026-10-09 보안 검토). 한도는 음성을 연 파일의 50MB 그대로", () => {
    const homework = last.slice(last.indexOf("where id = 'homework'") - 400, last.indexOf("where id = 'homework'"));
    expect(homework).toContain("'audio/*'");
    expect(homework).toContain("'image/jpeg'");
    expect(homework).toContain("'image/heic'");
    expect(homework).not.toContain("'image/*'");
    expect(last).not.toContain("'image/svg+xml'");
    const audio = readFileSync(`${dir}/20261007120000_homework_audio.sql`, "utf8");
    expect(audio).toContain(`file_size_limit    = ${MAX_AUDIO_MB} * 1024 * 1024`);
    expect(MAX_PHOTO_MB).toBeLessThanOrEqual(MAX_AUDIO_MB);
  });
});

describe('숙제 음성은 간단한 플레이어로 듣는다 (2026-10-08 Alan — "녹음은 숙제제출이라서 저 기능은 필요없어")', () => {
  // src 아래 tsx 를 모두 읽어 <AudioPlayer … /> 를 꺼낸다 — 새로 쓰는 곳이 생겨도 저절로 걸린다
  const tsxFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = `${dir}/${e.name}`;
      return e.isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
    });
  const players = tsxFiles("src").flatMap((path) =>
    [...readFileSync(path, "utf8").matchAll(/<AudioPlayer\b[\s\S]*?\/>/g)].map((m) => ({ path, jsx: m[0] })),
  );
  const isBasic = (jsx: string) => /\sbasic(\s|=\{true\}|\/>)/.test(jsx);

  it("숙제 음성(/files/homework/) — 학생 제출 카드 · 강사 숙제점검 팝업 둘 다 basic (재생 · 위치 · 받기만)", () => {
    const homework = players.filter((p) => p.jsx.includes("/files/homework/"));
    expect(homework.map((p) => p.path).sort()).toEqual([
      "src/components/admin/homework/HomeworkDetail.tsx",
      "src/components/my/homework/SubmissionCard.tsx",
    ]);
    for (const p of homework) expect(isBasic(p.jsx), p.path).toBe(true);
  });

  it("LC 음원(/files/audio/)은 그대로 — 배속 · 구간반복은 LC 음원을 공부하는 도구다", () => {
    const lc = players.filter((p) => p.jsx.includes("/files/audio/"));
    expect(lc.length).toBeGreaterThanOrEqual(2); // 학생 수업일 달력 · 관리자 LC 음원 등록
    for (const p of lc) expect(isBasic(p.jsx), p.path).toBe(false);
  });

  it("올리기 전 미리 듣기(브라우저 기본 칸)도 크롬 ⋮ 메뉴의 재생 속도를 숨긴다", () => {
    const form = readFileSync("src/components/my/homework/HomeworkUploadForm.tsx", "utf8");
    const previews = [...form.matchAll(/<audio\b[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(previews).toHaveLength(1);
    expect(previews[0]).toMatch(/controlsList="[^"]*\bnoplaybackrate\b[^"]*"/);
  });
});
