"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { charCount } from "@/lib/class-materials";
import {
  IMAGE_WIDTHS,
  NOTE_ALIGN_LABEL,
  NOTE_ALIGNS,
  NOTE_COLORS,
  NOTE_SIZES,
  NOTE_TABLE,
  NOTE_TABLE_WRAP,
  OBJ,
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  alignClassName,
  alignDoc,
  applyNoteChange,
  asNoteTable,
  cellClassName,
  docToNote,
  imageRun,
  lineOf,
  moveObject,
  normalizeRuns,
  objectStep,
  parseDoc,
  removeObject,
  replaceTable,
  resizeImage,
  runClassName,
  runsLength,
  runsText,
  spliceDoc,
  splitLines,
  styleAt,
  tableRun,
  tableSize,
  tableToNote,
  wordRangeAt,
  type NoteAlign,
  type NoteChange,
  type NoteColor,
  type NoteDoc,
  type NoteImage,
  type NoteRun,
  type NoteSize,
  type NoteStyle,
  type NoteTable,
  type ObjectPlace,
} from "@/lib/note-format";
import { tableClipboard } from "@/lib/note-copy";
import { pasteParts, type PastedTables } from "@/lib/note-paste";
import { isImageType, MB, objectName } from "@/lib/upload";
import { uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { TableEditDialog } from "./TableEditDialog";
import { AlignGlyph, ArrowGlyph, Divider, TableGlyph, Tool } from "./tools";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 그림을 넣을 수 있게 할 때 — 수업자료실 공지 · 비대면 자료 회차 안내 (2026-10-05) */
export type NoteEditorImages = {
  bucket: string;
  /** 저장소 폴더 (`images/`) — 글의 `[img=…]` 경로 규칙(소문자 · 숫자 · / . _ -)에 맞아야 한다 */
  folder: string;
  /** 이미 글에 든 그림의 서명 주소 (고칠 때) */
  urls: Record<string, string>;
  maxBytes?: number;
  maxCount?: number;
};

/**
 * 서식이 바로 보이는 글 편집기 — 수업자료실 안내(`NoteTextarea`) · 수업자료실 공지 · 비대면 자료 회차 안내가 함께 쓴다 (2026-10-05 Alan —
 * "색상, 크기, 진하게, 밑줄 등" → "강사화면에 코드로 보이고 … 바로 미리보기처럼 보여주면 좋겠어" → "워드에서 적용되는 방법" →
 * 공지 "이미지도 중간에 추가 … 블로그랑 같다고 생각하면" · "이미지 사이즈 조절" · "줄 단위로 왼쪽정렬, 가운데정렬, 오른쪽 정렬").
 *
 * - 칸은 `contentEditable` 이고 **줄마다 `<div>` 하나**(줄 정렬이 줄마다 다르다). 글자는 학생 화면과 같은 모양(`runClassName`)이다.
 *   저장 값은 꺾쇠 태그 글(`docToNote`)이고 폼은 숨은 textarea 의 `.value` 를 읽는다.
 * - 서식 · 정렬 · 그림은 **우리 글 모델로만** 바꾼다(`applyNoteChange` · `alignDoc` · `spliceDoc`) — 브라우저 `execCommand("bold")` 는 `<b>`·`<font>` 를 제멋대로 만든다.
 *   칸을 다시 그리는 것은 버튼 · Enter · 붙여 넣기 · 그림 때뿐이다 — **글자를 치는 동안 다시 그리면 한글 조합이 깨진다.**
 * - **워드처럼**: 같은 버튼을 다시 누르면 풀리고, 걸린 서식 · 정렬의 버튼은 눌린 모양(`styleAt`)이며, 커서만 두고 눌러도 그 단어 전체(`wordRangeAt`)에 건다.
 *   정렬은 커서가 있는 줄(고른 줄들) 단위다. Ctrl(⌘)+B · U · I 도 된다.
 * - 그림(`images` 를 줄 때만): `사진 넣기` → 브라우저가 저장소에 바로 올리고 커서 자리에 한 줄로 넣는다. 그림을 누르면 크기(25 · 50 · 75 · 100% · 밀어서 10~100%)와
 *   지우기가 뜬다. 붙여 넣은 그림 파일도 같은 길로 올린다. 올리는 동안은 `onUploadingChange(true)` — 폼은 그동안 저장을 막는다
 *   (그 사이에 저장하면 사진이 빠진 글이 저장되고, 다 올라간 사진은 어디에도 안 붙는다).
 * - 붙여 넣기는 글자만 받는다(다른 곳의 색 · 글꼴이 딸려 오지 않게). 버튼은 누르는 순간 칸의 선택을 빼앗지 않게 `pointerdown` 기본 동작을 막고,
 *   그래도 놓치는 휴대폰을 위해 마지막 선택을 기억해 둔다.
 * - **표**(2026-10-07 Alan — "안내사항에 이런표도 넣고싶어 … 다른 블로그에서 복사 붙여넣기로 했을때 표를 그대로 가져오는게 가능할까?" →
 *   같은 날 "표를 직접 만드는 것도 넣어주면 좋겠어") — `표 넣기` 로 만들거나(크기 → 셀 채우기 · 줄 · 칸 · 합치기 팝업, `TableEditDialog`),
 *   붙여 넣은 HTML 에 표가 있으면 표로 받는다(`note-paste.ts` — 합친 칸 · 칸 정렬 · 머리칸 · 칸 안 줄바꿈, 색 · 글꼴은 글자처럼 빠진다). 표는 그림처럼 한 줄에 하나 ·
 *   한 글자(`OBJ`)이고, 누르면 `표 고치기`(같은 팝업) · `표 지우기` 가 뜬다. 클립보드에 표 HTML 과 그림 파일이 함께 있으면(엑셀 · 워드가 표 그림을 같이 싣는다) 표가 먼저다.
 * - **표 옮기기 · 복사**(2026-10-19 Alan — "본문에 표를 삽입하려고 해서 위치 이동을 시킬려고 하니깐 위치이동이 안돼. 그리고 해당 표를 복사하려고해도 복사가 안돼") —
 *   누른 표에 `위로` · `아래로`(한 줄씩 — `objectStep` · `moveObject`) · `복사` · `잘라내기`, PC 는 표를 끌어 줄 사이에 놓는다(놓을 자리에 줄이 그어진다).
 *   표를 누르면 커서가 표 바로 뒤라 브라우저의 Ctrl+C 는 아무것도 복사하지 않았다 — 그 자리에서 누른 Ctrl(⌘)+C · X 는 편집기가 받아 표를 싣는다(`tableClipboard`).
 *   클립보드의 표는 우리 편집기 · 워드 · 엑셀에 표로 붙고, 우리 편집기에는 칸 글자 한 자까지 그대로 돌아온다(`data-note-table`). 잘라내기는 다 실은 뒤에야 지운다.
 */
export function NoteEditor({
  id,
  ref,
  defaultValue = "",
  disabled,
  placeholder,
  max,
  images,
  minHeight = "min-h-32",
  onUploadingChange,
}: {
  id: string;
  ref?: React.Ref<HTMLTextAreaElement>;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
  max: number;
  images?: NoteEditorImages;
  minHeight?: string;
  /** 사진을 올리는 중인지 — 폼이 저장 버튼을 막는 데 쓴다 */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const hidden = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => hidden.current as HTMLTextAreaElement);
  const editor = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastRange = useRef<[number, number] | null>(null);
  /** 끌고 있는 표의 자리 — 이 편집기 안에서 끌기를 시작했을 때만 (다른 편집기 · 다른 곳에서 온 끌기는 받지 않는다) */
  const dragFrom = useRef<number | null>(null);
  const urls = useRef<Record<string, string>>({ ...(images?.urls ?? {}) });
  const [value, setValue] = useState(defaultValue);
  const [hint, setHint] = useState<string | null>(null);
  const [active, setActive] = useState<NoteStyle>({});
  const [activeAlign, setActiveAlign] = useState<NoteAlign>("left");
  const [picked, setPicked] = useState<Picked | null>(null);
  /** 표 팝업 — `table` 이 있으면 누른 표 고치기, 없으면 새 표 만들기 */
  const [tableEdit, setTableEdit] = useState<{ table: NoteTable | null } | null>(null);
  // 팝업이 다시 그려질 때마다 닫기 함수가 바뀌면 팝업이 제목으로 포커스를 다시 가져간다 — 한 번만 만든다
  const closeTableEdit = useCallback(() => setTableEdit(null), []);
  const [uploading, setUploading] = useState(0);
  const uploadingRef = useRef(0);
  function trackUpload(delta: 1 | -1) {
    uploadingRef.current += delta;
    setUploading(uploadingRef.current);
    if ((delta === 1 && uploadingRef.current === 1) || (delta === -1 && uploadingRef.current === 0)) onUploadingChange?.(uploadingRef.current > 0);
  }
  const length = charCount(value);
  const over = length > max;

  function commit(doc: NoteDoc) {
    const note = docToNote(doc);
    if (hidden.current) hidden.current.value = note;
    setValue(note);
  }

  function repaint(doc: NoteDoc, selected: number | null = picked?.offset ?? null) {
    if (editor.current) paint(editor.current, doc, urls.current, selected);
  }

  // 처음 한 번 그린다 — 그 뒤로는 칸이 스스로 글자를 받는다
  useEffect(() => {
    const doc = parseDoc(defaultValue);
    if (editor.current) paint(editor.current, { runs: normalizeRuns(doc.runs), aligns: doc.aligns }, urls.current, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 칸 안의 선택을 기억해 둔다 — 버튼을 누를 때 선택이 풀리는 휴대폰 대비. 눌린 버튼 모양도 여기서 맞춘다
  useEffect(() => {
    const onSelect = () => {
      const el = editor.current;
      if (!el) return;
      const r = readSelection(el);
      if (!r) return;
      lastRange.current = r;
      const { doc } = scan(el);
      setActive(styleAt(doc.runs, r[0], r[1]));
      setActiveAlign(doc.aligns[lineOf(doc.runs, r[0])] ?? "left");
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, []);

  /** 지금 선택 (없으면 마지막 선택) */
  const range = () => (editor.current && readSelection(editor.current)) ?? lastRange.current;

  function change(c: NoteChange) {
    const el = editor.current;
    if (!el || disabled) return;
    const { doc } = scan(el);
    let r = range();
    let caret: number | null = null;
    // 커서만 있으면 그 단어 전체 (워드처럼) — 서식을 건 뒤 커서는 제자리로
    if (r && r[0] === r[1]) {
      caret = r[0];
      r = wordRangeAt(runsText(doc.runs), caret);
    }
    if (!r) {
      setHint("서식을 넣을 글자를 고르거나 단어 안에 커서를 두세요.");
      return;
    }
    setHint(null);
    const next = { runs: applyNoteChange(doc.runs, r[0], r[1], c), aligns: doc.aligns };
    repaint(next);
    el.focus();
    if (caret !== null) writeSelection(el, caret, caret);
    else writeSelection(el, r[0], r[1]);
    setActive(styleAt(next.runs, r[0], r[1]));
    commit(next);
  }

  function align(a: NoteAlign) {
    const el = editor.current;
    if (!el || disabled) return;
    const { doc } = scan(el);
    const r = range() ?? [0, 0];
    const next = alignDoc(doc, r[0], r[1], a);
    repaint(next);
    el.focus();
    writeSelection(el, r[0], r[1]);
    setActiveAlign(next.aligns[lineOf(next.runs, r[0])] ?? "left");
    commit(next);
  }

  function insert(text: string | NoteRun[], caretAfter?: number) {
    const el = editor.current;
    if (!el || disabled) return;
    const { doc } = scan(el);
    const r = range() ?? [Array.from(runsText(doc.runs)).length, Array.from(runsText(doc.runs)).length];
    const next = spliceDoc(doc, r[0], r[1], text);
    setPicked(null);
    repaint(next, null);
    el.focus();
    const caret = r[0] + (caretAfter ?? Array.from(typeof text === "string" ? text : runsText(text)).length);
    writeSelection(el, caret, caret);
    commit(next);
  }

  async function addImages(files: File[]) {
    if (!images || disabled || files.length === 0) return;
    const el = editor.current;
    if (!el) return;
    const maxBytes = images.maxBytes ?? 10 * MB;
    const maxCount = images.maxCount ?? 30;
    for (const file of files) {
      if (!isImageType(file.type)) {
        setHint(`${file.name}: 사진(jpg · png · webp · gif)만 넣을 수 있어요.`);
        continue;
      }
      if (file.size > maxBytes) {
        setHint(`${file.name}: 사진은 ${Math.round(maxBytes / MB)}MB 이하만 넣을 수 있어요.`);
        continue;
      }
      if (scan(el).doc.runs.filter((x) => x.style.img).length >= maxCount) {
        setHint(`사진은 한 글에 ${maxCount}장까지 넣을 수 있어요.`);
        break;
      }
      trackUpload(1);
      try {
        const up = await uploadFile(images.bucket, `${images.folder}${objectName(file)}`, file);
        urls.current[up.path] = URL.createObjectURL(file);
        // 사진은 한 줄에 하나 — 앞뒤에 줄을 바꿔 넣는다 (블로그처럼)
        const { doc } = scan(el);
        const text = Array.from(runsText(doc.runs));
        const r = range() ?? [text.length, text.length];
        const before = r[0] > 0 && text[r[0] - 1] !== "\n" ? [{ text: "\n", style: {} }] : [];
        const after = text[r[1]] === "\n" ? [] : [{ text: "\n", style: {} }];
        insert([...before, imageRun(up.path), ...after], before.length + 1 + after.length);
        setHint(null);
      } catch (err) {
        setHint(err instanceof Error ? err.message : "사진을 올리지 못했어요.");
      } finally {
        trackUpload(-1);
      }
    }
  }

  /**
   * 그림 · 표를 누르면 고르고 그 도구줄을 띄운다. 커서는 그 바로 뒤에 둔다 — 표 칸 글자를 누르면 브라우저가 커서를 고칠 수 없는 표 안에 두어,
   * 그대로 두면 치는 글자가 어디에도 안 들어가고 Ctrl+A 가 화면 전체를 고른다
   */
  function pickObj(node: HTMLElement) {
    const el = editor.current;
    if (!el || disabled) return;
    const s = scan(el);
    const e = s.entries.find((x) => x.node === node);
    if (!e) return;
    if (node.dataset.table !== undefined) {
      const table = readTable(node);
      if (!table) return;
      setPicked(tablePick(s.doc, e.start, table));
    } else {
      const img = readImg(node);
      if (!img) return;
      setPicked({ offset: e.start, kind: "img", img });
    }
    markPicked(el, node);
    el.focus({ preventScroll: true });
    writeSelection(el, e.start + 1, e.start + 1);
  }

  function resizePicked(w: number) {
    const el = editor.current;
    if (!el || picked?.kind !== "img") return;
    const next = resizeImage(scan(el).doc, picked.offset, w);
    const img = next.runs.find((_, i, all) => offsetOfRun(all, i) === picked.offset)?.style.img;
    repaint(next, picked.offset);
    if (img) setPicked({ offset: picked.offset, kind: "img", img });
    commit(next);
  }

  /** 표 고치기 팝업의 `적용` — 팝업이 화면을 덮고 있어 그동안 표 자리(offset)가 바뀌지 않는다 */
  function applyTable(table: NoteTable) {
    const el = editor.current;
    setTableEdit(null);
    if (!el || picked?.kind !== "table") return;
    const next = replaceTable(scan(el).doc, picked.offset, table);
    repaint(next, picked.offset);
    setPicked(tablePick(next, picked.offset, table));
    commit(next);
  }

  /** 표를 `to` 줄의 앞 · 뒤로 — 위로 · 아래로 버튼 · 끌어 놓기. 옮긴 표를 고른 채로 두어 이어서 누를 수 있다 */
  function moveObj(from: number, to: ObjectPlace) {
    const el = editor.current;
    if (!el || disabled) return;
    const moved = moveObject(scan(el).doc, from, to);
    const table = moved && runAt(moved.doc, moved.offset)?.style.table;
    if (!moved || !table) return;
    repaint(moved.doc, moved.offset);
    setPicked(tablePick(moved.doc, moved.offset, table));
    el.focus({ preventScroll: true });
    writeSelection(el, moved.offset + 1, moved.offset + 1);
    // 옮긴 표가 칸 밖으로 나갔으면 보이는 데까지만 굴린다
    const node = scan(el).entries.find((x) => x.kind === "obj" && x.start === moved.offset)?.node;
    if (node instanceof HTMLElement) node.scrollIntoView({ block: "nearest" });
    commit(moved.doc);
  }

  function moveStep(dir: "up" | "down") {
    const el = editor.current;
    if (!el || picked?.kind !== "table") return;
    const to = objectStep(scan(el).doc, picked.offset, dir);
    if (to) moveObj(picked.offset, to);
  }

  /**
   * 고른 표를 클립보드에 — `복사` · `잘라내기` 버튼, 표 바로 뒤 커서에서 누른 Ctrl(⌘)+C · X.
   * 잘라내기는 다 실은 뒤에야 지운다 (못 실었는데 지우면 표가 사라진다 — 이 편집기에는 되돌리기가 없다)
   */
  async function copyPicked(cut: boolean) {
    const el = editor.current;
    if (!el || picked?.kind !== "table") return;
    const { offset, table } = picked;
    if (!(await writeClipboard(tableClipboard(table)))) {
      setHint("이 브라우저에서는 표를 복사하지 못했어요. 위로 · 아래로 버튼으로 옮겨 주세요.");
      return;
    }
    const paste = "넣을 자리를 누르고 붙여 넣으세요 (Ctrl+V · 휴대폰은 길게 눌러 붙여넣기).";
    if (!cut) {
      setHint(`표를 복사했어요. ${paste}`);
      return;
    }
    // 싣는 동안 칸이 바뀌었으면(다른 표가 그 자리로 왔으면) 지우지 않는다
    const doc = scan(el).doc;
    const here = runAt(doc, offset)?.style.table;
    const next = here && tableToNote(here) === tableToNote(table) ? removeObject(doc, offset) : null;
    if (!next || disabled) return;
    setPicked(null);
    repaint(next.doc, null);
    el.focus({ preventScroll: true });
    writeSelection(el, next.offset, next.offset);
    commit(next.doc);
    setHint(`표를 잘라 냈어요. ${paste}`);
  }

  /**
   * 표(와 글자)를 커서 자리에 — 붙여 넣은 표 · 새로 만든 표. 표는 한 줄에 하나: 앞 글자가 줄 끝이 아니면 줄을 바꾸고, 뒤에도 줄을 바꿔 둔다 (사진 넣기와 같은 규칙).
   * 함께 고른 앞뒤 글은 서식 없는 글자로 들어간다. 팝업이 열려 있던 동안에는 칸의 선택이 팝업에 가 있어 마지막으로 기억한 커서 자리(`lastRange`)에 넣는다
   */
  function insertBlocks(parts: PastedTables["parts"]) {
    const el = editor.current;
    if (!el || disabled) return;
    const text = Array.from(runsText(scan(el).doc.runs));
    const r = range() ?? [text.length, text.length];
    const runs: NoteRun[] = [];
    let lineStart = r[0] === 0 || text[r[0] - 1] === "\n";
    for (const part of parts) {
      if (part.kind === "table") {
        if (!lineStart) runs.push({ text: "\n", style: {} });
        runs.push(tableRun(part.table), { text: "\n", style: {} });
        lineStart = true;
      } else {
        runs.push({ text: part.text, style: {} });
        lineStart = false;
      }
    }
    // 표로 끝나고 그 자리 뒤가 이미 줄 끝이면 줄을 또 바꾸지 않는다
    if (runs.at(-2)?.style.table && text[r[1]] === "\n") runs.pop();
    insert(runs, runsLength(runs));
  }

  /** 붙여 넣은 표 (`note-paste.ts`) */
  function insertPasted({ parts, truncated }: PastedTables) {
    if (!editor.current || disabled) return;
    insertBlocks(parts);
    setHint(
      truncated
        ? `표가 커서 앞 ${TABLE_MAX_ROWS}줄 · ${TABLE_MAX_COLS}칸까지만 넣었어요. 표를 누르면 옮기거나 고칠 수 있어요.`
        : "표를 붙여 넣었어요. 표를 누르면 옮기거나 고칠 수 있어요.",
    );
  }

  /** 표 만들기 팝업의 `표 넣기` */
  function insertNewTable(table: NoteTable) {
    setTableEdit(null);
    if (!editor.current || disabled) return;
    insertBlocks([{ kind: "table", table }]);
    setHint("표를 넣었어요. 표를 누르면 옮기거나 고칠 수 있어요.");
  }

  function removePicked() {
    const el = editor.current;
    if (!el || !picked) return;
    const next = spliceDoc(scan(el).doc, picked.offset, picked.offset + 1, "");
    setPicked(null);
    repaint(next, null);
    commit(next);
  }

  const pickedTable = picked?.kind === "table" ? { table: picked.table, size: tableSize(picked.table), up: picked.up, down: picked.down } : null;

  return (
    <>
      <textarea ref={hidden} defaultValue={defaultValue} hidden readOnly tabIndex={-1} aria-hidden />
      <div role="toolbar" aria-label="글자 서식" aria-controls={id} className="mb-1.5 flex flex-wrap items-center gap-1">
        <Tool label="굵게 (Ctrl+B)" on={!!active.bold} onUse={() => change({ kind: "flag", flag: "bold" })} disabled={disabled}>
          <span className="font-black">가</span>
        </Tool>
        <Tool label="밑줄 (Ctrl+U)" on={!!active.underline} onUse={() => change({ kind: "flag", flag: "underline" })} disabled={disabled}>
          <span className="underline underline-offset-2">가</span>
        </Tool>
        <Tool label="기울임 (Ctrl+I)" on={!!active.italic} onUse={() => change({ kind: "flag", flag: "italic" })} disabled={disabled}>
          <span className="italic">가</span>
        </Tool>
        <Tool label="형광펜" on={!!active.mark} onUse={() => change({ kind: "flag", flag: "mark" })} disabled={disabled}>
          <span className="rounded-sm bg-yellow-200 px-0.5 text-ink">가</span>
        </Tool>
        <Divider />
        {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
          <Tool key={c} label={`글자 색 ${NOTE_COLORS[c].label}`} on={active.color === c} onUse={() => change({ kind: "color", color: c })} disabled={disabled}>
            <span className={cn("block size-4 rounded-full", NOTE_COLORS[c].swatch)} />
          </Tool>
        ))}
        <Divider />
        {(Object.keys(NOTE_SIZES) as NoteSize[]).map((s) => (
          <Tool key={s} label={`글자 크기 ${NOTE_SIZES[s].label}`} on={active.size === s} onUse={() => change({ kind: "size", size: s })} disabled={disabled} wide>
            {NOTE_SIZES[s].label}
          </Tool>
        ))}
        <Tool label="고른 부분 서식 지우기" onUse={() => change({ kind: "clear" })} disabled={disabled} wide>
          서식 지우기
        </Tool>
        <Divider />
        {NOTE_ALIGNS.map((a) => (
          <Tool key={a} label={NOTE_ALIGN_LABEL[a]} on={activeAlign === a} onUse={() => align(a)} disabled={disabled}>
            <AlignGlyph align={a} />
          </Tool>
        ))}
        <Divider />
        {images && (
          <>
            <Tool label="사진 넣기" onUse={() => fileInput.current?.click()} disabled={disabled || uploading > 0} wide>
              <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current stroke-2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10" r="1.6" />
                  <path d="m4 18 5-5 4 4 3-3 4 4" strokeLinejoin="round" />
                </svg>
                {uploading > 0 ? "올리는 중…" : "사진 넣기"}
              </span>
            </Tool>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.currentTarget.files ?? [])];
                e.currentTarget.value = "";
                void addImages(files);
              }}
            />
          </>
        )}
        <Tool label="표 넣기" onUse={() => setTableEdit({ table: null })} disabled={disabled} wide>
          <span className="inline-flex items-center gap-1">
            <TableGlyph />
            표 넣기
          </span>
        </Tool>
      </div>

      {images && picked?.kind === "img" && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-2 text-xs">
          <span className="font-bold text-brand-700">사진 크기</span>
          {IMAGE_WIDTHS.map((w) => (
            <Tool key={w} label={`사진 너비 ${w}%`} on={picked.img.w === w} onUse={() => resizePicked(w)} wide>
              {w}%
            </Tool>
          ))}
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={picked.img.w}
            aria-label="사진 너비 (%)"
            onChange={(e) => resizePicked(Number(e.currentTarget.value))}
            className="h-8 min-w-24 flex-1 accent-brand-600"
          />
          <span className="w-9 text-right font-bold tabular-nums text-ink">{picked.img.w}%</span>
          <Tool label="사진 지우기" onUse={removePicked} wide>
            지우기
          </Tool>
        </div>
      )}

      {pickedTable && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-2 text-xs">
          <span className="font-bold text-brand-700">표</span>
          <span className="text-slate">
            {pickedTable.size.rows}줄 · {pickedTable.size.cols}칸
          </span>
          <span className="flex-1" />
          <Tool label="표를 한 줄 위로" onUse={() => moveStep("up")} disabled={!pickedTable.up} wide>
            <span className="inline-flex items-center gap-0.5">
              <ArrowGlyph dir="up" />
              위로
            </span>
          </Tool>
          <Tool label="표를 한 줄 아래로" onUse={() => moveStep("down")} disabled={!pickedTable.down} wide>
            <span className="inline-flex items-center gap-0.5">
              <ArrowGlyph dir="down" />
              아래로
            </span>
          </Tool>
          <Tool label="표 복사 (Ctrl+C)" onUse={() => void copyPicked(false)} wide>
            복사
          </Tool>
          <Tool label="표 잘라내기 (Ctrl+X) — 넣을 자리에서 붙여 넣으면 옮겨져요" onUse={() => void copyPicked(true)} wide>
            잘라내기
          </Tool>
          <Tool label="표 고치기 — 셀 글자 · 줄 · 칸 · 셀 합치기" onUse={() => setTableEdit({ table: pickedTable.table })} wide>
            표 고치기
          </Tool>
          <Tool label="표 지우기" onUse={removePicked} wide>
            표 지우기
          </Tool>
        </div>
      )}
      {tableEdit && <TableEditDialog table={tableEdit.table} onApply={tableEdit.table ? applyTable : insertNewTable} onClose={closeTableEdit} />}

      <div
        id={id}
        ref={editor}
        role="textbox"
        aria-multiline
        aria-invalid={over || undefined}
        aria-describedby={`${id}-count`}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-empty={value === "" || undefined}
        onInput={(e) => {
          commit(scan(e.currentTarget).doc);
          setPicked(null);
          setHint(null);
        }}
        onPointerDown={(e) => {
          // 표 끌기 (PC 마우스) — 누르는 동안만 끌 수 있게 한다. 늘 draggable 이면 크롬이 글을 골라 복사할 때 표를 통째로 뺀다 (실측 — 전체 선택 · 복사에 표가 없었다)
          if (e.pointerType !== "mouse" || e.button !== 0 || disabled) return;
          const wrap = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-table]") : null;
          if (!wrap || !e.currentTarget.contains(wrap)) return;
          wrap.draggable = true;
          // 끌지 않고 놓으면 바로 되돌린다 (칸 밖에서 놓아도). 끌었으면 onDragEnd · 놓은 뒤 다시 그리기가 되돌린다
          window.addEventListener("pointerup", () => (wrap.draggable = false), { capture: true, once: true });
        }}
        onClick={(e) => {
          const t = e.target;
          const obj = t instanceof Element ? t.closest<HTMLElement>("[data-img],[data-table]") : null;
          if (obj && e.currentTarget.contains(obj)) pickObj(obj);
          else if (picked) {
            setPicked(null);
            if (editor.current) markPicked(editor.current, null);
          }
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            insert("\n");
            return;
          }
          if (e.metaKey || e.ctrlKey) {
            const key = keyLetter(e);
            // 고른 표의 복사 · 잘라내기 — 커서가 그 표 바로 뒤(표를 누른 그대로)일 때만. 글자를 골랐으면 브라우저가 그 글자를 복사한다
            if ((key === "c" || key === "x") && !e.altKey && !e.shiftKey && picked?.kind === "table" && caretOnObj(e.currentTarget, picked.offset)) {
              e.preventDefault();
              void copyPicked(key === "x");
              return;
            }
            const flag = ({ b: "bold", u: "underline", i: "italic" } as const)[key as "b" | "u" | "i"];
            if (flag) {
              e.preventDefault();
              change({ kind: "flag", flag });
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          // 표가 먼저 — 엑셀 · 워드는 표 HTML 과 함께 표를 찍은 그림도 싣는다
          const html = e.clipboardData.getData("text/html");
          const pasted = html ? pasteParts(html) : null;
          if (pasted) {
            insertPasted(pasted);
            return;
          }
          const files = [...e.clipboardData.files].filter((f) => isImageType(f.type));
          if (images && files.length) {
            void addImages(files);
            return;
          }
          const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").replaceAll(OBJ, "");
          if (text) insert(text);
        }}
        onDragStart={(e) => {
          // 표 끌기 (PC) — 글자 끌기는 브라우저에 맡기고 놓기만 막는다 (예전과 같다)
          const el = e.currentTarget;
          const wrap = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-table]") : null;
          if (!wrap || !el.contains(wrap)) return;
          const entry = scan(el).entries.find((x) => x.node === wrap);
          if (disabled || !entry || !readTable(wrap)) {
            e.preventDefault();
            return;
          }
          dragFrom.current = entry.start;
          e.dataTransfer.effectAllowed = "move";
          // 우리만 아는 형식 — 다른 칸(제목 입력 등)에 놓아도 글자가 들어가지 않는다
          e.dataTransfer.setData(DRAG_TYPE, String(entry.start));
          // 여기서 표를 고르지 않는다 — 도구줄이 칸 위에 생기며 표가 아래로 밀리면, 브라우저는 끌던 표가 마우스 밑에서 사라졌다고 보고 끌기를 바로 멈춘다 (크롬 실측)
          wrap.classList.add(DRAGGING);
        }}
        onDragOver={(e) => {
          if (dragFrom.current === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          markDrop(e.currentTarget, dropSpot(e.currentTarget, e.clientY));
        }}
        onDragLeave={(e) => {
          if (dragFrom.current === null) return;
          const next = e.relatedTarget;
          if (!(next instanceof Node && e.currentTarget.contains(next))) markDrop(e.currentTarget, null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const el = e.currentTarget;
          if (dragFrom.current !== null) {
            const from = dragFrom.current;
            dragFrom.current = null;
            const spot = dropSpot(el, e.clientY);
            markDrop(el, null);
            if (spot) moveObj(from, placeOf(el, spot));
            return;
          }
          const files = [...e.dataTransfer.files].filter((f) => isImageType(f.type));
          if (images && files.length) void addImages(files);
        }}
        onDragEnd={(e) => {
          dragFrom.current = null;
          markDrop(e.currentTarget, null);
          e.currentTarget.querySelectorAll<HTMLElement>("[data-table]").forEach((n) => {
            n.classList.remove(DRAGGING);
            n.draggable = false;
          });
        }}
        className={cn(
          "input max-h-[70vh] resize-y overflow-y-auto !py-2 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-ink-soft",
          minHeight,
          "data-[empty]:before:pointer-events-none data-[empty]:before:text-mist data-[empty]:before:content-[attr(data-placeholder)]",
          disabled && "opacity-60",
          over && "!border-red-400 focus:!ring-red-100",
        )}
      />
      <p id={`${id}-count`} className={cn("mt-1 flex justify-between gap-2 text-[11px] tabular-nums", over ? "font-bold text-red-600" : "text-mist")}>
        <span className={cn(hint && "font-bold text-brand-700")}>
          {hint ??
            (images
              ? "글자를 고르거나 단어에 커서를 두고 누르면 바로 바뀌어요. 사진을 누르면 크기를 바꾸고, 표를 누르면 옮기기 · 복사 · 고치기가 나와요 (PC 는 표를 끌어서 옮겨도 돼요). 다른 곳의 표도 복사해 붙여 넣으면 돼요."
              : "글자를 고르거나 단어에 커서를 두고 누르면 바로 바뀌어요. 한 번 더 누르면 풀려요. 표를 누르면 옮기기 · 복사 · 고치기가 나와요 (PC 는 표를 끌어서 옮겨도 돼요). 다른 곳의 표도 복사해 붙여 넣으면 돼요.")}
        </span>
        <span className="shrink-0">
          {over && <>{fmt(length - max)}자를 줄여 주세요 · </>}
          {fmt(length)} / {fmt(max)}자
        </span>
      </p>
    </>
  );
}

/** 누른 그림 · 표 — 그 자리(offset)와 지금 값. 표는 위로 · 아래로 갈 데가 있는지도 (버튼을 잠근다) */
type Picked = { offset: number; kind: "img"; img: NoteImage } | { offset: number; kind: "table"; table: NoteTable; up: boolean; down: boolean };

const tablePick = (doc: NoteDoc, offset: number, table: NoteTable): Picked => ({
  offset,
  kind: "table",
  table,
  up: objectStep(doc, offset, "up") !== null,
  down: objectStep(doc, offset, "down") !== null,
});

/** `offset` 자리에서 시작하는 조각 */
function runAt(doc: NoteDoc, offset: number): NoteRun | null {
  let pos = 0;
  for (const r of doc.runs) {
    if (pos === offset) return r;
    pos += Array.from(r.text).length;
    if (pos > offset) return null;
  }
  return null;
}

/** 단축키 글자 — 한글 자판(ㅊ · ㅌ …)이어도 자리(KeyC)로 읽는다 */
const keyLetter = (e: React.KeyboardEvent) => (/^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : "");

/**
 * 클립보드에 HTML · 글을 함께 싣는다. copy 이벤트에 직접 싣는 길이 먼저다 — 누른 그 순간 안에서 바로 끝나고(동기),
 * 고른 글자가 없어도 스크립트의 copy 명령에는 이벤트가 온다 (크롬 실측. 사파리는 고른 글자가 없으면 copy 명령을 꺼 두는데,
 * beforecopy 를 막아 두면 켜진다 — 그래서 함께 단다). 그 길이 막힌 브라우저면 비동기 클립보드로 —
 * 이것도 같은 순간에 부른다 (기다린 뒤에 부르면 사파리가 막는다)
 */
async function writeClipboard({ html, text }: { html: string; text: string }): Promise<boolean> {
  let done = false;
  const onBeforeCopy = (e: Event) => e.preventDefault();
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
    e.stopPropagation();
    done = true;
  };
  document.addEventListener("beforecopy", onBeforeCopy, true);
  document.addEventListener("copy", onCopy, true);
  try {
    document.execCommand("copy");
  } catch {
    // 아래 길로
  } finally {
    document.removeEventListener("beforecopy", onBeforeCopy, true);
    document.removeEventListener("copy", onCopy, true);
  }
  if (done) return true;
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    return true;
  } catch {
    return false;
  }
}

function offsetOfRun(runs: NoteRun[], index: number) {
  let n = 0;
  for (let i = 0; i < index; i++) n += Array.from(runs[i].text).length;
  return n;
}

/* ── 칸(DOM) ↔ 글 모델 ── */

const SENTINEL = "sentinel";

function readImg(el: HTMLElement): NoteImage | null {
  try {
    const v = JSON.parse(el.dataset.img ?? "") as NoteImage;
    return typeof v.path === "string" && typeof v.w === "number" ? v : null;
  } catch {
    return null;
  }
}

function readTable(el: HTMLElement): NoteTable | null {
  try {
    return asNoteTable(JSON.parse(el.dataset.table ?? ""));
  } catch {
    return null;
  }
}

/** 표를 칸에 그린다 — 학생 화면(`NoteTableView`)과 같은 클래스. 칸 안 줄바꿈은 `<br>` (편집기에서 복사해 다시 붙여 넣어도 줄이 남게) */
function tableElement(t: NoteTable): HTMLTableElement {
  const table = document.createElement("table");
  table.className = NOTE_TABLE;
  // 저장 모양 — 글자와 함께 골라 복사해도(브라우저의 복사) 우리 편집기에 붙이면 칸 글자 한 자까지 그대로 돌아온다 (`note-paste.ts`)
  table.dataset.noteTable = tableToNote(t);
  const body = document.createElement("tbody");
  for (const row of t.rows) {
    const tr = document.createElement("tr");
    for (const c of row) {
      const cell = document.createElement(c.head ? "th" : "td");
      if (c.rowspan) cell.rowSpan = c.rowspan;
      if (c.colspan) cell.colSpan = c.colspan;
      cell.className = cellClassName(c);
      // 빈 셀은 <br> 하나로 한 줄 높이 (학생 화면과 같다 — 붙여 넣기는 이것을 빈 셀로 읽는다)
      if (c.text === "") cell.append(document.createElement("br"));
      c.text.split("\n").forEach((line, k) => {
        if (k > 0) cell.append(document.createElement("br"));
        if (line) cell.append(line);
      });
      tr.append(cell);
    }
    body.append(tr);
  }
  table.append(body);
  return table;
}

/** 누른 그림 · 표의 테두리 */
const PICKED = "outline outline-2 outline-offset-2 outline-brand-500";
const PICKED_CLASSES = PICKED.split(" ");

/** 줄마다 `<div>` — 서식은 data-note 로 적어 두어 다시 읽을 때 쓴다 (클래스는 보이는 모양만) */
function paint(root: HTMLElement, doc: NoteDoc, urls: Record<string, string>, selected: number | null) {
  root.replaceChildren();
  let pos = 0;
  splitLines(doc.runs).forEach((line, i) => {
    const div = document.createElement("div");
    const a = doc.aligns[i] ?? "left";
    div.dataset.align = a;
    div.className = cn(alignClassName(a), DROP_MARK);
    for (const r of line) {
      if (r.style.img) {
        const img = document.createElement("img");
        img.dataset.img = JSON.stringify(r.style.img);
        img.src = urls[r.style.img.path] ?? "";
        img.alt = "";
        img.draggable = false;
        img.contentEditable = "false";
        img.style.width = `${r.style.img.w}%`;
        img.className = cn("inline-block h-auto max-w-full cursor-pointer rounded-lg align-middle", pos === selected && PICKED);
        div.append(img);
      } else if (r.style.table) {
        // 그림처럼 줄 안의 한 덩어리(inline-block) — 줄 끝 받침 <br> 이 표 아래 빈 줄을 만들지 않게
        // 끌어서 옮긴다 (PC) — 누르면 고르고, 누른 채 끌면 줄 사이로. 끌 수 있게(draggable) 하는 것은 마우스를 누르는 동안만이다 (편집기의 onPointerDown)
        const wrap = document.createElement("div");
        wrap.dataset.table = JSON.stringify(r.style.table);
        wrap.contentEditable = "false";
        wrap.className = cn(NOTE_TABLE_WRAP, "inline-block w-full cursor-grab rounded-sm align-top active:cursor-grabbing", pos === selected && PICKED);
        wrap.append(tableElement(r.style.table));
        div.append(wrap);
      } else {
        const cls = runClassName(r.style);
        if (!cls) div.append(document.createTextNode(r.text));
        else {
          const span = document.createElement("span");
          span.className = cls;
          span.dataset.note = JSON.stringify(r.style);
          span.textContent = r.text;
          div.append(span);
        }
      }
      pos += Array.from(r.text).length;
    }
    pos += 1; // 줄바꿈
    // 빈 줄 · 그림 · 표로 끝나는 줄은 커서를 둘 자리가 있도록 받침 하나 (글자로 세지 않는다)
    if (line.length === 0 || line.at(-1)?.style.img || line.at(-1)?.style.table) {
      const br = document.createElement("br");
      br.dataset[SENTINEL] = "1";
      div.append(br);
    }
    root.append(div);
  });
}

function markPicked(root: HTMLElement, node: HTMLElement | null) {
  root.querySelectorAll("[data-img],[data-table]").forEach((el) => el.classList.remove(...PICKED_CLASSES));
  node?.classList.add(...PICKED_CLASSES);
}

/* ── 표 끌어 놓기 (2026-10-19) ── */

/** 끌기 데이터 형식 — 우리 편집기만 읽는다 */
const DRAG_TYPE = "application/x-winnertoeic-note-table";
/** 끌고 있는 표 */
const DRAGGING = "opacity-40";
/** 놓을 자리 — 그 줄의 위 · 아래 끝에 그어지는 줄 (관리자 모드는 파랑, 학생 모드는 분홍 — 브랜드 토큰) */
const DROP_MARK = "data-[drop=before]:shadow-[inset_0_3px_0_var(--color-brand-500)] data-[drop=after]:shadow-[inset_0_-3px_0_var(--color-brand-500)]";

type DropSpot = { node: HTMLElement; place: "before" | "after" };

/** 끌어 놓을 자리 — 마우스가 있는 줄과, 그 줄의 위 · 아래 절반 중 어디인가 (줄 가운데에 놓아도 줄을 가르지 않는다) */
function dropSpot(root: HTMLElement, y: number): DropSpot | null {
  const lines = [...root.children].filter((c): c is HTMLElement => c instanceof HTMLElement && isBlock(c));
  for (const node of lines) {
    const r = node.getBoundingClientRect();
    if (y < r.bottom) return { node, place: y < r.top + r.height / 2 ? "before" : "after" };
  }
  const last = lines.at(-1);
  return last ? { node: last, place: "after" } : null;
}

function markDrop(root: HTMLElement, spot: DropSpot | null) {
  root.querySelectorAll<HTMLElement>("[data-drop]").forEach((n) => {
    if (n !== spot?.node) delete n.dataset.drop;
  });
  if (spot && spot.node.dataset.drop !== spot.place) spot.node.dataset.drop = spot.place;
}

/** 놓을 줄의 글 모델 줄 번호 */
function placeOf(root: HTMLElement, spot: DropSpot): ObjectPlace {
  const { doc, entries } = scan(root);
  return { line: lineOf(doc.runs, offsetAt(entries, spot.node, 0)), place: spot.place };
}

/** 커서가 `offset` 표 바로 뒤에 있거나 그 표만 골랐나 — 표를 누른 그대로인가 */
function caretOnObj(root: HTMLElement, offset: number) {
  const r = readSelection(root);
  return !!r && ((r[0] === r[1] && r[0] === offset + 1) || (r[0] === offset && r[1] === offset + 1));
}

function styleOfNode(node: Node, root: HTMLElement): NoteStyle {
  let style: NoteStyle = {};
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (el.dataset.note) {
      try {
        style = { ...(JSON.parse(el.dataset.note) as NoteStyle), ...style };
      } catch {}
    }
  }
  return style;
}

const isBlock = (n: Node) => n instanceof HTMLElement && /^(DIV|P|LI|H[1-6])$/.test(n.tagName);
const asAlign = (v: string | undefined): NoteAlign | null => (v === "center" || v === "right" || v === "left" ? v : null);

/** 칸을 훑은 자리 — 글자 · 그림이나 표(한 글자) · 줄바꿈 */
type Entry = { kind: "text"; node: Text; start: number; len: number } | { kind: "obj"; node: HTMLElement; start: number } | { kind: "nl"; node: Node; start: number; block: boolean };
const entryLen = (e: Entry) => (e.kind === "text" ? e.len : 1);

/**
 * 칸을 차례로 훑어 글 모델로 — 줄 `<div>` 사이 · `<br>` 은 줄바꿈, 그림 · 표는 한 글자.
 * 브라우저가 지우기 · 합치기로 만든 모양(줄 밖 글자, 채움 `<br>`)도 같은 글로 읽는다. entries 는 선택 자리를 셀 때 쓴다
 */
function scan(root: HTMLElement): { doc: NoteDoc; entries: Entry[] } {
  const runs: NoteRun[] = [];
  const aligns: NoteAlign[] = ["left"];
  const entries: Entry[] = [];
  let count = 0;
  let started = false;
  const newline = (node: Node, block: boolean, a: NoteAlign) => {
    entries.push({ kind: "nl", node, start: count, block });
    runs.push({ text: "\n", style: {} });
    aligns.push(a);
    count += 1;
  };
  const rec = (node: Node, a: NoteAlign) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node as Text).data;
      if (!t) return;
      started = true;
      const len = Array.from(t).length;
      entries.push({ kind: "text", node: node as Text, start: count, len });
      runs.push({ text: t, style: styleOfNode(node, root) });
      count += len;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node instanceof HTMLImageElement) {
      const img = readImg(node);
      if (!img) return;
      started = true;
      entries.push({ kind: "obj", node, start: count });
      runs.push({ text: OBJ, style: { img } });
      count += 1;
      return;
    }
    // 표 — 한 글자. 안의 칸 글자는 편집기 글이 아니다 (들어가 훑지 않는다). 블록(div)이라도 줄바꿈이 아니다
    if (node.dataset.table !== undefined) {
      const table = readTable(node);
      if (!table) return;
      started = true;
      entries.push({ kind: "obj", node, start: count });
      runs.push(tableRun(table));
      count += 1;
      return;
    }
    if (node instanceof HTMLBRElement) {
      // 받침 · 줄 끝의 채움 <br>(브라우저가 빈 줄을 세우려고 넣는다)은 줄바꿈이 아니다
      if (!node.dataset[SENTINEL] && node.nextSibling) newline(node, false, a);
      return;
    }
    let here = a;
    if (node !== root && isBlock(node)) {
      here = asAlign(node.dataset.align) ?? a;
      if (started) newline(node, true, here);
      else aligns[0] = here;
      started = true;
    }
    node.childNodes.forEach((c) => rec(c, here));
  };
  rec(root, "left");
  return { doc: { runs: normalizeRuns(runs), aligns }, entries };
}

/** 선택 끝점(node, offset) → 글자 자리 */
function offsetAt(entries: Entry[], container: Node, offset: number): number {
  if (container.nodeType === Node.TEXT_NODE) {
    const e = entries.find((x) => x.node === container);
    if (e) return e.start + Array.from((container as Text).data.slice(0, offset)).length;
  }
  const boundary = container.nodeType === Node.TEXT_NODE ? container : (container.childNodes[offset] ?? null);
  let n = 0;
  for (const e of entries) {
    let before: boolean;
    if (boundary) {
      before = e.node !== boundary && (e.node.compareDocumentPosition(boundary) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    } else {
      const cmp = e.node.compareDocumentPosition(container);
      before = e.node === container || container.contains(e.node) || ((cmp & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && (cmp & Node.DOCUMENT_POSITION_CONTAINS) === 0);
    }
    if (!before) break;
    n = e.start + entryLen(e);
  }
  return n;
}

function readSelection(root: HTMLElement): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const { entries } = scan(root);
  const a = offsetAt(entries, r.startContainer, r.startOffset);
  const b = offsetAt(entries, r.endContainer, r.endOffset);
  return [Math.min(a, b), Math.max(a, b)];
}

const indexIn = (n: Node) => Array.prototype.indexOf.call(n.parentNode?.childNodes ?? [], n) as number;

/** 다시 그린 칸에 선택을 되살린다 */
function writeSelection(root: HTMLElement, start: number, end: number) {
  const { entries } = scan(root);
  const point = (target: number): [Node, number] => {
    for (const e of entries) {
      if (e.kind === "text" && target >= e.start && target <= e.start + e.len) return [e.node, Array.from(e.node.data).slice(0, target - e.start).join("").length];
      if (e.kind === "obj" && target === e.start) return [e.node.parentNode!, indexIn(e.node)];
      if (e.kind === "obj" && target === e.start + 1) return [e.node.parentNode!, indexIn(e.node) + 1];
      if (e.kind === "nl" && target === e.start + 1) return e.block ? [e.node, 0] : [e.node.parentNode!, indexIn(e.node) + 1];
    }
    // 빈 첫 줄 · 끝
    if (target === 0) return [root.firstChild ?? root, 0];
    const last = root.lastChild;
    if (last instanceof HTMLElement && isBlock(last)) {
      const n = last.childNodes.length;
      return [last, last.lastChild instanceof HTMLBRElement && last.lastChild.dataset[SENTINEL] ? n - 1 : n];
    }
    return [root, root.childNodes.length];
  };
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const [sn, so] = point(start);
  const [en, eo] = point(end);
  range.setStart(sn, so);
  range.setEnd(en, eo);
  sel.removeAllRanges();
  sel.addRange(range);
}
