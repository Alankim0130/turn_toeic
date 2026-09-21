import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { isStaff, requireCrew } from "@/lib/auth";
import { issuedLabel } from "@/lib/attendance-poster";
import { createClient } from "@/lib/supabase/server";
import { rotateAttendancePoster } from "./actions";

export const metadata: Metadata = { title: "출석 QR 포스터", robots: { index: false } };

/**
 * 인쇄용 출석 QR 포스터 관리 (2026-09-21 Alan — "QR을 A5 크기로 2개 해서 A4로 인쇄할 수 있도록").
 * 인쇄는 강사·관리자·조교, 새로 뽑기는 강사·관리자만. 포스터 자체는 `/admin/attendance/poster/print` 가 그린다.
 */
export default async function AttendancePosterPage({ searchParams }: { searchParams: Promise<{ rotated?: string; error?: string }> }) {
  // 조교에게도 열린 화면이다 — 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  const { profile } = await requireCrew();
  const { rotated, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("attendance_poster_token");
  const issued = issuedLabel((data as { created_at?: string } | null)?.created_at);
  const staff = isStaff(profile.role);

  return (
    <>
      <PageHeader icon="camera" title="출석 QR 포스터" description="A4 한 장에 A5 포스터 두 장을 인쇄해 강의실마다 붙여요. 이 QR 은 새로 뽑기 전까지 바뀌지 않아요.">
        <Link href="/admin/attendance/poster/print" className="btn-primary">
          <Icon name="camera" size={18} />
          포스터 열어서 인쇄하기
        </Link>
      </PageHeader>
      <div className="mb-4">
        <Link href="/admin/attendance" className="text-sm font-bold text-brand-600 hover:underline">
          ← 출석 명단
        </Link>
      </div>

      {rotated && (
        <Alert kind="success" className="mb-4">
          새 QR 로 바꿨어요. 포스터를 다시 인쇄해서 붙어 있는 종이를 모두 바꿔 주세요 — 옛 종이는 이제 찍히지 않아요.
        </Alert>
      )}
      {error && (
        <Alert kind="warning" className="mb-4">
          {error === "confirm" ? "확인 칸을 체크해야 바꿀 수 있어요." : "바꾸지 못했어요. 다시 시도해 주세요."}
        </Alert>
      )}

      <div className="space-y-6">
        <section aria-labelledby="now" className="card p-5">
          <h2 id="now" className="text-base font-black text-ink">지금 포스터</h2>
          <p className="mt-1 text-sm text-slate">
            {issued ? <><b className="text-ink">{issued}</b> — 포스터 오른쪽 아래에 같은 시각이 적혀 있어요. 다르면 옛 종이예요.</> : "발행 시각을 읽지 못했어요."}
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate">
            <li>인쇄 설정: 용지 A4 · 방향 가로 · 여백 기본값 · 배율 100%(실제 크기)</li>
            <li>가운데 점선을 자르면 A5 두 장 — 선생님마다 한 장씩이고 QR 은 같아요.</li>
            <li>학생은 휴대폰 기본 카메라로 찍고, 들어올 때 한 번(입실) · 나갈 때 한 번(퇴실) 찍어요.</li>
          </ul>
        </section>

        <section aria-labelledby="diff" className="card p-5">
          <h2 id="diff" className="text-base font-black text-ink">종이 QR 과 화면 QR</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-brand-50/70 p-4 text-sm">
              <p className="font-black text-ink">종이 QR (이 포스터)</p>
              <p className="mt-1 text-slate">
                붙여 두기만 하면 돼요. 대신 <b className="text-ink">사진을 찍어 보내면 교실 밖에서도 찍혀요.</b> 그래도 수업 시간(시작 30분 전 ~ 끝)·현장 수강생 배정·입실 30분 뒤 퇴실은 서버가 그대로 막아요.
              </p>
            </div>
            <div className="rounded-xl bg-surface p-4 text-sm">
              <p className="font-black text-ink">화면 QR (30초마다 바뀜)</p>
              <p className="mt-1 text-slate">
                교실에 있어야만 찍혀요. 태블릿·TV 가 필요해요.{" "}
                <Link href="/admin/attendance/qr" className="font-bold text-brand-600 hover:underline">
                  교실에 QR 띄우기
                </Link>
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-mist">둘은 함께 써도 돼요 — 어느 쪽으로 찍어도 같은 출석이에요.</p>
        </section>

        <section aria-labelledby="rotate" className="card p-5">
          <h2 id="rotate" className="text-base font-black text-ink">새 QR 로 바꾸기</h2>
          {staff ? (
            <form action={rotateAttendancePoster} className="mt-2 space-y-3">
              <p className="text-sm text-slate">
                포스터 사진이 돌아다닌다 싶으면 바꾸세요. <b className="text-ink">누르는 순간 붙어 있는 종이는 모두 찍히지 않아요</b> — 새로 인쇄해서 바꿔 붙여야 해요.
              </p>
              <label className="flex items-center gap-2 text-sm font-bold text-ink">
                <input type="checkbox" name="confirm" required className="h-4 w-4 accent-brand-500" />
                붙어 있는 포스터를 모두 새로 인쇄해서 바꿀게요
              </label>
              <button type="submit" className="btn-secondary">새 QR 로 바꾸기</button>
            </form>
          ) : (
            <p className="mt-1 text-sm text-slate">새 QR 로 바꾸기는 강사·관리자만 할 수 있어요. 필요하면 선생님께 말씀해 주세요.</p>
          )}
        </section>
      </div>
    </>
  );
}
