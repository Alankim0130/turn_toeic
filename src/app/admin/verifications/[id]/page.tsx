import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayKST, formatDate, formatTimeRange, formatWon, cn, TRACK_LABEL } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { PickerSection } from "@/components/admin/SectionPicker";
import { sectionSummary, termLabel } from "../../_lib/queries";
import { DecisionForms, type Candidate, type OrderInfo } from "./DecisionForms";
import { requireCrew } from "@/lib/auth";
import { RETENTION_LABEL } from "@/lib/receipt-retention";
import { BLOCKER_LABEL, type AutoApproveBlocker } from "@/lib/auto-approve";
import { heldMonth as heldMonthOf } from "@/lib/verify-decision";

export const metadata: Metadata = { title: "등업 검토", robots: { index: false } };

const DONE_MSG: Record<string, string> = {
  approved: "승인 처리되었습니다. 반 배정과 등록이 생성되었습니다.",
  rejected: "반려 처리되었습니다.",
  updated: "배정이 수정되었습니다.",
};

export default async function VerificationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireCrew();
  const { id: idParam } = await params;
  const { done } = await searchParams;
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const supabase = await createClient();
  const today = todayKST();

  const { data: v } = await supabase
    .from("enrollment_verifications")
    .select("*, profile:profiles(name, phone, role)")
    .eq("id", id)
    .maybeSingle();
  if (!v) notFound();

  const [{ data: signed }, { data: sections }, { data: order }] = await Promise.all([
    // 보관 기간이 지나 지운 파일은 서명 URL 을 만들 이유가 없다 (2026-09-20)
    v.file_deleted_at
      ? Promise.resolve({ data: null as { signedUrl: string } | null })
      : supabase.storage.from("receipts").createSignedUrl(v.file_path, 600),
    supabase
      .from("class_sections")
      .select("id, track, start_time, end_time, time_block, tuition, live_tuition, enrollment_opens_at, closes_at, term:terms(year, month), course:courses(id, name, program, target_score)")
      .eq("status", "open")
      .gte("closes_at", today)
      .order("enrollment_opens_at")
      .order("time_block"),
    supabase
      .from("enrollment_orders")
      .select("id, status, activates_on, access_until, enrollments(id, mode, status, section_id, section:class_sections!enrollments_section_id_fkey(track, start_time, time_block, term:terms(year, month), course:courses(name)))")
      .eq("verification_id", id)
      .maybeSingle(),
  ]);

  const candidates: Candidate[] = (sections ?? []).map((s) => ({
    id: s.id,
    label: [
      termLabel(s.term),
      s.course?.name ?? "강좌",
      TRACK_LABEL[s.track] ?? s.track,
      formatTimeRange(s.start_time, s.end_time),
      s.time_block,
      // 수강료는 선택이라 비어 있을 수 있다 (2026-09-16 Alan). 둘 다 없으면 이 칸은 아예 뺀다
      s.tuition != null || s.live_tuition != null
        ? [s.tuition != null ? `현장 ${formatWon(s.tuition)}` : null, s.live_tuition != null ? `불라방 ${formatWon(s.live_tuition)}` : null]
            .filter(Boolean)
            .join(" / ")
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  // 승인 화면의 반 고르기 — 강좌 · 시간대별 월수금 / 화목금 / 주5일
  const pickerSections: PickerSection[] = (sections ?? []).map((s) => ({ id: s.id, track: s.track, time_block: s.time_block, course: s.course, term: s.term }));

  const orderInfo: OrderInfo | null = order
    ? {
        id: order.id,
        status: order.status,
        activates_on: order.activates_on,
        access_until: order.access_until,
        enrollments: (order.enrollments ?? []).map((e) => ({
          id: e.id,
          section_id: e.section_id,
          mode: e.mode,
          status: e.status,
          label: sectionSummary(e.section, null),
        })),
      }
    : null;

  // 수동 등업신청 — 학생이 직접 고른 반 (2026-09-17). 신청 기록일 뿐 확정이 아니다
  const requestedManual = (v.requested_section_ids ?? []).filter((n): n is number => typeof n === "number");
  // OCR 이 반을 찾았는데 자동 승인 조건(이름 일치 등)에 못 미친 건 — 찾은 반을 미리 골라 둔다 (2026-09-18)
  const matchLog = v.candidates as {
    result?: { kind?: string; sectionIds?: number[] } | null;
    flags?: {
      duplicateImage?: boolean;
      staleCapture?: boolean;
      sameCapture?: boolean;
      paletteOff?: boolean;
      paletteNote?: string;
      alreadyEnrolled?: number[];
      decidedBefore?: "approved" | "rejected" | null;
    };
    correctionOf?: number;
    /** 다음 달 수강증을 받아 뒀다 — 그 달 반이 열리면 다시 맞춘다 (2026-09-22). 다시 맞춘 뒤에는 heldFor */
    hold?: number;
    heldFor?: number;
    /** 긴급 스위치가 꺼져 있을 때(또는 읽지 못했을 때) 올라왔다. 켜져 있었다면 거절했을 사유는 wouldReject */
    autoOff?: "off" | "unreadable";
    wouldReject?: { code?: string; reason?: string };
    /** 자동 승인을 막은 까닭 (`autoApproveBlockers`, 2026-09-22) */
    blockers?: string[];
  } | null;
  // 자동 승인 뒤 학생이 "반이 달라요" 로 낸 정정 요청 — 새로 승인하면 등록이 두 건 생기니 기존 승인의 배정 수정으로 보낸다 (2026-09-18)
  const correctionOf = typeof matchLog?.correctionOf === "number" ? matchLog.correctionOf : null;
  // 위조·돌려쓰기 의심 — 자동 승인이 막힌 이유. 스태프가 수강증을 더 자세히 본다 (2026-09-18)
  const suspicious = [
    matchLog?.flags?.duplicateImage ? "다른 계정이 같은 이미지 파일을 올렸어요 — 수강증을 돌려 쓰는 것일 수 있어요. 두 계정의 이름·전화번호를 확인해 주세요." : null,
    matchLog?.flags?.staleCapture ? "수강증 캡처 시각이 45일 넘게 오래됐어요 — 지난 수강증을 다시 올린 것일 수 있어요. 이번 달 등록이 맞는지 확인해 주세요." : null,
    // 같은 초 = 같은 캡처다. 글자를 고쳐도 남으므로 "친구 수강증에 내 이름만 얹은" 경우가 여기 걸린다 (2026-09-19)
    matchLog?.flags?.sameCapture ? "다른 계정에 같은 초에 캡처된 수강증이 있어요 — 한쪽이 상대의 그림을 받아 쓴 것일 수 있어요 (글자를 고쳐도 캡처 시각은 남아요). 두 계정을 확인해 주세요." : null,
    // 색 팔레트 — AI 로 만들었거나 손으로 그린 그림, 다른 학원 수강증이 걸린다 (2026-09-19)
    matchLog?.flags?.paletteOff
      ? `화면 색이 YBM 수강증 팔레트와 달라요 — 만들어 낸 그림이거나 다른 곳의 수강증일 수 있어요. 그림을 직접 봐 주세요.${matchLog.flags.paletteNote ? ` (${matchLog.flags.paletteNote})` : ""}`
      : null,
  ].filter((s): s is string => !!s);
  const suggested = matchLog?.result?.kind === "match" ? (matchLog.result.sectionIds ?? []).filter((n) => typeof n === "number") : [];
  const requested = requestedManual.length > 0 ? requestedManual : suggested;
  const requestedLabels = requested.map((id) => candidates.find((c) => c.id === id)?.label ?? `반 #${id}`);
  // 승인 칸에 **실제로 미리 골라 둔다** (2026-09-22 — 예전에는 "미리 골라 뒀습니다" 라고 적어 놓고 값을 넘기지 않아 늘 빈 칸이었다).
  // 지금 열려 있어 목록에 보이는 반만 — 안 보이는 반이 숨은 칸으로 함께 승인되면 안 된다
  const preselected = requested.filter((id) => pickerSections.some((s) => s.id === id));
  // 이미 그 달 반에 배정돼 있다 — 새로 승인하면 등록이 두 건 생긴다 (2026-09-22). 정정 요청은 아래 안내가 따로 있다
  const alreadyEnrolled = correctionOf ? [] : (matchLog?.flags?.alreadyEnrolled ?? []).filter((n) => typeof n === "number");
  // 같은 캡처를 전에 사람이 판정했다 (2026-09-22, firsttoeic 사고 5). 승인됐던 캡처인데 지금 배정이 없으면 환불·회수일 수 있다
  const decidedBefore = matchLog?.flags?.decidedBefore;
  const humanNotes = [
    decidedBefore === "approved" && !correctionOf && alreadyEnrolled.length === 0 && v.result === null
      ? "이 학생이 같은 수강증(같은 캡처)으로 전에 승인된 적이 있는데 지금은 이 달 반에 배정이 없어요 — 환불·회수로 배정을 풀었다면 승인하지 마세요."
      : null,
    decidedBefore === "rejected" && v.result === null ? "강사가 전에 반려한 수강증(같은 캡처)을 다시 올렸어요 — 지난 반려 사유를 확인해 주세요." : null,
  ].filter((s): s is string => !!s);

  // 기계가 왜 판정하지 않았나 — 스위치 · 받아 둔 다음 달 수강증 · 자동 승인을 막은 까닭 (2026-09-22). 위조 신호와 달리 경고가 아니라 안내다
  const heldMonthNow = heldMonthOf(matchLog?.hold);
  const blockerLabels = (matchLog?.blockers ?? []).flatMap((b) => (b in BLOCKER_LABEL ? [BLOCKER_LABEL[b as AutoApproveBlocker]] : []));
  const systemNotes = [
    matchLog?.autoOff
      ? `자동 판정이 ${matchLog.autoOff === "off" ? "멈춰" : "읽히지 않아 멈춰"} 있어 기계가 승인도 거절도 하지 않았어요.${
          matchLog.wouldReject?.reason ? ` 켜져 있었다면 이 사유로 자동 거절했을 거예요: “${matchLog.wouldReject.reason}”` : ""
        }`
      : null,
    // 왜 자동 등업이 안 됐나 — 받아 둔 동안은 반이 없어 늘 "반 없음" 이라 적지 않는다
    v.result === null && heldMonthOf(matchLog?.hold) == null && blockerLabels.length > 0 ? `자동 등업하지 않은 까닭: ${blockerLabels.join(" · ")}` : null,
    heldMonthNow != null && v.result === null
      ? `${heldMonthNow}월 수강증이라 받아 뒀어요 — 강사님이 ${heldMonthNow}월 반을 열면 저절로 다시 맞춰 예비등록생으로 배정해요. 지금은 승인할 ${heldMonthNow}월 반이 없어요.`
      : null,
    typeof matchLog?.heldFor === "number" && heldMonthNow == null && v.result === null
      ? `${matchLog.heldFor}월 반이 열려 다시 맞춰 봤지만 자동으로 배정하지 못했어요 — 아래 까닭을 보고 직접 처리해 주세요.`
      : null,
  ].filter((s): s is string => !!s);

  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(v.file_path);
  const parsed = v.parsed as Record<string, unknown> | null;
  // OCR 이 실패했으면 사유가 ocr_raw.error 에 있다 (2026-09-18 — 조용히 비어 있으면 원인을 알 수 없다)
  const ocrErrorRaw = (v.ocr_raw as { error?: unknown } | null)?.error;
  const ocrError = typeof ocrErrorRaw === "string" ? ocrErrorRaw : null;
  // 강의실 줄을 못 읽어 기본값(현장)으로 둔 것은 판독이 아니다 (2026-09-22 `modeEvidence`) — 스태프가 수강증에서 고르게 비워 둔다.
  // 그 칸이 없는 예전 기록은 그대로 읽는다
  const modeEvidence = parsed && "modeEvidence" in parsed ? parsed.modeEvidence : undefined;
  const ocrMode = modeEvidence === null ? null : parsed?.mode === "live" || parsed?.mode === "onsite" ? parsed.mode : null;
  const MODE_EVIDENCE_LABEL: Record<string, string> = { online: "강의실 온라인 강의", room: "강의실 호실", live: "라이브방송" };
  // 스태프가 한눈에 보는 줄 — 자세한 값은 아래 JSON 에 그대로 있다
  const ocrFacts: [string, string][] = parsed
    ? [
        [
          "수강 방식",
          modeEvidence === null
            ? "강의실 줄을 못 읽음 — 수강증에서 확인"
            : `${ocrMode === "live" ? "불라방" : ocrMode === "onsite" ? "현장" : "-"}${typeof modeEvidence === "string" && MODE_EVIDENCE_LABEL[modeEvidence] ? ` (${MODE_EVIDENCE_LABEL[modeEvidence]})` : ""}`,
        ],
        // 반 대조가 쓴 수강월 — 배지 `NN월 과정` → 수강요일 줄의 개강일. 캡처한 날은 수강월이 아니다 (2026-09-22)
        [
          "수강월",
          typeof parsed.courseMonth === "number"
            ? `${parsed.courseMonth}월 (배지)`
            : typeof parsed.startMonth === "number"
              ? `${parsed.startMonth}월 (개강일)`
              : "-",
        ],
        ["레벨 · 과정", [parsed.level ?? "-", parsed.program === "sparta" ? "프리미어(스파르타)" : "점수보장반"].join(" · ")],
        ["주 · 트랙", [parsed.weekly ? `주${parsed.weekly}일` : "-", (parsed.tracks as string[] | undefined)?.map((t) => (t === "mwf" ? "월수금" : "화목금")).join("+") || "-"].join(" · ")],
        ["수강 시간", (parsed.time as { timeBlock?: string } | null)?.timeBlock ?? "-"],
        ["이름 일치", parsed.nameMatches === true ? "일치" : parsed.nameMatches === false ? "다름 — 확인 필요" : "확인 못 함"],
        // 화면 색 — 통과해도 적는다. "왜 자동으로 됐나" 를 스태프가 볼 수 있어야 한다 (2026-09-19)
        ["화면 색", matchLog?.flags?.paletteNote ?? "재지 못함"],
        ["캡처 시각", typeof parsed.capturedAt === "string" ? parsed.capturedAt.replace("T", " ") : typeof parsed.capturedOn === "string" ? parsed.capturedOn : "-"],
      ]
    : [];
  // 반 대조 기록 — { rule, result, log[], nameMatches } (2026-09-18 자동 승인). 예전 점수 배열이어도 그대로 보여 준다
  const candidateLog = v.candidates as Record<string, unknown> | unknown[] | null;

  return (
    <>
      <PageHeader icon="verify" title={`등업 검토 #${v.id}`} description={`${v.profile?.name ?? "이름 없음"} · ${formatDate(v.created_at, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 신청`}>
        <Link href="/admin/verifications" className="btn-secondary !py-2">목록으로</Link>
      </PageHeader>

      {done && DONE_MSG[done] && <Alert kind="success" className="mb-6">{DONE_MSG[done]}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* 수강증 & 로그 */}
        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-black text-ink">수강증 원본</h2>
              <StatusBadge status={v.result ?? "pending"} />
            </div>
            {signed?.signedUrl ? (
              isImage ? (
                // 서명 URL 은 10분 유효. 외부 호스트라 next/image 대신 img 사용
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signed.signedUrl} alt="업로드된 수강증" className="max-h-[70vh] w-full rounded-xl border border-line object-contain" />
              ) : (
                <a href={signed.signedUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">PDF 열기</a>
              )
            ) : v.file_deleted_at ? (
              <p className="text-sm text-slate">
                보관 기간({RETENTION_LABEL})이 지나 <b className="text-ink">원본을 삭제했습니다</b>. 아래 OCR 기록과 판정 결과는 그대로 남아 있습니다.
              </p>
            ) : (
              <p className="text-sm text-slate">파일을 불러올 수 없습니다. (삭제되었거나 경로 오류)</p>
            )}
            {v.source === "manual" && (
              <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3">
                <p className="text-sm font-black text-brand-700">학생이 직접 고른 반 (수동 등업신청)</p>
                {requestedLabels.length === 0 ? (
                  <p className="mt-1 text-sm text-slate">고른 반을 찾을 수 없습니다 (반이 지워졌을 수 있어요).</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm text-ink">
                    {requestedLabels.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                )}
                <p className="mt-2 text-xs text-mist">
                  {preselected.length === requested.length
                    ? "아래 승인 칸에 미리 골라 뒀습니다."
                    : "고른 반 중 지금 열려 있지 않은 반은 미리 고르지 못했어요 — 아래에서 다시 골라 주세요."}{" "}
                  <b>수강증과 맞는지 확인한 뒤</b> 승인해 주세요.
                </p>
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate">가입 실명</dt><dd className="font-bold">{v.profile?.name ?? "-"}</dd>
              <dt className="text-slate">연락처</dt><dd>{v.profile?.phone ?? "-"}</dd>
              <dt className="text-slate">현재 등급</dt><dd><StatusBadge status={v.profile?.role} /></dd>
              <dt className="text-slate">신뢰도</dt><dd>{v.confidence != null ? `${Math.round(Number(v.confidence))}점` : "-"}</dd>
              {v.reject_reason && (<><dt className="text-slate">반려 사유</dt><dd className="text-red-700">{v.reject_reason}</dd></>)}
            </dl>
          </section>

          <section className="card p-5">
            {alreadyEnrolled.length > 0 && v.result === null && (
              <Alert kind="warning" className="mb-3">
                이 학생은 이 달 반에 <b>이미 배정</b>돼 있어요 ({alreadyEnrolled.map((id) => candidates.find((c) => c.id === id)?.label ?? `반 #${id}`).join(" / ")}).
                그래서 자동 등업하지 않았습니다. 여기서 승인하면 <b>등록이 하나 더</b> 생겨요 — 반을 바꾸는 것이면{" "}
                <Link href={`/admin/students/${v.user_id}`} className="font-bold underline">학생 관리</Link>에서 기존 배정을 고치고 이 건은 반려로 닫아 주세요.
              </Alert>
            )}
            {correctionOf && (
              <Alert kind="warning" className="mb-3">
                이 학생은 이 달 반에 <b>이미 자동 배정</b>돼 있고, 「반이 달라요」로 정정을 요청했어요. 여기서 새로 승인하지 말고{" "}
                <Link href={`/admin/verifications/${correctionOf}`} className="font-bold underline">기존 승인 #{correctionOf}</Link>의 <b>배정 수정</b>에서 반을 바꾼 뒤,
                이 건은 반려(사유: 「기존 배정을 수정했어요」)로 닫아 주세요.
              </Alert>
            )}
            <h2 className="mb-3 font-black text-ink">OCR 판독 결과</h2>
            {systemNotes.map((s) => (
              <Alert key={s} kind="info" className="mb-3">{s}</Alert>
            ))}
            {[...humanNotes, ...suspicious].map((s) => (
              <Alert key={s} kind="warning" className="mb-3">{s}</Alert>
            ))}
            {parsed ? (
              <>
                <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
                  {ocrFacts.map(([k, val]) => (
                    <div key={k} className="contents">
                      <dt className="text-slate">{k}</dt>
                      <dd className={cn("font-bold text-ink", k === "이름 일치" && parsed.nameMatches === false && "text-red-700")}>{val}</dd>
                    </div>
                  ))}
                </dl>
                <details>
                  <summary className="cursor-pointer text-xs font-bold text-slate">읽은 값 전체</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-surface p-3 text-xs leading-relaxed text-ink-soft">{JSON.stringify(parsed, null, 2)}</pre>
                </details>
              </>
            ) : (
              <p className="text-sm text-slate">
                수강증에서 글자를 읽지 못했습니다 (이미지가 아니거나 OCR 실패). 수강증을 보고 수동으로 승인해 주세요.
                {ocrError && (
                  <>
                    {" "}
                    실패 사유: <code className="rounded bg-surface px-1 text-xs">{ocrError}</code>
                  </>
                )}
              </p>
            )}
            {candidateLog && (Array.isArray(candidateLog) ? candidateLog.length > 0 : Object.keys(candidateLog).length > 0) && (
              <>
                <h3 className="mb-2 mt-4 text-sm font-bold text-slate">반 대조 기록</h3>
                <pre className="max-h-64 overflow-auto rounded-xl bg-surface p-3 text-xs leading-relaxed text-ink-soft">{JSON.stringify(candidateLog, null, 2)}</pre>
              </>
            )}
          </section>
        </div>

        {/* 판정 */}
        <div className="space-y-6">
          {orderInfo && (
            <section className="card p-5">
              <h2 className="mb-3 font-black text-ink">생성된 등록</h2>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate">상태</dt><dd><StatusBadge status={orderInfo.status} /></dd>
                <dt className="text-slate">개강일</dt><dd>{formatDate(orderInfo.activates_on, { year: "numeric", month: "long", day: "numeric" })}</dd>
                <dt className="text-slate">시청 만료일</dt><dd>{formatDate(orderInfo.access_until, { year: "numeric", month: "long", day: "numeric" })}</dd>
              </dl>
            </section>
          )}
          <DecisionForms
            verificationId={v.id}
            result={v.result}
            candidates={candidates}
            pickerSections={pickerSections}
            order={orderInfo}
            requested={preselected}
            ocrMode={ocrMode}
          />
        </div>
      </div>
    </>
  );
}
