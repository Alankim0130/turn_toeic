import { describe, expect, it } from "vitest";
import {
  classPlaceLabel,
  materialMoveBlock,
  moveDraftOf,
  movedFromLabel,
  movedFromOf,
  moveTargetError,
  moveTargetOf,
  pathMap,
} from "./board-move";
import { noteImagePaths, rewriteNoteImages } from "./note-format";

/**
 * 직원 게시판 ↔ 수업자료실 옮기기 (2026-10-21 Alan — "이 게시물을 수업게시판으로 옮길 수 있으면 좋겠어. 반대로 수업게시물에 있는 내용을
 * 다시 직원게시판으로 옮길 수 도 있어야해"). 화면이 보낸 옮길 곳은 믿지 않고 꼴부터 다시 읽는다 — 틀린 값이 그대로 공지 · 자료 행에 들어가면
 * 엉뚱한 학생에게 보이거나 아무에게도 안 보인다.
 */
const LEVELS = [650, 750, 850];

describe("옮길 곳 — 화면이 보낸 값 읽기 (moveTargetOf)", () => {
  it("공지사항 — 레벨은 정수만 · 한 번씩 · 작은 것부터, 과목 둘을 다 고르면 '둘 다'(빈 배열)", () => {
    expect(moveTargetOf({ kind: "notice", levels: [750, "650", 650], subjects: ["rc"] })).toEqual({ kind: "notice", levels: [650, 750], subjects: ["rc"] });
    expect(moveTargetOf({ kind: "notice", levels: [], subjects: ["rc", "lc"] })).toEqual({ kind: "notice", levels: [], subjects: [] });
    expect(moveTargetOf({ kind: "notice" })).toEqual({ kind: "notice", levels: [], subjects: [] });
    expect(moveTargetOf({ kind: "notice", levels: "650", subjects: ["xx"] })).toEqual({ kind: "notice", levels: [], subjects: [] });
  });
  it("회차 자료 — 레벨 · 과목 · 과정 · 회차가 다 맞아야 (회차는 1~30)", () => {
    expect(moveTargetOf({ kind: "material", level: 650, subject: "lc", set: "B", seq: 3 })).toEqual({ kind: "material", level: 650, subject: "lc", set: "B", seq: 3 });
    expect(moveTargetOf({ kind: "material", level: "750", subject: "rc", set: "A", seq: "30" })).toEqual({ kind: "material", level: 750, subject: "rc", set: "A", seq: 30 });
    expect(moveTargetOf({ kind: "material", level: 650, subject: "lc", set: "B", seq: 31 })).toBeNull();
    expect(moveTargetOf({ kind: "material", level: 650, subject: "lc", set: "B", seq: 0 })).toBeNull();
    expect(moveTargetOf({ kind: "material", level: 650, subject: "lc", set: "C", seq: 3 })).toBeNull();
    expect(moveTargetOf({ kind: "material", level: 650, subject: "xx", set: "A", seq: 3 })).toBeNull();
    expect(moveTargetOf({ kind: "material", level: 0, subject: "lc", set: "A", seq: 3 })).toBeNull();
    expect(moveTargetOf({ kind: "material", subject: "lc", set: "A", seq: 3 })).toBeNull();
  });
  it("모르는 꼴은 null", () => {
    expect(moveTargetOf(null)).toBeNull();
    expect(moveTargetOf("notice")).toBeNull();
    expect(moveTargetOf([{ kind: "notice" }])).toBeNull();
    expect(moveTargetOf({ kind: "board" })).toBeNull();
  });
  it("레벨은 교재 레벨 목록(lc_levels) 안의 값만", () => {
    expect(moveTargetError({ kind: "notice", levels: [650], subjects: [] }, LEVELS)).toBeNull();
    expect(moveTargetError({ kind: "notice", levels: [], subjects: [] }, LEVELS)).toBeNull();
    expect(moveTargetError({ kind: "notice", levels: [650, 700], subjects: [] }, LEVELS)).toBe("레벨을 다시 골라 주세요.");
    expect(moveTargetError({ kind: "material", level: 850, subject: "rc", set: "A", seq: 1 }, LEVELS)).toBeNull();
    expect(moveTargetError({ kind: "material", level: 900, subject: "rc", set: "A", seq: 1 }, LEVELS)).toBe("레벨을 다시 골라 주세요.");
  });
});

describe("원래 자리 — DB 의 moved_from 읽기 · 이름", () => {
  it("공지 · 회차 자료 · 과정 회차가 없던 옛 자료", () => {
    expect(movedFromOf({ kind: "notice", levels: [650], subjects: ["lc"] })).toEqual({ kind: "notice", levels: [650], subjects: ["lc"] });
    expect(movedFromOf({ kind: "material", level: 650, subject: "rc", set: "A", seq: 3 })).toEqual({ kind: "material", level: 650, subject: "rc", set: "A", seq: 3 });
    expect(movedFromOf({ kind: "material", level: 650, subject: "rc", set: null, seq: null })).toEqual({ kind: "material", level: 650, subject: "rc", set: null, seq: null });
  });
  it("틀린 값은 버린다 (표시 · 미리 고르기에만 쓴다)", () => {
    expect(movedFromOf(null)).toBeNull();
    expect(movedFromOf({ kind: "material", level: "x", subject: "rc" })).toBeNull();
    expect(movedFromOf({ kind: "material", level: 650, subject: "xx" })).toBeNull();
    expect(movedFromOf({ kind: "elsewhere" })).toBeNull();
    // 과정 · 회차만 틀리면 그 둘만 비운다
    expect(movedFromOf({ kind: "material", level: 650, subject: "lc", set: "Z", seq: 99 })).toEqual({ kind: "material", level: 650, subject: "lc", set: null, seq: null });
  });
  it("자리 이름 — 공지 범위 · 회차 · 과정 회차 미정", () => {
    expect(classPlaceLabel({ kind: "material", level: 650, subject: "rc", set: "A", seq: 3 })).toBe("650 RC A과정 3회차");
    expect(classPlaceLabel({ kind: "material", level: 650, subject: "lc", set: null, seq: null })).toBe("650 LC 자료");
    expect(classPlaceLabel({ kind: "notice", levels: [650, 750], subjects: ["rc"] })).toBe("공지 (650 · 750 RC)");
    expect(classPlaceLabel({ kind: "notice", levels: [], subjects: [] })).toBe("공지 (전체)");
    expect(movedFromLabel({ kind: "material", level: 850, subject: "lc", set: "B", seq: 12 })).toBe("수업자료실 850 LC B과정 12회차에서 옮겨 온 글");
  });
});

describe("회차 자료로 못 가는 글 (materialMoveBlock)", () => {
  it("본문에 사진이 있으면 — 회차 자료 안내에는 사진을 넣을 수 없다, 공지사항으로", () => {
    expect(materialMoveBlock({ body: "숙제 안내\n[img=images/a.png w=50]", files: 0, links: 0 })).toContain("공지사항으로");
  });
  it("본문 · 파일 · 링크가 다 없으면 (자료 올리기와 같은 규칙) — 서식 태그만 남은 본문도 빈 것", () => {
    expect(materialMoveBlock({ body: "", files: 0, links: 0 })).toContain("없는 글은");
    expect(materialMoveBlock({ body: "[b][/b]", files: 0, links: 0 })).toContain("없는 글은");
  });
  it("글 · 파일 · 링크 중 하나만 있어도 간다 (표는 사진이 아니다)", () => {
    expect(materialMoveBlock({ body: "Part 3 스크립트", files: 0, links: 0 })).toBeNull();
    expect(materialMoveBlock({ body: "", files: 2, links: 0 })).toBeNull();
    expect(materialMoveBlock({ body: "", files: 0, links: 1 })).toBeNull();
    expect(materialMoveBlock({ body: "[table][tr][td]Q1[/td][td](A)[/td][/tr][/table]", files: 0, links: 0 })).toBeNull();
  });
});

describe("옮기기 대화창이 처음 고를 값 (moveDraftOf)", () => {
  it("직원 게시판에서 쓴 글 — 글의 레벨로 공지사항, 레벨이 하나면 회차 자료 레벨도 그것", () => {
    expect(moveDraftOf({ levels: [750], moved_from: null }, LEVELS)).toEqual({
      kind: "notice",
      notice: { levels: [750], subjects: [] },
      material: { level: 750, subject: null, set: null, seq: null },
    });
    expect(moveDraftOf({ levels: [650, 850], moved_from: null }, LEVELS).material.level).toBeNull();
    expect(moveDraftOf({ levels: [], moved_from: null }, LEVELS).notice.levels).toEqual([]);
  });
  it("수업자료실에서 옮겨 온 글 — 원래 자리를 그대로 (회차를 잊어 엉뚱한 회차에 올리지 않게)", () => {
    const back = moveDraftOf({ levels: [650], moved_from: { kind: "material", level: 650, subject: "lc", set: "B", seq: 7 } }, LEVELS);
    expect(back.kind).toBe("material");
    expect(back.material).toEqual({ level: 650, subject: "lc", set: "B", seq: 7 });
    const notice = moveDraftOf({ levels: [650, 750], moved_from: { kind: "notice", levels: [650, 750], subjects: ["rc"] } }, LEVELS);
    expect(notice.kind).toBe("notice");
    expect(notice.notice).toEqual({ levels: [650, 750], subjects: ["rc"] });
  });
  it("지금 레벨 목록에 없는 레벨은 미리 고르지 않는다", () => {
    expect(moveDraftOf({ levels: [700], moved_from: null }, LEVELS).notice.levels).toEqual([]);
    expect(moveDraftOf({ levels: [650], moved_from: { kind: "material", level: 700, subject: "rc", set: "A", seq: 1 } }, LEVELS).material.level).toBe(650);
  });
});

describe("사진 경로 바꾸기 (rewriteNoteImages) — 다른 버킷으로 복사하면 경로가 새로 생긴다", () => {
  const steps = [
    { from: "images/aaa.png", to: "images/bbb.png" },
    { from: "images/ccc.webp", to: "images/ddd.webp" },
  ];
  it("그림 태그만 바꾸고 너비(w=)는 그대로, 나머지 글자는 한 자도 안 건드린다", () => {
    const body = "[b]안내[/b]\n[img=images/aaa.png w=50]\n[center][img=images/ccc.webp]\n끝 [img=images/zzz.png]";
    const out = rewriteNoteImages(body, pathMap(steps));
    expect(out).toBe("[b]안내[/b]\n[img=images/bbb.png w=50]\n[center][img=images/ddd.webp]\n끝 [img=images/zzz.png]");
    expect(noteImagePaths(out)).toEqual(["images/bbb.png", "images/ddd.webp", "images/zzz.png"]);
  });
  it("표 칸 글자 속 [img=…] 꼴은 그림이 아니다 — 그대로", () => {
    const body = "[table][tr][td]\\[img=images/aaa.png][/td][/tr][/table]\n[img=images/aaa.png]";
    expect(rewriteNoteImages(body, pathMap(steps))).toBe("[table][tr][td]\\[img=images/aaa.png][/td][/tr][/table]\n[img=images/bbb.png]");
  });
  it("같은 사진이 두 번 나오면 둘 다 같은 새 경로 (사진 경로는 한 번씩만 복사한다)", () => {
    expect(rewriteNoteImages("[img=images/aaa.png]\n[img=images/aaa.png w=25]", pathMap(steps))).toBe("[img=images/bbb.png]\n[img=images/bbb.png w=25]");
    expect(noteImagePaths("[img=images/aaa.png]\n[img=images/aaa.png w=25]")).toEqual(["images/aaa.png"]);
  });
  it("바꿀 것이 없으면 그대로", () => {
    expect(rewriteNoteImages("[img=images/aaa.png]", new Map())).toBe("[img=images/aaa.png]");
  });
});
