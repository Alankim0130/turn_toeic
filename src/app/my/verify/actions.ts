"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/push";
import { createHash } from "node:crypto";
import { decideVerification, isCaptureFresh, type VerifyTerm } from "@/lib/verify-decision";
import { todayKST } from "@/lib/utils";
import { resolveEnrollChoice, type EnrollSection } from "@/lib/enroll-options";
import { getOpenEnrollSections } from "../_lib/queries";
import { parseReceipt, receiptComplete, receiptHasName, type ParsedReceipt } from "@/lib/receipt";
import { readReceiptText, tesseractOcr } from "@/lib/ocr";
import { matchSections } from "@/lib/match-sections";
import { assignedLabels } from "@/lib/assigned-label";
import { approveVerificationWith } from "@/lib/approve-verification";

export type SubmitVerificationResult =
  /**
   * approved = OCR 이 반을 찾아 바로 등업했다. preliminary = 개강 전이라 예비등록생. ocrNote = 수강증을 못 읽어 강사 검토로 간 이유(학생에게 보인다).
   * assigned = 배정된 반 한 줄들 — 팝업에 "이 반으로 승인됐어요, 맞나요?" (2026-09-18 Alan)
   */
  | { ok: true; approved?: boolean; preliminary?: boolean; ocrNote?: string; assigned?: string[] }
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

type Guard = { ok: false; error: string } | { ok: true; user: { id: string }; admin: ReturnType<typeof createAdminClient> };

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

  // 확인 중인 신청이 있으면 **새 수강증으로 바꿔 넣는다** (2026-09-18 Alan — "잘못 올린 경우 새로 올릴 수 있고,
  // 예전 기록이 새로 업로드하면 새 정보로 자동 교체". 그전에는 "처리가 끝난 뒤 다시 올려 주세요" 로 막아 시간이 낭비됐다).
  // 대기 중인 건은 등록·배정이 아직 없어 지워도 남는 것이 없고, 파일도 함께 지운다 (원본은 필요한 동안만 둔다 — 개인정보).
  // 승인·거절이 끝난 건은 그대로 둔다 (기록이다).
  const { data: pending } = await admin.from("enrollment_verifications").select("id, file_path").eq("user_id", user.id).is("result", null);
  for (const p of pending ?? []) {
    if (p.file_path && p.file_path !== filePath) await admin.storage.from("receipts").remove([p.file_path]);
    await admin.from("enrollment_verifications").delete().eq("id", p.id);
  }

  return { ok: true, user, admin };
}

function notifyNew(admin: ReturnType<typeof createAdminClient>, userId: string, manual: boolean) {
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

/** OCR 이 반을 찾아 바로 등업한 것도 스태프에게 알린다 — 승인 화면에서 확인·정정할 수 있게 */
function notifyAutoApproved(admin: ReturnType<typeof createAdminClient>, userId: string, status: "active" | "preliminary") {
  after(async () => {
    const { data: profile } = await admin.from("profiles").select("name").eq("id", userId).maybeSingle();
    await notifyStaff("verification", {
      title: "자동 등업 완료",
      body: `${profile?.name || "회원"}님의 수강증을 읽어 반을 배정했어요${status === "preliminary" ? " (개강 전 — 예비등록생)" : ""}. 잘못됐으면 승인 화면에서 정정해 주세요.`,
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
/** 못 읽었을 때도 **왜** 못 읽었는지는 남긴다 (`ocr_raw.error`) — 승인 화면과 Vercel 로그에서 원인을 볼 수 있게 */
type ReadReceipt = ReadOk | { ok: false; ocr: { engine: string; error: string } };

/**
 * 올라온 수강증을 서버에서 읽는다 (tesseract.js, `src/lib/ocr.ts`).
 * **못 읽어도 접수는 된다** — 스태프 검토로 간다 (`decideVerification`). 사유만 `ocr_raw` 에 남긴다.
 */
async function readReceipt(admin: ReturnType<typeof createAdminClient>, filePath: string, studentName: string | null): Promise<ReadReceipt> {
  const { data: file, error } = await admin.storage.from("receipts").download(filePath);
  if (error || !file) {
    console.error(`[ocr] 수강증 파일을 내려받지 못했어요: ${error?.message ?? "no file"}`);
    return { ok: false, ocr: { engine: tesseractOcr.name, error: "download_failed" } };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const outcome = await readReceiptText({ bytes, mimeType: file.type, filePath, enough: receiptComplete });
  if (!outcome.ok) return { ok: false, ocr: { engine: tesseractOcr.name, error: outcome.reason } };
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
  const { gates, mode, weekly, tracks, levels, level, program, times, time, months, tuition, warnings } = parsed;
  return { gates, mode, weekly, tracks, levels, level, program, times, time, months, tuition, warnings, nameMatches };
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
 *   ① 게이트 통과(우리 센터 · 역전토익) ② 수강증 이름 = 가입 실명 ③ 열린 반 중 레벨·과정·시간대·수강월·트랙이
 *   **딱 맞는 반이 정확히 그 수만큼**(주3일 1 · 주5일 2) 있음 (`matchSections`). 하나라도 어긋나면 스태프 검토로 간다 —
 *   애매한데 넣으면 오배정이고, 오배정은 남의 반 다시보기를 열어 준다.
 * 이미지가 아니거나(PDF) OCR 이 실패하면 읽은 것이 없으니 그대로 검토 대기로 간다.
 */
export async function submitVerification(input: { filePath: string }): Promise<SubmitVerificationResult> {
  const guarded = await guardUpload(String(input?.filePath ?? ""));
  if (!guarded.ok) return guarded;
  const { user, admin } = guarded;
  const filePath = String(input.filePath);

  const [sections, { data: profile }] = await Promise.all([
    getOpenEnrollSections(),
    admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
  ]);

  const outcome = await readReceipt(admin, filePath, profile?.name ?? null);
  const read = outcome.ok ? outcome : null;
  const decision = decideVerification(read?.parsed ?? null, openTermsOf(sections));
  const rejected = decision.kind === "reject";

  // 반 대조 — 거절되지 않은 것만. 기록은 자동 승인이 안 되더라도 스태프가 본다
  const match = !rejected && read ? matchSections(read.parsed, sections) : null;

  // 위조·돌려쓰기 의심 신호 (2026-09-18 Alan). 이미지만으로 위조를 가려낼 수는 없다 — 근본 대책은 YBM 등록 명단 대조(CLAUDE.md 미확정 11).
  // 여기서는 **자동 승인만 막고** 스태프에게 이유를 보여 준다. 거절하지 않는다 (진짜 학생일 수 있다).
  let duplicateImage = false;
  if (read) {
    const { count } = await admin.from("enrollment_verifications").select("id", { count: "exact", head: true }).eq("file_hash", read.hash).neq("user_id", user.id);
    duplicateImage = (count ?? 0) > 0; // 다른 계정이 같은 파일을 올렸다
  }
  const staleCapture = !!read && !isCaptureFresh(read.parsed.capturedOn, todayKST()); // 캡처가 45일 넘게 오래됐다
  const flags = { duplicateImage, staleCapture };

  const autoApprove =
    !!read &&
    !!match &&
    match.result.kind === "match" &&
    read.parsed.gates.academy &&
    read.parsed.gates.brand &&
    read.nameMatches === true &&
    !duplicateImage &&
    !staleCapture;

  const { data: inserted, error } = await admin
    .from("enrollment_verifications")
    .insert({
      user_id: user.id,
      file_path: filePath,
      source: "auto",
      result: rejected ? "rejected" : null,
      reject_reason: rejected ? decision.reason : null,
      ocr_raw: outcome.ocr,
      parsed: read ? parsedSummary(read) : null,
      file_hash: read?.hash ?? null,
      candidates: match ? { rule: "key-match", result: match.result, log: match.log, nameMatches: read!.nameMatches, flags } : null,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };

  if (rejected) {
    done();
    return { ok: false, rejected: true, reason: decision.reason };
  }

  if (autoApprove && match.result.kind === "match") {
    const approved = await approveVerificationWith(admin, {
      verificationId: inserted.id,
      userId: user.id,
      sectionIds: match.result.sectionIds,
      mode: read.parsed.mode,
      confidence: 100,
    });
    if (approved.ok) {
      notifyAutoApproved(admin, user.id, approved.status);
      done();
      return {
        ok: true,
        approved: true,
        preliminary: approved.status === "preliminary",
        assigned: assignedLabels(sections, match.result.sectionIds, read.parsed.mode),
      };
    }
    // 승인 단계에서 막히면(이미 같은 반에 배정 등) 검토 대기로 남긴다 — 접수는 됐다
  }

  notifyNew(admin, user.id, false);
  done();
  // 왜 자동으로 안 됐는지 학생에게도 말한다 — "접수됐어요" 만 보이면 거절도 승인도 안 된 이유를 알 수 없다 (2026-09-18 Alan 테스트)
  const ocrNote = !outcome.ok
    ? "수강증을 자동으로 읽지 못했어요. 강사가 직접 확인해 드려요."
    : decision.kind === "review" && decision.note
      ? "수강증 글자를 거의 읽지 못했어요. 강사가 직접 확인해 드려요."
      : undefined;
  return { ok: true, ocrNote };
}

/**
 * 수동 등업신청 — 학생이 **레벨 · 요일 · 시간대**를 직접 골라 낸다 (2026-09-17 Alan 요청).
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
  track: string;
  timeBlock: string;
}): Promise<SubmitVerificationResult> {
  const guarded = await guardUpload(String(input?.filePath ?? ""));
  if (!guarded.ok) return guarded;
  const { user, admin } = guarded;

  const sections = await getOpenEnrollSections();
  const resolved = resolveEnrollChoice(sections, {
    term: String(input?.term ?? ""),
    courseId: Number(input?.courseId) || undefined,
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

  const { error } = await admin.from("enrollment_verifications").insert({
    user_id: user.id,
    file_path: String(input.filePath),
    source: "manual",
    requested_section_ids: resolved.sectionIds,
    result: null,
    candidates: prior ? { correctionOf: prior.id } : null,
  });
  if (error) return { ok: false, error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };

  notifyNew(admin, user.id, true);
  done();
  return { ok: true };
}
