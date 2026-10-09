import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-09 전체 보안 검토(Alan "전체적으로 보안 설계를 부탁해")에서 고친 것을 소스로 못박는다 — 되돌려도 화면은 멀쩡해서 늦게 발견된다.
 * DB 쪽은 마이그레이션 20261009110000 · 20261009120000, 앱 쪽은 아래.
 */
const read = (p: string) => readFileSync(p, "utf8");
const MIGRATION = "supabase/migrations/20261009110000_security_review_checks.sql";

describe("수강증 판정 기록은 학생이 못 읽는다", () => {
  it("마이그레이션 — authenticated 의 select 를 칸 단위로 좁히고 candidates · ocr_raw · file_hash · confidence 는 빼며, hold 는 생성 칸으로 연다", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("revoke select on public.enrollment_verifications from authenticated;");
    const grant = sql.match(/grant select \(([^)]+)\)\s+on public\.enrollment_verifications to authenticated;/);
    expect(grant).not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    for (const hidden of ["candidates", "ocr_raw", "file_hash", "confidence"]) expect(cols, hidden).not.toContain(hidden);
    for (const shown of ["id", "user_id", "result", "reject_reason", "parsed", "matched_section", "hold_month"]) expect(cols, shown).toContain(shown);
    expect(sql).toMatch(/add column hold_month integer generated always as/);
  });

  it("학생 조회는 hold_month 만 — candidates 를 다시 고르면 권한 오류로 등업신청 화면이 깨진다", () => {
    const src = read("src/app/my/_lib/queries.ts");
    expect(src).toContain("hold:hold_month");
    expect(src).not.toContain("candidates->hold");
  });

  it("강사 · 관리자 · 조교 화면은 판정 칸을 서비스 롤로 읽는다 (가드가 먼저) — 세션으로 읽으면 칸 권한 오류", () => {
    for (const p of ["src/app/admin/verifications/[id]/page.tsx", "src/app/admin/verifications/page.tsx", "src/app/admin/page.tsx", "src/app/admin/students/[id]/page.tsx"]) {
      const src = read(p);
      expect(src, p).not.toMatch(/supabase\s*\.from\("enrollment_verifications"\)/);
      expect(src, p).toMatch(/require(Crew|Staff)\(\)/);
      const guard = src.search(/require(Crew|Staff)\(\)/);
      const firstAdmin = src.indexOf("createAdminClient()");
      expect(firstAdmin, `${p}: 서비스 롤이 가드보다 먼저`).toBeGreaterThan(guard);
    }
  });
});

describe("조교가 할 수 있는 것의 테두리", () => {
  it("배정 수정은 그 수강증으로 만든 등록 안의 배정만 · 자기 수강증은 조교가 승인하지 못한다", () => {
    const src = read("src/app/admin/verifications/actions.ts");
    expect(src).toContain('.eq("verification_id", verificationId)');
    expect(src).toContain('.eq("id", enrollmentId).eq("order_id", order.id)');
    expect(src).toContain("ver.user_id === user.id && !isStaff(profile.role)");
  });

  it("비대면 인증 독촉은 그 회차 스터디의 신청자에게만 — 받는 사람을 서버가 신청자 명단과 대조한다", () => {
    const src = read("src/app/admin/study/message-actions.ts");
    expect(src).toContain('.from("study_signups").select("user_id").eq("study_id", material.study_id)');
    expect(src).toMatch(/userIds\.some\(\(id\) => !allowed\.has\(id\)\)/);
    expect(src).not.toContain("related: input.related ?? null");
  });

  it("문의 상태 바꾸기는 세션으로만 — 막히면 서비스 롤로 다시 쓰지 않는다", () => {
    const src = read("src/app/admin/contacts/actions.ts");
    expect(src).not.toMatch(/createAdminClient\(\)\.from\("contact_messages"\)\.update\(\{ status \}\)/);
  });
});

describe("학생이 부르는 길", () => {
  it("프로필 사진 지우기는 본인 세션 · 본인 폴더만 (서비스 롤로 지우지 않는다)", () => {
    const src = read("src/app/my/profile/actions.ts");
    expect(src).not.toMatch(/createAdminClient\(\)\.storage\.from\(AVATAR_BUCKET\)\.remove/);
    expect(src).not.toMatch(/admin\.storage\.from\(AVATAR_BUCKET\)\.remove/);
    expect(src.match(/isOwnAvatarPath\(before\.avatar_path, user\.id\)[^\n]*supabase\.storage\.from\(AVATAR_BUCKET\)\.remove/g)?.length).toBe(2);
    expect(read(MIGRATION)).toContain("profiles_avatar_own_folder");
  });

  it("불라방 링크는 http(s) 주소만 화면에 세운다 — 표에도 같은 check", () => {
    const src = read("src/app/my/_lib/queries.ts");
    expect(src).toContain("isWebUrl(l.live_url)");
    const sql = read(MIGRATION);
    for (const t of ["session_live_links", "section_live_links", "replays"]) expect(sql).toMatch(new RegExp(`alter table public\\.${t} add constraint \\w+ check \\(\\w+ ~\\* '\\^https\\?://'\\) not valid;`));
  });

  it("같은 수강증 동시 접수 — 확인 중 기록은 하나(unique index)이고 두 접수 길 모두 23505 를 친절하게 말한다", () => {
    expect(read(MIGRATION)).toContain("create unique index enrollment_verifications_pending_file_uq");
    expect(read("src/app/my/verify/actions.ts").match(/error\?\.code === "23505"/g)?.length).toBe(2);
  });

  it("가입 · 내 정보의 글자 길이 상한 — 이름 20 · 대학 · 학과 60 (표에는 40 · 100, 마이그레이션)", () => {
    expect(read("src/app/(auth)/actions.ts")).toContain("values.name.length > 20");
    expect(read("src/app/(auth)/actions.ts")).toContain("values.university.length > 60 || values.department.length > 60");
    expect(read("src/app/my/account/actions.ts")).toContain("university.length > 60 || department.length > 60");
    const sql = read(MIGRATION);
    for (const c of ["profiles_name_len", "profiles_university_len", "profiles_department_len", "contact_messages_name_len", "contact_messages_email_len"]) expect(sql).toContain(c);
  });
});

describe("바깥 주소로 새지 않게", () => {
  it("글의 그림 경로는 그림 폴더 한 단계만 서명 · 삭제한다", () => {
    expect(read("src/lib/note-images.ts")).toContain("noteImagePaths(body).filter(isNoteImagePath)");
    expect(read("src/app/admin/class-materials/notice-actions.ts")).toContain("!kept.has(p) && isNoteImagePath(p)");
  });

  it("알림을 눌러 여는 주소는 우리 사이트 안만", () => {
    expect(read("public/sw.js")).toContain("wanted.origin === self.location.origin ? wanted.href");
  });

  it("네이버 웹훅은 본문을 먼저 다 받아 크기를 본 뒤 푼다", () => {
    const src = read("src/app/api/naver-reservations/route.ts");
    expect(src).toContain("const raw = await req.arrayBuffer();");
    expect(src.indexOf("raw.byteLength > MAX_BYTES")).toBeLessThan(src.indexOf("await readText("));
  });
});
