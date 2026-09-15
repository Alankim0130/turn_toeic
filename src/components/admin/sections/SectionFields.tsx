"use client";

/** 반 개설/수정 폼의 공통 입력 필드 (시간·개강/종강·회차·정원·수강료·상태) */
export function SectionFields({ values, mode }: { values: Record<string, string | undefined>; mode: "create" | "edit" }) {
  const v = values;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="start_time" className="label">시작 시간</label>
          <input id="start_time" name="start_time" type="time" required className="input" defaultValue={v.start_time ?? ""} />
        </div>
        <div>
          <label htmlFor="end_time" className="label">종료 시간</label>
          <input id="end_time" name="end_time" type="time" required className="input" defaultValue={v.end_time ?? ""} />
        </div>
        <div>
          <label htmlFor="time_block" className="label">
            시간대 라벨 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="time_block" name="time_block" className="input" placeholder="예: 오전1" defaultValue={v.time_block ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="enrollment_opens_at" className="label">개강일 — 이 날부터 수강증 업로드 활성화</label>
          <input id="enrollment_opens_at" name="enrollment_opens_at" type="date" required className="input" defaultValue={v.enrollment_opens_at ?? ""} />
        </div>
        <div>
          <label htmlFor="closes_at" className="label">종강일 — 이 날까지 다시보기 시청 가능</label>
          <input id="closes_at" name="closes_at" type="date" required className="input" defaultValue={v.closes_at ?? ""} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-mist">첫 수업일·마지막 수업일과 같을 필요는 없어요. 시스템이 유예 기간을 따로 더하지 않습니다.</p>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="target_sessions" className="label">목표 회차</label>
          <input id="target_sessions" name="target_sessions" type="number" min={1} max={60} required className="input" defaultValue={v.target_sessions ?? "10"} />
        </div>
        <div>
          <label htmlFor="capacity" className="label">
            정원 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="capacity" name="capacity" type="number" min={1} className="input" defaultValue={v.capacity ?? ""} />
        </div>
        <div>
          <label htmlFor="tuition" className="label">현장 수강료 (원)</label>
          <input id="tuition" name="tuition" type="number" min={0} step={1000} required inputMode="numeric" className="input" placeholder="OCR 매칭 기준" defaultValue={v.tuition ?? ""} />
        </div>
        <div>
          <label htmlFor="live_tuition" className="label">
            불라방 수강료 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="live_tuition" name="live_tuition" type="number" min={0} step={1000} inputMode="numeric" className="input" placeholder="비우면 미운영" defaultValue={v.live_tuition ?? ""} />
        </div>
      </div>

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
