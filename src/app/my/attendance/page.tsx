import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { AttendanceCamera } from "@/components/my/AttendanceCamera";
import { AttendanceRate } from "@/components/my/AttendanceRate";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "출석 찍기", robots: { index: false } };

/**
 * 출석 찍기 (2026-09-21 Alan — "입실과 퇴실 다 받자" → 2026-10-10 "한번만 찍어도 인정"). 들어오면 **카메라가 바로 켜져** 강의실 앞 출석 QR 을 찍는다
 * (`AttendanceCamera`, 2026-09-22 Alan). 휴대폰 기본 카메라로 찍는 길(`/attend?t=…`)도 그대로 된다.
 * 그 아래 이번 기수 출석률(`AttendanceRate`) — **내 출석 달력과 지난 기록은 따로 둔 화면 `/my/attendance/record`** 에 있다
 * (2026-10-01 Alan — "학생들도 본인이 출석을 잘 하고 있는지 확인 할 수 있는 공간이 따로 마련되면 좋겠어!").
 * 현장 수강생만 찍는다 (불라방·인강 날은 대상이 아니다 — 판정은 DB 함수 attendance_scan).
 */
export default async function MyAttendancePage() {
  // 로그인 확인과 출석률을 함께 받는다 (2026-10-09 화면 전환 속도)
  const [, { data: rate }] = await Promise.all([requireUser("/my/attendance"), createClient().then((s) => s.rpc("my_attendance_summary"))]);

  return (
    <div className="space-y-8">
      <PageHeader icon="location" title="출석 찍기" description="카메라가 켜지면 강의실 앞 출석 QR 을 네모 안에 비춰요. 수업일마다 한 번만 찍으면 돼요.">
        <Link href="/my/attendance/record" className="btn-secondary">
          내 출석 보기
        </Link>
      </PageHeader>

      {/* 들어오자마자 카메라 (2026-09-22 Alan — "출석을 누르면 카메라를 바로 실행해서 촬영") */}
      <section aria-label="출석 QR 찍기" className="card p-4 sm:p-6">
        <AttendanceCamera />
        <p className="mt-3 text-center text-xs text-slate">
          수업 시작 30분 전부터 찍을 수 있고, 수업이 시작된 뒤에 찍으면 지각이에요. 휴대폰 기본 카메라로 QR 을 찍어도 돼요.
        </p>
      </section>

      <AttendanceRate rows={rate ?? []} />
    </div>
  );
}
