"use client";

/** 반 개설/수정 폼의 공통 입력 필드 (수강료·정원·LC 교재 세트·상태). 수업일·개강일·종강일은 반 편성 달력에서 정한다 */
export function SectionFields({ values, mode }: { values: Record<string, string | undefined>; mode: "create" | "edit" }) {
  const v = values;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="tuition" className="label">
            현장 수강료 (원) <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="tuition" name="tuition" type="number" min={0} step={1000} inputMode="numeric" className="input" placeholder="비워도 됩니다" defaultValue={v.tuition ?? ""} />
        </div>
        <div>
          <label htmlFor="live_tuition" className="label">
            불라방 수강료 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="live_tuition" name="live_tuition" type="number" min={0} step={1000} inputMode="numeric" className="input" placeholder="비우면 미운영" defaultValue={v.live_tuition ?? ""} />
        </div>
        <div>
          <label htmlFor="capacity" className="label">
            정원 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="capacity" name="capacity" type="number" min={1} className="input" defaultValue={v.capacity ?? ""} />
        </div>
      </div>

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
          이 반이 이번 달에 쓰는 LC 교재예요. <strong className="text-ink">시간대마다 다르고 달마다 뒤바뀝니다</strong> — 9월 10:00 반이 A면 11:10 반은 B, 10월에는 서로 바뀝니다.
        </p>
      </fieldset>

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
