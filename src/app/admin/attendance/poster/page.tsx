import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { isStaff, requireCrew } from "@/lib/auth";
import { issuedLabel } from "@/lib/attendance-poster";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { rotateAttendancePoster } from "./actions";

export const metadata: Metadata = { title: "출석 QR 포스터", robots: { index: false } };

/**
 * 출석 QR 포스터 (2026-09-21 Alan — "QR을 A5 크기로 2개 해서 A4로 인쇄할 수 있도록",
 * 2026-09-22 — "QR 자동으로 바뀌는 거는 없애줘. 새로 만들 수 있는 기능만 넣어놓고, 새로 만들기 버튼을 누르면 인쇄까지 할 수 있도록 다운로드").
 * 출석 QR 은 이 포스터 하나다. PDF 받기는 강사·관리자·조교, 새로 만들기는 강사·관리자만.
 * PDF 는 `/admin/attendance/poster/download` 가 그때그때 만든다.
 */
export default async function AttendancePosterPage({ searchParams }: { searchParams: Promise<{ made?: string; error?: string }> }) {
  // 조교에게도 열린 화면이다 — 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  const { profile } = await requireCrew();
  const { made, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("attendance_poster_token");
  const issued = issuedLabel((data as { created_at?: string } | null)?.created_at);
  const staff = isStaff(profile.role);

  return (
    <>
      <PageHeader
        icon="camera"
        title="출석 QR 포스터"
        description="강의실 앞에 붙여 두는 출석 QR 이에요. A4 한 장에 A5 포스터 두 장이고, 새로 만들기 전까지 QR 은 바뀌지 않아요."
      />
      <div className="mb-4">
        <Link href="/admin/attendance" className="text-sm font-bold text-brand-600 hover:underline">
          ← 출석 명단
        </Link>
      </div>

      {error && (
        <Alert kind="warning" className="mb-4">
          {error === "confirm" ? "확인 칸을 체크해야 새로 만들 수 있어요." : "새로 만들지 못했어요. 다시 시도해 주세요."}
        </Alert>
      )}

      <div className="space-y-6">
        <section aria-labelledby="now" className={cn("card p-5 sm:p-6", made && "ring-2 ring-brand-500")}>
          <h2 id="now" className="text-base font-black text-ink">{made ? "새 포스터가 준비됐어요" : "지금 포스터"}</h2>
          {made && (
            <p className="mt-1 text-sm font-bold text-brand-600">
              받아서 인쇄하고, 붙어 있는 옛 종이를 모두 바꿔 붙여 주세요 — 옛 종이는 이제 찍히지 않아요.
            </p>
          )}
          <p className="mt-1 text-sm text-slate">
            {issued ? (
              <>
                <b className="text-ink">{issued}</b> — 포스터 오른쪽 아래에 같은 시각이 적혀 있어요. 다르면 옛 종이예요.
              </>
            ) : (
              "발행 시각을 읽지 못했어요."
            )}
          </p>
          <a href="/admin/attendance/poster/download" download className="btn-primary mt-4">
            <Icon name="download" size={18} />
            포스터 PDF 받기
          </a>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate">
            <li>인쇄 설정: 용지 A4 · 방향 가로 · 배율 &ldquo;실제 크기&rdquo;(100%)</li>
            <li>가운데 점선을 자르면 A5 두 장 — 선생님마다 한 장씩이고 QR 은 같아요.</li>
            <li>학생은 휴대폰 기본 카메라로 찍고, 들어올 때 한 번(입실) · 나갈 때 한 번(퇴실) 찍어요.</li>
          </ul>
        </section>

        <section aria-labelledby="make" className="card p-5 sm:p-6">
          <h2 id="make" className="text-base font-black text-ink">새로 만들기</h2>
          {staff ? (
            <form action={rotateAttendancePoster} className="mt-2 space-y-3">
              <p className="text-sm text-slate">
                포스터 사진이 돌아다닌다 싶을 때 새 QR 로 바꿔요. 사진을 찍어 보내면 교실 밖에서도 찍히기 때문이에요 (수업 시간·현장 수강생·입실 30분 뒤 퇴실은 서버가 그대로 막아요).
                <b className="text-ink"> 누르는 순간 붙어 있는 종이는 모두 찍히지 않아요</b> — 새 포스터를 받아 바꿔 붙여야 해요.
              </p>
              <label className="flex items-center gap-2 text-sm font-bold text-ink">
                <input type="checkbox" name="confirm" required className="h-4 w-4 accent-brand-500" />
                붙어 있는 포스터를 모두 새로 인쇄해서 바꿀게요
              </label>
              <button type="submit" className="btn-secondary">
                새로 만들기
              </button>
            </form>
          ) : (
            <p className="mt-1 text-sm text-slate">새로 만들기는 강사·관리자만 할 수 있어요. 필요하면 선생님께 말씀해 주세요.</p>
          )}
        </section>
      </div>
    </>
  );
}
