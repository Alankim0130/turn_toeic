import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PUSH_BODY_MAX, pushBody, STUDENT_PUSH_KINDS, STUDENT_PUSH_TTL, STUDENT_PUSH_URL, studentPushMessage } from "./student-push";
import { isPushServiceEndpoint } from "./push-endpoint";
import { detectPush } from "@/components/push/push-client";

/**
 * 학생 휴대폰 푸시 (2026-10-15 Alan — "숙제 미제출이랑 불라방 시작 알림 푸시로 만들어줘. 단 불라방은 불라방 학생들에게만 …
 * 본인이 신청한 시간대의 학생에게만"). 받는 사람은 알림함과 같고(DB 가 정한다) 휴대폰으로는 두 종류만 간다.
 */

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
/** 주석(-- …)을 뺀 본문 */
const sqlOf = (f: string) =>
  readFileSync(join(DIR, f), "utf8")
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");
const ALL = files.map(sqlOf).join("\n");

/** 함수의 마지막 정의 (create or replace 를 파일 순서대로 따라간다) */
function lastFn(name: string) {
  const re = new RegExp(`create or replace function ${name.replace(".", "\\.")}\\(([\\s\\S]*?)\\$(\\w*)\\$([\\s\\S]*?)\\$\\2\\$`, "gi");
  let found = "";
  for (const m of ALL.matchAll(re)) found = m[0];
  return found;
}

const row = (kind: string, extra: Partial<{ id: number; related: unknown; body: string }> = {}) => ({
  id: extra.id ?? 1,
  user_id: "u1",
  kind,
  title: "650+ 왕기초반 불라방이 시작됐어요",
  body: extra.body ?? "10:00~11:00 · RC · 3회차 방송이 시작됐어요.",
  related: extra.related ?? null,
});

describe("알림함 줄 → 휴대폰 알림", () => {
  it("불라방 시작은 불라방 화면으로 · 교시마다 따로 (RC 한 번 · LC 한 번) · 그 교시 동안만", () => {
    const rc = studentPushMessage(row("live_start", { related: { sectionId: 11, date: "2026-10-16" } }));
    const lc = studentPushMessage(row("live_start", { related: { sectionId: 12, date: "2026-10-16" } }));
    expect(rc).toEqual({
      title: "650+ 왕기초반 불라방이 시작됐어요",
      body: "10:00~11:00 · RC · 3회차 방송이 시작됐어요.",
      url: "/my/live",
      tag: "live-11-2026-10-16",
      ttl: 60 * 60,
    });
    // tag 가 다르면 휴대폰에 둘 다 뜬다 — 같으면 뒤 교시가 앞 교시 알림을 덮는다
    expect(lc?.tag).not.toBe(rc?.tag);
    expect(studentPushMessage(row("live_start", { id: 9 }))?.tag).toBe("live-9");
  });

  it("숙제 미제출은 숙제제출로 · 새 안내가 옛 안내를 갈아 끼운다 · 하루", () => {
    const m = studentPushMessage(row("homework_missing", { body: "김민수 학생, 제출 기한이 지났는데 …\n\n· 650 RC — 10/7(수)\n\n숙제제출에서 …" }));
    expect(m?.url).toBe("/my/homework");
    expect(m?.tag).toBe("homework-missing");
    expect(m?.ttl).toBe(60 * 60 * 24);
    expect(m?.body).toBe("김민수 학생, 제출 기한이 지났는데 …\n· 650 RC — 10/7(수)\n숙제제출에서 …");
  });

  it("다른 종류는 휴대폰으로 보내지 않는다 (알림함에만)", () => {
    for (const kind of ["general", "study_checkin", "homework_checked", "contact_reply", "attendance", "merge_choice", "textbook", "study_checked"]) {
      expect(studentPushMessage(row(kind)), kind).toBeNull();
    }
    expect([...STUDENT_PUSH_KINDS].sort()).toEqual(["homework_missing", "live_start"]);
    expect(Object.keys(STUDENT_PUSH_URL).sort()).toEqual([...STUDENT_PUSH_KINDS].sort());
    expect(Object.keys(STUDENT_PUSH_TTL).sort()).toEqual([...STUDENT_PUSH_KINDS].sort());
  });

  it("본문은 빈 줄을 접고 길면 자른다 (한글 글자 단위)", () => {
    expect(pushBody("  가  \n\n\n나\n")).toBe("가\n나");
    const long = pushBody("가".repeat(500));
    expect([...long].length).toBe(PUSH_BODY_MAX);
    expect(long.endsWith("…")).toBe(true);
    expect(pushBody("가".repeat(PUSH_BODY_MAX))).toBe("가".repeat(PUSH_BODY_MAX));
  });
});

describe("DB — 들어오면 부르고, 가져가며 표시한다 (마이그레이션 20261015120000)", () => {
  const kindList = (sql: string) => [...(sql.match(/kind in \(([^)]+)\)/)?.[1] ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();

  it("가져가기 · 들어올 때 부르기 · 다시 부르기가 같은 두 종류 · 15분을 본다", () => {
    const claim = lastFn("public.claim_student_pushes");
    const trigger = lastFn("private.tg_student_messages_push");
    const due = lastFn("private.student_push_due");
    for (const [name, sql] of [
      ["claim_student_pushes", claim],
      ["tg_student_messages_push", trigger],
      ["student_push_due", due],
    ] as const) {
      expect(sql, `${name} 를 못 찾았다`).not.toBe("");
      expect(kindList(sql), name).toEqual([...STUDENT_PUSH_KINDS].sort());
      expect(sql, name).toContain("interval '15 minutes'");
      expect(sql, name).toContain("pushed_at is null");
      expect(sql, name).toMatch(/security definer\s+set search_path = ''/);
    }
    // 두 호출이 겹쳐도 한 줄은 한 번만 — 가져가는 순간 표시
    expect(claim).toContain("for update skip locked");
    expect(claim).toContain("set pushed_at = now()");
    // 알림을 켠 기기가 없으면 부르지 않는다 · 부르다 실패해도 알림함 줄은 들어간다
    expect(trigger).toContain("join public.push_subscriptions");
    expect(trigger).toContain("private.call_app('/api/cron/student-push')");
    expect(trigger).toMatch(/exception when others then/);
    expect(due).toContain("interval '1 minute'");
  });

  it("가져가기는 우리 API(service_role)만 부른다", () => {
    expect(ALL).toContain("revoke all on function public.claim_student_pushes(int) from public, anon, authenticated");
    expect(ALL).toContain("grant execute on function public.claim_student_pushes(int) to service_role");
    expect(ALL).not.toMatch(/grant execute on function public\.claim_student_pushes\(int\) to (?:anon|authenticated)/);
  });

  it("트리거는 문장마다 한 번 (숙제 미제출 50명을 한 번에 넣어도 한 번) — 살아 있다", () => {
    let alive = false;
    for (const f of files) {
      for (const m of sqlOf(f).matchAll(/(create|drop) trigger (?:if exists )?student_messages_push\b([^;]*);/g)) {
        alive = m[1] === "create" && /after insert on public\.student_messages/.test(m[2]) && /referencing new table as new_rows/.test(m[2]) && /for each statement/.test(m[2]);
      }
    }
    expect(alive).toBe(true);
  });

  it("놓친 것은 1분마다 다시 부른다 (남은 줄이 있을 때만)", () => {
    const schedules = [...ALL.matchAll(/cron\.schedule\(\s*'student-push-retry',\s*'([^']+)',\s*\$\$([\s\S]*?)\$\$/g)];
    expect(schedules.length).toBeGreaterThan(0);
    const [, every, body] = schedules.at(-1)!;
    expect(every).toBe("* * * * *");
    expect(body).toContain("private.call_app('/api/cron/student-push') where private.student_push_due()");
  });

  it("불라방 시작 알림 — 받는 사람은 그대로(그 교시를 듣는 불라방 학생) · 본문에 과목", () => {
    const fn = lastFn("private.notify_live_session");
    expect(fn).toContain("e.mode = 'live'");
    expect(fn).toContain("not es.recorded");
    expect(fn).toContain("private.section_includes(e.section_id, p_section_id)");
    expect(fn).toContain("distinct on (e.student_id)");
    expect(fn).toContain("on conflict (section_id, class_date) do nothing");
    expect(fn).toContain("upper(r.subject)");
  });
});

describe("구독 주소 — 푸시 서비스만 받는다", () => {
  it("크롬 · 삼성 · 웨일(FCM) · 아이폰 · 파이어폭스 · 윈도우 엣지", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/dXs1:APA91bHq_example-token",
      "https://fcm.googleapis.com/wp/dXs1:APA91bH",
      "https://android.googleapis.com/gcm/send/abc",
      "https://web.push.apple.com/QGuB0vW8kTw-example",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABexample",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAexample%2b%2f",
    ]) {
      expect(isPushServiceEndpoint(ok), ok).toBe(true);
    }
  });

  it("다른 주소 · http · 비슷한 이름 · 계정 · 포트는 아니다", () => {
    for (const bad of [
      "https://example.com/push",
      "https://winnertoeic.com/api/cron/student-push",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/fcm/send/abc",
      "https://evilfcm.googleapis.com/x",
      "https://notpush.apple.com.example/x",
      "https://user:pw@fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://127.0.0.1/x",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      expect(isPushServiceEndpoint(bad), bad).toBe(false);
    }
  });
});

describe("이 기기의 알림 상태 (detectPush)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function browser(sub: { endpoint: string } | null, permission = "granted") {
    vi.stubGlobal("Notification", { permission });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
      serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) },
    });
  }

  it("브라우저에 구독이 있어도 지금 계정의 것이 아니면 꺼짐 — 켜기를 누르면 지금 계정으로 옮긴다", async () => {
    browser({ endpoint: "https://fcm.googleapis.com/fcm/send/a" });
    expect(await detectPush(async () => true)).toBe("on");
    expect(await detectPush(async () => false)).toBe("off");
    // 서버에 묻다 실패하면 예전처럼 브라우저만 믿는다
    expect(await detectPush(async () => Promise.reject(new Error("network")))).toBe("on");
    expect(await detectPush()).toBe("on");
  });

  it("구독이 없으면 꺼짐 · 차단이면 차단 (서버에 묻지 않는다)", async () => {
    const owns = vi.fn(async () => true);
    browser(null);
    expect(await detectPush(owns)).toBe("off");
    browser({ endpoint: "https://fcm.googleapis.com/fcm/send/a" }, "denied");
    expect(await detectPush(owns)).toBe("denied");
    expect(owns).not.toHaveBeenCalled();
  });
});

describe("서버 · 화면", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("발송 API 는 DB 크론 비밀로만 열리고 가져간 줄만 보낸다", () => {
    const route = "src/app/api/cron/student-push/route.ts";
    expect(existsSync(route)).toBe(true);
    const src = read(route);
    expect(src).toMatch(/if \(!\(await authorizedAppCall\(req\)\)\) return/);
    expect(src).toContain('rpc("claim_student_pushes")');
    expect(src).toContain("pushStudentMessages(rows)");
  });

  it("학생 기기를 켰다고 관리자 알림이 오지 않는다 — 관리자 알림은 강사 · 관리자 계정만 고른다", () => {
    expect(read("src/lib/push.ts")).toContain('.in("role", ["instructor", "admin"])');
  });

  it("학생 서버 액션은 로그인한 사람의 기기만 저장 · 지운다", () => {
    const src = read("src/app/my/notifications/push-actions.ts");
    expect(src).toContain("supabase.auth.getUser()");
    expect(src).toContain("saveSubscription(userId, input)");
    expect(src).toContain("deleteSubscription(userId, endpoint)");
    // 지우기는 내 기기만 (다른 계정으로 옮겨 간 기기는 건드리지 않는다)
    const sub = read("src/lib/push-subscription.ts");
    expect(sub).toContain('.delete().in("endpoint", forms).eq("user_id", userId)');
    // 저장은 브라우저 회사의 푸시 서비스 주소만 (아무 주소나 받으면 우리 서버가 그 주소로 요청을 보낸다)
    expect(sub).toContain("if (!isPushServiceEndpoint(endpoint.href)) return");
    // '켜져 있나' 는 로그인한 사람의 세션으로 (정책 "본인 조회") — 서비스 롤로 보면 남의 기기도 내 것으로 보인다
    expect(sub).toMatch(/export async function ownsSubscription[\s\S]*?const supabase = await createClient\(\);/);
  });

  it("같은 휴대폰을 다른 계정이 켰으면 '꺼짐' 으로 보인다 — 두 화면 모두 서버에 묻는다", () => {
    const client = read("src/components/push/push-client.ts");
    expect(client).toContain("export async function detectPush(owns?: OwnsSubscription)");
    expect(client).toContain("if (!mine) return \"off\";");
    expect(read("src/components/push/PushSetup.tsx")).toContain("detectPush(actions.owns)");
    expect(read("src/components/push/PushPrompt.tsx")).toContain("detectPush(ownsStudentPushDevice)");
    // 관리자 쪽 액션도 가드가 먼저다
    expect(read("src/app/admin/notifications/actions.ts")).toMatch(/export async function ownsPushDevice\(endpoint: string\): Promise<boolean> \{\s*await requireStaff\(\);/);
  });

  it("알림 키가 없으면 대기열을 가져가지 않는다 (가져가면 표시만 되고 사라진다)", () => {
    const src = read("src/app/api/cron/student-push/route.ts");
    expect(src.indexOf("if (!pushConfigured())")).toBeGreaterThan(-1);
    expect(src.indexOf("if (!pushConfigured())")).toBeLessThan(src.indexOf('rpc("claim_student_pushes")'));
  });

  it("학생 화면 — 알림함 맨 위 카드와 마이페이지 권유 카드", () => {
    expect(read("src/app/my/notifications/page.tsx")).toMatch(/<PushSetup [^>]*audience="student"/);
    expect(read("src/app/my/page.tsx")).toContain("<PushPrompt ");
    const prompt = read("src/components/push/PushPrompt.tsx");
    expect(prompt).toContain("saveStudentPushSubscription");
    // 앱 설치 카드와 겹쳐 서지 않는다
    expect(prompt).toContain("installCardShown");
  });
});
