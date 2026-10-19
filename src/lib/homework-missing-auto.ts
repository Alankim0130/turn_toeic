import { HOMEWORK_SUBJECTS, type HomeworkSubject } from "@/lib/homework";
import { countsAsStudent, newMissingOf, type MissingGroup, type MissingRow, type MissingSlot } from "@/lib/homework-missing";
import { shiftDate } from "@/lib/term-window";

/**
 * **숙제 미제출 자동 알림** (2026-10-19 Alan — "숙제 미알람을 자동으로 매일 보내주는 시스템이 생기면 좋겠어. 시간은 쌤들이 정할 수 있으며,
 * 월수금, 화목금 위주로 알림을 보내줘. 그리고 알림을 안 받는다고 선택한 친구들에게는 보내지말고, 받는다고 한 친구에게도 두번 가는건 막아줘.
 * 여기 미제출알림 맨 위에 자동알림 보내기 설정칸이 있으면 좋겠어").
 *
 * 숙제 기한은 같은 트랙 다음 수업일 오후 5시다 (`homework-missing.ts` 머리말). 한 날짜는 한 트랙이라 **하루에 기한이 지나는 숙제는 그날 수업의 트랙 하나뿐**이다 —
 * 월수금 수업일 5시에는 월수금 숙제가, 화목금 수업일 5시에는 화목금 숙제가 지난다. 자동 알림은 매일 쌤이 정한 **저녁 시각(17:00 ~ 23:55)에 한 번**
 * 그 뒤로 새로 기한이 지난 숙제를 안 낸 학생에게 간다 → 월수금 날 저녁에는 월수금 숙제, 화목금 날 저녁에는 화목금 숙제 알림이 된다 (주5일은 두 트랙을 따로 본다 — 기한 규칙 그대로).
 *
 * 누구에게 · 무엇을 — 손으로 보내는 미제출 알림과 **같은 격자 · 같은 규칙**이다 (`buildMissingBoard` · `newMissingOf` · `homeworkMissingMessage`):
 *  - 알림을 받는 학생만 (`countsAsStudent` — '알림 안 받기' 를 누른 학생 · 조교 계정은 빼고, 강사 · 관리자 계정은 격자에 아예 없다). DB 트리거도 끈 학생의 줄을 막는다
 *  - **두 번 가지 않게** — ① 하루 한 번만 돈다 (DB `claim_homework_missing_auto` — 그날 실행 한 줄) ② 학생 한 명에게 한 통 (속성반처럼 레벨이 둘이어도 한 통 —
 *    `related.levels` 에 다 적는다) ③ 이미 알림을 받은 숙제로는 다시 보내지 않는다 — 그 레벨에서 마지막 알림(손으로든 자동으로든) 뒤에 기한이 지난 숙제가 있을 때만 (`newMissingOf`)
 *  - **새로 기한이 지난 숙제** = 지난번 자동 알림이 본 때(`windowFrom` — 처음 켠 날은 그날 0시) 뒤에 기한이 지난 것. 켜기 전 숙제를 한꺼번에 알리지 않는다
 *  - 글은 안 낸 숙제를 **다** 적는다 (새로 지난 것 + 전에 알렸는데 아직 안 낸 것 — 손 알림과 같다)
 *  - **이미 끝난 반은 보내지 않는다** — 학생은 종강일 뒤에 숙제를 낼 수 없다 (숙제 정책 · 달력이 수강 중인 반만 연다). 그래서 기수 마지막 수업 숙제처럼
 *    기한이 종강 뒤에 지나는 숙제는 알리지 않는다 (2주완성 학생은 그 반의 종강일 — 앞 절반 마지막 날)
 */

/** 고를 수 있는 시 — 숙제 기한(오후 5시) 뒤의 저녁. 그날 기한이 지난 숙제를 그날 알린다 (DB check 와 같다) */
export const AUTO_HOURS = ["17", "18", "19", "20", "21", "22", "23"] as const;
/** 5분 단위 — 크론이 5분마다 돈다 */
export const AUTO_MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
export const DEFAULT_AUTO_TIME = "21:00";

/** 시 · 분 → "HH:MM" (고를 수 있는 값이 아니면 null — 서버 액션이 그대로 거른다) */
export function autoTime(hour: unknown, minute: unknown): string | null {
  const h = String(hour ?? "").trim();
  const m = String(minute ?? "").trim();
  if (!(AUTO_HOURS as readonly string[]).includes(h) || !AUTO_MINUTES.includes(m)) return null;
  return `${h}:${m}`;
}

/** DB 의 time("21:00:00") → 시 · 분. 꼴이 틀리면 기본 시각 */
export function autoTimeParts(value: string | null | undefined): { hour: string; minute: string } {
  const m = /^(\d{2}):(\d{2})/.exec(value ?? "");
  const t = m ? `${m[1]}:${m[2]}` : DEFAULT_AUTO_TIME;
  const [hour, minute] = t.split(":");
  return { hour, minute };
}

/** "21:00" → "밤 9시" · "17:30" → "오후 5시 30분" (카드 글) */
export function autoTimeLabel(value: string | null | undefined): string {
  const { hour, minute } = autoTimeParts(value);
  const h = Number(hour);
  const part = h >= 21 ? "밤" : "오후";
  return `${part} ${h > 12 ? h - 12 : h}시${minute === "00" ? "" : ` ${Number(minute)}분`}`;
}

/** 한국 날짜(YYYY-MM-DD) + "HH:MM" → 그 시각(ms) */
export function kstInstant(day: string, time: string): number {
  const { hour, minute } = autoTimeParts(time);
  return Date.parse(`${day}T${hour}:${minute}:00+09:00`);
}

/** 지금(ms)의 한국 날짜 */
export const kstDay = (now: number): string => new Date(now).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/**
 * 다음 자동 알림 — 카드의 '다음 자동 알림 · 10월 20일 (화) 21:00'. DB 의 보낼 때 판정(`private.homework_missing_auto_due`)과 같은 규칙:
 * 오늘 정한 시각이 켜기 · 시각 바꾸기 뒤이고 오늘 실행이 아직 끝나지 않았으면 오늘(시각이 지났으면 `soon` — 5분 안에 보낸다), 아니면 내일.
 * 꺼져 있으면 null.
 */
export function nextAutoRun(
  setting: { enabled: boolean; sendTime: string; scheduleChangedAt: number },
  todayRun: { finished: boolean } | null,
  now: number,
): { day: string; time: string; soon: boolean } | null {
  if (!setting.enabled) return null;
  const today = kstDay(now);
  const { hour, minute } = autoTimeParts(setting.sendTime);
  const time = `${hour}:${minute}`;
  const at = kstInstant(today, time);
  if (!todayRun?.finished && at > setting.scheduleChangedAt) return { day: today, time, soon: at <= now };
  return { day: shiftDate(today, 1), time, soon: false };
}

/**
 * 미제출 알림이 다룬 레벨 — `related.levels`(자동 알림, 여러 레벨) ∪ `related.level`(손 알림, 레벨 탭 하나).
 * DB `private.homework_missing_levels` 와 같은 규칙이다 (보낸 시각 함수 `homework_missing_notices` 가 레벨마다 펼친다) — **바꾸면 둘 다**.
 */
export function noticeLevels(related: unknown): number[] {
  const r = (related && typeof related === "object" ? related : {}) as Record<string, unknown>;
  const raw = [...(Array.isArray(r.levels) ? r.levels : []), r.level];
  const out = new Set<number>();
  for (const v of raw) {
    const s = typeof v === "number" || typeof v === "string" ? String(v) : "";
    if (/^[0-9]{1,6}$/.test(s)) out.add(Number(s));
  }
  return [...out].sort((a, b) => a - b);
}

/** 미제출 알림의 기수 id (`related.termId`) — DB `private.homework_missing_term` 과 같다 */
export function noticeTerm(related: unknown): number | null {
  const v = related && typeof related === "object" ? (related as Record<string, unknown>).termId : null;
  const s = typeof v === "number" || typeof v === "string" ? String(v) : "";
  return /^[0-9]{1,18}$/.test(s) ? Number(s) : null;
}

/** 학생 × 레벨 열쇠 */
export const sentKey = (userId: string, level: number) => `${userId}|${level}`;

/** 그 기수의 미제출 알림들 → 학생 × 레벨마다 마지막으로 보낸 때(ms) — 손 알림 · 자동 알림을 함께 센다 */
export function lastSentByLevel(rows: readonly { user_id: string; related: unknown; created_at: string }[], termId: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (noticeTerm(r.related) !== termId) continue;
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at)) continue;
    for (const level of noticeLevels(r.related)) {
      const key = sentKey(r.user_id, level);
      if ((out.get(key) ?? -Infinity) < at) out.set(key, at);
    }
  }
  return out;
}

/** 자동 알림 한 통 — 학생 한 명 */
export type AutoNotice = {
  userId: string;
  name: string;
  /** 글에 적힌 레벨 (작은 것부터) */
  levels: number[];
  /** 기한이 지난 안 낸 숙제 전부 — 숙제마다 레벨 */
  missing: (MissingSlot & { level: number })[];
  /** 그 레벨들에서 기한이 지난 숙제 수 · 그중 낸 수 */
  past: number;
  done: number;
  /** 이번에 새로 기한이 지난 안 낸 숙제 (알림을 보내는 까닭) */
  fresh: (MissingSlot & { level: number })[];
};

/**
 * 한 기수의 자동 알림 — 레벨마다 격자(`boards`)를 보고 **학생마다 한 통**을 만든다.
 *  - 보내는 학생: 알림을 받는 학생(`countsAsStudent`) 중 어느 레벨에서든 `max(windowFrom, 그 레벨 마지막 알림)` 뒤에 기한이 지난 안 낸 숙제가 있는 학생
 *  - 글: 그 학생이 안 낸(기한이 지난) 숙제가 있는 레벨 전부의 숙제
 *  - `openUntil`(학생 → 직접 배정된 반의 마지막 종강일)이 `today` 보다 앞이면 보내지 않는다 — 더는 숙제를 낼 수 없다
 * `optedOut` 은 새로 기한이 지난 숙제를 안 냈지만 '알림 안 받기' 라 뺀 학생 수 (조교 계정은 세지 않는다).
 */
export function autoNotices(input: {
  boards: ReadonlyMap<number, readonly MissingGroup[]>;
  /** 이 뒤에 기한이 지난 숙제만 새로 지난 것 (ms) */
  windowFrom: number;
  /** 학생 × 레벨 → 마지막 미제출 알림 (ms, `lastSentByLevel`) */
  lastSent: ReadonlyMap<string, number>;
  today: string;
  openUntil?: ReadonlyMap<string, string>;
}): { notices: AutoNotice[]; optedOut: number } {
  type Acc = { name: string; rows: { level: number; row: MissingRow }[]; fresh: (MissingSlot & { level: number })[] };
  const acc = new Map<string, Acc>();
  const skipped = new Set<string>();
  const levels = [...input.boards.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    for (const group of input.boards.get(level) ?? []) {
      for (const row of group.rows) {
        if (row.assistant || row.missing.length === 0) continue;
        const until = input.openUntil?.get(row.id);
        if (until && until < input.today) continue;
        const floor = Math.max(input.windowFrom, input.lastSent.get(sentKey(row.id, level)) ?? -Infinity);
        const fresh = newMissingOf(row, floor).map((m) => ({ ...m, level }));
        if (!countsAsStudent(row)) {
          if (fresh.length > 0) skipped.add(row.id);
          continue;
        }
        const a = acc.get(row.id) ?? { name: row.name, rows: [], fresh: [] };
        a.rows.push({ level, row });
        a.fresh.push(...fresh);
        acc.set(row.id, a);
      }
    }
  }
  const notices: AutoNotice[] = [];
  for (const [userId, a] of acc) {
    if (a.fresh.length === 0) continue;
    notices.push({
      userId,
      name: a.name,
      levels: [...new Set(a.rows.map((r) => r.level))].sort((x, y) => x - y),
      missing: a.rows.flatMap((r) => r.row.missing.map((m) => ({ ...m, level: r.level }))),
      past: a.rows.reduce((n, r) => n + r.row.past, 0),
      done: a.rows.reduce((n, r) => n + r.row.done, 0),
      fresh: a.fresh,
    });
  }
  notices.sort((x, y) => x.name.localeCompare(y.name, "ko") || x.userId.localeCompare(y.userId));
  return { notices, optedOut: skipped.size };
}

/** 자동 알림에 붙이는 표시 — `levels` 로 레벨을 다 적는다 (`level` 은 예전 모양을 읽는 곳을 위해 첫 레벨). 보낸 이름 트리거가 `subjects` 로 선생님을 정한다 */
export function autoNoticeRelated(termId: number, n: Pick<AutoNotice, "levels" | "missing">) {
  return {
    termId,
    level: n.levels[0] ?? null,
    levels: n.levels,
    subjects: HOMEWORK_SUBJECTS.filter((s: HomeworkSubject) => n.missing.some((m) => m.subject === s)),
    missing: n.missing.length,
    auto: true,
  };
}

/** 새로 기한이 지난 숙제의 트랙 (mwf · ttf) — 실행 기록에 적어 '월수금 숙제' · '화목금 숙제' 로 보여 준다. 날짜 → 트랙을 모르면 빼고 */
export function freshTracks(notices: readonly Pick<AutoNotice, "fresh">[], trackOf: (date: string) => string | null): string[] {
  const set = new Set<string>();
  for (const n of notices) for (const m of n.fresh) {
    const t = trackOf(m.date);
    if (t === "mwf" || t === "ttf") set.add(t);
  }
  return ["mwf", "ttf"].filter((t) => set.has(t));
}

/** 실행 기록의 트랙 → "월수금 숙제" · "월수금 · 화목금 숙제" */
export function tracksLabel(tracks: readonly string[] | null | undefined): string {
  const names = (tracks ?? []).flatMap((t) => (t === "mwf" ? ["월수금"] : t === "ttf" ? ["화목금"] : []));
  return names.length > 0 ? `${names.join(" · ")} 숙제` : "";
}
