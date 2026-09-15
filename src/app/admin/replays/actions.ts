"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

export type ReplayState = { ok?: boolean; error?: string; message?: string; value?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function validUrl(url: string) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol);
  } catch {
    return false;
  }
}

function rlsMessage(code?: string, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (code === "42501") return "권한이 없어요. 본인 반의 회차만 등록할 수 있습니다.";
  return fallback;
}

function revalidate(sectionId?: number) {
  revalidatePath("/admin/replays");
  if (sectionId) revalidatePath(`/admin/sections/${sectionId}`);
  revalidatePath("/my/replay");
}

export async function addReplay(_prev: ReplayState, formData: FormData): Promise<ReplayState> {
  await requireStaff();
  const sessionDateId = Number(str(formData, "session_date_id"));
  const sectionId = Number(str(formData, "section_id")) || undefined;
  const url = str(formData, "video_url");
  if (!Number.isInteger(sessionDateId)) return { error: "잘못된 요청이에요." };
  if (!validUrl(url)) return { error: "http(s):// 로 시작하는 영상 주소를 입력해 주세요.", value: url };

  const supabase = await createClient();
  const { data, error } = await supabase.from("replays").insert({ session_date_id: sessionDateId, video_url: url }).select("id");
  if (error) return { error: rlsMessage(error.code), value: url };
  if (!data || data.length === 0) return { error: "권한이 없어요.", value: url };

  revalidate(sectionId);
  return { ok: true, message: "다시보기를 등록했어요." };
}

export async function updateReplay(_prev: ReplayState, formData: FormData): Promise<ReplayState> {
  await requireStaff();
  const id = Number(str(formData, "id"));
  const sectionId = Number(str(formData, "section_id")) || undefined;
  const url = str(formData, "video_url");
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };
  if (!validUrl(url)) return { error: "http(s):// 로 시작하는 영상 주소를 입력해 주세요.", value: url };

  const supabase = await createClient();
  const { data, error } = await supabase.from("replays").update({ video_url: url }).eq("id", id).select("id");
  if (error) return { error: rlsMessage(error.code), value: url };
  if (!data || data.length === 0) return { error: "권한이 없거나 항목을 찾을 수 없어요.", value: url };

  revalidate(sectionId);
  return { ok: true, message: "다시보기 주소를 수정했어요." };
}

export async function deleteReplay(id: number, sectionId?: number): Promise<ReplayState> {
  await requireStaff();
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("replays").delete().eq("id", id).select("id");
  if (error) return { error: rlsMessage(error.code, "삭제하지 못했어요.") };
  if (!data || data.length === 0) return { error: "권한이 없거나 항목을 찾을 수 없어요." };

  revalidate(sectionId);
  return { ok: true, message: "다시보기를 삭제했어요." };
}
