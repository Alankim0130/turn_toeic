import "server-only";
import type { createAdminClient } from "./supabase/admin";
import type { Json } from "./supabase/database.types";
import { isCaptureFresh } from "./verify-decision";
import { paletteVerdict, type PaletteShares } from "./receipt-forensics";
import { todayKST } from "./utils";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * 자동 승인을 막는 신호들 — 승인 화면에 까닭으로 적는다. **거절하지 않는다** (진짜 학생일 수 있다).
 * 수강증만 올리기 · 수동 등업신청 · 예비 접수 다시 맞추기가 **같은 검사**를 한다 (2026-09-22 — 예전에는 수동 신청에 아무 검사가 없어 그 길로 다 비껴갔다).
 * 서버 액션 파일(`"use server"`)에 두면 내보낸 함수가 모두 호출 가능한 액션이 되므로 여기 따로 둔다.
 */
export type VerifyFlags = {
  duplicateImage: boolean;
  staleCapture: boolean;
  sameCapture: boolean;
  paletteOff: boolean;
  paletteNote: string;
  palette: PaletteShares | null;
  /** 이미 그 달(기수) 반에 배정돼 있다 — 새로 승인하면 등록이 두 건 생긴다 (2026-09-22). 배정된 반 id */
  alreadyEnrolled: number[];
  /**
   * 이 학생이 **같은 캡처**(같은 파일 · 같은 초)를 전에 냈고 사람이 판정했다 (2026-09-22, firsttoeic 사고 5 "회수한 학생이 되살아났다").
   * `approved` = 승인됐던 캡처 — 배정이 풀렸다면(환불·회수) 같은 그림으로 다시 자동 등업하면 안 된다.
   * `rejected` = 강사가 반려한 캡처 — 사람이 안 된다고 한 그림을 기계가 다시 승인하면 안 된다.
   * 자동 거절(`candidates.rule = "auto-reject"`)은 세지 않는다 — 사람이 아니라 기계가 돌려보낸 것이다.
   */
  decidedBefore: "approved" | "rejected" | null;
};

export type FlagInput = {
  userId: string;
  /** 파일 SHA-256. 파일을 못 받았으면 null */
  hash: string | null;
  /** 수강증 맨 위 `현재시간` — 날짜 · 초까지 */
  capturedOn: string | null;
  capturedAt: string | null;
  /** 화면 색 (`measurePalette`). 못 쟀으면 null */
  palette: PaletteShares | null;
  /** 배정하려는 반 — 그 달 반에 이미 있는지 본다 */
  sectionIds: readonly number[];
};

export async function receiptFlags(admin: Admin, input: FlagInput): Promise<VerifyFlags> {
  const { userId, hash, capturedOn, capturedAt } = input;
  // 1. 같은 파일(SHA-256)을 다른 계정이 올렸다 — 돌려쓰기
  let duplicateImage = false;
  if (hash) {
    const { count } = await admin.from("enrollment_verifications").select("id", { count: "exact", head: true }).eq("file_hash", hash).neq("user_id", userId);
    duplicateImage = (count ?? 0) > 0;
  }
  // 2. 캡처가 45일 넘게 오래됐다
  const staleCapture = !isCaptureFresh(capturedOn, todayKST());

  // 3. **같은 초에 캡처된 수강증이 다른 계정에도 있다** (2026-09-19). 수강증 맨 위 `현재시간` 은 초까지 찍히므로
  // 두 사람이 같은 초에 각자 캡처할 수는 없다 — 한쪽이 상대의 그림을 받아 쓴 것이다.
  // **파일 해시와 달리 글자를 고쳐도 살아남는다** (친구 수강증에 자기 이름만 얹은 경우).
  // 지금은 훑어 세지만(수강증이 수천 건 수준) 느려지면 `parsed->>'capturedAt'` 에 인덱스를 건다.
  // **조회가 실패하면 통과시킨다** — 근거 없이 막지 않는다. 다만 조용히 넘어가지 않게 로그는 남긴다
  let sameCapture = false;
  if (capturedAt) {
    const { count, error: dupError } = await admin
      .from("enrollment_verifications")
      .select("id", { count: "exact", head: true })
      .eq("parsed->>capturedAt", capturedAt)
      .neq("user_id", userId);
    if (dupError) console.error(`[verify] 캡처 시각 중복을 확인하지 못했어요: ${dupError.message}`);
    sameCapture = (count ?? 0) > 0;
  }

  // 4. **색 팔레트** — YBM 수강증 화면의 색(파란 티켓 카드 · 노란 과정 배지)이 큰 면적을 차지하는가. 못 쟀으면 판단하지 않는다.
  // 실측: 진짜 37.8~40.0%(카톡 JPEG q70 · 1080px 축소 포함) vs 생성물·다른 사진 0.00~0.05% (`src/lib/receipt-forensics.ts`)
  const palette = paletteVerdict(input.palette);

  return {
    duplicateImage,
    staleCapture,
    sameCapture,
    paletteOff: !palette.ok,
    paletteNote: palette.note,
    palette: input.palette,
    alreadyEnrolled: await enrolledInSameTerm(admin, userId, input.sectionIds),
    decidedBefore: await decidedBefore(admin, userId, hash, capturedAt),
  };
}

/** 자동 거절로 남긴 기록인가 — 자동 거절은 `candidates.rule = "auto-reject"`. 예전 기록(candidates 없음)도 자동으로 본다 (막지 않는 쪽) */
function isAutoRejected(candidates: Json | null): boolean {
  if (!candidates || typeof candidates !== "object" || Array.isArray(candidates)) return true;
  return (candidates as { rule?: unknown }).rule === "auto-reject";
}

/** `VerifyFlags.decidedBefore` — 같은 학생의 같은 파일 · 같은 초 캡처 중 사람이 판정한 것. 조회가 실패하면 null (막지 않는다) */
async function decidedBefore(admin: Admin, userId: string, hash: string | null, capturedAt: string | null): Promise<VerifyFlags["decidedBefore"]> {
  const rows: { result: string | null; candidates: Json | null }[] = [];
  if (hash) {
    const { data } = await admin.from("enrollment_verifications").select("result, candidates").eq("user_id", userId).eq("file_hash", hash).not("result", "is", null);
    rows.push(...(data ?? []));
  }
  if (capturedAt) {
    const { data } = await admin
      .from("enrollment_verifications")
      .select("result, candidates")
      .eq("user_id", userId)
      .eq("parsed->>capturedAt", capturedAt)
      .not("result", "is", null);
    rows.push(...(data ?? []));
  }
  if (rows.some((r) => r.result === "approved")) return "approved";
  if (rows.some((r) => r.result === "rejected" && !isAutoRejected(r.candidates))) return "rejected";
  return null;
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
