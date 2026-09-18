"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import {
  enrollBlocks,
  enrollCourses,
  enrollTerms,
  enrollTracks,
  TRACK_CHOICE_LABEL,
  type EnrollSection,
  type EnrollTrack,
} from "@/lib/enroll-options";
import { submitManualVerification, submitVerification } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function sanitizeName(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return `receipt${ext.replace(/[^a-z0-9.]/g, "")}`;
}

/** 고르는 줄 — 알약 버튼. 고른 것만 분홍으로 찬다 */
function ChoiceRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
  empty,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  empty: string;
}) {
  return (
    <div>
      <span className="label">
        {label} <span className="font-normal text-brand-600">*</span>
      </span>
      {options.length === 0 ? (
        <p className="text-sm text-mist">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={disabled}
              aria-pressed={value === o.key}
              onClick={() => onChange(o.key)}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-bold transition disabled:opacity-50",
                value === o.key
                  ? "border-brand-400 bg-brand-500 text-white shadow-pink"
                  : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 등업신청 — 수강증만 올리는 기본 길과, 반을 직접 골라 내는 **수동 등업신청** 두 갈래 (2026-09-17 Alan 요청).
 *
 * 자동 판정이 바로 거절하면 이유를 보여 주고 **그 자리에서 수동으로 넘어갈 수 있게** 한다 —
 * 잘못 거절당한 학생이 되돌아갈 길이 없으면 안 된다. 올린 파일은 그대로 두고 반만 더 고른다.
 */
export function VerifyForm({ sections }: { sections: EnrollSection[] }) {
  const [manual, setManual] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** 이미 저장소에 올라간 경로 — 거절 뒤 수동으로 낼 때 다시 올리지 않는다 */
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [done, setDone] = useState<null | "auto" | "manual">(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // 고른 것 (수동)
  const terms = useMemo(() => enrollTerms(sections), [sections]);
  const [term, setTerm] = useState<string | null>(terms.length === 1 ? terms[0].key : null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [track, setTrack] = useState<EnrollTrack | null>(null);
  const [block, setBlock] = useState<string | null>(null);

  const courses = useMemo(() => (term ? enrollCourses(sections, term) : []), [sections, term]);
  const tracks = useMemo(() => (term && courseId ? enrollTracks(sections, term, courseId) : []), [sections, term, courseId]);
  const blocks = useMemo(
    () => (term && courseId && track ? enrollBlocks(sections, term, courseId, track) : []),
    [sections, term, courseId, track],
  );

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
    // 파일을 바꾸면 이미 올려 둔 경로는 버린다 — 옛 파일로 접수되면 안 된다
    setUploadedPath(null);
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

  /** 한 번만 올린다. 이미 올렸으면 그 경로를 그대로 쓴다 */
  async function ensureUploaded(): Promise<string> {
    if (uploadedPath) return uploadedPath;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("로그인이 필요합니다. 다시 로그인해 주세요.");
    const path = `${user.id}/${Date.now()}-${sanitizeName(file!.name)}`;
    const { error: upErr } = await supabase.storage.from("receipts").upload(path, file!, { contentType: file!.type, upsert: false });
    if (upErr) throw new Error("업로드에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.");
    setUploadedPath(path);
    return path;
  }

  const missing = manual
    ? !file
      ? "수강증 파일을 선택해 주세요."
      : !term
        ? "수강월을 골라 주세요."
        : !courseId
          ? "레벨을 골라 주세요."
          : !track
            ? "요일을 골라 주세요."
            : !block
              ? "시간대를 골라 주세요."
              : !agree
                ? "개인정보 수집·이용에 동의해 주세요."
                : null
    : !file
      ? "수강증 파일을 선택해 주세요."
      : !agree
        ? "개인정보 수집·이용에 동의해 주세요."
        : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRejected(null);
    // 하나라도 빠지면 제출하지 않는다 (2026-09-17 Alan)
    if (missing) return setError(missing);

    setUploading(true);
    try {
      const path = await ensureUploaded();
      startTransition(async () => {
        const res = manual
          ? await submitManualVerification({ filePath: path, term: term!, courseId: courseId!, track: track!, timeBlock: block! })
          : await submitVerification({ filePath: path });

        if (res.ok) {
          setDone(manual ? "manual" : "auto");
          return;
        }
        if ("rejected" in res) {
          // 바로 거절 — 이유를 보여 주고 수동 등업신청으로 갈 수 있게 한다
          setRejected(res.reason);
          return;
        }
        setError(res.error);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <Alert kind="success" title="접수됐어요. 확인 후 등업됩니다.">
        {done === "manual"
          ? "고르신 반으로 신청이 접수됐어요. 강사가 수강증을 확인한 뒤 배정해 드립니다."
          : "보통 1일 이내 처리돼요."}{" "}
        개강일 전에 올리셨다면 예비등록생으로 표시되고, 개강일에 수강생으로 자동 전환됩니다.
      </Alert>
    );
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <Alert kind="warning">{error}</Alert>}

      {rejected && (
        <Alert kind="warning" title="등업신청이 반려됐어요">
          <span className="block">{rejected}</span>
          <span className="mt-2 block">
            잘못 판정된 것 같다면 <b>수동 등업신청</b>으로 반을 직접 골라 내실 수 있어요. 강사가 수강증을 보고 확인해 드립니다.
          </span>
          <button
            type="button"
            onClick={() => {
              setManual(true);
              setRejected(null);
            }}
            className="btn-primary mt-3 !py-2 text-sm"
          >
            수동 등업신청으로 내기
          </button>
        </Alert>
      )}

      {/* 두 갈래 */}
      <div className="flex flex-wrap gap-2">
        {([false, true] as const).map((m) => (
          <button
            key={String(m)}
            type="button"
            aria-pressed={manual === m}
            onClick={() => {
              setManual(m);
              setError(null);
              setRejected(null);
            }}
            className={cn(
              "rounded-full border px-3.5 py-2 text-sm font-bold transition",
              manual === m ? "border-brand-400 bg-brand-500 text-white shadow-pink" : "border-line bg-paper text-ink-soft hover:border-brand-300",
            )}
          >
            {m ? "수동 등업신청" : "수강증만 올리기"}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-mist">
        {manual
          ? "듣는 반을 직접 골라서 냅니다. 자동 확인이 틀렸을 때 쓰세요."
          : "수강증만 올리면 강사가 확인해 반을 배정합니다."}
      </p>

      {/* 파일 */}
      <div>
        <span className="label">
          수강증 파일 <span className="font-normal text-brand-600">*</span>
        </span>
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
          <span className="text-sm font-bold text-ink">{file ? file.name : "여기를 눌러 수강증 사진 또는 PDF 선택"}</span>
          <span className="text-xs text-mist">JPG · PNG · WEBP · PDF, 10MB 이하. 글자가 잘 보이게 찍어 주세요.</span>
        </label>
      </div>

      {/* 수동: 레벨 · 요일 · 시간대 (수강월은 두 달 이상 열려 있을 때만 고른다) */}
      {manual && (
        <div className="space-y-4 rounded-xl2 border border-brand-200 bg-brand-50/40 p-4">
          {sections.length === 0 ? (
            <p className="text-sm text-slate">지금은 등업신청을 받는 반이 없어요. 개강 안내를 기다려 주세요.</p>
          ) : (
            <>
              {terms.length > 1 && (
                <ChoiceRow
                  label="수강월"
                  options={terms.map((t) => ({ key: t.key, label: t.label }))}
                  value={term}
                  disabled={busy}
                  empty="열린 달이 없어요."
                  onChange={(v) => {
                    setTerm(v);
                    setCourseId(null);
                    setTrack(null);
                    setBlock(null);
                  }}
                />
              )}
              <ChoiceRow
                label="레벨"
                options={courses.map((c) => ({ key: c.id, label: c.name }))}
                value={courseId}
                disabled={busy || !term}
                empty={term ? "이 달에 열린 강좌가 없어요." : "먼저 수강월을 골라 주세요."}
                onChange={(v) => {
                  setCourseId(v);
                  setTrack(null);
                  setBlock(null);
                }}
              />
              <ChoiceRow
                label="요일"
                options={tracks.map((t) => ({ key: t, label: TRACK_CHOICE_LABEL[t] }))}
                value={track}
                disabled={busy || !courseId}
                empty="먼저 레벨을 골라 주세요."
                onChange={(v) => {
                  setTrack(v);
                  setBlock(null);
                }}
              />
              <ChoiceRow
                label="시간대"
                options={blocks.map((b) => ({ key: b, label: b }))}
                value={block}
                disabled={busy || !track}
                empty="먼저 요일을 골라 주세요."
                onChange={setBlock}
              />
            </>
          )}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-brand-500" disabled={busy} />
        <span>수강 확인을 위해 수강증 이미지·이름을 수집·이용하는 데 동의합니다. 원본은 인증이 끝나면 삭제됩니다.</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !!missing} className="btn-primary w-full sm:w-auto" aria-busy={busy}>
          {uploading ? "업로드 중…" : pending ? "접수 중…" : manual ? "수동 등업신청 접수" : "등업신청 접수"}
        </button>
        {missing && <span className="text-xs text-mist">{missing}</span>}
      </div>
    </form>
  );
}
