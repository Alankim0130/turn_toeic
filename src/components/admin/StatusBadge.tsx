import { cn } from "@/lib/utils";

type Tone = "pink" | "ink" | "gray" | "green" | "amber" | "red";

const TONE: Record<Tone, string> = {
  pink: "bg-brand-100 text-brand-700",
  ink: "bg-ink text-white",
  gray: "bg-line text-slate",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
};

export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  // enrollment_orders
  preliminary: { label: "예비등록", tone: "amber" },
  active: { label: "수강 중", tone: "green" },
  expired: { label: "만료", tone: "gray" },
  // enrollments
  pending_section: { label: "반 대기", tone: "amber" },
  completed: { label: "완료", tone: "gray" },
  // verifications
  approved: { label: "승인", tone: "green" },
  rejected: { label: "반려", tone: "red" },
  pending: { label: "검토 대기", tone: "amber" },
  // textbook_orders
  requested: { label: "신청", tone: "amber" },
  confirmed: { label: "확인", tone: "pink" },
  shipped: { label: "발송", tone: "green" },
  cancelled: { label: "취소", tone: "gray" },
  // 기타 상태 (연락함 · 종료)
  contacted: { label: "연락함", tone: "pink" },
  closed: { label: "종료", tone: "gray" },
  // contact_messages
  new: { label: "새 문의", tone: "amber" },
  read: { label: "읽음", tone: "pink" },
  replied: { label: "답변 완료", tone: "green" },
  // roles
  member: { label: "회원", tone: "gray" },
  student: { label: "수강생", tone: "green" },
  alumni: { label: "졸업생", tone: "ink" },
  instructor: { label: "강사", tone: "pink" },
  assistant: { label: "조교", tone: "pink" },
  admin: { label: "관리자", tone: "pink" },
  guest: { label: "비회원", tone: "gray" },
  // modes
  onsite: { label: "현장", tone: "ink" },
  live: { label: "불라방", tone: "pink" },
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const meta = (status && STATUS_META[status]) || { label: status ?? "-", tone: "gray" as Tone };
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", TONE[meta.tone], className)}>
      {meta.label}
    </span>
  );
}
