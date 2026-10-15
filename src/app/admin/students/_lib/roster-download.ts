import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { rosterPeriod, type ClassRoster, type RosterBy } from "@/lib/class-roster";
import { TERM_COLUMNS, type TermLite } from "../../_lib/queries";
import { loadClassRoster } from "./class-roster";

/**
 * 반별 명단 · 레벨별 명단 내려받기(PDF · Word)가 함께 쓰는 읽기 — `?term=YYYY-MM`, `&view=levels` 면 레벨별 명단 (그 밖의 값은 반별 명단).
 * 권한은 부르는 라우트가 먼저 본다 (`requireStaff()` — 학생명단과 같다. 레이아웃을 타지 않는 라우트라 거기서 직접 막는다).
 * 받을 때마다 지금 배정으로 새로 읽는다 (저장해 두지 않는다). 학생 이름이 든 파일이라 캐시에 남기지 않는다(`ROSTER_HEADERS`).
 */
export const ROSTER_HEADERS = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } as const;

const text = (status: number, body: string) => new Response(body, { status, headers: { ...ROSTER_HEADERS, "content-type": "text/plain; charset=utf-8" } });

export type RosterDownload = { ok: true; term: TermLite; by: RosterBy; roster: ClassRoster; period: string } | { ok: false; response: Response };

export async function loadRosterDownload(req: NextRequest): Promise<RosterDownload> {
  const m = (req.nextUrl.searchParams.get("term") ?? "").match(/^(\d{4})-(\d{2})$/);
  const by: RosterBy = req.nextUrl.searchParams.get("view") === "levels" ? "track" : "time";
  if (!m) return { ok: false, response: text(400, "어느 달 명단인지 알 수 없어요. 학생명단 화면에서 다시 받아 주세요.") };

  const supabase = await createClient();
  const { data: terms } = await supabase.from("terms").select(TERM_COLUMNS);
  const term = (terms ?? []).find((t) => t.year === Number(m[1]) && t.month === Number(m[2]));
  if (!term) return { ok: false, response: text(404, "그 달 기수가 없어요. 학생명단 화면에서 다시 받아 주세요.") };

  const { roster, ok } = await loadClassRoster(supabase, term, todayKST(), by);
  // 일부만 읽은 명단을 파일로 내보내지 않는다 — 빠진 학생을 모른 채 종이에 적힌다
  if (!ok) return { ok: false, response: text(503, "명단을 다 불러오지 못했어요. 잠시 뒤 다시 받아 주세요.") };
  return { ok: true, term, by, roster, period: rosterPeriod(term) };
}
