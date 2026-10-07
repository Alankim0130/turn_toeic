"use client";

import { createClient } from "@/lib/supabase/client";
import { contentTypeOf, type UploadedFile } from "./upload";

/**
 * 브라우저 → Supabase Storage 직접 업로드. 권한은 storage 정책이 확인한다.
 *
 * **저장소에 적히는 형식은 파일에 붙은 형식이다** — storage-js 는 File 을 multipart 로 보내고 `contentType` 옵션은
 * File 이 아닌 본문에만 쓴다 (2026-10-07 숙제 음성 파일을 열며 확인). 그래서 브라우저가 형식을 비워 준 파일
 * (hwp · 일부 휴대폰의 녹음 파일)은 `application/octet-stream` 으로 올라가 형식을 제한한 버킷(숙제 · 수강증 · LC 음원)이 튕겼다.
 * 우리가 정한 형식(`type` — 기본은 확장자로 채운 `contentTypeOf`)이 파일의 형식과 다르면 그 형식을 붙인 새 File 로 감싸 보낸다
 * (데이터를 복사하지 않는다).
 */
export async function uploadFile(bucket: string, path: string, file: File, type: string = contentTypeOf(file)): Promise<UploadedFile> {
  const body = file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
  const { error } = await createClient().storage.from(bucket).upload(path, body, { contentType: type, upsert: false });
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
