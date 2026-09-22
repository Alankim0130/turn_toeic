/**
 * QR 칸 모양 → SVG path (2026-09-21). 출석 QR 포스터 PDF(`attendance-poster-pdf.ts`)가 쓴다.
 * 칸마다 네모를 그린다 — 가로로 이어진 칸은 한 조각으로 묶는다.
 * 순수 함수라 클라이언트 컴포넌트도 가져다 쓸 수 있다 (칸 모양을 만드는 `qrcode` 는 서버 쪽 `qr.ts` 에만 있다).
 */

/** 칸 모양. `cells` 는 size×size 개의 "0"/"1" (한 줄씩 이어 붙임) */
export type QrMatrix = { size: number; cells: string };

/** 조용한 여백 — 규격상 4칸. 이게 없으면 주변 그림과 섞여 안 찍힌다 */
export const QR_QUIET = 4;

export function qrPath({ size, cells }: QrMatrix, quiet = QR_QUIET): string {
  const rects: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (cells[y * size + x] === "1") {
        let w = 1;
        while (x + w < size && cells[y * size + x + w] === "1") w++;
        rects.push(`M${x + quiet} ${y + quiet}h${w}v1h-${w}z`);
        x += w;
      } else x++;
    }
  }
  return rects.join("");
}
