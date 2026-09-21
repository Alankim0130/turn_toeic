import QRCode from "qrcode";
import type { QrMatrix } from "./qr-svg";

/**
 * 주소 → QR 칸 모양. 서버에서만 부른다 — `qrcode` 를 클라이언트 번들에 싣지 않게 `qr-svg.ts` 와 나눴다.
 * 교실 화면은 M(15% 복구), 인쇄용 포스터는 가운데에 로고를 얹으므로 H(30% 복구)를 쓴다.
 */
export function qrMatrix(text: string, level: "M" | "Q" | "H" = "M"): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: level });
  const size = qr.modules.size;
  let cells = "";
  for (let i = 0; i < size * size; i++) cells += qr.modules.data[i] ? "1" : "0";
  return { size, cells };
}
