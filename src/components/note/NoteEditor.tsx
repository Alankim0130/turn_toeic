"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { charCount } from "@/lib/class-materials";
import {
  IMAGE_WIDTHS,
  NOTE_ALIGN_LABEL,
  NOTE_ALIGNS,
  NOTE_COLORS,
  NOTE_SIZES,
  OBJ,
  alignClassName,
  alignDoc,
  applyNoteChange,
  docToNote,
  imageRun,
  lineOf,
  normalizeRuns,
  parseDoc,
  resizeImage,
  runClassName,
  runsText,
  spliceDoc,
  splitLines,
  styleAt,
  wordRangeAt,
  type NoteAlign,
  type NoteChange,
  type NoteColor,
  type NoteDoc,
  type NoteImage,
  type NoteRun,
  type NoteSize,
  type NoteStyle,
} from "@/lib/note-format";
import { isImageType, MB, objectName } from "@/lib/upload";
import { uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 그림을 넣을 수 있게 할 때 — 수업자료실 공지 (2026-10-05) */
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
 * 서식이 바로 보이는 글 편집기 — 수업자료실 안내(`NoteTextarea`)와 수업자료실 공지가 함께 쓴다 (2026-10-05 Alan —
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
 *   지우기가 뜬다. 붙여 넣은 그림 파일도 같은 길로 올린다.
 * - 붙여 넣기는 글자만 받는다(다른 곳의 색 · 글꼴이 딸려 오지 않게). 버튼은 누르는 순간 칸의 선택을 빼앗지 않게 `pointerdown` 기본 동작을 막고,
 *   그래도 놓치는 휴대폰을 위해 마지막 선택을 기억해 둔다.
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
}: {
  id: string;
  ref?: React.Ref<HTMLTextAreaElement>;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
  max: number;
  images?: NoteEditorImages;
  minHeight?: string;
}) {
  const hidden = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => hidden.current as HTMLTextAreaElement);
  const editor = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastRange = useRef<[number, number] | null>(null);
  const urls = useRef<Record<string, string>>({ ...(images?.urls ?? {}) });
  const [value, setValue] = useState(defaultValue);
  const [hint, setHint] = useState<string | null>(null);
  const [active, setActive] = useState<NoteStyle>({});
  const [activeAlign, setActiveAlign] = useState<NoteAlign>("left");
  const [picked, setPicked] = useState<{ offset: number; img: NoteImage } | null>(null);
  const [uploading, setUploading] = useState(0);
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
      setUploading((n) => n + 1);
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
        setUploading((n) => n - 1);
      }
    }
  }

  function pickImage(img: HTMLImageElement) {
    const el = editor.current;
    if (!el || disabled) return;
    const { entries } = scan(el);
    const e = entries.find((x) => x.node === img);
    const data = readImg(img);
    if (!e || !data) return;
    setPicked({ offset: e.start, img: data });
    markPicked(el, img);
  }

  function resizePicked(w: number) {
    const el = editor.current;
    if (!el || !picked) return;
    const next = resizeImage(scan(el).doc, picked.offset, w);
    const img = next.runs.find((_, i, all) => offsetOfRun(all, i) === picked.offset)?.style.img;
    repaint(next, picked.offset);
    if (img) setPicked({ offset: picked.offset, img });
    commit(next);
  }

  function removePicked() {
    const el = editor.current;
    if (!el || !picked) return;
    const next = spliceDoc(scan(el).doc, picked.offset, picked.offset + 1, "");
    setPicked(null);
    repaint(next, null);
    commit(next);
  }

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
        {images && (
          <>
            <Divider />
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
      </div>

      {images && picked && (
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
        onClick={(e) => {
          const t = e.target;
          if (t instanceof HTMLImageElement && t.dataset.img) pickImage(t);
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
            const flag = ({ b: "bold", u: "underline", i: "italic" } as const)[e.key.toLowerCase() as "b" | "u" | "i"];
            if (flag) {
              e.preventDefault();
              change({ kind: "flag", flag });
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const files = [...e.clipboardData.files].filter((f) => isImageType(f.type));
          if (images && files.length) {
            void addImages(files);
            return;
          }
          const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").replaceAll(OBJ, "");
          if (text) insert(text);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const files = [...e.dataTransfer.files].filter((f) => isImageType(f.type));
          if (images && files.length) void addImages(files);
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
          {hint ?? (images ? "글자를 고르거나 단어에 커서를 두고 누르면 바로 바뀌어요. 사진을 누르면 크기를 바꿔요." : "글자를 고르거나 단어에 커서를 두고 누르면 바로 바뀌어요. 한 번 더 누르면 풀려요.")}
        </span>
        <span className="shrink-0">
          {over && <>{fmt(length - max)}자를 줄여 주세요 · </>}
          {fmt(length)} / {fmt(max)}자
        </span>
      </p>
    </>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />;

function AlignGlyph({ align }: { align: NoteAlign }) {
  const rows: [number, number][] = align === "left" ? [[4, 20], [4, 14], [4, 18]] : align === "center" ? [[4, 20], [7, 17], [5, 19]] : [[4, 20], [10, 20], [6, 20]];
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current stroke-2">
      {rows.map(([x1, x2], i) => (
        <path key={i} d={`M${x1} ${7 + i * 5}H${x2}`} strokeLinecap="round" />
      ))}
    </svg>
  );
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

/** 줄마다 `<div>` — 서식은 data-note 로 적어 두어 다시 읽을 때 쓴다 (클래스는 보이는 모양만) */
function paint(root: HTMLElement, doc: NoteDoc, urls: Record<string, string>, selected: number | null) {
  root.replaceChildren();
  let pos = 0;
  splitLines(doc.runs).forEach((line, i) => {
    const div = document.createElement("div");
    const a = doc.aligns[i] ?? "left";
    div.dataset.align = a;
    div.className = alignClassName(a);
    for (const r of line) {
      if (r.style.img) {
        const img = document.createElement("img");
        img.dataset.img = JSON.stringify(r.style.img);
        img.src = urls[r.style.img.path] ?? "";
        img.alt = "";
        img.draggable = false;
        img.contentEditable = "false";
        img.style.width = `${r.style.img.w}%`;
        img.className = cn("inline-block h-auto max-w-full cursor-pointer rounded-lg align-middle", pos === selected && "outline outline-2 outline-offset-2 outline-brand-500");
        div.append(img);
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
    // 빈 줄 · 그림으로 끝나는 줄은 커서를 둘 자리가 있도록 받침 하나 (글자로 세지 않는다)
    if (line.length === 0 || line.at(-1)?.style.img) {
      const br = document.createElement("br");
      br.dataset[SENTINEL] = "1";
      div.append(br);
    }
    root.append(div);
  });
}

function markPicked(root: HTMLElement, img: HTMLImageElement | null) {
  root.querySelectorAll("img[data-img]").forEach((el) => el.classList.remove("outline", "outline-2", "outline-offset-2", "outline-brand-500"));
  img?.classList.add("outline", "outline-2", "outline-offset-2", "outline-brand-500");
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

type Entry = { kind: "text"; node: Text; start: number; len: number } | { kind: "img"; node: HTMLElement; start: number } | { kind: "nl"; node: Node; start: number; block: boolean };
const entryLen = (e: Entry) => (e.kind === "text" ? e.len : 1);

/**
 * 칸을 차례로 훑어 글 모델로 — 줄 `<div>` 사이 · `<br>` 은 줄바꿈, 그림은 한 글자.
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
      entries.push({ kind: "img", node, start: count });
      runs.push({ text: OBJ, style: { img } });
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
      if (e.kind === "img" && target === e.start) return [e.node.parentNode!, indexIn(e.node)];
      if (e.kind === "img" && target === e.start + 1) return [e.node.parentNode!, indexIn(e.node) + 1];
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

function Tool({
  label,
  on = false,
  onUse,
  disabled,
  wide,
  children,
}: {
  label: string;
  on?: boolean;
  onUse: () => void;
  disabled?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onUse}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-lg border text-sm text-ink transition disabled:opacity-50",
        on ? "border-brand-600 bg-brand-100 ring-2 ring-brand-500" : "border-line bg-white hover:border-brand-300 hover:bg-brand-50",
        wide ? "px-2 text-xs font-bold" : "w-8",
      )}
    >
      {children}
    </button>
  );
}
