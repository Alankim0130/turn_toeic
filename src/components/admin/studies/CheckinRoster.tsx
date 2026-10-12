"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendStudentMessages } from "@/app/admin/study/message-actions";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate } from "@/lib/utils";
import { missingCheckinMessage } from "@/lib/study-checkin";
import { materialVisibleTo, STUDY_LEVEL_ALL, studyLevelLabel } from "@/lib/study";

/**
 * 인증 표의 한 사람. 이름 옆은 **그 달에 듣는 반**이다 (2026-09-19 Alan — "650 주5일 10:00~12:10 이런거"), 그 아래 **스터디 레벨** (2026-10-12).
 *
 * 등급을 적지 않는 이유: 스터디는 **그 달 반에 배정된 수강생만** 신청할 수 있어서
 * (`private.is_term_enrollee`) 여기 선 사람은 전원 같은 등급이다 — 자리만 먹는다.
 * 연락처도 적지 않는다 — 스터디 신청자 화면 어디에도 전화번호를 두지 않는다 (2026-09-23 Alan "이 번호가 필요없다").
 * `classes` 는 주5일을 한 줄로 합친 반 이름이고 달(`9월`)은 뺀다 — 화면 전체가 한 기수다.
 */
export type RosterStudent = { id: string; name: string; classes: string[]; level: number | null };
/**
 * 그 달에 적용된 비대면 자료 한 줄 (seq = 회차, 2026-09-22 — 자료는 회차로 한 번 올리고 매달 수업일 순서로 열린다).
 * **같은 날에 레벨마다 한 줄**이다 (2026-10-12 — level 0 = 공통, 1 · 2 · 3). 학생에게는 내 레벨의 것과 공통만 그 날의 자료다
 */
export type RosterMaterial = { id: number; seq?: number | null; level: number; date: string; title: string | null };
export type RosterCheckin = { material_id: number; user_id: string; created_at: string; files: number };

/** 반 이름 줄. 한 사람이 두 반이면 줄을 쌓는다 (주5일은 이미 한 줄로 합쳐져 넘어온다) */
function ClassLines({ classes, small }: { classes: string[]; small?: boolean }) {
  if (classes.length === 0) return <span className={cn(small ? "text-[11px]" : "text-xs", "text-mist")}>반 미배정</span>;
  return (
    <>
      {classes.map((c, i) => (
        <span key={i} className={cn("block font-semibold", small ? "text-[11px] text-slate" : "text-xs text-ink")}>{c}</span>
      ))}
    </>
  );
}

/** 레벨 알약 — 공통은 회색, 레벨은 분홍, 미정은 주황 */
function LevelChip({ level, className }: { level: number | null; className?: string }) {
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", level == null ? "bg-amber-100 text-amber-800" : level === STUDY_LEVEL_ALL ? "bg-line text-slate" : "bg-brand-100 text-brand-700", className)}>
      {studyLevelLabel(level)}
    </span>
  );
}

/**
 * 비대면 스터디 **인증 현황**. 두 가지로 보여 준다:
 *  ① **한눈에 보기** — 학생 × 날짜 격자 (2026-09-19 Alan: "학생들이 비대면을 신청하고 난 뒤,
 *     인증을 했는지 안했는지 강사모드에서 한번에 쭈욱 확인이 가능하면 좋겠어")
 *  ② **날짜별 카드** — 자료마다 인증함/미인증으로 나누고 미인증 학생에게 알림을 보낸다 (2026-09-18 Alan)
 *
 * **레벨** (2026-10-12): 자료가 레벨마다 있어서, 학생의 그 날 자료 = 내 레벨의 것 + 공통. 격자의 한 칸은 날짜 하나이고 그 학생에게
 * 그 날 자료가 하나도 없으면(그 레벨 자료가 없다) '해당 없음' 이다. 날짜별 카드는 자료(레벨)마다 하나이고 그 자료를 받는 학생만 센다.
 *
 * **숙제점검(`/admin/homework`)과 완전히 다른 것이다** — 그쪽은 정규 수업 숙제다 (2026-09-19 Alan).
 * 인증을 안 한 학생에게 **자료를 막는 규정은 아직 없다** (Alan: "정확한 규정은 아직 확인을 안 해봤지만") —
 * 여기서 임의로 막지 말 것.
 */
export function CheckinRoster({
  students,
  materials,
  checkins,
  today,
}: {
  students: RosterStudent[];
  materials: RosterMaterial[];
  checkins: RosterCheckin[];
  /** 오늘 (KST, 서버가 넘긴다). 자료는 **그 날짜부터** 학생에게 열리므로 앞날 자료는 미인증으로 세지 않는다 (2026-09-22 점검) */
  today: string;
}) {
  const router = useRouter();
  const isOpen = (m: RosterMaterial) => m.date <= today;
  const forStudent = (m: RosterMaterial, st: RosterStudent) => materialVisibleTo(m.level, st.level);
  // 처음 펼칠 자료: 이미 열린 자료 중 가장 최근 — 앞날 자료를 펼치면 전원이 미인증으로 보인다
  const [openId, setOpenId] = useState<number | null>(materials.find(isOpen)?.id ?? null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState<{ materialId: number; title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const byMaterial = new Map<number, Map<string, RosterCheckin>>();
  for (const c of checkins) byMaterial.set(c.material_id, (byMaterial.get(c.material_id) ?? new Map()).set(c.user_id, c));

  const startCompose = (m: RosterMaterial, missing: RosterStudent[]) => {
    setPicked(new Set(missing.map((s) => s.id)));
    const t = missingCheckinMessage(m.date);
    setCompose({ materialId: m.id, ...t });
    setMsg(null);
  };

  async function send(m: RosterMaterial) {
    if (!compose || busy) return;
    setBusy(true);
    const res = await sendStudentMessages({ userIds: [...picked], title: compose.title, body: compose.body, kind: "study_checkin", related: { materialId: m.id, date: m.date } });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "warning", text: res.error ?? "보내지 못했어요." });
    setMsg({ kind: "success", text: `${res.sent}명에게 알림을 보냈어요. 학생 알림함에서 볼 수 있어요.` });
    setCompose(null);
    router.refresh();
  }

  if (materials.length === 0) {
    return <p className="card p-6 text-center text-sm text-slate">이 달에 들어간 자료가 없어요. 비대면 자료를 회차로 올리면 이 달 수업일마다 인증 현황이 여기 나옵니다.</p>;
  }

  // 격자의 열 = 날짜 (같은 날 자료가 레벨마다 있어도 한 칸). 자료 순서(최근 날짜부터)를 따른다
  const days: { date: string; seq: number | null; mats: RosterMaterial[] }[] = [];
  for (const m of materials) {
    const d = days.find((x) => x.date === m.date);
    if (d) d.mats.push(m);
    else days.push({ date: m.date, seq: m.seq ?? null, mats: [m] });
  }
  const hasLevels = materials.some((m) => m.level !== STUDY_LEVEL_ALL);
  /** 그 날 그 학생의 자료 중 인증한 것 · 해당 자료가 있는지 */
  const cellOf = (day: (typeof days)[number], st: RosterStudent) => {
    const mine = day.mats.filter((m) => forStudent(m, st));
    const c = mine.map((m) => byMaterial.get(m.id)?.get(st.id)).find((x) => !!x) ?? null;
    return { has: mine.length > 0, open: mine.some(isOpen), checkin: c };
  };

  // 한눈에 보기: 미인증이 많은 학생을 위로 (2026-09-19 Alan — "인증을 했는지 안했는지 강사모드에서 한번에 쭈욱 확인")
  const missedOf = (st: RosterStudent) =>
    days.filter((d) => {
      const cell = cellOf(d, st);
      return cell.has && cell.open && !cell.checkin;
    }).length;
  const openedOf = (st: RosterStudent) =>
    days.filter((d) => {
      const cell = cellOf(d, st);
      return cell.has && cell.open;
    }).length;
  const ranked = [...students].sort((a, b) => missedOf(b) - missedOf(a) || (a.name || "").localeCompare(b.name || ""));

  return (
    <div className="space-y-3">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {/* ─── 한눈에 보기 (학생 × 날짜) ───────────────────────────────────────
          날짜별 카드만 있으면 한 사람이 어느 날을 빠뜨렸는지 보려고 자료를 하나씩 펼쳐야 한다.
          자료가 한 달에 18~19개라 가로 스크롤은 어쩔 수 없다 — 이름 칸만 왼쪽에 고정한다 */}
      {students.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-line bg-brand-50/60 px-4 py-3">
            <p className="font-black text-ink">한눈에 보기</p>
            <p className="mt-0.5 text-xs text-slate">
              신청 {students.length}명 × 자료 {days.length}일 · 미인증이 많은 학생이 위로 옵니다. 알림 보내기는 아래 날짜별 칸에서 해요.
              {hasLevels && " 칸은 그 학생 레벨의 자료(공통 포함)로 봐요 — 그 날 그 레벨 자료가 없으면 빈칸이에요."}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead className="bg-surface text-xs text-slate">
                <tr>
                  <th className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-bold">이름</th>
                  {days.map((d) => (
                    <th key={d.date} className="px-1.5 py-2 text-center font-bold tabular-nums" title={`${d.seq ? `${d.seq}회차 · ` : ""}${formatDate(d.date)}`}>
                      {d.seq && <span className="block text-[10px] font-black text-brand-600">{d.seq}회</span>}
                      {Number(d.date.slice(5, 7))}/{Number(d.date.slice(8, 10))}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-bold">인증</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranked.map((st) => {
                  const missed = missedOf(st);
                  const opened = openedOf(st);
                  return (
                    <tr key={st.id} className={cn(missed > 0 && "bg-amber-50/40")}>
                      <th scope="row" className={cn("sticky left-0 z-10 px-4 py-1.5 text-left font-bold text-ink", missed > 0 ? "bg-[#fffbeb]" : "bg-paper")}>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          {st.name || "-"}
                          {hasLevels && <LevelChip level={st.level} />}
                        </span>
                        {/* 반은 한 줄씩 쌓는다 — 옆으로 이어 붙이면 고정된 이름 칸이 넓어져 날짜 칸이 밀려난다 */}
                        {st.classes.map((c, i) => (
                          <span key={i} className="block whitespace-nowrap text-[11px] font-semibold text-slate">{c}</span>
                        ))}
                        {st.classes.length === 0 && <span className="block text-[11px] font-semibold text-mist">반 미배정</span>}
                      </th>
                      {days.map((d) => {
                        const cell = cellOf(d, st);
                        return (
                          <td key={d.date} className="px-1.5 py-1.5 text-center">
                            {!cell.has ? (
                              // 그 날 이 학생 레벨의 자료가 없다 — 인증할 것이 없다
                              <span role="img" aria-label={`${formatDate(d.date)} 해당 자료 없음`} className="inline-block h-5 w-5 align-middle text-mist" title={`${formatDate(d.date)} 이 레벨 자료 없음`}>
                                –
                              </span>
                            ) : !cell.checkin && !cell.open ? (
                              <span
                                role="img"
                                aria-label={`${formatDate(d.date)} 공개 전`}
                                className="inline-block h-5 w-5 rounded-full border border-dashed border-line align-middle"
                                title={`${formatDate(d.date)} 공개 전`}
                              />
                            ) : cell.checkin ? (
                              <span
                                role="img"
                                aria-label={`${formatDate(d.date)} 인증함`}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white"
                                title={`${formatDate(d.date)} 인증 · 사진 ${cell.checkin.files}장`}
                              >
                                {/* 12px 에서는 힉스필드 PNG 가 뭉개진다 — 도형(인라인 SVG)으로 그린다 (디자인 원칙) */}
                                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M3.5 8.5l3 3 6-7" />
                                </svg>
                              </span>
                            ) : (
                              // `sr-only` 자식을 두지 말 것 — position:absolute 라 가로 스크롤 상자를 빠져나가
                              // **페이지 전체가 옆으로 밀린다** (320px 에서 15px 넘쳤다). 설명은 aria-label 로 단다
                              <span
                                role="img"
                                aria-label={`${formatDate(d.date)} 미인증`}
                                className="inline-block h-5 w-5 rounded-full bg-line align-middle"
                                title={`${formatDate(d.date)} 미인증`}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right text-xs font-black tabular-nums">
                        <span className={cn(missed > 0 ? "text-amber-800" : "text-brand-700")}>
                          {opened - missed} / {opened}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {materials.map((m) => {
        const done = byMaterial.get(m.id) ?? new Map<string, RosterCheckin>();
        // 이 자료(레벨)를 받는 학생만 — 공통은 전원
        const takers = students.filter((s) => forStudent(m, s));
        const missing = takers.filter((s) => !done.has(s.id));
        const open = openId === m.id;
        const released = isOpen(m);
        return (
          <section key={m.id} className="card overflow-hidden">
            <button type="button" onClick={() => setOpenId(open ? null : m.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left hover:bg-brand-50/40" aria-expanded={open}>
              <span className="flex flex-wrap items-center gap-2 font-black text-ink">
                <span>
                  {m.seq ? `${m.seq}회차 · ` : ""}
                  {formatDate(m.date)} {m.title && <span className="ml-1 text-sm font-semibold text-slate">· {m.title}</span>}
                </span>
                {hasLevels && <LevelChip level={m.level} className="!text-[11px]" />}
              </span>
              {released ? (
                <span className="flex items-center gap-2 text-sm font-bold tabular-nums">
                  <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-white">인증 {done.size}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5", missing.length ? "bg-amber-100 text-amber-800" : "bg-line text-slate")}>미인증 {missing.length}</span>
                  <span className="text-slate">/ 신청 {takers.length}</span>
                </span>
              ) : (
                <span className="rounded-full bg-line px-2.5 py-0.5 text-sm font-bold text-slate">공개 전 — 이 날짜부터 학생에게 열려요</span>
              )}
            </button>

            {open && (
              <div className="border-t border-line">
                {takers.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate">이 레벨로 신청한 학생이 없어요.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-surface text-left text-xs text-slate">
                      <tr>
                        <th className="px-5 py-2 font-bold">이름</th>
                        {/* 좁은 화면에서는 칸을 접고 이름 아래로 내린다 — 칸으로 두면 320px 에서 이름이 한 글자씩 세로로 쪼개진다 */}
                        <th className="hidden px-3 py-2 font-bold sm:table-cell">반</th>
                        <th className="px-3 py-2 font-bold">인증</th>
                        {compose?.materialId === m.id && <th className="px-3 py-2 font-bold">보내기</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {takers.map((s) => {
                        const c = done.get(s.id);
                        return (
                          <tr key={s.id} className={cn(!c && "bg-amber-50/40")}>
                            <td className="px-5 py-2 font-bold text-ink">
                              <span className="flex items-center gap-1.5 whitespace-nowrap">
                                {s.name || "-"}
                                {hasLevels && <LevelChip level={s.level} />}
                              </span>
                              <span className="sm:hidden"><ClassLines classes={s.classes} small /></span>
                            </td>
                            <td className="hidden px-3 py-2 sm:table-cell"><ClassLines classes={s.classes} /></td>
                            <td className="px-3 py-2">
                              {c ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-700">
                                  <Icon name="success" size={14} /> {formatDate(c.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · 사진 {c.files}장
                                </span>
                              ) : (
                                <span className="text-xs font-black text-amber-800">미인증</span>
                              )}
                            </td>
                            {compose?.materialId === m.id && (
                              <td className="px-3 py-2">
                                {!c && (
                                  <input
                                    type="checkbox"
                                    aria-label={`${s.name}에게 보내기`}
                                    checked={picked.has(s.id)}
                                    onChange={(e) => {
                                      const next = new Set(picked);
                                      if (e.target.checked) next.add(s.id);
                                      else next.delete(s.id);
                                      setPicked(next);
                                    }}
                                  />
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <div className="border-t border-line bg-surface px-5 py-3">
                  {compose?.materialId === m.id ? (
                    <div className="space-y-2">
                      <input value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} maxLength={80} className="input !py-2 text-sm font-bold" aria-label="제목" />
                      <textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} maxLength={1000} rows={3} className="input resize-y text-sm" aria-label="내용" />
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => send(m)} disabled={busy || picked.size === 0} className="btn-primary !px-4 !py-2 text-sm">
                          {busy ? "보내는 중…" : `${picked.size}명에게 알림 보내기`}
                        </button>
                        <button type="button" onClick={() => setCompose(null)} disabled={busy} className="btn-ghost !px-3 !py-2 text-sm">취소</button>
                        <span className="text-xs text-mist">학생의 알림함(마이페이지 → 알림)에 들어가요. 문자·카톡은 가지 않아요.</span>
                      </div>
                    </div>
                  ) : !released ? (
                    <p className="text-sm text-slate">아직 공개 전이라 알림을 보낼 수 없어요.</p>
                  ) : takers.length === 0 ? null : missing.length > 0 ? (
                    <button type="button" onClick={() => startCompose(m, missing)} className="btn-secondary !px-4 !py-2 text-sm">
                      <Icon name="bell" size={18} />
                      미인증 {missing.length}명에게 알림 보내기
                    </button>
                  ) : (
                    <p className="text-sm font-bold text-brand-700">전원 인증했어요.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
