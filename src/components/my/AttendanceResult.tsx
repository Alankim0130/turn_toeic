import { Alert } from "@/components/ui/Alert";
import { scanView, type ScanResult } from "@/lib/attendance";

/** 출석 결과 카드 — 입실(분홍) · 퇴실(초록 확정) · 안내 */
export function AttendanceResult({ result }: { result: ScanResult }) {
  const v = scanView(result);
  return (
    <Alert kind={v.tone} title={v.title}>
      {v.body}
    </Alert>
  );
}
