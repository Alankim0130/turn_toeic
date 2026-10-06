"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import {
  enrollBlockMinutes,
  enrollBlocks,
  enrollCourses,
  enrollKinds,
  enrollTerms,
  enrollTracks,
  KIND_CHOICE_LABEL,
  TRACK_CHOICE_LABEL,
  type EnrollKind,
  type EnrollSection,
  type EnrollTrack,
} from "@/lib/enroll-options";
import { submitManualVerification, submitVerification } from "./actions";
import { RETENTION_LABEL } from "@/lib/receipt-retention";
import type { NameMismatch } from "@/lib/name-mismatch";
import type { TextbookNotice } from "@/lib/textbook";
import { TextbookNoticeCard } from "@/components/my/TextbookNoticeCard";

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
  hint,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  empty: string;
  /** 줄 위의 한 줄 도움말 (회색) */
  hint?: string;
}) {
  return (
    <div>
      <span className="label">
        {label} <span className="font-normal text-brand-600">*</span>
      </span>
      {hint && <p className="-mt-1 mb-2 text-xs text-slate">{hint}</p>}
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
/** 이름 불일치 안내에서 내 정보로 보내는 주소 — 수강증에서 읽은 이름을 칸에 미리 넣어 준다 (2026-10-02 Alan "수정의 기회") */
const fixNameHref = (m: NameMismatch) => `/my/profile?name=${encodeURIComponent(m.receiptName)}`;

/**
 * @param canRename 등업 전이라 본인이 이름을 고칠 수 있다 (`can_rename_self`). 그러면 이름 불일치 안내가 "내 정보에서 고치기" 로 보낸다
 */
export function VerifyForm({ sections, canRename = false }: { sections: EnrollSection[]; canRename?: boolean }) {
  const [manual, setManual] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** 이미 저장소에 올라간 경로 — 거절 뒤 수동으로 낼 때 다시 올리지 않는다 */
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  // already = 이미 승인된 수강증을 또 올렸다 (2026-10-02) — 접수하지 않고 안내만 한다
  const [done, setDone] = useState<null | "auto" | "manual" | "approved" | "preliminary" | "held" | "already">(null);
  /** 자동으로 못 읽어 강사 검토로 갔을 때의 한 줄 (서버가 준다) */
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  /** 다음 달 수강증을 받아 뒀다 (2026-09-22) — 그 달 반이 열리면 저절로 배정된다 */
  const [held, setHeld] = useState<{ month: number; note: string } | null>(null);
  /** 수강증 이름 ≠ 가입 실명 (2026-09-30 Alan — "수강증의 이름과 일치해서 넣어주세요") — 팝업과 접수 안내에 함께 적는다 */
  const [nameMismatch, setNameMismatch] = useState<NameMismatch | null>(null);
  /** 불라방으로 등업됐다 — 내 반 교재비 안내 (2026-10-02 Alan). 팝업과 그 아래 안내에 함께 보인다 */
  const [textbook, setTextbook] = useState<TextbookNotice | null>(null);
  // 결과 팝업 (2026-09-18 Alan — "반려 문구가 바로 보여야 하고, 승인이면 어떤 반인지 팝업으로 보여 주고 맞으면 확인, 아니면 수동신청")
  const [popup, setPopup] = useState<
    null | { kind: "approved" | "preliminary"; assigned: string[] } | { kind: "rejected"; reason: string } | ({ kind: "name" } & NameMismatch)
  >(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // 고른 것 (수동)
  const terms = useMemo(() => enrollTerms(sections), [sections]);
  const [term, setTerm] = useState<string | null>(terms.length === 1 ? terms[0].key : null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [kind, setKind] = useState<EnrollKind | null>(null);
  const [track, setTrack] = useState<EnrollTrack | null>(null);
  const [block, setBlock] = useState<string | null>(null);

  const courses = useMemo(() => (term ? enrollCourses(sections, term) : []), [sections, term]);
  // 종합 · 단과 (2026-10-06 Alan "단과도 설정할 수 있도록") — 한 가지뿐인 레벨(속성반 · 2주완성 · 단과 반이 없는 달)은 고르는 줄 없이 그것으로 둔다
  const kinds = useMemo(() => (term && courseId ? enrollKinds(sections, term, courseId) : []), [sections, term, courseId]);
  const kindValue = kinds.length === 1 ? kinds[0] : kind;
  const tracks = useMemo(
    () => (term && courseId && kindValue ? enrollTracks(sections, term, courseId, kindValue) : []),
    [sections, term, courseId, kindValue],
  );
  const blocks = useMemo(
    () => (term && courseId && kindValue && track ? enrollBlocks(sections, term, courseId, track, kindValue) : []),
    [sections, term, courseId, kindValue, track],
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
          : !kindValue
            ? "종합반인지 단과인지 골라 주세요."
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
          ? await submitManualVerification({ filePath: path, term: term!, courseId: courseId!, kind: kindValue!, track: track!, timeBlock: block! })
          : await submitVerification({ filePath: path });

        if (res.ok) {
          // 이미 승인된 수강증을 또 올렸다 — 접수된 것이 아니다 (2026-10-02)
          if (res.alreadyApproved) {
            setDone("already");
            return;
          }
          // OCR 이 반을 찾아 바로 등업했으면 그렇게 말한다 (2026-09-18 자동 승인)
          setOcrNote(res.ocrNote ?? null);
          setHeld(res.held ?? null);
          setNameMismatch(res.nameMismatch ?? null);
          setTextbook(res.textbook ?? null);
          const kind = res.approved ? (res.preliminary ? "preliminary" : "approved") : res.held ? "held" : manual ? "manual" : "auto";
          setDone(kind);
          if (kind === "approved" || kind === "preliminary") setPopup({ kind, assigned: res.assigned ?? [] });
          // 이름이 다르면 접수는 됐지만 자동으로 등업되지 않는다 — 바로 알려 준다
          else if (res.nameMismatch) setPopup({ kind: "name", ...res.nameMismatch });
          return;
        }
        if ("rejected" in res) {
          // 바로 거절 — 팝업으로 이유를 보여 주고 수동 등업신청으로 갈 수 있게 한다. 닫아도 폼 위에 같은 문구가 남는다
          setRejected(res.reason);
          setPopup({ kind: "rejected", reason: res.reason });
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

  const toManual = () => {
    setPopup(null);
    setDone(null);
    setRejected(null);
    // 반이 다르면 그 반으로 계산한 교재비도 틀린다 — 주문 화면은 고친 반으로 다시 계산한다
    setTextbook(null);
    setManual(true);
  };

  /**
   * 다른 수강증으로 다시 올리기 — 확인 중인 신청은 **같은 등록**(같은 그림 · 같은 반 · 같은 시간)의 새 수강증이 들어오면 저절로 바뀐다
   * (2026-09-18 "새로 올리면 새 정보로 자동 교체" → 2026-10-06 단과 두 장처럼 함께 듣는 다른 강좌의 수강증은 남는다 — `replacePendingReceipts`)
   */
  const reupload = () => {
    setPopup(null);
    setDone(null);
    setOcrNote(null);
    setHeld(null);
    setNameMismatch(null);
    setTextbook(null);
    setRejected(null);
    pick(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  /** 이름이 다를 때 할 일 — 팝업과 접수 안내가 같은 말을 한다 */
  const nameHelp = (m: NameMismatch) => (
    <>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface px-3 py-2">
          <dt className="text-xs font-bold text-slate">수강증 이름</dt>
          <dd className="text-base font-black text-ink">{m.receiptName}</dd>
        </div>
        <div className="rounded-xl bg-surface px-3 py-2">
          <dt className="text-xs font-bold text-slate">내 이름 (가입한 이름)</dt>
          <dd className="text-base font-black text-ink">{m.myName}</dd>
        </div>
      </dl>
      <p className="mt-3 font-bold text-ink">수강증의 이름과 일치하게 넣어 주세요.</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-slate">
        <li>다른 사람의 수강증이라면 — <b className="text-ink">본인 이름이 적힌 수강증</b>을 다시 올려 주세요.</li>
        <li>이름이 가려졌거나 흐리게 찍혔다면 — 이름이 또렷이 보이게 다시 캡처해 올려 주세요.</li>
        {canRename ? (
          <li>
            가입할 때 이름을 다르게 적었다면(별명 · 오타) —{" "}
            <Link href={fixNameHref(m)} className="font-bold text-ink underline">내 정보에서 이름을 고치면</Link> 올린 수강증을 다시 확인해 등업해 드려요.
          </li>
        ) : (
          <li>가입할 때 이름을 다르게 적었다면(별명 · 오타) — 선생님께 이름 수정을 요청해 주세요.</li>
        )}
      </ul>
    </>
  );

  const resultPopup = popup && (
    <Dialog
      open
      tone={popup.kind === "rejected" || popup.kind === "name" ? "warning" : "success"}
      title={
        popup.kind === "rejected"
          ? "등업신청이 반려됐어요"
          : popup.kind === "name"
            ? "수강증의 이름과 내 이름이 달라요"
            : popup.kind === "approved"
              ? "등업이 완료됐어요"
              : "예비등록이 완료됐어요"
      }
      onClose={() => setPopup(null)}
    >
      {popup.kind === "name" ? (
        <>
          {nameHelp(popup)}
          <p className="mt-3 text-slate">이번에 올린 수강증은 접수됐고, 이름이 달라 자동으로 등업되지 않아 선생님이 직접 확인해 드려요.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={reupload} className="btn-primary w-full sm:w-auto">다른 수강증 다시 올리기</button>
            {canRename ? (
              <Link href={fixNameHref(popup)} className="btn-secondary w-full sm:w-auto">내 정보에서 이름 고치기</Link>
            ) : (
              <Link href="/contact/inquiry" className="btn-secondary w-full sm:w-auto">선생님께 이름 수정 요청</Link>
            )}
            <button type="button" onClick={() => setPopup(null)} className="btn-ghost w-full sm:w-auto">닫기</button>
          </div>
        </>
      ) : popup.kind === "rejected" ? (
        <>
          <p>{popup.reason}</p>
          <p className="mt-2 text-slate">잘못 판정된 것 같다면 <b>수동 등업신청</b>으로 반을 직접 골라 내실 수 있어요. 강사가 수강증을 보고 확인해 드립니다.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={toManual} className="btn-primary w-full sm:w-auto">수동 등업신청으로 내기</button>
            <button type="button" onClick={() => setPopup(null)} className="btn-secondary w-full sm:w-auto">닫기</button>
          </div>
        </>
      ) : (
        <>
          <p>수강증을 읽어 이 반으로 배정했어요. <b>맞는지 확인해 주세요.</b></p>
          <ul className="mt-3 space-y-1.5">
            {popup.assigned.length === 0 ? (
              <li className="rounded-xl bg-surface px-3 py-2 text-slate">배정된 반 정보를 불러오지 못했어요. 내 시간표에서 확인해 주세요.</li>
            ) : (
              popup.assigned.map((a) => (
                <li key={a} className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 font-bold text-ink">{a}</li>
              ))
            )}
          </ul>
          <p className="mt-3 text-slate">
            {popup.kind === "approved" ? "이제 불라방·다시보기·숙제업로드를 쓸 수 있어요." : "개강일에 수강생으로 자동 전환되고, 그때부터 불라방·다시보기가 열려요."}
          </p>
          {textbook && (
            <div className="mt-4">
              <TextbookNoticeCard notice={textbook} cta="secondary" />
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setPopup(null)} className="btn-primary w-full sm:w-auto">맞아요, 확인</button>
            <button type="button" onClick={toManual} className="btn-secondary w-full sm:w-auto">반이 달라요 — 수동신청</button>
          </div>
        </>
      )}
    </Dialog>
  );

  if (done === "approved" || done === "preliminary") {
    return (
      <>
      {resultPopup}
      <Alert kind="success" title={done === "approved" ? "등업이 완료됐어요" : "예비등록이 완료됐어요"}>
        수강증을 읽어 반을 바로 배정했어요.{" "}
        {done === "approved"
          ? "이제 불라방·다시보기·숙제업로드를 쓸 수 있어요. 내 시간표에서 배정된 반을 확인해 주세요."
          : "개강일에 수강생으로 자동 전환되고, 그때부터 불라방·다시보기가 열려요."}{" "}
        반이 잘못 배정됐다면 <button type="button" onClick={toManual} className="font-bold underline">수동 등업신청</button>으로 알려 주세요 — 강사가 바로 정정해 드립니다.
      </Alert>
      {/* 팝업을 닫아도 교재비 안내는 남긴다 — 알림함에도 같은 글이 있다 */}
      {textbook && (
        <div className="mt-4">
          <TextbookNoticeCard notice={textbook} />
        </div>
      )}
      </>
    );
  }

  // 이름이 달라 자동으로 등업되지 않았다 — 팝업을 닫아도 접수 안내 아래에 남긴다
  const nameNote = nameMismatch && (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-ink">
      <p className="mb-2 font-black">수강증의 이름과 내 이름이 달라요</p>
      {nameHelp(nameMismatch)}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={reupload} className="btn-primary !py-2 text-sm">다른 수강증 다시 올리기</button>
        {canRename ? (
          <Link href={fixNameHref(nameMismatch)} className="btn-secondary !py-2 text-sm">내 정보에서 이름 고치기</Link>
        ) : (
          <Link href="/contact/inquiry" className="btn-secondary !py-2 text-sm">선생님께 이름 수정 요청</Link>
        )}
      </div>
    </div>
  );

  // 다음 달 수강증 — 거절하지 않고 받아 뒀다. 그 달 반이 열리면 저절로 배정되니 다시 올릴 필요가 없다 (2026-09-22 Alan)
  if (done === "held" && held) {
    return (
      <>
        {resultPopup}
        <Alert kind="success" title={`${held.month}월 수강증을 받아 뒀어요`}>
          {held.note}
        </Alert>
        {nameNote}
      </>
    );
  }

  // 이미 승인된 수강증 (2026-10-02 Alan — 승인 뒤 같은 수강증을 또 올려 검토 대기에 쌓이던 것). 접수하지 않았다
  if (done === "already") {
    return (
      <Alert kind="info" title="이미 승인된 수강증이에요">
        이 수강증으로 이미 반이 배정돼 있어요. 다시 올리지 않으셔도 돼요 —{" "}
        <Link href="/my/class" className="font-bold underline">내 시간표</Link>에서 확인해 주세요. 반이 다르면{" "}
        <button type="button" onClick={toManual} className="font-bold underline">수동 등업신청</button>으로 알려 주세요.
      </Alert>
    );
  }

  if (done) {
    return (
      <>
        {resultPopup}
        <Alert kind="success" title="접수됐어요. 확인 후 등업됩니다.">
          {done === "manual"
            ? "고르신 반으로 신청이 접수됐어요. 강사가 수강증을 확인한 뒤 배정해 드립니다."
            : "보통 1일 이내 처리돼요."}{" "}
          개강일 전에 올리셨다면 예비등록생으로 표시되고, 개강일에 수강생으로 자동 전환됩니다.
          {ocrNote && <span className="mt-2 block font-bold text-ink">{ocrNote}</span>}
        </Alert>
        {nameNote}
      </>
    );
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {resultPopup}
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
          <span className="text-sm font-bold text-ink">{file ? file.name : "여기를 눌러 파란색 수강증 캡처 선택"}</span>
          <span className="text-xs text-mist">마이페이지 → 수강증의 파란 화면 · JPG · PNG · WEBP · PDF, 10MB 이하</span>
        </label>
      </div>

      {/* 수동: 레벨 · 종합/단과 · 요일 · 시간대 (수강월은 두 달 이상, 종합/단과는 두 가지 이상 열려 있을 때만 고른다) */}
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
                    setKind(null);
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
                  setKind(null);
                  setTrack(null);
                  setBlock(null);
                }}
              />
              {kinds.length > 1 && (
                <ChoiceRow
                  label="종합 · 단과"
                  options={kinds.map((k) => ({ key: k, label: KIND_CHOICE_LABEL[k] }))}
                  value={kind}
                  disabled={busy}
                  empty="먼저 레벨을 골라 주세요."
                  hint="한 과목만 듣는 단과라면 듣는 과목(RC · LC)을 골라 주세요. 두 과목을 다 들으면 종합반이에요."
                  onChange={(v) => {
                    setKind(v);
                    setTrack(null);
                    setBlock(null);
                  }}
                />
              )}
              <ChoiceRow
                label="요일"
                options={tracks.map((t) => ({ key: t, label: TRACK_CHOICE_LABEL[t] }))}
                value={track}
                disabled={busy || !kindValue}
                empty={courseId ? "먼저 종합반인지 단과인지 골라 주세요." : "먼저 레벨을 골라 주세요."}
                onChange={(v) => {
                  setTrack(v);
                  setBlock(null);
                }}
              />
              <ChoiceRow
                label="시간대"
                // 분량을 함께 적는다 — 종합 주5일에는 60분과 120분이 같은 시각에 함께 선다 (`enrollBlockMinutes`)
                options={blocks.map((b) => {
                  const minutes = term && courseId ? enrollBlockMinutes(sections, term, courseId, b) : null;
                  return { key: b, label: minutes ? `${b} · ${minutes}분` : b };
                })}
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
        <span>수강 확인을 위해 수강증 이미지·이름을 수집·이용하는 데 동의합니다. 원본은 인증이 끝나고 {RETENTION_LABEL} 뒤 삭제됩니다.</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !!missing} className="btn-primary w-full sm:w-auto" aria-busy={busy}>
          {uploading ? "업로드 중…" : pending ? (manual ? "접수 중…" : "수강증을 읽는 중…") : manual ? "수동 등업신청 접수" : "등업신청 접수"}
        </button>
        {missing && <span className="text-xs text-mist">{missing}</span>}
      </div>
    </form>
  );
}
