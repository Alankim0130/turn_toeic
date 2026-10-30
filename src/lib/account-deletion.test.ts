import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 회원 탈퇴 — 계정과 기록을 전부 지운다 (2026-10-30 Alan "전부 지우기" · App Store 심사 5.1.1(v)).
 * 계정(auth.users)을 지우면 profiles 와 학생 기록이 on delete cascade 로 함께 지워진다. 그렇지 않은 것(set null)을 빠뜨리면 이름 · 연락처가 남거나
 * 합쳐 둔 옛 계정이 다시 로그인되는 계정이 된다 — 그래서 마이그레이션을 다 읽어 사람(profiles · auth.users)을 가리키는 외래 키를 전부 세고,
 * cascade 가 아닌 것은 탈퇴가 따로 지우거나(학생 쪽) 강사 · 관리자 칸이라 상관없다는 까닭을 적어야 통과한다.
 */

const h = vi.hoisted(() => ({ revoked: [] as string[][] }));
vi.mock("@/lib/apple-auth", () => ({ revokeAppleTokens: async (ids: string[]) => (h.revoked.push([...ids]), { revoked: 0, failed: 0 }) }));

const { deleteAccount, listFolderFiles, mergedChain, NON_DELETABLE_ROLES, USER_FILE_BUCKETS } = await import("@/lib/account-deletion");

type Profile = { id: string; role: string; merged_into: string | null };

function fakeAdmin(o: { profiles: Profile[]; files?: Record<string, string[]>; failRemove?: string; failDeleteUser?: string; failList?: string }) {
  const files = Object.fromEntries(Object.entries(o.files ?? {}).map(([b, ps]) => [b, new Set(ps)]));
  const log: string[] = [];
  const client = {
    from(table: string) {
      if (table === "profiles")
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: o.profiles.find((p) => p.id === id) ?? null, error: null }) }),
            in: async (_c: string, ids: string[]) => ({ data: o.profiles.filter((p) => p.merged_into !== null && ids.includes(p.merged_into)), error: null }),
          }),
        };
      if (table === "contact_messages")
        return { delete: () => ({ in: async (_c: string, ids: string[]) => (log.push(`contact:${ids.join(",")}`), { error: null }) }) };
      throw new Error(`모르는 표 ${table}`);
    },
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string, opt: { limit: number; offset: number }) => {
          if (o.failList === bucket) return { data: null, error: { message: "list" } };
          const children = new Map<string, boolean>();
          for (const p of files[bucket] ?? []) {
            if (!p.startsWith(`${folder}/`)) continue;
            const rest = p.slice(folder.length + 1).split("/");
            children.set(rest[0], (children.get(rest[0]) ?? false) || rest.length > 1);
          }
          const all = [...children].sort().map(([name, isFolder]) => ({ name, id: isFolder ? null : `id-${name}` }));
          return { data: all.slice(opt.offset, opt.offset + opt.limit), error: null };
        },
        remove: async (paths: string[]) => {
          if (o.failRemove === bucket) return { data: null, error: { message: "remove" } };
          log.push(`remove:${bucket}:${paths.length}`);
          for (const p of paths) files[bucket].delete(p);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          log.push(`user:${id}`);
          return { error: o.failDeleteUser === id ? { message: "db" } : null };
        },
      },
    },
  };
  return { client: client as never, log, files };
}

beforeEach(() => {
  h.revoked = [];
});

describe("탈퇴하는 계정 — 나 + 나에게 합쳐진 옛 계정", () => {
  it("합치기가 이어졌으면 끝까지 (옛 계정의 옛 계정도)", async () => {
    const { client } = fakeAdmin({
      profiles: [
        { id: "me", role: "student", merged_into: null },
        { id: "b", role: "member", merged_into: "me" },
        { id: "a", role: "member", merged_into: "b" },
        { id: "x", role: "student", merged_into: null },
      ],
    });
    expect((await mergedChain(client, "me"))?.map((p) => p.id)).toEqual(["me", "b", "a"]);
  });

  it("강사 · 관리자 · 조교는 스스로 탈퇴하지 않는다 (진짜 등급)", async () => {
    expect([...NON_DELETABLE_ROLES].sort()).toEqual(["admin", "assistant", "instructor"]);
    for (const role of NON_DELETABLE_ROLES) {
      const f = fakeAdmin({ profiles: [{ id: "me", role, merged_into: null }] });
      expect(await deleteAccount(f.client, "me")).toEqual({ ok: false, reason: "staff" });
      expect(f.log).toEqual([]);
    }
  });

  it("이미 합쳐진 계정 · 못 읽은 계정은 지우지 않는다", async () => {
    expect(await deleteAccount(fakeAdmin({ profiles: [{ id: "me", role: "member", merged_into: "other" }] }).client, "me")).toEqual({ ok: false, reason: "merged" });
    expect(await deleteAccount(fakeAdmin({ profiles: [] }).client, "me")).toEqual({ ok: false, reason: "read" });
  });
});

describe("지우는 것과 순서", () => {
  const profiles: Profile[] = [
    { id: "me", role: "student", merged_into: null },
    { id: "old", role: "member", merged_into: "me" },
  ];

  it("애플 끊기 → 버킷 넷의 내 폴더 · 옛 계정 폴더 → 문의 → 옛 계정 → 나", async () => {
    const f = fakeAdmin({
      profiles,
      files: {
        receipts: ["me/1-a.png", "old/2-b.png", "other/3.png"],
        homework: ["me/650-rc/x.jpg", "me/650-lc/y.m4a", "old/750-rc/z.jpg"],
        "study-checkins": ["old/41/p.jpg"],
        avatars: ["me/face.webp"],
      },
    });
    expect(await deleteAccount(f.client, "me")).toEqual({ ok: true, accounts: 2, files: 7 });
    expect(h.revoked).toEqual([["me", "old"]]);
    expect([...f.files.receipts]).toEqual(["other/3.png"]); // 남의 폴더는 그대로
    expect(f.files.homework.size + f.files["study-checkins"].size + f.files.avatars.size).toBe(0);
    expect(f.log.slice(-3)).toEqual(["contact:me,old", "user:old", "user:me"]);
  });

  it("파일을 못 지우면 멈춘다 — 계정은 그대로 남아 다시 해 볼 수 있다", async () => {
    for (const fail of [{ failRemove: "homework" }, { failList: "avatars" }]) {
      const f = fakeAdmin({ profiles, files: { homework: ["me/650-rc/x.jpg"], avatars: ["me/a.png"] }, ...fail });
      expect(await deleteAccount(f.client, "me")).toEqual({ ok: false, reason: "files" });
      expect(f.log.some((l) => l.startsWith("user:") || l.startsWith("contact:"))).toBe(false);
    }
  });

  it("계정을 지우다 멈추면 거기까지 — 나는 마지막이라 남아서 다시 할 수 있다", async () => {
    const f = fakeAdmin({ profiles, failDeleteUser: "old" });
    expect(await deleteAccount(f.client, "me")).toEqual({ ok: false, reason: "account" });
    expect(f.log).toContain("user:old");
    expect(f.log).not.toContain("user:me");
  });

  it("폴더 아래 파일은 1,000개씩 · 지우기는 100개씩", async () => {
    const many = Array.from({ length: 1500 }, (_, i) => `me/${String(i).padStart(4, "0")}.png`);
    const f = fakeAdmin({ profiles: [profiles[0]], files: { receipts: many } });
    expect((await listFolderFiles(f.client, "receipts", "me"))?.length).toBe(1500);
    expect(await deleteAccount(f.client, "me")).toEqual({ ok: true, accounts: 1, files: 1500 });
    expect(f.log.filter((l) => l.startsWith("remove:receipts"))).toHaveLength(15);
  });

  it("학생 파일 버킷은 넷 — 올리는 화면이 모두 `{계정 id}/` 아래에 둔다", () => {
    expect([...USER_FILE_BUCKETS]).toEqual(["receipts", "homework", "study-checkins", "avatars"]);
    expect(fs.readFileSync("src/app/my/verify/VerifyForm.tsx", "utf8")).toContain("const path = `${user.id}/");
    expect(fs.readFileSync("src/lib/homework.ts", "utf8")).toContain("export const homeworkFolder = (userId: string, level: number, subject: HomeworkSubject) => `${userId}/");
    expect(fs.readFileSync("src/lib/study-checkin.ts", "utf8")).toContain("export const checkinFolder = (userId: string, materialId: number) => `${userId}/");
  });
});

describe("사람을 가리키는 외래 키 전수 — cascade 가 아니면 까닭이 있어야 한다", () => {
  /**
   * cascade 가 아닌 외래 키 (2026-10-30 재생 DB 의 pg_constraint 와 같은 목록).
   * 학생 쪽 칸은 탈퇴가 따로 지운다 — 강사 · 관리자 · 조교 칸(처리한 사람 · 올린 사람)은 그 사람들이 스스로 탈퇴하지 않으므로 상관없다.
   */
  const HANDLED: Record<string, string> = {
    "contact_messages.user_id": "탈퇴가 그 학생의 문의를 지운다 (이름 · 연락처 · 글이 남지 않게)",
    "profiles.merged_into": "탈퇴가 나에게 합쳐진 옛 계정도 함께 지운다 (남기면 다시 로그인되는 계정이 된다)",
  };
  const STAFF_ONLY = new Set([
    "class_sections.instructor_id",
    "contact_messages.replied_by",
    "study_materials.uploaded_by",
    "homework_submissions.checked_by",
    "lc_audio_tracks.uploaded_by",
    "lc_books.updated_by",
    "private.reserved_staff.claimed_by",
    "study_checkins.checked_by",
    "student_messages.sender_id",
    "attendance_stamps.decided_by",
    "attendance_events.actor_id",
    "study_material_items.uploaded_by",
    "feature_flags.updated_by",
    "handover_checks.checked_by",
    "class_materials.uploaded_by",
    "class_notices.author_id",
    "homework_missing_auto.updated_by",
    "staff_posts.author_id",
  ]);

  /** 마이그레이션에서 사람을 가리키는 외래 키 — `칸 uuid … references profiles|auth.users … on delete …` (만든 뒤 바꾼 것까지) */
  function personForeignKeys() {
    const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
    const fks = new Map<string, string>();
    for (const f of files) {
      const sql = fs
        .readFileSync(`supabase/migrations/${f}`, "utf8")
        .split("\n")
        .map((l) => l.replace(/--.*$/, ""))
        .join("\n");
      // create table 안의 칸
      for (const m of sql.matchAll(/create table (?:if not exists )?([\w.]+)\s*\(([\s\S]*?)\n\);/g)) {
        const table = m[1].replace(/^public\./, "");
        for (const line of m[2].split("\n")) {
          const c = /^\s*(\w+)\s+uuid\b.*references\s+(?:public\.)?(profiles|auth\.users)\b(.*)$/.exec(line);
          if (c) fks.set(`${table}.${c[1]}`, /on delete cascade/.test(c[3]) ? "cascade" : /on delete set null/.test(c[3]) ? "set null" : "no action");
        }
      }
      // 나중에 더한 칸 — 한 alter table 에 add column 이 여럿일 수 있다
      for (const st of sql.matchAll(/alter table (?:if exists )?([\w.]+)([\s\S]*?);/g)) {
        const table = st[1].replace(/^public\./, "");
        for (const m of st[2].matchAll(/add column (?:if not exists )?(\w+)\s+uuid\b([^,;]*?)references\s+(?:public\.)?(profiles|auth\.users)\b([^,;]*)/g)) {
          fks.set(`${table}.${m[1]}`, /on delete cascade/.test(m[4]) ? "cascade" : /on delete set null/.test(m[4]) ? "set null" : "no action");
        }
      }
      // 지운 표 · 칸 (구버전 study_applications · lc_textbook_images 는 20260915112851 이 지웠다)
      for (const m of sql.matchAll(/drop table (?:if exists )?([\w.]+)/g)) {
        const table = m[1].replace(/^public\./, "");
        for (const k of [...fks.keys()]) if (k.startsWith(`${table}.`)) fks.delete(k);
      }
      for (const m of sql.matchAll(/alter table (?:if exists )?([\w.]+)\s+drop column (?:if exists )?(\w+)/g)) fks.delete(`${m[1].replace(/^public\./, "")}.${m[2]}`);
    }
    return fks;
  }

  it("cascade 가 아닌 외래 키는 학생 쪽(탈퇴가 지운다) 아니면 강사 · 관리자 칸이다", () => {
    const fks = personForeignKeys();
    expect(fks.size).toBeGreaterThan(40);
    const loose = [...fks].filter(([, rule]) => rule !== "cascade").map(([k]) => k);
    const unknown = loose.filter((k) => !(k in HANDLED) && !STAFF_ONLY.has(k));
    expect(unknown, `사람을 가리키는데 cascade 가 아닌 칸 — 탈퇴가 지울지, 강사 · 관리자 칸인지 정해 적을 것:\n${unknown.join("\n")}`).toEqual([]);
    // 읽기가 헛돌지 않는지 — 목록의 칸이 다 읽혀야 한다 (지운 칸은 목록에서도 뺀다)
    const missing = [...Object.keys(HANDLED), ...STAFF_ONLY].filter((k) => !loose.includes(k));
    expect(missing, `목록에 있는데 마이그레이션에서 못 읽은 칸:\n${missing.join("\n")}`).toEqual([]);
  });

  it("탈퇴가 따로 지우는 둘이 코드에 있다", () => {
    const s = fs.readFileSync("src/lib/account-deletion.ts", "utf8");
    expect(s).toContain('.from("contact_messages").delete().in("user_id", ids)');
    expect(s).toContain('.in("merged_into", frontier)');
  });
});

describe("탈퇴 화면 · 서버 액션", () => {
  const action = fs.readFileSync("src/app/my/profile/actions.ts", "utf8");
  const fn = action.slice(action.indexOf("export async function deleteMyAccount"));

  it("로그인 서버에 물어 본인만 — 확인 말을 먼저 보고, 화면이 보낸 id 는 받지 않는다", () => {
    expect(fn).toContain("supabase.auth.getUser()");
    expect(fn.indexOf("DELETE_CONFIRM_WORD")).toBeLessThan(fn.indexOf("getUser"));
    expect(fn).toContain("deleteAccount(createAdminClient(), user.id)");
    expect(fn).not.toMatch(/formData\.get\("(id|user|user_id)"\)/);
  });

  it("끝나면 이 기기의 로그인을 지우고 로그인 화면에 탈퇴 안내", () => {
    expect(fn).toContain('signOut({ scope: "local" })');
    expect(fn).toContain('redirect("/login?bye=1")');
    expect(fs.readFileSync("src/app/(auth)/login/page.tsx", "utf8")).toContain('bye === "1"');
  });

  it("내 정보 화면 맨 아래 — 강사 · 관리자 · 조교에게는 안내만", () => {
    const page = fs.readFileSync("src/app/my/profile/page.tsx", "utf8");
    expect(page).toContain("<DeleteAccount />");
    expect(page).toContain('NON_DELETABLE_ROLES.includes(profile?.role ?? "")');
  });
});
