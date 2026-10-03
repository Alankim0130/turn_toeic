import type { DB } from "./queries";

/** 사람 한 명의 이름 · 등급 — 전화번호 · 대학 · 학과 · 성별은 없다 */
export type PersonName = { name: string; role: string };

const ids = (list: readonly (string | null | undefined)[]) => [...new Set(list.filter((id): id is string => !!id))];

/**
 * 조교에게도 열린 화면의 사람 이름 (2026-10-03 Alan — "등업화면은 전화번호 안보이게 해줘" → "응 이것도 막아줘").
 *
 * profiles 조회 정책은 **본인 · 강사 · 관리자**뿐이다 (마이그레이션 20261003110000). 조교에게 남의 행을 열면 칸 단위로는 못 막아
 * 전화번호 · 대학 · 학과 · 성별까지 함께 열리고, 조교가 화면을 거치지 않고 자기 로그인으로 데이터베이스에 바로 물으면 그대로 왔다.
 * 그래서 조교에게 열린 화면은 profiles 를 임베드하지 않고 **이름 · 등급만 주는 DB 함수**(`public.profile_names`)로 읽는다 —
 * 조교가 임베드하면 이름이 조용히 비어 온다. 강사 · 관리자도 같은 화면에서 같은 길을 쓴다 (화면 길이 하나).
 *
 * 읽지 못하면 빈 Map — 이름 자리만 비고 화면은 그대로 뜬다 (테스트 등급을 켠 강사 · 관리자도 여기 해당한다 — 끈 뒤에 보인다).
 */
export async function getProfileNames(supabase: DB, list: readonly (string | null | undefined)[]): Promise<Map<string, PersonName>> {
  const want = ids(list);
  if (want.length === 0) return new Map();
  // rpc 는 POST 본문으로 보내 id 가 수백 개여도 주소 길이에 걸리지 않는다
  const { data } = await supabase.rpc("profile_names", { p_ids: want });
  return new Map((data ?? []).map((r) => [r.user_id, { name: r.name, role: r.role }]));
}

/** 주소(쿼리 문자열)에 id 를 싣는 조회는 나눠 보낸다 — uuid 100개 ≈ 3.7KB */
const PHONE_CHUNK = 100;

/**
 * 학생 전화번호 — **강사 · 관리자 화면에서만** 부른다 (`showPhone`, 2026-10-03). 조교가 불러도 RLS 가 본인 행만 돌려줘
 * 남의 번호는 비어 오지만, 조교 화면에서는 아예 부르지 않는다. 조교에게 열린 화면이 profiles 를 직접 읽는 곳은 여기 하나다.
 */
export async function getStaffPhones(supabase: DB, list: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const want = ids(list);
  const chunks: string[][] = [];
  for (let i = 0; i < want.length; i += PHONE_CHUNK) chunks.push(want.slice(i, i + PHONE_CHUNK));
  const results = await Promise.all(chunks.map((chunk) => supabase.from("profiles").select("id, phone").in("id", chunk)));
  return new Map(results.flatMap(({ data }) => (data ?? []).flatMap((r) => (r.phone ? [[r.id, r.phone] as const] : []))));
}
