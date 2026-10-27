"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { duplicateMessage, duplicateTracking, labelReadMessage, type LabelRead, type UsedTracking } from "@/lib/tracking-label";
import { cn } from "@/lib/utils";
import { LabelCamera } from "./LabelCamera";
import { readLabelPhoto } from "./read-label-photo";

/**
 * 교재주문의 송장번호 칸 + **QR 찍기** 버튼 (2026-10-27 Alan — "조교가 송장번호를 기입하는데 하나씩 기입하려니 너무 많아서 사진찍었을때 …
 * 운송장번호를 읽어서 자동으로 기입 … 해당학생 송장번호 기입하는 곳에 사진촬영 버튼을 하나 만들어주면 좋겠어" → 같은 날 "사진을 찍어서 올리는게 아니라
 * 그냥 카메라를 틀어서 qr이 인식이되면 카메라가 꺼지면서 바로 송장번호가 기입되는걸로").
 *
 * - 누르면 카메라 창(`LabelCamera`)이 열리고, GS 편의점 택배 접수증의 QR 이 비치면 카메라가 꺼지며 운송장번호가 칸에 들어간다 —
 *   배송완료(저장)는 조교가 번호와 받는사람을 보고 누른다. 저절로 저장하지 않는다
 * - 카메라를 못 켜거나 잘 안 읽히면 **사진으로 읽기**(처음 만든 길 — 휴대폰은 카메라 앱이 켜지고 PC 는 사진 파일을 고른다)
 * - **영상 · 사진은 기기 밖으로 나가지 않는다** — 브라우저 안에서 읽고, 파일 칸에 이름(name)이 없어 폼에 실리지 않는다.
 *   카메라 창은 폼 밖(body)에 그려 그 안의 버튼이 배송완료 폼을 보내지 않는다
 * - 다른 주문에 이미 들어간 번호면 알려 준다 (`duplicateTracking` — 막지는 않는다)
 */
export function TrackingNoField({
  orderId,
  defaultValue,
  placeholder,
  recipient,
  used,
  photo = true,
}: {
  orderId: number;
  defaultValue: string;
  placeholder: string;
  /** 이 주문의 받는 분 — 접수증의 받는사람과 견주게 읽은 뒤 적는다 */
  recipient: string;
  /** 이미 운송장번호가 들어간 주문 — 화면이 한 번 만들어 모든 줄에 같은 목록을 넘긴다 */
  used: readonly UsedTracking[];
  /** 현장수령 주문은 접수증이 없어 버튼을 그리지 않는다 */
  photo?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [read, setRead] = useState<LabelRead | "reading" | null>(null);
  const [camera, setCamera] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const dup = duplicateTracking(value, orderId, used);

  const closeCamera = useCallback(() => setCamera(false), []);
  const onFound = useCallback((tracking: string) => {
    run.current++; // 읽던 사진이 있으면 그 결과는 버린다
    setCamera(false);
    setValue(tracking);
    setRead({ kind: "ok", tracking });
  }, []);
  /** 카메라 대신 사진으로 — 누른 그 자리에서 파일 칸을 눌러야 휴대폰이 사진 창을 연다 */
  const photoInstead = useCallback(() => {
    setCamera(false);
    fileRef.current?.click();
  }, []);

  async function onPhoto(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ""; // 같은 사진을 다시 골라도 다시 읽게
    if (!file) return;
    const mine = ++run.current;
    setRead("reading");
    const r = await readLabelPhoto(file).catch((): LabelRead => ({ kind: "error" }));
    if (mine !== run.current) return; // 그 사이 다른 사진을 골랐거나 카메라로 읽었다
    if (r.kind === "ok") setValue(r.tracking);
    setRead(r);
  }

  const reading = read === "reading";
  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex gap-1.5">
        <input
          name="tracking_no"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setRead(null);
          }}
          maxLength={60}
          placeholder={placeholder}
          className="input min-w-0 flex-1 !py-1.5 text-xs"
          aria-label="송장번호"
        />
        {photo && (
          <>
            <button
              type="button"
              onClick={() => setCamera(true)}
              disabled={reading}
              title="카메라를 켜고 GS 편의점 택배 접수증의 오른쪽 위 QR 을 비추면 운송장번호가 들어가요"
              className="btn-secondary shrink-0 !gap-1 !px-2.5 !py-1.5 text-xs"
            >
              <Icon name="camera" size={16} />
              {reading ? "읽는 중…" : "QR 찍기"}
            </button>
            {/* 이름(name)이 없어 폼과 함께 서버로 가지 않는다 — 사진은 이 기기 안에서만 읽는다 */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void onPhoto(e.target.files?.[0])}
            />
          </>
        )}
      </div>
      {read && (
        <p role="status" className={cn("text-[11px] font-bold leading-snug", reading ? "text-slate" : read.kind === "ok" ? "text-emerald-700" : "text-amber-800")}>
          {reading ? "접수증을 읽는 중…" : labelReadMessage(read, recipient)}
        </p>
      )}
      {dup && !reading && <p className="text-[11px] font-bold leading-snug text-red-700">{duplicateMessage(dup)}</p>}
      {/* 카메라 창은 body 에 — 이 칸은 배송완료 폼 안이라, 안에 그리면 창의 버튼이 폼에 속한다 */}
      {camera &&
        createPortal(
          <Dialog open title="접수증 QR 찍기" onClose={closeCamera}>
            <LabelCamera recipient={recipient} onFound={onFound} onPhoto={photoInstead} />
            <button type="button" onClick={closeCamera} className="btn-secondary mt-4 w-full">
              닫기
            </button>
          </Dialog>,
          document.body,
        )}
    </div>
  );
}
