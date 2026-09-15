import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { sortSlots, type SlotLite } from "@/lib/study";
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

/** 반 편성(월) 화면 안의 "스터디 시간 설정" 영역 */
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
            대면·단어 스터디는 이 달 시간대를 추가하면 수강생이 시간대를 골라 신청해요. 하루 2타임, 3타임 모두 자유롭게 만들 수 있습니다.
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

      {/* 시간대를 쓰는 대면·단어를 나란히, 비대면은 아래 전체 폭 */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {(["offline", "vocab", "online"] as const).map((kind) => {
          const study = byKind.get(kind);
          return (
            <div key={kind} className={kind === "online" ? "md:col-span-2" : undefined}>
              {study ? <StudyKindCard kind={kind} study={study} termKey={termKey} /> : <CreateStudyCard kind={kind} termId={termId} termLabel={termLabel} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
