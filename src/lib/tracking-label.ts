/**
 * 택배 접수증 사진 → 운송장번호 (2026-10-27 Alan — "불라방 교재배송을 하고 난뒤, 조교가 송장번호를 기입하는데 하나씩 기입하려니 너무 많아서
 * 사진찍었을때 우측하단에 있는 운송장번호를 읽어서 자동으로 기입을 할 수 있으면 좋겠어. 해당학생 송장번호 기입하는 곳에 사진촬영 버튼을 하나 만들어주면 좋겠어").
 *
 * 조교가 교재를 부치는 GS 편의점 택배((주)지에스네트웍스 — GS 포스트박스) 접수증 `접수고객 보관용 / 포스스캔용` 은 오른쪽 위에 `점포포스 스캔` QR 이 있고
 * **그 QR 에 운송장번호가 들어 있다**. 오른쪽 아래 운송장번호 칸의 글자를 읽는(OCR) 대신 이 QR 을 읽는다 — 숫자를 잘못 읽을 일이 없고,
 * 브라우저 안에서 끝나 **사진이 기기 밖으로 나가지 않는다** (접수증에 받는 사람 이름 일부가 있다). 읽는 일은 `read-label-photo.ts`(브라우저),
 * 이 파일은 규칙만 — 테스트가 sharp + jsQR 로 같은 규칙을 돌린다 (`tracking-label.test.ts`).
 *
 * QR 내용 — Alan 이 보낸 실물 접수증 사진 여섯 장(같은 접수증 두 장 · 2026년 6 ~ 8월 접수)으로 확인:
 * `POSTBOX;` + `1` + **운송장번호 12자리** + 접수일의 '일' 2자리 + 5자리 + `;2` … `;3` … `;`.
 * 운송장번호 뒤 두 자리가 다섯 장 모두 접수일자 칸의 날(22 · 28 · 15 · 04 · 13)과 같아서 12자리에서 끊는 것이 맞다.
 * 이 꼴이 아니면(다른 택배사 · 꼴이 바뀜) 짐작해 채우지 않는다 — 번호를 직접 적게 한다.
 */

/** 접수증 QR — 운송장번호 12자리, 뒤에 접수일의 날 2자리 */
const LABEL_QR = /^POSTBOX;1(\d{12})(\d{2})\d{5};/;

/** QR 글자 → 운송장번호. GS 편의점 택배 접수증 꼴이 아니면 null */
export function trackingFromLabelQr(text: string): string | null {
  const m = LABEL_QR.exec(text.trim());
  if (!m) return null;
  const day = Number(m[2]);
  return day >= 1 && day <= 31 ? m[1] : null;
}

/**
 * jsQR 로 읽어 볼 크기(사진의 긴 변, px) — 이 순서대로 읽고 처음 읽히는 데서 멈춘다.
 * 실물 다섯 장을 가까이 · 두 배 · 세 배 멀리서 찍은 꼴로, 줄이는 방식 넷으로 재 보니(2026-10-27) 모두 네 번 안에 읽혔다.
 * **크게(원본 그대로) 읽으면 종이 결 · 구김 때문에 오히려 놓친다** — 640 부터 읽는다. 멀리서 찍어 QR 이 작으면 1280 · 1600 에서 읽힌다
 */
export const LABEL_SCAN_SIZES = [640, 800, 960, 1280, 1600, 480, 560, 720, 1120, 2000] as const;

/** 이 사진에서 읽어 볼 크기 — 늘리지는 않는다. 2000px 이하 사진은 원본 크기도 마지막에 한 번 */
export function labelScanSizes(longSide: number): number[] {
  if (!Number.isFinite(longSide) || longSide < 1) return [];
  const long = Math.round(longSide);
  const sizes: number[] = LABEL_SCAN_SIZES.filter((s) => s < long);
  if (long <= 2000) sizes.push(long);
  return sizes;
}

/** ok = 운송장번호를 읽음 · other = QR 은 있는데 접수증 꼴이 아님 · none = QR 을 못 찾음 · error = 사진을 못 열었음 */
export type LabelRead = { kind: "ok"; tracking: string } | { kind: "other" } | { kind: "none" } | { kind: "error" };

/**
 * 크기마다 `decodeAt` 을 불러(브라우저는 캔버스 + jsQR, 테스트는 sharp + jsQR) 처음 접수증 QR 이 읽히는 데서 멈춘다.
 * `first` 는 먼저 읽은 글자(브라우저의 BarcodeDetector — 안드로이드 크롬 등) — 거기서 읽혔으면 jsQR 을 돌리지 않는다.
 * 한 크기에서 실패(던짐)해도 다음 크기로 간다.
 */
export async function scanLabel(
  longSide: number,
  decodeAt: (size: number) => Promise<string | null> | string | null,
  first: readonly string[] = [],
): Promise<Exclude<LabelRead, { kind: "error" }>> {
  let other = false;
  for (const text of first) {
    const tracking = trackingFromLabelQr(text);
    if (tracking) return { kind: "ok", tracking };
    other = true;
  }
  for (const size of labelScanSizes(longSide)) {
    let text: string | null = null;
    try {
      text = await decodeAt(size);
    } catch {
      text = null;
    }
    if (!text) continue;
    const tracking = trackingFromLabelQr(text);
    if (tracking) return { kind: "ok", tracking };
    other = true;
  }
  return { kind: other ? "other" : "none" };
}

/*
 * ─── 카메라로 바로 읽기 (2026-10-27 Alan — "사진을 찍어서 올리는게 아니라 그냥 카메라를 틀어서 qr이 인식이되면 카메라가 꺼지면서
 * 바로 송장번호가 기입되는걸로") — 영상 한 장씩 읽는 일은 `label-camera-reader.ts`(브라우저), 카메라 화면은 `LabelCamera.tsx`.
 *
 * 화면에는 영상의 **가운데 정사각형**이 보이고(object-cover) 그 가운데 72% 가 네모다. 읽는 곳은 그 정사각형의 가운데 80% 뿐이다 —
 * 책상에 접수증이 여러 장 놓여 있어도 화면 가장자리에 걸린 다른 학생 접수증의 QR 을 읽지 않게. 네모보다 조금 넓게 잡아 살짝 비껴 대도 읽힌다.
 */
export const LIVE_SCAN_CROP = 0.8;

/** 영상(가로 w · 세로 h) 에서 읽을 곳 — 가운데 정사각형의 가운데 80%. 영상 크기를 아직 모르면 null */
export function liveCropRect(w: number, h: number): { sx: number; sy: number; size: number } | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  const size = Math.max(1, Math.round(Math.min(w, h) * LIVE_SCAN_CROP));
  return { sx: Math.round((w - size) / 2), sy: Math.round((h - size) / 2), size };
}

/**
 * jsQR 로 읽을 크기 — 영상 한 장에 한 크기씩 돌아가며 읽는다 (늘리지는 않는다).
 * 실물 접수증 다섯 장을 영상 크기(짧은 변 480 · 720 · 1080)로 줄이고 흐림을 더해 QR 이 화면의 15 ~ 70% 를 차지하게 재 보니(2026-10-27)
 * 사진처럼 **640 이 가장 잘 읽히고**(종이 결이 덜 보인다) QR 이 작게 보일 때는 800 · 원래 크기가 읽었다. 손이 조금씩 움직여 장마다 영상이 달라서
 * 크기를 돌려 가며 읽으면 한두 바퀴 안에 읽힌다
 */
export const LIVE_SCAN_SIZES = [640, 800, 480, 1080] as const;

export function liveScanSize(crop: number, tick: number): number {
  if (!Number.isFinite(crop) || crop < 1) return 0;
  const sizes = [...new Set(LIVE_SCAN_SIZES.map((s) => Math.min(s, Math.round(crop))))];
  return sizes[Math.abs(Math.trunc(tick)) % sizes.length];
}

/** 영상 한 장에서 읽은 결과 — many = 접수증 QR 이 둘 보인다(번호가 다르다). 읽지 않고 계속 비추게 한다 */
export type LiveRead = { kind: "ok"; tracking: string } | { kind: "other" } | { kind: "many" } | { kind: "none" };

/** 한 장에서 읽은 QR 글자들(BarcodeDetector 는 여럿 · jsQR 은 하나) → 결과. 번호가 하나로 정해질 때만 넣는다 */
export function liveRead(texts: readonly string[]): LiveRead {
  const found = [...new Set(texts.map(trackingFromLabelQr).filter((t): t is string => t !== null))];
  if (found.length === 1) return { kind: "ok", tracking: found[0] };
  if (found.length > 1) return { kind: "many" };
  return texts.some((t) => t.trim()) ? { kind: "other" } : { kind: "none" };
}

/** 카메라 화면의 안내 한 줄 — 비춘 QR 이 접수증 것이 아니거나 둘일 때 (읽을 때까지 카메라는 켜 둔다) */
export function liveHint(kind: "other" | "many"): string {
  return kind === "many"
    ? "접수증 QR 이 두 개 보여요. 한 장만 네모 안에 비춰 주세요."
    : "GS 편의점 택배 접수증의 QR 이 아니에요. 접수증 오른쪽 위 QR 을 비춰 주세요.";
}

/** 운송장번호를 견줄 때 — 숫자만 (직접 적을 때 띄어 쓰거나 - 를 넣을 수 있다). 숫자가 8자리 미만이면 견주지 않는다 */
export function trackingKey(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/** 이미 운송장번호가 들어간 주문 — 교재주문 화면이 한 번 만들어 줄마다 같은 목록을 넘긴다 */
export type UsedTracking = { id: number; key: string; name: string };

/**
 * 이 번호가 **다른 주문**에 이미 있나 — 같은 접수증을 두 번 찍었거나 다른 학생 것을 찍었을 때 (Alan 이 보낸 여섯 장에도 같은 접수증이 두 장 있었다).
 * 막지는 않는다 (한 상자에 한 학생의 두 달 주문을 함께 부칠 수 있다) — 화면이 알려 주기만 한다
 */
export function duplicateTracking(value: string, orderId: number, used: readonly UsedTracking[]): UsedTracking | null {
  const key = trackingKey(value);
  if (!key) return null;
  return used.find((u) => u.key === key && u.id !== orderId) ?? null;
}

/** 사진을 읽은 결과 → 칸 아래 한 줄. 받는 분 이름을 함께 적어 접수증의 받는사람(가운데를 가린 이름)과 견주게 한다 */
export function labelReadMessage(read: LabelRead, recipient: string): string {
  switch (read.kind) {
    case "ok":
      return `운송장번호를 넣었어요. 접수증의 받는사람이 ${recipient} 님인지 확인해 주세요.`;
    case "other":
      return "GS 편의점 택배 접수증의 QR 이 아니에요. 운송장번호를 직접 적어 주세요.";
    case "none":
      return "QR 을 찾지 못했어요. 접수증 전체가 나오게, 흔들리지 않게 다시 찍어 주세요.";
    case "error":
      return "사진을 읽지 못했어요. 다시 찍거나 운송장번호를 직접 적어 주세요.";
  }
}

/** 다른 주문에 이미 있는 번호일 때 칸 아래 한 줄 */
export function duplicateMessage(dup: UsedTracking): string {
  return `이 번호는 주문 #${dup.id} (${dup.name}) 에도 들어가 있어요. 같은 접수증을 두 번 찍지 않았는지 봐 주세요.`;
}
