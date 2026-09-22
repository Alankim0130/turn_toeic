"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AttendanceResult } from "@/components/my/AttendanceResult";
import { scanAttendance } from "@/app/my/attendance/actions";
import type { ScanResult } from "@/lib/attendance";

/**
 * QR 을 찍어 열린 화면. 열리자마자 한 번 찍는다 (POST — 서버 액션). 주소만 열어서는 아무것도 바뀌지 않게
 * 화면이 그려진 뒤에 부른다 (미리 불러오기·새로고침으로 몰래 찍히지 않게, 한 번 찍으면 다시 부르지 않는다).
 */
export function AttendScan({ token }: { token: string }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    scanAttendance(token)
      .then(setResult)
      .catch(() => setResult({ action: "error" }));
  }, [token]);

  return (
    <div className="space-y-4">
      {result ? <AttendanceResult result={result} /> : <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-slate">출석을 확인하는 중이에요…</p>}
      <div className="flex flex-wrap gap-2">
        <Link href="/my/attendance" className="btn-secondary">내 출석 보기</Link>
        <Link href="/my" className="btn-ghost">마이페이지</Link>
      </div>
    </div>
  );
}
