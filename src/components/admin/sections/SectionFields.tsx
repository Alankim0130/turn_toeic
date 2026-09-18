"use client";

/**
 * 반 개설/수정 폼의 공통 입력 필드 (정원·LC 교재 세트·상태). 수업일·개강일·종강일은 반 편성 달력에서 정한다.
 * 수강료 칸은 없다 (2026-09-18 Alan "수강료 부분은 다 삭제" — 등록은 YBM 에서 하고 이 사이트는 학생 관리용).
 * bookSetNote 가 있으면 교재를 고를 수 없는 반(묶음 반 · 스파르타 반)이라 라디오 대신 안내만 보여 준다.
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
          <p className="label">LC 교재</p>
          <input type="hidden" name="book_set" value="" />
          <p className="rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-slate">{bookSetNote}</p>
        </div>
      ) : (
      <fieldset>
        <legend className="label">
          LC 교재 <span className="font-normal text-mist">(선택)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "", label: "미지정", sub: "달 홀짝으로 짐작" },
            { value: "A", label: "A반 교재", sub: "" },
            { value: "B", label: "B반 교재", sub: "" },
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
          이 반이 이번 달에 쓰는 LC 교재예요. <strong className="text-ink">LC 를 듣는 시간에만 고르고, 시간대·트랙마다 다르며 달마다 뒤바뀝니다</strong> — 9월 650 은 10:00 화목금이 A, 11:10 월수금이 B 이고 10월에는 서로 바뀝니다.
          RC 만 듣는 시간이면 미지정으로 두세요.
        </p>
      </fieldset>
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
