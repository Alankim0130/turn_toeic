/**
 * 학생 관리 화면의 "올린 수강증" — 한 장마다 결과와 읽은 값을 한 줄로 (2026-10-02 Alan
 * "학생명단을 클릭해서 학생 계정을 하나씩 눌렀을 때, 학생이 직접올린 수강증을 볼 수 있으면 좋겠는데").
 *
 * 판정을 새로 하지 않는다 — `enrollment_verifications` 에 남은 기록을 사람이 읽을 말로 바꾸기만 한다.
 *   - 자동 승인: 자동 승인 길(`submitVerification` · `rematchHeldVerifications`)만 confidence 100 을 남긴다. 스태프 승인은 비워 둔다
 *   - 자동 반려: candidates.rule === "auto-reject" (기계가 돌려보낸 것 — `decidedBefore` 도 이 표시로 가른다)
 *   - 반 개설 대기: candidates.hold (다음 달 수강증을 받아 둔 것)
 */
import { heldMonth } from "./verify-decision";

export type ReceiptVerdict = { label: string; tone: "green" | "red" | "amber" | "gray"; note: string | null };

type Row = {
  result: string | null;
  confidence: number | string | null;
  reject_reason: string | null;
  candidates: unknown;
};

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

export function receiptVerdict(v: Row): ReceiptVerdict {
  const c = obj(v.candidates);
  if (v.result === "approved") return { label: Number(v.confidence) === 100 ? "자동 승인" : "승인", tone: "green", note: null };
  if (v.result === "rejected") return { label: c.rule === "auto-reject" ? "자동 반려" : "반려", tone: "red", note: v.reject_reason || null };
  const held = heldMonth(c.hold as number | undefined);
  if (held != null) return { label: `${held}월 반 개설 대기`, tone: "gray", note: `${held}월 반이 열리면 저절로 맞춰 배정해요` };
  return { label: "검토 대기", tone: "amber", note: null };
}

/** 읽은 값 한 줄 — "10월 · 650 · 주5일(월수금+화목금) · 10:00~12:10 · 불라방". 못 읽은 칸은 빼고, 하나도 없으면 "" */
export function receiptFacts(parsed: unknown): string {
  const p = obj(parsed);
  if (!Object.keys(p).length) return "";
  const parts: string[] = [];
  const month = typeof p.courseMonth === "number" ? p.courseMonth : typeof p.startMonth === "number" ? p.startMonth : null;
  if (month) parts.push(`${month}월`);
  if (typeof p.level === "number") parts.push(p.program === "sparta" ? `${p.level} 프리미어` : String(p.level));
  else if (p.program === "sparta") parts.push("프리미어");
  const tracks = Array.isArray(p.tracks) ? (p.tracks as string[]).map((t) => (t === "mwf" ? "월수금" : t === "ttf" ? "화목금" : t)) : [];
  if (typeof p.weekly === "number") parts.push(`주${p.weekly}일${tracks.length ? `(${tracks.join("+")})` : ""}`);
  else if (tracks.length) parts.push(tracks.join("+"));
  const block = obj(p.time).timeBlock;
  if (typeof block === "string" && block) parts.push(block);
  // 강의실 줄을 못 읽어 기본값으로 둔 방식은 판독이 아니다 (modeEvidence === null) — 적지 않는다
  if ("modeEvidence" in p ? p.modeEvidence != null : true) {
    if (p.mode === "live") parts.push("불라방");
    else if (p.mode === "onsite") parts.push("현장");
  }
  return parts.join(" · ");
}

/** 수강증 이름 대조 — 화면에 "이름 다름" 을 따로 적으려고 */
export const receiptNameMismatch = (parsed: unknown) => obj(parsed).nameMatches === false;
