import { MODE_LABEL, TRACK_LABEL } from "./utils";
import { WEEK5_LABEL } from "./week5";
import { termKeyOf, termLabelOf, type EnrollSection } from "./enroll-options";

/**
 * 자동 승인 뒤 학생에게 보여 줄 "어느 반에 배정됐나" 한 줄들 (2026-09-18 Alan — 팝업으로 승인된 반을 보여 주고 확인/수동신청).
 *
 * 학생에게는 주5일을 `주5일` 한 가지로만 보여 준다 (도메인 규칙 1) — 같은 (기수·강좌·시간대)의 월수금 + 화목금이 함께 배정됐으면
 * 한 줄로 합친다. 순수 함수라 테스트로 굳힌다 (`assigned-label.test.ts`).
 */
export function assignedLabels(sections: readonly EnrollSection[], sectionIds: readonly number[], mode: "onsite" | "live"): string[] {
  const picked = sectionIds.map((id) => sections.find((s) => s.id === id)).filter((s): s is EnrollSection => !!s);
  const groups = new Map<string, EnrollSection[]>();
  for (const s of picked) {
    const key = `${termKeyOf(s.term)}|${s.course?.id ?? 0}|${s.time_block ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out: string[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    const tracks = new Set(list.map((s) => s.track));
    const trackLabel = tracks.has("mwf") && tracks.has("ttf") ? WEEK5_LABEL : [...tracks].map((t) => TRACK_LABEL[t] ?? t).join("·");
    out.push(
      [termLabelOf(termKeyOf(first.term)), first.course?.name ?? "강좌", trackLabel, first.time_block, MODE_LABEL[mode] ?? mode]
        .filter(Boolean)
        .join(" · "),
    );
  }
  return out;
}
