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
import { requireStaff } from "@/lib/auth";

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
  await requireStaff();
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
    supabase.storage.from("receipts").createSignedUrl(v.file_path, 600),
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
  const matchLog = v.candidates as { result?: { kind?: string; sectionIds?: number[] } } | null;
  const suggested = matchLog?.result?.kind === "match" ? (matchLog.result.sectionIds ?? []).filter((n) => typeof n === "number") : [];
  const requested = requestedManual.length > 0 ? requestedManual : suggested;
  const requestedLabels = requested.map((id) => candidates.find((c) => c.id === id)?.label ?? `반 #${id}`);

  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(v.file_path);
  const parsed = v.parsed as Record<string, unknown> | null;
  // OCR 이 실패했으면 사유가 ocr_raw.error 에 있다 (2026-09-18 — 조용히 비어 있으면 원인을 알 수 없다)
  const ocrErrorRaw = (v.ocr_raw as { error?: unknown } | null)?.error;
  const ocrError = typeof ocrErrorRaw === "string" ? ocrErrorRaw : null;
  const ocrMode = parsed?.mode === "live" || parsed?.mode === "onsite" ? parsed.mode : null;
  // 스태프가 한눈에 보는 줄 — 자세한 값은 아래 JSON 에 그대로 있다
  const ocrFacts: [string, string][] = parsed
    ? [
        ["수강 방식", ocrMode === "live" ? "불라방 (라이브방송)" : ocrMode === "onsite" ? "현장" : "-"],
        ["레벨 · 과정", [parsed.level ?? "-", parsed.program === "sparta" ? "프리미어(스파르타)" : "점수보장반"].join(" · ")],
        ["주 · 트랙", [parsed.weekly ? `주${parsed.weekly}일` : "-", (parsed.tracks as string[] | undefined)?.map((t) => (t === "mwf" ? "월수금" : "화목금")).join("+") || "-"].join(" · ")],
        ["수강 시간", (parsed.time as { timeBlock?: string } | null)?.timeBlock ?? "-"],
        ["이름 일치", parsed.nameMatches === true ? "일치" : parsed.nameMatches === false ? "다름 — 확인 필요" : "확인 못 함"],
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
                <p className="mt-2 text-xs text-mist">아래 승인 칸에 미리 골라 뒀습니다. <b>수강증과 맞는지 확인한 뒤</b> 승인해 주세요.</p>
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
            <h2 className="mb-3 font-black text-ink">OCR 판독 결과</h2>
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
          <DecisionForms verificationId={v.id} result={v.result} candidates={candidates} pickerSections={pickerSections} order={orderInfo} ocrMode={ocrMode} />
        </div>
      </div>
    </>
  );
}
