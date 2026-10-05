"use client";

import { CLASS_MATERIAL_NOTE_MAX } from "@/lib/class-materials";
import { NoteEditor } from "@/components/note/NoteEditor";

/**
 * 수업자료실 안내 · 스크립트 입력칸 — 올리기 · 수정이 함께 쓴다 (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해").
 * 글자 수를 늘 보여 주고 5만 자(`CLASS_MATERIAL_NOTE_MAX`)를 넘으면 빨갛게 알린다. **잘라 넣지 않는다** — 붙여 넣은 스크립트의 뒤가 소리 없이 잘리면
 * 학생이 끝이 빠진 스크립트를 받는다. 넘친 채로는 폼이 저장하지 않는다(`noteTooLong` — 서버 액션도 같은 말로 다시 본다).
 * 편집기는 공지와 같은 `NoteEditor` 다 — 서식 · 줄 정렬이 바로 보인다. 안내에는 사진을 넣지 않는다 (사진은 공지에서).
 */
export function NoteTextarea(props: { id: string; ref?: React.Ref<HTMLTextAreaElement>; defaultValue?: string; disabled?: boolean; placeholder?: string }) {
  return <NoteEditor {...props} max={CLASS_MATERIAL_NOTE_MAX} />;
}
