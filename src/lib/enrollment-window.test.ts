import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignableError, orderPhase, orderWindow, type AssignableSection } from "./enrollment-window";

describe("등록 단계 = 날짜", () => {
  const o = { activates_on: "2026-09-03", access_until: "2026-10-03" };
  it("개강 전 · 기간 안(양 끝 포함) · 종강 뒤", () => {
    expect(orderPhase(o, "2026-09-02")).toBe("preliminary");
    expect(orderPhase(o, "2026-09-03")).toBe("active");
    expect(orderPhase(o, "2026-10-03")).toBe("active");
    expect(orderPhase(o, "2026-10-04")).toBe("expired");
  });
});

// 운영 날짜: 9월 기수 9/3~10/3 · 10월 기수 10/6~11/1
const sep = (id: number): AssignableSection => ({ id, term_id: 8, enrollment_opens_at: "2026-09-03", closes_at: "2026-10-03" });
const oct = (id: number): AssignableSection => ({ id, term_id: 40, enrollment_opens_at: "2026-10-06", closes_at: "2026-11-01" });

describe("등록에 넣을 수 있는 반", () => {
  it("같은 달 두 반(주5일)은 된다", () => {
    expect(assignableError([sep(1), sep(2)], "2026-09-22")).toBeNull();
  });

  it("두 달의 반을 한 등록에 넣지 않는다", () => {
    expect(assignableError([sep(1), oct(2)], "2026-09-22")).toMatch(/한 달/);
  });

  it("종강한 반은 안 된다 — 종강일 당일까지는 된다", () => {
    expect(assignableError([sep(1)], "2026-10-03")).toBeNull();
    expect(assignableError([sep(1)], "2026-10-04")).toMatch(/종강/);
  });

  it("반이 없으면 안 된다", () => {
    expect(assignableError([], "2026-09-22")).not.toBeNull();
  });
});

describe("등록 기간과 상태 = 반의 개강일~종강일", () => {
  it("개강일이 지났으면 active", () => {
    expect(orderWindow([sep(1), sep(2)], "2026-09-22")).toEqual({ activatesOn: "2026-09-03", accessUntil: "2026-10-03", status: "active" });
  });

  it("개강일 당일부터 active", () => {
    expect(orderWindow([oct(1)], "2026-10-06").status).toBe("active");
  });

  it("개강 전이면 예비등록 (preliminary)", () => {
    expect(orderWindow([oct(1)], "2026-10-05")).toEqual({ activatesOn: "2026-10-06", accessUntil: "2026-11-01", status: "preliminary" });
  });
});

/**
 * 월 넘김 (2026-10-13 Alan — "이번달이 끝나고 다음달로 넘어갈때 … 매달 반복할때 오류가 안나오도록").
 * 종강 다음 날 닫히는 것은 권한 함수가 날짜를 직접 봐서 배치 없이도 되지만, **개강일에 열리는 것은 저장된 등록 상태 · 등급이 바뀌어야 한다**
 * (권한 함수가 `o.status = 'active'` 와 등급 student 를 함께 본다). 자정 배치(pg_cron 00:00 KST)가 그 일을 하고, 배치가 못 돌았을 때를 위해
 * 학생이 화면을 여는 순간 내 것만 맞추는 `public.refresh_my_enrollment_status()` 가 있다 — 그 모양을 못박는다.
 */

const MIG = "supabase/migrations";
const migrations = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
/** 마지막으로 정의한 마이그레이션에서 함수 본문을 꺼낸다 (주석 줄은 뺀다) */
function lastDefinition(name: string): string {
  for (const f of [...migrations].reverse()) {
    const sql = readFileSync(`${MIG}/${f}`, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const at = sql.search(new RegExp(`create or replace function ${name.replace(".", "\\.")}\\s*\\(`, "i"));
    if (at >= 0) {
      const rest = sql.slice(at);
      const end = rest.indexOf("$$;", rest.indexOf("$$") + 2);
      return rest.slice(0, end + 3);
    }
  }
  return "";
}

describe("월 넘김 — 날짜가 상태를 정한다 (DB 와 같은 규칙)", () => {
  it("등록 상태 규칙이 DB 의 private.order_status_for 와 같다 — 개강 전 · 기간 안(양 끝 포함) · 종강 뒤", () => {
    const sql = lastDefinition("private.order_status_for");
    expect(sql).toMatch(/private\.today_kst\(\)\s*<\s*p_opens\s+then\s+'preliminary'/i);
    expect(sql).toMatch(/private\.today_kst\(\)\s*>\s*p_closes\s+then\s+'expired'/i);
    expect(sql).toMatch(/else\s+'active'/i);
  });

  it("10월 수강생이 11월에 미리 등록해도 단계는 달마다 따로 — 10/20 · 11/3 · 11/4 · 12/2", () => {
    const oct = { activates_on: "2026-10-06", access_until: "2026-11-03" };
    const nov = { activates_on: "2026-11-04", access_until: "2026-12-01" };
    expect([orderPhase(oct, "2026-10-20"), orderPhase(nov, "2026-10-20")]).toEqual(["active", "preliminary"]);
    expect([orderPhase(oct, "2026-11-03"), orderPhase(nov, "2026-11-03")]).toEqual(["active", "preliminary"]);
    expect([orderPhase(oct, "2026-11-04"), orderPhase(nov, "2026-11-04")]).toEqual(["expired", "active"]);
    expect([orderPhase(oct, "2026-12-02"), orderPhase(nov, "2026-12-02")]).toEqual(["expired", "expired"]);
    // 12월 → 1월 (연도 넘김)도 날짜 비교라 같다
    expect(orderPhase({ activates_on: "2027-01-05", access_until: "2027-02-01" }, "2026-12-31")).toBe("preliminary");
    expect(orderPhase({ activates_on: "2027-01-05", access_until: "2027-02-01" }, "2027-01-05")).toBe("active");
  });

  it("안전장치 refresh_my_enrollment_status — 내 것만(auth.uid) · 날짜로 다시 계산 · 내 등급만 · 비로그인 실행 권한 없음", () => {
    const sql = lastDefinition("public.refresh_my_enrollment_status");
    expect(sql).not.toBe("");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
    expect(sql).toMatch(/v_uid uuid := \(select auth\.uid\(\)\)/i);
    expect(sql).toMatch(/if v_uid is null then\s+return;/i);
    // 상태는 BEFORE 트리거가 날짜로 계산한다 — 어긋난 내 행만 건드린다
    expect(sql).toMatch(/update public\.enrollment_orders o\s+set status = o\.status\s+where o\.user_id = v_uid\s+and o\.status is distinct from private\.order_status_for\(o\.activates_on, o\.access_until\)/i);
    expect(sql).toMatch(/perform private\.refresh_student_roles\(array\[v_uid\]\)/i);
    // 다른 사람 · 전체(null) 를 맞추는 길이 아니다
    expect(sql).not.toMatch(/refresh_student_roles\(null\)/i);
    const file = migrations.find((f) => readFileSync(`${MIG}/${f}`, "utf8").includes("function public.refresh_my_enrollment_status"))!;
    const all = readFileSync(`${MIG}/${file}`, "utf8");
    expect(all).toMatch(/revoke all on function public\.refresh_my_enrollment_status\(\) from public, anon;/i);
    expect(all).toMatch(/grant execute on function public\.refresh_my_enrollment_status\(\) to authenticated/i);
  });

  it("화면은 저장된 상태가 날짜와 어긋날 때만 안전장치를 부른다 (평소에는 한 번도 안 부른다)", () => {
    const src = readFileSync("src/lib/auth.ts", "utf8");
    const at = src.indexOf("export const getStudentAccess");
    const body = src.slice(at, src.indexOf("\n});", at));
    expect(body).toMatch(/if \(live\.some\(\(o\) => o\.status !== orderPhase\(o, today\)\)\) \{\s+const \{ error \} = await supabase\.rpc\("refresh_my_enrollment_status"\);/);
    // 맞춘 뒤 등급 · 등록을 다시 읽어 그 값으로 판정한다
    expect(body).toMatch(/if \(p\) grade = effectiveRole\(p\);/);
    expect(body).toMatch(/if \(again\) live = again;/);
  });

  it("매일 배치는 00:00 KST(15:00 UTC) 그대로다", () => {
    const last = [...migrations].reverse().map((f) => readFileSync(`${MIG}/${f}`, "utf8")).find((s) => s.includes("cron.schedule('daily-status-transition'"))!;
    expect(last).toMatch(/cron\.schedule\('daily-status-transition', '0 15 \* \* \*'/);
  });
});
