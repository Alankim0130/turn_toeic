import { describe, expect, it } from "vitest";
import { closeSamePendingReceipts, replacePendingReceipts } from "./pending-receipts";
import { seatOfSections } from "./receipt-seat";

/**
 * 확인 중 수강증을 지우고 · 닫는 서버 코드를 작은 가짜 DB 로 돌린다 (2026-10-06 — 한 학생이 RC단과를 두 개 등록했다).
 * 판정은 `receipt-seat.test.ts` 가 굳히고, 여기서는 **어느 줄이 지워지고 닫히는지**(필터 · 파일 지우기)를 본다.
 */

type Row = Record<string, unknown>;

/** supabase-js 쿼리 빌더 흉내 — 이 파일이 쓰는 것만 (select · eq · neq · is · in · delete · update) */
function fakeAdmin(tables: Record<string, Row[]>) {
  const removed: string[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: { kind: "select" } | { kind: "delete" } | { kind: "update"; patch: Row } = { kind: "select" };
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), builder),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), builder),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
      delete: () => ((op = { kind: "delete" }), builder),
      update: (patch: Row) => ((op = { kind: "update", patch }), builder),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
        const rows = tables[table] ?? [];
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op.kind === "delete") tables[table] = rows.filter((r) => !hit.includes(r));
        if (op.kind === "update") for (const r of hit) Object.assign(r, op.patch);
        return Promise.resolve({ data: hit, error: null }).then(resolve);
      },
    };
    return builder;
  };
  const admin = { from, storage: { from: () => ({ remove: async (paths: string[]) => (removed.push(...paths), { data: null, error: null }) }) } };
  return { admin: admin as never, tables, removed };
}

const USER = "u1";
// 10월 650: 1 = 월수금 10:00~11:00 RC단과 · 4 = 화목금 11:10~12:10 RC단과 · 5 = 월수금 10:00~12:10
const sections = [
  { id: 1, track: "mwf", time_block: "10:00~11:00", term: { month: 10 } },
  { id: 4, track: "ttf", time_block: "11:10~12:10", term: { month: 10 } },
  { id: 5, track: "mwf", time_block: "10:00~12:10", term: { month: 10 } },
];
const parsedOf = (timeBlock: string, track: string, month = 10) => ({ time: { timeBlock }, tracks: [track], courseMonth: month });

function verification(id: number, over: Row): Row {
  return { id, user_id: USER, result: null, file_path: `${USER}/r${id}.png`, file_hash: `hash${id}`, requested_section_ids: [], candidates: null, parsed: null, ...over };
}

describe("새 수강증을 올릴 때 — 같은 등록만 바꿔 넣는다", () => {
  it("RC단과 둘째를 올려도 확인 중인 첫째(다른 강좌)는 남는다", async () => {
    const db = fakeAdmin({
      class_sections: [...sections],
      enrollment_verifications: [verification(10, { candidates: { result: { kind: "match", sectionIds: [1] } }, parsed: parsedOf("10:00~11:00", "mwf") })],
    });
    await replacePendingReceipts(db.admin, USER, `${USER}/new.png`, seatOfSections([sections[1]], { path: `${USER}/new.png`, hash: "hashN" }, parsedOf("11:10~12:10", "ttf")));
    expect(db.tables.enrollment_verifications.map((r) => r.id)).toEqual([10]);
    expect(db.removed).toEqual([]);
  });

  it("같은 반 수강증을 다시 올리면 옛 것과 그 파일을 지운다 — 다른 신청이 가리키는 파일은 남긴다", async () => {
    const db = fakeAdmin({
      class_sections: [...sections],
      enrollment_verifications: [
        verification(10, { candidates: { result: { kind: "match", sectionIds: [1] } }, parsed: parsedOf("10:00~11:00", "mwf") }),
        // 확인 중이던 수동 신청이 거절된 신청의 파일을 다시 쓰고 있다 — 그 그림은 거절 기록에 남아야 한다
        verification(11, { requested_section_ids: [1], file_path: `${USER}/old.png` }),
        verification(9, { result: "rejected", file_path: `${USER}/old.png` }),
      ],
    });
    await replacePendingReceipts(db.admin, USER, `${USER}/new.png`, seatOfSections([sections[0]], { path: `${USER}/new.png` }, parsedOf("10:00~11:00", "mwf")));
    expect(db.tables.enrollment_verifications.map((r) => r.id)).toEqual([9]);
    expect(db.removed).toEqual([`${USER}/r10.png`]);
  });

  it("60분 → 120분처럼 시간이 겹치면 반을 바꾼 것 — 바꿔 넣는다", async () => {
    const db = fakeAdmin({ class_sections: [...sections], enrollment_verifications: [verification(10, { requested_section_ids: [1] })] });
    await replacePendingReceipts(db.admin, USER, `${USER}/new.png`, seatOfSections([sections[2]], { path: `${USER}/new.png` }));
    expect(db.tables.enrollment_verifications).toEqual([]);
  });

  it("못 읽은 옛 수강증은 예전처럼 바꿔 넣고 · 받아 둔 다음 달 수강증은 남긴다", async () => {
    const db = fakeAdmin({
      class_sections: [...sections],
      enrollment_verifications: [
        verification(10, { ocr_raw: { error: "ocr_failed" } }),
        verification(12, { candidates: { result: { kind: "none", reason: "11월 반 없음" }, hold: 11 }, parsed: parsedOf("10:00~11:00", "mwf", 11) }),
      ],
    });
    await replacePendingReceipts(db.admin, USER, `${USER}/new.png`, seatOfSections([sections[0]], { path: `${USER}/new.png` }, parsedOf("10:00~11:00", "mwf")));
    expect(db.tables.enrollment_verifications.map((r) => r.id)).toEqual([12]);
  });

  it("승인 · 거절이 끝난 기록과 다른 학생의 신청은 건드리지 않는다", async () => {
    const db = fakeAdmin({
      class_sections: [...sections],
      enrollment_verifications: [
        verification(10, { result: "approved", requested_section_ids: [1] }),
        verification(13, { user_id: "u2", requested_section_ids: [1] }),
      ],
    });
    await replacePendingReceipts(db.admin, USER, `${USER}/new.png`, seatOfSections([sections[0]], { path: `${USER}/new.png` }));
    expect(db.tables.enrollment_verifications.map((r) => r.id)).toEqual([10, 13]);
  });
});

describe("수강증을 승인할 때 — 같은 등록을 다시 낸 확인 중 수강증만 닫는다", () => {
  it("다른 강좌(단과 둘째) · 못 읽은 것 · 받아 둔 것 · 정정 요청은 남기고, 같은 반을 다시 낸 것만 닫는다", async () => {
    const db = fakeAdmin({
      class_sections: [...sections],
      enrollment_verifications: [
        verification(20, { result: "approved", requested_section_ids: [1] }),
        verification(21, { requested_section_ids: [4] }), // 화목금 11:10 RC단과 — 다른 강좌
        verification(22, { candidates: { result: { kind: "match", sectionIds: [1] } } }), // 같은 반을 다시 냄
        verification(23, {}), // 못 읽음
        verification(24, { candidates: { hold: 11 }, parsed: parsedOf("10:00~11:00", "mwf", 11) }),
        verification(25, { requested_section_ids: [1], candidates: { correctionOf: 20 } }),
      ],
    });
    await closeSamePendingReceipts(db.admin, USER, 20, seatOfSections([sections[0]], { path: `${USER}/r20.png`, hash: "hash20" }));
    const result = Object.fromEntries(db.tables.enrollment_verifications.map((r) => [r.id, r.result]));
    expect(result).toEqual({ 20: "approved", 21: null, 22: "closed", 23: null, 24: null, 25: null });
  });

  it("같은 그림(같은 파일)을 다시 낸 것은 고른 반이 달라도 닫는다", async () => {
    const db = fakeAdmin({
      class_sections: [...sections],
      enrollment_verifications: [verification(30, { result: "approved" }), verification(31, { requested_section_ids: [4], file_hash: "hash30" })],
    });
    await closeSamePendingReceipts(db.admin, USER, 30, seatOfSections([sections[0]], { path: `${USER}/r30.png`, hash: "hash30" }));
    expect(db.tables.enrollment_verifications.find((r) => r.id === 31)?.result).toBe("closed");
  });
});
