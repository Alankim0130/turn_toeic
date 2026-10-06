import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JUDGE_CHECKS, SLOW_AFTER_SECONDS, progressView } from "./verify-progress";

const states = (v: ReturnType<typeof progressView>) => v.steps.map((s) => `${s.label}:${s.state}`);

describe("progressView — 등업신청 판별 중 화면 (2026-10-06 Alan)", () => {
  it("올리는 동안: 올리기 단계가 지금 단계, 판별은 아직", () => {
    const v = progressView("upload", false, 1);
    expect(v.badge).toBe("올리는 중");
    expect(v.title).toBe("수강증을 올리고 있어요");
    expect(states(v)).toEqual(["올리기:active", "판별:todo", "결과:todo"]);
    expect(v.slow).toBeNull();
  });

  it("판별하는 동안: Alan 의 말 그대로 '판별 중' — 올리기는 끝났고 결과는 아직", () => {
    const v = progressView("judge", false, 2);
    expect(v.badge).toBe("판별 중");
    expect(v.title).toBe("지금 수강증을 판별하고 있어요");
    expect(states(v)).toEqual(["올리기:done", "판별:active", "결과:todo"]);
    expect(v.slow).toBeNull();
  });

  it("수동 등업신청은 판별(자동 등업)이 아니라 확인 · 접수다", () => {
    expect(states(progressView("upload", true, 0))).toEqual(["올리기:active", "확인:todo", "접수:todo"]);
    const v = progressView("judge", true, 0);
    expect(v.badge).toBe("확인 중");
    expect(v.title).toBe("수동 등업신청을 접수하고 있어요");
    expect(states(v)).toEqual(["올리기:done", "확인:active", "접수:todo"]);
  });

  it("한 단계가 오래 걸리면 까닭과 걸린 초 — 초는 내림, 그 전에는 없다", () => {
    expect(progressView("judge", false, SLOW_AFTER_SECONDS - 0.01).slow).toBeNull();
    const judge = progressView("judge", false, 23.9);
    expect(judge.slow).toMatchObject({ title: "조금 오래 걸리고 있어요", seconds: 23 });
    expect(judge.slow?.body).toContain("1분");
    const upload = progressView("upload", false, SLOW_AFTER_SECONDS);
    expect(upload.slow).toMatchObject({ title: "올리는 데 시간이 걸리고 있어요", seconds: SLOW_AFTER_SECONDS });
    // 단계가 바뀐 직후 시계가 아직 앞 단계 시각이면 음수가 들어온다 — 0 으로 본다
    expect(progressView("judge", false, -0.4).slow).toBeNull();
  });

  it("단계는 셋이고 지금 단계는 하나뿐 — 시간으로 짐작해 '끝났어요' 를 찍지 않는다", () => {
    for (const stage of ["upload", "judge"] as const) {
      for (const secs of [0, 3, 9, 30, 59]) {
        const v = progressView(stage, false, secs);
        expect(v.steps).toHaveLength(3);
        expect(v.steps.filter((s) => s.state === "active")).toHaveLength(1);
        // 결과 단계는 이 카드에서 늘 '아직' — 결과는 카드가 사라진 뒤 팝업 · 안내가 말한다
        expect(v.steps[2].state).toBe("todo");
      }
    }
  });

  it("판별에서 보는 칸 — 수강증에서 반을 가르는 것들", () => {
    expect(JUDGE_CHECKS).toEqual(["이름", "레벨", "요일", "시간", "수강월"]);
  });
});

describe("'길어도 1분 안에 끝나요' 가 참인가 — 서버 시간 상한과 맞춘다", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const ms = (src: string, name: string) => {
    const m = src.match(new RegExp(`const ${name} = ([\\d_]+)`));
    if (!m) throw new Error(`${name} 을 못 찾음`);
    return Number(m[1].replaceAll("_", ""));
  };

  it("차례 기다림 + 읽기 < 페이지 함수 상한 ≤ 60초", () => {
    const ocr = read("src/lib/ocr.ts");
    const wait = ms(ocr, "QUEUE_WAIT_MS");
    const timeout = ms(ocr, "TIMEOUT_MS");
    const maxDuration = Number(read("src/app/my/verify/page.tsx").match(/export const maxDuration = (\d+)/)?.[1]);
    expect(wait + timeout).toBeLessThan(maxDuration * 1000);
    // 이 값을 늘리면 판별 중 화면의 "길어도 1분" 도 고칠 것 (`progressView`)
    expect(maxDuration).toBeLessThanOrEqual(60);
  });
});
