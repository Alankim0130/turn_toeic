/**
 * 학생 휴대폰 푸시 (2026-10-15 Alan — "숙제 미제출이랑 불라방 시작 알림 푸시로 만들어줘").
 *
 * 학생 알림함(`student_messages`)에 들어간 줄 중 **이 두 종류만** 학생이 '알림 받기' 를 켜 둔 휴대폰으로도 보낸다.
 * 받는 사람은 알림함과 같다 — 불라방 시작은 그 교시를 듣는 불라방 학생(DB `private.notify_live_session`),
 * 숙제 미제출은 강사 · 조교가 보낸 학생('알림 안 받기' 를 누른 학생은 줄 자체가 안 생긴다).
 * 글은 알림함 줄의 제목 · 본문 그대로다 (문구는 SQL · `homeworkMissingMessage` 한곳 — 여기서 새로 짓지 않는다).
 *
 * 종류를 늘리면 DB(마이그레이션 20261015120000 의 `claim_student_pushes` · 트리거 · `student_push_due`)의 목록도 함께 늘린다 —
 * `student-push.test.ts` 가 같은 집합인지 본다.
 */

export const STUDENT_PUSH_KINDS = ["live_start", "homework_missing"] as const;
export type StudentPushKind = (typeof STUDENT_PUSH_KINDS)[number];

/** 알림을 누르면 여는 화면 — 알림함의 버튼과 같은 곳이다 */
export const STUDENT_PUSH_URL: Record<StudentPushKind, string> = {
  live_start: "/my/live",
  homework_missing: "/my/homework",
};

/** 휴대폰 알림에 싣는 본문 길이. 넘치면 잘라 `…` — 전체는 알림함에 있다 */
export const PUSH_BODY_MAX = 180;

export function isStudentPushKind(kind: string): kind is StudentPushKind {
  return (STUDENT_PUSH_KINDS as readonly string[]).includes(kind);
}

/** 빈 줄을 접고 앞뒤 공백을 지운 뒤 길이를 자른다 (숙제 미제출 글은 빈 줄로 단락을 나눈다) */
export function pushBody(body: string, max = PUSH_BODY_MAX): string {
  const text = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

export type StudentPushRow = { id: number; user_id: string; kind: string; title: string; body: string; related: unknown };
export type StudentPushMessage = { title: string; body: string; url: string; tag: string; ttl: number };

/**
 * 휴대폰이 꺼져 있을 때 푸시 서비스가 들고 있는 시간(초). 불라방 시작은 그 교시 동안만 뜻이 있다 —
 * 수업이 끝나고 켠 휴대폰에 "방송이 시작됐어요" 가 뜨면 거짓말이다. 숙제 미제출은 하루.
 */
export const STUDENT_PUSH_TTL: Record<StudentPushKind, number> = {
  live_start: 60 * 60,
  homework_missing: 60 * 60 * 24,
};

/**
 * 알림함 한 줄 → 휴대폰 알림 하나. 다른 종류면 null.
 * tag — 불라방은 교시마다 따로 뜬다(RC 한 번 · LC 한 번). 숙제 미제출은 새 안내가 옛 안내를 갈아 끼운다 (같은 내용이 쌓이지 않게).
 */
export function studentPushMessage(row: StudentPushRow): StudentPushMessage | null {
  if (!isStudentPushKind(row.kind)) return null;
  const related = (row.related && typeof row.related === "object" ? row.related : {}) as { sectionId?: unknown; date?: unknown };
  const tag =
    row.kind === "live_start" && related.sectionId != null && related.date != null
      ? `live-${String(related.sectionId)}-${String(related.date)}`
      : row.kind === "live_start"
        ? `live-${row.id}`
        : "homework-missing";
  return { title: row.title, body: pushBody(row.body), url: STUDENT_PUSH_URL[row.kind], tag, ttl: STUDENT_PUSH_TTL[row.kind] };
}
