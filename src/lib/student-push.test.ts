import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import { PUSH_BODY_MAX, pushBody, STUDENT_PUSH_KINDS, STUDENT_PUSH_TTL, STUDENT_PUSH_URL, studentPushMessage } from "./student-push";
import { DEVICES_PER_USER, devicesOverLimit, isPushKeyPair, isPushServiceEndpoint } from "./push-endpoint";
import { detectPush } from "@/components/push/push-client";
import { alertSwitches, CREW_ALERT_KINDS, editableAlertKinds, NOTIFICATION_KINDS } from "./push";

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

describe("구독 키 · 기기 수 · 보내기 · 로그아웃 (2026-10-16 점검)", () => {
  /** 브라우저가 만드는 것과 같은 키 — P-256 공개 키(65바이트) · auth 16바이트, URL 안전 base64 */
  const browserKeys = () => {
    const ecdh = createECDH("prime256v1");
    return { p256dh: ecdh.generateKeys().toString("base64url"), auth: randomBytes(16).toString("base64url") };
  };

  it("브라우저가 만든 키만 받는다 (끝의 = 는 있어도 된다)", () => {
    const k = browserKeys();
    expect(k.p256dh).toHaveLength(87);
    expect(k.auth).toHaveLength(22);
    expect(isPushKeyPair(k.p256dh, k.auth)).toBe(true);
    expect(isPushKeyPair(`${k.p256dh}=`, `${k.auth}==`)).toBe(true);
  });

  it("아무 글자 · 길이가 틀린 키 · 곡선 위의 점이 아닌 키는 받지 않는다 — 예전에는 길이만 봐서 받았고, 보낼 때 서버 안에서 실패해 기기 줄이 지워지지 않았다", () => {
    const k = browserKeys();
    expect(isPushKeyPair("x", "y")).toBe(false);
    expect(isPushKeyPair("", k.auth)).toBe(false);
    expect(isPushKeyPair(k.p256dh, "")).toBe(false);
    expect(isPushKeyPair(k.p256dh.slice(0, 80), k.auth)).toBe(false);
    expect(isPushKeyPair(k.p256dh, k.auth.slice(0, 10))).toBe(false);
    // URL 안전 base64 가 아닌 글자가 섞였다
    expect(isPushKeyPair(`${k.p256dh.slice(0, 40)}+/${k.p256dh.slice(42)}`, k.auth)).toBe(false);
    // 65바이트 · 0x04 로 시작해도 곡선 위의 점이 아니면
    const offCurve = Buffer.alloc(65, 1);
    offCurve[0] = 4;
    expect(isPushKeyPair(offCurve.toString("base64url"), k.auth)).toBe(false);
    // 0x04 로 시작하지 않는다
    const wrongPrefix = Buffer.from(k.p256dh, "base64url");
    wrongPrefix[0] = 2;
    expect(isPushKeyPair(wrongPrefix.toString("base64url"), k.auth)).toBe(false);
  });

  it("한 사람 기기는 10개까지 — 넘치면 오래전에 처음 켠 기기부터 지우고, 방금 켠 기기는 남긴다", () => {
    expect(DEVICES_PER_USER).toBe(10);
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, endpoint: `e${i + 1}` }));
    expect(devicesOverLimit(rows.slice(0, 10), "e10")).toEqual([]);
    expect(devicesOverLimit(rows, "e12").sort((a, b) => a - b)).toEqual([1, 2]);
    // 오래된 기기를 다시 켰으면(같은 주소 — 줄은 그대로라 id 가 작다) 그 기기는 남기고 그다음 오래된 것을 지운다
    expect(devicesOverLimit(rows, "e1").sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("저장할 때 키를 보고, 기기 수를 정리한다 — 내 기기만 지운다", () => {
    const src = readFileSync("src/lib/push-subscription.ts", "utf8");
    expect(src).toMatch(/!isPushKeyPair\(p256dh, auth\)/);
    expect(src).toMatch(/devicesOverLimit\(mine \?\? \[\], endpoint\.href\)/);
    expect(src).toMatch(/\.delete\(\)\.in\("id", drop\)\.eq\("user_id", userId\)/);
  });

  it("보낼 때 기기를 100명씩 · 1,000줄 쪽으로 나눠 읽는다 — 한 번에 1,000줄까지만 와서 같은 묶음의 다른 학생 기기가 조용히 빠졌다", () => {
    const src = readFileSync("src/lib/push.ts", "utf8");
    expect(src).toMatch(/const USERS_PER_READ = 100;/);
    expect(src).toMatch(/\.order\("id"\)\s*\.range\(from, from \+ ROWS_PER_PAGE - 1\)/);
    expect(src).not.toMatch(/i \+= 200/);
  });

  it("알림 키가 틀린 모양이면 학생 알림을 가져가지 않는다 — 키를 실제로 넣어 보고 정한다 (예전에는 가져간 뒤 던져서 다 잃었다)", () => {
    const src = readFileSync("src/lib/push.ts", "utf8");
    expect(src).toMatch(/export function pushConfigured\(\) \{\s*return configure\(\);\s*\}/);
    expect(src).toMatch(/try \{\s*webpush\.setVapidDetails\(subject, publicKey, privateKey\);\s*return true;\s*\} catch/);
  });

  it("학생이 로그아웃하면 이 기기의 알림을 끈다 — 같은 기기를 이어 쓰면 앞사람의 알림(이름 · 날짜)이 계속 떴다. 강사 · 관리자 기기는 남긴다", () => {
    const actions = readFileSync("src/app/(auth)/actions.ts", "utf8");
    expect(actions).toMatch(/export async function signOut\(formData\?: FormData\)/);
    expect(actions).toMatch(/formData\?\.get\("push_endpoint"\)/);
    expect(actions).toContain("let keep = isAdmin(me?.role);");
    // 알림 설정에서 등업신청 · 교재주문 알림(CREW_ALERT_KINDS)을 켠 조교의 기기도 남긴다 (2026-10-27 → 10-28) — 그 밖의 조교 · 학생은 지운다
    expect(actions).toMatch(/if \(!keep && me\?\.role === "assistant"\) \{[\s\S]*?keep = CREW_ALERT_KINDS\.some\(\(kind\) => alert\?\.\[kind\] === true\);\s*\}/);
    expect(actions).toContain("if (!keep) await deleteSubscription(user.id, endpoint);");
    // 로그아웃하기 전에 지운다 — 로그아웃하면 누구의 기기인지 모른다
    expect(actions.indexOf("deleteSubscription(user.id, endpoint)")).toBeLessThan(actions.indexOf("await supabase.auth.signOut()"));
    // 로그아웃 폼마다 이 기기의 주소를 넣는다 — 새 로그아웃 폼을 만들면 여기에 걸린다
    const forms: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".tsx") && readFileSync(p, "utf8").includes("action={signOut}")) forms.push(p);
      }
    };
    walk("src");
    expect(forms.sort()).toEqual(
      ["src/app/account-merged/page.tsx", "src/components/admin/AdminNav.tsx", "src/components/layout/MobileMenu.tsx", "src/components/layout/SiteHeader.tsx"].sort(),
    );
    for (const f of forms) expect(readFileSync(f, "utf8"), f).toMatch(/<form action=\{signOut\}>\s*<PushLogoutField \/>/);
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

  it("학생 기기를 켰다고 관리자 알림이 오지 않는다 — 관리자 알림은 강사 · 관리자, 그리고 등업신청 · 교재주문 알림을 켠 조교만 고른다", () => {
    const src = read("src/lib/push.ts");
    const body = src.slice(src.indexOf("export async function notifyStaff"), src.indexOf("export async function notifyUser"));
    // 학생 · 회원 등급은 어느 알림에도 없다. 조교는 CREW_ALERT_KINDS(등업신청 · 교재주문)에서만 · 켠 사람만 (2026-10-27 → 10-28)
    expect(src).toContain('export const CREW_ALERT_KINDS: readonly NotificationKind[] = ["verification", "textbook_order"];');
    expect(body).toContain('CREW_ALERT_KINDS.includes(kind) ? (["instructor", "admin", "assistant"] as const) : (["instructor", "admin"] as const)');
    expect(body).toContain('.in("role", roles).is("merged_into", null)');
    expect(body).toContain('s.role === "assistant" ? setting.get(s.id) === true : setting.get(s.id) !== false');
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
    // 관리자 쪽 액션도 가드가 먼저다 — 조교도 여는 화면이라 requireCrew (2026-10-28)
    expect(read("src/app/admin/notifications/actions.ts")).toMatch(/export async function ownsPushDevice\(endpoint: string\): Promise<boolean> \{\s*await requireCrew\(\);/);
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

describe("조교 알림 설정 — 등업신청 · 교재주문만 켜고 끈다 (2026-10-28 Alan)", () => {
  // "조교 알림시스템 설정은 어디서하는거야? 여기 알림설정 페이지를 접근할 수 있게 하면 쉽지 않을까? 다만 '등업신청'과 '불라방 교재주문'
  // 이 두가지만 설정할 수 있도록 하고 나머지는 작동안되게 해놓으면 좋겠어" — 그전 하루(10-27)는 교재주문 화면의 카드에서 교재주문만 켰다
  const read = (p: string) => readFileSync(p, "utf8");
  const actions = read("src/app/admin/notifications/actions.ts");
  const fn = (name: string) => actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf("\n}\n", actions.indexOf(`export async function ${name}`)));

  it("조교가 켜고 끌 수 있는 것은 등업신청 접수 · 불라방 교재주문 둘 — 강사 · 관리자는 전부", () => {
    expect([...editableAlertKinds(false)]).toEqual(["verification", "textbook_order"]);
    expect([...editableAlertKinds(false)]).toEqual([...CREW_ALERT_KINDS]);
    expect([...editableAlertKinds(true)]).toEqual(NOTIFICATION_KINDS.map((k) => k.key));
  });

  it("스위치는 그 알림이 실제로 가는지를 보인다 — notifyStaff 와 같은 규칙", () => {
    const all = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.key, true]));
    const none = Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k.key, false]));
    // 강사 · 관리자: 행이 없으면 다 켜짐, 끈 칸만 꺼짐
    expect(Object.values(alertSwitches(null, true)).every(Boolean)).toBe(true);
    expect(alertSwitches({ ...all, contact: false }, true).contact).toBe(false);
    expect(alertSwitches(none, true).naver_reservation).toBe(false);
    // 조교: 행이 없으면 다 꺼짐 · 켠 두 칸만 켜짐 · 나머지는 행의 값(표 기본값 true)이 있어도 꺼짐 — 조교에게는 가지 않는다
    expect(Object.values(alertSwitches(null, false)).some(Boolean)).toBe(false);
    const crew = alertSwitches(all, false);
    expect(Object.entries(crew).filter(([, on]) => on).map(([k]) => k).sort()).toEqual(["textbook_order", "verification"]);
    expect(alertSwitches({ ...none, textbook_order: true }, false)).toMatchObject({ textbook_order: true, verification: false, contact: false });
  });

  it("서버 액션은 함수마다 맨 위 requireCrew · 알림 종류는 그 사람이 켤 수 있는 칸만 쓴다 (조교가 화면을 거치지 않고 보내도 잠긴 칸은 안 바뀐다)", () => {
    for (const name of ["savePushSubscription", "deletePushSubscription", "removeDevice", "sendTestPush", "saveNotificationSettings"]) {
      expect(fn(name), name).toMatch(/^export async function \w+\([^)]*\)[^{]*\{\s*const \{ user(?:, profile)? \} = await requireCrew\(\);/);
    }
    expect(actions).not.toContain("requireStaff(");
    expect(fn("saveNotificationSettings")).toContain("editableAlertKinds(isStaff(profile.role)).map((k) => [k, on(k)])");
    expect(fn("saveNotificationSettings")).toMatch(/upsert\(\{ user_id: user\.id, \.\.\.values, updated_at: [^}]+\}, \{ onConflict: "user_id" \}\)/);
    // 기기는 내 것만 지운다
    expect(fn("removeDevice")).toContain('.eq("id", id).eq("user_id", user.id)');
  });

  it("화면 — 조교도 열고, 잠긴 알림은 꺼진 채 눌리지 않는다 · 네이버 예약 칸은 강사 · 관리자에게만", () => {
    const page = read("src/app/admin/notifications/page.tsx");
    expect(page).toContain("const { user, profile } = await requireCrew();");
    expect(page).toContain("const values = alertSwitches(settings, staff);");
    expect(page).toContain("locked: !editable.includes(k.key)");
    expect(page).toMatch(/\{staff && \(\s*<section id="naver"/);
    const form = read("src/components/admin/notifications/SettingsForm.tsx");
    expect(form).toContain("defaultChecked={!k.locked && values[k.key] === true} disabled={k.locked}");
    expect(form).toContain("강사 · 관리자만");
  });

  it("교재주문 화면의 '새 교재주문 알림' 카드(하루 쓴 것)는 없다 — 켜는 곳은 알림 설정 하나", () => {
    expect(existsSync("src/app/admin/textbook-orders/push-actions.ts")).toBe(false);
    expect(read("src/app/admin/textbook-orders/page.tsx")).not.toContain("PushSetup");
    expect(read("src/components/push/PushSetup.tsx")).not.toMatch(/\border:\s*\{/);
  });

  it("조교 행의 등업신청 칸은 한 번 꺼 둔다 — 하루 쓴 카드가 만든 행은 그 칸이 표 기본값(true)이라 고르지 않은 알림이 갈 뻔했다", () => {
    const sql = read("supabase/migrations/20261028100000_assistant_alert_settings.sql");
    expect(sql).toMatch(/update public\.notification_settings s\s+set verification = false\s+from public\.profiles p\s+where p\.id = s\.user_id\s+and p\.role = 'assistant'\s+and s\.verification;/);
    expect(sql).not.toMatch(/textbook_order\s*=/);
  });
});
