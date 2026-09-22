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
import { parseReceipt, readEnoughFor, receiptHasName, type ParsedReceipt } from "@/lib/receipt";
import { readReceiptText, tesseractOcr } from "@/lib/ocr";
import { measurePalette } from "@/lib/ocr-image";
import { paletteVerdict, type PaletteShares } from "@/lib/receipt-forensics";
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

  // 확인 중인 신청이 있으면 **새 수강증으로 바꿔 넣는다** (2026-09-18 Alan — "잘못 올린 경우 새로 올릴 수 있고,
  // 예전 기록이 새로 업로드하면 새 정보로 자동 교체". 그전에는 "처리가 끝난 뒤 다시 올려 주세요" 로 막아 시간이 낭비됐다).
  // 대기 중인 건은 등록·배정이 아직 없어 지워도 남는 것이 없고, 파일도 함께 지운다 (원본은 필요한 동안만 둔다 — 개인정보).
  // 승인·거절이 끝난 건은 그대로 둔다 (기록이다).
  //
  // **다른 신청이 아직 가리키는 파일은 지우지 않는다** (2026-09-22). 수동 등업신청은 거절·승인된 신청의 파일을 그대로 다시 쓴다
  // (거절 뒤 수동으로 내기 · 자동 승인 뒤 "반이 달라요"). 그 대기 건을 지우며 파일까지 지우면 **승인·거절 기록의 수강증 그림이
  // 사라져** 스태프가 다시 볼 수 없었다. 확인 조회가 실패하면 지우지 않는다 — 고아 파일이 남는 편이 기록의 그림을 지우는 것보다 낫다.
  const { data: pending } = await admin.from("enrollment_verifications").select("id, file_path").eq("user_id", user.id).is("result", null);
  const pendingIds = (pending ?? []).map((p) => p.id);
  const oldPaths = [...new Set((pending ?? []).map((p) => p.file_path).filter((p) => !!p && p !== filePath))];
  let removable: string[] = [];
  if (oldPaths.length > 0) {
    const { data: refs, error: refError } = await admin.from("enrollment_verifications").select("id, file_path").in("file_path", oldPaths);
    if (!refError) {
      const stillUsed = new Set((refs ?? []).filter((r) => !pendingIds.includes(r.id)).map((r) => r.file_path));
      removable = oldPaths.filter((p) => !stillUsed.has(p));
    }
  }
  if (removable.length > 0) await admin.storage.from("receipts").remove(removable);
  if (pendingIds.length > 0) await admin.from("enrollment_verifications").delete().in("id", pendingIds);

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

/** OCR 이 반을 찾아 바로 등업한 것도 스태프에게 알린다 — 승인 화면에서 확인·정정할 수 있게 */
function notifyAutoApproved(admin: Admin, userId: string, status: "active" | "preliminary") {
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
  /** 화면의 색이 YBM 수강증 팔레트와 맞는가 (2026-09-19, `src/lib/receipt-forensics.ts`). 못 쟀으면 null */
  palette: PaletteShares | null;
};
/**
 * 못 읽었을 때도 **왜** 못 읽었는지는 남긴다 (`ocr_raw.error`) — 승인 화면과 Vercel 로그에서 원인을 볼 수 있게.
 * **파일을 받았으면 해시·색은 OCR 과 상관없이 남긴다** (2026-09-22) — 예전에는 OCR 이 실패하면 해시를 버려서, 그 파일을
 * 나중에 다른 계정이 올려도 "같은 파일" 로 잡히지 않았다.
 */
type ReadFail = { ok: false; ocr: { engine: string; error: string }; hash: string | null; palette: PaletteShares | null };
type ReadReceipt = ReadOk | ReadFail;

/**
 * 올라온 수강증을 서버에서 읽는다 (tesseract.js, `src/lib/ocr.ts`).
 * **못 읽어도 접수는 된다** — 스태프 검토로 간다 (`decideVerification`). 사유만 `ocr_raw` 에 남긴다.
 */
async function readReceipt(admin: Admin, filePath: string, studentName: string | null): Promise<ReadReceipt> {
  const { data: file, error } = await admin.storage.from("receipts").download(filePath);
  if (error || !file) {
    console.error(`[ocr] 수강증 파일을 내려받지 못했어요: ${error?.message ?? "no file"}`);
    return { ok: false, ocr: { engine: tesseractOcr.name, error: "download_failed" }, hash: null, palette: null };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  // 색 팔레트는 OCR 과 무관하게 잰다 — 글자를 못 읽어도 "우리 화면인가" 는 알 수 있다 (실측 35~54ms).
  // 판독은 판정 키에 더해 **학생 이름까지** 읽혀야 멈춘다 (`readEnoughFor`) — 이름이 자동 승인 조건이다
  const [outcome, palette] = await Promise.all([
    readReceiptText({ bytes, mimeType: file.type, filePath, enough: readEnoughFor(studentName) }),
    measurePalette(bytes),
  ]);
  if (!outcome.ok) return { ok: false, ocr: { engine: tesseractOcr.name, error: outcome.reason }, hash, palette };
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
    palette,
  };
}

/** 스태프 화면에 보여 줄 판독 결과. 원문은 ocr_raw 에 있으니 여기서는 뺀다 */
function parsedSummary({ parsed, nameMatches }: ReadOk) {
  const { gates, mode, modeEvidence, weekly, tracks, levels, level, courseLevel, program, times, time, months, tuition, warnings } = parsed;
  // capturedAt 은 **중복 검사가 다시 읽는 값**이라 반드시 남긴다 (`parsed->>capturedAt`).
  // 수강월(배지 · 개강일 달)은 반 대조가 쓴 값이라 스태프가 "왜 이 달 반인가" 를 볼 수 있게 남긴다 (2026-09-22 — 예전에는 빠져 있었다)
  const { capturedOn, capturedAt, courseMonth, startMonth } = parsed;
  return {
    gates, mode, modeEvidence, weekly, tracks, levels, level, courseLevel, program, times, time, months, courseMonth, startMonth,
    tuition, warnings, nameMatches, capturedOn, capturedAt,
  };
}

/**
 * 자동 승인을 막는 신호들 — 승인 화면에 까닭으로 적는다. **거절하지 않는다** (진짜 학생일 수 있다).
 * 수강증만 올리기와 수동 등업신청이 **같은 검사**를 한다 (2026-09-22 — 예전에는 수동 신청에 아무 검사가 없어 그 길로 다 비껴갔다).
 */
type VerifyFlags = {
  duplicateImage: boolean;
  staleCapture: boolean;
  sameCapture: boolean;
  paletteOff: boolean;
  paletteNote: string;
  palette: PaletteShares | null;
  /** 이미 그 달(기수) 반에 배정돼 있다 — 새로 승인하면 등록이 두 건 생긴다 (2026-09-22). 배정된 반 id */
  alreadyEnrolled: number[];
};

async function receiptFlags(admin: Admin, userId: string, read: ReadReceipt, sectionIds: readonly number[]): Promise<VerifyFlags> {
  // 1. 같은 파일(SHA-256)을 다른 계정이 올렸다 — 돌려쓰기
  let duplicateImage = false;
  if (read.hash) {
    const { count } = await admin.from("enrollment_verifications").select("id", { count: "exact", head: true }).eq("file_hash", read.hash).neq("user_id", userId);
    duplicateImage = (count ?? 0) > 0;
  }
  const parsed = read.ok ? read.parsed : null;
  // 2. 캡처가 45일 넘게 오래됐다
  const staleCapture = !!parsed && !isCaptureFresh(parsed.capturedOn, todayKST());

  // 3. **같은 초에 캡처된 수강증이 다른 계정에도 있다** (2026-09-19). 수강증 맨 위 `현재시간` 은 초까지 찍히므로
  // 두 사람이 같은 초에 각자 캡처할 수는 없다 — 한쪽이 상대의 그림을 받아 쓴 것이다.
  // **파일 해시와 달리 글자를 고쳐도 살아남는다** (친구 수강증에 자기 이름만 얹은 경우).
  // 지금은 훑어 세지만(수강증이 수천 건 수준) 느려지면 `parsed->>'capturedAt'` 에 인덱스를 건다.
  // **조회가 실패하면 통과시킨다** — 근거 없이 막지 않는다. 다만 조용히 넘어가지 않게 로그는 남긴다
  let sameCapture = false;
  if (parsed?.capturedAt) {
    const { count, error: dupError } = await admin
      .from("enrollment_verifications")
      .select("id", { count: "exact", head: true })
      .eq("parsed->>capturedAt", parsed.capturedAt)
      .neq("user_id", userId);
    if (dupError) console.error(`[verify] 캡처 시각 중복을 확인하지 못했어요: ${dupError.message}`);
    sameCapture = (count ?? 0) > 0;
  }

  // 4. **색 팔레트** — YBM 수강증 화면의 색(파란 티켓 카드 · 노란 과정 배지)이 큰 면적을 차지하는가. 못 쟀으면 판단하지 않는다.
  // 실측: 진짜 37.8~40.0%(카톡 JPEG q70 · 1080px 축소 포함) vs 생성물·다른 사진 0.00~0.05% (`src/lib/receipt-forensics.ts`)
  const palette = paletteVerdict(read.palette);

  return {
    duplicateImage,
    staleCapture,
    sameCapture,
    paletteOff: !palette.ok,
    paletteNote: palette.note,
    palette: read.palette,
    alreadyEnrolled: await enrolledInSameTerm(admin, userId, sectionIds),
  };
}

/**
 * 이 반들과 **같은 달(기수)** 에 이미 배정된 반 (2026-09-22).
 * 자동 승인은 등록을 새로 만든다 — 이미 그 달 반에 있는 학생(같은 수강증을 다시 올림 · YBM 에서 반을 바꿈)을 자동으로 넣으면
 * 같은 반이면 승인이 실패해 까닭 없는 검토 대기가 되고, 다른 반이면 **옛 반과 새 반을 둘 다** 듣게 된다. 그래서 스태프에게 넘긴다.
 * 조회가 실패하면 빈 배열이다 (막지 않는다) — 같은 반이면 승인 단계의 중복 검사(23505)가 한 번 더 막는다.
 */
async function enrolledInSameTerm(admin: Admin, userId: string, sectionIds: readonly number[]): Promise<number[]> {
  if (sectionIds.length === 0) return [];
  const { data: target } = await admin.from("class_sections").select("term_id").in("id", [...sectionIds]);
  const termIds = new Set((target ?? []).map((s) => s.term_id));
  if (termIds.size === 0) return [];
  const { data: mine } = await admin
    .from("enrollments")
    .select("section_id, section:class_sections!enrollments_section_id_fkey(term_id)")
    .eq("student_id", userId);
  return (mine ?? []).flatMap((e) => (e.section_id != null && e.section && termIds.has(e.section.term_id) ? [e.section_id] : []));
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
 *   **딱 맞는 반이 정확히 그 수만큼**(주3일 1 · 주5일 2) 있음 (`matchSections`) ④ 수강 방식을 강의실 줄로 **읽어서** 정함
 *   ⑤ 그 달 반에 아직 배정돼 있지 않음 (2026-09-22 ④⑤ 추가). 하나라도 어긋나면 스태프 검토로 간다 —
 *   애매한데 넣으면 오배정이고, 오배정은 남의 반 다시보기를 열어 준다.
 * 이미지가 아니거나(PDF) OCR 이 실패하면 읽은 것이 없으니 그대로 검토 대기로 간다.
 *
 * **위조 신호 네 가지도 자동 승인을 막는다** (2026-09-18 · 2026-09-19 Alan). 넷 다 **거절하지 않는다** —
 * 스태프 검토로 보내고 승인 화면에 까닭을 적을 뿐이다. 진짜 학생이 걸릴 수 있기 때문이다.
 *   1. `duplicateImage` — 같은 파일(SHA-256)을 다른 계정이 올렸다
 *   2. `staleCapture` — 캡처한 지 45일이 넘었다 (지난 수강증 재사용)
 *   3. `sameCapture` — **같은 초**에 캡처된 수강증이 다른 계정에 있다. 수강증 맨 위 `현재시간` 은 초까지 찍히므로
 *      두 사람이 같은 초에 각자 캡처할 수 없다. 파일 해시와 달리 **글자를 고쳐도 살아남는다**
 *   4. `paletteOff` — 화면 색이 YBM 수강증 팔레트가 아니다 (`src/lib/receipt-forensics.ts`).
 *      AI 로 만들었거나 손으로 그린 그림, 다른 학원 수강증이 여기 걸린다
 *
 * **학생에게는 "위조 의심" 을 말하지 않는다** — 진짜 학생에게 실례고, 위조하는 쪽에는 무엇을 고쳐야 하는지 알려 주는 꼴이다.
 * 학생 화면에는 늘 "강사가 직접 확인해 드려요" 만 나가고, 까닭은 승인 화면에만 적는다.
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
  const matched = match?.result.kind === "match" ? match.result : null;

  // 위조·돌려쓰기 의심 신호 + 이미 그 달 반에 있는가 (2026-09-18 · 2026-09-22). 이미지만으로 위조를 가려낼 수는 없다 —
  // 근본 대책은 YBM 등록 명단 대조(CLAUDE.md 미확정 11). 여기서는 **자동 승인만 막고** 스태프에게 이유를 보여 준다.
  const flags = rejected ? null : await receiptFlags(admin, user.id, outcome, matched?.sectionIds ?? []);

  const autoApprove =
    !!read &&
    !!matched &&
    !!flags &&
    read.parsed.gates.academy &&
    read.parsed.gates.brand &&
    read.nameMatches === true &&
    // 수강 방식을 **읽어서** 정했을 때만 — 강의실 줄을 못 읽어 기본값(현장)으로 둔 것은 짐작이다 (2026-09-22)
    read.parsed.modeEvidence != null &&
    !flags.duplicateImage &&
    !flags.staleCapture &&
    !flags.sameCapture &&
    !flags.paletteOff &&
    flags.alreadyEnrolled.length === 0;

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
      // OCR 이 실패해도 파일을 받았으면 남긴다 — 다음에 누가 같은 파일을 올리면 잡힌다
      file_hash: outcome.hash,
      // OCR 을 못 해 대조가 없어도 위조 신호(같은 파일 · 색)는 스태프에게 보인다
      candidates: flags ? { rule: "key-match", result: match?.result ?? null, log: match?.log ?? [], nameMatches: read?.nameMatches ?? null, flags } : null,
    })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };

  if (rejected) {
    done();
    return { ok: false, rejected: true, reason: decision.reason };
  }

  if (autoApprove && read && matched) {
    const approved = await approveVerificationWith(admin, {
      verificationId: inserted.id,
      userId: user.id,
      sectionIds: matched.sectionIds,
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
        assigned: assignedLabels(sections, matched.sectionIds, read.parsed.mode),
      };
    }
    // 승인 단계에서 막히면(이미 같은 반에 배정 등) 검토 대기로 남긴다 — 접수는 됐다
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
        ? "이미 이 달 반에 배정돼 있어서, 강사가 확인한 뒤 반영해 드려요."
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
  const filePath = String(input.filePath);

  const [sections, { data: profile }] = await Promise.all([
    getOpenEnrollSections(),
    admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
  ]);
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

  // **수동 신청도 같은 수강증 검사를 한다** (2026-09-22). 예전에는 수동 신청에 아무 검사가 없어서, 위조 신호 네 가지가
  // 자동 승인만 막고 **수동 등업신청으로 내면 파일 중복 · 같은 초 캡처 · 색 검사를 모두 비껴갔다** — 셋 다 스태프가 그림을 봐서는
  // 알 수 없는 신호다. 판정(거절 · 자동 승인)은 하지 않고 승인 화면에만 적는다 — 수동 신청은 늘 스태프가 본다.
  // 읽은 레벨·시간·이름도 함께 남아 스태프가 학생이 고른 반과 수강증을 맞대 볼 수 있다
  const outcome = await readReceipt(admin, filePath, profile?.name ?? null);
  const read = outcome.ok ? outcome : null;
  const flags = await receiptFlags(admin, user.id, outcome, resolved.sectionIds);

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
  return { ok: true };
}
