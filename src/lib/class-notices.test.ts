import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_NOTICE_BODY_MAX, CLASS_NOTICE_IMAGE_MAX_BYTES, noticeCovers, noticeError, noticeVisible, partitionNotices, publishToggleLabel, scopeLabel } from "./class-notices";

const SQL = readFileSync("supabase/migrations/20261005170000_class_notices.sql", "utf8");

describe("noticeVisible — DB 정책과 같은 규칙", () => {
  const all = { levels: [], subjects: [] };
  it("전체 공지는 수강 중이면 누구나 (과정 칸이 아직 없어도)", () => {
    expect(noticeVisible(all, [], true)).toBe(true);
    expect(noticeVisible(all, ["650:rc:A"], false)).toBe(false);
  });
  it("레벨 · 과목이 내 과정 칸과 맞아야 한다 — RC 단과에게 LC 공지는 없다", () => {
    expect(noticeVisible({ levels: [650], subjects: [] }, ["650:rc:A"], true)).toBe(true);
    expect(noticeVisible({ levels: [650], subjects: ["lc"] }, ["650:rc:A"], true)).toBe(false);
    expect(noticeVisible({ levels: [], subjects: ["rc"] }, ["750:rc:B"], true)).toBe(true);
    expect(noticeVisible({ levels: [850], subjects: [] }, ["650:rc:A", "850:lc:A"], true)).toBe(true);
    expect(noticeVisible({ levels: [750], subjects: [] }, ["650:rc:A"], true)).toBe(false);
  });
  it("정책 SQL 이 같은 갈래를 가진다", () => {
    const flat = SQL.replace(/\s+/g, " ");
    expect(flat).toContain("cardinality(levels) = 0 and cardinality(subjects) = 0 and (select private.has_term_access(null))");
    expect(flat).toContain("from unnest((select private.my_round_cells())) as c(cell)");
    expect(flat).toContain(`char_length(body) <= ${CLASS_NOTICE_BODY_MAX}`);
    expect(flat).toContain(`${CLASS_NOTICE_IMAGE_MAX_BYTES / 1024 / 1024} * 1024 * 1024`);
    expect(flat).toContain("position(('[img=' || objects.name) in n.body) > 0");
  });
});

describe("범위 이름 · 관리자 화면 거르기", () => {
  it("scopeLabel", () => {
    expect(scopeLabel({ levels: [], subjects: [] })).toBe("전체");
    expect(scopeLabel({ levels: [750, 650], subjects: [] })).toBe("650 · 750");
    expect(scopeLabel({ levels: [650], subjects: ["lc"] })).toBe("650 LC");
    expect(scopeLabel({ levels: [], subjects: ["rc"] })).toBe("RC 전체");
    expect(scopeLabel({ levels: [650], subjects: ["rc", "lc"] })).toBe("650");
  });
  it("noticeCovers", () => {
    expect(noticeCovers({ levels: [], subjects: [] }, 650, "rc")).toBe(true);
    expect(noticeCovers({ levels: [650], subjects: ["lc"] }, 650, "rc")).toBe(false);
  });
});

describe("noticeError", () => {
  const ok = { title: "공지", body: "본문", levels: [650], subjects: ["rc"] };
  it("통과", () => expect(noticeError(ok, [650, 750])).toBeNull());
  it("제목 · 레벨 · 과목 · 그림 경로", () => {
    expect(noticeError({ ...ok, title: "  " }, [650])).toBe("제목을 적어 주세요.");
    expect(noticeError({ ...ok, levels: [999] }, [650])).toBe("레벨을 다시 골라 주세요.");
    expect(noticeError({ ...ok, subjects: ["xx"] }, [650])).toBe("RC · LC 를 다시 골라 주세요.");
    expect(noticeError({ ...ok, body: "[img=other/a.png]" }, [650])).toContain("사진");
    expect(noticeError({ ...ok, body: "[img=images/a.png w=50]" }, [650])).toBeNull();
  });
});

describe("partitionNotices — 내린 공지는 따로 (2026-10-06 Alan)", () => {
  it("published 로 가르고 순서를 지킨다", () => {
    const { live, down } = partitionNotices([
      { id: 1, published: true },
      { id: 2, published: false },
      { id: 3, published: true },
    ]);
    expect(live.map((n) => n.id)).toEqual([1, 3]);
    expect(down.map((n) => n.id)).toEqual([2]);
  });
  it("토글 글자는 지금 상태의 반대 동작이다", () => {
    expect(publishToggleLabel(true)).toBe("공지 내리기");
    expect(publishToggleLabel(false)).toBe("다시 올리기");
  });
});
