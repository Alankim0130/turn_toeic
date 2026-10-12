import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { sortSlots, STUDY_KINDS, type SlotLite } from "@/lib/study";
import { StudyKindCard, CreateStudyCard } from "./StudyKindCard";

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
export function StudyPlanner({ termId, termLabel, termKey, studies }: { termId: number; termLabel: string; termKey: string; studies: PlannerStudy[] }) {
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
          return (
            <div key={kind}>
              {study ? <StudyKindCard kind={kind} study={study} termKey={termKey} /> : <CreateStudyCard kind={kind} termId={termId} termLabel={termLabel} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
