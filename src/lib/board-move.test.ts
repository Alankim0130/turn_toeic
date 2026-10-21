import { describe, expect, it } from "vitest";
import {
  BULK_SKIP,
  bulkDraftOf,
  bulkSteps,
  bulkSummary,
  classPlaceLabel,
  materialMoveBlock,
  materialMoveIssue,
  moveDraftOf,
  movedFromLabel,
  movedFromOf,
  moveTargetError,
  moveTargetOf,
  originTargetOf,
  pathMap,
  type BulkPost,
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

/**
 * 여러 개 한꺼번에 옮기기 (2026-10-21 Alan — "자료를 넘길때 여러개를 한번에 선택해서 넘길수 있도록 하면 좋겠어. 그리고 전체선택도 같이 만들어줘").
 * 옮길 곳을 한 번 고르면 글마다 옮길 곳 · 건너뛸 까닭이 정해진다 — 화면이 그대로 하나씩 옮긴다.
 */
const post = (id: number, extra: Partial<BulkPost> = {}): BulkPost => ({ id, title: `글 ${id}`, levels: [650], movedFrom: null, materialIssue: null, ...extra });

describe("회차 자료로 못 가는 까닭 (materialMoveIssue) — 하나 옮기기와 같은 판정", () => {
  it("사진 · 빈 글 · 괜찮은 글", () => {
    expect(materialMoveIssue({ body: "[img=images/a.png]", files: 1, links: 0 })).toBe("photo");
    expect(materialMoveIssue({ body: "[u][/u]", files: 0, links: 0 })).toBe("empty");
    expect(materialMoveIssue({ body: "스크립트", files: 0, links: 0 })).toBeNull();
    expect(materialMoveBlock({ body: "[img=images/a.png]", files: 0, links: 0 })).toContain("공지사항으로");
  });
});

describe("원래 자리로 돌아갈 곳 (originTargetOf)", () => {
  it("공지 — 지금 레벨 목록에 있는 레벨만 남긴다 · 전체 공지는 전체로", () => {
    expect(originTargetOf({ kind: "notice", levels: [650, 700], subjects: ["rc"] }, LEVELS)).toEqual({ target: { kind: "notice", levels: [650], subjects: ["rc"] } });
    expect(originTargetOf({ kind: "notice", levels: [], subjects: [] }, LEVELS)).toEqual({ target: { kind: "notice", levels: [], subjects: [] } });
  });
  it("공지의 원래 레벨이 모두 없어졌으면 돌아가지 않는다 — 범위가 비면 전체 공지가 되어 더 넓게 보인다", () => {
    expect(originTargetOf({ kind: "notice", levels: [700], subjects: [] }, LEVELS)).toEqual({ skip: "levelGone" });
  });
  it("회차 자료 — 과정 · 회차가 있어야 · 레벨이 목록에 있어야", () => {
    expect(originTargetOf({ kind: "material", level: 750, subject: "lc", set: "B", seq: 4 }, LEVELS)).toEqual({
      target: { kind: "material", level: 750, subject: "lc", set: "B", seq: 4 },
    });
    expect(originTargetOf({ kind: "material", level: 750, subject: "lc", set: null, seq: null }, LEVELS)).toEqual({ skip: "noRound" });
    expect(originTargetOf({ kind: "material", level: 900, subject: "lc", set: "A", seq: 1 }, LEVELS)).toEqual({ skip: "levelGone" });
  });
});

describe("글마다 옮길 곳 (bulkSteps)", () => {
  const photo = post(2, { materialIssue: "photo" });
  const empty = post(3, { materialIssue: "empty" });
  const fromRound = post(4, { movedFrom: { kind: "material", level: 650, subject: "rc", set: "A", seq: 3 } });
  const fromNotice = post(5, { movedFrom: { kind: "notice", levels: [750], subjects: ["lc"] } });
  const fromRoundPhoto = post(6, { movedFrom: { kind: "material", level: 650, subject: "rc", set: "A", seq: 5 }, materialIssue: "photo" });

  it("공지사항 — 사진 · 빈 글도 다 간다 (공지에는 사진을 넣을 수 있다)", () => {
    const target = { kind: "notice", levels: [650], subjects: ["rc"] } as const;
    const steps = bulkSteps([post(1), photo, empty], { ...target, levels: [...target.levels], subjects: [...target.subjects] }, LEVELS);
    expect(steps.map((s) => s.skip)).toEqual([null, null, null]);
    expect(steps.every((s) => s.target?.kind === "notice")).toBe(true);
  });
  it("회차 자료 — 같은 회차에 모두, 사진 · 빈 글은 건너뛰고 까닭을 짧게", () => {
    const steps = bulkSteps([post(1), photo, empty], { kind: "material", level: 650, subject: "lc", set: "B", seq: 2 }, LEVELS);
    expect(steps.map((s) => s.target && s.target.kind === "material" && s.target.seq)).toEqual([2, null, null]);
    expect(steps.map((s) => s.skip)).toEqual([null, BULK_SKIP.photo, BULK_SKIP.empty]);
  });
  it("원래 자리로 — 글마다 옮겨 오기 전 자리, 직원 게시판에서 쓴 글은 건너뛴다, 원래 자리가 회차인데 사진이 생긴 글도", () => {
    const steps = bulkSteps([post(1), fromRound, fromNotice, fromRoundPhoto], { kind: "origin" }, LEVELS);
    expect(steps.map((s) => s.skip)).toEqual([BULK_SKIP.noOrigin, null, null, BULK_SKIP.photo]);
    expect(steps[1].target).toEqual({ kind: "material", level: 650, subject: "rc", set: "A", seq: 3 });
    expect(steps[2].target).toEqual({ kind: "notice", levels: [750], subjects: ["lc"] });
  });
  it("받은 순서 그대로 (서버가 오래된 글부터 준다 — 같은 회차에서 쓴 순서가 이어진다)", () => {
    expect(bulkSteps([post(9), post(3), post(7)], { kind: "notice", levels: [], subjects: [] }, LEVELS).map((s) => s.id)).toEqual([9, 3, 7]);
  });
});

describe("여러 개 옮기기 대화창이 처음 고를 값 (bulkDraftOf)", () => {
  it("모두 수업자료실에서 옮겨 온 글이고 다 돌아갈 수 있으면 '원래 자리로'", () => {
    const a = post(1, { movedFrom: { kind: "material", level: 650, subject: "rc", set: "A", seq: 3 } });
    const b = post(2, { movedFrom: { kind: "notice", levels: [650], subjects: [] } });
    expect(bulkDraftOf([a, b], 650, LEVELS).kind).toBe("origin");
  });
  it("하나라도 원래 자리가 없거나 돌아갈 수 없으면 공지사항", () => {
    const a = post(1, { movedFrom: { kind: "material", level: 650, subject: "rc", set: "A", seq: 3 } });
    expect(bulkDraftOf([a, post(2)], 650, LEVELS).kind).toBe("notice");
    expect(bulkDraftOf([post(1, { movedFrom: { kind: "material", level: 650, subject: "rc", set: null, seq: null } })], 650, LEVELS).kind).toBe("notice");
    expect(bulkDraftOf([], 650, LEVELS).kind).toBe("notice");
  });
  it("원래 자리가 모두 같은 회차면 회차 자료 칸도 그 회차로 미리 고른다", () => {
    const at = { kind: "material", level: 750, subject: "lc", set: "B", seq: 7 } as const;
    const d = bulkDraftOf([post(1, { levels: [750], movedFrom: { ...at } }), post(2, { levels: [750], movedFrom: { ...at } })], 650, LEVELS);
    expect(d.material).toEqual({ level: 750, subject: "lc", set: "B", seq: 7 });
    const mixed = bulkDraftOf([post(1, { levels: [750], movedFrom: { ...at } }), post(2, { levels: [750], movedFrom: { ...at, seq: 8 } })], 650, LEVELS);
    expect(mixed.material).toEqual({ level: 750, subject: null, set: null, seq: null });
  });
  it("공지 범위 — 레벨이 모두 같으면 그 레벨(모두 '모든 레벨' 이면 전체), 다르면 보던 탭", () => {
    expect(bulkDraftOf([post(1, { levels: [750] }), post(2, { levels: [750] })], 650, LEVELS).notice.levels).toEqual([750]);
    expect(bulkDraftOf([post(1, { levels: [] }), post(2, { levels: [] })], 650, LEVELS).notice.levels).toEqual([]);
    expect(bulkDraftOf([post(1, { levels: [750] }), post(2, { levels: [850] })], 650, LEVELS).notice.levels).toEqual([650]);
    expect(bulkDraftOf([post(1, { levels: [750] }), post(2, { levels: [850] })], null, LEVELS).notice.levels).toEqual([]);
  });
  it("회차 자료 레벨 — 글의 레벨이 모두 같은 하나면 그것, 아니면 보던 탭 · 첫 레벨", () => {
    expect(bulkDraftOf([post(1, { levels: [850] }), post(2, { levels: [850] })], 650, LEVELS).material.level).toBe(850);
    expect(bulkDraftOf([post(1, { levels: [750] }), post(2, { levels: [850] })], 650, LEVELS).material.level).toBe(650);
    expect(bulkDraftOf([post(1, { levels: [] })], null, LEVELS).material.level).toBe(650);
  });
});

describe("끝난 뒤 한 줄 (bulkSummary)", () => {
  it("다 옮김 · 일부 실패 · 건너뜀 · 멈춤", () => {
    expect(bulkSummary({ moved: 5, failed: 0, skipped: 0, notRun: 0 })).toBe("5개를 옮겼어요.");
    expect(bulkSummary({ moved: 3, failed: 1, skipped: 2, notRun: 0 })).toBe("3개를 옮겼어요. 1개는 옮기지 못했어요. 2개는 건너뛰었어요.");
    expect(bulkSummary({ moved: 0, failed: 1, skipped: 0, notRun: 4 })).toBe("옮긴 것이 없어요. 1개는 옮기지 못했어요. 멈춰서 4개는 옮기지 않았어요.");
  });
});
