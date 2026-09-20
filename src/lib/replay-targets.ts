/**
 * 다시보기를 **어느 반에 올리는가** (2026-09-20 Alan 요청).
 *
 * > Alan: "다시보기 등록에서 너무 복잡하게 되어있어. 일단 레벨별로 구분해줘. …
 * >        스파르타반은 결국 두개의 다른 레벨에 접근권한이 다 있는데 왜 다시보기에 추가 되어있는지 모르겠어."
 *
 * 규칙 자체는 새로 만든 것이 아니다 — CLAUDE.md 도메인 규칙 1 "반 권한" 에 이미 있다:
 * **녹화본 · 불라방 링크 · LC 교재는 시간 단위 반(60분·70분)에 한 번만 둔다.**
 * 묶음 반(120분·140분)과 스파르타 반에는 올리지 않는다 — 그 학생들은 `private.section_includes` 가
 * 열어 주는 시간 단위 반의 녹화본을 그대로 본다. 스파르타 650 이면 650 + 850 의 시간 단위 반이다.
 *
 * 그런데 화면은 **묶음 반만 고른 뒤에 경고**했고 스파르타 반은 아무 처리가 없어서, 10월 반 36개가
 * 기수(월) 하나로만 묶인 채 통째로 쏟아졌다. 규칙을 문서에만 적어 두고 화면에 반영하지 않은 것이다.
 *
 * ## 레벨당 올릴 곳은 넷뿐이다 (2026-09-20 Alan 이 짚은 대로)
 * 다시보기가 생기는 곳은 **오전 반**이다 — 저녁 줄(`timetable_slots.ttf_recorded`)의 반은
 * `live_to_replay` 가 두 트랙 모두 꺼진 채 시작한다 (저녁 불라방은 라이브만).
 * 오전 시간 단위 반은 레벨마다 `월수금 · 화목금 × 앞 시간 · 뒤 시간` 넷이고,
 * 그중 **LC 교재(`book_set`)가 있는 둘이 LC**, 나머지 둘이 RC 다. 예) 10월 650 —
 * LC 는 화목금 10:00(B) · 월수금 11:10(A), RC 는 월수금 10:00 · 화목금 11:10.
 *
 * **묶음 관계는 `sectionPackages` 로만 계산한다** (도메인 규칙 1: "그 밖의 포함 관계를 화면에서 따로 계산하지 말 것").
 * 인강 반의 오전 짝(`private.recorded_source_section`)은 DB 몫이라 여기서 흉내 내지 않는다 — 배지만 붙인다.
 */

import type { TRACK_LABEL } from "./utils";

export type ReplaySection = {
  id: number;
  track: string;
  time_block: string | null;
  term?: { year: number; month: number } | null;
  course?: { name?: string | null; program?: string | null; target_score?: number | null } | null;
};

/** `sectionPackages` 가 돌려주는 모양 중 여기서 쓰는 것만 */
type PackageMap = Map<number, { parts: { id: number }[] }>;

/** 트랙 정렬 순서 — 편성표와 같게 월수금이 먼저다 */
const TRACK_ORDER: Record<string, number> = { mwf: 0, ttf: 1 };

const isSparta = (s: ReplaySection) => s.course?.program === "sparta";

/** 안에 시간 단위 반이 든 반 = 묶음 반 (120분 · 140분) */
const isPackage = (s: ReplaySection, packages: PackageMap) => (packages.get(s.id)?.parts.length ?? 0) > 0;

/**
 * **저녁 줄인가** (2026-09-20 Alan — "650 A 라이브방송을 하고 나면 이 영상링크가 다시보기로 자동으로 연결되면 되잖아.
 * 그러면 굳이 저녁시간을 나타낼 필요가 없잖아").
 *
 * 저녁 반은 오전 반이 한 라이브방송의 녹화본을 본다 — 화목금은 인강이라 `private.recorded_source_section` 이
 * 오전 짝을 열어 주고, 오전 반은 `live_to_replay` 가 켜져 있어 회차 링크가 저절로 다시보기가 된다.
 * 그래서 **올릴 자리는 오전 반뿐**이고 저녁 줄은 목록에 있을 이유가 없다.
 *
 * **시각을 코드에 못박지 않는다** (도메인 규칙 1). 저녁 줄은 시간표가 이미 표시하고 있다 —
 * `timetable_slots.ttf_recorded`(그 시간대는 화목금이 인강)가 켜진 라벨이 곧 저녁 줄이다.
 * `eveningBlocks` 는 그 라벨 집합이고, 비어 있으면(시간표를 못 읽었으면) **아무도 빼지 않는다** —
 * 근거가 없을 때 목록을 지우면 강사가 올릴 데를 잃는다.
 */
const isEvening = (s: ReplaySection, eveningBlocks: ReadonlySet<string>) => !!s.time_block && eveningBlocks.has(s.time_block);

/**
 * 이 반에 녹화본을 올려도 되는가. **오전 시간 단위 반만 참이다.**
 * 거짓이어도 목록에서 무조건 지우지는 않는다 — 이미 녹화본이 붙어 있으면 남겨야 고치고 지울 수 있다 (화면 몫).
 */
const uploadable = (s: ReplaySection, packages: PackageMap, eveningBlocks: ReadonlySet<string> = new Set()) =>
  !isSparta(s) && !isPackage(s, packages) && !isEvening(s, eveningBlocks);

/** 레벨 탭에 쓸 값. 스파르타는 레벨이 같아도 섞지 않는다 (교재·시간이 다르다) */
const levelOf = (s: ReplaySection): number | null => (typeof s.course?.target_score === "number" ? s.course.target_score : null);

/** 목록에 있는 레벨들 — 오름차순. **코드에 650·750·850 을 적지 않는다** (작업 원칙 4) */
function levels(list: ReplaySection[]): number[] {
  return [...new Set(list.map(levelOf).filter((n): n is number => n !== null))].sort((a, b) => a - b);
}

/**
 * 드롭다운 묶음 이름 — **기수(월)만** (2026-09-20 Alan "위에 따로 레벨 버튼을 만들어서 구분하게 해줘").
 * 레벨은 위 탭이 이미 갈라 놓았으므로 여기 또 적으면 같은 말이 두 번 나온다.
 * 스파르타는 레벨이 같아도 상품이 달라 이름을 남긴다 (이미 녹화본이 붙어 목록에 남은 경우).
 */
function groupLabel(s: ReplaySection): string {
  const term = s.term ? `${s.term.month}월` : "기수 미지정";
  return isSparta(s) ? `${term} · 스파르타` : term;
}

/** 기수는 최신이 위, 그 안에서 레벨 오름차순 → 시간 → 트랙. 스파르타는 레벨이 같아도 뒤로 */
function compare(a: ReplaySection, b: ReplaySection): number {
  const termOf = (s: ReplaySection) => (s.term ? s.term.year * 12 + s.term.month : -1);
  return (
    termOf(b) - termOf(a) ||
    (a.course?.target_score ?? 9999) - (b.course?.target_score ?? 9999) ||
    Number(isSparta(a)) - Number(isSparta(b)) ||
    (a.time_block ?? "").localeCompare(b.time_block ?? "") ||
    (TRACK_ORDER[a.track] ?? 9) - (TRACK_ORDER[b.track] ?? 9) ||
    a.id - b.id
  );
}

export const replayTargets = { isSparta, isPackage, isEvening, uploadable, levelOf, levels, groupLabel, compare };

/** 화면이 쓰는 트랙 이름표의 타입만 빌려 온다 (값은 utils 한곳) */
export type TrackLabel = typeof TRACK_LABEL;
