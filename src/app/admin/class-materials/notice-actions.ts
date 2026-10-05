"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CLASS_NOTICE_BUCKET, noticeError } from "@/lib/class-notices";
import { noteImagePaths } from "@/lib/note-format";

export type NoticeResult = { ok: boolean; error?: string; id?: number };

function revalidateNotices(id?: number) {
  revalidatePath("/admin/class-materials");
  revalidatePath("/my/materials");
  if (id) revalidatePath(`/my/materials/notices/${id}`);
}

/**
 * 수업자료실 공지 저장 (2026-10-05 Alan — "1회차 앞에 공지사항 … 여러개" · 범위 "전체공지인지, 레벨별이라면 레벨을 선택, RC LC도 선택").
 * 강사·관리자만 — 로그인한 사람의 세션으로 써서 RLS(`class_notices: 스태프 …`)가 한 번 더 막는다.
 * 사진은 브라우저가 먼저 저장소(`class-notices/images/…`)에 올렸고, 여기서는 글만 저장한다. 고치면서 **빠진 사진은 저장소에서 지운다.**
 * 작성자 이름은 처음 올린 사람 그대로 둔다 (학생은 profiles 를 못 읽어 이름을 박아 둔다).
 */
export async function saveClassNotice(input: { id?: number | null; title: string; body: string; levels: number[]; subjects: string[] }): Promise<NoticeResult> {
  const { user, profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 공지를 올리거나 고칠 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };

  const supabase = await createClient();
  const { data: levelRows } = await supabase.from("lc_levels").select("level");
  const levels = [...new Set((input.levels ?? []).map(Number))].sort((a, b) => a - b);
  const subjects = [...new Set(input.subjects ?? [])];
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const err = noticeError({ title, body, levels, subjects }, (levelRows ?? []).map((l) => l.level));
  if (err) return { ok: false, error: err };
  // 둘 다 고르면 "둘 다" 와 같다 — 비워 둔다 (범위 이름이 깔끔하다)
  const subj = subjects.length >= 2 ? [] : subjects;

  if (!input.id) {
    const { data, error } = await supabase
      .from("class_notices")
      .insert({ title, body, levels, subjects: subj, author_id: user.id, author_name: (profile.name || "강사").slice(0, 40) })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.code === "42501" ? "권한이 없어요. 강사·관리자 계정으로 다시 로그인해 주세요." : "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
    revalidateNotices(data.id);
    return { ok: true, id: data.id };
  }

  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const { data: old } = await supabase.from("class_notices").select("body").eq("id", id).maybeSingle();
  if (!old) return { ok: false, error: "공지를 찾을 수 없어요. 새로고침해 주세요." };
  const { data, error } = await supabase
    .from("class_notices")
    .update({ title, body, levels, subjects: subj, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { ok: false, error: "공지를 찾을 수 없어요. 새로고침해 주세요." };

  const kept = new Set(noteImagePaths(body));
  const gone = noteImagePaths(old.body).filter((p) => !kept.has(p));
  if (gone.length) await supabase.storage.from(CLASS_NOTICE_BUCKET).remove(gone);
  revalidateNotices(id);
  return { ok: true, id };
}

/** 공지 삭제 — 글과 사진을 함께 지운다. 학생 화면에서도 바로 빠진다 */
export async function deleteClassNotice(id: number): Promise<NoticeResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 지울 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("class_notices").delete().eq("id", id).select("body");
  if (error) return { ok: false, error: "삭제하지 못했어요." };
  if (!data?.length) return { ok: false, error: "공지를 찾을 수 없어요. 새로고침해 주세요." };
  const paths = data.flatMap((d) => noteImagePaths(d.body));
  if (paths.length) await supabase.storage.from(CLASS_NOTICE_BUCKET).remove(paths);
  revalidateNotices(id);
  return { ok: true };
}
