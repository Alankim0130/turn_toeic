"use client";

import { useActionState, useState } from "react";
import { createSection, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { COURSE_TYPE_LABEL } from "@/lib/utils";
import { NewCourseForm } from "./NewCourseForm";
import { SectionFields } from "./SectionFields";

type Course = { id: number; code: string; name: string; course_type: string; target_score: number | null };
type Instructor = { id: string; name: string; role: string };

export function CreateSectionForm({
  termId,
  termLabel,
  courses,
  instructors,
  currentUserId,
  isAdmin,
}: {
  termId: number;
  termLabel: string;
  courses: Course[];
  instructors: Instructor[] | null;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(createSection, {});
  const [showCourse, setShowCourse] = useState(false);
  const v = state.values ?? {};

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5">
        <input type="hidden" name="term_id" value={termId} />
        {state.error && <Alert kind="warning">{state.error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="course_id" className="label">강좌</label>
            <select id="course_id" name="course_id" required className="input" defaultValue={v.course_id ?? ""}>
              <option value="" disabled>
                강좌를 선택하세요
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {COURSE_TYPE_LABEL[c.course_type] ?? c.course_type}
                  {c.target_score ? ` · ${c.target_score}` : ""} ({c.code})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setShowCourse((s) => !s)} className="mt-1.5 text-xs font-bold text-brand-600 hover:underline">
              {showCourse ? "강좌 추가 닫기" : "+ 새 강좌 추가"}
            </button>
          </div>

          <fieldset>
            <legend className="label">트랙</legend>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "mwf", label: "월수금", sub: "주3일" },
                { value: "ttf", label: "화목금", sub: "주3일" },
                { value: "both", label: "주5일", sub: "묶음 2개" },
              ].map((t) => (
                <label key={t.value} className="cursor-pointer">
                  <input type="radio" name="track" value={t.value} required defaultChecked={(v.track ?? "mwf") === t.value} className="peer sr-only" />
                  <span className="block rounded-xl border border-line bg-paper px-2 py-2 text-center transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
                    <span className="block text-sm font-black text-ink">{t.label}</span>
                    <span className="block text-[11px] text-slate">{t.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <SectionFields values={v} mode="create" />

        {isAdmin && instructors && (
          <div>
            <label htmlFor="instructor_id" className="label">담당 강사</label>
            <select id="instructor_id" name="instructor_id" className="input" defaultValue={v.instructor_id ?? currentUserId}>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.role === "admin" ? "관리자" : "강사"})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-mist">
            <Icon name="warning" size={14} className="mr-1 inline" />
            개설 후 상세 페이지에서 수업일을 확정해야 수강생 시간표와 다시보기 슬롯이 생깁니다.
          </p>
          <SubmitButton pendingText="개설 중…">{termLabel} 반 개설</SubmitButton>
        </div>
      </form>

      {showCourse && (
        <div className="rounded-xl2 border border-dashed border-brand-200 bg-brand-50/40 p-4">
          <NewCourseForm onDone={() => setShowCourse(false)} />
        </div>
      )}
    </div>
  );
}
