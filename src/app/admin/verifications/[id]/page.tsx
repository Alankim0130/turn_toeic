import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayKST, formatDate, formatWon, TRACK_LABEL } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { sectionSummary, termLabel } from "../../_lib/queries";
import { DecisionForms, type Candidate, type OrderInfo } from "./DecisionForms";

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
      .select("id, track, start_time, end_time, time_block, tuition, live_tuition, enrollment_opens_at, closes_at, term:terms(year, month), course:courses(name)")
      .eq("status", "open")
      .gte("closes_at", today)
      .order("enrollment_opens_at")
      .order("start_time"),
    supabase
      .from("enrollment_orders")
      .select("id, months, status, activates_on, access_until, enrollments(id, mode, status, section_id, section:class_sections!enrollments_section_id_fkey(track, start_time, time_block, term:terms(year, month), course:courses(name)))")
      .eq("verification_id", id)
      .maybeSingle(),
  ]);

  const candidates: Candidate[] = (sections ?? []).map((s) => ({
    id: s.id,
    label: `${termLabel(s.term)} · ${s.course?.name ?? "강좌"} · ${TRACK_LABEL[s.track] ?? s.track} · ${sectionSummary({ start_time: s.start_time, end_time: s.end_time }, null, { withEnd: true }).replace(/^미정 · 강좌 · /, "")}${s.time_block ? ` · ${s.time_block}` : ""} · 현장 ${formatWon(s.tuition)}${s.live_tuition != null ? ` / 불라방 ${formatWon(s.live_tuition)}` : ""}`,
  }));

  const orderInfo: OrderInfo | null = order
    ? {
        id: order.id,
        months: order.months,
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

  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(v.file_path);
  const parsed = v.parsed as Record<string, unknown> | null;
  const candidateLog = v.candidates as unknown[] | null;

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
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate">가입 실명</dt><dd className="font-bold">{v.profile?.name ?? "-"}</dd>
              <dt className="text-slate">연락처</dt><dd>{v.profile?.phone ?? "-"}</dd>
              <dt className="text-slate">현재 등급</dt><dd><StatusBadge status={v.profile?.role} /></dd>
              <dt className="text-slate">영수증 번호</dt><dd>{v.receipt_no ?? "-"}</dd>
              <dt className="text-slate">신뢰도</dt><dd>{v.confidence != null ? `${Math.round(Number(v.confidence))}점` : "-"}</dd>
              {v.reject_reason && (<><dt className="text-slate">반려 사유</dt><dd className="text-red-700">{v.reject_reason}</dd></>)}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-black text-ink">OCR 파싱 결과</h2>
            {parsed ? (
              <pre className="max-h-64 overflow-auto rounded-xl bg-surface p-3 text-xs leading-relaxed text-ink-soft">{JSON.stringify(parsed, null, 2)}</pre>
            ) : (
              <p className="text-sm text-slate">아직 OCR 처리 전입니다. 아래에서 수강증을 보고 수동으로 승인할 수 있습니다.</p>
            )}
            {candidateLog && Array.isArray(candidateLog) && candidateLog.length > 0 && (
              <>
                <h3 className="mb-2 mt-4 text-sm font-bold text-slate">후보 점수</h3>
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
                <dt className="text-slate">개월</dt><dd>{orderInfo.months}개월</dd>
                <dt className="text-slate">개강일</dt><dd>{formatDate(orderInfo.activates_on, { year: "numeric", month: "long", day: "numeric" })}</dd>
                <dt className="text-slate">시청 만료일</dt><dd>{formatDate(orderInfo.access_until, { year: "numeric", month: "long", day: "numeric" })}</dd>
              </dl>
            </section>
          )}
          <DecisionForms verificationId={v.id} result={v.result} candidates={candidates} order={orderInfo} />
        </div>
      </div>
    </>
  );
}
