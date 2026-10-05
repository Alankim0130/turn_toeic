import { describe, expect, it } from "vitest";
import { noteView, notePreview } from "./class-materials";
import { parseNote, runClassName, runsText, sliceRuns, stripNoteTags, trimRuns } from "./note-format";

describe("parseNote — 꺾쇠 태그를 글자 조각으로 (2026-10-05)", () => {
  it("서식이 없는 예전 안내는 한 조각 그대로", () => {
    expect(parseNote("수업 전에 출력해 오세요.")).toEqual([{ text: "수업 전에 출력해 오세요.", style: {} }]);
  });

  it("굵게 · 밑줄 · 색 · 크기가 겹쳐도 풀린다", () => {
    expect(parseNote("a[b]b[u]c[/u][/b][color=red][size=lg]d[/size][/color]e")).toEqual([
      { text: "a", style: {} },
      { text: "b", style: { bold: true } },
      { text: "c", style: { bold: true, underline: true } },
      { text: "d", style: { color: "red", size: "lg" } },
      { text: "e", style: {} },
    ]);
  });

  it("모르는 태그 · 목록에 없는 색 · 짝 없는 닫는 태그는 글자로 남는다", () => {
    expect(runsText(parseNote("[color=evil]x[/color][/b][script]"))).toBe("[color=evil]x[/color][/b][script]");
    expect(parseNote("[color=evil]x").every((r) => !r.style.color)).toBe(true);
  });

  it("닫지 않은 태그는 끝까지", () => {
    expect(parseNote("[b]끝까지")).toEqual([{ text: "끝까지", style: { bold: true } }]);
  });

  it("토익 빈칸(______ · -------)은 서식이 아니다", () => {
    expect(parseNote("He ______ the report -------.")).toEqual([{ text: "He ______ the report -------.", style: {} }]);
  });

  it("CSS 에는 정해 둔 클래스만 붙는다", () => {
    expect(runClassName({ bold: true, color: "blue", size: "xl" })).toBe("font-bold text-blue-600 text-lg sm:text-xl");
    expect(runClassName({})).toBe("");
  });
});

describe("접기 — 태그는 세지 않고 보이는 글자로", () => {
  it("태그를 뺀 글자로 접고 센다", () => {
    const note = `[b]${"가".repeat(290)}[/b]`;
    expect(notePreview(note)).toEqual({ folded: false, preview: "가".repeat(290), chars: 290 });
  });

  it("앞부분을 서식째 자른다", () => {
    const note = `[color=red]${"가".repeat(150)}[/color][b]${"나".repeat(400)}[/b]`;
    const v = noteView(note);
    expect(v.folded).toBe(true);
    expect(v.chars).toBe(550);
    expect(v.preview).toEqual([
      { text: "가".repeat(150), style: { color: "red" } },
      { text: "나".repeat(50), style: { bold: true } },
    ]);
  });

  it("앞뒤 빈칸은 서식 안에 있어도 걷어 낸다", () => {
    expect(trimRuns(parseNote("\n [b] 굵게 [/b]\n"))).toEqual([{ text: "굵게", style: { bold: true } }]);
  });

  it("이모지를 반으로 자르지 않는다", () => {
    expect(runsText(sliceRuns([{ text: "😀😀😀", style: {} }], 2))).toBe("😀😀");
  });
});

it("서식 지우기", () => {
  expect(stripNoteTags("[b]가[/b] [color=red]나[/color] [x]")).toBe("가 나 [x]");
});

import { applyNoteChange, normalizeRuns, runsToNote, spliceRuns } from "./note-format";

describe("바로 보이는 편집기의 조각 연산", () => {
  const plain = (t: string) => [{ text: t, style: {} }];

  it("고른 글자만 굵게 → 태그 글로 저장되고 다시 읽으면 같다", () => {
    const runs = applyNoteChange(plain("가나다라"), 1, 3, { kind: "flag", flag: "bold" });
    expect(runsToNote(runs)).toBe("가[b]나다[/b]라");
    expect(normalizeRuns(parseNote(runsToNote(runs)))).toEqual(runs);
  });

  it("같은 버튼을 다시 누르면 풀린다", () => {
    const on = applyNoteChange(plain("가나다"), 0, 3, { kind: "flag", flag: "underline" });
    expect(runsToNote(applyNoteChange(on, 0, 3, { kind: "flag", flag: "underline" }))).toBe("가나다");
  });

  it("색 · 크기가 겹쳐도 한 번에 다시 읽힌다", () => {
    let runs = applyNoteChange(plain("abcdef"), 0, 4, { kind: "color", color: "blue" });
    runs = applyNoteChange(runs, 2, 6, { kind: "size", size: "xl" });
    expect(runsToNote(runs)).toBe("[color=blue]ab[/color][color=blue][size=xl]cd[/size][/color][size=xl]ef[/size]");
    expect(normalizeRuns(parseNote(runsToNote(runs)))).toEqual(runs);
  });

  it("서식 지우기", () => {
    const runs = applyNoteChange(parseNote("[b][color=red]가나[/color][/b]"), 0, 2, { kind: "clear" });
    expect(runsToNote(runs)).toBe("가나");
  });

  it("줄바꿈 · 붙여 넣기는 앞 글자 서식을 잇는다", () => {
    expect(runsToNote(spliceRuns(parseNote("[b]가나[/b]다"), 2, 2, "\n"))).toBe("[b]가나\n[/b]다");
    expect(runsToNote(spliceRuns(plain("가나다"), 1, 2, "XY"))).toBe("가XY다");
    expect(runsToNote(spliceRuns([], 0, 0, "처음"))).toBe("처음");
  });
});

import { styleAt, wordRangeAt } from "./note-format";

describe("워드처럼 — 커서만 두면 그 단어, 버튼은 눌린 모양", () => {
  it("단어 안 · 끝의 커서는 그 단어", () => {
    expect(wordRangeAt("오늘 숙제는 Part5", 4)).toEqual([3, 6]);
    expect(wordRangeAt("오늘 숙제는 Part5", 6)).toEqual([3, 6]);
    expect(wordRangeAt("오늘 숙제는 Part5", 10)).toEqual([7, 12]);
    expect(wordRangeAt("a  b", 2)).toBeNull();
  });

  it("고른 글자가 모두 그 서식일 때만 켜진다", () => {
    const runs = parseNote("[b]가나[/b]다[color=red][b]라[/b][/color]");
    expect(styleAt(runs, 0, 2)).toEqual({ bold: true });
    expect(styleAt(runs, 0, 3)).toEqual({});
    expect(styleAt(runs, 4, 4)).toEqual({ bold: true, color: "red" });
    expect(styleAt(runs, 0, 0)).toEqual({ bold: true });
  });

  it("굵은 단어에 커서만 두고 다시 누르면 풀린다", () => {
    const runs = parseNote("오늘 [b]숙제[/b] 끝");
    const w = wordRangeAt(runsText(runs), 4)!;
    expect(runsToNote(applyNoteChange(runs, w[0], w[1], { kind: "flag", flag: "bold" }))).toBe("오늘 숙제 끝");
  });
});

import { OBJ, alignDoc, docToNote, imageRun, noteImagePaths, parseDoc, resizeImage, spliceDoc, trimDoc } from "./note-format";

describe("줄 정렬 · 그림 (2026-10-05 공지)", () => {
  it("줄 맨 앞의 [center] · [right] 만 정렬, 줄 가운데면 글자", () => {
    const d = parseDoc("[center]제목\n본문 [right]끝\n[right]서명");
    expect(d.aligns).toEqual(["center", "left", "right"]);
    expect(runsText(d.runs)).toBe("제목\n본문 [right]끝\n서명");
    expect(docToNote(d)).toBe("[center]제목\n본문 [right]끝\n[right]서명");
  });

  it("그림은 한 글자, 너비와 함께 다시 읽힌다", () => {
    const d = parseDoc("앞\n[center][img=images/a-1.webp w=50]\n뒤");
    expect(d.runs[1]).toEqual({ text: OBJ, style: { img: { path: "images/a-1.webp", w: 50 } } });
    expect(docToNote(d)).toBe("앞\n[center][img=images/a-1.webp w=50]\n뒤");
    expect(noteImagePaths("[img=images/a.png][img=images/a.png w=30]")).toEqual(["images/a.png"]);
    expect(parseDoc("[img=images/a.png w=5]").runs[0].style.img?.w).toBe(10);
  });

  it("그림 옆에 친 글자는 그림이 되지 않는다 · 너비 바꾸기 · 지우기", () => {
    let d = parseDoc("[img=images/a.png]");
    d = spliceDoc(d, 1, 1, "글");
    expect(docToNote(d)).toBe("[img=images/a.png]글");
    d = resizeImage(d, 0, 75);
    expect(docToNote(d)).toBe("[img=images/a.png w=75]글");
    expect(docToNote(spliceDoc(d, 0, 1, ""))).toBe("글");
  });

  it("줄바꿈은 그 줄의 정렬을 잇고, 지운 줄의 정렬은 빠진다", () => {
    let d = parseDoc("[center]가나\n[right]다");
    d = spliceDoc(d, 1, 1, "\n");
    expect(d.aligns).toEqual(["center", "center", "right"]);
    d = spliceDoc(d, 1, 4, "");
    expect(docToNote(d)).toBe("[center]가다");
    expect(docToNote(spliceDoc(d, 1, 1, [{ text: "\n", style: {} }, imageRun("images/b.png", 50)]))).toBe("[center]가\n[center][img=images/b.png w=50]다");
  });

  it("정렬 버튼 — 한 번 더 누르면 왼쪽으로", () => {
    const d = parseDoc("가\n나\n다");
    const c = alignDoc(d, 0, 3, "center");
    expect(c.aligns).toEqual(["center", "center", "left"]);
    expect(alignDoc(c, 0, 0, "center").aligns).toEqual(["left", "center", "left"]);
  });

  it("앞뒤 빈 줄을 걷어 내면 정렬도 그만큼 빠진다", () => {
    expect(trimDoc(parseDoc("\n\n[center]가\n")).aligns).toEqual(["center"]);
  });
});
