"use client";

import { createClient } from "@/lib/supabase/client";
import { contentTypeOf, type UploadedFile } from "./upload";

/** 브라우저 → Supabase Storage 직접 업로드. 권한은 storage 정책이 확인한다 */
export async function uploadFile(bucket: string, path: string, file: File): Promise<UploadedFile> {
  const type = contentTypeOf(file);
  const { error } = await createClient().storage.from(bucket).upload(path, file, { contentType: type, upsert: false });
  if (error) {
    const tooBig = /size|large|exceed/i.test(error.message);
    const badType = /mime|type/i.test(error.message);
    throw new Error(
      tooBig ? `${file.name}: 파일이 너무 커요.` : badType ? `${file.name}: 올릴 수 없는 파일 형식이에요.` : `${file.name}: 업로드에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.`,
    );
  }
  return { path, name: file.name, size: file.size, type };
}

/** 서버 등록에 실패했을 때 방금 올린 파일 정리 (실패해도 무시) */
export async function removeUploaded(bucket: string, paths: string[]) {
  if (paths.length === 0) return;
  try {
    await createClient().storage.from(bucket).remove(paths);
  } catch {
    // 고아 파일은 저장소에 남지만 화면·권한에는 영향 없음
  }
}
