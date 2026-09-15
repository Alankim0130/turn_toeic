"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { submitVerification } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function sanitizeName(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return `receipt${ext.replace(/[^a-z0-9.]/g, "")}`;
}

export function VerifyForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // 미리보기 object URL 정리 (언마운트 시)
  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function setPreviewFor(f: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    previewRef.current = url;
    setPreview(url);
  }

  function pick(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      setPreviewFor(null);
      return;
    }
    if (!ACCEPT.includes(f.type)) return setError("JPG, PNG, WEBP 이미지 또는 PDF 파일만 올릴 수 있어요.");
    if (f.size > MAX_BYTES) return setError("파일 크기는 10MB 이하여야 해요.");
    setFile(f);
    setPreviewFor(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("수강증 파일을 선택해 주세요.");
    if (!agree) return setError("개인정보 수집·이용에 동의해 주세요.");

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다. 다시 로그인해 주세요.");

      const path = `${user.id}/${Date.now()}-${sanitizeName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error("업로드에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.");

      startTransition(async () => {
        const res = await submitVerification({ filePath: path });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDone(true);
        setFile(null);
        setPreviewFor(null);
        if (inputRef.current) inputRef.current.value = "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <Alert kind="success" title="접수됐어요. 확인 후 자동으로 등업됩니다.">
        보통 1일 이내 처리돼요. 개강일 전에 올리셨다면 예비등록생으로 표시되고, 개강일에 수강생으로 자동 전환됩니다.
      </Alert>
    );
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <Alert kind="warning">{error}</Alert>}

      {/* 파일 */}
      <div>
        <span className="label">수강증 파일</span>
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed p-6 text-center transition",
            file ? "border-brand-300 bg-brand-50" : "border-line bg-paper hover:border-brand-300 hover:bg-brand-50/50",
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="선택한 수강증 미리보기" className="max-h-72 w-auto rounded-xl object-contain" />
          ) : (
            <Icon name="upload" size={44} />
          )}
          <span className="text-sm font-bold text-ink">
            {file ? file.name : "여기를 눌러 수강증 사진 또는 PDF 선택"}
          </span>
          <span className="text-xs text-mist">JPG · PNG · WEBP · PDF, 10MB 이하. 글자가 잘 보이게 찍어 주세요.</span>
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-brand-500" disabled={busy} />
        <span>수강 확인을 위해 수강증 이미지·이름·영수증번호를 수집·이용하는 데 동의합니다. 원본은 인증이 끝나면 삭제됩니다.</span>
      </label>

      <button type="submit" disabled={busy || !file} className="btn-primary w-full sm:w-auto" aria-busy={busy}>
        {uploading ? "업로드 중…" : pending ? "접수 중…" : "등업신청 접수"}
      </button>
    </form>
  );
}
