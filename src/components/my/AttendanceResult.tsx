import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { scanView, type ScanResult } from "@/lib/attendance";
import { cn } from "@/lib/utils";

/**
 * 출석 결과 카드. 제대로 찍혔으면(입실·퇴실) **"출석!" 을 크게** 띄운다 (2026-09-22 Alan — "인식이 제대로 된다면, 출석! 이라는 문구").
 * 그 밖(이미 입실 · 수업 없음 · 맞지 않는 QR …)은 안내 카드다. 앱 안 카메라(`AttendanceCamera`)와 `/attend` 가 함께 쓴다.
 */
export function AttendanceResult({ result }: { result: ScanResult }) {
  const v = scanView(result);
  if (!v.headline) {
    return (
      <Alert kind={v.tone} title={v.title}>
        {v.body}
      </Alert>
    );
  }
  const late = v.tone === "warning";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("rounded-2xl px-5 py-6 text-center ring-2", late ? "bg-amber-50 ring-amber-300" : "bg-brand-50 ring-brand-500")}
    >
      <Icon name="success" size={48} className="mx-auto" />
      <p className={cn("mt-2 text-5xl font-black tracking-tight", late ? "text-amber-700" : "text-brand-600")}>{v.headline}</p>
      <p className="mt-3 text-base font-black text-ink">{v.title}</p>
      <p className="mt-1 text-sm text-slate">{v.body}</p>
    </div>
  );
}
