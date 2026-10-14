import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 반별 명단 PDF 글꼴(`assets/roster-fonts/roster-bold.ttf`, 약 2MB)을 읽는다 — 서버에서만 (`/admin/students/roster-pdf`).
 * Vercel 함수에 실리도록 `next.config.ts` 의 `outputFileTracingIncludes` 에 적어 두었다 — 파일을 바꾸면 거기도 고친다.
 * 한 번 읽으면 서버 인스턴스가 살아 있는 동안 다시 쓴다. 실패는 붙잡아 두지 않는다 (다음 요청에서 다시 읽는다).
 */
const at = (...p: string[]) => path.join(/*turbopackIgnore: true*/ process.cwd(), ...p);

let cached: Promise<Uint8Array> | null = null;

export function loadRosterFont(): Promise<Uint8Array> {
  cached ??= readFile(at("assets/roster-fonts", "roster-bold.ttf"))
    .then((b) => new Uint8Array(b))
    .catch((e) => {
      cached = null;
      throw e;
    });
  return cached;
}
