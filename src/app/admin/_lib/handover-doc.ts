import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseHandover, type HandoverDoc } from "@/lib/handover";

/**
 * 인수인계 체크리스트 원본 — 저장소의 docs/HANDOVER.md (2026-10-04). 관리자 화면 `운영 → 인수인계` 가 이 파일을 그대로 그린다.
 * Vercel 함수에는 `public/` 밖의 파일이 실리지 않으므로 next.config.ts 의 `outputFileTracingIncludes["/admin/handover"]` 로 싣는다
 * (경로는 출석 포스터처럼 추적을 끄고 적은 것만 — `attendance-poster-assets.ts`).
 */
const HANDOVER_FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "docs", "HANDOVER.md");

let cached: Promise<HandoverDoc> | null = null;

/** 배포마다 파일이 같으므로 한 번 읽어 둔다 (개발 중에는 고친 것이 바로 보이게 매번 읽는다). 못 읽으면 다음에 다시 읽는다 */
export function readHandover(): Promise<HandoverDoc> {
  if (process.env.NODE_ENV !== "production") return readFile(HANDOVER_FILE, "utf8").then(parseHandover);
  cached ??= readFile(HANDOVER_FILE, "utf8")
    .then(parseHandover)
    .catch((e: unknown) => {
      cached = null;
      throw e;
    });
  return cached;
}
