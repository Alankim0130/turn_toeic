import { contentTypeOf, isSafeObjectPath, MB, objectName, type UploadedFile } from "./upload";

/**
 * 불라방 교재주문 — 학생이 올리는 **이체 화면 캡처** (2026-11-04 Alan — "불라방 교재주문할때 쌤들이 하나씩 확인하는게 힘들어. 그래서 학생이 이체를 하고 난 뒤에,
 * 해당 화면을 스크린샷찍어서 올려주면 조교들이 바로 확인하고 배송을 시작할 수 있도록 해주면 좋겠어").
 *
 * - 주문 한 건에 캡처 하나 (`textbook_orders.transfer_*`). **주문 폼에서 캡처를 올려야 주문이 된다** (2026-11-05 Alan — "스크린샷을 올려야지 주문이 완료되도록") —
 *   폼 · 서버 액션(`submitTextbookOrder`)이 막는다. 주문 뒤 내역 카드에서 다시 올릴 수 있다 — **금액확인 전(requested)에만**. 주문은 됐는데 캡처만 못 붙은 경우(드물다)와
 *   그전 주문은 카드에서 올린다. DB 함수 `create_textbook_order` 는 건드리지 않았다 (금액 · 자격을 지키는 함수) — 캡처 없는 주문이 생겨도 예전처럼 강사님이 통장과 대조한다.
 * - **캡처가 있는 주문은 조교도 금액확인한다.** 없는 주문은 강사 · 관리자만 (교재비가 강사 통장으로 들어와 조교는 대조할 수 없다) —
 *   서버 액션(`confirmTextbookPayment`)과 DB 트리거(`private.guard_textbook_order_update`)가 같은 규칙이다. 마이그레이션 20261104100000.
 * - 버킷 `textbook-transfers`(비공개 · 사진 형식 · 10MB), 경로 `{학생 id}/{무작위}.ext` — 저장소 정책이 첫 폴더 = 본인 id 를 확인한다.
 *   보는 주소는 `/files/transfer/{주문 id}` (사용자 세션으로 주문 행을 읽는다 — 본인 · 조교 · 강사 · 관리자).
 * - 수강증(`receipts` 버킷 · 등업신청)과는 다른 것이라 이름에 receipt 를 쓰지 않는다.
 */
export const TRANSFER_BUCKET = "textbook-transfers";
export const TRANSFER_MAX_MB = 10;
/** DB 함수 · 버킷과 같은 사진 형식 목록 (2026-10-09 학생 버킷 규칙 — SVG 는 받지 않는다) */
export const isTransferImageType = (type: string | null | undefined) => !!type && /^image\/(jpeg|jpg|png|webp|gif|heic|heif|avif|bmp|tiff)$/.test(type);

/** 저장소 경로 — 내 폴더 바로 아래 무작위 이름 (DB 함수가 같은 꼴을 다시 본다) */
export const transferPath = (userId: string, file: { name: string }) => `${userId}/${objectName(file)}`;

/** 고른 파일의 문제 — 없으면 null (화면과 서버가 같은 규칙) */
export function transferFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!isTransferImageType(contentTypeOf(file))) return "사진 파일(캡처 · 스크린샷)만 올릴 수 있어요.";
  if (!(file.size > 0)) return "빈 파일이에요. 다시 골라 주세요.";
  if (file.size > TRANSFER_MAX_MB * MB) return `캡처는 ${TRANSFER_MAX_MB}MB 이하만 올릴 수 있어요.`;
  return null;
}

/** 서버가 받은 업로드 결과가 내 폴더의 사진인지 — 경로 조작 · 다른 폴더 · 사진 아닌 것을 막는다 */
export function transferUploadProblem(userId: string, f: Partial<UploadedFile> | null | undefined): string | null {
  const prefix = `${userId}/`;
  if (!f || typeof f.path !== "string" || !isSafeObjectPath(f.path, prefix) || f.path.slice(prefix.length).includes("/") || !f.path.slice(prefix.length)) {
    return "캡처 파일 경로가 올바르지 않아요. 다시 올려 주세요.";
  }
  return transferFileProblem({ name: String(f.name ?? ""), type: String(f.type ?? ""), size: Number(f.size) });
}

/** DB 함수(`attach_textbook_transfer`)의 거절 → 학생에게 보일 말 */
export function transferAttachError(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("not_requested")) return "금액확인이 끝난 주문에는 캡처를 올릴 수 없어요.";
  if (m.includes("not_found")) return "주문을 찾을 수 없어요. 새로고침해 주세요.";
  if (m.includes("bad_type")) return "사진 파일(캡처 · 스크린샷)만 올릴 수 있어요.";
  if (m.includes("bad_size")) return `캡처는 ${TRANSFER_MAX_MB}MB 이하만 올릴 수 있어요.`;
  if (m.includes("bad_path")) return "캡처 파일 경로가 올바르지 않아요. 다시 올려 주세요.";
  return "캡처를 올리지 못했어요. 잠시 후 다시 시도해 주세요.";
}

/** 조교가 금액확인할 수 있는 주문 — 금액확인 전이고 이체 캡처가 있다 (DB 트리거와 같은 규칙) */
export const crewCanConfirm = (o: { status: string; transfer_path?: string | null }) => o.status === "requested" && !!o.transfer_path;

/** 학생 주문 카드 · 주문 폼의 안내 한 줄 */
export const TRANSFER_HINT = "입금한 뒤 이체 완료 화면(은행 앱 · 토스 등)을 캡처해 올려 주세요. 조교 선생님이 캡처를 보고 바로 확인하고 보내 드려요.";
/** 캡처 없이 주문을 보냈을 때 — 폼과 서버 액션이 같은 말 */
export const TRANSFER_REQUIRED = "이체 화면 캡처를 올려 주세요. 캡처를 올려야 주문이 완료돼요.";
