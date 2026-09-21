import type { Metadata } from "next";
import Link from "next/link";
import { requireCrew } from "@/lib/auth";
import { QrDisplay } from "./QrDisplay";

export const metadata: Metadata = { title: "출석 QR", robots: { index: false } };

/**
 * 교실 화면(태블릿·TV·강사 PC)에 띄우는 출석 QR (2026-09-21). 강사·관리자·조교가 로그인한 기기에서 연다.
 * 두 강의실이면 두 기기에 같은 화면을 띄우면 된다 — 학생의 반은 서버가 배정으로 정한다.
 */
export default async function AttendanceQrPage() {
  // 조교에게도 열린 화면이다 — 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  await requireCrew();
  return (
    <div className="mx-auto max-w-3xl py-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-ink">출석 QR</h1>
        <Link href="/admin/attendance" className="text-sm font-bold text-brand-600 hover:underline">
          ← 출석 명단
        </Link>
      </div>
      <QrDisplay />
      <p className="mt-8 text-center text-xs text-mist">
        휴대폰 기본 카메라로 찍으면 출석 화면이 열려요. 처음 찍으면 입실, 나갈 때 한 번 더 찍으면 퇴실이에요.
      </p>
    </div>
  );
}
