import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { isSlotKind, sortSlots, STUDY_KINDS, type SlotLite } from "@/lib/study";
import { StudyKindCard, CreateStudyCard } from "./StudyKindCard";

/** 지난달 그대로 가져오기 — 어느 달(`9월`)에서 시간대 몇 개를 가져오는지. 없으면 null (버튼을 그리지 않는다) */
export type CopySource = { label: string; slotCount: number };

export type PlannerStudy = {
  id: number;
  kind: string;
  status: string;
  notice: string | null;
  slots: SlotLite[];
  signupCount: number;
  materialCount: number;
};

/** "스터디 시간 설정" 영역 — 전용 화면 `/admin/study/plan` 과 반 편성(월) 화면 아래에 함께 쓴다 (2026-09-18) */
export function StudyPlanner({
  termId,
  termLabel,
  termKey,
  studies,
  copySource = null,
  copiedNotice = null,
}: {
  termId: number;
  termLabel: string;
  termKey: string;
  studies: PlannerStudy[];
  /** 단어 스터디 '지난달 그대로 가져오기' 의 출처 (2026-10-12 Alan) — 단어 스터디 카드에만 쓴다 */
  copySource?: CopySource | null;
  /** 방금 가져온 결과 글 (`?copied=`) — 단어 스터디 카드의 시간대 위에 적는다 */
  copiedNotice?: string | null;
}) {
  const byKind = new Map(studies.map((s) => [s.kind, { ...s, slots: sortSlots(s.slots) }]));

  return (
    <section aria-labelledby="study-plan-title" className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="study-plan-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="study" size={26} />
            스터디 시간 설정 <span className="text-sm font-semibold text-slate">— {termLabel}</span>
          </h2>
          <p className="mt-1 text-sm text-slate">
            단어 스터디는 이 달 시간대를 추가하면 수강생이 시간대를 골라 신청해요 — 시간대마다 레벨(1 · 2)을 정해 두면 학생은 그 레벨로 신청돼요. 하루 2타임, 3타임 모두 자유롭게 만들 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/study?term=${termKey}`} className="btn-secondary !py-2">
            <Icon name="students" size={18} />
            신청자 명단
          </Link>
          <Link href="/study" className="btn-ghost !py-2" target="_blank">
            학생 화면 보기
          </Link>
        </div>
      </div>

      {/* 단어 스터디(시간대 · 레벨) · 비대면 두 장을 나란히 (2026-10-12 — 옛 단어스터디(vocab)는 없앴다) */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {STUDY_KINDS.map((kind) => {
          const study = byKind.get(kind);
          // 가져오기는 단어 스터디(시간대)만 — 비대면은 달마다 열기만 하고 자료는 회차로 매달 다시 쓴다
          const copy = isSlotKind(kind) ? copySource : null;
          return (
            <div key={kind}>
              {study ? (
                <StudyKindCard kind={kind} study={study} termKey={termKey} termId={termId} copySource={copy} notice={copy ? copiedNotice : null} />
              ) : (
                <CreateStudyCard kind={kind} termId={termId} termLabel={termLabel} copySource={copy} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
