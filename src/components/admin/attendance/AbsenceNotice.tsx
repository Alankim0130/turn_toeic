"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sendAbsenceNotice } from "@/app/admin/attendance/actions";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export type AbsenteeView = { id: string; name: string; tester: boolean; labels: string[]; absent: boolean; sentAt: string | null };

/**
 * 그 날 결석·미출석 학생과 **한 번에 알림 보내기** (2026-10-01 Alan — "결석한 학생들에게는 전체 알림 메시지를 보낼 수 있도록").
 * 비대면 인증의 "미인증 N명에게 알림 보내기"(CheckinRoster)와 같은 길이다 — 학생 알림함(`student_messages`, kind `attendance`)으로만 간다.
 * 문자·카톡·푸시는 가지 않는다. 이미 보낸 학생은 `알림 보냄` 이 붙고 처음에는 체크가 빠져 있다 (같은 알림을 두 번 보내지 않게).
 * 보내는 것은 **강사·관리자만**이다 (`canSend`) — 알림함 쓰기 정책이 스태프만 열려 있다. 조교는 목록만 본다.
 * 받는 사람은 서버가 다시 고른다 (`sendAbsenceNotice` — 그 날 수업이 끝났고 결석·미출석인 학생만).
 */
export function AbsenceNotice({
  date,
  dateLabel,
  absentees,
  canSend,
  linkStudents = true,
  defaultMessage,
}: {
  date: string;
  dateLabel: string;
  absentees: AbsenteeView[];
  canSend: boolean;
  /** 이름을 학생 관리로 잇나 — 조교에게는 학생명단 · 학생 관리가 없어 글자로만 둔다 (2026-10-03) */
  linkStudents?: boolean;
  defaultMessage: { title: string; body: string };
}) {
  const router = useRouter();
  const [compose, setCompose] = useState<{ title: string; body: string } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  if (absentees.length === 0) return null;
  const unsent = absentees.filter((a) => !a.sentAt);

  const start = () => {
    setPicked(new Set(unsent.map((a) => a.id)));
    setCompose(defaultMessage);
    setMsg(null);
  };

  async function send() {
    if (!compose || busy) return;
    setBusy(true);
    const res = await sendAbsenceNotice({ date, userIds: [...picked], title: compose.title, body: compose.body }).catch(() => ({ ok: false, error: "보내지 못했어요. 잠시 뒤 다시 해 주세요." }) as const);
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "warning", text: res.error ?? "보내지 못했어요." });
    setMsg({ kind: "success", text: `${res.sent}명에게 결석 알림을 보냈어요. 학생 알림함(마이페이지 → 알림)에서 볼 수 있어요.` });
    setCompose(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="absent-title" className="card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-red-50/70 px-5 py-3">
        <div className="min-w-0">
          <h2 id="absent-title" className="font-black text-ink">
            {dateLabel} 결석·미출석 <span className="text-red-600 tabular-nums">{absentees.length}명</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate">수업이 끝났는데 출석 기록이 없거나 결석으로 정한 학생이에요. 지각생은 왔으니 넣지 않아요.</p>
        </div>
        {canSend && !compose && (
          <button type="button" onClick={start} className="btn-primary !px-4 !py-2 text-sm">
            <Icon name="bell" size={18} />
            {unsent.length > 0 ? `${unsent.length}명에게 알림 보내기` : "다시 보내기"}
          </button>
        )}
      </div>

      {msg && (
        <div className="px-5 pt-3">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}

      <ul className="divide-y divide-line">
        {absentees.map((a) => (
          <li key={a.id} className={cn("flex items-start gap-3 px-5 py-2.5 text-sm", compose && "cursor-pointer")}>
            {compose && (
              <input
                type="checkbox"
                className="mt-1"
                aria-label={`${a.name}에게 보내기`}
                checked={picked.has(a.id)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(a.id);
                  else next.delete(a.id);
                  setPicked(next);
                }}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5">
                {linkStudents ? (
                  <Link href={`/admin/students/${a.id}`} className="font-bold text-ink hover:underline">{a.name || "-"}</Link>
                ) : (
                  <span className="font-bold text-ink">{a.name || "-"}</span>
                )}
                {a.tester && <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] font-bold text-slate">테스터</span>}
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", a.absent ? "bg-red-100 text-red-700" : "bg-red-50 text-red-700 ring-1 ring-red-200")}>{a.absent ? "결석" : "미출석"}</span>
                {a.sentAt && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">알림 보냄 {a.sentAt}</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate">{a.labels.join(" / ")}</p>
            </div>
          </li>
        ))}
      </ul>

      {compose && (
        <div className="space-y-2 border-t border-line bg-surface px-5 py-3">
          <input value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} maxLength={80} className="input !py-2 text-sm font-bold" aria-label="제목" />
          <textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} maxLength={1000} rows={3} className="input resize-y text-sm" aria-label="내용" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={send} disabled={busy || picked.size === 0} className="btn-primary !px-4 !py-2 text-sm">
              {busy ? "보내는 중…" : `${picked.size}명에게 알림 보내기`}
            </button>
            <button type="button" onClick={() => setCompose(null)} disabled={busy} className="btn-ghost !px-3 !py-2 text-sm">
              취소
            </button>
            <span className="text-xs text-mist">학생의 알림함(마이페이지 → 알림)에 들어가요. 문자·카톡은 가지 않아요.</span>
          </div>
        </div>
      )}

      {!canSend && <p className="border-t border-line px-5 py-2.5 text-xs text-slate">결석 알림은 강사·관리자 계정에서 보낼 수 있어요.</p>}
    </section>
  );
}
