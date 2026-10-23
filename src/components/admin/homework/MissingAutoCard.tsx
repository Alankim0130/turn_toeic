"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHomeworkMissingAuto, type MissingAutoResult } from "@/app/admin/homework/missing/actions";
import { Icon } from "@/components/ui/Icon";
import { AUTO_HOURS, AUTO_MINUTES } from "@/lib/homework-missing-auto";
import { cn } from "@/lib/utils";

export type MissingAutoView =
  | {
      kind: "ready";
      enabled: boolean;
      hour: string;
      minute: string;
      /** "10월 20일 (화) 21:00" — 꺼져 있으면 null */
      next: string | null;
      /** 오늘 시각이 지났고 아직 안 돌았다 — 5분 안에 보낸다 */
      nextSoon: boolean;
      /** 마지막 자동 알림 한 줄 */
      last: { text: string; tone: "ok" | "quiet" | "error" } | null;
      /** 마지막으로 실제로 보낸 날 (마지막 실행이 보낼 학생이 없었을 때만) */
      lastSent: string | null;
      /** "10월 19일 20:31 · 강사엘" — 켜기 · 시각을 바꾼 사람과 때 */
      changed: string | null;
    }
  /** 설정을 읽지 못했다 (방금 배포했거나 잠깐 실패) */
  | { kind: "unreadable" }
  /** 테스트 등급을 켠 강사 · 관리자 — RLS 가 학생으로 보아 설정을 못 읽는다 */
  | { kind: "testing" };

const PICK = "input select-chevron !w-auto !py-2 !pl-2.5 !pr-[1.375rem] text-base font-bold tabular-nums";

/**
 * **숙제 미제출 자동 알림** 설정 칸 — 숙제 미제출 알림 화면 맨 위 (2026-10-19 Alan — "여기 미제출알림 맨 위에 자동알림 보내기 설정칸이 있으면 좋겠어").
 * 켜기 · 보내는 시각(시 · 분 — 시간표 설정과 같은 고르는 칸, 24시간제)을 **강사 · 관리자**가 바꾸고, 조교는 상태만 본다 (서버 액션 · DB 정책이 한 번 더 막는다).
 * 보내기는 직접 한다 — `<form action>` 이면 React 19 가 끝난 뒤 폼을 초기화해 스위치 · 고르는 칸이 처음 모양으로 돌아간다 (교재주문 폼과 같은 함정).
 */
export function MissingAutoCard({ view, canEdit }: { view: MissingAutoView; canEdit: boolean }) {
  const router = useRouter();
  const ready = view.kind === "ready" ? view : null;
  const [enabled, setEnabled] = useState(ready?.enabled ?? false);
  const [hour, setHour] = useState(ready?.hour ?? "21");
  const [minute, setMinute] = useState(ready?.minute ?? "00");
  const [result, setResult] = useState<MissingAutoResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (view.kind === "testing") {
    return (
      <p className="mb-5 rounded-xl2 border border-line bg-paper p-4 text-sm text-slate">
        테스트 등급으로 보는 중이라 <b className="text-ink">자동 알림 설정</b>을 볼 수 없어요 — 테스트를 끝내면 보여요.
      </p>
    );
  }
  if (view.kind === "unreadable") {
    return (
      <p className="mb-5 rounded-xl2 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <b>자동 알림 설정</b>을 읽지 못했어요. 잠시 뒤 새로고침해 주세요.
      </p>
    );
  }
  const v = view;
  const dirty = enabled !== v.enabled || hour !== v.hour || minute !== v.minute;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await saveHomeworkMissingAuto({ enabled, hour, minute }).catch(
        () => ({ ok: false, error: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." }) as const,
      );
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="missing-auto-title" className="card mb-5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", v.enabled ? "bg-brand-50" : "bg-surface")}>
          <Icon name="bell" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id="missing-auto-title" className="text-base font-black text-ink">
              자동 알림
            </h2>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-bold",
                v.enabled ? "bg-brand-500 text-white" : "bg-surface text-slate ring-1 ring-line",
              )}
            >
              {v.enabled ? `켜짐 · 매일 ${v.hour}:${v.minute}` : "꺼짐"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">
            매일 정한 시각에 <b className="text-ink">그날 제출 기한이 지난 숙제를 안 낸 학생</b>에게만 알림이 가요. 월수금 수업일에는 월수금 숙제, 화목금 수업일에는
            화목금 숙제예요 (기한은 같은 트랙 다음 수업일 오후 5시).
          </p>
          <p className="mt-1 text-xs text-mist">
            숙제제출 화면에서 알림을 끈 학생은 빼요. 한 학생에게 하루 한 통만 가고, 이미 알림을 받은 숙제로는 다시 보내지 않아요 (아래에서 손으로 보낸 알림도 세요).
          </p>
        </div>
      </div>

      {canEdit ? (
        <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-4">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-bold text-ink">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={pending}
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
              />
              <span
                aria-hidden
                className="h-7 w-12 rounded-full bg-line transition peer-checked:bg-brand-500 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100"
              />
              <span aria-hidden className="absolute left-1 top-1 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
            자동 알림 켜기
          </label>

          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink-soft">보내는 시각</span>
            <span className="inline-flex items-center gap-0.5">
              <select value={hour} onChange={(e) => setHour(e.target.value)} disabled={pending} className={PICK} aria-label="보내는 시각 — 시">
                {AUTO_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span aria-hidden className="font-black text-ink-soft">
                :
              </span>
              <select value={minute} onChange={(e) => setMinute(e.target.value)} disabled={pending} className={PICK} aria-label="보내는 시각 — 분">
                {AUTO_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </span>
          </span>

          <button type="submit" disabled={pending || !dirty} className="btn-primary w-full !py-2.5 text-sm sm:ml-auto sm:w-auto">
            {pending ? "저장하는 중…" : "저장"}
          </button>
          <p className="w-full text-xs text-mist">시각은 오후 5시(숙제 기한)부터 밤 11시 55분까지, 5분 단위로 골라요. 저장하면 다음 그 시각부터 보내요.</p>
        </form>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-xs text-mist">자동 알림 설정은 강사님이 바꿔요.</p>
      )}

      {result && (
        <p role="status" className={cn("mt-2 text-sm font-bold", result.ok ? "text-brand-700" : "text-red-700")}>
          {result.ok ? result.message : result.error}
        </p>
      )}

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-bold text-ink-soft">다음 자동 알림</dt>
          <dd className="text-ink">{v.next ? (v.nextSoon ? `${v.next} — 곧 보내요` : v.next) : "꺼져 있어요"}</dd>
        </div>
        {v.last && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-bold text-ink-soft">마지막 자동 알림</dt>
            <dd className={cn(v.last.tone === "error" ? "font-semibold text-red-700" : v.last.tone === "quiet" ? "text-slate" : "text-ink")}>{v.last.text}</dd>
          </div>
        )}
        {v.lastSent && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-bold text-ink-soft">마지막으로 보낸 날</dt>
            <dd className="text-ink">{v.lastSent}</dd>
          </div>
        )}
        {v.changed && <p className="text-xs text-mist">{v.changed} 바꿈</p>}
      </dl>
    </section>
  );
}
