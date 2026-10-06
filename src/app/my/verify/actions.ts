"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/push";
import { createHash } from "node:crypto";
import { decideVerification, type VerifyTerm } from "@/lib/verify-decision";
import { todayKST } from "@/lib/utils";
import { resolveEnrollChoice, type EnrollSection } from "@/lib/enroll-options";
import { getOpenEnrollSections } from "../_lib/queries";
import { fetchTwoWeekSlots } from "@/lib/open-sections";
import { parseReceipt, readEnoughFor, receiptHasName, receiptStudentName, type ParsedReceipt } from "@/lib/receipt";
import { nameMismatchOf, type NameMismatch } from "@/lib/name-mismatch";
import { readReceiptText, tesseractOcr } from "@/lib/ocr";
import { matchSections, twoWeekSpots } from "@/lib/match-sections";
import { assignedLabels } from "@/lib/assigned-label";
import { approveVerificationWith } from "@/lib/approve-verification";
import { receiptFlags, type FlagInput } from "@/lib/verify-flags";
import { autoApproveBlockers } from "@/lib/auto-approve";
import { readAutoVerify } from "@/lib/auto-verify";
import { sendTextbookNotice } from "@/lib/textbook-guide";
import type { TextbookNotice } from "@/lib/textbook";
import { replacePendingReceipts } from "@/lib/pending-receipts";
import { seatOfSections, type ReceiptSeat } from "@/lib/receipt-seat";
import { planClassChangeFor } from "@/lib/class-change-db";
import { classChangeLog } from "@/lib/class-change";

export type SubmitVerificationResult =
  /**
   * approved = OCR 이 반을 찾아 바로 등업했다. preliminary = 개강 전이라 예비등록생. ocrNote = 수강증을 못 읽어 강사 검토로 간 이유(학생에게 보인다).
   * assigned = 배정된 반 한 줄들 — 팝업에 "이 반으로 승인됐어요, 맞나요?" (2026-09-18 Alan)
   * held = 다음 달 수강증이라 받아 뒀다 — 그 달 반이 열리면 다시 맞춰 배정한다 (2026-09-22 Alan). note 는 학생에게 그대로 보인다
   */
  | {
      ok: true;
      approved?: boolean;
      preliminary?: boolean;
      ocrNote?: string;
      assigned?: string[];
      held?: { month: number; note: string };
      /** 수강증 `수강생` 칸의 이름이 가입 실명과 다르다 — 화면이 팝업으로 알린다 (2026-09-30 Alan). 이름을 또렷이 읽었을 때만 */
      nameMismatch?: NameMismatch;
      /** 이미 승인된 수강증을 또 올렸다 — 접수하지 않고 닫았다 (2026-10-02 Alan) */
      alreadyApproved?: boolean;
      /** 반을 바꾼 수강증이라 그 달 이전 반을 빼고 새 반으로 바꿨다 — 뺀 반 한 줄들 (2026-10-06 Alan "마지막에 올린 수강증을 기반으로 등업처리") */
      replaced?: string[];
      /** 불라방으로 등업됐다 — 내 반 교재비 안내 (2026-10-02 Alan "수강증 업로드를 하고 나면 거기에 맞춰서 교재비 안내"). 알림함에도 같은 것이 간다 */
      textbook?: TextbookNotice;
    }
  | { ok: false; error: string }
  | { ok: false; rejected: true; reason: string };

/** 열린 반이 속한 기수 = 지금 받는 수강월 */
function openTermsOf(sections: EnrollSection[]): VerifyTerm[] {
  const seen = new Map<string, VerifyTerm>();
  for (const s of sections) {
    if (s.term) seen.set(`${s.term.year}-${s.term.month}`, s.term);
  }
  return [...seen.values()];
}

type Admin = ReturnType<typeof createAdminClient>;
type Guard = { ok: false; error: string } | { ok: true; user: { id: string }; admin: Admin };

async function guardUpload(filePath: string): Promise<Guard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!filePath.startsWith(`${user.id}/`) || filePath.includes("..")) return { ok: false, error: "파일 경로가 올바르지 않습니다." };

  const admin = createAdminClient();

  // 실제로 올라간 파일인지 확인
  const fileName = filePath.slice(user.id.length + 1);
  const { data: listed, error: listError } = await admin.storage.from("receipts").list(user.id, { search: fileName, limit: 5 });
  if (listError || !listed?.some((f) => f.name === fileName)) {
    return { ok: false, error: "업로드된 파일을 찾을 수 없어요. 다시 시도해 주세요." };
  }

  // 확인 중인 옛 수강증을 바꿔 넣는 일은 **새 수강증을 읽은 뒤** 한다 (`replacePendingReceipts`, 2026-10-06) —
  // 같은 등록을 다시 낸 것일 때만 바꿔 넣고, 단과 두 개처럼 함께 들을 수 있는 다른 강좌의 수강증은 남긴다.
  // 그전에는 읽기 전에 여기서 확인 중인 것을 모두 지워서, 둘째 수강증을 올리면 첫째가 사라졌다.
  return { ok: true, user, admin };
}

function notifyNew(admin: Admin, userId: string, manual: boolean) {
  after(async () => {
    const { data: profile } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle();
    await notifyStaff("verification", {
      title: manual ? "새 등업신청 (수동)" : "새 등업신청",
      body: manual
        ? `${profile?.name || "회원"}님이 반을 직접 골라 신청했어요. 수강증을 확인해 주세요.`
        : `${profile?.name || "회원"}님이 수강증을 올렸어요. 확인해 주세요.`,
      url: "/admin/verifications?status=pending",
    });
  });
}

function done() {
  revalidatePath("/my");
  revalidatePath("/my/verify");
  revalidatePath("/admin");
  revalidatePath("/admin/verifications");
  revalidatePath("/admin/students");
}

/**
 * OCR 이 반을 찾아 바로 등업한 것도 스태프에게 알린다 — 승인 화면에서 확인·정정할 수 있게.
 * 반을 바꾼 수강증이면(2026-10-06) 그렇게 말한다 — 이전 반을 뺐으니 두 반을 함께 듣는 학생이면 강사가 되돌려야 한다
 */
function notifyAutoApproved(admin: Admin, userId: string, status: "active" | "preliminary", changed = false) {
  after(async () => {
    const { data: profile } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle();
    await notifyStaff("verification", {
      title: changed ? "자동 등업 완료 (반 변경)" : "자동 등업 완료",
      body: changed
        ? `${profile?.name || "회원"}님이 반을 바꾼 수강증을 올려 이전 반을 빼고 새 반으로 바꿨어요${status === "preliminary" ? " (개강 전 — 예비등록생)" : ""}. 잘못됐으면 승인 화면에서 정정해 주세요.`
        : `${profile?.name || "회원"}님의 수강증을 읽어 반을 배정했어요${status === "preliminary" ? " (개강 전 — 예비등록생)" : ""}. 잘못됐으면 승인 화면에서 정정해 주세요.`,
      url: "/admin/verifications?status=approved",
    });
  });
}

type ReadOk = {
  ok: true;
  parsed: ParsedReceipt;
  ocr: { engine: string; text: string; confidence: number | null };
  nameMatches: boolean | null;
  /** 파일 SHA-256 — 다른 계정이 같은 파일을 올렸는지 본다 (돌려쓰기 의심, 2026-09-18) */
  hash: string;
};
/**
 * 못 읽었을 때도 **왜** 못 읽었는지는 남긴다 (`ocr_raw.error`) — 승인 화면과 Vercel 로그에서 원인을 볼 수 있게.
 * **파일을 받았으면 해시는 OCR 과 상관없이 남긴다** (2026-09-22) — 예전에는 OCR 이 실패하면 해시를 버려서, 그 파일을
 * 나중에 다른 계정이 올려도 "같은 파일" 로 잡히지 않았다.
 */
type ReadFail = { ok: false; ocr: { engine: string; error: string }; hash: string | null };
type ReadReceipt = ReadOk | ReadFail;

/**
 * 올라온 수강증을 서버에서 읽는다 (tesseract.js, `src/lib/ocr.ts`).
 * **못 읽어도 접수는 된다** — 스태프 검토로 간다 (`decideVerification`). 사유만 `ocr_raw` 에 남긴다.
 */
async function readReceipt(admin: Admin, filePath: string, studentName: string | null, periodKeys?: ReadonlySet<string>): Promise<ReadReceipt> {
  const { data: file, error } = await admin.storage.from("receipts").download(filePath);
  if (error || !file) {
    console.error(`[ocr] 수강증 파일을 내려받지 못했어요: ${error?.message ?? "no file"}`);
    return { ok: false, ocr: { engine: tesseractOcr.name, error: "download_failed" }, hash: null };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  // 판독은 판정 키에 더해 **학생 이름까지** 읽혀야 멈춘다 (`readEnoughFor`) — 이름이 자동 승인 조건이다.
  // 2주완성이 열리는 레벨 · 시간이면 기간 숫자(4주 · 2주)까지 (2026-10-05 — `periodKeys` = `twoWeekSpots`).
  // 화면 색(팔레트)은 2026-10-06 부터 재지 않는다 (Alan "화면색상으로 위조를 잡아내는거는 안해도 괜찮을 것 같아" — `verify-flags.ts`)
  const outcome = await readReceiptText({ bytes, mimeType: file.type, filePath, enough: readEnoughFor(studentName, { periodKeys }) });
  if (!outcome.ok) return { ok: false, ocr: { engine: tesseractOcr.name, error: outcome.reason }, hash };
  const ocr = outcome.result;

  const parsed = parseReceipt(ocr.text);
  // 이름이 다르다고 **자동으로 거절하지는 않는다** — 이름 한 글자 오인식으로 멀쩡한 학생을 튕길 수 있다.
  // 스태프가 승인 화면에서 보고 판단한다 (게이트 G3).
  const nameMatches = studentName ? receiptHasName(parsed.text, studentName) : null;
  const confidence = (ocr.raw as { confidence?: unknown } | undefined)?.confidence;
  return {
    ok: true,
    parsed,
    ocr: { engine: ocr.engine, text: ocr.text, confidence: typeof confidence === "number" ? confidence : null },
    nameMatches,
    hash,
  };
}

/** 스태프 화면에 보여 줄 판독 결과. 원문은 ocr_raw 에 있으니 여기서는 뺀다 */
function parsedSummary({ parsed, nameMatches }: ReadOk) {
  const { gates, mode, modeEvidence, card, brandExact, weekly, tracks, levels, level, courseLevel, program, weeks, times, time, months, tuition, warnings } = parsed;
  // capturedAt 은 **중복 검사가 다시 읽는 값**이라 반드시 남긴다 (`parsed->>capturedAt`).
  // 수강월(배지 · 개강일 달)은 반 대조가 쓴 값이라 스태프가 "왜 이 달 반인가" 를 볼 수 있게 남긴다 (2026-09-22 — 예전에는 빠져 있었다)
  const { capturedOn, capturedAt, courseMonth, startMonth } = parsed;
  return {
    gates, mode, modeEvidence, card, brandExact, weekly, tracks, levels, level, courseLevel, program, weeks, times, time, months, courseMonth, startMonth,
    tuition, warnings, nameMatches, capturedOn, capturedAt,
  };
}

/**
 * 새로 올린 수강증의 자리 — 확인 중인 옛 수강증 중 **같은 등록을 다시 낸 것**만 바꿔 넣으려고 잰다 (`replacePendingReceipts`).
 * 반(대조가 찾은 반 · 학생이 고른 반)이 있으면 그 반들, 없으면 수강증에서 읽은 시간 · 트랙 · 수강월. 그림 자체(경로 · 해시 · 캡처 초)도 함께
 */
function uploadSeat(filePath: string, read: ReadReceipt, sections: EnrollSection[], sectionIds: readonly number[]): ReceiptSeat {
  const capture = { path: filePath, hash: read.hash, capturedAt: read.ok ? read.parsed.capturedAt : null };
  return seatOfSections(
    sections.filter((s) => sectionIds.includes(s.id)),
    capture,
    read.ok ? read.parsed : null,
  );
}

/** 올라온 수강증 한 장 → 위조 신호 검사 입력 (`receiptFlags`, 한곳에서 잰다 — `src/lib/verify-flags.ts`) */
function flagInput(userId: string, read: ReadReceipt, sectionIds: readonly number[]): FlagInput {
  const parsed = read.ok ? read.parsed : null;
  return { userId, hash: read.hash, capturedOn: parsed?.capturedOn ?? null, capturedAt: parsed?.capturedAt ?? null, sectionIds };
}

/**
 * 수강증만 올리는 기본 등업신청.
 *
 * **바로 거절할 수 있는 것은 바로 거절한다** (2026-09-17 Alan 요청) — 우리 수강증이 아니거나 수강월이 다르면
 * 검토 대기로 쌓지 않고 이유를 적어 돌려준다. 판정은 `decideVerification` 한곳이다.
 *
 * **OCR 은 tesseract.js 로 서버에서 돌린다** (2026-09-16 Alan: "무료 OCR 로 진행", `src/lib/ocr.ts`).
 * 읽은 원문은 `ocr_raw`, 판독 결과는 `parsed`, 반 대조 기록은 `candidates` 에 남겨 스태프 화면에서 보이게 한다.
 *
 * **자동 승인** (2026-09-18 Alan: "반을 찾아서 자동승인까지"): 다음이 **전부** 맞을 때만 바로 등업한다 —
 *   ① 게이트 통과(우리 센터 · 역전토익) ② 수강증 `수강생` 칸 = 가입 실명 ③ 열린 반 중 레벨·과정·시간대·수강월·트랙이
 *   **딱 맞는 반이 정확히 그 수만큼**(주3일 1 · 주5일 2) 있음 (`matchSections`) ④ 수강 방식을 강의실 칸에서 **읽어서** 정함
 *   ⑤ 그 달 반에 아직 배정돼 있지 않음 — **반을 바꾼 것이 분명하면 새 수강증으로 바꿔 넣는다** (2026-10-06 Alan, `class-change.ts`) ⑥ `역전토익` 글자 · 수강증 카드 칸 라벨이 보임
 *   ⑦ 같은 캡처를 전에 사람이 판정한 적 없음 (2026-09-22 ④~⑦ 추가 — ⑥⑦ 은 firsttoeic 운영 사고에서 배운 것). 하나라도 어긋나면 스태프 검토로 간다 —
 *   애매한데 넣으면 오배정이고, 오배정은 남의 반 다시보기를 열어 준다.
 * 이미지가 아니거나(PDF) OCR 이 실패하면 읽은 것이 없으니 그대로 검토 대기로 간다.
 *
 * **위조 신호 세 가지도 자동 승인을 막는다** (2026-09-18 · 2026-09-19 Alan). 셋 다 **거절하지 않는다** —
 * 스태프 검토로 보내고 승인 화면에 까닭을 적을 뿐이다. 진짜 학생이 걸릴 수 있기 때문이다.
 *   1. `duplicateImage` — 같은 파일(SHA-256)을 다른 계정이 올렸다
 *   2. `staleCapture` — 캡처한 지 45일이 넘었다 (지난 수강증 재사용)
 *   3. `sameCapture` — **같은 초**에 캡처된 수강증이 다른 계정에 있다. 수강증 맨 위 `현재시간` 은 초까지 찍히므로
 *      두 사람이 같은 초에 각자 캡처할 수 없다. 파일 해시와 달리 **글자를 고쳐도 살아남는다**
 *   (넷째였던 화면 색 검사 `paletteOff` 는 2026-10-06 에 뺐다 — 아이폰 넓은 색 공간 캡처의 진짜 수강증이 하루 7장 걸렸다. Alan "괜히 번거로운 것 같아")
 *
 * **학생에게는 "위조 의심" 을 말하지 않는다** — 진짜 학생에게 실례고, 위조하는 쪽에는 무엇을 고쳐야 하는지 알려 주는 꼴이다.
 * 학생 화면에는 늘 "강사가 직접 확인해 드려요" 만 나가고, 까닭은 승인 화면에만 적는다.
 *
 * **다음 달 수강증은 받아 둔다** (2026-09-22 Alan) — 그 달 반이 아직 없으면 거절하지 않고 `candidates.hold` 에 달을 적어 둔다.
 * 강사가 그 달 반을 열면 `rematchHeldVerifications` 가 같은 조건으로 다시 맞춰 예비등록생으로 배정한다. 지난달 수강증은 그대로 거절한다.
 *
 * **긴급 스위치**(`feature_flags.verification_auto`, 2026-09-22 Alan "자동 승인 긴급 스위치")가 꺼져 있으면 자동 거절·자동 승인 둘 다 하지 않는다 —
 * 전부 검토 대기로 가고, 켜져 있었다면 거절했을 건은 그 사유(`wouldReject`)를 승인 화면에 보여 준다. 읽지 못해도 꺼진 것으로 본다.
 */
export async function submitVerification(input: { filePath: string }): Promise<SubmitVerificationResult> {
  const guarded = await guardUpload(String(input?.filePath ?? ""));
  if (!guarded.ok) return guarded;
  const { user, admin } = guarded;
  const filePath = String(input.filePath);

  const [sections, { data: profile }, auto, twoWeekSlots] = await Promise.all([
    getOpenEnrollSections(),
    admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    // 긴급 스위치 (2026-09-22) — 꺼져 있으면(읽지 못해도) 기계가 판정하지 않는다: 자동 거절도 자동 승인도 없이 전부 검토 대기
    readAutoVerify(admin),
    // 2주완성이 열리는 자리 (2026-10-05) — 그 자리의 수강증은 기간 숫자(4주 · 2주)까지 읽고, 못 읽은 한 달 수강증은 사람이 본다
    fetchTwoWeekSlots(admin),
  ]);
  const spots = twoWeekSpots(sections, twoWeekSlots);

  const outcome = await readReceipt(admin, filePath, profile?.name ?? null, spots);
  const read = outcome.ok ? outcome : null;
  const decision = decideVerification(read?.parsed ?? null, openTermsOf(sections), todayKST());
  // 수강증 이름 ≠ 가입 실명 — 거절하지 않고(오인식일 수 있다) 검토로 보내되, 학생에게 팝업으로 알린다 (2026-09-30 Alan)
  const nameMismatch = read ? nameMismatchOf(read.nameMatches, receiptStudentName(read.parsed.text), profile?.name) : undefined;
  const rejected = decision.kind === "reject" && auto.on;
  // 다음 달 수강증인데 그 달 반이 아직 없다 — 거절하지 않고 받아 둔다. 반이 열리면 `rematchHeldVerifications` 가 다시 맞춘다
  const held = decision.kind === "upcoming" ? decision.month : null;

  // 반 대조 — 거절되지 않은 것만. 기록은 자동 승인이 안 되더라도 스태프가 본다
  const match = !rejected && read ? matchSections(read.parsed, sections, { twoWeekSpots: spots }) : null;
  const matched = match?.result.kind === "match" ? match.result : null;

  // 위조·돌려쓰기 의심 신호 + 이미 그 달 반에 있는가 (2026-09-18 · 2026-09-22). 이미지만으로 위조를 가려낼 수는 없다 —
  // 근본 대책은 YBM 등록 명단 대조(CLAUDE.md 미확정 11). 여기서는 **자동 승인만 막고** 스태프에게 이유를 보여 준다.
  const flags = rejected ? null : await receiptFlags(admin, flagInput(user.id, outcome, matched?.sectionIds ?? []));
  // 자동 승인 조건은 한곳(`auto-approve.ts`) — 받아 둔 예비 접수를 다시 맞출 때도 같은 조건을 본다
  const blockers =
    read && flags ? autoApproveBlockers({ parsed: read.parsed, nameMatches: read.nameMatches, flags, matched: !!matched, periodUnclear: matched?.periodUnclear === true }) : null;
  // 반을 바꾼 수강증 (2026-10-06 Alan — "마지막에 올린 수강증을 기반으로 등업처리를 해주면 좋겠어"). 그 달 반에 이미 있다는 것 **하나만** 걸렸으면
  // 바꾼 것이 분명한지 본다 (`class-change.ts` — 같은 반 · 시간이 겹침 · 같은 레벨). 분명하면 새 수강증대로 등업하고 그 달 이전 등록을 뺀다.
  // 단과를 하나 더 산 것일 수 있거나 · 다른 레벨이거나 · 강사가 직접 넣은 배정이면 예전처럼 강사가 본다
  const onlyEnrolled = !!blockers && blockers.length > 0 && blockers.every((b) => b === "already_enrolled");
  const change = auto.on && held == null && matched && onlyEnrolled ? await planClassChangeFor(admin, user.id, matched.sectionIds) : null;
  const replace = change?.kind === "replace" ? change : null;
  const changeLog = change ? classChangeLog(change) : null;
  // 받아 두는 수강증은 지금 배정하지 않는다 — 날짜로만 달을 읽은 수강증은 대조가 다른 달 반을 고를 수 있다
  const autoApprove = auto.on && held == null && !!matched && (blockers?.length === 0 || !!replace);
  // 이미 승인된 수강증을 또 올렸다 (2026-10-02 Alan — 승인 뒤 같은 캡처를 다시 올려 검토 대기에 쌓이던 것):
  // 같은 캡처가 전에 승인됐고 그 반에 이미 배정돼 있으면 검토 대기에 넣지 않고 바로 닫는다. 기록은 남긴다
  const alreadyApproved = !rejected && !!flags && flags.decidedBefore === "approved" && flags.alreadyEnrolled.length > 0;

  // 같은 등록을 다시 낸 것이면 확인 중인 옛 수강증을 지우고 바꿔 넣는다 (2026-09-18 → 2026-10-06 같은 등록일 때만).
  // 바로 거절한 것은 바꿔 넣지 않는다 — 접수되지 않았으니 확인 중이던 수강증을 대신하지 못한다
  if (!rejected) await replacePendingReceipts(admin, user.id, filePath, uploadSeat(filePath, outcome, sections, matched?.sectionIds ?? []));

  const { data: inserted, error } = await admin
    .from("enrollment_verifications")
    .insert({
      user_id: user.id,
      file_path: filePath,
      source: "auto",
      result: rejected ? "rejected" : alreadyApproved ? "closed" : null,
      reject_reason: rejected && decision.kind === "reject" ? decision.reason : alreadyApproved ? "이미 같은 수강증으로 승인돼 있어요" : null,
      ocr_raw: outcome.ocr,
      parsed: read ? parsedSummary(read) : null,
      // OCR 이 실패해도 파일을 받았으면 남긴다 — 다음에 누가 같은 파일을 올리면 잡힌다
      file_hash: outcome.hash,
      // OCR 을 못 해 대조가 없어도 위조 신호(같은 파일 · 색)는 스태프에게 보인다.
      // 자동 거절은 표시를 남긴다 — 같은 캡처를 다시 낼 때 "강사가 반려한 것" 과 가르려고 (`decidedBefore`)
      candidates:
        flags
          ? {
              rule: "key-match",
              result: match?.result ?? null,
              log: match?.log ?? [],
              nameMatches: read?.nameMatches ?? null,
              flags,
              ...(blockers ? { blockers } : {}),
              ...(changeLog ? { classChange: changeLog } : {}),
              ...(held != null ? { hold: held } : {}),
              // 스위치가 꺼져 있을 때 올라온 것 — 켜져 있었다면 거절했을 건은 그 사유를 스태프에게 보여 준다
              ...(auto.on ? {} : { autoOff: auto.reason, ...(decision.kind === "reject" ? { wouldReject: { code: decision.code, reason: decision.reason } } : {}) }),
            }
          : decision.kind === "reject"
            ? { rule: "auto-reject", code: decision.code }
            : null,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };

  if (rejected && decision.kind === "reject") {
    done();
    return { ok: false, rejected: true, reason: decision.reason };
  }
  if (alreadyApproved) {
    done();
    return { ok: true, alreadyApproved: true };
  }

  if (autoApprove && read && matched) {
    const approved = await approveVerificationWith(admin, {
      verificationId: inserted.id,
      userId: user.id,
      sectionIds: matched.sectionIds,
      mode: read.parsed.mode,
      confidence: 100,
      ...(replace ? { replace: { absorb: replace.absorb, remove: replace.remove } } : {}),
    });
    if (approved.ok) {
      notifyAutoApproved(admin, user.id, approved.status, !!replace && replace.remove.length > 0);
      // 불라방이면 그 달 내 반 교재비를 팝업과 알림함에 (그 달 이미 안내했거나 교재 · 계좌가 아직 없으면 없다)
      const textbook = read.parsed.mode === "live" ? await sendTextbookNotice(admin, user.id, approved.termId) : null;
      done();
      return {
        ok: true,
        approved: true,
        preliminary: approved.status === "preliminary",
        assigned: assignedLabels(sections, matched.sectionIds, read.parsed.mode),
        // 뺀 이전 반 — 같은 반을 다시 캡처했거나 수강 방식만 바뀌었으면 뺀 반이 없다
        ...(replace && replace.remove.length > 0
          ? { replaced: assignedLabels(sections, replace.remove.map((e) => e.section.id), replace.remove[0].mode === "live" ? "live" : "onsite") }
          : {}),
        ...(textbook ? { textbook } : {}),
      };
    }
    // 승인 단계에서 막히면(이미 같은 반에 배정 등) 검토 대기로 남긴다 — 접수는 됐다
  }

  // 받아 둔 예비 접수 — 스태프에게 지금 알리지 않는다 (배정할 반이 아직 없다). 반이 열려 다시 맞출 때 한 번에 알린다
  if (held != null && decision.kind === "upcoming") {
    done();
    return { ok: true, held: { month: held, note: decision.note }, nameMismatch };
  }

  notifyNew(admin, user.id, false);
  done();
  // 왜 자동으로 안 됐는지 학생에게도 말한다 — "접수됐어요" 만 보이면 거절도 승인도 안 된 이유를 알 수 없다 (2026-09-18 Alan 테스트).
  // **위조 신호는 말하지 않는다** (위 설명). 이미 배정된 반이 있다는 것은 학생 본인의 사정이라 알려 준다
  const ocrNote = !outcome.ok
    ? outcome.ocr.error === "ocr_busy"
      ? "지금 수강증이 한꺼번에 많이 올라와 자동으로 읽지 못했어요. 강사가 직접 확인해 드려요 — 잠시 뒤 다시 올리면 바로 확인될 수도 있어요."
      : "수강증을 자동으로 읽지 못했어요. 강사가 직접 확인해 드려요."
    : decision.kind === "review" && decision.note
      ? "수강증 글자를 거의 읽지 못했어요. 강사가 직접 확인해 드려요."
      : flags && flags.alreadyEnrolled.length > 0
        ? "이 달 반이 이미 있어서, 반을 더하는 건지(단과 두 개 등) 바꾸는 건지 강사가 확인한 뒤 반영해 드려요."
        : undefined;
  return { ok: true, ocrNote, nameMismatch };
}

/**
 * 수동 등업신청 — 학생이 **레벨 · 종합/단과 · 요일 · 시간대**를 직접 골라 낸다 (2026-09-17 Alan 요청 → 2026-10-06 단과도 고른다).
 * 자동 판정이 틀렸을 때의 길이다.
 *
 * **고른 것이 곧 배정은 아니다.** 여기서는 "이렇게 신청했다" 만 기록하고, 수강증이 진짜인지는 스태프가 보고 승인한다 —
 * 그러지 않으면 아무 파일이나 올리고 원하는 반을 스스로 가져갈 수 있다.
 * 화면이 보낸 반 id 는 믿지 않고 **서버가 `resolveEnrollChoice` 로 다시 푼다.**
 */
export async function submitManualVerification(input: {
  filePath: string;
  term: string;
  courseId: number;
  /** 종합 · 단과 (full · rc · lc, 2026-10-06) — 그 레벨에 한 가지뿐이면 비어 와도 된다 (`resolveEnrollChoice`) */
  kind?: string;
  track: string;
  timeBlock: string;
}): Promise<SubmitVerificationResult> {
  const guarded = await guardUpload(String(input?.filePath ?? ""));
  if (!guarded.ok) return guarded;
  const { user, admin } = guarded;
  const filePath = String(input.filePath);

  const [sections, { data: profile }, twoWeekSlots] = await Promise.all([
    getOpenEnrollSections(),
    admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    fetchTwoWeekSlots(admin),
  ]);
  const resolved = resolveEnrollChoice(sections, {
    term: String(input?.term ?? ""),
    courseId: Number(input?.courseId) || undefined,
    kind: String(input?.kind ?? ""),
    track: String(input?.track ?? ""),
    timeBlock: String(input?.timeBlock ?? ""),
  });
  if (!resolved.ok) return { ok: false, error: resolved.reason };

  // 자동 승인된 뒤 "반이 달라요" 로 온 정정 요청인가 (2026-09-18 Alan 팝업). 그 달 반으로 이미 승인된 수강증이 있으면 그 id 를 남겨
  // 스태프가 새로 승인하지 않고 기존 승인의 '배정 수정' 에서 고치게 한다 — 새로 승인하면 등록이 두 건 생긴다.
  const termSectionIds = sections.filter((s) => s.term && `${s.term.year}-${String(s.term.month).padStart(2, "0")}` === String(input.term)).map((s) => s.id);
  const { data: prior } = termSectionIds.length
    ? await admin.from("enrollment_verifications").select("id").eq("user_id", user.id).eq("result", "approved").in("matched_section", termSectionIds).order("id", { ascending: false }).limit(1).maybeSingle()
    : { data: null };

  // **수동 신청도 같은 수강증 검사를 한다** (2026-09-22). 예전에는 수동 신청에 아무 검사가 없어서, 위조 신호 네 가지가
  // 자동 승인만 막고 **수동 등업신청으로 내면 파일 중복 · 같은 초 캡처 · 색 검사를 모두 비껴갔다** — 셋 다 스태프가 그림을 봐서는
  // 알 수 없는 신호다. 판정(거절 · 자동 승인)은 하지 않고 승인 화면에만 적는다 — 수동 신청은 늘 스태프가 본다.
  // 읽은 레벨·시간·이름도 함께 남아 스태프가 학생이 고른 반과 수강증을 맞대 볼 수 있다
  const outcome = await readReceipt(admin, filePath, profile?.name ?? null, twoWeekSpots(sections, twoWeekSlots));
  const read = outcome.ok ? outcome : null;
  const flags = await receiptFlags(admin, flagInput(user.id, outcome, resolved.sectionIds));

  // 같은 등록(같은 그림 · 같은 반 · 같은 시간)을 다시 낸 것만 바꿔 넣는다 — 단과를 둘 산 학생이 수동 신청을 두 번 내도 첫째가 남는다 (2026-10-06)
  await replacePendingReceipts(admin, user.id, filePath, uploadSeat(filePath, outcome, sections, resolved.sectionIds));

  const { error } = await admin.from("enrollment_verifications").insert({
    user_id: user.id,
    file_path: filePath,
    source: "manual",
    requested_section_ids: resolved.sectionIds,
    result: null,
    ocr_raw: outcome.ocr,
    parsed: read ? parsedSummary(read) : null,
    file_hash: outcome.hash,
    candidates: { ...(prior ? { correctionOf: prior.id } : {}), nameMatches: read?.nameMatches ?? null, flags },
  });
  if (error) return { ok: false, error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };

  notifyNew(admin, user.id, true);
  done();
  return { ok: true, nameMismatch: read ? nameMismatchOf(read.nameMatches, receiptStudentName(read.parsed.text), profile?.name) : undefined };
}
