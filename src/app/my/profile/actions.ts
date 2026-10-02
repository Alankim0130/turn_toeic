"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AVATAR_BUCKET, isOwnAvatarPath } from "@/lib/avatar";

export type AvatarState = { error?: string; message?: string };

/**
 * 프로필 사진 (2026-10-02 Alan — "학생 개인이 프로필 사진을 설정할 수 있도록").
 * 파일은 브라우저가 버킷 `avatars` 의 본인 폴더에 바로 올리고(storage 정책), 여기서는 경로만 `profiles.avatar_path` 에 적는다.
 * 세션으로 UPDATE 한다 — 정책 "profiles: 본인·스태프·조교 수정" 이 본인 행만 허락한다. 바꾸면 옛 파일은 지운다.
 */
export async function setMyAvatar(_prev: AvatarState, formData: FormData): Promise<AvatarState> {
  const path = formData.get("path");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (!isOwnAvatarPath(path, user.id)) return { error: "사진 경로가 올바르지 않아요. 다시 올려 주세요." };

  const admin = createAdminClient();
  // 실제로 올라간 파일인지 확인한다 (화면이 보낸 경로를 믿지 않는다)
  const fileName = path.slice(user.id.length + 1);
  const { data: listed } = await admin.storage.from(AVATAR_BUCKET).list(user.id, { search: fileName, limit: 5 });
  if (!listed?.some((f) => f.name === fileName)) return { error: "올라간 사진을 찾지 못했어요. 다시 올려 주세요." };

  const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  const { data: saved, error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", user.id).select("id");
  if (error || !saved?.length) return { error: "사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };

  if (before?.avatar_path && before.avatar_path !== path) await admin.storage.from(AVATAR_BUCKET).remove([before.avatar_path]);
  revalidatePath("/my", "layout");
  revalidatePath("/admin/students", "layout");
  return { message: "프로필 사진을 바꿨어요." };
}

export async function removeMyAvatar(): Promise<AvatarState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: before } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", user.id);
  if (error) return { error: "사진을 지우지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (before?.avatar_path) await createAdminClient().storage.from(AVATAR_BUCKET).remove([before.avatar_path]);
  revalidatePath("/my", "layout");
  revalidatePath("/admin/students", "layout");
  return { message: "프로필 사진을 지웠어요." };
}
