"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { homeworkFolder, isSubject, levelsOfDay, MAX_PHOTO_MB, MAX_PHOTOS, MAX_QUESTION } from "@/lib/homework";
import { isSafeObjectPath, MB, type UploadedFile } from "@/lib/upload";

export type HomeworkResult = { ok: boolean; error?: string; id?: number };

const BUCKET = "homework";

function revalidateHomework() {
  revalidatePath("/my/homework", "layout"); // 1·2·3단계 전부
  revalidatePath("/admin/homework");
  revalidatePath("/admin");
}

/**
 * 브라우저가 homework/{내 id}/{레벨}-{과목}/ 에 올린 사진을 제출 1건으로 등록한다.
 * 지금 수강 중인지는 RLS(private.has_term_access)가 확인한다.
 *
 * `classDate` 는 학생이 달력에서 고른 **수업 날짜**다 (2026-09-19 Alan). 화면이 보낸 값을 믿지 않고
 * **그 날 내 반이 정말 있는지, 그 반의 레벨이 맞는지** 서버가 다시 본다.
 *
 * **레벨까지 다시 본다** (2026-09-23 Alan — 숙제제출에 "750, 850반이 전부 다 나와"). 반은
 * `my_section_ids()` 로 좁힌다 — `session_dates` 의 RLS 는 스태프에게 모든 반을 내려 주고,
 * 화면만 고치면 열어 둔 옛 화면이나 손으로 만든 요청이 남의 레벨로 그대로 들어온다.
 */
export async function submitHomework(input: {
  level: number;
  subject: string;
  classDate: string;
  question: string;
  files: UploadedFile[];
}): Promise<HomeworkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const level = Number(input.level);
  const subject = String(input.subject ?? "");
  const classDate = String(input.classDate ?? "").trim();
  const question = String(input.question ?? "").trim();
  const files = Array.isArray(input.files) ? input.files : [];
  if (!Number.isInteger(level) || !isSubject(subject)) return { ok: false, error: "레벨과 과목을 다시 골라 주세요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) return { ok: false, error: "수업 날짜를 달력에서 골라 주세요." };
  if (files.length === 0 || files.length > MAX_PHOTOS) return { ok: false, error: `사진은 1~${MAX_PHOTOS}장 올릴 수 있어요.` };
  if (question.length > MAX_QUESTION) return { ok: false, error: `질문은 ${MAX_QUESTION}자 이내로 적어 주세요.` };

  // 내 수업일이 맞는지 + 그 날 내 반의 레벨이 맞는지 — 판정은 화면과 같은 `levelsOfDay` 한곳이다
  const { data: sectionIds, error: idsError } = await supabase.rpc("my_section_ids");
  let dayQuery = supabase.from("session_dates").select("section:class_sections(course:courses(target_score, includes_levels))").eq("date", classDate);
  // 조회가 실패하면 예전처럼 RLS 가 주는 대로 본다 — 근거 없이 막으면 진짜 학생이 숙제를 못 낸다
  if (!idsError && sectionIds) dayQuery = dayQuery.in("section_id", sectionIds);
  const { data: sessionsOfDay } = await dayQuery;
  if (!sessionsOfDay?.length) return { ok: false, error: "그 날짜에는 내 수업이 없어요. 달력에서 다시 골라 주세요." };

  const allowed = levelsOfDay(sessionsOfDay.map((r) => r.section?.course ?? null));
  // 강좌를 못 읽었으면(집합이 비면) 레벨로 막지 않는다 — 날짜 검사는 이미 통과했다
  if (allowed.length > 0 && !allowed.includes(level)) {
    return { ok: false, error: "그 날 내 수업 레벨이 아니에요. 달력에서 다시 골라 주세요." };
  }

  const folder = homeworkFolder(user.id, level, subject);
  const prefix = `${folder}/`;
  for (const f of files) {
    if (!isSafeObjectPath(f.path, prefix) || f.path.slice(prefix.length).includes("/")) return { ok: false, error: "파일 경로가 올바르지 않아요." };
    if (!f.type?.startsWith("image/")) return { ok: false, error: "사진 파일만 올릴 수 있어요." };
    if (!(f.size > 0 && f.size <= MAX_PHOTO_MB * MB)) return { ok: false, error: `사진은 ${MAX_PHOTO_MB}MB 이하만 올릴 수 있어요.` };
  }

  // 실제로 올라간 파일인지 확인 (폴더에 예전 제출 사진이 쌓이므로 이름으로 찾는다)
  const found = await Promise.all(
    files.map(async (f) => {
      const name = f.path.slice(prefix.length);
      const { data } = await supabase.storage.from(BUCKET).list(folder, { search: name, limit: 5 });
      return (data ?? []).some((o) => o.name === name);
    }),
  );
  if (found.some((ok) => !ok)) return { ok: false, error: "올린 사진을 찾을 수 없어요. 다시 시도해 주세요." };

  const { data: created, error } = await supabase
    .from("homework_submissions")
    .insert({ user_id: user.id, level, subject, class_date: classDate, question: question || null })
    .select("id")
    .single();
  if (error || !created) {
    return {
      ok: false,
      error:
        error?.code === "42501"
          ? "지금은 숙제를 올릴 수 없어요. 수강 기간(개강일~종강일)인지 확인해 주세요."
          : error?.code === "23503"
            ? "없는 레벨이에요. 처음부터 다시 골라 주세요."
            : "제출하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  const { error: filesError } = await supabase.from("homework_files").insert(
    files.map((f) => ({ submission_id: created.id, file_path: f.path, file_name: String(f.name).slice(0, 200), file_size: f.size, content_type: f.type })),
  );
  if (filesError) {
    await supabase.from("homework_submissions").delete().eq("id", created.id);
    return { ok: false, error: "제출하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidateHomework();
  return { ok: true, id: created.id };
}

/** 점검 전 제출 취소. 사진 파일도 함께 지운다 (점검이 끝난 제출은 RLS 가 삭제를 막는다) */
export async function deleteHomeworkSubmission(id: number): Promise<HomeworkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const { data: files } = await supabase.from("homework_files").select("file_path").eq("submission_id", id);
  const { data: deleted, error } = await supabase.from("homework_submissions").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: "취소하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!deleted?.length) return { ok: false, error: "점검이 끝난 숙제는 취소할 수 없어요." };
  if (files?.length) await supabase.storage.from(BUCKET).remove(files.map((f) => f.file_path));

  revalidateHomework();
  return { ok: true };
}
