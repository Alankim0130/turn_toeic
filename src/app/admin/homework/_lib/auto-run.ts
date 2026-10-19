import "server-only";

import { buildMissingBoard, HOMEWORK_MISSING_TITLE, homeworkMissingMessage, type MissingGroup } from "@/lib/homework-missing";
import { autoNoticeRelated, autoNotices, freshTracks, kstDay, lastSentByLevel } from "@/lib/homework-missing-auto";
import { inTerm } from "@/lib/term-window";
import { TERM_COLUMNS, type DB } from "../../_lib/queries";
import type { PersonName } from "../../_lib/profile-names";
import { loadMissingData, readAll } from "./missing";

/**
 * 숙제 미제출 **자동 알림** 한 번 (2026-10-19 Alan) — `/api/cron/homework-missing-auto` 가 그날 실행을 가져간 뒤(`claim_homework_missing_auto`) 부른다.
 * 규칙은 `src/lib/homework-missing-auto.ts` 머리말 — 여기서는 읽고 · 고르고 · 넣기만 한다.
 *
 *  1. **지금 수강 중인 기수**(오늘이 개강일 ~ 종강일 안)만 본다 — 종강 뒤에는 학생이 숙제를 낼 수 없다 (그래서 마지막 수업 숙제처럼 기한이 종강 뒤인 숙제는 알리지 않는다)
 *  2. 레벨마다 손 알림 화면과 같은 격자를 만든다 (`loadMissingData` · `buildMissingBoard` — 이름은 서버라 profiles 를 직접 읽는다)
 *  3. `windowFrom` 뒤에 보낸 미제출 알림(손 · 자동)을 읽어 학생 × 레벨 마지막 알림을 안다 — 그보다 앞선 알림은 새로 지난 숙제를 가리지 않는다
 *  4. 학생마다 한 통을 넣는다 (보낸 사람 없음 — DB 트리거가 안 낸 과목의 선생님 이름을 적고, '알림 안 받기' 학생의 줄은 넣지 않고, 휴대폰 알림을 부른다)
 *
 * 무엇이든 다 못 읽으면 넣지 않고 멈춘다 — 낸 숙제가 '안 냄' 으로 보이거나 끈 학생에게 갈 수 있다. 실행 기록은 열린 채라 15분 뒤 다시 돈다
 * (그 사이 넣은 학생은 3 의 규칙이 빼서 두 번 가지 않는다).
 */

/** 한 번에 넣는 알림 줄 수 — 넣을 때마다 휴대폰 알림 API 를 한 번 부른다 (그쪽은 한 번에 500줄까지 가져간다) */
const INSERT_BATCH = 200;
/** 이름을 읽을 때 한 번에 묻는 사람 수 — 주소에 id 를 싣는 조회라 나눈다 */
const NAME_CHUNK = 100;

export type AutoRunResult =
  | { ok: true; sent: number; optedOut: number; tracks: string[]; terms: number; now: number }
  | { ok: false; error: string };

/** 서버(service_role)의 이름 · 등급 — `profile_names` 는 강사 · 관리자 · 조교 세션만 부른다. 하나라도 못 읽으면 빈 Map (= 못 읽은 것) */
function serverNames(admin: DB) {
  return async (ids: string[]): Promise<Map<string, PersonName>> => {
    const out = new Map<string, PersonName>();
    for (let i = 0; i < ids.length; i += NAME_CHUNK) {
      const { data, error } = await admin.from("profiles").select("id, name, role").in("id", ids.slice(i, i + NAME_CHUNK));
      if (error) return new Map();
      for (const p of data ?? []) out.set(p.id, { name: p.name, role: p.role });
    }
    return out;
  };
}

export async function runHomeworkMissingAuto(admin: DB, opts: { windowFrom: number; now?: number }): Promise<AutoRunResult> {
  const now = opts.now ?? Date.now();
  const today = kstDay(now);

  const [{ data: termRows, error: termError }, { data: levelRows, error: levelError }, sent] = await Promise.all([
    admin.from("terms").select(TERM_COLUMNS),
    admin.from("lc_levels").select("level"),
    readAll<{ user_id: string; related: unknown; created_at: string }>((from, to, count) =>
      admin
        .from("student_messages")
        .select("user_id, related, created_at", count ? { count: "exact" } : undefined)
        .eq("kind", "homework_missing")
        .gt("created_at", new Date(opts.windowFrom).toISOString())
        .order("id")
        .range(from, to),
    ),
  ]);
  if (termError || levelError) return { ok: false, error: "기수 · 레벨을 읽지 못했어요" };
  if (!sent.ok) return { ok: false, error: "보낸 알림 기록을 읽지 못했어요" };
  const terms = (termRows ?? []).filter((t) => inTerm(today, t));
  const levels = (levelRows ?? []).map((l) => l.level);

  let sentCount = 0;
  let optedOut = 0;
  const tracks = new Set<string>();
  for (const term of terms) {
    const data = await loadMissingData(admin, term, { names: serverNames(admin) });
    if (!data.ok) return { ok: false, error: `${term.year}년 ${term.month}월 숙제 기록을 다 읽지 못했어요` };
    const boards = new Map<number, MissingGroup[]>(levels.map((level) => [level, buildMissingBoard({ level, ...data, now })]));

    // 학생마다 직접 배정된 반의 마지막 종강일 — 그 뒤에는 숙제를 낼 수 없다 (2주완성은 앞 절반 마지막 날)
    const openUntil = new Map<string, string>();
    for (const e of data.enrollments) {
      const closes = data.sections.get(e.sectionId)?.closes;
      if (closes && (openUntil.get(e.studentId) ?? "") < closes) openUntil.set(e.studentId, closes);
    }
    // 수업일 → 트랙 (한 날짜는 한 트랙 — 반 편성 달력)
    const trackOfDate = new Map<string, string>();
    for (const s of data.sections.values()) for (const d of s.dates) if (!trackOfDate.has(d)) trackOfDate.set(d, s.track);

    const result = autoNotices({ boards, windowFrom: opts.windowFrom, lastSent: lastSentByLevel(sent.rows, term.id), today, openUntil });
    optedOut += result.optedOut;
    for (const t of freshTracks(result.notices, (d) => trackOfDate.get(d) ?? null)) tracks.add(t);

    const rows = result.notices.map((n) => ({
      user_id: n.userId,
      sender_id: null, // 자동 알림 — DB 트리거가 안 낸 과목의 선생님 이름을 적는다
      sender_name: "",
      title: HOMEWORK_MISSING_TITLE,
      body: homeworkMissingMessage({ name: n.name, missing: n.missing, past: n.past, done: n.done }),
      kind: "homework_missing",
      related: autoNoticeRelated(term.id, n),
    }));
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      // '알림 안 받기' 학생의 줄은 DB 트리거가 넣지 않는다 — 돌아온 줄만 센다
      const { data: inserted, error } = await admin.from("student_messages").insert(rows.slice(i, i + INSERT_BATCH)).select("id");
      if (error) return { ok: false, error: "알림을 넣지 못했어요" };
      sentCount += inserted?.length ?? 0;
    }
  }
  return { ok: true, sent: sentCount, optedOut, tracks: ["mwf", "ttf"].filter((t) => tracks.has(t)), terms: terms.length, now };
}
