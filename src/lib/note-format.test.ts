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

import { TABLE_MAX_COLS, applyNoteChange as change, asNoteTable, replaceTable, tableRun, tableSize, tableToNote, type NoteTable } from "./note-format";
import { defaultMaterialTitle, noteHasText } from "./class-materials";

describe("표 (2026-10-07 Alan — 다른 블로그에서 붙여 넣은 표)", () => {
  /** Alan 이 보여 준 표 — 첫 칸 · 끝 칸이 네 줄을 합쳤다 */
  const ALAN: NoteTable = {
    rows: [
      [{ text: "의문사", align: "center", head: true }, { text: "be 동사", align: "center", head: true }, { text: "주어", head: true }, { text: "동사ing", head: true }],
      [{ text: "When\nWho\nWhere", rowspan: 4, align: "center" }, { text: "am" }, { text: "I" }, { text: "running", rowspan: 4, align: "right" }],
      [{ text: "are" }, { text: "you" }],
      [{ text: "is" }, { text: "he/ she/ it" }],
      [{ text: "are" }, { text: "we/ you and I/ you/ they" }],
    ],
  };

  it("한 줄 글로 저장되고 다시 읽으면 같다 — 합친 칸 · 정렬 · 머리칸 · 칸 안 줄바꿈", () => {
    const note = tableToNote(ALAN);
    expect(note).not.toContain("\n");
    expect(note.startsWith("[table][tr][th align=center]의문사[/th]")).toBe(true);
    expect(note).toContain("[td rowspan=4 align=center]When\\nWho\\nWhere[/td]");
    const d = parseDoc(`위 문장\n[center]${note}\n아래`);
    expect(d.runs.map((r) => r.text).join("")).toBe(`위 문장\n${OBJ}\n아래`);
    expect(d.runs[1].style.table).toEqual(ALAN);
    expect(d.aligns).toEqual(["left", "center", "left"]);
    expect(docToNote(d)).toBe(`위 문장\n[center]${note}\n아래`);
  });

  it("칸 글자의 [ · \\ · [/table] · 태그 글자는 칸 안에 글자로 남는다", () => {
    const t: NoteTable = { rows: [[{ text: "[b]굵게?[/b] [/td] [/table] \\n" }, { text: "[img=images/a.png]" }]] };
    const note = tableToNote(t);
    expect(parseDoc(note).runs).toEqual([tableRun(t)]);
    // 칸 안의 그림 글자는 그림이 아니다 — 서명 주소를 만들거나 지울 그림으로 세지 않는다
    expect(noteImagePaths(note)).toEqual([]);
  });

  it("꼴이 틀린 표는 글자 그대로 보인다 (모르는 태그와 같은 규칙)", () => {
    const bad = [
      "[table][tr][td]x[/td][/table]", // 줄 닫기 없음
      "[table][tr][td style=red]x[/td][/tr][/table]", // 모르는 값
      "[table][tr][td]x[/th][/tr][/table]", // 짝이 다른 닫기
      "[table][tr][td]a\\qb[/td][/tr][/table]", // 모르는 이스케이프
      "[table][/table]", // 칸 없음
      `[table][tr]${"[td]x[/td]".repeat(TABLE_MAX_COLS + 1)}[/tr][/table]`, // 칸이 너무 많다
    ];
    for (const s of bad) {
      expect(parseDoc(s).runs.every((r) => !r.style.table)).toBe(true);
      expect(runsText(parseDoc(s).runs)).toBe(s);
    }
    // 칸 글자에 줄바꿈이 그대로 있으면(손으로 고친 글) 표가 아니다 — 줄 단위 정렬이 무너지지 않게
    expect(parseDoc("[table][tr][td]a\nb[/td][/tr][/table]").runs.some((r) => r.style.table)).toBe(false);
  });

  it("서식 버튼은 표를 건너뛴다 — 글자와 표를 함께 골라 굵게를 두 번 누르면 풀린다", () => {
    const runs = [{ text: "앞", style: {} }, tableRun(ALAN), { text: "뒤", style: {} }];
    const on = change(runs, 0, 3, { kind: "flag", flag: "bold" });
    expect(on[1]).toEqual(tableRun(ALAN));
    expect(styleAt(on, 0, 3)).toEqual({ bold: true });
    const off = change(on, 0, 3, { kind: "flag", flag: "bold" });
    expect(runsToNote(off)).toBe(`앞${tableToNote(ALAN)}뒤`);
    // 표만 골랐으면 아무것도 바뀌지 않는다 · 서식 지우기도 표는 그대로
    expect(change(runs, 1, 2, { kind: "flag", flag: "bold" })).toEqual(runs);
    expect(change(on, 0, 3, { kind: "clear" })[1]).toEqual(tableRun(ALAN));
  });

  it("표 옆에 친 글자는 표가 되지 않는다 · 표 바꾸기 · 지우기", () => {
    let d = parseDoc(tableToNote(ALAN));
    d = spliceDoc(d, 1, 1, "글");
    expect(d.runs[1]).toEqual({ text: "글", style: {} });
    const fixed: NoteTable = { rows: ALAN.rows.map((row, i) => row.map((c, j) => (i === 2 && j === 1 ? { ...c, text: "you (너)" } : c))) };
    d = replaceTable(d, 0, fixed);
    expect(d.runs[0].style.table).toEqual(fixed);
    expect(replaceTable(d, 1, ALAN)).toEqual(d); // 그 자리에 표가 없으면 그대로
    expect(docToNote(spliceDoc(d, 0, 1, ""))).toBe("글");
  });

  it("크기 — 합친 칸을 펼쳐 센다", () => {
    expect(tableSize(ALAN)).toEqual({ rows: 5, cols: 4 });
    expect(tableSize({ rows: [[{ text: "머리", colspan: 3 }], [{ text: "a" }, { text: "b" }, { text: "c" }]] })).toEqual({ rows: 2, cols: 3 });
  });

  it("밖에서 온 값(편집기 칸 · 붙여 넣기)은 꼴을 다시 본다", () => {
    expect(asNoteTable(JSON.parse(JSON.stringify(ALAN)))).toEqual(ALAN);
    expect(asNoteTable({ rows: [[{ text: `a${OBJ}b\r\nc`, rowspan: 1, colspan: 999, align: "justify", head: "yes", x: 1 }]] })).toEqual({
      rows: [[{ text: "ab\nc", colspan: TABLE_MAX_COLS }]],
    });
    for (const v of [null, "x", {}, { rows: "x" }, { rows: [] }, { rows: [[]] }, { rows: [[{ text: 1 }]] }, { rows: [[null]] }]) expect(asNoteTable(v)).toBeNull();
  });

  it("표만 있는 안내도 내용이 있는 글이다 · 제목은 표를 건너뛴 첫 글줄", () => {
    const note = `${tableToNote(ALAN)}\n의문문 만들기`;
    expect(noteHasText(tableToNote(ALAN))).toBe(true);
    expect(defaultMaterialTitle([], note)).toBe("의문문 만들기");
    expect(defaultMaterialTitle([], tableToNote(ALAN))).toBe("수업 자료");
  });

  it("접기 — 표는 한 줄 · 한 글자로 세어 짧은 안내 + 표는 펼쳐 둔다", () => {
    const v = noteView(`아래 표를 외워 오세요\n${tableToNote(ALAN)}`);
    expect(v.folded).toBe(false);
    expect(v.full[1].style.table).toEqual(ALAN);
    expect(v.chars).toBe("아래 표를 외워 오세요\n".length + 1);
  });
});

import { moveObject, objectStep, removeObject, type NoteDoc } from "./note-format";

describe("표 옮기기 (2026-10-19 Alan — 표를 넣고 위치 이동이 안 됐다)", () => {
  const T: NoteTable = { rows: [[{ text: "의문사", head: true }, { text: "be" }], [{ text: "When", align: "center" }, { text: "am" }]] };
  const TB = tableToNote(T);
  /** 글 → 옮기기 → 글. 표 자리는 글에서 찾는다 */
  const at = (note: string) => Array.from(runsText(parseDoc(note).runs)).indexOf(OBJ);
  const move = (note: string, to: { line: number; place: "before" | "after" }) => {
    const r = moveObject(parseDoc(note), at(note), to);
    return r && { note: docToNote(r.doc), offset: r.offset, table: Array.from(runsText(r.doc.runs))[r.offset] === OBJ };
  };
  const step = (note: string, dir: "up" | "down") => {
    const d = parseDoc(note);
    const to = objectStep(d, at(note), dir);
    return to && docToNote(moveObject(d, at(note), to)!.doc);
  };

  it("위로 · 아래로 — 혼자 선 표는 앞 · 뒤 줄과 자리를 바꾼다 (빈 줄도 한 줄)", () => {
    const note = `가\n나\n${TB}\n\n다`;
    expect(step(note, "up")).toBe(`가\n${TB}\n나\n\n다`);
    expect(step(note, "down")).toBe(`가\n나\n\n${TB}\n다`);
    // 여러 번 누르면 계속 간다 — 맨 위 · 맨 아래에서는 더 갈 데가 없다
    expect(step(step(step(note, "up")!, "up")!, "up")).toBeNull();
    expect(step(`${TB}\n가`, "up")).toBeNull();
    expect(step(`가\n${TB}`, "down")).toBeNull();
    expect(step(TB, "up")).toBeNull();
    expect(step(TB, "down")).toBeNull();
  });

  it("같은 줄에 글자가 있으면 먼저 그 글자 위(아래)의 제 줄로 떼어 낸다 — 앞뒤 글자는 붙지 않고 두 줄로", () => {
    expect(step(`가\n앞${TB}뒤\n나`, "up")).toBe(`가\n${TB}\n앞\n뒤\n나`);
    expect(step(`가\n앞${TB}뒤\n나`, "down")).toBe(`가\n앞\n뒤\n${TB}\n나`);
    expect(step(`가\n${TB}뒤`, "up")).toBe(`${TB}\n가\n뒤`);
    expect(step(`가\n${TB}뒤`, "down")).toBe(`가\n뒤\n${TB}`);
    expect(step(`앞${TB}`, "up")).toBe(`${TB}\n앞`);
    expect(step(`앞${TB}`, "down")).toBeNull();
  });

  it("아무 줄 앞 · 뒤로 (끌어 놓기) — 새 자리 · 정렬 · 제자리", () => {
    const note = `[center]가\n[right]${TB}\n나\n다`;
    expect(move(note, { line: 0, place: "before" })).toEqual({ note: `[right]${TB}\n[center]가\n나\n다`, offset: 0, table: true });
    expect(move(note, { line: 3, place: "after" })).toEqual({ note: `[center]가\n나\n다\n[right]${TB}`, offset: 6, table: true });
    expect(move(note, { line: 2, place: "before" })?.note).toBe(note); // 바로 아래 줄 앞 = 제자리
    expect(move(note, { line: 0, place: "after" })?.note).toBe(note); // 바로 위 줄 뒤 = 제자리
    expect(move(note, { line: 1, place: "before" })?.note).toBe(note); // 제 줄
    expect(move(note, { line: 1, place: "after" })?.note).toBe(note);
    // 표 · 앞뒤 글자를 다른 서식과 함께 — 서식은 그대로 따라간다
    expect(move(`[b]굵게[/b]\n${TB}`, { line: 0, place: "before" })?.note).toBe(`${TB}\n[b]굵게[/b]`);
  });

  it("두 표 · 그림 사이에서도 고른 표만 옮긴다", () => {
    const other = tableToNote({ rows: [[{ text: "다른 표" }]] });
    const note = `${other}\n가\n${TB}`;
    const d = parseDoc(note);
    const r = moveObject(d, Array.from(runsText(d.runs)).lastIndexOf(OBJ), { line: 0, place: "before" });
    expect(docToNote(r!.doc)).toBe(`${TB}\n${other}\n가`);
    const img = moveObject(parseDoc("가\n[img=images/a.png w=50]"), 2, { line: 0, place: "before" });
    expect(docToNote(img!.doc)).toBe("[img=images/a.png w=50]\n가");
  });

  it("그 자리에 표가 없거나 줄이 틀리면 null", () => {
    const d = parseDoc(`가\n${TB}`);
    expect(moveObject(d, 0, { line: 0, place: "before" })).toBeNull();
    expect(moveObject(d, 2, { line: 5, place: "before" })).toBeNull();
    expect(moveObject(d, 2, { line: -1, place: "before" })).toBeNull();
    expect(objectStep(d, 1, "up")).toBeNull();
  });

  it("잘라내기 — 혼자 선 줄은 줄째, 앞뒤 글자가 있으면 둘로 나뉘고 커서는 뺀 자리에", () => {
    const cut = (note: string) => {
      const r = removeObject(parseDoc(note), at(note));
      return r && { note: docToNote(r.doc), offset: r.offset };
    };
    expect(cut(`가\n${TB}\n나`)).toEqual({ note: "가\n나", offset: 2 });
    expect(cut(`가\n${TB}`)).toEqual({ note: "가", offset: 1 });
    expect(cut(`${TB}\n가`)).toEqual({ note: "가", offset: 0 });
    expect(cut(TB)).toEqual({ note: "", offset: 0 });
    expect(cut(`가\n앞${TB}뒤`)).toEqual({ note: "가\n앞\n뒤", offset: 3 });
    expect(cut(`[center]앞${TB}`)).toEqual({ note: "[center]앞", offset: 1 });
    expect(cut(`${TB}뒤`)).toEqual({ note: "뒤", offset: 0 });
    expect(removeObject(parseDoc("글만"), 0)).toBeNull();
    const empty: NoteDoc = removeObject(parseDoc(TB), 0)!.doc;
    expect(empty.aligns).toEqual(["left"]);
  });
});

import {
  cellRuns,
  cellStylesIn,
  cellWithRuns,
  cellsAlign,
  commonStyle,
  editRunsText,
  noteStyleChanger,
  parseTableBody,
  restyleCells,
  setCellsAlign,
  stylesIn,
  tableAt,
  tidyCell,
  type CellRange,
  type NoteCell,
  type NoteChange,
  type NoteRun,
} from "./note-format";

describe("표 칸 글자 서식 (2026-10-19 Alan — 표 안에 정답을 진하게)", () => {
  /** Alan 이 보여 준 문제지 표 꼴 — 칸마다 문제 한 줄 + 보기 네 줄 */
  const Q80 = "80. According to the speaker, what is the company trying to do?\n(A) Implement a recycling program\n(B) Reduce electricity use\n(C) Apply for funding\n(D) Expand into global markets";
  const Q83 = "83. What is the purpose of the announcement?\n(A) To introduce a new employee\n(B) To announce a schedule change";
  const Q: NoteTable = { rows: [[{ text: Q80 }, { text: Q83 }]] };
  const at = (text: string, part: string) => ({ start: text.indexOf(part), end: text.indexOf(part) + part.length });
  /** 편집기와 같은 순서 — 고른 칸 글자들의 서식을 한 번에 세고 건다 */
  const toggle = (t: NoteTable, ranges: CellRange[], change: NoteChange) => restyleCells(t, ranges, noteStyleChanger(change, cellStylesIn(t, ranges)));
  const BOLD: NoteChange = { kind: "flag", flag: "bold" };
  const roundTrip = (t: NoteTable) => parseTableBody(tableToNote(t).slice("[table]".length, -"[/table]".length));

  it("칸 글자 일부를 굵게 → 칸 안에 [b] 태그로 저장되고 다시 읽으면 같다 · 글자는 그대로", () => {
    const answer = { row: 0, index: 0, ...at(Q80, "(B) Reduce electricity use") };
    const t = toggle(Q, [answer], BOLD);
    const cell = t.rows[0][0];
    expect(cell.text).toBe(Q80);
    expect(cell.runs).toEqual([
      { text: Q80.slice(0, answer.start), style: {} },
      { text: "(B) Reduce electricity use", style: { bold: true } },
      { text: Q80.slice(answer.end), style: {} },
    ]);
    expect(t.rows[0][1]).toEqual(Q.rows[0][1]); // 고르지 않은 칸은 그대로
    const note = tableToNote(t);
    expect(note).toContain("[b](B) Reduce electricity use[/b]");
    expect(roundTrip(t)).toEqual(t);
    // 글 한 편 안에서도 — 저장했다 다시 읽으면 한 글자도 다르지 않다
    const doc = parseDoc(`문제\n${note}\n끝`);
    expect(doc.runs[1].style.table).toEqual(t);
    expect(docToNote(doc)).toBe(`문제\n${note}\n끝`);
    // 한 번 더 누르면 풀린다 — 서식이 없는 칸은 예전 모양(글자뿐)으로 돌아간다
    const off = toggle(t, [answer], BOLD);
    expect(off).toEqual(Q);
    expect(tableToNote(off)).toBe(tableToNote(Q));
  });

  it("칸 여럿을 함께 골랐으면 한 번에 센다 — 하나만 굵었으면 다 굵게, 다 굵었으면 다 풀기", () => {
    const a = { row: 0, index: 0, ...at(Q80, "(B) Reduce electricity use") };
    const b = { row: 0, index: 1, ...at(Q83, "(B) To announce a schedule change") };
    const one = toggle(Q, [a], BOLD);
    const both = toggle(one, [a, b], BOLD);
    expect(cellStylesIn(both, [a, b]).every((s) => s.bold)).toBe(true);
    expect(commonStyle(cellStylesIn(both, [a, b]))).toEqual({ bold: true });
    expect(toggle(both, [a, b], BOLD)).toEqual(Q);
  });

  it("색 · 크기 · 형광펜 · 밑줄 · 기울임이 겹쳐도 · 칸 글자의 [ · \\ · 줄바꿈이 서식 안에 있어도 그대로 돌아온다", () => {
    const cell: NoteCell = cellWithRuns({ text: "" }, [
      { text: "정답 ", style: {} },
      { text: "[B]\\n\n둘째 줄", style: { bold: true, color: "red", size: "lg", mark: true, underline: true, italic: true } },
      { text: " [/td] [/table]", style: { color: "blue" } },
    ]);
    const t: NoteTable = { rows: [[cell, { text: "", head: true }]] };
    expect(roundTrip(t)).toEqual(t);
    expect(parseDoc(tableToNote(t)).runs).toEqual([tableRun(t)]);
    expect(noteImagePaths(tableToNote(t))).toEqual([]);
  });

  it("칸 안의 맨 [ 는 아는 서식 태그 · 짝이 맞는 것만 — 아니면 그 표는 글자 그대로 (모르는 태그와 같은 규칙)", () => {
    const bad = [
      "[table][tr][td][b]x[/td][/tr][/table]", // 닫지 않은 서식
      "[table][tr][td]x[/b][/td][/tr][/table]", // 짝 없는 닫기
      "[table][tr][td][color=purple]x[/color][/td][/tr][/table]", // 모르는 색
      "[table][tr][td][b=1]x[/b][/td][/tr][/table]", // 값이 붙은 굵게
      "[table][tr][td][center]x[/td][/tr][/table]", // 줄 정렬은 칸 안에 없다
      "[table][tr][td][img=images/a.png][/td][/tr][/table]", // 그림도
      "[table][tr][td][s]x[/s][/td][/tr][/table]", // 모르는 태그
    ];
    for (const s of bad) {
      expect(parseDoc(s).runs.every((r) => !r.style.table)).toBe(true);
      expect(runsText(parseDoc(s).runs)).toBe(s);
    }
    // 아는 것은 받는다 — 겹친 서식 · 거꾸로 닫기
    expect(parseTableBody("[tr][td][b][color=red]a[/b]b[/color][/td][/tr]")?.rows[0][0]).toEqual({
      text: "ab",
      runs: [
        { text: "a", style: { bold: true, color: "red" } },
        { text: "b", style: { color: "red" } },
      ],
    });
    // 서식 태그만 있고 글자가 없는 칸은 빈 칸
    expect(parseTableBody("[tr][td][b][/b][/td][/tr]")?.rows[0][0]).toEqual({ text: "" });
  });

  it("칸 조각 다듬기 — 아는 서식만 · 서식이 없으면 runs 를 두지 않는다 · 글자와 어긋난 runs 는 글자만 믿는다", () => {
    const messy = [
      { text: "a", style: { bold: true, img: { path: "images/x.png", w: 50 }, color: "purple" } },
      { text: "b", style: { bold: true } },
      { text: "", style: { italic: true } },
      { text: "c", style: { underline: false, mark: undefined } },
    ] as NoteRun[];
    expect(cellWithRuns({ text: "x", head: true }, messy)).toEqual({ text: "abc", head: true, runs: [{ text: "ab", style: { bold: true } }, { text: "c", style: {} }] });
    expect(cellWithRuns({ text: "x", runs: [{ text: "x", style: { bold: true } }] }, [{ text: "plain", style: {} }])).toEqual({ text: "plain" });
    expect(cellRuns({ text: "abc", runs: [{ text: "ab", style: { bold: true } }] })).toEqual([{ text: "abc", style: {} }]);
    expect(cellRuns({ text: "" })).toEqual([]);
  });

  it("밖에서 온 값(편집기 칸의 data-table · 붙여 넣기)의 칸 서식도 꼴을 다시 본다", () => {
    const ok = { rows: [[{ text: "정답 (B)", runs: [{ text: "정답 ", style: {} }, { text: "(B)", style: { bold: true } }] }]] };
    expect(asNoteTable(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
    // 아는 서식만 · 글자와 어긋나면 서식만 버리고 글자는 남긴다
    expect(asNoteTable({ rows: [[{ text: "ab", runs: [{ text: "a", style: { bold: "yes", color: "red", table: { rows: [] } } }, { text: "b", style: null }] }]] })).toEqual({
      rows: [[{ text: "ab", runs: [{ text: "a", style: { color: "red" } }, { text: "b", style: {} }] }]],
    });
    expect(asNoteTable({ rows: [[{ text: "ab", runs: [{ text: "zz", style: { bold: true } }] }]] })).toEqual({ rows: [[{ text: "ab" }]] });
    expect(asNoteTable({ rows: [[{ text: "ab", runs: "굵게" }]] })).toEqual({ rows: [[{ text: "ab" }]] });
    expect(asNoteTable({ rows: [[{ text: `a${OBJ}b`, runs: [{ text: `a${OBJ}`, style: { bold: true } }, { text: "b", style: {} }] }]] })).toEqual({
      rows: [[{ text: "ab", runs: [{ text: "a", style: { bold: true } }, { text: "b", style: {} }] }]],
    });
  });

  it("칸 정렬 — 모두 같을 때만 그 정렬 · 왼쪽은 표시 없음", () => {
    const ranges: CellRange[] = [
      { row: 0, index: 0, start: 0, end: 2 },
      { row: 0, index: 1, start: 0, end: 2 },
    ];
    expect(cellsAlign(Q, ranges)).toBe("left");
    const centered = setCellsAlign(Q, ranges, "center");
    expect(centered.rows[0].map((c) => c.align)).toEqual(["center", "center"]);
    expect(cellsAlign(centered, ranges)).toBe("center");
    expect(cellsAlign(setCellsAlign(centered, [ranges[0]], "right"), ranges)).toBeNull();
    expect(setCellsAlign(centered, ranges, "left")).toEqual(Q);
    expect(cellsAlign(Q, [{ row: 5, index: 0, start: 0, end: 1 }])).toBeNull();
  });

  it("글 속 표 찾기 (tableAt)", () => {
    const doc = parseDoc(`앞\n${tableToNote(Q)}\n뒤`);
    expect(tableAt(doc, 2)).toEqual(Q);
    expect(tableAt(doc, 0)).toBeNull();
    expect(tableAt(doc, 3)).toBeNull();
  });

  it("표 고치기에서 글자를 고쳐도 서식이 남는다 — 바뀐 자리의 새 글자는 그 자리 첫 글자(없으면 앞 글자)의 서식을 잇는다", () => {
    const runs: NoteRun[] = [
      { text: "(B) ", style: {} },
      { text: "Reduce", style: { bold: true } },
      { text: " use", style: {} },
    ];
    const show = (rs: NoteRun[]) => rs.map((r) => (r.style.bold ? `*${r.text}*` : r.text)).join("");
    expect(editRunsText(runs, "(B) Reduce use")).toBe(runs); // 그대로면 그대로
    expect(show(editRunsText(runs, "(B) RedXuce use"))).toBe("(B) *RedXuce* use"); // 굵은 낱말 안에 친 글자
    expect(show(editRunsText(runs, "(B) Reduced use"))).toBe("(B) *Reduced* use"); // 굵은 낱말 바로 뒤 — 앞 글자를 잇는다
    expect(show(editRunsText(runs, "(B) Cut use"))).toBe("(B) *Cut* use"); // 굵은 낱말을 바꿔 쳤다
    expect(show(editRunsText(runs, "(B)  use"))).toBe("(B)  use"); // 굵은 낱말을 지웠다
    expect(show(editRunsText(runs, "(C) Reduce use"))).toBe("(C) *Reduce* use"); // 앞의 다른 글자만 바꿨다
    expect(show(editRunsText(runs, "x(B) Reduce use"))).toBe("x(B) *Reduce* use"); // 맨 앞에 — 뒤 글자(서식 없음)를 잇는다
    expect(show(editRunsText(runs, ""))).toBe("");
    expect(runsText(editRunsText(runs, "전혀 다른 글"))).toBe("전혀 다른 글");
  });

  it("표 고치기의 적용 — 줄바꿈 · 덩어리 글자를 다듬고 앞뒤 빈칸을 걷어도 서식은 남는다", () => {
    const c = cellWithRuns({ text: "" }, [
      { text: " \r\n", style: {} },
      { text: `정답${OBJ}`, style: { bold: true } },
      { text: " (B)\n ", style: {} },
    ]);
    expect(tidyCell(c)).toEqual({ text: "정답 (B)", runs: [{ text: "정답", style: { bold: true } }, { text: " (B)", style: {} }] });
    expect(tidyCell({ text: "  그냥 글 " })).toEqual({ text: "그냥 글" });
  });

  it("고른 글자의 서식 · 공통 서식", () => {
    const runs: NoteRun[] = [
      { text: "ab", style: { bold: true, color: "red" } },
      { text: OBJ, style: { table: Q } },
      { text: "cd", style: { bold: true } },
    ];
    expect(stylesIn(runs, 0, 5)).toEqual([{ bold: true, color: "red" }, { bold: true }]);
    expect(commonStyle(stylesIn(runs, 0, 5))).toEqual({ bold: true });
    expect(commonStyle([])).toEqual({});
    // 고른 글자가 없으면 거는 쪽 (빈 목록이 '다 굵다' 로 읽히지 않게)
    expect(noteStyleChanger(BOLD, [])({})).toEqual({ bold: true });
  });
});

import { tableNear } from "./note-format";

describe("표에 닿은 선택 (2026-10-19 — 표 윗줄을 줄바꿈까지 지우다 표를 잃었다)", () => {
  // "Part 4\n[표]\n아래" — 표는 7번째 글자
  const runs = parseDoc(`Part 4\n${tableToNote({ rows: [[{ text: "A" }]] })}\n아래`).runs;
  it("표를 품었거나 표 바로 앞에서 끝나면 닿았다", () => {
    expect(tableNear(runs, 0, 7)).toBe(true); // 윗줄 + 줄바꿈 (세 번 눌러 고른 줄) — 바로 뒤가 표
    expect(tableNear(runs, 3, 7)).toBe(true);
    expect(tableNear(runs, 0, 9)).toBe(true); // 표를 품었다
    expect(tableNear(runs, 7, 8)).toBe(true); // 표만
  });
  it("표에서 떨어진 선택 · 표 바로 뒤에서 시작하는 선택은 아니다 (크롬이 제대로 한다)", () => {
    expect(tableNear(runs, 0, 6)).toBe(false); // 윗줄만 (줄바꿈 빼고)
    expect(tableNear(runs, 0, 4)).toBe(false);
    expect(tableNear(runs, 8, 10)).toBe(false); // 표 바로 뒤부터
    expect(tableNear(runs, 9, 11)).toBe(false); // 아랫줄
    expect(tableNear(parseDoc("가나다\n라마").runs, 0, 6)).toBe(false);
  });
});
