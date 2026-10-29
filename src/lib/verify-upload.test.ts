import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionForms } from "@/app/admin/verifications/[id]/DecisionForms";
import { fetchOpenEnrollSections, readOpenEnrollSections } from "./open-sections";
import { sameCaptureRow } from "./receipt-seat";

/**
 * 등업신청 접수 · 승인 화면의 2026-10-29 전체 점검 고침 (Alan "다른 종류 버그도 전체적으로 점검해줘").
 *   1. 열린 반을 읽지 못하면 이번 달 수강증이 '다음 달 수강증' 으로 받아 둬지고 스태프에게도 알리지 않았다
 *   2. 같은 달 승인된 수강증이 하나라도 있으면 수동 신청을 모두 "반이 달라요" 정정 요청으로 봤다 (단과 둘째 수강증)
 *   3. 이미 승인된 캡처를 다시 올리면 같은 그림으로 낸 정정 요청까지 지웠다
 *   4. 배정 수정 폼에 지금 반이 목록에 없으면(모집 마감 · 종강) 브라우저가 첫 반을 골라 두어 방식만 고치려다 반이 바뀌었다
 */

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

/** `export async function NAME(` 부터 다음 export 앞까지 */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`${name} 을 찾지 못했어요`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

/** 이 파일이 부르는 만큼만 흉내 낸 supabase 클라이언트 — 마지막 order 뒤에 결과를 준다 */
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    order: () => builder,
    then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { from: () => builder } as never;
}

describe("열린 반 목록을 읽지 못하면 '없다' 로 판정하지 않는다", () => {
  it("읽기 오류는 null, 빈 목록과 가른다 — 예전 이름(fetchOpenEnrollSections)은 그대로 빈 목록", async () => {
    expect(await readOpenEnrollSections(fakeClient({ data: null, error: { message: "timeout" } }))).toBeNull();
    expect(await readOpenEnrollSections(fakeClient({ data: [], error: null }))).toEqual([]);
    expect(await fetchOpenEnrollSections(fakeClient({ data: null, error: { message: "timeout" } }))).toEqual([]);
  });

  it("수강증만 올리기 — 못 읽었으면 받아 두지 않고 검토로, 기록에 sectionsUnread", () => {
    const body = fnBody(read("src/app/my/verify/actions.ts"), "submitVerification");
    expect(body).toContain("readMyOpenEnrollSections()");
    expect(body).not.toContain("getOpenEnrollSections()");
    expect(body).toMatch(/sectionsUnread && decided\.kind === "upcoming" \? \{ kind: "review" \} : decided/);
    expect(body).toContain('...(sectionsUnread ? { sectionsUnread: true } : {})');
  });

  it("수동 등업신청 — 못 읽었으면 '그 반이 없어요' 대신 다시 해 보게 한다", () => {
    const body = fnBody(read("src/app/my/verify/actions.ts"), "submitManualVerification");
    expect(body).toContain("readMyOpenEnrollSections()");
    expect(body).toMatch(/if \(openSections == null\) return \{ ok: false, error: "열린 반 목록을 읽지 못했어요/);
  });

  it("승인 화면이 까닭을 적는다", () => {
    const page = read("src/app/admin/verifications/[id]/page.tsx");
    expect(page).toContain("sectionsUnread?: boolean");
    expect(page).toContain("matchLog?.sectionsUnread && v.result === null");
  });
});

describe("정정 요청은 같은 그림일 때만", () => {
  const rows = [
    { id: 7, file_path: "u/first.png", file_hash: "h1", parsed: { capturedAt: "2026-10-06 10:01:02" } },
    { id: 9, file_path: "u/other.png", file_hash: "h2", parsed: { capturedAt: "2026-10-06 11:00:00" } },
  ];

  it("같은 파일 · 같은 해시 · 같은 초 캡처면 그 승인을 짝으로 고른다", () => {
    expect(sameCaptureRow(rows, { path: "u/first.png", hash: null, capturedAt: null })?.id).toBe(7);
    expect(sameCaptureRow(rows, { path: "u/again.png", hash: "h2", capturedAt: null })?.id).toBe(9);
    expect(sameCaptureRow(rows, { path: "u/again.png", hash: "zz", capturedAt: "2026-10-06 10:01:02" })?.id).toBe(7);
  });

  it("다른 그림이면 짝이 없다 — 단과를 둘 산 학생의 둘째 수강증은 정정 요청이 아니다", () => {
    expect(sameCaptureRow(rows, { path: "u/second.png", hash: "h3", capturedAt: "2026-10-07 09:00:00" })).toBeNull();
    expect(sameCaptureRow(rows, { path: null, hash: null, capturedAt: null })).toBeNull();
  });

  it("수동 등업신청이 이 규칙으로 correctionOf 를 정한다 (그 달 승인 아무거나가 아니라)", () => {
    const body = fnBody(read("src/app/my/verify/actions.ts"), "submitManualVerification");
    expect(body).toContain("sameCaptureRow(approvedRows ?? [], { path: filePath, hash: outcome.hash, capturedAt: read?.parsed.capturedAt ?? null })");
    expect(body).not.toMatch(/\.limit\(1\)\.maybeSingle\(\)/);
    // 그림을 읽은 뒤에야 같은 그림인지 안다 — readReceipt 다음에 정한다
    expect(body.indexOf("readReceipt(")).toBeLessThan(body.indexOf("sameCaptureRow("));
  });

  it("이미 승인된 캡처를 다시 올려 바로 닫을 때는 확인 중인 정정 요청을 지우지 않는다", () => {
    const body = fnBody(read("src/app/my/verify/actions.ts"), "submitVerification");
    expect(body).toContain("if (!rejected && !alreadyApproved) await replacePendingReceipts(");
    expect(body.indexOf("const alreadyApproved")).toBeLessThan(body.indexOf("await replacePendingReceipts("));
  });
});

describe("배정 수정 — 지금 반이 목록에 없어도 지금 반이 골라져 있다", () => {
  const render = (sectionId: number) =>
    renderToStaticMarkup(
      createElement(DecisionForms, {
        verificationId: 1,
        result: "approved",
        candidates: [
          { id: 10, label: "10월 · 650+ · 월수금 10:00~11:00" },
          { id: 11, label: "10월 · 650+ · 화목금 10:00~11:00" },
        ],
        pickerSections: [],
        order: {
          id: 5,
          status: "active",
          activates_on: "2026-10-06",
          access_until: "2026-11-03",
          enrollments: [{ id: 50, section_id: sectionId, mode: "onsite", status: "active", label: "10월 · 650+ · 월수금 11:10~12:10" }],
        },
      }),
    );

  it("모집을 마감한 반 · 종강한 반의 배정 — '(지금 반)' 칸이 맨 앞에 골라져 있다", () => {
    const html = render(99);
    expect(html).toMatch(/<option value="99" selected="">10월 · 650\+ · 월수금 11:10~12:10 \(지금 반\)<\/option>/);
    // 첫 반이 골라지지 않는다 — 방식만 고치려고 저장해도 반이 그대로다
    expect(html).not.toMatch(/<option value="10" selected="">/);
  });

  it("지금 반이 목록에 있으면 칸을 더하지 않는다", () => {
    const html = render(11);
    expect(html).not.toContain("(지금 반)");
    expect(html).toMatch(/<option value="11" selected="">/);
  });

  it("서버 — 반이 그대로면 방식만 고친다 (반의 기간 검사를 하지 않는다)", () => {
    const body = fnBody(read("src/app/admin/verifications/actions.ts"), "updateEnrollment");
    expect(body).toContain("if (enr.section_id === sectionId) {");
    expect(body.indexOf("if (enr.section_id === sectionId) {")).toBeLessThan(body.indexOf("assignableError("));
  });
});

describe("저장됐다고 하고 안 바뀌던 것 — 바뀐 줄을 센다", () => {
  it("문의 상태 바꾸기 — 0줄이면 실패로 알린다 (테스트 등급 · 지워진 문의)", () => {
    const body = fnBody(read("src/app/admin/contacts/actions.ts"), "updateContactStatus");
    expect(body).toContain('.update({ status }).eq("id", id).select("id")');
    expect(body).toContain("if (error || !changed?.length) redirect(");
  });

  it("회차 불라방 링크 지우기 — 지운 줄이 없는데 링크가 남아 있으면 권한 오류로 알린다", () => {
    const body = fnBody(read("src/app/admin/sections/actions.ts"), "upsertSessionLiveLink");
    expect(body).toMatch(/\.delete\(\)\.eq\("session_date_id", sessionDateId\)\.select\("session_date_id"\)/);
    expect(body).toContain('if (still) return { error: "권한이 없어요. 본인 반만 수정할 수 있습니다." };');
  });
});
