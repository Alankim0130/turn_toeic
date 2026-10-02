"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { removeMyAvatar, setMyAvatar, type AvatarState } from "./actions";
import { ProfilePhoto } from "@/components/layout/ProfilePhoto";
import { Alert } from "@/components/ui/Alert";
import { uploadFile } from "@/lib/upload-client";
import { AVATAR_BUCKET, AVATAR_MAX_BYTES } from "@/lib/avatar";

/**
 * 프로필 사진 올리기·지우기 (2026-10-02 Alan). 사진은 브라우저가 버킷에 바로 올리고(서버 액션 본문 한도 때문), 서버 액션은 경로만 적는다.
 * 올린 사진이 없으면 카카오·구글 사진이 보인다 — 그 사진을 지우려면 그쪽에서 바꿔야 한다고 알려 준다.
 *
 * 경로는 숨은 input 에 넣고 폼을 보내지 않는다 — state 가 DOM 에 반영되기 전에 `requestSubmit()` 이 돌아 빈 경로가 서버로 갔다.
 * 올린 결과로 FormData 를 직접 만들어 액션을 부른다.
 */
export function AvatarEditor({ uid, photo, uploaded, social }: { uid: string; photo: string | null; uploaded: boolean; social: boolean }) {
  const [state, action, saving] = useActionState<AvatarState, FormData>(setMyAvatar, {});
  const [removeState, setRemoveState] = useState<AvatarState>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemove] = useTransition();
  const [, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = state.error || state.message ? state : removeState;
  const busy = uploading || saving;

  async function onPick(file: File | null) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("사진 파일만 올릴 수 있어요.");
    if (file.size > AVATAR_MAX_BYTES) return setError("5MB 이하 사진만 올릴 수 있어요.");
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const up = await uploadFile(AVATAR_BUCKET, `${uid}/${Date.now()}.${ext}`, file);
      setPreview(URL.createObjectURL(file));
      const fd = new FormData();
      fd.set("path", up.path);
      startSave(() => action(fd));
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <ProfilePhoto src={preview ?? photo} size={96} />
      <div className="min-w-0 flex-1 space-y-3">
        {error && <Alert kind="warning">{error}</Alert>}
        {shown.error && <Alert kind="warning">{shown.error}</Alert>}
        {shown.message && <Alert kind="success">{shown.message}</Alert>}
        <p className="text-sm text-slate">
          {uploaded
            ? "직접 올린 사진이에요."
            : social
              ? "카카오·구글 계정의 사진이 보이고 있어요. 다른 사진을 올리면 그 사진이 대신 보여요."
              : "아직 사진이 없어요. 선생님이 명단에서 얼굴을 알아보기 쉽도록 올려 주세요."}
        </p>
        <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-primary !py-2 text-sm disabled:opacity-60">
            {busy ? "올리는 중…" : uploaded ? "사진 바꾸기" : "사진 올리기"}
          </button>
          {uploaded && (
            <button
              type="button"
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  setRemoveState(await removeMyAvatar());
                  setPreview(null);
                })
              }
              className="btn-secondary !py-2 text-sm disabled:opacity-60"
            >
              {removing ? "지우는 중…" : "사진 지우기"}
            </button>
          )}
        </div>
        <p className="text-xs text-mist">5MB 이하 사진. 올린 사진은 본인과 선생님(명단)만 봅니다.</p>
      </div>
    </div>
  );
}
