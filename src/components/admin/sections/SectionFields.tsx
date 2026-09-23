"use client";

/**
 * 반 개설/수정 폼의 공통 입력 필드 (정원 · 과목 · 과정 · 상태). 수업일·개강일·종강일은 반 편성 달력에서 정한다.
 * 수강료 칸은 없다 (2026-09-18 Alan "수강료 부분은 다 삭제" — 등록은 YBM 에서 하고 이 사이트는 학생 관리용).
 *
 * 과목(LC/RC)과 과정(A/B)은 시간 단위 반에만 있다 (2026-09-23 Alan "RC도 A과정 B과정에 따라서 움직이잖아") —
 * 과정은 (강좌·시간대) 단위라 두 트랙이 같고 달마다 뒤바뀌며, LC 시간에는 곧 LC 교재다. 과목은 트랙마다 다르고 달이 바뀌어도 그대로다.
 * bookSetNote 가 있으면 둘 다 둘 수 없는 반(묶음 반 · 스파르타 반)이라 라디오 대신 안내만 보여 준다.
 */
export function SectionFields({ values, mode, bookSetNote }: { values: Record<string, string | undefined>; mode: "create" | "edit"; bookSetNote?: string }) {
  const v = values;
  return (
    <>
      <div className="sm:max-w-xs">
        <label htmlFor="capacity" className="label">
          정원 <span className="font-normal text-mist">(선택)</span>
        </label>
        <input id="capacity" name="capacity" type="number" min={1} className="input" defaultValue={v.capacity ?? ""} />
      </div>

      {bookSetNote ? (
        <div>
          <p className="label">과목 · 과정</p>
          <input type="hidden" name="subject" value="" />
          <input type="hidden" name="book_set" value="" />
          <p className="rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-slate">{bookSetNote}</p>
        </div>
      ) : (
        <>
          <fieldset>
            <legend className="label">과목</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "", label: "미지정", sub: "담당 강사를 정하지 않아요" },
                { value: "lc", label: "LC", sub: "" },
                { value: "rc", label: "RC", sub: "" },
              ].map((b) => (
                <label key={b.value || "none"} className="cursor-pointer">
                  <input type="radio" name="subject" value={b.value} defaultChecked={(v.subject ?? "") === b.value} className="peer sr-only" />
                  <span className="block rounded-xl border border-line bg-paper px-3 py-2 transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
                    <span className="block text-sm font-black text-ink">{b.label}</span>
                    {b.sub && <span className="block text-[11px] text-slate">{b.sub}</span>}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate">
              이 시간에 가르치는 과목이에요. <strong className="text-ink">트랙마다 다르고 달이 바뀌어도 그대로</strong>입니다 — 9월 650 10:00 은 월수금 RC · 화목금 LC.
              담당 강사·단과 표시·학생의 내 교재·저녁 반의 다시보기 짝이 이 값을 읽어요.
            </p>
          </fieldset>

          <fieldset>
            <legend className="label">
              과정 <span className="font-normal text-mist">(A/B)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "", label: "미지정", sub: "" },
                { value: "A", label: "A 과정", sub: "" },
                { value: "B", label: "B 과정", sub: "" },
              ].map((b) => (
                <label key={b.value || "none"} className="cursor-pointer">
                  <input type="radio" name="book_set" value={b.value} defaultChecked={(v.book_set ?? "") === b.value} className="peer sr-only" />
                  <span className="block rounded-xl border border-line bg-paper px-3 py-2 transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
                    <span className="block text-sm font-black text-ink">{b.label}</span>
                    {b.sub && <span className="block text-[11px] text-slate">{b.sub}</span>}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate">
              편성표의 A/B 과정이에요. <strong className="text-ink">같은 시간대의 월수금·화목금이 같은 과정이고 달마다 A·B 가 뒤바뀝니다</strong> — 9월 10:00 이 A 과정이면 10월 10:00 은 B 과정.
              LC 시간에는 이 글자가 곧 LC 교재(A반·B반)예요.
            </p>
          </fieldset>
        </>
      )}

      <fieldset>
        <legend className="label">상태</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "draft", label: "준비 중", sub: "비공개" },
            { value: "open", label: "모집 중", sub: "공개 시간표 노출" },
            ...(mode === "edit" ? [{ value: "closed", label: "종료", sub: "더 이상 배정 안 함" }] : []),
          ].map((s) => (
            <label key={s.value} className="cursor-pointer">
              <input type="radio" name="status" value={s.value} defaultChecked={(v.status ?? "draft") === s.value} className="peer sr-only" />
              <span className="block rounded-xl border border-line bg-paper px-3 py-2 transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
                <span className="block text-sm font-black text-ink">{s.label}</span>
                <span className="block text-[11px] text-slate">{s.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
